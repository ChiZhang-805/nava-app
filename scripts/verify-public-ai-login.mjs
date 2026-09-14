import { chromium, expect } from "@playwright/test";

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error("Run through the secure NAVA account launcher.");

const targets = process.env.NAVA_AI_ACCEPTANCE_URL
  ? [["sites", process.env.NAVA_AI_ACCEPTANCE_URL]]
  : [
    ["sites", "https://nava-app-preview-cz.chizhang1031.chatgpt.site/"],
    ["pages", "https://chizhang-805.github.io/nava-app-preview/"],
  ];

const browser = await chromium.launch({ headless: true });
try {
  for (const [label, url] of targets) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const launch = page.locator(".launch-sequence");
      if (await launch.isVisible().catch(() => false)) await launch.click();
      const form = page.locator(".auth-form--signIn");
      await expect(form).toBeVisible({ timeout: 20_000 });
      await form.locator('input[autocomplete="username"]').fill(email);
      await form.locator('input[autocomplete="current-password"]').fill(password);
      await form.locator('button[type="submit"]').click();
      await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 30_000 });
      console.log(`${label}: authenticated app navigation visible`);

      if (label === "sites") {
        await page.locator('[data-tab="ai"]').click();
        await expect(page.locator(".chat-input-shell input")).toBeVisible({ timeout: 20_000 });
        const marker = "请根据我九月十三日已保存的饮食记录，指出一条具体观察；不要新建记录。";
        const completedReply = async () => page.evaluate((message) => {
          const rows = [...document.querySelectorAll(".chat-message-row")];
          const userIndex = rows.findLastIndex((row) => row.classList.contains("user") && row.textContent?.includes(message));
          if (userIndex < 0) return null;
          const reply = rows.slice(userIndex + 1).find((row) => row.classList.contains("assistant") && !row.hasAttribute("data-ai-streaming"));
          return reply?.querySelector(".chat-bubble p")?.textContent?.trim() ?? null;
        }, marker);
        let reply = await completedReply();
        if (!reply) {
          await page.locator(".chat-input-shell input").fill(marker);
          await page.locator(".chat-send-button").click();
          await expect.poll(completedReply, { timeout: 90_000 }).not.toBeNull();
          reply = await completedReply();
        }
        reply = reply?.trim() ?? "";
        if (reply.length < 10 || /AI\s*暂不可用|请先登录|AI 服务额度不足/.test(reply)) {
          throw new Error("Authenticated AI reply did not pass the safe acceptance check.");
        }
        console.log(`sites: authenticated AI reply received (${reply.length} characters; content omitted)`);

        await page.goto(`${url}#tab=record&module=focus`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await expect(page.locator('[data-module-view="focus-overview"]')).toBeVisible({ timeout: 20_000 });
        await page.locator(".focus-task-field input").fill("交论文");
        await page.getByRole("button", { name: "询问 AI 难度" }).click();
        try {
          await page.waitForFunction(() => Boolean(document.querySelector(".focus-ai-assessment, .focus-ai-assessment-error")), null, { timeout: 90_000 });
        } catch {
          const button = page.locator(".focus-ai-actions button").first();
          throw new Error(`Focus difficulty did not settle; route=${new URL(page.url()).hash}; overview=${await page.locator('[data-module-view="focus-overview"]').count()}; button=${(await button.innerText()).trim()}; disabled=${await button.isDisabled()}`);
        }
        const assessmentError = await page.locator(".focus-ai-assessment-error").count()
          ? await page.locator(".focus-ai-assessment-error").textContent()
          : null;
        if (assessmentError) throw new Error(`Focus difficulty returned an error: ${assessmentError.slice(0, 160)}`);
        await expect(page.locator(".focus-ai-assessment")).toBeVisible();
        const assessmentLength = (await page.locator(".focus-ai-assessment p").innerText()).trim().length;
        if (assessmentLength < 10 || assessmentLength > 800) throw new Error("Authenticated focus difficulty assessment failed the safe length check.");
        console.log(`sites: authenticated focus difficulty assessment received (${assessmentLength} characters; content omitted)`);
        await page.locator(".focus-summary-start").click();
        await page.getByRole("button", { name: "AI 进入状态" }).click();
        const guide = page.getByRole("dialog", { name: "进入专注状态" });
        await expect(guide).toBeVisible();
        await expect(guide.locator(".focus-guide-ai-cue")).toBeVisible({ timeout: 90_000 });
        const cueLength = (await guide.locator(".focus-guide-ai-cue").innerText()).trim().length;
        if (cueLength < 2 || cueLength > 120) throw new Error("Authenticated focus AI cue failed the safe length check.");
        console.log(`sites: authenticated focus AI cue received (${cueLength} characters; content omitted)`);
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
