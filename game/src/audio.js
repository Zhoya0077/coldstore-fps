// audio.js — every sound is synthesized with WebAudio at play time: no audio
// files, nothing to load, nothing borrowed. Short noise bursts and filtered
// oscillators are enough for gunfire, and a tiny formant-ish blip stands in
// for radio callouts (pitch differs per team so you can tell who is talking).

let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

export function audioReady() { return !!ctx; }

function env(gain, t0, a, peak, d) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function noiseBuffer(seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
let sharedNoise = null;

// dist: 0 = at the listener, 1 = far edge of the map. Far shots are quieter
// and darker, which is also how the bots' hearing model feels, roughly.
export function shot(kind, dist = 0) {
  if (!ctx) return;
  if (!sharedNoise) sharedNoise = noiseBuffer(0.5);
  const t0 = ctx.currentTime;
  const vol = kind === 'sniper' ? 0.85 : kind === 'shotgun' ? 0.8 : 0.55;
  const v = vol * (1 - dist * 0.75);
  if (v <= 0.02) return;
  const src = ctx.createBufferSource(); src.buffer = sharedNoise;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass';
  filt.frequency.value = (kind === 'pistol' ? 3800 : 2600) * (1 - dist * 0.55);
  const g = ctx.createGain(); env(g, t0, 0.004, v, kind === 'sniper' ? 0.28 : 0.13);
  const crack = ctx.createOscillator(); crack.type = 'square';
  crack.frequency.setValueAtTime(kind === 'sniper' ? 220 : 160, t0);
  crack.frequency.exponentialRampToValueAtTime(48, t0 + 0.07);
  const cg = ctx.createGain(); env(cg, t0, 0.002, v * 0.5, 0.07);
  src.connect(filt).connect(g).connect(master);
  crack.connect(cg).connect(master);
  src.start(t0); src.stop(t0 + 0.4); crack.start(t0); crack.stop(t0 + 0.1);
}

export function dryFire() { blip(1900, 0.03, 0.12, 'square'); }
export function reloadStart() { blip(700, 0.04, 0.15, 'square'); setTimeout(() => blip(420, 0.04, 0.15, 'square'), 130); }
export function reloadEnd() { setTimeout(() => blip(980, 0.05, 0.18, 'square'), 60); }
export function hitmarker(kill) { blip(kill ? 620 : 1150, 0.045, 0.2, 'sine'); }
export function hurt() { blip(140, 0.12, 0.25, 'sawtooth'); }
export function step(run) { blip(run ? 190 : 150, 0.03, 0.05, 'triangle'); }
export function jumpLand() { blip(110, 0.06, 0.12, 'triangle'); }
export function throwWhoosh() { blip(500, 0.16, 0.1, 'sine'); }

export function explosion(big = true) {
  if (!ctx) return;
  if (!sharedNoise) sharedNoise = noiseBuffer(0.5);
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = sharedNoise;
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass';
  filt.frequency.setValueAtTime(900, t0);
  filt.frequency.exponentialRampToValueAtTime(60, t0 + 0.9);
  const g = ctx.createGain(); env(g, t0, 0.008, big ? 1.0 : 0.5, big ? 1.1 : 0.5);
  src.connect(filt).connect(g).connect(master);
  src.start(t0); src.stop(t0 + 1.3);
  const sub = ctx.createOscillator(); sub.type = 'sine';
  sub.frequency.setValueAtTime(90, t0);
  sub.frequency.exponentialRampToValueAtTime(30, t0 + 0.8);
  const sg = ctx.createGain(); env(sg, t0, 0.01, 0.7, 0.9);
  sub.connect(sg).connect(master); sub.start(t0); sub.stop(t0 + 1);
}

export function beep(freq = 880, dur = 0.07, vol = 0.16) { blip(freq, dur, vol, 'square'); }
export function plantBeep(n) { blip(n >= 3 ? 1320 : 880, 0.06, 0.16, 'square'); }
export function defuseDone() { blip(660, 0.09, 0.2, 'square'); setTimeout(() => blip(990, 0.12, 0.2, 'square'), 110); }
export function roundSting(win) {
  if (!ctx) return;
  const notes = win ? [392, 523, 659] : [330, 262, 196];
  notes.forEach((f, i) => setTimeout(() => blip(f, 0.22, 0.16, 'triangle'), i * 130));
}

// Radio callout: two quick syllable blips. Team sets the base pitch — Wardens
// low and calm, Runners higher and faster — so ears learn who is speaking.
export function callout(team) {
  if (!ctx) return;
  const base = team === 'def' ? 300 : 430;
  blip(base, 0.07, 0.1, 'sawtooth');
  setTimeout(() => blip(base * 1.18, 0.09, 0.1, 'sawtooth'), 90);
  setTimeout(() => blip(base * 0.94, 0.06, 0.08, 'sawtooth'), 210);
}

function blip(freq, dur, vol, type) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); env(g, t0, 0.006, vol, dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
