-- NAVA administrator roles, reward-catalog publishing, and broadcast inbox notices.
-- Existing accounts are development collaborators at the time of this migration,
-- so they are explicitly bootstrapped as administrators. New accounts default to member.

CREATE TABLE IF NOT EXISTS public.nava_user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_notification_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  category text NOT NULL CHECK (category IN ('sleep', 'nutrition', 'mood', 'focus', 'exercise', 'face', 'weekly', 'system')),
  target jsonb NOT NULL DEFAULT '{"tab":"today","view":"notifications"}'::jsonb CHECK (jsonb_typeof(target) = 'object'),
  delivery_mode text NOT NULL DEFAULT 'in_app' CHECK (delivery_mode IN ('in_app', 'in_app_and_push')),
  notification_id text NOT NULL UNIQUE,
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  delivered_count integer NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  push_status text NOT NULL DEFAULT 'not_requested' CHECK (push_status IN ('not_requested', 'queued', 'completed', 'partial', 'failed', 'no_devices')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 80),
  subject_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notification_batches_created_idx
  ON public.admin_notification_batches (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_created_idx
  ON public.admin_audit_log (actor_user_id, created_at DESC);

INSERT INTO public.nava_user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
ON CONFLICT (user_id) DO UPDATE SET role = 'admin', updated_at = now();

CREATE OR REPLACE FUNCTION public.nava_assign_default_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.nava_user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nava_auth_user_default_role ON auth.users;
CREATE TRIGGER nava_auth_user_default_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.nava_assign_default_role();

CREATE OR REPLACE FUNCTION public.nava_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.nava_user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

ALTER TABLE public.nava_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own NAVA role" ON public.nava_user_roles;
CREATE POLICY "Users can view own NAVA role"
ON public.nava_user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view notification batches" ON public.admin_notification_batches;
CREATE POLICY "Admins can view notification batches"
ON public.admin_notification_batches FOR SELECT TO authenticated
USING (public.nava_is_admin());

DROP POLICY IF EXISTS "Admins can view audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can view audit log"
ON public.admin_audit_log FOR SELECT TO authenticated
USING (public.nava_is_admin());

REVOKE ALL ON TABLE public.nava_user_roles, public.admin_notification_batches, public.admin_audit_log FROM anon, authenticated;
GRANT SELECT (user_id, role, created_at, updated_at) ON public.nava_user_roles TO authenticated;
GRANT SELECT ON public.admin_notification_batches, public.admin_audit_log TO authenticated;

CREATE OR REPLACE FUNCTION public.nava_admin_list_reward_products()
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  description text,
  point_price integer,
  image_urls text[],
  inventory_remaining integer,
  sold_out boolean,
  published boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.nava_is_admin() THEN RAISE EXCEPTION 'administrator access required'; END IF;
  RETURN QUERY
  SELECT p.id, p.slug, p.name, p.description, p.point_price, p.image_urls,
    p.inventory_remaining, p.sold_out, p.published, p.created_at, p.updated_at
  FROM public.reward_products p
  ORDER BY p.updated_at DESC, p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.nava_admin_save_reward_product(
  product_id uuid,
  product_slug text,
  product_name text,
  product_description text,
  product_point_price integer,
  product_image_urls text[],
  product_inventory integer,
  product_published boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  saved_id uuid;
  normalized_slug text := lower(trim(product_slug));
  normalized_images text[] := coalesce(product_image_urls, '{}'::text[]);
BEGIN
  IF NOT public.nava_is_admin() THEN RAISE EXCEPTION 'administrator access required'; END IF;
  IF normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR char_length(normalized_slug) > 80 THEN
    RAISE EXCEPTION 'slug must contain lowercase letters, numbers, and hyphens';
  END IF;
  IF char_length(trim(product_name)) < 1 OR char_length(trim(product_name)) > 120 THEN
    RAISE EXCEPTION 'product name must be 1 to 120 characters';
  END IF;
  IF char_length(coalesce(product_description, '')) > 2000 THEN RAISE EXCEPTION 'description is too long'; END IF;
  IF product_point_price IS NULL OR product_point_price < 1 OR product_point_price > 1000000 THEN RAISE EXCEPTION 'invalid point price'; END IF;
  IF product_inventory IS NULL OR product_inventory < 0 OR product_inventory > 1000000 THEN RAISE EXCEPTION 'invalid inventory'; END IF;
  IF cardinality(normalized_images) > 6 THEN RAISE EXCEPTION 'at most six product images are allowed'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(normalized_images) AS image_url WHERE image_url !~ '^https://') THEN
    RAISE EXCEPTION 'product image URLs must use HTTPS';
  END IF;

  IF product_id IS NULL THEN
    INSERT INTO public.reward_products (slug, name, description, point_price, image_urls, inventory_remaining, published)
    VALUES (normalized_slug, trim(product_name), coalesce(product_description, ''), product_point_price, normalized_images, product_inventory, product_published)
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.reward_products
    SET slug = normalized_slug,
        name = trim(product_name),
        description = coalesce(product_description, ''),
        point_price = product_point_price,
        image_urls = normalized_images,
        inventory_remaining = product_inventory,
        published = product_published,
        updated_at = now()
    WHERE id = product_id
    RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'product not found'; END IF;
  END IF;

  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_id, details)
  VALUES (actor, CASE WHEN product_id IS NULL THEN 'reward_product_created' ELSE 'reward_product_updated' END, saved_id::text,
    jsonb_build_object('slug', normalized_slug, 'published', product_published, 'inventory', product_inventory));
  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.nava_admin_publish_notification(
  notice_title text,
  notice_body text,
  notice_category text,
  notice_target jsonb,
  notice_delivery_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  batch_id uuid := gen_random_uuid();
  inbox_id text := 'admin:' || batch_id::text;
  recipients integer := 0;
  target_value jsonb := coalesce(notice_target, '{"tab":"today","view":"notifications"}'::jsonb);
BEGIN
  IF NOT public.nava_is_admin() THEN RAISE EXCEPTION 'administrator access required'; END IF;
  IF char_length(trim(notice_title)) < 1 OR char_length(trim(notice_title)) > 160 THEN RAISE EXCEPTION 'invalid notification title'; END IF;
  IF char_length(trim(notice_body)) < 1 OR char_length(trim(notice_body)) > 1000 THEN RAISE EXCEPTION 'invalid notification body'; END IF;
  IF notice_category NOT IN ('sleep', 'nutrition', 'mood', 'focus', 'exercise', 'face', 'weekly', 'system') THEN RAISE EXCEPTION 'invalid notification category'; END IF;
  IF notice_delivery_mode NOT IN ('in_app', 'in_app_and_push') THEN RAISE EXCEPTION 'invalid delivery mode'; END IF;
  IF jsonb_typeof(target_value) <> 'object' OR NOT (target_value ? 'tab') THEN RAISE EXCEPTION 'invalid notification target'; END IF;
  IF target_value->>'tab' NOT IN ('today', 'record', 'ai', 'trends', 'profile') THEN RAISE EXCEPTION 'invalid notification tab'; END IF;

  INSERT INTO public.admin_notification_batches (
    id, created_by, title, body, category, target, delivery_mode, notification_id, push_status
  ) VALUES (
    batch_id, actor, trim(notice_title), trim(notice_body), notice_category, target_value,
    notice_delivery_mode, inbox_id,
    CASE WHEN notice_delivery_mode = 'in_app_and_push' THEN 'queued' ELSE 'not_requested' END
  );

  INSERT INTO public.user_notifications (user_id, id, category, source, title, body, target, created_at)
  SELECT id, inbox_id, notice_category, 'system', trim(notice_title), trim(notice_body), target_value, now()
  FROM auth.users;
  GET DIAGNOSTICS recipients = ROW_COUNT;

  UPDATE public.admin_notification_batches SET recipient_count = recipients WHERE id = batch_id;
  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_id, details)
  VALUES (actor, 'notification_published', batch_id::text,
    jsonb_build_object('deliveryMode', notice_delivery_mode, 'recipients', recipients, 'category', notice_category));

  RETURN jsonb_build_object('batchId', batch_id, 'notificationId', inbox_id, 'recipients', recipients);
