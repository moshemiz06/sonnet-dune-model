import * as THREE from 'three';
import { mulberry32 } from '../util.js';
import { PORT, heightAt } from './terrain.js';
import { makeStoneMaterial, nightUniform } from './materials.js';

const metal = (color, rough = 0.5, met = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: met });
const shade = (m) => {
  m.castShadow = m.receiveShadow = true;
  return m;
};

export function makeFrigate() {
  const g = new THREE.Group();
  g.name = 'Frigate';
  const hull = metal('#8d9096', 0.5, 0.3);
  const dark = metal('#3c3e44', 0.6, 0.4);
  const prof = [[0, 0], [13, 0], [18, 5], [19, 22], [17, 48], [12.5, 70], [7, 84], [0, 90]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = shade(new THREE.Mesh(new THREE.LatheGeometry(prof, 56), hull));
  body.position.y = 16;
  g.add(body);
  for (const y of [28, 46, 62]) {
    const band = shade(new THREE.Mesh(new THREE.TorusGeometry(y === 28 ? 19.1 : y === 46 ? 17.2 : 13.2, 0.9, 8, 56), dark));
    band.rotation.x = Math.PI / 2;
    band.position.y = 16 + y - 4;
    g.add(band);
  }
  const green = shade(new THREE.Mesh(new THREE.TorusGeometry(15.4, 1.4, 8, 56), new THREE.MeshStandardMaterial({ color: '#0c5a34', roughness: 0.6 })));
  green.rotation.x = Math.PI / 2;
  green.position.y = 16 + 56;
  g.add(green);
  // engine cluster
  for (let i = 0; i < 5; i++) {
    const a = (i / 4) * Math.PI * 2;
    const r = i === 4 ? 0 : 6.5;
    const e = shade(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 4.2, 9, 16, 1, true), dark));
    e.position.set(Math.cos(a) * r, 13, Math.sin(a) * r);
    e.material.side = THREE.DoubleSide;
    g.add(e);
  }
  // landing legs
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = shade(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 24, 8), dark));
    const top = new THREE.Vector3(Math.cos(a) * 15, 26, Math.sin(a) * 15);
    const foot = new THREE.Vector3(Math.cos(a) * 30, 1, Math.sin(a) * 30);
    leg.position.copy(top).add(foot).multiplyScalar(0.5);
    leg.lookAt(foot);
    leg.rotateX(Math.PI / 2);
    leg.scale.y = top.distanceTo(foot) / 24;
    g.add(leg);
    const pad = shade(new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 1.6, 14), dark));
    pad.position.copy(foot);
    pad.position.y = 0.8;
    g.add(pad);
  }
  // porthole rows
  const win = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 1.1, 0.6), new THREE.MeshStandardMaterial({ color: '#1c1c20', emissive: '#ffbe70', emissiveIntensity: 0 }), 48);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 48; i++) {
    const a = (i % 24) / 24 * Math.PI * 2;
    const row = i < 24 ? 0 : 1;
    const y = 16 + (row ? 42 : 34), r = row ? 17.6 : 18.3;
    e.set(0, -a + Math.PI / 2, 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), q, new THREE.Vector3(1, 1, 1));
    win.setMatrixAt(i, m);
  }
  win.frustumCulled = false;
  g.add(win);
  g.userData.windowMat = win.material;
  return g;
}

function makeLighter() {
  const g = new THREE.Group();
  const hull = metal('#8b8d92', 0.5, 0.55);
  const dark = metal('#35373c', 0.6, 0.6);
  const body = shade(new THREE.Mesh(new THREE.CapsuleGeometry(3, 11, 6, 16), hull));
  body.rotation.z = Math.PI / 2;
  body.position.y = 7;
  g.add(body);
  const wing = shade(new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 14), hull));
  wing.position.set(-1, 6.5, 0);
  g.add(wing);
  const fin = shade(new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.5, 0.4), dark));
  fin.position.set(-8, 10, 0);
  g.add(fin);
  for (const [x, z] of [[4, 2.6], [4, -2.6], [-5, 0]]) {
    const leg = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 5, 6), dark));
    leg.position.set(x, 2.5, z);
    g.add(leg);
  }
  return g;
}

