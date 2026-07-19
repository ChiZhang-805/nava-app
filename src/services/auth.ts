import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createEphemeralSupabaseClient, supabase } from "./supabaseClient";

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export const isPhone = (value: string) => /^1[3-9]\d{9}$/.test(value.trim());

type AuthErrorTranslationKey =
  | "auth.error.accountExists"
  | "auth.error.accountNotFound"
  | "auth.error.codeFormat"
  | "auth.error.emailNotConfirmed"
  | "auth.error.invalidAccount"
  | "auth.error.loginInvalid"
  | "auth.error.otpCooldown"
  | "auth.error.otpExpired"
  | "auth.error.otpInvalid"
  | "auth.error.otpLocked"
  | "auth.error.otpRateLimit"
  | "auth.error.otpUnavailable"
  | "auth.error.passwordLength"
  | "auth.error.passwordSame";

class AuthServiceError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "AuthServiceError";
  }
}

export function toAuthEmail(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error("请输入邮箱或手机号。");
  if (!isEmail(normalized) && !isPhone(normalized)) throw new Error("请输入有效邮箱或中国大陆手机号。");
  return isEmail(normalized) ? normalized : `${normalized}@phone.nava.app`;
}

function errorMessage(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

export async function ensureProfile(userId: string, fallbackName?: string | null) {
  const username = fallbackName?.trim() || "NAVA 用户";
  const existing = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return;

  const { error } = await supabase.from("profiles").insert({ id: userId, username });
  if (error && error.code !== "23505") throw error;
}

export async function signInWithPassword(account: string, password: string) {
  if (!password) throw new Error("请输入密码。");
  const email = toAuthEmail(account);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) await ensureProfile(data.user.id, account.trim());
}

async function invokeSmsFunction<T>(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (!error) return data;

  let message = error.message;
  let code: string | undefined;
  const context = (error as { context?: unknown }).context;
  if (context && typeof (context as { clone?: unknown }).clone === "function") {
    try {
      const details = await (context as { clone: () => Response }).clone().json();
      message = details?.error || details?.message || details?.code || message;
      code = typeof details?.code === "string" ? details.code : undefined;
    } catch {
      message = error.message;
    }
  }
  throw new AuthServiceError(message, code);
}

type PhoneOtpPurpose = "login" | "register" | "reset";
type PhoneVerificationType = "signup" | "recovery" | "magiclink";

export async function sendSmsOtp(phone: string, purpose: PhoneOtpPurpose) {
  if (!isPhone(phone)) throw new Error("请输入有效中国大陆手机号。");
  await invokeSmsFunction("aliyun-sms-send", { phone: phone.trim(), purpose });
}

async function requestSmsVerification(phone: string, code: string, purpose: PhoneOtpPurpose, password?: string) {
  if (!isPhone(phone)) throw new Error("请输入有效中国大陆手机号。");
  if (!/^\d{6}$/.test(code.trim())) throw new Error("请输入 6 位短信验证码。");
  if (password && password.length < 6) throw new Error("密码至少需要 6 位。");
  const data = await invokeSmsFunction<{ token_hash: string; verification_type: PhoneVerificationType; email?: string }>("aliyun-sms-verify", {
    phone: phone.trim(),
    code: code.trim(),
    purpose,
    password,
  });

  if (!data?.token_hash || !data.verification_type) throw new Error("短信验证成功，但没有返回登录 token。");
  return data;
}

