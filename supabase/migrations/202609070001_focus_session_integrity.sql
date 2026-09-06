-- Preserve each completed focus session and update daily aggregates atomically.

CREATE TABLE IF NOT EXISTS public.focus_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  source_action_id text NOT NULL CHECK (char_length(source_action_id) BETWEEN 8 AND 128),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'watch')),
  record_date date NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
  interruptions integer NOT NULL DEFAULT 0 CHECK (interruptions >= 0),
  category text,
  started_at timestamptz,
  ended_at timestamptz NOT NULL,
  local_hour smallint NOT NULL CHECK (local_hour BETWEEN 0 AND 23),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_action_id)
);

CREATE INDEX IF NOT EXISTS focus_session_events_user_date_idx
  ON public.focus_session_events (user_id, record_date DESC, ended_at DESC);

ALTER TABLE public.focus_session_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON TABLE public.focus_session_events TO authenticated;

DROP POLICY IF EXISTS "Users can view own focus session events" ON public.focus_session_events;
DROP POLICY IF EXISTS "Users can insert own focus session events" ON public.focus_session_events;
DROP POLICY IF EXISTS "Users can delete own focus session events" ON public.focus_session_events;

CREATE POLICY "Users can view own focus session events"
  ON public.focus_session_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own focus session events"
  ON public.focus_session_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own focus session events"
  ON public.focus_session_events FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_focus_session(
  p_source_action_id text,
  p_task_id uuid,
  p_record_date date,
  p_minutes integer,
  p_interruptions integer,
  p_category text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_local_hour integer,
  p_note text,
  p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_user uuid := auth.uid();
  inserted_event uuid;
  existing_focus public.focus_records%ROWTYPE;
  saved_focus public.focus_records%ROWTYPE;
  existing_distribution public.focus_time_distribution%ROWTYPE;
  distribution_period text;
BEGIN
  IF target_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_source_action_id IS NULL OR char_length(p_source_action_id) NOT BETWEEN 8 AND 128 THEN RAISE EXCEPTION 'invalid source action id'; END IF;
  IF p_minutes IS NULL OR p_minutes <= 0 OR p_minutes > 1440 THEN RAISE EXCEPTION 'invalid focus minutes'; END IF;
  IF p_local_hour IS NULL OR p_local_hour NOT BETWEEN 0 AND 23 THEN RAISE EXCEPTION 'invalid local hour'; END IF;
  IF p_source NOT IN ('manual', 'ai', 'watch') THEN RAISE EXCEPTION 'invalid focus source'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = p_task_id AND user_id = target_user) THEN RAISE EXCEPTION 'task not owned by current user'; END IF;

  -- One lock serializes every aggregate mutation for this user's local date.
  PERFORM pg_advisory_xact_lock(hashtextextended(target_user::text || ':' || p_record_date::text, 0));

  INSERT INTO public.focus_session_events (
    user_id, task_id, source_action_id, source, record_date, duration_minutes,
    interruptions, category, started_at, ended_at, local_hour, note
  ) VALUES (
    target_user, p_task_id, p_source_action_id, p_source, p_record_date, p_minutes,
    greatest(0, coalesce(p_interruptions, 0)), nullif(btrim(p_category), ''),
    p_started_at, coalesce(p_ended_at, now()), p_local_hour, nullif(btrim(p_note), '')
  )
  ON CONFLICT (user_id, source_action_id) DO NOTHING
  RETURNING id INTO inserted_event;

  IF inserted_event IS NULL THEN
    SELECT * INTO saved_focus
    FROM public.focus_records
    WHERE user_id = target_user AND record_date = p_record_date AND task_id = p_task_id
    ORDER BY updated_at DESC
    LIMIT 1;
    RETURN jsonb_build_object('applied', false, 'duplicate', true, 'record', to_jsonb(saved_focus));
  END IF;

  SELECT * INTO existing_focus
  FROM public.focus_records
  WHERE user_id = target_user AND record_date = p_record_date AND task_id = p_task_id
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF existing_focus.id IS NULL THEN
    INSERT INTO public.focus_records (
      user_id, task_id, record_date, completed_sessions, total_minutes,
      interrupted_sessions, category, started_at, ended_at, note
    ) VALUES (
      target_user, p_task_id, p_record_date, 1, p_minutes,
      greatest(0, coalesce(p_interruptions, 0)), nullif(btrim(p_category), ''),
      p_started_at, coalesce(p_ended_at, now()), nullif(btrim(p_note), '')
    ) RETURNING * INTO saved_focus;
  ELSE
    UPDATE public.focus_records SET
      completed_sessions = coalesce(completed_sessions, 0) + 1,
      total_minutes = coalesce(total_minutes, 0) + p_minutes,
      interrupted_sessions = coalesce(interrupted_sessions, 0) + greatest(0, coalesce(p_interruptions, 0)),
      category = coalesce(nullif(btrim(p_category), ''), category),
      started_at = coalesce(started_at, p_started_at),
      ended_at = coalesce(p_ended_at, now()),
      note = coalesce(nullif(btrim(p_note), ''), note),
      updated_at = now()
    WHERE id = existing_focus.id
    RETURNING * INTO saved_focus;
  END IF;

  distribution_period := CASE
    WHEN p_local_hour < 6 THEN 'period_0_6'
    WHEN p_local_hour < 12 THEN 'period_6_12'
    WHEN p_local_hour < 18 THEN 'period_12_18'
    ELSE 'period_18_24'
  END;

  SELECT * INTO existing_distribution
  FROM public.focus_time_distribution
  WHERE user_id = target_user AND record_date = p_record_date
  LIMIT 1
  FOR UPDATE;

  IF existing_distribution.id IS NULL THEN
    INSERT INTO public.focus_time_distribution (
      user_id, record_date, period_0_6, period_6_12, period_12_18, period_18_24
    ) VALUES (
      target_user, p_record_date,
      CASE WHEN distribution_period = 'period_0_6' THEN p_minutes ELSE 0 END,
      CASE WHEN distribution_period = 'period_6_12' THEN p_minutes ELSE 0 END,
      CASE WHEN distribution_period = 'period_12_18' THEN p_minutes ELSE 0 END,
      CASE WHEN distribution_period = 'period_18_24' THEN p_minutes ELSE 0 END
    );
  ELSE
    UPDATE public.focus_time_distribution SET
      period_0_6 = coalesce(period_0_6, 0) + CASE WHEN distribution_period = 'period_0_6' THEN p_minutes ELSE 0 END,
      period_6_12 = coalesce(period_6_12, 0) + CASE WHEN distribution_period = 'period_6_12' THEN p_minutes ELSE 0 END,
      period_12_18 = coalesce(period_12_18, 0) + CASE WHEN distribution_period = 'period_12_18' THEN p_minutes ELSE 0 END,
      period_18_24 = coalesce(period_18_24, 0) + CASE WHEN distribution_period = 'period_18_24' THEN p_minutes ELSE 0 END
    WHERE id = existing_distribution.id;
  END IF;

  RETURN jsonb_build_object('applied', true, 'record', to_jsonb(saved_focus));
END;
$$;

REVOKE ALL ON FUNCTION public.record_focus_session(text, uuid, date, integer, integer, text, timestamptz, timestamptz, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_focus_session(text, uuid, date, integer, integer, text, timestamptz, timestamptz, integer, text, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'focus_session_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.focus_session_events';
  END IF;
END
$$;
