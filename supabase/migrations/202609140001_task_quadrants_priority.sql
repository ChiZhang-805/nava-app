-- User-authored importance/urgency and explicitly accepted AI task order.
-- NULL means the user has not classified or ordered this task; existing tasks
-- must not acquire inferred priorities during the migration.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS important boolean,
  ADD COLUMN IF NOT EXISTS urgent boolean,
  ADD COLUMN IF NOT EXISTS priority_rank smallint;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_quadrant_pair_check
    CHECK ((important IS NULL AND urgent IS NULL) OR (important IS NOT NULL AND urgent IS NOT NULL)),
  ADD CONSTRAINT tasks_priority_rank_check
    CHECK (priority_rank IS NULL OR priority_rank BETWEEN 1 AND 12);

COMMENT ON COLUMN public.tasks.important IS 'Owner-selected importance; NULL means not classified.';
COMMENT ON COLUMN public.tasks.urgent IS 'Owner-selected urgency; NULL means not classified.';
COMMENT ON COLUMN public.tasks.priority_rank IS 'Owner-confirmed suggested order; NULL means no accepted order.';

CREATE OR REPLACE FUNCTION public.nava_set_task_priority_order(task_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  expected_count integer := coalesce(array_length(task_ids, 1), 0);
  eligible_count integer;
  written_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF expected_count < 2 OR expected_count > 12 OR array_position(task_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A priority order requires 2 to 12 valid tasks';
  END IF;
  IF (SELECT count(DISTINCT task_id) FROM unnest(task_ids) AS requested(task_id)) <> expected_count THEN
    RAISE EXCEPTION 'Priority order contains duplicate tasks';
  END IF;

  -- This lock and the subsequent update run in one transaction. RLS still
  -- applies because the function runs as the caller, not as a service role.
  SELECT count(*) INTO eligible_count
  FROM (
    SELECT id FROM public.tasks
    WHERE id = ANY(task_ids)
      AND user_id = auth.uid()
      AND category = 'todo'
      AND completed = false
    FOR UPDATE
  ) AS owned_tasks;
  IF eligible_count <> expected_count THEN
    RAISE EXCEPTION 'One or more tasks are unavailable';
  END IF;

  UPDATE public.tasks AS task
  SET priority_rank = ordered.ordinality::smallint
  FROM unnest(task_ids) WITH ORDINALITY AS ordered(id, ordinality)
  WHERE task.id = ordered.id
    AND task.user_id = auth.uid()
    AND task.category = 'todo'
    AND task.completed = false;
  GET DIAGNOSTICS written_count = ROW_COUNT;
  IF written_count <> expected_count THEN
    RAISE EXCEPTION 'Priority order was not fully saved';
  END IF;
  RETURN written_count;
END;
$$;

REVOKE ALL ON FUNCTION public.nava_set_task_priority_order(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nava_set_task_priority_order(uuid[]) TO authenticated;
