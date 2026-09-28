// Dice roll popup with real physics — vanilla three.js + rapier
// (@dimforge/rapier3d-compat), same approach as the official Owlbear dice
// plugin but without React. THE RAPIER SIMULATION IS THE SOURCE OF THE
// RESULTS: every client simulates the identical seeded throw and reads the
// resting face values from the official locator convention. The roller's
// popup reports the result on the local roll-result channel for the log.
// Flat (GM Classique) mode keeps pre-rolled values rendered as CSS dice.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { reportRollResult } from './lib/rollBroadcast.js';

const params = new URLSearchParams(location.search);
const label = params.get('label') || 'Lancer de dés';
const formula = params.get('formula') || '';
const totalParam = params.get('total');
const rollsParam = (params.get('rolls') || '').split(',').filter(Boolean);
const typesParam = (params.get('types') || '').split(',').filter(Number);
const error = params.get('error');
const color = params.get('color') || '#312e81';
const mode = params.get('mode') || '';
// physics roll: explicit dice terms + seed (rapier decides the numbers)
const specParam = params.get('diceSpec'); // JSON [{count, sides}...]
const seedParam = params.get('seed');
const modifierParam = parseInt(params.get('modifier') || '0', 10) || 0;
const playerId = params.get('playerId') || '';
const rollId = params.get('rollId') || '';
// plain label without the playerName prefix (for the action log)
const plainLabel = () => params.get('plainLabel') || 'Jet';

document.getElementById('label').textContent = label;
const row = document.getElementById('dice-row');
const totalEl = document.getElementById('total');
const formulaEl = document.getElementById('formula');

const SIDES_TO_TYPE = { 4: 'd4', 6: 'd6', 8: 'd8', 10: 'd10', 12: 'd12', 20: 'd20', 100: 'd100' };
// official Owlbear dice plugin collider hulls (raw GLB units)
const COLLIDER_VERTICES = {
  d4: [0.0, -0.635828, -1.269768, 0.0, 1.159624, 0.0, 1.099651, -0.635829, 0.634884, -1.099651, -0.635829, 0.634884],
  d6: [-0.8, -0.8, 0.8, -0.8, 0.8, 0.8, -0.8, -0.8, -0.8, -0.8, 0.8, -0.8, 0.8, -0.8, 0.8, 0.8, 0.8, 0.8, 0.8, -0.8, -0.8, 0.8, 0.8, -0.8],
  d10: [0.0, -1.172751, 0.0, 0.0, 1.172751, 0.0, 1.122302, -0.123811, 0.364658, 0.693621, 0.123811, 0.954687, 0.0, -0.123811, 1.180058, 0.69362, -0.123811, -0.954687, 1.122302, 0.123811, -0.364658, 0.0, 0.123811, -1.180058, -0.693621, -0.123811, -0.954687, -1.122301, -0.123811, 0.364658, -1.122301, 0.123811, -0.364658, -0.693621, 0.12381, 0.954687],
  d20: [-1.355243, -0.262864, 0.0, -0.415876, -1.09821, 0.725756, -0.678737, 0.257012, 1.174309, -0.841197, 1.094606, 0.0, -0.678737, 0.257012, -1.174309, -0.415876, -1.09821, -0.725756, 0.678737, -0.257012, 1.174309, 0.415876, 1.09821, 0.725756, 0.415876, 1.09821, -0.725756, 0.678737, -0.257012, -1.174309, 0.841197, -1.094606, 0.0, 1.355243, 0.262864, 0.0]
};
// d8/d12 reuse the closest matching hull at matching size
COLLIDER_VERTICES.d8 = COLLIDER_VERTICES.d10;
COLLIDER_VERTICES.d12 = COLLIDER_VERTICES.d20;
COLLIDER_VERTICES.d100 = COLLIDER_VERTICES.d10;

const critPre = rollsParam.some((r, i) => parseInt(r, 10) === parseInt(typesParam[i], 10));
const failPre = rollsParam.some((r) => parseInt(r, 10) === 1);

