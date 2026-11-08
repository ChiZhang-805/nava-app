import { errorResponse, jsonResponse, optionsResponse, readJson } from "../_shared/http.ts";
import {
  createOtpAdminClient,
  generateOtpCode,
  ipHash,
  normalizeOtpPurpose,
  normalizePhone,
  otpDigest,
  otpHmacSecret,
  phoneHash,
  requestIp,
  sendAliyunOtp,
} from "../_shared/phone-otp.ts";
import {
  accountEligibilityError,
  inspectAccountRegistration,
  normalizeAuthAccount,
} from "../_shared/auth-account.ts";

function issueError(error: { message?: string }) {
  const message = error.message ?? "";
  if (message.includes("OTP_COOLDOWN")) return jsonResponse({ error: "请等待 60 秒后再获取验证码。", code: "OTP_COOLDOWN" }, { status: 429 });
  if (message.includes("OTP_PHONE_RATE_LIMIT")) return jsonResponse({ error: "该手机号请求过于频繁，请稍后再试。", code: "OTP_PHONE_RATE_LIMIT" }, { status: 429 });
  if (message.includes("OTP_IP_RATE_LIMIT")) return jsonResponse({ error: "当前网络请求过于频繁，请稍后再试。", code: "OTP_IP_RATE_LIMIT" }, { status: 429 });
  console.error("Phone OTP issuance failed", error);
  return jsonResponse({ error: "验证码服务暂时不可用，请稍后再试。", code: "OTP_SERVICE_ERROR" }, { status: 500 });
}

function requestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("AUTH_ACCOUNT_RATE_LIMIT")) {
    return jsonResponse({ error: "该手机号查询过于频繁，请稍后再试。", code: "OTP_ACCOUNT_RATE_LIMIT" }, { status: 429 });
  }
  if (message.includes("AUTH_IP_RATE_LIMIT")) {
    return jsonResponse({ error: "当前网络请求过于频繁，请稍后再试。", code: "OTP_IP_RATE_LIMIT" }, { status: 429 });
  }
  const publicMessages = new Set([
    "请求体必须是合法 JSON。",
    "请输入有效中国大陆手机号。",
    "验证码用途无效。",
  ]);
  if (publicMessages.has(message)) return jsonResponse({ error: message, code: "INVALID_REQUEST" }, { status: 400 });
  console.error("Phone OTP send failed", error);
  return jsonResponse({ error: "验证码服务暂时不可用，请稍后再试。", code: "OTP_SERVICE_ERROR" }, { status: 500 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  let challengeId: string | null = null;
  let admin: Awaited<ReturnType<typeof createOtpAdminClient>> | null = null;

  try {
    admin = await createOtpAdminClient();
    const body = await readJson(req);
    const phone = normalizePhone(body.phone);
    const purpose = normalizeOtpPurpose(body.purpose);
    const account = normalizeAuthAccount(phone);
    const registered = await inspectAccountRegistration(admin, req, account);
    const eligibilityError = accountEligibilityError(purpose, registered);
    if (eligibilityError) {
      console.info("OTP request suppressed by account eligibility policy", { purpose, code: eligibilityError.code });
      return jsonResponse({ sent: true, expiresInSeconds: 600, cooldownSeconds: 60 });
    }
    const code = generateOtpCode();
    const secret = otpHmacSecret();
    const [recipientHash, requestIpHash, codeDigest] = await Promise.all([
      phoneHash(secret, phone),
      ipHash(secret, requestIp(req)),
      otpDigest(secret, phone, purpose, code),
    ]);

    const issued = await admin.rpc("nava_issue_phone_otp", {
      p_phone_hash: recipientHash,
      p_purpose: purpose,
      p_code_digest: codeDigest,
      p_ip_hash: requestIpHash,
      p_ttl_seconds: 600,
    });
    if (issued.error) return issueError(issued.error);
    challengeId = String(issued.data);

    let provider;
    try {
      provider = await sendAliyunOtp(phone, code);
    } catch (providerError) {
      const providerMessage = providerError instanceof Error ? providerError.message.slice(0, 500) : "SMS provider failed";
      const definitiveFailure = providerMessage.startsWith("ALIYUN_") && !providerMessage.startsWith("ALIYUN_INVALID_RESPONSE");
      await admin
        .from("nava_phone_otp_challenges")
        .update({ send_status: definitiveFailure ? "failed" : "pending", provider_error: providerMessage })
        .eq("id", challengeId);
      return jsonResponse({ error: "短信暂时发送失败，请稍后重试。", code: "SMS_PROVIDER_ERROR" }, { status: 502 });
    }

    const update = await admin
      .from("nava_phone_otp_challenges")
      .update({
        send_status: "sent",
        provider_request_id: provider.RequestId ?? null,
        provider_biz_id: provider.BizId ?? null,
        provider_error: null,
      })
      .eq("id", challengeId);
    if (update.error) throw update.error;

    return jsonResponse({ sent: true, expiresInSeconds: 600, cooldownSeconds: 60 });
  } catch (error) {
    return requestError(error);
  }
});
