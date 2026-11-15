// weapons.js — the armoury: definitions, the shared hitscan shot, damage
// with armour and headshot multipliers, view models built from boxes, and
// grenade throwing. Player and bots fire through the same shoot() so a bot's
// rifle obeys exactly the physics of the player's.

import * as THREE from 'three';
import { CFG, S, clamp } from './state.js';
import { rayWorld, rayFighter } from './physics.js';
import * as FX from './fx.js';
import * as AU from './audio.js';

export const WEAPONS = {
  p9:     { id: 'p9', name: 'P9 Sidearm', slot: 'secondary', price: 0, damage: 26, headMult: 4, rpm: 352, mag: 12, reserve: 100, reload: 1.5, spread: 0.55, spreadMove: 2.4, recoil: 0.011, auto: false, range: 90, zoom: 0 },
  wasp:   { id: 'wasp', name: 'VK-9 Wasp', slot: 'primary', price: 1500, damage: 22, headMult: 3.2, rpm: 800, mag: 32, reserve: 128, reload: 2.1, spread: 0.85, spreadMove: 2.8, recoil: 0.008, auto: true, range: 80, zoom: 0 },
  lance:  { id: 'lance', name: 'AR-57 Lance', slot: 'primary', price: 2700, damage: 33, headMult: 4, rpm: 666, mag: 30, reserve: 120, reload: 2.4, spread: 0.62, spreadMove: 3.0, recoil: 0.013, auto: true, range: 120, zoom: 0 },
  needle: { id: 'needle', name: 'LR-12 Needle', slot: 'primary', price: 4750, damage: 110, headMult: 2.6, rpm: 41, mag: 5, reserve: 30, reload: 3.4, spread: 0.06, spreadMove: 6.0, recoil: 0.055, auto: false, range: 220, zoom: 3.2 },
};
export const GRENADES = {
  frag:  { id: 'frag', name: 'Shard Grenade', price: 300, max: 1, fuse: 1.6, radius: 5.5, damage: 92 },
  flash: { id: 'flash', name: 'Dazzler', price: 200, max: 2, fuse: 1.4, radius: 16 },
  smoke: { id: 'smoke', name: 'Veil Canister', price: 300, max: 1, fuse: 1.2, radius: 3.4, duration: 16 },
};
export const ARMOR_PRICE = 650, KIT_PRICE = 200;

export function makeWeapon(id) {
  const def = WEAPONS[id];
  return { def, ammo: def.mag, reserve: def.reserve };
}

export function defaultLoadout() {
  return { primary: null, secondary: makeWeapon('p9'), slot: 'secondary', grenades: { frag: 0, flash: 0, smoke: 0 }, grenadeSel: 'frag' };
}

export function currentWeapon(f) {
  if (f.loadout.slot === 'primary') return f.loadout.primary;
  if (f.loadout.slot === 'secondary') return f.loadout.secondary;
  return null; // grenade slot: hands hold a grenade, not a gun
}

// Kill bookkeeping is registered by rounds.js (keeps the import graph flat).
let killHandler = () => {};
export function setKillHandler(fn) { killHandler = fn; }

// Armour soaks just under half a hit and wears down doing it.
export function applyDamage(attacker, victim, dmg, part) {
  if (!victim.alive || S.phase !== 'live' && S.phase !== 'planted') return false;
  let hpDmg = dmg;
  if (victim.armor > 0) {
    const absorbed = Math.min(victim.armor, dmg * 0.45);
    victim.armor -= absorbed;
    hpDmg = dmg - absorbed;
  }
  victim.hp -= hpDmg;
  victim.lastAttacker = attacker;
  victim.lastHitAt = S.time;
  if (victim.isPlayer) FX.onPlayerHurt(attacker);
  if (victim.hp <= 0) {
    victim.hp = 0; victim.alive = false;
    victim.deaths++;
    if (attacker && attacker !== victim) {
      attacker.kills++;
      attacker.money = Math.min(CFG.maxMoney, attacker.money + CFG.killReward);
    }
    killHandler(attacker, victim, part);
    return true;
  }
  return false;
}

