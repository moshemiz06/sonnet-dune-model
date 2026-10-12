export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sq = (x) => x * x;

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Latitude/longitude (degrees) -> unit vector, matching three's SphereGeometry UV layout
// (u = 0.5 faces +X, increasing u sweeps toward -Z).
export function latLonToVec(latDeg, lonDeg, out) {
  const phi = (latDeg * Math.PI) / 180;
  const lam = (lonDeg * Math.PI) / 180;
  const c = Math.cos(phi);
  out.set(c * Math.cos(lam), Math.sin(phi), -c * Math.sin(lam));
  return out;
}
