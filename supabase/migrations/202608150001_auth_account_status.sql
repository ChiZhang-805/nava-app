-- Allow pre-auth flows to distinguish registered accounts without exposing auth.users.
-- Only HMAC digests are persisted, and the server-only RPC applies lookup rate limits.

CREATE TABLE IF NOT EXISTS public.nava_auth_account_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_hash text NOT NULL CHECK (account_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nava_auth_account_checks_account_created_idx
ON public.nava_auth_account_checks (account_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS nava_auth_account_checks_ip_created_idx
ON public.nava_auth_account_checks (ip_hash, created_at DESC);

ALTER TABLE public.nava_auth_account_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nava_auth_account_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.nava_auth_account_checks TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.nava_auth_account_checks_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.nava_check_auth_account(
  p_account_hash text,
  p_ip_hash text,
  p_lookup_email text,
  p_lookup_phone text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  account_hour_count integer;
  ip_hour_count integer;
  registered boolean;
BEGIN
  IF p_account_hash !~ '^[0-9a-f]{64}$' OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_HASH_INVALID';
  END IF;
  IF p_lookup_email IS NULL OR length(trim(p_lookup_email)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_ACCOUNT_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('auth-account:' || p_ip_hash, 0));

  DELETE FROM public.nava_auth_account_checks
  WHERE created_at < now() - interval '7 days';

  SELECT count(*) INTO account_hour_count
  FROM public.nava_auth_account_checks
  WHERE account_hash = p_account_hash
    AND created_at > now() - interval '1 hour';

  IF account_hour_count >= 10 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_ACCOUNT_RATE_LIMIT';
  END IF;

  SELECT count(*) INTO ip_hour_count
  FROM public.nava_auth_account_checks
  WHERE ip_hash = p_ip_hash
    AND created_at > now() - interval '1 hour';

  IF ip_hour_count >= 60 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AUTH_IP_RATE_LIMIT';
  END IF;

  INSERT INTO public.nava_auth_account_checks (account_hash, ip_hash)
  VALUES (p_account_hash, p_ip_hash);

  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS users
    WHERE lower(users.email) = lower(trim(p_lookup_email))
       OR (
         p_lookup_phone IS NOT NULL
         AND users.phone IN (trim(p_lookup_phone), '+86' || trim(p_lookup_phone))
       )
  ) INTO registered;

  RETURN registered;
END;
$$;

REVOKE ALL ON FUNCTION public.nava_check_auth_account(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nava_check_auth_account(text, text, text, text) TO service_role;

COMMENT ON TABLE public.nava_auth_account_checks
IS 'Server-only HMAC digests used to rate-limit pre-auth account existence checks; no raw account or IP is stored.';
