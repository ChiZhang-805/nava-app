import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import {
  buildSocialAuthorizationUrl,
  createSocialOAuthState,
  normalizeRegionalProvider,
  normalizeSocialReturnUrl,
  syntheticSocialEmail,
  verifySocialOAuthState,
  type RegionalSocialProvider,
} from "../_shared/social-oauth.ts";

type SocialIdentity = {
  avatarUrl?: string;
  clientId: string;
  displayName?: string;
  provider: RegionalSocialProvider;
  subject: string;
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

function stateSecret() {
  const secret = Deno.env.get("NAVA_SOCIAL_OAUTH_STATE_SECRET")?.trim()
    || requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (secret.length < 32) throw new Error("NAVA_SOCIAL_OAUTH_STATE_SECRET must contain at least 32 characters.");
  return secret;
}

function providerCredentials(provider: RegionalSocialProvider) {
  return provider === "wechat"
    ? { clientId: requiredEnv("WECHAT_APP_ID_NAVA"), clientSecret: requiredEnv("WECHAT_APP_SECRET_NAVA") }
    : { clientId: requiredEnv("QQ_APP_ID_NAVA"), clientSecret: requiredEnv("QQ_API_KEY_NAVA") };
}

function callbackUrl() {
  return `${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/social-oauth/callback`;
}

function configuredReturnUrls() {
  return (Deno.env.get("NAVA_SOCIAL_AUTH_REDIRECT_URLS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function noStoreHeaders(extra: HeadersInit = {}) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
}

function redirect(address: string) {
  return new Response(null, { status: 302, headers: noStoreHeaders({ Location: address }) });
}

function redirectToApp(returnTo: string, parameters: Record<string, string>) {
  const url = new URL(returnTo);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  return redirect(url.toString());
}

async function readJson<T>(response: Response, label: string): Promise<T> {
  const payload = await response.json().catch(() => null) as T | null;
  if (!response.ok || !payload) throw new Error(`${label}_HTTP_${response.status}`);
  return payload;
}

async function exchangeWeChat(code: string, redirectUri: string): Promise<SocialIdentity> {
  const { clientId, clientSecret } = providerCredentials("wechat");
  const tokenUrl = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  tokenUrl.search = new URLSearchParams({ appid: clientId, secret: clientSecret, code, grant_type: "authorization_code" }).toString();
  const token = await readJson<{ access_token?: string; openid?: string; unionid?: string; errcode?: number }>(
    await fetch(tokenUrl, { headers: noStoreHeaders() }),
    "WECHAT_TOKEN",
  );
  if (!token.access_token || !token.openid || token.errcode) throw new Error("WECHAT_TOKEN_INVALID");

  const profileUrl = new URL("https://api.weixin.qq.com/sns/userinfo");
  profileUrl.search = new URLSearchParams({ access_token: token.access_token, openid: token.openid, lang: "zh_CN" }).toString();
  const profile = await readJson<{ nickname?: string; headimgurl?: string; unionid?: string; errcode?: number }>(
    await fetch(profileUrl, { headers: noStoreHeaders() }),
    "WECHAT_PROFILE",
  );
  if (profile.errcode) throw new Error("WECHAT_PROFILE_INVALID");
  void redirectUri;
  return {
    avatarUrl: profile.headimgurl,
    clientId,
    displayName: profile.nickname,
    provider: "wechat",
    subject: profile.unionid || token.unionid || token.openid,
  };
}

async function exchangeQQ(code: string, redirectUri: string): Promise<SocialIdentity> {
  const { clientId, clientSecret } = providerCredentials("qq");
  const tokenUrl = new URL("https://graph.qq.com/oauth2.0/token");
  tokenUrl.search = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    fmt: "json",
  }).toString();
  const token = await readJson<{ access_token?: string; error?: number }>(
    await fetch(tokenUrl, { headers: noStoreHeaders() }),
    "QQ_TOKEN",
  );
  if (!token.access_token || token.error) throw new Error("QQ_TOKEN_INVALID");

  const identityUrl = new URL("https://graph.qq.com/oauth2.0/me");
  identityUrl.search = new URLSearchParams({ access_token: token.access_token, fmt: "json" }).toString();
  const identity = await readJson<{ client_id?: string; openid?: string; error?: number }>(
    await fetch(identityUrl, { headers: noStoreHeaders() }),
    "QQ_OPENID",
  );
  if (!identity.openid || identity.error || (identity.client_id && identity.client_id !== clientId)) {
    throw new Error("QQ_OPENID_INVALID");
  }

  const profileUrl = new URL("https://graph.qq.com/user/get_user_info");
  profileUrl.search = new URLSearchParams({
    access_token: token.access_token,
    oauth_consumer_key: clientId,
    openid: identity.openid,
    fmt: "json",
  }).toString();
  const profile = await readJson<{ nickname?: string; figureurl_qq_2?: string; figureurl_qq_1?: string; ret?: number }>(
    await fetch(profileUrl, { headers: noStoreHeaders() }),
    "QQ_PROFILE",
  );
  if (profile.ret && profile.ret !== 0) throw new Error("QQ_PROFILE_INVALID");
  return {
    avatarUrl: profile.figureurl_qq_2 || profile.figureurl_qq_1,
    clientId,
    displayName: profile.nickname,
    provider: "qq",
    subject: identity.openid,
  };
}

async function createSessionLink(identity: SocialIdentity) {
  const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = await syntheticSocialEmail(identity.provider, identity.clientId, identity.subject);
  const metadata = {
    avatar_url: identity.avatarUrl,
    full_name: identity.displayName || (identity.provider === "wechat" ? "微信用户" : "QQ 用户"),
    social_provider: identity.provider,
  };
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { data: metadata },
  });
  if (error || !data.properties?.hashed_token || !data.user) throw error ?? new Error("SOCIAL_LINK_MISSING");
  const mergedMetadata = { ...data.user.user_metadata, ...metadata };
  const { error: updateError } = await admin.auth.admin.updateUserById(data.user.id, { user_metadata: mergedMetadata });
  if (updateError) throw updateError;
  return data.properties.hashed_token;
}

