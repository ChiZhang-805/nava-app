import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(process.cwd());
const workerPath = join(root, "dist", "server", "index.js");
assert.ok(existsSync(workerPath), "Sites worker artifact is missing; run npm run build first");

const worker = readFileSync(workerPath, "utf8");
const htmlLiteral = worker.match(/^const html = (.+);\r?\n\r?\nexport default/m)?.[1];
assert.ok(htmlLiteral, "Sites worker must embed the generated HTML document");

const html = JSON.parse(htmlLiteral);
const entryMatch = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
assert.ok(entryMatch, "Sites HTML must load the Vite entry as an external module");
assert.doesNotMatch(html, /<script type="module">[\s\S]+<\/script>/, "Sites HTML must not inline the Vite entry module");
assert.match(entryMatch[1], /^\.\/index-[A-Za-z0-9_-]+\.js$/, "Sites entry module must use the flattened deployment-root path");
assert.ok(
  existsSync(join(root, "dist", "assets", basename(entryMatch[1]))),
  "The external Sites entry must correspond to a generated Vite asset",
);
assert.doesNotMatch(html, /(?:src|href)="(?:\.\/)?assets\//, "Sites HTML must not retain nested asset URLs");
assert.ok(existsSync(join(root,"dist","assets","journal","index.html")),"Journal must be served from the Sites asset root");
assert.equal(readFileSync(join(root,"dist","assets","journal","js","nava-layout.js"),"utf8"),readFileSync(join(root,"public","journal","js","nava-layout.js"),"utf8"));

console.log("Sites artifact keeps one external entry-module identity.");
