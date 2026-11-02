// Isolated PostgreSQL contract tests. No network or production mutations.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.env.NAVA_PGLITE || "Q:/NAVA-Workspace/Tools/reward-db-check/node_modules/@electric-sql/pglite/dist/index.js").href);
const db = new PGlite();
const admin = "11111111-1111-4111-8111-111111111111", member = "22222222-2222-4222-8222-222222222222";
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const sql = (name) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
async function rejects(query, params, pattern) { await assert.rejects(db.query(query, params), pattern); checks++; }
async function asUser(id) { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`); }
const value = async (query, params) => (await db.query(query, params)).rows[0].value;
const save = (draft) => value("select public.nava_admin_save_reward_product_v2($1::jsonb) as value", [JSON.stringify(draft)]);
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
    create table public.growth_reward_ledger(user_id uuid references auth.users(id),points integer);
    create table public.analytics_events(user_id uuid,event_name text,properties jsonb);
    insert into auth.users values('${admin}'),('${member}');
    insert into public.growth_reward_ledger values('${member}',1000);`);
  await db.exec(sql("202609080001_reward_shop"));
  await db.exec(sql("202609260001_admin_console").split("CREATE OR REPLACE FUNCTION public.nava_admin_publish_notification")[0]);
  await db.exec(`update public.nava_user_roles set role='member' where user_id='${member}';
    insert into public.reward_products(slug,name,point_price,inventory_remaining,published) values ('legacy','旧商品',10,4,true);`);
  await db.exec(sql("202609280002_admin_product_catalog"));
  check(await value("select listing_status='published' as value from public.reward_products where slug='legacy'"), "legacy listing preserved");
  const draft = { slug: "test-cat", name: "小猫笔记本", name_en: "Cat notebook", brand: "纳瓦", brand_en: "NAVA", description: "把灵感写进风里。", description_en: "Let your ideas find a home.", point_price: 10, inventory: 1, image_urls: ["https://example.com/a.webp"], listing_status: "upcoming" };
  await asUser(member);
  await rejects("select public.nava_admin_save_reward_product_v2($1::jsonb)", [JSON.stringify(draft)], /administrator access required/);
  await rejects("select * from public.nava_admin_list_reward_products_v2()", [], /administrator access required/);
  await rejects("select public.nava_admin_archive_reward_product(gen_random_uuid())", [], /administrator access required/);
  await rejects("update public.reward_products set published=true", [], /permission denied/);
  await rejects("select inventory_remaining from public.reward_products", [], /permission denied/);
  await asUser(admin);
  for (const field of ["name", "name_en", "brand", "brand_en", "description", "description_en"]) {
    await assert.rejects(save({ ...draft, [field]: " " }), /invalid bilingual field/); checks++;
  }
  for (const patch of [{ point_price: 1.5 }, { inventory: -1 }, { listing_status: "invalid" }, { image_urls: ["javascript:bad"] }, { image_urls: [null] }, { image_urls: Array(7).fill("https://example.com/a") }]) {
    await assert.rejects(save({ ...draft, ...patch })); checks++;
  }
  const id = await save(draft);
  const row = (await db.query("select * from public.nava_admin_list_reward_products_v2() where id=$1", [id])).rows[0];
  check(row.name_en === draft.name_en && row.brand === draft.brand && row.brand_en === draft.brand_en && row.description_en === draft.description_en, "bilingual round trip");
  await asUser(member);
  check(await value("select count(*)=1 as value from public.reward_products where id=$1 and listing_status='upcoming' and published", [id]), "preview visible through RLS");
  await rejects("select public.nava_set_reward_cart_item($1,1)", [id], /unavailable for purchase/);
  await asUser(admin); await save({ ...draft, id, listing_status: "published" });
  await asUser(member); await db.query("select public.nava_set_reward_cart_item($1,1)", [id]);
  await asUser(admin); await save({ ...draft, id, listing_status: "upcoming" });
  await asUser(member);
  await rejects("select public.nava_checkout_reward_cart(gen_random_uuid())", [], /unavailable for purchase/);
  check(await value("select public.nava_reward_points_balance() as value") === 1000, "failed preview checkout never spends points");
  check(await value("select count(*)=0 as value from public.reward_orders"), "failed order rolled back");
  await asUser(admin); await save({ ...draft, id, listing_status: "published" });
  await asUser(member);
  const key = "33333333-3333-4333-8333-333333333333";
  const order = await value("select public.nava_checkout_reward_cart($1) as value", [key]);
  check(order.balance === 990, "last inventory unit can be bought");
  check((await value("select public.nava_checkout_reward_cart($1) as value", [key])).replayed, "checkout remains idempotent");
  await asUser(admin);
  await db.query("select public.nava_admin_archive_reward_product($1)", [id]);
  await db.query("select public.nava_admin_archive_reward_product($1)", [id]);
  check(await value("select count(*)=0 as value from public.nava_admin_list_reward_products_v2() where id=$1", [id]), "removed from admin list");
  check(await value("select count(*)=0 as value from public.nava_admin_list_reward_products() where id=$1", [id]), "removed from legacy admin list");
  await assert.rejects(save({ ...draft, id }), /archived/); checks++;
  await asUser(member);
  check(await value("select count(*)=0 as value from public.reward_products where id=$1", [id]), "removed from public catalog");
  check(await value("select count(*)=1 as value from public.reward_order_items where product_id=$1", [id]), "order snapshot preserved");
  check(await value("select public.nava_reward_points_balance() as value") === 990, "archive preserves balance");
  await db.exec("reset role");
  check(await value("select count(*)=1 as value from public.admin_audit_log where action='reward_product_archived' and subject_id=$1", [id]), "archive audited exactly once");
  check(await value("select deleted_at is not null and inventory_remaining=0 as value from public.reward_products where id=$1", [id]), "recoverable product row preserved");
  await db.exec("set role anon");
  await rejects("select * from public.nava_admin_list_reward_products_v2()", [], /permission denied/);
  await rejects("select public.nava_admin_save_reward_product_v2('{}')", [], /permission denied/);
  await rejects("select public.nava_admin_archive_reward_product(gen_random_uuid())", [], /permission denied/);
  console.log(`Admin catalog PostgreSQL: ${checks} checks passed.`);
} finally { await db.close(); }
