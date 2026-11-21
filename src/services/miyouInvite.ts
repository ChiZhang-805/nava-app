import { Capacitor, registerPlugin } from '@capacitor/core';
import { Share } from '@capacitor/share';

const contacts = registerPlugin<{ invite(options: { text: string }): Promise<{ status: 'sent' | 'cancelled' }> }>('NavaContactInvite');
export const canInviteContact = () => Capacitor.getPlatform() === 'ios';
export function inviteText(code: string, zh: boolean) {
  return zh ? `来 NAVA 的「咪友空间」加我为好友，一起陪伴纳瓦咪。我的邀请码：${code}` : `Join me in NAVA’s Miyou Space and care for Nava Mi together. My invite code: ${code}`;
}
export async function inviteContact(code: string, zh: boolean) {
  return contacts.invite({ text: inviteText(code, zh) });
}
export async function shareMiyouInvite(code: string, zh: boolean) {
  await Share.share({ title: zh ? '咪友空间' : 'Miyou Space', text: inviteText(code, zh) });
}
