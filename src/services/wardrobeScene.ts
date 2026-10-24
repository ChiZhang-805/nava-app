import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import type { WardrobeAccessoryId, WardrobeSkinId } from "./mascotWardrobe";
import { normalizeWardrobeAngle, wardrobeFurPalettes } from "./wardrobeTurntable";
import { wardrobeMascotMotions, type WardrobeMascotMotion } from "./wardrobeMascotMotion";
import { normalizeWardrobeAccessories } from "./wardrobeAccessorySlots";
import { isWornAccessoryId, wardrobeWornModelUrls } from "./wardrobeWornModels";

const modelUrl = new URL("../assets/mascot/models/nava-wardrobe-cat.glb", import.meta.url).href;
const textureUrl = new URL("../assets/mascot/models/canonical-cat-v9.jpg", import.meta.url).href;
type LookId = "none" | keyof typeof wardrobeWornModelUrls;
export type WardrobeScene = {
  setAngle: (degrees: number) => void;
  setLook: (skin: WardrobeSkinId, accessories: WardrobeAccessoryId[]) => void;
  prefetch: (ids: WardrobeAccessoryId[]) => void;
  setMotion: (motion: WardrobeMascotMotion | null, progress: number) => void;
  captureFrontFrames: () => string[];
  render: () => boolean;
  dispose: () => void;
};
type Rest = { bone: THREE.Bone; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };
type Look = { root: THREE.Group; mixer: THREE.AnimationMixer; actions: Map<WardrobeMascotMotion, THREE.AnimationAction>; rest: Rest[]; ball: THREE.Group; motion: WardrobeMascotMotion | null };
function closeTexture(texture: THREE.Texture) {
  const image = texture.source.data;
  texture.dispose();
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
}
function disposeModel(root: THREE.Object3D, shared?: THREE.Texture) {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>(), skeletons = new Set<THREE.Skeleton>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture && value !== shared) textures.add(value);
    }
  });
  textures.forEach(closeTexture); skeletons.forEach((s) => s.dispose()); materials.forEach((m) => m.dispose());
}
function yarnBall() {
  const group = new THREE.Group(); group.name = "YarnBallProp";
  group.add(new THREE.Mesh(new THREE.SphereGeometry(.102, 32, 20), new THREE.MeshBasicMaterial({ color: "#a58acc" })));
  const material = new THREE.MeshBasicMaterial({ color: "#c0a4e1" });
  for (let k = 0; k < 9; k++) {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(.4, .2, -1).normalize(), k * .51);
    const points = Array.from({ length: 121 }, (_, i) => {
      const a = Math.PI * 2 * i / 120;
      return new THREE.Vector3(.104 * Math.cos(a), .104 * Math.sin(a), -.025 * Math.sin(3 * a)).applyQuaternion(rotation);
    });
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 120, .0025, 5, true), material));
  }
  group.visible = false; return group;
}

