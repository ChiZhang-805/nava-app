import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "health.nava.mobile",
  appName: "NAVA",
  webDir: "dist",
  ios: {
    // The web layer already owns every safe-area inset through viewport-fit=cover
    // and env(safe-area-inset-*). Letting WKWebView add another automatic inset
    // leaves an uncovered strip below the full-screen canvas on real iPhones.
    contentInset: "never",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
