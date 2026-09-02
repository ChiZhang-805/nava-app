-- Let each authenticated client receive only its own health sync job changes through RLS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'health_sync_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.health_sync_jobs;
  END IF;
END $$;

