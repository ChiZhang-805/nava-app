-- NAVA Fusion v3 persistence.
-- Adds structured hourly activity and sleep stage inputs for non-linear rhythm fusion.

ALTER TABLE public.health_metric_snapshots
ADD COLUMN IF NOT EXISTS activity_bins jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS sleep_stage_minutes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.daily_rhythm_scores
ADD COLUMN IF NOT EXISTS fusion jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS circadian_score numeric,
ADD COLUMN IF NOT EXISTS data_quality_score numeric;
