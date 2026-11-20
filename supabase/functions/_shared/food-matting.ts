import { createAliyunV3Signature } from './phone-otp.ts';

// Official RPC contract: aliyun/alibabacloud-typescript-sdk,
// aidge-20260428/src/client.ts imageMattingWithOptions (2026-11-20).
function credentials() {
  const dedicatedId = Deno.env.get('AIDGE_ACCESS_KEY_ID_NAVA');
  const dedicatedSecret = Deno.env.get('AIDGE_ACCESS_KEY_SECRET_NAVA');
  if (dedicatedId || dedicatedSecret) {
    if (!dedicatedId || !dedicatedSecret) throw new Error('aidge_credentials_incomplete');
    return { accessKeyId: dedicatedId, accessKeySecret: dedicatedSecret };
  }
  // The user authorized the existing credentials in this NAVA cloud project.
  // Never pick up generic credentials in a local or unrelated project runtime.
  if (Deno.env.get('SUPABASE_URL') !== 'https://wxteapvwagvhhtrjrbim.supabase.co') throw new Error('aidge_not_configured');
  const accessKeyId = Deno.env.get('ALIYUN_ACCESS_KEY_ID');
  const accessKeySecret = Deno.env.get('ALIYUN_ACCESS_KEY_SECRET');
  if (!accessKeyId || !accessKeySecret) throw new Error('aidge_not_configured');
  return { accessKeyId, accessKeySecret };
}

export function hasFoodMattingCredentials() {
  try { credentials(); return true; } catch { return false; }
}

const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** Sends only the generated candidate, never the user's source photo. */
export async function matteGeneratedFood(sourceImageUrl: string, signal: AbortSignal): Promise<string> {
  if (!sourceImageUrl.startsWith('https://')) throw new Error('aidge_invalid_source');
  const host = 'aidge.cn-beijing.aliyuncs.com';
  // Omit TargetWidth/Height: Aidge otherwise crops/rescales the composition.
  const query = `BackGroundType=TRANSPARENT&ImageUrl=${encode(sourceImageUrl)}`;
  const signed = await createAliyunV3Signature({
    ...credentials(), method: 'POST', body: '', canonicalQuery: query,
    headers: { host, 'x-acs-action': 'ImageMatting', 'x-acs-version': '2026-04-28',
      'x-acs-date': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), 'x-acs-signature-nonce': crypto.randomUUID() },
  });
  const response = await fetch(`https://${host}/?${query}`, {
    method: 'POST', headers: { ...signed.headers, Authorization: signed.authorization }, signal,
  });
  if (!response.ok) {
    // Keep the provider's machine-readable reason, never its request/identity
    // details or signed URLs. A 403 alone cannot distinguish IAM from activation.
    const failure = await response.json().catch(() => null);
    const code = typeof failure?.Code === 'string' && /^[\w.]{1,48}$/.test(failure.Code)
      ? failure.Code.toLowerCase().replaceAll('.', '_') : `http_${response.status}`;
    throw new Error(`aidge_${code}`);
  }
  const data = await response.json();
  if (data?.Success !== true || typeof data?.Data?.ImageUrl !== 'string') {
    const code = typeof data?.Code === 'string' && /^[\w.]{1,60}$/.test(data.Code) ? data.Code.toLowerCase().replaceAll('.', '_') : 'invalid_response';
    throw new Error(`aidge_${code}`);
  }
  const image = new URL(data.Data.ImageUrl);
  if (!['http:', 'https:'].includes(image.protocol) || !image.hostname.endsWith('.aliyuncs.com') || image.username || image.password) throw new Error('aidge_invalid_result_url');
  image.protocol = 'https:';
  return image.toString();
}
