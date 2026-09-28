-- Bilingual catalog, reversible removal, and visible-but-not-purchasable previews.
-- No accounts, point ledgers, existing orders, or historical product snapshots are removed.
ALTER TABLE public.reward_products
  ADD COLUMN name_en text NOT NULL DEFAULT '' CHECK (char_length(name_en) <= 120),
  ADD COLUMN brand text NOT NULL DEFAULT '' CHECK (char_length(brand) <= 120),
  ADD COLUMN brand_en text NOT NULL DEFAULT '' CHECK (char_length(brand_en) <= 120),
  ADD COLUMN description_en text NOT NULL DEFAULT '' CHECK (char_length(description_en) <= 2000),
  ADD COLUMN listing_status text NOT NULL DEFAULT 'unpublished'
    CHECK (listing_status IN ('published', 'unpublished', 'upcoming')),
  ADD COLUMN deleted_at timestamptz;

UPDATE public.reward_products SET listing_status = CASE WHEN published THEN 'published' ELSE 'unpublished' END;

-- Keep older clients/administration tools compatible with the published visibility flag.
CREATE FUNCTION public.nava_sync_reward_product_visibility()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.published AND NEW.listing_status = 'unpublished' THEN NEW.listing_status := 'published'; END IF;
  ELSIF NEW.listing_status = OLD.listing_status AND NEW.published IS DISTINCT FROM OLD.published THEN
    NEW.listing_status := CASE WHEN NEW.published THEN 'published' ELSE 'unpublished' END;
  END IF;
  NEW.published := NEW.deleted_at IS NULL AND NEW.listing_status IN ('published', 'upcoming');
  RETURN NEW;
END;
$$;
CREATE TRIGGER nava_reward_product_visibility BEFORE INSERT OR UPDATE ON public.reward_products
FOR EACH ROW EXECUTE FUNCTION public.nava_sync_reward_product_visibility();
REVOKE ALL ON FUNCTION public.nava_sync_reward_product_visibility() FROM PUBLIC, anon, authenticated;

GRANT SELECT (name_en, brand, brand_en, description_en, listing_status) ON public.reward_products TO authenticated;

CREATE FUNCTION public.nava_admin_list_reward_products_v2()
RETURNS SETOF public.reward_products
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.nava_is_admin() THEN RAISE EXCEPTION 'administrator access required'; END IF;
  RETURN QUERY SELECT * FROM public.reward_products WHERE deleted_at IS NULL ORDER BY updated_at DESC, id;
END;
$$;

