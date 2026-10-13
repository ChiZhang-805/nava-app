import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/app-skins";
await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), passed: false, results: [], errors: [] };
const server = await createServer({ server: { host: "127.0.0.1", port: 5248, strictPort: true }, logLevel: "silent" });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
const sizes = [[360, 740], [375, 812], [390, 844], [430, 932]];
const skins = ["glacier-mist", "violet-dusk", "sky-ripple"];
const recordModules = ["sleep", "exercise", "mood", "focus", "diet", "face"];
const profileLayerSamples = [];
const advancedProfileLayerSamples = [];

async function initialize(context) {
  await context.route("**/*.supabase.co/rest/v1/journal_entries**", (route) => route.fulfill({ json: [] }));
  await context.route("**/*.supabase.co/rest/v1/journal_preferences**", (route) => route.fulfill({ json: { settings: { "fluffy-first-guide-sleep": true, "fluffy-first-guide-sport": true, "fluffy-first-guide-mood": true, "fluffy-first-guide-focus": true, "fluffy-first-guide-food": true, "fluffy-first-guide-face": true } } }));
  await context.addInitScript(() => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {} }));
  });
}

async function verifyAdvancedProfileWheels(page, advancedProfile, width, height, skin) {
  const wheels = advancedProfile.locator(".advanced-profile-wheel");
  for (let index = 0; index < await wheels.count(); index += 1) {
    const wheel = wheels.nth(index);
    const trigger = wheel.locator(":scope > button");
    await trigger.scrollIntoViewIfNeeded();
    const arrowGeometry = await trigger.evaluate((button) => {
      const arrow = button.querySelector("svg");
      const buttonBounds = button.getBoundingClientRect();
      const arrowBounds = arrow?.getBoundingClientRect();
      return {
        exists: Boolean(arrow),
        rightInset: arrowBounds ? buttonBounds.right - arrowBounds.right : -1,
        aligned: arrowBounds ? Math.abs((buttonBounds.top + buttonBounds.height / 2) - (arrowBounds.top + arrowBounds.height / 2)) : -1,
      };
    });
    assert.equal(arrowGeometry.exists, true, `${width}x${height} ${skin} wheel ${index} needs a visible chevron`);
    assert.ok(arrowGeometry.rightInset >= 10 && arrowGeometry.rightInset <= 20, `${width}x${height} ${skin} wheel ${index} chevron needs right breathing room`);
    assert.ok(arrowGeometry.aligned <= 1, `${width}x${height} ${skin} wheel ${index} chevron must be vertically centred`);

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = wheel.locator(".advanced-profile-wheel-list");
    await expect(menu).toBeVisible();
    await page.waitForTimeout(80);
    const openGeometry = await wheel.evaluate((root) => {
      const menu = root.querySelector(".advanced-profile-wheel-list");
      const section = root.closest(".advanced-profile-section");
      const menuBounds = menu.getBoundingClientRect();
      const x = Math.min(window.innerWidth - 1, Math.max(0, menuBounds.left + menuBounds.width / 2));
      const ys = [menuBounds.top + 8, menuBounds.top + menuBounds.height / 2, menuBounds.bottom - 8]
        .filter((y) => y >= 0 && y < window.innerHeight);
      const unobscured = ys.every((y) => menu.contains(document.elementFromPoint(x, y)));
      const sectionZ = Number.parseInt(getComputedStyle(section).zIndex || "0", 10);
      const siblingZ = [...section.parentElement.children]
        .filter((element) => element !== section && element.matches(".advanced-profile-section"))
        .map((element) => Number.parseInt(getComputedStyle(element).zIndex || "0", 10))
        .reduce((max, value) => Math.max(max, Number.isNaN(value) ? 0 : value), 0);
      return {
        top: menuBounds.top,
        bottom: menuBounds.bottom,
        viewportHeight: window.innerHeight,
        unobscured,
        sectionZ,
        siblingZ,
        opensUpward: root.classList.contains("opens-upward"),
        arrowRotated: getComputedStyle(root.querySelector(":scope > button svg")).transform !== "none",
      };
    });
    assert.ok(openGeometry.top >= 0 && openGeometry.bottom <= openGeometry.viewportHeight + 1, `${width}x${height} ${skin} wheel ${index} menu must stay inside the viewport`);
    assert.equal(openGeometry.unobscured, true, `${width}x${height} ${skin} wheel ${index} menu is covered by another card`);
    assert.ok(openGeometry.sectionZ > openGeometry.siblingZ, `${width}x${height} ${skin} wheel ${index} open card must rise above sibling cards`);
    assert.equal(openGeometry.arrowRotated, true, `${width}x${height} ${skin} wheel ${index} chevron must show the open state`);

    const options = menu.locator('[role="option"]');
    assert.ok(await options.count() >= 4, `${width}x${height} ${skin} wheel ${index} must expose its complete option set`);
    await options.last().evaluate((option) => option.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(80);
    const lastOptionVisible = await options.last().evaluate((option) => {
      const menu = option.closest(".advanced-profile-wheel-list");
      const optionBounds = option.getBoundingClientRect();
      const menuBounds = menu.getBoundingClientRect();
      const x = optionBounds.left + optionBounds.width / 2;
      const y = optionBounds.top + optionBounds.height / 2;
      return optionBounds.top >= menuBounds.top && optionBounds.bottom <= menuBounds.bottom
        && menu.contains(document.elementFromPoint(x, y));
    });
    assert.equal(lastOptionVisible, true, `${width}x${height} ${skin} wheel ${index} final option must be reachable and unobscured`);
    const lastOptionText = (await options.last().textContent())?.trim();
    await options.last().click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger.locator("span")).toHaveText(lastOptionText);
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveCount(0);
  }
}

