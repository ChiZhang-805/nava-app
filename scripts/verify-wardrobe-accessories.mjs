import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Uses the real Vite-served createWardrobeScene and its actual camera/materials.
// No alternate model, viewer transforms, camera, light, or morph implementation.
// Run from repository root: node scripts/verify-wardrobe-accessories.mjs
// --base-url reuses an owned Vite server; otherwise start and close port 5295.
// NAVA_WARDROBE_EVIDENCE_DIR routes output to <root>/accessories; --output wins.
const repository = process.cwd();
applyProjectPublicEnv(repository);
const argv = process.argv.slice(2);
const option = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
let base = option('--base-url', null);
if (base) {
  if (/^\d+$/.test(base)) base = `http://127.0.0.1:${base}`;
  base = base.replace(/\/$/, '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('Use an owned local Vite server');
}
const port = Number(option('--port', '5295'));
const defaultOutput = process.env.NAVA_WARDROBE_EVIDENCE_DIR ? resolve(process.env.NAVA_WARDROBE_EVIDENCE_DIR, 'accessories') : resolve(repository, 'artifacts', 'test-runs', 'wardrobe-accessories');
const output = resolve(option('--output', defaultOutput));
let server;
const skin = 'skin-cream';
const cloud = 'accessory-cloud-scarf';
const bell = 'accessory-bell-collar';
const honey = 'accessory-honey-neck-warmer';
const aurora = 'accessory-aurora-scarf';
const beret = 'accessory-mist-beret';
const combinations = [
  { id: 'cloud-single', ids: [cloud] },
  { id: 'beret-single', ids: [beret] },
  { id: 'beret-cloud', ids: [beret, cloud] },
  { id: 'six-regions', ids: [beret, cloud, 'accessory-star-glasses', 'accessory-fish-brooch', 'accessory-raindrop-cape', 'accessory-cloud-backpack'] },
  { id: 'legacy-replacement', ids: [bell, beret, honey, 'accessory-sailor-hat', cloud] },
];
const angles = [0, 90, 180, 270];
const motions = ['bubble', 'starlight', 'blossom', 'snowfall'];
const report = {
  passed: false, startedAt: new Date().toISOString(), base, skin,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
  sourceStatus: execFileSync('git', ['status', '--short'], { cwd: repository, encoding: 'utf8' }).trim(),
  runtimeSourceSha256: createHash('sha256').update(await readFile(resolve(repository, 'src/services/wardrobeScene.ts'))).digest('hex'),
  method: 'Real /src/services/wardrobeScene.ts imported through Vite; native 512x512 transparent canvas, DPR1, unchanged runtime orthographic camera. Immediate WebGL readPixels compares all RGBA bytes. A temporary read-only Scene.onBeforeRender observer captures the real scene graph, then restores the hook. No model or render state is substituted.',
  coverage: { combinations: combinations.length, angles, motions, progress: [0, .42, 1], expectedMotionCases: 80, expectedMotionFrames: 240, resetSequences: 20, motionLookSequences: 20, cancellationChecks: 60 },
  limitations: 'Key poses only; exact endpoints and sampled attachment/morph states do not establish continuous collision freedom. Visual inspection of saved PNGs remains required.',
  loadedAssets: [], assetContract: null, camera: null, cases: [], resets: [], motionLookChanges: [], cancellations: [], warnings: [], errors: [],
};
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
const page = await context.newPage();
const assetReads = [];
page.on('pageerror', (error) => report.errors.push(`pageerror: ${error.message}`));
page.on('response', (response) => {
  if (!new URL(response.url()).pathname.endsWith('.glb')) return;
  assetReads.push((async () => {
    try {
      const bytes = await response.body();
      report.loadedAssets.push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } catch (error) { report.warnings.push(`asset fingerprint unavailable from browser cache: ${error.message}`); }
  })());
});

async function saveSnapshot(snapshot, filename) {
  const { png, ...metadata } = snapshot;
  if (filename) {
    const path = resolve(output, filename);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(png.split(',')[1], 'base64'));
    metadata.screenshot = filename;
  }
  return metadata;
}

function inspectSnapshot(snapshot, label) {
  if (!snapshot.rendered) report.errors.push(`${label}: runtime render returned false`);
  if (snapshot.width !== 512 || snapshot.height !== 512) report.errors.push(`${label}: drawing buffer changed size`);
  if (snapshot.opaquePixels === 0) report.errors.push(`${label}: empty render`);
  if (snapshot.transparentPixels === 0) report.errors.push(`${label}: background lost transparency`);
  if (JSON.stringify(snapshot.camera) !== JSON.stringify(report.camera)) report.errors.push(`${label}: runtime camera changed`);
  if (snapshot.graph.failures.length) report.errors.push(...snapshot.graph.failures.map((failure) => `${label}: ${failure}`));
}

