-- Durable per-user progress-page acknowledgement state.
-- Reading and acknowledging are separate so React development remounts cannot
-- consume an animation before the active screen has rendered it.

CREATE TABLE IF NOT EXISTS public.growth_progress_views (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  seen_points integer NOT NULL DEFAULT 0 CHECK (seen_points >= 0),
  seen_task_keys jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(seen_task_keys) = 'array'),
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.growth_progress_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own growth progress state" ON public.growth_progress_views;
CREATE POLICY "Users can view own growth progress state"
ON public.growth_progress_views
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.nava_current_growth_task_keys(target_user uuid, target_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(task_key ORDER BY task_key), '[]'::jsonb)
  FROM (
    SELECT DISTINCT CASE
      WHEN event_key = 'profile:foundation' THEN 'profile-foundation'
      WHEN event_key = 'profile:goal' THEN 'profile-goal'
      WHEN event_key = target_date::text || ':sleep' THEN target_date::text || ':sleep-window'
      WHEN event_key = target_date::text || ':exercise' THEN target_date::text || ':move-break'
      WHEN event_key = target_date::text || ':mood' THEN target_date::text || ':mood-checkin'
      WHEN event_key = target_date::text || ':nutrition' THEN target_date::text || ':nutrition-log'
      WHEN event_key = target_date::text || ':focus' THEN target_date::text || ':focus-block'
      WHEN event_key = target_date::text || ':face' THEN target_date::text || ':face-check'
      ELSE NULL
    END AS task_key
    FROM public.growth_reward_ledger
    WHERE user_id = target_user
  ) mapped
  WHERE task_key IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.nava_read_growth_progress()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid := auth.uid();
  target_date date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  current_points integer;
  current_task_keys jsonb;
  previous_points integer;
  previous_task_keys jsonb;
  new_task_keys jsonb;
BEGIN
  IF target_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT coalesce(sum(points), 0)
  INTO current_points
  FROM public.growth_reward_ledger
  WHERE user_id = target_user;

  current_task_keys := public.nava_current_growth_task_keys(target_user, target_date);

  SELECT seen_points, seen_task_keys
  INTO previous_points, previous_task_keys
  FROM public.growth_progress_views
  WHERE user_id = target_user;

  IF NOT FOUND THEN
    INSERT INTO public.growth_progress_views (user_id, seen_points, seen_task_keys)
    VALUES (target_user, current_points, current_task_keys)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN jsonb_build_object(
      'isFirstVisit', true,
      'previousPoints', current_points,
      'currentPoints', current_points,
      'delta', 0,
      'currentTaskKeys', current_task_keys,
      'newTaskKeys', '[]'::jsonb
    );
  END IF;

  previous_points := least(previous_points, current_points);
  SELECT coalesce(jsonb_agg(task_key ORDER BY task_key), '[]'::jsonb)
  INTO new_task_keys
  FROM jsonb_array_elements_text(current_task_keys) AS current_keys(task_key)
  WHERE NOT (previous_task_keys ? task_key);

  RETURN jsonb_build_object(
    'isFirstVisit', false,
    'previousPoints', previous_points,
    'currentPoints', current_points,
    'delta', greatest(current_points - previous_points, 0),
    'currentTaskKeys', current_task_keys,
    'newTaskKeys', new_task_keys
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.nava_ack_growth_progress(
  acknowledged_points integer,
  acknowledged_task_keys jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid := auth.uid();
  target_date date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  current_points integer;
  current_task_keys jsonb;
  safe_task_keys jsonb;
BEGIN
  IF target_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF acknowledged_points IS NULL OR acknowledged_points < 0 THEN RAISE EXCEPTION 'invalid acknowledged points'; END IF;
  IF acknowledged_task_keys IS NULL OR jsonb_typeof(acknowledged_task_keys) <> 'array' THEN
    RAISE EXCEPTION 'invalid acknowledged task keys';
  END IF;

  SELECT coalesce(sum(points), 0)
  INTO current_points
  FROM public.growth_reward_ledger
  WHERE user_id = target_user;

  current_task_keys := public.nava_current_growth_task_keys(target_user, target_date);
  SELECT coalesce(jsonb_agg(task_key ORDER BY task_key), '[]'::jsonb)
  INTO safe_task_keys
  FROM jsonb_array_elements_text(acknowledged_task_keys) AS acknowledged(task_key)
  WHERE current_task_keys ? task_key;

  INSERT INTO public.growth_progress_views (user_id, seen_points, seen_task_keys, updated_at)
  VALUES (target_user, least(acknowledged_points, current_points), safe_task_keys, now())
  ON CONFLICT (user_id) DO UPDATE
  SET seen_points = EXCLUDED.seen_points,
      seen_task_keys = EXCLUDED.seen_task_keys,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.nava_current_growth_task_keys(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nava_read_growth_progress() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nava_ack_growth_progress(integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nava_read_growth_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.nava_ack_growth_progress(integer, jsonb) TO authenticated;

