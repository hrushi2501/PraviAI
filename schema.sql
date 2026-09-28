-- Pravi government fixed-asset manager. Fresh-install SQL, PostgreSQL 15+.
-- Run ONCE as database owner in Supabase SQL Editor after manual review.
-- No remote execution is performed by this repository. No passwords/demo users.
-- Clerk owns credentials. This schema is for trusted server-side Drizzle access.
-- IMPORTANT: set_actor trusts verified backend Clerk identity, not client input.
-- Protected transaction context ignores custom GUCs and rejects a second assertion.
-- This is not JWT verification and cannot protect a compromised trusted backend.
-- A compromised backend DB credential can impersonate actors. Never expose it.
-- Normal runtime: BEGIN; SET LOCAL ROLE pravi_runtime;
-- SELECT asset_manager.set_actor(<verified Clerk subject>); ... COMMIT;
-- Provision separate NOINHERIT login roles/passwords outside this file; grant
-- pravi_runtime to the app login and pravi_identity_sync to the webhook login.
-- Do not use owner/service_role for normal requests or expose this schema in REST.
-- Repeat execution refuses safely; subsequent upgrades require migrations.

BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(724981, 1);
DO $install$
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'PostgreSQL 15 or later required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'asset_manager') THEN
    RAISE EXCEPTION 'asset_manager already exists; installation refused without changing existing data';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('pravi_runtime','pravi_identity_sync')) THEN
    RAISE EXCEPTION 'Reserved Pravi roles already exist; review their ownership before installing';
  END IF;
END $install$;

CREATE ROLE pravi_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE pravi_identity_sync NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT pravi_runtime, pravi_identity_sync TO CURRENT_USER;
CREATE SCHEMA asset_manager;
REVOKE ALL ON SCHEMA asset_manager FROM PUBLIC;
GRANT USAGE ON SCHEMA asset_manager TO pravi_runtime, pravi_identity_sync;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA asset_manager;
SET LOCAL search_path = asset_manager, pg_catalog;

CREATE TABLE schema_version (
  version integer PRIMARY KEY CHECK (version > 0),
  installed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_version(version) VALUES (1);

CREATE TABLE identities (
  clerk_id text PRIMARY KEY CHECK (clerk_id ~ '^user_[A-Za-z0-9_]+$'),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND position('@' in email) > 1),
  email_verified boolean NOT NULL DEFAULT false,
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','hi','gu','mr','bn','ta','te')),
  disabled_at timestamptz,
  source_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity_tombstones (
  clerk_id text PRIMARY KEY CHECK(clerk_id ~ '^user_[A-Za-z0-9_]+$'),
  source_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE authorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (length(btrim(code)) BETWEEN 1 AND 50),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE permission_catalog (
  code text PRIMARY KEY,
  scope text NOT NULL CHECK(scope IN ('authority','department'))
);
INSERT INTO permission_catalog(code,scope)
SELECT p,'authority' FROM unnest(ARRAY['authority_admin','authority_read','governance_approve']) p;
INSERT INTO permission_catalog(code,scope)
SELECT p,'department' FROM unnest(ARRAY['read','asset_write','asset_verify','asset_archive','inspection_write','inspection_approve','complaint_write','complaint_manage','work_write','work_approve','work_accept','evidence_write','milestone_write','member_manage','template_write','template_approve','lifecycle_approve']) p;
CREATE TABLE role_definitions (
  authority_id uuid NOT NULL REFERENCES authorities(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK(code ~ '^[a-z][a-z0-9_]{0,49}$'),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  scope text NOT NULL CHECK(scope IN ('authority','department')),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  max_estimate_paise bigint CHECK(max_estimate_paise IS NULL OR max_estimate_paise >= 0),
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(authority_id,code)
);
CREATE TABLE role_permissions (
  authority_id uuid NOT NULL,
  role text NOT NULL,
  permission text NOT NULL REFERENCES permission_catalog(code) ON DELETE RESTRICT,
  PRIMARY KEY(authority_id,role,permission),
  FOREIGN KEY(authority_id,role) REFERENCES role_definitions(authority_id,code) ON DELETE RESTRICT
);
CREATE TABLE authority_memberships (
  authority_id uuid NOT NULL REFERENCES authorities(id) ON DELETE RESTRICT,
  clerk_id text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  role text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  granted_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  expires_at timestamptz,
  acting_for text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (authority_id, clerk_id),
  FOREIGN KEY(authority_id,role) REFERENCES role_definitions(authority_id,code) ON DELETE RESTRICT,
  CHECK(expires_at IS NULL OR expires_at > created_at)
);
CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id uuid NOT NULL REFERENCES authorities(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 50),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  localized_names jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(localized_names) = 'object'),
  clerk_organization_id text UNIQUE,
  active boolean NOT NULL DEFAULT true,
  deactivation_reason text,
  created_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (authority_id, code), UNIQUE (authority_id, id),
  CHECK (active OR coalesce(length(btrim(deactivation_reason)),0) > 0)
);
CREATE TABLE department_memberships (
  authority_id uuid NOT NULL,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  clerk_id text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  role text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  granted_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  expires_at timestamptz,
  acting_for text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, clerk_id),
  FOREIGN KEY(authority_id,department_id) REFERENCES departments(authority_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(authority_id,role) REFERENCES role_definitions(authority_id,code) ON DELETE RESTRICT,
  CHECK(expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX department_memberships_actor_idx ON department_memberships(clerk_id, department_id) WHERE active;
CREATE INDEX authority_memberships_actor_idx ON authority_memberships(clerk_id, authority_id) WHERE active;

CREATE TABLE regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id uuid NOT NULL REFERENCES authorities(id) ON DELETE RESTRICT,
  parent_id uuid,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 60),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  localized_names jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(localized_names) = 'object'),
  level text NOT NULL CHECK (level IN ('state','district','block','city','ward','village')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(authority_id,code), UNIQUE(authority_id,id),
  FOREIGN KEY(authority_id,parent_id) REFERENCES regions(authority_id,id) ON DELETE RESTRICT,
  CHECK(parent_id IS DISTINCT FROM id)
);
CREATE INDEX regions_parent_idx ON regions(authority_id,parent_id);

CREATE TABLE asset_templates (
  code text NOT NULL CHECK (code IN ('road','bridge','building')),
  version integer NOT NULL CHECK (version > 0),
  label_key text NOT NULL,
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'array'),
  components text[] NOT NULL,
  lifecycle_stages text[] NOT NULL,
  transitions jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(transitions) = 'array'),
  inspectable_stages text[] NOT NULL DEFAULT ARRAY['commissioned'],
  default_review_days integer CHECK (default_review_days BETWEEN 1 AND 3660),
  policy_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(code,version)
);
-- Starter templates include standard lifecycle transitions so derived templates can commission and retire assets.
INSERT INTO asset_templates(code,version,label_key,fields,components,lifecycle_stages,transitions,inspectable_stages,policy_reference) VALUES
('road',1,'assetType.road',
 '[{"key":"length_km","type":"number","required":true,"min":0.001,"max":100000,"unit":"km"},{"key":"surface","type":"select","required":true,"options":["asphalt","concrete","gravel","other","unknown"]},{"key":"start_chainage","type":"text","required":true},{"key":"end_chainage","type":"text","required":true},{"key":"road_class","type":"text","required":false}]',
 ARRAY['surface','drainage','shoulders'],ARRAY['planned','construction','commissioned','retired'],
 '[{"from":"planned","to":"construction","permission":"asset_write","requires_approval":true},{"from":"construction","to":"commissioned","permission":"asset_verify","requires_approval":true},{"from":"commissioned","to":"retired","permission":"asset_verify","requires_approval":true,"retire":true}]'::jsonb,
 ARRAY['commissioned'],
 'Prototype screening template; engineering/manual review required'),
('bridge',1,'assetType.bridge',
 '[{"key":"bridge_type","type":"text","required":true},{"key":"length_m","type":"number","required":false,"min":0.01,"max":100000,"unit":"m"},{"key":"span_count","type":"integer","required":false,"min":1,"max":10000},{"key":"material","type":"text","required":false}]',
 ARRAY['deck','bearings_joints','superstructure','substructure','waterway'],ARRAY['planned','construction','commissioned','retired'],
 '[{"from":"planned","to":"construction","permission":"asset_write","requires_approval":true},{"from":"construction","to":"commissioned","permission":"asset_verify","requires_approval":true},{"from":"commissioned","to":"retired","permission":"asset_verify","requires_approval":true,"retire":true}]'::jsonb,
 ARRAY['commissioned'],
 'Prototype screening template; not an IRC structural certification'),
('building',1,'assetType.building',
 '[{"key":"use","type":"select","required":true,"options":["office","school","hospital","community","other"]},{"key":"storeys","type":"integer","required":false,"min":1,"max":200},{"key":"area_sqm","type":"number","required":false,"min":0.01,"max":100000000,"unit":"m2"},{"key":"address","type":"text","required":true}]',
 ARRAY['structure','roof_water_ingress','services','accessibility'],ARRAY['planned','construction','commissioned','retired'],
 '[{"from":"planned","to":"construction","permission":"asset_write","requires_approval":true},{"from":"construction","to":"commissioned","permission":"asset_verify","requires_approval":true},{"from":"commissioned","to":"retired","permission":"asset_verify","requires_approval":true,"retire":true}]'::jsonb,
 ARRAY['commissioned'],
 'Prototype screening template; departmental and engineer review required');

CREATE TABLE department_templates (
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK(code ~ '^[a-z][a-z0-9_]{0,49}$'),
  version integer NOT NULL CHECK(version > 0),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  base_category text NOT NULL CHECK(base_category IN ('road','bridge','building','other')),
  fields jsonb NOT NULL CHECK(jsonb_typeof(fields)='array'),
  components text[] NOT NULL CHECK(cardinality(components)>0),
  lifecycle_stages text[] NOT NULL CHECK(cardinality(lifecycle_stages)>0),
  transitions jsonb NOT NULL CHECK(jsonb_typeof(transitions)='array'),
  inspectable_stages text[] NOT NULL DEFAULT ARRAY['commissioned'],
  policy_reference text NOT NULL CHECK(length(btrim(policy_reference))>0),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','published','correction_required','withdrawn')),
  created_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  submitted_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  approved_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  approved_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  PRIMARY KEY(department_id,code,version),
  CHECK(status<>'published' OR (submitted_by IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by<>submitted_by AND approved_by<>created_by))
);
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL,
  authority_id uuid NOT NULL,
  asset_code text NOT NULL CHECK (length(btrim(asset_code)) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  template_code text NOT NULL,
  template_version integer NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes) = 'object'),
  region_id uuid,
  latitude numeric(10,7) CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(10,7) CHECK (longitude BETWEEN -180 AND 180),
  owner_reference text,
  custodian_reference text,
  source_reference text,
  commissioning_date date,
  date_precision text NOT NULL DEFAULT 'unknown' CHECK(date_precision IN ('exact','year','approximate','unknown')),
  registration_status text NOT NULL DEFAULT 'draft' CHECK(registration_status IN ('draft','submitted','verified','correction_required')),
  lifecycle_stage text NOT NULL,
  retired_at timestamptz,
  availability text NOT NULL DEFAULT 'unknown' CHECK(availability IN ('in_service','restricted','closed','unknown')),
  criticality text NOT NULL DEFAULT 'unknown' CHECK(criticality IN ('low','medium','high','unknown')),
  criticality_reason text,
  submitted_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  verified_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  verified_at timestamptz,
  archived_at timestamptz,
  change_reason text,
  created_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE(department_id,asset_code), UNIQUE(department_id,id),
  FOREIGN KEY(authority_id,department_id) REFERENCES departments(authority_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(authority_id,region_id) REFERENCES regions(authority_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(department_id,template_code,template_version) REFERENCES department_templates(department_id,code,version) ON DELETE RESTRICT,
  CHECK((latitude IS NULL) = (longitude IS NULL)),
  CHECK(latitude IS NULL OR (latitude BETWEEN 6.0 AND 38.0 AND longitude BETWEEN 68.0 AND 98.0)),
  CHECK((date_precision = 'unknown') = (commissioning_date IS NULL)),
  CHECK(criticality = 'unknown' OR coalesce(length(btrim(criticality_reason)),0) > 0),
  CHECK(registration_status <> 'verified' OR (submitted_by IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL AND verified_by<>submitted_by AND verified_by<>created_by))
);
CREATE INDEX assets_scope_region_idx ON assets(department_id,region_id,template_code) WHERE archived_at IS NULL;
CREATE INDEX assets_scope_state_idx ON assets(department_id,registration_status,lifecycle_stage);
CREATE INDEX assets_keyset_idx ON assets(department_id,created_at DESC,id) WHERE archived_at IS NULL;

CREATE TABLE inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  template_code text NOT NULL,
  template_version integer NOT NULL,
  observed_on date NOT NULL,
  observations jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(observations) = 'object'),
  condition text NOT NULL DEFAULT 'unknown' CHECK(condition IN ('good','fair','poor','critical','unknown')),
  limitations text,
  next_review_on date,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','correction_required')),
  supersedes_id uuid,
  decision_reason text,
  created_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  submitted_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  reviewed_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  UNIQUE(department_id,id), UNIQUE(department_id,asset_id,id),
  FOREIGN KEY(department_id,asset_id) REFERENCES assets(department_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(department_id,template_code,template_version) REFERENCES department_templates(department_id,code,version) ON DELETE RESTRICT,
  FOREIGN KEY(department_id,asset_id,supersedes_id) REFERENCES inspections(department_id,asset_id,id) ON DELETE RESTRICT,
  CHECK(next_review_on IS NULL OR next_review_on > observed_on),
  CHECK(supersedes_id IS DISTINCT FROM id),
  CHECK(status <> 'approved' OR (submitted_by IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by<>submitted_by AND reviewed_by<>created_by))
);
CREATE UNIQUE INDEX inspections_one_approved_replacement_idx ON inspections(supersedes_id) WHERE status = 'approved' AND supersedes_id IS NOT NULL;
CREATE INDEX inspections_latest_idx ON inspections(department_id,asset_id,observed_on DESC,created_at DESC) WHERE status = 'approved';

CREATE TABLE complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  asset_id uuid,
  external_reference text,
  channel text NOT NULL DEFAULT 'internal' CHECK(channel IN ('internal','phone','email','other')),
  reported_at timestamptz NOT NULL,
  narrative text NOT NULL CHECK(length(btrim(narrative)) BETWEEN 1 AND 10000),
  reported_severity text NOT NULL DEFAULT 'unknown' CHECK(reported_severity IN ('low','medium','high','critical','unknown')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','triaged','investigating','resolved','reopened')),
  assigned_to text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  due_on date,
  resolution text,
  resolved_at timestamptz,
  created_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  UNIQUE(department_id,id), UNIQUE(department_id,asset_id,id), UNIQUE(department_id,external_reference),
  FOREIGN KEY(department_id,asset_id) REFERENCES assets(department_id,id) ON DELETE RESTRICT,
  CHECK(status <> 'resolved' OR (coalesce(length(btrim(resolution)),0) > 0 AND resolved_at IS NOT NULL))
);
CREATE INDEX complaints_open_idx ON complaints(department_id,asset_id,status,reported_at) WHERE status <> 'resolved';

CREATE TABLE work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  inspection_id uuid,
  complaint_id uuid,
  description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 10000),
  justification text NOT NULL CHECK(length(btrim(justification)) BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','in_progress','completion_submitted','accepted','correction_required','cancelled')),
  assigned_to text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  target_on date,
  started_on date,
  completed_on date,
  actual_cost_paise bigint CHECK(actual_cost_paise >= 0),
  completion_notes text,
  completion_submitted_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  approved_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  approved_at timestamptz,
  accepted_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  accepted_at timestamptz,
  decision_reason text,
  created_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  UNIQUE(department_id,id), UNIQUE(department_id,asset_id,id),
  FOREIGN KEY(department_id,asset_id) REFERENCES assets(department_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(department_id,asset_id,inspection_id) REFERENCES inspections(department_id,asset_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(department_id,asset_id,complaint_id) REFERENCES complaints(department_id,asset_id,id) ON DELETE RESTRICT,
  CHECK(completed_on IS NULL OR started_on IS NOT NULL AND completed_on >= started_on),
  CHECK(approved_by IS NULL OR approved_by IS DISTINCT FROM created_by),
  CHECK(status <> 'accepted' OR (completion_submitted_by IS NOT NULL AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL AND accepted_by<>completion_submitted_by AND accepted_by IS DISTINCT FROM assigned_to AND accepted_by IS DISTINCT FROM approved_by))
);
CREATE INDEX works_queue_idx ON work_orders(department_id,status,target_on) WHERE status NOT IN ('accepted','cancelled');

CREATE TABLE work_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision > 0),
  amount_paise bigint NOT NULL CHECK(amount_paise >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK(currency = 'INR'),
  source_reference text NOT NULL CHECK(length(btrim(source_reference)) > 0),
  basis text NOT NULL CHECK(length(btrim(basis)) > 0),
  estimated_on date NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','reviewed','rejected')),
  reviewed_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(department_id,work_order_id,revision),
  FOREIGN KEY(department_id,work_order_id) REFERENCES work_orders(department_id,id) ON DELETE RESTRICT,
  CHECK(status <> 'reviewed' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS DISTINCT FROM created_by))
);

CREATE TABLE evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL,
  asset_id uuid,
  inspection_id uuid,
  work_order_id uuid,
  complaint_id uuid,
  provider text NOT NULL CHECK(provider IN ('cloudinary','supabase_private','document_reference')),
  object_key text NOT NULL CHECK(length(btrim(object_key)) BETWEEN 1 AND 1000),
  original_name text NOT NULL CHECK(length(btrim(original_name)) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','application/pdf','text/plain')),
  size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
  caption text,
  sha256 text CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  classification text NOT NULL DEFAULT 'internal' CHECK(classification IN ('synthetic_public','internal','restricted')),
  removed_at timestamptz,
  removal_reason text,
  created_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(department_id,id), UNIQUE(department_id,asset_id,id),
  FOREIGN KEY(department_id,asset_id) REFERENCES assets(department_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(department_id,asset_id,inspection_id) REFERENCES inspections(department_id,asset_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(department_id,asset_id,work_order_id) REFERENCES work_orders(department_id,asset_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(department_id,asset_id,complaint_id) REFERENCES complaints(department_id,asset_id,id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY(department_id,complaint_id) REFERENCES complaints(department_id,id) ON DELETE RESTRICT,
  CHECK(num_nonnulls(inspection_id,work_order_id,complaint_id) <= 1),
  CHECK(asset_id IS NOT NULL OR (complaint_id IS NOT NULL AND inspection_id IS NULL AND work_order_id IS NULL)),
  CHECK(provider <> 'cloudinary' OR classification = 'synthetic_public'),
  CHECK(left(object_key,length(department_id::text)+1)=department_id::text||'/'),
  CHECK(removed_at IS NULL OR coalesce(length(btrim(removal_reason)),0) > 0)
);
CREATE UNIQUE INDEX evidence_object_idx ON evidence(department_id,provider,object_key) WHERE removed_at IS NULL;
CREATE INDEX evidence_asset_idx ON evidence(department_id,asset_id);

CREATE TABLE asset_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('planning','construction','commissioning','inspection','restoration','restriction','retirement','correction','other')),
  occurred_on date NOT NULL,
  description text NOT NULL CHECK(length(btrim(description)) > 0),
  source_reference text NOT NULL CHECK(length(btrim(source_reference)) > 0),
  evidence_id uuid,
  created_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(department_id,asset_id) REFERENCES assets(department_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(department_id,asset_id,evidence_id) REFERENCES evidence(department_id,asset_id,id) ON DELETE RESTRICT
);
CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  email text NOT NULL CHECK(email = lower(btrim(email)) AND position('@' in email) > 1),
  role text NOT NULL,
  clerk_invitation_id text UNIQUE,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','accepted','revoked','expired')),
  invited_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  accepted_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(department_id,id),
  CHECK(expires_at > created_at),
  CHECK(status <> 'accepted' OR (accepted_by IS NOT NULL AND accepted_at IS NOT NULL))
);
CREATE UNIQUE INDEX invitations_pending_idx ON invitations(department_id,email) WHERE status IN ('pending','sent');

CREATE TABLE access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  clerk_id text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  decision_reason text,
  decided_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(status = 'pending' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL AND coalesce(length(btrim(decision_reason)),0) > 0))
);
CREATE UNIQUE INDEX access_request_pending_idx ON access_requests(department_id,clerk_id) WHERE status = 'pending';

CREATE TABLE integration_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  invitation_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type = 'clerk_invitation'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','cancelled','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE(invitation_id),
  FOREIGN KEY(department_id,invitation_id) REFERENCES invitations(department_id,id) ON DELETE RESTRICT
);
CREATE TABLE command_receipts (
  actor_id text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  operation text NOT NULL,
  payload jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  authority_id uuid REFERENCES authorities(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES departments(id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES assets(id) ON DELETE RESTRICT,
  actor_id text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
  before_data jsonb,
  after_data jsonb,
  reason text,
  previous_hash text,
  event_hash text,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  transaction_id bigint NOT NULL DEFAULT txid_current()
);
CREATE INDEX audit_scope_idx ON audit_events(department_id,asset_id,occurred_at DESC);
CREATE INDEX audit_authority_idx ON audit_events(authority_id,occurred_at DESC);
CREATE TABLE approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('lifecycle','availability','archive','unarchive')),
  from_value text,
  to_value text,
  asset_version integer NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason))>0),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  requested_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  decided_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  decided_role text,
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(department_id,asset_id) REFERENCES assets(department_id,id) ON DELETE RESTRICT,
  CHECK(status NOT IN ('approved','rejected') OR (decided_by IS NOT NULL AND decided_by<>requested_by AND decided_at IS NOT NULL AND coalesce(length(btrim(decision_reason)),0)>0))
);
CREATE INDEX approvals_queue_idx ON approval_requests(department_id,created_at) WHERE status='pending';
CREATE UNIQUE INDEX approval_pending_asset_idx ON approval_requests(asset_id,action) WHERE status='pending';
CREATE TABLE governance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id uuid NOT NULL REFERENCES authorities(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN ('department_create','region_create','role_create','role_edit','role_retire','authority_member','department_member')),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  reason text NOT NULL CHECK(length(btrim(reason))>0),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  requested_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  decided_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  decided_role text,
  decision_reason text,
  decided_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(status NOT IN ('approved','rejected') OR (decided_by IS NOT NULL AND decided_by<>requested_by AND decided_at IS NOT NULL AND coalesce(length(btrim(decision_reason)),0)>0))
);
ALTER TABLE governance_requests ADD COLUMN expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days' CHECK(expires_at>created_at);
CREATE INDEX governance_pending_idx ON governance_requests(authority_id,created_at) WHERE status='pending';

-- Helpers are owner-defined with a fixed search path. Table owner bypass is
-- intentional for these helpers; runtime never owns tables and cannot mutate.
-- Protected transaction context: a custom GUC is never an identity authority.
CREATE UNLOGGED TABLE actor_contexts (
 backend_pid integer PRIMARY KEY,
 transaction_id bigint NOT NULL,
 clerk_id text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
 asserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE authority_recovery_flags (
 authority_id uuid NOT NULL REFERENCES authorities(id) ON DELETE RESTRICT,
 clerk_id text NOT NULL,
 reason text NOT NULL,
 detected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 resolved_at timestamptz,
 PRIMARY KEY(authority_id,clerk_id)
);
CREATE FUNCTION actor() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
 SELECT clerk_id FROM asset_manager.actor_contexts WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()
$$;
-- Internal only: bootstrap and verified identity worker may attribute system work.
CREATE FUNCTION internal_assert_actor(p_clerk_id text) RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
 INSERT INTO asset_manager.actor_contexts(backend_pid,transaction_id,clerk_id)
 VALUES(pg_backend_pid(),txid_current(),p_clerk_id)
 ON CONFLICT(backend_pid) DO UPDATE SET transaction_id=EXCLUDED.transaction_id,clerk_id=EXCLUDED.clerk_id,asserted_at=clock_timestamp()
$$;
CREATE FUNCTION actor_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp
AS $$ SELECT EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id = asset_manager.actor() AND disabled_at IS NULL AND email_verified) $$;
CREATE FUNCTION require_actor() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
  IF NOT asset_manager.actor_active() THEN RAISE EXCEPTION 'Unauthorised actor' USING ERRCODE='42501'; END IF;
  RETURN asset_manager.actor();
END $$;
CREATE FUNCTION set_actor(p_clerk_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
  IF p_clerk_id IS NULL OR NOT EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_clerk_id AND disabled_at IS NULL AND email_verified) THEN
    RAISE EXCEPTION 'Identity is unverified, disabled or not provisioned' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM asset_manager.actor_contexts WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()) THEN RAISE EXCEPTION 'Actor already asserted for this transaction' USING ERRCODE='42501'; END IF;
  PERFORM asset_manager.internal_assert_actor(p_clerk_id);
