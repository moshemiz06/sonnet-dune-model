import * as THREE from 'three';
import { smoothstep, clamp, mulberry32 } from '../util.js';
import { sandColor } from './terrain.js';

const UP = new THREE.Vector3(0, 1, 0);

// A tube swept along a polyline (index 0 = head) using parallel-transport frames.
class TubeBody {
  constructor(n, ringSeg, material, withColor = false) {
    this.n = n;
    this.ring = ringSeg;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * ringSeg * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * ringSeg * 3), 3));
    if (withColor) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * ringSeg * 3), 3));
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < ringSeg; j++) {
        const a = i * ringSeg + j, b = i * ringSeg + ((j + 1) % ringSeg);
        const c = (i + 1) * ringSeg + j, d = (i + 1) * ringSeg + ((j + 1) % ringSeg);
        idx.push(a, c, b, b, c, d);
      }
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.T = Array.from({ length: n }, () => new THREE.Vector3());
    this.N = Array.from({ length: n }, () => new THREE.Vector3());
    this.B = Array.from({ length: n }, () => new THREE.Vector3());
    this._q = new THREE.Quaternion();
  }

  setColors(fn) {
    const c = this.geo.attributes.color;
    const col = new THREE.Color();
    for (let i = 0; i < this.n; i++) {
      fn(i, col);
      for (let j = 0; j < this.ring; j++) c.setXYZ(i * this.ring + j, col.r, col.g, col.b);
    }
    c.needsUpdate = true;
  }

  update(P, R) {
    const { n, ring, T, N, B } = this;
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, n - 1)];
      T[i].subVectors(a, b).normalize();
    }
    // initial frame
    const ref = Math.abs(T[0].y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP;
    N[0].crossVectors(T[0], ref).normalize();
    B[0].crossVectors(T[0], N[0]).normalize();
    for (let i = 1; i < n; i++) {
      this._q.setFromUnitVectors(T[i - 1], T[i]);
      N[i].copy(N[i - 1]).applyQuaternion(this._q);
      B[i].crossVectors(T[i], N[i]).normalize();
    }
    const pos = this.geo.attributes.position;
    for (let i = 0; i < n; i++) {
      const p = P[i], r = R[i];
      for (let j = 0; j < ring; j++) {
        const a = (j / ring) * Math.PI * 2;
        const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
        pos.setXYZ(
          i * ring + j,
          p.x + N[i].x * ca + B[i].x * sa,
          p.y + N[i].y * ca + B[i].y * sa,
          p.z + N[i].z * ca + B[i].z * sa,
        );
      }
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

export class SandWorm {
  constructor({ radius = 10, segments = 72 } = {}) {
    this.R = radius;
    this.n = segments;
    this.group = new THREE.Group();
    this.group.name = 'Sandworm';

    const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide });
    this.body = new TubeBody(segments, 24, skin, true);
    this.body.setColors((i, c) => {
      const band = i % 2 === 0;
      c.set(band ? '#7d6a58' : '#5b4c3f');
      c.multiplyScalar(0.9 + 0.1 * Math.sin(i * 0.37));
    });
    this.group.add(this.body.mesh);

    const sand = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    this.mound = new TubeBody(segments, 16, sand, true);
    this.mound.mesh.castShadow = false;
    this.group.add(this.mound.mesh);

    // head: crystalline teeth ringing a glowing throat
    this.head = new THREE.Group();
    const toothGeo = new THREE.ConeGeometry(0.075, 0.55, 6);
    toothGeo.translate(0, 0.275, 0);
    const toothMat = new THREE.MeshStandardMaterial({ color: '#f0ddb0', roughness: 0.25, metalness: 0.1, emissive: '#7a4a18', emissiveIntensity: 0.5 });
    const q = new THREE.Quaternion(), dir = new THREE.Vector3();
    const addRing = (count, rho, z, tilt, len) => {
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + (rho < 0.9 ? 0.1 : 0);
        const tooth = new THREE.Mesh(toothGeo, toothMat);
        tooth.position.set(Math.cos(a) * rho, Math.sin(a) * rho, z);
        dir.set(-Math.cos(a) * tilt, -Math.sin(a) * tilt, 0.55).normalize();
        q.setFromUnitVectors(UP, dir);
        tooth.quaternion.copy(q);
        tooth.scale.set(1, len, 1);
        tooth.castShadow = true;
        this.head.add(tooth);
      }
    };
    addRing(30, 0.97, 0, 0.62, 1.1);
    addRing(22, 0.76, -0.12, 0.45, 0.85);
    const throatGeo = new THREE.ConeGeometry(0.95, 1.8, 36, 1, true);
    throatGeo.rotateX(-Math.PI / 2);
    throatGeo.translate(0, 0, -0.9);
    const throat = new THREE.Mesh(
      throatGeo,
      new THREE.MeshStandardMaterial({ color: '#1b0d08', emissive: '#6a210c', emissiveIntensity: 0.7, side: THREE.DoubleSide, roughness: 0.9 }),
    );
    this.head.add(throat);
    this.head.scale.setScalar(radius);
    this.group.add(this.head);

    this._pts = Array.from({ length: segments }, () => new THREE.Vector3());
    this._r = new Float32Array(segments);
    this._m = new Float32Array(segments);
    this._basis = new THREE.Matrix4();
  }

  /**
   * points[0] is the head. offsets[i] = how far the tube centre sits above the ground.
   * life 0..1 scales the sand mound that shows a shallow worm moving under the dunes.
   */
  update(points, offsets, life) {
    const { n, R } = this;
    let breach = false;
    for (let i = 0; i < n; i++) if (offsets[i] > -R * 1.05) breach = true;

    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      this._r[i] = R * (1 - 0.2 * u) * (1 + 0.05 * Math.sin(i * 2.1)) * (i === 0 ? 1.06 : 1);
      // the sand ridge fades once the worm is surfaced, and thins toward the tail
      const shallow = 1 - smoothstep(-R * 0.9, 2, offsets[i]);
      this._m[i] = R * 0.88 * life * shallow * (1 - smoothstep(0.1, 0.95, u) * 0.85);
    }
    this.body.mesh.visible = breach && life > 0;
    this.head.visible = this.body.mesh.visible && offsets[0] > -R * 0.9;
    if (this.body.mesh.visible) this.body.update(points, this._r);

    // mound path: same track, tube centre sunk just under the surface
    for (let i = 0; i < n; i++) this._pts[i].set(points[i].x, points[i].y - offsets[i] - R * 0.16, points[i].z);
    this.mound.mesh.visible = life > 0.02;
    if (this.mound.mesh.visible) {
      this.mound.update(this._pts, this._m);
      this.mound.setColors((i, c) => sandColor(this._pts[i].x, this._pts[i].z, c));
    }

    if (this.head.visible) {
      this._basis.makeBasis(this.body.N[0], this.body.B[0], this.body.T[0]);
      this.head.quaternion.setFromRotationMatrix(this._basis);
      this.head.position.copy(points[0]);
    }
  }
}

