// 3D dice visuals for the roll popup (dice.html) — lightweight take on the
// official Owlbear dice plugin: its GLB meshes + locator face convention,
// no physics engine. Top-down tray view; printed face numbers (canvas
// textures placed just above each face); each die scatters, tumbles and
// settles with the rolled value's face up. Crits glow gold, natural 1s red.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const params = new URLSearchParams(location.search);
const label = params.get('label') || 'Lancer de dés';
const formula = params.get('formula') || '';
const total = params.get('total');
const rolls = (params.get('rolls') || '').split(',').filter(Boolean);
const types = (params.get('types') || '').split(',').filter(Number);
const error = params.get('error');
const color = params.get('color') || '#312e81';
const mode = params.get('mode') || '';

document.getElementById('label').textContent = label;
const row = document.getElementById('dice-row');
const totalEl = document.getElementById('total');
const formulaEl = document.getElementById('formula');

const SIDES_TO_TYPE = { 4: 'd4', 6: 'd6', 8: 'd8', 10: 'd10', 12: 'd12', 20: 'd20', 100: 'd100' };

// Max-value roll ("crit"): a die equal to its size · natural 1 ("fail")
const crit = rolls.some((r, i) => parseInt(r, 10) === parseInt(types[i], 10));
const fail = rolls.some((r) => parseInt(r, 10) === 1);

if (error) {
  formulaEl.textContent = formula;
  totalEl.style.display = 'none';
  const el = document.createElement('div');
  el.className = 'error';
  el.textContent = 'Formule invalide : ' + error;
  row.replaceWith(el);
} else if (mode === 'flat') {
  // GM chose the classic (flat) dice visuals
  fallbackFlat();
} else if (
  !types.length ||
  types.length !== rolls.length ||
  types.some((t) => !SIDES_TO_TYPE[t])
) {
  fallbackFlat();
} else {
  formulaEl.textContent = formula;
  run3D();
}

function fallbackFlat() {
  rolls.forEach((r, i) => {
    const die = document.createElement('div');
    die.className = parseInt(r, 10) === parseInt(types[i], 10) ? 'die crit' : parseInt(r, 10) === 1 ? 'die fail' : 'die';
    die.style.animationDelay = `${i * 0.08}s`;
    die.textContent = r;
    row.appendChild(die);
  });
  totalEl.style.animationDelay = `${0.45 + rolls.length * 0.08}s`;
  if (crit) totalEl.classList.add('crit');
  else if (fail) totalEl.classList.add('fail');
  totalEl.textContent = total != null && total !== '' ? total : '—';
}

// Visual meshes per die; a d100 renders as percentile die + ones d10.
function meshDefsFor() {
  const defs = [];
  types.forEach((sides, i) => {
    const value = parseInt(rolls[i], 10);
    if (sides === 100) {
      const tens = value === 100 ? 0 : Math.floor(value / 10) * 10;
      const ones = value % 10;
      defs.push({ type: 'd100', value: tens, label: String(tens).padStart(2, '0'), crit: value === 100, fail: false });
      defs.push({ type: 'd10', value: ones, label: String(ones), crit: false, fail: ones === 1 });
    } else {
      defs.push({ type: SIDES_TO_TYPE[sides], value, label: String(value), crit: value === sides, fail: value === 1 });
    }
  });
  return defs;
}

const LOCATOR_PREFIX = { d4: '004', d6: '006', d8: '008', d10: '010', d12: '012', d20: '020', d100: '100' };

function locatorKey(type, value) {
  if (type === 'd100') return String(value).padStart(2, '0'); // 00,10…90
  if (type === 'd10') return String(value % 10); // 10 shows as 0
  return String(value);
}

function smoothstep(k) {
  return k * k * (3 - 2 * k);
}

// ─── Printed face numbers ────────────────────────────────────────────────
const numberTextureCache = new Map();

