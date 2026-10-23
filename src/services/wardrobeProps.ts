import * as THREE from "three";
import type { LegacyWardrobeMascotMotion as WardrobeMascotMotion } from "./wardrobeMascotMotion";

// Props occupy the same 3D space as the cat, including at side and rear angles.
// Their opacity and scale return to zero before the neutral pose is restored.
export function createWardrobeProps(cat: THREE.Object3D) {
  const group = new THREE.Group();
  const pieces = new Map<WardrobeMascotMotion, THREE.Group>();
  const materials = new Map<WardrobeMascotMotion, THREE.MeshBasicMaterial[]>();
  let current: WardrobeMascotMotion = "bubble";
  const begin = (id: WardrobeMascotMotion) => {
    current = id;
    const item = new THREE.Group();
    item.visible = false;
    pieces.set(id, item);
    materials.set(id, []);
    group.add(item);
    return item;
  };
  const material = (color: string, alpha = 1) => {
    const value = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    value.userData.opacity = alpha;
    materials.get(current)!.push(value);
    return value;
  };
  const sphere = (parent: THREE.Object3D, color: string, radius: number, position: number[], scale = [1, 1, 1], alpha = 1) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 12), material(color, alpha));
    mesh.position.fromArray(position);
    mesh.scale.fromArray(scale);
    parent.add(mesh);
    return mesh;
  };
  const rod = (parent: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3, radius: number, color: string) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 8), material(color));
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    parent.add(mesh);
  };
  const bubble = begin("bubble");
  sphere(bubble, "#b9f6ff", .105, [0, 0, 0], [1, 1, 1], .30);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.105, .005, 8, 40), material("#eeffff", .9));
  bubble.add(rim);
  sphere(bubble, "#ffffff", .025, [-.034, .04, .08], [1, .45, .4], .95);
  const star = begin("starlight");
  const shape = new THREE.Shape();
  for (let index = 0; index < 10; index++) {
    const angle = Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 ? .047 : .105;
    if (!index) shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    else shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  shape.closePath();
  const starMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .018, bevelEnabled: true, bevelSegments: 2, bevelSize: .007, bevelThickness: .007, steps: 1 }), material("#fff1b5"));
  star.add(starMesh);
  sphere(star, "#ffffff", .016, [-.02, .03, .035]);
  const flower = begin("blossom");
  rod(flower, new THREE.Vector3(0, -.35, 0), new THREE.Vector3(0, 0, 0), .011, "#8dd3b7");
  sphere(flower, "#9bdabd", .065, [-.04, -.22, 0], [1, .4, .30]);
  for (let index = 0; index < 5; index++) {
    const angle = index * Math.PI * 2 / 5;
    const petal = sphere(flower, index % 2 ? "#ffe9f2" : "#ffcfdf", .056, [Math.sin(angle) * .062, Math.cos(angle) * .062, 0], [.65, 1, .4]);
    petal.rotation.z = -angle;
  }
  sphere(flower, "#fff1b5", .035, [0, 0, .02], [1, 1, .5]);
  const snow = begin("snowfall");
  for (let index = 0; index < 3; index++) {
    const angle = index * Math.PI / 3;
    const end = new THREE.Vector3(Math.cos(angle) * .087, Math.sin(angle) * .087, 0);
    rod(snow, end.clone().negate(), end, .006, "#f6ffff");
    for (const sign of [-1, 1]) for (const branch of [-1, 1]) {
      const start = end.clone().multiplyScalar(sign * .67);
      const tip = new THREE.Vector3(Math.cos(angle + branch * .48), Math.sin(angle + branch * .48), 0).multiplyScalar(.082 * sign);
      rod(snow, start, tip, .0035, "#dbf8ff");
    }
  }
  const paw = new THREE.Vector3();
  const anchor = (name: string, fallback: THREE.Vector3) => {
    const bone = cat.getObjectByName(name);
    if (!bone) return paw.copy(fallback);
    bone.getWorldPosition(paw);
    return group.worldToLocal(paw);
  };
  const smooth = (value: number) => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
  return {
    group,
    update(id: WardrobeMascotMotion | null, at: number) {
      for (const [key, piece] of pieces) piece.visible = key === id && at > 0 && at < 1;
      if (!id || at <= 0 || at >= 1) return;
      const piece = pieces.get(id)!;
      const envelope = smooth(at / .18) * (1 - smooth((at - .65) / .23));
      for (const mat of materials.get(id)!) mat.opacity = envelope * Number(mat.userData.opacity);
      piece.scale.setScalar(.9 + .1 * smooth(at / .23));
      piece.rotation.set(0, 0, 0);
      if (id === "bubble") {
        const hand = anchor("Anchor_Paw_L", new THREE.Vector3(.15, -.6, .7)).clone().add(new THREE.Vector3(.03, .12, .08));
        piece.position.set(.30, -.14, .85).lerp(hand, smooth((at - .24) / .22));
        piece.scale.multiplyScalar(1 + .22 * smooth((at - .5) / .13));
      } else if (id === "starlight") {
        const hand = anchor("Anchor_Paw_R", new THREE.Vector3(-.15, -.6, .7)).clone().add(new THREE.Vector3(0, .14, .08));
        piece.position.set(-.26, .60, .85).lerp(hand, smooth((at - .10) / .38));
        piece.rotation.z = .12 * Math.sin(at * Math.PI * 2);
      } else if (id === "blossom") {
        piece.position.set(.25, .05, .90);
        piece.rotation.z = -.10 + .03 * Math.sin(at * Math.PI * 2);
      } else {
        piece.position.set(.09 * Math.sin(at * Math.PI * 2), .62 - .36 * smooth(at / .6), .97);
        piece.rotation.z = at * .7;
        piece.scale.setScalar(.85);
      }
    },
  };
}
