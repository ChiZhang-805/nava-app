import { errorResponse, jsonResponse, optionsResponse, readJson } from "../_shared/http.ts";
import {
  createOtpAdminClient,
  normalizeOtpCode,
  normalizeOtpPurpose,
  normalizePhone,
  otpDigest,
  otpHmacSecret,
  phoneHash,
  phoneToAuthEmail,
} from "../_shared/phone-otp.ts";

function verificationError(status: unknown) {
  if (status === "expired") return jsonResponse({ error: "验证码已过期，请重新获取。", code: "OTP_EXPIRED" }, { status: 400 });
  if (status === "locked") return jsonResponse({ error: "验证码错误次数过多，请重新获取。", code: "OTP_LOCKED" }, { status: 429 });
  if (status === "invalid") return jsonResponse({ error: "验证码不正确。", code: "OTP_INVALID" }, { status: 400 });
  return jsonResponse({ error: "验证码无效，请重新获取。", code: "OTP_NOT_FOUND" }, { status: 400 });
}

function requestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const publicMessages = new Set([
    "请求体必须是合法 JSON。",
    "请输入有效中国大陆手机号。",
    "验证码用途无效。",
    "请输入 6 位短信验证码。",
    "密码长度需要在 6 到 128 位之间。",
  ]);
  if (publicMessages.has(message)) return jsonResponse({ error: message, code: "INVALID_REQUEST" }, { status: 400 });
  console.error("Phone OTP verification failed", error);
  return jsonResponse({ error: "验证码服务暂时不可用，请稍后再试。", code: "OTP_SERVICE_ERROR" }, { status: 500 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const body = await readJson(req);
    const phone = normalizePhone(body.phone);
    const purpose = normalizeOtpPurpose(body.purpose ?? body.mode);
    const code = normalizeOtpCode(body.code);
    const password = typeof body.password === "string" ? body.password : "";
    if (purpose === "register" && (password.length < 6 || password.length > 128)) {
      throw new Error("密码长度需要在 6 到 128 位之间。");
    }

    const secret = otpHmacSecret();
    const [recipientHash, codeDigest] = await Promise.all([
      phoneHash(secret, phone),
      otpDigest(secret, phone, purpose, code),
    ]);
    const admin = createOtpAdminClient();
    const consumed = await admin.rpc("nava_consume_phone_otp", {
      p_phone_hash: recipientHash,
      p_purpose: purpose,
      p_code_digest: codeDigest,
    });
    if (consumed.error) throw consumed.error;
    if (consumed.data !== "ok") return verificationError(consumed.data);

    const email = phoneToAuthEmail(phone);
    const link = purpose === "register"
      ? await admin.auth.admin.generateLink({
          type: "signup",
          email,
          password,
          options: { data: { phone, account_channel: "phone" } },
        })
      : await admin.auth.admin.generateLink({ type: "recovery", email });

    if (link.error) {
      const message = link.error.message.toLowerCase();
      if (purpose === "register" && (message.includes("already") || message.includes("registered"))) {
        return jsonResponse({ error: "该手机号已注册，请直接登录或重置密码。", code: "ACCOUNT_EXISTS" }, { status: 409 });
      }
      if (purpose !== "register" && (message.includes("not found") || message.includes("unable to find"))) {
        return jsonResponse({ error: "未找到该手机号对应的账号。", code: "ACCOUNT_NOT_FOUND" }, { status: 404 });
      }
      throw link.error;
    }

    return jsonResponse({
      token_hash: link.data.properties.hashed_token,
      verification_type: link.data.properties.verification_type,
      email,
    });
  } catch (error) {
    return requestError(error);
  }
});
