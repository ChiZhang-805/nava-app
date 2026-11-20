import { supabase } from './supabaseClient';
import { isDemoMode } from './demo';
import { resolveConsentFlag } from './consent';

/** A confirmed food photo is private evidence. Never store its data URL in a record. */
export async function uploadConfirmedFoodPhoto(userId: string, recordId: string, dataUrl: unknown) {
  if (isDemoMode() || dataUrl == null) return null;
  if (!/^[a-f0-9-]{36}$/i.test(userId) || !/^[a-f0-9-]{36}$/i.test(recordId)) throw new Error('记录标识无效。');
  if (typeof dataUrl !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 8 * 1024 * 1024) {
    throw new Error('照片格式无效，请重新选择照片。');
  }
  const { data: profile, error } = await supabase.from('profiles').select('health_data_consent,onboarding_answers').eq('id', userId).single();
  if (error) throw error;
  if (!resolveConsentFlag(profile.health_data_consent, profile.onboarding_answers?.healthDataConsent)) {
    throw new Error('请先在隐私设置中允许健康数据同步，再保存这张饮食照片。');
  }
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new Error('照片无法读取，请重新选择。');
  // A lost save acknowledgement must be retryable with the identical evidence
  // path; a new UUID on every click breaks the server's idempotent save contract.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const fingerprint = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const path = `${userId}/journal-food/${recordId}/${fingerprint}.jpg`;
  const uploaded = await supabase.storage.from('diet-photos').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (uploaded.error && Number((uploaded.error as { statusCode?: string | number }).statusCode) !== 409) throw new Error('照片还没存好，请保留当前记录并重试。');
  return path;
}
