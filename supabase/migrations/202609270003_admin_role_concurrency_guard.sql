-- Serialize administrator role mutations so concurrent demotions cannot both
-- pass the final-administrator check. The previously applied migration remains
-- immutable; this replaces only the callable function.

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
  role_row_exists boolean;
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

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nava.admin.role.mutation', 0));
  LOCK TABLE public.nava_user_roles IN SHARE ROW EXCLUSIVE MODE;

  -- The actor may have waited behind another demotion. Re-check after taking
  -- the serialization locks rather than relying on the earlier snapshot.
  IF NOT public.nava_is_admin() THEN
    RAISE EXCEPTION 'administrator access required';
  END IF;
  IF actor_user_id = target_user_id AND target_role <> 'admin' THEN
    RAISE EXCEPTION 'administrators cannot remove their own access';
  END IF;

  SELECT coalesce(roles.role, 'member'), roles.user_id IS NOT NULL
  INTO current_role, role_row_exists
  FROM auth.users AS users
  LEFT JOIN public.nava_user_roles AS roles ON roles.user_id = users.id
  WHERE users.id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found';
  END IF;
  IF current_role = target_role AND role_row_exists THEN
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

REVOKE ALL ON FUNCTION public.nava_admin_set_account_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nava_admin_set_account_role(uuid, text) TO authenticated;
