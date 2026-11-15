// hud.js — every DOM element the player reads: health, armour, ammo, money,
// the clock and score, the killfeed, the buy menu, the scoreboard, banners
// and the radar. It renders from S on each frame; it never keeps score or
// money of its own.

import { CFG, S, TEAM, TEAM_NAME, clamp, aliveCount } from './state.js';
import { COLLIDERS, SITES } from './map.js';
import { input, pressed } from './input.js';
import { currentWeapon, WEAPONS, GRENADES, ARMOR_PRICE, KIT_PRICE } from './weapons.js';
import { buyItem, setUIHooks } from './rounds.js';
import * as AU from './audio.js';

const $ = (id) => document.getElementById(id);
const els = {};
let bannerUntil = 0, lastFeedKey = '', mapT = 0;
S.buyOpen = false;

const BUY_LIST = [
  { item: 'lance', key: 'Digit1', desc: 'Full-auto rifle — the round winner' },
  { item: 'wasp', key: 'Digit2', desc: 'Fast SMG for close halls' },
  { item: 'needle', key: 'Digit3', desc: 'Bolt-action, scoped, one-shot stops' },
  { item: 'armor', key: 'Digit4', desc: 'Vest — soaks 45% of every hit' },
  { item: 'kit', key: 'Digit5', desc: 'Defuse kit — halves defuse time' },
  { item: 'frag', key: 'Digit6', desc: 'Shard grenade — clears corners' },
  { item: 'flash', key: 'Digit7', desc: 'Dazzler — blinds a held angle' },
  { item: 'smoke', key: 'Digit8', desc: 'Veil canister — cuts a sightline' },
];
function buyDef(item) {
  if (WEAPONS[item]) return WEAPONS[item];
  if (GRENADES[item]) return GRENADES[item];
  if (item === 'armor') return { name: 'Kevlar Vest', price: ARMOR_PRICE };
  return { name: 'Defuse Kit', price: KIT_PRICE };
}
function buyOwned(f, item) {
  const L = f.loadout;
  if (WEAPONS[item]) return L[WEAPONS[item].slot] && L[WEAPONS[item].slot].def.id === item;
  if (GRENADES[item]) return L.grenades[item] >= GRENADES[item].max;
  if (item === 'armor') return f.armor >= 100;
  return f.hasKit;
}

export function initHUD() {
  for (const id of ['hud', 'cross', 'hp', 'hpfill', 'armor', 'kit', 'weaponname', 'ammo', 'money', 'slots',
    'clock', 'phase', 'scoredef', 'scoreatk', 'alivedef', 'aliveatk', 'roundval', 'feed', 'bigmsg', 'submsg',
    'buy', 'buymoney', 'buygrid', 'buyprompt', 'interact', 'interacttext', 'progfill', 'scoreboard', 'sbbody', 'sbtitle']) {
    els[id] = $(id);
  }
  els.buygrid.innerHTML = BUY_LIST.map((b, i) => {
    const d = buyDef(b.item);
    return `<div class="buyitem" id="buy-${b.item}"><span class="key">${i + 1}</span>` +
      `<div class="nm">${d.name}</div><div class="ds">${b.desc}</div><div class="pr">$${d.price}</div></div>`;
  }).join('');
  // the cards buy with a click too, not only with their number keys
  for (const b of BUY_LIST) {
    $('buy-' + b.item).addEventListener('click', () => {
      if (!S.buyOpen) return;
      if (buyItem(S.player, b.item)) { AU.beep(760, 0.05, 0.12); refreshBuyGrid(); }
    });
  }
  setUIHooks({
    banner: (title, sub, kind, dur) => showBanner(title, sub, kind, dur),
    matchEnd: () => showMatchEnd(),
  });
}

export function showBanner(title, sub, kind, dur) {
  els.bigmsg.textContent = title;
  els.bigmsg.className = kind || 'info';
  els.submsg.textContent = sub || '';
  bannerUntil = performance.now() / 1000 + (dur || 0);
}

function showMatchEnd() {
  const w = S.matchWinner;
  $('matchend').classList.remove('hidden');
  $('menu').classList.add('hidden');
  $('endtitle').textContent = w === null ? 'DRAW' : TEAM_NAME[w].toUpperCase() + ' WIN';
  $('endsub').textContent = w === TEAM.DEF ? 'The depot holds.' : w === TEAM.ATK ? 'The depot has fallen.' : 'Honours even.';
  const st = S.stats;
  $('endstats').textContent =
    `Final score ${S.score.def} — ${S.score.atk}. Your line: ${st.kills} kills, ${st.deaths} deaths, ` +
    `${st.headshots} headshots, ${st.defuses} defuses. Accuracy ${st.shots ? Math.round(100 * st.hits / st.shots) : 0}%.`;
  document.exitPointerLock && document.exitPointerLock();
}

