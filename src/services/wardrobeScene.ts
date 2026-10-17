import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { WardrobeAccessoryId, WardrobeSkinId } from "./mascotWardrobe";
import { normalizeWardrobeAngle, wardrobeFurPalettes } from "./wardrobeTurntable";
import { sampleWardrobeMascotMotion, wardrobeMascotMotions, type WardrobeMascotMotion } from "./wardrobeMascotMotion";
import { createWardrobeProps } from "./wardrobeProps";
import { sampleWardrobeClothMotion, wardrobeClothTargets } from "./wardrobeClothMotion";
import { normalizeWardrobeAccessories } from "./wardrobeAccessorySlots";
import { isWornAccessoryId, wardrobeWornModelUrls } from "./wardrobeWornModels";

const modelUrl = new URL("../assets/mascot/models/nava-wardrobe-cat.glb", import.meta.url).href;

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
  const baseLook = new THREE.Group();
  // The rigged base cat was authored with more empty room around its visible
  // fur than the complete worn models. Keep both states at the same apparent
  // size so removing an accessory does not make the cat shrink.
  baseLook.scale.setScalar(1.24);
  yaw.add(baseLook);
  const camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.7, -1.1, .1, 30);
  camera.position.set(0, .18, 7);
  camera.lookAt(0, .18, 0);
  const loader = new GLTFLoader();
  let cat: THREE.Group;
  let accessories = new THREE.Group();
  let clips: THREE.AnimationClip[];
  const load = async (url: string) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error("Wardrobe model could not be loaded");
    return loader.parseAsync(await response.arrayBuffer(), "");
  };
  try {
    const result = await load(modelUrl);
    if (signal.aborted) {
      disposeModel(result.scene);
      throw new Error("Wardrobe model could not be loaded");
    }
    cat = result.scene;
    clips = result.animations;
    if (wardrobeMascotMotions.some((motion) => !clips.some((clip) => clip.name === motion.clip))) {
      disposeModel(cat);
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
  baseLook.add(cat, accessories);

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
  let clothPose = sampleWardrobeClothMotion(null, 0);
  const props = createWardrobeProps(cat);
  baseLook.add(props.group);
  const wornMotion = new THREE.Group();
  const wornLayer = new THREE.Group();
  wornMotion.add(wornLayer);
  yaw.add(wornMotion);
  const wornModels = new Map<Exclude<WardrobeAccessoryId, "accessory-none">, THREE.Group>();
  let activeWornId: Exclude<WardrobeAccessoryId, "accessory-none"> | null = null;
  let wornRequest = 0;

  const prepareWornModel = (model: THREE.Group) => {
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 2.02 / Math.max(size.y, .001);
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, .02 - center.y * scale, -center.z * scale);
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const old = Array.isArray(object.material) ? object.material : [object.material];
      const next = old.map((source: THREE.MeshStandardMaterial) => {
        const map = source.map;
        if (map) {
          map.colorSpace = THREE.SRGBColorSpace;
          map.minFilter = THREE.LinearMipmapLinearFilter;
          map.magFilter = THREE.LinearFilter;
          map.generateMipmaps = true;
          map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          map.needsUpdate = true;
        }
        return new THREE.MeshBasicMaterial({
          color: source.color,
          map,
          side: source.side,
          transparent: source.transparent,
          opacity: source.opacity,
          alphaTest: source.alphaTest,
          vertexColors: source.vertexColors,
        });
      });
      object.material = Array.isArray(object.material) ? next : next[0];
      old.forEach((material) => material.dispose());
      object.castShadow = object.receiveShadow = false;
    });
    model.visible = false;
    wornLayer.add(model);
    return model;
  };

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
  baseLook.add(costume);
  scene.updateMatrixWorld(true);
  const attachments: { carrier: THREE.Group; bone: THREE.Object3D; inverseRest: THREE.Matrix4 }[] = [];
  const headwear = new Set(["mist-beret", "sailor-hat", "night-voyage-cap", "star-moon-clip", "cherry-bow", "mint-earmuffs", "laurel-crown", "lily-garland", "star-glasses"]);
  for (const [id, group] of accessoryGroups) {
    // Garment-specific anchors match the deformation envelope used during
    // fitting. Lower-chest fabric follows Body, while headwear follows Head.
    const requestedAnchor = typeof group.userData.followAnchor === "string" ? group.userData.followAnchor : null;
    const anchor = requestedAnchor && cat.getObjectByName(requestedAnchor)
      ? requestedAnchor
      : id === "accessory-cloud-backpack" ? "Anchor_Back" : headwear.has(id.replace("accessory-", "")) ? "Anchor_Head" : "Anchor_Chest";
    const bone = cat.getObjectByName(anchor);
    const carrier = new THREE.Group();
    costume.add(carrier);
    carrier.attach(group);
    accessoryRest.set(id, group.position.clone());
    if (bone) attachments.push({ carrier, bone, inverseRest: bone.matrixWorld.clone().invert() });
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const old = Array.isArray(object.material) ? object.material : [object.material];
      const next = old.map((material: THREE.MeshStandardMaterial) => new THREE.MeshBasicMaterial({ color: material.color, map: material.map, vertexColors: material.vertexColors, side: material.side, transparent: material.transparent, opacity: material.opacity, alphaTest: material.alphaTest }));
      object.material = Array.isArray(object.material) ? next : next[0];
      old.forEach((material) => material.dispose());
      object.castShadow = object.receiveShadow = false;
    });
  }
  baseLook.remove(accessories);
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
  const updateCloth = () => {
    for (const group of accessoryGroups.values()) group.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.morphTargetInfluences) return;
      for (const target of wardrobeClothTargets) {
        const index = object.morphTargetDictionary?.[target];
        if (index !== undefined) object.morphTargetInfluences[index] = group.visible ? clothPose[target] : 0;
      }
    });
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
  const resetWornMotion = () => {
    wornMotion.position.set(0, 0, 0);
    wornMotion.rotation.set(0, 0, 0);
    wornMotion.scale.set(1, 1, 1);
  };
  const selectWornModel = async (id: Exclude<WardrobeAccessoryId, "accessory-none"> | null) => {
    const request = ++wornRequest;
    canvas.dataset.wornModel = id ? `loading:${id}` : "none";
    if (!id) {
      activeWornId = null;
      for (const model of wornModels.values()) model.visible = false;
      baseLook.visible = true;
      wornMotion.visible = false;
      resetWornMotion();
      render();
      return;
    }
    let model = wornModels.get(id);
    if (!model) {
      try {
        const loaded = await load(wardrobeWornModelUrls[id]);
        if (destroyed) { disposeModel(loaded.scene); return; }
        model = prepareWornModel(loaded.scene);
        wornModels.set(id, model);
      } catch {
        if (destroyed || request !== wornRequest) return;
        canvas.dataset.wornModel = `error:${id}`;
        render();
        return;
      }
    }
    if (request !== wornRequest || destroyed) return;
    activeWornId = id;
    for (const candidate of wornModels.values()) candidate.visible = false;
    baseLook.visible = false;
    wornMotion.visible = true;
    resetWornMotion();
    model.visible = true;
    wornModels.delete(id);
    wornModels.set(id, model);
    while (wornModels.size > 3) {
      const oldestId = wornModels.keys().next().value as Exclude<WardrobeAccessoryId, "accessory-none">;
      if (oldestId === id) break;
      const oldest = wornModels.get(oldestId)!;
      wornLayer.remove(oldest);
      wornModels.delete(oldestId);
      disposeModel(oldest);
    }
    canvas.dataset.wornModel = id;
    render();
  };

  // Warm the browser HTTP cache after the initial cat is interactive. Parsing
  // and GPU upload still happen only for the selected model, so the wardrobe
  // stays within the existing three-model GPU budget while later choices avoid
  // a full network wait.
  const prefetchUrls = [...Object.values(wardrobeWornModelUrls)];
  const prefetch = async () => {
    const worker = async () => {
      while (prefetchUrls.length && !destroyed && !signal.aborted) {
        const url = prefetchUrls.shift();
        if (!url) return;
        try {
          const response = await fetch(url, { cache: "force-cache", signal, priority: "low" } as RequestInit & { priority: "low" });
          if (response.ok) await response.arrayBuffer();
        } catch {
          if (destroyed || signal.aborted) return;
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  };
  const prefetchHandle = window.setTimeout(() => { void prefetch(); }, 100);
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
      if (activeWornId) {
        resetWornMotion();
        if (motion && at > 0 && at < 1) {
          const pose = sampleWardrobeMascotMotion(motion, at);
          wornMotion.position.set(pose.x * .02, -pose.y * .02, 0);
          wornMotion.rotation.z = -pose.degrees * Math.PI / 180;
          wornMotion.scale.set(pose.scaleX, pose.scaleY, 1);
        }
        cancelAnimationFrame(frame);
        draw();
        return;
      }
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
      clothPose = sampleWardrobeClothMotion(motion, at);
      updateCloth();
      props.update(motion, at);
      cancelAnimationFrame(frame);
      draw();
    },
    setLook(skin, ids) {
      const selectedIds = normalizeWardrobeAccessories(ids);
      const wornId = selectedIds.find(isWornAccessoryId) ?? null;
      const palette = wardrobeFurPalettes[skin];
      uniform.navaVariant.value = skin === "skin-cream" ? 0 : 1;
      uniform.navaIvory.value.set(palette[0]);
      uniform.navaEdge.value.set(palette[1]);
      uniform.navaInk.value.set(palette[2]);
      uniform.navaFaceInk.value.set(palette[3]);
      uniform.navaStars.value = skin === "skin-star-sand" ? 1 : skin === "skin-mica-silver" ? .2 : 0;
      for (const [id, group] of accessoryGroups) {
        group.visible = selectedIds.includes(id as WardrobeAccessoryId);
        group.position.copy(accessoryRest.get(id)!);
        group.traverse((object) => {
          if (object instanceof THREE.Mesh && object.morphTargetInfluences) object.morphTargetInfluences.fill(0);
        });
      }
      // setLook may happen halfway through an action. Restore the current
      // cloth bend after clearing prior morph weights, without restarting it.
      updateCloth();
      void selectWornModel(wornId);
      render();
    },
    render() { cancelAnimationFrame(frame); return draw(); },
    dispose() {
      destroyed = true;
      window.clearTimeout(prefetchHandle);
      cancelAnimationFrame(frame);
      observer.disconnect();
      mixer.stopAllAction();
      mixer.uncacheRoot(cat);
      disposeModel(props.group);
      disposeModel(cat);
      disposeModel(accessories);
      disposeModel(wornLayer);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
