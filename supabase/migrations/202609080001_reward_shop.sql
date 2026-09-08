-- NAVA points shop: public catalog, private carts/orders, and atomic point checkout.
-- Product inventory remains server-only; clients receive only the derived sold_out flag.

CREATE TABLE IF NOT EXISTS public.reward_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  point_price integer CHECK (point_price > 0),
  image_urls text[] NOT NULL DEFAULT '{}'::text[],
  inventory_remaining integer CHECK (inventory_remaining >= 0),
  sold_out boolean GENERATED ALWAYS AS (inventory_remaining IS NOT NULL AND inventory_remaining <= 0) STORED,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reward_cart_items (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.reward_products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.reward_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  total_points integer NOT NULL CHECK (total_points > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.reward_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.reward_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.reward_products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  unit_points integer NOT NULL CHECK (unit_points > 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reward_cart_items_user_created_idx ON public.reward_cart_items(user_id, created_at);
CREATE INDEX IF NOT EXISTS reward_orders_user_created_idx ON public.reward_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reward_order_items_user_created_idx ON public.reward_order_items(user_id, created_at DESC);

DROP TRIGGER IF EXISTS update_reward_products_updated_at ON public.reward_products;
CREATE TRIGGER update_reward_products_updated_at
BEFORE UPDATE ON public.reward_products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_reward_cart_items_updated_at ON public.reward_cart_items;
CREATE TRIGGER update_reward_cart_items_updated_at
BEFORE UPDATE ON public.reward_cart_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.reward_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view published reward products" ON public.reward_products;
CREATE POLICY "Authenticated users can view published reward products"
ON public.reward_products FOR SELECT TO authenticated USING (published = true);

DROP POLICY IF EXISTS "Users can view own reward cart" ON public.reward_cart_items;
CREATE POLICY "Users can view own reward cart"
ON public.reward_cart_items FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own reward orders" ON public.reward_orders;
CREATE POLICY "Users can view own reward orders"
ON public.reward_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own reward order items" ON public.reward_order_items;
CREATE POLICY "Users can view own reward order items"
ON public.reward_order_items FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.reward_products FROM anon, authenticated;
GRANT SELECT (id, slug, name, description, point_price, image_urls, sold_out, published, created_at, updated_at)
ON public.reward_products TO authenticated;
REVOKE ALL ON TABLE public.reward_cart_items, public.reward_orders, public.reward_order_items FROM anon, authenticated;
GRANT SELECT ON TABLE public.reward_cart_items, public.reward_orders, public.reward_order_items TO authenticated;

CREATE OR REPLACE FUNCTION public.nava_reward_points_balance()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_user uuid := auth.uid();
  earned integer;
  spent integer;
BEGIN
  IF target_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT coalesce(sum(points), 0)::integer INTO earned
  FROM public.growth_reward_ledger WHERE user_id = target_user;
  SELECT coalesce(sum(total_points), 0)::integer INTO spent
  FROM public.reward_orders WHERE user_id = target_user AND status = 'confirmed';
  RETURN greatest(0, earned - spent);
END;
$$;

CREATE OR REPLACE FUNCTION public.nava_set_reward_cart_item(target_product uuid, target_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_user uuid := auth.uid();
  product_record record;
BEGIN
  IF target_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF target_quantity < 0 OR target_quantity > 5 THEN RAISE EXCEPTION 'quantity must be between 0 and 5'; END IF;
  IF target_quantity = 0 THEN
    DELETE FROM public.reward_cart_items WHERE user_id = target_user AND product_id = target_product;
    RETURN jsonb_build_object('productId', target_product, 'quantity', 0);
  END IF;

  SELECT id, published, point_price, inventory_remaining, sold_out INTO product_record
  FROM public.reward_products WHERE id = target_product;
  IF product_record.id IS NULL OR product_record.published IS NOT TRUE OR product_record.point_price IS NULL THEN
    RAISE EXCEPTION 'product is unavailable';
  END IF;
  IF product_record.sold_out OR product_record.inventory_remaining < target_quantity THEN
    RAISE EXCEPTION 'product is sold out';
  END IF;

  INSERT INTO public.reward_cart_items (user_id, product_id, quantity)
  VALUES (target_user, target_product, target_quantity)
  ON CONFLICT (user_id, product_id) DO UPDATE
  SET quantity = EXCLUDED.quantity, updated_at = now();
  RETURN jsonb_build_object('productId', target_product, 'quantity', target_quantity);
END;
$$;

CREATE OR REPLACE FUNCTION public.nava_checkout_reward_cart(request_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_user uuid := auth.uid();
  existing_order public.reward_orders%ROWTYPE;
  created_order public.reward_orders%ROWTYPE;
  line_item record;
  cart_count integer;
  earned integer;
  spent integer;
  available_points integer;
  checkout_total integer := 0;
BEGIN
  IF target_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF request_key IS NULL THEN RAISE EXCEPTION 'idempotency key required'; END IF;

  -- Serialize all checkouts for one account, then lock product rows in UUID order.
  PERFORM pg_advisory_xact_lock(hashtextextended(target_user::text, 0));
  SELECT * INTO existing_order FROM public.reward_orders
  WHERE user_id = target_user AND idempotency_key = request_key;
  IF existing_order.id IS NOT NULL THEN
    RETURN jsonb_build_object('orderId', existing_order.id, 'totalPoints', existing_order.total_points, 'balance', public.nava_reward_points_balance(), 'replayed', true);
  END IF;

  SELECT count(*)::integer INTO cart_count FROM public.reward_cart_items WHERE user_id = target_user;
  IF cart_count = 0 THEN RAISE EXCEPTION 'cart is empty'; END IF;

  FOR line_item IN
    SELECT c.product_id, c.quantity, p.name, p.point_price, p.inventory_remaining, p.published
    FROM public.reward_cart_items c
    JOIN public.reward_products p ON p.id = c.product_id
    WHERE c.user_id = target_user
    ORDER BY c.product_id
    FOR UPDATE OF p
  LOOP
    IF line_item.published IS NOT TRUE OR line_item.point_price IS NULL OR line_item.inventory_remaining IS NULL THEN
      RAISE EXCEPTION 'product is unavailable';
    END IF;
    IF line_item.inventory_remaining < line_item.quantity THEN RAISE EXCEPTION 'product is sold out'; END IF;
    checkout_total := checkout_total + line_item.point_price * line_item.quantity;
  END LOOP;

  SELECT coalesce(sum(points), 0)::integer INTO earned FROM public.growth_reward_ledger WHERE user_id = target_user;
  SELECT coalesce(sum(total_points), 0)::integer INTO spent FROM public.reward_orders WHERE user_id = target_user AND status = 'confirmed';
  available_points := greatest(0, earned - spent);
  IF available_points < checkout_total THEN RAISE EXCEPTION 'insufficient points'; END IF;

  INSERT INTO public.reward_orders (user_id, idempotency_key, total_points)
  VALUES (target_user, request_key, checkout_total)
  RETURNING * INTO created_order;

  FOR line_item IN
    SELECT c.product_id, c.quantity, p.name, p.point_price
    FROM public.reward_cart_items c
    JOIN public.reward_products p ON p.id = c.product_id
    WHERE c.user_id = target_user
    ORDER BY c.product_id
  LOOP
    UPDATE public.reward_products
    SET inventory_remaining = inventory_remaining - line_item.quantity
    WHERE id = line_item.product_id;
    INSERT INTO public.reward_order_items (order_id, user_id, product_id, product_name, unit_points, quantity)
    VALUES (created_order.id, target_user, line_item.product_id, line_item.name, line_item.point_price, line_item.quantity);
  END LOOP;

  DELETE FROM public.reward_cart_items WHERE user_id = target_user;
  INSERT INTO public.analytics_events (user_id, event_name, properties)
  VALUES (target_user, 'reward_shop_checkout', jsonb_build_object('orderId', created_order.id, 'points', checkout_total, 'itemCount', cart_count));

  RETURN jsonb_build_object('orderId', created_order.id, 'totalPoints', checkout_total, 'balance', available_points - checkout_total, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.nava_reward_points_balance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nava_set_reward_cart_item(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nava_checkout_reward_cart(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nava_reward_points_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.nava_set_reward_cart_item(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nava_checkout_reward_cart(uuid) TO authenticated;
