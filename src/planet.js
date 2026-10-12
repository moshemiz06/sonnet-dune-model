import * as THREE from 'three';
import { noise3, fbm3, ridged3 } from './noise.js';
import { clamp, smoothstep, latLonToVec, mulberry32 } from './util.js';
import { PLANET_PLACES } from './locations.js';
import { makeMoonTexture } from './sky.js';

export const PLANET_R = 10;

// Shield Wall: a rock arc that curls around the south-east rim of the Imperial Basin (lat, lon).
const WALL_PATH = [[44, 18], [38, 15], [31, 14], [24, 12], [18, 6], [15, -4], [17, -14], [22, -24], [30, -30]];
const BASIN = [29, -2];
const HABBANYA = [-14, 42];
const GREAT_ERG = [-4, -58];

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const C = {
  deep: hex('#b5642c'),
  mid: hex('#d68f49'),
  light: hex('#eebf78'),
  rockA: hex('#7a5d46'),
  rockB: hex('#a98763'),
  ergA: hex('#bf7436'),
  ergB: hex('#ecb56a'),
  basin: hex('#e2b274'),
  ice: hex('#ded6c8'),
};
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function slerpPath(path, perSeg = 12) {
  const pts = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < path.length - 1; i++) {
    latLonToVec(path[i][0], path[i][1], a);
    latLonToVec(path[i + 1][0], path[i + 1][1], b);
    const ang = Math.acos(clamp(a.dot(b), -1, 1));
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg;
      q.copy(a).multiplyScalar(Math.sin((1 - t) * ang)).addScaledVector(b, Math.sin(t * ang)).divideScalar(Math.sin(ang));
      pts.push(q.x, q.y, q.z);
    }
  }
  return new Float32Array(pts);
}