export function createSpaceport() {
  const group = new THREE.Group();
  group.name = 'Spaceport';
  const rnd = mulberry32(77);
  const cx = PORT.x, cz = PORT.z, py = PORT.y;
  const lightMat = new THREE.MeshStandardMaterial({ color: '#ffe9c0', emissive: '#ffb86a', emissiveIntensity: 0 });
  const redMat = new THREE.MeshStandardMaterial({ color: '#ff9a8a', emissive: '#ff3b2a', emissiveIntensity: 0 });

  // frigate on the main pad
  const frigate = makeFrigate();
  frigate.position.set(cx + 10, py, cz - 6);
  group.add(frigate);

  // pad markings
  const ringMat = new THREE.MeshBasicMaterial({ color: '#e8dfc8', side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
  for (const [r0, r1] of [[54, 57], [30, 31.5]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 80), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx + 10, py + 0.35, cz - 6);
    group.add(ring);
  }
  // pad lights
  const ringLights = new THREE.InstancedMesh(new THREE.SphereGeometry(1.2, 8, 6), lightMat, 36);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    mm.makeTranslation(cx + 10 + Math.cos(a) * 60, py + 1.4, cz - 6 + Math.sin(a) * 60);
    ringLights.setMatrixAt(i, mm);
  }
  ringLights.frustumCulled = false;
  group.add(ringLights);

  // two lighters on smaller pads
  const lighters = [[cx - 80, cz + 70, 0.4], [cx + 108, cz + 72, -0.7]];
  for (const [x, z, ry] of lighters) {
    const l = makeLighter();
    l.position.set(x, py, z);
    l.rotation.y = ry;
    group.add(l);
    const ring = new THREE.Mesh(new THREE.RingGeometry(21, 22.5, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, py + 0.35, z);
    group.add(ring);
  }

  // control tower
  const stone = makeStoneMaterial({ color: '#cdbb98', windows: false });
  const tower = new THREE.Group();
  const shaft = shade(new THREE.Mesh(new THREE.CylinderGeometry(6.5, 8.5, 54, 20), stone));
  shaft.position.y = 27;
  tower.add(shaft);
  const cab = shade(new THREE.Mesh(new THREE.CylinderGeometry(13, 9, 9, 20), stone));
  cab.position.y = 58;
  tower.add(cab);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(11.6, 11.6, 6, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: '#7fb6c4', roughness: 0.1, metalness: 0.3, emissive: '#ffcf8a', emissiveIntensity: 0, side: THREE.DoubleSide }),
  );
  glass.position.y = 64;
  tower.add(glass);
  tower.userData.glass = glass.material;
  const roof = shade(new THREE.Mesh(new THREE.CylinderGeometry(13.5, 13.5, 1.6, 20), stone));
  roof.position.y = 67.8;
  tower.add(roof);
  const mast = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 14, 8), metal('#2c2c2c')));
  mast.position.y = 75;
  tower.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), redMat);
  beacon.position.y = 82.5;
  tower.add(beacon);
  const dish = new THREE.Group();
  const arm = shade(new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 2.4), metal('#444')));
  dish.add(arm);
  dish.position.y = 70;
  tower.add(dish);
  tower.position.set(cx - 100, py + 0.2, cz - 100);
  group.add(tower);

  // hangars: half-cylinder sheds
  const shedMat = makeStoneMaterial({ color: '#b9ab8c', windows: false });
  for (let i = 0; i < 3; i++) {
    const shed = shade(new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 64, 20, 1, false, 0, Math.PI), shedMat));
    shed.rotation.z = Math.PI / 2;
    shed.rotation.y = Math.PI / 2;
    shed.position.set(cx + 8 + i * 52, py, cz + 140);
    group.add(shed);
    const door = new THREE.Mesh(new THREE.BoxGeometry(28, 12, 0.6), metal('#403a33', 0.8, 0.3));
    door.position.set(cx + 8 + i * 52, py + 6, cz + 140 - 32.2);
    group.add(door);
  }
  // cargo containers
  const colors = ['#6b4a3a', '#2f4a3a', '#3b4a5a', '#8a6a3a', '#5a5a5e', '#7a3f2c'];
  const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.3 }), 70);
  const c = new THREE.Color(), q = new THREE.Quaternion();
  let n = 0;
  for (let stack = 0; stack < 14 && n < 70; stack++) {
    const bx = cx - 170 + (stack % 7) * 17, bz = cz + 35 + Math.floor(stack / 7) * 38 + (rnd() - 0.5) * 6;
    const levels = 1 + Math.floor(rnd() * 3);
    for (let lv = 0; lv < levels && n < 70; lv++) {
      for (let k = 0; k < 2 && n < 70; k++) {
        mm.compose(new THREE.Vector3(bx, py + 3.1 + lv * 6.2, bz + k * 13), q, new THREE.Vector3(8.5, 6, 12));
        boxes.setMatrixAt(n, mm);
        boxes.setColorAt(n, c.set(colors[Math.floor(rnd() * colors.length)]));
        n++;
      }
    }
  }
  boxes.count = n;
  boxes.castShadow = boxes.receiveShadow = true;
  boxes.frustumCulled = false;
  group.add(boxes);

  // perimeter lights
  const edge = new THREE.InstancedMesh(new THREE.SphereGeometry(1.1, 8, 6), lightMat, 56);
  for (let i = 0; i < 56; i++) {
    const a = (i / 56) * Math.PI * 2;
    const x = cx + Math.cos(a) * 182, z = cz + Math.sin(a) * 182;
    mm.makeTranslation(x, heightAt(x, z) + 1.4, z);
    edge.setMatrixAt(i, mm);
  }
  edge.frustumCulled = false;
  group.add(edge);

  const labelPos = new THREE.Vector3(cx + 10, py + 110, cz - 6);
  return {
    group,
    labelPos,
    update(t) {
      const n = nightUniform.value;
      lightMat.emissiveIntensity = n * 3.2;
      redMat.emissiveIntensity = (0.4 + 0.6 * (Math.sin(t * 3) > 0.4 ? 1 : 0.15)) * (0.6 + 0.4 * n) * 3;
      frigate.userData.windowMat.emissiveIntensity = n * 2.6;
      tower.userData.glass.emissiveIntensity = n * 1.8;
      dish.rotation.y = t * 1.2;
    },
  };
}
