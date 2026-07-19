CREATE TABLE IF NOT EXISTS public.watch_action_receipts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id text NOT NULL CHECK (char_length(action_id) BETWEEN 8 AND 128),
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (user_id, action_id)
);

ALTER TABLE public.watch_action_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.watch_action_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.watch_action_receipts TO service_role;

COMMENT ON TABLE public.watch_action_receipts
IS 'At-most-once processing receipts for WatchConnectivity actions replayed by the iPhone companion.';
