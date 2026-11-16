// Keyboard and mouse state, plus pointer-lock mouse look.
// The game reads `state` every simulation step; menus read the edge
// triggers (keys pressed since the last step) via consumePress().
export function createInput(domElement) {
  const state = {
    forward: false, back: false, left: false, right: false,
    jump: false, crouch: false, walk: false, reload: false,
    firing: false, aiming: false,
    yaw: 0, pitch: 0,
    locked: false,
  };
  const pressed = new Set();
  const watched = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
    'ControlLeft', 'KeyC', 'KeyR', 'KeyB', 'KeyE', 'KeyF', 'Tab',
    'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
    'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad6',
  ]);

  function setKey(code, down) {
    switch (code) {
      case 'KeyW': state.forward = down; break;
      case 'KeyS': state.back = down; break;
      case 'KeyA': state.left = down; break;
      case 'KeyD': state.right = down; break;
      case 'Space': state.jump = down; break;
      case 'ShiftLeft': case 'ShiftRight': state.walk = down; break;
      case 'ControlLeft': case 'KeyC': state.crouch = down; break;
      case 'KeyR': state.reload = down; break;
      default: break;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (watched.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      setKey(e.code, true);
      pressed.add(e.code);
    }
  });
  window.addEventListener('keyup', (e) => setKey(e.code, false));
  window.addEventListener('blur', () => {
    for (const code of watched) setKey(code, false);
    state.firing = false;
    state.aiming = false;
    pressed.clear();
  });

  domElement.addEventListener('mousedown', (e) => {
    if (!state.locked) return;
    if (e.button === 0) state.firing = true;
    if (e.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.firing = false;
    if (e.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === domElement;
    if (!state.locked) {
      state.firing = false;
      state.aiming = false;
    }
  });
  document.addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    const sens = 0.0021;
    state.yaw -= e.movementX * sens;
    state.pitch -= e.movementY * sens;
    const lim = Math.PI / 2 - 0.01;
    state.pitch = Math.max(-lim, Math.min(lim, state.pitch));
  });

  return {
    state,
    lock() { domElement.requestPointerLock(); },
    consumePress(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    clearPresses() { pressed.clear(); },
  };
}
