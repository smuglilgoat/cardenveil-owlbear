// 3D dice visuals for the roll popup (dice.html) — lightweight take on the
// official Owlbear dice plugin: its GLB meshes + locator face convention,
// no physics engine (results are pre-computed). Each die tumbles and settles
// with the rolled value's locator pointing up; crits glow gold, natural 1s red.
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
} else if (
  !types.length ||
  types.length !== rolls.length ||
  types.length > 5 ||
  types.some((t) => !SIDES_TO_TYPE[t])
) {
  // stat formulas, exotic or huge pools → flat CSS fallback (crit/fail kept)
  fallbackFlat();
} else {
  formulaEl.textContent = formula;
  run3D();
}

function flatChips() {
  rolls.forEach((r, i) => {
    const die = document.createElement('div');
    die.className = parseInt(r, 10) === parseInt(types[i], 10) ? 'die crit' : parseInt(r, 10) === 1 ? 'die fail' : 'die';
    die.style.animationDelay = `${i * 0.08}s`;
    die.textContent = r;
    row.appendChild(die);
  });
  totalEl.style.animationDelay = `${0.45 + rolls.length * 0.08}s`;
}

function finishFlat() {
  if (crit) totalEl.classList.add('crit');
  else if (fail) totalEl.classList.add('fail');
  totalEl.textContent = total != null && total !== '' ? total : '—';
}

function fallbackFlat() {
  flatChips();
  finishFlat();
}

// ─── 3D scene ─────────────────────────────────────────────────────────────
// Visual meshes per die; a d100 renders as percentile die + ones d10.
function meshDefsFor() {
  const defs = [];
  types.forEach((sides, i) => {
    const value = parseInt(rolls[i], 10);
    if (sides === 100) {
      const tens = value === 100 ? 0 : Math.floor(value / 10) * 10;
      const ones = value % 10;
      defs.push({ type: 'd100', locator: '00', label: String(tens).padStart(2, '0'), crit: value === 100, fail: false });
      defs.push({ type: 'd10', value: ones, label: String(ones), crit: false, fail: ones === 0 && value === 100 });
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

function run3D() {
  const meshDefs = meshDefsFor();
  const host = document.createElement('div');
  host.style.cssText = 'width:100%;height:130px;display:flex;justify-content:center;overflow:hidden';
  row.parentNode.insertBefore(host, row);
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);

  const width = host.clientWidth || 300;
  const height = 130;
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
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
  camera.position.set(0, 2.6, 6.6);
  camera.lookAt(0, 0.2, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const rim = new THREE.PointLight(0x818cf8, 14, 25);
  rim.position.set(-3, 2.5, -2);
  scene.add(rim);

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

    const up = new THREE.Vector3(0, 1, 0);
    const n = meshDefs.length;
    const cols = Math.min(n, 3);
    const rows = Math.ceil(n / cols);

    const meshes = meshDefs.map((def, i) => {
      const die = byType[def.type].clone(true);
      die.scale.setScalar(n > 3 ? 0.36 : 0.46);
      die.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
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
      // hide the GLB's locator empties (invisible anyway, but tidy)
      die.traverse((o) => {
        if (o.name.includes('_locator_')) o.visible = false;
      });

      // final orientation: rolled value's locator points up + random Y spin
      const diceGroup = byType[def.type].getObjectByName('dice');
      const locator = diceGroup?.children.find((c) => c.name === `${LOCATOR_PREFIX[def.type]}_locator_${locatorKey(def.type, def.value)}`);
      const targetQuat = new THREE.Quaternion();
      if (locator) {
        const dir = locator.position.clone().normalize();
        targetQuat.setFromUnitVectors(dir, up);
        targetQuat.premultiply(new THREE.Quaternion().setFromAxisAngle(up, Math.random() * Math.PI * 2));
      }

      const col = i % cols;
      const gridRow = Math.floor(i / cols);
      const inRow = Math.min(n - gridRow * cols, cols);
      die.position.set(
        (col - (inRow - 1) / 2) * (n > 3 ? 1.15 : 1.45),
        3 + i * 0.35,
        rows > 1 ? (gridRow === 0 ? -0.85 : 0.85) : 0
      );
      scene.add(die);

      return {
        group: die,
        material,
        targetQuat,
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        start: i * 0.22,
        spin: (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 5),
        glow: def.crit ? '#fbbf24' : def.fail ? '#dc2626' : null,
        settled: false
      };
    });

    const clock = new THREE.Clock();
    const SETTLE_TIME = 1.6;
    let allSettled = false;

    function animate() {
      const t = clock.getElapsedTime();
      for (const m of meshes) {
        const local = t - m.start;
        if (local < 0) continue;
        if (local < SETTLE_TIME) {
          const p = Math.min(1, local / SETTLE_TIME);
          const ease = 1 - Math.pow(1 - p, 3);
          m.group.position.y = (1 - ease) * 3.2;
          m.group.quaternion.setFromAxisAngle(m.axis, ease * m.spin);
          m.group.quaternion.slerp(m.targetQuat, 0.03 * ease);
        } else if (!m.settled) {
          m.group.quaternion.copy(m.targetQuat);
          m.group.position.y = 0;
          m.settled = true;
          // value chip appears as the die lands
          const idx = meshes.indexOf(m);
          const chip = document.createElement('div');
          chip.className = meshDefs[idx].crit ? 'die crit' : meshDefs[idx].fail ? 'die fail' : 'die';
          chip.textContent = meshDefs[idx].label;
          row.appendChild(chip);
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
