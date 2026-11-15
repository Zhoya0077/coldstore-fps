// fighters.js — the combatant record every system shares. A fighter is
// plain data (position, health, loadout, score line); bots.js gives it a
// brain and a body, player.js gives fighters[0] a camera and hands.

import * as THREE from 'three';
import { CFG } from './state.js';
import { defaultLoadout } from './weapons.js';

let nextId = 1;

export function makeFighter(team, name, isPlayer) {
  return {
    id: nextId++, team, name, isPlayer: !!isPlayer,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    yaw: team === 'def' ? -Math.PI / 2 : Math.PI / 2, pitch: 0,
    hp: 100, armor: 0, alive: true, crouching: false, grounded: true,
    money: CFG.startMoney, hasKit: false,
    loadout: defaultLoadout(),
    cooldown: 0, reloadT: 0, throwT: 0, scoped: false,
    bloom: 0, recoil: 0,
    kills: 0, deaths: 0,
    lastAttacker: null, lastHitAt: -99, flashUntil: 0,
    mesh: null, brain: null,
  };
}

export function resetFighter(f, spawn, yaw) {
  f.pos.set(spawn[0], 0, spawn[1]);
  f.vel.set(0, 0, 0);
  f.yaw = yaw; f.pitch = 0;
  f.hp = 100; f.alive = true; f.crouching = false;
  f.cooldown = 0; f.reloadT = 0; f.throwT = 0; f.scoped = false;
  f.bloom = 0; f.recoil = 0; f.flashUntil = 0; f.lastAttacker = null;
  const w = f.loadout.primary || f.loadout.secondary;
  f.loadout.slot = f.loadout.primary ? 'primary' : 'secondary';
  if (w) { /* magazines stay as bought; rounds.js tops up the sidearm */ }
}

export function eyeOf(f, out) {
  const h = f.crouching ? CFG.crouchEye : CFG.eyeHeight;
  return out.set(f.pos.x, f.pos.y + h, f.pos.z);
}

export function lookDir(f, out) {
  const cp = Math.cos(f.pitch);
  return out.set(-Math.sin(f.yaw) * cp, Math.sin(f.pitch), -Math.cos(f.yaw) * cp);
}
