import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { appConfig } from "../config";
import { createEphemeralSupabaseClient, supabase } from "./supabaseClient";

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export const isPhone = (value: string) => /^1[3-9]\d{9}$/.test(value.trim());

export const EMAIL_OTP_LENGTH = 8;
export const SMS_OTP_LENGTH = 6;
export const SOCIAL_AUTH_RETURN_KEY = "nava.auth.social-return.v1";

export type SocialAuthProvider = "wechat" | "apple" | "qq";

const SOCIAL_OAUTH_PROVIDERS = {
  apple: "apple",
} satisfies Record<"apple", "apple">;

const CONFIGURED_SOCIAL_PROVIDERS = new Set(
  String(import.meta.env.VITE_SOCIAL_AUTH_PROVIDERS ?? "")
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean),
);

export function otpLengthForAccount(account: string) {
  return isPhone(account) ? SMS_OTP_LENGTH : EMAIL_OTP_LENGTH;
}

export function isOtpCodeValid(account: string, code: string) {
  const expectedLength = otpLengthForAccount(account);
  return new RegExp(`^\\d{${expectedLength}}$`).test(code.trim());
}

function otpCodeFormatError(account: string) {
  return isPhone(account) ? "请输入 6 位短信验证码。" : "请输入 8 位邮箱验证码。";
}

type AuthErrorTranslationKey =
  | "auth.error.accountExists"
  | "auth.error.accountNotFound"
  | "auth.error.codeFormat"
  | "auth.error.emailCodeFormat"
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
  | "auth.error.passwordSame"
  | "auth.error.socialCancelled"
  | "auth.error.socialFailed"
  | "auth.error.socialUnavailable"
  | "auth.error.smsCodeFormat";

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

export function toAuthPhone(value: string) {
  const normalized = value.trim();
  if (!isPhone(normalized)) throw new Error("请输入有效中国大陆手机号。");
  return `+86${normalized}`;
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
  const normalized = account.trim();
  const localSeedMode = import.meta.env.DEV
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("seedHistory") === "1";
  if (!localSeedMode) await assertAccountEligibility(normalized, "login");

  if (isPhone(normalized)) {
    const current = await supabase.auth.signInWithPassword({ phone: toAuthPhone(normalized), password });
    if (!current.error) {
      if (current.data.user) await ensureProfile(current.data.user.id, normalized);
      return;
    }

    const canTryLegacyAccount = current.error.code === "invalid_credentials"
      || /invalid login credentials/i.test(current.error.message);
    if (!canTryLegacyAccount) throw current.error;
    const legacy = await supabase.auth.signInWithPassword({ email: toAuthEmail(normalized), password });
    if (legacy.error) throw current.error;
    if (legacy.data.user) await ensureProfile(legacy.data.user.id, normalized);
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email: toAuthEmail(normalized), password });
  if (error) throw error;
  if (data.user) await ensureProfile(data.user.id, normalized);
}

export async function signInWithSocialProvider(provider: SocialAuthProvider) {
  if (!CONFIGURED_SOCIAL_PROVIDERS.has(provider)) {
    throw new AuthServiceError(`Social provider ${provider} is not configured.`, "SOCIAL_PROVIDER_UNAVAILABLE");
  }
  if (provider === "apple" && Capacitor.isNativePlatform()) {
    const { requestNativeAppleCredential } = await import("./nativeSocialAuth");
    const credential = await requestNativeAppleCredential();
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
      nonce: credential.nonce,
    });
    if (error) throw error;

    const fullName = [credential.givenName, credential.familyName].filter(Boolean).join(" ");
    if (data.user && fullName) {
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          given_name: credential.givenName,
          family_name: credential.familyName,
        },
      });
      if (metadataError) throw metadataError;
    }
    if (data.user) await ensureProfile(data.user.id, fullName || credential.email || data.user.email);
    return;
  }

  const redirectUrl = new URL(window.location.href);
  redirectUrl.search = "";
  redirectUrl.hash = "";
  window.sessionStorage.setItem(SOCIAL_AUTH_RETURN_KEY, String(Date.now()));

  if (provider === "apple") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: SOCIAL_OAUTH_PROVIDERS.apple,
      options: { redirectTo: redirectUrl.toString(), scopes: "name email" },
    });
    if (error) {
      window.sessionStorage.removeItem(SOCIAL_AUTH_RETURN_KEY);
      throw error;
    }
    return;
  }

  const returnTo = Capacitor.isNativePlatform() ? "nava://auth/callback" : redirectUrl.toString();
  const startUrl = new URL(`${appConfig.supabaseUrl}/functions/v1/social-oauth/start`);
  startUrl.searchParams.set("provider", provider);
  startUrl.searchParams.set("return_to", returnTo);

  try {
    if (Capacitor.isNativePlatform()) {
      const { openNativeSocialAuth } = await import("./nativeSocialAuth");
      const callbackUrl = await openNativeSocialAuth(startUrl.toString());
      await completeSocialAuthCallback(callbackUrl);
      return;
    }
    window.location.assign(startUrl.toString());
  } catch (error) {
    window.sessionStorage.removeItem(SOCIAL_AUTH_RETURN_KEY);
    throw error;
  }
}

