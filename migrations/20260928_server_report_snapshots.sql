-- Owner-run additive snapshot generator. Does not accept client metric data or arbitrary historical dates.
BEGIN;
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

DROP POLICY IF EXISTS report_snapshots_read ON asset_manager.report_snapshots;
CREATE POLICY report_snapshots_read ON asset_manager.report_snapshots FOR SELECT TO pravi_runtime
 USING(asset_manager.actor_active() AND (asset_manager.authority_admin(authority_id) OR (department_id IS NOT NULL AND asset_manager.department_read(department_id)) OR (department_id IS NULL AND asset_manager.authority_read(authority_id) AND EXISTS(SELECT 1 FROM asset_manager.central_read_grants g WHERE g.authority_id=report_snapshots.authority_id AND g.department_id IS NULL AND g.clerk_id=asset_manager.actor() AND g.active))));

REVOKE ALL ON FUNCTION asset_manager.create_report_snapshot(uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION asset_manager.create_report_snapshot(uuid,uuid,text,uuid) TO pravi_runtime;
COMMIT;
