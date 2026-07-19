import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

export type PhoneOtpPurpose = "login" | "register" | "reset";

type AliyunSmsResponse = {
  BizId?: string;
  Code?: string;
  Message?: string;
  RequestId?: string;
};

export type AliyunSignatureInput = {
  accessKeyId: string;
  accessKeySecret: string;
  body: string;
  canonicalQuery?: string;
  canonicalUri?: string;
  headers: Record<string, string>;
  method: string;
};

const encoder = new TextEncoder();
const ALGORITHM = "ACS3-HMAC-SHA256";
const ALIYUN_HOST = "dysmsapi.aliyuncs.com";
const ALIYUN_ACTION = "SendSms";
const ALIYUN_VERSION = "2017-05-25";

function requiredEnv(name: string, fallbackName?: string) {
  const value = Deno.env.get(name) ?? (fallbackName ? Deno.env.get(fallbackName) : undefined);
  if (!value?.trim()) throw new Error(`Missing server secret: ${name}`);
  return value.trim();
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmacSha256Hex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export function normalizePhone(value: unknown) {
  const phone = typeof value === "string" ? value.trim() : "";
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error("请输入有效中国大陆手机号。");
  return phone;
}

export function normalizeOtpPurpose(value: unknown): PhoneOtpPurpose {
  if (value === "login" || value === "register" || value === "reset") return value;
  throw new Error("验证码用途无效。");
}

export function normalizeOtpCode(value: unknown) {
  const code = typeof value === "string" ? value.trim() : "";
  if (!/^\d{6}$/.test(code)) throw new Error("请输入 6 位短信验证码。");
  return code;
}

export function phoneToAuthEmail(phone: string) {
  return `${phone}@phone.nava.app`;
}

export function requestIp(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function otpHmacSecret() {
  const secret = requiredEnv("NAVA_OTP_HMAC_SECRET");
  if (secret.length < 32) throw new Error("NAVA_OTP_HMAC_SECRET must contain at least 32 characters.");
  return secret;
}

export async function phoneHash(secret: string, phone: string) {
  return hmacSha256Hex(secret, `phone:v1:${phone}`);
}

export async function ipHash(secret: string, ip: string) {
  return hmacSha256Hex(secret, `ip:v1:${ip}`);
}

export async function otpDigest(secret: string, phone: string, purpose: PhoneOtpPurpose, code: string) {
  return hmacSha256Hex(secret, `otp:v1:${purpose}:${phone}:${code}`);
}

export function generateOtpCode() {
  const range = 1_000_000;
  const maximum = Math.floor(0x1_0000_0000 / range) * range;
  const random = new Uint32Array(1);
  do crypto.getRandomValues(random); while (random[0] >= maximum);
  return String(random[0] % range).padStart(6, "0");
}

export function createOtpAdminClient(): SupabaseClient {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function aliyunCredentials() {
  return {
    accessKeyId: requiredEnv("ALIYUN_SMS_ACCESS_KEY_ID", "ALIBABA_CLOUD_ACCESS_KEY_ID"),
    accessKeySecret: requiredEnv("ALIYUN_SMS_ACCESS_KEY_SECRET", "ALIBABA_CLOUD_ACCESS_KEY_SECRET"),
    signName: requiredEnv("ALIYUN_SMS_SIGN_NAME"),
    templateCode: requiredEnv("ALIYUN_SMS_TEMPLATE_CODE"),
    templateParamKey: Deno.env.get("ALIYUN_SMS_TEMPLATE_PARAM_KEY")?.trim() || "code",
  };
}

function aliyunDate() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function createAliyunV3Signature(input: AliyunSignatureInput) {
  const payloadHash = await sha256Hex(input.body);
  const headers = Object.fromEntries(
    Object.entries(input.headers)
      .filter(([name]) => name.toLowerCase() !== "authorization")
      .map(([name, value]) => [name.toLowerCase(), value.trim()]),
  );
  headers["x-acs-content-sha256"] = payloadHash;
  const signedHeaderNames = Object.keys(headers).sort();
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalHeaders = `${signedHeaderNames.map((name) => `${name}:${headers[name]}`).join("\n")}\n`;
  const canonicalRequest = [
    input.method.toUpperCase(),
    input.canonicalUri ?? "/",
    input.canonicalQuery ?? "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = `${ALGORITHM}\n${await sha256Hex(canonicalRequest)}`;
  const signature = await hmacSha256Hex(input.accessKeySecret, stringToSign);
  const authorization = `${ALGORITHM} Credential=${input.accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}`;
  return {
    authorization,
    canonicalRequest,
    hashedCanonicalRequest: await sha256Hex(canonicalRequest),
    headers,
    payloadHash,
    signature,
    signedHeaders,
    stringToSign,
  };
}

async function signedAliyunHeaders(body: string) {
  const credentials = aliyunCredentials();
  const signed = await createAliyunV3Signature({
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      host: ALIYUN_HOST,
      "x-acs-action": ALIYUN_ACTION,
      "x-acs-date": aliyunDate(),
      "x-acs-signature-nonce": crypto.randomUUID(),
      "x-acs-version": ALIYUN_VERSION,
    },
    method: "POST",
  });
  return { ...signed.headers, Authorization: signed.authorization };
}

export async function sendAliyunOtp(phone: string, code: string): Promise<AliyunSmsResponse> {
  const credentials = aliyunCredentials();
  const body = new URLSearchParams({
    PhoneNumbers: phone,
    SignName: credentials.signName,
    TemplateCode: credentials.templateCode,
    TemplateParam: JSON.stringify({ [credentials.templateParamKey]: code }),
  }).toString();
  const headers = await signedAliyunHeaders(body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);

  try {
    const response = await fetch(`https://${ALIYUN_HOST}/`, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: AliyunSmsResponse;
    try {
      payload = JSON.parse(raw) as AliyunSmsResponse;
    } catch {
      throw new Error(`ALIYUN_INVALID_RESPONSE:${response.status}`);
    }
    if (!response.ok || payload.Code !== "OK") {
      throw new Error(`ALIYUN_${payload.Code || response.status}:${payload.Message || "SendSms failed"}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
