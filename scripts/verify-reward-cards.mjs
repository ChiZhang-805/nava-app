// Execute the reward-card migration against local, in-memory PostgreSQL.
// This never connects to Supabase production.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const runtime = process.env.NAVA_PGLITE || "Q:/NAVA-Workspace/NAVA-App/Tools/reward-db-check/node_modules/@electric-sql/pglite/dist/index.js";
const { PGlite } = await import(pathToFileURL(runtime).href);
const db = new PGlite();
const userId = "11111111-1111-4111-8111-111111111111";

await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function public.update_updated_at_column() returns trigger language plpgsql as
    $$ begin new.updated_at = now(); return new; end $$;
  create table public.growth_reward_ledger(
    user_id uuid not null references auth.users(id) on delete cascade,
    points integer not null
  );
  create table public.reward_orders(
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'confirmed',
    total_points integer not null
  );
  create table public.analytics_events(
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    event_name text not null,
    properties jsonb not null default '{}'::jsonb
  );
  insert into auth.users(id) values ('${userId}');
  insert into public.growth_reward_ledger(user_id, points) values ('${userId}', 50);
  insert into public.reward_orders(user_id, total_points) values ('${userId}', 10);
  select set_config('request.jwt.claim.sub', '${userId}', false);
`);

const migration = readFileSync(new URL("../supabase/migrations/202609280001_reward_card_skins.sql", import.meta.url), "utf8");
await db.exec(migration);

function stateValue(result) {
  return result.rows[0].value;
}

const initial = stateValue(await db.query("select public.nava_reward_card_state() as value"));
if (initial.balance !== 40) throw new Error(`Expected shared balance 40 before card unlock, got ${initial.balance}`);
if (JSON.stringify(initial.unlockedCardIds) !== JSON.stringify(["mint-growth", "warm-companion", "starlit-ideas"])) {
  throw new Error(`Default cards are not the expected three: ${JSON.stringify(initial.unlockedCardIds)}`);
}

const requestKey = "22222222-2222-4222-8222-222222222222";
const unlocked = stateValue(await db.query(
  "select public.nava_unlock_reward_card_skin($1, $2::uuid) as value",
  ["lavender-reading", requestKey],
));
if (unlocked.balance !== 30 || unlocked.selectedCardId !== "lavender-reading" || unlocked.unlockedCardIds.length !== 4) {
  throw new Error(`Unlock did not atomically spend ten points and select the card: ${JSON.stringify(unlocked)}`);
}

const replay = stateValue(await db.query(
  "select public.nava_unlock_reward_card_skin($1, $2::uuid) as value",
  ["lavender-reading", requestKey],
));
if (replay.balance !== 30 || replay.unlockedCardIds.length !== 4) {
  throw new Error(`Idempotent replay spent points twice: ${JSON.stringify(replay)}`);
}

const selected = stateValue(await db.query("select public.nava_select_reward_card_skin($1) as value", ["mint-growth"]));
if (selected.selectedCardId !== "mint-growth" || selected.balance !== 30) {
  throw new Error(`Switching a card changed the shared balance: ${JSON.stringify(selected)}`);
}

const counts = await db.query(`
  select
    (select count(*)::int from public.user_reward_card_unlocks where user_id='${userId}') as unlocks,
    (select count(*)::int from public.analytics_events where user_id='${userId}' and event_name='reward_card_unlocked') as events
`);
if (counts.rows[0].unlocks !== 1 || counts.rows[0].events !== 1) {
  throw new Error(`Unlock audit rows are not unique: ${JSON.stringify(counts.rows[0])}`);
}

await db.exec(`insert into public.reward_orders(user_id,total_points) values ('${userId}',30)`);
let insufficient = false;
try {
  await db.query(
    "select public.nava_unlock_reward_card_skin($1, $2::uuid)",
    ["seaside-studio", "33333333-3333-4333-8333-333333333333"],
  );
} catch (error) {
  insufficient = /insufficient points/i.test(error instanceof Error ? error.message : String(error));
}
if (!insufficient) throw new Error("Card unlock did not reject an insufficient shared balance.");

console.log("Reward-card PostgreSQL contract passed: three defaults, shared balance, 10 XP unlock, selection, idempotency, and insufficient-points rejection.");
await db.close();
