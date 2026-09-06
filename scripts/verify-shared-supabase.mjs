import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(appRoot, "..");
const webRoot = process.env.NAVA_WEB_REPO || path.join(workspaceRoot, "nava-app-preview");
const outputPath = path.join(appRoot, "artifacts", "backend-review", "shared-supabase.json");
const targetPath = path.join(appRoot, "config", "backend-target.json");
const cliProjectRefPath = path.join(appRoot, "supabase", ".temp", "project-ref");

const coreTables = {
  profiles: "id,username,height,weight,occupation,goal,mbti,exercise_frequency,sleep_schedule,diet_preference,stress_factors,avatar_url",
  mood_records: "id,user_id,record_date,mood_score,factors,diary_content,ai_feedback",
  sleep_records: "id,user_id,record_date,sleep_start,sleep_end,sleep_duration_minutes,deep_sleep_minutes,light_sleep_minutes,rem_minutes,self_rating,rhythm_score",
  exercise_records: "id,user_id,record_date,steps,calories,exercise_minutes,heart_rate,spo2,self_rating,device_type,updated_at",
  nutrition_records: "id,user_id,record_date,total_calories,breakfast_items,lunch_items,dinner_items,pantry_items,breakfast_time,lunch_time,dinner_time,pantry_time",
  focus_records: "id,user_id,task_id,record_date,completed_sessions,total_minutes,note",
  focus_time_distribution: "id,user_id,record_date,period_0_6,period_6_12,period_12_18,period_18_24",
  tasks: "id,user_id,title,scheduled_date,completed,source",
  ai_conversations: "id,user_id,role,content,created_at",
};

const extensionTables = {
  face_records: "id,user_id,record_date,image_path,overall_score,skin_age,annotations,feedback,model_version",
  daily_rhythm_scores: "id,user_id,record_date,score,confidence,model_version",
  health_metric_snapshots: "id,user_id,record_date,source",
  health_sync_jobs: "id,user_id,status,created_at",
  watch_snapshots: "id,user_id,payload,pushed_at",
  health_feature_snapshots: "id,user_id,record_date,schema_version,features,data_quality",
  fdnb_health_scores: "id,user_id,report_start,report_end,status,evidence_level,model_version",
  weekly_health_reports: "id,user_id,week_start,week_end,status,model_version",
  record_drafts: "id,user_id,module,record_date,status",
  notification_preferences: "id,user_id,notification_type,enabled,local_time",
  growth_reward_ledger: "id,user_id,event_key,points,source",
  growth_badges: "id,user_id,badge_key,awarded_at",
  user_app_preferences: "user_id,locale,ai_speech_enabled,home_widget_ids,updated_at",
  user_notifications: "user_id,id,category,source,title,body,read_at,deleted_at,updated_at",
  ai_conversation_archives: "id,user_id,created_at,messages,updated_at",
  active_user_sessions: "user_id,session_type,payload,updated_at",
};

const sharedFunctions = ["ai-extract-data", "ai-chat-reply", "diet-extract", "face-analyze", "aliyun-sms-send", "aliyun-sms-verify"];
const appFunctions = ["health-sync-ingest", "watch-sync", "rhythm-score", "dnb-weekly-report", "fdnb-recompute", "export-user-data", "delete-account", "auth-account-status"];
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

async function probeStorageRoutes(url, key, names) {
  const result = {};
  for (const name of names) {
    try {
      const response = await fetch(`${url}/storage/v1/object/list/${name}`, {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: "", limit: 1, offset: 0 }),
      });
      const body = await response.json().catch(() => ({}));
      result[name] = {
        ok: response.ok,
        status: response.status,
        code: typeof body?.code === "string" ? body.code : undefined,
        scope: "route-only",
      };
    } catch (error) {
      result[name] = { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return result;
}

async function main() {
  const [appText, targetText, webText, webIndexText, cliProjectRefText] = await Promise.all([
    readFile(path.join(appRoot, ".env"), "utf8")
      .catch(() => readFile(path.join(appRoot, ".env.review"), "utf8")),
    readFile(targetPath, "utf8"),
    readFile(path.join(webRoot, ".env"), "utf8").catch(() => ""),
    readFile(path.join(webRoot, "index.html"), "utf8").catch(() => ""),
    readFile(cliProjectRefPath, "utf8").catch(() => ""),
  ]);
  const appEnv = parseEnv(appText);
  const webEnv = parseEnv(webText);
  const target = JSON.parse(targetText);
  const appUrl = appEnv.VITE_SUPABASE_URL;
  const appKey = appEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
  const generatedWebUrl = webIndexText.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[0];
  const webUrl = webEnv.VITE_SUPABASE_URL || generatedWebUrl;
  if (!appUrl || !appKey) throw new Error("APP .env 缺少公开 Supabase URL/key。");

  const expectedProjectRef = target.projectRef;
  const appProjectRef = projectRef(appUrl);
  const webProjectRef = webUrl ? projectRef(webUrl) : null;
  const cliProjectRef = cliProjectRefText.trim() || null;
  const appTargetMatches = appProjectRef === expectedProjectRef && appUrl === target.projectUrl;
  const cliTargetMatches = !cliProjectRef || cliProjectRef === expectedProjectRef;
  const webAligned = webProjectRef === expectedProjectRef;

  const auth = await requestStatus(`${appUrl}/auth/v1/settings`, appKey);
  const [core, extensions, sharedEdgeFunctions, appEdgeFunctions, sharedStorage, appStorage, storage] = await Promise.all([
    probeTables(appUrl, appKey, coreTables),
    probeTables(appUrl, appKey, extensionTables),
    probeFunctions(appUrl, appKey, sharedFunctions),
    probeFunctions(appUrl, appKey, appFunctions),
    probeStorageRoutes(appUrl, appKey, sharedBuckets),
    probeStorageRoutes(appUrl, appKey, appBuckets),
    requestStatus(`${appUrl}/storage/v1/bucket`, appKey),
  ]);

  const report = {
    checkedAt: new Date().toISOString(),
    expectedProjectRef,
    appProjectRef,
    cliProjectRef,
    webProjectRef,
    appTargetMatches,
    cliTargetMatches,
    webAligned,
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
      storageBucketExistence: "Verify through linked database migrations; anonymous Storage routes do not disclose bucket existence.",
    },
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`APP target: ${appTargetMatches ? "MATCH" : "MISMATCH"}`);
  console.log(`CLI target: ${cliTargetMatches ? "MATCH" : "MISMATCH"}`);
  console.log(`Web alignment: ${webAligned ? "ALIGNED" : "PENDING"}`);
  console.log(`Auth: ${auth.ok ? "READY" : `HTTP ${auth.status}`}`);
  console.log(`Core tables: ${report.notes.coreReady ? "READY" : "INCOMPLETE"}`);
  console.log(`APP extension tables: ${report.notes.extensionsReady ? "READY" : "INCOMPLETE"}`);
  console.log(`Shared Edge Functions: ${report.notes.sharedFunctionsReady ? "READY" : "INCOMPLETE"}`);
  console.log(`APP Edge Functions: ${report.notes.appFunctionsReady ? "READY" : "INCOMPLETE"}`);
  console.log(`Shared storage: ${report.notes.sharedStorageReady ? "READY" : "INCOMPLETE"}`);
  console.log(`APP storage: ${report.notes.appStorageReady ? "READY" : "INCOMPLETE"}`);
  console.log(`Report: ${outputPath}`);

  if (!appTargetMatches || !cliTargetMatches || !auth.ok || !report.notes.coreReady) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
