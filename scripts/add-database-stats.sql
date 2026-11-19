-- Database usage numbers for the /database page.
--
-- The page asks this function for the size of the database and of each table,
-- because the normal API key cannot read system size information directly.
-- It only returns sizes and approximate row counts — no shop data.
--
-- Run this script once in Supabase → SQL Editor.

CREATE OR REPLACE FUNCTION public.database_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tables AS (
    SELECT
      c.relname AS name,
      pg_total_relation_size(c.oid) AS size_bytes,
      GREATEST(c.reltuples, 0)::bigint AS row_estimate
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  )
  SELECT jsonb_build_object(
    'database_size_bytes', pg_database_size(current_database()),
    'tables', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'name', name,
          'size_bytes', size_bytes,
          'row_estimate', row_estimate
        )
        ORDER BY size_bytes DESC
      ),
      '[]'::jsonb
    )
  )
  FROM tables;
$$;

GRANT EXECUTE ON FUNCTION public.database_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.database_stats() TO anon;
