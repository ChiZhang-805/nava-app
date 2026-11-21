begin;

create or replace function public.nava_miyou(action text, payload jsonb default '{}'::jsonb)
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
    -- Reuse the account profile without a second registration screen. Do not
    -- expose email/phone defaults from legacy profile creation as a social name.
    select btrim(username) into value from public.profiles where id=uid;
    if value is null or value='' or value like '%@%' or value ~ '^\+?[0-9 ()-]{7,}$' then value:='咪友'; end if;
    insert into public.miyou_people(user_id,name) values(uid,left(value,24)) on conflict(user_id) do nothing;
    select * into person from public.miyou_people where user_id=uid;
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
    if action='accept' then
      zone:=payload->>'timezone';
      if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then zone:='UTC'; end if;
      insert into public.miyou_pets(link_id,name,requested_by,accepted_at,timezone)
        values(lid,'纳瓦咪',link.requested_by,stamp,zone)
        on conflict(link_id) do update set accepted_at=coalesce(miyou_pets.accepted_at,excluded.accepted_at);
    end if;
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
  if pet.link_id is null then raise exception 'miyou_pet_missing'; end if;
  -- Old clients may still send invitation actions. They cannot rename or delete
  -- the automatically adopted pet; existing care and names remain intact.
  if action in ('pet_invite','pet_accept') then return jsonb_build_object('ok',true); end if;
  if action='pet_decline' then raise exception 'miyou_forbidden'; end if;
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


-- Existing accepted friends receive a cat too. Keep custom names and history.
insert into public.miyou_pets(link_id,name,requested_by,accepted_at,timezone)
select id,'纳瓦咪',requested_by,now(),'UTC' from public.miyou_links where status='accepted'
on conflict(link_id) do update set accepted_at=coalesce(miyou_pets.accepted_at,excluded.accepted_at);
comment on column public.miyou_pets.accepted_at is '好友建立后自动开始共同陪伴的时间';
comment on column public.miyou_pets.name is '小猫名字，默认纳瓦咪，可随后修改，1–16 字';

commit;
