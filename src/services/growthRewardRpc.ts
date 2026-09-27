import { supabase } from "./supabaseClient";
import { growthRewardTimezone, isMissingGrowthRpc } from "./growthRewardContract";

/** Rolling-deployment compatibility only: never retry an authorization, network,
 * constraint or server failure via the old endpoint. Such failures must surface. */
export async function growthRewardRpc(name: "nava_reconcile_growth_rewards" | "nava_record_growth_activity" | "save_journal_entry", args: Record<string, unknown> = {}) {
  const v2 = name === "save_journal_entry" ? "nava_save_journal_entry_v2" : `${name}_v2`;
  const result = await supabase.rpc(v2, { ...args, p_timezone: growthRewardTimezone() });
  if (!isMissingGrowthRpc(result.error)) return result;
  console.warn("Journal reward migration is not available; using the previous server contract.");
  return supabase.rpc(name, args);
}
