import * as THREE from 'three';
import { mulberry32, smoothstep, clamp } from './util.js';

// Palette keyed by sun elevation (degrees). Interpolated for horizon/zenith/sun colour.
const KEYS = [
  { e: -90, h: '#0a0e28', z: '#02040c', s: '#ff8a40' },
  { e: -18, h: '#121838', z: '#04071a', s: '#ff7a30' },
  { e: -8, h: '#4a2f55', z: '#0c1431', s: '#ff6a28' },
  { e: -2, h: '#d45a30', z: '#2a2f5c', s: '#ff6a28' },
  { e: 3, h: '#f08a3c', z: '#42588e', s: '#ff9a48' },
  { e: 12, h: '#f3b46a', z: '#5f86b4', s: '#ffc27a' },
  { e: 30, h: '#ecc99a', z: '#6f9cc4', s: '#ffe3b8' },
  { e: 90, h: '#e9cfa6', z: '#5f93c0', s: '#fff1d6' },
];
for (const k of KEYS) {
  k.hc = new THREE.Color(k.h);
  k.zc = new THREE.Color(k.z);
  k.sc = new THREE.Color(k.s);
}

export function skyState(elevDeg, out = {}) {
  out.horizon ??= new THREE.Color();
  out.zenith ??= new THREE.Color();
  out.sunColor ??= new THREE.Color();
  let i = 0;
  while (i < KEYS.length - 2 && elevDeg > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp((elevDeg - a.e) / (b.e - a.e), 0, 1);
  out.horizon.copy(a.hc).lerp(b.hc, t);
  out.zenith.copy(a.zc).lerp(b.zc, t);
  out.sunColor.copy(a.sc).lerp(b.sc, t);
  out.night = 1 - smoothstep(-14, -2, elevDeg);
  out.sunStrength = smoothstep(-3, 9, elevDeg);
  return out;
}

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }
`;
const skyFrag = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunVis;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float t = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(t, 0.5));
    col = mix(col, uHorizon, exp(-t * 14.0) * 0.55);
    float sd = max(dot(d, uSunDir), 0.0);
    float glow = pow(sd, 600.0) * 6.0 + pow(sd, 24.0) * 0.45 + pow(sd, 5.0) * 0.14;
    col += uSunColor * glow * uSunVis;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SkyDome {
  constructor() {
    this.group = new THREE.Group();
    this.group.userData.noExport = true;
    this.uniforms = {
      uHorizon: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunVis: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), mat);
    this.dome.renderOrder = -3;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // stars
    const rnd = mulberry32(7);
    const n = 3500;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const y = Math.abs(u) * 0.98 + 0.02;
      pos.set([Math.cos(th) * r * 8000, y * 8000, Math.sin(th) * r * 8000], i * 3);
      c.setHSL(0.55 + rnd() * 0.15, 0.3 * rnd(), 0.65 + rnd() * 0.35);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({
      size: 1.7,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.renderOrder = -2;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
  }

  update(camera, sunDir, st) {
    this.group.position.copy(camera.position);
    this.uniforms.uHorizon.value.copy(st.horizon);
    this.uniforms.uZenith.value.copy(st.zenith);
    this.uniforms.uSunColor.value.copy(st.sunColor);
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunVis.value = clamp(st.sunStrength * 1.0 + 0.0, 0, 1) * (sunDir.y > -0.05 ? 1 : 0);
    this.starMat.opacity = st.night;
  }
}

// Canvas texture for a cratered moon, optionally with the "desert mouse" pattern of the second moon.
export function makeMoonTexture({ seed = 3, mouse = false, tint = '#cfc6b4' } = {}) {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(seed);

  // soft maria
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = H * (0.15 + rnd() * 0.7), r = 30 + rnd() * 90;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(70,64,56,0.28)');
    gr.addColorStop(1, 'rgba(70,64,56,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  if (mouse) {
    // The Fremen see a mouse in the markings: ears, body, long tail. Centred where the moon faces the planet.
    ctx.fillStyle = 'rgba(52,46,40,0.55)';
    const cx = W * 0.5, cy = H * 0.5;
    ctx.beginPath(); ctx.ellipse(cx, cy + 10, 62, 38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 62, cy - 14, 28, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 52, cy - 44, 17, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 80, cy - 40, 17, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(52,46,40,0.55)';
    ctx.beginPath();
    ctx.moveTo(cx - 60, cy + 12);
    ctx.bezierCurveTo(cx - 110, cy + 40, cx - 130, cy - 10, cx - 170, cy + 8);
    ctx.stroke();
  }

  // craters
  for (let i = 0; i < 420; i++) {
    const x = rnd() * W, y = rnd() * H;
    const r = 2 + Math.pow(rnd(), 3) * 26;
    ctx.fillStyle = `rgba(40,36,30,${0.12 + rnd() * 0.16})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,250,240,0.22)';
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.beginPath(); ctx.arc(x - r * 0.12, y - r * 0.12, r, 0.6, 3.6); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
