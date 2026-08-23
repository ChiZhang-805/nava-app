alter table if exists public.profiles
  add column if not exists age_group text,
  add column if not exists privacy_consent_at timestamptz,
  add column if not exists health_data_consent boolean not null default false,
  add column if not exists ai_personalization_consent boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_version integer not null default 0,
  add column if not exists onboarding_answers jsonb not null default '{}'::jsonb;

comment on column public.profiles.onboarding_answers is
  'Stable option codes captured during first-use onboarding. Display copy remains client-owned.';
