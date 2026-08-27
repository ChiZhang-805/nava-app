import { errorResponse, jsonResponse, optionsResponse, readJson, requireUser, stringValue } from "../_shared/http.ts";

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
      const { data, error } = await adminClient.storage.from(bucket).list(user.id, { limit: 1000 });
      if (error && !/bucket not found|not found/i.test(error.message)) throw error;
      const paths = (data ?? []).filter((item) => item.id).map((item) => `${user.id}/${item.name}`);
      if (paths.length > 0) {
        const removed = await adminClient.storage.from(bucket).remove(paths);
        if (removed.error) throw removed.error;
      }
    }

    const { error } = await adminClient.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return jsonResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
});
