import { Capacitor, registerPlugin } from "@capacitor/core";

interface StorageAdapter {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

interface NavaSecureStoragePlugin {
  getItem(options: { key: string }): Promise<{ value: string | null }>;
  setItem(options: { key: string; value: string }): Promise<void>;
  removeItem(options: { key: string }): Promise<void>;
}

const NavaSecureStorage = registerPlugin<NavaSecureStoragePlugin>("NavaSecureStorage");

/** Public web sessions intentionally remain scoped to the current browser tab. */
export const browserSessionStorage: StorageAdapter = {
  getItem(key) {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(key);
  },
  setItem(key, value) {
    if (typeof window !== "undefined") window.sessionStorage.setItem(key, value);
  },
  removeItem(key) {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(key);
  },
};

/**
 * Supabase auth storage with different, explicit trust boundaries:
 * - browser: current-tab sessionStorage;
 * - native iOS: app-isolated Keychain through NavaSecureStorage.
 *
 * Native failures deliberately reject instead of silently falling back to web storage.
 */
export const authSessionStorage: StorageAdapter = {
  getItem(key) {
    if (!Capacitor.isNativePlatform()) return browserSessionStorage.getItem(key);
    return NavaSecureStorage.getItem({ key }).then(({ value }) => value ?? null);
  },
  setItem(key, value) {
    if (!Capacitor.isNativePlatform()) return browserSessionStorage.setItem(key, value);
    return NavaSecureStorage.setItem({ key, value });
  },
  removeItem(key) {
    if (!Capacitor.isNativePlatform()) return browserSessionStorage.removeItem(key);
    return NavaSecureStorage.removeItem({ key });
  },
};