if (error) {
  formulaEl.textContent = formula;
  totalEl.style.display = 'none';
  const el = document.createElement('div');
  el.className = 'error';
  el.textContent = 'Formule invalide : ' + error;
  row.replaceWith(el);
} else if (rollsParam.length && rollsParam.length === typesParam.length) {
  // pre-rolled (flat mode) → CSS dice display
  formulaEl.textContent = formula;
  rollsParam.forEach((r, i) => {
    const die = document.createElement('div');
    die.className = parseInt(r, 10) === parseInt(typesParam[i], 10) ? 'die crit' : parseInt(r, 10) === 1 ? 'die fail' : 'die';
    die.style.animationDelay = `${i * 0.08}s`;
    die.textContent = r;
    row.appendChild(die);
  });
  totalEl.style.animationDelay = `${0.45 + rollsParam.length * 0.08}s`;
  if (critPre) totalEl.classList.add('crit');
  else if (failPre) totalEl.classList.add('fail');
  totalEl.textContent = totalParam != null && totalParam !== '' ? totalParam : '—';
} else {
  let spec = null;
  try {
    spec = JSON.parse(specParam || 'null');
  } catch {
    spec = null;
  }
  if (!Array.isArray(spec) || seedParam == null || !spec.length || !spec.every((t) => SIDES_TO_TYPE[t.sides])) {
    // unplayable spec → random values from the spec, CSS display, still logged
    fallbackFromSpec(spec, modifierParam);
  } else {
    formulaEl.textContent = formula;
    startPhysics(spec, parseInt(seedParam, 10), modifierParam);
  }
}

// Fallback: no physics (spec unusable) → random values + result still logged
function fallbackFromSpec(spec, modifier) {
  if (!spec) {
    totalEl.textContent = '—';
    return;
  }
  const rolls = [];
  const diceTypes = [];
  for (const term of spec) {
    for (let i = 0; i < term.count; i++) {
      rolls.push(Math.floor(Math.random() * term.sides) + 1);
      diceTypes.push(term.sides);
    }
  }
  reportRollResult({ playerId, rollId, label: plainLabel(), formula, rolls, diceTypes, total: rolls.reduce((a, b) => a + b, 0) + modifier });
  const crit = rolls.some((r, i) => r === diceTypes[i]);
  const fail = rolls.some((r) => r === 1);
  rolls.forEach((r, i) => {
    const die = document.createElement('div');
    die.className = r === diceTypes[i] ? 'die crit' : r === 1 ? 'die fail' : 'die';
    die.style.animationDelay = `${i * 0.08}s`;
    die.textContent = r;
    row.appendChild(die);
  });
  totalEl.style.animationDelay = `${0.45 + rolls.length * 0.08}s`;
  if (crit) totalEl.classList.add('crit');
  else if (fail) totalEl.classList.add('fail');
  totalEl.textContent = String(rolls.reduce((a, b) => a + b, 0) + modifier);
}

// ─── Seeded RNG + throw generation (official DiceThrower logic) ──────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const THROW_MIN_X = -0.9;
const THROW_MAX_X = 0.9;
const THROW_MIN_Y = 2;
const THROW_MAX_Y = 2.4;
const THROW_MIN_Z = -1.9;
const THROW_MAX_Z = 1.9;
const MIN_LAUNCH_VELOCITY = 2;
const MAX_LAUNCH_VELOCITY = 4.5;
const MIN_ANGULAR_VELOCITY = 3;
const MAX_ANGULAR_VELOCITY = 8;
const MIN_ROLL_FINISHED_SPEED = 0.005;
const MAX_ROLL_TIME = 5000;

// Deterministic throws shared by every client (same seed → same numbers)
function seededThrows(rng, meshDefs) {
  const history = [];
  return meshDefs.map(() => {
    let position;
    for (let i = 0; i < 50; i++) {
      position = {
        x: THROW_MIN_X + rng() * (THROW_MAX_X - THROW_MIN_X),
        y: THROW_MIN_Y + rng() * (THROW_MAX_Y - THROW_MIN_Y),
        z: THROW_MIN_Z + rng() * (THROW_MAX_Z - THROW_MIN_Z)
      };
      if (history.every((q) => Math.hypot(position.x - q.x, position.z - q.z) >= 0.7)) break;
    }
    history.push(position);
    return {
      position,
      rotation: randomRotation(rng),
      linearVelocity: launchVelocity(position, rng),
      angularVelocity: {
        x: MIN_ANGULAR_VELOCITY + rng() * (MAX_ANGULAR_VELOCITY - MIN_ANGULAR_VELOCITY),
        y: MIN_ANGULAR_VELOCITY + rng() * (MAX_ANGULAR_VELOCITY - MIN_ANGULAR_VELOCITY),
        z: MIN_ANGULAR_VELOCITY + rng() * (MAX_ANGULAR_VELOCITY - MIN_ANGULAR_VELOCITY)
      }
    };
  });
}

function randomRotation(rng) {
  // uniform random quaternion (adapted from the official plugin)
  let x, y, z, u, v, w, s;
  do {
    x = rng() * 2 - 1;
    y = rng() * 2 - 1;
    z = x * x + y * y;
  } while (z > 1);
  do {
    u = rng() * 2 - 1;
    v = rng() * 2 - 1;
    w = u * u + v * v;
  } while (w > 1);
  s = Math.sqrt((1 - z) / w);
  return { x, y, z: s * u, w: s * v };
}

