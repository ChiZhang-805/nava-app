import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "health.nava.mobile",
  appName: "NAVA",
  webDir: "dist",
  ios: {
    contentInset: "automatic",
  },
};

export default config;