try {
  if (!base) {
    server = await createServer({ root: repository, server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'silent' });
    await server.listen();
    base = server.resolvedUrls.local[0].replace(/\/$/, '');
  }
  report.base = base;
  const harnessUrl = `${base}/__wardrobe_runtime_neckwear_review__`;
  await page.route(harnessUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;width:512px;height:512px;background:transparent;overflow:hidden}canvas{display:block;width:512px;height:512px}</style></head><body><canvas id="runtime" width="512" height="512"></canvas></body></html>' }));
  await page.goto(harnessUrl, { waitUntil: 'domcontentloaded' });
  report.assetContract = await page.evaluate(async ({ skin, requiredIds }) => {
    // Import exactly the THREE module URL used by the transformed runtime.
    const source = await (await fetch('/src/services/wardrobeScene.ts')).text();
    const match = source.match(/import\s+\*\s+as\s+THREE\s+from\s+["']([^"']+)["']/);
    if (!match) throw new Error('Could not resolve the real runtime THREE module');
    const THREE = await import(match[1]);
    const { sampleWardrobeClothMotion } = await import('/src/services/wardrobeClothMotion.ts');
    const originalRender = THREE.Scene.prototype.onBeforeRender;
    let actualScene, actualCamera;
    THREE.Scene.prototype.onBeforeRender = function (renderer, scene, camera, target) {
      actualScene = scene; actualCamera = camera;
      return originalRender.call(this, renderer, scene, camera, target);
    };
    const canvas = document.querySelector('#runtime');
    const controller = new AbortController();
    let runtime;
    try {
      const { createWardrobeScene } = await import('/src/services/wardrobeScene.ts');
      runtime = await createWardrobeScene(canvas, controller.signal);
      runtime.setLook(skin, []); runtime.setAngle(0); runtime.setMotion(null, 0); runtime.render();
    } finally { THREE.Scene.prototype.onBeforeRender = originalRender; }
    if (!actualScene || !actualCamera) throw new Error('No actual runtime scene was rendered');
    const groups = [];
    actualScene.traverse((object) => { if (object.name.startsWith('accessory-')) groups.push(object); });
    const neckwear = groups;
    // An independent expectation for catalog slot arbitration, including old arrays.
    const slots = {
      neck: ['bell-collar', 'cloud-scarf', 'pearl-bow', 'honey-neck-warmer', 'aurora-scarf'],
      head: ['mist-beret', 'star-moon-clip', 'mint-earmuffs', 'laurel-crown', 'sailor-hat', 'cherry-bow', 'lily-garland', 'night-voyage-cap'],
      face: ['star-glasses'], chest: ['fish-brooch'], body: ['raindrop-cape'], back: ['cloud-backpack'],
    };
    const expectedIds = (ids) => {
      const last = new Map();
      for (const id of ids) for (const [slot, names] of Object.entries(slots)) if (names.includes(id.replace('accessory-', ''))) last.set(slot, id);
      return [...last.values()];
    };
    const restAnchors = new Map();
    const contractFailures = [];
    const meshContract = neckwear.map((group) => {
      const anchorName = group.userData.followAnchor;
      const anchor = typeof anchorName === 'string' ? actualScene.getObjectByName(anchorName) : null;
      if (!anchor) contractFailures.push(`${group.name}: missing or invalid followAnchor`);
      else restAnchors.set(anchorName, anchor.matrixWorld.clone());
      const meshes = [];
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const targets = Object.keys(object.morphTargetDictionary ?? {});
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const hasColor = object.geometry.hasAttribute('color');
        const color = object.geometry.getAttribute('color');
        const colorMin = [1, 1, 1], colorMax = [0, 0, 0];
        if (color) for (let vertex = 0; vertex < color.count; vertex++) {
          for (const [channel, value] of [color.getX(vertex), color.getY(vertex), color.getZ(vertex)].entries()) {
            colorMin[channel] = Math.min(colorMin[channel], value);
            colorMax[channel] = Math.max(colorMax[channel], value);
          }
        }
        if (materials.some((material) => !material.isMeshBasicMaterial || (hasColor && !material.vertexColors))) contractFailures.push(`${group.name}/${object.name}: unlit vertex color material not preserved`);
        const clothDeltaMax = {};
        for (const name of ['cloth_relax', 'cloth_lift']) {
          const index = object.morphTargetDictionary?.[name];
          const attribute = object.geometry.morphAttributes.position?.[index];
          if (!attribute) continue;
          let max = 0;
          const position = object.geometry.getAttribute('position');
          for (let vertex = 0; vertex < attribute.count; vertex++) {
            const x = attribute.getX(vertex) - (object.geometry.morphTargetsRelative ? 0 : position.getX(vertex));
            const y = attribute.getY(vertex) - (object.geometry.morphTargetsRelative ? 0 : position.getY(vertex));
            const z = attribute.getZ(vertex) - (object.geometry.morphTargetsRelative ? 0 : position.getZ(vertex));
            max = Math.max(max, Math.hypot(x, y, z));
          }
          clothDeltaMax[name] = max;
        }
        meshes.push({ name: object.name, targets, clothDeltaMax, vertexCount: object.geometry.getAttribute('position').count, hasVertexColors: hasColor, hasTexture: materials.some((material) => Boolean(material.map)), colorChannelRanges: hasColor ? colorMax.map((value, channel) => value - colorMin[channel]) : null, materials: materials.map((material) => ({ type: material.type, vertexColors: material.vertexColors })) });
      });
      if (!meshes.length) contractFailures.push(`${group.name}: no child meshes`);
      if (['accessory-cloud-scarf', 'accessory-aurora-scarf'].includes(group.name)) {
        for (const target of ['cloth_relax', 'cloth_lift']) if (!meshes.some((mesh) => mesh.clothDeltaMax[target] > .001)) contractFailures.push(`${group.name}: ${target} must actually bend geometry`);
        if (!meshes.some((mesh) => mesh.hasTexture || mesh.colorChannelRanges?.some((range) => range > .02) || (mesh.vertexCount > 10000 && mesh.targets.includes('cloth_relax') && mesh.targets.includes('cloth_lift')))) contractFailures.push(`${group.name}: missing authored cloth surface detail`);
      }
      return { id: group.name, anchor: anchorName, stackOrder: group.userData.stackOrder, meshes };
    });
    for (const id of requiredIds) if (!neckwear.some((group) => group.name === id)) contractFailures.push(`${id}: missing neckwear root`);
    const pixels = new Map();
    let currentIds = [];
    let currentMotion = null, currentProgress = 0;
    const cameraState = () => ({ type: actualCamera.type, left: actualCamera.left, right: actualCamera.right, top: actualCamera.top, bottom: actualCamera.bottom, near: actualCamera.near, far: actualCamera.far, position: actualCamera.position.toArray(), quaternion: actualCamera.quaternion.toArray() });
    const graphState = () => {
      const failures = [];
      const clothPose = sampleWardrobeClothMotion(currentMotion, currentProgress);
      const states = neckwear.map((group) => {
        const anchorName = group.userData.followAnchor;
        const anchor = actualScene.getObjectByName(anchorName);
        const carrier = group.parent;
        const yaw = carrier?.parent?.parent;
        let matrixError = null;
        if (anchor && yaw && restAnchors.has(anchorName)) {
          const expected = yaw.matrixWorld.clone().invert().multiply(anchor.matrixWorld).multiply(restAnchors.get(anchorName).clone().invert());
          matrixError = Math.max(...carrier.matrix.elements.map((number,index) => Math.abs(number - expected.elements[index])));
          if (matrixError > 1e-6) failures.push(`${group.name}: followAnchor delta error ${matrixError}`);
        } else failures.push(`${group.name}: followAnchor graph is incomplete`);
        if (group.visible !== currentIds.includes(group.name)) failures.push(`${group.name}: wrong visibility`);
        const meshes = [];
        group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const dictionary = object.morphTargetDictionary ?? {};
          const influences = object.morphTargetInfluences ?? [];
          const active = Object.entries(dictionary).filter(([,index]) => influences[index] !== 0).map(([name,index]) => ({ name, weight: influences[index] }));
          for (const [name,index] of Object.entries(dictionary)) {
            const expected = !group.visible ? 0 : name in clothPose ? clothPose[name] : 0;
            if (influences[index] !== expected) failures.push(`${group.name}/${object.name}: ${name}=${influences[index]}, expected ${expected}`);
          }
          meshes.push({ name: object.name, active });
        });
        return { id: group.name, visible: group.visible, anchor: anchorName, carrierMatrixError: matrixError, carrierMatrix: carrier?.matrix.toArray(), groupWorldMatrix: group.matrixWorld.toArray(), meshes };
      });
      return { failures, neckwear: states };
    };
    window.__neckwear = {
      runtime, controller, cameraState,
      select(ids, angle) { currentIds = expectedIds(ids); runtime.setLook(skin, ids); runtime.setAngle(angle); },
      motion(id, progress) { currentMotion = id; currentProgress = progress; runtime.setMotion(id, progress); },
      singleControl(ids) { return expectedIds(ids).at(-1); },
      async snapshot({ baselineKey, remember = false, withPng = true }) {
        const rendered = runtime.render();
        const gl = canvas.getContext('webgl2');
        const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
        // Copy/encode while the real WebGL drawing buffer is still valid.
        const png = withPng ? canvas.toDataURL('image/png') : null;
        let changedPixels = 0, changedChannels = 0, maxChannelDelta = 0, sumChannelDelta = 0, opaquePixels = 0, transparentPixels = 0;
        const reference = pixels.get(baselineKey);
        for (let offset = 0; offset < data.length; offset += 4) {
          if (data[offset+3] === 0) transparentPixels++; else opaquePixels++;
          let changed = false;
          if (reference) for (let channel = 0; channel < 4; channel++) {
            const delta = Math.abs(data[offset+channel] - reference[offset+channel]);
            if (delta) { changed = true; changedChannels++; maxChannelDelta = Math.max(maxChannelDelta, delta); sumChannelDelta += delta; }
          }
          if (changed) changedPixels++;
        }
        if (remember) pixels.set(baselineKey, data.slice());
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return { rendered, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, rgbaSha256: hash, opaquePixels, transparentPixels, comparedWithBaseline: Boolean(reference), changedPixels, changedChannels, maxChannelDelta, meanAbsoluteChannelDelta: sumChannelDelta/data.length, camera: cameraState(), graph: graphState(), png };
      },
    };
    return { failures: contractFailures, groups: meshContract, camera: cameraState() };
  }, { skin, requiredIds: [cloud, bell, honey, aurora, beret] });
  report.camera = report.assetContract.camera;
  if (report.assetContract.failures.length) throw new Error(`Final asset contract is not ready: ${report.assetContract.failures.join('; ')}`);
  // Allow ResizeObserver's initial callback; it uses the real 512x512 layout.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

  for (const combination of combinations) for (const angle of angles) {
    const directory = `${combination.id}/yaw-${String(angle).padStart(3, '0')}`;
    await page.evaluate(({ ids, angle }) => { window.__neckwear.select(ids, angle); window.__neckwear.motion(null, 0); }, { ids: combination.ids, angle });
    for (const motion of motions) {
      const label = `${combination.id}/${angle}/${motion}`;
      const key = `rest:${label}`;
      const frames = [];
      for (const progress of [0, .42, 1]) {
        const filename = progress === 0 ? (motion === motions[0] ? `${directory}/rest.png` : null) : progress === .42 ? `${directory}/${motion}-042.png` : null;
        const snapshot = await page.evaluate(async ({ motion, progress, key, withPng }) => {
          window.__neckwear.motion(motion, progress);
          return window.__neckwear.snapshot({ baselineKey: key, remember: progress === 0, withPng });
        }, { motion, progress, key, withPng: Boolean(filename) });
        inspectSnapshot(snapshot, `${label}@${progress}`);
        if (progress === .42 && snapshot.changedPixels === 0) report.errors.push(`${label}: midpoint did not change pixels`);
        if (progress === 1 && snapshot.changedPixels !== 0) report.errors.push(`${label}: ending changed ${snapshot.changedPixels} pixels from start`);
        frames.push({ progress, ...await saveSnapshot(snapshot, filename) });
      }
      report.cases.push({ combination: combination.id, ids: combination.ids, angle, motion, exactEndpoint: frames[2].changedPixels === 0, midpointChanged: frames[1].changedPixels > 0, frames });
    }
    // Switching away and back must preserve the exact single-item rest shape.
    const singleId = await page.evaluate((ids) => window.__neckwear.singleControl(ids), combination.ids);
    const resetKey = `reset:${combination.id}:${angle}`;
    const reset = { combination: combination.id, angle, singleId, stackingControlOnly: combination.ids.length === 1, frames: [] };
    for (const stage of ['single-before', 'stack', 'single-after']) {
      const ids = stage === 'stack' ? combination.ids : [singleId];
      const snapshot = await page.evaluate(async ({ ids, angle, stage, key }) => {
        window.__neckwear.motion(null, 0); window.__neckwear.select(ids, angle);
        return window.__neckwear.snapshot({ baselineKey: key, remember: stage === 'single-before', withPng: true });
      }, { ids, angle, stage, key: resetKey });
      inspectSnapshot(snapshot, `${combination.id}/${angle}/reset-${stage}`);
      if (stage === 'single-after' && snapshot.changedPixels !== 0) report.errors.push(`${combination.id}/${angle}: setLook single→stack→single retained ${snapshot.changedPixels} changed pixels`);
      reset.frames.push({ stage, ids, ...await saveSnapshot(snapshot, `${directory}/reset-${stage}.png`) });
    }
    reset.exactRestoration = reset.frames[2].changedPixels === 0;
    report.resets.push(reset);

    // Do not call setMotion between these look changes: doing so would hide a
    // setLook implementation that discards the current cloth deformation.
    const motionKey = `motion-look:${combination.id}:${angle}`;
    const motionLook = { combination: combination.id, angle, frames: [] };
    await page.evaluate(({ ids, angle }) => {
      window.__neckwear.select(ids, angle); window.__neckwear.motion('starlight', .42);
    }, { ids: combination.ids, angle });
    for (const stage of ['before', 'same-look', 'cloud', 'aurora', 'cloud-restored', 'restored']) {
      const snapshot = await page.evaluate(async ({ ids, angle, stage, key, cloud, aurora }) => {
        if (stage !== 'before') window.__neckwear.select(stage === 'aurora' ? [aurora] : ['cloud', 'cloud-restored'].includes(stage) ? [cloud] : ids, angle);
        if (stage === 'cloud' || stage === 'cloud-restored') return window.__neckwear.snapshot({ baselineKey: `${key}:cloud`, remember: stage === 'cloud', withPng: false });
        return window.__neckwear.snapshot({ baselineKey: key, remember: stage === 'before', withPng: false });
      }, { ids: combination.ids, angle, stage, key: motionKey, cloud, aurora });
      inspectSnapshot(snapshot, `${combination.id}/${angle}/motion-look-${stage}`);
      if (['same-look', 'cloud-restored', 'restored'].includes(stage) && snapshot.changedPixels !== 0) report.errors.push(`${combination.id}/${angle}: ${stage} changed the current action frame`);
      motionLook.frames.push({ stage, ...snapshot });
    }
    report.motionLookChanges.push(motionLook);

    // Explicit cancellation, start and end must clear cloth bends while
    // retaining the selected stack. A later setLook must not revive them.
    const cancelKey = `cancel-rest:${combination.id}:${angle}`;
    await page.evaluate(async (key) => {
      window.__neckwear.motion(null, 0);
      await window.__neckwear.snapshot({ baselineKey: key, remember: true, withPng: false });
    }, cancelKey);
    for (const [id, progress] of [[null, .42], ['starlight', 0], ['starlight', 1]]) {
      const snapshot = await page.evaluate(async ({ id, progress, ids, angle, key }) => {
        window.__neckwear.motion('starlight', .42);
        window.__neckwear.motion(id, progress);
        window.__neckwear.select(ids, angle);
        return window.__neckwear.snapshot({ baselineKey: key, withPng: false });
      }, { id, progress, ids: combination.ids, angle, key: cancelKey });
      inspectSnapshot(snapshot, `${combination.id}/${angle}/cancel-${id}-${progress}`);
      if (snapshot.changedPixels !== 0) report.errors.push(`${combination.id}/${angle}: cancellation/endpoints did not restore exact cloth rest`);
      report.cancellations.push({ combination: combination.id, angle, id, progress, ...snapshot });
    }
    await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ combination: combination.id, angle, endpointCases: 4, resetExact: reset.exactRestoration, errorsSoFar: report.errors.length }));
  }
  await Promise.all(assetReads);
  report.passed = report.errors.length === 0 && report.cases.length === 80 && report.resets.length === 20 && report.motionLookChanges.length === 20 && report.cancellations.length === 60;
} catch (error) {
  report.errors.push(error.stack ?? String(error));
} finally {
  await Promise.allSettled(assetReads);
  await page.evaluate(() => { window.__neckwear?.runtime.dispose(); window.__neckwear?.controller.abort(); }).catch(() => {});
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  if (server) await server.close();
}
console.log(`Actual runtime neckwear: ${report.passed ? 'PASS' : 'FAIL'}; ${report.cases.length}/80 motions; ${report.resets.length}/20 reset sequences. ${output}`);
if (!report.passed) process.exitCode = 1;
