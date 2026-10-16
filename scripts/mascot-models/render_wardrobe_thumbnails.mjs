import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyProjectPublicEnv } from "../project-env.mjs";

applyProjectPublicEnv(process.cwd());
const accessoriesOnly = process.argv.includes('--accessories-only');
const server = await createServer({ server: { host: "127.0.0.1", port: 5284, strictPort: true }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  const url = server.resolvedUrls.local[0] + "__wardrobe-thumbnail";
  await page.route(url, (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><style>html,body{margin:0;background:transparent}canvas{width:512px;height:512px;display:block}</style><canvas></canvas>' }));
  await page.goto(url);
  await page.evaluate(async () => {
    const source = await (await fetch('/src/services/wardrobeScene.ts')).text();
    const moduleUrl = source.match(/import\s+\*\s+as\s+THREE\s+from\s+["']([^"']+)["']/)[1];
    const THREE = await import(moduleUrl);
    const originalRender = THREE.Scene.prototype.onBeforeRender;
    THREE.Scene.prototype.onBeforeRender = function (renderer, scene, camera, target) {
      window.thumbnailGraph = scene;
      return originalRender.call(this, renderer, scene, camera, target);
    };
    const { createWardrobeScene } = await import("/src/services/wardrobeScene.ts");
    try {
      window.thumbnailScene = await createWardrobeScene(document.querySelector("canvas"), new AbortController().signal);
      window.thumbnailScene.render();
    } finally { THREE.Scene.prototype.onBeforeRender = originalRender; }
  });
  const service = await readFile("src/services/mascotWardrobe.ts", "utf8");
  const ids = accessoriesOnly ? ['accessory-mist-beret', 'accessory-cloud-scarf'] : [...service.matchAll(/id: "(skin-[^"]+)", category: "skin"/g)].map((match) => match[1]);
  for (const id of ids) {
    const png = await page.evaluate(({ id, accessoriesOnly }) => {
      thumbnailScene.setLook(accessoriesOnly ? 'skin-cream' : id, accessoriesOnly ? [id] : []);
      thumbnailScene.setAngle(0); thumbnailScene.setMotion(null, 0);
      // A fallback overlay needs the cat's occlusion, without drawing its color.
      // Render the cat first so rear hat/scarf surfaces remain behind its depth.
      thumbnailGraph.traverse((object) => {
        if (!object.isSkinnedMesh) return;
        object.renderOrder = accessoriesOnly ? -1 : 0;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          material.colorWrite = !accessoriesOnly;
          material.depthWrite = true;
        }
      });
      thumbnailScene.render();
      return document.querySelector('canvas').toDataURL('image/png');
    }, { id, accessoriesOnly });
    const filename = accessoriesOnly ? `${id}.png` : `mascot-${id.slice(5)}.png`;
    await writeFile(resolve(`src/assets/wardrobe/${filename}`), Buffer.from(png.split(',')[1], 'base64'));
  }
  await page.evaluate(() => thumbnailScene.dispose());
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Rendered ${ids.length} transparent wardrobe thumbnails from the shipped model.`);
} finally {
  await browser.close();
  await server.close();
}
