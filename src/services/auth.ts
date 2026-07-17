import { supabase } from "./supabaseClient";

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export const isPhone = (value: string) => /^1[3-9]\d{9}$/.test(value.trim());

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
  if (error) throw error;
}

export async function signInWithPassword(account: string, password: string) {
  if (!password) throw new Error("请输入密码。");
  const email = toAuthEmail(account);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) await ensureProfile(data.user.id, data.user.email);
}

export async function signUpWithPassword(account: string, password: string) {
  if (password.length < 6) throw new Error("密码至少需要 6 位。");
  const email = toAuthEmail(account);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: email,
        phone: isPhone(account) ? account.trim() : undefined,
      },
    },
  });
  if (error) throw error;
  if (data.user) await ensureProfile(data.user.id, data.user.email);
}

export async function sendEmailOtp(email: string) {
  if (!isEmail(email)) throw new Error("请输入有效邮箱。");
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
  if (error) throw error;
}

export async function verifyEmailOtp(email: string, token: string) {
  if (!isEmail(email)) throw new Error("请输入有效邮箱。");
  if (!/^\d{6}$/.test(token.trim())) throw new Error("请输入 6 位邮箱验证码。");
  const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "email" });
  if (error) throw error;
  if (data.user) await ensureProfile(data.user.id, data.user.email);
}

async function invokeSmsFunction<T>(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (!error) return data;

  let message = error.message;
  const context = (error as { context?: unknown }).context;
  if (context && typeof (context as { clone?: unknown }).clone === "function") {
    try {
      const details = await (context as { clone: () => Response }).clone().json();
      message = details?.error || details?.message || details?.code || message;
    } catch {
      message = error.message;
    }
  }
  throw new Error(message);
}

export async function sendSmsOtp(phone: string) {
  if (!isPhone(phone)) throw new Error("请输入有效中国大陆手机号。");
  await invokeSmsFunction("aliyun-sms-send", { phone: phone.trim() });
}

export async function verifySmsOtp(phone: string, code: string, mode: "login" | "register", password?: string) {
  if (!isPhone(phone)) throw new Error("请输入有效中国大陆手机号。");
  if (!/^\d{6}$/.test(code.trim())) throw new Error("请输入 6 位短信验证码。");
  if (password && password.length < 6) throw new Error("密码至少需要 6 位。");
  const data = await invokeSmsFunction<{ token_hash: string; email?: string }>("aliyun-sms-verify", {
    phone: phone.trim(),
    code: code.trim(),
    mode,
    password,
  });

  if (!data?.token_hash) throw new Error("短信验证成功，但没有返回登录 token。");
  const { data: sessionData, error } = await supabase.auth.verifyOtp({
    token_hash: data.token_hash,
    type: "magiclink",
  });
  if (error) throw error;
  if (sessionData.user) await ensureProfile(sessionData.user.id, sessionData.user.email ?? data.email);
}

export async function resetPassword(email: string) {
  if (!isEmail(email)) throw new Error("找回密码需要输入邮箱。");
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}?reset=true`,
  });
  if (error) throw error;
}

export async function updateCurrentPassword(password: string) {
  if (password.length < 6) throw new Error("密码至少需要 6 位。");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export function formatAuthError(error: unknown) {
  const message = errorMessage(error);
  if (!message) return "未知错误";
  if (message.includes("Invalid login credentials")) return "账号或密码不正确。";
  if (message.includes("Email not confirmed")) return "邮箱还没有完成确认。";
  return message;
}
