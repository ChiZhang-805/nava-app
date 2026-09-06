import {
  accountHash,
  createAliyunSendSmsQuery,
  createAliyunV3Signature,
  generateOtpCode,
  ipHash,
  normalizeOtpCode,
  normalizeOtpPurpose,
  normalizePhone,
  otpDigest,
  phoneHash,
  phoneToAuthEmail,
} from "../_shared/phone-otp.ts";
import {
  accountEligibilityError,
  normalizeAuthAccount,
} from "../_shared/auth-account.ts";

const secret = "test-only-secret-with-at-least-thirty-two-characters";

function assertEqual(actual: string, expected: string, label: string) {
  if (actual !== expected) throw new Error(`${label} mismatch: ${actual}`);
}

Deno.test("phone OTP helpers validate the public contract", () => {
  if (normalizePhone(" 13800138000 ") !== "13800138000") throw new Error("Phone normalization failed.");
  if (normalizeOtpCode(" 123456 ") !== "123456") throw new Error("OTP normalization failed.");
  if (
    normalizeOtpPurpose("login") !== "login" ||
    normalizeOtpPurpose("register") !== "register" ||
    normalizeOtpPurpose("reset") !== "reset"
  ) {
    throw new Error("OTP purpose normalization failed.");
  }
  if (phoneToAuthEmail("13800138000") !== "13800138000@phone.nava.app") throw new Error("Auth email mapping failed.");
});

Deno.test("generated OTP values are six digits and not constant", () => {
  const codes = new Set(Array.from({ length: 128 }, () => generateOtpCode()));
  if ([...codes].some((code) => !/^\d{6}$/.test(code))) throw new Error("Generated an invalid OTP.");
  if (codes.size < 120) throw new Error(`OTP generator produced too many collisions: ${codes.size}`);
});

Deno.test("HMAC domains isolate phone, IP, purpose, and code digests", async () => {
  const phone = "13800138000";
  const [recipient, ip, login, registration, reset, otherCode] = await Promise.all([
    phoneHash(secret, phone),
    ipHash(secret, phone),
    otpDigest(secret, phone, "login", "123456"),
    otpDigest(secret, phone, "register", "123456"),
    otpDigest(secret, phone, "reset", "123456"),
    otpDigest(secret, phone, "register", "654321"),
  ]);
  const values = new Set([recipient, ip, login, registration, reset, otherCode]);
  if (values.size !== 6) throw new Error("HMAC domain separation failed.");
  if ([...values].some((value) => value.includes(phone) || value.length !== 64)) {
    throw new Error("A persisted digest exposed raw input or used an unexpected length.");
  }
});

Deno.test("account lookup normalizes email and phone without changing the auth mapping", () => {
  const email = normalizeAuthAccount(" User@Example.com ");
  if (email.channel !== "email" || email.email !== "user@example.com" || email.phone !== null) {
    throw new Error("Email account normalization failed.");
  }
  const phone = normalizeAuthAccount("13800138000");
  if (phone.channel !== "phone" || phone.email !== "13800138000@phone.nava.app" || phone.phone !== "13800138000") {
    throw new Error("Phone account normalization failed.");
  }
});

Deno.test("account eligibility rejects missing login accounts and duplicate registration accounts", () => {
  const missing = accountEligibilityError("login", false);
  if (missing?.code !== "ACCOUNT_NOT_FOUND" || missing.status !== 404) throw new Error("Missing login account was allowed.");
  const resetMissing = accountEligibilityError("reset", false);
  if (resetMissing?.code !== "ACCOUNT_NOT_FOUND") throw new Error("Missing reset account was allowed.");
  const duplicate = accountEligibilityError("register", true);
  if (duplicate?.code !== "ACCOUNT_EXISTS" || duplicate.status !== 409) throw new Error("Duplicate registration was allowed.");
  if (accountEligibilityError("login", true) || accountEligibilityError("register", false)) {
    throw new Error("Valid account eligibility was rejected.");
  }
});

Deno.test("account lookup hashes do not expose raw account identifiers", async () => {
  const email = "user@example.com";
  const digest = await accountHash(secret, email);
  if (digest.includes(email) || digest.length !== 64) throw new Error("Account lookup hash exposed raw input.");
});

Deno.test("Alibaba Cloud V3 signer matches the official fixed vector", async () => {
  const signed = await createAliyunV3Signature({
    accessKeyId: "YourAccessKeyId",
    accessKeySecret: "YourAccessKeySecret",
    body: "",
    canonicalQuery: "ImageId=win2019_1809_x64_dtc_zh-cn_40G_alibase_20230811.vhd&RegionId=cn-shanghai",
    headers: {
      host: "ecs.cn-shanghai.aliyuncs.com",
      "x-acs-action": "RunInstances",
      "x-acs-date": "2023-10-26T10:22:32Z",
      "x-acs-signature-nonce": "3156853299f313e23d1673dc12e1703d",
      "x-acs-version": "2014-05-26",
    },
    method: "POST",
  });

  assertEqual(signed.payloadHash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "Payload hash");
  assertEqual(signed.hashedCanonicalRequest, "7ea06492da5221eba5297e897ce16e55f964061054b7695beedaac1145b1e259", "Canonical request hash");
  assertEqual(signed.signature, "06563a9e1b43f5dfe96b81484da74bceab24a1d853912eee15083a6f0f3283c0", "Signature");
});

Deno.test("Alibaba Cloud SendSms uses the documented canonical query transport", () => {
  const query = createAliyunSendSmsQuery({
    code: "123456",
    phone: "13800138000",
    signName: "嘉兴纳瓦信息科技",
    templateCode: "SMS_123456789",
    templateParamKey: "code",
  });

  assertEqual(
    query,
    "PhoneNumbers=13800138000&SignName=%E5%98%89%E5%85%B4%E7%BA%B3%E7%93%A6%E4%BF%A1%E6%81%AF%E7%A7%91%E6%8A%80&TemplateCode=SMS_123456789&TemplateParam=%7B%22code%22%3A%22123456%22%7D",
    "SendSms canonical query",
  );
});
