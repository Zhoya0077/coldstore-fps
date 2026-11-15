// fx.js — everything that flashes, flies or fades: tracers, impact and blood
// puffs, muzzle flashes, grenade projectiles with real bounce, explosions,
// flash and smoke effects. Pools are allocated once at boot; the per-frame
// paths reuse them, so a firefight never allocates.

import * as THREE from 'three';
import { S, CFG, clamp } from './state.js';
import { COLLIDERS } from './map.js';
import { hasLOS } from './physics.js';
import { GRENADES, applyDamage } from './weapons.js';
import * as AU from './audio.js';

let scene = null;
const tracers = [], puffs = [], flashes = [], projectiles = [], clouds = [];
let hitmarkEl = null, dmgEl = null, flashEl = null, hitmarkT = 0;
S.shake = 0;

export function initFX(s) {
  scene = s;
  hitmarkEl = document.getElementById('hitmark');
  dmgEl = document.getElementById('dmgvin');
  flashEl = document.getElementById('flashvin');
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  for (let i = 0; i < 28; i++) {
    const mat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 });
    const line = new THREE.Line(tGeo.clone(), mat);
    line.visible = false; line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, t: 0 });
  }
  const pGeo = new THREE.OctahedronGeometry(0.09);
  for (let i = 0; i < 26; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfd6da, transparent: true, opacity: 0 });
    const m = new THREE.Mesh(pGeo, mat);
    m.visible = false; scene.add(m);
    puffs.push({ m, t: 0, dur: 0.2, grow: 1 });
  }
  for (let i = 0; i < 6; i++) {
    const light = new THREE.PointLight(0xffc37f, 0, 9, 2);
    scene.add(light);
    flashes.push({ light, t: 0 });
  }
}

const _v = new THREE.Vector3();
export function tracer(a, b, team) {
  const slot = tracers.find(t => t.t <= 0) || tracers[0];
  const pos = slot.line.geometry.getAttribute('position');
  pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z);
  pos.needsUpdate = true;
  slot.line.material.color.setHex(team === 'def' ? 0x9fdcff : 0xffc37f);
  slot.line.material.opacity = 0.85;
  slot.line.visible = true;
  slot.t = 0.055;
}

function puff(point, color, scale, dur) {
  const slot = puffs.find(p => p.t <= 0) || puffs[0];
  slot.m.position.copy(point);
  slot.m.material.color.setHex(color);
  slot.m.material.opacity = 0.9;
  slot.m.scale.setScalar(scale);
  slot.m.visible = true;
  slot.t = dur; slot.dur = dur; slot.grow = scale;
}
export function impact(point) { puff(point, 0xcfd6da, 0.8, 0.16); }
export function bloodPuff(point, killed) { puff(point, killed ? 0xd42a20 : 0xa32318, killed ? 1.5 : 1.0, 0.22); }

export function muzzle(worldPos) {
  const slot = flashes.find(f => f.t <= 0) || flashes[0];
  slot.light.position.copy(worldPos);
  slot.light.intensity = 26;
  slot.t = 0.045;
}

export function showHitmarker(killed, head) {
  if (!hitmarkEl) return;
  hitmarkEl.style.opacity = 1;
  hitmarkEl.classList.toggle('kill', !!killed);
  hitmarkT = head ? 0.22 : 0.13;
}

export function onPlayerHurt() {
  if (dmgEl) dmgEl.style.opacity = 0.9;
}

// ---- grenades --------------------------------------------------------------
const GRENADE_COLORS = { frag: 0x5a6e46, flash: 0xd8dde2, smoke: 0x707880 };
export function throwGrenade(owner, type, origin, dir, power = 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshStandardMaterial({ color: GRENADE_COLORS[type], roughness: 0.5, metalness: 0.3 }));
  mesh.position.copy(origin);
  scene.add(mesh);
  const vel = dir.clone().multiplyScalar(21 * power);
  vel.y += 3.2;
  projectiles.push({ mesh, vel, type, owner, t: 0, fuse: { frag: 1.6, flash: 1.4, smoke: 1.2 }[type] });
  AU.throwWhoosh();
}

function circleBlocked(x, z, y) {
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    if (y > c.maxY || y + 0.14 < c.minY) continue;
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    if ((x - nx) ** 2 + (z - nz) ** 2 < 0.08 ** 2) return c;
  }
  return null;
}

function stepProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.t += dt;
    p.vel.y -= 19 * dt;
    const pos = p.mesh.position;
    let nx = pos.x + p.vel.x * dt;
    if (circleBlocked(nx, pos.z, pos.y)) { p.vel.x *= -0.42; nx = pos.x; }
    let nz = pos.z + p.vel.z * dt;
    if (circleBlocked(pos.x, nz, pos.y)) { p.vel.z *= -0.42; nz = pos.z; }
    pos.x = nx; pos.z = nz;
    pos.y += p.vel.y * dt;
    if (pos.y < 0.07) {
      pos.y = 0.07;
      if (Math.abs(p.vel.y) > 1.2) { p.vel.y *= -0.38; p.vel.x *= 0.72; p.vel.z *= 0.72; }
      else { p.vel.y = 0; p.vel.x *= 0.86; p.vel.z *= 0.86; }
    }
    if (p.t >= p.fuse) {
      detonate(p);
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
}

