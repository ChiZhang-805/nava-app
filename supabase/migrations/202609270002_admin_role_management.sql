-- Administrator account discovery and role changes.
-- Contact identifiers remain visible only through an authenticated,
-- administrator-checked SECURITY DEFINER boundary.

CREATE OR REPLACE FUNCTION public.nava_admin_list_accounts(
  account_query text DEFAULT NULL,
  account_limit integer DEFAULT 50
)
RETURNS TABLE (
  user_id uuid,
  email text,
  phone text,
  role text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_query text := nullif(lower(trim(coalesce(account_query, ''))), '');
  normalized_phone text := regexp_replace(coalesce(account_query, ''), '[^0-9+]', '', 'g');
BEGIN
  IF NOT public.nava_is_admin() THEN
    RAISE EXCEPTION 'administrator access required';
  END IF;

  RETURN QUERY
  SELECT
    users.id,
    users.email::text,
    users.phone::text,
    coalesce(roles.role, 'member')::text,
    users.created_at,
    coalesce(roles.updated_at, users.created_at)
  FROM auth.users AS users
  LEFT JOIN public.nava_user_roles AS roles ON roles.user_id = users.id
  WHERE normalized_query IS NULL
    OR position(normalized_query IN lower(coalesce(users.email::text, ''))) > 0
    OR (normalized_phone <> '' AND position(normalized_phone IN coalesce(users.phone::text, '')) > 0)
  ORDER BY CASE WHEN roles.role = 'admin' THEN 0 ELSE 1 END,
    lower(coalesce(users.email::text, users.phone::text, users.id::text))
  LIMIT greatest(1, least(coalesce(account_limit, 50), 100));
END;
$$;

CREATE OR REPLACE FUNCTION public.nava_admin_set_account_role(
  target_user_id uuid,
  target_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  current_role text;
  administrator_count integer;
BEGIN
  IF NOT public.nava_is_admin() THEN
    RAISE EXCEPTION 'administrator access required';
  END IF;
  IF target_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'invalid account role';
  END IF;
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target account is required';
  END IF;
  IF actor_user_id = target_user_id AND target_role <> 'admin' THEN
    RAISE EXCEPTION 'administrators cannot remove their own access';
  END IF;

  LOCK TABLE public.nava_user_roles IN SHARE ROW EXCLUSIVE MODE;

  SELECT coalesce(roles.role, 'member')
  INTO current_role
  FROM auth.users AS users
  LEFT JOIN public.nava_user_roles AS roles ON roles.user_id = users.id
  WHERE users.id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found';
  END IF;
  IF current_role = target_role THEN
    RETURN jsonb_build_object('userId', target_user_id, 'role', target_role, 'changed', false);
  END IF;

  IF current_role = 'admin' AND target_role = 'member' THEN
    SELECT count(*) INTO administrator_count
    FROM public.nava_user_roles
    WHERE role = 'admin';
    IF administrator_count <= 1 THEN
      RAISE EXCEPTION 'the final administrator cannot be removed';
    END IF;
  END IF;

  INSERT INTO public.nava_user_roles (user_id, role, granted_by)
  VALUES (target_user_id, target_role, actor_user_id)
  ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role,
      granted_by = actor_user_id,
      updated_at = now();

  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_id, details)
  VALUES (
    actor_user_id,
    CASE WHEN target_role = 'admin' THEN 'administrator_granted' ELSE 'administrator_removed' END,
    target_user_id::text,
    jsonb_build_object('previousRole', current_role, 'nextRole', target_role)
  );

  RETURN jsonb_build_object('userId', target_user_id, 'role', target_role, 'changed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.nava_admin_list_accounts(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nava_admin_set_account_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nava_admin_list_accounts(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nava_admin_set_account_role(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.nava_admin_list_accounts(text, integer)
IS 'Lists limited account identifiers and server-owned roles for authenticated NAVA administrators.';
COMMENT ON FUNCTION public.nava_admin_set_account_role(uuid, text)
IS 'Audited administrator role mutation; blocks self-removal and removal of the final administrator.';
