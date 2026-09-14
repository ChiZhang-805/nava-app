import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { validateFocusOutput } from "../supabase/functions/_shared/focus-contract.ts";
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
  for (const lang of ["zh", "en"]) {
    for (const count of [2, 5, 12]) {
      const request = { kind: "priority", tasks: Array.from({ length: count }, (_, index) => ({
        title: lang === "zh" ? `任务${index + 1}：整理第${index + 1}章的研究笔记，归纳关键结论并核对引用。` : `Task ${index + 1}: Review chapter ${index + 1}, summarize the main findings, verify references, and list the questions requiring further research.`,
        focusMinutes: index % 2 ? 25 : 45, important: index < 3, urgent: index === 0,
      })) };
      const response = await client.functions.invoke("ai-chat-reply", { body: { focusRequest: request, lang, deviceDate } });
      if (response.error) throw new Error(`Priority ${lang}/${count} failed: ${response.error.message}`);
      assert.match(response.data.modelVersion, /focus-v1$/);
      const result = validateFocusOutput(JSON.stringify(response.data.output), request, lang);
      assert.equal(result.advice.order.length, count);
      console.log(`Real model: ${lang}, ${count} tasks, complete valid permutation and bounded copy; no task written.`);
    }
    const request = { kind: "difficulty", title: (lang === "zh" ? "整理研究材料并核验引用。" : "Review research notes and verify citations. ").repeat(5), minutes: 45, sessions: 2 };
    const response = await client.functions.invoke("ai-chat-reply", { body: { focusRequest: request, lang, deviceDate } });
    if (response.error) throw new Error(`Difficulty ${lang} failed: ${response.error.message}`);
    validateFocusOutput(JSON.stringify(response.data.output), request, lang);
    console.log(`Real model: ${lang} long-title difficulty passed structure and length checks.`);
    const cueRequest = { kind: "starting_cue", title: request.title, minutes: 45 };
    const cue = await client.functions.invoke("ai-chat-reply", { body: { focusRequest: cueRequest, lang, deviceDate } });
    if (cue.error) throw new Error(`Starting cue ${lang} failed: ${cue.error.message}`);
    validateFocusOutput(JSON.stringify(cue.data.output), cueRequest, lang);
    console.log(`Real model: ${lang} starting cue passed one-sentence and strict length checks.`);
  }
  const oversized = await client.functions.invoke("ai-chat-reply", { body: { message: "a".repeat(601), lang: "en" } });
  assert.ok(oversized.error, "Ordinary chat must retain its 600-character limit.");
  const invalid = await client.functions.invoke("ai-chat-reply", { body: { focusRequest: { kind: "priority", tasks: Array(13).fill({ title: "test" }) }, lang: "en" } });
  assert.ok(invalid.error, "The dedicated route must reject oversized task lists.");
  console.log("Ordinary-chat limit and structured-list limits remain enforced; no health data or tasks changed.");
} finally {
  await client.auth.signOut({ scope: "local" });
}
