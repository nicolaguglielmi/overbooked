/* coach.js: the tutorial. During the day a card stops the game the first
 * time something new happens, and a spotlight on the canvas shows where; on
 * the screens (Countdown, the day before) a short guided tour. Tips already
 * seen are remembered in this browser; the player can switch them off.
 *   DF.Coach.tip(id, spot, opts)   queue a day tip (once ever)
 *   DF.Coach.blocking()            true while a card is open: the day waits
 *   DF.Coach.spot()                what the renderer should light up
 *   DF.Coach.tour(id, steps)       guided tour over DOM elements */
"use strict";

(function () {
  const KEY_SEEN = "ovb_coach_seen", KEY_OFF = "ovb_coach_off";
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const t = (k, v) => DF.t(k, v);

  const C = { queue: [], active: null, seen: new Set(DF.storage.get(KEY_SEEN, []) || []), tourState: null, shown: 0 };

  const on = () => !DF.storage.get(KEY_OFF, false);
  function setOn(v) {
    DF.storage.set(KEY_OFF, !v);
    if (!v) { C.queue = []; closeCard(); endTour(); }
  }
  const seen = (id) => C.seen.has(id);
  function mark(id) { C.seen.add(id); DF.storage.set(KEY_SEEN, [...C.seen]); }
  function reset() { C.seen.clear(); DF.storage.set(KEY_SEEN, []); DF.storage.set(KEY_OFF, false); }

  // texts: coach.<id> = [title, text]; problem tips reuse the problem's name
  function textOf(item) {
    const id = item.id;
    if (id.startsWith("p:")) {
      const type = id.slice(2);
      const extra = t("coach.p." + type);
      const how = extra !== "coach.p." + type ? extra : t("problems." + type + ".how");
      return [t("problems." + type + ".name"), how];
    }
    const pair = t("coach." + id, item.vars);
    if (!Array.isArray(pair)) return [id, ""];
    const fill = (x) => String(x).replace(/\{(\w+)\}/g, (m, k) => (item.vars && item.vars[k] != null ? item.vars[k] : m));
    return [fill(pair[0]), fill(pair[1])];
  }

  // ------------------------------------------------------------ day cards
  function tip(id, spot, opts) {
    opts = opts || {};
    if (!on() || seen(id) || (C.active && C.active.id === id) || C.queue.some((q) => q.id === id)) return false;
    C.queue.push({ id, spot: spot || null, vars: opts.vars || null, icon: opts.icon || null });
    if (!C.active) next();
    else { const m = document.querySelector("#coach .coach-more"); if (m) m.textContent = t("ui.coach.more", { n: C.queue.length }); }
    return true;
  }

  function next() {
    if (C.active) mark(C.active.id);
    C.active = C.queue.shift() || null;
    if (C.active) { C.shown++; showCard(C.active); DF.Audio.play("blip"); }
    else closeCard();
  }

  function blocking() { return !!C.active; }

  // the spot as {x, y, r} or {x, y, w, h} in canvas coordinates (HUD included)
  // where the card points: a HUD rect, or a spot on the map (venue coordinates, map: true)
  function rawSpot() {
    if (!C.active || !C.active.spot) return null;
    const sp = C.active.spot;
    let v = typeof sp === "function" ? sp() : sp;
    if (typeof v === "string" && v.startsWith("rect:")) v = (DF.Render.R.rects || {})[v.slice(5)] || null;
    return v || null;
  }
  // ...on screen now (the camera may have moved)
  function spot() { const v = rawSpot(); return v && v.map ? DF.Render.spotScreen(v) : v; }
  function mapSpot() { const v = rawSpot(); return v && v.map ? v : null; }

  function cardEl() {
    let el = $("#coach");
    if (!el) {
      el = document.createElement("div");
      el.id = "coach";
      el.className = "coach-card";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-live", "polite");
      el.hidden = true;
      document.getElementById("app").appendChild(el);
    }
    return el;
  }

  function showCard(item) {
    const [title, text] = textOf(item);
    const icon = item.icon || (item.id.startsWith("p:") && DF.PROBLEMS[item.id.slice(2)] ? DF.PROBLEMS[item.id.slice(2)].icon : "💡");
    const left = C.queue.length;
    const el = cardEl();
    el.innerHTML = `
      <div class="coach-top"><span class="coach-ico">${icon}</span><div class="coach-txt"><b>${esc(title)}</b><p>${esc(text)}</p></div></div>
      <div class="coach-row">
        <button class="coach-skip" type="button" data-coach-off>${esc(t("ui.coach.off"))}</button>
        <span class="coach-more">${left ? esc(t("ui.coach.more", { n: left })) : ""}</span>
        <button class="btn small go" type="button" data-coach-ok>${esc(t("ui.coach.ok"))} ↵</button>
      </div>`;
    el.hidden = false;
    el.querySelector("[data-coach-ok]").onclick = (e) => { e.stopPropagation(); next(); };
    el.querySelector("[data-coach-off]").onclick = (e) => { e.stopPropagation(); setOn(false); };
    place();
    setTimeout(() => { const b = el.querySelector("[data-coach-ok]"); if (b) b.focus({ preventScroll: true }); }, 30);
  }

  function closeCard() {
    if (C.active) mark(C.active.id);
    C.active = null;
    const el = $("#coach");
    if (el) el.hidden = true;
  }

  // keep the card next to the spot, never on top of it
  function place() {
    const el = $("#coach");
    if (!el || el.hidden) return;
    const cv = DF.Render.R.canvas;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const sx = r.width / DF.W, sy = r.height / DF.H;
    const sp = spot();
    const w = Math.min(360, r.width - 24);
    el.style.width = w + "px";
    const h = el.offsetHeight || 120;
    let x, y;
    if (!sp) { x = r.left + r.width / 2 - w / 2; y = r.top + r.height * 0.38 - h / 2; }
    else {
      const cx = (sp.w != null ? sp.x + sp.w / 2 : sp.x) * sx + r.left;
      const top = (sp.w != null ? sp.y : sp.y - sp.r) * sy + r.top;
      const bottom = (sp.w != null ? sp.y + sp.h : sp.y + sp.r) * sy + r.top;
      x = cx - w / 2;
      y = bottom + 14 + h < r.bottom - 8 && (top - r.top) < r.height * 0.55 ? bottom + 14 : top - 14 - h;
      if (y < r.top + 8) y = Math.min(r.bottom - h - 8, bottom + 14);
    }
    x = Math.max(r.left + 8, Math.min(x, r.right - w - 8));
    el.style.left = Math.round(x) + "px";
    el.style.top = Math.round(Math.max(8, y)) + "px";
  }

  // --------------------------------------------------------- screen tours
  // steps: [{ sel, key }] — the key is coach.<key> = [title, text]
  function tour(id, steps) {
    if (!on() || seen(id) || C.tourState) return false;
    const list = steps.filter((st) => document.querySelector(st.sel));
    if (!list.length) return false;
    C.tourState = { id, steps: list, i: 0 };
    let dim = $("#tour-dim");
    if (!dim) {
      dim = document.createElement("div"); dim.id = "tour-dim"; document.body.appendChild(dim);
      const ring = document.createElement("div"); ring.id = "tour-ring"; document.body.appendChild(ring);
      const bub = document.createElement("div"); bub.id = "tour-bubble"; bub.setAttribute("role", "dialog"); document.body.appendChild(bub);
      window.addEventListener("resize", tourPlace);
      document.addEventListener("scroll", tourPlace, true);
    }
    tourShow();
    return true;
  }

  function tourShow() {
    const ts = C.tourState;
    if (!ts) return;
    const st = ts.steps[ts.i];
    const el = document.querySelector(st.sel);
    if (!el) { tourNext(); return; }
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const [title, text] = textOf({ id: st.key });
    const last = ts.i === ts.steps.length - 1;
    const bub = $("#tour-bubble");
    bub.innerHTML = `<b>${esc(title)}</b><p>${esc(text)}</p>
      <div class="coach-row"><button class="coach-skip" type="button" data-tour-off>${esc(t("ui.coach.off"))}</button><span class="coach-more">${ts.i + 1}/${ts.steps.length}</span><button class="btn small go" type="button" data-tour-ok>${esc(last ? t("ui.coach.done") : t("ui.coach.next"))} ↵</button></div>`;
    bub.querySelector("[data-tour-ok]").onclick = tourNext;
    bub.querySelector("[data-tour-off]").onclick = () => setOn(false);
    for (const x of [$("#tour-dim"), $("#tour-ring"), bub]) x.hidden = false;
    tourPlace();
    setTimeout(() => { const b = bub.querySelector("[data-tour-ok]"); if (b) b.focus({ preventScroll: true }); }, 30);
  }

  function tourPlace() {
    const ts = C.tourState;
    if (!ts) return;
    const el = document.querySelector(ts.steps[ts.i].sel);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 6, x1 = r.left - pad, y1 = r.top - pad, x2 = r.right + pad, y2 = r.bottom + pad;
    const dim = $("#tour-dim"), ring = $("#tour-ring"), bub = $("#tour-bubble");
    dim.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x1}px ${y1}px, ${x2}px ${y1}px, ${x2}px ${y2}px, ${x1}px ${y2}px, ${x1}px ${y1}px)`;
    Object.assign(ring.style, { left: x1 + "px", top: y1 + "px", width: (x2 - x1) + "px", height: (y2 - y1) + "px" });
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(340, vw - 24);
    bub.style.width = w + "px";
    const h = bub.offsetHeight || 120;
    let y = y2 + 12;
    if (y + h > vh - 8) y = y1 - 12 - h;
    if (y < 8) y = Math.max(8, vh - h - 8);
    const x = Math.max(12, Math.min((x1 + x2) / 2 - w / 2, vw - w - 12));
    bub.style.left = Math.round(x) + "px"; bub.style.top = Math.round(y) + "px";
  }

  function tourNext() {
    const ts = C.tourState;
    if (!ts) return;
    ts.i++;
    if (ts.i >= ts.steps.length) { mark(ts.id); endTour(); return; }
    tourShow();
  }

  function endTour() {
    if (C.tourState) mark(C.tourState.id);
    C.tourState = null;
    for (const id of ["#tour-dim", "#tour-ring", "#tour-bubble"]) { const x = $(id); if (x) x.hidden = true; }
  }

  // Enter / Space / Escape move the tutorial on
  window.addEventListener("keydown", (e) => {
    if (!C.active && !C.tourState) return;
    if (e.code === "Enter" || e.code === "Space" || e.code === "NumpadEnter" || e.code === "Escape") {
      e.preventDefault(); e.stopImmediatePropagation();
      if (C.tourState) tourNext(); else next();
    }
  }, true);
  window.addEventListener("resize", place);

  DF.Coach = {
    tip, next, blocking, spot, mapSpot, place, tour, endTour, reset, seen, mark,
    get on() { return on(); }, setOn,
    clear() { C.queue = []; closeCard(); endTour(); },
    get touring() { return !!C.tourState; },
  };
})();