// Builds colour + bump canvases for the globe, yielding to the UI every few rows.
async function buildPlanetTextures(onProgress) {
  const W = 2048, H = 1024;
  const col = new ImageData(W, H);
  const bmp = new ImageData(W, H);
  const wall = slerpPath(WALL_PATH);
  const vB = latLonToVec(BASIN[0], BASIN[1], new THREE.Vector3());
  const vH = latLonToVec(HABBANYA[0], HABBANYA[1], new THREE.Vector3());
  const vG = latLonToVec(GREAT_ERG[0], GREAT_ERG[1], new THREE.Vector3());
  const cosL = new Float32Array(W), sinL = new Float32Array(W);
  for (let i = 0; i < W; i++) {
    const lam = ((i + 0.5) / W - 0.5) * Math.PI * 2;
    cosL[i] = Math.cos(lam);
    sinL[i] = Math.sin(lam);
  }

  for (let j = 0; j < H; j++) {
    const lat = 90 - ((j + 0.5) / H) * 180;
    const phi = (lat * Math.PI) / 180;
    const cphi = Math.cos(phi), sphi = Math.sin(phi);
    const absLat = Math.abs(lat);
    for (let i = 0; i < W; i++) {
      const x = cphi * cosL[i], y = sphi, z = -cphi * sinL[i];

      const n1 = fbm3(x * 2.2 + 1.7, y * 2.2, z * 2.2, 4);
      const n2 = fbm3(x * 8 + 10, y * 8, z * 8, 3);
      const mt = ridged3(x * 3.2 + 4, y * 3.2, z * 3.2, 4);

      const dB = Math.acos(clamp(x * vB.x + y * vB.y + z * vB.z, -1, 1));
      const dH = Math.acos(clamp(x * vH.x + y * vH.y + z * vH.z, -1, 1));
      const dG = Math.acos(clamp(x * vG.x + y * vG.y + z * vG.z, -1, 1));
      const basin = 1 - smoothstep(0.16, 0.34, dB + 0.05 * n1);
      const erg = Math.max(1 - smoothstep(0.3, 0.62, dH + 0.07 * n1), 1 - smoothstep(0.34, 0.7, dG + 0.07 * n1));

      let wallI = 0;
      if (x * vB.x + y * vB.y + z * vB.z > 0.2) {
        let best = -1;
        for (let k = 0; k < wall.length; k += 3) {
          const d = x * wall[k] + y * wall[k + 1] + z * wall[k + 2];
          if (d > best) best = d;
        }
        const ang = Math.acos(clamp(best, -1, 1));
        wallI = 1 - smoothstep(0.014, 0.06, ang + 0.03 * n1);
      }

      const belt = smoothstep(0.1, 0.5, fbm3(x * 1.5 + 9, y * 1.5, z * 1.5, 2));
      let rock = belt * smoothstep(0.6, 0.82, mt) * (1 - erg * 0.85) * (1 - basin * 0.85);
      rock = Math.max(rock, wallI * (0.8 + 0.2 * mt));

      const sandT = smoothstep(-0.35, 0.45, n1 + 0.35 * n2);
      let c = sandT < 0.5 ? mix3(C.deep, C.mid, sandT * 2) : mix3(C.mid, C.light, (sandT - 0.5) * 2);

      const rip = 0.5 + 0.5 * Math.sin(phi * 70 + n1 * 7 + n2 * 3);
      if (erg > 0) c = mix3(c, mix3(C.ergA, C.ergB, rip), erg * 0.85);
      if (basin > 0) c = mix3(c, C.basin, basin * 0.55);
      if (rock > 0) c = mix3(c, mix3(C.rockA, C.rockB, clamp(n2 * 0.6 + 0.5 + 0.2 * Math.sin(mt * 18), 0, 1)), rock);

      const ice = smoothstep(68, 82, absLat + n2 * 5);
      if (ice > 0) c = mix3(c, C.ice, ice * 0.9);

      const g = 1 + 0.045 * noise3(x * 70, y * 70, z * 70);
      const p = (j * W + i) * 4;
      col.data[p] = clamp(c[0] * g, 0, 255);
      col.data[p + 1] = clamp(c[1] * g, 0, 255);
      col.data[p + 2] = clamp(c[2] * g, 0, 255);
      col.data[p + 3] = 255;

      let h = 0.38 + 0.1 * n1 + 0.06 * n2 + rock * (0.2 * mt + 0.08) + wallI * 0.14 - basin * 0.05 + erg * 0.04 * rip;
      h = clamp(h * (1 - ice * 0.3), 0, 1) * 255;
      bmp.data[p] = bmp.data[p + 1] = bmp.data[p + 2] = h;
      bmp.data[p + 3] = 255;
    }
    if (j % 48 === 47) {
      onProgress?.(j / H);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const toTex = (img, srgb) => {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    cv.getContext('2d').putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: toTex(col, true), bump: toTex(bmp, false) };
}

const atmoVert = /* glsl */ `
  varying vec3 vWN; varying vec3 vVN; varying vec3 vVP;
  void main() {
    vWN = normalize(mat3(modelMatrix) * normal);
    vVN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vVP = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const shellFrag = /* glsl */ `
  uniform vec3 uSunDir; uniform vec3 uColor;
  varying vec3 vWN; varying vec3 vVN; varying vec3 vVP;
  void main() {
    float d = dot(normalize(vVN), normalize(-vVP));
    float rim = pow(clamp(-d / 0.45, 0.0, 1.0), 2.2);
    float lit = smoothstep(-0.25, 0.4, dot(normalize(vWN), uSunDir));
    gl_FragColor = vec4(uColor * rim * (0.12 + 0.88 * lit) * 1.5, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const hazeFrag = /* glsl */ `
  uniform vec3 uSunDir; uniform vec3 uColor;
  varying vec3 vWN; varying vec3 vVN; varying vec3 vVP;
  void main() {
    float d = dot(normalize(vVN), normalize(-vVP));
    float rim = pow(1.0 - clamp(d, 0.0, 1.0), 3.0);
    float lit = smoothstep(-0.3, 0.5, dot(normalize(vWN), uSunDir));
    gl_FragColor = vec4(uColor * rim * lit * 0.5, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export async function createPlanetView(onProgress) {
  const { map, bump } = await buildPlanetTextures(onProgress);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#010208');

  // lights: Canopus from the right, a whisper of fill for the night side
  const sunDir = new THREE.Vector3(1, 0.25, 0.32).normalize();
  const sun = new THREE.DirectionalLight('#fff0d8', 2.7);
  sun.position.copy(sunDir).multiplyScalar(200);
  sun.userData.noExport = true;
  scene.add(sun);
  const fill = new THREE.HemisphereLight('#5a6a9a', '#201008', 0.22);
  fill.userData.noExport = true;
  scene.add(fill);

  // stars
  {
    const rnd = mulberry32(21);
    const n = 5000;
    const pos = new Float32Array(n * 3), colr = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * r * 400, u * 400, Math.sin(th) * r * 400], i * 3);
      c.setHSL(0.55 + rnd() * 0.12, 0.35 * rnd(), 0.55 + rnd() * 0.45);
      colr.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false }));
    stars.userData.noExport = true;
    scene.add(stars);
  }

  // planet
  const tilt = new THREE.Group();
  tilt.rotation.z = 0.12;
  tilt.name = 'Arrakis';
  scene.add(tilt);
  const spin = new THREE.Group();
  tilt.add(spin);
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_R, 160, 110),
    new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2.2, roughness: 0.96, metalness: 0 }),
  );
  planet.name = 'Arrakis surface';
  spin.add(planet);

  const shellUniforms = { uSunDir: { value: sunDir }, uColor: { value: new THREE.Color('#ff9a4a') } };
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_R * 1.13, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: shellUniforms,
      vertexShader: atmoVert,
      fragmentShader: shellFrag,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  shell.userData.noExport = true;
  scene.add(shell);
  const haze = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_R * 1.012, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { uSunDir: { value: sunDir }, uColor: { value: new THREE.Color('#ffb168') } },
      vertexShader: atmoVert,
      fragmentShader: hazeFrag,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  haze.userData.noExport = true;
  scene.add(haze);

  // moons (tidally locked: the texture centre always faces Arrakis)
  const moons = [];
  function addMoon(id, radius, orbitR, period, incl, phase, tex) {
    const orbit = new THREE.Group();
    orbit.rotation.set(incl[0], 0, incl[1]);
    scene.add(orbit);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 64, 48),
      new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1.2, roughness: 1 }),
    );
    mesh.name = id;
    orbit.add(mesh);
    moons.push({ id, mesh, orbitR, period, phase });
    return mesh;
  }
  const moon1 = addMoon('moon1', 1.15, 20, 70, [0.2, 0.05], 1.0, makeMoonTexture({ seed: 3, tint: '#d1c8b6' }));
  const moon2 = addMoon('moon2', 0.85, 29, 120, [-0.35, -0.12], 3.6, makeMoonTexture({ seed: 11, mouse: true, tint: '#c4b9a6' }));

  // a Guild Heighliner in orbit
  const ship = new THREE.Group();
  ship.name = 'Heighliner';
  {
    const hull = new THREE.MeshStandardMaterial({ color: '#2a2c31', metalness: 0.7, roughness: 0.45 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 1.5), hull);
    ship.add(body);
    const rnd = mulberry32(9);
    const bits = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.22, 0.14, 0.28),
      new THREE.MeshStandardMaterial({ color: '#34363c', metalness: 0.6, roughness: 0.5 }),
      90,
    );
    const m = new THREE.Matrix4();
    for (let i = 0; i < 90; i++) {
      const sx = (rnd() - 0.5) * 3.2, sz = (rnd() - 0.5) * 1.3;
      m.makeTranslation(sx, 0.5 + rnd() * 0.1, sz);
      bits.setMatrixAt(i, m);
    }
    ship.add(bits);
    const lightM = new THREE.MeshBasicMaterial({ color: '#ffc57a' });
    const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), lightM, 160);
    for (let i = 0; i < 160; i++) {
      const side = i % 2 ? 1 : -1;
      m.makeTranslation(-1.6 + (i >> 1) * 0.0405 * 1.0, (rnd() - 0.5) * 0.6, side * 0.76);
      lights.setMatrixAt(i, m);
    }
    ship.add(lights);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 0.5, 16), new THREE.MeshBasicMaterial({ color: '#7ab6ff' }));
    glow.rotation.z = Math.PI / 2;
    glow.position.x = -1.8;
    ship.add(glow);
    ship.scale.setScalar(0.9);
  }
  const shipOrbit = new THREE.Group();
  shipOrbit.rotation.set(-0.3, 0, 0.25);
  shipOrbit.add(ship);
  scene.add(shipOrbit);

  // markers
  const markers = new Map();
  const labels = [];
  const tmpN = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const p of PLANET_PLACES) {
    let anchor;
    if (p.lat !== undefined) {
      latLonToVec(p.lat, p.lon, tmpN);
      anchor = new THREE.Group();
      anchor.position.copy(tmpN).multiplyScalar(PLANET_R * 1.004);
      anchor.quaternion.setFromUnitVectors(up, tmpN);
      const city = p.kind === 'city';
      const colorHex = city ? '#ffcf6a' : '#f4e8d0';
      if (city) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: colorHex }));
        dot.position.y = 0.04;
        dot.userData.noExport = true;
        anchor.add(dot);
      }
      const ringGeo = new THREE.RingGeometry(city ? 0.22 : 0.16, city ? 0.3 : 0.2, 40);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: city ? 0.9 : 0.6, depthWrite: false, side: THREE.DoubleSide }),
      );
      ring.position.y = 0.03;
      ring.userData.noExport = true;
      ring.userData.pulse = city ? 1 : 0.4;
      anchor.add(ring);
      spin.add(anchor);
    } else if (p.id === 'moon1') anchor = moon1;
    else if (p.id === 'moon2') anchor = moon2;
    else anchor = ship;
    markers.set(p.id, { anchor, place: p });
    labels.push({ id: p.id, name: p.name, kind: p.kind, anchor, surface: p.lat !== undefined, text: p.text, enter: !!p.enter });
  }

  // start with Arrakeen facing the camera
  {
    const a = latLonToVec(PLANET_PLACES[0].lat, PLANET_PLACES[0].lon, new THREE.Vector3());
    spin.rotation.y = -Math.atan2(a.x, a.z);
  }

  const state = { spinSpeed: 0.035, paused: false, spinNow: 0.035 };
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

  return {
    id: 'planet',
    scene,
    camera: { position: new THREE.Vector3(-7, 10, 47), target: new THREE.Vector3(0, 0, 0), fov: 38 },
    limits: { min: PLANET_R * 1.35, max: 90 },
    labels,
    update(dt, t) {
      state.spinNow += ((state.paused ? 0 : state.spinSpeed) - state.spinNow) * Math.min(1, dt * 3);
      spin.rotation.y += state.spinNow * dt;
      for (const m of moons) {
        const a = m.phase + (t / m.period) * Math.PI * 2;
        const px = Math.cos(a) * m.orbitR, pz = Math.sin(a) * m.orbitR;
        m.mesh.position.set(px, 0, pz);
        m.mesh.rotation.y = Math.atan2(pz, -px);
      }
      const sa = 0.5 + (t / 150) * Math.PI * 2;
      ship.position.set(Math.cos(sa) * 15.4, 0, Math.sin(sa) * 15.4);
      ship.rotation.y = Math.atan2(-Math.cos(sa), -Math.sin(sa));
      for (const mk of markers.values()) {
        const ring = mk.anchor.children?.find((c) => c.userData.pulse);
        if (ring) {
          const k = ring.userData.pulse;
          const s = 1 + 0.25 * k * Math.sin(t * 3 + mk.place.lat);
          ring.scale.setScalar(s);
          ring.material.opacity = (0.55 + 0.35 * Math.sin(t * 3 + mk.place.lat)) * (k === 1 ? 1 : 0.8);
        }
      }
    },
    setPaused(v) {
      state.paused = v;
    },
    // camera pose that frames a place; null for things that should not move the camera
    focus(id) {
      const mk = markers.get(id);
      if (!mk) return null;
      mk.anchor.getWorldPosition(tmpA);
      if (mk.place.lat === undefined) {
        // look from the planet's sunward side toward the object
        tmpB.copy(tmpA).normalize();
        return {
          position: tmpA.clone().addScaledVector(tmpB, 9).add(new THREE.Vector3(0, 3, 0)),
          target: tmpA.clone(),
        };
      }
      tmpB.copy(tmpA).normalize();
      return { position: tmpB.clone().multiplyScalar(PLANET_R + 14).add(new THREE.Vector3(0, 2.5, 0)), target: new THREE.Vector3(0, 0, 0) };
    },
    isOccluded(label, camPos, wp) {
      if (label.surface) return wp.dot(tmpA.copy(camPos).sub(wp)) < 0;
      // moons / ship: hidden if the planet blocks the line of sight
      tmpA.copy(wp).sub(camPos);
      const len = tmpA.length();
      tmpA.divideScalar(len);
      const tca = -camPos.dot(tmpA);
      if (tca < 0 || tca > len) return false;
      const d2 = camPos.lengthSq() - tca * tca;
      return d2 < PLANET_R * PLANET_R * 0.98;
    },
  };
}
