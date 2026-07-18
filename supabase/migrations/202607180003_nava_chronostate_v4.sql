-- NAVA ChronoState v4 persistence and longitudinal data quality contract.

ALTER TABLE public.health_metric_snapshots
ADD COLUMN IF NOT EXISTS sleep_start_at timestamptz,
ADD COLUMN IF NOT EXISTS sleep_end_at timestamptz,
ADD COLUMN IF NOT EXISTS sleep_efficiency numeric,
ADD COLUMN IF NOT EXISTS timezone_offset_minutes integer,
ADD COLUMN IF NOT EXISTS activity_coverage_hours numeric,
ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.daily_rhythm_scores
ADD COLUMN IF NOT EXISTS score_lower numeric,
ADD COLUMN IF NOT EXISTS score_upper numeric,
ADD COLUMN IF NOT EXISTS latent_state jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS change_point_probability numeric,
ADD COLUMN IF NOT EXISTS trend_slope numeric,
ADD COLUMN IF NOT EXISTS schema_version text;

CREATE INDEX IF NOT EXISTS health_metric_snapshots_user_date_idx
ON public.health_metric_snapshots (user_id, record_date DESC);

CREATE INDEX IF NOT EXISTS daily_rhythm_scores_user_date_idx
ON public.daily_rhythm_scores (user_id, record_date DESC);

CREATE INDEX IF NOT EXISTS mood_records_user_date_idx
ON public.mood_records (user_id, record_date DESC);

CREATE INDEX IF NOT EXISTS sleep_records_user_date_idx
ON public.sleep_records (user_id, record_date DESC);

CREATE INDEX IF NOT EXISTS exercise_records_user_date_idx
ON public.exercise_records (user_id, record_date DESC);

CREATE INDEX IF NOT EXISTS nutrition_records_user_date_idx
ON public.nutrition_records (user_id, record_date DESC);

CREATE INDEX IF NOT EXISTS focus_records_user_date_idx
ON public.focus_records (user_id, record_date DESC);

CREATE TABLE IF NOT EXISTS public.rhythm_outcome_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  perceived_energy smallint CHECK (perceived_energy BETWEEN 1 AND 5),
  perceived_recovery smallint CHECK (perceived_recovery BETWEEN 1 AND 5),
  perceived_focus smallint CHECK (perceived_focus BETWEEN 1 AND 5),
  recommendation_helpful boolean,
  note text,
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, record_date)
);

ALTER TABLE public.rhythm_outcome_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own rhythm feedback" ON public.rhythm_outcome_feedback;
DROP POLICY IF EXISTS "Users can insert own rhythm feedback" ON public.rhythm_outcome_feedback;
DROP POLICY IF EXISTS "Users can update own rhythm feedback" ON public.rhythm_outcome_feedback;
DROP POLICY IF EXISTS "Users can delete own rhythm feedback" ON public.rhythm_outcome_feedback;

CREATE POLICY "Users can view own rhythm feedback"
ON public.rhythm_outcome_feedback FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rhythm feedback"
ON public.rhythm_outcome_feedback FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rhythm feedback"
ON public.rhythm_outcome_feedback FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own rhythm feedback"
ON public.rhythm_outcome_feedback FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_rhythm_outcome_feedback_updated_at ON public.rhythm_outcome_feedback;
CREATE TRIGGER update_rhythm_outcome_feedback_updated_at
BEFORE UPDATE ON public.rhythm_outcome_feedback
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS rhythm_outcome_feedback_user_date_idx
ON public.rhythm_outcome_feedback (user_id, record_date DESC);
