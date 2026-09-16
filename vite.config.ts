import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), ...(mode === "native" ? [{
    name: "exclude-desktop-preview-styles",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.endsWith("/styles/figma-v2.css")) return;
      const start = code.indexOf("/* Desktop-only device preview.");
      const end = code.indexOf("@media (prefers-reduced-motion: reduce)", start);
      if (start < 0 || end < 0) throw new Error("Native preview stylesheet boundary missing");
      return code.slice(0, start) + code.slice(end);
    },
  }] : [])],
  resolve: { alias: mode === "native" ? [
    { find: /^.*\/components\/DesktopDevicePreviewChrome$/, replacement: fileURLToPath(new URL("./src/preview-disabled.ts", import.meta.url)) },
    { find: /^.*\/services\/(previewEnvironment|previewPhoneSystem)$/, replacement: fileURLToPath(new URL("./src/preview-disabled.ts", import.meta.url)) },
  ] : [] },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: true,
      },
    },
  },
  server: {
    port: 5174,
  },
}));
