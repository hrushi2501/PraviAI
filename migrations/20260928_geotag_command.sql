-- Owner-run additive fix; application never runs migrations automatically.
BEGIN;
CREATE OR REPLACE FUNCTION asset_manager.set_asset_geotag(p_id uuid, p_expected integer, p_latitude numeric, p_longitude numeric, p_reason text)
RETURNS asset_manager.assets LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, asset_manager, pg_temp AS $$
 SELECT * FROM asset_manager.edit_asset(p_id,p_expected,
  jsonb_build_object('latitude',p_latitude,'longitude',p_longitude),p_reason);
$$;
REVOKE ALL ON FUNCTION asset_manager.set_asset_geotag(uuid,integer,numeric,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION asset_manager.set_asset_geotag(uuid,integer,numeric,numeric,text) TO pravi_runtime;
COMMIT;
