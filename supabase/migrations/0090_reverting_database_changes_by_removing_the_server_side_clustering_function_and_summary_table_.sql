-- Drop the function that was performing server-side clustering
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer,double precision,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer);

-- Drop the summary table that was used for clustering
DROP TABLE IF EXISTS public.canadian_fsa_stats;