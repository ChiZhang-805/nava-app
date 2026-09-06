-- Account deletion must also remove rows from the retired plaintext phone-code
-- table when that legacy table is still present in the shared project.

CREATE OR REPLACE FUNCTION public.nava_delete_legacy_phone_codes(p_phones text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  phone_column text;
  removed_count integer := 0;
BEGIN
  IF coalesce(array_length(p_phones, 1), 0) = 0
    OR to_regclass('public.phone_verification_codes') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT columns.column_name INTO phone_column
  FROM information_schema.columns
  WHERE columns.table_schema = 'public'
    AND columns.table_name = 'phone_verification_codes'
    AND columns.column_name IN ('phone', 'phone_number', 'mobile')
  ORDER BY CASE columns.column_name WHEN 'phone' THEN 1 WHEN 'phone_number' THEN 2 ELSE 3 END
  LIMIT 1;

  IF phone_column IS NULL THEN
    RAISE EXCEPTION 'legacy phone verification table has no recognized phone column';
  END IF;

  EXECUTE format(
    'DELETE FROM public.phone_verification_codes WHERE right(regexp_replace(coalesce(%I::text, ''''), ''[^0-9]'', '''', ''g''), 11) = ANY($1)',
    phone_column
  ) USING p_phones;
  GET DIAGNOSTICS removed_count = ROW_COUNT;
  RETURN removed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.nava_delete_legacy_phone_codes(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nava_delete_legacy_phone_codes(text[]) TO service_role;

COMMENT ON FUNCTION public.nava_delete_legacy_phone_codes(text[]) IS
  'Removes phone verification remnants from the retired plaintext-code table during authenticated account deletion.';
