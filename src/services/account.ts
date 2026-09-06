import { isDemoMode } from "./demo";
import { clearScheduledNavaNotifications } from "./notifications";
import { clearSecureFaceDraftsForUser } from "./secureFaceDraft";
import { supabase } from "./supabaseClient";
import { clearWatchAccountState } from "./watch";

function purgeAccountBrowserState(userId: string) {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.includes(userId)) storage.removeItem(key);
    }
  }
}

export async function deleteCurrentAccount(userId: string) {
  if (isDemoMode()) throw new Error("公开演示账号不能删除。");
  await Promise.all([
    clearSecureFaceDraftsForUser(userId),
    clearScheduledNavaNotifications(),
    clearWatchAccountState(userId),
  ]);
  purgeAccountBrowserState(userId);
  const { data, error } = await supabase.functions.invoke<{ deleted: boolean }>("delete-account", {
    body: { confirmation: "DELETE" },
  });
  if (error) throw error;
  if (!data?.deleted) throw new Error("账号删除服务没有返回成功状态。");
  await supabase.auth.signOut({ scope: "local" });
}
