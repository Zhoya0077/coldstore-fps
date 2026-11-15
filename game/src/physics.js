// physics.js — collision and rays against the map's AABB list. Movement is
// axis-separated with a step-up allowance, so fighters slide along walls and
// climb crates and the catwalk steps without a physics engine. Rays use the
// slab test; fighter hits use two spheres (body, head) so the world can
// occlude a shot before the fighter test ever runs.

import * as THREE from 'three';
import { COLLIDERS, NODES, BOUNDS } from './map.js';
import { CFG } from './state.js';

const STEP_UP = 1.02;   // climbs the catwalk steps (1.0) but not crates (1.35)

// Highest walkable top under a point, counting only boxes whose top the
// fighter can step onto from feetY.
export function groundHeight(x, z, feetY) {
  let g = 0;
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) {
      if (c.maxY <= feetY + STEP_UP && c.maxY > g) g = c.maxY;
    }
  }
  return g;
}

function circleHitsBox(x, z, r, c) {
  const nx = Math.max(c.minX, Math.min(x, c.maxX));
  const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
  const dx = x - nx, dz = z - nz;
  return dx * dx + dz * dz < r * r;
}

// Does a capsule at (x, z) with feet at feetY overlap any solid that is too
// tall to step onto?
function blockedAt(x, z, feetY, height) {
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    if (c.maxY <= feetY + STEP_UP) continue;              // steppable: not a wall
    if (c.minY >= feetY + height) continue;               // overhead: duck under
    if (circleHitsBox(x, z, CFG.radius, c)) return true;
  }
  return false;
}

// Move a fighter: pos is the feet position (THREE.Vector3), vel is mutated
// only by landing. Returns true when standing on ground.
export function moveFighter(pos, vel, dt, height) {
  // X axis
  let nx = pos.x + vel.x * dt;
  if (!blockedAt(nx, pos.z, pos.y, height)) pos.x = nx; else vel.x = 0;
  // Z axis
  let nz = pos.z + vel.z * dt;
  if (!blockedAt(pos.x, nz, pos.y, height)) pos.z = nz; else vel.z = 0;
  // Y axis with gravity handled by the caller through vel.y
  pos.y += vel.y * dt;
  const g = groundHeight(pos.x, pos.z, pos.y);
  let grounded = false;
  if (pos.y <= g) { pos.y = g; if (vel.y < 0) vel.y = 0; grounded = true; }
  // Ceiling: a box bottom just above the head stops a jump.
  if (vel.y > 0) {
    for (let i = 0; i < COLLIDERS.length; i++) {
      const c = COLLIDERS[i];
      if (pos.x >= c.minX && pos.x <= c.maxX && pos.z >= c.minZ && pos.z <= c.maxZ) {
        if (c.minY >= pos.y + height - 0.3 && c.minY < pos.y + height + vel.y * dt + 0.1) { vel.y = 0; break; }
      }
    }
  }
  pos.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, pos.x));
  pos.z = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, pos.z));
  return grounded;
}

// Nearest AABB hit along a ray, or null. dir must be normalised.
const _inv = new THREE.Vector3();
export function rayWorld(origin, dir, maxDist) {
  let best = null, bestDist = maxDist;
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    let tmin = 0, tmax = bestDist;
    // X slab
    if (Math.abs(dir.x) < 1e-8) { if (origin.x < c.minX || origin.x > c.maxX) continue; }
    else {
      _inv.x = 1 / dir.x;
      let t1 = (c.minX - origin.x) * _inv.x, t2 = (c.maxX - origin.x) * _inv.x;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dir.y) < 1e-8) { if (origin.y < c.minY || origin.y > c.maxY) continue; }
    else {
      _inv.y = 1 / dir.y;
      let t1 = (c.minY - origin.y) * _inv.y, t2 = (c.maxY - origin.y) * _inv.y;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dir.z) < 1e-8) { if (origin.z < c.minZ || origin.z > c.maxZ) continue; }
    else {
      _inv.z = 1 / dir.z;
      let t1 = (c.minZ - origin.z) * _inv.z, t2 = (c.maxZ - origin.z) * _inv.z;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin < bestDist && tmin > 0.01) {
      bestDist = tmin;
      best = { dist: tmin, box: c };
    }
  }
  if (!best) return null;
  best.point = new THREE.Vector3(
    origin.x + dir.x * bestDist, origin.y + dir.y * bestDist, origin.z + dir.z * bestDist);
  return best;
}

// Ray vs one fighter's two hit spheres. Crouching lowers both.
const _oc = new THREE.Vector3();
export function rayFighter(origin, dir, f, maxDist) {
  if (!f.alive) return null;
  const crouch = f.crouching;
  const headY = f.pos.y + (crouch ? 1.06 : 1.56);
  const bodyY = f.pos.y + (crouch ? 0.62 : 0.92);
  let best = null;
  // head first: it is the smaller, richer target
  let hit = raySphere(origin, dir, f.pos.x, headY, f.pos.z, 0.24, maxDist);
  if (hit !== null) best = { dist: hit, part: 'head' };
  hit = raySphere(origin, dir, f.pos.x, bodyY, f.pos.z, 0.44, maxDist);
  if (hit !== null && (!best || hit < best.dist)) best = { dist: hit, part: 'body' };
  if (!best) return null;
  best.fighter = f;
  best.point = new THREE.Vector3(
    origin.x + dir.x * best.dist, origin.y + dir.y * best.dist, origin.z + dir.z * best.dist);
  return best;
}

function raySphere(origin, dir, cx, cy, cz, r, maxDist) {
  _oc.set(origin.x - cx, origin.y - cy, origin.z - cz);
  const b = _oc.dot(dir);
  const c = _oc.lengthSq() - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0.05 || t > maxDist) return null;
  return t;
}

// Line of sight between two eye points: true when no solid blocks the ray.
export function hasLOS(a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const dist = dir.length();
  if (dist < 0.001) return true;
  dir.divideScalar(dist);
  const hit = rayWorld(a, dir, dist);
  return !hit || hit.dist >= dist - 0.05;
}

// ---- navigation graph ----------------------------------------------------
export const EDGES = [];
export function buildNav() {
  const eye = new THREE.Vector3(), eye2 = new THREE.Vector3();
  for (let i = 0; i < NODES.length; i++) {
    EDGES.push([]);
    for (let j = 0; j < NODES.length; j++) {
      if (i === j) continue;
      const dx = NODES[j][0] - NODES[i][0], dz = NODES[j][1] - NODES[i][1];
      const d = Math.hypot(dx, dz);
      if (d > 15) continue;
      eye.set(NODES[i][0], 1.1, NODES[i][1]);
      eye2.set(NODES[j][0], 1.1, NODES[j][1]);
      if (hasLOS(eye, eye2)) EDGES[i].push(j);
    }
  }
}

// Breadth-first path between node indices; returns a list of node indices
// (excluding `from`, ending at `to`) or [] when already there / unreachable.
export function findPath(from, to) {
  if (from === to) return [];
  const prev = new Array(NODES.length).fill(-1);
  const queue = [from]; prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    for (const nxt of EDGES[cur]) {
      if (prev[nxt] !== -1) continue;
      prev[nxt] = cur;
      if (nxt === to) {
        const path = [to];
        let c = to;
        while (c !== from) { c = prev[c]; if (c !== from) path.unshift(c); }
        return path;
      }
      queue.push(nxt);
    }
  }
  return [];
}

export function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const d = (NODES[i][0] - x) ** 2 + (NODES[i][1] - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
