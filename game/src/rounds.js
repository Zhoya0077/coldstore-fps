// rounds.js — the match machine: buy phase, live phase, plant and defuse,
// round and match ends, and the money that flows between them. It owns the
// phase clock in S and every transition, so bots and HUD only ever read the
// phase, never set it.

import * as THREE from 'three';
import { CFG, S, TEAM, TEAM_NAME, clamp, choice, award, loseBonus, aliveCount, pushFeed, resetMatch } from './state.js';
import { SPAWNS, SITES } from './map.js';
import { input } from './input.js';
import { makeFighter, resetFighter } from './fighters.js';
import { makeBot, buildBotMesh, botBuy, assignRoles, BOT_NAMES } from './bots.js';
import { WEAPONS, GRENADES, ARMOR_PRICE, KIT_PRICE, makeWeapon, defaultLoadout, setKillHandler } from './weapons.js';
import * as FX from './fx.js';
import * as AU from './audio.js';

let scene = null;
let defuseProgress = 0, defuseChannelT = 0;
const ui = { banner: () => {}, matchEnd: () => {} };
export function setUIHooks(hooks) { Object.assign(ui, hooks); }

export function setupMatch(s) {
  scene = s;
  const player = makeFighter(TEAM.DEF, 'You', true);
  S.fighters = [player];
  S.player = player;
  for (const name of BOT_NAMES.def) {
    const b = makeBot(TEAM.DEF, name);
    scene.add(buildBotMesh(b));
    S.fighters.push(b);
  }
  for (const name of BOT_NAMES.atk) {
    const b = makeBot(TEAM.ATK, name);
    scene.add(buildBotMesh(b));
    S.fighters.push(b);
  }
  setKillHandler(onKill);
  buildBombMesh();
}

let bombMesh = null, bombLight = null;
function buildBombMesh() {
  bombMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2e3438, roughness: 0.5, metalness: 0.4 }));
  body.position.y = 0.09; bombMesh.add(body);
  bombLight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.07),
    new THREE.MeshBasicMaterial({ color: 0xff3020 }));
  bombLight.position.set(0.1, 0.2, 0); bombMesh.add(bombLight);
  bombMesh.visible = false;
  scene.add(bombMesh);
}

export function startMatch() {
  resetMatch();
  for (const f of S.fighters) {
    f.money = CFG.startMoney;
    f.kills = 0; f.deaths = 0;
    f.loadout = defaultLoadout();
    f.armor = 0; f.hasKit = false;
    f.survived = true;
  }
  S.mode = 'match';
  startRound();
}

function startRound() {
  S.round++;
  S.phase = 'buy';
  S.phaseT = CFG.buyTime;
  S.winner = null; S.winReason = '';
  defuseProgress = 0; defuseChannelT = 0;
  const defSpawns = SPAWNS.def, atkSpawns = SPAWNS.atk;
  let di = 0, ai = 0;
  for (const f of S.fighters) {
    if (!f.survived) {                       // the dead lose their gear
      f.loadout = defaultLoadout();
      f.armor = 0; f.hasKit = false;
    }
    for (const slot of ['primary', 'secondary']) {   // magazines topped up
      const w = f.loadout[slot];
      if (w) { w.ammo = w.def.mag; w.reserve = w.def.reserve; }
    }
    const spawn = f.team === TEAM.DEF ? defSpawns[di++ % defSpawns.length] : atkSpawns[ai++ % atkSpawns.length];
    resetFighter(f, spawn, f.team === TEAM.DEF ? -Math.PI / 2 : Math.PI / 2);
    if (f.mesh) { f.mesh.rotation.z = 0; f.mesh.visible = true; }
  }
  // the charge starts in a Runner's hands
  const atkBots = S.fighters.filter(f => f.team === TEAM.ATK);
  S.bomb.state = 'carried';
  S.bomb.carrier = choice(atkBots);
  S.bomb.pos = null; S.bomb.site = null; S.bomb.timer = 0;
  bombMesh.visible = false;
  assignRoles();
  for (const f of S.fighters) if (!f.isPlayer) botBuy(f);
  ui.banner('Round ' + S.round, S.player.team === TEAM.DEF
    ? 'Hold the sites — the Runners are coming.' : 'Take a site and plant the charge.', 'info', 2.6);
  AU.callout(TEAM.DEF);
}

