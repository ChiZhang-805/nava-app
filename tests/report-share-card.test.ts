import assert from "node:assert/strict";
import test from "node:test";
import { currentReportDateRange } from "../src/services/reportShareCard.ts";

test("share-card range follows the device-local day", () => {
  const range = currentReportDateRange(new Date(2026, 7, 29, 23, 59, 0));
  assert.deepEqual(range, { startDate: "2026-08-23", endDate: "2026-08-29" });
});

test("share-card range advances after local midnight", () => {
  const range = currentReportDateRange(new Date(2026, 7, 30, 0, 1, 0));
  assert.deepEqual(range, { startDate: "2026-08-24", endDate: "2026-08-30" });
});
