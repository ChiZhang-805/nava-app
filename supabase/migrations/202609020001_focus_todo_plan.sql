-- Persist the user-authored focus plan instead of keeping session count only
-- in browser metadata. Existing tasks remain valid and acquire no fake plan.

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS focus_sessions smallint
CHECK (focus_sessions IS NULL OR focus_sessions BETWEEN 1 AND 12);

COMMENT ON COLUMN public.tasks.focus_sessions IS
'Number of focus sessions explicitly planned by the task owner; completion is reconciled against real focus_records.';
