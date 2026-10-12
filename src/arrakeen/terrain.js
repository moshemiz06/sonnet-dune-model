import * as THREE from 'three';
import { noise2, noise3, fbm2 } from '../noise.js';
import { clamp, smoothstep, lerp, sq } from '../util.js';

// World layout. -Z is north (the Shield Wall); +X is east (the spaceport); +Z opens onto the dunes.
export const HALF = 1000;
export const WALL_Z = -390;
export const GAP_X = -110;
export const CITY = { x: -110, z: -205, rx: 250, rz: 175, y: 8 };
export const RESIDENCY = { x: -110, z: -300, w: 170, d: 106, y: 15 };
export const PORT = { x: 410, z: -110, r: 205, y: 5 };
export const FIELD = { x: -60, z: 390 };

const WIND = (28 * Math.PI) / 180;
const cw = Math.cos(WIND), sw = Math.sin(WIND);

// distance into the Shield Wall (positive = north of the wall's base line)
export function wallDepth(x, z) {
  const wob = 30 * noise2(x * 0.004, 3.1) + 12 * noise2(x * 0.011, 9.2);
  return WALL_Z - z + wob;
}

function duneHeight(x, z) {
  const u = x * cw + z * sw;
  const v = -x * sw + z * cw;
  const warp = 1.3 * noise2(x * 0.0035, z * 0.0035) + 0.35 * noise2(x * 0.011 + 5, z * 0.011);
  const wl = 120 + 35 * noise2(x * 0.002 + 11, z * 0.002);
  const ph = u / wl + warp + 0.25 * noise2(v * 0.02, u * 0.004);
  const p = ph - Math.floor(ph);
  // windward ramp and lee face, joined with a smooth-min so crests are rounded rather than knife-edged
  const wa = Math.pow(p / 0.72, 1.5), lb = Math.pow((1 - p) / 0.28, 1.15);
  const jh = Math.max(0.22 - Math.abs(wa - lb), 0) / 0.22;
  const prof = Math.min(wa, lb) - jh * jh * 0.055;
  const amp = (11 + 12 * (0.5 + 0.5 * noise2(x * 0.0028 + 7, z * 0.0028))) * (1 + 0.7 * smoothstep(0, 600, z));
  return 8 + 7 * noise2(x * 0.0015, z * 0.0015 + 4) + amp * prof;
}

function wallHeight(x, z, dz) {
  const face = smoothstep(0, 1, clamp(dz / 110, 0, 1));
  const varia = 0.5 + 0.5 * fbm2(x * 0.004 + 3, z * 0.003, 3);
  // vertical erosion grooves cut into the cliff face
  const gully = noise2(x * 0.045, dz * 0.006) * 7 + noise2(x * 0.11, dz * 0.012) * 2.5;
  let h = face * (130 + 70 * varia + gully) + clamp((dz - 110) / 450, 0, 1) * 150 * (0.6 + 0.8 * varia);
  // strata / ledges
  const s = 12;
  const hn = h + 3.5 * noise2(x * 0.03, z * 0.03);
  const f = hn / s;
  const terr = (Math.floor(f) + smoothstep(0.35, 0.65, f - Math.floor(f))) * s;
  h = lerp(h, terr, 0.7);
  // the Old Gap: a meandering canyon whose floor climbs slowly into the mountains
  const gx = GAP_X + 26 * Math.sin(dz * 0.012);
  const gapW = 62 + 14 * Math.sin(dz * 0.02);
  const gap = Math.exp(-sq((x - gx) / gapW));
  const floor = 10 + Math.max(dz, 0) * 0.1;
  h = lerp(h, floor, gap * smoothstep(-30, 70, dz));
  return h;
}

