import { spawnSync } from "node:child_process";

// Run with the authorized account email only. No password, tokens, health rows,
// or model output are printed. Every test write is rolled back, including errors.
const email = process.env.NAVA_TEST_ACCOUNT_EMAIL;
if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error("Set the authorized NAVA_TEST_ACCOUNT_EMAIL.");
const literal = email.replaceAll("'", "''");
const sql = `begin;
do $acceptance$
declare owner_id uuid; diet_id uuid; exercise_id uuid;
begin
  select id into strict owner_id from auth.users where lower(email)=lower('${literal}');
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  if exists(select 1 from public.nutrition_records where user_id=owner_id and record_date='2000-01-01')
    or exists(select 1 from public.exercise_records where user_id=owner_id and record_date='2000-01-01') then
    raise exception 'Acceptance date is occupied; no existing record may be changed';
  end if;
  insert into public.nutrition_records(user_id,record_date,lunch_items,total_calories,protein_grams,carbohydrate_grams,fat_grams,hydration_ml)
    values(owner_id,'2000-01-01','[{"name":"rollback acceptance fixture","calories":null}]',null,0,null,null,null) returning id into diet_id;
  if not exists(select 1 from public.nutrition_records where id=diet_id and total_calories is null and protein_grams=0 and fat_grams is null) then
    raise exception 'Nutrition unknown/zero did not round-trip';
  end if;
  update public.nutrition_records set total_calories=0 where id=diet_id;
  if not exists(select 1 from public.nutrition_records where id=diet_id and total_calories=0) then raise exception 'Known zero lost'; end if;
  update public.nutrition_records set total_calories=null where id=diet_id;
  if not exists(select 1 from public.nutrition_records where id=diet_id and total_calories is null) then raise exception 'Explicit clearing failed'; end if;
  insert into public.exercise_records(user_id,record_date,steps,calories,exercise_minutes)
    values(owner_id,'2000-01-01',0,null,null) returning id into exercise_id;
  if not exists(select 1 from public.exercise_records where id=exercise_id and steps=0 and calories is null and exercise_minutes is null) then
    raise exception 'Exercise unknown/zero did not round-trip';
  end if;
  update public.exercise_records set steps=null where id=exercise_id;
  if not exists(select 1 from public.exercise_records where id=exercise_id and steps is null) then raise exception 'Exercise clearing failed'; end if;
end $acceptance$;
rollback;`;
const result = spawnSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--linked", sql], { encoding: "utf8", timeout: 45_000 });
if (result.status !== 0) throw new Error("Authenticated-role storage transaction failed; no test data committed. Inspect the schema/RLS without printing private rows.");
console.log("Canonical storage: authenticated-owner RLS, nutrition/exercise null and real zero, clearing round-trip passed. All writes rolled back.");