const SOCIAL_CALLBACK_PARAMS = ["token_hash", "type", "provider", "social_auth_error", "social_auth_message"];

function clearSocialCallbackUrl(url: URL) {
  if (url.href !== window.location.href) return;
  for (const name of SOCIAL_CALLBACK_PARAMS) url.searchParams.delete(name);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export async function completeSocialAuthCallback(address: string) {
  const url = new URL(address);
  const tokenHash = url.searchParams.get("token_hash");
  const callbackError = url.searchParams.get("social_auth_error");
  if (!tokenHash && !callbackError) return false;

  try {
    if (callbackError) {
      const code = callbackError === "access_denied" ? "SOCIAL_AUTH_CANCELLED" : "SOCIAL_AUTH_FAILED";
      throw new AuthServiceError(url.searchParams.get("social_auth_message") || callbackError, code);
    }
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: "magiclink" });
    if (error) throw error;
    if (!data.session || !data.user) throw new AuthServiceError("Social sign-in did not establish a session.", "SOCIAL_AUTH_FAILED");
    await ensureProfile(data.user.id, data.user.user_metadata?.full_name ?? data.user.email);
    window.sessionStorage.removeItem(SOCIAL_AUTH_RETURN_KEY);
    window.dispatchEvent(new Event("nava:social-auth-complete"));
    return true;
  } finally {
    clearSocialCallbackUrl(url);
  }
}

