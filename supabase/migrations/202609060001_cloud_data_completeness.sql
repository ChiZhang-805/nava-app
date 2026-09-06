-- Make account-owned product state durable across devices and ensure account
-- deletion removes every row that can still identify the deleted user.

CREATE TABLE IF NOT EXISTS public.user_app_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'zh' CHECK (locale IN ('zh', 'en')),
  ai_speech_enabled boolean NOT NULL DEFAULT true,
  home_widget_ids jsonb NOT NULL DEFAULT '["sleep","focus","exercise","mood","diet"]'::jsonb
    CHECK (jsonb_typeof(home_widget_ids) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_notifications (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  category text NOT NULL CHECK (category IN ('sleep', 'nutrition', 'mood', 'focus', 'exercise', 'face', 'weekly', 'system')),
  source text NOT NULL CHECK (source IN ('contextual', 'record', 'native', 'system')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  body text NOT NULL CHECK (char_length(body) <= 4000),
  target jsonb,
  created_at timestamptz NOT NULL,
  read_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON public.user_notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_conversation_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  messages jsonb NOT NULL CHECK (jsonb_typeof(messages) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversation_archives_user_created_idx
  ON public.ai_conversation_archives (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.active_user_sessions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type text NOT NULL CHECK (session_type IN ('focus', 'sleep')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_type)
);

ALTER TABLE public.focus_records
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'ai'));

ALTER TABLE public.nutrition_records
  ADD COLUMN IF NOT EXISTS pantry_time time;

COMMENT ON TABLE public.user_app_preferences IS
  'Account-scoped UI preferences that should follow the user across NAVA clients.';
COMMENT ON TABLE public.user_notifications IS
  'Cross-device application inbox including read state and deletion tombstones.';
COMMENT ON TABLE public.ai_conversation_archives IS
  'User-created conversation snapshots used by the AI history sheet.';
COMMENT ON TABLE public.active_user_sessions IS
  'Recoverable in-progress focus and sleep sessions; local storage remains an offline cache.';
COMMENT ON COLUMN public.focus_records.note IS
  'User-authored note attached to a completed focus session.';
COMMENT ON COLUMN public.tasks.source IS
  'Whether the task was created manually or from a user-confirmed AI suggestion.';
COMMENT ON COLUMN public.nutrition_records.pantry_time IS
  'Local meal time for snacks or pantry entries; complements the three main meal time fields.';

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'user_app_preferences',
    'user_notifications',
    'ai_conversation_archives',
    'active_user_sessions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('DROP POLICY IF EXISTS "Users can view own %s" ON public.%I', target_table, target_table);
    EXECUTE format('DROP POLICY IF EXISTS "Users can insert own %s" ON public.%I', target_table, target_table);
    EXECUTE format('DROP POLICY IF EXISTS "Users can update own %s" ON public.%I', target_table, target_table);
    EXECUTE format('DROP POLICY IF EXISTS "Users can delete own %s" ON public.%I', target_table, target_table);
    EXECUTE format('CREATE POLICY "Users can view own %s" ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)', target_table, target_table);
    EXECUTE format('CREATE POLICY "Users can insert own %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', target_table, target_table);
    EXECUTE format('CREATE POLICY "Users can update own %s" ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', target_table, target_table);
    EXECUTE format('CREATE POLICY "Users can delete own %s" ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)', target_table, target_table);
  END LOOP;
END
$$;

DROP TRIGGER IF EXISTS update_user_app_preferences_updated_at ON public.user_app_preferences;
CREATE TRIGGER update_user_app_preferences_updated_at
  BEFORE UPDATE ON public.user_app_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_notifications_updated_at ON public.user_notifications;
CREATE TRIGGER update_user_notifications_updated_at
  BEFORE UPDATE ON public.user_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_conversation_archives_updated_at ON public.ai_conversation_archives;
CREATE TRIGGER update_ai_conversation_archives_updated_at
  BEFORE UPDATE ON public.ai_conversation_archives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_active_user_sessions_updated_at ON public.active_user_sessions;
CREATE TRIGGER update_active_user_sessions_updated_at
  BEFORE UPDATE ON public.active_user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Older tables predated the shared account-deletion contract. Every existing
-- row was audited before this migration and belongs to a current auth user.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('ai_conversations', 'ai_conversations_user_id_fkey'),
      ('community_bookmarks', 'community_bookmarks_user_id_fkey'),
      ('community_comments', 'community_comments_user_id_fkey'),
      ('community_likes', 'community_likes_user_id_fkey'),
      ('community_posts', 'community_posts_user_id_fkey'),
      ('exercise_records', 'exercise_records_user_id_fkey'),
      ('focus_records', 'focus_records_user_id_fkey'),
      ('focus_time_distribution', 'focus_time_distribution_user_id_fkey'),
      ('mood_records', 'mood_records_user_id_fkey'),
      ('sleep_records', 'sleep_records_user_id_fkey'),
      ('tasks', 'tasks_user_id_fkey')
    ) AS legacy(table_name, constraint_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = item.constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
        item.table_name,
        item.constraint_name
      );
    END IF;
  END LOOP;
END
$$;

-- Analytics are account data too. Do not retain a detached row after deletion.
ALTER TABLE public.analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_user_id_fkey;
ALTER TABLE public.analytics_events
  ADD CONSTRAINT analytics_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Fail the migration instead of claiming deletion completeness when any current
-- account-owned table lacks an auth.users cascade. Future user_id tables should
-- be added with the same contract and will be caught here during replay.
DO $$
DECLARE
  owned_table record;
BEGIN
  FOR owned_table IN
    SELECT columns.table_name
    FROM information_schema.columns
    WHERE columns.table_schema = 'public'
      AND columns.column_name = 'user_id'
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraints
      JOIN pg_attribute AS attributes
        ON attributes.attrelid = constraints.conrelid
       AND attributes.attnum = ANY(constraints.conkey)
      WHERE constraints.contype = 'f'
        AND constraints.conrelid = format('public.%I', owned_table.table_name)::regclass
        AND constraints.confrelid = 'auth.users'::regclass
        AND constraints.confdeltype = 'c'
        AND attributes.attname = 'user_id'
    ) THEN
      RAISE EXCEPTION 'Account deletion contract missing for public.%', owned_table.table_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraints
    JOIN pg_attribute AS attributes
      ON attributes.attrelid = constraints.conrelid
     AND attributes.attnum = ANY(constraints.conkey)
    WHERE constraints.contype = 'f'
      AND constraints.conrelid = 'public.profiles'::regclass
      AND constraints.confrelid = 'auth.users'::regclass
      AND constraints.confdeltype = 'c'
      AND attributes.attname = 'id'
  ) THEN
    RAISE EXCEPTION 'Account deletion contract missing for public.profiles';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(BTRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(BTRIM(NEW.email), ''),
      NULLIF(BTRIM(NEW.phone), ''),
      'NAVA 用户'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Repair confirmed legacy accounts that existed before the profile trigger or
-- whose client-side best-effort profile creation previously failed.
INSERT INTO public.profiles (id, username)
SELECT
  users.id,
  COALESCE(
    NULLIF(BTRIM(users.raw_user_meta_data->>'full_name'), ''),
    NULLIF(BTRIM(users.email), ''),
    NULLIF(BTRIM(users.phone), ''),
    'NAVA 用户'
  )
FROM auth.users AS users
LEFT JOIN public.profiles AS profiles ON profiles.id = users.id
WHERE profiles.id IS NULL
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'user_app_preferences',
    'user_notifications',
    'ai_conversation_archives',
    'active_user_sessions'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND pg_publication_tables.tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
    END IF;
  END LOOP;
END
$$;