END $$;
CREATE FUNCTION authority_admin(p_authority uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
SELECT asset_manager.actor_active() AND EXISTS(
 SELECT 1 FROM asset_manager.authority_memberships m JOIN asset_manager.authorities a ON a.id=m.authority_id
 WHERE EXISTS(SELECT 1 FROM asset_manager.role_definitions rd WHERE rd.authority_id=m.authority_id AND rd.code=m.role AND rd.active AND rd.scope='authority') AND m.authority_id=p_authority AND m.clerk_id=asset_manager.actor() AND EXISTS(SELECT 1 FROM asset_manager.role_permissions rp WHERE rp.authority_id=m.authority_id AND rp.role=m.role AND rp.permission='authority_admin') AND m.active AND a.active)
$$;
CREATE FUNCTION authority_read(p_authority uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
SELECT asset_manager.actor_active() AND EXISTS(
 SELECT 1 FROM asset_manager.authority_memberships m JOIN asset_manager.authorities a ON a.id=m.authority_id
 WHERE EXISTS(SELECT 1 FROM asset_manager.role_definitions rd WHERE rd.authority_id=m.authority_id AND rd.code=m.role AND rd.active AND rd.scope='authority') AND m.authority_id=p_authority AND m.clerk_id=asset_manager.actor() AND EXISTS(SELECT 1 FROM asset_manager.role_permissions rp WHERE rp.authority_id=m.authority_id AND rp.role=m.role AND rp.permission='authority_read') AND m.active AND a.active)
$$;
CREATE FUNCTION department_permission(p_department uuid,p_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
SELECT asset_manager.actor_active() AND EXISTS(
 SELECT 1 FROM asset_manager.departments d JOIN asset_manager.authorities a ON a.id=d.authority_id
 JOIN asset_manager.department_memberships m ON m.department_id=d.id
 JOIN asset_manager.role_permissions rp ON rp.authority_id=d.authority_id AND rp.role=m.role
 JOIN asset_manager.role_definitions rd ON rd.authority_id=rp.authority_id AND rd.code=rp.role AND rd.active
 WHERE d.id=p_department AND d.active AND a.active AND m.clerk_id=asset_manager.actor() AND m.active AND rp.permission=p_permission)
$$;
CREATE FUNCTION department_read(p_department uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
SELECT asset_manager.actor_active() AND EXISTS(
 SELECT 1 FROM asset_manager.departments d JOIN asset_manager.authorities a ON a.id=d.authority_id
 WHERE d.id=p_department AND a.active AND (asset_manager.authority_read(d.authority_id)
 OR asset_manager.department_permission(d.id,'read')))
$$;
CREATE FUNCTION require_permission(p_department uuid,p_permission text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
  PERFORM asset_manager.require_actor();
  IF NOT asset_manager.department_permission(p_department,p_permission) THEN RAISE EXCEPTION 'Operation not permitted' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION require_reason(p_reason text) RETURNS void LANGUAGE plpgsql
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 IF p_reason IS NULL OR length(btrim(p_reason))=0 THEN RAISE EXCEPTION 'A reason is required' USING ERRCODE='22023'; END IF;
 PERFORM set_config('pravi.reason',p_reason,true);
END $$;
CREATE FUNCTION validate_keys(p_payload jsonb,p_allowed text[]) RETURNS void LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Expected JSON object' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT k=ANY(p_allowed)) THEN RAISE EXCEPTION 'Unsupported or protected field' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION validate_attributes(p_department uuid,p_code text,p_version integer,p_data jsonb,p_complete boolean,p_stage text DEFAULT NULL) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE definition jsonb; f jsonb; v jsonb; k text; n numeric;
BEGIN
 SELECT fields INTO definition FROM asset_manager.department_templates WHERE department_id=p_department AND code=p_code AND version=p_version AND status='published';
 IF definition IS NULL OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Invalid template or attributes'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(definition) d WHERE d->>'key'=x)) THEN RAISE EXCEPTION 'Unknown category attribute'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(definition) LOOP
  k:=f->>'key'; v:=p_data->k;
  IF v IS NULL OR v='null'::jsonb OR v='""'::jsonb THEN
   IF p_complete AND (coalesce((f->>'required')::boolean,false) OR coalesce(f->'required_at','[]'::jsonb) ? p_stage) THEN RAISE EXCEPTION 'Required attribute missing: %',k; END IF;
   CONTINUE;
  END IF;
  IF f->>'type' IN ('text','select') THEN
   IF jsonb_typeof(v)<>'string' OR length(btrim(p_data->>k)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid text attribute: %',k; END IF;
   IF f->>'type'='select' AND NOT (f->'options') ? (p_data->>k) THEN RAISE EXCEPTION 'Invalid option: %',k; END IF;
  ELSIF f->>'type'='boolean' THEN
   IF jsonb_typeof(v)<>'boolean' THEN RAISE EXCEPTION 'Expected boolean attribute: %',k; END IF;
  ELSIF f->>'type'='date' THEN
   IF jsonb_typeof(v)<>'string' OR p_data->>k !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Expected ISO date attribute: %',k; END IF;
   PERFORM (p_data->>k)::date;
  ELSE
   IF jsonb_typeof(v)<>'number' THEN RAISE EXCEPTION 'Expected numeric attribute: %',k; END IF;
   n:=(p_data->>k)::numeric;
   IF f->>'type'='integer' AND n<>trunc(n) THEN RAISE EXCEPTION 'Expected integer: %',k; END IF;
   IF f ? 'min' AND n<(f->>'min')::numeric OR f ? 'max' AND n>(f->>'max')::numeric THEN RAISE EXCEPTION 'Attribute out of range: %',k; END IF;
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION revision_and_dates() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN NEW.version:=OLD.version+1; NEW.updated_at:=clock_timestamp(); END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE
 oldj jsonb; newj jsonb; j jsonb; dep uuid; authid uuid; aid uuid; keys jsonb := '{}'; keycol text;
 prev_hash text; new_hash text;
BEGIN
 IF TG_OP<>'INSERT' THEN oldj:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN newj:=to_jsonb(NEW); END IF;
 j:=coalesce(newj,oldj); dep:=nullif(j->>'department_id','')::uuid; authid:=nullif(j->>'authority_id','')::uuid;
 IF TG_TABLE_NAME='departments' THEN dep:=(j->>'id')::uuid; END IF;
 IF TG_TABLE_NAME='authorities' THEN authid:=(j->>'id')::uuid; END IF;
 IF dep IS NOT NULL AND authid IS NULL THEN SELECT authority_id INTO authid FROM asset_manager.departments WHERE id=dep; END IF;
 IF TG_TABLE_NAME='assets' THEN aid:=(j->>'id')::uuid; ELSE aid:=nullif(j->>'asset_id','')::uuid; END IF;
 IF TG_NARGS=0 THEN RAISE EXCEPTION 'Audit trigger requires explicit key columns'; END IF;
 FOREACH keycol IN ARRAY TG_ARGV LOOP
  IF j->keycol IS NULL THEN RAISE EXCEPTION 'Audit key column absent: %',keycol; END IF;
  keys:=keys||jsonb_build_object(keycol,j->keycol);
 END LOOP;
 -- Redact contact details, free narratives and private object locators from history.
 oldj:=oldj-ARRAY['email','display_name','narrative','caption','object_key','original_name','observations','completion_notes','description','justification','resolution','payload'];
 newj:=newj-ARRAY['email','display_name','narrative','caption','object_key','original_name','observations','completion_notes','description','justification','resolution','payload'];
 SELECT event_hash INTO prev_hash FROM asset_manager.audit_events
  WHERE (authid IS NULL OR authority_id = authid) AND (dep IS NULL OR department_id = dep)
  ORDER BY id DESC LIMIT 1;
 new_hash := encode(sha256(convert_to(coalesce(prev_hash, 'genesis') || ':' || TG_TABLE_NAME || ':' || TG_OP || ':' || keys::text || ':' || clock_timestamp()::text || ':' || coalesce(asset_manager.actor(), 'system'), 'UTF8')), 'hex');
 INSERT INTO asset_manager.audit_events(authority_id,department_id,asset_id,actor_id,entity_type,entity_id,operation,before_data,after_data,reason,previous_hash,event_hash)
 VALUES(authid,dep,aid,asset_manager.actor(),TG_TABLE_NAME,keys::text,TG_OP,oldj,newj,nullif(current_setting('pravi.reason',true),''),prev_hash,new_hash);
 RETURN coalesce(NEW,OLD);
END $$;
DO $triggers$
DECLARE t text; args text;
BEGIN
 FOREACH t IN ARRAY ARRAY['departments','assets','inspections','complaints','work_orders'] LOOP
  EXECUTE format('CREATE TRIGGER revision BEFORE UPDATE ON asset_manager.%I FOR EACH ROW EXECUTE FUNCTION asset_manager.revision_and_dates()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['identities','authorities','role_definitions','role_permissions','governance_requests','department_templates','approval_requests','departments','authority_memberships','department_memberships','regions','assets','inspections','complaints','work_orders','work_estimates','evidence','asset_milestones','invitations','access_requests'] LOOP
  args:=CASE t WHEN 'identities' THEN '''' || 'clerk_id' || ''''
   WHEN 'role_definitions' THEN '''authority_id'',''code'''
   WHEN 'role_permissions' THEN '''authority_id'',''role'',''permission'''
   WHEN 'department_templates' THEN '''department_id'',''code'',''version'''
   WHEN 'authority_memberships' THEN '''authority_id'',''clerk_id'''
   WHEN 'department_memberships' THEN '''department_id'',''clerk_id'''
   ELSE '''id''' END;
  EXECUTE format('CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON asset_manager.%I FOR EACH ROW EXECUTE FUNCTION asset_manager.capture_audit(%s)',t,args);
 END LOOP;
END $triggers$;

-- Atomic request receipts: only create functions call these internal helpers.
CREATE FUNCTION begin_request(p_request uuid,p_operation text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE receipt asset_manager.command_receipts;
BEGIN
 IF p_request IS NULL THEN RAISE EXCEPTION 'Request UUID required'; END IF;
 IF coalesce(current_setting('pravi.reason', true), '') = '' THEN
  PERFORM set_config('pravi.reason','',true);
 END IF;
 INSERT INTO asset_manager.command_receipts(actor_id,request_id,operation,payload)
 VALUES(asset_manager.require_actor(),p_request,p_operation,jsonb_build_object('sha256',encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'))) ON CONFLICT DO NOTHING;
 SELECT * INTO receipt FROM asset_manager.command_receipts WHERE actor_id=asset_manager.actor() AND request_id=p_request FOR UPDATE;
 IF receipt.operation<>p_operation OR receipt.payload IS DISTINCT FROM jsonb_build_object('sha256',encode(sha256(convert_to(p_payload::text,'UTF8')),'hex')) THEN RAISE EXCEPTION 'Idempotency key reused for different request' USING ERRCODE='22023'; END IF;
 RETURN receipt.result;
END $$;
CREATE FUNCTION finish_request(p_request uuid,p_result jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
 UPDATE asset_manager.command_receipts SET result=jsonb_strip_nulls(jsonb_build_object('id',p_result->'id','version',p_result->'version')) WHERE actor_id=asset_manager.actor() AND request_id=p_request
$$;
CREATE FUNCTION protect_governance_access(p_authority uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE needed text;
BEGIN
 PERFORM 1 FROM asset_manager.authorities WHERE id=p_authority FOR UPDATE;
 FOREACH needed IN ARRAY ARRAY['authority_admin','governance_approve'] LOOP
  IF NOT EXISTS(SELECT 1 FROM asset_manager.authority_memberships m
   JOIN asset_manager.identities i ON i.clerk_id=m.clerk_id AND i.disabled_at IS NULL AND i.email_verified
   JOIN asset_manager.role_definitions r ON r.authority_id=m.authority_id AND r.code=m.role AND r.active
   JOIN asset_manager.role_permissions rp ON rp.authority_id=r.authority_id AND rp.role=r.code
   WHERE m.authority_id=p_authority AND m.active AND rp.permission=needed) THEN
    RAISE EXCEPTION 'Cannot remove final effective governance permission: %',needed;
  END IF;
 END LOOP;
 IF NOT EXISTS(
  SELECT 1 FROM asset_manager.authority_memberships requester
  JOIN asset_manager.identities ri ON ri.clerk_id=requester.clerk_id AND ri.email_verified AND ri.disabled_at IS NULL
  JOIN asset_manager.role_definitions rr ON rr.authority_id=requester.authority_id AND rr.code=requester.role AND rr.active
  JOIN asset_manager.role_permissions rp ON rp.authority_id=rr.authority_id AND rp.role=rr.code AND rp.permission='authority_admin'
  JOIN asset_manager.authority_memberships approver ON approver.authority_id=requester.authority_id AND approver.clerk_id<>requester.clerk_id AND approver.active
  JOIN asset_manager.identities ai ON ai.clerk_id=approver.clerk_id AND ai.email_verified AND ai.disabled_at IS NULL
  JOIN asset_manager.role_definitions ar ON ar.authority_id=approver.authority_id AND ar.code=approver.role AND ar.active
  JOIN asset_manager.role_permissions ap ON ap.authority_id=ar.authority_id AND ap.role=ar.code AND ap.permission='governance_approve'
  WHERE requester.authority_id=p_authority AND requester.active
 ) THEN RAISE EXCEPTION 'Preserve distinct effective governance requester and approver'; END IF;
END $$;
CREATE FUNCTION governance_permission(p_authority uuid,p_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
 SELECT asset_manager.actor_active() AND EXISTS(SELECT 1 FROM asset_manager.authority_memberships m
 JOIN asset_manager.authorities a ON a.id=m.authority_id AND a.active
 JOIN asset_manager.role_definitions r ON r.authority_id=m.authority_id AND r.code=m.role AND r.active AND r.scope='authority'
 JOIN asset_manager.role_permissions rp ON rp.authority_id=r.authority_id AND rp.role=r.code
 WHERE m.authority_id=p_authority AND m.clerk_id=asset_manager.actor() AND m.active AND rp.permission=p_permission)
$$;

-- System identity API: grant ONLY to the verified-webhook/identity-sync role.
CREATE FUNCTION sync_identity(p_clerk_id text,p_email text,p_name text,p_verified boolean,p_source_updated timestamptz,p_locale text DEFAULT 'en')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 IF p_source_updated IS NULL OR p_source_updated>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'Invalid identity event time'; END IF;
 IF EXISTS(SELECT 1 FROM asset_manager.identity_tombstones WHERE clerk_id=p_clerk_id) THEN RETURN; END IF;
 IF NOT p_verified AND EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_clerk_id AND source_updated_at>=p_source_updated) THEN RETURN; END IF;
 INSERT INTO asset_manager.identities(clerk_id,email,display_name,email_verified,source_updated_at,locale)
 VALUES(p_clerk_id,lower(btrim(p_email)),p_name,p_verified,p_source_updated,p_locale)
 ON CONFLICT(clerk_id) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,
 email_verified=EXCLUDED.email_verified,source_updated_at=EXCLUDED.source_updated_at,updated_at=clock_timestamp()
 WHERE EXCLUDED.source_updated_at>asset_manager.identities.source_updated_at;
 -- Ordinary sync never resurrects a disabled user; recovery is owner-reviewed.
 IF NOT p_verified AND EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_clerk_id AND NOT email_verified AND source_updated_at=p_source_updated) THEN PERFORM asset_manager.flag_identity_recovery(p_clerk_id,'Identity verification revoked');
 ELSIF p_verified AND EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_clerk_id AND email_verified AND disabled_at IS NULL AND source_updated_at=p_source_updated) THEN UPDATE asset_manager.authority_recovery_flags SET resolved_at=clock_timestamp() WHERE clerk_id=p_clerk_id AND resolved_at IS NULL; END IF;
END $$;
CREATE FUNCTION flag_identity_recovery(p_clerk_id text,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 INSERT INTO asset_manager.authority_recovery_flags(authority_id,clerk_id,reason)
 SELECT DISTINCT authority_id,p_clerk_id,p_reason FROM asset_manager.authority_memberships WHERE clerk_id=p_clerk_id AND active
 ON CONFLICT(authority_id,clerk_id) DO UPDATE SET reason=EXCLUDED.reason,detected_at=clock_timestamp(),resolved_at=NULL;
END $$;
CREATE FUNCTION disable_identity(p_clerk_id text,p_source_updated timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 IF p_source_updated IS NULL OR p_source_updated>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'Invalid identity event time'; END IF;
 IF EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_clerk_id AND source_updated_at>p_source_updated) THEN RETURN; END IF;
 INSERT INTO asset_manager.identity_tombstones(clerk_id,source_updated_at) VALUES(p_clerk_id,p_source_updated)
 ON CONFLICT(clerk_id) DO UPDATE SET source_updated_at=greatest(asset_manager.identity_tombstones.source_updated_at,EXCLUDED.source_updated_at);
 UPDATE asset_manager.identities SET disabled_at=coalesce(disabled_at,clock_timestamp()),email_verified=false,source_updated_at=p_source_updated,updated_at=clock_timestamp()
 WHERE clerk_id=p_clerk_id AND p_source_updated>=source_updated_at;
 PERFORM asset_manager.flag_identity_recovery(p_clerk_id,'Identity disabled by verified identity provider event');
END $$;
-- Owner-only recovery: verify the provider account independently before calling.
CREATE FUNCTION restore_identity(p_clerk_id text,p_source_updated timestamptz,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 PERFORM asset_manager.require_reason(p_reason);
 IF NOT EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_clerk_id AND disabled_at IS NOT NULL AND source_updated_at<p_source_updated)
 OR p_source_updated>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'Newer verified recovery event required'; END IF;
 DELETE FROM asset_manager.identity_tombstones WHERE clerk_id=p_clerk_id AND source_updated_at<p_source_updated;
 IF EXISTS(SELECT 1 FROM asset_manager.identity_tombstones WHERE clerk_id=p_clerk_id) THEN RAISE EXCEPTION 'Recovery event precedes deletion'; END IF;
 UPDATE asset_manager.identities SET disabled_at=NULL,email_verified=true,source_updated_at=p_source_updated,updated_at=clock_timestamp() WHERE clerk_id=p_clerk_id;
 UPDATE asset_manager.authority_recovery_flags SET resolved_at=clock_timestamp() WHERE clerk_id=p_clerk_id AND resolved_at IS NULL;
END $$;
-- Owner-only bootstrap. Real verified Clerk identity must already be synced.
CREATE FUNCTION bootstrap_authority(p_code text,p_name text,p_clerk_id text,p_second_admin text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE result uuid;
BEGIN
 IF p_second_admin IS NULL OR p_second_admin=p_clerk_id OR (SELECT count(*) FROM asset_manager.identities WHERE clerk_id IN (p_clerk_id,p_second_admin) AND disabled_at IS NULL AND email_verified)<>2 THEN RAISE EXCEPTION 'Two distinct verified initial administrators required'; END IF;
 PERFORM asset_manager.internal_assert_actor(p_clerk_id);
 INSERT INTO asset_manager.authorities(code,name) VALUES(p_code,p_name) RETURNING id INTO result;
 INSERT INTO asset_manager.role_definitions(authority_id,code,name,scope) VALUES
 (result,'authority_admin','Authority Administrator','authority'),(result,'central_planner','Central Planner','authority'),
 (result,'department_manager','Department Manager','department'),(result,'senior_approver','Senior Approver','department'),
 (result,'officer','Officer','department'),(result,'viewer','Viewer','department');
 INSERT INTO asset_manager.role_permissions(authority_id,role,permission)
 SELECT result,'authority_admin',p FROM unnest(ARRAY['authority_admin','authority_read','governance_approve']) p;
 INSERT INTO asset_manager.role_permissions VALUES(result,'central_planner','authority_read');
 INSERT INTO asset_manager.role_permissions SELECT result,r,'read' FROM unnest(ARRAY['department_manager','senior_approver','officer','viewer']) r;
 INSERT INTO asset_manager.role_permissions SELECT result,r,p FROM unnest(ARRAY['department_manager','senior_approver','officer']) r
 CROSS JOIN unnest(ARRAY['asset_write','inspection_write','complaint_write','work_write','evidence_write','milestone_write']) p;
  INSERT INTO asset_manager.role_permissions SELECT result,'department_manager',p FROM unnest(ARRAY['asset_verify','member_manage','template_write','asset_archive']) p;
  INSERT INTO asset_manager.role_permissions SELECT result,'senior_approver',p FROM unnest(ARRAY['asset_verify','inspection_approve','work_approve','work_accept','lifecycle_approve','template_approve','asset_archive']) p;
  INSERT INTO asset_manager.authority_memberships(authority_id,clerk_id,role,granted_by) VALUES(result,p_clerk_id,'authority_admin',p_clerk_id),(result,p_second_admin,'authority_admin',p_clerk_id);
  INSERT INTO asset_manager.role_permissions SELECT result,r,'complaint_manage' FROM unnest(ARRAY['department_manager','senior_approver']) r;
  RETURN result;
END $$;
CREATE FUNCTION set_authority_member(p_authority uuid,p_clerk_id text,p_role text,p_active boolean,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
  PERFORM asset_manager.require_reason(p_reason);
  PERFORM 1 FROM asset_manager.authorities WHERE id=p_authority FOR UPDATE;
  IF NOT asset_manager.authority_admin(p_authority) AND NOT asset_manager.governance_permission(p_authority,'governance_approve') THEN RAISE EXCEPTION 'Authority governance required' USING ERRCODE='42501'; END IF;
  IF p_active IS NULL OR NOT EXISTS(SELECT 1 FROM asset_manager.role_definitions WHERE authority_id=p_authority AND code=p_role AND scope='authority' AND active) THEN RAISE EXCEPTION 'Active authority role required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_clerk_id AND (NOT p_active OR (disabled_at IS NULL AND email_verified))) THEN RAISE EXCEPTION 'Verified active recipient required'; END IF;
  INSERT INTO asset_manager.authority_memberships(authority_id,clerk_id,role,active,granted_by) VALUES(p_authority,p_clerk_id,p_role,p_active,asset_manager.actor())
  ON CONFLICT(authority_id,clerk_id) DO UPDATE SET role=EXCLUDED.role,active=EXCLUDED.active,granted_by=EXCLUDED.granted_by,updated_at=clock_timestamp();
  PERFORM asset_manager.protect_governance_access(p_authority);
END $$;
CREATE FUNCTION create_department(p_authority uuid,p_code text,p_name text,p_manager text,p_manager_role text,p_request uuid) RETURNS asset_manager.departments LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.departments; replay jsonb;
BEGIN
  IF NOT asset_manager.authority_admin(p_authority) AND NOT asset_manager.governance_permission(p_authority,'governance_approve') THEN RAISE EXCEPTION 'Authority governance required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM asset_manager.role_definitions WHERE authority_id=p_authority AND code=p_manager_role AND active AND scope='department') THEN RAISE EXCEPTION 'Active department-scoped manager role required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_manager AND disabled_at IS NULL AND email_verified) THEN RAISE EXCEPTION 'Verified initial manager required'; END IF;
  replay:=asset_manager.begin_request(p_request,'create_department',jsonb_build_object('authority',p_authority,'code',p_code,'name',p_name,'manager',p_manager,'manager_role',p_manager_role));
  IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.departments WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
  INSERT INTO asset_manager.departments(authority_id,code,name,created_by) VALUES(p_authority,p_code,p_name,asset_manager.actor()) RETURNING * INTO row;
  INSERT INTO asset_manager.department_memberships(authority_id,department_id,clerk_id,role,granted_by) VALUES(p_authority,row.id,p_manager,p_manager_role,asset_manager.actor());
  PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION set_department_member(p_department uuid,p_clerk_id text,p_role text,p_active boolean,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE a uuid; existing_role text;
BEGIN
  PERFORM asset_manager.require_reason(p_reason);
  IF p_clerk_id = asset_manager.actor() THEN
    RAISE EXCEPTION 'Self-assignment of department membership is forbidden' USING ERRCODE='42501';
  END IF;
  SELECT authority_id INTO a FROM asset_manager.departments WHERE id=p_department AND active;
  PERFORM 1 FROM asset_manager.authorities WHERE id=a FOR UPDATE;
  PERFORM 1 FROM asset_manager.departments WHERE id=p_department AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active department required'; END IF;
  IF a IS NULL OR (NOT asset_manager.authority_admin(a) AND NOT asset_manager.department_permission(p_department,'member_manage')) THEN RAISE EXCEPTION 'Membership administration denied' USING ERRCODE='42501'; END IF;
  IF p_active IS NULL OR NOT EXISTS(SELECT 1 FROM asset_manager.role_definitions WHERE authority_id=a AND code=p_role AND scope='department' AND active) THEN RAISE EXCEPTION 'Active departmental role required'; END IF;
  SELECT role INTO existing_role FROM asset_manager.department_memberships WHERE department_id=p_department AND clerk_id=p_clerk_id;
  IF EXISTS(SELECT 1 FROM asset_manager.role_permissions WHERE authority_id=a AND role IN (p_role,existing_role)
  AND permission IN ('member_manage','complaint_manage','template_write','template_approve','inspection_approve','work_approve','work_accept','lifecycle_approve','asset_verify','asset_archive')) THEN
    IF coalesce(current_setting('pravi.governance_exec', true), '') <> 'true' THEN
      RAISE EXCEPTION 'Privileged department role grants must be routed through governance' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_clerk_id AND (NOT p_active OR (disabled_at IS NULL AND email_verified))) THEN RAISE EXCEPTION 'Verified active recipient required'; END IF;
  INSERT INTO asset_manager.department_memberships(authority_id,department_id,clerk_id,role,active,granted_by) VALUES(a,p_department,p_clerk_id,p_role,p_active,asset_manager.actor())
  ON CONFLICT(department_id,clerk_id) DO UPDATE SET role=EXCLUDED.role,active=EXCLUDED.active,granted_by=EXCLUDED.granted_by,updated_at=clock_timestamp();
END $$;
CREATE FUNCTION edit_department(p_id uuid,p_expected integer,p_name text,p_active boolean,p_reason text) RETURNS asset_manager.departments LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.departments;
BEGIN
 SELECT * INTO row FROM asset_manager.departments WHERE id=p_id FOR UPDATE;
 IF NOT asset_manager.authority_admin(row.authority_id) THEN RAISE EXCEPTION 'Department not accessible' USING ERRCODE='42501'; END IF;
 IF row.id IS NULL THEN RAISE EXCEPTION 'Record not found or inaccessible' USING ERRCODE='P0002'; END IF;
 IF row.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 UPDATE asset_manager.departments SET name=p_name,active=p_active,deactivation_reason=CASE WHEN p_active THEN NULL ELSE p_reason END WHERE id=p_id RETURNING * INTO row;
 RETURN row;
END $$;
-- Departments with records are retained; intentionally no hard-delete RPC.
CREATE FUNCTION create_region(p_authority uuid,p_parent uuid,p_code text,p_name text,p_level text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE result uuid;
BEGIN
 IF NOT asset_manager.authority_admin(p_authority) AND NOT asset_manager.governance_permission(p_authority,'governance_approve') THEN RAISE EXCEPTION 'Authority administration required' USING ERRCODE='42501'; END IF;
 INSERT INTO asset_manager.regions(authority_id,parent_id,code,name,level) VALUES(p_authority,p_parent,p_code,p_name,p_level) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION edit_region(p_id uuid,p_name text,p_active boolean,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE a uuid;
BEGIN
 SELECT authority_id INTO a FROM asset_manager.regions WHERE id=p_id FOR UPDATE;
 IF NOT asset_manager.authority_admin(a) THEN RAISE EXCEPTION 'Authority administration required' USING ERRCODE='42501'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 UPDATE asset_manager.regions SET name=p_name,active=p_active,updated_at=clock_timestamp() WHERE id=p_id;
 -- Parent/authority cannot be edited: immutable hierarchy avoids cycles.
END $$;
CREATE FUNCTION set_locale(p_locale text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 UPDATE asset_manager.identities SET locale=p_locale,updated_at=clock_timestamp() WHERE clerk_id=asset_manager.require_actor();
END $$;

CREATE FUNCTION create_asset(p_department uuid,p_data jsonb,p_request uuid) RETURNS asset_manager.assets LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.assets; replay jsonb; a uuid; v_version integer;
BEGIN
 PERFORM asset_manager.require_permission(p_department,'asset_write');
 PERFORM asset_manager.validate_keys(p_data,ARRAY['asset_code','name','template_code','template_version','attributes','region_id','latitude','longitude','owner_reference','custodian_reference','source_reference','commissioning_date','date_precision','lifecycle_stage','availability','criticality','criticality_reason']);
 replay:=asset_manager.begin_request(p_request,'create_asset',jsonb_build_object('department',p_department,'data',p_data));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.assets WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
 SELECT authority_id INTO a FROM asset_manager.departments WHERE id=p_department;
 SELECT coalesce((p_data->>'template_version')::integer, max(version)) INTO v_version
 FROM asset_manager.department_templates WHERE department_id=p_department AND code=p_data->>'template_code' AND status='published';
 IF v_version IS NULL THEN v_version := coalesce((p_data->>'template_version')::integer, 1); END IF;
 PERFORM asset_manager.validate_attributes(p_department,p_data->>'template_code',v_version,coalesce(p_data->'attributes','{}'),false);
 INSERT INTO asset_manager.assets(department_id,authority_id,asset_code,name,template_code,template_version,attributes,region_id,latitude,longitude,owner_reference,custodian_reference,source_reference,commissioning_date,date_precision,lifecycle_stage,availability,criticality,criticality_reason,created_by)
 VALUES(p_department,a,p_data->>'asset_code',p_data->>'name',p_data->>'template_code',v_version,coalesce(p_data->'attributes','{}'),(p_data->>'region_id')::uuid,(p_data->>'latitude')::numeric,(p_data->>'longitude')::numeric,p_data->>'owner_reference',p_data->>'custodian_reference',p_data->>'source_reference',(p_data->>'commissioning_date')::date,coalesce(p_data->>'date_precision','unknown'),coalesce(p_data->>'lifecycle_stage',(SELECT lifecycle_stages[1] FROM asset_manager.department_templates WHERE department_id=p_department AND code=p_data->>'template_code' AND version=v_version)),coalesce(p_data->>'availability','unknown'),coalesce(p_data->>'criticality','unknown'),p_data->>'criticality_reason',asset_manager.actor()) RETURNING * INTO row;
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION edit_asset(p_id uuid,p_expected integer,p_patch jsonb,p_reason text) RETURNS asset_manager.assets LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.assets; merged asset_manager.assets;
BEGIN
 SELECT * INTO row FROM asset_manager.assets WHERE id=p_id FOR UPDATE;
 PERFORM asset_manager.require_permission(row.department_id,'asset_write');
 IF row.id IS NULL THEN RAISE EXCEPTION 'Record not found or inaccessible' USING ERRCODE='P0002'; END IF;
 IF row.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 IF row.archived_at IS NOT NULL OR row.registration_status='submitted' THEN RAISE EXCEPTION 'Asset is frozen'; END IF;
 IF row.registration_status='verified' AND NOT asset_manager.department_permission(row.department_id,'asset_verify') THEN RAISE EXCEPTION 'Manager required for verified correction' USING ERRCODE='42501'; END IF;
 IF row.registration_status<>'verified' AND row.created_by<>asset_manager.actor() AND NOT asset_manager.department_permission(row.department_id,'asset_verify') THEN RAISE EXCEPTION 'Draft belongs to another officer' USING ERRCODE='42501'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 PERFORM asset_manager.validate_keys(p_patch,ARRAY['name','attributes','region_id','latitude','longitude','owner_reference','custodian_reference','source_reference','commissioning_date','date_precision','criticality','criticality_reason']);
 SELECT * INTO merged FROM jsonb_populate_record(row,p_patch);
 PERFORM asset_manager.validate_attributes(row.department_id,row.template_code,row.template_version,merged.attributes,row.registration_status='verified');
 UPDATE asset_manager.assets SET name=merged.name,attributes=merged.attributes,region_id=merged.region_id,latitude=merged.latitude,longitude=merged.longitude,owner_reference=merged.owner_reference,custodian_reference=merged.custodian_reference,source_reference=merged.source_reference,commissioning_date=merged.commissioning_date,date_precision=merged.date_precision,availability=merged.availability,criticality=merged.criticality,criticality_reason=merged.criticality_reason,registration_status=CASE WHEN row.registration_status='verified' THEN 'submitted' ELSE row.registration_status END,submitted_by=CASE WHEN row.registration_status='verified' THEN asset_manager.actor() ELSE row.submitted_by END,verified_by=CASE WHEN row.registration_status='verified' THEN NULL ELSE row.verified_by END,verified_at=CASE WHEN row.registration_status='verified' THEN NULL ELSE row.verified_at END,change_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 RETURN row;
END $$;
CREATE FUNCTION validate_template(p_fields jsonb,p_components text[],p_stages text[],p_transitions jsonb) RETURNS void LANGUAGE plpgsql
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE f jsonb; t jsonb;
BEGIN
 IF p_fields IS NULL OR jsonb_typeof(p_fields)<>'array' OR jsonb_array_length(p_fields)>80
 OR p_components IS NULL OR cardinality(p_components) NOT BETWEEN 1 AND 80
 OR p_stages IS NULL OR cardinality(p_stages) NOT BETWEEN 1 AND 30
 OR p_transitions IS NULL OR jsonb_typeof(p_transitions)<>'array' OR jsonb_array_length(p_transitions)>100 THEN RAISE EXCEPTION 'Invalid bounded template definition'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_stages) s WHERE s IS NULL OR s !~ '^[a-z][a-z0-9_]{0,49}$')
 OR (SELECT count(*) FROM unnest(p_stages))<>(SELECT count(DISTINCT s) FROM unnest(p_stages) s)
 OR EXISTS(SELECT 1 FROM unnest(p_components) s WHERE s IS NULL OR s !~ '^[a-z][a-z0-9_]{0,49}$')
 OR (SELECT count(*) FROM unnest(p_components))<>(SELECT count(DISTINCT s) FROM unnest(p_components) s) THEN RAISE EXCEPTION 'Stages/components need unique stable keys'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_fields) field_item GROUP BY field_item->>'key' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate field key'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
  IF coalesce(f->>'key','') !~ '^[a-z][a-z0-9_]{0,49}$' OR coalesce(f->>'type','') NOT IN ('text','select','number','integer','date','boolean') THEN RAISE EXCEPTION 'Invalid field definition'; END IF;
  IF f ? 'min' AND jsonb_typeof(f->'min')<>'number' OR f ? 'max' AND jsonb_typeof(f->'max')<>'number' THEN RAISE EXCEPTION 'Numeric bounds required'; END IF;
  IF f ? 'min' AND f ? 'max' AND (f->>'min')::numeric>(f->>'max')::numeric THEN RAISE EXCEPTION 'Minimum exceeds maximum'; END IF;
  IF f ? 'options' AND (jsonb_typeof(f->'options')<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(f->'options') v WHERE jsonb_typeof(v)<>'string' OR length(btrim(v #>> '{}')) NOT BETWEEN 1 AND 1000)) THEN RAISE EXCEPTION 'Select options must be strings'; END IF;
  IF f ? 'required_at' AND (jsonb_typeof(f->'required_at')<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(f->'required_at') stage_key WHERE NOT stage_key=ANY(p_stages))) THEN RAISE EXCEPTION 'Required-at stages must be valid lifecycle keys'; END IF;
  IF f ? 'required' AND jsonb_typeof(f->'required')<>'boolean' THEN RAISE EXCEPTION 'Invalid required flag'; END IF;
  IF f->>'type'='select' AND (NOT f ? 'options' OR jsonb_typeof(f->'options')<>'array' OR jsonb_array_length(f->'options')=0) THEN RAISE EXCEPTION 'Select options required'; END IF;
 END LOOP;
 FOR t IN SELECT value FROM jsonb_array_elements(p_transitions) LOOP
  IF coalesce(t->>'from','')<>ALL(p_stages) OR coalesce(t->>'to','')<>ALL(p_stages) OR t->>'from'=t->>'to'
  OR coalesce(t->>'permission','') NOT IN ('asset_write','asset_verify') OR t->'requires_approval' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Transitions require valid stages, permission and senior approval'; END IF;
  IF t ? 'retire' AND jsonb_typeof(t->'retire')<>'boolean' THEN RAISE EXCEPTION 'Invalid terminal transition flag'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_transitions) transition_item GROUP BY transition_item->>'from',transition_item->>'to' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate transition'; END IF;
END $$;
CREATE FUNCTION create_department_template(p_department uuid,p_code text,p_name text,p_base text,p_definition jsonb,p_request uuid)
RETURNS asset_manager.department_templates LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.department_templates; starter asset_manager.asset_templates; v integer; replay jsonb;
BEGIN
 PERFORM asset_manager.require_permission(p_department,'template_write');
 PERFORM asset_manager.validate_keys(p_definition,ARRAY['fields','components','lifecycle_stages','transitions','inspectable_stages','policy_reference']);
 replay:=asset_manager.begin_request(p_request,'create_template',jsonb_build_object('department',p_department,'code',p_code,'name',p_name,'base',p_base,'definition',p_definition));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.department_templates WHERE department_id=p_department AND code=p_code AND version=(replay->>'version')::integer; RETURN row; END IF;
 PERFORM 1 FROM asset_manager.departments WHERE id=p_department FOR UPDATE;
 SELECT coalesce(max(version),0)+1 INTO v FROM asset_manager.department_templates WHERE department_id=p_department AND code=p_code;
 SELECT * INTO starter FROM asset_manager.asset_templates WHERE code=p_base AND version=1;
 INSERT INTO asset_manager.department_templates(department_id,code,version,name,base_category,fields,components,lifecycle_stages,transitions,inspectable_stages,policy_reference,created_by)
 VALUES(p_department,p_code,v,p_name,p_base,coalesce(p_definition->'fields',starter.fields,'[]'),
 CASE WHEN p_definition ? 'components' THEN ARRAY(SELECT jsonb_array_elements_text(p_definition->'components')) ELSE coalesce(starter.components,ARRAY['general']) END,
 CASE WHEN p_definition ? 'lifecycle_stages' THEN ARRAY(SELECT jsonb_array_elements_text(p_definition->'lifecycle_stages')) ELSE coalesce(starter.lifecycle_stages,ARRAY['registered','operational','retired']) END,
 coalesce(p_definition->'transitions',starter.transitions,'[{"from":"planned","to":"construction","permission":"asset_write","requires_approval":true},{"from":"construction","to":"commissioned","permission":"asset_verify","requires_approval":true},{"from":"commissioned","to":"retired","permission":"asset_verify","requires_approval":true,"retire":true}]'::jsonb),
 CASE WHEN p_definition ? 'inspectable_stages' THEN ARRAY(SELECT jsonb_array_elements_text(p_definition->'inspectable_stages')) ELSE coalesce(starter.inspectable_stages,ARRAY['commissioned']) END,
 coalesce(p_definition->>'policy_reference',starter.policy_reference,'Prototype department policy; review required'),asset_manager.actor()) RETURNING * INTO row;
 PERFORM asset_manager.validate_template(row.fields,row.components,row.lifecycle_stages,row.transitions);
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION edit_department_template(p_department uuid,p_code text,p_version integer,p_revision integer,p_definition jsonb,p_reason text)
RETURNS asset_manager.department_templates LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.department_templates; merged asset_manager.department_templates;
BEGIN
 PERFORM asset_manager.require_permission(p_department,'template_write');
 SELECT * INTO row FROM asset_manager.department_templates WHERE department_id=p_department AND code=p_code AND version=p_version FOR UPDATE;
 IF row.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 IF row.status NOT IN ('draft','correction_required') THEN RAISE EXCEPTION 'Published/submitted definitions cannot be edited; create new version'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 PERFORM asset_manager.validate_keys(p_definition,ARRAY['name','fields','components','lifecycle_stages','transitions','inspectable_stages','policy_reference']);
 SELECT * INTO merged FROM jsonb_populate_record(row,p_definition);
 PERFORM asset_manager.validate_template(merged.fields,merged.components,merged.lifecycle_stages,merged.transitions);
 UPDATE asset_manager.department_templates SET name=merged.name,fields=merged.fields,components=merged.components,lifecycle_stages=merged.lifecycle_stages,transitions=merged.transitions,inspectable_stages=merged.inspectable_stages,policy_reference=merged.policy_reference,revision=revision+1,updated_at=clock_timestamp(),decision_reason=p_reason WHERE department_id=p_department AND code=p_code AND version=p_version RETURNING * INTO row;
 RETURN row;
END $$;
CREATE FUNCTION transition_template(p_department uuid,p_code text,p_version integer,p_revision integer,p_action text,p_reason text)
RETURNS asset_manager.department_templates LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.department_templates;
BEGIN
 SELECT * INTO row FROM asset_manager.department_templates WHERE department_id=p_department AND code=p_code AND version=p_version FOR UPDATE;
 IF row.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 IF p_action='submit' AND row.status IN ('draft','correction_required') THEN
  PERFORM asset_manager.require_permission(p_department,'template_write');
  PERFORM asset_manager.validate_template(row.fields,row.components,row.lifecycle_stages,row.transitions);
  UPDATE asset_manager.department_templates SET status='submitted',submitted_by=asset_manager.actor(),revision=revision+1,decision_reason=p_reason,updated_at=clock_timestamp() WHERE department_id=p_department AND code=p_code AND version=p_version RETURNING * INTO row;
 ELSIF p_action IN ('publish','return') AND row.status='submitted' THEN
  PERFORM asset_manager.require_permission(p_department,'template_approve');
  IF asset_manager.actor() IN (row.created_by,row.submitted_by) THEN RAISE EXCEPTION 'Independent senior template publication required'; END IF;
  UPDATE asset_manager.department_templates SET status=CASE WHEN p_action='publish' THEN 'published' ELSE 'correction_required' END,
   approved_by=CASE WHEN p_action='publish' THEN asset_manager.actor() ELSE NULL END,approved_at=CASE WHEN p_action='publish' THEN clock_timestamp() ELSE NULL END,
   revision=revision+1,decision_reason=p_reason,updated_at=clock_timestamp() WHERE department_id=p_department AND code=p_code AND version=p_version RETURNING * INTO row;
 ELSIF p_action='withdraw' AND row.status IN ('draft','correction_required') THEN
  PERFORM asset_manager.require_permission(p_department,'template_write');
  UPDATE asset_manager.department_templates SET status='withdrawn',revision=revision+1,decision_reason=p_reason,updated_at=clock_timestamp() WHERE department_id=p_department AND code=p_code AND version=p_version RETURNING * INTO row;
 ELSE RAISE EXCEPTION 'Invalid template transition'; END IF;
 RETURN row;
END $$;

CREATE FUNCTION enforce_asset_definition() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE stages text[];
BEGIN
 IF TG_OP='UPDATE' AND (NEW.department_id,NEW.authority_id,NEW.template_code,NEW.template_version,NEW.created_by,NEW.asset_code)
 IS DISTINCT FROM (OLD.department_id,OLD.authority_id,OLD.template_code,OLD.template_version,OLD.created_by,OLD.asset_code) THEN RAISE EXCEPTION 'Identity, tenant and definition version are immutable'; END IF;
 IF TG_OP='INSERT' OR NEW.lifecycle_stage IS DISTINCT FROM OLD.lifecycle_stage THEN
 SELECT lifecycle_stages INTO stages FROM asset_manager.department_templates WHERE department_id=NEW.department_id AND code=NEW.template_code AND version=NEW.template_version AND status='published';
 IF stages IS NULL OR NOT NEW.lifecycle_stage=ANY(stages) THEN RAISE EXCEPTION 'Published department definition and valid stage required'; END IF;
 END IF;
 IF (TG_OP='INSERT' OR NEW.commissioning_date IS DISTINCT FROM OLD.commissioning_date) AND NEW.commissioning_date>((now() AT TIME ZONE 'Asia/Kolkata')::date) THEN RAISE EXCEPTION 'Commissioning date is in future'; END IF;
 IF (TG_OP='INSERT' OR NEW.region_id IS DISTINCT FROM OLD.region_id) AND NEW.region_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_manager.regions WHERE authority_id=NEW.authority_id AND id=NEW.region_id AND active) THEN RAISE EXCEPTION 'Active authority region required'; END IF;
 IF TG_OP='INSERT' OR NEW.attributes IS DISTINCT FROM OLD.attributes OR NEW.lifecycle_stage IS DISTINCT FROM OLD.lifecycle_stage OR (NEW.registration_status IN ('submitted','verified') AND NEW.registration_status IS DISTINCT FROM OLD.registration_status) THEN
  PERFORM asset_manager.validate_attributes(NEW.department_id,NEW.template_code,NEW.template_version,NEW.attributes,NEW.registration_status IN ('submitted','verified'),NEW.lifecycle_stage);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER definition_guard BEFORE INSERT OR UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION enforce_asset_definition();
CREATE FUNCTION transition_asset(p_id uuid,p_expected integer,p_action text,p_reason text) RETURNS asset_manager.assets LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.assets;
BEGIN
 SELECT * INTO row FROM asset_manager.assets WHERE id=p_id FOR UPDATE;
 PERFORM asset_manager.require_permission(row.department_id,CASE WHEN p_action IN ('verify','return') THEN 'asset_verify' ELSE 'asset_write' END);
 IF row.id IS NULL THEN RAISE EXCEPTION 'Record not found or inaccessible' USING ERRCODE='P0002'; END IF;
 IF row.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 IF row.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Asset is archived'; END IF;
 IF p_action='submit' AND row.registration_status IN ('draft','correction_required') THEN
  IF row.created_by<>asset_manager.actor() AND NOT asset_manager.department_permission(row.department_id,'asset_verify') THEN RAISE EXCEPTION 'Cannot submit another officer draft'; END IF;
  IF row.region_id IS NULL OR nullif(btrim(row.source_reference),'') IS NULL THEN RAISE EXCEPTION 'Region and documentary source required'; END IF;
  UPDATE asset_manager.assets SET registration_status='submitted',submitted_by=asset_manager.actor(),change_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 ELSIF p_action IN ('verify','return') AND row.registration_status='submitted' THEN
  PERFORM asset_manager.require_permission(row.department_id,'asset_verify');
  IF asset_manager.actor() IN (row.submitted_by,row.created_by) THEN RAISE EXCEPTION 'Independent registration review required'; END IF;
  IF p_action='verify' THEN
   IF EXISTS(SELECT 1 FROM asset_manager.duplicate_candidates WHERE (asset_id=row.id OR candidate_asset_id=row.id) AND status='pending') THEN
    RAISE EXCEPTION 'Pending duplicate candidate must be reviewed before verification'; END IF;
   IF EXISTS(SELECT 1 FROM asset_manager.duplicate_candidates WHERE (asset_id=row.id OR candidate_asset_id=row.id) AND status='confirmed') THEN
    RAISE EXCEPTION 'Asset is a confirmed duplicate; verification denied'; END IF;
  END IF;
  UPDATE asset_manager.assets SET registration_status=CASE WHEN p_action='verify' THEN 'verified' ELSE 'correction_required' END,
   verified_by=CASE WHEN p_action='verify' THEN asset_manager.actor() ELSE NULL END,verified_at=CASE WHEN p_action='verify' THEN clock_timestamp() ELSE NULL END,change_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 ELSE RAISE EXCEPTION 'Invalid registration transition; sensitive actions use approval requests'; END IF;
 RETURN row;
END $$;
CREATE FUNCTION request_asset_action(p_id uuid,p_expected integer,p_action text,p_target text,p_reason text,p_request uuid)
RETURNS asset_manager.approval_requests LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE a asset_manager.assets; row asset_manager.approval_requests; t jsonb; replay jsonb;
BEGIN
 SELECT * INTO a FROM asset_manager.assets WHERE id=p_id FOR UPDATE;
 PERFORM asset_manager.require_permission(a.department_id,'asset_write');
 IF a.registration_status<>'verified' THEN RAISE EXCEPTION 'Verified registration required'; END IF;
 replay:=asset_manager.begin_request(p_request,'request_asset_action',jsonb_build_object('id',p_id,'version',p_expected,'action',p_action,'target',p_target,'reason',p_reason));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.approval_requests WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
 IF a.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 IF p_action='lifecycle' THEN
  SELECT value INTO t FROM asset_manager.department_templates dt CROSS JOIN LATERAL jsonb_array_elements(dt.transitions)
  WHERE dt.department_id=a.department_id AND dt.code=a.template_code AND dt.version=a.template_version AND value->>'from'=a.lifecycle_stage AND value->>'to'=p_target;
  IF t IS NULL OR a.archived_at IS NOT NULL OR a.retired_at IS NOT NULL THEN RAISE EXCEPTION 'Lifecycle transition unavailable'; END IF;
  PERFORM asset_manager.require_permission(a.department_id,t->>'permission');
 ELSIF p_action='availability' THEN
  IF p_target IS NULL OR p_target NOT IN ('in_service','restricted','closed','unknown') OR p_target=a.availability OR a.archived_at IS NOT NULL OR a.retired_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid availability request'; END IF;
 ELSIF p_action='archive' THEN
  PERFORM asset_manager.require_permission(a.department_id,'asset_archive');
  IF a.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Already archived'; END IF;
 ELSIF p_action='unarchive' THEN
  PERFORM asset_manager.require_permission(a.department_id,'asset_archive');
  IF a.archived_at IS NULL THEN RAISE EXCEPTION 'Not archived'; END IF;
 ELSE RAISE EXCEPTION 'Invalid action'; END IF;
 INSERT INTO asset_manager.approval_requests(department_id,asset_id,action,from_value,to_value,asset_version,reason,requested_by)
 VALUES(a.department_id,a.id,p_action,CASE WHEN p_action='lifecycle' THEN a.lifecycle_stage WHEN p_action='availability' THEN a.availability ELSE NULL END,p_target,a.version,p_reason,asset_manager.actor()) RETURNING * INTO row;
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION decide_asset_action(p_id uuid,p_approve boolean,p_reason text) RETURNS asset_manager.approval_requests LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE r asset_manager.approval_requests; a asset_manager.assets; t jsonb; req_perm text; v_decided_role text;
BEGIN
 PERFORM 1 FROM asset_manager.assets WHERE id=(SELECT asset_id FROM asset_manager.approval_requests WHERE id=p_id) FOR UPDATE;
 SELECT * INTO r FROM asset_manager.approval_requests WHERE id=p_id FOR UPDATE;
 PERFORM asset_manager.require_permission(r.department_id,'lifecycle_approve');
 PERFORM asset_manager.require_reason(p_reason);
 IF r.status<>'pending' OR p_approve IS NULL OR r.requested_by=asset_manager.actor() THEN RAISE EXCEPTION 'Pending request and independent senior required'; END IF;
 SELECT * INTO a FROM asset_manager.assets WHERE id=r.asset_id FOR UPDATE;
 
 -- Recheck original requester is still active identity and department member
 IF NOT EXISTS(
  SELECT 1 FROM asset_manager.department_memberships m
  JOIN asset_manager.identities i ON i.clerk_id=m.clerk_id AND i.email_verified AND i.disabled_at IS NULL
  WHERE m.department_id=r.department_id AND m.clerk_id=r.requested_by AND m.active
 ) THEN RAISE EXCEPTION 'Requester is no longer an active department member'; END IF;

 IF p_approve THEN
  IF a.version<>r.asset_version THEN RAISE EXCEPTION 'Asset changed; cancel and request again' USING ERRCODE='40001'; END IF;
  IF r.action IN ('lifecycle','archive') AND (EXISTS(SELECT 1 FROM asset_manager.inspections WHERE asset_id=a.id AND status='submitted') OR EXISTS(SELECT 1 FROM asset_manager.work_orders WHERE asset_id=a.id AND status NOT IN ('accepted','cancelled')) OR EXISTS(SELECT 1 FROM asset_manager.complaints WHERE asset_id=a.id AND status<>'resolved')) THEN RAISE EXCEPTION 'Outstanding work/cases require resolution'; END IF;
  IF r.action='lifecycle' THEN
   SELECT value INTO t FROM asset_manager.department_templates dt CROSS JOIN LATERAL jsonb_array_elements(dt.transitions)
    WHERE dt.department_id=a.department_id AND dt.code=a.template_code AND dt.version=a.template_version AND value->>'from'=a.lifecycle_stage AND value->>'to'=r.to_value;
   IF t IS NULL OR a.retired_at IS NOT NULL OR a.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Transition unavailable'; END IF;
   req_perm := coalesce(t->>'permission', 'asset_write');
   IF NOT EXISTS(
    SELECT 1 FROM asset_manager.department_memberships m
    JOIN asset_manager.role_permissions rp ON rp.authority_id=m.authority_id AND rp.role=m.role
    WHERE m.department_id=r.department_id AND m.clerk_id=r.requested_by AND m.active AND rp.permission=req_perm
   ) THEN RAISE EXCEPTION 'Requester no longer holds required transition permission: %', req_perm; END IF;
   UPDATE asset_manager.assets SET lifecycle_stage=r.to_value,retired_at=CASE WHEN coalesce((t->>'retire')::boolean,false) THEN clock_timestamp() ELSE NULL END,
    availability=CASE WHEN coalesce((t->>'retire')::boolean,false) THEN 'closed' ELSE availability END,change_reason=p_reason WHERE id=a.id;
  ELSIF r.action='availability' THEN
   IF NOT EXISTS(
    SELECT 1 FROM asset_manager.department_memberships m
    JOIN asset_manager.role_permissions rp ON rp.authority_id=m.authority_id AND rp.role=m.role
    WHERE m.department_id=r.department_id AND m.clerk_id=r.requested_by AND m.active AND rp.permission='asset_write'
   ) THEN RAISE EXCEPTION 'Requester no longer holds permission: asset_write'; END IF;
   UPDATE asset_manager.assets SET availability=r.to_value,change_reason=p_reason WHERE id=a.id;
  ELSIF r.action='archive' THEN
   IF NOT EXISTS(
    SELECT 1 FROM asset_manager.department_memberships m
    JOIN asset_manager.role_permissions rp ON rp.authority_id=m.authority_id AND rp.role=m.role
    WHERE m.department_id=r.department_id AND m.clerk_id=r.requested_by AND m.active AND rp.permission='asset_archive'
   ) THEN RAISE EXCEPTION 'Requester no longer holds permission: asset_archive'; END IF;
   UPDATE asset_manager.assets SET archived_at=clock_timestamp(),change_reason=p_reason WHERE id=a.id;
  ELSIF r.action='unarchive' THEN
   IF NOT EXISTS(
    SELECT 1 FROM asset_manager.department_memberships m
    JOIN asset_manager.role_permissions rp ON rp.authority_id=m.authority_id AND rp.role=m.role
    WHERE m.department_id=r.department_id AND m.clerk_id=r.requested_by AND m.active AND rp.permission='asset_archive'
   ) THEN RAISE EXCEPTION 'Requester no longer holds permission: asset_archive'; END IF;
   UPDATE asset_manager.assets SET archived_at=NULL,change_reason=p_reason WHERE id=a.id;
  END IF;
 END IF;
 SELECT m.role INTO v_decided_role FROM asset_manager.department_memberships m
  JOIN asset_manager.role_permissions rp ON rp.authority_id=m.authority_id AND rp.role=m.role AND rp.permission='lifecycle_approve'
  WHERE m.department_id=r.department_id AND m.clerk_id=asset_manager.actor() AND m.active LIMIT 1;
 UPDATE asset_manager.approval_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
  decided_by=asset_manager.actor(),decided_role=v_decided_role,decided_at=clock_timestamp(),decision_reason=p_reason WHERE id=p_id RETURNING * INTO r;
 RETURN r;
END $$;
CREATE FUNCTION cancel_asset_action(p_id uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE r asset_manager.approval_requests;
BEGIN
 PERFORM 1 FROM asset_manager.assets WHERE id=(SELECT asset_id FROM asset_manager.approval_requests WHERE id=p_id) FOR UPDATE;
 SELECT * INTO r FROM asset_manager.approval_requests WHERE id=p_id FOR UPDATE;
 PERFORM asset_manager.require_permission(r.department_id,'asset_write'); PERFORM asset_manager.require_reason(p_reason);
 IF r.status<>'pending' OR r.requested_by<>asset_manager.actor() THEN RAISE EXCEPTION 'Only requester can cancel pending action'; END IF;
 UPDATE asset_manager.approval_requests SET status='cancelled',decision_reason=p_reason WHERE id=p_id;
END $$;

CREATE FUNCTION request_governance(p_authority uuid,p_action text,p_payload jsonb,p_reason text,p_request uuid)
RETURNS asset_manager.governance_requests LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.governance_requests; replay jsonb;
BEGIN
 IF NOT asset_manager.authority_admin(p_authority) THEN RAISE EXCEPTION 'Authority administration required' USING ERRCODE='42501'; END IF;
 replay:=asset_manager.begin_request(p_request,'request_governance',jsonb_build_object('authority',p_authority,'action',p_action,'payload',p_payload,'reason',p_reason));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.governance_requests WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
 IF p_action='department_create' THEN
  PERFORM asset_manager.validate_keys(p_payload,ARRAY['code','name','manager','manager_role']);
  IF coalesce(length(btrim(p_payload->>'code')),0)=0 OR coalesce(length(btrim(p_payload->>'name')),0)=0
  OR NOT EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_payload->>'manager' AND email_verified AND disabled_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM asset_manager.role_definitions WHERE authority_id=p_authority AND code=p_payload->>'manager_role' AND active AND scope='department') THEN RAISE EXCEPTION 'Invalid department proposal'; END IF;
 ELSIF p_action='region_create' THEN
  PERFORM asset_manager.validate_keys(p_payload,ARRAY['parent_id','code','name','level']);
  IF coalesce(length(btrim(p_payload->>'code')),0)=0 OR coalesce(length(btrim(p_payload->>'name')),0)=0 OR coalesce(p_payload->>'level','') NOT IN ('state','district','block','city','ward','village') THEN RAISE EXCEPTION 'Invalid region proposal'; END IF;
 ELSIF p_action IN ('role_create','role_edit','role_retire') THEN
  PERFORM asset_manager.validate_keys(p_payload,ARRAY['code','name','scope','permissions','expected_version']);
  IF coalesce(p_payload->>'code','') !~ '^[a-z][a-z0-9_]{0,49}$' THEN RAISE EXCEPTION 'Invalid role code'; END IF;
  IF p_action='role_create' AND (coalesce(p_payload->>'scope','') NOT IN ('authority','department') OR coalesce(length(btrim(p_payload->>'name')),0)=0) THEN RAISE EXCEPTION 'Role scope/name required'; END IF;
  IF p_action<>'role_create' AND NOT EXISTS(SELECT 1 FROM asset_manager.role_definitions WHERE authority_id=p_authority AND code=p_payload->>'code' AND active AND version=(p_payload->>'expected_version')::integer) THEN RAISE EXCEPTION 'Role missing or version stale' USING ERRCODE='40001'; END IF;
  IF p_action='role_retire' THEN
   IF EXISTS(SELECT 1 FROM asset_manager.authority_memberships WHERE authority_id=p_authority AND role=p_payload->>'code')
   OR EXISTS(SELECT 1 FROM asset_manager.department_memberships WHERE authority_id=p_authority AND role=p_payload->>'code')
   OR EXISTS(SELECT 1 FROM asset_manager.invitations i JOIN asset_manager.departments d ON d.id=i.department_id WHERE d.authority_id=p_authority AND i.role=p_payload->>'code' AND i.status IN ('pending','sent')) THEN
    RAISE EXCEPTION 'Role retirement blocked: active assignments or pending invitations exist' USING ERRCODE='23503';
   END IF;
  END IF;
  IF p_action<>'role_retire' AND (jsonb_typeof(p_payload->'permissions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'permissions')>50) THEN RAISE EXCEPTION 'Bounded permissions array required'; END IF;
  IF p_action<>'role_retire' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'permissions') item WHERE NOT EXISTS(SELECT 1 FROM asset_manager.permission_catalog pc WHERE pc.code=item AND pc.scope=coalesce(p_payload->>'scope',(SELECT scope FROM asset_manager.role_definitions WHERE authority_id=p_authority AND code=p_payload->>'code')))) THEN RAISE EXCEPTION 'Invalid role permission'; END IF;
 ELSIF p_action='authority_member' THEN
  PERFORM asset_manager.validate_keys(p_payload,ARRAY['clerk_id','role','active']);
  IF jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean'
  OR NOT EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_payload->>'clerk_id' AND email_verified AND disabled_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM asset_manager.role_definitions WHERE authority_id=p_authority AND code=p_payload->>'role' AND active AND scope='authority') THEN RAISE EXCEPTION 'Invalid authority membership proposal'; END IF;
 ELSIF p_action='department_member' THEN
  PERFORM asset_manager.validate_keys(p_payload,ARRAY['department_id','clerk_id','role','active']);
  IF jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean'
  OR NOT EXISTS(SELECT 1 FROM asset_manager.departments WHERE id=(p_payload->>'department_id')::uuid AND authority_id=p_authority)
  OR NOT EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=p_payload->>'clerk_id' AND email_verified AND disabled_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM asset_manager.role_definitions WHERE authority_id=p_authority AND code=p_payload->>'role' AND active AND scope='department') THEN RAISE EXCEPTION 'Invalid department membership proposal'; END IF;
 ELSE RAISE EXCEPTION 'Unsupported governance action'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 INSERT INTO asset_manager.governance_requests(authority_id,action,payload,reason,requested_by) VALUES(p_authority,p_action,p_payload,p_reason,asset_manager.actor()) RETURNING * INTO row;
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION decide_governance(p_id uuid,p_approve boolean,p_reason text) RETURNS asset_manager.governance_requests LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE r asset_manager.governance_requests; definition asset_manager.role_definitions; perms text[]; item text; new_department asset_manager.departments; v_decided_role text;
BEGIN
 SELECT * INTO r FROM asset_manager.governance_requests WHERE id=p_id FOR UPDATE;
 PERFORM 1 FROM asset_manager.authorities WHERE id=r.authority_id FOR UPDATE;
 IF NOT asset_manager.governance_permission(r.authority_id,'governance_approve') THEN RAISE EXCEPTION 'Authority governance approval required' USING ERRCODE='42501'; END IF;
 IF r.id IS NULL OR r.status<>'pending' OR r.expires_at<=clock_timestamp() OR r.requested_by=asset_manager.actor() OR p_approve IS NULL THEN RAISE EXCEPTION 'Independent pending request required'; END IF;
 -- Recheck original requester, so revoked approvers cannot leave executable requests.
 IF NOT EXISTS(SELECT 1 FROM asset_manager.authority_memberships m JOIN asset_manager.identities i ON i.clerk_id=m.clerk_id AND i.email_verified AND i.disabled_at IS NULL
 JOIN asset_manager.role_definitions d ON d.authority_id=m.authority_id AND d.code=m.role AND d.active
 JOIN asset_manager.role_permissions rp ON rp.authority_id=d.authority_id AND rp.role=d.code AND rp.permission='authority_admin'
 WHERE m.authority_id=r.authority_id AND m.clerk_id=r.requested_by AND m.active) THEN RAISE EXCEPTION 'Requester no longer authorised'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 IF p_approve THEN
  IF r.action='department_create' THEN
   PERFORM asset_manager.validate_keys(r.payload,ARRAY['code','name','manager','manager_role']);
   SELECT * INTO new_department FROM asset_manager.create_department(r.authority_id,r.payload->>'code',r.payload->>'name',r.payload->>'manager',r.payload->>'manager_role',r.id);
   r.result:=jsonb_build_object('department_id',new_department.id);
  ELSIF r.action='region_create' THEN
   r.result:=jsonb_build_object('region_id',asset_manager.create_region(r.authority_id,(r.payload->>'parent_id')::uuid,r.payload->>'code',r.payload->>'name',r.payload->>'level'));
  ELSIF r.action IN ('role_create','role_edit','role_retire') THEN
   PERFORM asset_manager.validate_keys(r.payload,ARRAY['code','name','scope','permissions','expected_version']);
   SELECT * INTO definition FROM asset_manager.role_definitions WHERE authority_id=r.authority_id AND code=r.payload->>'code' FOR UPDATE;
   IF r.action='role_create' THEN
    IF definition.code IS NOT NULL THEN RAISE EXCEPTION 'Role already exists'; END IF;
    INSERT INTO asset_manager.role_definitions(authority_id,code,name,scope,change_reason) VALUES(r.authority_id,r.payload->>'code',r.payload->>'name',r.payload->>'scope',p_reason) RETURNING * INTO definition;
   ELSE
    IF definition.code IS NULL OR definition.version IS DISTINCT FROM (r.payload->>'expected_version')::integer THEN RAISE EXCEPTION 'Role version conflict' USING ERRCODE='40001'; END IF;
    IF r.payload ? 'scope' AND r.payload->>'scope'<>definition.scope THEN RAISE EXCEPTION 'Role scope is immutable'; END IF;
    IF r.action='role_retire' THEN
     IF EXISTS(SELECT 1 FROM asset_manager.authority_memberships WHERE authority_id=r.authority_id AND role=definition.code)
     OR EXISTS(SELECT 1 FROM asset_manager.department_memberships WHERE authority_id=r.authority_id AND role=definition.code)
     OR EXISTS(SELECT 1 FROM asset_manager.invitations i JOIN asset_manager.departments d ON d.id=i.department_id WHERE d.authority_id=r.authority_id AND i.role=definition.code AND i.status IN ('pending','sent')) THEN
      RAISE EXCEPTION 'Role retirement blocked: % membership assignments, % pending invitations', (SELECT count(*) FROM (SELECT clerk_id FROM asset_manager.authority_memberships WHERE authority_id=r.authority_id AND role=definition.code UNION ALL SELECT clerk_id FROM asset_manager.department_memberships WHERE authority_id=r.authority_id AND role=definition.code) assignments), (SELECT count(*) FROM asset_manager.invitations i JOIN asset_manager.departments d ON d.id=i.department_id WHERE d.authority_id=r.authority_id AND i.role=definition.code AND i.status IN ('pending','sent')) USING ERRCODE='23503';
     END IF;
     UPDATE asset_manager.role_definitions SET active=false,version=version+1,change_reason=p_reason,updated_at=clock_timestamp() WHERE authority_id=r.authority_id AND code=definition.code;
    ELSE
     UPDATE asset_manager.role_definitions SET name=coalesce(r.payload->>'name',name),version=version+1,change_reason=p_reason,updated_at=clock_timestamp() WHERE authority_id=r.authority_id AND code=definition.code;
    END IF;
   END IF;
   IF r.action<>'role_retire' THEN
    IF jsonb_typeof(r.payload->'permissions') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Permissions array required'; END IF;
    perms:=ARRAY(SELECT jsonb_array_elements_text(r.payload->'permissions'));
    FOREACH item IN ARRAY perms LOOP
     IF NOT EXISTS(SELECT 1 FROM asset_manager.permission_catalog WHERE code=item AND scope=definition.scope) THEN RAISE EXCEPTION 'Permission not valid for role scope: %',item; END IF;
    END LOOP;
    DELETE FROM asset_manager.role_permissions WHERE authority_id=r.authority_id AND role=definition.code;
    INSERT INTO asset_manager.role_permissions SELECT DISTINCT r.authority_id,definition.code,p FROM unnest(perms) p;
   END IF;
   PERFORM asset_manager.protect_governance_access(r.authority_id);
   r.result:=jsonb_build_object('role_code',definition.code);
  ELSIF r.action='authority_member' THEN
   PERFORM asset_manager.validate_keys(r.payload,ARRAY['clerk_id','role','active']);
   PERFORM asset_manager.set_authority_member(r.authority_id,r.payload->>'clerk_id',r.payload->>'role',(r.payload->>'active')::boolean,p_reason);
   r.result:=jsonb_build_object('clerk_id',r.payload->>'clerk_id');
  ELSIF r.action='department_member' THEN
   PERFORM asset_manager.validate_keys(r.payload,ARRAY['department_id','clerk_id','role','active']);
   PERFORM set_config('pravi.governance_exec', 'true', true);
   PERFORM asset_manager.set_department_member((r.payload->>'department_id')::uuid,r.payload->>'clerk_id',r.payload->>'role',(r.payload->>'active')::boolean,p_reason);
   PERFORM set_config('pravi.governance_exec', 'false', true);
   r.result:=jsonb_build_object('clerk_id',r.payload->>'clerk_id','department_id',r.payload->>'department_id');
  END IF;
 END IF;
 SELECT m.role INTO v_decided_role FROM asset_manager.authority_memberships m
  JOIN asset_manager.role_permissions rp ON rp.authority_id=m.authority_id AND rp.role=m.role AND rp.permission='governance_approve'
  WHERE m.authority_id=r.authority_id AND m.clerk_id=asset_manager.actor() AND m.active LIMIT 1;
 UPDATE asset_manager.governance_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
  decided_by=asset_manager.actor(),decided_role=v_decided_role,decided_at=clock_timestamp(),decision_reason=p_reason,result=r.result WHERE id=p_id RETURNING * INTO r;
 RETURN r;
END $$;
CREATE FUNCTION cancel_governance(p_id uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE r asset_manager.governance_requests;
BEGIN
 SELECT * INTO r FROM asset_manager.governance_requests WHERE id=p_id FOR UPDATE;
 IF NOT asset_manager.authority_admin(r.authority_id) OR r.requested_by<>asset_manager.actor() OR r.status<>'pending' THEN RAISE EXCEPTION 'Only authorised requester may cancel'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 UPDATE asset_manager.governance_requests SET status='cancelled',decision_reason=p_reason WHERE id=p_id;
END $$;

CREATE FUNCTION check_condition_severity(p_condition text, p_observations jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
 c text; comp_cond text; worst_rank int := 0; overall_rank int := 0; worst_name text := '';
BEGIN
 IF p_condition IS NULL OR p_condition = 'unknown' THEN RETURN; END IF;
 overall_rank := CASE p_condition
  WHEN 'good' THEN 1
  WHEN 'fair' THEN 2
  WHEN 'poor' THEN 3
  WHEN 'critical' THEN 4
  ELSE 0 END;
 IF overall_rank = 0 THEN RETURN; END IF;
 IF p_observations IS NOT NULL AND jsonb_typeof(p_observations) = 'object' THEN
  FOR c IN SELECT jsonb_object_keys(p_observations) LOOP
   comp_cond := p_observations->c->>'condition';
   IF comp_cond = 'critical' AND worst_rank < 4 THEN worst_rank := 4; worst_name := 'critical';
   ELSIF comp_cond = 'poor' AND worst_rank < 3 THEN worst_rank := 3; worst_name := 'poor';
   ELSIF comp_cond = 'fair' AND worst_rank < 2 THEN worst_rank := 2; worst_name := 'fair';
   ELSIF comp_cond = 'good' AND worst_rank < 1 THEN worst_rank := 1; worst_name := 'good';
   END IF;
  END LOOP;
 END IF;
 IF worst_rank > overall_rank THEN
  RAISE EXCEPTION 'Overall condition (%) cannot be better than worst component condition (%)', p_condition, worst_name;
 END IF;
END $$;

CREATE FUNCTION validate_observations(p_department uuid,p_code text,p_version integer,p_data jsonb,p_complete boolean) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE components text[]; c text; val jsonb;
BEGIN
 SELECT dt.components INTO components FROM asset_manager.department_templates dt WHERE department_id=p_department AND code=p_code AND version=p_version AND status='published';
 IF components IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid inspection definition/observations'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE NOT k=ANY(components)) THEN RAISE EXCEPTION 'Unknown inspection component'; END IF;
 FOREACH c IN ARRAY components LOOP
  val:=p_data->c;
  IF val IS NULL THEN IF p_complete THEN RAISE EXCEPTION 'Component not assessed: %',c; END IF; CONTINUE; END IF;
  PERFORM asset_manager.validate_keys(val,ARRAY['condition','notes']);
  IF coalesce(val->>'condition','') NOT IN ('good','fair','poor','critical','not_assessed') THEN RAISE EXCEPTION 'Invalid component condition'; END IF;
  IF val->>'condition' IN ('poor','critical','not_assessed') AND nullif(btrim(val->>'notes'),'') IS NULL THEN RAISE EXCEPTION 'Defect/limitation explanation required'; END IF;
 END LOOP;
END $$;
CREATE FUNCTION create_inspection(p_asset uuid,p_data jsonb,p_request uuid) RETURNS asset_manager.inspections LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE a asset_manager.assets; row asset_manager.inspections; replay jsonb;
BEGIN
 SELECT * INTO a FROM asset_manager.assets WHERE id=p_asset FOR UPDATE;
 PERFORM asset_manager.require_permission(a.department_id,'inspection_write');
 IF a.registration_status<>'verified' OR a.archived_at IS NOT NULL OR a.retired_at IS NOT NULL THEN RAISE EXCEPTION 'Active verified asset required'; END IF;
 PERFORM asset_manager.validate_keys(p_data,ARRAY['observed_on','observations','condition','limitations','next_review_on','supersedes_id']);
 replay:=asset_manager.begin_request(p_request,'create_inspection',jsonb_build_object('asset',p_asset,'data',p_data));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.inspections WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
 IF (p_data->>'observed_on')::date>((now() AT TIME ZONE 'Asia/Kolkata')::date) THEN RAISE EXCEPTION 'Observation is in future'; END IF;
 PERFORM asset_manager.validate_observations(a.department_id,a.template_code,a.template_version,coalesce(p_data->'observations','{}'),false);
 PERFORM asset_manager.check_condition_severity(p_data->>'condition', coalesce(p_data->'observations','{}'));
 IF p_data ? 'supersedes_id' AND NOT EXISTS(SELECT 1 FROM asset_manager.inspections WHERE id=(p_data->>'supersedes_id')::uuid AND asset_id=p_asset AND status='approved') THEN RAISE EXCEPTION 'Correction must reference approved observation'; END IF;
 INSERT INTO asset_manager.inspections(department_id,asset_id,template_code,template_version,observed_on,observations,condition,limitations,next_review_on,supersedes_id,created_by)
 VALUES(a.department_id,a.id,a.template_code,a.template_version,(p_data->>'observed_on')::date,coalesce(p_data->'observations','{}'),coalesce(p_data->>'condition','unknown'),p_data->>'limitations',(p_data->>'next_review_on')::date,(p_data->>'supersedes_id')::uuid,asset_manager.actor()) RETURNING * INTO row;
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION edit_inspection(p_id uuid,p_expected integer,p_patch jsonb,p_reason text) RETURNS asset_manager.inspections LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.inspections; m asset_manager.inspections;
BEGIN
 PERFORM 1 FROM asset_manager.assets WHERE id=(SELECT asset_id FROM asset_manager.inspections WHERE id=p_id) FOR UPDATE;
 SELECT * INTO row FROM asset_manager.inspections WHERE id=p_id FOR UPDATE;
 PERFORM asset_manager.require_permission(row.department_id,'inspection_write');
 IF row.id IS NULL THEN RAISE EXCEPTION 'Record not found or inaccessible' USING ERRCODE='P0002'; END IF;
 IF row.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 IF row.status NOT IN ('draft','correction_required') OR row.created_by<>asset_manager.actor() THEN RAISE EXCEPTION 'Only author may edit draft; approved findings require superseding record'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 PERFORM asset_manager.validate_keys(p_patch,ARRAY['observed_on','observations','condition','limitations','next_review_on']);
 SELECT * INTO m FROM jsonb_populate_record(row,p_patch);
 IF m.observed_on>((now() AT TIME ZONE 'Asia/Kolkata')::date) THEN RAISE EXCEPTION 'Future inspection date'; END IF;
 PERFORM asset_manager.validate_observations(row.department_id,row.template_code,row.template_version,m.observations,false);
 PERFORM asset_manager.check_condition_severity(m.condition, m.observations);
 UPDATE asset_manager.inspections SET observed_on=m.observed_on,observations=m.observations,condition=m.condition,limitations=m.limitations,next_review_on=m.next_review_on,decision_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 RETURN row;
END $$;
CREATE FUNCTION transition_inspection(p_id uuid,p_expected integer,p_action text,p_reason text) RETURNS asset_manager.inspections LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.inspections;
BEGIN
 PERFORM 1 FROM asset_manager.assets WHERE id=(SELECT asset_id FROM asset_manager.inspections WHERE id=p_id) FOR UPDATE;
 SELECT * INTO row FROM asset_manager.inspections WHERE id=p_id FOR UPDATE;
 PERFORM asset_manager.require_permission(row.department_id,CASE WHEN p_action IN ('approve','return') THEN 'inspection_approve' ELSE 'inspection_write' END);
 IF row.id IS NULL THEN RAISE EXCEPTION 'Record not found or inaccessible' USING ERRCODE='P0002'; END IF;
 IF row.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 IF NOT EXISTS(SELECT 1 FROM asset_manager.assets WHERE id=row.asset_id AND archived_at IS NULL AND retired_at IS NULL) THEN RAISE EXCEPTION 'Asset not active'; END IF;
 IF p_action='submit' AND row.status IN ('draft','correction_required') AND row.created_by=asset_manager.actor() THEN
  PERFORM asset_manager.validate_observations(row.department_id,row.template_code,row.template_version,row.observations,true);
  PERFORM asset_manager.check_condition_severity(row.condition, row.observations);
  IF NOT EXISTS(SELECT 1 FROM asset_manager.evidence WHERE inspection_id=row.id AND removed_at IS NULL) THEN RAISE EXCEPTION 'Inspection evidence required'; END IF;
  UPDATE asset_manager.inspections SET status='submitted',submitted_by=asset_manager.actor(),decision_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 ELSIF p_action IN ('approve','return') AND row.status='submitted' THEN
  PERFORM asset_manager.require_permission(row.department_id,'inspection_approve');
  IF asset_manager.actor() IN (row.created_by,row.submitted_by) THEN RAISE EXCEPTION 'Independent inspection review required'; END IF;
  IF p_action='approve' AND row.next_review_on IS NULL THEN RAISE EXCEPTION 'Explicit policy-based next review date required'; END IF;
  IF p_action='approve' THEN PERFORM asset_manager.check_condition_severity(row.condition, row.observations); END IF;
  UPDATE asset_manager.inspections SET status=CASE WHEN p_action='approve' THEN 'approved' ELSE 'correction_required' END,reviewed_by=asset_manager.actor(),reviewed_at=clock_timestamp(),decision_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 ELSE RAISE EXCEPTION 'Invalid inspection transition'; END IF;
 RETURN row;
END $$;

CREATE FUNCTION preserve_approved_inspection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status = 'approved' THEN
  RAISE EXCEPTION 'Approved inspection findings are immutable; create a superseding inspection' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_approved_inspection_trg
BEFORE UPDATE ON inspections
FOR EACH ROW EXECUTE FUNCTION preserve_approved_inspection();

CREATE FUNCTION create_complaint(p_department uuid,p_data jsonb,p_request uuid) RETURNS asset_manager.complaints LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.complaints; replay jsonb;
BEGIN
 PERFORM asset_manager.require_permission(p_department,'complaint_write');
 PERFORM asset_manager.validate_keys(p_data,ARRAY['asset_id','external_reference','channel','reported_at','narrative','reported_severity']);
 replay:=asset_manager.begin_request(p_request,'create_complaint',jsonb_build_object('department',p_department,'data',p_data));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.complaints WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
 IF (p_data->>'reported_at')::timestamptz>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'Future reported date'; END IF;
 IF p_data->>'asset_id' IS NOT NULL THEN
  PERFORM 1 FROM asset_manager.assets WHERE id=(p_data->>'asset_id')::uuid AND department_id=p_department AND archived_at IS NULL AND retired_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active same-department asset required'; END IF;
 END IF;
 INSERT INTO asset_manager.complaints(department_id,asset_id,external_reference,channel,reported_at,narrative,reported_severity,created_by)
 VALUES(p_department,(p_data->>'asset_id')::uuid,p_data->>'external_reference',coalesce(p_data->>'channel','internal'),(p_data->>'reported_at')::timestamptz,p_data->>'narrative',coalesce(p_data->>'reported_severity','unknown'),asset_manager.actor()) RETURNING * INTO row;
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION edit_complaint(p_id uuid,p_expected integer,p_patch jsonb,p_reason text) RETURNS asset_manager.complaints LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.complaints; m asset_manager.complaints;
BEGIN
 PERFORM 1 FROM asset_manager.assets WHERE id=(SELECT asset_id FROM asset_manager.complaints WHERE id=p_id) FOR UPDATE;
 SELECT * INTO row FROM asset_manager.complaints WHERE id=p_id FOR UPDATE;
 IF NOT asset_manager.department_permission(row.department_id,'complaint_manage') THEN
  PERFORM asset_manager.require_permission(row.department_id,'complaint_write');
  IF asset_manager.actor() IS DISTINCT FROM row.created_by AND asset_manager.actor() IS DISTINCT FROM row.assigned_to THEN RAISE EXCEPTION 'Complaint belongs to another responsible officer' USING ERRCODE='42501'; END IF;
 END IF;
 IF row.id IS NULL THEN RAISE EXCEPTION 'Record not found or inaccessible' USING ERRCODE='P0002'; END IF;
 IF row.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 IF row.status='resolved' THEN RAISE EXCEPTION 'Reopen before modifying'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 PERFORM asset_manager.validate_keys(p_patch,ARRAY['asset_id','assigned_to','due_on','reported_severity']);
 SELECT * INTO m FROM jsonb_populate_record(row,p_patch);
 IF row.reported_severity IN ('high','critical') AND m.reported_severity NOT IN ('high','critical') THEN
  IF NOT asset_manager.department_permission(row.department_id,'complaint_manage') THEN
   RAISE EXCEPTION 'Severity downgrade from high/critical requires complaint_manage permission' USING ERRCODE='42501';
  END IF;
 END IF;
 IF m.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_manager.department_memberships dm JOIN asset_manager.identities i ON i.clerk_id=dm.clerk_id
 WHERE dm.department_id=row.department_id AND dm.clerk_id=m.assigned_to AND dm.active AND i.disabled_at IS NULL) THEN RAISE EXCEPTION 'Active departmental assignee required'; END IF;
 IF m.asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_manager.assets WHERE id=m.asset_id AND department_id=row.department_id AND archived_at IS NULL AND retired_at IS NULL) THEN
  RAISE EXCEPTION 'Active same-department asset required';
 END IF;
 UPDATE asset_manager.complaints SET asset_id=m.asset_id,assigned_to=m.assigned_to,due_on=m.due_on,reported_severity=m.reported_severity WHERE id=p_id RETURNING * INTO row;
 RETURN row;
END $$;
CREATE FUNCTION link_complaint_asset(p_complaint_id uuid, p_asset_id uuid, p_reason text)
RETURNS asset_manager.complaints LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE c asset_manager.complaints; a asset_manager.assets;
BEGIN
 PERFORM asset_manager.require_reason(p_reason);
 SELECT * INTO c FROM asset_manager.complaints WHERE id = p_complaint_id FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Complaint not found' USING ERRCODE='P0002'; END IF;
 IF NOT asset_manager.department_permission(c.department_id, 'complaint_manage') THEN
  PERFORM asset_manager.require_permission(c.department_id, 'complaint_write');
  IF asset_manager.actor() IS DISTINCT FROM c.created_by AND asset_manager.actor() IS DISTINCT FROM c.assigned_to THEN
   RAISE EXCEPTION 'Complaint belongs to another responsible officer' USING ERRCODE='42501';
  END IF;
 END IF;
 IF c.status = 'resolved' THEN RAISE EXCEPTION 'Cannot re-link resolved complaint'; END IF;
 SELECT * INTO a FROM asset_manager.assets WHERE id = p_asset_id FOR UPDATE;
 IF a.id IS NULL OR a.department_id <> c.department_id OR a.archived_at IS NOT NULL OR a.retired_at IS NOT NULL THEN
  RAISE EXCEPTION 'Active same-department asset required';
 END IF;
 UPDATE asset_manager.complaints SET asset_id = p_asset_id WHERE id = p_complaint_id RETURNING * INTO c;
 UPDATE asset_manager.evidence SET asset_id = p_asset_id WHERE complaint_id = p_complaint_id AND asset_id IS NULL;
 RETURN c;
END $$;
CREATE FUNCTION transition_complaint(p_id uuid,p_expected integer,p_target text,p_reason text) RETURNS asset_manager.complaints LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.complaints;
BEGIN
 PERFORM 1 FROM asset_manager.assets WHERE id=(SELECT asset_id FROM asset_manager.complaints WHERE id=p_id) FOR UPDATE;
 SELECT * INTO row FROM asset_manager.complaints WHERE id=p_id FOR UPDATE;
 IF NOT asset_manager.department_permission(row.department_id,'complaint_manage') THEN
  PERFORM asset_manager.require_permission(row.department_id,'complaint_write');
  IF asset_manager.actor() IS DISTINCT FROM row.created_by AND asset_manager.actor() IS DISTINCT FROM row.assigned_to THEN RAISE EXCEPTION 'Complaint belongs to another responsible officer' USING ERRCODE='42501'; END IF;
 END IF;
 IF row.id IS NULL THEN RAISE EXCEPTION 'Record not found or inaccessible' USING ERRCODE='P0002'; END IF;
 IF row.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 IF NOT (row.status IN ('open','reopened') AND p_target='triaged' OR row.status='triaged' AND p_target='investigating' OR row.status='investigating' AND p_target='resolved' OR row.status='resolved' AND p_target='reopened') THEN RAISE EXCEPTION 'Invalid complaint transition'; END IF;
 IF p_target='resolved' AND row.reported_severity IN ('high','critical') THEN
  PERFORM asset_manager.require_permission(row.department_id,'complaint_manage');
  IF asset_manager.actor() IN (row.created_by,row.assigned_to) THEN RAISE EXCEPTION 'Independent senior closure required for severe complaint'; END IF;
  IF row.asset_id IS NULL OR NOT (EXISTS(SELECT 1 FROM asset_manager.inspections WHERE asset_id=row.asset_id AND status='approved' AND observed_on >= (row.reported_at AT TIME ZONE 'Asia/Kolkata')::date) OR EXISTS(SELECT 1 FROM asset_manager.work_orders WHERE complaint_id=row.id AND status='accepted')) THEN RAISE EXCEPTION 'Severe complaint requires approved investigation or accepted related work'; END IF;
 END IF;
 IF p_target IN ('triaged','investigating') AND row.assigned_to IS NULL THEN RAISE EXCEPTION 'Assign responsible officer first'; END IF;
 UPDATE asset_manager.complaints SET status=p_target,resolution=CASE WHEN p_target='resolved' THEN p_reason ELSE resolution END,resolved_at=CASE WHEN p_target='resolved' THEN clock_timestamp() ELSE NULL END WHERE id=p_id RETURNING * INTO row;
 RETURN row;
END $$;

CREATE FUNCTION create_work_order(p_asset uuid,p_data jsonb,p_request uuid) RETURNS asset_manager.work_orders LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE a asset_manager.assets; row asset_manager.work_orders; replay jsonb;
BEGIN
 SELECT * INTO a FROM asset_manager.assets WHERE id=p_asset FOR UPDATE;
 PERFORM asset_manager.require_permission(a.department_id,'work_write');
 IF a.registration_status<>'verified' OR a.archived_at IS NOT NULL OR a.retired_at IS NOT NULL THEN RAISE EXCEPTION 'Active verified asset required'; END IF;
 PERFORM asset_manager.validate_keys(p_data,ARRAY['description','justification','inspection_id','complaint_id','assigned_to','target_on']);
 replay:=asset_manager.begin_request(p_request,'create_work',jsonb_build_object('asset',p_asset,'data',p_data));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.work_orders WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
 IF p_data->>'inspection_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_manager.inspections WHERE id=(p_data->>'inspection_id')::uuid AND asset_id=p_asset AND status='approved') THEN RAISE EXCEPTION 'Restoration source must be an approved inspection'; END IF;
 IF p_data->>'assigned_to' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_manager.department_memberships m JOIN asset_manager.identities i ON i.clerk_id=m.clerk_id
 WHERE m.department_id=a.department_id AND m.clerk_id=p_data->>'assigned_to' AND m.active AND i.disabled_at IS NULL) THEN RAISE EXCEPTION 'Active assignee required'; END IF;
 INSERT INTO asset_manager.work_orders(department_id,asset_id,inspection_id,complaint_id,description,justification,assigned_to,target_on,created_by)
 VALUES(a.department_id,a.id,(p_data->>'inspection_id')::uuid,(p_data->>'complaint_id')::uuid,p_data->>'description',p_data->>'justification',p_data->>'assigned_to',(p_data->>'target_on')::date,asset_manager.actor()) RETURNING * INTO row;
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION edit_work_order(p_id uuid,p_expected integer,p_patch jsonb,p_reason text) RETURNS asset_manager.work_orders LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.work_orders; m asset_manager.work_orders;
BEGIN
 PERFORM 1 FROM asset_manager.assets WHERE id=(SELECT asset_id FROM asset_manager.work_orders WHERE id=p_id) FOR UPDATE;
 SELECT * INTO row FROM asset_manager.work_orders WHERE id=p_id FOR UPDATE;
 PERFORM asset_manager.require_permission(row.department_id,'work_write');
 IF row.id IS NULL THEN RAISE EXCEPTION 'Record not found or inaccessible' USING ERRCODE='P0002'; END IF;
 IF row.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 IF row.status NOT IN ('proposed','correction_required') OR row.created_by<>asset_manager.actor() THEN RAISE EXCEPTION 'Only proposer may edit unapproved scope'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 PERFORM asset_manager.validate_keys(p_patch,ARRAY['description','justification','assigned_to','target_on']);
 SELECT * INTO m FROM jsonb_populate_record(row,p_patch);
 IF m.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_manager.department_memberships dm JOIN asset_manager.identities i ON i.clerk_id=dm.clerk_id
 WHERE dm.department_id=row.department_id AND dm.clerk_id=m.assigned_to AND dm.active AND i.disabled_at IS NULL) THEN RAISE EXCEPTION 'Active assignee required'; END IF;
 UPDATE asset_manager.work_orders SET description=m.description,justification=m.justification,assigned_to=m.assigned_to,target_on=m.target_on,decision_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 RETURN row;
END $$;
CREATE FUNCTION create_work_estimate(p_work uuid,p_amount bigint,p_source text,p_basis text,p_date date,p_request uuid)
RETURNS asset_manager.work_estimates LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE w asset_manager.work_orders; row asset_manager.work_estimates; replay jsonb; revision_number integer;
BEGIN
 SELECT * INTO w FROM asset_manager.work_orders WHERE id=p_work FOR UPDATE;
 PERFORM asset_manager.require_permission(w.department_id,'work_write');
 replay:=asset_manager.begin_request(p_request,'create_estimate',jsonb_build_object('work',p_work,'amount',p_amount,'source',p_source,'basis',p_basis,'date',p_date));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.work_estimates WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
 IF w.status NOT IN ('proposed','correction_required') THEN RAISE EXCEPTION 'Estimate revisions require unapproved work scope'; END IF;
 IF p_date>((now() AT TIME ZONE 'Asia/Kolkata')::date) THEN RAISE EXCEPTION 'Future estimate date'; END IF;
 SELECT coalesce(max(revision),0)+1 INTO revision_number FROM asset_manager.work_estimates WHERE work_order_id=p_work;
 INSERT INTO asset_manager.work_estimates(department_id,work_order_id,revision,amount_paise,source_reference,basis,estimated_on,created_by)
 VALUES(w.department_id,w.id,revision_number,p_amount,p_source,p_basis,p_date,asset_manager.actor()) RETURNING * INTO row;
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION review_work_estimate(p_id uuid,p_approve boolean,p_reason text) RETURNS asset_manager.work_estimates LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.work_estimates; max_limit bigint;
BEGIN
 SELECT * INTO row FROM asset_manager.work_estimates WHERE id=p_id FOR UPDATE;
 PERFORM asset_manager.require_permission(row.department_id,'work_approve'); PERFORM asset_manager.require_reason(p_reason);
 IF row.status<>'proposed' OR p_approve IS NULL OR row.created_by=asset_manager.actor() THEN RAISE EXCEPTION 'Independent estimate review required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM asset_manager.work_orders WHERE id=row.work_order_id AND status IN ('proposed','correction_required')) THEN RAISE EXCEPTION 'Work scope already frozen'; END IF;
 IF p_approve THEN
  SELECT rd.max_estimate_paise INTO max_limit
  FROM asset_manager.department_memberships dm
  JOIN asset_manager.role_definitions rd ON rd.authority_id=dm.authority_id AND rd.code=dm.role
  JOIN asset_manager.role_permissions rp ON rp.authority_id=dm.authority_id AND rp.role=dm.role AND rp.permission='work_approve'
  WHERE dm.department_id=row.department_id AND dm.clerk_id=asset_manager.actor() AND dm.active
  ORDER BY rd.max_estimate_paise DESC NULLS FIRST LIMIT 1;
  IF max_limit IS NOT NULL AND row.amount_paise > max_limit THEN
   RAISE EXCEPTION 'Estimate amount (% paise) exceeds approver role maximum limit (% paise)', row.amount_paise, max_limit USING ERRCODE='42501';
  END IF;
 END IF;
 UPDATE asset_manager.work_estimates SET status=CASE WHEN p_approve THEN 'reviewed' ELSE 'rejected' END,reviewed_by=asset_manager.actor(),reviewed_at=clock_timestamp() WHERE id=p_id RETURNING * INTO row;
 RETURN row;
END $$;
CREATE FUNCTION transition_work_order(p_id uuid,p_expected integer,p_action text,p_data jsonb,p_reason text) RETURNS asset_manager.work_orders LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.work_orders; estimate_status text;
BEGIN
 PERFORM 1 FROM asset_manager.assets WHERE id=(SELECT asset_id FROM asset_manager.work_orders WHERE id=p_id) FOR UPDATE;
 SELECT * INTO row FROM asset_manager.work_orders WHERE id=p_id FOR UPDATE;
 PERFORM asset_manager.require_permission(row.department_id,CASE WHEN p_action IN ('approve','return','cancel') THEN 'work_approve' WHEN p_action = 'accept' THEN 'work_accept' ELSE 'work_write' END);
 IF row.id IS NULL THEN RAISE EXCEPTION 'Record not found or inaccessible' USING ERRCODE='P0002'; END IF;
 IF row.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 PERFORM asset_manager.validate_keys(p_data,ARRAY['completed_on','actual_cost_paise','completion_notes']);
 IF p_action='approve' AND row.status IN ('proposed','correction_required') THEN
  PERFORM asset_manager.require_permission(row.department_id,'work_approve');
  IF row.created_by=asset_manager.actor() THEN RAISE EXCEPTION 'Independent senior work approval required'; END IF;
  IF row.assigned_to IS NULL OR row.target_on IS NULL THEN RAISE EXCEPTION 'Assignee and deadline required'; END IF;
  SELECT status INTO estimate_status FROM asset_manager.work_estimates WHERE work_order_id=row.id ORDER BY revision DESC LIMIT 1;
  IF estimate_status IS NOT NULL AND estimate_status<>'reviewed' THEN RAISE EXCEPTION 'Latest estimate requires independent review'; END IF;
  UPDATE asset_manager.work_orders SET status='approved',approved_by=asset_manager.actor(),approved_at=clock_timestamp(),decision_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 ELSIF p_action='start' AND row.status='approved' THEN
  IF row.assigned_to<>asset_manager.actor() THEN RAISE EXCEPTION 'Only assigned executor may start work'; END IF;
  UPDATE asset_manager.work_orders SET status='in_progress',started_on=(now() AT TIME ZONE 'Asia/Kolkata')::date,decision_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 ELSIF p_action='submit_completion' AND row.status='in_progress' THEN
  IF row.assigned_to<>asset_manager.actor() THEN RAISE EXCEPTION 'Only assigned executor may submit completion'; END IF;
  IF NOT EXISTS(SELECT 1 FROM asset_manager.evidence WHERE work_order_id=row.id AND removed_at IS NULL) THEN RAISE EXCEPTION 'Completion evidence required'; END IF;
  IF (p_data->>'completed_on')::date>((now() AT TIME ZONE 'Asia/Kolkata')::date) OR p_data->>'completed_on' IS NULL OR nullif(btrim(p_data->>'completion_notes'),'') IS NULL THEN RAISE EXCEPTION 'Actual completion date and notes required'; END IF;
  UPDATE asset_manager.work_orders SET status='completion_submitted',completed_on=(p_data->>'completed_on')::date,actual_cost_paise=(p_data->>'actual_cost_paise')::bigint,completion_notes=p_data->>'completion_notes',completion_submitted_by=asset_manager.actor(),decision_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 ELSIF p_action='accept' AND row.status='completion_submitted' THEN
  PERFORM asset_manager.require_permission(row.department_id,'work_accept');
  IF asset_manager.actor() IN (row.completion_submitted_by,row.assigned_to,row.approved_by) THEN RAISE EXCEPTION 'Independent completion acceptance required'; END IF;
  UPDATE asset_manager.work_orders SET status='accepted',accepted_by=asset_manager.actor(),accepted_at=clock_timestamp(),decision_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 ELSIF p_action='return' AND row.status IN ('proposed','completion_submitted') THEN
  PERFORM asset_manager.require_permission(row.department_id,'work_approve');
  IF asset_manager.actor() IN (row.created_by,row.completion_submitted_by) THEN RAISE EXCEPTION 'Independent review required'; END IF;
  UPDATE asset_manager.work_orders SET status=CASE WHEN status='proposed' THEN 'correction_required' ELSE 'in_progress' END,decision_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 ELSIF p_action='cancel' AND row.status NOT IN ('accepted','cancelled') THEN
  PERFORM asset_manager.require_permission(row.department_id,'work_approve');
  UPDATE asset_manager.work_orders SET status='cancelled',decision_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 ELSE RAISE EXCEPTION 'Invalid work transition'; END IF;
 -- No mutation of inspection condition: completion is not structural evidence.
 RETURN row;
END $$;

CREATE FUNCTION attach_evidence(p_asset uuid,p_data jsonb,p_request uuid) RETURNS asset_manager.evidence LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE a asset_manager.assets; row asset_manager.evidence; replay jsonb; author text; state text;
BEGIN
 SELECT * INTO a FROM asset_manager.assets WHERE id=p_asset FOR UPDATE;
 PERFORM asset_manager.require_permission(a.department_id,'evidence_write');
 IF a.archived_at IS NOT NULL OR a.retired_at IS NOT NULL THEN RAISE EXCEPTION 'Asset not active'; END IF;
 PERFORM asset_manager.validate_keys(p_data,ARRAY['inspection_id','work_order_id','provider','object_key','original_name','mime_type','size_bytes','caption','sha256','classification']);
 replay:=asset_manager.begin_request(p_request,'attach_evidence',jsonb_build_object('asset',p_asset,'data',p_data));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.evidence WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
 IF p_data->>'inspection_id' IS NOT NULL THEN
  SELECT created_by,status INTO author,state FROM asset_manager.inspections WHERE id=(p_data->>'inspection_id')::uuid AND department_id=a.department_id AND asset_id=p_asset FOR UPDATE;
  IF author IS DISTINCT FROM asset_manager.actor() OR state NOT IN ('draft','correction_required') THEN RAISE EXCEPTION 'Only assessor can attach draft inspection evidence'; END IF;
 ELSIF p_data->>'work_order_id' IS NOT NULL THEN
  SELECT assigned_to,status INTO author,state FROM asset_manager.work_orders WHERE id=(p_data->>'work_order_id')::uuid AND department_id=a.department_id AND asset_id=p_asset;
  IF state IN ('completion_submitted','accepted','cancelled') THEN RAISE EXCEPTION 'Work evidence is frozen'; END IF;
  IF author IS DISTINCT FROM asset_manager.actor() AND NOT asset_manager.department_permission(a.department_id,'work_approve') THEN RAISE EXCEPTION 'Executor evidence permission required'; END IF;
 ELSE
  IF a.registration_status='submitted' THEN RAISE EXCEPTION 'Registration evidence is frozen'; END IF;
 END IF;
 INSERT INTO asset_manager.evidence(department_id,asset_id,inspection_id,work_order_id,complaint_id,provider,object_key,original_name,mime_type,size_bytes,caption,sha256,classification,created_by)
 VALUES(a.department_id,a.id,(p_data->>'inspection_id')::uuid,(p_data->>'work_order_id')::uuid,NULL,p_data->>'provider',p_data->>'object_key',p_data->>'original_name',p_data->>'mime_type',(p_data->>'size_bytes')::bigint,p_data->>'caption',p_data->>'sha256',coalesce(p_data->>'classification','internal'),asset_manager.actor()) RETURNING * INTO row;
 -- Caller MUST verify upload/object ownership and protected delivery before this API.
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION remove_evidence(p_id uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.evidence;
BEGIN
 SELECT * INTO row FROM asset_manager.evidence WHERE id=p_id;
 PERFORM asset_manager.require_permission(row.department_id,'evidence_write');
 PERFORM 1 FROM asset_manager.assets WHERE id=row.asset_id FOR UPDATE;
 PERFORM 1 FROM asset_manager.inspections WHERE id=row.inspection_id FOR UPDATE;
 PERFORM 1 FROM asset_manager.work_orders WHERE id=row.work_order_id FOR UPDATE;
 PERFORM 1 FROM asset_manager.complaints WHERE id=row.complaint_id FOR UPDATE;
 SELECT * INTO row FROM asset_manager.evidence WHERE id=p_id FOR UPDATE;
 PERFORM asset_manager.require_permission(row.department_id,'evidence_write'); PERFORM asset_manager.require_reason(p_reason);
 IF row.created_by<>asset_manager.actor() OR row.removed_at IS NOT NULL THEN RAISE EXCEPTION 'Only uploader may remove unused evidence'; END IF;
 IF EXISTS(SELECT 1 FROM asset_manager.inspections WHERE id=row.inspection_id AND status IN ('submitted','approved'))
 OR EXISTS(SELECT 1 FROM asset_manager.work_orders WHERE id=row.work_order_id AND status IN ('completion_submitted','accepted'))
 OR EXISTS(SELECT 1 FROM asset_manager.complaints WHERE id=row.complaint_id AND status='resolved')
 OR EXISTS(SELECT 1 FROM asset_manager.asset_milestones WHERE evidence_id=row.id)
 OR row.inspection_id IS NULL AND row.work_order_id IS NULL AND EXISTS(SELECT 1 FROM asset_manager.assets WHERE id=row.asset_id AND registration_status IN ('submitted','verified')) THEN RAISE EXCEPTION 'Evidence relied upon must be retained'; END IF;
 UPDATE asset_manager.evidence SET removed_at=clock_timestamp(),removal_reason=p_reason WHERE id=p_id;
END $$;
CREATE FUNCTION record_milestone(p_asset uuid,p_kind text,p_date date,p_description text,p_source text,p_evidence uuid,p_request uuid)
RETURNS asset_manager.asset_milestones LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE a asset_manager.assets; row asset_manager.asset_milestones; replay jsonb;
BEGIN
 SELECT * INTO a FROM asset_manager.assets WHERE id=p_asset FOR UPDATE;
 PERFORM asset_manager.require_permission(a.department_id,'milestone_write');
 IF a.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Asset archived'; END IF;
 IF p_date>((now() AT TIME ZONE 'Asia/Kolkata')::date) THEN RAISE EXCEPTION 'Historical milestones cannot be future dated'; END IF;
 replay:=asset_manager.begin_request(p_request,'milestone',jsonb_build_object('asset',p_asset,'kind',p_kind,'date',p_date,'description',p_description,'source',p_source,'evidence',p_evidence));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.asset_milestones WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
 INSERT INTO asset_manager.asset_milestones(department_id,asset_id,kind,occurred_on,description,source_reference,evidence_id,created_by)
 VALUES(a.department_id,a.id,p_kind,p_date,p_description,p_source,p_evidence,asset_manager.actor()) RETURNING * INTO row;
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;

CREATE FUNCTION create_invitation(p_department uuid,p_email text,p_role text,p_expires timestamptz,p_request uuid)
RETURNS asset_manager.invitations LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE a uuid; row asset_manager.invitations; replay jsonb;
BEGIN
 SELECT authority_id INTO a FROM asset_manager.departments WHERE id=p_department AND active;
 IF NOT asset_manager.authority_admin(a) AND NOT asset_manager.department_permission(p_department,'member_manage') THEN RAISE EXCEPTION 'Invitation denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM asset_manager.role_definitions WHERE authority_id=a AND code=p_role AND scope='department' AND active) THEN RAISE EXCEPTION 'Active departmental role required'; END IF;
 IF lower(btrim(p_email))=(SELECT lower(email) FROM asset_manager.identities WHERE clerk_id=asset_manager.actor()) THEN
  RAISE EXCEPTION 'Cannot invite yourself';
 END IF;
 UPDATE asset_manager.invitations SET status='expired' WHERE status IN ('pending','sent') AND expires_at<=now();
 IF p_expires<=now() OR p_expires>now()+interval '30 days' THEN RAISE EXCEPTION 'Invitation expiry must be in future and within 30 days'; END IF;
 IF EXISTS(SELECT 1 FROM asset_manager.role_permissions WHERE authority_id=a AND role=p_role AND permission IN ('member_manage','complaint_manage','template_write','template_approve','inspection_approve','work_approve','work_accept','lifecycle_approve','asset_verify','asset_archive')) THEN
  IF current_setting('pravi.governance_exec', true) IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'Privileged role invitation requires governance approval';
  END IF;
 END IF;
 replay:=asset_manager.begin_request(p_request,'invitation',jsonb_build_object('department',p_department,'email',lower(btrim(p_email)),'role',p_role,'expires',p_expires));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.invitations WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
 INSERT INTO asset_manager.invitations(department_id,email,role,expires_at,invited_by) VALUES(p_department,lower(btrim(p_email)),p_role,p_expires,asset_manager.actor()) RETURNING * INTO row;
 INSERT INTO asset_manager.integration_outbox(department_id,invitation_id,event_type) VALUES(p_department,row.id,'clerk_invitation');
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION revoke_invitation(p_id uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.invitations; a uuid;
BEGIN
 SELECT * INTO row FROM asset_manager.invitations WHERE id=p_id FOR UPDATE;
 SELECT authority_id INTO a FROM asset_manager.departments WHERE id=row.department_id;
 IF NOT asset_manager.authority_admin(a) AND row.invited_by IS DISTINCT FROM asset_manager.require_actor() THEN RAISE EXCEPTION 'Invitation not accessible'; END IF;
 IF row.status NOT IN ('pending','sent') THEN RAISE EXCEPTION 'Invitation already closed'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 UPDATE asset_manager.invitations SET status='revoked' WHERE id=p_id;
 UPDATE asset_manager.integration_outbox SET status='cancelled' WHERE invitation_id=p_id;
END $$;
-- Worker must verify Clerk invitation events, signed webhook, email binding.
CREATE FUNCTION invitation_delivered(p_id uuid,p_clerk_invitation text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 IF nullif(btrim(p_clerk_invitation),'') IS NULL THEN RAISE EXCEPTION 'Clerk invitation identifier required'; END IF;
 UPDATE asset_manager.invitations SET status='sent',clerk_invitation_id=p_clerk_invitation WHERE id=p_id AND status IN ('pending','sent');
 UPDATE asset_manager.integration_outbox SET status='delivered',attempts=least(attempts+1,10),delivered_at=clock_timestamp() WHERE invitation_id=p_id AND status<>'cancelled';
END $$;
CREATE FUNCTION record_outbox_failure(p_event_id uuid,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 PERFORM asset_manager.require_reason(p_error);
 UPDATE asset_manager.integration_outbox
 SET status=CASE WHEN attempts+1>=10 THEN 'failed' ELSE 'pending' END,
     attempts=attempts+1,
     last_error_code=p_error
 WHERE id=p_event_id AND status<>'cancelled';
END $$;
CREATE FUNCTION accept_invitation(p_id uuid,p_clerk_invitation text,p_clerk_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.invitations; a uuid; invited_user asset_manager.identities; inviter_authorised boolean;
BEGIN
 SELECT * INTO row FROM asset_manager.invitations WHERE id=p_id FOR UPDATE;
 SELECT * INTO invited_user FROM asset_manager.identities WHERE clerk_id=p_clerk_id AND disabled_at IS NULL AND email_verified;
 IF row.status='accepted' AND row.accepted_by=p_clerk_id AND row.clerk_invitation_id=p_clerk_invitation AND invited_user.email=row.email THEN RETURN; END IF;
 IF row.id IS NULL OR row.status<>'sent' OR row.expires_at<=now() OR row.clerk_invitation_id IS DISTINCT FROM p_clerk_invitation OR invited_user.clerk_id IS NULL OR invited_user.email<>row.email THEN RAISE EXCEPTION 'Invalid invitation acceptance'; END IF;
 SELECT authority_id INTO a FROM asset_manager.departments WHERE id=row.department_id AND active;
 IF a IS NULL OR NOT EXISTS(SELECT 1 FROM asset_manager.authorities WHERE id=a AND active) THEN RAISE EXCEPTION 'Invitation scope inactive'; END IF;
 PERFORM asset_manager.internal_assert_actor(row.invited_by);
 inviter_authorised:=asset_manager.authority_admin(a) OR asset_manager.department_permission(row.department_id,'member_manage');
 IF NOT inviter_authorised THEN RAISE EXCEPTION 'Inviter no longer authorised'; END IF;
 IF NOT asset_manager.authority_admin(a) AND EXISTS(SELECT 1 FROM asset_manager.role_permissions WHERE authority_id=a AND role=row.role AND permission IN ('member_manage','complaint_manage','template_write','template_approve','inspection_approve','work_approve','lifecycle_approve','asset_verify','asset_archive')) THEN RAISE EXCEPTION 'Inviter cannot delegate current role permissions'; END IF;
 IF NOT EXISTS(SELECT 1 FROM asset_manager.role_definitions WHERE authority_id=a AND code=row.role AND scope='department' AND active) THEN RAISE EXCEPTION 'Invitation role retired'; END IF;
 IF EXISTS(SELECT 1 FROM asset_manager.department_memberships WHERE department_id=row.department_id AND clerk_id=p_clerk_id AND active) THEN
  RAISE EXCEPTION 'Active membership already exists; explicit role change required';
 END IF;
 PERFORM asset_manager.internal_assert_actor(p_clerk_id);
 INSERT INTO asset_manager.department_memberships(authority_id,department_id,clerk_id,role,granted_by,active)
 VALUES(a,row.department_id,p_clerk_id,row.role,row.invited_by,true)
 ON CONFLICT (department_id,clerk_id) DO UPDATE
 SET role=EXCLUDED.role,granted_by=EXCLUDED.granted_by,active=true,updated_at=clock_timestamp();
 UPDATE asset_manager.invitations SET status='accepted',accepted_by=p_clerk_id,accepted_at=clock_timestamp() WHERE id=p_id;
END $$;
CREATE FUNCTION request_access(p_department uuid,p_reason text,p_request uuid) RETURNS asset_manager.access_requests LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.access_requests; replay jsonb;
BEGIN
 PERFORM asset_manager.require_actor();
 IF NOT EXISTS(SELECT 1 FROM asset_manager.departments d JOIN asset_manager.authorities a ON a.id=d.authority_id WHERE d.id=p_department AND d.active AND a.active) THEN RAISE EXCEPTION 'Department unavailable'; END IF;
 replay:=asset_manager.begin_request(p_request,'access_request',jsonb_build_object('department',p_department,'reason',p_reason));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.access_requests WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
 INSERT INTO asset_manager.access_requests(department_id,clerk_id,reason) VALUES(p_department,asset_manager.actor(),p_reason) RETURNING * INTO row;
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION decide_access(p_id uuid,p_role text,p_approve boolean,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE r asset_manager.access_requests; a uuid;
BEGIN
 SELECT * INTO r FROM asset_manager.access_requests WHERE id=p_id FOR UPDATE;
 SELECT authority_id INTO a FROM asset_manager.departments WHERE id=r.department_id;
 IF NOT asset_manager.authority_admin(a) THEN RAISE EXCEPTION 'Authority administration required'; END IF;
 IF r.status<>'pending' OR p_approve IS NULL OR r.clerk_id=asset_manager.actor() THEN RAISE EXCEPTION 'Independent pending request required'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 IF p_approve THEN PERFORM asset_manager.set_department_member(r.department_id,r.clerk_id,p_role,true,p_reason); END IF;
 UPDATE asset_manager.access_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,decision_reason=p_reason,decided_by=asset_manager.actor(),decided_at=clock_timestamp() WHERE id=p_id;
END $$;

-- Additional integrity protections follow.

-- Scope-consistent dynamic roles, including durable pending invitations.
ALTER TABLE invitations ADD COLUMN authority_id uuid NOT NULL;
ALTER TABLE invitations ADD CONSTRAINT invitation_scope_fk FOREIGN KEY(authority_id,department_id) REFERENCES departments(authority_id,id) ON DELETE RESTRICT;
ALTER TABLE invitations ADD CONSTRAINT invitation_role_fk FOREIGN KEY(authority_id,role) REFERENCES role_definitions(authority_id,code) ON DELETE RESTRICT;
CREATE FUNCTION enforce_membership_role_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE expected text;
BEGIN
 expected:=CASE WHEN TG_TABLE_NAME='authority_memberships' THEN 'authority' ELSE 'department' END;
 IF TG_TABLE_NAME='invitations' THEN SELECT authority_id INTO NEW.authority_id FROM asset_manager.departments WHERE id=NEW.department_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM asset_manager.role_definitions WHERE authority_id=NEW.authority_id AND code=NEW.role AND scope=expected AND active) THEN RAISE EXCEPTION 'Active role with matching membership scope required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER role_scope BEFORE INSERT OR UPDATE ON authority_memberships FOR EACH ROW EXECUTE FUNCTION enforce_membership_role_scope();
CREATE TRIGGER role_scope BEFORE INSERT OR UPDATE ON department_memberships FOR EACH ROW EXECUTE FUNCTION enforce_membership_role_scope();
CREATE TRIGGER role_scope BEFORE INSERT OR UPDATE ON invitations FOR EACH ROW EXECUTE FUNCTION enforce_membership_role_scope();
CREATE FUNCTION enforce_complaint_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE c asset_manager.complaints;
BEGIN
 IF NEW.complaint_id IS NOT NULL THEN
  SELECT * INTO c FROM asset_manager.complaints WHERE id=NEW.complaint_id AND department_id=NEW.department_id;
  IF c.id IS NULL OR (NEW.asset_id IS NOT NULL AND NEW.asset_id IS DISTINCT FROM c.asset_id) THEN RAISE EXCEPTION 'Evidence complaint/asset scope mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER complaint_evidence_scope BEFORE INSERT OR UPDATE ON evidence FOR EACH ROW EXECUTE FUNCTION enforce_complaint_evidence();
CREATE FUNCTION attach_complaint_evidence(p_complaint uuid,p_data jsonb,p_request uuid) RETURNS asset_manager.evidence LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE c asset_manager.complaints; e asset_manager.evidence; replay jsonb;
BEGIN
 PERFORM 1 FROM asset_manager.assets WHERE id=(SELECT asset_id FROM asset_manager.complaints WHERE id=p_complaint) FOR UPDATE;
 SELECT * INTO c FROM asset_manager.complaints WHERE id=p_complaint FOR UPDATE;
 PERFORM asset_manager.require_permission(c.department_id,'evidence_write');
 IF c.status='resolved' OR (asset_manager.actor() IS DISTINCT FROM c.created_by AND asset_manager.actor() IS DISTINCT FROM c.assigned_to AND NOT asset_manager.department_permission(c.department_id,'complaint_manage')) THEN RAISE EXCEPTION 'Complaint evidence access denied'; END IF;
 PERFORM asset_manager.validate_keys(p_data,ARRAY['provider','object_key','original_name','mime_type','size_bytes','caption','sha256','classification']);
 replay:=asset_manager.begin_request(p_request,'complaint_evidence',jsonb_build_object('complaint',p_complaint,'data',p_data));
 IF replay IS NOT NULL THEN SELECT * INTO e FROM asset_manager.evidence WHERE id=(replay->>'id')::uuid; RETURN e; END IF;
 INSERT INTO asset_manager.evidence(department_id,asset_id,complaint_id,provider,object_key,original_name,mime_type,size_bytes,caption,sha256,classification,created_by)
 VALUES(c.department_id,c.asset_id,c.id,p_data->>'provider',p_data->>'object_key',p_data->>'original_name',p_data->>'mime_type',(p_data->>'size_bytes')::bigint,p_data->>'caption',p_data->>'sha256',coalesce(p_data->>'classification','internal'),asset_manager.actor()) RETURNING * INTO e;
 PERFORM asset_manager.finish_request(p_request,to_jsonb(e)); RETURN e;
END $$;
CREATE TABLE evidence_access_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 department_id uuid NOT NULL,
 evidence_id uuid NOT NULL,
 actor_id text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
 purpose text NOT NULL CHECK(length(btrim(purpose)) BETWEEN 1 AND 500),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(department_id,evidence_id) REFERENCES evidence(department_id,id) ON DELETE RESTRICT
);
CREATE INDEX evidence_access_history_idx ON evidence_access_events(department_id,evidence_id,requested_at DESC);
-- Protected delivery routes must call this before generating a signed URL.
-- This records a delivery request, not proof that a viewer downloaded the file.
CREATE FUNCTION request_evidence_access(p_evidence uuid,p_purpose text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE e asset_manager.evidence;
BEGIN
 SELECT * INTO e FROM asset_manager.evidence WHERE id=p_evidence AND removed_at IS NULL;
 IF NOT asset_manager.department_read(e.department_id) OR (e.classification='restricted' AND e.created_by IS DISTINCT FROM asset_manager.actor() AND NOT(asset_manager.department_permission(e.department_id,'inspection_approve') OR asset_manager.department_permission(e.department_id,'work_approve') OR asset_manager.department_permission(e.department_id,'asset_verify'))) THEN RAISE EXCEPTION 'Evidence access denied' USING ERRCODE='42501'; END IF;
 IF e.id IS NULL OR p_purpose IS NULL OR length(btrim(p_purpose)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Evidence and purpose required'; END IF;
 INSERT INTO asset_manager.evidence_access_events(department_id,evidence_id,actor_id,purpose) VALUES(e.department_id,e.id,asset_manager.require_actor(),p_purpose);
 RETURN jsonb_build_object('id',e.id,'provider',e.provider,'object_key',e.object_key);
END $$;
-- Owner-only bounded retention of retry receipts: after 30 days the request key
-- is reusable. Never invoke during an outstanding retry window.
CREATE FUNCTION prune_command_receipts(p_before timestamptz) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE affected bigint;
BEGIN
 IF p_before IS NULL OR p_before>clock_timestamp()-interval '30 days' THEN RAISE EXCEPTION 'Retain at least 30 days of retry receipts'; END IF;
 DELETE FROM asset_manager.command_receipts WHERE created_at<p_before; GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected;
END $$;

-- Additive review fixes. Insert inside schema.sql's installer transaction,
-- before its final row-policy and explicit privilege section.
ALTER TABLE assets ADD COLUMN measure_value numeric(18,4) CHECK(measure_value > 0);
ALTER TABLE assets ADD COLUMN measure_unit text CHECK(measure_unit IN ('km','m','m2','ha','count'));
ALTER TABLE assets ADD CONSTRAINT asset_measure_pair CHECK((measure_value IS NULL)=(measure_unit IS NULL));
ALTER TABLE assets ADD COLUMN responsible_officer text REFERENCES identities(clerk_id) ON DELETE RESTRICT;
ALTER TABLE assets ADD COLUMN parent_asset_id uuid;
ALTER TABLE assets ADD CONSTRAINT asset_parent_fk FOREIGN KEY(department_id,parent_asset_id) REFERENCES assets(department_id,id) ON DELETE RESTRICT;
ALTER TABLE assets ADD CONSTRAINT asset_parent_not_self CHECK(parent_asset_id IS DISTINCT FROM id);
CREATE INDEX assets_parent_idx ON assets(department_id,parent_asset_id) WHERE parent_asset_id IS NOT NULL;
CREATE INDEX assets_officer_idx ON assets(department_id,responsible_officer) WHERE archived_at IS NULL;
CREATE INDEX assets_authority_region_history_idx ON assets(authority_id,region_id,department_id,id);
CREATE INDEX complaints_asset_history_idx ON complaints(department_id,asset_id,reported_at DESC,id);
CREATE INDEX works_asset_history_idx ON work_orders(department_id,asset_id,created_at DESC,id);
CREATE VIEW regional_measure_totals WITH(security_invoker=true) AS
 SELECT a.authority_id,a.department_id,a.region_id,t.base_category,a.measure_unit,
 (a.parent_asset_id IS NOT NULL) AS is_child,
 count(*) AS measured_assets,sum(a.measure_value) AS recorded_quantity
 FROM assets a JOIN department_templates t ON t.department_id=a.department_id AND t.code=a.template_code AND t.version=a.template_version
 WHERE a.registration_status='verified' AND a.archived_at IS NULL AND a.retired_at IS NULL AND a.measure_value IS NOT NULL
 GROUP BY a.authority_id,a.department_id,a.region_id,t.base_category,a.measure_unit,(a.parent_asset_id IS NOT NULL);
-- Parent and child quantities are intentionally separate. This is an inventory
-- measure, not unique geographic coverage; overlapping segments need domain QA.

CREATE FUNCTION set_asset_management(p_id uuid,p_expected integer,p_patch jsonb,p_reason text)
RETURNS asset_manager.assets LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE a asset_manager.assets; merged asset_manager.assets;
BEGIN
 SELECT * INTO a FROM asset_manager.assets WHERE id=p_id;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Asset not found' USING ERRCODE='P0002'; END IF;
 PERFORM asset_manager.require_permission(a.department_id,'asset_write');
 -- Serialize all hierarchy edits in a department so concurrent changes cannot
 -- each pass their cycle check against the old hierarchy.
 PERFORM 1 FROM asset_manager.departments WHERE id=a.department_id FOR UPDATE;
 SELECT * INTO a FROM asset_manager.assets WHERE id=p_id FOR UPDATE;
 IF a.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 IF a.archived_at IS NOT NULL OR a.registration_status='submitted' THEN RAISE EXCEPTION 'Asset unavailable for management edit'; END IF;
 IF a.registration_status='verified' AND (merged.measure_value IS DISTINCT FROM a.measure_value OR merged.measure_unit IS DISTINCT FROM a.measure_unit OR merged.parent_asset_id IS DISTINCT FROM a.parent_asset_id) THEN
  PERFORM asset_manager.require_permission(a.department_id,'asset_verify');
 END IF;
 PERFORM asset_manager.require_reason(p_reason);
 PERFORM asset_manager.validate_keys(p_patch,ARRAY['measure_value','measure_unit','responsible_officer','parent_asset_id']);
 SELECT * INTO merged FROM jsonb_populate_record(a,p_patch);
 IF merged.responsible_officer IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM asset_manager.department_memberships m JOIN asset_manager.identities i ON i.clerk_id=m.clerk_id
 JOIN asset_manager.role_definitions r ON r.authority_id=m.authority_id AND r.code=m.role
 WHERE m.department_id=a.department_id AND m.clerk_id=merged.responsible_officer AND m.active AND r.active AND i.email_verified AND i.disabled_at IS NULL)
 THEN RAISE EXCEPTION 'Responsible officer requires active department membership'; END IF;
 IF merged.parent_asset_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM asset_manager.assets WHERE id=merged.parent_asset_id AND department_id=a.department_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Active same-department parent required'; END IF;
  IF EXISTS(WITH RECURSIVE ancestors AS (
   SELECT id,parent_asset_id FROM asset_manager.assets WHERE id=merged.parent_asset_id AND department_id=a.department_id
   UNION SELECT x.id,x.parent_asset_id FROM asset_manager.assets x JOIN ancestors y ON x.id=y.parent_asset_id WHERE x.department_id=a.department_id
  ) SELECT 1 FROM ancestors WHERE id=a.id) THEN RAISE EXCEPTION 'Asset hierarchy cycle'; END IF;
 END IF;
 UPDATE asset_manager.assets SET measure_value=merged.measure_value,measure_unit=merged.measure_unit,
 responsible_officer=merged.responsible_officer,parent_asset_id=merged.parent_asset_id,change_reason=p_reason,
 registration_status=CASE WHEN a.registration_status='verified' AND (merged.measure_value IS DISTINCT FROM a.measure_value OR merged.measure_unit IS DISTINCT FROM a.measure_unit OR merged.parent_asset_id IS DISTINCT FROM a.parent_asset_id) THEN 'submitted' ELSE a.registration_status END,
 submitted_by=CASE WHEN a.registration_status='verified' AND (merged.measure_value IS DISTINCT FROM a.measure_value OR merged.measure_unit IS DISTINCT FROM a.measure_unit OR merged.parent_asset_id IS DISTINCT FROM a.parent_asset_id) THEN asset_manager.actor() ELSE a.submitted_by END,
 verified_by=CASE WHEN a.registration_status='verified' AND (merged.measure_value IS DISTINCT FROM a.measure_value OR merged.measure_unit IS DISTINCT FROM a.measure_unit OR merged.parent_asset_id IS DISTINCT FROM a.parent_asset_id) THEN NULL ELSE a.verified_by END,
 verified_at=CASE WHEN a.registration_status='verified' AND (merged.measure_value IS DISTINCT FROM a.measure_value OR merged.measure_unit IS DISTINCT FROM a.measure_unit OR merged.parent_asset_id IS DISTINCT FROM a.parent_asset_id) THEN NULL ELSE a.verified_at END
 WHERE id=p_id RETURNING * INTO a; RETURN a;
END $$;

CREATE TABLE central_read_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 authority_id uuid NOT NULL REFERENCES authorities(id) ON DELETE RESTRICT,
 department_id uuid,
 clerk_id text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
 active boolean NOT NULL DEFAULT true,
 granted_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(authority_id,department_id) REFERENCES departments(authority_id,id) ON DELETE RESTRICT,
 UNIQUE NULLS NOT DISTINCT(authority_id,department_id,clerk_id)
);
CREATE INDEX central_read_actor_idx ON central_read_grants(clerk_id,authority_id,department_id) WHERE active;
CREATE TABLE central_read_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 authority_id uuid NOT NULL REFERENCES authorities(id) ON DELETE RESTRICT,
 department_id uuid,
 clerk_id text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
 grant_active boolean NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
 decided_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
 decision_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 FOREIGN KEY(authority_id,department_id) REFERENCES departments(authority_id,id) ON DELETE RESTRICT,
 CHECK(status='pending' OR (decided_by IS NOT NULL AND decided_by<>requested_by AND decided_by<>clerk_id AND decided_at IS NOT NULL AND coalesce(length(btrim(decision_reason)),0)>0))
);
CREATE UNIQUE INDEX central_read_pending_target_idx ON central_read_requests(authority_id,department_id,clerk_id) NULLS NOT DISTINCT WHERE status='pending';
CREATE FUNCTION request_central_read(p_authority uuid,p_department uuid,p_clerk text,p_active boolean,p_reason text,p_request uuid)
RETURNS asset_manager.central_read_requests LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.central_read_requests; replay jsonb;
BEGIN
 IF NOT asset_manager.authority_admin(p_authority) THEN RAISE EXCEPTION 'Authority administration required' USING ERRCODE='42501'; END IF;
 IF p_active IS NULL THEN RAISE EXCEPTION 'Explicit grant/revoke required'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 replay:=asset_manager.begin_request(p_request,'central_read_request',jsonb_build_object('authority',p_authority,'department',p_department,'clerk',p_clerk,'active',p_active,'reason',p_reason));
 IF replay IS NOT NULL THEN SELECT * INTO row FROM asset_manager.central_read_requests WHERE id=(replay->>'id')::uuid; RETURN row; END IF;
 INSERT INTO asset_manager.central_read_requests(authority_id,department_id,clerk_id,grant_active,reason,requested_by)
 VALUES(p_authority,p_department,p_clerk,p_active,p_reason,asset_manager.actor()) RETURNING * INTO row;
 PERFORM asset_manager.finish_request(p_request,to_jsonb(row)); RETURN row;
END $$;
CREATE FUNCTION decide_central_read(p_id uuid,p_approve boolean,p_reason text)
RETURNS asset_manager.central_read_requests LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.central_read_requests;
BEGIN
 SELECT * INTO row FROM asset_manager.central_read_requests WHERE id=p_id FOR UPDATE;
 IF row.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='P0002'; END IF;
 IF NOT asset_manager.governance_permission(row.authority_id,'governance_approve') THEN RAISE EXCEPTION 'Governance approval required' USING ERRCODE='42501'; END IF;
 IF p_approve IS NULL OR row.status<>'pending' OR asset_manager.actor() IN (row.requested_by,row.clerk_id) OR row.created_at<now()-interval '7 days' THEN RAISE EXCEPTION 'Current independent pending request required'; END IF;
 PERFORM 1 FROM asset_manager.authorities WHERE id=row.authority_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM asset_manager.authority_memberships m JOIN asset_manager.identities i ON i.clerk_id=m.clerk_id
 JOIN asset_manager.role_definitions r ON r.authority_id=m.authority_id AND r.code=m.role
 JOIN asset_manager.role_permissions p ON p.authority_id=r.authority_id AND p.role=r.code
 WHERE m.authority_id=row.authority_id AND m.clerk_id=row.requested_by AND m.active AND r.active AND i.email_verified AND i.disabled_at IS NULL AND p.permission='authority_admin')
 THEN RAISE EXCEPTION 'Requester no longer authorised'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 IF p_approve THEN
  IF row.grant_active AND (NOT EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=row.clerk_id AND email_verified AND disabled_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM asset_manager.authority_memberships m JOIN asset_manager.role_definitions r ON r.authority_id=m.authority_id AND r.code=m.role
   JOIN asset_manager.role_permissions p ON p.authority_id=r.authority_id AND p.role=r.code
   WHERE m.authority_id=row.authority_id AND m.clerk_id=row.clerk_id AND m.active AND r.active AND p.permission='authority_read')) THEN RAISE EXCEPTION 'Active verified central reader required'; END IF;
  INSERT INTO asset_manager.central_read_grants(authority_id,department_id,clerk_id,active,granted_by)
  VALUES(row.authority_id,row.department_id,row.clerk_id,row.grant_active,asset_manager.actor())
  ON CONFLICT(authority_id,department_id,clerk_id) DO UPDATE SET active=excluded.active,granted_by=excluded.granted_by;
 END IF;
 UPDATE asset_manager.central_read_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,decided_by=asset_manager.actor(),decision_reason=p_reason,decided_at=clock_timestamp() WHERE id=p_id RETURNING * INTO row;
 RETURN row;
END $$;
CREATE OR REPLACE FUNCTION department_read(p_department uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
 SELECT asset_manager.actor_active() AND EXISTS(
 SELECT 1 FROM asset_manager.departments d JOIN asset_manager.authorities a ON a.id=d.authority_id
 WHERE d.id=p_department AND a.active AND (
 asset_manager.department_permission(d.id,'read') OR
 ((asset_manager.authority_admin(d.authority_id) OR asset_manager.authority_read(d.authority_id)) AND EXISTS(
   SELECT 1 FROM asset_manager.central_read_grants g
   WHERE g.authority_id=d.authority_id AND g.clerk_id=asset_manager.actor() AND g.active AND (g.department_id IS NULL OR g.department_id=d.id)))))
$$;

ALTER TABLE work_orders ADD COLUMN verification_inspection_id uuid;
ALTER TABLE work_orders ADD CONSTRAINT work_verification_same_asset_fk FOREIGN KEY(department_id,asset_id,verification_inspection_id)
 REFERENCES inspections(department_id,asset_id,id) ON DELETE RESTRICT;
CREATE FUNCTION link_work_verification(p_work uuid,p_expected integer,p_inspection uuid,p_reason text)
RETURNS asset_manager.work_orders LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE w asset_manager.work_orders; i asset_manager.inspections;
BEGIN
 PERFORM 1 FROM asset_manager.assets WHERE id=(SELECT asset_id FROM asset_manager.work_orders WHERE id=p_work) FOR UPDATE;
 SELECT * INTO w FROM asset_manager.work_orders WHERE id=p_work FOR UPDATE;
 IF w.id IS NULL THEN RAISE EXCEPTION 'Work not found' USING ERRCODE='P0002'; END IF;
 PERFORM asset_manager.require_permission(w.department_id,'work_approve');
 IF w.version IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 IF w.status<>'accepted' OR w.verification_inspection_id IS NOT NULL THEN RAISE EXCEPTION 'Accepted work without verification link required'; END IF;
 SELECT * INTO i FROM asset_manager.inspections WHERE id=p_inspection AND department_id=w.department_id AND asset_id=w.asset_id FOR SHARE;
 IF i.id IS NULL OR i.status<>'approved' OR i.observed_on<w.completed_on OR i.created_at<w.accepted_at
 OR EXISTS(SELECT 1 FROM asset_manager.inspections WHERE supersedes_id=i.id AND status='approved') THEN RAISE EXCEPTION 'Current approved post-acceptance reinspection required'; END IF;
 IF i.created_by=w.assigned_to OR i.reviewed_by=w.assigned_to THEN RAISE EXCEPTION 'Reinspection must be independent of work executor'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 UPDATE asset_manager.work_orders SET verification_inspection_id=p_inspection,decision_reason=p_reason WHERE id=p_work RETURNING * INTO w;
 RETURN w;
END $$;

CREATE TABLE inspection_components (
 department_id uuid NOT NULL,
 asset_id uuid NOT NULL,
 inspection_id uuid NOT NULL,
 component_key text NOT NULL,
 condition text NOT NULL CHECK(condition IN ('good','fair','poor','critical','not_assessed')),
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(department_id,inspection_id,component_key),
 FOREIGN KEY(department_id,asset_id,inspection_id) REFERENCES inspections(department_id,asset_id,id) ON DELETE RESTRICT
);
CREATE INDEX inspection_components_condition_idx ON inspection_components(department_id,component_key,condition,asset_id);
CREATE FUNCTION project_inspection_components() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='approved' AND NEW.observations IS DISTINCT FROM OLD.observations THEN RAISE EXCEPTION 'Approved observations are immutable'; END IF;
 DELETE FROM asset_manager.inspection_components WHERE inspection_id=NEW.id AND department_id=NEW.department_id;
 INSERT INTO asset_manager.inspection_components(department_id,asset_id,inspection_id,component_key,condition,notes)
 SELECT NEW.department_id,NEW.asset_id,NEW.id,key,value->>'condition',value->>'notes' FROM jsonb_each(NEW.observations);
 RETURN NEW;
END $$;
CREATE TRIGGER project_components AFTER INSERT OR UPDATE OF observations ON inspections FOR EACH ROW EXECUTE FUNCTION project_inspection_components();
CREATE VIEW effective_inspection_components WITH(security_invoker=true) AS
 SELECT c.*,i.observed_on,i.next_review_on,i.template_code,i.template_version
 FROM inspection_components c JOIN inspections i ON i.department_id=c.department_id AND i.id=c.inspection_id
 WHERE i.status='approved' AND NOT EXISTS(SELECT 1 FROM inspections replacement WHERE replacement.supersedes_id=i.id AND replacement.status='approved');

ALTER TABLE regions ADD COLUMN lgd_code text CHECK(lgd_code ~ '^[0-9]{1,12}$');
CREATE UNIQUE INDEX regions_lgd_idx ON regions(authority_id,level,lgd_code) WHERE lgd_code IS NOT NULL;
CREATE FUNCTION validate_region_hierarchy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE parent_level text;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.authority_id,NEW.parent_id,NEW.level) IS DISTINCT FROM (OLD.authority_id,OLD.parent_id,OLD.level) THEN RAISE EXCEPTION 'Region hierarchy identity is immutable'; END IF;
 IF NEW.parent_id IS NULL THEN
  IF NEW.level <> 'state' THEN RAISE EXCEPTION 'Root region must have state level'; END IF;
 ELSE
  SELECT level INTO parent_level FROM asset_manager.regions WHERE authority_id=NEW.authority_id AND id=NEW.parent_id;
  IF parent_level IS NULL OR NOT (
  (NEW.level='district' AND parent_level='state') OR
  (NEW.level IN ('block','city') AND parent_level='district') OR
  (NEW.level='ward' AND parent_level='city') OR
  (NEW.level='village' AND parent_level IN ('block','district')))
  THEN RAISE EXCEPTION 'Invalid region parent level'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER region_hierarchy_guard BEFORE INSERT OR UPDATE ON regions FOR EACH ROW EXECUTE FUNCTION validate_region_hierarchy();

CREATE TABLE region_closure (
 authority_id uuid NOT NULL REFERENCES authorities(id) ON DELETE CASCADE,
 ancestor_id uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
 descendant_id uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
 depth integer NOT NULL CHECK(depth >= 0),
 PRIMARY KEY(authority_id, ancestor_id, descendant_id)
);
CREATE INDEX idx_region_closure_descendant ON region_closure(authority_id, descendant_id, depth);
CREATE INDEX idx_region_closure_ancestor ON region_closure(authority_id, ancestor_id, depth);

CREATE FUNCTION maintain_region_closure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  INSERT INTO asset_manager.region_closure(authority_id, ancestor_id, descendant_id, depth)
  VALUES(NEW.authority_id, NEW.id, NEW.id, 0);

  IF NEW.parent_id IS NOT NULL THEN
   INSERT INTO asset_manager.region_closure(authority_id, ancestor_id, descendant_id, depth)
   SELECT NEW.authority_id, rc.ancestor_id, NEW.id, rc.depth + 1
   FROM asset_manager.region_closure rc
   WHERE rc.authority_id = NEW.authority_id AND rc.descendant_id = NEW.parent_id;
  END IF;
 ELSIF TG_OP = 'DELETE' THEN
  DELETE FROM asset_manager.region_closure
  WHERE authority_id = OLD.authority_id AND (ancestor_id = OLD.id OR descendant_id = OLD.id);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER region_closure_trg
AFTER INSERT OR DELETE ON regions
FOR EACH ROW EXECUTE FUNCTION maintain_region_closure();

CREATE OR REPLACE VIEW region_descendants WITH(security_invoker=true) AS
 SELECT authority_id, ancestor_id, descendant_id, depth FROM asset_manager.region_closure;

CREATE FUNCTION set_region_lgd(p_region uuid,p_code text,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE a uuid;
BEGIN
 SELECT authority_id INTO a FROM asset_manager.regions WHERE id=p_region FOR UPDATE;
 IF a IS NULL THEN RAISE EXCEPTION 'Region not found' USING ERRCODE='P0002'; END IF;
 IF NOT asset_manager.authority_admin(a) THEN RAISE EXCEPTION 'Authority administration required' USING ERRCODE='42501'; END IF;
 PERFORM asset_manager.require_reason(p_reason);
 UPDATE asset_manager.regions SET lgd_code=p_code,updated_at=clock_timestamp() WHERE id=p_region;
END $$;

CREATE FUNCTION bulk_import_regions(p_authority uuid, p_regions jsonb, p_reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE item jsonb; parent_uuid uuid; count_imported integer := 0;
BEGIN
 IF NOT asset_manager.authority_admin(p_authority) THEN
  RAISE EXCEPTION 'Authority administration required' USING ERRCODE='42501';
 END IF;
 PERFORM asset_manager.require_reason(p_reason);
 IF jsonb_typeof(p_regions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_regions) = 0 THEN
  RAISE EXCEPTION 'Array of region definitions required';
 END IF;
 FOR item IN SELECT jsonb_array_elements(p_regions) LOOP
  PERFORM asset_manager.validate_keys(item, ARRAY['code','name','level']);
  parent_uuid := NULL;
  IF item ? 'parent_code' AND item->>'parent_code' IS NOT NULL THEN
   SELECT id INTO parent_uuid FROM asset_manager.regions WHERE authority_id = p_authority AND code = item->>'parent_code';
   IF parent_uuid IS NULL THEN
    RAISE EXCEPTION 'Referenced parent_code not found: %', item->>'parent_code';
   END IF;
  ELSIF item ? 'parent_id' AND item->>'parent_id' IS NOT NULL THEN
   parent_uuid := (item->>'parent_id')::uuid;
  END IF;
  INSERT INTO asset_manager.regions(authority_id, parent_id, code, name, level, lgd_code, localized_names)
  VALUES (
   p_authority,
   parent_uuid,
   item->>'code',
   item->>'name',
   item->>'level',
   item->>'lgd_code',
   coalesce(item->'localized_names', '{}')
  )
  ON CONFLICT (authority_id, level, code) DO UPDATE
  SET name = EXCLUDED.name,
      lgd_code = coalesce(EXCLUDED.lgd_code, regions.lgd_code),
      localized_names = coalesce(EXCLUDED.localized_names, regions.localized_names),
      updated_at = clock_timestamp();
  count_imported := count_imported + 1;
 END LOOP;
 RETURN count_imported;
END $$;

CREATE TABLE duplicate_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 department_id uuid NOT NULL,
 asset_id uuid NOT NULL,
 candidate_asset_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','dismissed')),
 flagged_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
 reviewed_by text REFERENCES identities(clerk_id) ON DELETE RESTRICT,
 decision_reason text,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(department_id,asset_id) REFERENCES assets(department_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(department_id,candidate_asset_id) REFERENCES assets(department_id,id) ON DELETE RESTRICT,
 CHECK(asset_id<candidate_asset_id),
 CHECK(status='pending' OR (reviewed_by IS NOT NULL AND reviewed_by<>flagged_by AND reviewed_at IS NOT NULL AND coalesce(length(btrim(decision_reason)),0)>0)),
 UNIQUE(department_id,asset_id,candidate_asset_id)
);
CREATE FUNCTION flag_duplicate(p_asset uuid,p_candidate uuid,p_reason text) RETURNS asset_manager.duplicate_candidates LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE d uuid; row asset_manager.duplicate_candidates;
BEGIN
 SELECT department_id INTO d FROM asset_manager.assets WHERE id=p_asset;
 PERFORM asset_manager.require_permission(d,'asset_write'); PERFORM asset_manager.require_reason(p_reason);
 IF p_asset=p_candidate OR NOT EXISTS(SELECT 1 FROM asset_manager.assets WHERE id=p_candidate AND department_id=d) THEN RAISE EXCEPTION 'Distinct same-department candidate required'; END IF;
 INSERT INTO asset_manager.duplicate_candidates(department_id,asset_id,candidate_asset_id,reason,flagged_by)
 VALUES(d,least(p_asset,p_candidate),greatest(p_asset,p_candidate),p_reason,asset_manager.actor())
 ON CONFLICT(department_id,asset_id,candidate_asset_id) DO NOTHING;
 SELECT * INTO row FROM asset_manager.duplicate_candidates WHERE department_id=d AND asset_id=least(p_asset,p_candidate) AND candidate_asset_id=greatest(p_asset,p_candidate);
 RETURN row;
END $$;
CREATE FUNCTION review_duplicate(p_id uuid,p_confirm boolean,p_reason text) RETURNS asset_manager.duplicate_candidates LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.duplicate_candidates;
BEGIN
 SELECT * INTO row FROM asset_manager.duplicate_candidates WHERE id=p_id FOR UPDATE;
 IF row.id IS NULL THEN RAISE EXCEPTION 'Candidate not found' USING ERRCODE='P0002'; END IF;
 PERFORM asset_manager.require_permission(row.department_id,'asset_verify'); PERFORM asset_manager.require_reason(p_reason);
 IF row.status<>'pending' OR row.flagged_by=asset_manager.actor() OR p_confirm IS NULL THEN RAISE EXCEPTION 'Independent pending review required'; END IF;
 UPDATE asset_manager.duplicate_candidates SET status=CASE WHEN p_confirm THEN 'confirmed' ELSE 'dismissed' END,reviewed_by=asset_manager.actor(),reviewed_at=clock_timestamp(),decision_reason=p_reason WHERE id=p_id RETURNING * INTO row;
 -- Confirmation flags records; it never merges IDs or deletes either history.
 RETURN row;
END $$;

ALTER TABLE approval_requests ADD CONSTRAINT approval_asset_identity_unique UNIQUE(department_id,asset_id,id);
CREATE TABLE approval_evidence (
 department_id uuid NOT NULL,
 asset_id uuid NOT NULL,
 approval_request_id uuid NOT NULL,
 evidence_id uuid NOT NULL,
 linked_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(approval_request_id,evidence_id),
 FOREIGN KEY(department_id,asset_id,approval_request_id) REFERENCES approval_requests(department_id,asset_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(department_id,asset_id,evidence_id) REFERENCES evidence(department_id,asset_id,id) ON DELETE RESTRICT
);
CREATE FUNCTION link_approval_evidence(p_approval uuid,p_evidence uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE r asset_manager.approval_requests;
BEGIN
 PERFORM 1 FROM asset_manager.assets WHERE id=(SELECT asset_id FROM asset_manager.approval_requests WHERE id=p_approval) FOR UPDATE;
 SELECT * INTO r FROM asset_manager.approval_requests WHERE id=p_approval FOR UPDATE;
 PERFORM asset_manager.require_permission(r.department_id,'evidence_write');
 IF r.id IS NULL OR r.status<>'pending' OR r.requested_by<>asset_manager.actor() THEN RAISE EXCEPTION 'Requester may attach evidence only before decision'; END IF;
 PERFORM 1 FROM asset_manager.evidence WHERE id=p_evidence AND department_id=r.department_id AND asset_id=r.asset_id AND removed_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Live same-asset evidence required'; END IF;
 INSERT INTO asset_manager.approval_evidence VALUES(r.department_id,r.asset_id,r.id,p_evidence,asset_manager.actor(),clock_timestamp()) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION retain_approval_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 IF NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL AND EXISTS(SELECT 1 FROM asset_manager.approval_evidence WHERE evidence_id=OLD.id) THEN RAISE EXCEPTION 'Approval evidence must be retained'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approval_evidence_retention BEFORE UPDATE OF removed_at ON evidence FOR EACH ROW EXECUTE FUNCTION retain_approval_evidence();

ALTER TABLE department_templates ADD COLUMN localized_labels jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(localized_labels)='object');
ALTER TABLE department_templates ADD COLUMN evidence_policy jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(evidence_policy)='object');
CREATE FUNCTION set_template_labels(p_department uuid,p_code text,p_version integer,p_revision integer,p_labels jsonb,p_reason text)
RETURNS asset_manager.department_templates LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.department_templates; label_record record; language_record record;
BEGIN
 PERFORM asset_manager.require_permission(p_department,'template_write');
 SELECT * INTO row FROM asset_manager.department_templates WHERE department_id=p_department AND code=p_code AND version=p_version FOR UPDATE;
 IF row.department_id IS NULL THEN RAISE EXCEPTION 'Template not found' USING ERRCODE='P0002'; END IF;
 IF row.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 IF row.status NOT IN ('draft','correction_required') THEN RAISE EXCEPTION 'Published/submitted labels are immutable; create new template version'; END IF;
 IF p_labels IS NULL OR jsonb_typeof(p_labels)<>'object' OR octet_length(p_labels::text)>100000 THEN RAISE EXCEPTION 'Bounded label map required'; END IF;
 FOR label_record IN SELECT * FROM jsonb_each(p_labels) LOOP
  IF label_record.key<>'name' AND NOT label_record.key=ANY(row.components) AND NOT label_record.key=ANY(row.lifecycle_stages)
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(row.fields) f WHERE f->>'key'=label_record.key) THEN RAISE EXCEPTION 'Unknown stable label key: %',label_record.key; END IF;
  IF jsonb_typeof(label_record.value)<>'object' THEN RAISE EXCEPTION 'Each label requires language map'; END IF;
  FOR language_record IN SELECT * FROM jsonb_each(label_record.value) LOOP
   IF language_record.key NOT IN ('en','hi','gu','mr','bn','ta','te') OR jsonb_typeof(language_record.value)<>'string'
   OR length(btrim(language_record.value #>> '{}')) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'Unsupported language or invalid label'; END IF;
  END LOOP;
 END LOOP;
 PERFORM asset_manager.require_reason(p_reason);
 UPDATE asset_manager.department_templates SET localized_labels=p_labels,revision=revision+1,updated_at=clock_timestamp(),decision_reason=p_reason
 WHERE department_id=p_department AND code=p_code AND version=p_version RETURNING * INTO row;
 RETURN row;
END $$;

CREATE FUNCTION set_template_evidence_policy(p_department uuid,p_code text,p_version integer,p_revision integer,p_policy jsonb,p_reason text)
RETURNS asset_manager.department_templates LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE row asset_manager.department_templates; group_record record; stage_record record;
BEGIN
 PERFORM asset_manager.require_permission(p_department,'template_write');
 SELECT * INTO row FROM asset_manager.department_templates WHERE department_id=p_department AND code=p_code AND version=p_version FOR UPDATE;
 IF row.department_id IS NULL THEN RAISE EXCEPTION 'Template not found' USING ERRCODE='P0002'; END IF;
 IF row.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Version conflict' USING ERRCODE='40001'; END IF;
 IF row.status NOT IN ('draft','correction_required') THEN RAISE EXCEPTION 'Published/submitted evidence policies are immutable'; END IF;
 IF p_policy IS NULL OR jsonb_typeof(p_policy)<>'object' OR octet_length(p_policy::text)>10000 THEN RAISE EXCEPTION 'Bounded policy object required'; END IF;
 FOR group_record IN SELECT * FROM jsonb_each(p_policy) LOOP
  IF group_record.key NOT IN ('registration','inspection','lifecycle') OR jsonb_typeof(group_record.value)<>'object' THEN RAISE EXCEPTION 'Invalid policy group'; END IF;
  FOR stage_record IN SELECT * FROM jsonb_each(group_record.value) LOOP
   IF group_record.key='registration' AND stage_record.key NOT IN ('submitted','verified')
   OR group_record.key='inspection' AND stage_record.key NOT IN ('submitted','approved')
   OR group_record.key='lifecycle' AND NOT stage_record.key=ANY(row.lifecycle_stages)
   OR jsonb_typeof(stage_record.value)<>'number' OR (stage_record.value #>> '{}') !~ '^[0-9]+$'
   OR (stage_record.value #>> '{}')::numeric NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Valid stage and evidence minimum 1..20 required'; END IF;
  END LOOP;
 END LOOP;
 PERFORM asset_manager.require_reason(p_reason);
 UPDATE asset_manager.department_templates SET evidence_policy=p_policy,revision=revision+1,updated_at=clock_timestamp(),decision_reason=p_reason
 WHERE department_id=p_department AND code=p_code AND version=p_version RETURNING * INTO row;
 RETURN row;
END $$;
CREATE FUNCTION preserve_published_definition() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN
 IF OLD.status IN ('submitted','published') AND
 (NEW.name,NEW.base_category,NEW.fields,NEW.components,NEW.lifecycle_stages,NEW.transitions,NEW.policy_reference,NEW.localized_labels,NEW.evidence_policy)
 IS DISTINCT FROM
 (OLD.name,OLD.base_category,OLD.fields,OLD.components,OLD.lifecycle_stages,OLD.transitions,OLD.policy_reference,OLD.localized_labels,OLD.evidence_policy)
 THEN RAISE EXCEPTION 'Submitted/published template inputs are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER published_definition_guard BEFORE UPDATE ON department_templates FOR EACH ROW EXECUTE FUNCTION preserve_published_definition();
CREATE FUNCTION enforce_evidence_policy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE policy jsonb; required_count integer; count_live integer;
BEGIN
 IF TG_TABLE_NAME='assets' THEN
  SELECT evidence_policy INTO policy FROM asset_manager.department_templates WHERE department_id=NEW.department_id AND code=NEW.template_code AND version=NEW.template_version;
  IF TG_OP='UPDATE' AND NEW.registration_status IS DISTINCT FROM OLD.registration_status THEN
   required_count:=coalesce((policy->'registration'->>NEW.registration_status)::integer,0);
   SELECT count(*) INTO count_live FROM asset_manager.evidence WHERE department_id=NEW.department_id AND asset_id=NEW.id AND inspection_id IS NULL AND work_order_id IS NULL AND complaint_id IS NULL AND removed_at IS NULL;
   IF count_live<required_count THEN RAISE EXCEPTION 'Registration evidence minimum: %',required_count; END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.lifecycle_stage IS DISTINCT FROM OLD.lifecycle_stage THEN
   required_count:=coalesce((policy->'lifecycle'->>NEW.lifecycle_stage)::integer,0);
   SELECT count(DISTINCT e.id) INTO count_live FROM asset_manager.approval_requests r
    JOIN asset_manager.approval_evidence link ON link.approval_request_id=r.id
    JOIN asset_manager.evidence e ON e.id=link.evidence_id
    WHERE r.department_id=NEW.department_id AND r.asset_id=NEW.id AND r.action='lifecycle' AND r.to_value=NEW.lifecycle_stage AND r.asset_version=OLD.version AND r.status='pending' AND e.removed_at IS NULL;
   IF count_live<required_count THEN RAISE EXCEPTION 'Lifecycle approval evidence minimum: %',required_count; END IF;
  END IF;
 ELSE
  SELECT evidence_policy INTO policy FROM asset_manager.department_templates WHERE department_id=NEW.department_id AND code=NEW.template_code AND version=NEW.template_version;
  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
   required_count:=coalesce((policy->'inspection'->>NEW.status)::integer,0);
   SELECT count(*) INTO count_live FROM asset_manager.evidence WHERE department_id=NEW.department_id AND inspection_id=NEW.id AND removed_at IS NULL;
   IF count_live<required_count THEN RAISE EXCEPTION 'Inspection evidence minimum: %',required_count; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER evidence_policy_guard BEFORE INSERT OR UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION enforce_evidence_policy();
CREATE TRIGGER evidence_policy_guard BEFORE INSERT OR UPDATE ON inspections FOR EACH ROW EXECUTE FUNCTION enforce_evidence_policy();

-- These derived/association rows have no runtime direct DML permission.
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON duplicate_candidates FOR EACH ROW EXECUTE FUNCTION capture_audit('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON approval_evidence FOR EACH ROW EXECUTE FUNCTION capture_audit('approval_request_id','evidence_id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON central_read_grants FOR EACH ROW EXECUTE FUNCTION capture_audit('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON central_read_requests FOR EACH ROW EXECUTE FUNCTION capture_audit('id');


-- pg_trgm is a supported PostgreSQL extension, not an ORM/runtime dependency.
-- Existing Supabase installations may place it in public/extensions; resolve its
-- actual namespace without moving or changing unrelated extension objects.
DO $search_indexes$
DECLARE ext_schema text;
BEGIN
 SELECT n.nspname INTO ext_schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_trgm';
 EXECUTE format('CREATE INDEX assets_name_search_idx ON asset_manager.assets USING gin(name %I.gin_trgm_ops)',ext_schema);
 EXECUTE format('CREATE INDEX assets_code_search_idx ON asset_manager.assets USING gin(asset_code %I.gin_trgm_ops)',ext_schema);
END $search_indexes$;
CREATE FUNCTION search_assets(p_department uuid,p_term text,p_limit integer DEFAULT 25)
RETURNS SETOF asset_manager.assets LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE pattern text;
BEGIN
 IF p_term IS NULL OR length(btrim(p_term)) NOT BETWEEN 3 AND 100 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Search needs 3..100 characters and a limit of 1..100'; END IF;
 -- Escape LIKE wildcards: a user's percent/underscore is literal input.
 pattern:='%'||replace(replace(replace(btrim(p_term),'!','!!'),'%','!%'),'_','!_')||'%';
 RETURN QUERY SELECT a.* FROM asset_manager.assets a WHERE (p_department IS NULL OR a.department_id=p_department)
 AND (a.name ILIKE pattern ESCAPE '!' OR a.asset_code ILIKE pattern ESCAPE '!')
 ORDER BY a.name,a.id LIMIT p_limit;
END $$;
-- Final security and reporting controls; all changes commit atomically.
-- The actor context is a trusted backend capability, not JWT verification.
-- Never use owner/service-role credentials for application requests.

CREATE INDEX assets_authority_region_idx ON asset_manager.assets(authority_id,region_id,department_id,template_code);
CREATE INDEX inspections_asset_history_idx ON asset_manager.inspections(department_id,asset_id,observed_on DESC,id);
CREATE INDEX estimates_latest_idx ON asset_manager.work_estimates(department_id,work_order_id,revision DESC);
CREATE INDEX invitations_inviter_idx ON asset_manager.invitations(invited_by,department_id);
CREATE INDEX evidence_inspection_idx ON asset_manager.evidence(department_id,inspection_id) WHERE inspection_id IS NOT NULL;
CREATE INDEX evidence_work_idx ON asset_manager.evidence(department_id,work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX milestones_history_idx ON asset_manager.asset_milestones(department_id,asset_id,occurred_on DESC,id);
CREATE INDEX idx_assets_geo_coords ON asset_manager.assets(latitude, longitude) WHERE latitude IS NOT NULL;

CREATE FUNCTION asset_manager.readable_department_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
 WITH current_actor AS (
   SELECT asset_manager.actor() AS clerk_id
 ),
 direct_dept_ids AS (
   SELECT dm.department_id
   FROM asset_manager.department_memberships dm
   JOIN current_actor ca ON dm.clerk_id = ca.clerk_id
   JOIN asset_manager.departments d ON d.id = dm.department_id AND d.active
   JOIN asset_manager.authorities a ON a.id = d.authority_id AND a.active
   JOIN asset_manager.role_permissions rp ON rp.authority_id = d.authority_id AND rp.role = dm.role AND rp.permission = 'read'
   JOIN asset_manager.role_definitions rd ON rd.authority_id = rp.authority_id AND rd.code = rp.role AND rd.active
   WHERE dm.active
 ),
 central_grant_dept_ids AS (
   SELECT d.id AS department_id
   FROM asset_manager.central_read_grants g
   JOIN current_actor ca ON g.clerk_id = ca.clerk_id
   JOIN asset_manager.authorities a ON a.id = g.authority_id AND a.active
   JOIN asset_manager.departments d ON d.authority_id = a.id AND d.active AND (g.department_id IS NULL OR g.department_id = d.id)
   WHERE g.active
   AND (
     EXISTS (
       SELECT 1 FROM asset_manager.authority_memberships am
       JOIN asset_manager.role_permissions arp ON arp.authority_id = am.authority_id AND arp.role = am.role AND arp.permission IN ('authority_admin', 'authority_read')
       WHERE am.authority_id = a.id AND am.clerk_id = ca.clerk_id AND am.active
     )
   )
 )
 SELECT coalesce(array_agg(DISTINCT department_id), ARRAY[]::uuid[])
 FROM (
   SELECT department_id FROM direct_dept_ids
   UNION ALL
   SELECT department_id FROM central_grant_dept_ids
 ) combined
 WHERE (SELECT asset_manager.actor_active());
$$;

CREATE FUNCTION asset_manager.readable_authority_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
 WITH current_actor AS (
   SELECT asset_manager.actor() AS clerk_id
 )
 SELECT coalesce(array_agg(DISTINCT a.id), ARRAY[]::uuid[])
 FROM asset_manager.authorities a
 JOIN current_actor ca ON true
 WHERE a.active AND (SELECT asset_manager.actor_active()) AND (
   EXISTS (
     SELECT 1 FROM asset_manager.authority_memberships am
     JOIN asset_manager.role_permissions rp ON rp.authority_id = am.authority_id AND rp.role = am.role AND rp.permission IN ('authority_admin', 'authority_read')
     WHERE am.authority_id = a.id AND am.clerk_id = ca.clerk_id AND am.active
   )
   OR EXISTS (
     SELECT 1 FROM asset_manager.department_memberships dm
     JOIN asset_manager.departments d ON d.id = dm.department_id AND d.authority_id = a.id AND d.active
     JOIN asset_manager.role_permissions drp ON drp.authority_id = a.id AND drp.role = dm.role AND drp.permission = 'read'
     WHERE dm.clerk_id = ca.clerk_id AND dm.active
   )
 );
$$;

-- SELECT policies only. Runtime DML is denied by privileges AND absence of
-- write policies; approved mutation functions separately enforce live RBAC.
DO $rls$
DECLARE t record;
BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='asset_manager' LOOP
  EXECUTE format('ALTER TABLE asset_manager.%I ENABLE ROW LEVEL SECURITY',t.tablename);
 END LOOP;
END $rls$;
CREATE POLICY schema_version_read ON asset_manager.schema_version FOR SELECT TO pravi_runtime USING ((SELECT asset_manager.actor_active()));
CREATE POLICY permission_catalog_read ON asset_manager.permission_catalog FOR SELECT TO pravi_runtime USING ((SELECT asset_manager.actor_active()));
CREATE POLICY starter_templates_read ON asset_manager.asset_templates FOR SELECT TO pravi_runtime USING ((SELECT asset_manager.actor_active()));
CREATE POLICY authorities_read ON asset_manager.authorities FOR SELECT TO pravi_runtime
 USING(id=ANY((SELECT asset_manager.readable_authority_ids())::uuid[]));
CREATE POLICY departments_read ON asset_manager.departments FOR SELECT TO pravi_runtime
 USING(id=ANY((SELECT asset_manager.readable_department_ids())::uuid[]));
CREATE POLICY regions_read ON asset_manager.regions FOR SELECT TO pravi_runtime
 USING(authority_id=ANY((SELECT asset_manager.readable_authority_ids())::uuid[]));
CREATE POLICY role_definitions_read ON asset_manager.role_definitions FOR SELECT TO pravi_runtime
 USING(authority_id=ANY((SELECT asset_manager.readable_authority_ids())::uuid[]));
CREATE POLICY role_permissions_read ON asset_manager.role_permissions FOR SELECT TO pravi_runtime
 USING(authority_id=ANY((SELECT asset_manager.readable_authority_ids())::uuid[]));
CREATE POLICY own_or_admin_authority_memberships ON asset_manager.authority_memberships FOR SELECT TO pravi_runtime
 USING((SELECT asset_manager.actor_active()) AND (clerk_id=(SELECT asset_manager.actor()) OR asset_manager.authority_admin(authority_id)));
CREATE POLICY departmental_memberships_read ON asset_manager.department_memberships FOR SELECT TO pravi_runtime
 USING((SELECT asset_manager.actor_active()) AND (clerk_id=(SELECT asset_manager.actor()) OR asset_manager.authority_admin(authority_id) OR asset_manager.department_permission(department_id,'read')));
CREATE POLICY identities_read ON asset_manager.identities FOR SELECT TO pravi_runtime
 USING((SELECT asset_manager.actor_active()) AND (clerk_id=(SELECT asset_manager.actor())
 OR EXISTS(SELECT 1 FROM asset_manager.authority_memberships m WHERE m.clerk_id=identities.clerk_id AND asset_manager.authority_admin(m.authority_id))
 OR EXISTS(SELECT 1 FROM asset_manager.department_memberships m WHERE m.clerk_id=identities.clerk_id AND (asset_manager.authority_admin(m.authority_id) OR asset_manager.department_permission(m.department_id,'read')))));
DO $domain_policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['department_templates','assets','inspections','complaints','work_orders','work_estimates','asset_milestones','approval_requests','inspection_components','duplicate_candidates','approval_evidence'] LOOP
  EXECUTE format('CREATE POLICY tenant_read ON asset_manager.%I FOR SELECT TO pravi_runtime USING (department_id = ANY((SELECT asset_manager.readable_department_ids())::uuid[]))',t);
 END LOOP;
END $domain_policies$;
CREATE POLICY evidence_read ON asset_manager.evidence FOR SELECT TO pravi_runtime
 USING(department_id=ANY((SELECT asset_manager.readable_department_ids())::uuid[]) AND
 (classification<>'restricted' OR created_by=(SELECT asset_manager.actor())
 OR asset_manager.department_permission(department_id,'inspection_approve')
 OR asset_manager.department_permission(department_id,'work_approve')
 OR asset_manager.department_permission(department_id,'asset_verify')));
CREATE POLICY invitations_read ON asset_manager.invitations FOR SELECT TO pravi_runtime
 USING((SELECT asset_manager.actor_active()) AND (
 EXISTS(SELECT 1 FROM asset_manager.departments d WHERE d.id=department_id AND asset_manager.authority_admin(d.authority_id))
 OR asset_manager.department_permission(department_id,'member_manage')
 OR (accepted_by=(SELECT asset_manager.actor()))));
CREATE POLICY access_requests_read ON asset_manager.access_requests FOR SELECT TO pravi_runtime
 USING((SELECT asset_manager.actor_active()) AND (clerk_id=(SELECT asset_manager.actor())
 OR EXISTS(SELECT 1 FROM asset_manager.departments d WHERE d.id=department_id AND asset_manager.authority_admin(d.authority_id))));
CREATE POLICY governance_requests_read ON asset_manager.governance_requests FOR SELECT TO pravi_runtime
 USING(asset_manager.authority_admin(authority_id) OR asset_manager.governance_permission(authority_id,'governance_approve'));
CREATE POLICY recovery_flags_admin_read ON asset_manager.authority_recovery_flags FOR SELECT TO pravi_runtime
 USING(asset_manager.authority_admin(authority_id));
CREATE POLICY central_grants_read ON asset_manager.central_read_grants FOR SELECT TO pravi_runtime
 USING((SELECT asset_manager.actor_active()) AND (clerk_id=(SELECT asset_manager.actor()) OR asset_manager.authority_admin(authority_id) OR asset_manager.governance_permission(authority_id,'governance_approve')));
CREATE POLICY central_requests_read ON asset_manager.central_read_requests FOR SELECT TO pravi_runtime
 USING((SELECT asset_manager.actor_active()) AND (clerk_id=(SELECT asset_manager.actor()) OR asset_manager.authority_admin(authority_id) OR asset_manager.governance_permission(authority_id,'governance_approve')));
CREATE POLICY evidence_access_admin_read ON asset_manager.evidence_access_events FOR SELECT TO pravi_runtime
 USING(EXISTS(SELECT 1 FROM asset_manager.departments d WHERE d.id=department_id AND asset_manager.authority_admin(d.authority_id)));
CREATE POLICY audit_read ON asset_manager.audit_events FOR SELECT TO pravi_runtime
 USING((SELECT asset_manager.actor_active()) AND (
 asset_manager.authority_admin(authority_id)
 OR (department_id=ANY((SELECT asset_manager.readable_department_ids())::uuid[])
 AND entity_type IN ('assets','inspections','complaints','work_orders','work_estimates','asset_milestones','approval_requests','department_templates','departments','regions'))));
CREATE POLICY outbox_worker_read ON asset_manager.integration_outbox FOR SELECT TO pravi_identity_sync USING(true);
CREATE POLICY invitation_worker_read ON asset_manager.invitations FOR SELECT TO pravi_identity_sync USING(true);
-- Verified system worker can inspect pending deliveries; mutations still use
-- explicitly granted workflow functions. No runtime read of the worker queue.
-- No runtime policies or SELECT grant on receipts, tombstones, or outbox.
-- Owner-defined helper functions intentionally retain table-owner RLS bypass.

CREATE FUNCTION asset_manager.reject_audit_change() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only; correction requires a new event' USING ERRCODE='42501'; END $$;
CREATE TRIGGER audit_no_update_delete BEFORE UPDATE OR DELETE ON asset_manager.audit_events
 FOR EACH ROW EXECUTE FUNCTION asset_manager.reject_audit_change();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON asset_manager.audit_events
 FOR EACH STATEMENT EXECUTE FUNCTION asset_manager.reject_audit_change();
CREATE TRIGGER evidence_access_no_update_delete BEFORE UPDATE OR DELETE ON asset_manager.evidence_access_events
 FOR EACH ROW EXECUTE FUNCTION asset_manager.reject_audit_change();
CREATE TRIGGER evidence_access_no_truncate BEFORE TRUNCATE ON asset_manager.evidence_access_events
 FOR EACH STATEMENT EXECUTE FUNCTION asset_manager.reject_audit_change();
-- These are application protections; an owner can alter/drop triggers. This is
-- not cryptographic tamper evidence and no automatic retention purge is supplied.

CREATE VIEW asset_manager.approved_inspection_history WITH (security_invoker=true) AS
 SELECT i.* FROM asset_manager.inspections i
 WHERE i.status='approved' AND NOT EXISTS(
  SELECT 1 FROM asset_manager.inspections replacement WHERE replacement.supersedes_id=i.id AND replacement.status='approved');
CREATE VIEW asset_manager.asset_current_condition WITH (security_invoker=true) AS
 SELECT a.id AS asset_id,a.authority_id,a.department_id,a.region_id,a.template_code,a.template_version,
 a.registration_status,a.lifecycle_stage,a.availability,a.retired_at,a.archived_at,
 i.id AS inspection_id,i.observed_on,i.next_review_on,i.condition AS last_assessed_condition,
 CASE WHEN i.id IS NULL THEN 'never_assessed' WHEN i.next_review_on IS NULL THEN 'review_date_unknown'
 WHEN i.next_review_on<((now() AT TIME ZONE 'Asia/Kolkata')::date) THEN 'stale' ELSE 'current' END AS assessment_freshness,
 CASE WHEN i.id IS NOT NULL AND i.next_review_on>=((now() AT TIME ZONE 'Asia/Kolkata')::date) THEN i.condition ELSE 'unknown' END AS current_condition
 FROM asset_manager.assets a
 LEFT JOIN LATERAL(SELECT h.* FROM asset_manager.approved_inspection_history h WHERE h.asset_id=a.id
 ORDER BY h.observed_on DESC,h.reviewed_at DESC,h.id DESC LIMIT 1) i ON true;
CREATE VIEW asset_manager.asset_condition_detail WITH (security_invoker=true) AS
 SELECT a.id AS asset_id, a.authority_id, a.department_id, a.region_id,
        a.template_code, a.template_version, dt.base_category,
        a.asset_code, a.name AS asset_name, a.registration_status,
        a.lifecycle_stage, a.availability, a.criticality,
        c.inspection_id, c.observed_on, c.next_review_on,
        c.last_assessed_condition, c.assessment_freshness, c.current_condition
 FROM asset_manager.assets a
 JOIN asset_manager.asset_current_condition c ON c.asset_id = a.id
 JOIN asset_manager.department_templates dt ON dt.department_id = a.department_id AND dt.code = a.template_code AND dt.version = a.template_version
 WHERE a.archived_at IS NULL AND a.retired_at IS NULL;

CREATE VIEW asset_manager.regional_condition_summary WITH (security_invoker=true) AS
 SELECT d.authority_id, d.department_id, d.region_id, d.base_category,
 count(*) AS registered_inventory_count,
 count(*) FILTER(WHERE d.registration_status='verified') AS verified_inventory_count,
 count(*) FILTER(WHERE d.registration_status='verified' AND d.assessment_freshness='current' AND d.current_condition<>'unknown') AS currently_assessed_count,
 count(*) FILTER(WHERE d.registration_status='verified' AND d.assessment_freshness='stale') AS stale_count,
 count(*) FILTER(WHERE d.registration_status='verified' AND d.current_condition='unknown') AS unknown_or_stale_count,
 count(*) FILTER(WHERE d.registration_status='verified' AND d.current_condition IN ('poor','critical')) AS current_poor_critical_count,
 round(100.0*count(*) FILTER(WHERE d.registration_status='verified' AND d.assessment_freshness='current' AND d.current_condition<>'unknown')/
 nullif(count(*) FILTER(WHERE d.registration_status='verified'),0),2) AS inspection_coverage_percent,
 round(100.0*count(*) FILTER(WHERE d.registration_status='verified' AND d.current_condition IN ('poor','critical'))/
 nullif(count(*) FILTER(WHERE d.registration_status='verified' AND d.assessment_freshness='current' AND d.current_condition<>'unknown'),0),2) AS poor_critical_percent
 FROM asset_manager.asset_condition_detail d
 GROUP BY d.authority_id, d.department_id, d.region_id, d.base_category;

CREATE VIEW asset_manager.latest_work_estimates WITH (security_invoker=true) AS
 SELECT DISTINCT ON (e.work_order_id) e.* FROM asset_manager.work_estimates e ORDER BY e.work_order_id,e.revision DESC,e.id DESC;

CREATE VIEW asset_manager.asset_restoration_detail WITH (security_invoker=true) AS
 SELECT w.id AS work_order_id, a.authority_id, w.department_id, a.region_id,
        dt.base_category, a.id AS asset_id, a.asset_code, a.name AS asset_name,
        w.status, w.target_on, w.assigned_to,
        e.id AS latest_estimate_id, e.status AS estimate_status, e.amount_paise AS estimate_amount_paise
 FROM asset_manager.work_orders w
 JOIN asset_manager.assets a ON a.id = w.asset_id
 JOIN asset_manager.department_templates dt ON dt.department_id = a.department_id AND dt.code = a.template_code AND dt.version = a.template_version
 LEFT JOIN asset_manager.latest_work_estimates e ON e.work_order_id = w.id
 WHERE w.status NOT IN ('accepted','cancelled') AND a.archived_at IS NULL AND a.retired_at IS NULL;

CREATE VIEW asset_manager.regional_restoration_summary WITH (security_invoker=true) AS
 SELECT rd.authority_id, rd.department_id, rd.region_id, rd.base_category, rd.status,
 count(*) AS outstanding_work_count,
 count(*) FILTER(WHERE rd.latest_estimate_id IS NULL OR rd.estimate_status<>'reviewed') AS unreviewed_or_unpriced_count,
 coalesce(sum(rd.estimate_amount_paise) FILTER(WHERE rd.estimate_status='reviewed'),0) AS reviewed_estimate_paise
 FROM asset_manager.asset_restoration_detail rd
 GROUP BY rd.authority_id, rd.department_id, rd.region_id, rd.base_category, rd.status;

CREATE VIEW asset_manager.unlinked_complaints WITH (security_invoker=true) AS
 SELECT c.id AS complaint_id, c.department_id, c.external_reference, c.channel,
        c.reported_at, c.narrative, c.reported_severity, c.status, c.assigned_to, c.created_at
 FROM asset_manager.complaints c
 WHERE c.asset_id IS NULL AND c.status <> 'resolved';

CREATE VIEW asset_manager.asset_attention WITH (security_invoker=true) AS
 WITH active_assets AS (
   SELECT a.id, a.authority_id, a.department_id, a.responsible_officer, a.registration_status, a.created_at
   FROM asset_manager.assets a
   WHERE a.archived_at IS NULL AND a.retired_at IS NULL
   AND NOT EXISTS(
     SELECT 1 FROM asset_manager.duplicate_candidates dc
     WHERE (dc.asset_id=a.id OR dc.candidate_asset_id=a.id) AND dc.status='confirmed'
   )
 )
 SELECT a.id AS asset_id, a.authority_id, a.department_id, a.responsible_officer AS accountable_clerk_id,
        'condition_critical'::text AS reason, c.inspection_id::text AS source_id, c.observed_on::timestamptz AS source_at
 FROM active_assets a JOIN asset_manager.asset_current_condition c ON c.asset_id=a.id
 WHERE c.last_assessed_condition='critical'
 UNION ALL
 SELECT a.id, a.authority_id, a.department_id, a.responsible_officer, 'condition_poor', c.inspection_id::text, c.observed_on::timestamptz
 FROM active_assets a JOIN asset_manager.asset_current_condition c ON c.asset_id=a.id
 WHERE c.last_assessed_condition='poor'
 UNION ALL
 SELECT a.id, a.authority_id, a.department_id, a.responsible_officer, 'inspection_overdue', c.inspection_id::text, c.next_review_on::timestamptz
 FROM active_assets a JOIN asset_manager.asset_current_condition c ON c.asset_id=a.id
 WHERE c.assessment_freshness='stale'
 UNION ALL
 SELECT a.id, a.authority_id, a.department_id, a.responsible_officer, 'condition_unknown', a.id::text, a.created_at
 FROM active_assets a JOIN asset_manager.asset_current_condition c ON c.asset_id=a.id
 WHERE a.registration_status='verified' AND c.current_condition='unknown'
 UNION ALL
 SELECT a.id, a.authority_id, a.department_id, coalesce(p.assigned_to, a.responsible_officer), 'reported_hazard', p.id::text, p.reported_at
 FROM active_assets a JOIN asset_manager.complaints p ON p.asset_id=a.id
 WHERE p.status<>'resolved' AND p.reported_severity IN ('high','critical')
 UNION ALL
 SELECT a.id, a.authority_id, a.department_id, coalesce(w.assigned_to, a.responsible_officer), 'work_overdue', w.id::text, w.target_on::timestamptz
 FROM active_assets a JOIN asset_manager.work_orders w ON w.asset_id=a.id
 WHERE w.status NOT IN ('accepted','cancelled') AND w.target_on<((now() AT TIME ZONE 'Asia/Kolkata')::date)
 UNION ALL
 SELECT a.id, a.authority_id, a.department_id, a.responsible_officer, 'work_not_reinspected', w.id::text, w.accepted_at
 FROM active_assets a JOIN asset_manager.work_orders w ON w.asset_id=a.id
 WHERE w.status='accepted' AND w.verification_inspection_id IS NULL;

-- RBAC-Enforced Geospatial Asset Map View
CREATE VIEW asset_manager.asset_map_view WITH (security_invoker=true) AS
 SELECT
   a.id AS asset_id,
   a.asset_code,
   a.name,
   a.department_id,
   d.code AS department_code,
   d.name AS department_name,
   a.authority_id,
   a.region_id,
   r.name AS region_name,
   r.level AS region_level,
   a.latitude,
   a.longitude,
   a.template_code,
   a.template_version,
   a.lifecycle_stage,
   a.availability,
   a.registration_status,
   a.criticality,
   a.responsible_officer,
   c.current_condition,
   c.assessment_freshness,
   (SELECT count(*) FROM asset_manager.complaints cp WHERE cp.asset_id = a.id AND cp.status <> 'resolved') AS open_complaints_count,
   (SELECT count(*) FROM asset_manager.work_orders wo WHERE wo.asset_id = a.id AND wo.status NOT IN ('accepted','cancelled')) AS active_work_orders_count
 FROM asset_manager.assets a
 JOIN asset_manager.departments d ON d.id = a.department_id
 LEFT JOIN asset_manager.regions r ON r.id = a.region_id
 LEFT JOIN asset_manager.asset_current_condition c ON c.asset_id = a.id
 WHERE a.latitude IS NOT NULL AND a.longitude IS NOT NULL AND a.archived_at IS NULL AND a.retired_at IS NULL;

CREATE FUNCTION get_assets_in_bbox(
  p_min_lat numeric,
  p_min_lng numeric,
  p_max_lat numeric,
  p_max_lng numeric,
  p_department_id uuid DEFAULT NULL
)
RETURNS SETOF asset_manager.asset_map_view LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
  SELECT m.*
  FROM asset_manager.asset_map_view m
  WHERE m.latitude BETWEEN p_min_lat AND p_max_lat
    AND m.longitude BETWEEN p_min_lng AND p_max_lng
    AND (p_department_id IS NULL OR m.department_id = p_department_id)
    AND asset_manager.department_read(m.department_id);
$$;

CREATE FUNCTION set_asset_geotag(p_id uuid, p_expected integer, p_latitude numeric, p_longitude numeric, p_reason text)
RETURNS asset_manager.assets LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
 SELECT * FROM asset_manager.edit_asset(p_id,p_expected,
  jsonb_build_object('latitude',p_latitude,'longitude',p_longitude),p_reason);
$$;

-- DPDP Compliance: Anonymize identity for departed / privacy-requested officers
CREATE FUNCTION anonymize_identity(p_clerk_id text, p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
DECLARE id_row asset_manager.identities;
BEGIN
  PERFORM asset_manager.require_reason(p_reason);
  IF NOT EXISTS(SELECT 1 FROM asset_manager.authority_memberships m WHERE m.clerk_id=asset_manager.actor() AND m.active AND asset_manager.authority_admin(m.authority_id)) THEN
    RAISE EXCEPTION 'Authority administration required to anonymize identity' USING ERRCODE='42501';
  END IF;
  SELECT * INTO id_row FROM asset_manager.identities WHERE clerk_id=p_clerk_id FOR UPDATE;
  IF id_row.clerk_id IS NULL THEN RAISE EXCEPTION 'Identity not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM asset_manager.authority_memberships WHERE clerk_id=p_clerk_id AND active)
  OR EXISTS(SELECT 1 FROM asset_manager.department_memberships WHERE clerk_id=p_clerk_id AND active) THEN
    RAISE EXCEPTION 'Active memberships must be deactivated before anonymization';
  END IF;
  UPDATE asset_manager.identities
  SET display_name = 'Anonymized Officer',
      email = 'anonymized_' || substr(md5(p_clerk_id || clock_timestamp()::text), 1, 12) || '@anonymized.local',
      disabled_at = coalesce(disabled_at, clock_timestamp())
  WHERE clerk_id = p_clerk_id;
END $$;

-- Periodic Snapshot Storage for Regulatory and Fiscal Audits
CREATE TABLE report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id uuid NOT NULL REFERENCES authorities(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES departments(id) ON DELETE RESTRICT,
  snapshot_type text NOT NULL CHECK (snapshot_type IN ('condition', 'restoration', 'inventory', 'measure')),
  as_of_date date NOT NULL,
  data jsonb NOT NULL,
  created_by text NOT NULL REFERENCES identities(clerk_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_report_snapshots_date ON report_snapshots(authority_id, as_of_date DESC);
ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_snapshots_read ON asset_manager.report_snapshots FOR SELECT TO pravi_runtime
  USING(asset_manager.authority_admin(authority_id) OR (department_id IS NOT NULL AND asset_manager.department_read(department_id)));


CREATE VIEW asset_manager.condition_observation_pairs WITH(security_invoker=true) AS
 SELECT a.authority_id,a.department_id,a.region_id,a.id AS asset_id,a.template_code,a.template_version,
 first_i.id AS first_inspection_id,first_i.observed_on AS first_observed_on,first_i.condition AS first_condition,
 last_i.id AS latest_inspection_id,last_i.observed_on AS latest_observed_on,last_i.condition AS latest_condition
 FROM asset_manager.assets a
 JOIN LATERAL(SELECT h.* FROM asset_manager.approved_inspection_history h WHERE h.asset_id=a.id AND h.template_code=a.template_code AND h.template_version=a.template_version AND h.condition<>'unknown'
 ORDER BY h.observed_on,h.reviewed_at,h.id LIMIT 1) first_i ON true
 JOIN LATERAL(SELECT h.* FROM asset_manager.approved_inspection_history h WHERE h.asset_id=a.id AND h.template_code=a.template_code AND h.template_version=a.template_version AND h.condition<>'unknown'
 ORDER BY h.observed_on DESC,h.reviewed_at DESC,h.id DESC LIMIT 1) last_i ON true
 WHERE a.registration_status='verified' AND a.archived_at IS NULL AND a.retired_at IS NULL AND first_i.observed_on<last_i.observed_on;

DROP POLICY IF EXISTS report_snapshots_read ON asset_manager.report_snapshots;
CREATE POLICY report_snapshots_read ON asset_manager.report_snapshots FOR SELECT TO pravi_runtime
 USING(asset_manager.actor_active() AND (asset_manager.authority_admin(authority_id) OR (department_id IS NOT NULL AND asset_manager.department_read(department_id)) OR (department_id IS NULL AND asset_manager.authority_read(authority_id) AND EXISTS(SELECT 1 FROM asset_manager.central_read_grants g WHERE g.authority_id=report_snapshots.authority_id AND g.department_id IS NULL AND g.clerk_id=asset_manager.actor() AND g.active))));

CREATE OR REPLACE FUNCTION asset_manager.create_report_snapshot(p_authority uuid,p_department uuid,p_type text,p_request uuid)
RETURNS asset_manager.report_snapshots LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,asset_manager,pg_temp AS $$
DECLARE actor_id text; report_date date; report_data jsonb; replay jsonb; result asset_manager.report_snapshots;
BEGIN
 actor_id:=asset_manager.require_actor();
 report_date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
 IF NOT EXISTS(SELECT 1 FROM asset_manager.authorities WHERE id=p_authority AND active) THEN RAISE EXCEPTION 'Authority unavailable' USING ERRCODE='42501'; END IF;
 IF p_department IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM asset_manager.departments WHERE id=p_department AND authority_id=p_authority) OR NOT asset_manager.department_read(p_department) THEN RAISE EXCEPTION 'Snapshot department unavailable' USING ERRCODE='42501'; END IF;
 ELSIF NOT asset_manager.authority_admin(p_authority) AND NOT (asset_manager.authority_read(p_authority) AND EXISTS(SELECT 1 FROM asset_manager.central_read_grants WHERE authority_id=p_authority AND department_id IS NULL AND clerk_id=actor_id AND active)) THEN
  RAISE EXCEPTION 'Authority-wide snapshot requires authority-wide read grant' USING ERRCODE='42501';
 END IF;
 IF p_type NOT IN ('condition','restoration','inventory','measure') OR p_type IS NULL THEN RAISE EXCEPTION 'Unsupported snapshot type' USING ERRCODE='23514'; END IF;
 replay:=asset_manager.begin_request(p_request,'create_report_snapshot',jsonb_build_object('authority',p_authority,'department',p_department,'type',p_type));
 IF replay IS NOT NULL THEN SELECT * INTO result FROM asset_manager.report_snapshots WHERE id=(replay->>'id')::uuid; RETURN result; END IF;
 IF p_type='inventory' THEN
  SELECT jsonb_build_object('registered',count(*),'verified',count(*) FILTER(WHERE registration_status='verified'),'draft',count(*) FILTER(WHERE registration_status='draft'),'submitted',count(*) FILTER(WHERE registration_status='submitted'),'correction_required',count(*) FILTER(WHERE registration_status='correction_required')) INTO report_data
  FROM asset_manager.assets WHERE authority_id=p_authority AND archived_at IS NULL AND (p_department IS NULL OR department_id=p_department);
 ELSIF p_type='condition' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.department_id,v.region_id,v.base_category),'[]'::jsonb) INTO report_data FROM asset_manager.regional_condition_summary v WHERE v.authority_id=p_authority AND (p_department IS NULL OR v.department_id=p_department);
 ELSIF p_type='restoration' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('reviewed_estimate_paise',v.reviewed_estimate_paise::text) ORDER BY v.department_id,v.region_id,v.base_category,v.status),'[]'::jsonb) INTO report_data FROM asset_manager.regional_restoration_summary v WHERE v.authority_id=p_authority AND (p_department IS NULL OR v.department_id=p_department);
 ELSE
  SELECT coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('recorded_quantity',v.recorded_quantity::text) ORDER BY v.department_id,v.region_id,v.base_category,v.measure_unit),'[]'::jsonb) INTO report_data FROM asset_manager.regional_measure_totals v WHERE v.authority_id=p_authority AND (p_department IS NULL OR v.department_id=p_department);
 END IF;
 INSERT INTO asset_manager.report_snapshots(authority_id,department_id,snapshot_type,as_of_date,data,created_by)
 VALUES(p_authority,p_department,p_type,report_date,jsonb_build_object('generated_at',clock_timestamp(),'reporting_timezone','Asia/Kolkata','scope',jsonb_build_object('authority_id',p_authority,'department_id',p_department),'source','authoritative current database aggregates','values',report_data),actor_id) RETURNING * INTO result;
 PERFORM asset_manager.finish_request(p_request,jsonb_build_object('id',result.id));
 RETURN result;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA asset_manager FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA asset_manager FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA asset_manager FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA asset_manager FROM pravi_runtime,pravi_identity_sync;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA asset_manager FROM pravi_runtime,pravi_identity_sync;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA asset_manager FROM pravi_runtime,pravi_identity_sync;
ALTER DEFAULT PRIVILEGES IN SCHEMA asset_manager REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA asset_manager REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA asset_manager REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
DO $supabase_revokes$
DECLARE r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON SCHEMA asset_manager FROM %I',r);
   EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA asset_manager FROM %I',r);
   EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA asset_manager FROM %I',r);
   EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA asset_manager FROM %I',r);
   EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA asset_manager REVOKE ALL ON TABLES FROM %I',r);
   EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA asset_manager REVOKE ALL ON SEQUENCES FROM %I',r);
   EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA asset_manager REVOKE EXECUTE ON FUNCTIONS FROM %I',r);
  END IF;
 END LOOP;
END $supabase_revokes$;
GRANT SELECT ON asset_manager.schema_version,asset_manager.identities,asset_manager.authorities,
 asset_manager.permission_catalog,asset_manager.role_definitions,asset_manager.role_permissions,
 asset_manager.authority_memberships,asset_manager.departments,asset_manager.department_memberships,
 asset_manager.regions,asset_manager.asset_templates,asset_manager.department_templates,asset_manager.assets,
 asset_manager.inspections,asset_manager.complaints,asset_manager.work_orders,asset_manager.work_estimates,
 asset_manager.evidence_access_events,asset_manager.asset_milestones,asset_manager.invitations,asset_manager.access_requests,
 asset_manager.audit_events,asset_manager.approval_requests,asset_manager.governance_requests,
 asset_manager.authority_recovery_flags,asset_manager.central_read_grants,asset_manager.central_read_requests,
 asset_manager.inspection_components,asset_manager.duplicate_candidates,asset_manager.approval_evidence,
 asset_manager.effective_inspection_components,asset_manager.region_descendants,asset_manager.region_closure,
 asset_manager.approved_inspection_history,asset_manager.asset_current_condition,asset_manager.asset_attention,
 asset_manager.asset_condition_detail,asset_manager.asset_restoration_detail,asset_manager.unlinked_complaints,
 asset_manager.asset_map_view,asset_manager.regional_measure_totals,asset_manager.report_snapshots,
 asset_manager.latest_work_estimates,asset_manager.regional_condition_summary,asset_manager.regional_restoration_summary,asset_manager.condition_observation_pairs TO pravi_runtime;
-- Object identifiers are available only through audited protected-delivery API.
-- Callers must explicitly select these metadata columns rather than SELECT *.
GRANT SELECT(id,department_id,asset_id,inspection_id,work_order_id,complaint_id,
 provider,original_name,mime_type,size_bytes,caption,sha256,classification,
 removed_at,removal_reason,created_by,created_at) ON asset_manager.evidence TO pravi_runtime;
GRANT SELECT, UPDATE ON asset_manager.integration_outbox TO pravi_identity_sync;
GRANT SELECT ON asset_manager.invitations TO pravi_identity_sync;
-- Resolve ONLY these explicitly listed API names to installed signatures. This
-- remains an allowlist even when set_actor's verified assertion signature changes.
DO $execute_grants$
DECLARE p record;
BEGIN
 FOR p IN SELECT oid::regprocedure AS signature FROM pg_proc
 WHERE pronamespace='asset_manager'::regnamespace AND proname=ANY(ARRAY[
 'actor','actor_active','set_actor','authority_admin','authority_read','department_read','department_permission','governance_permission',
 'readable_department_ids','readable_authority_ids','set_locale',
 'set_department_member','edit_department','edit_region','bulk_import_regions',
 'create_asset','edit_asset','transition_asset','request_asset_action','decide_asset_action','cancel_asset_action','set_asset_geotag',
 'create_department_template','edit_department_template','transition_template',
 'request_governance','decide_governance','cancel_governance',
 'create_inspection','edit_inspection','transition_inspection','create_complaint','edit_complaint','transition_complaint','link_complaint_asset',
 'create_work_order','edit_work_order','create_work_estimate','review_work_estimate','transition_work_order',
 'attach_evidence','remove_evidence','record_milestone','create_invitation','revoke_invitation','request_access','decide_access',
 'attach_complaint_evidence','request_evidence_access','set_asset_management','link_work_verification','set_region_lgd','flag_duplicate','review_duplicate',
 'link_approval_evidence','set_template_labels','set_template_evidence_policy','request_central_read','decide_central_read','search_assets',
 'get_assets_in_bbox','anonymize_identity','create_report_snapshot']) LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO pravi_runtime',p.signature);
 END LOOP;
 FOR p IN SELECT oid::regprocedure AS signature FROM pg_proc
 WHERE pronamespace='asset_manager'::regnamespace AND proname=ANY(ARRAY['sync_identity','disable_identity','invitation_delivered','accept_invitation','record_outbox_failure']) LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO pravi_identity_sync',p.signature);
 END LOOP;
 -- Allow runtime to use pg_trgm operators if installed in asset_manager schema
 FOR p IN SELECT oid::regprocedure AS signature FROM pg_proc
 WHERE pronamespace='asset_manager'::regnamespace AND proname=ANY(ARRAY['similarity','show_trgm','word_similarity','strict_word_similarity']) LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO pravi_runtime',p.signature);
 END LOOP;
END $execute_grants$;
-- Internal receipt/bootstrap/validation/trigger helpers intentionally ungranted.
-- Separate login roles are provisioned manually: NOINHERIT, no BYPASSRLS, only
-- the intended capability membership. Verify runtime role and negative tests.
COMMIT;
