// Equal Earth globe (github.com/thomas-shapiro/equal-earth), embedded in the right-hand panel.
// Geometry and flag textures are loaded from the live Equal Earth page, so both stay in sync.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SRC = 'https://thomas-shapiro.github.io/equal-earth/';
const SUBDIV = 8, LIFT = 0.012;

const stage = document.getElementById('globe');
const tip = document.getElementById('tip');
const statusEl = document.getElementById('globe-status');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
camera.position.set(0, 0.9, 3.9);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8090b0, 1.35));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(-1.2, 1.4, 2.5);
camera.add(key);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.enableZoom = false;          // the page scrolls; the globe does not zoom
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.55;
controls.addEventListener('start', () => { controls.autoRotate = false; });

scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(0.997, 160, 120),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
));

const hoverUniform = { value: -1 };
function makeMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHover = hoverUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float cell;\nuniform float uHover;\nvarying float vHi;')
      .replace('#include <begin_vertex>',
        `#include <begin_vertex>\nvHi = 1.0 - step(0.5, abs(cell - uHover));\ntransformed *= 1.0 + ${LIFT.toFixed(4)} * vHi;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHi;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 1.0 + 0.22 * vHi;');
  };
  return m;
}

function buildCells(cells, texIndex, key = 'inner', radius = 1) {
  const pos = [], uv = [], cellAttr = [], index = [];
  const v3 = new THREE.Vector3();
  cells.forEach((cl, ci) => {
    if (texIndex >= 0 && cl.tex !== texIndex) return;
    const c = new THREE.Vector3(...cl.c), e = new THREE.Vector3(...cl.e), n = new THREE.Vector3(...cl.n);
    const [u0, v0, sz] = cl.tile, s = cl.s, poly = cl[key], k = poly.length;
    for (let j = 0; j < k; j++) {
      const A = poly[j], B = poly[(j + 1) % k];
      const base = pos.length / 3, id = {};
      let m = 0;
      for (let a = 0; a <= SUBDIV; a++) for (let b = 0; b <= SUBDIV - a; b++) {
        const pu = (a * A[0] + b * B[0]) / SUBDIV, pw = (a * A[1] + b * B[1]) / SUBDIV;
        v3.copy(c).addScaledVector(e, pu).addScaledVector(n, pw).normalize().multiplyScalar(radius);
        pos.push(v3.x, v3.y, v3.z);
        uv.push(u0 + (0.5 + pu / (2 * s)) * sz, v0 + (0.5 + pw / (2 * s)) * sz);
        cellAttr.push(ci);
        id[a + ',' + b] = base + m++;
      }
      for (let a = 0; a < SUBDIV; a++) for (let b = 0; b < SUBDIV - a; b++) {
        index.push(id[a + ',' + b], id[(a + 1) + ',' + b], id[a + ',' + (b + 1)]);
        if (a + b + 2 <= SUBDIV) index.push(id[(a + 1) + ',' + b], id[(a + 1) + ',' + (b + 1)], id[a + ',' + (b + 1)]);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('cell', new THREE.Float32BufferAttribute(cellAttr, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

// ---- size ---------------------------------------------------------------------
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
  camera.position.setLength(1.06 / Math.sin(Math.min(vf, hf)));
}
new ResizeObserver(resize).observe(stage);
resize();

let cells = [], pickables = [], centres = [];
let pinned = -1, pointer = null, downAt = null;

try {
  const data = await (await fetch(SRC + 'data/globe.json')).json();
  cells = data.cells;
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const textures = await Promise.all(data.atlases.map((p) => loader.loadAsync(new URL(p, SRC).href)));
  pickables = textures.map((tex, ti) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    const mesh = new THREE.Mesh(buildCells(cells, ti), makeMaterial(tex));
    scene.add(mesh);
    return mesh;
  });
  scene.add(new THREE.Mesh(buildCells(cells, -1, 'rim', 0.9993),
    new THREE.MeshStandardMaterial({ color: 0xa9b2bf, roughness: 0.9 })));
  centres = cells.map((c) => new THREE.Vector3(...c.c));
  statusEl.remove();
} catch (err) {
  statusEl.textContent = 'The globe could not load.';
}

// ---- hover / tap ----------------------------------------------------------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const unitSphere = new THREE.Sphere(new THREE.Vector3(), 1);
function pick(x, y) {
  if (!cells.length) return -1;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  if (hit) return hit.object.geometry.getAttribute('cell').getX(hit.face.a);
  const p = ray.ray.intersectSphere(unitSphere, new THREE.Vector3());
  if (!p) return -1;
  let best = -1, bd = -2;
  centres.forEach((c, i) => { const d = c.dot(p); if (d > bd) { bd = d; best = i; } });
  return best;
}
function showTip(i, x, y) {
  if (i < 0) { tip.style.transform = 'translate(-9999px,0)'; return; }
  tip.textContent = cells[i].name;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const px = Math.min(Math.max(8, x + 14), innerWidth - w - 8);
  const py = Math.min(Math.max(8, y + 16), innerHeight - h - 8);
  tip.style.transform = `translate(${px}px, ${py}px)`;
}
function screenOf(i) {
  const v = new THREE.Vector3(...cells[i].c).project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
}
const cv = renderer.domElement;
cv.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') pointer = [ev.clientX, ev.clientY]; });
cv.addEventListener('pointerleave', () => { pointer = null; });
cv.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
cv.addEventListener('pointerup', (ev) => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 6) return;
  const i = pick(ev.clientX, ev.clientY);
  pinned = (i === pinned) ? -1 : i;
  if (ev.pointerType !== 'mouse') pointer = null;
});

// ---- loop -------------------------------------------------------------------------
function frame() {
  controls.update();
  let i = -1, x = 0, y = 0;
  if (pointer) { i = pick(pointer[0], pointer[1]); [x, y] = pointer; }
  cv.classList.toggle('pointing', i >= 0);
  if (i < 0 && pinned >= 0) {
    if (new THREE.Vector3(...cells[pinned].c).dot(camera.position) > 1) { i = pinned; [x, y] = screenOf(pinned); }
    else pinned = -1;
  }
  hoverUniform.value = i;
  showTip(i, x, y);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
