import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './style.css';
import { createPlanetView } from './planet.js';
import { createArrakeenView } from './arrakeen/index.js';
import { heightAt } from './arrakeen/terrain.js';
import { LOCAL_PLACES } from './locations.js';
import { clamp, easeInOut } from './util.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, params.get('q') === 'low' ? 1 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.9;
controls.screenSpacePanning = false;

// ---------------------------------------------------------------- loading
function setProgress(p, text) {
  $('loader-bar').style.width = `${Math.round(p * 100)}%`;
  if (text) $('loader-text').textContent = text;
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

let planet, arrakeen, active;
const views = {};

async function boot() {
  setProgress(0.02, 'Surveying Arrakis…');
  await nextFrame();
  planet = await createPlanetView((p) => setProgress(0.02 + p * 0.7));
  setProgress(0.75, 'Raising Arrakeen…');
  await nextFrame();
  arrakeen = createArrakeenView();
  setProgress(0.95, 'Lighting the sun…');
  await nextFrame();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  planet.scene.environment = env;
  planet.scene.environmentIntensity = 0.08;
  arrakeen.scene.environment = env;
  pmrem.dispose();

  views.planet = planet;
  views.arrakeen = arrakeen;
  buildLabels(planet);
  buildLabels(arrakeen);
  buildPresets();
  setView('planet', { instant: true });
  setProgress(1);
  $('loader').classList.add('done');
  showInfo({ title: 'Arrakis', text: 'Third planet of Canopus and the only source of the spice melange. A world of open desert, sandworms and two moons, where water is wealth. Book One opens as House Atreides arrives to take the fief. Click a gold marker to look around, or descend to Arrakeen.', enter: true });
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- labels
const labelEls = new Map(); // view id -> [{el, def}]
function buildLabels(view) {
  const list = [];
  for (const def of view.labels) {
    const el = document.createElement('div');
    el.className = `label ${def.kind || ''}`;
    el.textContent = def.name || LOCAL_PLACES[def.id]?.name || def.id;
    el.style.display = 'none';
    el.addEventListener('click', () => selectPlace(view, def));
    $('labels').appendChild(el);
    list.push({ el, def });
  }
  labelEls.set(view.id, list);
}

const wp = new THREE.Vector3();
const camPos = new THREE.Vector3();
function updateLabels() {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  camPos.copy(camera.position);
  for (const [vid, list] of labelEls) {
    const isActive = views[vid] === active;
    for (const { el, def } of list) {
      if (!isActive) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      def.anchor.getWorldPosition(wp);
      let hidden = def.visible ? !def.visible() : false;
      if (!hidden && active.isOccluded) hidden = active.isOccluded(def, camPos, wp);
      wp.project(camera);
      if (wp.z > 1 || wp.z < -1) hidden = true;
      el.classList.toggle('hide', hidden);
      if (!hidden) {
        const x = (wp.x * 0.5 + 0.5) * w, y = (-wp.y * 0.5 + 0.5) * h;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, ${def.kind === 'region' ? '70%' : '-140%'})`;
      }
    }
  }
}

// ---------------------------------------------------------------- info card
let selected = null;
function showInfo({ title, text, enter }) {
  $('info-title').textContent = title;
  $('info-text').textContent = text;
  $('info-enter').hidden = !enter;
  $('info').hidden = false;
}
function closeInfo() {
  $('info').hidden = true;
  selected = null;
  planet?.setPaused(false);
  for (const list of labelEls.values()) for (const { el } of list) el.classList.remove('sel');
}
$('info-close').addEventListener('click', closeInfo);
$('info-enter').addEventListener('click', () => setView('arrakeen'));

function selectPlace(view, def) {
  for (const list of labelEls.values()) for (const { el, def: d } of list) el.classList.toggle('sel', d === def);
  selected = def.id;
  if (view.id === 'planet') {
    showInfo({ title: def.name, text: def.text, enter: def.enter });
    const pose = view.focus(def.id);
    if (pose) {
      view.setPaused(true);
      flyTo(pose.position, pose.target, 1.4);
    }
  } else {
    const info = LOCAL_PLACES[def.id];
    showInfo({ title: info.name, text: info.text, enter: false });
    const preset = view.presets.find((p) => p.id === view.placePreset[def.id]);
    if (preset) {
      flyTo(preset.position, preset.target, 1.8);
      markPreset(preset.id);
    }
  }
}

// ---------------------------------------------------------------- presets / time UI
function buildPresets() {
  const nav = $('presets');
  for (const p of arrakeen.presets) {
    const b = document.createElement('button');
    b.className = 'preset';
    b.dataset.id = p.id;
    b.textContent = p.label;
    b.addEventListener('click', () => {
      closeInfo();
      flyTo(p.position, p.target, 1.8);
      markPreset(p.id);
    });
    nav.appendChild(b);
  }
}
function markPreset(id) {
  for (const b of $('presets').children) b.classList.toggle('on', b.dataset.id === id);
}

const fmtHour = (h) => {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
let runDay = false;
$('hour').addEventListener('input', (e) => {
  runDay = false;
  $('btn-day').classList.remove('on');
  arrakeen.setHour(parseFloat(e.target.value));
  $('clock').textContent = fmtHour(arrakeen.getHour());
});
$('btn-day').addEventListener('click', () => {
  runDay = !runDay;
  $('btn-day').classList.toggle('on', runDay);
  $('btn-day').textContent = runDay ? 'Running…' : 'Run the day';
});
$('btn-events').addEventListener('click', () => {
  arrakeen.state.playing = !arrakeen.state.playing;
  $('btn-events').classList.toggle('on', arrakeen.state.playing);
  $('btn-events').textContent = `Harvest & worm: ${arrakeen.state.playing ? 'on' : 'paused'}`;
});
$('btn-labels').addEventListener('click', () => {
  const on = document.body.classList.toggle('nolabels');
  $('btn-labels').classList.toggle('on', !on);
});
$('btn-planet').addEventListener('click', () => setView('planet'));
$('btn-arrakeen').addEventListener('click', () => setView('arrakeen'));
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape') closeInfo();
  if (active === arrakeen && /^[1-5]$/.test(e.key)) {
    const p = arrakeen.presets[+e.key - 1];
    if (p) {
      closeInfo();
      flyTo(p.position, p.target, 1.8);
      markPreset(p.id);
    }
  }
});

// ---------------------------------------------------------------- views & camera
function applyView(view) {
  active = view;
  camera.fov = view.camera.fov;
  camera.near = view.id === 'planet' ? 0.5 : 2;
  camera.far = view.id === 'planet' ? 2000 : 20000;
  camera.updateProjectionMatrix();
  controls.minDistance = view.limits.min;
  controls.maxDistance = view.limits.max;
  controls.enablePan = view.id !== 'planet';
  controls.maxPolarAngle = view.id === 'planet' ? Math.PI : Math.PI * 0.497;
  camera.position.copy(view.camera.position);
  controls.target.copy(view.camera.target);
  controls.update();
  tween = null;

  $('btn-planet').classList.toggle('on', view.id === 'planet');
  $('btn-arrakeen').classList.toggle('on', view.id === 'arrakeen');
  $('time').hidden = view.id !== 'arrakeen';
  $('presets').hidden = view.id !== 'arrakeen';
  if (view.id === 'arrakeen') markPreset('overview');
}

function setView(id, { instant = false } = {}) {
  const view = views[id];
  if (!view || view === active) return;
  closeInfo();
  if (instant) return applyView(view);
  $('veil').classList.add('on');
  setTimeout(() => {
    applyView(view);
    if (id === 'arrakeen') showInfo({ title: 'Arrakeen', text: LOCAL_PLACES.city.text, enter: false });
    else showInfo({ title: 'Arrakis', text: 'Back in orbit. The Heighliner that brought the Atreides drifts above the planet, and the two moons circle below it.', enter: false });
    $('veil').classList.remove('on');
  }, 460);
}

let tween = null;
function flyTo(pos, target, dur = 1.5) {
  tween = {
    t: 0,
    dur,
    p0: camera.position.clone(),
    t0: controls.target.clone(),
    p1: pos.clone(),
    t1: target.clone(),
  };
}
function stepTween(dt) {
  if (!tween) return;
  tween.t += dt;
  const k = easeInOut(clamp(tween.t / tween.dur, 0, 1));
  camera.position.lerpVectors(tween.p0, tween.p1, k);
  controls.target.lerpVectors(tween.t0, tween.t1, k);
  if (tween.t >= tween.dur) tween = null;
}
// user input cancels a flight
for (const ev of ['pointerdown', 'wheel']) canvas.addEventListener(ev, () => (tween = null), { passive: true });

// ---------------------------------------------------------------- resize / adaptive quality
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let slow = 0, quality = 1;
function adaptQuality(dt) {
  if (quality === 0) return;
  slow = dt > 0.045 ? slow + dt : Math.max(0, slow - dt * 2);
  if (slow > 3) {
    quality = 0;
    renderer.setPixelRatio(1);
    arrakeen.setShadowSize(2048);
    resize();
  }
}

// ---------------------------------------------------------------- export
async function exportGLB() {
  const btn = $('btn-export');
  const root = active.scene;
  const hidden = [];
  root.traverse((o) => {
    if (o.userData.noExport && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  });
  btn.textContent = 'Exporting…';
  try {
    const buf = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
    const url = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = active.id === 'planet' ? 'arrakis-planet.glb' : 'arrakeen-book-one.glb';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    console.error('GLB export failed', err);
    alert(`GLB export failed: ${err.message || err}`);
  } finally {
    for (const o of hidden) o.visible = true;
    btn.textContent = 'Export .glb';
  }
}
$('btn-export').addEventListener('click', exportGLB);

// ---------------------------------------------------------------- loop
let last = performance.now(), time = 0;
function frame(now) {
  const real = (now - last) / 1000;
  const dt = Math.min(0.05, real);
  last = now;
  time += dt;
  adaptQuality(dt);

  stepTween(Math.min(0.25, real)); // camera flights follow wall-clock time
  controls.update();
  if (active === arrakeen) {
    const g = heightAt(camera.position.x, camera.position.z) + 6;
    if (camera.position.y < g) camera.position.y = g;
    if (runDay) {
      arrakeen.setHour(arrakeen.getHour() + dt * 0.34);
      $('hour').value = arrakeen.getHour();
      $('clock').textContent = fmtHour(arrakeen.getHour());
    }
  }
  active.update(dt, time, controls.target);
  active.afterCamera?.(camera);
  renderer.render(active.scene, camera);
  updateLabels();
  requestAnimationFrame(frame);
}

// debugging / scripted shots
window.__arrakis = {
  get view() { return active?.id; },
  setView: (id) => setView(id, { instant: true }),
  setHour: (h) => { arrakeen.setHour(h); $('hour').value = h; $('clock').textContent = fmtHour(arrakeen.getHour()); },
  setCycle: (c) => { arrakeen.state.cycle = c; },
  setCamera: (px, py, pz, tx, ty, tz) => { tween = null; camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); controls.update(); },
  closeInfo,
  renderer, camera, controls, get arrakeen() { return arrakeen; }, get planet() { return planet; },
};

boot().catch((err) => {
  console.error(err);
  $('loader-text').textContent = `Failed to load: ${err.message}`;
});
