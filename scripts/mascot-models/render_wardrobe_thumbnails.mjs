import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyProjectPublicEnv } from "../project-env.mjs";

applyProjectPublicEnv(process.cwd());
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
    const { createWardrobeScene } = await import("/src/services/wardrobeScene.ts");
    window.thumbnailScene = await createWardrobeScene(document.querySelector("canvas"), new AbortController().signal);
  });
  const service = await readFile("src/services/mascotWardrobe.ts", "utf8");
  const ids = [...service.matchAll(/id: "(skin-[^"]+)", category: "skin"/g)].map((match) => match[1]);
  for (const id of ids) {
    await page.evaluate((skin) => { thumbnailScene.setLook(skin, []); thumbnailScene.setAngle(0); thumbnailScene.setMotion(null, 0); thumbnailScene.render(); }, id);
    await page.locator("canvas").screenshot({ path: resolve(`src/assets/wardrobe/mascot-${id.slice(5)}.png`), omitBackground: true });
  }
  await page.evaluate(() => thumbnailScene.dispose());
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Rendered ${ids.length} transparent wardrobe thumbnails from the shipped model.`);
} finally {
  await browser.close();
  await server.close();
}
