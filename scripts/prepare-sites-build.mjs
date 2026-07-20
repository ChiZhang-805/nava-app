import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

mkdirSync(join(dist, "server"), { recursive: true });
mkdirSync(join(dist, ".openai"), { recursive: true });
copyFileSync(join(root, ".openai", "hosting.json"), join(dist, ".openai", "hosting.json"));

writeFileSync(
  join(dist, "server", "index.js"),
  `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    if (!url.pathname.includes(".")) {
      const fallbackUrl = new URL("/index.html", url);
      return env.ASSETS.fetch(new Request(fallbackUrl, request));
    }

    return assetResponse;
  }
};
`,
);