export function toggleBuy(force) {
  S.buyOpen = force !== undefined ? force : !S.buyOpen;
  if (S.buyOpen && S.phase !== 'buy') S.buyOpen = false;
  els.buy.classList.toggle('hidden', !S.buyOpen);
  if (S.buyOpen) refreshBuyGrid();
}
function refreshBuyGrid() {
  const f = S.player;
  els.buymoney.textContent = '$' + f.money;
  for (const b of BUY_LIST) {
    const el = $('buy-' + b.item);
    const owned = buyOwned(f, b.item);
    el.classList.toggle('owned', owned);
    el.classList.toggle('cant', !owned && f.money < buyDef(b.item).price);
    el.querySelector('.pr').textContent = owned ? 'Owned' : '$' + buyDef(b.item).price;
  }
}

function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

export function updateHUD(dt) {
  const f = S.player;
  if (!f) return;
  const inMatch = S.mode === 'match';
  els.hud.classList.toggle('hidden', !inMatch);
  els.cross.classList.toggle('hidden', !inMatch || !f.alive || f.scoped || S.buyOpen);
  if (!inMatch) return;

  // buy menu keys
  if (pressed('KeyB') && S.phase === 'buy') toggleBuy();
  if (S.buyOpen) {
    if (S.phase !== 'buy') toggleBuy(false);
    else {
      for (const b of BUY_LIST) {
        if (pressed(b.key)) { if (buyItem(f, b.item)) { AU.beep(760, 0.05, 0.12); refreshBuyGrid(); } break; }
      }
      if (pressed('Escape')) toggleBuy(false);
    }
  }
  els.buyprompt.classList.toggle('hidden', !(S.phase === 'buy' && !S.buyOpen && f.alive));

  // vitals
  els.hp.textContent = Math.ceil(f.hp);
  els.hp.classList.toggle('low', f.hp <= 30);
  els.hpfill.style.width = clamp(f.hp, 0, 100) + '%';
  els.armor.textContent = Math.ceil(f.armor);
  els.kit.textContent = f.hasKit ? 'Yes' : '—';

  // weapon and money
  const w = currentWeapon(f);
  if (f.loadout.slot === 'grenade') {
    els.weaponname.textContent = GRENADES[f.loadout.grenadeSel].name;
    els.ammo.innerHTML = f.loadout.grenades[f.loadout.grenadeSel] + ' <span class="res">grenade</span>';
    els.ammo.classList.remove('low');
  } else if (w) {
    els.weaponname.textContent = w.def.name + (f.reloadT > 0 ? ' — reloading' : '');
    els.ammo.innerHTML = w.ammo + ' <span class="res">/ ' + w.reserve + '</span>';
    els.ammo.classList.toggle('low', w.ammo <= Math.ceil(w.def.mag * 0.25));
  }
  els.money.textContent = '$' + f.money;
  const g = f.loadout.grenades;
  els.slots.innerHTML =
    `<b>1</b> ${f.loadout.primary ? f.loadout.primary.def.name : '—'} · <b>2</b> P9 · ` +
    `<b>G</b> frag ${g.frag} · flash ${g.flash} · smoke ${g.smoke}`;

  // clock, phase, score
  const planted = S.phase === 'planted';
  els.clock.textContent = planted ? fmtClock(S.bomb.timer) : fmtClock(S.phaseT);
  els.clock.classList.toggle('low', !planted && S.phase === 'live' && S.phaseT <= 10);
  els.clock.classList.toggle('planted', planted);
  els.phase.textContent = S.phase === 'buy' ? 'Buy phase' : planted ? 'Charge planted'
    : S.phase === 'live' ? 'Round ' + S.round : S.phase === 'end' ? 'Round over' : '';
  els.scoredef.textContent = S.score.def;
  els.scoreatk.textContent = S.score.atk;
  els.alivedef.textContent = aliveCount(TEAM.DEF);
  els.aliveatk.textContent = aliveCount(TEAM.ATK);
  els.roundval.textContent = S.round + ' / ' + CFG.maxRounds + ' · first to ' + CFG.winTarget;

  // crosshair spread follows the real accuracy model
  const speed = Math.hypot(f.vel.x, f.vel.z);
  const gap = 5 + f.bloom * 2.2 + speed * 1.5 + (f.grounded ? 0 : 7);
  els.cross.style.setProperty('--gap', gap.toFixed(1) + 'px');

  // killfeed (rebuilt only when it changes)
  const key = S.feed.length + ':' + (S.feed.length ? S.feed[S.feed.length - 1].t : 0);
  if (key !== lastFeedKey) {
    lastFeedKey = key;
    els.feed.innerHTML = S.feed.filter(r => S.time - r.t < 6).map(r => r.text).join('<br>');
  }

  // banner lifetime
  if (bannerUntil && performance.now() / 1000 > bannerUntil) {
    bannerUntil = 0;
    els.bigmsg.textContent = ''; els.submsg.textContent = '';
  }

  // centre prompt: the pause hint wins, then the defuse prompt
  const bp = S.bomb.pos;
  const nearBomb = planted && bp && f.alive && Math.hypot(f.pos.x - bp.x, f.pos.z - bp.z) < 2.3;
  els.interact.classList.toggle('hidden', !(S.paused || nearBomb));
  if (S.paused) {
    els.interacttext.textContent = 'Paused — click the game to resume';
    els.progfill.style.width = '0%';
  } else if (nearBomb) {
    els.interacttext.textContent = S.defusing ? 'Defusing…' : 'Hold to defuse the charge';
    els.progfill.style.width = Math.round((S.defuseFrac || 0) * 100) + '%';
  }

  // scoreboard while Tab is held
  const sb = input.keys.has('Tab');
  els.scoreboard.classList.toggle('hidden', !sb);
  if (sb) buildScoreboard();

  // radar at 12 Hz
  mapT -= dt;
  if (mapT <= 0) { mapT = 1 / 12; drawMinimap(f); }
}