function numberTexture(text) {
  if (numberTextureCache.has(text)) return numberTextureCache.get(text);
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${text.length > 1 ? 46 : 58}px system-ui, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(15,23,42,0.9)';
  ctx.strokeText(text, 48, 50);
  ctx.fillStyle = '#f9fafb';
  ctx.fillText(text, 48, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  numberTextureCache.set(text, texture);
  return texture;
}

// Per-type face geometry from the loaded GLB: locator world directions and
// mesh radius (locators sit slightly INSIDE the mesh — measured from bbox).
const typeGeometryCache = new Map();

function typeGeometry(gltfScene) {
  gltfScene.updateMatrixWorld(true);
  const dieNode = gltfScene.children[0]; // "d20" node; its children are the locators
  if (!dieNode) return null;
  const bbox = new THREE.Box3().setFromObject(gltfScene);
  const size = bbox.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) / 2;
  const faces = new Map();
  for (const locator of dieNode.children) {
    const match = locator.name.match(/_locator_(.+)$/);
    if (!match) continue;
    const world = new THREE.Vector3();
    locator.getWorldPosition(world);
    faces.set(match[1], { dir: world.clone().normalize(), dist: world.length() });
  }
  return { radius, faces };
}

// A number plane for each face, anchored just above its locator
function addFaceNumbers(dieGroup, geom, type) {
  const geometry = new THREE.PlaneGeometry(0.62, 0.62);
  for (const [num, { dir, dist }] of geom.faces) {
    const text = type === 'd100' ? num.padStart(2, '0') : num;
    const plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      map: numberTexture(text),
      transparent: true,
      depthWrite: false
    }));
    plane.position.copy(dir).multiplyScalar(dist * 1.04 + 0.04);
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    dieGroup.add(plane);
  }
}

