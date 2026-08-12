import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const appRoot = process.cwd();
const webRoot = process.env.NAVA_WEB_REPO || "Z:/style-muse-next";
const outputPath = path.join(appRoot, "artifacts", "backend-review", "shared-supabase.json");

const coreTables = {
  profiles: "id,username,height,weight,occupation,goal,mbti,exercise_frequency,sleep_schedule,diet_preference,stress_factors,avatar_url",
  mood_records: "id,user_id,record_date,mood_score,factors,diary_content,ai_feedback",
  sleep_records: "id,user_id,record_date,sleep_start,sleep_end,sleep_duration_minutes,deep_sleep_minutes,light_sleep_minutes,rem_minutes,self_rating,rhythm_score",
  exercise_records: "id,user_id,record_date,steps,calories,exercise_minutes,heart_rate,spo2,self_rating,device_type,updated_at",
  nutrition_records: "id,user_id,record_date,total_calories,breakfast_items,lunch_items,dinner_items,pantry_items",
  focus_records: "id,user_id,task_id,record_date,completed_sessions,total_minutes",
  focus_time_distribution: "id,user_id,record_date,period_0_6,period_6_12,period_12_18,period_18_24",
  tasks: "id,user_id,title,scheduled_date,completed",
  ai_conversations: "id,user_id,role,content,created_at",
};

const extensionTables = {
  face_records: "id,user_id,record_date,image_path,overall_score,skin_age,annotations,feedback,model_version",
  daily_rhythm_scores: "id,user_id,record_date,score,confidence,model_version",
  health_metric_snapshots: "id,user_id,record_date,source",
  health_sync_jobs: "id,user_id,status,created_at",
  watch_snapshots: "id,user_id,payload,pushed_at",
};

const sharedFunctions = ["ai-extract-data", "ai-chat-reply", "diet-extract", "face-analyze", "aliyun-sms-send", "aliyun-sms-verify"];
const appFunctions = ["health-sync-ingest", "watch-sync", "rhythm-score", "export-user-data"];
const sharedBuckets = ["diet-photos"];
const appBuckets = ["face-photos", "profile-avatars"];

function parseEnv(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return result;
}

function projectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return null;
  }
}

async function requestStatus(url, key, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...(options.headers || {}),
      },
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function probeTables(url, key, contracts) {
  const result = {};
  for (const [table, columns] of Object.entries(contracts)) {
    result[table] = await requestStatus(`${url}/rest/v1/${table}?select=${encodeURIComponent(columns)}&limit=0`, key);
  }
  return result;
}

async function probeFunctions(url, key, names) {
  const result = {};
  for (const name of names) result[name] = await requestStatus(`${url}/functions/v1/${name}`, key, { method: "OPTIONS" });
  return result;
}

async function probeBuckets(url, key, names) {
  const result = {};
  for (const name of names) {
    try {
      const response = await fetch(`${url}/storage/v1/bucket/${name}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      const body = await response.json().catch(() => ({}));
      result[name] = {
        ok: response.ok,
        status: response.status,
        code: typeof body?.code === "string" ? body.code : undefined,
      };
    } catch (error) {
      result[name] = { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return result;
}

async function main() {
  const [appText, webText] = await Promise.all([
    readFile(path.join(appRoot, ".env"), "utf8"),
    readFile(path.join(webRoot, ".env"), "utf8"),
  ]);
  const appEnv = parseEnv(appText);
  const webEnv = parseEnv(webText);
  const appUrl = appEnv.VITE_SUPABASE_URL;
  const appKey = appEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
  const webUrl = webEnv.VITE_SUPABASE_URL;
  const webKey = webEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!appUrl || !appKey || !webUrl || !webKey) throw new Error("APP 或网页端 .env 缺少公开 Supabase URL/key。 ");

  const auth = await requestStatus(`${webUrl}/auth/v1/settings`, webKey);
  const [core, extensions, sharedEdgeFunctions, appEdgeFunctions, sharedStorage, appStorage, storage] = await Promise.all([
    probeTables(webUrl, webKey, coreTables),
    probeTables(webUrl, webKey, extensionTables),
    probeFunctions(webUrl, webKey, sharedFunctions),
    probeFunctions(webUrl, webKey, appFunctions),
    probeBuckets(webUrl, webKey, sharedBuckets),
    probeBuckets(webUrl, webKey, appBuckets),
    requestStatus(`${webUrl}/storage/v1/bucket`, webKey),
  ]);

  const report = {
    checkedAt: new Date().toISOString(),
    appProjectRef: projectRef(appUrl),
    webProjectRef: projectRef(webUrl),
    sharedConfigMatches: appUrl === webUrl && appKey === webKey,
    auth,
    coreTables: core,
    extensionTables: extensions,
    sharedEdgeFunctions,
    appEdgeFunctions,
    sharedStorage,
    appStorage,
    storageApi: storage,
    notes: {
      coreReady: Object.values(core).every((item) => item.ok),
      extensionsReady: Object.values(extensions).every((item) => item.ok),
      sharedFunctionsReady: Object.values(sharedEdgeFunctions).every((item) => item.ok),
      appFunctionsReady: Object.values(appEdgeFunctions).every((item) => item.ok),
      sharedStorageReady: Object.values(sharedStorage).every((item) => item.ok),
      appStorageReady: Object.values(appStorage).every((item) => item.ok),
    },
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Shared config: ${report.sharedConfigMatches ? "MATCH" : "MISMATCH"}`);
  console.log(`Auth: ${auth.ok ? "READY" : `HTTP ${auth.status}`}`);
  console.log(`Core tables: ${report.notes.coreReady ? "READY" : "INCOMPLETE"}`);
  console.log(`APP extension tables: ${report.notes.extensionsReady ? "READY" : "INCOMPLETE"}`);
  console.log(`Shared Edge Functions: ${report.notes.sharedFunctionsReady ? "READY" : "INCOMPLETE"}`);
  console.log(`APP Edge Functions: ${report.notes.appFunctionsReady ? "READY" : "INCOMPLETE"}`);
  console.log(`Shared storage: ${report.notes.sharedStorageReady ? "READY" : "INCOMPLETE"}`);
  console.log(`APP storage: ${report.notes.appStorageReady ? "READY" : "INCOMPLETE"}`);
  console.log(`Report: ${outputPath}`);

  if (!report.sharedConfigMatches || !auth.ok || !report.notes.coreReady) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
