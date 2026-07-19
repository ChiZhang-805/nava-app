-- Server-only phone OTP challenges for App registration and password reset.
-- Recipients, IP addresses, and codes are stored only as keyed HMAC digests.

CREATE TABLE IF NOT EXISTS public.nava_phone_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('register', 'reset')),
  code_digest text NOT NULL,
  ip_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  send_status text NOT NULL DEFAULT 'pending' CHECK (send_status IN ('pending', 'sent', 'failed')),
  provider_request_id text,
  provider_biz_id text,
  provider_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nava_phone_otp_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nava_phone_otp_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.nava_phone_otp_challenges TO service_role;

CREATE INDEX IF NOT EXISTS nava_phone_otp_phone_created_idx
ON public.nava_phone_otp_challenges (phone_hash, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS nava_phone_otp_ip_created_idx
ON public.nava_phone_otp_challenges (ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS nava_phone_otp_created_idx
ON public.nava_phone_otp_challenges (created_at);

CREATE OR REPLACE FUNCTION public.nava_issue_phone_otp(
  p_phone_hash text,
  p_purpose text,
  p_code_digest text,
  p_ip_hash text,
  p_ttl_seconds integer DEFAULT 600
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  challenge_id uuid;
  latest_created_at timestamptz;
  phone_hour_count integer;
  ip_hour_count integer;
BEGIN
  IF p_purpose NOT IN ('register', 'reset') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OTP_PURPOSE_INVALID';
  END IF;
  IF p_ttl_seconds < 120 OR p_ttl_seconds > 900 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OTP_TTL_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_phone_hash || ':' || p_purpose, 0));

  DELETE FROM public.nava_phone_otp_challenges
  WHERE created_at < now() - interval '7 days';

  SELECT created_at
  INTO latest_created_at
  FROM public.nava_phone_otp_challenges
  WHERE phone_hash = p_phone_hash
    AND purpose = p_purpose
    AND send_status IN ('pending', 'sent')
  ORDER BY created_at DESC
  LIMIT 1;

  IF latest_created_at IS NOT NULL AND latest_created_at > now() - interval '60 seconds' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OTP_COOLDOWN';
  END IF;

  SELECT count(*)
  INTO phone_hour_count
  FROM public.nava_phone_otp_challenges
  WHERE phone_hash = p_phone_hash
    AND created_at > now() - interval '1 hour'
    AND send_status IN ('pending', 'sent');

  IF phone_hour_count >= 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OTP_PHONE_RATE_LIMIT';
  END IF;

  SELECT count(*)
  INTO ip_hour_count
  FROM public.nava_phone_otp_challenges
  WHERE ip_hash = p_ip_hash
    AND created_at > now() - interval '1 hour'
    AND send_status IN ('pending', 'sent');

  IF ip_hour_count >= 20 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OTP_IP_RATE_LIMIT';
  END IF;

  UPDATE public.nava_phone_otp_challenges
  SET consumed_at = COALESCE(consumed_at, now())
  WHERE phone_hash = p_phone_hash
    AND purpose = p_purpose
    AND consumed_at IS NULL;

  INSERT INTO public.nava_phone_otp_challenges (
    phone_hash,
    purpose,
    code_digest,
    ip_hash,
    expires_at
  )
  VALUES (
    p_phone_hash,
    p_purpose,
    p_code_digest,
    p_ip_hash,
    now() + make_interval(secs => p_ttl_seconds)
  )
  RETURNING id INTO challenge_id;

  RETURN challenge_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.nava_consume_phone_otp(
  p_phone_hash text,
  p_purpose text,
  p_code_digest text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  challenge public.nava_phone_otp_challenges%ROWTYPE;
  next_attempt_count smallint;
BEGIN
  IF p_purpose NOT IN ('register', 'reset') THEN
    RETURN 'invalid_purpose';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_phone_hash || ':' || p_purpose, 0));

  SELECT *
  INTO challenge
  FROM public.nava_phone_otp_challenges
  WHERE phone_hash = p_phone_hash
    AND purpose = p_purpose
    AND consumed_at IS NULL
    AND send_status IN ('pending', 'sent')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF challenge.expires_at <= now() THEN
    UPDATE public.nava_phone_otp_challenges
    SET consumed_at = now()
    WHERE id = challenge.id;
    RETURN 'expired';
  END IF;

  IF challenge.attempt_count >= 5 THEN
    UPDATE public.nava_phone_otp_challenges
    SET consumed_at = now()
    WHERE id = challenge.id;
    RETURN 'locked';
  END IF;

  IF challenge.code_digest <> p_code_digest THEN
    next_attempt_count := challenge.attempt_count + 1;
    UPDATE public.nava_phone_otp_challenges
    SET
      attempt_count = next_attempt_count,
      consumed_at = CASE WHEN next_attempt_count >= 5 THEN now() ELSE NULL END
    WHERE id = challenge.id;
    RETURN CASE WHEN next_attempt_count >= 5 THEN 'locked' ELSE 'invalid' END;
  END IF;

  UPDATE public.nava_phone_otp_challenges
  SET consumed_at = now()
  WHERE id = challenge.id;
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.nava_issue_phone_otp(text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nava_consume_phone_otp(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nava_issue_phone_otp(text, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.nava_consume_phone_otp(text, text, text) TO service_role;

COMMENT ON TABLE public.nava_phone_otp_challenges
IS 'Server-only, rate-limited, one-time phone OTP challenges. No raw phone, IP, or code is persisted.';
