import { chromium, expect } from "@playwright/test";

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error("Run through the secure NAVA account launcher.");

const targets = [
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
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