function onKill(attacker, victim, part) {
  const a = attacker ? attacker.name : 'The depot';
  const head = part === 'head';
  pushFeed(`<span class="kf"><b class="${attacker ? attacker.team : 'def'}">${a}</b> ▸ <b class="${victim.team}">${victim.name}</b>${head ? ' <span class="hs">HEADSHOT</span>' : ''}</span>`);
  if (victim.isPlayer) S.stats.deaths++;
  if (attacker && attacker.isPlayer) { S.stats.kills++; if (head) S.stats.headshots++; }
  if (victim === S.bomb.carrier && S.bomb.state === 'carried') {
    S.bomb.state = 'dropped';
    S.bomb.pos = victim.pos.clone();
    S.bomb.carrier = null;
    bombMesh.position.copy(victim.pos);
    bombMesh.visible = true;
    pushFeed('<span class="kf">The charge is down!</span>');
  }
  if (Math.random() < 0.4) AU.callout(victim.team);
}

function endRound(winner, reason, objective) {
  S.phase = 'end';
  S.phaseT = CFG.endTime;
  S.winner = winner; S.winReason = reason;
  S.score[winner]++;
  const loser = winner === TEAM.DEF ? TEAM.ATK : TEAM.DEF;
  S.lossStreak[winner] = 0;
  S.lossStreak[loser]++;
  award(winner, objective ? CFG.winObjective : CFG.winElimination);
  award(loser, loseBonus(loser));
  for (const f of S.fighters) f.survived = f.alive;
  ui.banner(TEAM_NAME[winner] + ' win the round', reason, winner === TEAM.DEF ? 'win' : 'lose', CFG.endTime - 0.4);
  AU.roundSting(winner === S.player.team);
}

function plantBomb(carrier) {
  const siteKey = carrier.brain.site;
  const site = SITES[siteKey];
  S.phase = 'planted';
  S.bomb.state = 'planted';
  S.bomb.site = siteKey;
  S.bomb.pos = carrier.pos.clone();
  S.bomb.timer = CFG.bombTime;
  carrier.money = Math.min(CFG.maxMoney, carrier.money + CFG.plantReward);
  award(TEAM.ATK, CFG.teamPlantReward);
  bombMesh.position.copy(carrier.pos);
  bombMesh.visible = true;
  pushFeed('<span class="kf">The charge is planted at <b>' + site.label + '</b>!</span>');
  ui.banner('Charge planted', 'Defuse it at ' + site.label + ' — hold E beside it.', 'info', 3);
  AU.plantBeep(3);
  if (carrier.isPlayer) S.stats.plants++;
}

function detonate() {
  FX.bombDetonation(S.bomb.pos);
  bombMesh.visible = false;
  endRound(TEAM.ATK, 'The charge detonated at ' + SITES[S.bomb.site].label + '.', true);
}

function defused(by) {
  if (by.isPlayer) { S.stats.defuses++; by.money = Math.min(CFG.maxMoney, by.money + 300); }
  AU.defuseDone();
  endRound(TEAM.DEF, 'The charge was defused.', true);
}

