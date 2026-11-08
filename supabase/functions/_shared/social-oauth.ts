export type RegionalSocialProvider = "wechat" | "qq";

export type SocialOAuthState = {
  exp: number;
  nonce: string;
  provider: RegionalSocialProvider;
  returnTo: string;
  version: 1;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function secureEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function normalizeRegionalProvider(value: unknown): RegionalSocialProvider {
  if (value === "wechat" || value === "qq") return value;
  throw new Error("SOCIAL_PROVIDER_INVALID");
}

export function normalizeSocialReturnUrl(value: string, configuredUrls: string[]) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SOCIAL_RETURN_URL_INVALID");
  }
  if (url.username || url.password || url.hash || url.search) throw new Error("SOCIAL_RETURN_URL_INVALID");
  const normalized = url.toString();
  if (normalized === "nava://auth/callback") return normalized;
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("SOCIAL_RETURN_URL_INVALID");
  const configured = configuredUrls.map((entry) => {
    try { return new URL(entry.trim()).toString(); } catch { return ""; }
  });
  if (!configured.includes(normalized)) throw new Error("SOCIAL_RETURN_URL_NOT_ALLOWED");
  return normalized;
}

export async function createSocialOAuthState(
  secret: string,
  input: { provider: RegionalSocialProvider; returnTo: string; now?: number; nonce?: string },
) {
  const payload: SocialOAuthState = {
    exp: Math.floor((input.now ?? Date.now()) / 1000) + 10 * 60,
    nonce: input.nonce ?? crypto.randomUUID(),
    provider: input.provider,
    returnTo: input.returnTo,
    version: 1,
  };
  const encoded = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${encoded}.${bytesToBase64Url(await hmac(secret, encoded))}`;
}

export async function verifySocialOAuthState(secret: string, state: string, now = Date.now()) {
  const [encoded, signature, ...rest] = state.split(".");
  if (!encoded || !signature || rest.length) throw new Error("SOCIAL_STATE_INVALID");
  const expected = await hmac(secret, encoded);
  if (!secureEqual(expected, base64UrlToBytes(signature))) throw new Error("SOCIAL_STATE_INVALID");
  const payload = JSON.parse(decoder.decode(base64UrlToBytes(encoded))) as SocialOAuthState;
  if (
    payload.version !== 1
    || !payload.nonce
    || payload.exp < Math.floor(now / 1000)
    || (payload.provider !== "wechat" && payload.provider !== "qq")
  ) throw new Error("SOCIAL_STATE_EXPIRED");
  return payload;
}

export function buildSocialAuthorizationUrl(input: {
  callbackUrl: string;
  clientId: string;
  provider: RegionalSocialProvider;
  state: string;
}) {
  const url = new URL(input.provider === "wechat"
    ? "https://open.weixin.qq.com/connect/qrconnect"
    : "https://graph.qq.com/oauth2.0/authorize");
  if (input.provider === "wechat") {
    url.searchParams.set("appid", input.clientId);
    url.searchParams.set("scope", "snsapi_login");
  } else {
    url.searchParams.set("client_id", input.clientId);
    url.searchParams.set("scope", "get_user_info");
  }
  url.searchParams.set("redirect_uri", input.callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  return input.provider === "wechat" ? `${url.toString()}#wechat_redirect` : url.toString();
}

export async function syntheticSocialEmail(provider: RegionalSocialProvider, clientId: string, subject: string) {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`nava-social:v1:${provider}:${clientId}:${subject}`),
  ));
  return `${provider}-${bytesToBase64Url(digest).toLowerCase()}@social.nava.app`;
}
