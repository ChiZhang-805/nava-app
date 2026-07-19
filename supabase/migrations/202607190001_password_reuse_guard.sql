CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.nava_password_matches_current(candidate_password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE((
    SELECT encrypted_password = extensions.crypt(candidate_password, encrypted_password)
    FROM auth.users
    WHERE id = auth.uid()
  ), false);
$$;

REVOKE ALL ON FUNCTION public.nava_password_matches_current(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nava_password_matches_current(text) TO authenticated;

COMMENT ON FUNCTION public.nava_password_matches_current(text)
IS 'Checks password reuse for the authenticated NAVA password-reset flow without exposing the stored hash.';
