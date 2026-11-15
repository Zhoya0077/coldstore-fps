// input.js — keyboard and mouse, pointer lock included. Other modules read
// the plain `input` object; justPressed is cleared once per render frame by
// main.js, after every fixed step of that frame has consumed it.

export const input = {
  keys: new Set(),
  justPressed: new Set(),
  lookDX: 0, lookDY: 0,
  fireHeld: false, aimHeld: false,
  locked: false,
  wheel: 0,
};

let canvas = null;

export function initInput(cv) {
  canvas = cv;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!e.repeat) input.justPressed.add(e.code);
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.fireHeld = false; input.aimHeld = false; });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) { input.fireHeld = false; input.aimHeld = false; }
  });
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.lookDX += e.movementX || 0;
    input.lookDY += e.movementY || 0;
  });
  document.addEventListener('mousedown', (e) => {
    if (!input.locked) return;
    if (e.button === 0) input.fireHeld = true;
    if (e.button === 2) input.aimHeld = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.fireHeld = false;
    if (e.button === 2) input.aimHeld = false;
  });
  document.addEventListener('contextmenu', (e) => { if (input.locked) e.preventDefault(); });
  document.addEventListener('wheel', (e) => { if (input.locked) input.wheel += Math.sign(e.deltaY); }, { passive: true });
}

export function requestLock() {
  if (canvas && document.pointerLockElement !== canvas) canvas.requestPointerLock();
}
export function releaseLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}
export function consumeLook() {
  const dx = input.lookDX, dy = input.lookDY;
  input.lookDX = 0; input.lookDY = 0;
  return [dx, dy];
}
export function pressed(code) { return input.justPressed.has(code); }
export function down(code) { return input.keys.has(code); }
export function endFrame() { input.justPressed.clear(); input.wheel = 0; }
