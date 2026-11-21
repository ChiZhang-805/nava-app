-- Real, account-bound friend conversations and cooperative virtual cat care.
-- No health records or public profile discovery are exposed by this feature.
begin;

create table public.miyou_people (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  invite_code uuid not null default gen_random_uuid() unique,
  invite_expires_at timestamptz not null default now() + interval '7 days',
  last_request_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.miyou_links (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  blocked_by uuid[] not null default '{}',
  read_a timestamptz not null default '-infinity',
  read_b timestamptz not null default '-infinity',
  created_at timestamptz not null default now(),
  unique(user_a,user_b), check(user_a < user_b), check(requested_by in (user_a,user_b))
);
create index miyou_links_b on public.miyou_links(user_b);
create table public.miyou_messages (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.miyou_links(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  reply_id uuid references public.miyou_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '21 days',
  unique(sender_id, request_id)
);
create index miyou_messages_page on public.miyou_messages(link_id,created_at desc,id desc);
create index miyou_messages_expiry on public.miyou_messages(expires_at);
create index miyou_messages_sender_time on public.miyou_messages(sender_id,created_at desc);
create index miyou_messages_reply on public.miyou_messages(reply_id) where reply_id is not null;
create table public.miyou_pets (
  link_id uuid primary key references public.miyou_links(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 16),
  requested_by uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  timezone text not null,
  created_at timestamptz not null default now()
);
create table public.miyou_care_catalog (
  id text primary key,
  kind text not null check(kind in ('food','exercise','rest')),
  name_zh text not null, name_en text not null,
  duration_minutes integer not null check(duration_minutes between 1 and 1440),
  asset text not null, sort_order integer not null
);
-- Durations are virtual-pet game tuning, not real-animal nutrition guidance.
insert into public.miyou_care_catalog values
  ('pumpkin','food','南瓜小食','Pumpkin',30,'pumpkin',1),
  ('egg','food','蛋黄小点','Egg',45,'egg',2),
  ('shrimp','food','鲜虾餐','Shrimp',60,'shrimp',3),
  ('chicken','food','鸡肉餐','Chicken',90,'chicken',4),
  ('kibble','food','酥脆猫粮','Kibble',120,'kibble',5),
  ('wetfood','food','肉泥罐罐','Pâté',150,'wetfood',6),
  ('fish','food','鱼肉餐','Fish',180,'fish',7),
  ('beef','food','牛肉餐','Beef',240,'beef',8),
  ('wand','exercise','逗猫棒','Feather',5,'wand',11),
  ('scratch','exercise','磨爪伸展','Stretch',8,'scratch',12),
  ('tunnel','exercise','隧道探险','Tunnel',10,'tunnel',13),
  ('ball','exercise','追滚球','Ball',15,'ball',14),
  ('climb','exercise','爬高高','Climb',20,'climb',15),
  ('treadmill','exercise','轻快慢跑','Jog',25,'treadmill',16),
  ('nap','rest','打个盹','Nap',20,'sleep',21),
  ('rest','rest','午后小憩','Rest',60,'sleep',22),
  ('sleep','rest','好好睡一觉','Sleep',480,'sleep',23);
create table public.miyou_care_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.miyou_pets(link_id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  item_id text not null references public.miyou_care_catalog(id),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  unique(actor_id,request_id)
);
create index miyou_care_recent on public.miyou_care_events(link_id,ends_at desc);
create table public.miyou_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  link_id uuid not null references public.miyou_links(id) on delete cascade,
  message_id uuid references public.miyou_messages(id) on delete set null,
  reason text not null check(char_length(reason) between 1 and 300),
  created_at timestamptz not null default now()
);
create index miyou_reports_reporter_time on public.miyou_reports(reporter_id,created_at desc);
create index miyou_reports_message on public.miyou_reports(message_id) where message_id is not null;
comment on table public.miyou_people is '咪友资料：关联现有 NAVA Auth 账号，不是独立账号系统';
comment on column public.miyou_people.user_id is '现有 auth.users.id；账号删除时级联清理';
comment on column public.miyou_people.name is '向咪友展示的昵称，1–24 字';
comment on column public.miyou_people.invite_code is '一次性好友邀请码，成功使用后轮换';
comment on column public.miyou_people.invite_expires_at is '邀请码失效时间，默认七天';
comment on column public.miyou_people.last_request_at is '最近发送好友请求时间，用于服务端限流';
comment on table public.miyou_links is '两名现有用户的好友关系、屏蔽状态和各自阅读位置';
comment on column public.miyou_links.user_a is '按 UUID 顺序较小的成员；与 user_b 组成唯一关系';
comment on column public.miyou_links.user_b is '按 UUID 顺序较大的成员';
comment on column public.miyou_links.requested_by is '好友邀请发起人，必须是关系成员';
comment on column public.miyou_links.status is 'pending 待接受 / accepted 已接受 / declined 已忽略';
comment on column public.miyou_links.blocked_by is '主动屏蔽此关系的成员 UUID 集合';
comment on column public.miyou_links.read_a is '成员 A 实际读取的最近消息时间边界';
comment on column public.miyou_links.read_b is '成员 B 实际读取的最近消息时间边界';
comment on table public.miyou_messages is '咪友文字与表情消息；21 天后不可读并由定时任务清理';
comment on column public.miyou_messages.link_id is '所属双人会话关系';
comment on column public.miyou_messages.sender_id is '发送人，RPC 验证必须属于当前关系';
comment on column public.miyou_messages.request_id is '客户端幂等请求 UUID，重试不会重复发送';
comment on column public.miyou_messages.body is '消息正文，1–2000 字';
comment on column public.miyou_messages.reply_id is '同一会话的被引用消息；原消息删除后置空';
comment on column public.miyou_messages.expires_at is '服务端计算的失效时间，发送后 21 天';
comment on table public.miyou_pets is '双方确认共养的纳瓦猫；每段好友关系最多一只';
comment on column public.miyou_pets.link_id is '共养关系主键，关联好友关系';
comment on column public.miyou_pets.name is '共同设置的小猫名字，1–16 字';
comment on column public.miyou_pets.requested_by is '共养邀请发起人';
comment on column public.miyou_pets.accepted_at is '另一位成员接受共养的时间；空值代表待接受';
comment on column public.miyou_pets.timezone is '用于日节律及成长结算的 IANA 时区';
comment on table public.miyou_care_catalog is '虚拟照料目录：8 种食物、6 种运动、3 种休息；时长为游戏参数';
comment on column public.miyou_care_catalog.kind is 'food 喂食 / exercise 运动 / rest 休息';
comment on column public.miyou_care_catalog.name_zh is '中文展示名称';
comment on column public.miyou_care_catalog.name_en is '单行英文短名称';
comment on column public.miyou_care_catalog.duration_minutes is '服务端规定的虚拟照料分钟数，不是动物医学建议';
comment on column public.miyou_care_catalog.asset is 'APP 中透明图标的资源标识';
comment on column public.miyou_care_catalog.sort_order is '目录展示顺序';
comment on table public.miyou_care_events is '持久化照料事件；服务端串行安排并按完成日期和类别计算成长';
comment on column public.miyou_care_events.link_id is '被照料的小猫所属共养关系';
comment on column public.miyou_care_events.actor_id is '操作的关系成员';
comment on column public.miyou_care_events.request_id is '照料操作幂等 UUID';
comment on column public.miyou_care_events.item_id is '所选食物、运动或休息目录项';
comment on column public.miyou_care_events.started_at is '服务端记录的开始时间';
comment on column public.miyou_care_events.ends_at is '按目录时长计算的结束时间';
comment on table public.miyou_reports is '用户提交的会话举报；客户端不能直接访问';
comment on column public.miyou_reports.reporter_id is '举报人现有 NAVA 账号 ID';
comment on column public.miyou_reports.link_id is '被举报会话关系';
comment on column public.miyou_reports.message_id is '可选的被举报消息；消息到期删除后置空';
comment on column public.miyou_reports.reason is '举报理由，1–300 字';
-- RPC-only access. RLS is an additional deny-all boundary, including for tables
-- whose default privileges in a hosted Supabase project might grant SELECT.
alter table public.miyou_people enable row level security;
alter table public.miyou_links enable row level security;
alter table public.miyou_messages enable row level security;
alter table public.miyou_pets enable row level security;
alter table public.miyou_care_catalog enable row level security;
alter table public.miyou_care_events enable row level security;
alter table public.miyou_reports enable row level security;
revoke all on public.miyou_people, public.miyou_links, public.miyou_messages,
  public.miyou_pets, public.miyou_care_catalog, public.miyou_care_events,
  public.miyou_reports from public, anon, authenticated;

-- Share only the chosen avatar, never the rest of a health profile.
create function public.nava_miyou_avatar_ref(target uuid)
returns text language sql stable security definer set search_path = '' as $$
  select nullif(btrim(p.avatar_url),'') from public.profiles p
  where p.id=target and auth.uid() is not null and (
    target=auth.uid() or exists(select 1 from public.miyou_links l
      where l.status='accepted' and cardinality(l.blocked_by)=0
        and auth.uid() in(l.user_a,l.user_b) and target in(l.user_a,l.user_b))
  ) and (p.avatar_url like 'https://%' or p.avatar_url like 'storage://profile-avatars/'||target::text||'/%');
$$;
revoke all on function public.nava_miyou_avatar_ref(uuid) from public,anon,authenticated;

-- The bucket stays private. Accepted, unblocked friends may sign only the
-- current profile image, not list/read another person's historical uploads.
create function public.nava_miyou_can_read_avatar(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(
    select 1 from public.profiles p join public.miyou_links l
      on p.id in(l.user_a,l.user_b) and auth.uid() in(l.user_a,l.user_b)
    where l.status='accepted' and cardinality(l.blocked_by)=0
      and split_part(object_name,'/',1)=p.id::text
      and (p.avatar_url='storage://profile-avatars/'||object_name
        or (p.avatar_url like 'https://%' and split_part(p.avatar_url,'/storage/v1/object/public/profile-avatars/',2)=object_name))
  );
$$;
revoke all on function public.nava_miyou_can_read_avatar(text) from public,anon,authenticated;
grant execute on function public.nava_miyou_can_read_avatar(text) to authenticated;
create policy "Accepted Miyou friends can read current avatars"
on storage.objects for select to authenticated
using (bucket_id='profile-avatars' and public.nava_miyou_can_read_avatar(name));

create function public.nava_miyou(action text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  peer uuid; lid uuid; rid uuid; reply uuid;
  link public.miyou_links; pet public.miyou_pets; item public.miyou_care_catalog;
  person public.miyou_people;
  value text; zone text; result jsonb; stamp timestamptz := clock_timestamp();
begin
  if uid is null then raise exception 'miyou_auth_required'; end if;
  if action = 'join' then
    value := btrim(payload->>'name');
    if value is null or char_length(value) not between 1 and 24 then raise exception 'miyou_name_invalid'; end if;
    insert into public.miyou_people(user_id,name) values(uid,value)
      on conflict(user_id) do update set name=excluded.name;
    return jsonb_build_object('ok',true);
  end if;
  select * into person from public.miyou_people where user_id=uid;
  if not found then
    if action='state' then return jsonb_build_object('registered',false,'serverNow',stamp); end if;
    raise exception 'miyou_join_required';
  end if;
  if action='invite_code' then
    update public.miyou_people set invite_code=gen_random_uuid(),invite_expires_at=stamp+interval '7 days' where user_id=uid;
    return jsonb_build_object('ok',true);
  end if;
  if action in ('invite','send','report') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,41));
  end if;
  if action='invite' then
    -- Serialise requests per sender to make the limit effective under retries.
    select user_id into peer from public.miyou_people where invite_code::text=lower(btrim(payload->>'code')) and invite_expires_at>stamp and user_id<>uid;
    if peer is null then raise exception 'miyou_invite_invalid'; end if;
    perform 1 from public.miyou_people where user_id in(uid,peer) order by user_id for update;
    select * into person from public.miyou_people where user_id=uid;
    if person.last_request_at > stamp-interval '5 seconds' then raise exception 'miyou_rate_limit'; end if;
    select user_id into peer from public.miyou_people
      where invite_code::text=lower(btrim(payload->>'code')) and invite_expires_at>stamp and user_id<>uid for update;
    if peer is null then raise exception 'miyou_invite_invalid'; end if;
    if (select count(*) from public.miyou_links where requested_by=uid and created_at>stamp-interval '1 day')>=20 then raise exception 'miyou_rate_limit'; end if;
    select * into link from public.miyou_links where user_a=least(uid,peer) and user_b=greatest(uid,peer) for update;
    if found then
      if cardinality(link.blocked_by)>0 or link.status='declined' then raise exception 'miyou_invite_invalid'; end if;
      return jsonb_build_object('ok',true);
    end if;
    insert into public.miyou_links(user_a,user_b,requested_by) values(least(uid,peer),greatest(uid,peer),uid);
    update public.miyou_people set last_request_at=stamp where user_id=uid;
    -- Single use: a leaked code cannot invite arbitrary additional people.
    update public.miyou_people set invite_code=gen_random_uuid(),invite_expires_at=stamp+interval '7 days' where user_id=peer;
    return jsonb_build_object('ok',true);
  end if;
  if action='state' then
    select jsonb_build_object('registered',true,'serverNow',stamp,'me',jsonb_build_object('id',uid,'name',person.name,'avatar',public.nava_miyou_avatar_ref(uid),
      'code',person.invite_code,'codeExpiresAt',person.invite_expires_at),
      'catalog',(select jsonb_agg(to_jsonb(c) order by c.sort_order) from public.miyou_care_catalog c),
      'friends',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'peerId',p.user_id,'name',p.name,'avatar',public.nava_miyou_avatar_ref(p.user_id),
        'status',l.status,'incoming',l.requested_by<>uid,'blocked',cardinality(l.blocked_by)>0,'blockedByMe',uid=any(l.blocked_by),
        'unread',(select count(*) from public.miyou_messages m where m.link_id=l.id and m.sender_id<>uid and m.expires_at>stamp and m.created_at>case when uid=l.user_a then l.read_a else l.read_b end),
        'lastMessage',(select jsonb_build_object('body',m.body,'at',m.created_at) from public.miyou_messages m where m.link_id=l.id and m.expires_at>stamp order by m.created_at desc,m.id desc limit 1),
        'pet',(select to_jsonb(petrow) from public.miyou_pets petrow where petrow.link_id=l.id)) order by l.created_at desc)
      from public.miyou_links l join public.miyou_people p on p.user_id=case when uid=l.user_a then l.user_b else l.user_a end
      where uid in(l.user_a,l.user_b) and l.status<>'declined'),'[]'::jsonb)) into result;
    return result;
  end if;
  lid := (payload->>'linkId')::uuid;
  select * into link from public.miyou_links where id=lid and uid in(user_a,user_b) for update;
  if not found then raise exception 'miyou_forbidden'; end if;
  if action='block' then
    update public.miyou_links set blocked_by=array_append(array_remove(blocked_by,uid),uid) where id=lid;
    return jsonb_build_object('ok',true);
  elsif action='unblock' then
    update public.miyou_links set blocked_by=array_remove(blocked_by,uid) where id=lid;
    return jsonb_build_object('ok',true);
  end if;
  if action='report' then
    if link.status<>'accepted' then raise exception 'miyou_forbidden'; end if;
    value := btrim(payload->>'reason'); reply := (payload->>'messageId')::uuid;
    if value is null or char_length(value) not between 1 and 300 then raise exception 'miyou_message_invalid'; end if;
    if reply is not null and not exists(select 1 from public.miyou_messages where id=reply and link_id=lid and expires_at>stamp) then raise exception 'miyou_forbidden'; end if;
    if exists(select 1 from public.miyou_reports where reporter_id=uid and created_at>stamp-interval '1 minute') then raise exception 'miyou_rate_limit'; end if;
    insert into public.miyou_reports(reporter_id,link_id,message_id,reason) values(uid,lid,reply,value);
    return jsonb_build_object('ok',true);
  end if;
  if cardinality(link.blocked_by)>0 then raise exception 'miyou_blocked'; end if;
  if action in ('accept','decline') then
    if link.status<>'pending' or link.requested_by=uid then raise exception 'miyou_forbidden'; end if;
    update public.miyou_links set status=case when action='accept' then 'accepted' else 'declined' end where id=lid;
    return jsonb_build_object('ok',true);
  end if;
  if link.status<>'accepted' then raise exception 'miyou_forbidden'; end if;
  if action='send' then
    value := btrim(payload->>'body'); rid := (payload->>'requestId')::uuid; reply := (payload->>'replyId')::uuid;
    if rid is null or value is null or char_length(value) not between 1 and 2000 then raise exception 'miyou_message_invalid'; end if;
    if exists(select 1 from public.miyou_messages where sender_id=uid and request_id=rid and link_id=lid and body=value and reply_id is not distinct from reply) then return jsonb_build_object('ok',true); end if;
    if (select count(*) from public.miyou_messages where sender_id=uid and created_at>stamp-interval '1 minute')>=30 then raise exception 'miyou_rate_limit'; end if;
    if reply is not null and not exists(select 1 from public.miyou_messages where id=reply and link_id=lid and expires_at>stamp) then raise exception 'miyou_reply_expired'; end if;
    insert into public.miyou_messages(link_id,sender_id,request_id,body,reply_id,created_at,expires_at)
      values(lid,uid,rid,value,reply,stamp,stamp+interval '21 days');
    return jsonb_build_object('ok',true);
  elsif action='messages' then
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]'::jsonb) into result from (
      select m.id,m.sender_id,m.body,m.created_at,m.expires_at,m.reply_id,
        (select jsonb_build_object('body',left(q.body,120),'senderId',q.sender_id) from public.miyou_messages q where q.id=m.reply_id and q.expires_at>stamp) as quote
      from public.miyou_messages m where m.link_id=lid and m.expires_at>stamp
      and (payload->>'before' is null or (m.created_at,m.id)<((payload->>'before')::timestamptz,(payload->>'beforeId')::uuid))
      order by m.created_at desc,m.id desc limit 60
    ) m;
    return jsonb_build_object('messages',result,'serverNow',stamp);
  elsif action='read' then
    -- Mark only the fetched message boundary, not unseen arrivals after the fetch.
    select created_at into stamp from public.miyou_messages
      where id=(payload->>'messageId')::uuid and link_id=lid and expires_at>clock_timestamp();
    if stamp is null then return jsonb_build_object('ok',true); end if;
    update public.miyou_links set read_a=case when uid=user_a then greatest(read_a,stamp) else read_a end,read_b=case when uid=user_b then greatest(read_b,stamp) else read_b end where id=lid;
    return jsonb_build_object('ok',true);
  end if;
  select * into pet from public.miyou_pets where link_id=lid for update;
  if action='pet_invite' then
    value:=btrim(payload->>'name'); zone:=payload->>'timezone';
    if value is null or char_length(value) not between 1 and 16 then raise exception 'miyou_name_invalid'; end if;
    if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'miyou_timezone_invalid'; end if;
    if pet.link_id is null then
      insert into public.miyou_pets(link_id,name,requested_by,timezone) values(lid,value,uid,zone);
    end if;
    return jsonb_build_object('ok',true);
  end if;
  if pet.link_id is null then raise exception 'miyou_pet_missing'; end if;
  if action='pet_accept' then
    if pet.requested_by=uid then raise exception 'miyou_forbidden'; end if;
    update public.miyou_pets set accepted_at=coalesce(accepted_at,stamp) where link_id=lid;
    return jsonb_build_object('ok',true);
  elsif action='pet_decline' then
    if pet.accepted_at is not null then raise exception 'miyou_forbidden'; end if;
    delete from public.miyou_pets where link_id=lid;
    return jsonb_build_object('ok',true);
  end if;
  if pet.accepted_at is null then raise exception 'miyou_pet_pending'; end if;
  if action='pet_name' then
    value:=btrim(payload->>'name');
    if value is null or char_length(value) not between 1 and 16 then raise exception 'miyou_name_invalid'; end if;
    update public.miyou_pets set name=value where link_id=lid;
    return jsonb_build_object('ok',true);
  elsif action='care' then
    rid:=(payload->>'requestId')::uuid;
    if rid is null then raise exception 'miyou_message_invalid'; end if;
    if exists(select 1 from public.miyou_care_events where actor_id=uid and request_id=rid and link_id=lid and item_id=payload->>'itemId') then return jsonb_build_object('ok',true); end if;
    -- The shared link/pet locks serialize simultaneous care from both partners.
    if exists(select 1 from public.miyou_care_events where link_id=lid and ends_at>stamp) then raise exception 'miyou_pet_busy'; end if;
    select * into item from public.miyou_care_catalog where id=payload->>'itemId';
    if not found then raise exception 'miyou_item_invalid'; end if;
    insert into public.miyou_care_events(link_id,actor_id,request_id,item_id,started_at,ends_at)
      values(lid,uid,rid,item.id,stamp,stamp+make_interval(mins=>item.duration_minutes));
    return jsonb_build_object('ok',true);
  elsif action='pet' then
    return jsonb_build_object('pet',to_jsonb(pet),'serverNow',stamp,
      'active',(select to_jsonb(e) from public.miyou_care_events e where e.link_id=lid and e.ends_at>stamp order by e.ends_at desc limit 1),
      'today',(select coalesce(jsonb_agg(distinct c.kind),'[]'::jsonb) from public.miyou_care_events e join public.miyou_care_catalog c on c.id=e.item_id
        where e.link_id=lid and e.ends_at<=stamp and (e.ends_at at time zone pet.timezone)::date=(stamp at time zone pet.timezone)::date),
      'growth',(select count(*)*10 from (select distinct (e.ends_at at time zone pet.timezone)::date,c.kind from public.miyou_care_events e join public.miyou_care_catalog c on c.id=e.item_id where e.link_id=lid and e.ends_at<=stamp) days),
      'history',(select coalesce(jsonb_agg(to_jsonb(e) order by e.started_at desc),'[]'::jsonb) from (select * from public.miyou_care_events where link_id=lid order by started_at desc limit 15)e));
  end if;
  raise exception 'miyou_action_invalid';
