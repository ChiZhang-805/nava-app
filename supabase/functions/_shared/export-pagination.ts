type ExportPage<T> = { data: T[] | null; count: number | null; error: unknown };

export function exportOrderColumn(table: string) {
  const columns: Record<string,string> = {
    ai_rate_limit_windows:'window_start', active_user_sessions:'session_type',
    reward_cart_items:'product_id', watch_action_receipts:'action_id',
    user_app_preferences:'user_id', growth_progress_views:'user_id',
    user_reward_card_preferences:'user_id', user_mascot_wardrobe_preferences:'user_id',
  };
  return columns[table] ?? 'id';
}

/** Counts prevent a server-side row cap from masquerading as a complete export. */
export async function collectExportRows<T>(fetchPage: (from:number,to:number)=>PromiseLike<ExportPage<T>>): Promise<T[]> {
  const rows:T[]=[];
  let expected:number|undefined;
  for (;;) {
    const {data,count,error}=await fetchPage(rows.length,rows.length+499);
    if(error)throw error;
    if(count===null || !Number.isInteger(count) || count<0)throw new Error('Export row count unavailable. Please retry.');
    if(expected!==undefined && count!==expected)throw new Error('Records changed during export. Please retry.');
    expected=count;
    const page=data??[];
    if(!page.length && rows.length<count)throw new Error('Export is incomplete. Please retry.');
    rows.push(...page);
    if(rows.length===count)return rows;
    if(rows.length>count)throw new Error('Export count mismatch. Please retry.');
  }
}
