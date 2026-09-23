-- Four-page journal: raw, user-confirmed observations are separate from old scores.
create function public.valid_journal_fields(category text, fields jsonb) returns boolean
language plpgsql immutable set search_path=public as $$
declare spec jsonb; required_keys text[]; k text; v jsonb; n numeric;
begin
  if fields is null or jsonb_typeof(fields)<>'object' then return false; end if;
  case category
    when 'mood' then spec:='{"mood":60,"reason":60,"notes":32}';required_keys:=array['mood'];
    when 'food' then spec:='{"meal":8,"foods":60,"portion":50,"notes":32,"calories":-15000,"protein":-2000,"carbs":-2000,"fat":-2000}';required_keys:=array['meal','foods'];
    when 'focus' then spec:='{"task":60,"durationMinutes":-720,"notes":60}';required_keys:=array['task','durationMinutes'];
    when 'sport' then spec:='{"activity":40,"durationMinutes":-1440,"notes":60}';required_keys:=array['activity','durationMinutes','notes'];
    when 'sleep' then spec:='{"bedtime":5,"wakeTime":5,"quality":60,"notes":32,"hours":-24,"recordDate":10,"bedDate":10,"wakeDate":10,"startedAt":32,"endedAt":32}';required_keys:=array['bedtime','wakeTime','quality'];
    when 'face' then spec:='{"feeling":40,"eyeArea":50,"skinAppearance":60,"notes":32}';required_keys:=array['feeling'];
    else return false;
  end case;
  foreach k in array required_keys loop
    if fields->>k is null or btrim(fields->>k)='' then return false;end if;
  end loop;
  for k,v in select * from jsonb_each(fields) loop
    if not spec ? k then return false;end if;
    if v='null'::jsonb then continue;end if;
    n:=(spec->>k)::numeric;
    if n<0 then
      if jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric > -n then return false;end if;
      if k='durationMinutes' and (v::text)::numeric<=0 then return false;end if;
    elsif jsonb_typeof(v)<>'string' or length(fields->>k)>n then return false;end if;
  end loop;
  if category='food' and fields->>'meal' not in ('早餐','午餐','晚餐','加餐') then return false;end if;
  if category='sleep' and ((fields->>'bedtime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (fields->>'wakeTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then return false;end if;
  return true;
exception when others then return false;
end $$;
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  category text not null check (category in ('mood','food','focus','sport','sleep','face')),
  fields jsonb not null check (public.valid_journal_fields(category,fields) and octet_length(fields::text) <= 16000),
  focus jsonb check (focus is null or jsonb_typeof(focus) = 'object'),
  source text not null default 'manual' check (length(source) <= 40),
  estimated boolean not null default false,
  media_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check (media_path is null or split_part(media_path,'/',1) = user_id::text)
);
create index journal_entries_owner_day on public.journal_entries(user_id, record_date desc, created_at desc);
alter table public.journal_entries enable row level security;
create policy journal_owner_read on public.journal_entries for select to authenticated using (auth.uid() = user_id);
create policy journal_owner_insert on public.journal_entries for insert to authenticated with check (auth.uid() = user_id);
create policy journal_owner_update on public.journal_entries for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy journal_owner_delete on public.journal_entries for delete to authenticated using (auth.uid() = user_id);
revoke all on public.journal_entries from anon;
grant select, delete on public.journal_entries to authenticated;

-- One version-checked mutation. Replaying an acknowledged create is idempotent;
-- stale edits cannot replace another device's changes.
create function public.save_journal_entry(p_record jsonb, p_expected_version integer default null)
returns public.journal_entries language plpgsql security definer set search_path = public as $$
declare existing public.journal_entries; result public.journal_entries; record_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  record_id := (p_record->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || record_id::text, 0));
  select * into existing from public.journal_entries where id=record_id and user_id=auth.uid() for update;
  if found then
    if p_expected_version is null then
      if existing.fields = p_record->'data' and existing.record_date=(p_record->>'recordDate')::date
         and existing.category=p_record->>'category' and existing.focus is not distinct from nullif(p_record->'focus','null'::jsonb)
         and existing.source=coalesce(p_record->>'source','manual') and existing.estimated=coalesce((p_record->>'estimated')::boolean,false)
         and existing.media_path is not distinct from p_record->>'mediaPath' then return existing; end if;
      raise exception 'Record already exists; reopen before editing';
    end if;
    if existing.version <> p_expected_version then raise exception 'Record changed; reopen before editing'; end if;
    update public.journal_entries set fields=p_record->'data', record_date=(p_record->>'recordDate')::date,
      focus=nullif(p_record->'focus','null'::jsonb), source=coalesce(p_record->>'source','manual'),
      estimated=coalesce((p_record->>'estimated')::boolean,false), media_path=p_record->>'mediaPath',
      updated_at=clock_timestamp(), version=version+1
      where id=record_id and user_id=auth.uid() and category=p_record->>'category' returning * into result;
    if result.id is null then raise exception 'Record category cannot change'; end if;
  else
    if p_expected_version is not null then raise exception 'Record no longer exists'; end if;
    insert into public.journal_entries(id,user_id,record_date,category,fields,focus,source,estimated,media_path)
      values(record_id,auth.uid(),(p_record->>'recordDate')::date,p_record->>'category',p_record->'data',
      nullif(p_record->'focus','null'::jsonb),coalesce(p_record->>'source','manual'),coalesce((p_record->>'estimated')::boolean,false),p_record->>'mediaPath')
      returning * into result;
  end if;
  return result;
end $$;
revoke all on function public.save_journal_entry(jsonb,integer) from public, anon;
grant execute on function public.save_journal_entry(jsonb,integer) to authenticated;

-- Device-independent journal settings and paused focus recovery; never API keys.
create table public.journal_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings)='object' and octet_length(settings::text)<=24000),
  updated_at timestamptz not null default now()
);
alter table public.journal_preferences enable row level security;
create policy journal_preferences_owner on public.journal_preferences for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
revoke all on public.journal_preferences from anon;
grant select,insert,update,delete on public.journal_preferences to authenticated;

-- Model output provenance is auditable; no API keys, photos or hidden reasoning.
create table public.journal_ai_runs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check(category in ('mood','food','focus','sport','sleep','face')),
  record_date date not null, action text not null, provider text not null, model text not null,
  output jsonb not null, created_at timestamptz not null default now()
);
alter table public.journal_ai_runs enable row level security;
create policy journal_ai_owner_read on public.journal_ai_runs for select to authenticated using(auth.uid()=user_id);
revoke all on public.journal_ai_runs from anon, authenticated;
grant select on public.journal_ai_runs to authenticated;