const _dir = new THREE.Vector3();
// One hitscan shot. dir is the *intended* direction; spread is applied by
// the caller so the player's crosshair bloom and a bot's aim error share
// this code. Returns what was hit for effects and hitmarkers.
export function shoot(attacker, origin, dir, weaponDef) {
  const range = weaponDef.range;
  const worldHit = rayWorld(origin, dir, range);
  const maxD = worldHit ? worldHit.dist : range;
  let best = null;
  for (const f of S.fighters) {
    if (f === attacker || !f.alive || f.team === attacker.team) continue;
    const hit = rayFighter(origin, dir, f, maxD);
    if (hit && (!best || hit.dist < best.dist)) best = hit;
  }
  if (best) {
    const falloff = 1 - clamp((best.dist - 18) / 110, 0, 0.45);
    const dmg = weaponDef.damage * (best.part === 'head' ? weaponDef.headMult : 1) * falloff;
    const killed = applyDamage(attacker, best.fighter, dmg, best.part);
    FX.tracer(origin, best.point, attacker.team);
    FX.bloodPuff(best.point, killed);
    if (attacker.isPlayer) {
      S.stats.hits++;
      AU.hitmarker(killed);
      FX.showHitmarker(killed, best.part === 'head');
    }
    return { type: 'fighter', fighter: best.fighter, part: best.part, killed, point: best.point, dist: best.dist };
  }
  if (worldHit) {
    FX.tracer(origin, worldHit.point, attacker.team);
    FX.impact(worldHit.point);
    return { type: 'world', point: worldHit.point, dist: worldHit.dist };
  }
  _dir.copy(dir).multiplyScalar(range).add(origin);
  FX.tracer(origin, _dir, attacker.team);
  return { type: 'none' };
}

// ---- view models ---------------------------------------------------------
// Low-poly guns from boxes, one per weapon, parented to the camera. Each is
// rebuilt only on weapon switch, never per frame.
const MAT = {
  gun: null, grip: null, accent: null,
};
function mats() {
  if (!MAT.gun) {
    MAT.gun = new THREE.MeshStandardMaterial({ color: 0x3a454f, roughness: 0.45, metalness: 0.3 });
    MAT.grip = new THREE.MeshStandardMaterial({ color: 0x171d23, roughness: 0.85, metalness: 0.1 });
    MAT.accent = new THREE.MeshStandardMaterial({ color: 0xffb648, roughness: 0.4, metalness: 0.3 });
  }
  return MAT;
}
function part(group, mat, x, y, z, w, h, d, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.x = rx;
  group.add(m); return m;
}
export function buildViewModel(id) {
  const { gun, grip, accent } = mats();
  const g = new THREE.Group();
  if (id === 'p9') {
    part(g, gun, 0, 0.02, -0.16, 0.075, 0.09, 0.3);
    part(g, grip, 0, -0.09, -0.05, 0.07, 0.15, 0.09, 0.25);
    part(g, accent, 0, 0.075, -0.3, 0.012, 0.02, 0.012);
  } else if (id === 'wasp') {
    part(g, gun, 0, 0.02, -0.24, 0.08, 0.1, 0.46);
    part(g, grip, 0, -0.09, -0.12, 0.07, 0.15, 0.09, 0.25);
    part(g, gun, 0, -0.05, -0.3, 0.055, 0.16, 0.07);
    part(g, accent, 0, 0.085, -0.34, 0.014, 0.02, 0.014);
  } else if (id === 'lance') {
    part(g, gun, 0, 0.02, -0.3, 0.085, 0.1, 0.58);
    part(g, grip, 0, -0.09, -0.14, 0.07, 0.16, 0.09, 0.25);
    part(g, gun, 0, -0.06, -0.34, 0.05, 0.17, 0.06);
    part(g, gun, 0, 0.03, 0.08, 0.09, 0.13, 0.2);
    part(g, accent, 0, 0.09, -0.5, 0.014, 0.022, 0.014);
    part(g, gun, 0, 0.1, -0.18, 0.03, 0.05, 0.2);
  } else if (id === 'needle') {
    part(g, gun, 0, 0.02, -0.42, 0.08, 0.09, 0.85);
    part(g, grip, 0, -0.09, -0.18, 0.07, 0.16, 0.09, 0.25);
    part(g, gun, 0, -0.04, -0.42, 0.045, 0.13, 0.06);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.24, 10), grip);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.11, -0.3); g.add(scope);
    part(g, accent, 0, 0.02, -0.86, 0.05, 0.05, 0.03);
  }
  g.position.set(0.24, -0.22, -0.45);
  return g;
}

export function buildGrenadeModel(type) {
  const { grip } = mats();
  const g = new THREE.Group();
  const color = type === 'frag' ? 0x5a6e46 : type === 'flash' ? 0xd8dde2 : 0x707880;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3 }));
  g.add(body);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), grip);
  cap.position.y = 0.085; g.add(cap);
  g.position.set(0.22, -0.2, -0.4);
  return g;
}
