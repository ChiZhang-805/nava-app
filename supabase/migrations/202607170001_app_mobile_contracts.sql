-- App-side backend contract patch.
-- Apply in the shared Supabase project after the Web/backend owner reviews it.

-- 1. Prevent duplicate daily exercise records. The App already dedupes defensively,
-- but the database should enforce the contract for Web, App, Watch, and AI writes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exercise_records_user_date_unique'
  ) THEN
    ALTER TABLE public.exercise_records
    ADD CONSTRAINT exercise_records_user_date_unique UNIQUE (user_id, record_date);
  END IF;
END $$;

-- 2. Persist face analysis history for mobile and Web.
CREATE TABLE IF NOT EXISTS public.face_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  image_path text,
  overall_score numeric,
  skin_age numeric,
  annotations jsonb NOT NULL DEFAULT '[]'::jsonb,
  feedback text,
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, record_date)
);

ALTER TABLE public.face_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own face records" ON public.face_records;
DROP POLICY IF EXISTS "Users can insert own face records" ON public.face_records;
DROP POLICY IF EXISTS "Users can update own face records" ON public.face_records;
DROP POLICY IF EXISTS "Users can delete own face records" ON public.face_records;

CREATE POLICY "Users can view own face records"
ON public.face_records FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own face records"
ON public.face_records FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own face records"
ON public.face_records FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own face records"
ON public.face_records FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_face_records_updated_at ON public.face_records;

CREATE TRIGGER update_face_records_updated_at
BEFORE UPDATE ON public.face_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Track device sync jobs and connected devices.
CREATE TABLE IF NOT EXISTS public.device_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  device_name text,
  device_model text,
  os_version text,
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform, device_name)
);

ALTER TABLE public.device_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own devices" ON public.device_connections;
DROP POLICY IF EXISTS "Users can insert own devices" ON public.device_connections;
DROP POLICY IF EXISTS "Users can update own devices" ON public.device_connections;
DROP POLICY IF EXISTS "Users can delete own devices" ON public.device_connections;

CREATE POLICY "Users can view own devices"
ON public.device_connections FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own devices"
ON public.device_connections FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own devices"
ON public.device_connections FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own devices"
ON public.device_connections FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.health_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'apple_health',
  status text NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  sample_count integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.health_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own health sync jobs" ON public.health_sync_jobs;
DROP POLICY IF EXISTS "Users can insert own health sync jobs" ON public.health_sync_jobs;
DROP POLICY IF EXISTS "Users can update own health sync jobs" ON public.health_sync_jobs;

CREATE POLICY "Users can view own health sync jobs"
ON public.health_sync_jobs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health sync jobs"
ON public.health_sync_jobs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health sync jobs"
ON public.health_sync_jobs FOR UPDATE TO authenticated
USING (auth.uid() = user_id);
