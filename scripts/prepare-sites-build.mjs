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
    const hostedSrc = src.replace(/^(?:\.\/)?assets\//, "./");
    return `<script type="module" crossorigin src="${hostedSrc}"></script>`;
  },
);

// Sites publishes Vite's static assets at the deployment root. Keep the entry
// module external and give it the same URL identity used by lazy chunks. If the
// entry is inlined, a lazy chunk can import the external copy again, duplicating
// React contexts such as AuthContext after sign-in.
html = html.replace(
  /(<link rel="modulepreload"[^>]*href=")(?:\.\/)?assets\//g,
  "$1./",
);
html = html.replace(
  /(<link rel="icon"[^>]*href=")(?:\.\/)?assets\//g,
  "$1./",
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
