-- Durable, consent-gated food visuals. No historical backfill and no change to
-- the existing save RPCs. pg_net sends only after the enclosing transaction commits.
-- Deployment prerequisite: the platform-owned net schema must remain outside
-- PostgREST exposed schemas. Its transient HTTP queue contains worker capabilities.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diet-renders', 'diet-renders', false, 8388608, array['image/png', 'image/webp'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "diet renders read own" on storage.objects;
create policy "diet renders read own" on storage.objects for select to authenticated
using (bucket_id='diet-renders' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "diet renders delete own" on storage.objects;
create policy "diet renders delete own" on storage.objects for delete to authenticated
using (bucket_id='diet-renders' and (storage.foldername(name))[1]=auth.uid()::text);

create table public.food_render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  source_kind text not null check (source_kind in ('journal_entries','nutrition_records')),
  source_id uuid not null,
  item_key text not null,
  source_revision text not null,
  generation_fingerprint text not null check (generation_fingerprint ~ '^[0-9a-f]{64}$'),
  prompt_version text not null default 'nava-food-visual-v2-overhead-20261120' check (prompt_version='nava-food-visual-v2-overhead-20261120'),
  input jsonb not null check (jsonb_typeof(input)='object' and octet_length(input::text)<=24000),
  state text not null default 'queued' check (state in ('queued','processing','ready','failed','stale','needs_details')),
  attempts smallint not null default 0 check (attempts between 0 and 2),
  dispatch_count smallint not null default 0 check (dispatch_count between 0 and 6),
  next_attempt_at timestamptz default now(),
  lease_until timestamptz,
  claimed_revision text,
  worker_token text not null default encode(extensions.gen_random_bytes(32),'hex') check (worker_token ~ '^[0-9a-f]{64}$'),
  asset_path text,
  model_version text,
  evidence_kind text,
  quality jsonb check (quality is null or (jsonb_typeof(quality)='object' and octet_length(quality::text)<=32000)),
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,source_kind,source_id,item_key,generation_fingerprint,prompt_version),
  check (state<>'processing' or lease_until is not null)
);
create index food_render_jobs_owner_date on public.food_render_jobs(user_id,record_date desc);
create index food_render_jobs_source on public.food_render_jobs(source_kind,source_id);
create index food_render_jobs_dispatch on public.food_render_jobs(next_attempt_at,created_at)
where state in ('queued','processing','failed') and attempts<2 and dispatch_count<6;
alter table public.food_render_jobs enable row level security;
create policy food_render_jobs_read_own on public.food_render_jobs for select to authenticated using (user_id=auth.uid());
revoke all on public.food_render_jobs from public,anon,authenticated;
grant select (id,user_id,record_date,source_kind,source_id,item_key,source_revision,generation_fingerprint,prompt_version,input,state,attempts,dispatch_count,next_attempt_at,lease_until,asset_path,model_version,evidence_kind,quality,last_error_code,created_at,updated_at)
on public.food_render_jobs to authenticated;
grant all on public.food_render_jobs to service_role;

