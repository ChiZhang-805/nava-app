import { Webhook } from "npm:standardwebhooks@^1";
import { sendAliyunOtp } from "../_shared/phone-otp.ts";
import { parseSendSmsHookEvent } from "../_shared/sms-hook.ts";

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

function signingSecret() {
  const configured = requiredEnv("SEND_SMS_HOOK_SECRET");
  const secret = configured.replace(/^v1,whsec_/, "").replace(/^whsec_/, "");
  if (!secret) throw new Error("SEND_SMS_HOOK_SECRET_INVALID");
  return secret;
}

function hookError(status: number, message: string) {
  return Response.json(
    { error: { http_code: status, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return hookError(405, "POST required.");

  const rawPayload = await request.text();
  let event: unknown;
  try {
    event = new Webhook(signingSecret()).verify(rawPayload, Object.fromEntries(request.headers));
  } catch (error) {
    console.error("Send SMS hook signature rejected", error instanceof Error ? error.name : "unknown");
    return hookError(401, "Invalid webhook signature.");
  }

  try {
    const { phone, code } = parseSendSmsHookEvent(event);
    // Fail closed while the mainland Alibaba Cloud relay is unavailable. This
    // prevents Auth from reporting that an OTP was sent when delivery failed.
    await sendAliyunOtp(phone, code, 2_800);
    return Response.json({}, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const providerCode = error instanceof Error ? error.message.split(":", 1)[0] : "SMS_HOOK_FAILED";
    console.error("Send SMS hook delivery failed", providerCode);
    return hookError(502, "短信发送失败，请稍后重试。");
  }
});
