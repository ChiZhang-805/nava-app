import { registerPlugin } from "@capacitor/core";

export type NativeAppleCredential = {
  identityToken: string;
  nonce: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  user: string;
};

type NavaAppleSignInPlugin = {
  signIn: () => Promise<NativeAppleCredential>;
};

type NavaExternalAuthPlugin = {
  start: (options: { url: string; callbackScheme: string }) => Promise<{ callbackUrl: string }>;
};

const applePlugin = registerPlugin<NavaAppleSignInPlugin>("NavaAppleSignIn");
const externalAuthPlugin = registerPlugin<NavaExternalAuthPlugin>("NavaExternalAuth");

export function requestNativeAppleCredential() {
  return applePlugin.signIn();
}

export async function openNativeSocialAuth(url: string) {
  const result = await externalAuthPlugin.start({ url, callbackScheme: "nava" });
  return result.callbackUrl;
}