end;
$$;
revoke all on function public.nava_miyou(text,jsonb) from public,anon,authenticated;
grant execute on function public.nava_miyou(text,jsonb) to authenticated;

-- Paginated account export uses the same existing Auth identity. The whitelist
-- is server-owned; no caller-supplied SQL or arbitrary table name is executed.
create function public.nava_miyou_export(kind text, offset_rows integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); scope_sql text; order_column text; row_count bigint; page jsonb;
begin
  if uid is null then raise exception 'miyou_auth_required'; end if;
  if offset_rows is null or offset_rows < 0 then raise exception 'miyou_export_offset_invalid'; end if;
  case kind
    when 'miyou_people' then scope_sql := 't.user_id=$1'; order_column := 'user_id';
    when 'miyou_links' then scope_sql := '$1 in(t.user_a,t.user_b)'; order_column := 'id';
    when 'miyou_messages' then scope_sql := 't.expires_at>now() and exists(select 1 from public.miyou_links l where l.id=t.link_id and $1 in(l.user_a,l.user_b))'; order_column := 'id';
    when 'miyou_pets' then scope_sql := 'exists(select 1 from public.miyou_links l where l.id=t.link_id and $1 in(l.user_a,l.user_b))'; order_column := 'link_id';
    when 'miyou_care_events' then scope_sql := 'exists(select 1 from public.miyou_links l where l.id=t.link_id and $1 in(l.user_a,l.user_b))'; order_column := 'id';
    when 'miyou_reports' then scope_sql := 't.reporter_id=$1'; order_column := 'id';
    else raise exception 'miyou_export_kind_invalid';
  end case;
  execute format('select count(*) from public.%I t where %s',kind,scope_sql) into row_count using uid;
  execute format('select coalesce(jsonb_agg(to_jsonb(page)),''[]''::jsonb) from (select t.* from public.%I t where %s order by t.%I offset $2 limit 500) page',kind,scope_sql,order_column)
    into page using uid,offset_rows;
  return jsonb_build_object('rows',page,'total',row_count);
end;
$$;
revoke all on function public.nava_miyou_export(text,integer) from public,anon,authenticated;
grant execute on function public.nava_miyou_export(text,integer) to authenticated;
comment on function public.nava_miyou_export(text,integer) is '仅导出当前账号所属的咪友数据，按 500 行分页；不导出过期消息';
commit;
