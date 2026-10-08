/* online.js: a room of leads playing together from different places.
 * The host runs the Countdown and the day; guests mirror the host. */
"use strict";

(function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SNAP_EVERY = 0.12; // seconds between day snapshots (~8 Hz)
  const FX_EVENTS = new Set(["spawn", "warn", "points", "fix", "prevent", "escalate", "pickup", "noTool", "talkStart", "talkCancel", "break", "lunch", "murphy", "murphyCaught", "sabotage", "burnout", "raffle", "photo", "synergy", "backup", "improvised", "leave", "stream", "found", "assign"]);

  const O = {
    t: null, code: null, me: null, isHost: false, profile: null, chapter: "",
    players: {},          // id -> {id, name, role}
    prep: null,           // host: prep state
    view: null,           // guest: last published prep view
    run: null,
    evSeq: 0, evBuf: [], snapAcc: 0,
    lastInput: "", inputAt: 0,
    active: false,
  };

  function profileOf() { return { name: O.profile.name, role: O.profile.role }; }

  // ------------------------------------------------------------- rooms
  async function create(profile, chapter, event) {
    O.t = DF.Net.pickTransport();
    if (!O.t) throw new Error(DF.t("ui.setup.noRooms"));
    O.profile = profile; O.chapter = chapter; O.event = event || "devfest"; O.isHost = true; O.active = true;
    const r = await O.t.create(profileOf());
    O.code = r.code; O.me = r.me;
    O.t.onPlayers((ps) => { O.players = ps; publishLobby(); renderLobby(); });
    O.t.onMessage(onHostMessage);
    O.t.onInput((from, data) => {
      const ri = DF.Game.remote[from] || (DF.Game.remote[from] = { dir: null, hold: false, cmds: [] });
      ri.dir = data.dir; ri.hold = data.hold;
    });
    publishLobby();
    return O.code;
  }

  async function join(code, profile) {
    O.t = DF.Net.pickTransport();
    if (!O.t) throw new Error(DF.t("ui.setup.noRooms"));
    O.profile = profile; O.isHost = false; O.active = true;
    const r = await O.t.join(code, profileOf());
    O.code = r.code; O.me = r.me;
    O.t.subscribe("lobby", (d) => { O.players = d.players; O.chapter = d.chapter; O.event = d.event; DF.UI.U.setup.chapter = d.chapter; DF.UI.U.setup.event = d.event; if (d.phase === "lobby") { renderLobby(); DF.UI.show("lobby"); } });
    O.t.subscribe("prep", (d) => { O.view = d; DF.UI.U.ctl = guestCtl; if (!$("#screen-prep").hidden || d.fresh) DF.UI.show("prep"); DF.UI.renderPrep(); });
    O.t.subscribe("run", (d) => { O.run = d; if (d.phase === "loadout") { DF.UI.renderLoadout(d, { guest: true }); DF.UI.show("loadout"); } });
    O.t.subscribe("snap", onSnapshot);
    O.t.subscribe("retro", (d) => DF.Game.guestRetro(d));
    O.t.subscribe("gazette", (g) => DF.UI.guestGazette && DF.UI.guestGazette(g));
    O.t.onHostGone(() => { leave(); DF.Game.quitToTitle(); setTimeout(() => alertBox(DF.t("ui.lobby.gone")), 50); });
    return O.code;
  }

  function leave() {
    if (O.t) try { O.t.leave(); } catch (e) { /* closing anyway */ }
    O.t = null; O.active = false; O.prep = null; O.view = null;
    DF.Game.online = null;
  }

  function alertBox(text) {
    const el = $("#screen-title");
    if (!el) return;
    const n = document.createElement("div");
    n.className = "toast alert"; n.style.position = "absolute"; n.style.top = "16px"; n.style.left = "50%"; n.style.transform = "translateX(-50%)";
    n.textContent = text;
    el.appendChild(n);
    setTimeout(() => n.remove(), 4000);
  }

  function publishLobby() {
    if (!O.isHost || !O.t) return;
    O.t.publish("lobby", { players: O.players, chapter: O.chapter, event: O.event, phase: DF.Game.phase === "day" ? "day" : "lobby" });
  }

  // -------------------------------------------------------------- lobby
  function renderLobby() {
    const el = $("#screen-lobby");
    if (!el) return;
    const list = Object.values(O.players);
    const t = DF.t;
    const spr = (r) => (DF.SPRITE_DATA && DF.SPRITE_DATA[DF.ROLES[r].sprite]) || "assets/sprites/" + DF.ROLES[r].sprite + "." + (window.DF_SPRITE_EXT || "png");
    el.innerHTML = `
      <div class="sheet narrow">
        <div class="lanyard" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="eyebrow">${esc(t("ui.lobby.eyebrow", { via: O.t ? O.t.label : "" }))} · ${esc(t("events." + (O.event || "devfest") + ".name"))}</div>
        <h2>${esc(t("ui.lobby.code"))} <span style="font-family:var(--mono);letter-spacing:.14em;color:var(--brand)">${esc(O.code)}</span></h2>
        <p>${esc(O.isHost ? t("ui.lobby.host") : t("ui.lobby.guest"))}</p>
        <div class="loadout">${list.map((p) => `<div class="lo-item"><img src="${spr(DF.ROLES[p.role] ? p.role : "lead")}" alt=""><span>${esc(p.name)} · ${esc(t("roles." + (DF.ROLES[p.role] ? p.role : "lead") + ".name"))}${p.id === O.me ? " (" + esc(t("ui.lobby.you")) + ")" : ""}</span></div>`).join("")}</div>
        ${O.t && O.t.kind === "firebase" ? `<p class="record">🛡️ ${esc(t("ui.lobby.recaptcha"))} <a href="https://policies.google.com/privacy" target="_blank" rel="noopener" style="color:#ffe68a">Privacy</a> · <a href="https://policies.google.com/terms" target="_blank" rel="noopener" style="color:#ffe68a">${esc(t("ui.lobby.terms"))}</a></p>` : ""}
        <div class="row end">
          <button class="btn ghost" id="o-leave">${esc(t("ui.lobby.leave"))}</button>
          ${O.isHost ? `<button class="btn ghost" id="o-copy">${esc(t("ui.lobby.copy"))}</button><button class="btn go" id="o-start" data-autofocus ${list.length > 4 ? "disabled" : ""}>${esc(t("ui.lobby.start"))} →</button>` : ""}
        </div>
      </div>`;
    $("#o-leave").onclick = () => { leave(); DF.UI.show("title"); };
    const cp = $("#o-copy");
    if (cp) cp.onclick = () => {
      const shown = () => { cp.textContent = O.code; }; // clipboard refused: show the code to copy by hand
      try { navigator.clipboard.writeText(O.code).then(() => { cp.textContent = t("ui.lobby.copied"); }, shown); } catch (e) { shown(); }
    };
    const st = $("#o-start");
    if (st) st.onclick = () => hostStartPrep();
  }

  // ----------------------------------------------------- host: Countdown
  function members() {
    return Object.values(O.players).slice(0, 4).map((p) => ({ id: p.id, role: p.role, name: p.name }));
  }

  function hostStartPrep() {
    const seed = (Date.now() % 1e9) | 0;
    O.seed = seed;
    O.prep = DF.Prep.createPrep({ seed, players: members(), event: O.event });
    DF.Stats.countdown(O.event, "online");
    O.aiKit = null;
    if (DF.AI.available) DF.AI.dayKit({ event: O.event, chapter: O.chapter, city: DF.UI.U.setup.city }).then((k) => { O.aiKit = k; });
    DF.Prep.deal(O.prep);
    O.mode = "cards"; O.results = null;
    DF.UI.U.ctl = hostCtl;
    DF.UI.renderPrep();
    DF.UI.show("prep");
    publishPrep(true);
    DF.Audio.play("card");
  }

  function prepView() {
    const st = O.prep;
    return {
      round: st.round, rounds: st.rounds, event: st.event, meters: st.meters, members: st.members, picks: st.picks,
      hand: st.hand.map((id) => DF.Prep.cardOf(st, id)), results: O.results, mode: O.mode,
    };
  }
  function publishPrep(fresh) { if (O.t && O.prep) O.t.publish("prep", Object.assign(prepView(), { fresh: !!fresh })); }

  function onHostMessage(from, msg) {
    if (!msg) return;
    switch (msg.t) {
      case "pick": {
        if (!O.prep || O.mode !== "cards") return;
        const r = DF.Prep.toggle(O.prep, msg.card, msg.opt, from);
        if (r.ok) { publishPrep(); DF.UI.renderPrep(); }
        break;
      }
      case "ready": {
        const m = O.prep && O.prep.members.find((q) => q.id === from);
        if (m) { m.ready = !m.ready; publishPrep(); DF.UI.renderPrep(); }
        break;
      }
      case "cmd": {
        const ri = DF.Game.remote[from] || (DF.Game.remote[from] = { dir: null, hold: false, cmds: [] });
        ri.cmds.push(msg.cmd);
        break;
      }
    }
  }

  const hostCtl = {
    online: true, isHost: true,
    get me() { return O.me; }, get code() { return O.code; },
    view() { const v = prepView(); return { st: v, hand: v.hand, results: v.results, mode: v.mode }; },
    toggle(cid, oi) { const r = DF.Prep.toggle(O.prep, cid, oi, O.me); if (r.ok) publishPrep(); return r; },
    ready() {},
    close() {
      O.results = DF.Prep.resolve(O.prep);
      O.prep.members.forEach((m) => { m.ready = false; });
      O.mode = "results";
      publishPrep();
    },
    next() {
      if (O.prep.round >= O.prep.rounds) { hostLoadout(); return false; }
      DF.Prep.deal(O.prep);
      O.mode = "cards";
      publishPrep();
      return true;
    },
  };

  const guestCtl = {
    online: true, isHost: false,
    get me() { return O.me; }, get code() { return O.code; },
    view() { const v = O.view || {}; return { st: v.members ? v : null, hand: v.hand || [], results: v.results, mode: v.mode || "cards" }; },
    toggle(cid, oi) { O.t.send({ t: "pick", card: cid, opt: oi }); return { ok: true }; },
    ready() { O.t.send({ t: "ready" }); },
    close() {}, next() {},
  };

  function hostLoadout() {
    const lo = DF.Prep.loadout(O.prep);
    const players = members().map((p) => Object.assign({}, p, { ctrl: p.id === O.me ? "human" : "remote" }));
    if (lo.coLead) players.push({ id: "co", role: "tech", name: "Co-org", ctrl: "bot" });
    O.run = { mode: "online", event: O.event, players, chapter: O.chapter, city: DF.UI.U.setup.city, loadout: lo, seed: O.seed, phase: "loadout", ai: O.aiKit, prep: 1, venue: DF.venueFor(O.event, DF.UI.U.setup.venue) };
    O.t.publish("run", O.run);
    DF.UI.renderLoadout(O.run, { host: true });
    DF.UI.show("loadout");
  }

  // ------------------------------------------------------------ the day
  function hostStartDay(run) {
    O.evSeq = 0; O.evBuf = []; O.snapAcc = 0;
    O.run = Object.assign({}, run, { phase: "day" });
    O.t.publish("run", O.run);
    publishLobby();
  }

  // called by main after every host tick, with the events of that tick
  function hostTick(s, dt, events) {
    for (const e of events) if (FX_EVENTS.has(e.type)) O.evBuf.push(Object.assign({ n: ++O.evSeq }, e));
    O.snapAcc += dt;
    if (O.snapAcc < SNAP_EVERY && !s.over) return;
    O.snapAcc = 0;
    const cutoff = s.t - 1.5;
    O.evBuf = O.evBuf.filter((e) => e.t >= cutoff);
    O.t.publish("snap", DF.Net.snapshot(s, O.evBuf));
  }

  function onSnapshot(sn) {
    const G = DF.Game;
    if (!O.run || !O.run.players) return;
    if (G.phase !== "day" || !G.mirror) G.startGuestDay(O.run);
    DF.Net.applySnapshot(G.mirror, sn);
  }

  // guest: send our input state when it changes (and a heartbeat), commands at once
  function guestInput(inp) {
    if (!O.t) return;
    for (const c of inp.cmds || []) O.t.send({ t: "cmd", cmd: c });
    const key = JSON.stringify([inp.dir, inp.hold]);
    const now = performance.now();
    if (key !== O.lastInput || now - O.inputAt > 400) {
      O.lastInput = key; O.inputAt = now;
      O.t.setInput({ dir: inp.dir, hold: inp.hold });
    }
  }

  function hostRetro(sum, log, s) {
    if (!O.t) return;
    O.t.publish("retro", { sum, log, run: { chapter: O.run.chapter, city: O.run.city, event: O.run.event, mode: "online" }, flags: s.fl, tools: s.lo.tools || {}, vols: s.vols.length });
  }
  function hostGazette(g) { if (O.t && O.isHost) O.t.publish("gazette", g); }

  DF.Online = { O, create, join, leave, renderLobby, hostStartDay, hostTick, guestInput, hostRetro, hostGazette, get active() { return O.active; }, get isHost() { return O.isHost; }, get me() { return O.me; } };
})();
