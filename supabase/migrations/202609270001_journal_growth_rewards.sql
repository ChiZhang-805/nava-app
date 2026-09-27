-- Preserve the existing ledger, amounts and thresholds. The six-module journal
-- and legacy records share the SAME account/date/reward key, never a view count.
-- New RPC names keep a rolling frontend release compatible with older clients.
create function public.nava_growth_local_date(p_timezone text) returns date
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_timezone is null or length(p_timezone)>100 or not exists
    (select 1 from pg_timezone_names where name=p_timezone) then
    raise exception 'Invalid device time zone';
  end if;
  return (now() at time zone p_timezone)::date;
end $$;
revoke all on function public.nava_growth_local_date(text) from public,anon,authenticated;

create function public.nava_reconcile_growth_rewards_v2(p_timezone text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target_user uuid:=auth.uid(); target_date date;
  awarded jsonb; total_points integer; badges jsonb;
begin
  target_date:=public.nava_growth_local_date(p_timezone);
  perform pg_advisory_xact_lock(hashtextextended('growth:'||target_user::text,0));
  with journal as (
    select category,fields from public.journal_entries where user_id=target_user and record_date=target_date
  ), eligible(event_key,points,source,qualifies) as (values
    ('profile:foundation',30,'verified_profile',exists(select 1 from public.profiles where id=target_user and nullif(trim(username),'') is not null and nullif(trim(occupation),'') is not null and nullif(trim(age_group),'') is not null)),
    ('profile:goal',30,'verified_profile',exists(select 1 from public.profiles where id=target_user and nullif(trim(goal),'') is not null)),
    (target_date||':sleep',25,'verified_record',exists(select 1 from journal where category='sleep') or exists(select 1 from public.sleep_records where user_id=target_user and record_date=target_date)),
    (target_date||':exercise',25,'verified_record',exists(select 1 from journal where category='sport' and (fields->>'durationMinutes')::numeric>=20) or exists(select 1 from public.exercise_records where user_id=target_user and record_date=target_date and (coalesce(exercise_minutes,0)>=20 or coalesce(steps,0)>=3000))),
    (target_date||':mood',20,'verified_record',exists(select 1 from journal where category='mood') or exists(select 1 from public.mood_records where user_id=target_user and record_date=target_date)),
    (target_date||':nutrition',20,'verified_record',exists(select 1 from journal where category='food') or exists(select 1 from public.nutrition_records where user_id=target_user and record_date=target_date)),
    (target_date||':focus',20,'verified_record',
      (select coalesce(sum((fields->>'durationMinutes')::numeric),0) from journal where category='focus') +
      (select coalesce(sum(total_minutes),0) from public.focus_records where user_id=target_user and record_date=target_date)>=25),
    (target_date||':face',15,'verified_record',exists(select 1 from journal where category='face') or exists(select 1 from public.face_records where user_id=target_user and record_date=target_date)),
    -- Do not infer a bare-face bonus from free text or AI output.
    (target_date||':bare-face-bonus',15,'verified_record',exists(select 1 from public.face_records where user_id=target_user and record_date=target_date and capture_mode='bare_face')),
    (target_date||':task',20,'verified_task',exists(select 1 from public.tasks where user_id=target_user and scheduled_date=target_date and completed=true and category='todo'))
  ), inserted as (
    insert into public.growth_reward_ledger(user_id,event_key,points,source,metadata)
    select target_user,event_key,points,source,
      case when event_key like '%:bare-face-bonus' then '{"multiplier":2}'::jsonb else '{}'::jsonb end
    from eligible where qualifies
    on conflict(user_id,event_key) do nothing
    returning event_key,points,source
  ) select coalesce(jsonb_agg(jsonb_build_object('eventKey',event_key,'points',points,'source',source)),'[]'::jsonb) into awarded from inserted;

  select coalesce(sum(points),0) into total_points from public.growth_reward_ledger where user_id=target_user;
  if total_points>=100 then
    insert into public.growth_badges(user_id,badge_key,metadata) values(target_user,'rhythm_observer',jsonb_build_object('points',total_points)) on conflict do nothing;
  end if;
  if (select count(distinct record_date) from public.face_records where user_id=target_user and capture_mode='bare_face' and record_date between target_date-6 and target_date)=7 then
    insert into public.growth_badges(user_id,badge_key,metadata) values(target_user,'bare_face_week','{"days":7}') on conflict do nothing;
  end if;
  select coalesce(jsonb_agg(badge_key order by awarded_at),'[]'::jsonb) into badges from public.growth_badges where user_id=target_user;
  return jsonb_build_object('totalPoints',total_points,'badges',badges,'awarded',awarded);
end $$;
revoke all on function public.nava_reconcile_growth_rewards_v2(text) from public,anon;
grant execute on function public.nava_reconcile_growth_rewards_v2(text) to authenticated;

-- The saved row and any eligible journal points commit together. A transport
-- retry retains the existing record/version idempotency and unique ledger key.
create function public.nava_save_journal_entry_v2(p_record jsonb,p_expected_version integer,p_timezone text)
returns public.journal_entries language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.journal_entries;
begin
  perform public.nava_growth_local_date(p_timezone);
  perform pg_advisory_xact_lock(hashtextextended('growth:'||auth.uid()::text,0));
  saved:=public.save_journal_entry(p_record,p_expected_version);
  perform public.nava_reconcile_growth_rewards_v2(p_timezone);
  return saved;
end $$;
revoke all on function public.nava_save_journal_entry_v2(jsonb,integer,text) from public,anon;
grant execute on function public.nava_save_journal_entry_v2(jsonb,integer,text) to authenticated;

create function public.nava_record_growth_activity_v2(activity_kind text,p_timezone text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target_user uuid:=auth.uid(); target_date date; kind text:=lower(trim(coalesce(activity_kind,'')));
  reward_points integer; inserted_count integer; total_points integer; awarded jsonb:='[]'; event_name text;
begin
  target_date:=public.nava_growth_local_date(p_timezone);
  perform pg_advisory_xact_lock(hashtextextended('growth:'||target_user::text,0));
  case kind
    when 'checkin' then reward_points:=10;event_name:='growth_daily_checkin';
    when 'share' then reward_points:=15;event_name:='growth_report_card_shared';
    when 'ai' then reward_points:=15;event_name:='growth_ai_conversation_completed';
    else raise exception 'Unsupported growth activity';
  end case;
  insert into public.growth_reward_ledger(user_id,event_key,points,source,metadata)
    values(target_user,target_date||':'||kind,reward_points,'verified_engagement',jsonb_build_object('activity',kind,'date',target_date))
    on conflict(user_id,event_key) do nothing;
  get diagnostics inserted_count=row_count;
  if inserted_count>0 then
    insert into public.analytics_events(user_id,event_name,properties) values(target_user,event_name,jsonb_build_object('rewardPoints',reward_points));
    awarded:=jsonb_build_array(jsonb_build_object('eventKey',target_date||':'||kind,'points',reward_points,'source','verified_engagement'));
  end if;
  select coalesce(sum(points),0) into total_points from public.growth_reward_ledger where user_id=target_user;
  if total_points>=100 then
    insert into public.growth_badges(user_id,badge_key,metadata) values(target_user,'rhythm_observer',jsonb_build_object('points',total_points)) on conflict do nothing;
  end if;
  return jsonb_build_object('totalPoints',total_points,'awarded',awarded,'activity',kind,'completed',inserted_count>0);
end $$;
revoke all on function public.nava_record_growth_activity_v2(text,text) from public,anon;
grant execute on function public.nava_record_growth_activity_v2(text,text) to authenticated;
