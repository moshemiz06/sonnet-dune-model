import * as THREE from 'three';
import { mulberry32 } from '../util.js';
import { heightAt, CITY, RESIDENCY, roadDistance } from './terrain.js';
import { makeStoneMaterial, makeBannerTexture, nightUniform } from './materials.js';

const TIER_SPLIT = { 1: [1], 2: [0.62, 0.38], 3: [0.5, 0.3, 0.2] };
const SAND_TONES = ['#c9a97b', '#b89468', '#d4b88a', '#a8825a', '#c2a074', '#bfa07c', '#d9c196'];

function boxInstances(list, material, name) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  list.forEach((b, i) => {
    p.set(b.x, b.y + b.h / 2, b.z);
    s.set(b.w, b.h, b.d);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(b.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = name;
  return mesh;
}

function overlaps(a, b, margin) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + margin;
}

export function makeWindtrap(mat, slatMat) {
  const g = new THREE.Group();
  // side profile: broad base, tall tower, sloped top; the open intake is the +X face
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(22, 0);
  shape.lineTo(16, 50);
  shape.lineTo(6, 66);
  shape.lineTo(0, 66);
  shape.closePath();
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 26, bevelEnabled: false }), mat);
  body.position.set(-11, 2, -13);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const base = new THREE.Mesh(new THREE.BoxGeometry(34, 4, 38), mat);
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  // dark recessed intake with angled louvres stacked up the open face
  const lean = Math.atan2(6, 50);
  const recess = new THREE.Mesh(new THREE.BoxGeometry(1.2, 46, 21), slatMat);
  recess.position.set(-11 + 19.6, 2 + 26, 0);
  recess.rotation.z = -lean;
  g.add(recess);
  const louvre = new THREE.BoxGeometry(5, 0.9, 22);
  const louvreMat = new THREE.MeshStandardMaterial({ color: '#cbb590', roughness: 0.8 });
  for (let i = 0; i < 16; i++) {
    const y = 6 + i * 3;
    const x = 22 - (6 * y) / 50 - 11 + 2.2;
    const l = new THREE.Mesh(louvre, louvreMat);
    l.position.set(x, 2 + y, 0);
    l.rotation.z = -0.45;
    l.castShadow = true;
    g.add(l);
  }
  // vertical ribs
  for (const z of [-11.5, 0, 11.5]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(2.4, 50, 0.9), louvreMat);
    rib.position.set(-11 + 19.2, 2 + 26, z);
    rib.rotation.z = -lean;
    g.add(rib);
  }
  return g;
}

