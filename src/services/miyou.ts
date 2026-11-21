import { supabase } from './supabaseClient';

export type CareKind = 'food' | 'exercise' | 'rest';
export type CareItem = { id: string; kind: CareKind; name_zh: string; name_en: string; duration_minutes: number; asset: string };
export type SharedPet = { link_id: string; name: string; requested_by: string; accepted_at: string | null; timezone: string; created_at: string };
export type Friend = { id: string; peerId: string; name: string; avatar: string | null; status: 'pending' | 'accepted'; incoming: boolean; blocked: boolean; blockedByMe: boolean; unread: number; lastMessage: { body: string; at: string } | null; pet: SharedPet | null };
export type MiyouState = { registered: boolean; serverNow: string; me?: { id: string; name: string; avatar: string | null; code: string; codeExpiresAt: string }; catalog?: CareItem[]; friends?: Friend[] };
export type FriendMessage = { id: string; sender_id: string; body: string; created_at: string; expires_at: string; reply_id: string | null; quote: { body: string; senderId: string } | null };
export type CareEvent = { id: string; actor_id: string; item_id: string; started_at: string; ends_at: string };
export type PetState = { pet: SharedPet; active: CareEvent | null; today: CareKind[]; growth: number; history: CareEvent[]; serverNow: string };

export async function miyouRpc<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc('nava_miyou', { action, payload });
  if (error) throw error;
  if (data === null) throw new Error('miyou_empty_response');
  return data as T;
}

export function miyouError(error: unknown, zh: boolean) {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
  const code = String((error as { code?: string })?.code ?? '');
  const errors: Record<string, [string,string]> = {
    miyou_pet_busy: ['照料进行中','Care in progress'],
    miyou_invite_invalid: ['邀请码已失效，请让好友重新分享。','This code is unavailable. Ask your friend for a new one.'],
    miyou_blocked: ['这段会话已暂停。','This conversation is paused.'],
    miyou_rate_limit: ['操作有些频繁，请稍后再试。','Please wait a moment before trying again.'],
    miyou_reply_expired: ['引用的消息已不可用，请取消引用后发送。','The quoted message is unavailable. Remove the quote and send again.'],
    miyou_name_invalid: ['请缩短名字并确认不是空白。','Enter a shorter, non-empty name.'],
    miyou_forbidden: ['这段关系已变化，请返回刷新。','This friendship has changed. Go back and refresh.'],
    miyou_auth_required: ['请登录后使用咪友空间。','Sign in to use Miyou Space.'],
  };
  for (const [key, words] of Object.entries(errors)) if (message.includes(key)) return words[zh ? 0 : 1];
  if (code === 'PGRST202' || code === '42883') return zh ? '咪友空间暂未开放，请稍后再试。' : 'Miyou Space is not available yet. Please try later.';
  return zh ? '暂时未能连接，内容已保留，请重试。' : 'Could not connect. Your draft is kept. Please retry.';
}

export function chatTime(value: string, now: number, zh: boolean) {
  const date = new Date(value), today = new Date(now);
  const calendar = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  const days = calendar(today) - calendar(date);
  const time = date.toLocaleTimeString(zh ? 'zh-CN' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return time;
  if (days === 1) return `${zh ? '昨天' : 'Yesterday'} ${time}`;
  if (days === 2) return `${zh ? '前天' : 'Day before yesterday'} ${time}`;
  return `${date.toLocaleDateString(zh ? 'zh-CN' : 'en-GB', { month: 'numeric', day: 'numeric', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}) })} ${time}`;
}

export function careRemaining(endsAt: string, now: number) {
  const minutes = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}` : `${minutes}`;
}

export function careAsset(asset: string) {
  const safe = ['fish','chicken','pumpkin','shrimp','beef','egg','kibble','wetfood','wand','ball','treadmill','tunnel','climb','scratch'];
  return `${import.meta.env.BASE_URL}assets/${safe.includes(asset) ? `miyou/${asset}.png` : 'health-report/sleep.webp'}`;
}

export function animalAvatar(userId: string) {
  const animals = ['puppy','husky','kitten','bunny'];
  let hash = 2166136261;
  for (const char of userId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return `${import.meta.env.BASE_URL}assets/miyou/avatar-${animals[hash % animals.length]}.png`;
}

export async function resolveMiyouAvatar(reference: string | null | undefined) {
  if (!reference) return null;
  const prefix = 'storage://profile-avatars/';
  let path = reference.startsWith(prefix) ? reference.slice(prefix.length) : null;
  if (!path) {
    try {
      const url = new URL(reference);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      const marker = '/storage/v1/object/public/profile-avatars/';
      const offset = url.pathname.indexOf(marker);
      if (offset < 0) return url.href;
      path = decodeURIComponent(url.pathname.slice(offset + marker.length));
    } catch { return null; }
  }
  if (!path || path.split('/').some(part => !part || part === '..' || part === '.')) return null;
  const { data, error } = await supabase.storage.from('profile-avatars').createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}