function run3D() {
  const meshDefs = meshDefsFor();
  const host = document.createElement('div');
  host.style.cssText = 'width:100%;height:200px;display:flex;justify-content:center;overflow:hidden';
  row.parentNode.insertBefore(host, row);
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);

  const width = host.clientWidth || 420;
  const height = 200;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    host.remove();
    fallbackFlat();
    return;
  }
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  // top-down view onto the tray
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.up.set(0, 0, -1);
  camera.position.set(0, 9.8, 0.01);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 8, 3);
  scene.add(key);

  const tray = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 48),
    new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.9 })
  );
  tray.rotation.x = -Math.PI / 2;
  tray.position.y = -0.66;
  scene.add(tray);

  const loader = new GLTFLoader();
  const needTypes = [...new Set(meshDefs.map((m) => m.type))];

  Promise.all(
    needTypes.map(
      (t) =>
        new Promise((resolve) => {
          loader.load(`/dice/${t}.glb`, (gltf) => resolve([t, gltf.scene]), undefined, () => resolve([t, null]));
        })
    )
  ).then((loaded) => {
    const byType = Object.fromEntries(loaded);
    if (loaded.some(([, s]) => !s)) {
      host.remove();
      fallbackFlat();
      return;
    }
    const geometries = new Map(needTypes.map((t) => [t, typeGeometry(byType[t])]));

    const up = new THREE.Vector3(0, 1, 0);
    const n = meshDefs.length;
    // adaptive grid: no die-count limit — shrink the dice to fit the tray
    const cols = Math.min(n, Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    // target rendered diameter so a full row fits inside the view
    const renderedDiameter = Math.min(1.6, 5.6 / cols);
    const spacing = renderedDiameter * 1.2;

    const meshes = meshDefs.map((def, i) => {
      const geom = geometries.get(def.type);
      const die = byType[def.type].clone(true);
      const scale = Math.min(0.55, renderedDiameter / (2 * geom.radius));
      die.scale.setScalar(scale);
      const material = new THREE.MeshPhysicalMaterial({
        color,
        metalness: 0.15,
        roughness: 0.22,
        clearcoat: 0.7,
        clearcoatRoughness: 0.25
      });
      die.traverse((o) => {
        if (o.isMesh) o.material = material;
      });
      addFaceNumbers(die, geom, def.type);

      // final orientation: rolled value's face direction points up + random spin
      const face = geom.faces.get(locatorKey(def.type, def.value)) ?? (geom.faces.get(String(def.value % 100)) || [...geom.faces.values()][0]);
      const targetQuat = new THREE.Quaternion();
      if (face) {
        targetQuat.setFromUnitVectors(face.dir, up);
        targetQuat.premultiply(new THREE.Quaternion().setFromAxisAngle(up, Math.random() * Math.PI * 2));
      }

      const col = i % cols;
      const gridRow = Math.floor(i / cols);
      const inRow = Math.min(n - gridRow * cols, cols);
      const targetX = (col - (inRow - 1) / 2) * spacing;
      const targetZ = (rows > 1 ? gridRow - (rows - 1) / 2 : 0) * spacing;
      // start clustered near the tray center, scattered outward on roll
      die.position.set(targetX * 0.1, 0, targetZ * 0.1 + (Math.random() - 0.5) * 0.4);
      scene.add(die);

      return {
        group: die,
        material,
        targetQuat,
        targetX,
        targetZ,
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        start: i * 0.25,
        spin: (Math.random() < 0.5 ? -1 : 1) * (3.5 + Math.random() * 2),
        glow: def.crit ? '#fbbf24' : def.fail ? '#dc2626' : null,
        fromQuat: null,
        settled: false
      };
    });

    const startMs = performance.now();
    const FALL_TIME = 1.15; // scatter + tumble
    const SETTLE_TIME = 0.65; // smooth rotation into the rolled face
    let allSettled = false;

    function animate() {
      const t = (performance.now() - startMs) / 1000;
      for (const m of meshes) {
        const local = t - m.start;
        if (local < 0) continue;
        if (local < FALL_TIME) {
          const p = local / FALL_TIME;
          // scatter outward with a slight overshoot (easeOutBack)
          const back = 1 + 1.35 * Math.pow(p - 1, 3) + 0.35 * Math.pow(p - 1, 2);
          m.group.position.x = m.targetX * back;
          m.group.position.z = m.targetZ * back;
          // decelerating tumble
          m.group.quaternion.setFromAxisAngle(m.axis, m.spin * (1 - Math.pow(1 - p, 2)));
          // start blending toward the target face near the end of the scatter
          if (p > 0.55) {
            if (!m.fromQuat) m.fromQuat = m.group.quaternion.clone();
            m.group.quaternion.slerpQuaternions(m.fromQuat, m.targetQuat, smoothstep((p - 0.55) / 0.45));
          }
        } else if (!m.settled) {
          const k = Math.min(1, (local - FALL_TIME) / SETTLE_TIME);
          if (!m.fromQuat) m.fromQuat = m.group.quaternion.clone();
          // smooth final rotation + one soft landing bounce
          m.group.quaternion.slerpQuaternions(m.fromQuat, m.targetQuat, smoothstep(k));
          m.group.position.y = renderedDiameter * 0.16 * Math.sin(k * Math.PI) * (1 - k * k);
          m.group.position.x = m.targetX;
          m.group.position.z = m.targetZ;
          if (k >= 1) {
            m.group.quaternion.copy(m.targetQuat);
            m.group.position.y = 0;
            m.settled = true;
            const idx = meshes.indexOf(m);
            // cap chips (huge pools would overflow the popup)
            if (row.children.length < 15) {
              const chip = document.createElement('div');
              chip.className = meshDefs[idx].crit ? 'die crit' : meshDefs[idx].fail ? 'die fail' : 'die';
              chip.textContent = meshDefs[idx].label;
              row.appendChild(chip);
            } else if (!row.querySelector('.more')) {
              const more = document.createElement('div');
              more.className = 'die more';
              more.textContent = `+${n - 15}`;
              row.appendChild(more);
            }
          }
        }
        if (m.settled && m.glow) {
          const pulse = 0.55 + 0.45 * Math.sin(t * 7);
          m.material.emissive.set(m.glow);
          m.material.emissiveIntensity = pulse * 1.5;
        }
      }
      if (!allSettled && meshes.every((m) => m.settled)) {
        allSettled = true;
        if (crit) totalEl.classList.add('crit');
        else if (fail) totalEl.classList.add('fail');
        totalEl.textContent = total != null && total !== '' ? total : '—';
      }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();
  });
}
