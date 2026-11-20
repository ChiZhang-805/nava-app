import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

/** Use the public calendar's month and day buttons, never inject a report date. */
export async function openCalendarHistoryDay(page, base, date) {
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  await page.goto(`${base}#tab=today&view=calendar`, { waitUntil: 'domcontentloaded' });
  const targetMonth = date.slice(0, 7);
  for (let step = 0; step < 36; step++) {
    const first = page.locator('.home-calendar-grid button[data-date]').first();
    await expect(first).toBeVisible();
    const displayed = (await first.getAttribute('data-date')).slice(0, 7);
    if (displayed === targetMonth) break;
    await page.getByRole('button', { name: displayed > targetMonth ? /^(上个月|Previous month)$/ : /^(下个月|Next month)$/ }).click();
    await expect(first).not.toHaveAttribute('data-date', new RegExp(`^${displayed}`));
  }
  const day = page.locator(`.home-calendar-grid button[data-date="${date}"]`);
  await expect(day).toBeVisible();
  const recordedCount = Number(await day.getAttribute('data-record-count'));
  await day.click();
  const report = page.locator('.home-daily-report');
  await expect(report).toHaveAttribute('data-report-date', date);
  await expect(report.locator('.home-report-metric')).toHaveCount(6);
  await expect(report.locator('[role="alert"]')).toHaveCount(0);
  return { date, recordedCount, actualCalendarNavigation: true, providerAiVerified: false };
}

/** The simplified chart hub describes the device's current seven-day window. */
export async function expectCurrentHealthWindow(page) {
  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  await expect(page.locator('.health-explorer-all, .health-explorer-sheet, .health-explorer-toolbar input[type="date"]')).toHaveCount(0);
  await page.locator('[data-health-category="mood"]').click();
  const active = page.locator('.health-explorer-card[data-active="true"]');
  await active.locator('.health-explorer-flip').click();
  await expect(active).toHaveAttribute('data-side', 'back');
  await expect(active.locator('.health-explorer-range')).toContainText(today);
  await active.locator('.health-explorer-flip').click();
  await expect(active).toHaveAttribute('data-side', 'front');
  return { endingDate: today, period: 'current-seven-days' };
}
