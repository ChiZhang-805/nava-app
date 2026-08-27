-- NAVA-FDNB Health research adapter, product workflows, and audit contracts.

ALTER TABLE public.nutrition_records
ADD COLUMN IF NOT EXISTS protein_grams numeric CHECK (protein_grams IS NULL OR protein_grams >= 0),
ADD COLUMN IF NOT EXISTS carbohydrate_grams numeric CHECK (carbohydrate_grams IS NULL OR carbohydrate_grams >= 0),
ADD COLUMN IF NOT EXISTS fat_grams numeric CHECK (fat_grams IS NULL OR fat_grams >= 0),
ADD COLUMN IF NOT EXISTS hydration_ml numeric CHECK (hydration_ml IS NULL OR hydration_ml >= 0),
ADD COLUMN IF NOT EXISTS health_rating smallint CHECK (health_rating BETWEEN 1 AND 5);

ALTER TABLE public.face_records
ADD COLUMN IF NOT EXISTS capture_mode text NOT NULL DEFAULT 'bare_face' CHECK (capture_mode IN ('bare_face', 'makeup')),
ADD COLUMN IF NOT EXISTS analysis_confidence numeric CHECK (analysis_confidence IS NULL OR analysis_confidence BETWEEN 0 AND 1),
ADD COLUMN IF NOT EXISTS derived_features jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.focus_records
ADD COLUMN IF NOT EXISTS interrupted_sessions integer NOT NULL DEFAULT 0 CHECK (interrupted_sessions >= 0),
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS ended_at timestamptz;

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
ADD COLUMN IF NOT EXISTS reminder_at timestamptz,
ADD COLUMN IF NOT EXISTS category text;

CREATE TABLE IF NOT EXISTS public.health_feature_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  schema_version text NOT NULL,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  feature_count integer NOT NULL DEFAULT 0 CHECK (feature_count >= 0),
  data_quality numeric NOT NULL DEFAULT 0 CHECK (data_quality BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, record_date, schema_version)
);

CREATE TABLE IF NOT EXISTS public.fdnb_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_start date NOT NULL,
  analysis_end date NOT NULL,
  report_start date NOT NULL,
  report_end date NOT NULL,
  status text NOT NULL CHECK (status IN ('ready', 'insufficient_data', 'unavailable')),
  evidence_level text CHECK (evidence_level IS NULL OR evidence_level IN ('supported', 'candidate', 'no_support')),
  stability_score numeric CHECK (stability_score IS NULL OR stability_score BETWEEN 0 AND 100),
  transition_score numeric CHECK (transition_score IS NULL OR transition_score BETWEEN 0 AND 100),
  peak_score numeric CHECK (peak_score IS NULL OR peak_score BETWEEN 0 AND 100),
  confidence numeric CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  data_quality numeric CHECK (data_quality IS NULL OR data_quality BETWEEN 0 AND 1),
  accepted boolean NOT NULL DEFAULT false,
  peak jsonb NOT NULL DEFAULT '{}'::jsonb,
  contributors jsonb NOT NULL DEFAULT '[]'::jsonb,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  model_version text NOT NULL,
  schema_version text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_end, model_version)
);

CREATE TABLE IF NOT EXISTS public.weekly_health_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  status text NOT NULL CHECK (status IN ('ready', 'insufficient_data', 'unavailable')),
  score numeric CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  confidence numeric CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  evidence_level text CHECK (evidence_level IS NULL OR evidence_level IN ('supported', 'candidate', 'no_support')),
  summary text,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  algorithm_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_version text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start, week_end)
);

CREATE TABLE IF NOT EXISTS public.fdnb_recompute_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_date date NOT NULL,
  source_table text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, requested_date)
);

