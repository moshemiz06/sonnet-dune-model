import * as THREE from 'three';
import { clamp, lerp, smoothstep, easeInOut } from '../util.js';
import { SkyDome, skyState, makeMoonTexture } from '../sky.js';
import { createTerrain, heightAt, CITY, RESIDENCY, PORT, WALL_Z, FIELD } from './terrain.js';
import { createCity } from './city.js';
import { createSpaceport } from './spaceport.js';
import { makeOrnithopter, makeCarryall, makeHarvester, navMats } from './craft.js';
import { SandWorm, Dust } from './worm.js';
import { nightUniform } from './materials.js';

const CYCLE = 72;
const MOON_BLUE = new THREE.Color('#5d78b8');

// Harvester route and the worm's pass (all world units)
const A = new THREE.Vector2(-225, 300);
const B = new THREE.Vector2(-50, 412);
const HARV_YAW = Math.atan2(B.x - A.x, B.y - A.y);
const CARRY_CTRL = new THREE.Vector2(-190, 150);
const ABS_Y = 78;

const W_DIR = new THREE.Vector2(0.93, -0.37).normalize();
const W_PERP = new THREE.Vector2(0.37, 0.93).normalize();
const W_SPEED = 19;
const W_PASS = new THREE.Vector2(B.x + W_PERP.x * 48, B.y + W_PERP.y * 48);
const W_RADIUS = 15;
const W_SEGS = 72;
const W_SPACING = 5;
const W_LAG = W_SPACING / W_SPEED;
const W_BURY = -25;

const wormXZ = (tau, out) =>
  out.set(
    W_PASS.x + W_DIR.x * (tau - 39) * W_SPEED + W_PERP.x * Math.sin(tau * 0.21) * 14,
    W_PASS.y + W_DIR.y * (tau - 39) * W_SPEED + W_PERP.y * Math.sin(tau * 0.21) * 14,
  );
const wormOffset = (tau) => {
  const up = easeInOut(smoothstep(30.5, 37.5, tau));
  const down = easeInOut(smoothstep(41, 47.5, tau));
  return W_BURY + 58 * up * (1 - down);
};

