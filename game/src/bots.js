// bots.js — the nine AI fighters: low-poly soldiers with swinging legs, and
// a brain that routes over the waypoint graph, holds sites, plants and
// defuses, and fights with bursts, strafes and crouches. Perception is a
// real line-of-sight test plus a hearing model fed by gunfire noise, and
// smoke genuinely blinds them: a smoke cloud between the eyes breaks sight.

import * as THREE from 'three';
import { CFG, S, TEAM, clamp, rand, angleLerp, hearNoise, aliveCount } from './state.js';
import { NODES, NODE, SITES } from './map.js';
import { moveFighter, hasLOS, findPath, nearestNode } from './physics.js';
import { makeFighter, eyeOf, lookDir } from './fighters.js';
import { GRENADES, makeWeapon, currentWeapon, shoot } from './weapons.js';
import * as FX from './fx.js';
import * as AU from './audio.js';

export const BOT_NAMES = {
  def: ['Bram', 'Ilya', 'Noor', 'Tomas'],
  atk: ['Vex', 'Mako', 'Juno', 'Pike', 'Sable'],
};

const _eye = new THREE.Vector3(), _eye2 = new THREE.Vector3(), _dir = new THREE.Vector3();
const _aim = new THREE.Vector3(), _side = new THREE.Vector3(), _muzzle = new THREE.Vector3();

export function makeBot(team, name) {
  const f = makeFighter(team, name, false);
  f.brain = {
    thinkT: rand(0, 0.12), path: [], pathI: 0, goalNode: -1,
    seen: null, seenPos: new THREE.Vector3(), seenT: -99, spotAt: 0,
    heardPos: null, heardT: -99, lastNoiseT: -1,
    strafeDir: 1, strafeT: 0, burstLeft: 0, pauseT: 0, crouchT: 0,
    holdNode: -1, site: 'A', plantT: 0, defuseT: 0, calledAt: -99,
    react: rand(0.22, 0.42), aimErr: rand(1.7, 2.9), legPhase: rand(0, 6),
  };
  return f;
}

// ---- bodies ----------------------------------------------------------------
const MATS = {};
function teamMats(team) {
  if (!MATS[team]) {
    const main = team === 'def' ? 0x3f6d8e : 0xb06a28;
    MATS[team] = {
      suit: new THREE.MeshStandardMaterial({ color: main, roughness: 0.8 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x232a31, roughness: 0.9 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xc9a186, roughness: 0.7 }),
      gun: new THREE.MeshStandardMaterial({ color: 0x272f38, roughness: 0.5, metalness: 0.3 }),
    };
  }
  return MATS[team];
}
function bx(group, mat, x, y, z, w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true;
  group.add(m); return m;
}
export function buildBotMesh(f) {
  const M = teamMats(f.team);
  const g = new THREE.Group();
  const legL = bx(g, M.dark, -0.13, 0.45, 0, 0.17, 0.9, 0.2);
  const legR = bx(g, M.dark, 0.13, 0.45, 0, 0.17, 0.9, 0.2);
  legL.geometry.translate(0, -0.45, 0); legL.position.y = 0.9;
  legR.geometry.translate(0, -0.45, 0); legR.position.y = 0.9;
  const torso = bx(g, M.suit, 0, 1.18, 0, 0.52, 0.62, 0.3);
  bx(g, M.dark, 0, 1.3, -0.19, 0.4, 0.34, 0.08);                 // vest plate
  const head = bx(g, M.skin, 0, 1.66, 0, 0.26, 0.28, 0.26);
  bx(g, M.dark, 0, 1.78, 0, 0.3, 0.1, 0.3);                      // helmet
  const arm = bx(g, M.suit, 0.3, 1.32, -0.18, 0.13, 0.13, 0.5); // gun arm
  const gun = bx(g, M.gun, 0.3, 1.34, -0.55, 0.07, 0.09, 0.62);
  g.userData = { legL, legR, torso, head, arm, gun };
  f.mesh = g;
  return g;
}