async function publishSession(session: Session, fallbackName?: string) {
  const { data, error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;
  if (data.user) await ensureProfile(data.user.id, fallbackName ?? data.user.email);
}

async function applyPassword(client: SupabaseClient, password: string, requireDifferent: boolean) {
  if (password.length < 6) throw new Error("密码至少需要 6 位。");
  if (requireDifferent) {
    const { data: matchesCurrent, error: comparisonError } = await client.rpc("nava_password_matches_current", {
      candidate_password: password,
    });
    if (comparisonError) throw comparisonError;
    if (matchesCurrent) throw new Error("新密码不能与当前密码相同。");
  }
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

export async function verifySmsOtp(phone: string, code: string, purpose: PhoneOtpPurpose, password?: string) {
  const data = await requestSmsVerification(phone, code, purpose, password);
  const authClient = createEphemeralSupabaseClient();
  const { data: sessionData, error } = await authClient.auth.verifyOtp({
    token_hash: data.token_hash,
    type: data.verification_type,
  });
  if (error) throw error;
  if (!sessionData.session) throw new Error("短信验证成功，但没有建立登录会话。");
  await publishSession(sessionData.session, phone);
}

export async function sendRegistrationOtp(account: string) {
  const normalized = account.trim();
  if (isPhone(normalized)) {
    await sendSmsOtp(normalized, "register");
    return "sms" as const;
  }
  if (!isEmail(normalized)) throw new Error("请输入有效邮箱或中国大陆手机号。");

  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: true,
      data: { full_name: normalized },
    },
  });
  if (error) throw error;
  return "email" as const;
}

export async function sendLoginOtp(account: string) {
  const normalized = account.trim();
  if (isPhone(normalized)) {
    await sendSmsOtp(normalized, "login");
    return "sms" as const;
  }
  if (!isEmail(normalized)) throw new Error("请输入有效邮箱或中国大陆手机号。");

  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  return "email" as const;
}

export async function verifyLoginOtp(account: string, code: string) {
  const normalized = account.trim();
  if (!/^\d{6}$/.test(code.trim())) throw new Error("请输入 6 位验证码。");

  if (isPhone(normalized)) {
    await verifySmsOtp(normalized, code, "login");
    return;
  }
  if (!isEmail(normalized)) throw new Error("请输入有效邮箱或中国大陆手机号。");

  const authClient = createEphemeralSupabaseClient();
  const { data, error } = await authClient.auth.verifyOtp({
    email: normalized,
    token: code.trim(),
    type: "email",
  });
  if (error) throw error;
  if (!data.session) throw new Error("邮箱验证码已通过，但没有建立登录会话。");
  await publishSession(data.session, data.user?.email ?? normalized);
}

export async function verifyRegistrationOtp(account: string, code: string, password: string) {
  const normalized = account.trim();
  if (!/^\d{6}$/.test(code.trim())) throw new Error("请输入 6 位验证码。");
  if (password.length < 6) throw new Error("密码至少需要 6 位。");

  if (isPhone(normalized)) {
    await verifySmsOtp(normalized, code, "register", password);
    return;
  }
  if (!isEmail(normalized)) throw new Error("请输入有效邮箱或中国大陆手机号。");

  const authClient = createEphemeralSupabaseClient();
  const { data, error } = await authClient.auth.verifyOtp({
    email: normalized,
    token: code.trim(),
    type: "email",
  });
  if (error) throw error;
  if (!data.user || !data.session) throw new Error("邮箱验证码已通过，但没有建立登录会话。");

  const { error: passwordError } = await authClient.auth.updateUser({
    password,
    data: { full_name: normalized },
  });
  if (passwordError) throw passwordError;
  await publishSession(data.session, data.user.email ?? normalized);
}

export async function sendPasswordResetOtp(account: string) {
  const normalized = account.trim();
  if (isPhone(normalized)) {
    await sendSmsOtp(normalized, "reset");
    return "sms" as const;
  }
  if (!isEmail(normalized)) throw new Error("请输入有效邮箱或中国大陆手机号。");

  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  return "email" as const;
}

