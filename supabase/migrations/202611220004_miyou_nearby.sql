begin;
create table public.miyou_nearby (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default now()+interval '90 seconds',
  created_at timestamptz not null default now()
);
alter table public.miyou_nearby enable row level security;
revoke all on public.miyou_nearby from public,anon,authenticated;
create index miyou_nearby_expiry on public.miyou_nearby(expires_at);
comment on table public.miyou_nearby is '面对面临时发现凭据，90 秒到期；无线广播不含账号或联系方式';
comment on column public.miyou_nearby.user_id is '开启面对面的现有账号';
comment on column public.miyou_nearby.token is '本次随机发现凭据，每次重新查找更换';
comment on column public.miyou_nearby.expires_at is '凭据失效时间';
comment on column public.miyou_nearby.created_at is '本次开始查找的服务端时间';

create function public.nava_miyou_nearby(action text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); mine public.miyou_nearby; peer uuid; code text; result jsonb;
begin
  if uid is null then raise exception 'miyou_auth_required'; end if;
  perform public.nava_miyou('state');
  if action='start' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,42));
    select * into mine from public.miyou_nearby where user_id=uid;
    if mine.created_at>clock_timestamp()-interval '5 seconds' then raise exception 'miyou_rate_limit'; end if;
    insert into public.miyou_nearby(user_id) values(uid)
      on conflict(user_id) do update set token=gen_random_uuid(),expires_at=clock_timestamp()+interval '90 seconds',created_at=clock_timestamp()
      returning * into mine;
    return jsonb_build_object('token',mine.token,'expiresAt',mine.expires_at);
  elsif action='stop' then
    delete from public.miyou_nearby where user_id=uid and token::text=payload->>'token';
    return jsonb_build_object('ok',true);
  end if;
  if not exists(select 1 from public.miyou_nearby where user_id=uid and expires_at>clock_timestamp()) then raise exception 'miyou_nearby_expired'; end if;
  if action='find' then
    if jsonb_typeof(payload->'tokens') is distinct from 'array' or jsonb_array_length(payload->'tokens')>20 then raise exception 'miyou_message_invalid'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('token',n.token,'name',p.name)), '[]'::jsonb) into result
    from public.miyou_nearby n join public.miyou_people p on p.user_id=n.user_id
    where n.user_id<>uid and n.expires_at>clock_timestamp() and n.token::text in(select jsonb_array_elements_text(payload->'tokens'))
      and not exists(select 1 from public.miyou_links l where l.user_a=least(uid,n.user_id) and l.user_b=greatest(uid,n.user_id) and (cardinality(l.blocked_by)>0 or l.status='declined'));
    return result;
  elsif action='invite' then
    select n.user_id,p.invite_code::text into peer,code from public.miyou_nearby n join public.miyou_people p on p.user_id=n.user_id
      where n.token::text=payload->>'token' and n.user_id<>uid and n.expires_at>clock_timestamp();
    if peer is null then raise exception 'miyou_nearby_expired'; end if;
    -- Discovery never accepts a friendship. Existing authenticated invitation
    -- limits and the recipient's separate acceptance remain authoritative.
    return public.nava_miyou('invite',jsonb_build_object('code',code));
  end if;
  raise exception 'miyou_action_invalid';
end;
$$;
revoke all on function public.nava_miyou_nearby(text,jsonb) from public,anon,authenticated;
grant execute on function public.nava_miyou_nearby(text,jsonb) to authenticated;
select cron.schedule('nava-miyou-retention','17 * * * *', $job$
  delete from public.miyou_messages where expires_at<=now();
  delete from public.miyou_nearby where expires_at<=now();
$job$);
commit;