export function heightAt(x, z) {
  const dz = wallDepth(x, z);
  const rockW = smoothstep(-20, 90, dz);
  let h = duneHeight(x, z) * (1 - rockW);
  if (dz > -60) h += wallHeight(x, z, dz) * smoothstep(-60, 10, dz);

  // city bedrock shelf
  const cd = Math.hypot((x - CITY.x) / CITY.rx, (z - CITY.z) / CITY.rz);
  const cm = 1 - smoothstep(0.82, 1.12, cd);
  h = lerp(h, CITY.y, cm);
  // Residency terrace
  const rd = Math.max(Math.abs(x - RESIDENCY.x) / (RESIDENCY.w / 2 + 16), Math.abs(z - RESIDENCY.z) / (RESIDENCY.d / 2 + 16));
  h = lerp(h, RESIDENCY.y, 1 - smoothstep(0.92, 1.18, rd));
  // spaceport apron
  const pd = Math.hypot(x - PORT.x, z - PORT.z) / PORT.r;
  h = lerp(h, PORT.y, 1 - smoothstep(0.85, 1.2, pd));
  // fade the tile edge to the horizon
  const edge = 1 - smoothstep(820, 990, Math.max(Math.abs(x), Math.abs(z)));
  return h * edge;
}

const col = (s) => new THREE.Color(s);
const SAND_LO = col('#b4602a'), SAND_HI = col('#dc9c54'), SAND_SPICE = col('#bd4c1a');
const ROCK_A = col('#5c4638'), ROCK_B = col('#8b6a50'), ROCK_C = col('#a07e5f');
const SHELF = col('#a58d6e'), PAVE = col('#7d6e5d'), PAD = col('#8c8173');

// base desert colour (sand + spice staining around the harvest); also used to tint the worm's sand ridge
export function sandColor(x, z, out) {
  const grain = noise3(x * 0.09, z * 0.09, 1.3);
  const patch = 0.5 + 0.5 * noise2(x * 0.006 + 20, z * 0.006);
  out.copy(SAND_LO).lerp(SAND_HI, clamp(patch * 0.8 + grain * 0.25 + 0.1, 0, 1));
  const sd = Math.hypot(x - FIELD.x, z - FIELD.z);
  const spice = (1 - smoothstep(60, 260, sd + 60 * noise2(x * 0.01, z * 0.01))) * 0.75;
  return out.lerp(SAND_SPICE, spice);
}

// distance from (x,z) to the segment a-b
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

export function roadDistance(x, z) {
  // main avenue from the Residency gate south, a cross street, and the road to the spaceport
  return Math.min(
    segDist(x, z, RESIDENCY.x, RESIDENCY.z + RESIDENCY.d / 2, RESIDENCY.x, CITY.z + CITY.rz - 10),
    segDist(x, z, CITY.x - 190, CITY.z + 20, CITY.x + 230, CITY.z + 20),
    segDist(x, z, CITY.x + 230, CITY.z + 20, PORT.x - 90, PORT.z + 40),
  );
}

export function createTerrain(seg = 480) {
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), rock = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nrm.getY(i);
    const grain = noise3(x * 0.09, z * 0.09, 1.3);
    sandColor(x, z, c);

    // rock
    const dz = wallDepth(x, z);
    const steep = smoothstep(0.82, 0.58, ny);
    const rockMix = Math.max(steep * smoothstep(-10, 40, dz + 40), smoothstep(-5, 70, dz) * 0.92);
    const band = 0.5 + 0.5 * Math.sin(y * 0.55 + noise2(x * 0.02, z * 0.02) * 4);
    rock.copy(ROCK_A).lerp(ROCK_B, band).lerp(ROCK_C, clamp(grain * 0.6 + (y / 260) * 0.5, 0, 1));
    c.lerp(rock, clamp(rockMix, 0, 1));

    // city shelf, roads, apron
    const cd = Math.hypot((x - CITY.x) / CITY.rx, (z - CITY.z) / CITY.rz);
    c.lerp(SHELF, (1 - smoothstep(0.78, 1.05, cd)) * 0.9);
    const rdist = roadDistance(x, z);
    const roadMask = 1 - smoothstep(4.5, 7.5, rdist);
    const onShelfOrPort = Math.max(1 - smoothstep(0.9, 1.3, cd), 1 - smoothstep(0.9, 1.3, Math.hypot(x - PORT.x, z - PORT.z) / PORT.r));
    c.lerp(PAVE, roadMask * onShelfOrPort);
    const pd = Math.hypot(x - PORT.x, z - PORT.z) / PORT.r;
    c.lerp(PAD, (1 - smoothstep(0.62, 0.8, pd)) * 0.9);
    // landing circles
    c.multiplyScalar(0.96 + grain * 0.06);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  mesh.name = 'Terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}
