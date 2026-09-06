import { errorResponse, jsonResponse, optionsResponse, readJson, requireUser, stringValue } from "../_shared/http.ts";
import { accountHash, otpHmacSecret, phoneHash } from "../_shared/phone-otp.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const privateBuckets = ["diet-photos", "face-photos", "profile-avatars"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);
  try {
    const { user, adminClient } = await requireUser(req);
    const body = await readJson(req);
    if (stringValue(body.confirmation) !== "DELETE") throw new Error("删除确认无效。");
    if (!adminClient) throw new Error("账号删除服务尚未配置管理员密钥。");

    for (const bucket of privateBuckets) {
      const paths = await listOwnedFiles(adminClient, bucket, user.id);
      for (let offset = 0; offset < paths.length; offset += 100) {
        const removed = await adminClient.storage.from(bucket).remove(paths.slice(offset, offset + 100));
        if (removed.error) throw removed.error;
      }
    }

    await deleteAccountSecurityDigests(adminClient, user);

    const { error } = await adminClient.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return jsonResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
});

async function deleteAccountSecurityDigests(
  client: SupabaseClient,
  user: { email?: string; phone?: string; user_metadata?: Record<string, unknown> },
) {
  const accountIdentifiers = new Set<string>();
  const phoneIdentifiers = new Set<string>();
  const email = user.email?.trim().toLowerCase();
  if (email) accountIdentifiers.add(email);

  const possiblePhones: unknown[] = [user.phone, user.user_metadata?.phone];
  const aliasedPhone = email?.match(/^(1[3-9]\d{9})@phone\.nava\.app$/)?.[1];
  if (aliasedPhone) possiblePhones.push(aliasedPhone);
  for (const value of possiblePhones) {
    const phone = typeof value === "string" ? value.trim().replace(/^\+86/, "") : "";
    if (!/^1[3-9]\d{9}$/.test(phone)) continue;
    phoneIdentifiers.add(phone);
    accountIdentifiers.add(phone);
  }

  const secret = otpHmacSecret();
  const [accountDigests, phoneDigests] = await Promise.all([
    Promise.all([...accountIdentifiers].map((identifier) => accountHash(secret, identifier))),
    Promise.all([...phoneIdentifiers].map((phone) => phoneHash(secret, phone))),
  ]);

  if (accountDigests.length > 0) {
    const removed = await client.from("nava_auth_account_checks").delete().in("account_hash", accountDigests);
    if (removed.error) throw removed.error;
  }
  if (phoneDigests.length > 0) {
    const removed = await client.from("nava_phone_otp_challenges").delete().in("phone_hash", phoneDigests);
    if (removed.error) throw removed.error;
  }
  if (phoneIdentifiers.size > 0) {
    const legacy = await client.rpc("nava_delete_legacy_phone_codes", { p_phones: [...phoneIdentifiers] });
    if (legacy.error) throw legacy.error;
  }
}

async function listOwnedFiles(client: SupabaseClient, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 8) throw new Error(`私有存储目录层级异常：${bucket}`);
  const files: string[] = [];
  for (let offset = 0; ; offset += 1_000) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1_000, offset });
    if (error) {
      if (/bucket not found|not found/i.test(error.message)) return [];
      throw error;
    }
    const entries = data ?? [];
    for (const entry of entries) {
      if (!entry.name || entry.name === ".emptyFolderPlaceholder") continue;
      const path = `${prefix}/${entry.name}`;
      if (entry.id) files.push(path);
      else files.push(...await listOwnedFiles(client, bucket, path, depth + 1));
    }
    if (entries.length < 1_000) break;
  }
  return files;
}