CREATE TABLE IF NOT EXISTS public.record_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('sleep', 'exercise', 'mood', 'nutrition', 'focus', 'face')),
  record_date date NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'editing' CHECK (status IN ('editing', 'confirmed', 'discarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module, record_date)
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('sleep', 'nutrition', 'mood', 'focus', 'weekly_report', 'fdnb_signal')),
  enabled boolean NOT NULL DEFAULT false,
  local_time time,
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  last_scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_type)
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  event_name text NOT NULL CHECK (char_length(event_name) BETWEEN 1 AND 80),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_reward_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  points integer NOT NULL CHECK (points > 0),
  source text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);

CREATE TABLE IF NOT EXISTS public.growth_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS health_feature_snapshots_user_date_idx ON public.health_feature_snapshots (user_id, record_date DESC);
CREATE INDEX IF NOT EXISTS fdnb_health_scores_user_report_idx ON public.fdnb_health_scores (user_id, report_end DESC);
CREATE INDEX IF NOT EXISTS weekly_health_reports_user_week_idx ON public.weekly_health_reports (user_id, week_end DESC);
CREATE INDEX IF NOT EXISTS fdnb_recompute_jobs_pending_idx ON public.fdnb_recompute_jobs (status, updated_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS analytics_events_user_time_idx ON public.analytics_events (user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_rate_limit_windows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, window_start)
);
ALTER TABLE public.ai_rate_limit_windows ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.nava_consume_ai_quota(p_limit integer DEFAULT 20)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid := auth.uid();
  target_window timestamptz := date_trunc('minute', now());
  new_count integer;
BEGIN
  IF target_user IS NULL THEN RETURN false; END IF;
  INSERT INTO public.ai_rate_limit_windows (user_id, window_start, request_count)
  VALUES (target_user, target_window, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET request_count = public.ai_rate_limit_windows.request_count + 1
  RETURNING request_count INTO new_count;
  RETURN new_count <= greatest(1, least(p_limit, 60));
END;
$$;
REVOKE ALL ON FUNCTION public.nava_consume_ai_quota(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nava_consume_ai_quota(integer) TO authenticated;

ALTER TABLE public.health_feature_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fdnb_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_health_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fdnb_recompute_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_reward_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_badges ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'health_feature_snapshots', 'fdnb_health_scores', 'weekly_health_reports',
    'fdnb_recompute_jobs', 'record_drafts', 'notification_preferences', 'analytics_events'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Users can view own %1$s" ON public.%1$I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Users can insert own %1$s" ON public.%1$I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Users can update own %1$s" ON public.%1$I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Users can delete own %1$s" ON public.%1$I', table_name);
    EXECUTE format('CREATE POLICY "Users can view own %1$s" ON public.%1$I FOR SELECT TO authenticated USING (auth.uid() = user_id)', table_name);
    EXECUTE format('CREATE POLICY "Users can insert own %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', table_name);
    EXECUTE format('CREATE POLICY "Users can update own %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', table_name);
    EXECUTE format('CREATE POLICY "Users can delete own %1$s" ON public.%1$I FOR DELETE TO authenticated USING (auth.uid() = user_id)', table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Users can view own growth rewards" ON public.growth_reward_ledger;
CREATE POLICY "Users can view own growth rewards" ON public.growth_reward_ledger FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view own growth badges" ON public.growth_badges;
CREATE POLICY "Users can view own growth badges" ON public.growth_badges FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.nava_reconcile_growth_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid := auth.uid();
  target_date date := CURRENT_DATE;
  total_points integer;
  badges jsonb;
BEGIN
  IF target_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, 'profile:foundation', 30, 'verified_profile'
  WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user AND nullif(trim(username), '') IS NOT NULL AND nullif(trim(occupation), '') IS NOT NULL AND nullif(trim(age_group), '') IS NOT NULL)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, 'profile:goal', 30, 'verified_profile'
  WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user AND nullif(trim(goal), '') IS NOT NULL)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':sleep', 25, 'verified_record'
  WHERE EXISTS (SELECT 1 FROM public.sleep_records WHERE user_id = target_user AND record_date = target_date)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':exercise', 25, 'verified_record'
  WHERE EXISTS (SELECT 1 FROM public.exercise_records WHERE user_id = target_user AND record_date = target_date AND (coalesce(exercise_minutes, 0) >= 20 OR coalesce(steps, 0) >= 3000))
  ON CONFLICT DO NOTHING;
  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':mood', 20, 'verified_record'
  WHERE EXISTS (SELECT 1 FROM public.mood_records WHERE user_id = target_user AND record_date = target_date)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':nutrition', 20, 'verified_record'
  WHERE EXISTS (SELECT 1 FROM public.nutrition_records WHERE user_id = target_user AND record_date = target_date)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':focus', 20, 'verified_record'
  WHERE EXISTS (SELECT 1 FROM public.focus_records WHERE user_id = target_user AND record_date = target_date GROUP BY user_id, record_date HAVING sum(coalesce(total_minutes, 0)) >= 25)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':face', 15, 'verified_record'
  WHERE EXISTS (SELECT 1 FROM public.face_records WHERE user_id = target_user AND record_date = target_date)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source, metadata)
  SELECT target_user, target_date || ':bare-face-bonus', 15, 'verified_record', '{"multiplier":2}'::jsonb
  WHERE EXISTS (SELECT 1 FROM public.face_records WHERE user_id = target_user AND record_date = target_date AND capture_mode = 'bare_face')
  ON CONFLICT DO NOTHING;

  SELECT coalesce(sum(points), 0) INTO total_points FROM public.growth_reward_ledger WHERE user_id = target_user;
  IF total_points >= 100 THEN
    INSERT INTO public.growth_badges (user_id, badge_key, metadata) VALUES (target_user, 'rhythm_observer', jsonb_build_object('points', total_points)) ON CONFLICT DO NOTHING;
  END IF;
  IF (SELECT count(DISTINCT record_date) FROM public.face_records WHERE user_id = target_user AND capture_mode = 'bare_face' AND record_date BETWEEN target_date - 6 AND target_date) = 7 THEN
    INSERT INTO public.growth_badges (user_id, badge_key, metadata) VALUES (target_user, 'bare_face_week', '{"days":7}'::jsonb) ON CONFLICT DO NOTHING;
  END IF;
  SELECT coalesce(jsonb_agg(badge_key ORDER BY awarded_at), '[]'::jsonb) INTO badges FROM public.growth_badges WHERE user_id = target_user;
  RETURN jsonb_build_object('totalPoints', total_points, 'badges', badges);
