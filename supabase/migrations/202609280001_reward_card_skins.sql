-- NAVA points-card skins share the account's one reward-points balance.
-- Three default skins are free. Each additional skin is an auditable 10 XP unlock.

begin;

create table public.reward_card_skins (
  id text primary key check (char_length(id) between 1 and 80),
  sort_order smallint not null unique check (sort_order > 0),
  is_default boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.reward_card_skins (id, sort_order, is_default) values
  ('mint-growth', 1, true),
  ('warm-companion', 2, true),
  ('starlit-ideas', 3, true),
  ('lavender-reading', 4, false),
  ('seaside-studio', 5, false),
  ('sunset-garden', 6, false);

create table public.user_reward_card_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skin_id text not null references public.reward_card_skins(id) on delete restrict,
  idempotency_key uuid not null,
  points_spent integer not null default 10 check (points_spent = 10),
  created_at timestamptz not null default now(),
  unique (user_id, skin_id),
  unique (user_id, idempotency_key)
);

create table public.user_reward_card_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  selected_skin_id text not null references public.reward_card_skins(id) on delete restrict default 'mint-growth',
  updated_at timestamptz not null default now()
);

create index user_reward_card_unlocks_user_created_idx
  on public.user_reward_card_unlocks(user_id, created_at);

alter table public.reward_card_skins enable row level security;
alter table public.user_reward_card_unlocks enable row level security;
alter table public.user_reward_card_preferences enable row level security;

create policy "Authenticated users can view reward card skins"
on public.reward_card_skins for select to authenticated using (enabled = true);

create policy "Users can view own reward card unlocks"
on public.user_reward_card_unlocks for select to authenticated using (auth.uid() = user_id);

create policy "Users can view own reward card preference"
on public.user_reward_card_preferences for select to authenticated using (auth.uid() = user_id);

revoke all on public.reward_card_skins, public.user_reward_card_unlocks, public.user_reward_card_preferences from anon, authenticated;
grant select on public.reward_card_skins, public.user_reward_card_unlocks, public.user_reward_card_preferences to authenticated;

create trigger update_user_reward_card_preferences_updated_at
before update on public.user_reward_card_preferences
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
begin
  if target_user is null then raise exception 'authentication required'; end if;
  select coalesce(sum(points), 0)::integer into earned
  from public.growth_reward_ledger where user_id = target_user;
  select coalesce(sum(total_points), 0)::integer into order_spend
  from public.reward_orders where user_id = target_user and status = 'confirmed';
  select coalesce(sum(points_spent), 0)::integer into card_spend
  from public.user_reward_card_unlocks where user_id = target_user;
  return greatest(0, earned - order_spend - card_spend);
end;
$$;

create or replace function public.nava_reward_card_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid := auth.uid();
  selected_skin text;
  unlocked_skins jsonb;
begin
  if target_user is null then raise exception 'authentication required'; end if;
  select selected_skin_id into selected_skin
  from public.user_reward_card_preferences where user_id = target_user;
  selected_skin := coalesce(selected_skin, 'mint-growth');
  select coalesce(jsonb_agg(s.id order by s.sort_order), '[]'::jsonb) into unlocked_skins
  from public.reward_card_skins s
  where s.enabled and (s.is_default or exists (
    select 1 from public.user_reward_card_unlocks u
    where u.user_id = target_user and u.skin_id = s.id
  ));
  if not (unlocked_skins ? selected_skin) then selected_skin := 'mint-growth'; end if;
  return jsonb_build_object(
    'selectedCardId', selected_skin,
    'unlockedCardIds', unlocked_skins,
    'balance', public.nava_reward_points_balance()
  );
end;
$$;

create or replace function public.nava_select_reward_card_skin(target_skin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid := auth.uid();
  allowed boolean;
begin
  if target_user is null then raise exception 'authentication required'; end if;
  select exists (
    select 1 from public.reward_card_skins s
    where s.id = target_skin and s.enabled and (s.is_default or exists (
      select 1 from public.user_reward_card_unlocks u
      where u.user_id = target_user and u.skin_id = s.id
    ))
  ) into allowed;
  if not allowed then raise exception 'reward card skin is locked'; end if;
  insert into public.user_reward_card_preferences(user_id, selected_skin_id)
  values(target_user, target_skin)
  on conflict(user_id) do update set selected_skin_id = excluded.selected_skin_id, updated_at = now();
  return public.nava_reward_card_state();
end;
$$;

create or replace function public.nava_unlock_reward_card_skin(target_skin text, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid := auth.uid();
  skin_record public.reward_card_skins%rowtype;
  available_points integer;
  replayed_skin text;
begin
  if target_user is null then raise exception 'authentication required'; end if;
  if request_key is null then raise exception 'idempotency key required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user::text, 0));
  select skin_id into replayed_skin from public.user_reward_card_unlocks
  where user_id = target_user and idempotency_key = request_key;
  if replayed_skin is not null then return public.nava_reward_card_state(); end if;
  select * into skin_record from public.reward_card_skins where id = target_skin and enabled for update;
  if skin_record.id is null or skin_record.is_default then raise exception 'reward card skin is unavailable'; end if;
  if exists(select 1 from public.user_reward_card_unlocks where user_id = target_user and skin_id = target_skin) then
    return public.nava_reward_card_state();
  end if;
  available_points := public.nava_reward_points_balance();
  if available_points < 10 then raise exception 'insufficient points'; end if;
  insert into public.user_reward_card_unlocks(user_id, skin_id, idempotency_key, points_spent)
  values(target_user, target_skin, request_key, 10);
  insert into public.user_reward_card_preferences(user_id, selected_skin_id)
  values(target_user, target_skin)
  on conflict(user_id) do update set selected_skin_id = excluded.selected_skin_id, updated_at = now();
  insert into public.analytics_events(user_id, event_name, properties)
  values(target_user, 'reward_card_unlocked', jsonb_build_object('skinId', target_skin, 'points', 10));
  return public.nava_reward_card_state();
end;
$$;

revoke all on function public.nava_reward_points_balance() from public;
revoke all on function public.nava_reward_card_state() from public;
revoke all on function public.nava_select_reward_card_skin(text) from public;
revoke all on function public.nava_unlock_reward_card_skin(text, uuid) from public;
grant execute on function public.nava_reward_points_balance() to authenticated;
grant execute on function public.nava_reward_card_state() to authenticated;
grant execute on function public.nava_select_reward_card_skin(text) to authenticated;
grant execute on function public.nava_unlock_reward_card_skin(text, uuid) to authenticated;

commit;
