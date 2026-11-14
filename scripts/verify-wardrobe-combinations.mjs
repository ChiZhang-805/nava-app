import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applyProjectPublicEnv } from './project-env.mjs';

applyProjectPublicEnv(process.cwd());
const output = resolve(process.env.NAVA_WARDROBE_EVIDENCE_DIR ?? 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/wardrobe-combinations');
const heads = ['mist-beret','star-moon-clip','mint-earmuffs','laurel-crown','sailor-hat','cherry-bow','lily-garland','night-voyage-cap'];
const necks = ['bell-collar','cloud-scarf','pearl-bow','honey-neck-warmer','aurora-scarf'];
const angles = [0, 90, 180, 270];
const report = { passed: false, heads, necks, angles, cases: [], errors: [] };
await mkdir(output, { recursive: true });
const server = await createServer({ root: process.cwd(), server: { host: '127.0.0.1', port: 5296, strictPort: true }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', (error) => report.errors.push(error.message));
try {
  const url = `${server.resolvedUrls.local[0]}__wardrobe_40_combinations__`;
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><canvas id="c" width="512" height="512" style="width:512px;height:512px"></canvas>' }));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const source = await (await fetch('/src/services/wardrobeScene.ts')).text();
    const specifier = source.match(/import\s+\*\s+as\s+THREE\s+from\s+["']([^"']+)["']/)?.[1];
    if (!specifier) throw new Error('THREE module was not found');
    const THREE = await import(specifier);
    let scene;
    const original = THREE.Scene.prototype.onBeforeRender;
    THREE.Scene.prototype.onBeforeRender = function (...args) { scene = this; return original.apply(this, args); };
    const controller = new AbortController();
    const { createWardrobeScene } = await import('/src/services/wardrobeScene.ts');
    const runtime = await createWardrobeScene(document.querySelector('#c'), controller.signal);
    runtime.setLook('skin-cream', []); runtime.setAngle(0); runtime.setMotion(null, 0); runtime.render();
    THREE.Scene.prototype.onBeforeRender = original;
    window.__combo = {
      runtime, controller, scene,
      show(ids, angle) {
        runtime.setMotion(null, 0); runtime.setLook('skin-cream', ids); runtime.setAngle(angle); runtime.render();
        const visible = [];
        scene.traverse((object) => { if (object.name.startsWith('accessory-') && object.visible) visible.push(object.name); });
        const gl = document.querySelector('#c').getContext('webgl2');
        const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let opaque = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) opaque++;
        return { visible: visible.sort(), opaque };
      }
    };
  });
  for (const head of heads) for (const neck of necks) {
    const ids = [`accessory-${head}`, `accessory-${neck}`];
    const entry = { head, neck, frames: [] };
    for (const angle of angles) {
      const state = await page.evaluate(({ ids, angle }) => window.__combo.show(ids, angle), { ids, angle });
      const expected = [...ids].sort();
      if (JSON.stringify(state.visible) !== JSON.stringify(expected)) report.errors.push(`${head}+${neck}@${angle}: ${state.visible.join(',')}`);
      if (!state.opaque) report.errors.push(`${head}+${neck}@${angle}: empty render`);
      const filename = `${head}__${neck}__${angle}.png`;
      await page.locator('#c').screenshot({ path: resolve(output, filename) });
      entry.frames.push({ angle, filename, ...state });
    }
    report.cases.push(entry);
  }
  report.passed = report.errors.length === 0 && report.cases.length === 40 && report.cases.every((entry) => entry.frames.length === 4);
} catch (error) {
  report.errors.push(error.stack ?? String(error));
} finally {
  await page.evaluate(() => { window.__combo?.runtime.dispose(); window.__combo?.controller.abort(); }).catch(() => {});
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
console.log(`Wardrobe combinations: ${report.passed ? 'PASS' : 'FAIL'}; ${report.cases.length}/40 pairs × four angles. ${output}`);
if (!report.passed) process.exitCode = 1;
