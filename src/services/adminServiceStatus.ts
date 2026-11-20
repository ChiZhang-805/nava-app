import { authenticatedFunctionHeaders, supabase } from './supabaseClient';
import type { AdminServiceSnapshot } from '../../supabase/functions/_shared/admin-service-contract';
export type { AdminServiceSnapshot, BalanceState, FunctionStatus, ServiceId, ServiceSignal } from '../../supabase/functions/_shared/admin-service-contract';

export class AdminServiceStatusError extends Error {
  constructor(readonly code: 'authentication_required' | 'administrator_required' | 'status_unavailable') { super(code); }
}

export async function loadAdminServiceStatus(signal?: AbortSignal): Promise<AdminServiceSnapshot> {
  let headers: Record<string, string>;
  try { headers = await authenticatedFunctionHeaders(); } catch { throw new AdminServiceStatusError('authentication_required'); }
  const result = await supabase.functions.invoke<AdminServiceSnapshot>('admin-service-status', {
    body: {}, headers, signal,
  });
  if (result.error) {
    const status = result.error.context instanceof Response ? result.error.context.status : undefined;
    throw new AdminServiceStatusError(status === 401 ? 'authentication_required' : status === 403 ? 'administrator_required' : 'status_unavailable');
  }
  const data = result.data;
  if (!data || data.version !== 1 || !Array.isArray(data.services) || !data.deepseek || !Array.isArray(data.deepseek.balances) || !data.foodActivity || !Number.isFinite(Date.parse(data.checkedAt))) throw new AdminServiceStatusError('status_unavailable');
  return data;
}
