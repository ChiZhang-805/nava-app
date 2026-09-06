-- Native notification routing state. Device tokens are account-scoped,
-- revocable, omitted from logs, and deleted with the owning auth identity.

CREATE TABLE IF NOT EXISTS public.push_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('apns', 'fcm', 'hms')),
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  token text NOT NULL CHECK (char_length(token) BETWEEN 16 AND 4096),
  token_hash text NOT NULL CHECK (char_length(token_hash) = 64),
  locale text,
  timezone text,
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, installation_id),
  UNIQUE (user_id, id),
  UNIQUE (provider, token_hash)
);

CREATE INDEX IF NOT EXISTS push_device_tokens_enabled_idx
  ON public.push_device_tokens (provider, enabled, last_seen_at DESC)
  WHERE enabled;

ALTER TABLE public.push_device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push devices" ON public.push_device_tokens;
CREATE POLICY "Users can view own push devices" ON public.push_device_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can register own push devices" ON public.push_device_tokens;
CREATE POLICY "Users can register own push devices" ON public.push_device_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own push devices" ON public.push_device_tokens;
CREATE POLICY "Users can update own push devices" ON public.push_device_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own push devices" ON public.push_device_tokens;
CREATE POLICY "Users can delete own push devices" ON public.push_device_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_push_device_tokens_updated_at ON public.push_device_tokens;
CREATE TRIGGER update_push_device_tokens_updated_at BEFORE UPDATE ON public.push_device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.push_device_tokens IS
  'Native APNs, FCM, or HMS routing tokens. Never expose these in logs or frontend bundles.';
COMMENT ON COLUMN public.push_device_tokens.token IS
  'Provider routing token required for server-side delivery; RLS limits it to its owner and service role.';

CREATE TABLE IF NOT EXISTS public.push_delivery_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id text NOT NULL,
  device_token_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('apns', 'fcm', 'hms')),
  status text NOT NULL CHECK (status IN ('delivered', 'failed', 'invalidated')),
  provider_message_id text,
  error_code text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, notification_id) REFERENCES public.user_notifications(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, device_token_id) REFERENCES public.push_device_tokens(user_id, id) ON DELETE CASCADE,
  UNIQUE (user_id, notification_id, device_token_id)
);

ALTER TABLE public.push_delivery_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own push receipts" ON public.push_delivery_receipts;
CREATE POLICY "Users can view own push receipts" ON public.push_delivery_receipts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_push_delivery_receipts_updated_at ON public.push_delivery_receipts;
CREATE TRIGGER update_push_delivery_receipts_updated_at BEFORE UPDATE ON public.push_delivery_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.push_delivery_receipts IS
  'Per-device remote delivery attempts used for idempotency and operational diagnosis.';