export function createArrakeenView() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#e0b88a', 0.00034);

  // ---- sky
  const sky = new SkyDome();
  scene.add(sky.group);
  const moonA = new THREE.Mesh(
    new THREE.SphereGeometry(230, 40, 24),
    new THREE.MeshBasicMaterial({ map: makeMoonTexture({ seed: 3, tint: '#d1c8b6' }), transparent: true, depthWrite: false, fog: false }),
  );
  const moonB = new THREE.Mesh(
    new THREE.SphereGeometry(150, 40, 24),
    new THREE.MeshBasicMaterial({ map: makeMoonTexture({ seed: 11, mouse: true, tint: '#c4b9a6' }), transparent: true, depthWrite: false, fog: false }),
  );
  for (const m of [moonA, moonB]) {
    m.renderOrder = -1;
    m.frustumCulled = false;
    sky.group.add(m);
  }

  // ---- lights
  const sun = new THREE.DirectionalLight('#fff0d8', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -640; sc.right = 640; sc.top = 640; sc.bottom = -640; sc.near = 10; sc.far = 3600;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.9;
  sun.userData.noExport = true;
  scene.add(sun, sun.target);
  const moonLight = new THREE.DirectionalLight('#8aa6e8', 0);
  moonLight.userData.noExport = true;
  scene.add(moonLight, moonLight.target);
  const hemi = new THREE.HemisphereLight('#a8c0d8', '#8a5a32', 0.9);
  hemi.userData.noExport = true;
  scene.add(hemi);

  // ---- world
  const terrain = createTerrain();
  scene.add(terrain);
  // a wide skirt so the tile edge dissolves into haze
  const skirt = new THREE.Mesh(
    new THREE.CircleGeometry(9000, 48),
    new THREE.MeshStandardMaterial({ color: '#d29a58', roughness: 1 }),
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -0.4;
  skirt.userData.noExport = true;
  skirt.receiveShadow = false;
  scene.add(skirt);

  const city = createCity();
  scene.add(city.group);
  const port = createSpaceport();
  scene.add(port.group);

  // ---- craft
  const dust = new Dust(1100);
  scene.add(dust.points);

  const harvester = makeHarvester();
  scene.add(harvester.group);
  const carryall = makeCarryall();
  scene.add(carryall.group);

  const cableMat = new THREE.MeshStandardMaterial({ color: '#2a2a2a', metalness: 0.6, roughness: 0.5 });
  const cables = Array.from({ length: 4 }, () => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1), cableMat);
    c.castShadow = true;
    c.visible = false;
    scene.add(c);
    return c;
  });

  const worm = new SandWorm({ radius: W_RADIUS, segments: W_SEGS });
  scene.add(worm.group);
  const wormPts = Array.from({ length: W_SEGS }, () => new THREE.Vector3());
  const wormOff = new Float32Array(W_SEGS);

  const paths = [
    // [centre x, centre z, rx, rz, altitude, wobble, angular speed, phase]
    { cx: RESIDENCY.x, cz: RESIDENCY.z + 10, rx: 170, rz: 170, alt: 98, wob: 8, w: 0.2, ph: 0 },
    { cx: CITY.x + 40, cz: CITY.z + 30, rx: 360, rz: 270, alt: 150, wob: 12, w: -0.11, ph: 2 },
    { cx: (RESIDENCY.x + PORT.x) / 2, cz: -170, rx: 300, rz: 90, alt: 74, wob: 10, w: 0.13, ph: 4 },
    { cx: FIELD.x + 40, cz: FIELD.z - 80, rx: 260, rz: 200, alt: 125, wob: 10, w: -0.1, ph: 1 },
  ];
  const thopters = paths.map((p, i) => {
    const o = makeOrnithopter({ scale: 2.3, hull: i % 2 ? '#7a7366' : '#6a645a', wing: i % 2 ? '#5f594f' : '#554f46' });
    scene.add(o.group);
    return { o, p };
  });
  const parked = makeOrnithopter({ scale: 2.3 });
  parked.fold();
  parked.group.position.copy(city.padPos).add(new THREE.Vector3(0, 3.1, 0));
  parked.group.rotation.y = 0.6;
  scene.add(parked.group);

  // ---- labels (anchors move with the thing they describe)
  const mk = () => {
    const o = new THREE.Object3D();
    scene.add(o);
    return o;
  };
  const anchors = {
    residency: mk(), city: mk(), shield: mk(), spaceport: mk(), windtraps: mk(),
    harvester: mk(), carryall: mk(), worm: mk(), ornithopter: mk(),
  };
  anchors.residency.position.set(RESIDENCY.x, 125, RESIDENCY.z + 10);
  anchors.city.position.set(CITY.x + 60, 55, CITY.z + 95);
  anchors.shield.position.set(CITY.x + 170, 230, WALL_Z - 120);
  anchors.spaceport.position.copy(port.labelPos);
  anchors.windtraps.position.set(62, 80, -322);
  const labelDefs = [
    { id: 'residency' }, { id: 'city' }, { id: 'shield' }, { id: 'spaceport' }, { id: 'windtraps' },
    { id: 'harvester' }, { id: 'carryall' },
    { id: 'worm', visible: () => state.wormUp },
    { id: 'ornithopter' },
  ];

  const presets = [
    { id: 'overview', label: 'Overview', position: new THREE.Vector3(-470, 250, 560), target: new THREE.Vector3(-100, 40, -190) },
    { id: 'residency', label: 'Residency', position: new THREE.Vector3(-20, 120, -130), target: new THREE.Vector3(RESIDENCY.x, 40, RESIDENCY.z) },
    { id: 'spaceport', label: 'Spaceport', position: new THREE.Vector3(200, 100, 110), target: new THREE.Vector3(PORT.x + 10, 40, PORT.z - 6) },
    { id: 'spice', label: 'Spice field', position: new THREE.Vector3(-330, 110, 255), target: new THREE.Vector3(-50, 20, 410) },
    { id: 'wall', label: 'Shield Wall', position: new THREE.Vector3(-110, 150, 30), target: new THREE.Vector3(-110, 110, -470) },
  ];
  const placePreset = {
    residency: 'residency', city: 'overview', shield: 'wall', spaceport: 'spaceport', windtraps: 'residency',
    harvester: 'spice', carryall: 'spice', worm: 'spice', ornithopter: 'overview',
  };

  // ---- state & scratch
  const state = { hour: 16.5, cycle: 0, wormUp: false, playing: true, carryYaw: 0 };
  const sunDir = new THREE.Vector3(), moonADir = new THREE.Vector3(), moonBDir = new THREE.Vector3();
  const st = {};
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmpXZ = new THREE.Vector2();
  const prevCarry = new THREE.Vector3();
  const wind = new THREE.Vector3(5, 0, 1.8);
  const hemiSky = new THREE.Color(), hemiGround = new THREE.Color(), dustTint = new THREE.Color();

  function setHour(h) {
    state.hour = ((h % 24) + 24) % 24;
    const a = ((state.hour - 6) / 12) * Math.PI;
    sunDir.set(Math.cos(a), Math.sin(a) * 0.95, Math.sin(a) * 0.35).normalize();
    const elev = (Math.asin(sunDir.y) * 180) / Math.PI;
    skyState(elev, st);

    sun.color.copy(st.sunColor);
    sun.intensity = 4.6 * st.sunStrength;
    hemiSky.copy(st.zenith).lerp(st.horizon, 0.45);
    hemiGround.set('#8a5a32').multiplyScalar(0.25 + 0.75 * st.sunStrength);
    // twilight fill (sky still glowing after the sun is down) and cool moonlit ambient at night
    const twi = smoothstep(-16, -2, elev) * (1 - smoothstep(-2, 10, elev));
    hemiSky.lerp(st.horizon, twi * 0.5).lerp(MOON_BLUE, st.night * 0.55);
    hemiGround.lerp(st.horizon, twi * 0.25);
    hemi.color.copy(hemiSky);
    hemi.groundColor.copy(hemiGround);
    hemi.intensity = lerp(0.42, 0.55, st.sunStrength) + 0.3 * twi;
    scene.environmentIntensity = lerp(0.08, 0.22, st.sunStrength);
    scene.fog.color.copy(st.horizon).lerp(st.zenith, 0.12);

    nightUniform.value = 1 - smoothstep(-6, 8, elev);
    navMats.red.emissiveIntensity = navMats.green.emissiveIntensity = navMats.amber.emissiveIntensity = 0.5 + 2.5 * nightUniform.value;

    const am = ((state.hour - 18) / 12) * Math.PI;
    moonADir.set(Math.cos(am), Math.sin(am) * 0.9, Math.sin(am) * 0.3).normalize();
    const bm = ((state.hour - 22.5) / 12) * Math.PI;
    moonBDir.set(Math.cos(bm), Math.sin(bm) * 0.72, -Math.sin(bm) * 0.5).normalize();
    moonA.position.copy(moonADir).multiplyScalar(6200);
    moonB.position.copy(moonBDir).multiplyScalar(6200);
    // keep each moon's centre texture facing the viewer
    moonA.lookAt(0, 0, 0);
    moonB.lookAt(0, 0, 0);
    moonA.rotateY(-Math.PI / 2);
    moonB.rotateY(-Math.PI / 2);
    const ma = clamp(st.night * 1.0 + 0.1, 0, 1);
    moonA.material.opacity = moonADir.y > -0.05 ? ma : 0;
    moonB.material.opacity = moonBDir.y > -0.05 ? ma * 0.95 : 0;
    moonLight.intensity = 0.9 * st.night * Math.max(0, moonADir.y);
    dustTint.set('#c98c4e').lerp(st.horizon, 0.25).multiplyScalar(0.3 + 0.7 * st.sunStrength);
    dust.uniforms.uColor.value.copy(dustTint);
  }
  setHour(state.hour);

  // ---- choreography: everything below is a pure function of the cycle time `c`
  function harvesterState(c, out) {
    const crawl = clamp(c / 32, 0, 1);
    const carry = clamp((c - 40) / 22, 0, 1);
    let x, z;
    if (c < 40) {
      x = lerp(A.x, B.x, crawl);
      z = lerp(A.y, B.y, crawl);
    } else if (c < 62) {
      const s = easeInOut(carry), is = 1 - s;
      x = is * is * B.x + 2 * is * s * CARRY_CTRL.x + s * s * A.x;
      z = is * is * B.y + 2 * is * s * CARRY_CTRL.y + s * s * A.y;
    } else {
      x = A.x;
      z = A.y;
    }
    const k = easeInOut(smoothstep(36.5, 41.5, c)) * (1 - easeInOut(smoothstep(60.5, 65.5, c)));
    out.set(x, lerp(heightAt(x, z), ABS_Y, k), z);
    out.k = k;
    out.moving = c < 32 ? 1 : 0;
    return out;
  }
  const hs = new THREE.Vector3();

  function alignToGround(obj, x, z, yaw, hl, hw, lift = 0, groundY = null) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
    const hf = heightAt(x + fx * hl, z + fz * hl), hb = heightAt(x - fx * hl, z - fz * hl);
    const hL = heightAt(x + lx * hw, z + lz * hw), hR = heightAt(x - lx * hw, z - lz * hw);
    const pitch = Math.atan2(hb - hf, 2 * hl);
    const roll = Math.atan2(hL - hR, 2 * hw);
    const y = groundY ?? Math.max(hf, hb, hL, hR, heightAt(x, z)) - 0.8;
    obj.rotation.set(pitch * (1 - lift), yaw, roll * (1 - lift), 'YXZ');
    obj.position.set(x, y, z);
  }

  const cableSrc = [new THREE.Vector3(-5.5, -5.5, -11), new THREE.Vector3(5.5, -5.5, -11), new THREE.Vector3(-5.5, -5.5, 11), new THREE.Vector3(5.5, -5.5, 11)];
  const cableDst = [new THREE.Vector3(-9, 16, -12), new THREE.Vector3(9, 16, -12), new THREE.Vector3(-9, 16, 14), new THREE.Vector3(9, 16, 14)];

  function updateChoreography(dt, t, c) {
    // --- harvester
    harvesterState(c, hs);
    const k = hs.k;
    const sway = k * Math.sin(t * 1.3) * 0.035;
    alignToGround(harvester.group, hs.x, hs.z, HARV_YAW, 15, 10, k, hs.y);
    harvester.group.rotation.z += sway;
    harvester.update(t, hs.moving + 0.2);
    if (hs.moving && dt > 0) {
      tmp.set(Math.sin(HARV_YAW), 0, Math.cos(HARV_YAW));
      dust.emit(hs.x - tmp.x * 16, hs.y + 3, hs.z - tmp.z * 16, Math.ceil(dt * 26), { spread: 14, up: 3, out: 2.5, size: 9, life: 3, alpha: 0.3 });
      dust.emit(hs.x + tmp.x * 20, hs.y + 3, hs.z + tmp.z * 20, Math.ceil(dt * 12), { spread: 10, up: 5, out: 3, size: 8, life: 2.2, alpha: 0.35 });
    }
    anchors.harvester.position.set(hs.x, hs.y + 52, hs.z);

    // --- carryall: loiters, descends onto the harvester, lifts, delivers, and leaves
    const wIn = easeInOut(smoothstep(26, 34, c));
    const wOut = 1 - easeInOut(smoothstep(66, 72, c));
    const w = Math.min(wIn, wOut);
    const la = 0.06 * t;
    const loiter = tmp2.set(-100 + Math.cos(la) * 280, 120 + 12 * Math.sin(t * 0.3), 90 + Math.sin(la) * 230);
    const hover = 30 + 45 * (1 - easeInOut(smoothstep(30, 37, c))) + 48 * easeInOut(smoothstep(64, 68.5, c));
    prevCarry.copy(carryall.group.position);
    tmp.set(hs.x, hs.y + hover, hs.z);
    carryall.group.position.copy(loiter).lerp(tmp, w);
    const vx = carryall.group.position.x - prevCarry.x, vz = carryall.group.position.z - prevCarry.z;
    if (dt > 0 && Math.hypot(vx, vz) / dt > 2) {
      let d = Math.atan2(vx, vz) - state.carryYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      state.carryYaw += d * Math.min(1, dt * 2.5);
    }
    carryall.group.rotation.set(0, state.carryYaw, 0.12 * (1 - w), 'YXZ');
    carryall.flap(t, 0.32);
    anchors.carryall.position.copy(carryall.group.position).add(new THREE.Vector3(0, 34, 0));

    const showCables = c > 36.2 && c < 65.8 && k > 0.02;
    cableSrc.forEach((s, i) => {
      const cb = cables[i];
      cb.visible = showCables;
      if (!showCables) return;
      carryall.group.updateMatrixWorld(true);
      harvester.group.updateMatrixWorld(true);
      const a = carryall.group.localToWorld(s.clone());
      const b = harvester.group.localToWorld(cableDst[i].clone());
      cb.position.copy(a).add(b).multiplyScalar(0.5);
      cb.lookAt(b);
      cb.scale.z = a.distanceTo(b);
    });

    // --- worm
    const life = smoothstep(3, 9, c) * (1 - smoothstep(55, 62, c));
    const alive = life > 0.005;
    worm.group.visible = alive;
    state.wormUp = false;
    if (alive) {
      for (let i = 0; i < W_SEGS; i++) {
        const tau = c - i * W_LAG;
        wormXZ(tau, tmpXZ);
        const off = wormOffset(tau);
        wormOff[i] = off;
        wormPts[i].set(tmpXZ.x, heightAt(tmpXZ.x, tmpXZ.y) + off, tmpXZ.y);
      }
      worm.update(wormPts, wormOff, life);
      const headUp = wormOff[0] > -W_RADIUS * 0.9;
      state.wormUp = headUp;
      anchors.worm.position.copy(wormPts[0]).add(new THREE.Vector3(0, 46, 0));
      if (dt > 0) {
        if (headUp) {
          dust.emit(wormPts[0].x, wormPts[0].y - 6, wormPts[0].z, Math.ceil(dt * 40), { spread: 30, up: 14, out: 9, size: 16, life: 3.2, alpha: 0.4 });
        }
        // breach line: where the body meets the sand
        for (let i = 1; i < W_SEGS; i++) {
          if (wormOff[i] < -W_RADIUS * 1.0 && wormOff[i - 1] >= -W_RADIUS * 1.0) {
            dust.emit(wormPts[i].x, wormPts[i].y + 8, wormPts[i].z, Math.ceil(dt * 34), { spread: 28, up: 11, out: 8, size: 15, life: 3, alpha: 0.4 });
            break;
          }
        }
        if (!headUp) {
          dust.emit(wormPts[2].x, wormPts[2].y + 2, wormPts[2].z, Math.ceil(dt * 14 * life), { spread: 16, up: 4, out: 4, size: 9, life: 2.4, alpha: 0.32 });
        }
      }
    }
  }

  // ---- ornithopters
  const flightPos = (p, t, out) => {
    const a = p.ph + p.w * t;
    return out.set(p.cx + Math.cos(a) * p.rx, p.alt + p.wob * Math.sin(t * 0.35 + p.ph), p.cz + Math.sin(a) * p.rz);
  };
  function updateThopters(t) {
    thopters.forEach(({ o, p }) => {
      flightPos(p, t, tmp);
      flightPos(p, t + 0.4, tmp2);
      o.group.position.copy(tmp);
      o.group.lookAt(tmp2);
      o.group.rotateZ(0.32 * Math.sign(p.w));
      o.flap(t + p.ph);
    });
    anchors.ornithopter.position.copy(thopters[0].o.group.position).add(new THREE.Vector3(0, 22, 0));
  }

  function update(dt, t, focus) {
    if (state.playing) state.cycle = (state.cycle + dt) % CYCLE;
    updateChoreography(state.playing ? dt : 0, t, state.cycle);
    updateThopters(t);
    city.update(t);
    port.update(t);
    dust.update(dt, wind);

    // light rig follows the camera focus so shadows stay crisp where we look
    tmp.copy(focus);
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(sunDir, 1700);
    moonLight.target.position.copy(tmp);
    moonLight.position.copy(tmp).addScaledVector(moonADir, 1500);
  }

  return {
    id: 'arrakeen',
    scene,
    camera: { position: presets[0].position.clone(), target: presets[0].target.clone(), fov: 46 },
    limits: { min: 25, max: 1500 },
    presets,
    placePreset,
    labels: labelDefs.map((d) => ({ ...d, anchor: anchors[d.id], surface: false })),
    state,
    setHour,
    getHour: () => state.hour,
    getNight: () => st.night,
    getSky: () => st,
    update,
    sky,
    setShadowSize(n) {
      sun.shadow.mapSize.set(n, n);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    },
    afterCamera(camera) {
      sky.update(camera, sunDir, st);
      dust.uniforms.uScale.value = 600;
    },
  };
}