// The per-step phase machine.
export function updateRounds(dt) {
  if (S.mode !== 'match') return;
  S.time += dt;
  const atkAlive = aliveCount(TEAM.ATK), defAlive = aliveCount(TEAM.DEF);

  if (S.phase === 'buy') {
    S.phaseT -= dt;
    if (S.phaseT <= 0) { S.phase = 'live'; S.phaseT = CFG.roundTime; ui.banner('', '', 'info', 0.1); }
    return;
  }
  if (S.phase === 'end') {
    S.phaseT -= dt;
    if (S.phaseT <= 0) {
      if (S.score.def >= CFG.winTarget || S.score.atk >= CFG.winTarget || S.round >= CFG.maxRounds) {
        S.mode = 'over';
        S.phase = 'idle';
        S.matchWinner = S.score.def === S.score.atk ? null : (S.score.def > S.score.atk ? TEAM.DEF : TEAM.ATK);
        ui.matchEnd();
      } else startRound();
    }
    return;
  }
  // live and planted share elimination checks
  if (defAlive === 0) { endRound(TEAM.ATK, 'The Wardens were eliminated.', false); return; }
  if (atkAlive === 0 && S.phase === 'live') { endRound(TEAM.DEF, 'The Runners were eliminated.', false); return; }

  if (S.phase === 'live') {
    S.phaseT -= dt;
    if (S.phaseT <= 0) { endRound(TEAM.DEF, 'Time expired — the charge never went down.', false); return; }
    // carrier channel finished?
    const carrier = S.bomb.carrier;
    if (S.bomb.state === 'carried' && carrier && carrier.alive && carrier.brain.plantT >= CFG.plantTime) {
      plantBomb(carrier);
      return;
    }
    // dropped charge picked back up
    if (S.bomb.state === 'dropped') {
      for (const f of S.fighters) {
        if (f.team === TEAM.ATK && f.alive && Math.hypot(f.pos.x - S.bomb.pos.x, f.pos.z - S.bomb.pos.z) < 1.7) {
          S.bomb.state = 'carried'; S.bomb.carrier = f; bombMesh.visible = false;
          pushFeed('<span class="kf">' + f.name + ' recovered the charge.</span>');
          break;
        }
      }
    }
    return;
  }
  if (S.phase === 'planted') {
    S.bomb.timer -= dt;
    if (S.bomb.timer <= 0) { detonate(); return; }
    // defuse channel: the player holding E, or a Warden bot in position
    let channeler = null;
    const bp = S.bomb.pos;
    const p = S.player;
    if (p.alive && input.keys.has('KeyE') && Math.hypot(p.pos.x - bp.x, p.pos.z - bp.z) < 2.3) channeler = p;
    if (!channeler) {
      for (const f of S.fighters) {
        if (f.team === TEAM.DEF && !f.isPlayer && f.alive && f.brain.defuseT > 0.1 &&
            Math.hypot(f.pos.x - bp.x, f.pos.z - bp.z) < 2.3) { channeler = f; break; }
      }
    }
    if (channeler) {
      defuseChannelT += dt;
      defuseProgress += dt;
      const need = channeler.hasKit ? CFG.defuseTimeKit : CFG.defuseTimeNoKit;
      S.defuseFrac = clamp(defuseProgress / need, 0, 1);
      S.defusing = true;
      if (defuseProgress >= need) { defused(channeler); return; }
    } else {
      defuseChannelT = 0;
      if (defuseProgress > 0 && S.time - (S.lastChannelAt || 0) > 0.6) defuseProgress = 0;
      S.defusing = false; S.defuseFrac = clamp(defuseProgress / (channeler && channeler.hasKit ? CFG.defuseTimeKit : CFG.defuseTimeNoKit), 0, 1);
    }
    if (channeler) S.lastChannelAt = S.time;
    // beeps quicken as the timer runs down
    const left = S.bomb.timer;
    if (left < 10 && Math.floor(left * 4) !== Math.floor((left + dt) * 4)) AU.plantBeep(left < 3 ? 3 : 1);
  }
}

// Buying, shared by the player's menu and nothing else (bots buy themselves).
export function buyItem(f, item) {
  if (S.phase !== 'buy') return false;
  const L = f.loadout;
  if (WEAPONS[item]) {
    const def = WEAPONS[item];
    if (def.slot === 'primary' && L.primary && L.primary.def.id === item) return false;
    if (f.money < def.price) return false;
    f.money -= def.price;
    L[def.slot] = makeWeapon(item);
    L.slot = def.slot;
    return true;
  }
  if (GRENADES[item]) {
    const def = GRENADES[item];
    if (L.grenades[item] >= def.max || f.money < def.price) return false;
    f.money -= def.price; L.grenades[item]++;
    return true;
  }
  if (item === 'armor') {
    if (f.armor >= 100 || f.money < ARMOR_PRICE) return false;
    f.money -= ARMOR_PRICE; f.armor = 100; return true;
  }
  if (item === 'kit') {
    if (f.hasKit || f.money < KIT_PRICE) return false;
    f.money -= KIT_PRICE; f.hasKit = true; return true;
  }
  return false;
}

export function updateBombVisual() {
  if (!bombMesh || !bombMesh.visible) return;
  const planted = S.bomb.state === 'planted';
  const rate = planted ? (S.bomb.timer < 10 ? 6 : 2) : 2;
  bombLight.material.color.setHex(Math.sin(S.time * rate * Math.PI) > 0 ? 0xff3020 : 0x551008);
}
