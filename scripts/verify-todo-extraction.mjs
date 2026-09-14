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

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
try {
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.user) throw new Error("NAVA account login failed.");

  const deviceDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  const date = new Date(`${deviceDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 9 - (date.getUTCDay() + 6) % 7);
  const expectedDate = date.toISOString().slice(0, 10);

  const positive = await client.functions.invoke("ai-extract-data", {
    body: { message: "下周三上午九点要准备小组汇报", lang: "zh", deviceDate },
  });
  if (positive.error) throw new Error(`AI todo extraction call failed: ${positive.error.message}`);
  const records = positive.data?.dataType === "multi" ? positive.data?.extractedData?.records : [positive.data];
  const todo = records?.find((record) => record?.dataType === "todo");
  const payload = todo?.extractedData;
  if (!todo || typeof payload?.title !== "string" || payload.title.trim().length < 2
    || payload.scheduledDate !== expectedDate || payload.scheduledTime !== "09:00") {
    throw new Error(`AI todo extraction contract failed (type=${String(positive.data?.dataType)}, dateMatch=${payload?.scheduledDate === expectedDate}, timeMatch=${payload?.scheduledTime === "09:00"}).`);
  }
  console.log("Authenticated real-model todo extraction passed: title, relative date, and local time; no task saved.");

  const negative = await client.functions.invoke("ai-extract-data", {
    body: { message: "明天我不打算开会", lang: "zh", deviceDate },
  });
  if (negative.error) throw new Error(`AI negation extraction call failed: ${negative.error.message}`);
  const negativeRecords = negative.data?.dataType === "multi" ? negative.data?.extractedData?.records : [negative.data];
  if (negativeRecords?.some((record) => record?.dataType === "todo")) {
    throw new Error("AI negation extraction incorrectly created a todo candidate.");
  }
  console.log("Authenticated real-model negated plan passed: no todo candidate and no task saved.");
} finally {
  await client.auth.signOut();
}
