// Dice roll popup with real physics — vanilla three.js + rapier
// (@dimforge/rapier3d-compat), same approach as the official Owlbear dice
// plugin but without React. THE RAPIER SIMULATION IS THE SOURCE OF THE
// RESULTS: the roller's popup runs the authoritative simulation and reports
// the resting-face values + final transforms; every other client REPLAYS
// those transforms so numbers are identical everywhere regardless of frame
// rate. Flat (GM Classique) mode keeps pre-rolled CSS dice.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { reportRollResult, onRemoteRollResult } from './lib/rollBroadcast.js';

const params = new URLSearchParams(location.search);
const label = params.get('label') || 'Lancer de dés';
const formula = params.get('formula') || '';
const totalParam = params.get('total');
const rollsParam = (params.get('rolls') || '').split(',').filter(Boolean);
const typesParam = (params.get('types') || '').split(',').filter(Number);
const error = params.get('error');
const color = params.get('color') || '#312e81';
const isSelf = params.get('self') === '1';
const specParam = params.get('diceSpec'); // JSON [{count, sides}...]
const seedParam = params.get('seed');
const modifierParam = parseInt(params.get('modifier') || '0', 10) || 0;
const playerId = params.get('playerId') || '';
const rollId = params.get('rollId') || '';
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
  d10: [0.0, -1.172751, 0.0, 0.0, 1.172751, 0.0, 1.122302, -0.123811, 0.364658, 0.693621, 0.123811, 0.954687, 0.0, -0.123811, 1.180058, 0.69362, -0.123811, -0.954687, 1.122302, 0.123811, -0.364658, 0.0, 0.123811, -1.180058, -0.693621, -0.123811, -0.954687, -1.122301, 0.123811, 0.364658, -1.122301, 0.123811, -0.364658, -0.693621, 0.12381, 0.954687],
  d20: [-1.355243, -0.262864, 0.0, -0.415876, -1.09821, 0.725756, -0.678737, 0.257012, 1.174309, -0.841197, 1.094606, 0.0, -0.678737, 0.257012, -1.174309, -0.415876, -1.09821, -0.725756, 0.678737, -0.257012, 1.174309, 0.415876, 1.09821, 0.725756, 0.415876, 1.09821, -0.725756, 0.678737, -0.257012, -1.174309, 0.841197, -1.094606, 0.0, 1.355243, 0.262864, 0.0]
};
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
  showPreRolled();
} else {
  let spec = null;
  try {
    spec = JSON.parse(specParam || 'null');
  } catch {
    spec = null;
  }
  const playable = Array.isArray(spec) && spec.length && spec.every((t) => SIDES_TO_TYPE[t.sides]);
  if (!playable) {
    fallbackFromSpec(spec, modifierParam);
  } else if (isSelf) {
    formulaEl.textContent = formula;
    startSim(spec, parseInt(seedParam, 10), modifierParam).catch((err) => {
      console.warn('Dice simulation failed:', err);
      fallbackFromSpec(spec, modifierParam);
    });
  } else {
    // other players/GM: wait for the roller's authoritative result, replay it
    formulaEl.textContent = formula;
    waitForResult(spec);
  }
}

function showPreRolled() {
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
}

// Fallback: unusable spec or crashed sim → random values from the spec,
// displayed as CSS dice and still reported so the log stays consistent.
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

// ─── Seeded RNG (deterministic rotations across the roller's throws) ─────
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

const THROW_MIN_Y = 2.6;
const THROW_MAX_Y = 3.2;
const MIN_LAUNCH_VELOCITY = 3;
const MAX_LAUNCH_VELOCITY = 6;
const MIN_ANGULAR_VELOCITY = 4;
const MAX_ANGULAR_VELOCITY = 9;
const MIN_ROLL_FINISHED_SPEED = 0.015;
const SLOW_FRAMES_REQUIRED = 8;
const HARD_STOP_MS = 9500; // absolute deadline: read the best face