const _eye = new THREE.Vector3(), _to = new THREE.Vector3();
function detonate(p) {
  const pos = p.mesh.position;
  if (p.type === 'frag') {
    explosionVisual(pos, 1);
    AU.explosion(true);
    shakeByDistance(pos, 1);
    const def = GRENADES.frag;
    for (const f of S.fighters) {
      if (!f.alive) continue;
      _eye.set(f.pos.x, f.pos.y + 1, f.pos.z);
      const d = _eye.distanceTo(pos);
      if (d > def.radius) continue;
      if (d > 1.2 && !hasLOS(pos, _eye)) continue;
      const dmg = def.damage * (1 - d / (def.radius + 1.5)) * (f.crouching ? 0.8 : 1);
      applyDamage(p.owner === f ? null : p.owner, f, dmg, 'body');
    }
  } else if (p.type === 'flash') {
    explosionVisual(pos, 0.35);
    AU.explosion(false);
    for (const f of S.fighters) {
      if (!f.alive) continue;
      _eye.set(f.pos.x, f.pos.y + 1.5, f.pos.z);
      const d = _eye.distanceTo(pos);
      if (d > 17) continue;
      _to.subVectors(pos, _eye).normalize();
      const look = new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
      const facing = _to.dot(look);            // 1 = staring at it
      if (f.isPlayer) {
        if (hasLOS(_eye, pos)) {
          const strength = clamp((1 - d / 19) * (facing > 0 ? 1 : 0.25) + (facing > 0.6 ? 0.3 : 0), 0, 1);
          if (flashEl) flashEl.style.opacity = Math.min(1, strength + 0.15);
          S.flashRecovery = 1.6 + strength * 2.4;
        }
      } else if (hasLOS(_eye, pos)) {
        const dur = (facing > -0.2 ? 2.6 : 1.1) * clamp(1 - d / 22, 0.3, 1);
        f.flashUntil = Math.max(f.flashUntil || 0, S.time + dur);
      }
    }
  } else if (p.type === 'smoke') {
    AU.beep(300, 0.2, 0.1);
    spawnSmoke(pos);
  }
}

function explosionVisual(pos, scale) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffa63f, transparent: true, opacity: 0.95 }));
  m.position.copy(pos); scene.add(m);
  puffs.push({ m, t: 0.34 * scale + 0.12, dur: 0.34 * scale + 0.12, grow: 7 * scale, temp: true });
  const slot = flashes.find(f => f.t <= 0) || flashes[0];
  slot.light.position.copy(pos).y += 0.6;
  slot.light.color.setHex(0xff9a3f);
  slot.light.intensity = 120; slot.t = 0.22;
}

export function bombDetonation(pos) {
  explosionVisual(pos, 2.4);
  AU.explosion(true);
  shakeByDistance(pos, 2.2);
}

function shakeByDistance(pos, amt) {
  const pl = S.player;
  if (!pl || !pl.alive) return;
  const d = Math.hypot(pl.pos.x - pos.x, pl.pos.z - pos.z);
  S.shake = Math.min(0.6, S.shake + amt * clamp(1 - d / 16, 0, 1) * 0.5);
}

// Smoke: a cluster of soft sprites plus a state entry the bots' LOS checks.
let smokeTex = null;
function spawnSmoke(pos) {
  if (!smokeTex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(196,204,210,0.85)');
    grad.addColorStop(1, 'rgba(196,204,210,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    smokeTex = new THREE.CanvasTexture(cv);
  }
  const group = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.55, depthWrite: false }));
    sp.position.set((Math.random() - 0.5) * 3.4, 0.7 + Math.random() * 1.7, (Math.random() - 0.5) * 3.4);
    sp.scale.setScalar(3.4 + Math.random() * 2.2);
    group.add(sp);
  }
  group.position.copy(pos);
  scene.add(group);
  const entry = { pos: pos.clone(), r: 3.4, until: S.time + 16 };
  S.smokes.push(entry);
  clouds.push({ group, until: entry.until });
}

// Called from the fixed-step simulation (grenades, smoke lifetimes) and from
// the render loop (fades). Splitting them keeps the sim deterministic.
export function stepFX(dt) {
  stepProjectiles(dt);
  for (let i = S.smokes.length - 1; i >= 0; i--) if (S.time > S.smokes[i].until) S.smokes.splice(i, 1);
  for (let i = clouds.length - 1; i >= 0; i--) {
    if (S.time > clouds[i].until) { scene.remove(clouds[i].group); clouds.splice(i, 1); }
  }
}

export function updateFX(dt) {
  for (const t of tracers) {
    if (t.t <= 0) continue;
    t.t -= dt;
    if (t.t <= 0) { t.line.visible = false; t.line.material.opacity = 0; }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    if (p.t <= 0) continue;
    p.t -= dt;
    const k = Math.max(0, p.t / p.dur);
    p.m.material.opacity = 0.9 * k;
    p.m.scale.setScalar(Math.max(0.01, p.grow * (p.temp ? (1.6 - k) : (0.5 + (1 - k) * 0.8))));
    if (p.t <= 0) {
      p.m.visible = false;
      if (p.temp) { scene.remove(p.m); puffs.splice(i, 1); }
    }
  }
  for (const f of flashes) {
    if (f.t <= 0) continue;
    f.t -= dt;
    if (f.t <= 0) f.light.intensity = 0;
  }
  if (hitmarkT > 0) { hitmarkT -= dt; if (hitmarkT <= 0 && hitmarkEl) hitmarkEl.style.opacity = 0; }
  if (dmgEl && dmgEl.style.opacity > 0) dmgEl.style.opacity = Math.max(0, parseFloat(dmgEl.style.opacity) - dt * 0.7);
  if (flashEl && flashEl.style.opacity > 0) {
    const rec = S.flashRecovery || 2.5;
    flashEl.style.opacity = Math.max(0, parseFloat(flashEl.style.opacity) - dt / rec);
  }
  S.shake = Math.max(0, S.shake - dt * 1.4);
}