export async function createWardrobeScene(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<WardrobeScene> {
  if (signal.aborted) throw new DOMException("Wardrobe loading cancelled", "AbortError");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), yaw = new THREE.Group(); scene.add(yaw);
  const camera = new THREE.OrthographicCamera(-1.3, 1.3, 1.2, -1.2, .1, 30);
  camera.position.set(0, .03, 7); camera.lookAt(0, .03, 0);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => url.endsWith("canonical-cat-v9.jpg") ? textureUrl : url);
  const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  const binary = new Map<LookId, Promise<ArrayBuffer>>();
  const pending = new Map<LookId, Promise<Look>>();
  const looks = new Map<LookId, Look>();
  let sharedTexture: THREE.Texture | undefined;
  let active: Look | null = null, selected: LookId = "none", requested: LookId = "none";
  let destroyed = false, frame = 0, revision = 0, prefetchRevision = 0;
  let currentMotion: WardrobeMascotMotion | null = null, currentProgress = 0, currentAngle = 0;
  const uniform = {
    navaVariant: { value: 0 }, navaIvory: { value: new THREE.Color("#ffffff") },
    navaEdge: { value: new THREE.Color("#a4dce9") }, navaInk: { value: new THREE.Color("#092a49") },
    navaFaceInk: { value: new THREE.Color("#092a49") }, navaStars: { value: 0 },
  };
  const draw = () => {
    frame = 0;
    if (destroyed || renderer.getContext().isContextLost()) return false;
    renderer.render(scene, camera); return true;
  };
  const render = () => { if (!destroyed && !frame) frame = requestAnimationFrame(draw); };
  const urlFor = (id: LookId) => id === "none" ? modelUrl : wardrobeWornModelUrls[id];
  const fetchModel = (id: LookId) => {
    let promise = binary.get(id);
    if (!promise) {
      promise = fetch(urlFor(id), { signal }).then((response) => {
        if (!response.ok) throw new Error("Wardrobe model could not be loaded");
        return response.arrayBuffer();
      }).catch((error) => { binary.delete(id); throw error; });
      binary.set(id, promise);
    }
    return promise;
  };
  const prepare = (gltf: GLTF): Look => {
    const root = gltf.scene; root.updateMatrixWorld(true);
    const canonical = root.getObjectByName("NAVA_Canonical_Cat");
    if (!canonical) throw new Error("Missing canonical cat");
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const isCat = object === canonical || object.parent === canonical;
      if (isCat) {
        const input = object.geometry.getAttribute("position"), values = new Float32Array(input.count * 3), point = new THREE.Vector3();
        for (let i = 0; i < input.count; i++) point.fromBufferAttribute(input, i).applyMatrix4(object.matrixWorld).toArray(values, i * 3);
        object.geometry.setAttribute("navaRest", new THREE.BufferAttribute(values, 3));
      }
      const old = Array.isArray(object.material) ? object.material : [object.material];
      const next = old.map((source: THREE.MeshStandardMaterial) => {
        // Blender's baked emission exports as emissiveTexture with a black
        // diffuse factor. Preserve that baked appearance in our unlit material.
        let map = source.map ?? source.emissiveMap;
        const color = !source.map && source.emissiveMap ? source.emissive : source.color;
        if (isCat && map) {
          if (sharedTexture && map !== sharedTexture) { closeTexture(map); map = sharedTexture; }
          else sharedTexture = map;
        }
        if (map) {
          map.colorSpace = THREE.SRGBColorSpace; map.minFilter = THREE.LinearMipmapLinearFilter;
          map.magFilter = THREE.LinearFilter; map.generateMipmaps = true;
          map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        }
        const material = new THREE.MeshBasicMaterial({ map, color, side: source.side, transparent: source.transparent, opacity: source.opacity, alphaTest: source.alphaTest });
        if (isCat) {
      material.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
        Object.assign(shader.uniforms, uniform);
        shader.vertexShader = "attribute vec3 navaRest; varying vec3 navaPoint;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nnavaPoint = navaRest;");
        shader.fragmentShader = `uniform float navaVariant; uniform vec3 navaIvory; uniform vec3 navaEdge; uniform vec3 navaInk; uniform vec3 navaFaceInk; uniform float navaStars; varying vec3 navaPoint;\n` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
          if (navaVariant > .5) {
            vec3 original = diffuseColor.rgb;
            float brightness = max(original.r, max(original.g, original.b));
            float face = 1. - smoothstep(.80, 1.15, length(vec2((navaPoint.x + .08) / .42, (navaPoint.y - .24) / .30)));
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
      material.customProgramCacheKey = () => "nava-wardrobe-canonical-v3";
        }
        return material;
      });
      object.material = Array.isArray(object.material) ? next : next[0]; old.forEach((m) => m.dispose());
      object.castShadow = object.receiveShadow = false;
      // Skin deformation extends beyond the rest bounds; never cull an articulated paw.
      object.frustumCulled = false;
    });
    // Every look shares the same body coordinates. Hats/tails never affect framing.
    root.scale.setScalar(1.1); root.position.set(.088, 0, -.308); root.visible = false; yaw.add(root);
    const mixer = new THREE.AnimationMixer(root), actions = new Map<WardrobeMascotMotion, THREE.AnimationAction>();
    for (const motion of wardrobeMascotMotions) {
      const clip = gltf.animations.find((c) => c.name === motion.clip);
      if (!clip) throw new Error(`Missing wardrobe action: ${motion.clip}`);
      const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; actions.set(motion.id, action);
    }
    const rest: Rest[] = [];
    root.traverse((bone) => { if (bone instanceof THREE.Bone) rest.push({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() }); });
    const ball = yarnBall(); root.getObjectByName("YarnBall")?.add(ball);
    return { root, mixer, actions, rest, ball, motion: null };
  };
  const evict = () => {
    for (const [id, look] of looks) {
      if (looks.size <= 4) break;
      if (look === active || id === requested) continue;
      looks.delete(id); yaw.remove(look.root); look.mixer.stopAllAction(); look.mixer.uncacheRoot(look.root); disposeModel(look.root, sharedTexture);
    }
  };
  const loadLook = (id: LookId): Promise<Look> => {
    const cached = looks.get(id);
    if (cached) { looks.delete(id); looks.set(id, cached); return Promise.resolve(cached); }
    const flight = pending.get(id); if (flight) return flight;
    const promise = (async () => {
      const bytes = await fetchModel(id);
      if (destroyed) throw new DOMException("Wardrobe disposed", "AbortError");
      const gltf = await loader.parseAsync(bytes, new URL(".", urlFor(id)).href);
      if (destroyed) { disposeModel(gltf.scene, sharedTexture); throw new DOMException("Wardrobe disposed", "AbortError"); }
      let look: Look;
      try { look = prepare(gltf); } catch (error) { disposeModel(gltf.scene, sharedTexture); throw error; }
      looks.set(id, look); return look;
    })().finally(() => pending.delete(id));
    pending.set(id, promise); return promise;
  };
  const pose = (look: Look) => {
    const at = currentProgress, motion = currentMotion;
    if (!motion || at === 0 || at === 1) {
      look.mixer.stopAllAction();
      for (const rest of look.rest) { rest.bone.position.copy(rest.position); rest.bone.quaternion.copy(rest.quaternion); rest.bone.scale.copy(rest.scale); }
      look.motion = null;
    } else {
      const action = look.actions.get(motion)!;
      if (look.motion !== motion) { look.mixer.stopAllAction(); action.reset().play(); look.motion = motion; }
      action.paused = true; action.time = at * action.getClip().duration; look.mixer.update(0);
    }
    look.ball.visible = motion === "yarn" && at > 0 && at < 1;
    look.root.updateMatrixWorld(true);
  };
  const select = async (id: LookId) => {
    requested = id;
    const request = ++revision; canvas.dataset.pendingModel = id;
    delete canvas.dataset.modelError;
    try {
      const look = await loadLook(id);
      if (destroyed || request !== revision) { evict(); return; }
      pose(look);
      if (active) active.root.visible = false;
      active = look; active.root.visible = true; selected = id;
      canvas.dataset.wornModel = id; delete canvas.dataset.pendingModel;
      evict(); render();
    } catch {
      if (destroyed || request !== revision) return;
      requested = selected; delete canvas.dataset.pendingModel;
      canvas.dataset.modelError = id;
      canvas.dispatchEvent(new CustomEvent("wardrobe-model-error", { detail: { id } })); render();
    }
  };
  const resize = () => {
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight), aspect = width / height;
    const span = Math.max(2.12, 2.55 / aspect);
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2; camera.top = span / 2; camera.bottom = -span / 2;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false); render();
  };
  const observer = new ResizeObserver(resize);
  const dispose = () => {
    if (destroyed) return; destroyed = true; revision++; prefetchRevision++;
    cancelAnimationFrame(frame); observer.disconnect(); signal.removeEventListener("abort", dispose);
    for (const look of looks.values()) { look.mixer.stopAllAction(); look.mixer.uncacheRoot(look.root); disposeModel(look.root, sharedTexture); }
    looks.clear(); binary.clear(); if (sharedTexture) closeTexture(sharedTexture);
    renderer.dispose(); renderer.forceContextLoss();
  };
  signal.addEventListener("abort", dispose, { once: true });
  try { active = await loadLook("none"); active.root.visible = true; canvas.dataset.wornModel = "none"; }
  catch (error) { dispose(); throw error; }
  observer.observe(canvas); resize();
  return {
    setAngle(degrees) { currentAngle = normalizeWardrobeAngle(degrees); yaw.rotation.y = currentAngle * Math.PI / 180; render(); },
    setMotion(motion, progress) {
      if (destroyed) return;
      currentMotion = motion; currentProgress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
      if (active) pose(active); cancelAnimationFrame(frame); draw();
    },
    setLook(skin, ids) {
      if (destroyed) return;
      const palette = wardrobeFurPalettes[skin];
      uniform.navaVariant.value = skin === "skin-cream" ? 0 : 1;
      uniform.navaIvory.value.set(palette[0]); uniform.navaEdge.value.set(palette[1]);
      uniform.navaInk.value.set(palette[2]); uniform.navaFaceInk.value.set(palette[3]);
      uniform.navaStars.value = skin === "skin-star-sand" ? 1 : skin === "skin-mica-silver" ? .2 : 0;
      const id = normalizeWardrobeAccessories(ids).find(isWornAccessoryId) ?? "none";
      if (id !== requested || canvas.dataset.modelError) void select(id);
      render();
    },
    prefetch(ids) {
      const generation = ++prefetchRevision;
      const queue = ids.filter(isWornAccessoryId);
      const worker = async () => {
        while (!destroyed && generation === prefetchRevision && queue.length) {
          const id = queue.shift()!;
          try { await fetchModel(id); } catch { /* A foreground selection can retry. */ }
        }
      };
      void worker(); void worker();
    },
    captureFrontFrames() {
      if (destroyed || !active || renderer.getContext().isContextLost()) return [];
      const savedMotion = currentMotion, savedProgress = currentProgress, savedAngle = currentAngle;
      const frames: string[] = [];
      yaw.rotation.y = 0;
      for (const progress of [0, .12, .24, .36, .48, .60, .72, .84, 1]) {
        currentMotion = progress === 0 || progress === 1 ? null : "wave";
        currentProgress = progress;
        pose(active);
        renderer.render(scene, camera);
        frames.push(canvas.toDataURL("image/png"));
      }
      currentMotion = savedMotion; currentProgress = savedProgress; currentAngle = savedAngle;
      yaw.rotation.y = savedAngle * Math.PI / 180;
      pose(active); renderer.render(scene, camera);
      return frames;
    },
    render() { cancelAnimationFrame(frame); return draw(); }, dispose,
  };
}
