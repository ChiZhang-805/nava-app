import { supabase } from './supabaseClient';
import { isDemoMode } from './demo';

export type FoodRenderJob = {
  id: string; source_kind: 'journal_entries' | 'nutrition_records'; source_id: string;
  item_key: string; source_revision: string; record_date: string;
  state: 'queued' | 'processing' | 'ready' | 'failed' | 'stale' | 'needs_details';
  input: { name: string | null; amount: string | null; photoPath: string | null; sourceItemId: string | null; meal: string | null };
  asset_path: string | null; evidence_kind: 'photo' | 'text' | null; updated_at: string;
};

/** Read only: no invoke, enqueue, retry, or model request may be made by a report. */
export async function getFoodRenderJobs(userId: string, start: string, end: string): Promise<FoodRenderJob[]> {
  if (isDemoMode()) return [];
  const rows: FoodRenderJob[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('food_render_jobs')
      .select('id,source_kind,source_id,item_key,source_revision,record_date,state,input,asset_path,evidence_kind,updated_at')
      .eq('user_id', userId).gte('record_date', start).lte('record_date', end).neq('state', 'stale')
      .order('updated_at', { ascending: false }).order('id').range(from, from + 499);
    // Compatible with a client rollout before the separately approved migration.
    if (error?.code === '42P01' || error?.code === 'PGRST205') return [];
    if (error) throw error;
    rows.push(...data as FoodRenderJob[]);
    if (data.length < 500) return rows;
  }
}

export async function resolveFoodRenderUrl(path: string) {
  const result = await supabase.storage.from('diet-renders').createSignedUrl(path, 1800);
  if (result.error) throw result.error;
  return result.data.signedUrl;
}