create function public.food_render_consent(p_user_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce((select
    coalesce(p.health_data_consent,p.onboarding_answers->'healthDataConsent'='true'::jsonb,false)
    and coalesce(p.ai_personalization_consent,p.onboarding_answers->'aiPersonalizationConsent'='true'::jsonb,false)
    from public.profiles p where p.id=p_user_id),false)
$$;

-- All workers and reconciliation use this one source-to-input contract. Metadata
-- is returned for display but omitted from the generation fingerprint.
create function public.food_render_source_inputs(p_source_kind text,p_source_id uuid,p_user_id uuid)
returns table(item_key text,source_revision text,record_date date,input jsonb,generation_fingerprint text,needs_details boolean)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare source jsonb; revision text; source_day date; meal text; item jsonb;
  food_name text; amount text; photo_path text; photo_bucket text; source_item_id text;
  contents jsonb; has_item boolean;
begin
  if p_source_kind='journal_entries' then
    select to_jsonb(j),j.version::text,j.record_date into source,revision,source_day
      from public.journal_entries j where j.id=p_source_id and j.user_id=p_user_id and j.category='food';
    if not found then return; end if;
    food_name:=case when jsonb_typeof(source->'fields'->'foods')='string' then nullif(btrim(source->'fields'->>'foods'),'') end;
    amount:=case when jsonb_typeof(source->'fields'->'portion')='string' then nullif(btrim(source->'fields'->>'portion'),'') end;
    photo_path:=nullif(btrim(source->>'media_path'),'');
    -- Only the explicitly specified journal-food storage contract is usable.
    if photo_path is null or photo_path not like p_user_id::text||'/journal-food/'||p_source_id::text||'/%'
       or photo_path ~ '(^|/)\.\.(/|$)' then photo_path:=null; end if;
    photo_bucket:=case when photo_path is not null then 'diet-photos' end;
    contents:=jsonb_build_object('name',food_name,'amount',amount,'photoPath',photo_path,'photoBucket',photo_bucket);
    item_key:='whole_meal';source_revision:=revision;record_date:=source_day;
    input:=contents||jsonb_build_object('schemaVersion','nava.food-render-input.v1','kind','whole_meal',
      'sourceItemId',null,'meal',nullif(btrim(source->'fields'->>'meal'),''),'recordDate',source_day::text);
    generation_fingerprint:=encode(sha256(convert_to(contents::text,'UTF8')),'hex');
    needs_details:=food_name is null and photo_path is null;
    return next;
  elsif p_source_kind='nutrition_records' then
    select to_jsonb(n),coalesce(n.updated_at::text,'unversioned'),n.record_date into source,revision,source_day
      from public.nutrition_records n where n.id=p_source_id and n.user_id=p_user_id;
    if not found then return; end if;
    foreach meal in array array['breakfast','lunch','dinner','pantry'] loop
      photo_path:=case when meal<>'pantry' then nullif(btrim(source->>(meal||'_photo_url')),'') end;
      photo_bucket:=case when photo_path is not null then 'diet-photos' end;
      has_item:=false;
      for item in select value from jsonb_array_elements(case when jsonb_typeof(source->(meal||'_items'))='array' then source->(meal||'_items') else '[]'::jsonb end) loop
        if jsonb_typeof(item)<>'object' then continue; end if;
        food_name:=case when jsonb_typeof(item->'name')='string' then nullif(btrim(item->>'name'),'') end;
        if food_name is null then continue; end if;
        has_item:=true;
        amount:=case when jsonb_typeof(item->'amount')='string' then nullif(btrim(item->>'amount'),'') end;
        source_item_id:=case when jsonb_typeof(item->'source_id')='string' then nullif(btrim(item->>'source_id'),'') end;
        item_key:=meal||case when source_item_id is not null then ':id:'||encode(sha256(convert_to(source_item_id,'UTF8')),'hex')
          else ':content:'||encode(sha256(convert_to(jsonb_build_object('name',food_name,'amount',amount)::text,'UTF8')),'hex') end;
        contents:=jsonb_build_object('name',food_name,'amount',amount,'photoPath',photo_path,'photoBucket',photo_bucket);
        source_revision:=revision;record_date:=source_day;
        input:=contents||jsonb_build_object('schemaVersion','nava.food-render-input.v1','kind','dish','sourceItemId',source_item_id,'meal',meal,'recordDate',source_day::text);
        generation_fingerprint:=encode(sha256(convert_to(contents::text,'UTF8')),'hex');needs_details:=false;
        return next;
      end loop;
      if not has_item and photo_path is not null then
        item_key:=meal||':photo';source_revision:=revision;record_date:=source_day;
        contents:=jsonb_build_object('name',null,'amount',null,'photoPath',photo_path,'photoBucket',photo_bucket);
        input:=contents||jsonb_build_object('schemaVersion','nava.food-render-input.v1','kind','photo_meal','sourceItemId',null,'meal',meal,'recordDate',source_day::text);
        generation_fingerprint:=encode(sha256(convert_to(contents::text,'UTF8')),'hex');needs_details:=false;
        return next;
      end if;
    end loop;
  end if;
end $$;

create function public.sync_food_render_jobs(p_source_kind text,p_source_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare entry record; current_ids uuid[]:='{}'; job_id uuid;
begin
  if public.food_render_consent(p_user_id) then
    for entry in select * from public.food_render_source_inputs(p_source_kind,p_source_id,p_user_id) loop
      insert into public.food_render_jobs as job (user_id,record_date,source_kind,source_id,item_key,source_revision,generation_fingerprint,input,state,next_attempt_at)
      values (p_user_id,entry.record_date,p_source_kind,p_source_id,entry.item_key,entry.source_revision,entry.generation_fingerprint,entry.input,
        case when entry.needs_details then 'needs_details' else 'queued' end,case when entry.needs_details then null else clock_timestamp() end)
      on conflict (user_id,source_kind,source_id,item_key,generation_fingerprint,prompt_version) do update set
        source_revision=excluded.source_revision,record_date=excluded.record_date,input=excluded.input,updated_at=clock_timestamp(),
        state=case when job.state<>'stale' then job.state when job.asset_path is not null then 'ready'
          when entry.needs_details then 'needs_details' when job.attempts>=2 or job.dispatch_count>=6 then 'failed' else 'queued' end,
        next_attempt_at=case when job.state<>'stale' then job.next_attempt_at
          when job.asset_path is null and not entry.needs_details and job.attempts<2 and job.dispatch_count<6 then clock_timestamp() else null end,
        worker_token=case when job.state='stale' then encode(extensions.gen_random_bytes(32),'hex') else job.worker_token end
      returning id into job_id;
      current_ids:=array_append(current_ids,job_id);
    end loop;
  end if;
  update public.food_render_jobs set state='stale',lease_until=null,next_attempt_at=null,
    worker_token=encode(extensions.gen_random_bytes(32),'hex'),updated_at=clock_timestamp()
    where source_kind=p_source_kind and source_id=p_source_id and user_id=p_user_id and not(id=any(current_ids)) and state<>'stale';
end $$;

create function public.claim_food_render_job(p_job_id uuid,p_worker_token text)
returns setof public.food_render_jobs language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.food_render_jobs;
begin
  select * into job from public.food_render_jobs where id=p_job_id for update;
  if not found or job.worker_token is distinct from p_worker_token or job.attempts>=2
    or not (job.state='queued' or (job.state='failed' and job.next_attempt_at is not null)
      or (job.state='processing' and job.lease_until<=clock_timestamp())) then return; end if;
  if not public.food_render_consent(job.user_id) or not exists (select 1 from public.food_render_source_inputs(job.source_kind,job.source_id,job.user_id) s
    where s.item_key=job.item_key and s.generation_fingerprint=job.generation_fingerprint and not s.needs_details) then
    update public.food_render_jobs set state='stale',lease_until=null,next_attempt_at=null,worker_token=encode(extensions.gen_random_bytes(32),'hex'),updated_at=clock_timestamp() where id=job.id;
    return;
  end if;
  return query update public.food_render_jobs set state='processing',attempts=attempts+1,
    claimed_revision=source_revision,lease_until=clock_timestamp()+interval '6 minutes',next_attempt_at=null,last_error_code=null,
    worker_token=encode(extensions.gen_random_bytes(32),'hex'),updated_at=clock_timestamp()
    where id=job.id returning *;
end $$;

create function public.finish_food_render_job(p_job_id uuid,p_worker_token text,p_source_revision text,
  p_asset_path text,p_model_version text,p_quality jsonb,p_error_code text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.food_render_jobs;
begin
  select * into job from public.food_render_jobs where id=p_job_id for update;
  if not found or job.state<>'processing' or job.worker_token is distinct from p_worker_token
    or job.claimed_revision is distinct from p_source_revision or job.lease_until<=clock_timestamp() then return false; end if;
  -- A time/nutrition-only edit can advance source_revision without changing the
  -- visual generation. A changed food/photo must never accept the old worker.
  if not public.food_render_consent(job.user_id) or not exists (select 1 from public.food_render_source_inputs(job.source_kind,job.source_id,job.user_id) s
    where s.item_key=job.item_key and s.generation_fingerprint=job.generation_fingerprint and not s.needs_details) then
    update public.food_render_jobs set state='stale',lease_until=null,next_attempt_at=null,worker_token=encode(extensions.gen_random_bytes(32),'hex'),updated_at=clock_timestamp() where id=job.id;
    return false;
  end if;
  if p_error_code is not null then
    if p_error_code !~ '^[a-z0-9_]{1,80}$' then return false; end if;
    update public.food_render_jobs set state=case when p_error_code='needs_details' then 'needs_details' else 'failed' end,
      last_error_code=p_error_code,lease_until=null,
      next_attempt_at=case when p_error_code<>'needs_details' and attempts<2 and dispatch_count<6 then clock_timestamp()+interval '1 minute' end,
      worker_token=encode(extensions.gen_random_bytes(32),'hex'),updated_at=clock_timestamp() where id=job.id;
    return true;
  end if;
  if p_asset_path is null or p_asset_path not like job.user_id::text||'/'||job.id::text||'/%'
    or p_asset_path ~ '(^|/)\.\.(/|$)' or p_asset_path ~ '[?#\\]'
    or nullif(btrim(p_model_version),'') is null or length(p_model_version)>200
    or p_quality is null or jsonb_typeof(p_quality)<>'object' or octet_length(p_quality::text)>32000 then return false; end if;
  update public.food_render_jobs set state='ready',asset_path=p_asset_path,model_version=p_model_version,
    quality=p_quality,evidence_kind=left(p_quality->>'evidenceKind',80),last_error_code=null,lease_until=null,next_attempt_at=null,
    worker_token=encode(extensions.gen_random_bytes(32),'hex'),updated_at=clock_timestamp() where id=job.id;
  return true;
end $$;

create function public.dispatch_food_render_jobs(p_limit integer default 5) returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.food_render_jobs; dispatched integer:=0;
begin
  -- A lost HTTP delivery cannot consume provider attempts forever or create an
  -- infinite cron storm. Active leases are allowed to finish before exhaustion.
  update public.food_render_jobs set state='failed',lease_until=null,next_attempt_at=null,
    last_error_code=case when attempts>=2 then 'attempts_exhausted' else 'dispatch_exhausted' end,
    worker_token=encode(extensions.gen_random_bytes(32),'hex'),updated_at=clock_timestamp()
    where state in ('queued','failed','processing') and (attempts>=2 or dispatch_count>=6)
      and ((state='processing' and lease_until<=clock_timestamp())
        or (state<>'processing' and next_attempt_at<=clock_timestamp()));
  for job in select * from public.food_render_jobs
    where attempts<2 and dispatch_count<6 and (
      (state in ('queued','failed') and next_attempt_at<=clock_timestamp())
      or (state='processing' and lease_until<=clock_timestamp() and (next_attempt_at is null or next_attempt_at<=clock_timestamp())))
    order by coalesce(next_attempt_at,lease_until),created_at
    limit greatest(0,least(coalesce(p_limit,5),5)) for update skip locked
  loop
    if not public.food_render_consent(job.user_id) or not exists(select 1 from public.food_render_source_inputs(job.source_kind,job.source_id,job.user_id) s
      where s.item_key=job.item_key and s.generation_fingerprint=job.generation_fingerprint and not s.needs_details) then
      update public.food_render_jobs set state='stale',lease_until=null,next_attempt_at=null,worker_token=encode(extensions.gen_random_bytes(32),'hex'),updated_at=clock_timestamp() where id=job.id;
      continue;
    end if;
    -- Preserve the queued state. The Edge function must atomically claim before
    -- doing paid work. Capability is rotated on claim and every finish.
    update public.food_render_jobs set dispatch_count=dispatch_count+1,next_attempt_at=clock_timestamp()+interval '1 minute',updated_at=clock_timestamp() where id=job.id;
    begin
      perform net.http_post(url:='https://wxteapvwagvhhtrjrbim.supabase.co/functions/v1/food-visualize',
        body:=jsonb_build_object('jobId',job.id,'workerToken',job.worker_token),
        headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=10000);
      dispatched:=dispatched+1;
    exception when others then
      -- Scheduling failure never rolls back a user's successfully saved record.
      update public.food_render_jobs set last_error_code='dispatch_unavailable',updated_at=clock_timestamp() where id=job.id;
    end;
  end loop;
  return dispatched;
end $$;

create function public.food_render_source_changed() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then
    delete from public.food_render_jobs where source_kind=tg_table_name and source_id=old.id;
    return old;
  end if;
  if tg_op='UPDATE' and (old.id is distinct from new.id or old.user_id is distinct from new.user_id) then
    delete from public.food_render_jobs where source_kind=tg_table_name and source_id=old.id;
  end if;
  if tg_table_name='journal_entries' then
    if new.category<>'food' then
      if tg_op='UPDATE' then perform public.sync_food_render_jobs(tg_table_name,new.id,new.user_id); end if;
      return new;
    end if;
  end if;
  perform public.sync_food_render_jobs(tg_table_name,new.id,new.user_id);
  begin perform public.dispatch_food_render_jobs(5); exception when others then null; end;
  return new;
end $$;
create trigger journal_food_render_changed after insert or update or delete on public.journal_entries
for each row execute function public.food_render_source_changed();
create trigger nutrition_food_render_changed after insert or update or delete on public.nutrition_records
for each row execute function public.food_render_source_changed();

create function public.food_render_consent_changed() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not public.food_render_consent(new.id) then
    update public.food_render_jobs set state='stale',lease_until=null,next_attempt_at=null,
      worker_token=encode(extensions.gen_random_bytes(32),'hex'),updated_at=clock_timestamp()
      where user_id=new.id and state<>'stale';
  end if;
  -- Granting consent intentionally does not backfill historical records.
  return new;
end $$;
create trigger food_render_profile_consent_changed after update of health_data_consent,ai_personalization_consent,onboarding_answers on public.profiles
for each row execute function public.food_render_consent_changed();

revoke all on function public.food_render_consent(uuid),public.food_render_source_inputs(text,uuid,uuid),public.sync_food_render_jobs(text,uuid,uuid),
  public.claim_food_render_job(uuid,text),public.finish_food_render_job(uuid,text,text,text,text,jsonb,text),
  public.dispatch_food_render_jobs(integer),public.food_render_source_changed(),public.food_render_consent_changed()
from public,anon,authenticated;
grant execute on function public.food_render_consent(uuid),public.food_render_source_inputs(text,uuid,uuid),public.sync_food_render_jobs(text,uuid,uuid),
  public.claim_food_render_job(uuid,text),public.finish_food_render_job(uuid,text,text,text,text,jsonb,text),public.dispatch_food_render_jobs(integer) to service_role;

-- Named scheduling updates the same job rather than adding duplicate timers.
select cron.schedule('nava-food-render-dispatch','* * * * *','select public.dispatch_food_render_jobs(5);');
