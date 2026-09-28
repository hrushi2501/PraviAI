-- Owner-run additive migration. Not applied by the application or verified hosted.
-- Provision separate LOGIN roles outside this file, granting ONLY the matching
-- NOLOGIN role: pravi_runtime or pravi_identity_sync. Never grant owner membership.
BEGIN;
ALTER TABLE asset_manager.integration_outbox ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE asset_manager.integration_outbox ADD COLUMN IF NOT EXISTS provider_revoked_at timestamptz;
ALTER TABLE asset_manager.integration_outbox ADD COLUMN IF NOT EXISTS revocation_started_at timestamptz;

CREATE OR REPLACE FUNCTION asset_manager.lookup_identity_state(p_clerk_id text,p_email text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,asset_manager,pg_temp AS $$
 SELECT jsonb_build_object(
 'deprovisioned',EXISTS(SELECT 1 FROM asset_manager.identity_tombstones WHERE clerk_id=p_clerk_id),
 'disabled',EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_clerk_id AND disabled_at IS NOT NULL),
 'verified',EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_clerk_id AND email_verified AND disabled_at IS NULL AND (p_email IS NULL OR email=lower(btrim(p_email)))))
$$;
REVOKE ALL ON FUNCTION asset_manager.lookup_identity_state(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION asset_manager.lookup_identity_state(text,text) TO pravi_identity_sync;

CREATE OR REPLACE FUNCTION asset_manager.claim_invitation_outbox() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,asset_manager,pg_temp AS $$
DECLARE candidate record; event asset_manager.integration_outbox; invite asset_manager.invitations;
BEGIN
 FOR candidate IN SELECT o.id,o.invitation_id FROM asset_manager.integration_outbox o JOIN asset_manager.invitations i ON i.id=o.invitation_id
 WHERE (o.attempts<10 OR o.revocation_started_at IS NULL) AND o.next_attempt_at<=clock_timestamp() AND (
 (o.status='pending') OR (o.provider_revoked_at IS NULL AND (i.status IN ('revoked','expired') OR (i.status IN ('pending','sent') AND i.expires_at<=clock_timestamp()))))
 ORDER BY o.next_attempt_at,o.created_at,o.id LIMIT 20 LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(candidate.id::text,0)) THEN CONTINUE; END IF;
  -- Match revoke_invitation's lock order: invitation first, then outbox.
  SELECT * INTO invite FROM asset_manager.invitations WHERE id=candidate.invitation_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO event FROM asset_manager.integration_outbox WHERE id=candidate.id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR (event.attempts>=10 AND event.revocation_started_at IS NOT NULL) OR event.next_attempt_at>clock_timestamp() THEN CONTINUE; END IF;
  IF invite.status='accepted' THEN
   UPDATE asset_manager.integration_outbox SET status='delivered',delivered_at=coalesce(delivered_at,clock_timestamp()) WHERE id=event.id;
   CONTINUE;
  END IF;
  IF invite.status IN ('revoked','expired') OR invite.expires_at<=clock_timestamp() THEN
   IF invite.status IN ('pending','sent') THEN UPDATE asset_manager.invitations SET status='expired' WHERE id=invite.id; END IF;
   IF event.provider_revoked_at IS NOT NULL THEN CONTINUE; END IF;
   UPDATE asset_manager.integration_outbox SET status='cancelled', attempts=CASE WHEN revocation_started_at IS NULL THEN 0 ELSE attempts END,revocation_started_at=coalesce(revocation_started_at,clock_timestamp()) WHERE id=event.id;
   RETURN jsonb_build_object('eventId',event.id,'invitationId',invite.id,'email',invite.email,'expiresAt',invite.expires_at,'providerId',invite.clerk_invitation_id,'cancel',true);
  END IF;
  IF event.status<>'pending' THEN CONTINUE; END IF;
  RETURN jsonb_build_object('eventId',event.id,'invitationId',invite.id,'email',invite.email,'expiresAt',invite.expires_at,'providerId',invite.clerk_invitation_id,'cancel',false);
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION asset_manager.claim_invitation_outbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION asset_manager.claim_invitation_outbox() TO pravi_identity_sync;

CREATE OR REPLACE FUNCTION asset_manager.invitation_delivered(p_id uuid,p_clerk_invitation text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,asset_manager,pg_temp AS $$
DECLARE invite asset_manager.invitations;
BEGIN
 SELECT * INTO invite FROM asset_manager.invitations WHERE id=p_id FOR UPDATE;
 IF nullif(btrim(p_clerk_invitation),'') IS NULL OR invite.id IS NULL THEN RAISE EXCEPTION 'Valid invitation and provider identifier required'; END IF;
 IF invite.status NOT IN ('pending','sent') OR invite.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Invitation closed before delivery'; END IF;
 IF invite.clerk_invitation_id IS NOT NULL AND invite.clerk_invitation_id<>p_clerk_invitation THEN RAISE EXCEPTION 'Invitation provider identifier mismatch'; END IF;
 UPDATE asset_manager.invitations SET status='sent',clerk_invitation_id=p_clerk_invitation WHERE id=p_id;
 UPDATE asset_manager.integration_outbox SET status='delivered',attempts=least(attempts+1,10),delivered_at=clock_timestamp(),last_error_code=NULL WHERE invitation_id=p_id AND status='pending';
END $$;

CREATE OR REPLACE FUNCTION asset_manager.record_outbox_failure(p_event_id uuid,p_error text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,asset_manager,pg_temp AS $$
BEGIN
 PERFORM asset_manager.require_reason(p_error);
 UPDATE asset_manager.integration_outbox SET
 status=CASE WHEN attempts+1>=10 THEN 'failed' WHEN status='cancelled' THEN 'cancelled' ELSE 'pending' END,
 attempts=least(attempts+1,10),last_error_code=left(p_error,120),
 next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,(30*power(2,attempts))::integer))
 WHERE id=p_event_id AND attempts<10 AND status IN ('pending','cancelled');
END $$;

CREATE OR REPLACE FUNCTION asset_manager.complete_invitation_revocation(p_event_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,asset_manager,pg_temp AS $$
BEGIN
 UPDATE asset_manager.integration_outbox SET status='cancelled',provider_revoked_at=clock_timestamp(),last_error_code=NULL WHERE id=p_event_id AND status='cancelled';
END $$;
REVOKE ALL ON FUNCTION asset_manager.complete_invitation_revocation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION asset_manager.complete_invitation_revocation(uuid) TO pravi_identity_sync;
REVOKE ALL ON FUNCTION asset_manager.invitation_delivered(uuid,text),asset_manager.record_outbox_failure(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION asset_manager.invitation_delivered(uuid,text),asset_manager.record_outbox_failure(uuid,text) TO pravi_identity_sync;
COMMIT;
