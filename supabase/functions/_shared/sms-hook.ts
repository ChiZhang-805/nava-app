import { normalizeOtpCode, normalizePhone } from "./phone-otp.ts";

export type SendSmsHookEvent = {
  sms?: { otp?: unknown };
  user?: { phone?: unknown };
};

export function normalizeSupabaseChinaPhone(value: unknown) {
  const raw = typeof value === "string" ? value.trim().replace(/[\s-]/g, "") : "";
  if (raw.startsWith("+86")) return normalizePhone(raw.slice(3));
  if (raw.startsWith("0086")) return normalizePhone(raw.slice(4));
  // GoTrue normally exposes E.164 (`+86...`), but some phone-auth payloads
  // arrive without the plus sign after upstream normalization.
  if (/^861[3-9]\d{9}$/.test(raw)) return normalizePhone(raw.slice(2));
  return normalizePhone(raw);
}

export function parseSendSmsHookEvent(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("SMS_HOOK_PAYLOAD_INVALID");
  const event = value as SendSmsHookEvent;
  return {
    code: normalizeOtpCode(event.sms?.otp),
    phone: normalizeSupabaseChinaPhone(event.user?.phone),
  };
}
