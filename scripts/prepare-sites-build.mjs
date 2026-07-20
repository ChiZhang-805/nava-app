import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

mkdirSync(join(dist, "server"), { recursive: true });
mkdirSync(join(dist, ".openai"), { recursive: true });
copyFileSync(join(root, ".openai", "hosting.json"), join(dist, ".openai", "hosting.json"));

const indexHtmlPath = join(dist, "index.html");
let html = readFileSync(indexHtmlPath, "utf8");

html = html.replace(
  /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
  (_match, href) => {
    const css = readFileSync(join(dist, href.replace(/^\//, "")), "utf8");
    return `<style>${css}</style>`;
  },
);

html = html.replace(
  /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
  (_match, src) => {
    const js = readFileSync(join(dist, src.replace(/^\//, "")), "utf8").replace(/<\/script/gi, "<\\/script");
    return `<script type="module">${js}</script>`;
  },
);

writeFileSync(
  join(dist, "server", "index.js"),
  `const html = ${JSON.stringify(html)};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" || request.method === "HEAD") {
      if (url.pathname === "/" || !url.pathname.includes(".")) {
        return new Response(request.method === "HEAD" ? null : html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=60"
          }
        });
      }
    }

    return new Response("Not found", { status: 404 });
  }
};
`,
);
