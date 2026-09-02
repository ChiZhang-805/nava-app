import { readFile } from "node:fs/promises";
import path from "node:path";

function parseEnv(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

const root = process.cwd();
const project = parseEnv(await readFile(path.join(root, ".env.review"), "utf8"));
const accessToken = process.env.NAVA_HEALTH_TEST_ACCESS_TOKEN?.trim();
const expectedAfter = process.env.NAVA_EXPECT_SYNC_AFTER?.trim();
const expectedRecordDate = process.env.NAVA_EXPECT_HEALTH_RECORD_DATE?.trim();
const otherUserId = process.env.NAVA_OTHER_HEALTH_TEST_USER_ID?.trim();
if (!accessToken) throw new Error("Set NAVA_HEALTH_TEST_ACCESS_TOKEN in the current shell. The script never prints it.");
if (!expectedAfter || !Number.isFinite(Date.parse(expectedAfter))) {
  throw new Error("Set NAVA_EXPECT_SYNC_AFTER to an ISO timestamp captured immediately before the physical-device sync.");
}
if (!expectedRecordDate || !/^\d{4}-\d{2}-\d{2}$/.test(expectedRecordDate)) {
  throw new Error("Set NAVA_EXPECT_HEALTH_RECORD_DATE to the device-local YYYY-MM-DD date being verified.");
}
if (!otherUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(otherUserId)) {
  throw new Error("Set NAVA_OTHER_HEALTH_TEST_USER_ID to a second test user that already has a known health sync row.");
}

const base = project.VITE_SUPABASE_URL;
const apikey = project.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!base || !apikey) throw new Error("Canonical Supabase public configuration is missing from .env.review.");
const headers = { apikey, Authorization: `Bearer ${accessToken}` };

async function readJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Boundary request failed with HTTP ${response.status}.`);
  return response.json();
}

const userResponse = await fetch(`${base}/auth/v1/user`, { headers });
if (!userResponse.ok) throw new Error(`The supplied user session is invalid or expired (HTTP ${userResponse.status}).`);
const user = await userResponse.json();
if (!user?.id) throw new Error("Authenticated user identity was not returned.");

const query = (table, params) => {
  const search = new URLSearchParams(params);
  return readJson(`${base}/rest/v1/${table}?${search}`);
};
const afterIso = new Date(expectedAfter).toISOString();
const jobs = await query("health_sync_jobs", {
  select: "status,source,finished_at,sample_count",
  user_id: `eq.${user.id}`,
  status: "eq.success",
  source: "eq.apple_health",
  sample_count: "gt.0",
  finished_at: `gte.${afterIso}`,
  order: "finished_at.desc",
  limit: "5",
});
if (!Array.isArray(jobs) || jobs.length === 0) {
  throw new Error("No successful Apple Health sync job exists after the expected physical-test timestamp.");
}

const [healthRows, exerciseRows, sleepRows] = await Promise.all([
  query("health_metric_snapshots", {
    select: "record_date,source",
    user_id: `eq.${user.id}`,
    source: "eq.apple_health",
    record_date: `eq.${expectedRecordDate}`,
    order: "record_date.desc",
    limit: "31",
  }),
  query("exercise_records", {
    select: "record_date,device_type",
    user_id: `eq.${user.id}`,
    device_type: "eq.apple_health",
    record_date: `eq.${expectedRecordDate}`,
    order: "record_date.desc",
    limit: "31",
  }),
  query("sleep_records", {
    select: "record_date,device_type",
    user_id: `eq.${user.id}`,
    device_type: "eq.apple_watch",
    record_date: `eq.${expectedRecordDate}`,
    order: "record_date.desc",
    limit: "31",
  }),
]);
const normalizedCount = [healthRows, exerciseRows, sleepRows]
  .filter(Array.isArray)
  .reduce((total, rows) => total + rows.length, 0);
if (normalizedCount === 0) throw new Error("The sync job succeeded but no normalized Apple Health records are visible to the user.");

// The second account must have a known sync row before this check. Seeing no row as
// the current account then proves the cross-user policy at the actual data boundary.
const crossUserRows = await query("health_sync_jobs", {
  select: "id",
  user_id: `eq.${otherUserId}`,
  limit: "1",
});
if (!Array.isArray(crossUserRows) || crossUserRows.length !== 0) {
  throw new Error("RLS isolation failed: the authenticated account observed another user filter.");
}

console.log("Authenticated Apple Health boundary verification passed.");
console.log(`- Successful jobs after test start: ${jobs.length}`);
console.log(`- Normalized health days visible to the same account: ${healthRows.length}`);
console.log(`- Normalized exercise days visible to the same account: ${exerciseRows.length}`);
console.log(`- Normalized sleep days visible to the same account: ${sleepRows.length}`);
console.log("- Known second-user filtered read: isolated by RLS");
console.log("- No health values, access token, email, or user identifier were printed");