export async function verifyPasswordResetOtp(account: string, code: string, password: string) {
  const normalized = account.trim();
  if (!/^\d{6}$/.test(code.trim())) throw new Error("请输入 6 位验证码。");
  const authClient = createEphemeralSupabaseClient();
  let session: Session;
  let fallbackName = normalized;

  if (isPhone(normalized)) {
    const verification = await requestSmsVerification(normalized, code, "reset");
    const { data, error } = await authClient.auth.verifyOtp({
      token_hash: verification.token_hash,
      type: verification.verification_type,
    });
    if (error) throw error;
    if (!data.session) throw new Error("短信验证码已通过，但没有建立登录会话。");
    session = data.session;
    fallbackName = normalized;
  } else if (isEmail(normalized)) {
    const { data, error } = await authClient.auth.verifyOtp({
      email: normalized,
      token: code.trim(),
      type: "email",
    });
    if (error) throw error;
    if (!data.user || !data.session) throw new Error("邮箱验证码已通过，但没有建立登录会话。");
    session = data.session;
  } else {
    throw new Error("请输入有效邮箱或中国大陆手机号。");
  }

  await applyPassword(authClient, password, true);
  await publishSession(session, fallbackName);
}

export async function updateCurrentPassword(password: string, requireDifferent = false) {
  await applyPassword(supabase, password, requireDifferent);
}

export function formatAuthError(error: unknown, translate?: (key: AuthErrorTranslationKey) => string) {
  const message = errorMessage(error);
  if (!message) return "未知错误";
  const code = error instanceof AuthServiceError
    ? error.code
    : typeof error === "object" && error && "code" in error
      ? String((error as { code: unknown }).code)
      : undefined;
  const localized = (key: AuthErrorTranslationKey, fallback: string) => translate?.(key) ?? fallback;

  if (code === "OTP_COOLDOWN") return localized("auth.error.otpCooldown", "请等待 60 秒后再获取验证码。");
  if (code === "OTP_PHONE_RATE_LIMIT" || code === "OTP_IP_RATE_LIMIT") {
    return localized("auth.error.otpRateLimit", "请求过于频繁，请稍后再试。");
  }
  if (code === "SMS_PROVIDER_ERROR" || code === "OTP_SERVICE_ERROR") {
    return localized("auth.error.otpUnavailable", "验证码服务暂时不可用，请稍后再试。");
  }
  if (code === "OTP_EXPIRED") return localized("auth.error.otpExpired", "验证码已过期，请重新获取。");
  if (code === "OTP_LOCKED") return localized("auth.error.otpLocked", "验证码错误次数过多，请重新获取。");
  if (code === "OTP_INVALID" || code === "OTP_NOT_FOUND") return localized("auth.error.otpInvalid", "验证码不正确。");
  if (code === "ACCOUNT_EXISTS") return localized("auth.error.accountExists", "该账号已注册，请直接登录或重置密码。");
  if (code === "ACCOUNT_NOT_FOUND") return localized("auth.error.accountNotFound", "未找到该账号。");
  if (message.includes("Invalid login credentials")) return localized("auth.error.loginInvalid", "账号或密码不正确。");
  if (message.includes("Email not confirmed")) return localized("auth.error.emailNotConfirmed", "邮箱还没有完成确认。");
  if (message.includes("Token has expired") || message.includes("otp_expired")) {
    return localized("auth.error.otpExpired", "验证码已过期，请重新获取。");
  }
  if (message.includes("invalid token") || message.includes("token is invalid")) {
    return localized("auth.error.otpInvalid", "验证码不正确。");
  }
  if (message.includes("新密码不能") || (message.toLowerCase().includes("same") && message.toLowerCase().includes("password"))) {
    return localized("auth.error.passwordSame", "新密码不能与当前密码相同。");
  }
  if (message.includes("有效邮箱") || message.includes("valid email")) {
    return localized("auth.error.invalidAccount", "请输入有效邮箱或中国大陆手机号。");
  }
  if (message.includes("6 位") || message.includes("6-digit")) return localized("auth.error.codeFormat", "请输入 6 位验证码。");
  if (message.includes("至少需要 6 位") || message.includes("at least 6")) {
    return localized("auth.error.passwordLength", "密码至少需要 6 位。");
  }
  return message;
}
