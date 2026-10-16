import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeWardrobeAngle, wardrobeDragAngle, wardrobeFurPalettes } from "../src/services/wardrobeTurntable.ts";
import { wardrobeMascotMotions } from "../src/services/wardrobeMascotMotion.ts";

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
  assert.ok(model.meshes.length >= 1);
  assert.equal(model.skins.length, 1, "the cat needs a real deforming skeleton");
  assert.ok(model.skins[0].joints.length >= 9);
  assert.ok(model.images.length >= 1);
  assert.ok(model.images.every((image: { bufferView?: number; uri?: string }) => image.bufferView !== undefined && !image.uri));
  for (const mesh of model.meshes) for (const primitive of mesh.primitives) {
    assert.ok(primitive.attributes.NORMAL !== undefined);
    assert.ok(primitive.attributes.TEXCOORD_0 !== undefined);
    assert.ok(primitive.attributes.JOINTS_0 !== undefined);
    assert.ok(primitive.attributes.WEIGHTS_0 !== undefined);
    assert.equal(primitive.attributes.COLOR_0, undefined, "baked colour must not be multiplied a second time");
  }
});

test("exported skeletal actions move local joints and return to identical endpoints", () => {
  const model = glb("nava-wardrobe-cat");
  const bytes = readFileSync(new URL("../src/assets/mascot/models/nava-wardrobe-cat.glb", import.meta.url));
  const binStart = 20 + bytes.readUInt32LE(12) + 8;
  const floats = (index: number) => {
    const accessor = model.accessors[index];
    const view = model.bufferViews[accessor.bufferView];
    assert.equal(accessor.componentType, 5126);
    const components = ({ SCALAR: 1, VEC3: 3, VEC4: 4 } as Record<string, number>)[accessor.type];
    const stride = view.byteStride ?? components * 4;
    return Array.from({ length: accessor.count }, (_, row) => Array.from({ length: components }, (_, column) =>
      bytes.readFloatLE(binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + row * stride + column * 4)));
  };
  assert.deepEqual(model.animations.map((action: { name: string }) => action.name).sort(), wardrobeMascotMotions.map((motion) => motion.clip).sort());
  for (const motion of wardrobeMascotMotions) {
    const action = model.animations.find((item: { name: string }) => item.name === motion.clip);
    const movingJoints = new Set();
    for (const channel of action.channels) {
      const sampler = action.samplers[channel.sampler];
      const times = floats(sampler.input).map((row) => row[0]);
      const values = floats(sampler.output);
      assert.ok(Math.abs(times[0]) < 1e-6);
      assert.ok(Math.abs(times.at(-1)! * 1000 - motion.durationMs) < .01);
      for (let component = 0; component < values[0].length; component++) {
        assert.ok(Math.abs(values[0][component] - values.at(-1)![component]) < 1e-6, `${motion.id}: exact endpoint pose`);
      }
      if (values.some((row) => row.some((value, component) => Math.abs(value - values[0][component]) > .001))) {
        assert.ok(!sampler.interpolation || sampler.interpolation === "LINEAR", "moving tracks must interpolate continuously");
        movingJoints.add(model.nodes[channel.target.node].name);
      }
    }
    assert.ok(movingJoints.has("Head"), `${motion.id}: head should articulate`);
    assert.ok(movingJoints.size >= 3, `${motion.id}: local joints must move`);
    assert.equal(movingJoints.has("Root"), false, "actions must not replace the user's rotation");
  }
});

test("all existing skins and accessories have explicit 3D representations", () => {
  const service = readFileSync(new URL("../src/services/mascotWardrobe.ts", import.meta.url), "utf8");
  const skinIds = [...service.matchAll(/id: "(skin-[^"]+)", category: "skin"/g)].map((match) => match[1]);
  assert.deepEqual(Object.keys(wardrobeFurPalettes).sort(), skinIds.sort());
  const ids = [...service.matchAll(/id: "(accessory-[^"]+)", category: "accessory"/g)].map((match) => match[1]);
  const model = glb("nava-wardrobe-accessories");
  const anchorNames = new Set(glb("nava-wardrobe-cat").nodes.map((node: { name?: string }) => node.name));
  assert.ok(model.meshes.reduce((count: number, mesh: { primitives: unknown[] }) => count + mesh.primitives.length, 0) <= 70,
    "all accessories together must stay within the mobile draw-call budget");
  const names = model.nodes.filter((node: { name?: string }) => node.name?.startsWith("accessory-")).map((node: { name: string }) => node.name);
  assert.deepEqual(names.sort(), ids.sort());
  for (const item of [...model.nodes, ...model.meshes]) {
    assert.ok((item.weights ?? []).every((weight: number) => weight === 0), "an independent GLB load must start in the unstacked, still cloth shape");
  }
  for (const node of model.nodes.filter((node: { name?: string }) => node.name?.startsWith("accessory-"))) {
    assert.ok(node.children.length > 0, `${node.name} needs actual geometry`);
    assert.ok(anchorNames.has(node.extras?.followAnchor), `${node.name} needs its fitted attachment bone`);
    if (node.extras?.stackGroup !== "neckwear") continue;
    assert.equal(node.extras.followAnchor, "Body", "lower-chest garments must follow the fitted body envelope");
    const pending: number[] = [...node.children];
    while (pending.length) {
      const child = model.nodes[pending.pop()!];
      pending.push(...(child.children ?? []));
      if (child.mesh === undefined) continue;
      const mesh = model.meshes[child.mesh];
      const names: string[] = mesh.extras?.targetNames ?? [];
      const scarf = ["accessory-cloud-scarf", "accessory-aurora-scarf", "accessory-honey-neck-warmer"].includes(node.name);
      if (scarf) assert.ok(["cloth_relax", "cloth_lift"].every((name) => names.includes(name)), `${node.name}: preserve cloth motion channels`);
      for (const primitive of mesh.primitives) {
        assert.equal(primitive.targets?.length ?? 0, names.length, `${node.name}: export must retain all named shapes`);
        assert.ok((primitive.targets ?? []).every((target: { POSITION?: number }) => target.POSITION !== undefined));
      }
    }
  }
});
