import {
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

const secret = "test-only-secret-with-at-least-thirty-two-characters";

function assertEqual(actual: string, expected: string, label: string) {
  if (actual !== expected) throw new Error(`${label} mismatch: ${actual}`);
}

Deno.test("phone OTP helpers validate the public contract", () => {
  if (normalizePhone(" 13800138000 ") !== "13800138000") throw new Error("Phone normalization failed.");
  if (normalizeOtpCode(" 123456 ") !== "123456") throw new Error("OTP normalization failed.");
  if (normalizeOtpPurpose("register") !== "register" || normalizeOtpPurpose("reset") !== "reset") {
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
  const [recipient, ip, registration, reset, otherCode] = await Promise.all([
    phoneHash(secret, phone),
    ipHash(secret, phone),
    otpDigest(secret, phone, "register", "123456"),
    otpDigest(secret, phone, "reset", "123456"),
    otpDigest(secret, phone, "register", "654321"),
  ]);
  const values = new Set([recipient, ip, registration, reset, otherCode]);
  if (values.size !== 5) throw new Error("HMAC domain separation failed.");
  if ([...values].some((value) => value.includes(phone) || value.length !== 64)) {
    throw new Error("A persisted digest exposed raw input or used an unexpected length.");
  }
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