// Soft billboard dust. Particles carry their own alpha/size so a single draw call can fade them out.
export class Dust {
  constructor(max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(1e9);
    this.life = new Float32Array(max).fill(1);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.base = new Float32Array(max);
    this.cursor = 0;
    this.rnd = mulberry32(5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.uniforms = { uColor: { value: new THREE.Color('#d9a869') }, uScale: { value: 600 } };
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
          void main() {
            vA = aAlpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = min(aSize * uScale / max(-mv.z, 1.0), 110.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.1, d) * vA;
            if (a < 0.01) discard;
            gl_FragColor = vec4(uColor, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.points.frustumCulled = false;
    this.points.userData.noExport = true;
    this.points.renderOrder = 2;
  }

  emit(x, y, z, count, { spread = 4, up = 6, out = 4, size = 7, life = 2.4, alpha = 0.5 } = {}) {
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const r = this.rnd;
      this.pos[i * 3] = x + (r() - 0.5) * spread;
      this.pos[i * 3 + 1] = y + r() * spread * 0.4;
      this.pos[i * 3 + 2] = z + (r() - 0.5) * spread;
      const a = r() * Math.PI * 2, o = r() * out;
      this.vel[i * 3] = Math.cos(a) * o;
      this.vel[i * 3 + 1] = up * (0.3 + r() * 0.7);
      this.vel[i * 3 + 2] = Math.sin(a) * o;
      this.age[i] = 0;
      this.life[i] = life * (0.6 + r() * 0.6);
      this.size[i] = size * (0.6 + r() * 0.8);
      this.base[i] = alpha;
    }
  }

  update(dt, wind) {
    const drag = Math.exp(-dt * 0.9);
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) {
        this.alpha[i] = 0;
        continue;
      }
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      this.vel[i * 3] = this.vel[i * 3] * drag + wind.x * dt;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - 1.2 * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * drag + wind.z * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = this.base[i] * Math.sin(clamp(k, 0, 1) * Math.PI) ** 0.8;
      this.size[i] *= 1 + dt * 0.5;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}