async function invokeAuthFunction<T>(name: string, body: Record<string, unknown>) {
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
export async function sendSmsOtp(phone: string, purpose: PhoneOtpPurpose) {
  if (!isPhone(phone)) throw new Error("请输入有效中国大陆手机号。");
  const authClient = createEphemeralSupabaseClient();
  const { error } = await authClient.auth.signInWithOtp({
    phone: toAuthPhone(phone),
    options: {
      shouldCreateUser: purpose === "register",
      data: purpose === "register" ? { full_name: phone.trim() } : undefined,
    },
  });
  if (error) throw error;
}

async function assertAccountEligibility(account: string, purpose: PhoneOtpPurpose) {
  await invokeAuthFunction("auth-account-status", { account: account.trim(), purpose });
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
    const guardMissing = comparisonError?.code === "PGRST202"
      || /could not find the function|schema cache/i.test(comparisonError?.message ?? "");
    if (comparisonError && !guardMissing) throw comparisonError;
    if (matchesCurrent) throw new Error("新密码不能与当前密码相同。");
  }
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

export async function verifySmsOtp(phone: string, code: string, purpose: PhoneOtpPurpose, password?: string) {
  if (!isPhone(phone)) throw new Error("请输入有效中国大陆手机号。");
  if (!/^\d{6}$/.test(code.trim())) throw new Error("请输入 6 位短信验证码。");
  if (password && password.length < 6) throw new Error("密码至少需要 6 位。");
  const authClient = createEphemeralSupabaseClient();
  const { data: sessionData, error } = await authClient.auth.verifyOtp({
    phone: toAuthPhone(phone),
    token: code.trim(),
    type: "sms",
  });
  if (error) throw error;
  if (!sessionData.session) throw new Error("短信验证成功，但没有建立登录会话。");
  if (password) await applyPassword(authClient, password, purpose === "reset");
  await publishSession(sessionData.session, phone);
}

export async function sendRegistrationOtp(account: string) {
  const normalized = account.trim();
  if (isPhone(normalized)) {
    await sendSmsOtp(normalized, "register");
    return "sms" as const;
  }
  if (!isEmail(normalized)) throw new Error("请输入有效邮箱或中国大陆手机号。");
  await assertAccountEligibility(normalized, "register");

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
  await assertAccountEligibility(normalized, "login");

  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  return "email" as const;
}

export async function verifyLoginOtp(account: string, code: string) {
  const normalized = account.trim();
  if (!isOtpCodeValid(normalized, code)) throw new Error(otpCodeFormatError(normalized));

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
  if (!isOtpCodeValid(normalized, code)) throw new Error(otpCodeFormatError(normalized));
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
  await assertAccountEligibility(normalized, "reset");

  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  return "email" as const;
}

export async function verifyPasswordResetOtp(account: string, code: string, password: string) {
  const normalized = account.trim();
  if (!isOtpCodeValid(normalized, code)) throw new Error(otpCodeFormatError(normalized));
  if (isPhone(normalized)) {
    await verifySmsOtp(normalized, code, "reset", password);
    return;
  }
  const authClient = createEphemeralSupabaseClient();
  let session: Session;
  if (isEmail(normalized)) {
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
  await publishSession(session, normalized);
}

export async function updateCurrentPassword(password: string, requireDifferent = false) {
  await applyPassword(supabase, password, requireDifferent);
}

export type BackupContactKind = "email" | "phone";

export async function sendBackupContactOtp(kind: BackupContactKind, value: string) {
  const contact = value.trim();
  if (kind === "email" && !isEmail(contact)) throw new Error("请输入有效的备用邮箱。");
  if (kind === "phone" && !isPhone(contact)) throw new Error("请输入有效的中国大陆备用手机号。");
  await invokeAuthFunction("security-contact-otp", { action: "send", kind, contact });
}

export async function verifyBackupContactOtp(kind: BackupContactKind, value: string, code: string) {
  const contact = value.trim();
  if (kind === "email" && !isEmail(contact)) throw new Error("请输入有效的备用邮箱。");
  if (kind === "phone" && !isPhone(contact)) throw new Error("请输入有效的中国大陆备用手机号。");
  if (!isOtpCodeValid(contact, code)) throw new Error(otpCodeFormatError(contact));
  const data = await invokeAuthFunction<{ email?: string | null; phone?: string | null }>("security-contact-otp", {
    action: "verify",
    kind,
    contact,
    code: code.trim(),
  });
  return {
    email: typeof data?.email === "string" ? data.email : null,
    phone: typeof data?.phone === "string" ? data.phone : null,
  };
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

  if (code === "SOCIAL_PROVIDER_UNAVAILABLE") {
    return localized("auth.error.socialUnavailable", "该快捷登录尚未完成服务配置。");
  }
  if (code === "SOCIAL_AUTH_CANCELLED") {
    return localized("auth.error.socialCancelled", "已取消快捷登录。");
  }
  if (code === "SOCIAL_AUTH_FAILED") {
    return localized("auth.error.socialFailed", "快捷登录失败，请稍后再试。");
  }
  if (code === "OTP_COOLDOWN") return localized("auth.error.otpCooldown", "请等待 60 秒后再获取验证码。");
  if (
    code === "OTP_PHONE_RATE_LIMIT"
    || code === "OTP_ACCOUNT_RATE_LIMIT"
    || code === "OTP_IP_RATE_LIMIT"
    || code === "over_sms_send_rate_limit"
    || code === "over_email_send_rate_limit"
    || code === "over_request_rate_limit"
  ) {
    return localized("auth.error.otpRateLimit", "请求过于频繁，请稍后再试。");
  }
  if (code === "SMS_PROVIDER_ERROR" || code === "OTP_SERVICE_ERROR" || code === "sms_send_failed" || code === "hook_timeout") {
    return localized("auth.error.otpUnavailable", "验证码服务暂时不可用，请稍后再试。");
  }
  if (code === "OTP_EXPIRED") return localized("auth.error.otpExpired", "验证码已过期，请重新获取。");
  if (code === "otp_expired") return localized("auth.error.otpExpired", "验证码已过期，请重新获取。");
  if (code === "OTP_LOCKED") return localized("auth.error.otpLocked", "验证码错误次数过多，请重新获取。");
  if (code === "OTP_INVALID" || code === "OTP_NOT_FOUND") return localized("auth.error.otpInvalid", "验证码不正确。");
  if (code === "ACCOUNT_EXISTS") return localized("auth.error.accountExists", "该账号已注册，请直接登录或重置密码。");
  if (code === "ACCOUNT_NOT_FOUND") return localized("auth.error.accountNotFound", "该邮箱或手机号未注册。");
  if (message.includes("Invalid login credentials")) return localized("auth.error.loginInvalid", "账号或密码不正确。");
  if (message.includes("Email not confirmed")) return localized("auth.error.emailNotConfirmed", "邮箱还没有完成确认。");
  if (/provider.*(not enabled|not found|unsupported|not configured)|unsupported provider|custom provider/i.test(message)) {
    return localized("auth.error.socialUnavailable", "该快捷登录尚未完成服务配置。");
  }
  if (/social sign-in.*cancelled|authorization.*cancelled/i.test(message)) {
    return localized("auth.error.socialCancelled", "已取消快捷登录。");
  }
  if (message.includes("Token has expired") || message.includes("otp_expired")) {
    return localized("auth.error.otpExpired", "验证码已过期，请重新获取。");
  }
  if (/请求过于频繁|too many requests|rate limit/i.test(message)) {
    return localized("auth.error.otpRateLimit", "请求过于频繁，请稍后再试。");
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
  if (message.includes("至少需要 6 位") || message.includes("at least 6")) {
    return localized("auth.error.passwordLength", "密码至少需要 6 位。");
  }
  if (message.includes("8 位") || message.includes("8-digit")) {
    return localized("auth.error.emailCodeFormat", "请输入 8 位邮箱验证码。");
  }
  if (message.includes("6 位") || message.includes("6-digit")) {
    return localized("auth.error.smsCodeFormat", "请输入 6 位短信验证码。");
  }
  return message;
}
