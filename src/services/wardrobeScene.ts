import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { WardrobeAccessoryId, WardrobeSkinId } from "./mascotWardrobe";
import { normalizeWardrobeAngle, wardrobeFurPalettes } from "./wardrobeTurntable";
import { wardrobeMascotMotions, type WardrobeMascotMotion } from "./wardrobeMascotMotion";
import { createWardrobeProps } from "./wardrobeProps";

const modelUrl = new URL("../assets/mascot/models/nava-wardrobe-cat.glb", import.meta.url).href;
const accessoriesUrl = new URL("../assets/mascot/models/nava-wardrobe-accessories.glb", import.meta.url).href;

export type WardrobeScene = {
  setAngle: (degrees: number) => void;
  setLook: (skin: WardrobeSkinId, accessories: WardrobeAccessoryId[]) => void;
  setMotion: (motion: WardrobeMascotMotion | null, progress: number) => void;
  render: () => boolean;
  dispose: () => void;
};

function disposeModel(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const bitmaps = new Set<ImageBitmap>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  textures.forEach((texture) => {
    const image = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) bitmaps.add(image);
    texture.dispose();
  });
  bitmaps.forEach((bitmap) => bitmap.close());
  materials.forEach((material) => material.dispose());
}

export async function createWardrobeScene(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<WardrobeScene> {
  if (signal.aborted) throw new DOMException("Wardrobe loading cancelled", "AbortError");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  const abortLoading = () => { renderer.dispose(); renderer.forceContextLoss(); };
  signal.addEventListener("abort", abortLoading, { once: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const yaw = new THREE.Group();
  scene.add(yaw);
  const camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.7, -1.1, .1, 30);
  camera.position.set(0, .18, 7);
  camera.lookAt(0, .18, 0);
  const loader = new GLTFLoader();
  let cat: THREE.Group;
  let accessories: THREE.Group;
  let clips: THREE.AnimationClip[];
  const load = async (url: string) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error("Wardrobe model could not be loaded");
    return loader.parseAsync(await response.arrayBuffer(), "");
  };
  try {
    const results = await Promise.allSettled([load(modelUrl), load(accessoriesUrl)]);
    if (signal.aborted || results[0].status !== "fulfilled" || results[1].status !== "fulfilled") {
      for (const result of results) if (result.status === "fulfilled") disposeModel(result.value.scene);
      throw new Error("Wardrobe model could not be loaded");
    }
    cat = results[0].value.scene;
    clips = results[0].value.animations;
    accessories = results[1].value.scene;
    if (wardrobeMascotMotions.some((motion) => !clips.some((clip) => clip.name === motion.clip))) {
      disposeModel(cat);
      disposeModel(accessories);
      throw new Error("Wardrobe actions could not be loaded");
    }
  } catch (error) {
    signal.removeEventListener("abort", abortLoading);
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
  signal.removeEventListener("abort", abortLoading);

  const uniform = {
    navaVariant: { value: 0 },
    navaIvory: { value: new THREE.Color("#ffffff") },
    navaEdge: { value: new THREE.Color("#a4dce9") },
    navaInk: { value: new THREE.Color("#092a49") },
    navaFaceInk: { value: new THREE.Color("#092a49") },
    navaStars: { value: 0 },
  };
  cat.updateMatrixWorld(true);
  const position = new THREE.Vector3();
  cat.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    // Global rest coordinates remain stable while the whole look rotates.
    const input = object.geometry.getAttribute("position");
    const values = new Float32Array(input.count * 3);
    for (let index = 0; index < input.count; index++) {
      position.fromBufferAttribute(input, index).applyMatrix4(object.matrixWorld);
      position.toArray(values, index * 3);
    }
    object.geometry.setAttribute("navaRest", new THREE.BufferAttribute(values, 3));
    const oldMaterials: THREE.MeshBasicMaterial[] = Array.isArray(object.material) ? object.material : [object.material];
    const materials = oldMaterials.map((source) => new THREE.MeshBasicMaterial({
      map: source.map, color: source.color,
      side: source.side, transparent: source.transparent, opacity: source.opacity,
    }));
    object.castShadow = object.receiveShadow = false;
    object.material = Array.isArray(object.material) ? materials : materials[0];
    oldMaterials.forEach((material) => material.dispose());
    for (const material of materials) {
      const map = material.map;
      if (map) {
        // The continuous, padded atlas keeps navy UV borders clean when scaled.
        map.minFilter = THREE.LinearMipmapLinearFilter;
        map.magFilter = THREE.LinearFilter;
        map.generateMipmaps = true;
        map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        map.needsUpdate = true;
      }
      material.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
        Object.assign(shader.uniforms, uniform);
        shader.vertexShader = "attribute vec3 navaRest; varying vec3 navaPoint;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nnavaPoint = navaRest;");
        shader.fragmentShader = `uniform float navaVariant; uniform vec3 navaIvory; uniform vec3 navaEdge; uniform vec3 navaInk; uniform vec3 navaFaceInk; uniform float navaStars; varying vec3 navaPoint;\n` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
          if (navaVariant > .5) {
            vec3 original = diffuseColor.rgb;
            float brightness = max(original.r, max(original.g, original.b));
            float face = 1. - smoothstep(.80, 1.15, length(vec2((navaPoint.x + .20) / .42, (navaPoint.y - .24) / .30)));
            float marking = face * smoothstep(.45, .70, navaPoint.z) * smoothstep(.78, .98, min(original.r, min(original.g, original.b)));
            float ice = max(clamp((original.b - original.r) * 2.5, 0., 1.), smoothstep(.48, .81, navaPoint.y) * .65);
            float faceSide = face * smoothstep(.35, .65, navaPoint.z);
            vec3 fur = mix(navaIvory, navaEdge, ice * (1. - faceSide));
            vec3 ink = mix(navaInk, navaFaceInk, faceSide);
            fur = mix(ink, fur, smoothstep(.08, .95, brightness));
            float grain = fract(sin(dot(floor(navaPoint * 72.), vec3(17.13, 67.71, 43.19))) * 43758.5453);
            float stars = step(.996, grain) * navaStars * (1. - face);
            diffuseColor.rgb = mix(mix(fur, vec3(.76, .87, 1.), stars * .75), original, marking);
          }
        `);
      };
      material.customProgramCacheKey = () => "nava-wardrobe-rig-unlit-v2";
    }
  });
  // Rotate around the body axis, rather than the tail-inclusive bounding box.
  cat.position.x += .2;
  accessories.position.x += .2;
  camera.position.set(0, .03, 7);
  camera.lookAt(0, .03, 0);
  yaw.add(cat, accessories);

  const mixer = new THREE.AnimationMixer(cat);
  const actions = new Map(wardrobeMascotMotions.map((motion) => {
    const clip = clips.find((candidate) => candidate.name === motion.clip);
    if (!clip) throw new Error(`Missing wardrobe action: ${motion.clip}`);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    return [motion.id, action];
  }));
  const boneRest: { bone: THREE.Bone; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }[] = [];
  cat.traverse((object) => {
    if (object instanceof THREE.Bone) boneRest.push({ bone: object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() });
  });
  let activeMotion: WardrobeMascotMotion | null = null;
  const props = createWardrobeProps(cat);
  yaw.add(props.group);

  const accessoryGroups = new Map<string, THREE.Object3D>();
  const accessoryRest = new Map<string, THREE.Vector3>();
  accessories.traverse((object) => {
    if (object.name.startsWith("accessory-")) {
      accessoryGroups.set(object.name, object);
      accessoryRest.set(object.name, object.position.clone());
    }
  });
  // Existing garments are fitted in mascot space, then driven by the owning
  // bone's delta from rest. This avoids inheriting an unrelated bone-local axis.
  const costume = new THREE.Group();
  yaw.add(costume);
  scene.updateMatrixWorld(true);
  const attachments: { carrier: THREE.Group; bone: THREE.Object3D; inverseRest: THREE.Matrix4 }[] = [];
  const headwear = new Set(["mist-beret", "sailor-hat", "night-voyage-cap", "star-moon-clip", "cherry-bow", "mint-earmuffs", "laurel-crown", "lily-garland", "star-glasses"]);
  for (const [id, group] of accessoryGroups) {
    const anchor = id === "accessory-cloud-backpack" ? "Anchor_Back" : headwear.has(id.replace("accessory-", "")) ? "Anchor_Head" : "Anchor_Chest";
    const bone = cat.getObjectByName(anchor);
    const carrier = new THREE.Group();
    costume.add(carrier);
    carrier.attach(group);
    accessoryRest.set(id, group.position.clone());
    if (bone) attachments.push({ carrier, bone, inverseRest: bone.matrixWorld.clone().invert() });
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const old = Array.isArray(object.material) ? object.material : [object.material];
      const next = old.map((material: THREE.MeshStandardMaterial) => new THREE.MeshBasicMaterial({ color: material.color, map: material.map, side: material.side, transparent: material.transparent, opacity: material.opacity }));
      object.material = Array.isArray(object.material) ? next : next[0];
      old.forEach((material) => material.dispose());
      object.castShadow = object.receiveShadow = false;
    });
  }
  yaw.remove(accessories);
  accessories = costume;
  const inverseYaw = new THREE.Matrix4();
  const updateAttachments = (rest = false) => {
    scene.updateMatrixWorld(true);
    inverseYaw.copy(yaw.matrixWorld).invert();
    for (const { carrier, bone, inverseRest } of attachments) {
      if (rest) carrier.matrix.identity();
      else carrier.matrix.copy(inverseYaw).multiply(bone.matrixWorld).multiply(inverseRest);
      carrier.matrixAutoUpdate = false;
    }
    scene.updateMatrixWorld(true);
  };
  let destroyed = false;
  let frame = 0;
  const draw = () => {
    frame = 0;
    if (destroyed || renderer.getContext().isContextLost()) return false;
    renderer.render(scene, camera);
    return true;
  };
  const render = () => { if (!destroyed && !frame) frame = requestAnimationFrame(draw); };
  const resize = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const aspect = width / height;
    // Includes the tail at its widest yaw and the highest selectable headwear.
    const span = Math.max(2.12, 2.55 / aspect);
    camera.left = -span * aspect / 2;
    camera.right = span * aspect / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  return {
    setAngle(degrees) { yaw.rotation.y = normalizeWardrobeAngle(degrees) * Math.PI / 180; render(); },
    setMotion(motion, progress) {
      if (destroyed) return;
      const at = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
      if (!motion || at === 0 || at === 1) {
        mixer.stopAllAction();
        for (const rest of boneRest) {
          rest.bone.position.copy(rest.position);
          rest.bone.quaternion.copy(rest.quaternion);
          rest.bone.scale.copy(rest.scale);
        }
        activeMotion = null;
      } else {
        const action = actions.get(motion)!;
        if (activeMotion !== motion) { mixer.stopAllAction(); action.reset().play(); activeMotion = motion; }
        action.paused = true;
        action.time = at * action.getClip().duration;
        mixer.update(0);
      }
      updateAttachments(!motion || at === 0 || at === 1);
      props.update(motion, at);
      cancelAnimationFrame(frame);
      draw();
    },
    setLook(skin, ids) {
      const palette = wardrobeFurPalettes[skin];
      uniform.navaVariant.value = skin === "skin-cream" ? 0 : 1;
      uniform.navaIvory.value.set(palette[0]);
      uniform.navaEdge.value.set(palette[1]);
      uniform.navaInk.value.set(palette[2]);
      uniform.navaFaceInk.value.set(palette[3]);
      uniform.navaStars.value = skin === "skin-star-sand" ? 1 : skin === "skin-mica-silver" ? .2 : 0;
      for (const [id, group] of accessoryGroups) {
        group.visible = ids.includes(id as WardrobeAccessoryId);
        group.position.copy(accessoryRest.get(id)!);
      }
      // Every selected piece stays visible. Space overlapping garments only
      // while multiple pieces share the same attachment region.
      for (const region of ["neckwear", "headwear"]) {
        const selected = [...accessoryGroups.values()]
          .filter((group) => group.visible && group.userData.stackGroup === region)
          .sort((a, b) => Number(a.userData.stackOrder) - Number(b.userData.stackOrder));
        if (selected.length < 2) continue;
        selected.forEach((group, index) => {
          if (region === "neckwear") {
            group.position.y += ((selected.length - 1) / 2 - index) * .10 - (selected.length === 4 ? .02 : 0);
          } else {
            // Keep tailored ear openings on the same axis while hats stack.
            group.position.y += index * .16;
          }
        });
      }
      render();
    },
    render() { cancelAnimationFrame(frame); return draw(); },
    dispose() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      mixer.stopAllAction();
      mixer.uncacheRoot(cat);
      disposeModel(props.group);
      disposeModel(cat);
      disposeModel(accessories);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
