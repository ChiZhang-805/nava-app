import { createClient } from "@supabase/supabase-js";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv();

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const photoDirectory = argument("photo-dir");
const startDate = argument("start");
const endDate = argument("end");
if (!email || !password) throw new Error("请通过安全启动脚本提供目标 NAVA 账号。");
if (!photoDirectory || !isDate(startDate) || !isDate(endDate)) throw new Error("请提供 --photo-dir、--start 和 --end。");

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
});
const auth = await supabase.auth.signInWithPassword({ email, password });
if (auth.error) throw auth.error;
const userId = auth.data.user.id;

try {
  const outcomes = [];
  for (const date of dateRange(startDate, endDate)) {
    const existing = await supabase.from("face_records").select("id").eq("user_id", userId).eq("record_date", date).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      outcomes.push({ date, skippedExisting: true });
      continue;
    }

    const filePath = path.join(photoDirectory, `${date}-face.png`);
    const fileSize = statSync(filePath).size;
    if (fileSize <= 0 || fileSize > 8 * 1024 * 1024) throw new Error(`${date}: 测试照片超过 8 MB 或为空。`);
    const imagePath = `${userId}/${date}/face-synthetic-test-${Date.now()}.png`;
    const upload = await supabase.storage.from("face-photos").upload(imagePath, readFileSync(filePath), {
      contentType: "image/png", upsert: false,
    });
    if (upload.error) throw upload.error;

    const response = await supabase.functions.invoke("face-analyze", {
      body: { imagePath, captureMode: "bare_face", lang: "zh", selfRatings: null },
    });
    if (response.error) throw new Error(`${date}: ${await safeFunctionMessage(response.error)}`);
    const result = response.data;
    if (result?.provider !== "vision-ai" && result?.provider !== "provider") throw new Error(`${date}: 没有真实视觉模型来源。`);
    if (!Number.isFinite(result?.overall_score) || !String(result?.feedback ?? "").trim()) throw new Error(`${date}: 模型结果不完整。`);
    const annotations = Array.isArray(result.annotations) ? result.annotations : [];
    const labels = annotations.map((item) => `${item.label ?? ""} ${item.desc ?? ""}`).join(" ");
    const payload = {
      user_id: userId, record_date: date, image_path: imagePath,
      overall_score: result.overall_score, skin_age: result.skin_age ?? null,
      annotations, feedback: result.feedback, model_version: result.modelVersion,
      capture_mode: "bare_face", analysis_confidence: result.confidence ?? null,
      derived_features: {
        annotation_count: annotations.length,
        fatigue_signal: /疲|黑眼圈|eye|tired|fatigue/i.test(labels),
        skin_signal: /肤|痘|skin|acne/i.test(labels),
        overall_score: result.overall_score,
        makeup_level: result.makeup_level ?? "uncertain",
        makeup_confidence: result.makeup_confidence ?? null,
        synthetic_test_image: true,
      },
    };
    const saved = await supabase.from("face_records").insert(payload).select("id").single();
    if (saved.error) throw saved.error;
    outcomes.push({ date, skippedExisting: false, photoSaved: true, provider: result.provider, modelVersion: result.modelVersion, recordSaved: true });
  }
  console.log(JSON.stringify({ startDate, endDate, outcomes }, null, 2));
} finally {
  await supabase.auth.signOut();
}

function argument(name) { return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3); }
function isDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value ?? ""); }
function dateRange(start, end) {
  const values = [];
  const current = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (current <= last) { values.push(current.toISOString().slice(0, 10)); current.setUTCDate(current.getUTCDate() + 1); }
  return values;
}
async function safeFunctionMessage(error) {
  const context = error && typeof error === "object" && "context" in error ? error.context : null;
  if (context instanceof Response) {
    const body = await context.clone().text().catch(() => "");
    try {
      const parsed = JSON.parse(body);
      return typeof parsed.error === "string" ? parsed.error : `HTTP ${context.status}`;
    } catch { return `HTTP ${context.status}`; }
  }
  return error instanceof Error ? error.message : "request failed";
}
