import * as THREE from 'three';
import { nightUniform } from './materials.js';

const metal = (color, rough = 0.45, met = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: met });
const shade = (m) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

export const navMats = {
  red: new THREE.MeshStandardMaterial({ color: '#ff8a80', emissive: '#ff2a1a', emissiveIntensity: 1 }),
  green: new THREE.MeshStandardMaterial({ color: '#8affa0', emissive: '#18ff48', emissiveIntensity: 1 }),
  amber: new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: '#ffa830', emissiveIntensity: 1 }),
};

// A four-winged ornithopter. Local +Z is forward. `flap(t)` beats the wings.
export function makeOrnithopter({ scale = 2.2, hull = '#6a645a', wing = '#554f46', wingLen = 9.5, wingChord = 2.3, flapRate = 2.4 } = {}) {
  const g = new THREE.Group();
  g.name = 'Ornithopter';
  const root = new THREE.Group();
  g.add(root);
  root.scale.setScalar(scale);

  const hullM = metal(hull, 0.45, 0.35);
  const body = shade(new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 5.5, 6, 16), hullM));
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 0.82);
  root.add(body);
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 20, 14),
    new THREE.MeshStandardMaterial({ color: '#8fd2de', transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.25 }),
  );
  canopy.scale.set(0.95, 0.75, 1.6);
  canopy.position.set(0, 0.45, 1.5);
  root.add(canopy);
  const boom = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.5, 6.5, 10), hullM));
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0, -6.2);
  root.add(boom);
  const fin = shade(new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 1.9), hullM));
  fin.position.set(0, 0.9, -9.2);
  root.add(fin);
  const tail = shade(new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.3), hullM));
  tail.position.set(0, 0, -9.3);
  root.add(tail);
  for (const sx of [-1, 1]) {
    const skid = shade(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 5.5), hullM));
    skid.position.set(sx * 0.9, -1.35, 0.3);
    root.add(skid);
    const strut = shade(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), hullM));
    strut.position.set(sx * 0.9, -1.05, 1.6);
    root.add(strut);
  }

  const wingM = new THREE.MeshStandardMaterial({ color: wing, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
  const wings = [];
  const wingGeo = new THREE.BoxGeometry(wingLen, 0.1, wingChord);
  wingGeo.translate(wingLen / 2, 0, 0);
  const rodGeo = new THREE.CylinderGeometry(0.07, 0.1, wingLen, 6);
  rodGeo.rotateZ(Math.PI / 2);
  rodGeo.translate(wingLen / 2, 0, wingChord / 2 - 0.1);
  for (const side of [-1, 1]) {
    for (const [z, phase, len] of [[1.1, 0, 1], [-1.9, Math.PI * 0.55, 0.92]]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.9, 0.5, z);
      pivot.scale.set(side * len, 1, 1);
      const w = shade(new THREE.Mesh(wingGeo, wingM));
      pivot.add(w);
      const rod = shade(new THREE.Mesh(rodGeo, hullM));
      pivot.add(rod);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), side > 0 ? navMats.green : navMats.red);
      tip.position.set(wingLen, 0, 0);
      pivot.add(tip);
      root.add(pivot);
      wings.push({ pivot, phase, side });
    }
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), navMats.amber);
  beacon.position.set(0, 1.05, -9);
  root.add(beacon);

  return {
    group: g,
    flap(t, amp = 0.62) {
      for (const w of wings) w.pivot.rotation.z = w.side * amp * Math.sin(t * flapRate * Math.PI * 2 + w.phase);
    },
    fold() {
      for (const w of wings) w.pivot.rotation.z = w.side * -0.28;
    },
  };
}

// Heavy-lift carryall: stiff broad wings, long clamp frame underneath.
export function makeCarryall() {
  const orn = makeOrnithopter({ scale: 3.0, hull: '#756e62', wing: '#5f594f', wingLen: 12, wingChord: 3.2, flapRate: 0.9 });
  orn.group.name = 'Carryall';
  const root = orn.group.children[0];
  const clamp = metal('#2a2a2c', 0.6, 0.6);
  const frame = shade(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 8), clamp));
  frame.position.set(0, -1.8, 0);
  root.add(frame);
  for (const sx of [-1, 1]) {
    const arm = shade(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 7), clamp));
    arm.position.set(sx * 1.8, -1.8, 0);
    root.add(arm);
  }
  return orn;
}

// Spice harvester: tracked factory with a rotary intake. Local +Z is forward.
export function makeHarvester() {
  const g = new THREE.Group();
  g.name = 'Spice Harvester';
  const root = new THREE.Group();
  g.add(root);
  const body = metal('#c99a3a', 0.55, 0.35);
  const dark = metal('#2b2a28', 0.7, 0.4);
  const panel = metal('#5a4a34', 0.7, 0.3);

  const hull = shade(new THREE.Mesh(new THREE.BoxGeometry(17, 8, 32), body));
  hull.position.y = 10.5;
  root.add(hull);
  const deck = shade(new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 30), panel));
  deck.position.y = 14.8;
  root.add(deck);
  const cab = shade(new THREE.Mesh(new THREE.BoxGeometry(9, 5.5, 8), body));
  cab.position.set(0, 18, 9);
  root.add(cab);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(7.6, 2.6, 0.4),
    new THREE.MeshStandardMaterial({ color: '#9ad0dc', roughness: 0.05, metalness: 0.3, emissive: '#ffcf8a', emissiveIntensity: 0 }),
  );
  glass.position.set(0, 18.4, 13.1);
  root.add(glass);
  const hopper = shade(new THREE.Mesh(new THREE.BoxGeometry(13, 7, 12), body));
  hopper.position.set(0, 19, -9);
  root.add(hopper);
  const stack = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 8, 10), dark));
  stack.position.set(5.5, 22, -3);
  root.add(stack);
  // intake maw
  const maw = shade(new THREE.Mesh(new THREE.BoxGeometry(19, 5, 4), dark));
  maw.position.set(0, 6.5, 17);
  root.add(maw);
  const drum = shade(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 17, 14), metal('#d07a2a', 0.5, 0.5)));
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0, 4.2, 19);
  root.add(drum);
  // tracks (four bogies)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const t = shade(new THREE.Mesh(new THREE.BoxGeometry(3.6, 6.6, 14), dark));
      t.position.set(sx * 10.2, 3.3, sz * 9);
      root.add(t);
      for (const ez of [-1, 1]) {
        const wheel = shade(new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 3.6, 14), dark));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx * 10.2, 3.3, sz * 9 + ez * 7);
        root.add(wheel);
      }
    }
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), navMats.amber);
  beacon.position.set(-5, 21.2, 9);
  root.add(beacon);
  const mast = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 6), dark));
  mast.position.set(-5, 20.5, 9);
  root.add(mast);

  root.scale.setScalar(1.15);
  return {
    group: g,
    update(t, speed) {
      drum.rotation.x = t * 3 * speed;
      glass.material.emissiveIntensity = nightUniform.value * 1.6;
    },
  };
}
