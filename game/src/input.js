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
  // touch (PUBG-style): analog stick axes, -1..1; y is forward
  touchMove: { x: 0, y: 0 },
  touchSprint: false,
  touchSprintLatch: false,
  touchCrouch: false,
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

// ---- touch controls ---------------------------------------------------------
// The layout follows the mobile-shooter standard (Free Fire / PUBG Mobile):
// a fixed analog stick bottom-left with a sprint button above it, a big
// fire button bottom-right with aim/jump/crouch around it, drag anywhere
// else on the right side to look. Every control feeds the very same
// key/fire state the keyboard and mouse use — the player code never needs
// to know which device is driving.
export function initTouch() {
  const stick = document.getElementById('stick');
  const knob = document.getElementById('stickknob');
  let stickId = null, stickCX = 0, stickCY = 0;
  let lookId = null, lookX = 0, lookY = 0;
  let swapSlot = 'Digit2';

  const hold = (id, on, off) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); el.classList.add('on'); on(); }, { passive: false });
    const end = (e) => { e.preventDefault(); el.classList.remove('on'); off && off(); };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  };
  const tap = (id, fn) => hold(id, fn, null);
  hold('t-fire', () => { input.fireHeld = true; }, () => { input.fireHeld = false; });
  hold('t-aim', () => { input.aimHeld = true; }, () => { input.aimHeld = false; });
  hold('t-use', () => { input.keys.add('KeyE'); }, () => { input.keys.delete('KeyE'); });
  tap('t-jump', () => { input.justPressed.add('Space'); });
  tap('t-reload', () => { input.justPressed.add('KeyR'); });
  tap('t-nade', () => { input.justPressed.add('KeyG'); });
  tap('t-buy', () => { input.justPressed.add('KeyB'); });
  tap('t-swap', () => { input.justPressed.add(swapSlot); swapSlot = swapSlot === 'Digit2' ? 'Digit1' : 'Digit2'; });
  tap('t-crouch', () => {
    input.touchCrouch = !input.touchCrouch;
    document.getElementById('t-crouch').classList.toggle('on', input.touchCrouch);
  });
  tap('t-sprint', () => {
    input.touchSprintLatch = !input.touchSprintLatch;
    document.getElementById('t-sprint').classList.toggle('on', input.touchSprintLatch);
  });

  const onStart = (e) => {
    let claimed = 0;
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('.tbtn, #buy, #menu, #matchend, button')) continue;
      if (t.clientX < window.innerWidth * 0.45 && stickId === null) {
        // the stick base is fixed; the drag vector is measured from its centre
        stickId = t.identifier;
        const r = stick.getBoundingClientRect();
        stickCX = r.left + r.width / 2; stickCY = r.top + r.height / 2;
        stick.classList.add('on');
        claimed++;
      } else if (lookId === null) {
        lookId = t.identifier; lookX = t.clientX; lookY = t.clientY;
        claimed++;
      }
    }
    // Only a touch the game claimed may swallow the event — anything else
    // (menu taps, buttons) must still produce its normal click.
    if (claimed && e.cancelable) e.preventDefault();
  };
  const onMove = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        let dx = t.clientX - stickCX, dy = t.clientY - stickCY;
        const d = Math.hypot(dx, dy), max = 52;
        if (d > max) { dx *= max / d; dy *= max / d; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        input.touchMove.x = dx / max;
        input.touchMove.y = -dy / max;
        input.touchSprint = d > max * 0.92;
      } else if (t.identifier === lookId) {
        input.lookDX += (t.clientX - lookX) * 2.4;
        input.lookDY += (t.clientY - lookY) * 2.4;
        lookX = t.clientX; lookY = t.clientY;
      }
    }
    if (e.cancelable) e.preventDefault();
  };
  const onEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        stickId = null; stick.classList.remove('on');
        knob.style.transform = 'translate(0px, 0px)';
        input.touchMove.x = 0; input.touchMove.y = 0; input.touchSprint = false;
      }
      if (t.identifier === lookId) lookId = null;
    }
  };
  document.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  document.addEventListener('touchcancel', onEnd);
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
