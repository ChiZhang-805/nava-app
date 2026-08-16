import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import {
  accountHash,
  ipHash,
  normalizeOtpPurpose,
  otpHmacSecret,
  phoneToAuthEmail,
  requestIp,
  type PhoneOtpPurpose,
} from "./phone-otp.ts";

export type AuthAccountChannel = "email" | "phone";

export type NormalizedAuthAccount = {
  canonical: string;
  channel: AuthAccountChannel;
  email: string;
  phone: string | null;
};

export type AccountEligibilityError = {
  code: "ACCOUNT_EXISTS" | "ACCOUNT_NOT_FOUND";
  message: string;
  status: number;
};

export function normalizeAuthAccount(value: unknown): NormalizedAuthAccount {
  const account = typeof value === "string" ? value.trim() : "";
  if (/^1[3-9]\d{9}$/.test(account)) {
    return {
      canonical: account,
      channel: "phone",
      email: phoneToAuthEmail(account),
      phone: account,
    };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)) {
    const email = account.toLowerCase();
    return { canonical: email, channel: "email", email, phone: null };
  }
  throw new Error("请输入有效邮箱或中国大陆手机号。");
}

export function accountEligibilityError(
  purpose: PhoneOtpPurpose,
  registered: boolean,
): AccountEligibilityError | null {
  if (purpose === "register" && registered) {
    return {
      code: "ACCOUNT_EXISTS",
      message: "该邮箱或手机号已注册，请直接登录或重置密码。",
      status: 409,
    };
  }
  if (purpose !== "register" && !registered) {
    return {
      code: "ACCOUNT_NOT_FOUND",
      message: "该邮箱或手机号未注册。",
      status: 404,
    };
  }
  return null;
}

export function normalizeAuthAccountPurpose(value: unknown) {
  return normalizeOtpPurpose(value);
}

export async function inspectAccountRegistration(
  admin: SupabaseClient,
  req: Request,
  account: NormalizedAuthAccount,
) {
  const secret = otpHmacSecret();
  const [lookupAccountHash, requestIpHash] = await Promise.all([
    accountHash(secret, account.canonical),
    ipHash(secret, requestIp(req)),
  ]);
  const result = await admin.rpc("nava_check_auth_account", {
    p_account_hash: lookupAccountHash,
    p_ip_hash: requestIpHash,
    p_lookup_email: account.email,
    p_lookup_phone: account.phone,
  });
  if (result.error) throw result.error;
  return result.data === true;
}