END;
$$;

CREATE OR REPLACE FUNCTION public.nava_admin_list_notification_batches(batch_limit integer DEFAULT 20)
RETURNS SETOF public.admin_notification_batches
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.nava_is_admin() THEN RAISE EXCEPTION 'administrator access required'; END IF;
  RETURN QUERY SELECT * FROM public.admin_notification_batches
  ORDER BY created_at DESC LIMIT greatest(1, least(coalesce(batch_limit, 20), 50));
END;
$$;

DROP TRIGGER IF EXISTS update_nava_user_roles_updated_at ON public.nava_user_roles;
CREATE TRIGGER update_nava_user_roles_updated_at
  BEFORE UPDATE ON public.nava_user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_admin_notification_batches_updated_at ON public.admin_notification_batches;
CREATE TRIGGER update_admin_notification_batches_updated_at
  BEFORE UPDATE ON public.admin_notification_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('reward-products', 'reward-products', true, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins can upload reward product images" ON storage.objects;
CREATE POLICY "Admins can upload reward product images" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'reward-products' AND public.nava_is_admin());
DROP POLICY IF EXISTS "Admins can update reward product images" ON storage.objects;
CREATE POLICY "Admins can update reward product images" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'reward-products' AND public.nava_is_admin())
WITH CHECK (bucket_id = 'reward-products' AND public.nava_is_admin());
DROP POLICY IF EXISTS "Admins can delete reward product images" ON storage.objects;
CREATE POLICY "Admins can delete reward product images" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'reward-products' AND public.nava_is_admin());

REVOKE ALL ON FUNCTION public.nava_assign_default_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nava_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nava_admin_list_reward_products() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nava_admin_save_reward_product(uuid, text, text, text, integer, text[], integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nava_admin_publish_notification(text, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nava_admin_list_notification_batches(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nava_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.nava_admin_list_reward_products() TO authenticated;
GRANT EXECUTE ON FUNCTION public.nava_admin_save_reward_product(uuid, text, text, text, integer, text[], integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nava_admin_publish_notification(text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nava_admin_list_notification_batches(integer) TO authenticated;

COMMENT ON TABLE public.nava_user_roles IS 'Server-controlled NAVA application roles. Frontend identity never grants authorization.';
COMMENT ON TABLE public.admin_notification_batches IS 'Auditable administrator broadcasts delivered to the in-app inbox and optionally remote push.';
COMMENT ON TABLE public.admin_audit_log IS 'Security audit trail for administrator catalog and notification actions.';
