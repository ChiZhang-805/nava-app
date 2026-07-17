-- NAVA rhythm algorithm v2 persistence.
-- Keeps the algorithm output explainable and shareable across App, Watch, and Web.

CREATE TABLE IF NOT EXISTS public.health_metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  latest_heart_rate numeric,
  resting_heart_rate numeric,
  heart_rate_variability_sdnn numeric,
  blood_oxygen numeric,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'apple_health',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, record_date, source)
);

ALTER TABLE public.health_metric_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own health metric snapshots" ON public.health_metric_snapshots;
DROP POLICY IF EXISTS "Users can insert own health metric snapshots" ON public.health_metric_snapshots;
DROP POLICY IF EXISTS "Users can update own health metric snapshots" ON public.health_metric_snapshots;
DROP POLICY IF EXISTS "Users can delete own health metric snapshots" ON public.health_metric_snapshots;

CREATE POLICY "Users can view own health metric snapshots"
ON public.health_metric_snapshots FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health metric snapshots"
ON public.health_metric_snapshots FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health metric snapshots"
ON public.health_metric_snapshots FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health metric snapshots"
ON public.health_metric_snapshots FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_health_metric_snapshots_updated_at ON public.health_metric_snapshots;
CREATE TRIGGER update_health_metric_snapshots_updated_at
BEFORE UPDATE ON public.health_metric_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.daily_rhythm_scores
ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS anomaly_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS profile_labels jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS phase_shift_minutes numeric,
ADD COLUMN IF NOT EXISTS regularity_score numeric,
ADD COLUMN IF NOT EXISTS fragmentation_score numeric,
ADD COLUMN IF NOT EXISTS recovery_score numeric;