export function createCity() {
  const group = new THREE.Group();
  group.name = 'Arrakeen';
  const rnd = mulberry32(2024);
  const stone = makeStoneMaterial();
  const resStone = makeStoneMaterial({ color: '#cdb48c' });
  const plaster = makeStoneMaterial({ color: '#e7d7b8', windows: false });

  // --- Residency compound footprint (kept clear of the street grid)
  const R = RESIDENCY;
  const resRect = { x: R.x, z: R.z, w: R.w + 36, d: R.d + 36 };

  // --- Windtrap positions (also kept clear)
  const windtrapSpots = [
    [28, -322, 0], [62, -322, 0], [96, -322, 0],
    [-330, -290, Math.PI / 2], [-330, -258, Math.PI / 2], [-330, -226, Math.PI / 2],
  ];
  const trapRects = windtrapSpots.map(([x, z]) => ({ x, z, w: 44, d: 44 }));

  // --- Street-grid buildings
  const placed = [];
  const boxes = [];
  const domes = [];
  const tries = 5200;
  for (let n = 0; n < tries && placed.length < 520; n++) {
    const ang = rnd() * Math.PI * 2;
    const rad = Math.sqrt(rnd());
    const x = CITY.x + Math.cos(ang) * rad * CITY.rx * 0.9;
    const z = CITY.z + Math.sin(ang) * rad * CITY.rz * 0.9;
    const w = 10 + rnd() * 17, d = 10 + rnd() * 17;
    const cand = { x, z, w, d };
    if (Math.hypot((x - CITY.x) / CITY.rx, (z - CITY.z) / CITY.rz) > 0.84) continue;
    if (overlaps(cand, resRect, 6)) continue;
    if (trapRects.some((t) => overlaps(cand, t, 4))) continue;
    if (roadDistance(x, z) < 9 + Math.max(w, d) * 0.5) continue;
    if (placed.some((p) => overlaps(cand, p, 5))) continue;
    placed.push(cand);

    const centre = 1 - Math.min(1, Math.hypot((x - CITY.x) / CITY.rx, (z - CITY.z) / CITY.rz));
    let total = 9 + 11 * Math.pow(rnd(), 1.4) + centre * 8;
    if (rnd() < 0.06) total += 16 + rnd() * 12;
    const base = Math.min(heightAt(x - w / 2, z - d / 2), heightAt(x + w / 2, z + d / 2), heightAt(x, z)) - 3;
    const tint = new THREE.Color(SAND_TONES[Math.floor(rnd() * SAND_TONES.length)]);
    tint.offsetHSL(0, 0, (rnd() - 0.5) * 0.04);
    const tiers = total > 22 ? 3 : total > 14 ? 2 : 1;
    let y = base, cw = w, cd = d, cx = x, cz = z;
    for (let t = 0; t < tiers; t++) {
      const hh = total * TIER_SPLIT[tiers][t] + (t === 0 ? 3 : 0);
      boxes.push({ x: cx, y, z: cz, w: cw, h: hh, d: cd, color: '#' + tint.getHexString() });
      y += hh;
      cw *= 0.72 + rnd() * 0.1;
      cd *= 0.72 + rnd() * 0.1;
      cx += (rnd() - 0.5) * (w - cw) * 0.5;
      cz += (rnd() - 0.5) * (d - cd) * 0.5;
    }
    // roof furniture
    if (rnd() < 0.38) {
      const bw = 2 + rnd() * 3;
      boxes.push({ x: cx + (rnd() - 0.5) * cw * 0.4, y, z: cz + (rnd() - 0.5) * cd * 0.4, w: bw, h: 2 + rnd() * 2, d: bw, color: '#8f7a5e' });
    }
    if (rnd() < 0.14) domes.push({ x: cx, y, z: cz, r: Math.min(cw, cd) * 0.38 });
  }
  group.add(boxInstances(boxes, stone, 'Buildings'));

  if (domes.length) {
    const dgeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const dm = new THREE.InstancedMesh(dgeo, plaster, domes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    domes.forEach((d, i) => {
      m.compose(new THREE.Vector3(d.x, d.y, d.z), q, new THREE.Vector3(d.r, d.r * 0.85, d.r));
      dm.setMatrixAt(i, m);
    });
    dm.castShadow = dm.receiveShadow = true;
    dm.frustumCulled = false;
    dm.name = 'Domes';
    group.add(dm);
  }

  // --- Windtraps
  const trapMat = makeStoneMaterial({ color: '#b39b78', windows: false });
  const slatMat = new THREE.MeshStandardMaterial({ color: '#2e2620', roughness: 0.8 });
  const traps = new THREE.Group();
  traps.name = 'Windtraps';
  for (const [x, z, ry] of windtrapSpots) {
    const w = makeWindtrap(trapMat, slatMat);
    const y = Math.max(heightAt(x, z), CITY.y - 2);
    w.position.set(x, y + 1, z);
    w.rotation.y = ry;
    w.scale.setScalar(0.72);
    traps.add(w);
  }
  group.add(traps);

  // --- Residency
  const res = new THREE.Group();
  res.name = 'Residency';
  const ry = R.y;
  const box = (w, h, d, x, y, z, mat = resStone, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), color ? mat.clone() : mat);
    if (color) m.material.color.set(color);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    res.add(m);
    return m;
  };
  const cyl = (r, h, x, y, z, mat = resStone, rt = r) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, r, h, 28), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    res.add(m);
    return m;
  };
  const wallH = 17, wallT = 7;
  const halfW = R.w / 2, halfD = R.d / 2;
  // perimeter (south wall has a gate)
  box(R.w, wallH, wallT, R.x, ry - 2, R.z - halfD);
  box(wallT, wallH, R.d, R.x - halfW, ry - 2, R.z);
  box(wallT, wallH, R.d, R.x + halfW, ry - 2, R.z);
  const gateW = 26;
  const sideW = (R.w - gateW) / 2;
  box(sideW, wallH, wallT, R.x - gateW / 2 - sideW / 2, ry - 2, R.z + halfD);
  box(sideW, wallH, wallT, R.x + gateW / 2 + sideW / 2, ry - 2, R.z + halfD);
  box(gateW + 8, 9, wallT + 4, R.x, ry + wallH - 2 + 8, R.z + halfD); // lintel
  for (const sx of [-1, 1]) box(12, 30, 14, R.x + sx * (gateW / 2 + 8), ry - 2, R.z + halfD);
  // corner towers with domed caps
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tx = R.x + sx * halfW, tz = R.z + sz * halfD;
      cyl(10, 40, tx, ry - 2, tz);
      cyl(12.4, 4, tx, ry + 38, tz);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), plaster);
      dome.position.set(tx, ry + 42, tz);
      dome.castShadow = true;
      res.add(dome);
    }
  }
  // great hall: stepped, with a drum and dome
  box(94, 36, 46, R.x, ry - 2, R.z - 10);
  box(64, 18, 32, R.x, ry + 34, R.z - 10);
  cyl(14, 7, R.x, ry + 52, R.z - 10);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), plaster);
  dome.position.set(R.x, ry + 59, R.z - 10);
  dome.scale.y = 0.9;
  dome.castShadow = true;
  res.add(dome);
  // wings
  box(30, 26, 74, R.x - 62, ry - 2, R.z + 4);
  box(30, 26, 74, R.x + 62, ry - 2, R.z + 4);
  box(20, 14, 52, R.x - 62, ry + 24, R.z + 4);
  box(20, 14, 52, R.x + 62, ry + 24, R.z + 4);
  // portico
  box(40, 3, 14, R.x, ry + 14, R.z + 21);
  for (let i = 0; i < 6; i++) cyl(1.7, 16, R.x - 16 + i * 6.4, ry - 1, R.z + 27);
  box(44, 2, 4, R.x, ry + 17, R.z + 27.5);
  // courtyard garden + pool (water is wealth on Arrakis)
  const lawn = new THREE.Mesh(new THREE.BoxGeometry(110, 0.5, 26), new THREE.MeshStandardMaterial({ color: '#4d7a3a', roughness: 1 }));
  lawn.position.set(R.x, ry + 0.2, R.z + 38);
  lawn.receiveShadow = true;
  res.add(lawn);
  const pool = new THREE.Mesh(new THREE.BoxGeometry(24, 0.6, 9), new THREE.MeshStandardMaterial({ color: '#2f8fc0', roughness: 0.08, metalness: 0.3 }));
  pool.position.set(R.x, ry + 0.55, R.z + 38);
  res.add(pool);
  const trunkM = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 1 });
  const leafM = new THREE.MeshStandardMaterial({ color: '#3d7a35', roughness: 0.9 });
  for (let i = 0; i < 10; i++) {
    const px = R.x - 48 + i * 10.6 + (i % 2) * 2;
    const pz = R.z + 38 + (i % 2 ? 7 : -7);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 8, 8), trunkM);
    trunk.position.set(px, ry + 4.4, pz);
    trunk.castShadow = true;
    res.add(trunk);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(3.6, 12, 8), leafM);
    leaves.scale.y = 0.55;
    leaves.position.set(px, ry + 9, pz);
    leaves.castShadow = true;
    res.add(leaves);
  }
  // rooftop landing pad on the west wing
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 1, 40), new THREE.MeshStandardMaterial({ color: '#4c4a47', roughness: 0.9 }));
  pad.position.set(R.x - 62, ry + 38.5, R.z + 4);
  pad.castShadow = pad.receiveShadow = true;
  res.add(pad);
  const padRing = new THREE.Mesh(new THREE.RingGeometry(6.5, 7.6, 40), new THREE.MeshBasicMaterial({ color: '#e8d9a8', side: THREE.DoubleSide }));
  padRing.rotation.x = -Math.PI / 2;
  padRing.position.set(R.x - 62, ry + 39.05, R.z + 4);
  res.add(padRing);
  group.add(res);

  // --- Atreides banners
  const bannerTex = makeBannerTexture();
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide, roughness: 0.85 });
  const poleMat = new THREE.MeshStandardMaterial({ color: '#2b2622', metalness: 0.5, roughness: 0.5 });
  const flags = [];
  function addFlag(x, y, z, poleH, w, h) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, poleH, 8), poleMat);
    pole.position.set(x, y + poleH / 2, z);
    pole.castShadow = true;
    res.add(pole);
    const geo = new THREE.PlaneGeometry(w, h, 18, 10);
    geo.translate(w / 2, -h / 2, 0);
    const mesh = new THREE.Mesh(geo, bannerMat);
    mesh.position.set(x, y + poleH - 0.4, z);
    mesh.castShadow = true;
    res.add(mesh);
    flags.push({ mesh, base: geo.attributes.position.array.slice(), w, phase: flags.length * 1.7 });
  }
  addFlag(R.x + 20, ry + 52, R.z - 10, 28, 24, 16);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addFlag(R.x + sx * halfW, ry + 44, R.z + sz * halfD, 14, 9, 6);

  // --- Street lamps along the avenue (emissive at night)
  const lampPts = [];
  for (let z = RESIDENCY.z + RESIDENCY.d / 2 + 14; z < CITY.z + CITY.rz - 24; z += 22) {
    lampPts.push([R.x - 7, z], [R.x + 7, z]);
  }
  const lampMat = new THREE.MeshStandardMaterial({ color: '#ffe0a8', emissive: '#ffb860', emissiveIntensity: 0 });
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), lampMat, lampPts.length);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.25, 6, 6), poleMat, lampPts.length);
  const mm = new THREE.Matrix4();
  lampPts.forEach(([x, z], i) => {
    const y = heightAt(x, z);
    mm.makeTranslation(x, y + 6.4, z);
    lamps.setMatrixAt(i, mm);
    mm.makeTranslation(x, y + 3, z);
    poles.setMatrixAt(i, mm);
  });
  lamps.frustumCulled = poles.frustumCulled = false;
  group.add(lamps, poles);

  return {
    group,
    padPos: new THREE.Vector3(R.x - 62, ry + 39.5, R.z + 4),
    windtrapCentre: new THREE.Vector3(-30, 40, -322),
    update(t) {
      for (const f of flags) {
        const p = f.mesh.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const bx = f.base[i * 3], by = f.base[i * 3 + 1];
          const k = bx / f.w;
          p.setZ(i, Math.sin(bx * 0.45 - t * 4.2 + f.phase) * k * 2.2 + Math.sin(by * 0.6 - t * 3 + f.phase) * k * 0.6);
        }
        p.needsUpdate = true;
        f.mesh.geometry.computeVertexNormals();
      }
      lampMat.emissiveIntensity = nightUniform.value * 3.2;
    },
  };
}
