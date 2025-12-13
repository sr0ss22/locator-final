SELECT 
    zip_code, 
    state_province, 
    geometry IS NOT NULL as has_geometry,
    centroid_latitude,
    centroid_longitude
FROM 
    public.zip_code_geometries 
WHERE 
    zip_code = 'A0A';