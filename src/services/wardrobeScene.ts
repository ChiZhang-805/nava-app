import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { WardrobeAccessoryId, WardrobeSkinId } from "./mascotWardrobe";
import { normalizeWardrobeAngle, wardrobeFurPalettes } from "./wardrobeTurntable";

const modelUrl = new URL("../assets/mascot/models/nava-wardrobe-cat.glb", import.meta.url).href;
const accessoriesUrl = new URL("../assets/mascot/models/nava-wardrobe-accessories.glb", import.meta.url).href;

export type WardrobeScene = {
  setAngle: (degrees: number) => void;
  setLook: (skin: WardrobeSkinId, accessories: WardrobeAccessoryId[]) => void;
  render: () => boolean;
  dispose: () => void;
};

function disposeModel(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}

export async function createWardrobeScene(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<WardrobeScene> {
  if (signal.aborted) throw new DOMException("Wardrobe loading cancelled", "AbortError");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  const abortLoading = () => { renderer.dispose(); renderer.forceContextLoss(); };
  signal.addEventListener("abort", abortLoading, { once: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    accessories = results[1].value.scene;
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
    const materials = oldMaterials.map((source) => new THREE.MeshStandardMaterial({
      map: source.map, color: source.color, roughness: .98, metalness: 0,
      side: source.side, transparent: source.transparent, opacity: source.opacity,
    }));
    object.material = Array.isArray(object.material) ? materials : materials[0];
    oldMaterials.forEach((material) => material.dispose());
    for (const material of materials) {
      const map = material.map;
      if (map) {
        // Keep the small painted eye/nose strokes crisp across narrow UV islands.
        map.minFilter = THREE.LinearFilter;
        map.magFilter = THREE.LinearFilter;
        map.generateMipmaps = false;
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
            float face = 1. - smoothstep(.75, 1.15, length(vec2(navaPoint.x / .73, (navaPoint.y - .36) / .4)));
            float marking = face * smoothstep(.35, .55, navaPoint.z) * smoothstep(.78, .98, min(original.r, min(original.g, original.b)));
            float ice = max(clamp((original.b - original.r) * 2.5, 0., 1.), smoothstep(.78, 1.16, navaPoint.y) * .8);
            float faceSide = face * smoothstep(.1, .6, navaPoint.z);
            vec3 fur = mix(navaIvory, navaEdge, ice * (1. - faceSide));
            vec3 ink = mix(navaInk, navaFaceInk, faceSide);
            fur = mix(ink, fur, smoothstep(.08, .95, brightness));
            float grain = fract(sin(dot(floor(navaPoint * 72.), vec3(17.13, 67.71, 43.19))) * 43758.5453);
            float stars = step(.996, grain) * navaStars * (1. - face);
            diffuseColor.rgb = mix(mix(fur, vec3(.76, .87, 1.), stars * .75), original, marking);
          }
        `);
      };
      material.customProgramCacheKey = () => "nava-wardrobe-material-v1";
    }
  });
  // Both exported scenes use the same rest origin; the camera stays fixed.
  yaw.position.x = .2;
  cat.position.x -= .2;
  accessories.position.x -= .2;
  camera.position.x = .2;
  camera.lookAt(.2, .18, 0);
  yaw.add(cat, accessories);
  scene.add(new THREE.HemisphereLight(0xf4faff, 0xc3d9e7, 2.25));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
  keyLight.position.set(-3, 4, 5);
  scene.add(keyLight);

  const accessoryGroups = new Map<string, THREE.Object3D>();
  const accessoryRest = new Map<string, THREE.Vector3>();
  accessories.traverse((object) => {
    if (object.name.startsWith("accessory-")) {
      accessoryGroups.set(object.name, object);
      accessoryRest.set(object.name, object.position.clone());
    }
  });
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
    const span = Math.max(2.75, 3.5 / aspect);
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
            group.position.y += ((selected.length - 1) / 2 - index) * .16 - (selected.length === 4 ? .02 : 0);
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
      disposeModel(cat);
      disposeModel(accessories);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
