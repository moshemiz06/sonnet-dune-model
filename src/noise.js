import { mulberry32 } from './util.js';

// Improved Perlin noise (seeded permutation) plus fbm helpers.
const perm = new Uint8Array(512);
{
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  const rnd = mulberry32(1965);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

function grad(h, x, y, z) {
  h &= 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export function noise3(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  x -= fx; y -= fy; z -= fz;
  const X = fx & 255, Y = fy & 255, Z = fz & 255;
  const u = fade(x), v = fade(y), w = fade(z);
  const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
  return lerp(
    lerp(
      lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
      lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u),
      v,
    ),
    lerp(
      lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
      lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u),
      v,
    ),
    w,
  );
}

export const noise2 = (x, y) => noise3(x, y, 0.37);

// ~[-1, 1]
export function fbm3(x, y, z, oct = 5, lac = 2.0, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise3(x, y, z);
    norm += amp;
    amp *= gain;
    x *= lac; y *= lac; z *= lac;
  }
  return sum / norm;
}

// ~[0, 1], sharp ridges
export function ridged3(x, y, z, oct = 5, lac = 2.0, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(noise3(x, y, z));
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    x *= lac; y *= lac; z *= lac;
  }
  return sum / norm;
}

export function fbm2(x, y, oct = 4) {
  return fbm3(x, y, 0.37, oct);
}
export function ridged2(x, y, oct = 4) {
  return ridged3(x, y, 0.37, oct);
}
