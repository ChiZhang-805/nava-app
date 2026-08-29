CREATE TABLE IF NOT EXISTS public.ai_health_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('mood', 'sleep', 'exercise', 'diet', 'focus', 'face', 'weekly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  language text NOT NULL DEFAULT 'zh' CHECK (language IN ('zh', 'en')),
  bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider text NOT NULL,
  model_version text NOT NULL,
  source_count integer NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope, period_start, period_end, language)
);

CREATE INDEX IF NOT EXISTS ai_health_reports_user_period_idx
ON public.ai_health_reports (user_id, period_end DESC, scope);

ALTER TABLE public.ai_health_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own AI health reports" ON public.ai_health_reports;
DROP POLICY IF EXISTS "Users can insert own AI health reports" ON public.ai_health_reports;
DROP POLICY IF EXISTS "Users can update own AI health reports" ON public.ai_health_reports;
DROP POLICY IF EXISTS "Users can delete own AI health reports" ON public.ai_health_reports;

CREATE POLICY "Users can view own AI health reports"
ON public.ai_health_reports FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI health reports"
ON public.ai_health_reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI health reports"
ON public.ai_health_reports FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own AI health reports"
ON public.ai_health_reports FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_ai_health_reports_updated_at ON public.ai_health_reports;
CREATE TRIGGER update_ai_health_reports_updated_at
BEFORE UPDATE ON public.ai_health_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

