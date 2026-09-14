import { createClient } from "@supabase/supabase-js";
import { focusInSessionEncouragementPrompt } from "../src/services/focusPlanning.ts";
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
  const deviceDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const response = await client.functions.invoke("ai-chat-reply", {
    body: {
      message: focusInSessionEncouragementPrompt("整理研究笔记", 12, "zh"),
      lang: "zh", responseMode: "text", deviceDate, stream: false,
    },
  });
  if (response.error) throw new Error(`Authenticated in-session cue failed: ${response.error.message}`);
  const reply = typeof response.data?.reply === "string" ? response.data.reply.trim() : "";
  if (reply.length < 6 || reply.length > 400 || /AI\s*暂不可用|请先登录/.test(reply)) {
    throw new Error("Authenticated in-session cue did not pass the safe reply check.");
  }
  console.log(`Authenticated real-model in-session focus cue received (${reply.length} characters; content omitted); no focus or health record saved.`);
} finally {
  await client.auth.signOut({ scope: "local" });
}
