import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { applyProjectPublicEnv } from "./project-env.mjs";

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error("Run through the secure NAVA account launcher.");
applyProjectPublicEnv(process.cwd());
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || new URL(url).hostname.split(".")[0] !== "wxteapvwagvhhtrjrbim") {
  throw new Error("The configured public Supabase project is not canonical.");
}

const makeClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const owner = makeClient();
const secondSession = makeClient();
const anon = makeClient();
const ids = [crypto.randomUUID(), crypto.randomUUID()];
let insertedIds = [];
let primaryError;
try {
  const login = await owner.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.user) throw new Error("NAVA account login failed.");
  const userId = login.data.user.id;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const testItems = ids.map((id, index) => ({
    id, user_id: userId, title: `NAVA 四象限临时验收 ${index + 1}`,
    scheduled_date: date, category: "todo", source: "manual", completed: false,
    estimated_minutes: 25, focus_sessions: 1,
  }));
  for (const item of testItems) {
    const { data, error } = await owner.from("tasks").insert(item).select("id").single();
    if (error || !data) throw new Error(`Temporary test task insert failed: ${error?.message ?? "no row"}`);
    insertedIds.push(item.id);
  }
  const noSessionRead = await anon.from("tasks").select("id").in("id", ids);
  if (noSessionRead.error) throw noSessionRead.error;
  assert.equal(noSessionRead.data.length, 0, "anonymous users must not see private tasks");

  const first = await owner.from("tasks").update({ important: true, urgent: true }).eq("id", ids[0]).eq("user_id", userId).select("id,important,urgent").single();
  const second = await owner.from("tasks").update({ important: true, urgent: false }).eq("id", ids[1]).eq("user_id", userId).select("id,important,urgent").single();
  if (first.error || second.error) throw new Error(`Quadrant save failed: ${first.error?.message ?? second.error?.message}`);
  assert.deepEqual([first.data.important, first.data.urgent], [true, true]);
  assert.deepEqual([second.data.important, second.data.urgent], [true, false]);
  const invalidPair = await owner.from("tasks").update({ important: true, urgent: null }).eq("id", ids[1]).eq("user_id", userId);
  assert.ok(invalidPair.error, "the database must reject a half-classified task");

  const invalidOrder = await owner.rpc("nava_set_task_priority_order", { task_ids: [ids[0], crypto.randomUUID()] });
  assert.ok(invalidOrder.error, "atomic ordering must reject a task outside the user's eligible set");
  const savedOrder = await owner.rpc("nava_set_task_priority_order", { task_ids: [ids[1], ids[0]] });
  if (savedOrder.error) throw savedOrder.error;
  assert.equal(savedOrder.data, 2);

  const secondLogin = await secondSession.auth.signInWithPassword({ email, password });
  if (secondLogin.error) throw secondLogin.error;
  const reloaded = await secondSession.from("tasks").select("id,important,urgent,priority_rank").in("id", ids);
  if (reloaded.error) throw reloaded.error;
  assert.equal(reloaded.data.length, 2);
  const byId = new Map(reloaded.data.map((row) => [row.id, row]));
  assert.deepEqual([byId.get(ids[0]).important, byId.get(ids[0]).urgent, byId.get(ids[0]).priority_rank], [true, true, 2]);
  assert.deepEqual([byId.get(ids[1]).important, byId.get(ids[1]).urgent, byId.get(ids[1]).priority_rank], [true, false, 1]);
  console.log("Authenticated quadrant write, atomic confirmed order, cross-session read, validation, and anonymous isolation passed; private task contents omitted.");
} catch (error) {
  primaryError = error;
} finally {
  if (insertedIds.length) {
    const cleanup = await owner.from("tasks").delete().in("id", insertedIds).select("id");
    if (cleanup.error || cleanup.data?.length !== insertedIds.length) {
      primaryError ??= new Error("Temporary test task cleanup could not be verified.");
    } else {
      console.log(`Removed ${insertedIds.length} exact temporary test tasks after verification.`);
    }
  }
  await Promise.all([owner.auth.signOut(), secondSession.auth.signOut()]);
}
if (primaryError) throw primaryError;