export function syncBotMesh(f, dt) {
  const g = f.mesh;
  if (!g) return;
  g.position.copy(f.pos);
  g.rotation.y = -f.yaw + Math.PI;
  const speed = Math.hypot(f.vel.x, f.vel.z);
  const u = g.userData;
  if (!f.alive) {
    g.rotation.z = Math.min(Math.PI / 2, (g.rotation.z || 0) + dt * 3);
    g.position.y = f.pos.y + 0.12;
    return;
  }
  g.rotation.z = 0;
  f.brain.legPhase += dt * speed * 2.4;
  const swing = Math.sin(f.brain.legPhase) * clamp(speed / 5, 0, 1) * 0.55;
  u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
  const crouchDip = f.crouching ? 0.34 : 0;
  u.torso.position.y = 1.18 - crouchDip;
  u.head.position.y = 1.66 - crouchDip;
  u.arm.position.y = 1.32 - crouchDip;
  u.gun.position.y = 1.34 - crouchDip;
  u.gun.rotation.x = f.pitch * 0.8;
  u.arm.rotation.x = f.pitch * 0.8;
}

// ---- buying ------------------------------------------------------------------
export function botBuy(f) {
  const L = f.loadout;
  if (!L.primary && f.money >= 4750 && Math.random() < 0.3) { L.primary = makeWeapon('needle'); f.money -= 4750; }
  else if (!L.primary && f.money >= 2700 && Math.random() < 0.75) { L.primary = makeWeapon('lance'); f.money -= 2700; }
  else if (!L.primary && f.money >= 1500) { L.primary = makeWeapon('wasp'); f.money -= 1500; }
  if (L.primary) L.slot = 'primary';
  if (f.armor <= 20 && f.money >= 650) { f.armor = 100; f.money -= 650; }
  if (f.team === 'def' && !f.hasKit && f.money >= 200 && Math.random() < 0.6) { f.hasKit = true; f.money -= 200; }
  for (const t of ['frag', 'flash', 'smoke']) {
    if (L.grenades[t] < GRENADES[t].max && f.money >= GRENADES[t].price + 400 && Math.random() < 0.4) {
      L.grenades[t]++; f.money -= GRENADES[t].price;
    }
  }
}

// ---- perception ----------------------------------------------------------------
function smokeBlocks(a, b) {
  for (const s of S.smokes) {
    // distance from the smoke centre to the sight line segment
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const t = clamp(((s.pos.x - a.x) * abx + (s.pos.y + 1 - a.y) * aby + (s.pos.z - a.z) * abz) /
      (abx * abx + aby * aby + abz * abz || 1), 0, 1);
    const dx = a.x + abx * t - s.pos.x, dy = a.y + aby * t - (s.pos.y + 1), dz = a.z + abz * t - s.pos.z;
    if (dx * dx + dy * dy + dz * dz < s.r * s.r) return true;
  }
  return false;
}

function perceive(f) {
  const b = f.brain;
  eyeOf(f, _eye);
  let bestD = Infinity;
  const prevSeen = b.seen;                 // reaction time applies to a NEW target,
  b.seen = null;                           // not to one already being tracked
  for (const e of S.fighters) {
    if (e === f || !e.alive || e.team === f.team) continue;
    eyeOf(e, _eye2);
    const d = _eye.distanceTo(_eye2);
    if (d > 70) continue;
    // field of view: wide up close, a cone at range; smoke and walls blind
    _dir.subVectors(_eye2, _eye).normalize();
    const look = lookDir(f, _aim);
    const dot = _dir.dot(look);
    if (d > 7 && dot < 0.25) continue;
    if (!hasLOS(_eye, _eye2) || smokeBlocks(_eye, _eye2)) continue;
    if (d < bestD) {
      bestD = d;
      if (prevSeen !== e) b.spotAt = S.time + b.react;   // fresh target: reaction time
      b.seen = e; b.seenT = S.time; b.seenPos.copy(e.pos);
    }
  }
  // hearing: fresh enemy noise inside its radius pulls attention
  for (let i = S.noises.length - 1; i >= 0; i--) {
    const n = S.noises[i];
    if (n.t <= b.lastNoiseT || n.team === f.team) continue;
    const d = Math.hypot(n.x - f.pos.x, n.z - f.pos.z);
    if (d < n.radius) {
      b.heardPos = { x: n.x, z: n.z }; b.heardT = n.t; b.lastNoiseT = n.t;
    }
  }
}

