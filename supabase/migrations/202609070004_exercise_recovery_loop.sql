-- Structured exercise self-assessment, auditable recovery estimates, and a
-- third recoverable active-session type. This migration is append-only.

ALTER TABLE public.exercise_records
  ADD COLUMN IF NOT EXISTS soreness_level smallint,
  ADD COLUMN IF NOT EXISTS fatigue_level smallint,
  ADD COLUMN IF NOT EXISTS has_injury boolean,
  ADD COLUMN IF NOT EXISTS injury_note text,
  ADD COLUMN IF NOT EXISTS recovery_estimate_min_hours integer,
  ADD COLUMN IF NOT EXISTS recovery_estimate_max_hours integer,
  ADD COLUMN IF NOT EXISTS recovery_estimate_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS recovery_estimate_basis jsonb,
  ADD COLUMN IF NOT EXISTS recovery_status text,
  ADD COLUMN IF NOT EXISTS recovery_checked_at timestamptz;

ALTER TABLE public.exercise_records
  DROP CONSTRAINT IF EXISTS exercise_records_soreness_level_check,
  ADD CONSTRAINT exercise_records_soreness_level_check CHECK (soreness_level IS NULL OR soreness_level BETWEEN 0 AND 10),
  DROP CONSTRAINT IF EXISTS exercise_records_fatigue_level_check,
  ADD CONSTRAINT exercise_records_fatigue_level_check CHECK (fatigue_level IS NULL OR fatigue_level BETWEEN 0 AND 10),
  DROP CONSTRAINT IF EXISTS exercise_records_recovery_estimate_range_check,
  ADD CONSTRAINT exercise_records_recovery_estimate_range_check CHECK (
    (recovery_estimate_min_hours IS NULL AND recovery_estimate_max_hours IS NULL)
    OR (recovery_estimate_min_hours BETWEEN 0 AND 168 AND recovery_estimate_max_hours BETWEEN recovery_estimate_min_hours AND 168)
  ),
  DROP CONSTRAINT IF EXISTS exercise_records_recovery_estimate_confidence_check,
  ADD CONSTRAINT exercise_records_recovery_estimate_confidence_check CHECK (recovery_estimate_confidence IS NULL OR recovery_estimate_confidence BETWEEN 0 AND 1),
  DROP CONSTRAINT IF EXISTS exercise_records_recovery_estimate_basis_check,
  ADD CONSTRAINT exercise_records_recovery_estimate_basis_check CHECK (recovery_estimate_basis IS NULL OR jsonb_typeof(recovery_estimate_basis) = 'object'),
  DROP CONSTRAINT IF EXISTS exercise_records_recovery_status_check,
  ADD CONSTRAINT exercise_records_recovery_status_check CHECK (recovery_status IS NULL OR recovery_status IN ('recovered', 'improving', 'not_recovered'));

ALTER TABLE public.active_user_sessions
  DROP CONSTRAINT IF EXISTS active_user_sessions_session_type_check,
  ADD CONSTRAINT active_user_sessions_session_type_check CHECK (session_type IN ('focus', 'sleep', 'exercise'));

COMMENT ON COLUMN public.exercise_records.soreness_level IS 'User-confirmed post-exercise muscle soreness from 0 to 10.';
COMMENT ON COLUMN public.exercise_records.fatigue_level IS 'User-confirmed post-exercise fatigue from 0 to 10.';
COMMENT ON COLUMN public.exercise_records.has_injury IS 'User flag for an injury or limiting discomfort; not a diagnosis.';
COMMENT ON COLUMN public.exercise_records.recovery_estimate_basis IS 'Auditable non-diagnostic rule inputs and version for the displayed recovery estimate.';
COMMENT ON COLUMN public.exercise_records.recovery_status IS 'Later user check-in: recovered, improving, or not_recovered.';
COMMENT ON TABLE public.active_user_sessions IS 'Recoverable in-progress focus, sleep, and exercise sessions; local storage remains an offline cache.';

