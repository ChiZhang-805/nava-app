import {
  buildSocialAuthorizationUrl,
  createSocialOAuthState,
  normalizeSocialReturnUrl,
  syntheticSocialEmail,
  verifySocialOAuthState,
} from "../_shared/social-oauth.ts";

const secret = "test-social-oauth-secret-with-at-least-thirty-two-characters";

Deno.test("social OAuth state is signed, scoped and expires", async () => {
  const now = Date.UTC(2026, 10, 8, 10, 0, 0);
  const state = await createSocialOAuthState(secret, {
    nonce: "fixed-nonce",
    now,
    provider: "wechat",
    returnTo: "nava://auth/callback",
  });
  const payload = await verifySocialOAuthState(secret, state, now + 60_000);
  if (payload.provider !== "wechat" || payload.returnTo !== "nava://auth/callback") throw new Error("State payload changed.");
  await verifySocialOAuthState(`${secret}-wrong`, state, now).then(
    () => { throw new Error("Tampered state was accepted."); },
    () => undefined,
  );
  await verifySocialOAuthState(secret, state, now + 11 * 60_000).then(
    () => { throw new Error("Expired state was accepted."); },
    () => undefined,
  );
});

Deno.test("social OAuth return targets are exact allow-list entries", () => {
  const allowed = ["https://nava.example/auth/callback"];
  if (normalizeSocialReturnUrl("nava://auth/callback", allowed) !== "nava://auth/callback") throw new Error("Native callback rejected.");
  if (normalizeSocialReturnUrl(allowed[0], allowed) !== allowed[0]) throw new Error("Configured callback rejected.");
  for (const unsafe of ["https://evil.example/auth/callback", "javascript:alert(1)", "https://nava.example/auth/callback?next=evil"]) {
    try {
      normalizeSocialReturnUrl(unsafe, allowed);
      throw new Error(`Unsafe callback accepted: ${unsafe}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unsafe callback")) throw error;
    }
  }
});

Deno.test("provider authorization URLs contain the expected OAuth contract", () => {
  const callbackUrl = "https://project.supabase.co/functions/v1/social-oauth/callback";
  const wechat = new URL(buildSocialAuthorizationUrl({ callbackUrl, clientId: "wx-app", provider: "wechat", state: "state" }));
  if (wechat.hostname !== "open.weixin.qq.com" || wechat.searchParams.get("scope") !== "snsapi_login") throw new Error("WeChat authorization URL is invalid.");
  const qq = new URL(buildSocialAuthorizationUrl({ callbackUrl, clientId: "qq-app", provider: "qq", state: "state" }));
  if (qq.hostname !== "graph.qq.com" || qq.searchParams.get("scope") !== "get_user_info") throw new Error("QQ authorization URL is invalid.");
});

Deno.test("social account aliases are stable and do not expose provider subjects", async () => {
  const first = await syntheticSocialEmail("qq", "client", "sensitive-openid");
  const second = await syntheticSocialEmail("qq", "client", "sensitive-openid");
  if (first !== second || first.includes("sensitive-openid") || !first.endsWith("@social.nava.app")) {
    throw new Error("Synthetic social account alias is unsafe or unstable.");
  }
});
