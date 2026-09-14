import { createClient } from "@supabase/supabase-js";
import { focusPriorityPrompt, parseFocusPriorityAdvice } from "../src/services/focusPlanning.ts";
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
  const response = await client.functions.invoke("ai-chat-reply", {
    body: {
      message: focusPriorityPrompt([
        { title: "整理明天汇报资料", scheduledTime: "15:30", focusMinutes: 45 },
        { title: "回顾本周阅读笔记", focusMinutes: 25 },
      ], "zh"),
      lang: "zh",
      responseMode: "text",
      deviceDate,
      stream: false,
    },
  });
  if (response.error) throw new Error(`AI priority call failed: ${response.error.message}`);
  const reply = typeof response.data?.reply === "string" ? response.data.reply.trim() : "";
  if (reply.length < 10 || reply.length > 800) throw new Error("Authenticated priority advice failed the safe length check.");
  const advice = parseFocusPriorityAdvice(reply, 2);
  console.log(`Authenticated real-model priority advice received (${reply.length} characters; ${advice.order.length} valid ordered tasks; content omitted); no task saved or reordered.`);
} finally {
  await client.auth.signOut();
}
