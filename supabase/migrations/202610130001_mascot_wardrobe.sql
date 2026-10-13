-- NAVA mascot wardrobe. Unlocks share the account's existing reward-points
-- balance and selections remain scoped to the authenticated user.

begin;

create table public.mascot_wardrobe_items (
  id text primary key check (char_length(id) between 1 and 80),
  category text not null check (category in ('skin', 'accessory', 'background')),
  point_price integer not null check (point_price >= 0),
  sort_order smallint not null check (sort_order > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category, sort_order)
);

insert into public.mascot_wardrobe_items (id, category, point_price, sort_order) values
  ('skin-cream', 'skin', 0, 1),
  ('skin-warm-orange', 'skin', 300, 2),
  ('skin-night-ink', 'skin', 360, 3),
  ('skin-mist-gray', 'skin', 240, 4),
  ('accessory-none', 'accessory', 0, 1),
  ('accessory-bell-collar', 'accessory', 0, 2),
  ('accessory-cloud-scarf', 'accessory', 180, 3),
  ('accessory-mist-beret', 'accessory', 260, 4),
  ('background-morning-room', 'background', 0, 1),
  ('background-night-window', 'background', 420, 2),
  ('background-cloud-garden', 'background', 280, 3),
  ('background-aurora-lake', 'background', 360, 4);

create table public.user_mascot_wardrobe_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.mascot_wardrobe_items(id) on delete restrict,
  idempotency_key uuid not null,
  points_spent integer not null check (points_spent > 0),
  created_at timestamptz not null default now(),
  unique (user_id, item_id),
  unique (user_id, idempotency_key)
);

create table public.user_mascot_wardrobe_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  skin_id text not null references public.mascot_wardrobe_items(id) on delete restrict default 'skin-cream',
  accessory_id text not null references public.mascot_wardrobe_items(id) on delete restrict default 'accessory-none',
  background_id text not null references public.mascot_wardrobe_items(id) on delete restrict default 'background-morning-room',
  updated_at timestamptz not null default now()
);

create index user_mascot_wardrobe_unlocks_user_created_idx
  on public.user_mascot_wardrobe_unlocks(user_id, created_at);

alter table public.mascot_wardrobe_items enable row level security;
alter table public.user_mascot_wardrobe_unlocks enable row level security;
alter table public.user_mascot_wardrobe_preferences enable row level security;

create policy "Authenticated users can view mascot wardrobe items"
on public.mascot_wardrobe_items for select to authenticated using (enabled = true);

create policy "Users can view own mascot wardrobe unlocks"
on public.user_mascot_wardrobe_unlocks for select to authenticated using (auth.uid() = user_id);

create policy "Users can view own mascot wardrobe preferences"
on public.user_mascot_wardrobe_preferences for select to authenticated using (auth.uid() = user_id);

revoke all on public.mascot_wardrobe_items, public.user_mascot_wardrobe_unlocks, public.user_mascot_wardrobe_preferences from anon, authenticated;
grant select on public.mascot_wardrobe_items, public.user_mascot_wardrobe_unlocks, public.user_mascot_wardrobe_preferences to authenticated;

create trigger update_user_mascot_wardrobe_preferences_updated_at
before update on public.user_mascot_wardrobe_preferences
for each row execute function public.update_updated_at_column();

create or replace function public.nava_reward_points_balance()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid := auth.uid();
  earned integer;
  order_spend integer;
  card_spend integer;
  wardrobe_spend integer;
begin
  if target_user is null then raise exception 'authentication required'; end if;
  select coalesce(sum(points), 0)::integer into earned
  from public.growth_reward_ledger where user_id = target_user;
  select coalesce(sum(total_points), 0)::integer into order_spend
  from public.reward_orders where user_id = target_user and status = 'confirmed';
  select coalesce(sum(points_spent), 0)::integer into card_spend
  from public.user_reward_card_unlocks where user_id = target_user;
  select coalesce(sum(points_spent), 0)::integer into wardrobe_spend
  from public.user_mascot_wardrobe_unlocks where user_id = target_user;
  return greatest(0, earned - order_spend - card_spend - wardrobe_spend);
end;
$$;

create or replace function public.nava_mascot_wardrobe_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid := auth.uid();
  preference public.user_mascot_wardrobe_preferences%rowtype;
  unlocked_items jsonb;
