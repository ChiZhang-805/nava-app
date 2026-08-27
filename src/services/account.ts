import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

export async function deleteCurrentAccount() {
  if (isDemoMode()) throw new Error("公开演示账号不能删除。");
  const { data, error } = await supabase.functions.invoke<{ deleted: boolean }>("delete-account", {
    body: { confirmation: "DELETE" },
  });
  if (error) throw error;
  if (!data?.deleted) throw new Error("账号删除服务没有返回成功状态。");
  await supabase.auth.signOut({ scope: "local" });
}
