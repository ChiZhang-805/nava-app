-- Keep chat history isolated at the database boundary even if a client is modified.
DO $$
DECLARE
  existing_policy text;
BEGIN
  IF to_regclass('public.ai_conversations') IS NULL THEN
    RAISE NOTICE 'public.ai_conversations does not exist yet; skipping its RLS policy refresh';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY';
  EXECUTE 'CREATE INDEX IF NOT EXISTS ai_conversations_user_created_idx ON public.ai_conversations (user_id, created_at DESC)';

  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_conversations'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.ai_conversations', existing_policy);
  END LOOP;

  EXECUTE 'CREATE POLICY "Users can view own AI conversations" ON public.ai_conversations FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  EXECUTE 'CREATE POLICY "Users can insert own AI conversations" ON public.ai_conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  EXECUTE 'CREATE POLICY "Users can update own AI conversations" ON public.ai_conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  EXECUTE 'CREATE POLICY "Users can delete own AI conversations" ON public.ai_conversations FOR DELETE TO authenticated USING (auth.uid() = user_id)';
END
$$;
