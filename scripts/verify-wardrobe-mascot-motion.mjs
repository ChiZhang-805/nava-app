import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/wardrobe-mascot-motion";
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 5261, strictPort: true }, logLevel: "silent" });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const sizes = [[360, 740], [375, 812], [390, 844], [430, 932]];
const actions = [
  ["bubble", 1640], ["starlight", 1520], ["blossom", 1840], ["snowfall", 1720],
];
const report = { passed: false, sizes: [], errors: [] };

async function openWardrobe(context) {
  await context.addInitScript(() => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {} }));
  });
  const page = await context.newPage();
  await page.goto(`${base}?demo=1#tab=profile&view=wardrobe`, { waitUntil: "networkidle" });
  if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
  await expect(page.locator(".mascot-wardrobe-preview")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".mascot-wardrobe-character")).toHaveAttribute("data-renderer", "ready", { timeout: 20000 });
  return page;
}

try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: "no-preference", locale: "zh-CN" });
    const page = await openWardrobe(context);
    page.on("pageerror", (error) => report.errors.push(`${width}x${height}: ${error.message}`));
    const stage = page.locator(".mascot-wardrobe-preview");
    const character = page.locator(".mascot-wardrobe-character");
    const hint = page.locator(".mascot-wardrobe-motion-hint");
    const result = { viewport: `${width}x${height}`, completed: [], samePixelsAfter: true, changedDuring: true };
    for (const [id, duration] of actions) {
      const before = await stage.screenshot();
      const hintBefore = await hint.textContent();
      await character.click();
      await expect(character).toHaveAttribute("data-motion", id);
      assert.equal(await hint.textContent(), hintBefore, `${width}x${height} ${id} must not replace the resting hint at activation`);
      await page.waitForTimeout(Math.floor(duration * .42));
      const during = await stage.screenshot();
      assert.equal(before.equals(during), false, `${width}x${height} ${id} must visibly move`);
      await expect(character).toHaveAttribute("data-motion", "rest", { timeout: duration + 2000 });
      const after = await stage.screenshot();
      assert.equal(before.equals(after), true, `${width}x${height} ${id} must return to the exact still pixels`);
      result.completed.push(id);
      if (width === 390) {
        await writeFile(`${output}/${id}-during-${width}x${height}.png`, during);
        if (id === "bubble") await writeFile(`${output}/still-${width}x${height}.png`, before);
      }
    }
    if (width === 390) {
      const box = await character.boundingBox();
      assert.ok(box, "cat hit target must exist");
      const startX = box.x + box.width * .42;
      const startY = box.y + box.height * .5;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 48, startY + 2, { steps: 8 });
      await page.mouse.up();
      await expect(character).toHaveAttribute("data-motion", "rest");
      await character.click();
      await expect(character).toHaveAttribute("data-motion", "bubble");
      await expect(character).toHaveAttribute("data-motion", "rest", { timeout: 4000 });
      result.dragThenTap = "drag does not animate; next tap starts immediately";

      await page.locator(".mascot-wardrobe-item").filter({ hasText: "极光青" }).click();
      await page.getByRole("tab", { name: "饰品" }).click();
      await page.locator(".mascot-wardrobe-item").filter({ hasText: "星月发夹" }).click();
      await page.locator(".mascot-wardrobe-item").filter({ hasText: "珍珠领结" }).click();
      await expect(character.locator("canvas")).toHaveAttribute("data-skin", "skin-aurora-teal");
      await expect(character.locator("canvas")).toHaveAttribute("data-accessories", "accessory-star-moon-clip accessory-pearl-bow");
      const dressedBefore = await stage.screenshot();
      await character.click();
      await expect(character).toHaveAttribute("data-motion", "starlight");
      await expect(character).toHaveAttribute("data-motion", "rest", { timeout: 4000 });
      assert.equal(dressedBefore.equals(await stage.screenshot()), true, "selected skin and accessories must retain exact still recovery");
      await writeFile(`${output}/dressed-still-${width}x${height}.png`, dressedBefore);
      result.dressedLook = "aurora-teal with two accessories: exact still recovery";
    }
    report.sizes.push(result);
    await context.close();
  }

  const interaction = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "no-preference", locale: "zh-CN" });
  const interactionPage = await openWardrobe(interaction);
  const interactionCharacter = interactionPage.locator(".mascot-wardrobe-character");
  await interactionCharacter.evaluate((button) => { button.click(); button.click(); });
  await expect(interactionCharacter).toHaveAttribute("data-motion", "bubble");
  await expect(interactionCharacter).toHaveAttribute("data-motion", "rest", { timeout: 4000 });
  await interactionCharacter.click();
  await expect(interactionCharacter).toHaveAttribute("data-motion", "starlight");
  await expect(interactionCharacter).toHaveAttribute("data-motion", "rest", { timeout: 4000 });
  await interactionCharacter.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const init = { bubbles: true, isPrimary: true, pointerId: 8, clientX: rect.x + rect.width * .4, clientY: rect.y + rect.height * .5 };
    button.dispatchEvent(new PointerEvent("pointerdown", init));
    button.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: init.clientX + 48 }));
    button.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: init.clientX + 48 }));
  });
  await interactionCharacter.focus();
  await interactionPage.keyboard.press("Enter");
  await expect(interactionCharacter).toHaveAttribute("data-motion", "blossom");
  await expect(interactionCharacter).toHaveAttribute("data-motion", "rest", { timeout: 4000 });
  await interactionCharacter.evaluate((button) => button.blur());
  await interactionPage.locator(".mascot-wardrobe-motion-hint").evaluate((hint) => { hint.style.visibility = "hidden"; });
  const beforePreferenceChange = await interactionCharacter.screenshot();
  await interactionCharacter.click();
  await expect(interactionCharacter).toHaveAttribute("data-motion", "snowfall");
  await interactionPage.waitForTimeout(250);
  await interactionPage.emulateMedia({ reducedMotion: "reduce" });
  await expect(interactionCharacter).toHaveAttribute("data-motion", "rest");
  await expect(interactionCharacter).toBeDisabled();
  const afterPreferenceChange = await interactionCharacter.screenshot();
  await writeFile(`${output}/reduce-before-390x844.png`, beforePreferenceChange);
  await writeFile(`${output}/reduce-after-390x844.png`, afterPreferenceChange);
  assert.match(await interactionCharacter.evaluate((button) => button.style.transform), /^translate3d\(0(?:px)?, 0(?:px)?, 0(?:px)?\)$/, "reduced motion must restore the neutral cat transform");
  assert.equal(await interactionPage.locator(".mascot-wardrobe-preview").evaluate((stage) => stage.style.getPropertyValue("--wardrobe-effect-opacity")), "0", "reduced motion must hide the animated prop");
  await interaction.close();

  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", locale: "zh-CN" });
  const reducedPage = await openWardrobe(reduced);
  const reducedCharacter = reducedPage.locator(".mascot-wardrobe-character");
  const reducedBefore = await reducedPage.locator(".mascot-wardrobe-preview").screenshot();
  await expect(reducedCharacter).toBeDisabled();
  await reducedCharacter.evaluate((button) => button.click());
  await expect(reducedCharacter).toHaveAttribute("data-motion", "rest");
  assert.equal(reducedBefore.equals(await reducedPage.locator(".mascot-wardrobe-preview").screenshot()), true, "reduced motion must retain the still image");
  await reduced.close();

  report.passed = report.errors.length === 0;
  assert.equal(report.passed, true, report.errors.join("\n"));
} catch (error) {
  report.errors.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
if (!report.passed) throw new Error(report.errors.join("\n"));
console.log(`Wardrobe mascot motion passed: ${report.sizes.length} phone sizes × ${actions.length} one-shot actions, exact still recovery, reduced motion.`);
