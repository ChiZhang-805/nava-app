// Local PostgreSQL execution only. pg_net/pg_cron are transactionally recorded
// test doubles; no network requests, remote database, or provider calls occur.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const runtime = process.env.NAVA_PGLITE || 'Q:/NAVA-Workspace/NAVA-App/Tools/reward-db-check/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pathToFileURL(runtime));
const { pgcrypto } = await import(new URL('./contrib/pgcrypto.js', pathToFileURL(runtime)));
const db = new PGlite({ extensions: { pgcrypto } });
const migrationName = '202611202300_food_render_jobs.sql';
const output = 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/food-render-jobs';
await mkdir(output, { recursive: true });
let checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (value, label) => { assert.ok(value, label); checks++; };
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await rows(sql, params))[0];
const count = async (table, where = 'true', params = []) => Number((await one(`select count(*) n from ${table} where ${where}`, params)).n);
const user = randomUUID(), other = randomUUID(), legacy = randomUUID();
const journalId = randomUUID();
const journal = async (id = randomUUID(), owner = user, fields = { foods: '鸡肉米饭', portion: '一碗' }, media = null) => {
  await db.query('insert into public.journal_entries(id,user_id,record_date,category,fields,media_path) values($1,$2,$3,$4,$5,$6)', [id, owner, '2026-11-20', 'food', fields, media]); return id;
};
const nutrition = async (patch, id = randomUUID()) => {
  await db.query('insert into public.nutrition_records(id,user_id,record_date,breakfast_items,lunch_items,dinner_items,pantry_items,lunch_photo_url,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp())',
    [id, user, '2026-11-20', patch.breakfast ?? [], patch.lunch ?? [], patch.dinner ?? [], patch.pantry ?? [], patch.photo ?? null]); return id;
};
const jobs = id => rows('select * from public.food_render_jobs where source_id=$1 order by item_key,generation_fingerprint', [id]);
const active = async id => (await jobs(id)).find(job => job.state !== 'stale');
const claim = async job => (await rows('select * from public.claim_food_render_job($1,$2)', [job.id, job.worker_token]))[0];
const finish = async (job, error = null, overrides = {}) => (await one('select public.finish_food_render_job($1,$2,$3,$4,$5,$6,$7) done',
  [job.id, overrides.token ?? job.worker_token, overrides.revision ?? job.claimed_revision, overrides.path ?? `${job.user_id}/${job.id}/render.webp`, 'test-image-model', { evidenceKind: 'text_only', passed: true }, error])).done;