END;
$$;

REVOKE ALL ON FUNCTION public.nava_reconcile_growth_rewards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nava_reconcile_growth_rewards() TO authenticated;

CREATE OR REPLACE FUNCTION public.nava_enqueue_fdnb_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid;
  target_date date;
BEGIN
  target_user := COALESCE(NEW.user_id, OLD.user_id);
  target_date := COALESCE(NEW.record_date, OLD.record_date, CURRENT_DATE);
  INSERT INTO public.fdnb_recompute_jobs (user_id, requested_date, source_table, status, updated_at, completed_at)
  VALUES (target_user, target_date, TG_TABLE_NAME, 'pending', now(), NULL)
  ON CONFLICT (user_id, requested_date)
  DO UPDATE SET source_table = EXCLUDED.source_table, status = 'pending', updated_at = now(), completed_at = NULL, last_error = NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'mood_records', 'sleep_records', 'exercise_records', 'nutrition_records',
    'focus_records', 'face_records', 'health_metric_snapshots'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS enqueue_fdnb_recompute ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER enqueue_fdnb_recompute AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.nava_enqueue_fdnb_recompute()',
      table_name
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.fdnb_health_scores IS 'Research-only NAVA-FDNB Health outputs; never a medical diagnosis.';
COMMENT ON COLUMN public.face_records.derived_features IS 'Privacy-safe scalar derivatives only; raw image bytes must never be copied here.';
