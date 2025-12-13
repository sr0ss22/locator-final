CREATE OR REPLACE FUNCTION public.upsert_zip_geometry(
    _zip_code text,
    _state_province text,
    _geometry_geojson_string text,
    _centroid_latitude double precision,
    _centroid_longitude double precision,
    _is_canada boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    geom_srid INTEGER;
    parsed_geometry GEOMETRY;
BEGIN
    -- For both US and Canada, the migration scripts will provide data in WGS84 (EPSG:4326)
    geom_srid := 4326;

    -- The Canadian data is reprojected in the script before being sent here.
    -- The US data is already in WGS84.
    -- Therefore, we can use the same logic for both.
    parsed_geometry := ST_SetSRID(ST_GeomFromGeoJSON(_geometry_geojson_string), geom_srid);

    INSERT INTO public.zip_code_geometries (zip_code, state_province, geometry, centroid_latitude, centroid_longitude)
    VALUES (
        _zip_code,
        _state_province,
        parsed_geometry,
        _centroid_latitude,
        _centroid_longitude
    )
    ON CONFLICT (zip_code) DO UPDATE SET
        state_province = EXCLUDED.state_province,
        geometry = EXCLUDED.geometry,
        centroid_latitude = EXCLUDED.centroid_latitude,
        centroid_longitude = EXCLUDED.centroid_longitude;
END;
$$;