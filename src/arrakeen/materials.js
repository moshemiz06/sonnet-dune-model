import * as THREE from 'three';

// Shared "night" amount (0 day .. 1 night); drives lit windows and lamps.
export const nightUniform = { value: 0 };

// Stone material that paints narrow slit windows in world space (so every box, any size, gets
// a consistent grid) and lights them at night. Works for plain meshes and InstancedMesh.
export function makeStoneMaterial({ color = '#ffffff', roughness = 0.92, windows = true } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
  if (!windows) return mat;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          mat4 wm = modelMatrix * instanceMatrix;
        #else
          mat4 wm = modelMatrix;
        #endif
        vWPos = (wm * vec4(transformed, 1.0)).xyz;
        vWN = normalize(mat3(wm) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uNight;
        varying vec3 vWPos;
        varying vec3 vWN;
        float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float winMask = 0.0;
        float winLit = 0.0;
        if (abs(vWN.y) < 0.5 && vWPos.y > 9.0) {
          bool alongX = abs(vWN.x) > abs(vWN.z);
          float h = alongX ? vWPos.z : vWPos.x;
          float k = alongX ? vWPos.x : vWPos.z;
          vec2 g = vec2(h / 5.5, vWPos.y / 6.5);
          vec2 cell = floor(g);
          vec2 f = fract(g);
          winMask = step(0.36, f.x) * step(f.x, 0.64) * step(0.3, f.y) * step(f.y, 0.78);
          float r = hash21(cell + floor(k / 4.0) * 7.31 + (alongX ? 11.0 : 0.0));
          winLit = step(0.52, r);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.04, 0.035), winMask * 0.85);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += winMask * winLit * vec3(1.0, 0.66, 0.3) * 1.05 * uNight;`,
      );
  };
  mat.customProgramCacheKey = () => 'stone-windows';
  return mat;
}

export function makeBannerTexture() {
  const W = 512, H = 340;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0c5a34';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, 26);
  ctx.fillRect(0, H - 26, W, 26);
  ctx.strokeStyle = 'rgba(200,160,60,0.9)';
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, W - 68, H - 68);

  // stylised hawk, wings raised with splayed primaries
  const cx = W / 2, cy = H / 2 + 8, s = 1.0;
  const right = [
    [0, -84], [9, -76], [11, -62], [30, -70], [56, -102], [98, -134], [88, -104], [128, -114], [110, -84],
    [150, -88], [124, -60], [156, -52], [122, -36], [70, -24], [26, -12], [20, 18], [38, 66], [24, 78], [12, 92], [0, 98],
  ];
  const pts = [...right, ...[...right].reverse().map(([x, y]) => [-x, y])];
  ctx.fillStyle = '#c4281c';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * s, cy + y * s) : ctx.moveTo(cx + x * s, cy + y * s)));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#f0b455';
  ctx.lineWidth = 2;
  ctx.stroke();
  // beak and eye
  ctx.fillStyle = '#f0b455';
  ctx.beginPath(); ctx.moveTo(cx - 3, cy - 72); ctx.lineTo(cx + 3, cy - 72); ctx.lineTo(cx, cy - 60); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffe9b8';
  ctx.beginPath(); ctx.arc(cx + 5, cy - 77, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx - 5, cy - 77, 2.4, 0, Math.PI * 2); ctx.fill();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