begin
  if target_user is null then raise exception 'authentication required'; end if;

  select * into preference
  from public.user_mascot_wardrobe_preferences
  where user_id = target_user;

  if preference.user_id is null then
    preference.skin_id := 'skin-cream';
    preference.accessory_id := 'accessory-none';
    preference.background_id := 'background-morning-room';
  end if;

  select coalesce(jsonb_agg(item.id order by item.category, item.sort_order), '[]'::jsonb)
  into unlocked_items
  from public.mascot_wardrobe_items item
  where item.enabled and (
    item.point_price = 0 or exists (
      select 1 from public.user_mascot_wardrobe_unlocks unlocked
      where unlocked.user_id = target_user and unlocked.item_id = item.id
    )
  );

  if not (unlocked_items ? preference.skin_id) then preference.skin_id := 'skin-cream'; end if;
  if not (unlocked_items ? preference.accessory_id) then preference.accessory_id := 'accessory-none'; end if;
  if not (unlocked_items ? preference.background_id) then preference.background_id := 'background-morning-room'; end if;

  return jsonb_build_object(
    'equipped', jsonb_build_object(
      'skinId', preference.skin_id,
      'accessoryId', preference.accessory_id,
      'backgroundId', preference.background_id
    ),
    'unlockedItemIds', unlocked_items,
    'balance', public.nava_reward_points_balance()
  );
end;
$$;

create or replace function public.nava_select_mascot_wardrobe_item(target_item text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid := auth.uid();
  item_record public.mascot_wardrobe_items%rowtype;
  allowed boolean;
begin
  if target_user is null then raise exception 'authentication required'; end if;

  select * into item_record
  from public.mascot_wardrobe_items
  where id = target_item and enabled;

  if item_record.id is null then raise exception 'wardrobe item is unavailable'; end if;

  select item_record.point_price = 0 or exists (
    select 1 from public.user_mascot_wardrobe_unlocks unlocked
    where unlocked.user_id = target_user and unlocked.item_id = item_record.id
  ) into allowed;

  if not allowed then raise exception 'wardrobe item is locked'; end if;

  insert into public.user_mascot_wardrobe_preferences(user_id)
  values(target_user)
  on conflict(user_id) do nothing;

  update public.user_mascot_wardrobe_preferences
  set skin_id = case when item_record.category = 'skin' then item_record.id else skin_id end,
      accessory_id = case when item_record.category = 'accessory' then item_record.id else accessory_id end,
      background_id = case when item_record.category = 'background' then item_record.id else background_id end,
      updated_at = now()
  where user_id = target_user;

  insert into public.analytics_events(user_id, event_name, properties)
  values(target_user, 'mascot_wardrobe_equipped', jsonb_build_object('itemId', item_record.id, 'category', item_record.category));

  return public.nava_mascot_wardrobe_state();
end;
$$;

create or replace function public.nava_unlock_mascot_wardrobe_item(target_item text, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid := auth.uid();
  item_record public.mascot_wardrobe_items%rowtype;
  available_points integer;
  replayed_item text;
begin
  if target_user is null then raise exception 'authentication required'; end if;
  if request_key is null then raise exception 'idempotency key required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user::text, 0));

  select item_id into replayed_item
  from public.user_mascot_wardrobe_unlocks
  where user_id = target_user and idempotency_key = request_key;

  if replayed_item is not null then
    if replayed_item <> target_item then raise exception 'idempotency key already used'; end if;
    return public.nava_mascot_wardrobe_state();
  end if;

  select * into item_record
  from public.mascot_wardrobe_items
  where id = target_item and enabled
  for update;

  if item_record.id is null or item_record.point_price = 0 then raise exception 'wardrobe item is unavailable'; end if;

  if exists (
    select 1 from public.user_mascot_wardrobe_unlocks
    where user_id = target_user and item_id = item_record.id
  ) then return public.nava_mascot_wardrobe_state(); end if;

  available_points := public.nava_reward_points_balance();
  if available_points < item_record.point_price then raise exception 'insufficient points'; end if;

  insert into public.user_mascot_wardrobe_unlocks(user_id, item_id, idempotency_key, points_spent)
  values(target_user, item_record.id, request_key, item_record.point_price);

  insert into public.analytics_events(user_id, event_name, properties)
  values(target_user, 'mascot_wardrobe_unlocked', jsonb_build_object(
    'itemId', item_record.id,
    'category', item_record.category,
    'points', item_record.point_price
  ));

  return public.nava_mascot_wardrobe_state();
end;
$$;

revoke all on function public.nava_mascot_wardrobe_state() from public;
revoke all on function public.nava_select_mascot_wardrobe_item(text) from public;
revoke all on function public.nava_unlock_mascot_wardrobe_item(text, uuid) from public;
revoke all on function public.nava_reward_points_balance() from public;
grant execute on function public.nava_mascot_wardrobe_state() to authenticated;
grant execute on function public.nava_select_mascot_wardrobe_item(text) to authenticated;
grant execute on function public.nava_unlock_mascot_wardrobe_item(text, uuid) to authenticated;
grant execute on function public.nava_reward_points_balance() to authenticated;

commit;
