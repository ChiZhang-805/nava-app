import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeWardrobeAngle, wardrobeDragAngle, wardrobeFurPalettes } from "../src/services/wardrobeTurntable.ts";

test("rotation is continuous across either side of the full-turn seam", () => {
  for (const angle of [0, 360, -360, 720]) assert.equal(normalizeWardrobeAngle(angle), 0);
  assert.equal(normalizeWardrobeAngle(-.01), 359.99);
  assert.ok(Math.abs(normalizeWardrobeAngle(360.01) - .01) < 1e-8);
  assert.equal(normalizeWardrobeAngle(NaN), 0);
  assert.equal(wardrobeDragAngle(90, 6, 324), 90);
  assert.ok(Math.abs(wardrobeDragAngle(90, 6.01, 324) - 90.01) < 1e-8);
  assert.equal(wardrobeDragAngle(0, 366, 324), 0);
});

function glb(name: string) {
  const bytes = readFileSync(new URL(`../src/assets/mascot/models/${name}.glb`, import.meta.url));
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.toString("utf8", 20, 20 + length));
}

test("the shipped mascot is a volumetric mesh with embedded materials", () => {
  const model = glb("nava-wardrobe-cat");
  assert.ok(model.meshes.length >= 4);
  assert.ok(model.images.length >= 1);
  assert.ok(model.images.every((image: { bufferView?: number; uri?: string }) => image.bufferView !== undefined && !image.uri));
  for (const mesh of model.meshes) for (const primitive of mesh.primitives) {
    assert.ok(primitive.attributes.NORMAL !== undefined);
    assert.ok(primitive.attributes.TEXCOORD_0 !== undefined);
    assert.equal(primitive.attributes.COLOR_0, undefined, "baked colour must not be multiplied a second time");
  }
});

test("all existing skins and accessories have explicit 3D representations", () => {
  const service = readFileSync(new URL("../src/services/mascotWardrobe.ts", import.meta.url), "utf8");
  const skinIds = [...service.matchAll(/id: "(skin-[^"]+)", category: "skin"/g)].map((match) => match[1]);
  assert.deepEqual(Object.keys(wardrobeFurPalettes).sort(), skinIds.sort());
  const ids = [...service.matchAll(/id: "(accessory-[^"]+)", category: "accessory"/g)].map((match) => match[1]);
  const model = glb("nava-wardrobe-accessories");
  assert.ok(model.meshes.reduce((count: number, mesh: { primitives: unknown[] }) => count + mesh.primitives.length, 0) <= 70,
    "all accessories together must stay within the mobile draw-call budget");
  const names = model.nodes.filter((node: { name?: string }) => node.name?.startsWith("accessory-")).map((node: { name: string }) => node.name);
  assert.deepEqual(names.sort(), ids.sort());
  for (const node of model.nodes.filter((node: { name?: string }) => node.name?.startsWith("accessory-"))) {
    assert.ok(node.children.length > 0, `${node.name} needs actual geometry`);
  }
});