// ─── Visual mesh layout: one def per mesh; a d100 = percentile + ones ────
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

// Jittered-grid spawn positions: dice can never spawn interpenetrating
// (grid spacing ≥ die size by construction); deterministic draw order.
function spawnGrid(rng, count, cols, spacing) {
  const rows = Math.ceil(count / cols);
  const positions = [];
  for (let row = 0; row < rows; row++) {
    const inRow = Math.min(count - row * cols, cols);
    for (let col = 0; col < inRow; col++) {
      positions.push({
        x: (col - (inRow - 1) / 2) * spacing + (rng() - 0.5) * 0.2,
        y: THROW_MIN_Y + rng() * (THROW_MAX_Y - THROW_MIN_Y),
        z: (row - (rows - 1) / 2) * spacing + (rng() - 0.5) * 0.2
      });
    }
  }
  return positions;
}

// printed face numbers (canvas textures at the locator anchors)
const numberTextureCache = new Map();

function numberTexture(text) {
  if (numberTextureCache.has(text)) return numberTextureCache.get(text);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${text.length > 1 ? 62 : 78}px system-ui, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(10,15,30,0.95)';
  ctx.strokeText(text, 64, 68);
  ctx.fillStyle = '#f9fafb';
  ctx.fillText(text, 64, 68);
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

function addFaceNumbers(dieGroup, geom) {
  const geometry = new THREE.PlaneGeometry(0.85, 0.85);
  for (const [num, { dir, dist }] of geom.faces) {
    const text = num.length === 1 ? num : num.length === 2 ? num : num;
    const plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      map: numberTexture(text),
      transparent: true,
      depthWrite: false
    }));
    plane.position.copy(dir).multiplyScalar(dist * 1.02 + 0.04);
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    dieGroup.add(plane);
  }
}

// shared stage: top-down tray view
function buildStage(canvas, width, height, materialColor) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.up.set(0, 0, -1);
  camera.position.set(0, 8.2, 0.01);
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
  tray.position.y = -0.8;
  scene.add(tray);
  return { renderer, scene, camera };
}

function makeHostCanvas(hostHeight) {
  const host = document.createElement('div');
  host.style.cssText = `width:100%;height:${hostHeight}px;display:flex;justify-content:center;overflow:hidden`;
  row.parentNode.insertBefore(host, row);
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const width = host.clientWidth || 420;
  return { host, canvas, width, height: hostHeight };
}