const due = id => db.query("update public.food_render_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1", [id]);
const reset = async () => { await db.exec('delete from public.journal_entries; delete from public.nutrition_records; truncate net.requests;'); };
const denies = async (sql, params, label) => { await assert.rejects(() => db.query(sql, params)); checks++; if (!label) throw Error('A denial test needs its security purpose'); };
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema net; create schema cron;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon,service_role;
    create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,health_data_consent boolean,ai_personalization_consent boolean,onboarding_answers jsonb default '{}');
    create table public.journal_entries(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,record_date date,category text,fields jsonb,media_path text,version integer default 1,updated_at timestamptz default now());
    create table public.nutrition_records(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,record_date date,
      breakfast_items jsonb,lunch_items jsonb,dinner_items jsonb,pantry_items jsonb,breakfast_photo_url text,lunch_photo_url text,dinner_photo_url text,
      breakfast_time text,lunch_time text,dinner_time text,total_calories numeric,updated_at timestamptz default now());
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array(regexp_replace($1,'/[^/]*$',''),'/') $$;
    create table net.requests(id bigserial primary key,url text,body jsonb,headers jsonb,timeout_ms integer);
    create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 1000) returns bigint language plpgsql as $$
      declare request_id bigint; begin
      if current_setting('test.net_fail',true)='true' then raise exception 'Mock transport unavailable';end if;
      insert into net.requests(url,body,headers,timeout_ms) values(url,body,headers,timeout_milliseconds) returning id into request_id; return request_id;end $$;
    create table cron.jobs(name text primary key,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.jobs values($1,$2,$3) on conflict(name) do update set schedule=$2,command=$3 returning 1::bigint$$;
  `);
  for (const id of [user, other, legacy]) await db.query('insert into auth.users values($1)', [id]);
  await db.query('insert into public.profiles values($1,true,true,$2),($3,false,false,$2),($4,null,null,$5)', [user, {}, other, legacy, { healthDataConsent: true, aiPersonalizationConsent: true }]);
  await journal(journalId);
  const migration = await readFile(`supabase/migrations/${migrationName}`, 'utf8');
  // Only unavailable scheduling extensions are replaced by test doubles.
  await db.exec(migration.replace(/^create extension if not exists pg_(?:net|cron).*;$/gm, ''));
  equal(await count('public.food_render_jobs'), 0, 'Migration does not backfill a historical meal');
  equal(await count('net.requests'), 0, 'Migration does not dispatch historical data');
  equal(await count('cron.jobs'), 1, 'One durable minute schedule');
  equal((await one('select schedule,command from cron.jobs')), { schedule: '* * * * *', command: 'select public.dispatch_food_render_jobs(5);' }, 'Cron targets bounded dispatcher');

  const deniedSource = await journal(randomUUID(), other);
  equal((await jobs(deniedSource)).length, 0, 'No consent creates no job');
  await db.query('update public.profiles set onboarding_answers=$2 where id=$1', [other, { healthDataConsent: true, aiPersonalizationConsent: true }]);
  await db.query('update public.journal_entries set version=version+1 where id=$1', [deniedSource]);
  equal((await jobs(deniedSource)).length, 0, 'Explicit false overrides legacy true');
  const legacySource = await journal(randomUUID(), legacy);
  equal((await jobs(legacySource)).length, 1, 'Legacy boolean true only supplies absent explicit flags');
  await db.query('update public.profiles set onboarding_answers=$2 where id=$1', [legacy, { healthDataConsent: 'true', aiPersonalizationConsent: true }]);
  equal((await active(legacySource)), undefined, 'String true is not consent and revokes prior job');
  await reset();

  const source = await journal();
  let job = await active(source);
  equal(job.state, 'queued', 'Saving queues but dispatch does not claim');
  equal(job.attempts, 0, 'Dispatch is not a provider attempt');
  equal(job.dispatch_count, 1, 'Saving attempts immediate async dispatch');
  equal(job.prompt_version, 'nava-food-visual-v2-overhead-20261120', 'Prompt version matches the shared generation contract');
  ok(/^[0-9a-f]{64}$/.test(job.worker_token), 'Cryptographic 32-byte capability');
  const request = await one('select * from net.requests order by id desc limit 1');
  equal(Object.keys(request.body).sort(), ['jobId', 'workerToken'], 'Dispatch body contains no food, health data or image');
  equal(request.url, 'https://wxteapvwagvhhtrjrbim.supabase.co/functions/v1/food-visualize', 'Canonical function only');
  equal(job.input.kind, 'whole_meal', 'Journal whole meal is not split into imagined dishes');
  const originalId = job.id, originalFingerprint = job.generation_fingerprint;
  await db.query("update public.journal_entries set fields=fields||'{\"calories\":520,\"mealTime\":\"12:20\"}'::jsonb,version=2,record_date='2026-11-19' where id=$1", [source]);
  job = await active(source);
  equal([job.id, job.generation_fingerprint, job.attempts, job.source_revision, job.input.recordDate], [originalId, originalFingerprint, 0, '2', '2026-11-19'], 'Metadata/nutrition edit reuses generation and updates display date');
  equal(await count('net.requests'), 1, 'Metadata edit does not resubmit a pending paid generation');

  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec('set role authenticated');
  equal((await rows('select id,input,state from public.food_render_jobs')).length, 1, 'Owner can read safe columns and own input');
  await denies('select worker_token from public.food_render_jobs', [], 'Owner cannot read capability');
  await denies('select * from public.food_render_jobs', [], 'Wildcard cannot leak capability');
  await denies("update public.food_render_jobs set state='ready'", [], 'Owner cannot mutate jobs');
  await denies('select * from public.claim_food_render_job($1,$2)', [job.id, job.worker_token], 'Owner cannot claim worker RPC');
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  await db.exec('set role authenticated'); equal((await rows('select id from public.food_render_jobs')).length, 0, 'Cross-user RLS blocks reads'); await db.exec('reset role');
  await db.exec('set role anon'); await denies('select id from public.food_render_jobs', [], 'Anonymous read denied'); await db.exec('reset role');
  await db.exec('set role service_role');
  equal(await claim({ ...job, worker_token: '0'.repeat(64) }), undefined, 'Wrong capability rejected');
  const claimed = await claim(job);
  equal([claimed.state, claimed.attempts, claimed.claimed_revision], ['processing', 1, '2'], 'Service claim is atomic and versioned');
  ok(claimed.worker_token !== job.worker_token, 'Claim rotates dispatch capability');
  equal(await claim(job), undefined, 'Duplicate delayed dispatch cannot claim twice');
  await db.exec('reset role');
  await db.query("update public.journal_entries set fields=fields||'{\"protein\":30}'::jsonb,version=3 where id=$1", [source]);
  equal(await finish(claimed, null, { path: `${other}/${claimed.id}/bad.webp` }), false, 'Cross-user asset path rejected');
  equal(await finish(claimed, null, { revision: 'wrong' }), false, 'Wrong claimed revision rejected');
  equal(await finish(claimed), true, 'Same-generation metadata edit accepts original leased worker');
  equal((await active(source)).state, 'ready', 'Successful generation is ready');
  equal(await finish(claimed), false, 'Duplicate result is rejected');
  await db.query("update public.journal_entries set fields=fields||'{\"calories\":600}'::jsonb,version=4 where id=$1", [source]);
  equal((await active(source)).attempts, 1, 'Ready image is reused after nutrient edit');

  await reset();
  const changingSource = await journal(); const changingJob = await claim(await active(changingSource));
  await db.query("update public.journal_entries set fields='{\"foods\":\"粥\"}',version=2 where id=$1", [changingSource]);
  equal((await jobs(changingSource)).find(j => j.id === changingJob.id).state, 'stale', 'New food generation invalidates old worker');
  equal(await finish(changingJob), false, 'Old worker cannot overwrite changed food');
  const next = await active(changingSource);
  await db.query('update public.journal_entries set media_path=$2,version=3 where id=$1', [changingSource, `${user}/unknown-bucket/example.jpg`]);
  equal((await active(changingSource)).id, next.id, 'Unknown journal bucket is not guessed or billed');
  await db.query('update public.journal_entries set media_path=$2,version=4 where id=$1', [changingSource, `${user}/journal-food/${changingSource}/photo.jpg`]);
  job = await active(changingSource);
  ok(job.id !== next.id, 'New usable photo is a new generation');
  equal(job.input.photoBucket, 'diet-photos', 'Only explicit journal-food path maps to its bucket');
  await db.query('delete from public.journal_entries where id=$1', [changingSource]); equal((await jobs(changingSource)).length, 0, 'Deleting source deletes all job generations');

  const savedItems = [{ source_id: 'stable-dish', name: '鸡蛋', amount: '一只', calories: 80 }, { name: '米饭', amount: '一碗', calories: 200 }];
  const nutritionSource = await nutrition({ lunch: savedItems });
  const before = (await jobs(nutritionSource)).map(j => ({ id: j.id, key: j.item_key, fp: j.generation_fingerprint }));
  await db.query('update public.nutrition_records set lunch_items=$2,lunch_time=$3,total_calories=310,updated_at=clock_timestamp() where id=$1', [nutritionSource, [{ ...savedItems[1], calories: 220 }, { ...savedItems[0], protein_grams: 8 }], '12:30']);
  equal((await jobs(nutritionSource)).map(j => ({ id: j.id, key: j.item_key, fp: j.generation_fingerprint })), before, 'Reorder, time and nutrition do not change stable generations');
  const duplicateSource = await nutrition({ lunch: [savedItems[1], savedItems[1]] });
  equal((await jobs(duplicateSource)).length, 1, 'Same-content anonymous items share a visual instead of index billing');
  const photoOnly = await nutrition({ photo: `${user}/meal-photo.jpg` });
  equal((await active(photoOnly)).input.kind, 'photo_meal', 'Photo-only legacy meal creates one whole-meal job');
  equal((await jobs(await nutrition({}))).length, 0, 'Empty daily aggregate invents no food jobs');
  equal((await jobs(await nutrition({ lunch: [{ name: true }, { name: 123 }, null] }))).length, 0, 'Malformed food names do not become generated dishes');
  await reset();

  const revokedSource = await journal(); const revoked = await claim(await active(revokedSource));
  await db.query('update public.profiles set ai_personalization_consent=false where id=$1', [user]);
  equal((await jobs(revokedSource))[0].state, 'stale', 'Consent revocation immediately invalidates worker');
  equal(await finish(revoked), false, 'Revoked consent cannot be bypassed by a previously claimed lease');
  await db.query('update public.profiles set ai_personalization_consent=true where id=$1', [user]);
  equal((await jobs(revokedSource))[0].state, 'stale', 'Regranting consent does not backfill');
  await reset();

  const retrySource = await journal(); const retryFirst = await claim(await active(retrySource));
  equal(await finish(retryFirst, 'quality_rejected'), true, 'Failure is durably recorded');
  const failed = await active(retrySource); equal([failed.state, failed.attempts], ['failed', 1], 'First provider failure is retryable');
  ok(failed.next_attempt_at && failed.worker_token !== retryFirst.worker_token, 'Retry is delayed and rotates worker token');
  await due(failed.id); await db.query('select public.dispatch_food_render_jobs(5)');
  const retrySecond = await claim(await active(retrySource)); equal(retrySecond.attempts, 2, 'Exactly a second paid attempt');
  equal(await finish(retrySecond, 'quality_rejected'), true, 'Second failure recorded');
  equal((await active(retrySource)).next_attempt_at, null, 'Second failure is terminal');
  equal(await claim(await active(retrySource)), undefined, 'Third paid attempt denied');
  await reset();

  const leaseSource = await journal(); const oldWorker = await claim(await active(leaseSource));
  await db.query("update public.food_render_jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1", [oldWorker.id]);
  await db.query('select public.dispatch_food_render_jobs(5)');
  const newWorker = await claim(await active(leaseSource)); equal(newWorker.attempts, 2, 'Expired lease permits one bounded recovery');
  equal(await finish(oldWorker), false, 'Late old lease token cannot finish renewed job');
  equal(await finish(newWorker), true, 'Current recovery lease can finish');
  await reset();

  await db.exec("select set_config('test.net_fail','true',false)");
  const offlineSource = await journal();
  equal(await count('public.journal_entries', 'id=$1', [offlineSource]), 1, 'Transport error cannot roll back a saved record');
  equal((await active(offlineSource)).last_error_code, 'dispatch_unavailable', 'Transport error is a bounded code');
  for (let i = 1; i < 6; i++) { await due((await active(offlineSource)).id); await db.query('select public.dispatch_food_render_jobs(5)'); }
  job = await active(offlineSource); equal([job.dispatch_count, job.attempts, job.state], [6, 0, 'queued'], 'Sixth request retains a grace period to claim');
  await due(job.id); await db.query('select public.dispatch_food_render_jobs(5)');
  job = await active(offlineSource); equal([job.state, job.last_error_code, job.next_attempt_at], ['failed', 'dispatch_exhausted', null], 'Permanent delivery failure cannot create an infinite storm');
  equal(await claim(job), undefined, 'Exhausted delivery is terminal');
  await db.exec("select set_config('test.net_fail','false',false)"); await reset();

  const detailsSource = await journal(randomUUID(), user, { foods: '' });
  equal((await active(detailsSource)).state, 'needs_details', 'Insufficient source details do not invoke provider');
  equal(await count('net.requests'), 0, 'Needs-details work is never dispatched');
  await reset();
  const batchSource = await nutrition({ lunch: Array.from({ length: 8 }, (_, i) => ({ source_id: `dish-${i}`, name: `Food ${i}` })) });
  equal((await jobs(batchSource)).length, 8, 'Every actual saved dish persists independently');
  equal(await count('net.requests'), 5, 'Immediate dispatcher batch is at most five');
  equal((await one('select public.dispatch_food_render_jobs(999) n')).n, 3, 'Cron only dispatches remaining due work and clamps its limit');
  const beforeRollbackRequests = await count('net.requests');
  await db.exec('begin'); const rolledBack = await journal(); await db.exec('rollback'); equal((await jobs(rolledBack)).length, 0, 'Rolled-back save cannot leave a job');
  equal(await count('net.requests'), beforeRollbackRequests, 'Rolling back the source also rolls back queued HTTP work');
  await db.query('delete from auth.users where id=$1', [user]); equal(await count('public.food_render_jobs', 'user_id=$1', [user]), 0, 'Account deletion cascades jobs');

  await writeFile(`${output}/database-validator.json`, JSON.stringify({ passed: true, checks, migration: migrationName, deployed: false, runtime: 'Local PGlite PostgreSQL with pgcrypto; pg_net/pg_cron test doubles', networkRequests: 0 }, null, 2));
  console.log(`Food render PostgreSQL: ${checks} checks passed. NOT deployed; zero remote requests.`);
} catch (error) {
  await writeFile(`${output}/database-validator.json`, JSON.stringify({ passed: false, checks, migration: migrationName, deployed: false, error: String(error) }, null, 2));
  throw error;
} finally { await db.close(); }
