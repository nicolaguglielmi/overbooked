/* input.js: keyboard, pointer (tap / hold) and gamepad -> per-organizer
 * inputs for the sim. Two gestures on touch: TAP to go, HOLD to work. */
"use strict";

(function () {
  const HOLD_MS = 200;

  const I = {
    keys: new Set(),
    pointerHold: false,
    pending: {},          // orgId -> cmds[]
    activeOrg: "p1",      // who the mouse/touch drives
    bindings: {},         // orgId -> "wasd" | "arrows" | "pointer"
    press: null,
    onPick: null,         // (logicalX, logicalY) -> handled by main
    enabled: false,
  };

  const KEYMAP = {
    wasd: { up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"], hold: ["Space"], tools: ["Digit1", "Digit2", "Digit3", "Digit4"] },
    arrows: { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"], hold: ["Enter", "NumpadEnter", "ShiftRight", "Numpad0"], tools: ["Digit7", "Digit8", "Digit9", "Digit0"] },
  };

  function attach(canvas) {
    window.addEventListener("keydown", (e) => {
      if (!I.enabled) return;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      I.keys.add(e.code);
      // tool keys at the box
      for (const [org, bind] of Object.entries(I.bindings)) {
        const km = KEYMAP[bind === "pointer" ? "wasd" : bind];
        if (!km) continue;
        const idx = km.tools.indexOf(e.code);
        if (idx >= 0) {
          const tool = Object.keys(DF.TOOLS)[idx];
          queue(org, { c: "take", tool });
        }
      }
    });
    window.addEventListener("keyup", (e) => I.keys.delete(e.code));
    window.addEventListener("blur", () => { I.keys.clear(); I.pointerHold = false; I.press = null; });

    canvas.addEventListener("pointerdown", (e) => {
      if (!I.enabled) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released */ }
      I.press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), held: false };
      clearTimeout(I.press.timer);
      I.press.timer = setTimeout(() => { if (I.press && !I.press.moved) { I.press.held = true; I.pointerHold = true; } }, HOLD_MS);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!I.press || I.press.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - I.press.x, e.clientY - I.press.y) > 14) I.press.moved = true;
    });
    const up = (e) => {
      if (!I.press || I.press.id !== e.pointerId) return;
      clearTimeout(I.press.timer);
      const wasHold = I.press.held;
      I.pointerHold = false;
      const p = I.press;
      I.press = null;
      if (!wasHold && I.onPick) {
        const [lx, ly] = DF.Render.toLogical(p.x, p.y);
        I.onPick(lx, ly);
      }
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", (e) => { if (I.press && I.press.id === e.pointerId) { clearTimeout(I.press.timer); I.press = null; I.pointerHold = false; } });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function queue(org, cmd) { (I.pending[org] || (I.pending[org] = [])).push(cmd); }

  function dirFor(bind) {
    const km = KEYMAP[bind];
    if (!km) return null;
    const has = (arr) => arr.some((k) => I.keys.has(k));
    let dx = 0, dy = 0;
    if (has(km.left)) dx -= 1;
    if (has(km.right)) dx += 1;
    if (has(km.up)) dy -= 1;
    if (has(km.down)) dy += 1;
    return dx || dy ? [dx, dy] : null;
  }

  function holdFor(bind) {
    const km = KEYMAP[bind];
    return km ? km.hold.some((k) => I.keys.has(k)) : false;
  }

  function gamepadInput(idx) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[idx];
    if (!gp) return null;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const dz = 0.25;
    let dir = Math.hypot(ax, ay) > dz ? [ax, ay] : null;
    const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    if (!dir) { let dx = 0, dy = 0; if (b(14)) dx -= 1; if (b(15)) dx += 1; if (b(12)) dy -= 1; if (b(13)) dy += 1; if (dx || dy) dir = [dx, dy]; }
    return { dir, hold: b(0) || b(7) };
  }

  // Build this frame's inputs for every locally controlled organizer.
  function collect(localOrgs) {
    const out = {};
    localOrgs.forEach((org, i) => {
      const bind = I.bindings[org] || "wasd";
      let dir = null, hold = false;
      if (bind === "wasd" || bind === "arrows") { dir = dirFor(bind); hold = holdFor(bind); }
      // in solo the arrows also drive the player
      if (localOrgs.length === 1) { dir = dir || dirFor("arrows"); hold = hold || holdFor("arrows"); }
      const gp = gamepadInput(i);
      if (gp) { dir = dir || gp.dir; hold = hold || gp.hold; }
      if (org === I.activeOrg && I.pointerHold) hold = true;
      out[org] = { dir, hold, cmds: I.pending[org] || [] };
      delete I.pending[org];
    });
    return out;
  }
  // commands queued for an organizer the game moves (a co-org given an order)
  function take(org) { const c = I.pending[org] || []; delete I.pending[org]; return c; }

  DF.Input = Object.assign(I, { attach, collect, queue, take });
})();