// Always launches from the die's position towards the tray center
function launchVelocity(position, rng) {
  const { x, z } = position;
  const length = Math.sqrt(x * x + z * z);
  const speed = MIN_LAUNCH_VELOCITY + rng() * (MAX_LAUNCH_VELOCITY - MIN_LAUNCH_VELOCITY);
  if (!length) return { x: 0, y: 0, z: 0 };
  return {
    x: (x / length) * speed * -1,
    y: 0,
    z: (z / length) * speed * -1
  };
}

// ─── Visual mesh layout: one def per mesh, d100 = percentile + ones ──────
function meshDefsFor(spec) {
  const defs = [];
  spec.forEach((term, rollIndex) => {
    for (let i = 0; i < term.count; i++) {
      if (term.sides === 100) {
        defs.push({ type: 'd100', rollIndex, sides: 100 });
        defs.push({ type: 'd10', rollIndex, sides: 100 });
      } else {
        defs.push({ type: SIDES_TO_TYPE[term.sides], rollIndex, sides: term.sides });
      }
    }
  });
  return defs;
}

const LOCATOR_PREFIX = { d4: '004', d6: '006', d8: '008', d10: '010', d12: '012', d20: '020', d100: '100' };

// printed face numbers (canvas textures at the locator anchors)
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

// per-type face geometry from the loaded GLB (locator world directions)
function typeGeometry(gltfScene) {
  gltfScene.updateMatrixWorld(true);
  const dieNode = gltfScene.children[0];
  if (!dieNode) return null;
  const bbox = new THREE.Box3().setFromObject(gltfScene);
  const size = bbox.getSize(new THREE.Vector3());
  const faces = new Map();
  for (const locator of dieNode.children) {
    const match = locator.name.match(/_locator_(.+)$/);
    if (!match) continue;
    const world = new THREE.Vector3();
    locator.getWorldPosition(world);
    faces.set(match[1], { dir: world.clone().normalize(), dist: world.length() });
  }
  return { radius: Math.max(size.x, size.y, size.z) / 2, faces };
}