function buildScoreboard() {
  const rows = [...S.fighters].sort((a, b) =>
    (a.team === b.team ? b.kills - a.kills : a.team === 'def' ? -1 : 1));
  els.sbtitle.textContent = `Coldstore — Wardens ${S.score.def} · Runners ${S.score.atk}`;
  els.sbbody.innerHTML = '<table><tr><th>Player</th><th>Team</th><th>K</th><th>D</th><th>Money</th></tr>' +
    rows.map(x => `<tr class="${x.alive ? '' : 'dead'}"><td>${x.name}${x.isPlayer ? ' (you)' : ''}</td>` +
      `<td class="${x.team}">${TEAM_NAME[x.team]}</td><td>${x.kills}</td><td>${x.deaths}</td><td>$${x.money}</td></tr>`).join('') +
    '</table>';
}

function drawMinimap(f) {
  const cv = $('minimap');
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const mx = (x) => (x + 35) / 70 * W, mz = (z) => (z + 27) / 54 * H;
  g.fillStyle = '#0d141a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#3d4f5e';
  for (const c of COLLIDERS) {
    if (c.maxY < 1) continue;
    g.fillRect(mx(c.minX), mz(c.minZ), Math.max(1, (c.maxX - c.minX) / 70 * W), Math.max(1, (c.maxZ - c.minZ) / 54 * H));
  }
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    g.fillStyle = key === 'A' ? '#7fd4ff' : '#ffb648';
    g.beginPath(); g.arc(mx(s.x), mz(s.z), 4, 0, 7); g.fill();
  }
  if (S.bomb.pos && S.bomb.state !== 'carried') {
    g.fillStyle = '#ff5348';
    g.fillRect(mx(S.bomb.pos.x) - 3, mz(S.bomb.pos.z) - 3, 6, 6);
  }
  for (const x of S.fighters) {
    if (!x.alive) continue;
    if (x.team === TEAM.ATK && S.time - (x.lastShotAt || -99) > 3 && x !== f) continue; // radar shows Runners only as they fire
    g.fillStyle = x.isPlayer ? '#ffffff' : x.team === 'def' ? '#7fd4ff' : '#ffb648';
    g.beginPath(); g.arc(mx(x.pos.x), mz(x.pos.z), x.isPlayer ? 3.4 : 2.6, 0, 7); g.fill();
  }
  // view cone for the player
  g.strokeStyle = 'rgba(255,255,255,.5)';
  g.beginPath();
  g.moveTo(mx(f.pos.x), mz(f.pos.z));
  const a = Math.atan2(-Math.cos(f.yaw), -Math.sin(f.yaw));
  g.arc(mx(f.pos.x), mz(f.pos.z), 13, a - 0.5, a + 0.5);
  g.closePath(); g.stroke();
}
