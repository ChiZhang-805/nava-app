// @deno-types="npm:@types/nodemailer@7.0.11"
import nodemailer from "npm:nodemailer@10.0.16";
import { accountHash, generateOtpCode, ipHash, otpHmacSecret, requestIp, sendAliyunOtp } from "../_shared/phone-otp.ts";
import { jsonResponse, optionsResponse, readJson, requireUser } from "../_shared/http.ts";

type ContactKind = "email" | "phone";

function normalizeKind(value: unknown): ContactKind {
  if (value === "email" || value === "phone") return value;
  throw new Error("联系方式类型无效。");
}

function normalizeContact(kind: ContactKind, value: unknown) {
  const contact = typeof value === "string" ? value.trim() : "";
  if (kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) throw new Error("请输入有效的备用邮箱。");
  if (kind === "phone" && !/^1[3-9]\d{9}$/.test(contact)) throw new Error("请输入有效的中国大陆备用手机号。");
  return kind === "email" ? contact.toLowerCase() : contact;
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

async function sendEmailOtp(email: string, code: string) {
  const port = Number(Deno.env.get("NAVA_SMTP_PORT")?.trim() || "587");
  const transporter = nodemailer.createTransport({
    host: requiredEnv("NAVA_SMTP_HOST"),
    port,
    secure: port === 465,
    auth: { user: requiredEnv("NAVA_SMTP_USER"), pass: requiredEnv("NAVA_SMTP_PASSWORD") },
  });
  const info = await transporter.sendMail({
    from: `"${Deno.env.get("NAVA_SMTP_SENDER_NAME")?.trim() || "NAVA"}" <${requiredEnv("NAVA_SMTP_FROM_EMAIL")}>`,
    to: email,
    subject: "NAVA 安全联系人验证码",
    text: `你的 NAVA 安全联系人验证码是 ${code}。验证码 10 分钟内有效，请勿转发。`,
    html: `<p>你的 NAVA 安全联系人验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>验证码 10 分钟内有效，请勿转发。</p>`,
  });
  return typeof info.messageId === "string" ? info.messageId.slice(0, 180) : null;
}

function generateNumericCode(length: 6 | 8) {
  const range = 10 ** length;
  const maximum = Math.floor(0x1_0000_0000 / range) * range;
  const random = new Uint32Array(1);
  do crypto.getRandomValues(random); while (random[0] >= maximum);
  return String(random[0] % range).padStart(length, "0");
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("OTP_COOLDOWN")) return jsonResponse({ error: "请等待 60 秒后再获取验证码。", code: "OTP_COOLDOWN" }, { status: 429 });
  if (message.includes("OTP_RATE_LIMIT")) return jsonResponse({ error: "验证码请求过于频繁，请稍后再试。", code: "OTP_RATE_LIMIT" }, { status: 429 });
  const allowed = new Set(["联系方式类型无效。", "请输入有效的备用邮箱。", "请输入有效的中国大陆备用手机号。", "请输入正确的验证码。"]);
  if (allowed.has(message)) return jsonResponse({ error: message, code: "INVALID_REQUEST" }, { status: 400 });
  if (/登录状态|登录凭证/.test(message)) return jsonResponse({ error: message, code: "AUTH_REQUIRED" }, { status: 401 });
  console.error("Security contact OTP failed", { message: message.replace(/[\w.+-]+@[\w.-]+|1[3-9]\d{9}|\b\d{6,8}\b/g, "[redacted]") });
  return jsonResponse({ error: "验证码服务暂时不可用，请稍后再试。", code: "OTP_SERVICE_ERROR" }, { status: 500 });
}

function verificationError(status: unknown) {
  if (status === "expired") return jsonResponse({ error: "验证码已过期，请重新获取。", code: "OTP_EXPIRED" }, { status: 400 });
  if (status === "locked") return jsonResponse({ error: "验证码错误次数过多，请重新获取。", code: "OTP_LOCKED" }, { status: 429 });
  if (status === "invalid") return jsonResponse({ error: "验证码不正确。", code: "OTP_INVALID" }, { status: 400 });
  return jsonResponse({ error: "请先获取验证码。", code: "OTP_NOT_FOUND" }, { status: 400 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "仅支持 POST。" }, { status: 405 });
  try {
    const { user, adminClient } = await requireUser(req);
    if (!adminClient) throw new Error("验证码服务暂时不可用。");
    const body = await readJson(req);
    const action = body.action === "send" || body.action === "verify" ? body.action : null;
    if (!action) throw new Error("请求操作无效。");
    const kind = normalizeKind(body.kind);
    const contact = normalizeContact(kind, body.contact);
    const secret = otpHmacSecret();
    const contactHash = await accountHash(secret, `security-contact:${kind}:${contact}`);

    if (action === "send") {
      const code = kind === "email" ? generateNumericCode(8) : generateOtpCode();
      const codeDigest = await accountHash(secret, `security-contact-code:${user.id}:${kind}:${contact}:${code}`);
      const requestIpHash = await ipHash(secret, requestIp(req));
      const issued = await adminClient.rpc("nava_issue_security_contact_otp", {
        p_user_id: user.id, p_contact_kind: kind, p_contact_hash: contactHash,
        p_code_digest: codeDigest, p_ip_hash: requestIpHash, p_ttl_seconds: 600,
      });
      if (issued.error) throw issued.error;
      const challengeId = String(issued.data);
      try {
        const providerRequestId = kind === "phone"
          ? (await sendAliyunOtp(contact, code)).RequestId ?? null
          : await sendEmailOtp(contact, code);
        const update = await adminClient.from("nava_security_contact_otp_challenges").update({ send_status: "sent", provider_request_id: providerRequestId, provider_error: null }).eq("id", challengeId);
        if (update.error) throw update.error;
      } catch (providerError) {
        const providerMessage = (providerError instanceof Error ? providerError.message : "Provider failed")
          .replace(/[\w.+-]+@[\w.-]+|1[3-9]\d{9}|\b\d{6,8}\b/g, "[redacted]")
          .slice(0, 400);
        await adminClient.from("nava_security_contact_otp_challenges").update({ send_status: "failed", provider_error: providerMessage }).eq("id", challengeId);
        throw new Error("验证码服务暂时不可用。");
      }
      return jsonResponse({ sent: true, expiresInSeconds: 600, cooldownSeconds: 60 });
    }

    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!(kind === "email" ? /^\d{8}$/.test(code) : /^\d{6}$/.test(code))) throw new Error("请输入正确的验证码。");
    const codeDigest = await accountHash(secret, `security-contact-code:${user.id}:${kind}:${contact}:${code}`);
    const consumed = await adminClient.rpc("nava_consume_security_contact_otp", {
      p_user_id: user.id, p_contact_kind: kind, p_contact_hash: contactHash, p_code_digest: codeDigest,
    });
    if (consumed.error) throw consumed.error;
    if (consumed.data !== "ok") return verificationError(consumed.data);

    const metadata = { ...user.user_metadata, [kind === "email" ? "backup_email" : "backup_phone"]: contact };
    const updated = await adminClient.auth.admin.updateUserById(user.id, { user_metadata: metadata });
    if (updated.error) throw updated.error;
    return jsonResponse({
      email: typeof updated.data.user.user_metadata.backup_email === "string" ? updated.data.user.user_metadata.backup_email : null,
      phone: typeof updated.data.user.user_metadata.backup_phone === "string" ? updated.data.user.user_metadata.backup_phone : null,
    });
  } catch (error) {
    return publicError(error);
  }
});