async function startFlow(url: URL) {
  const provider = normalizeRegionalProvider(url.searchParams.get("provider"));
  const returnTo = normalizeSocialReturnUrl(url.searchParams.get("return_to") ?? "", configuredReturnUrls());
  const credentials = providerCredentials(provider);
  const state = await createSocialOAuthState(stateSecret(), { provider, returnTo });
  return redirect(buildSocialAuthorizationUrl({
    callbackUrl: callbackUrl(),
    clientId: credentials.clientId,
    provider,
    state,
  }));
}

async function finishFlow(url: URL) {
  const stateValue = url.searchParams.get("state") ?? "";
  let state;
  try {
    state = await verifySocialOAuthState(stateSecret(), stateValue);
    state.returnTo = normalizeSocialReturnUrl(state.returnTo, configuredReturnUrls());
  } catch (error) {
    console.error("Social OAuth state rejected", error);
    return new Response("Invalid or expired OAuth state.", { status: 400, headers: noStoreHeaders() });
  }

  const providerError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (providerError || !code) {
    return redirectToApp(state.returnTo, {
      provider: state.provider,
      social_auth_error: providerError === "access_denied" || !code ? "access_denied" : "provider_rejected",
    });
  }

  try {
    const identity = state.provider === "wechat"
      ? await exchangeWeChat(code, callbackUrl())
      : await exchangeQQ(code, callbackUrl());
    const tokenHash = await createSessionLink(identity);
    return redirectToApp(state.returnTo, {
      provider: state.provider,
      token_hash: tokenHash,
      type: "magiclink",
    });
  } catch (error) {
    console.error(`Social OAuth ${state.provider} exchange failed`, error);
    return redirectToApp(state.returnTo, {
      provider: state.provider,
      social_auth_error: "provider_exchange_failed",
    });
  }
}

Deno.serve(async (request) => {
  if (request.method !== "GET") return new Response("GET required.", { status: 405, headers: noStoreHeaders() });
  const url = new URL(request.url);
  try {
    if (url.pathname.endsWith("/start")) return await startFlow(url);
    if (url.pathname.endsWith("/callback")) return await finishFlow(url);
    return new Response("Not found.", { status: 404, headers: noStoreHeaders() });
  } catch (error) {
    console.error("Social OAuth request failed", error);
    return new Response("Social sign-in is not configured.", { status: 503, headers: noStoreHeaders() });
  }
});
