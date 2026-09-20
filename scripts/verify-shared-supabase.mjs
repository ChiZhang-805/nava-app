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
  profiles: "id,username,height,weight,occupation,goal,mbti,exercise_frequency,sleep_schedule,diet_preference,stress_factors,avatar_url,birth_date,age_group,privacy_consent_at,health_data_consent,ai_personalization_consent,onboarding_completed_at,onboarding_version,onboarding_answers",
  mood_records: "id,user_id,record_date,mood_score,factors,diary_content,diary_sentiment,ai_feedback,created_at,updated_at",
  sleep_records: "id,user_id,record_date,sleep_start,sleep_end,sleep_duration_minutes,deep_sleep_minutes,light_sleep_minutes,rem_minutes,sleep_latency_minutes,device_type,self_rating,self_note,rhythm_score,ai_feedback,is_night_owl,created_at,updated_at",
  exercise_records: "id,user_id,record_date,steps,calories,steps_goal,calories_goal,exercise_minutes,heart_rate,spo2,blood_pressure,respiratory_rate,device_type,self_rating,self_note,ai_feedback,hourly_steps,soreness_level,fatigue_level,has_injury,injury_note,recovery_estimate_min_hours,recovery_estimate_max_hours,recovery_estimate_confidence,recovery_estimate_basis,recovery_status,recovery_checked_at,created_at,updated_at",
  nutrition_records: "id,user_id,record_date,total_calories,breakfast_items,lunch_items,dinner_items,pantry_items,breakfast_time,lunch_time,dinner_time,pantry_time,breakfast_photo_url,lunch_photo_url,dinner_photo_url,protein_grams,carbohydrate_grams,fat_grams,hydration_ml,health_rating,ai_feedback,created_at,updated_at",
  focus_records: "id,user_id,task_id,record_date,completed_sessions,total_minutes,interrupted_sessions,category,started_at,ended_at,note,created_at,updated_at",
  focus_time_distribution: "id,user_id,record_date,period_0_6,period_6_12,period_12_18,period_18_24",
  tasks: "id,user_id,title,scheduled_date,completed,estimated_minutes,reminder_at,category,focus_sessions,source,created_at,updated_at",
  ai_conversations: "id,user_id,role,content,created_at",
};

const extensionTables = {
  face_records: "id,user_id,record_date,image_path,overall_score,skin_age,annotations,feedback,model_version,capture_mode,analysis_confidence,derived_features,created_at,updated_at",
  daily_rhythm_scores: "id,user_id,record_date,score,confidence,signals,reasons,actions,model_version,features,baseline,anomaly_flags,profile_labels,phase_shift_minutes,regularity_score,fragmentation_score,recovery_score,fusion,circadian_score,data_quality_score,score_lower,score_upper,latent_state,change_point_probability,trend_slope,schema_version,created_at,updated_at",
  health_metric_snapshots: "id,user_id,record_date,latest_heart_rate,resting_heart_rate,heart_rate_variability_sdnn,blood_oxygen,raw_payload,source,activity_bins,sleep_stage_minutes,sleep_start_at,sleep_end_at,sleep_efficiency,timezone_offset_minutes,activity_coverage_hours,source_metadata,created_at,updated_at",
  health_sync_jobs: "id,user_id,source,status,started_at,finished_at,sample_count,error_message,created_at",
  device_connections: "id,user_id,platform,device_name,device_model,os_version,app_version,last_seen_at,created_at",
  watch_snapshots: "id,user_id,record_date,payload,pushed_at,created_at,updated_at",
  health_feature_snapshots: "id,user_id,record_date,schema_version,features,feature_count,data_quality,created_at,updated_at",
  fdnb_health_scores: "id,user_id,analysis_start,analysis_end,report_start,report_end,status,evidence_level,stability_score,transition_score,peak_score,confidence,data_quality,accepted,peak,contributors,diagnostics,summary,recommendations,reason,model_version,schema_version,generated_at",
  weekly_health_reports: "id,user_id,week_start,week_end,status,score,confidence,evidence_level,summary,recommendations,algorithm_payload,model_version,generated_at",
  ai_health_reports: "id,user_id,scope,period_start,period_end,language,bullets,provider,model_version,source_count,generated_at,created_at,updated_at",
  record_drafts: "id,user_id,module,record_date,payload,status,created_at,updated_at",
  notification_preferences: "id,user_id,notification_type,enabled,local_time,timing_mode,timezone,last_scheduled_at,created_at,updated_at",
  growth_reward_ledger: "id,user_id,event_key,points,source,metadata,created_at",
  reward_products: "id,slug,name,description,point_price,image_urls,sold_out,published,created_at,updated_at",
  reward_cart_items: "user_id,product_id,quantity,created_at,updated_at",
  reward_orders: "id,user_id,idempotency_key,status,total_points,created_at",
  reward_order_items: "id,order_id,user_id,product_id,product_name,unit_points,quantity,created_at",
  growth_badges: "id,user_id,badge_key,awarded_at,metadata",
  user_app_preferences: "user_id,locale,ai_speech_enabled,home_widget_ids,created_at,updated_at",
  user_notifications: "user_id,id,category,source,title,body,target,created_at,read_at,deleted_at,updated_at",
  ai_conversation_archives: "id,user_id,created_at,messages,updated_at",
  active_user_sessions: "user_id,session_type,payload,updated_at",
  push_device_tokens: "id,user_id,installation_id,provider,platform,token_hash,locale,timezone,enabled,last_seen_at,invalidated_at,created_at,updated_at",
  push_delivery_receipts: "id,user_id,notification_id,device_token_id,provider,status,provider_message_id,error_code,attempted_at,created_at,updated_at",
};

const sharedFunctions = ["ai-extract-data", "ai-chat-reply", "diet-extract", "face-analyze", "aliyun-sms-send", "aliyun-sms-verify"];
const appFunctions = ["ai-health-report", "ai-diet-report", "health-sync-ingest", "watch-sync", "rhythm-score", "dnb-weekly-report", "fdnb-recompute", "export-user-data", "delete-account", "auth-account-status", "push-dispatch"];
const sharedBuckets = ["diet-photos"];
const appBuckets = ["face-photos", "profile-avatars"];
const authenticatedOnlyExtensionTables = new Set(["reward_products", "reward_cart_items", "reward_orders", "reward_order_items"]);

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
    const probe = await requestStatus(`${url}/rest/v1/${table}?select=${encodeURIComponent(columns)}&limit=0`, key);
    result[table] = authenticatedOnlyExtensionTables.has(table) && probe.status === 401
      ? { ...probe, ok: true, scope: "authenticated-only" }
      : probe;
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