-- Preserve the old signature during the two-site rollout, but hide archived products there too.
CREATE OR REPLACE FUNCTION public.nava_admin_list_reward_products()
RETURNS TABLE (id uuid, slug text, name text, description text, point_price integer,
  image_urls text[], inventory_remaining integer, sold_out boolean, published boolean,
  created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.nava_is_admin() THEN RAISE EXCEPTION 'administrator access required'; END IF;
  RETURN QUERY SELECT p.id, p.slug, p.name, p.description, p.point_price, p.image_urls,
    p.inventory_remaining, p.sold_out, p.published, p.created_at, p.updated_at
    FROM public.reward_products p WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC, p.id;
END;
$$;

CREATE FUNCTION public.nava_admin_save_reward_product_v2(product_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  product_id uuid;
  saved_id uuid;
  field text;
  max_length integer;
  images text[];
  price integer;
  stock integer;
  slug_value text;
  state_value text;
BEGIN
  IF NOT public.nava_is_admin() THEN RAISE EXCEPTION 'administrator access required'; END IF;
  IF product_data IS NULL OR jsonb_typeof(product_data) <> 'object' THEN RAISE EXCEPTION 'invalid product'; END IF;
  product_id := nullif(product_data->>'id', '')::uuid;
  slug_value := lower(btrim(product_data->>'slug'));
  state_value := product_data->>'listing_status';
  IF slug_value IS NULL OR slug_value !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(slug_value) > 80 THEN
    RAISE EXCEPTION 'invalid product slug';
  END IF;
  FOREACH field IN ARRAY ARRAY['name', 'name_en', 'brand', 'brand_en', 'description', 'description_en'] LOOP
    max_length := CASE WHEN field LIKE 'description%' THEN 2000 ELSE 120 END;
    IF jsonb_typeof(product_data->field) IS DISTINCT FROM 'string'
      OR char_length(btrim(product_data->>field)) NOT BETWEEN 1 AND max_length THEN
      RAISE EXCEPTION 'invalid bilingual field: %', field;
    END IF;
  END LOOP;
  IF state_value IS NULL OR state_value NOT IN ('published', 'unpublished', 'upcoming') THEN RAISE EXCEPTION 'invalid listing status'; END IF;
  IF coalesce(product_data->>'point_price', '') !~ '^[0-9]{1,7}$'
    OR coalesce(product_data->>'inventory', '') !~ '^[0-9]{1,7}$' THEN RAISE EXCEPTION 'invalid price or inventory'; END IF;
  price := (product_data->>'point_price')::integer;
  stock := (product_data->>'inventory')::integer;
  IF price NOT BETWEEN 1 AND 1000000 OR stock NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'invalid price or inventory'; END IF;
  IF jsonb_typeof(product_data->'image_urls') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid images'; END IF;
  IF jsonb_array_length(product_data->'image_urls') > 6 THEN RAISE EXCEPTION 'at most six product images are allowed'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(product_data->'image_urls') u
    WHERE jsonb_typeof(u) <> 'string' OR (u #>> '{}') !~ '^https://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'product image URLs must use HTTPS';
  END IF;
  SELECT coalesce(array_agg(value), '{}'::text[]) INTO images FROM jsonb_array_elements_text(product_data->'image_urls');
  IF product_id IS NULL THEN
    INSERT INTO public.reward_products (slug, name, name_en, brand, brand_en, description, description_en,
      point_price, image_urls, inventory_remaining, listing_status)
    VALUES (slug_value, btrim(product_data->>'name'), btrim(product_data->>'name_en'),
      btrim(product_data->>'brand'), btrim(product_data->>'brand_en'), btrim(product_data->>'description'),
      btrim(product_data->>'description_en'), price, images, stock, state_value) RETURNING id INTO saved_id;
  ELSE
    UPDATE public.reward_products SET slug = slug_value, name = btrim(product_data->>'name'),
      name_en = btrim(product_data->>'name_en'), brand = btrim(product_data->>'brand'),
      brand_en = btrim(product_data->>'brand_en'), description = btrim(product_data->>'description'),
      description_en = btrim(product_data->>'description_en'), point_price = price, image_urls = images,
      inventory_remaining = stock, listing_status = state_value
    WHERE id = product_id AND deleted_at IS NULL RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'product not found or archived'; END IF;
  END IF;
  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_id, details)
  VALUES (auth.uid(), CASE WHEN product_id IS NULL THEN 'reward_product_created' ELSE 'reward_product_updated' END,
    saved_id::text, jsonb_build_object('slug', slug_value, 'listing_status', state_value, 'inventory', stock));
  RETURN saved_id;
END;
$$;

CREATE FUNCTION public.nava_admin_archive_reward_product(product_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE saved_id uuid;
BEGIN
  IF NOT public.nava_is_admin() THEN RAISE EXCEPTION 'administrator access required'; END IF;
  UPDATE public.reward_products SET deleted_at = now(), listing_status = 'unpublished'
    WHERE id = product_id AND deleted_at IS NULL RETURNING id INTO saved_id;
  IF saved_id IS NOT NULL THEN
    INSERT INTO public.admin_audit_log (actor_user_id, action, subject_id, details)
      VALUES (auth.uid(), 'reward_product_archived', saved_id::text, '{"recoverable":true}'::jsonb);
  ELSIF NOT EXISTS (SELECT 1 FROM public.reward_products WHERE id = product_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'product not found';
  END IF;
  RETURN product_id;
END;
$$;

-- Enforce at both write boundaries, including older clients and carts created before a state change.
-- Checkout already locks product rows. This check rolls back the entire transaction if a preview
-- reaches checkout (including inventory/order writes); it does not reject the last in-stock sale.
CREATE FUNCTION public.nava_guard_reward_product_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.reward_products WHERE id = NEW.product_id
    AND published AND listing_status = 'published' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product is unavailable for purchase'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nava_cart_product_purchase_guard BEFORE INSERT OR UPDATE ON public.reward_cart_items
  FOR EACH ROW EXECUTE FUNCTION public.nava_guard_reward_product_purchase();
CREATE TRIGGER nava_order_product_purchase_guard BEFORE INSERT ON public.reward_order_items
  FOR EACH ROW EXECUTE FUNCTION public.nava_guard_reward_product_purchase();
REVOKE ALL ON FUNCTION public.nava_guard_reward_product_purchase() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.nava_admin_list_reward_products_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nava_admin_save_reward_product_v2(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nava_admin_archive_reward_product(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nava_admin_list_reward_products_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.nava_admin_save_reward_product_v2(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nava_admin_archive_reward_product(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
