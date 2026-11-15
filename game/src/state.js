// state.js — the one place the match state lives. Every other module reads
// and writes through S; nothing keeps a private copy of the score, the clock
// or the fighter list, so the HUD, the bots and the round machine can never
// disagree about what is true.

export const CFG = {
  roundTime: 105,        // seconds of live play before the charge window closes
  buyTime: 12,           // seconds of buy / freeze at the top of a round
  endTime: 4.5,          // seconds the round-end banner holds
  bombTime: 40,          // seconds from plant to detonation
  plantTime: 3.2,        // seconds a Runner channels to plant
  defuseTimeKit: 5,      // seconds to defuse holding a kit
  defuseTimeNoKit: 10,   // seconds to defuse bare-handed
  winTarget: 7,          // rounds to win the match
  maxRounds: 12,
  startMoney: 800,
  maxMoney: 16000,
  killReward: 300,
  plantReward: 300,      // to the planter
  teamPlantReward: 350,  // to every Runner when the charge goes down
  winElimination: 2700,
  winObjective: 2900,    // detonation or defuse
  lossBase: 1400,        // losing-team bonus, grows by lossStep per streak
  lossStep: 500,
  lossMax: 3400,
  step: 1 / 120,         // fixed simulation step, seconds
  eyeHeight: 1.62,
  crouchEye: 1.12,
  radius: 0.38,          // fighter capsule radius
  height: 1.8,
  crouchHeight: 1.3,
};

export const TEAM = { DEF: 'def', ATK: 'atk' };
export const TEAM_NAME = { def: 'Wardens', atk: 'Runners' };

export const S = {
  mode: 'menu',          // menu | match | over        (top-level screens)
  phase: 'idle',         // buy | live | planted | end (round machine)
  time: 0,               // match clock, seconds, fixed-step accumulated
  phaseT: 0,             // seconds left in the current phase
  round: 0,
  score: { def: 0, atk: 0 },
  lossStreak: { def: 0, atk: 0 },
  fighters: [],          // every combatant; fighters[0] is the player
  player: null,
  bomb: { state: 'carried', carrier: null, pos: null, site: null, timer: 0, mesh: null },
  feed: [],              // killfeed rows {text, t}
  noises: [],            // gunfire events bots can hear {x, z, t, team, radius}
  smokes: [],            // live smoke clouds {pos, r, until}
  flashes: [],           // (fx owns visuals; state keeps nothing here)
  winner: null,          // team that won the current round
  winReason: '',
  matchWinner: null,
  paused: false,
  shot: null,            // screenshot staging mode (?shot=...) or null
  stats: { kills: 0, deaths: 0, headshots: 0, plants: 0, defuses: 0, shots: 0, hits: 0 },
};

export function resetMatch() {
  S.score.def = 0; S.score.atk = 0;
  S.lossStreak.def = 0; S.lossStreak.atk = 0;
  S.round = 0; S.matchWinner = null;
  S.stats.kills = 0; S.stats.deaths = 0; S.stats.headshots = 0;
  S.stats.plants = 0; S.stats.defuses = 0; S.stats.shots = 0; S.stats.hits = 0;
}

export function aliveCount(team) {
  let n = 0;
  for (const f of S.fighters) if (f.alive && f.team === team) n++;
  return n;
}

export function award(team, amount) {
  for (const f of S.fighters) if (f.team === team) f.money = Math.min(CFG.maxMoney, f.money + amount);
}

export function loseBonus(team) {
  return Math.min(CFG.lossMax, CFG.lossBase + CFG.lossStep * Math.max(0, S.lossStreak[team] - 1));
}

export function pushFeed(text) {
  S.feed.push({ text, t: S.time });
  if (S.feed.length > 6) S.feed.shift();
}

export function hearNoise(x, z, team, radius) {
  S.noises.push({ x, z, t: S.time, team, radius });
  if (S.noises.length > 24) S.noises.shift();
}

// Small shared helpers, kept here so no module grows its own copy.
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