async function startPhysics(spec, seed, modifier) {
  const meshDefs = meshDefsFor(spec);
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
    fallbackFromSpec(spec, modifier);
    return;
  }
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  try {
    await RAPIER.init();
  } catch (err) {
    console.warn('Rapier init failed:', err);
    host.remove();
    fallbackFromSpec(spec, modifier);
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.up.set(0, 0, -1);
  camera.position.set(0, 9.8, 0.01);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 8, 3);
  scene.add(key);

  // tray visuals
  const tray = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 48),
    new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.9 })
  );
  tray.rotation.x = -Math.PI / 2;
  tray.position.y = -0.8;
  scene.add(tray);

  // ─── rapier world (official tray + die conventions) ───
  const world = new RAPIER.World({ x: 0, y: -25, z: 0 });
  const T = 50; // huge wall half-extents so nothing teleports through
  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  // floor top coincides with the visual tray plane (y = -0.8)
  world.createCollider(RAPIER.ColliderDesc.cuboid(T, T, T).setTranslation(0, -0.8 - T, 0), floorBody);
  // walls: inner faces at x ±3.3, z ±3.2 + roof; no rotation needed
  const wallDefs = [
    [0, -0.8 - T, 3.2 + T],
    [0, -0.8 - T, -3.2 - T],
    [3.3 + T, -0.8 - T, 0],
    [-3.3 - T, -0.8 - T, 0],
    [0, 1.5 + T, 0]
  ];
  const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (const [x, y, z] of wallDefs) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(T, T, T).setTranslation(x, y, z), wallBody);
  }

  const loader = new GLTFLoader();
  const needTypes = [...new Set(meshDefs.map((m) => m.type))];

  const loaded = await Promise.all(
    needTypes.map(
      (t) =>
        new Promise((resolve) => {
          loader.load(`/dice/${t}.glb`, (gltf) => resolve([t, gltf.scene]), undefined, () => resolve([t, null]));
        })
    )
  );
  const byType = Object.fromEntries(loaded);
  if (loaded.some(([, s]) => !s)) {
    host.remove();
    fallbackFromSpec(spec, modifier);
    return;
  }
  const geometries = new Map(needTypes.map((t) => [t, typeGeometry(byType[t])]));
  const rng = mulberry32(seed);
  const throws = seededThrows(rng, meshDefs);

  const up = new THREE.Vector3(0, 1, 0);
  const n = meshDefs.length;
  const cols = Math.min(n, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const renderedDiameter = Math.min(1.6, 5.6 / cols);
  const spacing = renderedDiameter * 1.35;

  const dice = meshDefs.map((def, i) => {
    const geom = geometries.get(def.type) ?? typeGeometry(byType[def.type]);
    const scale = Math.min(0.55, renderedDiameter / (2 * geom.radius));
    const die = byType[def.type].clone(true);
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
    scene.add(die);

    const th = throws[i];
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(th.position.x, th.position.y, th.position.z)
        .setRotation(th.rotation)
        .setLinvel(th.linearVelocity.x, th.linearVelocity.y, th.linearVelocity.z)
        .setAngvel(th.angularVelocity.x, th.angularVelocity.y, th.angularVelocity.z)
        .setGravityScale(2)
    );
    const verts = new Float32Array(COLLIDER_VERTICES[def.type].map((v) => v * scale));
    world.createCollider(RAPIER.ColliderDesc.convexHull(verts).setFriction(0.1).setDensity(1), body);

    return { def, geom, die, material, body, glow: null, chipDone: false };
  });

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

  const startMs = performance.now();
  const settledMeshes = new Set();
  let reported = false;

  function readFace(die) {
    // highest-dot locator = the resting face (official convention)
    const up = new THREE.Vector3(0, 1, 0);
    let bestDot = -Infinity;
    let best = null;
    for (const [num, { dir }] of die.geom.faces) {
      const world = dir.clone().applyQuaternion(die.die.quaternion);
      const dot = world.dot(up);
      if (dot > bestDot) {
        bestDot = dot;
        best = num;
      }
    }
    return best;
  }

  function animate() {
    world.step();
    for (const d of dice) {
      const t = d.body.translation();
      const r = d.body.rotation();
      d.die.position.set(t.x, t.y, t.z);
      d.die.quaternion.set(r.x, r.y, r.z, r.w);
      if (!settledMeshes.has(d) && !d.chipDone) {
        const lin = d.body.linvel();
        const ang = d.body.angvel();
        const speed = Math.hypot(lin.x, lin.y, lin.z) + Math.hypot(ang.x, ang.y, ang.z);
        if ((performance.now() - startMs > 600 && speed < MIN_ROLL_FINISHED_SPEED) || performance.now() - startMs > 5000) {
          // lock the die so it can't be nudged after settling
          d.body.setEnabledRotations(false, false, false);
          d.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
          settledMeshes.add(d);
        }
      }
    }
    // per logical roll: all its meshes settled → value chip
    for (const d of dice) {
      if (d.chipDone || !settledMeshes.has(d)) continue;
      const group = dice.filter((x) => x.def.rollIndex === d.def.rollIndex);
      if (!group.every((x) => settledMeshes.has(x))) continue;
      let value;
      if (d.def.sides === 100) {
        const tens = parseInt(readFace(group.find((x) => x.def.type === 'd100')) ?? '0', 10);
        const onesNum = readFace(group.find((x) => x.def.type === 'd10')) ?? '0';
        const ones = parseInt(onesNum, 10);
        value = tens === 0 && ones === 0 ? 100 : tens + ones;
      } else {
        const num = readFace(d) ?? '1';
        value = d.def.type === 'd10' && num === '0' ? 10 : parseInt(num, 10);
      }
      d.rollValue = value;
      d.chipDone = true;
      const crit = value === d.def.sides;
      const fail = value === 1;
      const chip = document.createElement('div');
      chip.className = crit ? 'die crit' : fail ? 'die fail' : 'die';
      chip.textContent = String(value);
      row.appendChild(chip);
      if (crit) d.glow = '#fbbf24';
      else if (fail) d.glow = '#dc2626';
    }
    // every logical roll settled → total + report
    if (!reported && dice.every((d) => d.chipDone)) {
      reported = true;
      const rolls = [];
      const diceTypes = [];
      const byRoll = new Map();
      for (const d of dice) {
        if (!byRoll.has(d.def.rollIndex)) byRoll.set(d.def.rollIndex, []);
        byRoll.get(d.def.rollIndex).push(d);
      }
      for (const [, group] of byRoll) {
        const v = group[0].rollValue ?? 1;
        rolls.push(v);
        diceTypes.push(group[0].def.sides);
      }
      const crit = diceTypes.some((s, i) => rolls[i] === s);
      const fail = rolls.some((r) => r === 1);
      if (crit) totalEl.classList.add('crit');
      else if (fail) totalEl.classList.add('fail');
      const total = rolls.reduce((a, b) => a + b, 0) + modifier;
      totalEl.textContent = String(total);
      reportRollResult({ playerId, rollId, label: plainLabel(), formula, rolls, diceTypes, total });
    }
    for (const d of dice) {
      if (d.glow && d.chipDone) {
        const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 1000 * 7);
        d.material.emissive.set(d.glow);
        d.material.emissiveIntensity = pulse * 1.5;
      }
    }
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}