try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: "reduce", locale: "zh-CN" });
    await initialize(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(`${width}x${height}: ${error.message}`));
    await page.goto(`${base}?demo=1#tab=profile`, { waitUntil: "networkidle" });
    if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
    await expect(page.locator('.profile-overview[data-profile-view="overview"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".profile-quarter-card")).toBeVisible();
    await expect(page.locator(".profile-nav-row")).toHaveCount(8);
    if (await page.locator(".completion-celebration-layer").count()) await page.keyboard.press("Escape");
    await page.locator('.profile-nav-row[data-profile-target="skin"]').click();
    await expect(page.locator(".profile-skin-card")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".app-skin-option")).toHaveCount(3);
    for (const skin of skins) {
      if (await page.locator(".completion-celebration-layer").count()) await page.keyboard.press("Escape");
      await page.locator(`.profile-skin-card .app-skin-option--${skin}`).click({ force: true });
      await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", skin);
      await expect(page.locator(`.profile-skin-card .app-skin-option--${skin}`)).toHaveAttribute("aria-checked", "true");
      await expect(page.locator(".profile-skin-card .app-skin-palette b")).toHaveCount(9);
      const skinRoutePaint = await page.evaluate(() => {
        const paint = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const style = getComputedStyle(element);
          return `${style.backgroundColor}|${style.backgroundImage}|${style.borderColor}`;
        };
        return {
          header: paint(".figma-app-header"),
          shell: paint(".profile-skin-card"),
          choices: [...document.querySelectorAll(".profile-skin-card .app-skin-option")].map((element) => {
            const style = getComputedStyle(element);
            return `${style.backgroundColor}|${style.backgroundImage}|${style.borderColor}`;
          }),
          palette: [...document.querySelectorAll(".profile-skin-card .app-skin-palette b")].map((element) => getComputedStyle(element).backgroundColor),
        };
      });
      assert.ok(skinRoutePaint.header && skinRoutePaint.shell, `${width} ${skin} should theme the skin route chrome`);
      assert.equal(new Set(skinRoutePaint.choices).size, 3, `${width} ${skin} should show three independently coloured option cards`);
      assert.ok(new Set(skinRoutePaint.palette).size >= 7, `${width} ${skin} should expose the three palettes instead of repeated placeholders`);
      const geometry = await page.locator(".phone-frame").evaluate((frame) => ({
        horizontalOverflow: frame.scrollWidth - frame.clientWidth,
        skin: frame.getAttribute("data-app-skin"),
        navVisible: Boolean(frame.querySelector(".bottom-nav")),
      }));
      assert.ok(geometry.horizontalOverflow <= 1, `${width} ${skin} horizontal overflow ${geometry.horizontalOverflow}`);
      assert.equal(geometry.navVisible, false, `${width} ${skin} subpage navigation should be hidden`);
      report.results.push({ viewport: `${width}x${height}`, ...geometry, skinRoutePaint });
      if (width === 390) await page.screenshot({ path: `${output}/${skin}-profile-${width}x${height}.png` });

      await page.evaluate(() => { location.hash = "tab=today&view=profile-details"; });
      const advancedProfile = page.locator('[data-home-view="profile-details"]');
      await expect(advancedProfile).toBeVisible({ timeout: 20000 });
      await expect(advancedProfile.locator(".advanced-profile-section")).toHaveCount(4);
      await expect(advancedProfile.locator(".advanced-profile-wheel")).toHaveCount(4);
      await advancedProfile.locator(".advanced-profile-diet-chips button").nth(1).click();
      await advancedProfile.locator(".advanced-profile-wheel > button").first().click();
      await expect(advancedProfile.locator(".advanced-profile-wheel-list").first()).toBeVisible();
      const advancedLayers = await advancedProfile.evaluate((root) => {
        const paintElement = (element) => {
          if (!element) return null;
          const style = getComputedStyle(element);
          return `${style.backgroundColor}|${style.backgroundImage}|${style.borderColor}|${style.color}`;
        };
        const paint = (selector) => paintElement(root.querySelector(selector));
        const paints = (selector) => [...root.querySelectorAll(selector)].map(paintElement);
        return {
          page: paintElement(root),
          title: paint(".home-experience-header h1"),
          back: paint(".home-experience-back"),
          identity: paint(".advanced-profile-identity"),
          avatar: paint(".advanced-profile-avatar"),
          sections: paints(".advanced-profile-section"),
          iconWells: paints(".advanced-profile-section > header > span"),
          fields: [
            paint('.advanced-profile-section input:not([type="checkbox"])'),
            paint(".advanced-profile-wheel > button"),
            paint(".advanced-profile-section textarea"),
          ],
          wheelMenu: paint(".advanced-profile-wheel-list"),
          wheelSelected: paint('.advanced-profile-wheel-list [aria-selected="true"]'),
          chipDefault: paint(".advanced-profile-diet-chips button:not(.is-selected)"),
          chipSelected: paint(".advanced-profile-diet-chips button.is-selected"),
          switchRows: paints(".advanced-profile-switch"),
          switchControls: paints(".advanced-profile-switch-control"),
          save: paint(".advanced-profile-save"),
          overflow: root.scrollWidth - root.clientWidth,
        };
      });
      assert.ok(advancedLayers.overflow <= 1, `${width} ${skin} advanced profile horizontal overflow ${advancedLayers.overflow}`);
      assert.ok([advancedLayers.page, advancedLayers.title, advancedLayers.back, advancedLayers.identity, advancedLayers.avatar, advancedLayers.wheelMenu, advancedLayers.wheelSelected, advancedLayers.chipDefault, advancedLayers.chipSelected, advancedLayers.save].every(Boolean), `${width} ${skin} must paint every advanced-profile layer`);
      assert.equal(advancedLayers.sections.length, 4, `${width} ${skin} needs four themed advanced-profile sections`);
      assert.equal(advancedLayers.iconWells.length, 4, `${width} ${skin} needs four themed icon wells`);
      assert.ok(new Set(advancedLayers.sections).size >= 4, `${width} ${skin} must give every advanced-profile module its own skin colour block`);
      assert.equal(new Set(advancedLayers.fields).size, 1, `${width} ${skin} input, wheel and textarea fields must share one skin contract`);
      assert.notEqual(advancedLayers.fields[0], advancedLayers.wheelMenu, `${width} ${skin} dropdown must be an elevated skin surface rather than a repeated field`);
      assert.notEqual(advancedLayers.chipDefault, advancedLayers.chipSelected, `${width} ${skin} selected and unselected chips must remain visibly distinct`);
      advancedProfileLayerSamples.push({ viewport: `${width}x${height}`, skin, layers: advancedLayers });
      report.results.push({ viewport: `${width}x${height}`, skin, advancedProfileLayers: advancedLayers });
      if (width === 390) await page.screenshot({ path: `${output}/${skin}-advanced-profile-${width}x${height}.png`, fullPage: false });
      await page.keyboard.press("Escape");
      await verifyAdvancedProfileWheels(page, advancedProfile, width, height, skin);
      await advancedProfile.locator("[data-profile-details-avatar]").click();
      await expect(page.locator(".avatar-picker")).toBeVisible();
      const avatarPickerPaint = await page.locator(".avatar-picker").evaluate((picker) => {
        const paint = (element) => {
          const style = getComputedStyle(element);
          return `${style.backgroundColor}|${style.backgroundImage}|${style.borderColor}|${style.color}`;
        };
        return {
          sheet: paint(picker),
          close: paint(picker.querySelector("header button")),
          actions: [...picker.querySelectorAll(".avatar-sheet-actions > button")].map(paint),
        };
      });
      assert.equal(avatarPickerPaint.actions.length, 2, `${width} ${skin} avatar picker must theme both actions`);
      report.results.push({ viewport: `${width}x${height}`, skin, avatarPicker: avatarPickerPaint });
      if (width === 390) await page.screenshot({ path: `${output}/${skin}-advanced-profile-avatar-${width}x${height}.png`, fullPage: false });
      await page.locator(".avatar-picker > header button").click();
      await page.evaluate(() => { location.hash = "tab=profile&view=skin"; });
      await expect(page.locator(".profile-skin-card")).toBeVisible({ timeout: 20000 });

      if (width === 390) {
        await page.evaluate(() => { location.hash = "tab=profile"; });
        await expect(page.locator('.profile-overview[data-profile-view="overview"]')).toBeVisible({ timeout: 20000 });
        await expect(page.locator(".bottom-nav")).toBeVisible();
        const layers = await page.evaluate(() => {
          const paint = (selector, pseudo = null) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const style = getComputedStyle(element, pseudo);
            return `${style.backgroundColor}|${style.backgroundImage}|${style.borderColor}`;
          };
          return {
            header: paint(".figma-app-header"),
            account: paint(".profile-overview-account"),
            quarter: paint(".profile-quarter-card"),
            entries: paint(".profile-entry-card"),
            dock: paint(".bottom-nav"),
            orb: paint(".ai-nav-orb"),
          };
        });
        assert.ok(Object.values(layers).every(Boolean), `${skin} should expose every themed profile layer`);
        profileLayerSamples.push({ skin, layers });
        report.results.push({ viewport: `${width}x${height}`, skin, profileLayers: layers });
        await page.screenshot({ path: `${output}/${skin}-profile-overview-${width}x${height}.png` });
        await page.evaluate(() => { location.hash = "tab=profile&view=personal"; });
        await expect(page.locator('.profile-subpage[data-profile-view="personal"]')).toBeVisible({ timeout: 20000 });
        await expect(page.locator(".profile-choice-trigger")).toHaveCount(5);
        await expect(page.locator(".profile-bmi-summary")).toHaveCount(0);
        const mbtiChoice = page.locator(".profile-choice-field").filter({ hasText: "MBTI" });
        await mbtiChoice.locator(".profile-choice-trigger").click();
        await expect(mbtiChoice.locator(".profile-choice-menu")).toBeVisible();
        const choicePaint = await mbtiChoice.evaluate((field) => {
          const trigger = field.querySelector(".profile-choice-trigger");
          const menu = field.querySelector(".profile-choice-menu");
          const triggerStyle = getComputedStyle(trigger);
          const menuStyle = getComputedStyle(menu);
          return {
            trigger: `${triggerStyle.backgroundColor}|${triggerStyle.backgroundImage}|${triggerStyle.borderColor}`,
            menu: `${menuStyle.backgroundColor}|${menuStyle.backgroundImage}|${menuStyle.borderColor}`,
            widthDifference: Math.abs(trigger.getBoundingClientRect().width - menu.getBoundingClientRect().width),
          };
        });
        assert.ok(choicePaint.widthDifference <= 1, `${skin} personal choice menu must match its trigger width`);
        assert.notEqual(choicePaint.trigger, choicePaint.menu, `${skin} personal choice menu needs a readable elevated surface`);
        report.results.push({ viewport: `${width}x${height}`, skin, personalChoice: choicePaint });
        await page.screenshot({ path: `${output}/${skin}-personal-menu-${width}x${height}.png` });
        await page.keyboard.press("Escape");
        await page.evaluate(() => { location.hash = "tab=profile&view=skin"; });
        await expect(page.locator(".profile-skin-card")).toBeVisible({ timeout: 20000 });
        await page.evaluate(() => { location.hash = "tab=profile&view=health"; });
        await expect(page.locator('.profile-device-experience[data-profile-view="health"]')).toBeVisible({ timeout: 20000 });
        await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", skin);
        await expect(page.locator(".profile-device-orb")).toBeVisible();
        const deviceFlattening = await page.evaluate(() => {
          const transparent = (value) => value === "transparent" || value === "rgba(0, 0, 0, 0)";
          const isPaintless = (element) => {
            const style = getComputedStyle(element);
            return transparent(style.backgroundColor)
              && style.backgroundImage === "none"
              && style.boxShadow === "none"
              && [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].every((value) => parseFloat(value) === 0);
          };
          return {
            stage: isPaintless(document.querySelector(".profile-device-stage")),
            facts: isPaintless(document.querySelector(".profile-device-facts")),
            factRows: [...document.querySelectorAll(".profile-device-facts > div")].every(isPaintless),
          };
        });
        assert.ok(Object.values(deviceFlattening).every(Boolean), `${skin} device page must keep its stage and rows on one unsegmented surface`);
        await page.screenshot({ path: `${output}/${skin}-health-${width}x${height}.png` });
        await page.evaluate(() => { location.hash = "tab=profile&view=account"; });
        await expect(page.locator('.profile-subpage[data-profile-view="account"]')).toBeVisible({ timeout: 20000 });
        await expect(page.locator(".profile-security-entries > button")).toHaveCount(7);
        await expect(page.locator(".profile-account-security-card > .section-heading")).toHaveCount(0);
        await expect(page.locator(".profile-security-note")).toHaveCount(0);
        await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", skin);
        const accountFlattening = await page.evaluate(() => {
          const transparent = (value) => value === "transparent" || value === "rgba(0, 0, 0, 0)";
          const isPaintless = (element) => {
            const style = getComputedStyle(element);
            return transparent(style.backgroundColor)
              && style.backgroundImage === "none"
              && style.boxShadow === "none"
              && [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].every((value) => parseFloat(value) === 0);
          };
          return {
            group: isPaintless(document.querySelector(".profile-security-entries")),
            rows: [...document.querySelectorAll(".profile-security-entries > button")].every(isPaintless),
          };
        });
        assert.ok(Object.values(accountFlattening).every(Boolean), `${skin} account list must not restore nested cards, row backgrounds, or dividers`);
        if (width === 390) {
          await page.locator(".profile-security-entries > button").first().click();
          await expect(page.locator(".profile-security-sheet")).toBeVisible();
          const skinSheet = await page.evaluate(() => {
            const frame = document.querySelector(".phone-frame").getBoundingClientRect();
            const sheet = document.querySelector(".profile-security-sheet").getBoundingClientRect();
            const closeStyle = getComputedStyle(document.querySelector(".profile-security-sheet > header > button"));
            return {
              centerX: Math.abs((sheet.left + sheet.width / 2) - (frame.left + frame.width / 2)),
              centerY: Math.abs((sheet.top + sheet.height / 2) - (frame.top + frame.height / 2)),
              closeTransparent: ["transparent", "rgba(0, 0, 0, 0)"].includes(closeStyle.backgroundColor) && closeStyle.backgroundImage === "none",
            };
          });
          assert.ok(skinSheet.centerX <= 1 && skinSheet.centerY <= 2 && skinSheet.closeTransparent, `${skin} security sheet must stay centered with a backgroundless close action`);
          await page.screenshot({ path: `${output}/${skin}-account-password-${width}x${height}.png` });
          await page.locator(".profile-security-sheet > header > button").click();
        }
        await page.screenshot({ path: `${output}/${skin}-account-${width}x${height}.png` });
        await page.evaluate(() => { location.hash = "tab=profile&view=skin"; });
        await expect(page.locator(".profile-skin-card")).toBeVisible({ timeout: 20000 });
      }
    }
    await page.locator(".figma-app-header > .figma-header-action").first().click();
    await expect(page.locator('.profile-overview[data-profile-view="overview"]')).toBeVisible();
    await expect(page.locator(".bottom-nav")).toBeVisible();
    if (width === 390) await page.screenshot({ path: `${output}/sky-ripple-profile-overview-${width}x${height}.png` });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", "sky-ripple");
    await page.locator(".nava-more-trigger").first().click();
    await page.locator(".more-menu-skin").click();
    await expect(page.locator('.app-utility-popover [role="radiogroup"]')).toBeVisible();
    await page.locator(".app-utility-popover .app-skin-option--violet-dusk").click();
    await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", "violet-dusk");
    const journalModules = width === 390 ? recordModules : ["sleep"];
    for (const module of journalModules) {
      await page.evaluate((nextModule) => { location.hash = `tab=record&module=${nextModule}&view=editor`; }, module);
      await expect(page.locator(".journal-experience iframe")).toBeVisible({ timeout: 20000 });
      await expect(page.locator(".journal-loading")).toHaveCount(0, { timeout: 30000 });
      const journal = page.frameLocator(".journal-experience iframe");
      const expectedCategory = module === "exercise" ? "sport" : module === "diet" ? "food" : module;
      await expect(journal.locator("html")).toHaveAttribute("data-app-skin", "violet-dusk", { timeout: 20000 });
      await expect(journal.locator("html")).toHaveAttribute("data-record-module", expectedCategory, { timeout: 20000 });
      if (width === 390) await page.screenshot({ path: `${output}/violet-dusk-${module}-${width}x${height}.png` });
    }
    await page.evaluate(() => { location.hash = "tab=record"; });
    await expect(page.locator('.record-hub')).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", "violet-dusk");
    if (width === 390) await page.screenshot({ path: `${output}/violet-dusk-records-${width}x${height}.png` });
    await page.evaluate(() => { location.hash = "tab=today"; });
    await expect(page.locator(".option-two-home")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", "violet-dusk");
    if (width === 390) await page.screenshot({ path: `${output}/violet-dusk-home-${width}x${height}.png` });
    if (width === 390) {
      await page.evaluate(() => { location.hash = "tab=profile"; });
      await expect(page.locator('.profile-overview[data-profile-view="overview"]')).toBeVisible({ timeout: 20000 });
      if (await page.locator(".completion-celebration-layer").count()) await page.keyboard.press("Escape");
      await page.locator('.profile-nav-row[data-profile-target="skin"]').click();
      await expect(page.locator(".profile-skin-card")).toBeVisible({ timeout: 20000 });
      await page.locator(".profile-skin-card .app-skin-option--sky-ripple").click({ force: true });
      for (const module of recordModules) {
        await page.evaluate((nextModule) => { location.hash = `tab=record&module=${nextModule}&view=editor`; }, module);
        await expect(page.locator(".journal-experience iframe")).toBeVisible({ timeout: 20000 });
        await expect(page.locator(".journal-loading")).toHaveCount(0, { timeout: 30000 });
        const journal = page.frameLocator(".journal-experience iframe");
        const expectedCategory = module === "exercise" ? "sport" : module === "diet" ? "food" : module;
        await expect(journal.locator("html")).toHaveAttribute("data-app-skin", "sky-ripple", { timeout: 20000 });
        await expect(journal.locator("html")).toHaveAttribute("data-record-module", expectedCategory, { timeout: 20000 });
        await page.screenshot({ path: `${output}/sky-ripple-${module}-${width}x${height}.png` });
      }
    }
    await context.close();
  }
  const uniqueLayerPaints = new Set(profileLayerSamples.map(({ layers }) => Object.values(layers).join(";")));
  assert.equal(uniqueLayerPaints.size, skins.length, "each skin should produce a distinct full-profile palette");
  const detailedAtReferenceSize = advancedProfileLayerSamples.filter(({ viewport }) => viewport === "390x844");
  assert.equal(detailedAtReferenceSize.length, skins.length, "the advanced profile should be sampled once per skin at the reference size");
  assert.equal(new Set(detailedAtReferenceSize.map(({ layers }) => JSON.stringify(layers))).size, skins.length, "every advanced-profile layer must change as one distinct three-skin palette");
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log("Three skins, both switchers, persistence, shared routes and four portrait sizes passed.");
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
