// main.js — boot and the game loop. The simulation runs on a fixed step
// (CFG.step, 120 Hz) from an accumulator, so physics and AI are identical
// at any display rate; rendering, camera work and HUD updates happen once
// per frame around it. This file also stages the deterministic ?shot=
// scenes the entry's screenshots are taken from.

import * as THREE from 'three';
import { CFG, S, TEAM } from './state.js';
// (CFG is re-exported on the test hook below so headless tests can shorten rounds)
import { buildWorld, SITES } from './map.js';
import { buildNav, EDGES, findPath, nearestNode } from './physics.js';
import { initInput, input, pressed, requestLock, endFrame } from './input.js';
import { initAudio } from './audio.js';
import { setupMatch, startMatch, updateRounds, updateBombVisual } from './rounds.js';
import { updateBot, syncBotMesh } from './bots.js';
import { initPlayerView, updatePlayer, updateCamera, camera, throwSelectedGrenade, syncViewModel } from './player.js';
import { initHUD, updateHUD, toggleBuy, showBanner } from './hud.js';
import * as FX from './fx.js';
import { makeWeapon } from './weapons.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
buildWorld(scene);
buildNav();
initPlayerView(scene);
FX.initFX(scene);
setupMatch(scene);
initInput(canvas);
initHUD();

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- screens ---------------------------------------------------------------
const menuEl = document.getElementById('menu');
document.getElementById('playbtn').addEventListener('click', () => {
  initAudio();
  menuEl.classList.add('hidden');
  document.getElementById('matchend').classList.add('hidden');
  startMatch();
  requestLock();
});
document.getElementById('againbtn').addEventListener('click', () => {
  initAudio();
  document.getElementById('matchend').classList.add('hidden');
  startMatch();
  requestLock();
});
canvas.addEventListener('click', () => {
  if (S.mode === 'match' && !input.locked && !S.shot) requestLock();
});

// ---- simulation --------------------------------------------------------------
function stepSim(dt) {
  updateRounds(dt);
  if (S.mode !== 'match') return;
  updatePlayer(S.player, dt);
  for (const f of S.fighters) if (!f.isPlayer) updateBot(f, dt);
  FX.stepFX(dt);
}

// Menu backdrop: a slow orbit over the crate hall while no match runs.
function menuCamera(t) {
  const r = 17, cx = -2, cz = -2;
  camera.position.set(cx + Math.cos(t * 0.05) * r, 7.5, cz + Math.sin(t * 0.05) * r);
  camera.lookAt(-8, 0.8, -4);
  camera.fov = 58; camera.updateProjectionMatrix();
}

// ---- screenshot staging --------------------------------------------------------
// ?shot=play|menu|buy|end freezes a composed, honest frame of the real game:
// a live round mid-fight, the title screen, the buy menu, a defused round.
function stageShot(kind) {
  S.shot = kind;
  menuEl.classList.add('hidden');
  startMatch();
  const p = S.player;
  if (kind === 'menu') {
    menuEl.classList.remove('hidden');
    S.mode = 'menu';                       // backdrop orbit, title card on top
    for (const f of S.fighters) if (!f.isPlayer) syncBotMesh(f, 0.05);
    return;
  }
  S.phase = 'live'; S.phaseT = 74;
  if (kind === 'play') {
    S.round = 6; S.score.def = 3; S.score.atk = 2;
    p.money = 3400; p.hp = 78; p.armor = 65; p.hasKit = true;
    p.loadout.primary = makeWeapon('lance'); p.loadout.slot = 'primary';
    p.loadout.primary.ammo = 24;
    p.pos.set(-6.5, 0, 3.5); p.yaw = -Math.PI / 2; p.pitch = 0.01;
    const vex = S.fighters.find(f => f.name === 'Vex');
    vex.pos.set(7.5, 0, 3.4); vex.yaw = Math.PI / 2; vex.hp = 55;
    const mako = S.fighters.find(f => f.name === 'Mako');
    mako.pos.set(13, 0, -4); mako.yaw = Math.PI / 2;
    const bram = S.fighters.find(f => f.name === 'Bram');
    bram.pos.set(-9.5, 0, -2.5); bram.yaw = -Math.PI / 2;
    showBanner('', '', 'info', 0.01);
    FX.showHitmarker(false, false);
    document.getElementById('hitmark').style.opacity = 1;
  } else if (kind === 'buy') {
    S.phase = 'buy'; S.phaseT = CFG.buyTime;
    p.money = 4750;
    p.loadout.primary = makeWeapon('lance'); p.armor = 100;
    p.pos.set(-28, 0, 0); p.yaw = -Math.PI / 2;
    showBanner('', '', 'info', 0.01);
    toggleBuy(true);
  } else if (kind === 'end') {
    S.round = 11; S.score.def = 6; S.score.atk = 4;
    S.phase = 'planted'; S.bomb.state = 'planted'; S.bomb.site = 'B';
    S.bomb.pos = new THREE.Vector3(SITES.B.x, 0, SITES.B.z);
    S.bomb.timer = 12;
    p.pos.set(-15.5, 0, 12.5); p.yaw = Math.PI * 0.78; p.pitch = -0.02;
    p.loadout.primary = makeWeapon('lance'); p.loadout.slot = 'primary';
    const pike = S.fighters.find(f => f.name === 'Pike');
    pike.alive = false; pike.hp = 0; pike.pos.set(-20, 0, 19);
    const sable = S.fighters.find(f => f.name === 'Sable');
    sable.alive = false; sable.hp = 0; sable.pos.set(-25.5, 0, 13.5);
    showBanner('Wardens win the round', 'The charge was defused.', 'win', 3600);
  }
  // settle the staged frame: a few steps so meshes, shadows and HUD agree
  for (let i = 0; i < 8; i++) {
    for (const f of S.fighters) if (!f.isPlayer) updateBot(f, CFG.step);
  }
  syncViewModel(p);
  updateCamera(p, 0.05);
  updateHUD(0.05);
}

const shotKind = new URLSearchParams(location.search).get('shot');
if (shotKind) stageShot(shotKind);

// Test hook: lets a headless browser drive and inspect a match while
// play-testing (the same handle the screenshot staging above uses).
window.__coldstore = { S, CFG, startMatch, nav: { EDGES, findPath, nearestNode } };

// ---- frame loop ------------------------------------------------------------------
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S.shot) {                       // staged stills: render, never advance
    if (S.shot === 'menu') menuCamera(now / 1000);
    renderer.render(scene, camera);
    return;
  }
  if (S.mode === 'match' && !S.paused) {
    acc += dt;
    while (acc >= CFG.step) { stepSim(CFG.step); acc -= CFG.step; }
    if (pressed('KeyG') && S.player.alive && (S.phase === 'live' || S.phase === 'planted')) {
      throwSelectedGrenade(S.player);
    }
    syncViewModel(S.player);
    updateCamera(S.player, dt);
  } else {
    menuCamera(now / 1000);
  }
  updateBombVisual();
  FX.updateFX(dt);
  updateHUD(dt);
  endFrame();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
