alter table public.user_mascot_wardrobe_preferences
add column accessory_ids text[] not null default '{}'::text[];

update public.user_mascot_wardrobe_preferences
set accessory_ids = case
  when accessory_id = 'accessory-none' then '{}'::text[]
  else array[accessory_id]
end;

alter table public.user_mascot_wardrobe_preferences
add constraint user_mascot_wardrobe_preferences_accessory_ids_limit
check (cardinality(accessory_ids) <= 12 and array_position(accessory_ids, null) is null);

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
  valid_accessories text[] := '{}'::text[];
begin
  if target_user is null then raise exception 'authentication required'; end if;

  select * into preference
  from public.user_mascot_wardrobe_preferences
  where user_id = target_user;

  if preference.user_id is null then
    preference.skin_id := 'skin-cream';
    preference.accessory_id := 'accessory-none';
    preference.accessory_ids := '{}'::text[];
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
  if not (unlocked_items ? preference.background_id) then preference.background_id := 'background-morning-room'; end if;

  select coalesce(array_agg(candidate.item_id order by candidate.ordinality), '{}'::text[])
  into valid_accessories
  from unnest(preference.accessory_ids) with ordinality as candidate(item_id, ordinality)
  join public.mascot_wardrobe_items item on item.id = candidate.item_id
  where item.enabled
    and item.category = 'accessory'
    and candidate.item_id <> 'accessory-none'
    and unlocked_items ? candidate.item_id;

  return jsonb_build_object(
    'equipped', jsonb_build_object(
      'skinId', preference.skin_id,
      'accessoryId', coalesce(valid_accessories[1], 'accessory-none'),
      'accessoryIds', to_jsonb(valid_accessories),
      'backgroundId', preference.background_id
    ),
    'unlockedItemIds', unlocked_items,
    'balance', public.nava_reward_points_balance()
  );
end;
$$;

create or replace function public.nava_select_mascot_wardrobe_look(
  target_skin text,
  target_accessories text[],
  target_background text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid := auth.uid();
  normalized_accessories text[];
  selected_item text;
begin
  if target_user is null then raise exception 'authentication required'; end if;
  if target_skin is null or target_background is null or target_accessories is null then
    raise exception 'complete wardrobe look required';
  end if;
  if cardinality(target_accessories) > 12 then raise exception 'too many accessories'; end if;

  select coalesce(array_agg(dedup.item_id order by dedup.first_position), '{}'::text[])
  into normalized_accessories
  from (
    select candidate.item_id, min(candidate.ordinality) as first_position
    from unnest(target_accessories) with ordinality as candidate(item_id, ordinality)
    where candidate.item_id <> 'accessory-none'
    group by candidate.item_id
  ) dedup;

  foreach selected_item in array array_cat(array[target_skin, target_background], normalized_accessories)
  loop
    if not exists (
      select 1
      from public.mascot_wardrobe_items item
      where item.id = selected_item
        and item.enabled
        and item.category = case
          when selected_item = target_skin then 'skin'
          when selected_item = target_background then 'background'
          else 'accessory'
        end
        and (
          item.point_price = 0 or exists (
            select 1 from public.user_mascot_wardrobe_unlocks unlocked
            where unlocked.user_id = target_user and unlocked.item_id = item.id
          )
        )
    ) then
      raise exception 'wardrobe look contains unavailable or locked item';
    end if;
  end loop;

  insert into public.user_mascot_wardrobe_preferences(user_id)
  values(target_user)
  on conflict(user_id) do nothing;

  update public.user_mascot_wardrobe_preferences
  set skin_id = target_skin,
      accessory_id = coalesce(normalized_accessories[1], 'accessory-none'),
      accessory_ids = normalized_accessories,
      background_id = target_background,
      updated_at = now()
  where user_id = target_user;

  insert into public.analytics_events(user_id, event_name, properties)
  values(target_user, 'mascot_wardrobe_look_equipped', jsonb_build_object(
    'skinId', target_skin,
    'accessoryIds', to_jsonb(normalized_accessories),
    'backgroundId', target_background
  ));

  return public.nava_mascot_wardrobe_state();
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
      accessory_ids = case when item_record.category = 'accessory' and item_record.id = 'accessory-none' then '{}'::text[] when item_record.category = 'accessory' then array[item_record.id] else accessory_ids end,
      background_id = case when item_record.category = 'background' then item_record.id else background_id end,
      updated_at = now()
  where user_id = target_user;

  insert into public.analytics_events(user_id, event_name, properties)
  values(target_user, 'mascot_wardrobe_equipped', jsonb_build_object('itemId', item_record.id, 'category', item_record.category));

  return public.nava_mascot_wardrobe_state();
end;
$$;

revoke all on function public.nava_select_mascot_wardrobe_look(text, text[], text) from public, anon;
grant execute on function public.nava_select_mascot_wardrobe_look(text, text[], text) to authenticated;