// ---- steering ------------------------------------------------------------------
function steerTo(f, tx, tz, speed, dt) {
  const dx = tx - f.pos.x, dz = tz - f.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) { dampen(f, dt); return 0; }
  const want = Math.atan2(-dx, -dz); // yaw whose forward is (dx, dz)
  f.yaw = angleLerp(f.yaw, want, Math.min(1, dt * 7));
  const sp = Math.min(speed, d / dt * 0.9);
  f.vel.x += clamp(dx / d * sp - f.vel.x, -34 * dt, 34 * dt);
  f.vel.z += clamp(dz / d * sp - f.vel.z, -34 * dt, 34 * dt);
  return d;
}
function dampen(f, dt) {
  f.vel.x *= Math.max(0, 1 - 9 * dt); f.vel.z *= Math.max(0, 1 - 9 * dt);
}
function followPath(f, speed, dt) {
  const b = f.brain;
  if (b.pathI >= b.path.length) { dampen(f, dt); return true; }
  const n = NODES[b.path[b.pathI]];
  const d = steerTo(f, n[0], n[1], speed, dt);
  if (d < 0.85) b.pathI++;
  return b.pathI >= b.path.length;
}
function setGoal(f, nodeIdx) {
  const b = f.brain;
  if (b.goalNode === nodeIdx && b.pathI < b.path.length) return;
  b.goalNode = nodeIdx;
  const from = nearestNode(f.pos.x, f.pos.z);
  b.path = findPath(from, nodeIdx);
  b.pathI = 0;
  // if the bot stands closer to a later node, skip ahead
  if (b.path.length && Math.hypot(NODES[b.path[0]][0] - f.pos.x, NODES[b.path[0]][1] - f.pos.z) < 1.2) b.pathI = 1;
}

