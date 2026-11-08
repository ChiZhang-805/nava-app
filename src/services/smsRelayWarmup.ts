import { appConfig } from "../config";

const WARMUP_TIMEOUT_MS = 12_000;
const RECENT_WARMUP_MS = 15_000;

let inFlightWarmup: Promise<boolean> | null = null;
let lastWarmupAt = 0;

export function isSmsRelayWarmupConfigured() {
  return Boolean(appConfig.smsRelayWarmupUrl);
}

export function warmSmsRelay({ force = false }: { force?: boolean } = {}) {
  const endpoint = appConfig.smsRelayWarmupUrl;
  if (!endpoint) return Promise.resolve(true);
  if (!force && Date.now() - lastWarmupAt < RECENT_WARMUP_MS) return Promise.resolve(true);
  if (inFlightWarmup) return inFlightWarmup;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);
  inFlightWarmup = fetch(endpoint, {
    method: "GET",
    mode: "no-cors",
    cache: "no-store",
    credentials: "omit",
    signal: controller.signal,
  })
    .then(() => {
      lastWarmupAt = Date.now();
      return true;
    })
    .catch(() => false)
    .finally(() => {
      window.clearTimeout(timeout);
      inFlightWarmup = null;
    });

  return inFlightWarmup;
}
