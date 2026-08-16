import { errorResponse, jsonResponse, optionsResponse, readJson } from "../_shared/http.ts";
import {
  accountEligibilityError,
  inspectAccountRegistration,
  normalizeAuthAccount,
  normalizeAuthAccountPurpose,
} from "../_shared/auth-account.ts";
import { createOtpAdminClient } from "../_shared/phone-otp.ts";

function requestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("AUTH_ACCOUNT_RATE_LIMIT")) {
    return jsonResponse({ error: "该账号查询过于频繁，请稍后再试。", code: "OTP_ACCOUNT_RATE_LIMIT" }, { status: 429 });
  }
  if (message.includes("AUTH_IP_RATE_LIMIT")) {
    return jsonResponse({ error: "当前网络请求过于频繁，请稍后再试。", code: "OTP_IP_RATE_LIMIT" }, { status: 429 });
  }
  const publicMessages = new Set([
    "请求体必须是合法 JSON。",
    "请输入有效邮箱或中国大陆手机号。",
    "验证码用途无效。",
  ]);
  if (publicMessages.has(message)) return jsonResponse({ error: message, code: "INVALID_REQUEST" }, { status: 400 });
  console.error("Auth account status failed", error);
  return jsonResponse({ error: "账号服务暂时不可用，请稍后再试。", code: "OTP_SERVICE_ERROR" }, { status: 500 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const body = await readJson(req);
    const account = normalizeAuthAccount(body.account);
    const purpose = normalizeAuthAccountPurpose(body.purpose);
    const registered = await inspectAccountRegistration(createOtpAdminClient(), req, account);
    const eligibilityError = accountEligibilityError(purpose, registered);
    if (eligibilityError) {
      return jsonResponse(
        { error: eligibilityError.message, code: eligibilityError.code },
        { status: eligibilityError.status },
      );
    }
    return jsonResponse({ allowed: true, channel: account.channel });
  } catch (error) {
    return requestError(error);
  }
});
