-- Authenticated verification challenges for backup email and phone contacts.
-- Raw contacts, codes and request IPs never enter the database.

create table if not exists public.nava_security_contact_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_kind text not null check (contact_kind in ('email', 'phone')),
  contact_hash text not null,
  code_digest text not null,
  ip_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  send_status text not null default 'pending' check (send_status in ('pending', 'sent', 'failed')),
  provider_request_id text,
  provider_error text,
  created_at timestamptz not null default now()
);

alter table public.nava_security_contact_otp_challenges enable row level security;
revoke all on table public.nava_security_contact_otp_challenges from public, anon, authenticated;
grant all on table public.nava_security_contact_otp_challenges to service_role;

create index if not exists nava_security_contact_otp_user_created_idx
  on public.nava_security_contact_otp_challenges (user_id, created_at desc);
create index if not exists nava_security_contact_otp_target_created_idx
  on public.nava_security_contact_otp_challenges (contact_hash, contact_kind, created_at desc);
create index if not exists nava_security_contact_otp_ip_created_idx
  on public.nava_security_contact_otp_challenges (ip_hash, created_at desc);

create or replace function public.nava_issue_security_contact_otp(
  p_user_id uuid,
  p_contact_kind text,
  p_contact_hash text,
  p_code_digest text,
  p_ip_hash text,
  p_ttl_seconds integer default 600
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  challenge_id uuid;
  latest_created_at timestamptz;
  user_hour_count integer;
  target_hour_count integer;
  ip_hour_count integer;
begin
  if p_user_id is null or p_contact_kind not in ('email', 'phone')
     or length(p_contact_hash) < 32 or length(p_code_digest) < 32 or length(p_ip_hash) < 32 then
    raise exception using errcode = 'P0001', message = 'OTP_REQUEST_INVALID';
  end if;
  if p_ttl_seconds < 120 or p_ttl_seconds > 900 then
    raise exception using errcode = 'P0001', message = 'OTP_TTL_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_contact_kind || ':' || p_contact_hash, 0));
  delete from public.nava_security_contact_otp_challenges where created_at < now() - interval '7 days';

  select created_at into latest_created_at
  from public.nava_security_contact_otp_challenges
  where user_id = p_user_id and contact_kind = p_contact_kind and contact_hash = p_contact_hash
    and send_status in ('pending', 'sent')
  order by created_at desc limit 1;
  if latest_created_at is not null and latest_created_at > now() - interval '60 seconds' then
    raise exception using errcode = 'P0001', message = 'OTP_COOLDOWN';
  end if;

  select count(*) into user_hour_count from public.nava_security_contact_otp_challenges
    where user_id = p_user_id and created_at > now() - interval '1 hour' and send_status in ('pending', 'sent');
  select count(*) into target_hour_count from public.nava_security_contact_otp_challenges
    where contact_hash = p_contact_hash and created_at > now() - interval '1 hour' and send_status in ('pending', 'sent');
  select count(*) into ip_hour_count from public.nava_security_contact_otp_challenges
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour' and send_status in ('pending', 'sent');
  if user_hour_count >= 8 or target_hour_count >= 5 or ip_hour_count >= 20 then
    raise exception using errcode = 'P0001', message = 'OTP_RATE_LIMIT';
  end if;

  update public.nava_security_contact_otp_challenges
  set consumed_at = coalesce(consumed_at, now())
  where user_id = p_user_id and contact_kind = p_contact_kind and consumed_at is null;

  insert into public.nava_security_contact_otp_challenges (
    user_id, contact_kind, contact_hash, code_digest, ip_hash, expires_at
  ) values (
    p_user_id, p_contact_kind, p_contact_hash, p_code_digest, p_ip_hash,
    now() + make_interval(secs => p_ttl_seconds)
  ) returning id into challenge_id;
  return challenge_id;
end;
$$;

create or replace function public.nava_consume_security_contact_otp(
  p_user_id uuid,
  p_contact_kind text,
  p_contact_hash text,
  p_code_digest text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  challenge public.nava_security_contact_otp_challenges%rowtype;
  next_attempt_count smallint;
begin
  if p_user_id is null or p_contact_kind not in ('email', 'phone') then return 'invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_contact_kind || ':' || p_contact_hash, 0));
  select * into challenge from public.nava_security_contact_otp_challenges
  where user_id = p_user_id and contact_kind = p_contact_kind and contact_hash = p_contact_hash
    and consumed_at is null and send_status = 'sent'
  order by created_at desc limit 1 for update;
  if not found then return 'not_found'; end if;
  if challenge.expires_at <= now() then
    update public.nava_security_contact_otp_challenges set consumed_at = now() where id = challenge.id;
    return 'expired';
  end if;
  if challenge.attempt_count >= 5 then
    update public.nava_security_contact_otp_challenges set consumed_at = now() where id = challenge.id;
    return 'locked';
  end if;
  if challenge.code_digest <> p_code_digest then
    next_attempt_count := challenge.attempt_count + 1;
    update public.nava_security_contact_otp_challenges
    set attempt_count = next_attempt_count, consumed_at = case when next_attempt_count >= 5 then now() else null end
    where id = challenge.id;
    return case when next_attempt_count >= 5 then 'locked' else 'invalid' end;
  end if;
  update public.nava_security_contact_otp_challenges set consumed_at = now() where id = challenge.id;
  return 'ok';
end;
$$;

revoke all on function public.nava_issue_security_contact_otp(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.nava_consume_security_contact_otp(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.nava_issue_security_contact_otp(uuid, text, text, text, text, integer) to service_role;
grant execute on function public.nava_consume_security_contact_otp(uuid, text, text, text) to service_role;

comment on table public.nava_security_contact_otp_challenges is
  'Server-only OTP challenges for authenticated backup email and phone verification; only keyed digests are persisted.';