// ---- combat ----------------------------------------------------------------------
function engage(f, dt) {
  const b = f.brain, e = b.seen;
  eyeOf(f, _eye);
  eyeOf(e, _eye2);
  const d = _eye.distanceTo(_eye2);
  // face the enemy
  const want = Math.atan2(-(_eye2.x - _eye.x), -(_eye2.z - _eye.z));
  f.yaw = angleLerp(f.yaw, want, Math.min(1, dt * 10));
  f.pitch = clamp(Math.atan2(_eye2.y - _eye.y, Math.hypot(_eye2.x - _eye.x, _eye2.z - _eye.z)), -0.5, 0.5);
  // strafe and crouch dance
  b.strafeT -= dt;
  if (b.strafeT <= 0) { b.strafeDir = Math.random() < 0.5 ? -1 : 1; b.strafeT = rand(0.6, 1.3); }
  b.crouchT -= dt;
  if (b.crouchT <= 0) { f.crouching = Math.random() < 0.3; b.crouchT = rand(0.8, 1.8); }
  _side.set(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
  const sp = d > 26 ? 3.4 : 2.6;
  f.vel.x += clamp(_side.x * b.strafeDir * sp - f.vel.x, -30 * dt, 30 * dt);
  f.vel.z += clamp(_side.z * b.strafeDir * sp - f.vel.z, -30 * dt, 30 * dt);
  // fire control: bursts with pauses, reaction time honoured, flash ruins aim
  const w = currentWeapon(f);
  if (!w) return;
  if (w.ammo <= 0) { reloadBot(f, w); return; }
  if (S.time < f.flashUntil) { b.pauseT = Math.max(b.pauseT, 0.3); }
  if (b.pauseT > 0) { b.pauseT -= dt; return; }
  if (S.time < b.spotAt) return;
  if (f.cooldown > 0) return;
  // aim point: chest, sometimes head; error grows with range, target speed
  // and with the shooter's own movement — the same trade the player faces
  _aim.copy(_eye2); _aim.y -= Math.random() < 0.24 ? 0.12 : 0.55;
  const targetSpeed = Math.hypot(e.vel.x, e.vel.z);
  let err = THREE.MathUtils.degToRad(b.aimErr) * (0.55 + d / 26) * (1 + targetSpeed * 0.16);
  if (S.time < f.flashUntil) err *= 5;
  _dir.subVectors(_aim, _eye).normalize();
  _dir.x += rand(-1, 1) * err; _dir.y += rand(-1, 1) * err * 0.7; _dir.z += rand(-1, 1) * err;
  _dir.normalize();
  shoot(f, _eye, _dir, w.def);
  w.ammo--;
  f.lastShotAt = S.time;
  f.cooldown = 60 / w.def.rpm;
  _muzzle.copy(_eye).addScaledVector(_dir, 0.7); _muzzle.y -= 0.12;
  FX.muzzle(_muzzle);
  const distToPlayer = S.player ? Math.hypot(S.player.pos.x - f.pos.x, S.player.pos.z - f.pos.z) : 30;
  AU.shot(w.def.id === 'needle' ? 'sniper' : w.def.id, clamp(distToPlayer / 42, 0, 1));
  hearNoise(f.pos.x, f.pos.z, f.team, 34);
  if (w.ammo === 0) reloadBot(f, w);
  b.burstLeft--;
  if (b.burstLeft <= 0) { b.burstLeft = randiBurst(w.def); b.pauseT = rand(0.32, 0.75); }
}
function randiBurst(def) { return def.id === 'needle' ? 1 : 2 + Math.floor(Math.random() * 4); }
function reloadBot(f, w) {
  if (f.reloadT > 0 || w.reserve <= 0) return;
  f.reloadT = w.def.reload;
}

// ---- the brain tick ------------------------------------------------------------------
export function updateBot(f, dt) {
  const b = f.brain;
  f.cooldown = Math.max(0, f.cooldown - dt);
  if (f.reloadT > 0) {
    f.reloadT -= dt;
    if (f.reloadT <= 0) {
      const w = currentWeapon(f);
      if (w) { const take = Math.min(w.def.mag - w.ammo, w.reserve); w.ammo += take; w.reserve -= take; }
    }
  }
  if (!f.alive) { dampen(f, dt); f.vel.y -= 23 * dt; moveFighter(f.pos, f.vel, dt, CFG.height); syncBotMesh(f, dt); return; }

  b.thinkT -= dt;
  if (b.thinkT <= 0) { b.thinkT = 0.12; perceive(f); }

  const phase = S.phase;
  let moving = false;
  if (phase === 'live' || phase === 'planted') {
    // A carrier who has reached his site commits to the plant: he breaks
    // off only for an enemy close enough to rush him. Without this, any
    // defender in sight turns the site into a firefight and the charge
    // never goes down at all.
    let commit = false;
    if (phase === 'live' && f.team === TEAM.ATK && S.bomb.carrier === f && b.seen) {
      const site = SITES[b.site];
      const dSite = Math.hypot(f.pos.x - site.x, f.pos.z - site.z);
      const dFoe = Math.hypot(b.seen.pos.x - f.pos.x, b.seen.pos.z - f.pos.z);
      commit = dSite < site.r + 2.5 && dFoe > 9;
    }
    if (!commit && b.seen && S.time - b.seenT < 0.4 && b.seen.alive) {
      engage(f, dt); moving = true;
    } else if (f.team === TEAM.ATK) moving = atkBrain(f, dt);
    else moving = defBrain(f, dt);
  }
  if (!moving) {
    // hold position: watch the most likely lane
    if (b.seen && S.time - b.seenT < 4) {
      const want = Math.atan2(-(b.seenPos.x - f.pos.x), -(b.seenPos.z - f.pos.z));
      f.yaw = angleLerp(f.yaw, want, Math.min(1, dt * 5));
    }
    dampen(f, dt);
  }
  f.vel.y -= 23 * dt;
  f.grounded = moveFighter(f.pos, f.vel, dt, f.crouching ? CFG.crouchHeight : CFG.height);
  syncBotMesh(f, dt);
}

function atkBrain(f, dt) {
  const b = f.brain;
  const site = SITES[b.site];
  if (S.phase === 'live' && S.bomb.state === 'dropped' && S.bomb.pos) {
    // the nearest Runner goes back for the charge, the rest push on
    let nearest = true;
    for (const x of S.fighters) {
      if (x.team === TEAM.ATK && x.alive && x !== f &&
          Math.hypot(x.pos.x - S.bomb.pos.x, x.pos.z - S.bomb.pos.z) <
          Math.hypot(f.pos.x - S.bomb.pos.x, f.pos.z - S.bomb.pos.z)) nearest = false;
    }
    if (nearest) { setGoal(f, nearestNode(S.bomb.pos.x, S.bomb.pos.z)); followPath(f, 5.6, dt); return true; }
  }
  if (S.phase === 'planted') {
    // guard the charge: fall back to a cover node near the site and hold
    const guard = nearestNode(site.x + 6, site.z + (f.id % 2 ? 5 : -5));
    if (Math.hypot(f.pos.x - site.x, f.pos.z - site.z) > 9) { setGoal(f, guard); followPath(f, 5.4, dt); return true; }
    return false;
  }
  if (S.bomb.carrier === f) {
    const d = Math.hypot(f.pos.x - site.x, f.pos.z - site.z);
    if (d < site.r - 1.2) {
      // inside the site: channel the plant (rounds.js watches plantT),
      // kneeling at the charge
      dampen(f, dt);
      f.crouching = true;
      b.plantT += dt;
      return true;
    }
    b.plantT = 0;
    setGoal(f, b.site === 'A' ? NODE.A : NODE.B);
    followPath(f, 5.6, dt);
    return true;
  }
  b.plantT = 0;
  // escorts stay a few metres off the carrier's shoulder; late-round, push in
  const pushIn = S.phaseT < 30 || aliveCount(TEAM.ATK) <= 2;
  const goalNode = pushIn ? (b.site === 'A' ? NODE.A : NODE.B) : (b.site === 'A' ? NODE.A_E : NODE.B_E);
  setGoal(f, goalNode);
  followPath(f, 5.5, dt);
  // a frag toward a remembered enemy position clears corners
  maybeGrenade(f);
  return true;
}

function defBrain(f, dt) {
  const b = f.brain;
  if (S.phase === 'planted' && S.bomb.pos) {
    const bp = S.bomb.pos;
    const d = Math.hypot(f.pos.x - bp.x, f.pos.z - bp.z);
    // the nearest Warden defuses, the rest cover from a ring around the site
    const defusers = S.fighters.filter(x => x.team === TEAM.DEF && x.alive && !x.isPlayer);
    const iAmNearest = defusers.every(x => x === f ||
      Math.hypot(x.pos.x - bp.x, x.pos.z - bp.z) >= d - 0.01);
    if (iAmNearest && d > 1.5) { setGoal(f, nearestNode(bp.x, bp.z)); followPath(f, 5.8, dt); return true; }
    if (iAmNearest && d <= 1.5) {
      dampen(f, dt);
      b.defuseT += dt;                    // rounds.js reads this channel too
      return true;
    }
    b.defuseT = 0;
    const ring = nearestNode(bp.x + (f.id % 3 - 1) * 7, bp.z + (f.id % 2 ? 7 : -7));
    if (Math.hypot(f.pos.x - bp.x, f.pos.z - bp.z) > 10) { setGoal(f, ring); followPath(f, 5.6, dt); return true; }
    return false;
  }
  b.defuseT = 0;
  // rotate toward gunfire at the other site when your own is quiet
  if (b.heardPos && S.time - b.heardT < 6) {
    setGoal(f, nearestNode(b.heardPos.x, b.heardPos.z));
    followPath(f, 5.4, dt);
    return true;
  }
  if (b.holdNode >= 0) {
    const n = NODES[b.holdNode];
    if (Math.hypot(f.pos.x - n[0], f.pos.z - n[1]) > 1.1) { setGoal(f, b.holdNode); followPath(f, 5.2, dt); return true; }
    f.crouching = f.id % 3 === 0;
    return false;
  }
  return false;
}

function maybeGrenade(f) {
  const b = f.brain;
  if (S.time - b.seenT > 1.2 || Math.random() > 0.004) return;
  if (f.loadout.grenades.frag <= 0) return;
  const d = Math.hypot(b.seenPos.x - f.pos.x, b.seenPos.z - f.pos.z);
  if (d < 9 || d > 26) return;
  f.loadout.grenades.frag--;
  eyeOf(f, _eye);
  _dir.subVectors(b.seenPos, f.pos).normalize(); _dir.y += d * 0.012;
  FX.throwGrenade(f, 'frag', _eye, _dir, clamp(d / 22, 0.5, 1.1));
}

// Round-start role assignment (rounds.js calls this).
export function assignRoles() {
  const atk = S.fighters.filter(f => f.team === TEAM.ATK);
  const site = Math.random() < 0.5 ? 'A' : 'B';
  for (const f of atk) f.brain.site = site;
  const defs = S.fighters.filter(f => f.team === TEAM.DEF && !f.isPlayer);
  const holds = [NODE.A_N, NODE.A_S, NODE.B_E, NODE.B_S];
  defs.forEach((f, i) => { f.brain.holdNode = holds[i % holds.length]; f.brain.site = i % 2 ? 'B' : 'A'; });
  for (const f of S.fighters) {
    if (!f.brain) continue;                    // the player has no brain to reset
    f.brain.path = []; f.brain.pathI = 0; f.brain.goalNode = -1;
    f.brain.seen = null; f.brain.seenT = -99; f.brain.plantT = 0; f.brain.defuseT = 0;
  }
}
