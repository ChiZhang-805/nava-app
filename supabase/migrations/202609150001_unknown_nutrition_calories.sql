-- Preserve unknown intake rather than creating a false zero. Existing rows,
-- permissions and RLS are deliberately unchanged.
begin;
alter table public.nutrition_records alter column total_calories drop not null;
alter table public.nutrition_records alter column total_calories drop default;
comment on column public.nutrition_records.total_calories is
  'Sum of recorded food calories; NULL when any recorded food calorie is unknown. Zero means an explicitly known zero.';
commit;