// ─── Roller's popup: the authoritative rapier simulation ─────────────────
async function startSim(spec, seed, modifier) {
  const meshDefs = meshDefsFor(spec);
  const { host, canvas, width, height } = makeHostCanvas(210);
  let stage;
  try {
    stage = buildStage(canvas, width, height, color);
  } catch (err) {
    console.warn('WebGL unavailable:', err);
    host.remove();
    fallbackFromSpec(spec, modifier);
    return;
  }
  const { renderer, scene, camera } = stage;

  try {
    await RAPIER.init();
  } catch (err) {
    console.warn('Rapier init failed:', err);
    host.remove();
    fallbackFromSpec(spec, modifier);
    return;
  }

  const world = new RAPIER.World({ x: 0, y: -14, z: 0 });
  world.timestep = 1 / 60;
  const T = 50; // huge wall half-extents so nothing teleports through
  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(T, T, T).setTranslation(0, -0.8 - T, 0), floorBody);
  const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (const [x, y, z] of [
    [0, -0.8 - T, 3.0 + T],
    [0, -0.8 - T, -3.0 - T],
    [3.1 + T, -0.8 - T, 0],
    [-3.1 - T, -0.8 - T, 0],
    [0, 6 + T, 0] // roof well above the spawn height (2.6–3.2)
  ]) {
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
  const n = meshDefs.length;
  const cols = Math.min(n, Math.ceil(Math.sqrt(n)));
  const renderedDiameter = Math.min(2.3, 5.8 / cols);
  const spacing = renderedDiameter * 1.2;
  const spawnPositions = spawnGrid(rng, n, cols, spacing);
  const throws = meshDefs.map(() => ({
    rotation: randomRotation(rng),
    angularVelocity: {
      x: MIN_ANGULAR_VELOCITY + rng() * (MAX_ANGULAR_VELOCITY - MIN_ANGULAR_VELOCITY),
      y: MIN_ANGULAR_VELOCITY + rng() * (MAX_ANGULAR_VELOCITY - MIN_ANGULAR_VELOCITY),
      z: MIN_ANGULAR_VELOCITY + rng() * (MAX_ANGULAR_VELOCITY - MIN_ANGULAR_VELOCITY)
    }
  }));
  const up = new THREE.Vector3(0, 1, 0);

  const dice = meshDefs.map((def, i) => {
    const geom = geometries.get(def.type) ?? typeGeometry(byType[def.type]);
    const scale = Math.min(0.62, renderedDiameter / (2 * geom.radius));
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
    addFaceNumbers(die, geom);
    scene.add(die);

    // spawn on the jittered grid (no interpenetration by construction) and
    // launch toward the tray center (official throwing motion)
    const spawn = spawnPositions[i];
    const toCenter = Math.hypot(spawn.x, spawn.z) || 1;
    const speed = MIN_LAUNCH_VELOCITY + rng() * (MAX_LAUNCH_VELOCITY - MIN_LAUNCH_VELOCITY);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setRotation(throws[i].rotation)
        .setLinvel((-spawn.x / toCenter) * speed, 0, (-spawn.z / toCenter) * speed)
        .setAngvel(throws[i].angularVelocity) // desc API takes a vector object
        .setGravityScale(1.6)
        .setCanSleep(false) // rapier can freeze an unstable edge-balance — never let it
    );
    const verts = new Float32Array(COLLIDER_VERTICES[def.type].map((v) => v * scale));
    world.createCollider(RAPIER.ColliderDesc.convexHull(verts).setFriction(0.12).setRestitution(0.45).setDensity(1), body);
    return { def, geom, die, material, body, glow: null, chipDone: false, slowFrames: 0 };
  });

  const settled = new Set();
  let pendingMs = 0;
  let lastTick = performance.now();
  let reported = false;
  const startMs = lastTick;
  const STEP_MS = 1000 / 60;

  function readFace(die) {
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

  // how clearly the top locator faces up (1 = face perfectly flat up)
  function readFaceDot(die) {
    let bestDot = -Infinity;
    for (const [, { dir }] of die.geom.faces) {
      const dot = dir.clone().applyQuaternion(die.die.quaternion).dot(up);
      if (dot > bestDot) bestDot = dot;
    }
    return bestDot;
  }

  function lockDie(d) {
    d.body.setEnabledRotations(false, false, false);
    d.body.setEnabledTranslations(false, false, false);
    d.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    d.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    settled.add(d);
  }

  function animate() {
    // fixed timestep accumulator driven by REAL elapsed time: the same
    // simulated duration passes regardless of the display's frame rate
    const now = performance.now();
    const elapsed = Math.min(now - lastTick, 100);
    lastTick = now;
    if (!reported) {
      pendingMs += elapsed;
      while (pendingMs >= STEP_MS) {
        world.step();
        pendingMs -= STEP_MS;
      }
    }
    const wallNow = now - startMs;
    for (const d of dice) {
      const t = d.body.translation();
      const r = d.body.rotation();
      d.die.position.set(t.x, t.y, t.z);
      d.die.quaternion.set(r.x, r.y, r.z, r.w);
      if (settled.has(d) || d.chipDone) continue;
      const lin = d.body.linvel();
      const ang = d.body.angvel();
      const speed = Math.hypot(lin.x, lin.y, lin.z) + Math.hypot(ang.x, ang.y, ang.z);
      if (speed < MIN_ROLL_FINISHED_SPEED) d.slowFrames += 1;
      else d.slowFrames = 0;
      // a die counts as settled ONLY once a face sits clearly up — a die
      // balanced on a tip/edge is snapped onto its nearest face (reads as
      // toppling over) instead of being read
      const faceUp = readFaceDot(d) >= 0.92;
      if (d.slowFrames >= SLOW_FRAMES_REQUIRED && faceUp) {
        lockDie(d);
      } else if (d.slowFrames >= SLOW_FRAMES_REQUIRED && !faceUp) {
        const face = d.geom.faces.get(readFace(d));
        if (face) d.body.setRotation(new THREE.Quaternion().setFromUnitVectors(face.dir, up), true);
        d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        d.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        d.slowFrames = 0;
      } else if (wallNow >= HARD_STOP_MS) {
        lockDie(d); // absolute deadline: read the best face
      }
    }
    // per logical roll: all its meshes settled → value chip
    for (const d of dice) {
      if (d.chipDone || !settled.has(d)) continue;
      const group = dice.filter((x) => x.def.rollIndex === d.def.rollIndex);
      if (!group.every((x) => settled.has(x))) continue;
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
    if (!reported && dice.every((d) => d.chipDone)) {
      reported = true;
      const rolls = [];
      const diceTypes = [];
      const transforms = [];
      const byRoll = new Map();
      for (const d of dice) {
        if (!byRoll.has(d.def.rollIndex)) byRoll.set(d.def.rollIndex, []);
        byRoll.get(d.def.rollIndex).push(d);
      }
      for (const [, group] of byRoll) {
        rolls.push(group[0].rollValue ?? 1);
        diceTypes.push(group[0].def.sides);
      }
      for (const d of dice) {
        const t = d.body.translation();
        const r = d.body.rotation();
        transforms.push({ position: { x: t.x, y: t.y, z: t.z }, rotation: { x: r.x, y: r.y, z: r.z, w: r.w } });
      }
      const crit = diceTypes.some((s, i) => rolls[i] === s);
      const fail = rolls.some((r) => r === 1);
      if (crit) totalEl.classList.add('crit');
      else if (fail) totalEl.classList.add('fail');
      const total = rolls.reduce((a, b) => a + b, 0) + modifier;
      totalEl.textContent = String(total);
      reportRollResult({ playerId, rollId, label: plainLabel(), formula, rolls, diceTypes, total, transforms });
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

// ─── Other players/GM: wait for the result, replay the recorded motion ───
function waitForResult(spec) {
  const stop = onRemoteRollResult((result) => {
    if (!result || result.rollId !== rollId) return;
    stop();
    replayFromResult(spec, result).catch((err) => {
      console.warn('Replay failed:', err);
      showResultOnly(result);
    });
  });
  // the roller's sim is capped at ~5s; if nothing arrives, show the tray empty
  setTimeout(() => stop(), 9000);
}

function replayFromResult(spec, result) {
  const meshDefs = meshDefsFor(spec);
  const { host, canvas, width, height } = makeHostCanvas(210);
  let stage;
  try {
    stage = buildStage(canvas, width, height, color);
  } catch (err) {
    console.warn('WebGL unavailable:', err);
    host.remove();
    showResultOnly(result);
    return Promise.resolve();
  }
  const { renderer, scene, camera } = stage;

  const loader = new GLTFLoader();
  const needTypes = [...new Set(meshDefs.map((m) => m.type))];
  return Promise.all(
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
      showResultOnly(result);
      return;
    }
    const geometries = new Map(needTypes.map((t) => [t, typeGeometry(byType[t])]));
    const n = meshDefs.length;
    const cols = Math.min(n, Math.ceil(Math.sqrt(n)));
    const renderedDiameter = Math.min(2.3, 5.8 / cols);
    const spacing = renderedDiameter * 1.2;
    const dice = meshDefs.map((def, i) => {
      const geom = geometries.get(def.type);
      const scale = Math.min(0.62, renderedDiameter / (2 * geom.radius));
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
      addFaceNumbers(die, geom);
      // start above the recorded resting spot and tumble into it
      const final = result.transforms?.[i];
      die.position.set(
        (final?.position.x ?? 0) + 0.6,
        THROW_MAX_Y + 0.5 + (i % 3) * 0.4,
        (final?.position.z ?? 0) + 0.6
      );
      scene.add(die);
      return { def, die, material, final, start: i * 0.18 };
    });

    const startMs = performance.now();
    const DURATION = 1500;
    let shown = 0;
    const shownValues = result.rolls ?? [];
    const diceTypes = result.diceTypes ?? [];

    function animate() {
      const t = performance.now() - startMs;
      for (const d of dice) {
        const idx = dice.indexOf(d);
        const local = Math.max(0, t - d.start);
        const p = Math.min(1, local / DURATION);
        const ease = 1 - Math.pow(1 - p, 3);
        const final = result.transforms?.[idx];
        if (final) {
          // tumble into the exact recorded resting transform
          const fromY = THROW_MAX_Y + 0.5 + (idx % 3) * 0.4;
          d.die.position.set(
            THREE.MathUtils.lerp(final.position.x + 0.4, final.position.x, ease),
            THREE.MathUtils.lerp(fromY, final.position.y, ease),
            THREE.MathUtils.lerp(final.position.z + 0.6, final.position.z, ease)
          );
          const startQ = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(idx % 2 ? 1 : -1, 0.4, 0.3).normalize(),
            (1 - ease) * 4
          );
          d.die.quaternion.copy(startQ.slerp(new THREE.Quaternion(final.rotation.x, final.rotation.y, final.rotation.z, final.rotation.w), ease));
        }
        if (p >= 1 && !d.chipDone) {
          d.chipDone = true;
          shown += 1;
          const rollIndex = d.def.rollIndex;
          const value = shownValues[rollIndex] ?? 1;
          if (row.children.length < 15) {
            const chip = document.createElement('div');
            chip.className = value === d.def.sides ? 'die crit' : value === 1 ? 'die fail' : 'die';
            chip.textContent = String(value);
            row.appendChild(chip);
          } else if (!row.querySelector('.more')) {
            const more = document.createElement('div');
            more.className = 'die more';
            more.textContent = `+${shownValues.length - 15}`;
            row.appendChild(more);
          }
          if (value === d.def.sides) d.glow = '#fbbf24';
          else if (value === 1) d.glow = '#dc2626';
        }
        if (d.glow) {
          const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 1000 * 7);
          d.material.emissive.set(d.glow);
          d.material.emissiveIntensity = pulse * 1.5;
        }
      }
      if (shown >= dice.length) {
        const crit = diceTypes.some((s, i) => shownValues[i] === s);
        const fail = shownValues.some((r) => r === 1);
        if (crit) totalEl.classList.add('crit');
        else if (fail) totalEl.classList.add('fail');
        totalEl.textContent = String(result.total ?? shownValues.reduce((a, b) => a + b, 0));
        return; // stop the loop; the resting dice stay visible
      }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();
  });
}

// replay unavailable (no WebGL/transforms) → chips + total only
function showResultOnly(result) {
  const rolls = result?.rolls ?? [];
  const diceTypes = result?.diceTypes ?? [];
  rolls.forEach((r, i) => {
    const die = document.createElement('div');
    die.className = r === diceTypes[i] ? 'die crit' : r === 1 ? 'die fail' : 'die';
    die.style.animationDelay = `${i * 0.08}s`;
    die.textContent = String(r);
    row.appendChild(die);
  });
  totalEl.style.animationDelay = `${0.45 + rolls.length * 0.08}s`;
  if (diceTypes.some((s, i) => rolls[i] === s)) totalEl.classList.add('crit');
  else if (rolls.some((r) => r === 1)) totalEl.classList.add('fail');
  totalEl.textContent = String(result?.total ?? '—');
}
