/* main.js: boot, the frame loop and the glue between sim, input,
 * renderer, audio, the AI and the screens. */
"use strict";

(function () {
  const STEP = 1 / 60;
  const G = DF.Game = {
    phase: "title",      // title | prep | loadout | day | ending | retro
    sim: null, cfg: null,
    acc: 0, last: 0, paused: false,
    localOrgs: [], botOrgs: [], remoteOrgs: [],
    looks: {}, seenHints: {}, log: [],
    run: null,
    remote: {}, online: null, mirror: null,
    reactAt: 0, reactBusy: false,
  };

  // ------------------------------------------------------------ the day
  // phones: the day wants the whole screen, sideways (Android; iPhone shows the rotate hint)
  function landscape(on) {
    if (!(window.matchMedia && matchMedia("(pointer: coarse)").matches)) return;
    try {
      if (on) {
        const el = document.documentElement;
        const p = !document.fullscreenElement && el.requestFullscreen ? el.requestFullscreen({ navigationUI: "hide" }) : Promise.resolve();
        p.then(() => (screen.orientation && screen.orientation.lock ? screen.orientation.lock("landscape") : null)).catch(() => {});
      } else {
        if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      }
    } catch (e) { /* not supported: the rotate hint covers it */ }
  }

  function startDay(run) {
    landscape(true);
    if (run.weekly) return startWeekly(run);
    // a restart while a day is running: the diary notes how far that one got
    if (G.phase === "day" && G.sim && G.online !== "guest") DF.Stats.quit(G.sim, G.run || {}, G.cfg && G.cfg.daySeconds);
    G.run = run;
    const event = run.event || (run.loadout && run.loadout.event) || "devfest";
    const ev = DF.EVENTS[event];
    const seed = run.seed || ((Date.now() % 1e9) | 0);
    // a kit written in another language (switched mid-Countdown) falls back to the lang pack
    const ai = run.ai && (!run.ai.lang || run.ai.lang === DF.lang || run.mode === "online") ? run.ai : null;
    const banter = ai && Array.isArray(ai.banter) && ai.banter.length >= 6 ? ai.banter : DF.t("banter");
    DF.Render.R.banter = banter;
    // the chapter's kit (not in online rooms: everyone plays the same day)
    const perks = run.mode === "online" ? {} : DF.UI.activePerks();
    // sold-out: 40% more people through the same doors
    const soldout = !!run.soldout && run.mode !== "online";
    const base = soldout ? Object.assign({}, run.loadout, { attendees: Math.round(run.loadout.attendees * 1.4), rsvp: Math.round((run.loadout.rsvp || run.loadout.attendees) * 1.4) }) : run.loadout;
    const loadout = DF.applyPerks(base, perks);
    let players = run.players;
    if (perks.colead && players.length === 1) players = players.concat([{ id: "p2", role: players[0].role === "tech" ? "lead" : "tech", name: "Co-org", ctrl: "bot" }]);
    G.cfg = {
      seed, event, daySeconds: ev.daySeconds, players, loadout, perks, soldout, venue: DF.venueFor(event, run.venue),
      relax: run.mode !== "online" && DF.storage.get("ovb_relax", false),
      chat: DF.Chat.build(event, seed, ai, loadout.flags || {}), banterN: banter.length,
    };
    G.rec = null;
    beginDay(run);
  }

  // everything after the configuration: the sim, who plays what, the first messages
  function beginDay(run) {
    const players = G.cfg.players;
    G.sim = DF.Sim.createDay(G.cfg);
    G.localOrgs = players.filter((p) => p.ctrl !== "bot" && p.ctrl !== "remote").map((p) => p.id);
    G.botOrgs = players.filter((p) => p.ctrl === "bot").map((p) => p.id);
    G.remoteOrgs = players.filter((p) => p.ctrl === "remote").map((p) => p.id);
    G.remote = {};
    G.online = run.mode === "online" ? "host" : null;
    G.mirror = null;
    if (G.online) DF.Online.hostStartDay(run);
    DF.Input.bindings = {};
    G.localOrgs.forEach((id, i) => { DF.Input.bindings[id] = i === 0 ? "wasd" : "arrows"; });
    DF.Input.activeOrg = G.localOrgs[0] || "p1";
    G.seenHints = {}; G.log = [];
    G.paused = false;
    G.reactAt = 40; G.reactBusy = false;
    resetRender();
    DF.UI.show(null);
    G.phase = "day";
    DF.Input.enabled = true;
    DF.Audio.unlock(); DF.Audio.startMusic(); keepAwake(true);
    DF.UI.toast(DF.t(DF.Venue.id === "cowork" ? "venues.cowork.open" : "radio.open"), "info", 6);
    DF.UI.toast(G.localOrgs.length > 1 ? DF.t("radio.controlsDuo") : DF.t("radio.controls"), "info", 6);
    G.coachT = 0;
    coachDayStart(G.sim);
    DF.Stats.dayStart(run, G.cfg.relax);
  }

  // one entry whenever the player's input changes or a command goes out (js/weekly.js replays them)
  function record(inp, mate) {
    const r = G.rec;
    const dir = inp && inp.dir ? [inp.dir[0], inp.dir[1]] : 0, hold = inp && inp.hold ? 1 : 0;
    const key = JSON.stringify([dir, hold]), cmds = inp && inp.cmds && inp.cmds.length ? inp.cmds : 0;
    if (key !== r.key || cmds || mate.length) {
      if (r.log.length < 30000) r.log.push([r.step, dir, hold, cmds ? JSON.parse(JSON.stringify(cmds)) : 0, mate.length ? JSON.parse(JSON.stringify(mate)) : 0]);
      r.key = key;
    }
    r.step++;
  }

  // the weekly challenge: the shared configuration, and every input recorded for the server's replay
  function startWeekly(run) {
    const su = DF.Weekly.setup(run.weekly, run.players[0].role);
    G.run = Object.assign({}, run, { event: su.event, players: su.players, loadout: su.loadout, seed: su.seed, ai: null, soldout: false, mode: "solo" });
    G.cfg = DF.Weekly.config(su);
    DF.Render.R.banter = DF.t("banter");
    G.rec = { week: su.week, role: su.role, log: [], step: 0, key: "" };
    beginDay(G.run);
  }

  // ------------------------------------------------------------ tutorial
  const coachOn = () => G.online === null && DF.Coach.on;
  // spots on the map are in venue coordinates: the renderer puts them on screen through the camera
  function orgSpot(s) { return () => { const o = s.orgs.find((q) => q.id === DF.Input.activeOrg); return o ? { x: o.x, y: o.y - 10, r: 30, map: true } : null; }; }
  function mateSpot(s) { return () => { const o = s.orgs.find((q) => G.botOrgs.includes(q.id)); return o ? { x: o.x, y: o.y - 10, r: 30, map: true } : null; }; }
  function stSpot(id, r) { const st = DF.Venue.STATIONS[id]; return { x: st.px, y: st.py - 6, r: r || 30, map: true }; }
  function problemSpot(s, id) {
    return () => {
      const pr = s.problems.find((p) => p.id === id);
      if (!pr) return null;
      const [x, y] = DF.Sim.anchorOf(s, pr);
      return { x, y: y - 26, r: 34, map: true };
    };
  }

  function coachDayStart(s) {
    if (!coachOn()) return;
    const C = DF.Coach;
    C.tip("welcome", null, { icon: "🎟️" });
    C.tip("you", orgSpot(s), { icon: "🧑‍💻" });
    if (DF.Render.R.zoom > 1) C.tip("map", "rect:mini", { icon: "🗺️" }); // phones: the venue map in the bar
    if (G.botOrgs.length) C.tip("mate", mateSpot(s), { icon: "👉" });
    const me = s.orgs.find((q) => q.id === DF.Input.activeOrg);
    if (me) { const [name, what] = DF.t("abilities." + me.role); C.tip("ability", "rect:ability", { icon: DF.Render.ABILITY_ICON[me.role], vars: { name, what } }); }
    C.tip("checkin", stSpot("checkin", 40), { icon: "🧾" });
    C.tip("goals", "rect:goals", { icon: "🎯", vars: { list: (s.goals || []).map((g) => DF.GOALS[g.id] + " " + goalText(g)).join(" · ") } });
    C.tip("rating", "rect:rating", { icon: "⭐" });
    C.tip("ev:" + s.evId, null, { icon: s.ev.icon });
    if (s.lockedUntil) C.tip("locked", stSpot("entrance", 36), { icon: "🔑" });
  }

  function goalText(g) { return DF.t("ui.goals." + g.id, { n: g.n || 0, min: g.min != null ? DF.fmtDec(g.min) : "" }); }
  G.goalText = goalText;

  function coachOnEvent(s, e) {
    if (!coachOn()) return;
    const C = DF.Coach;
    switch (e.type) {
      case "spawn": {
        const pr = s.problems.find((p) => p.id === e.id);
        if (!pr) return;
        const def = DF.PROBLEMS[e.ptype];
        if (def.kind !== "queue") C.tip("problem", problemSpot(s, e.id), { icon: def.icon });
        C.tip("p:" + e.ptype, problemSpot(s, e.id));
        if (def.tool && e.ptype !== "wifi") {
          if (s.lo.tools && s.lo.tools[def.tool]) C.tip("tool", stSpot("box", 34), { icon: DF.TOOLS[def.tool].icon, vars: { tool: DF.t("tools." + def.tool + ".name") } });
          else C.tip("noTool", problemSpot(s, e.id), { icon: DF.TOOLS[def.tool].icon, vars: { tool: DF.t("tools." + def.tool + ".name") } });
        }
        if ((def.crew || 1) > 1) C.tip("crew", problemSpot(s, e.id), { icon: "👥" });
        break;
      }
      case "warn": C.tip("warn", problemSpot(s, e.id), { icon: "⚠️" }); break;
      case "rush": C.tip("rush", "rect:rush", { icon: "⚡" }); break;
      case "chat": if (e.act) C.tip("chat", "rect:chat", { icon: "💬" }); break;
      case "murphy": C.tip("murphy", () => (s.murphy && s.murphy.state !== "gone" ? { x: s.murphy.x, y: s.murphy.y - 12, r: 30, map: true } : null), { icon: "😈" }); break;
      case "panic": C.tip("panic", "rect:rating", { icon: "🌀" }); break;
      case "firedrill": C.tip("firedrill", null, { icon: "🚨" }); break;
      case "goal": C.tip(e.ok ? "goalOk" : "goalFail", "rect:goals", { icon: e.ok ? "✅" : "❌", vars: { goal: goalText(s.goals.find((g) => g.id === e.id) || { id: e.id }) } }); break;
      case "burnout": C.tip("burnout", orgSpot(s), { icon: "😵‍💫" }); break;
    }
  }

  // things that are not events: tiredness, volunteers, a talk that can't start, the night
  function coachWatch(s, dt) {
    if (!coachOn() || DF.Coach.blocking()) return;
    G.coachT += dt;
    const C = DF.Coach;
    const me = s.orgs.find((q) => q.id === DF.Input.activeOrg);
    if (me && me.energy < 35 && me.stun <= 0) C.tip("energy", "rect:energy", { icon: "☕" });
    if (G.coachT > 18 && s.vols.length && !C.seen("vols")) C.tip("vols", () => { const v = s.vols[0]; return v ? { x: v.x, y: v.y - 12, r: 28, map: true } : null; }, { icon: "🙋" });
    for (const rid of ["A", "B", "L"]) {
      const room = s.rooms[rid];
      if (room.state === "waiting" && room.delay > 3) { C.tip("waiting", stSpot(DF.Sim.stageOf(rid), 40), { icon: "🎤" }); break; }
    }
    if (DF.Sim.isNight(s)) C.tip("night", "rect:energy", { icon: "🌙" });
  }

  function resetRender() {
    const R = DF.Render.R;
    R.walkers.length = 0; R.seatShown = { A: 0, B: 0, L: 0 };
    R.floaters.length = 0; R.parts.length = 0; R.select = null; R.radio.length = 0;
    R.bg = null;
  }

  // Behind the menus the venue is alive: a demo day played by two bots.
  function attractStep(dt) {
    if (!G.attract || G.attract.over || G.attract.clock > G.attract.end - 30) {
      const seed = (Date.now() % 1e9) | 0;
      G.attract = DF.Sim.createDay({
        seed, event: "devfest", daySeconds: 420,
        players: [{ id: "a1", role: "lead", name: "Lead", ctrl: "bot" }, { id: "a2", role: "tech", name: "Tech", ctrl: "bot" }],
        loadout: { event: "devfest", attendees: 150, volunteers: 3, energy: 90, satStart: 65, coffeeCap: 120, tools: { adattatori: true, batterie: true, ciabatte: true, hotspot: true }, flags: { checkinQR: true, catering: true, speakerCare: true } },
        chat: DF.Chat.build("devfest", seed, null, {}), banterN: 14,
      });
      for (let i = 0; i < 60 * 40; i++) attractTick(1 / 60);
    }
    G.attractAcc = (G.attractAcc || 0) + dt;
    let n = 0;
    while (G.attractAcc >= STEP && n < 4) { attractTick(STEP); G.attractAcc -= STEP; n++; }
    if (n === 4) G.attractAcc = 0;
  }
  function attractTick(dt) {
    const s = G.attract;
    const inputs = {};
    for (const o of s.orgs) inputs[o.id] = DF.Bot.think(s, o, DF.BOT_PROFILES.medio, dt);
    DF.Sim.stepDay(s, dt, inputs);
    s.events.length = 0;
  }

  function frame(t) {
    requestAnimationFrame(frame);
    const now = t / 1000;
    let dt = Math.min(0.1, now - (G.last || now));
    G.last = now;
    if (G.phase !== "day" && G.phase !== "ending") {
      if (document.hidden) return;
      attractStep(dt);
      DF.Render.draw(G.attract, { dt, activeOrg: null, attract: true });
      return;
    }
    if (G.online === "guest") { guestFrame(dt); return; }
    if (!G.sim) return;
    if (!G.paused && !DF.Coach.blocking()) {
      G.acc += dt;
      let n = 0;
      while (G.acc >= STEP && n < 6) { tick(STEP); G.acc -= STEP; n++; }
      if (n === 6) G.acc = 0;
    } else { dt = 0; G.acc = 0; }
    DF.Render.draw(G.sim, { dt, activeOrg: DF.Input.activeOrg, locals: G.localOrgs, focus: DF.Coach.blocking() ? DF.Coach.mapSpot() : null });
    if (DF.Coach.blocking()) DF.Coach.place();
  }

  function tick(dt) {
    const s = G.sim;
    const inputs = DF.Input.collect(G.localOrgs);
    // the co-org plays by itself; an order from the lead (tap it, then a job) comes last and wins
    let mateCmds = [];
    const botInput = (o) => { const inp = DF.Bot.think(s, o, DF.BOT_PROFILES.colead, dt); const orders = DF.Input.take(o.id); mateCmds = mateCmds.concat(orders); inp.cmds = inp.cmds.concat(orders); return inp; };
    for (const id of G.botOrgs) {
      const o = s.orgs.find((q) => q.id === id);
      if (o) inputs[id] = botInput(o);
    }
    for (const id of G.remoteOrgs) {
      const o = s.orgs.find((q) => q.id === id);
      if (!DF.Online.O.players[id] && o) { inputs[id] = botInput(o); continue; }
      const ri = G.remote[id] || { dir: null, hold: false, cmds: [] };
      inputs[id] = { dir: ri.dir, hold: ri.hold, cmds: ri.cmds || [] };
      ri.cmds = [];
    }
    if (G.rec) record(inputs[G.localOrgs[0]], mateCmds);
    DF.Sim.stepDay(s, dt, inputs);
    const evs = G.online ? s.events.slice() : null;
    handleEvents(s);
    if (G.online === "host") DF.Online.hostTick(s, dt, evs);
    if (G.phase === "ending") return;
    coachWatch(s, dt);
    maybeReact(s, dt);
    const active = s.problems.filter((p) => !p.done && !p.warn).length;
    DF.Audio.setIntensity(Math.min(1, active / 5 + (s.clock - s.start) / (s.end - s.start) * 0.35));
    if (s.over) {
      G.phase = "ending";
      DF.Input.enabled = false;
      for (let i = 0; i < 5; i++) DF.Render.burst(120 + i * 170, 120 + (i % 2) * 120, 30);
      DF.UI.toast(DF.t("radio.end"), "ok", 3);
      setTimeout(endDay, 1800);
    }
  }

  // Every so often Gemini reads what is going on and the staff chat reacts.
  function maybeReact(s, dt) {
    if (!DF.AI.available || G.reactBusy) return;
    G.reactAt -= dt;
    if (G.reactAt > 0) return;
    G.reactAt = 38 + Math.random() * 12;
    const recent = G.log.slice(-6).map((e) => e.code);
    if (!recent.length) return;
    G.reactBusy = true;
    DF.AI.react({ event: s.evId, clock: DF.fmtClock(s.clock), recent }).then((msgs) => {
      G.reactBusy = false;
      if (!msgs || !G.sim || G.sim !== s || s.over) return;
      const list = DF.Chat.fromAi(msgs, s.clock + 1);
      if (list.length) DF.Input.queue(G.localOrgs[0] || "p1", { c: "inject", msgs: list });
    }, () => { G.reactBusy = false; });
  }

  // ------------------------------------------------- online guest view
  function guestFrame(dt) {
    const m = G.mirror;
    if (!m) return;
    const me = DF.Online.me;
    const inputs = DF.Input.collect([me]);
    DF.Online.guestInput(inputs[me]);
    DF.Net.smooth(m, dt);
    handleEvents(m);
    DF.Render.draw(m, { dt, activeOrg: me, locals: [me] });
  }

  G.startGuestDay = function (run) {
    G.run = run;
    G.online = "guest";
    G.sim = null;
    G.mirror = DF.Net.mirror(run);
    const me = DF.Online.me;
    G.localOrgs = [me];
    DF.Input.bindings = { [me]: "wasd" };
    DF.Input.activeOrg = me;
    G.seenHints = {}; G.log = [];
    DF.Render.R.banter = (run.ai && run.ai.banter) || DF.t("banter");
    resetRender();
    DF.UI.show(null);
    G.phase = "day";
    DF.Input.enabled = true;
    DF.Audio.unlock(); DF.Audio.startMusic(); keepAwake(true);
    DF.UI.toast(DF.t("radio.guest"), "info", 5);
  };

  G.guestRetro = function (d) {
    G.phase = "retro";
    DF.Input.enabled = false; keepAwake(false);
    DF.Audio.finale(false); DF.Audio.stopMusic(); DF.Audio.play("fanfare");
    G.log = d.log || [];
    const fake = { fl: d.flags || {}, lo: { tools: d.tools || {} }, vols: new Array(d.vols || 0), evId: d.sum.event };
    DF.UI.showRetro(fake, d.sum, Object.assign({}, G.run, d.run), { guest: true, gazette: d.gazette });
  };

  // ------------------------------------------------------------ feedback
  const Rn = () => DF.Render;
  const quip = (k) => { const l = DF.t("quips." + k); const arr = Array.isArray(l) ? l : DF.t("quips.fixed"); return arr[Math.floor(Math.random() * arr.length)]; };
  const pname = (t) => DF.t("problems." + t + ".name");
  const where = (st) => DF.t("stations." + st);

  const LOGCOL = { bad: "#EA4335", good: "#34A853", info: "#4285F4", warn: "#F9AB00", murphy: "#7b3fbf" };
  function logKey(s, code, text, kind) {
    const last = G.log[G.log.length - 1];
    if (last && last.text === text) return;
    G.log.push({ clock: DF.fmtClock(s.clock), code, text, color: LOGCOL[kind] || LOGCOL.info });
  }

  function logEvent(s, e) {
    const ses = s.sessions || (s.ev && s.ev.sessions) || [];
    switch (e.type) {
      case "escalate": logKey(s, "escalate:" + e.ptype, "✗ " + pname(e.ptype), "bad"); break;
      case "fix": if (["coc", "cancel", "pizza", "tavoli", "wifi", "speaker", "vip", "press", "dog", "blackout"].includes(e.ptype)) logKey(s, "fix:" + e.ptype, "✓ " + pname(e.ptype), "good"); break;
      case "prevent": logKey(s, "prevent:" + e.ptype, "⚡ " + pname(e.ptype), "good"); break;
      case "talkStart": if (e.late && ses[e.session]) logKey(s, "late", "⏳ " + DF.t("talks." + ses[e.session].talk), "warn"); break;
      case "talkCancel": if (ses[e.session]) logKey(s, "cancel", "❌ " + DF.t("talks." + ses[e.session].talk), "bad"); break;
      case "murphy": logKey(s, "murphy", "😈 Murphy", "murphy"); break;
      case "murphyCaught": logKey(s, "murphyCaught", "🎯 " + DF.t("quips.murphy"), "good"); break;
      case "sabotage": logKey(s, "sabotage", "😈 → " + where(e.target), "murphy"); break;
      case "burnout": logKey(s, "burnout", "😵‍💫 Burnout", "bad"); break;
      case "lunch": logKey(s, e.late ? "lunchLate" : "lunch", e.late ? "🍕 " + DF.t("radio.lunchLate") : "🍕 " + DF.t("radio.lunch"), e.late ? "warn" : "good"); break;
      case "backup": logKey(s, "backup", DF.t("radio.backup"), "good"); break;
      case "improvised": logKey(s, "improvised", DF.t("radio.improvised"), "good"); break;
      case "leave": if (e.n >= 5) logKey(s, "leave", DF.t("radio.leave", { n: e.n, why: DF.t("radio.why." + e.why) }), "bad"); break;
      case "firedrill": logKey(s, "firedrill", "🚨 " + DF.t("chaos.firedrill.title"), "bad"); break;
      case "panic": logKey(s, "panic", "🌀 " + DF.t("ui.hud.panic"), "warn"); break;
      case "chatResolved": if (e.i < 0) logKey(s, "chatMissed", "💬✗ " + e.from, "warn"); break;
      case "raffle": logKey(s, "raffle", DF.t("radio.raffle"), "info"); break;
      case "rushWon": logKey(s, "rushWon", "⚡ " + DF.t("radio.rushWon"), "good"); break;
      case "rushLost": logKey(s, "rushLost", "⚡ " + DF.t("radio.rushLost"), "warn"); break;
    }
  }

  // where each staff-chat answer shows up on the map
  const CHAT_SPOT = { parking: "entrance", adapter: "stageA", logo: "sponsor1", coffeeLow: "coffee", queueHelp: "checkin", pizzaTime: "entrance", wifiPass: "info", vipCall: "entrance", lostThing: "info", kidsWhere: "kids", teamStuck: "tableA" };

  function handleEvents(s) {
    for (const e of s.events) {
      logEvent(s, e);
      if (G.sim === s) coachOnEvent(s, e);
      switch (e.type) {
        case "goal": {
          const g = (s.goals || []).find((q) => q.id === e.id);
          DF.Audio.play(e.ok ? "fanfare" : "escalate");
          DF.UI.toast((e.ok ? "🎯 ✓ " : "🎯 ✗ ") + goalText(g || { id: e.id }), e.ok ? "ok" : "alert", 5);
          break;
        }
        case "critter": if (e.kind !== "dog") DF.UI.toast(DF.t("radio." + e.kind), "warn", 5); break;
        case "noise": DF.UI.toast(DF.t("radio.noise"), "warn", 5); break;
        case "locked": DF.UI.toast("🔑 " + DF.t("radio.locked"), "warn", 7); break;
        case "unlocked": DF.UI.toast("🔑 " + DF.t("radio.unlocked"), "info", 4); DF.Audio.play("chime"); break;
        case "spawn": {
          DF.Audio.play("spawn");
          firstTimeHint(e.ptype);
          if (e.ptype === "speaker") {
            const pr = s.problems.find((p) => p.id === e.id);
            const sp = pr && s.speakers.find((q) => q.id === pr.ent);
            if (sp) DF.UI.toast("🧭 " + DF.t("radio.speakerLost", { name: sp.name }), "warn", 5);
          }
          if (e.ptype === "coc") DF.UI.toast("🛡️ " + DF.t("radio.coc"), "alert", 6);
          if (e.ptype === "cancel") DF.UI.toast("📵 " + DF.t("radio.cancel", { t: DF.fmtClock(s.clock) }), "alert", 6);
          if (e.ptype === "pizza") DF.UI.toast("🍕 " + DF.t("radio.pizza"), "warn", 5);
          break;
        }
        case "warn": DF.Audio.play("warn"); break;
        case "serve": Rn().serve(e); break;
        case "ability": {
          const [name, what] = DF.t("abilities." + e.role);
          DF.UI.toast(Rn().ABILITY_ICON[e.role] + " " + name + ": " + (e.ptype ? DF.t("problems." + e.ptype + ".name") + " ✓" : what), "ok", 4);
          Rn().addFloater(e.x, e.y - 40, Rn().ABILITY_ICON[e.role] + " " + name, "#1e8e3e", true);
          Rn().burst(e.x, e.y - 20, 14, ["#FFD23F", "#ffffff", "#34A853"]);
          DF.Audio.play("stamp");
          break;
        }
        case "abilityNone": DF.UI.toast("🛠️ " + DF.t("radio.abilityNone"), "info", 3); break;
        case "rush": DF.UI.toast("⚡ " + DF.t("radio.rush", { n: e.n }), "alert", 5); DF.Audio.play("warn"); Rn().R.shake = 4; break;
        case "rushWon": DF.UI.toast("⚡ " + DF.t("radio.rushWon"), "ok", 5); DF.Audio.play("fanfare"); Rn().R.ratePulse = 1.2; break;
        case "rushLost": DF.UI.toast("⚡ " + DF.t("radio.rushLost"), "warn", 5); break;
        case "points": Rn().addFloater(e.x, e.y, "+" + e.v + (e.label === "prevent" ? " " + quip("prevent") : e.label === "murphy" ? " " + DF.t("quips.murphy") : ""), e.label ? "#1e8e3e" : "#18202e"); break;
        case "fix":
          DF.Audio.play("fix", e.combo);
          Rn().burst(e.x, e.y - 20, 14);
          Rn().addFloater(e.x, e.y - 14, quip(e.ptype), "#1a73e8", true);
          break;
        case "prevent": DF.Audio.play("prevent"); Rn().burst(e.x, e.y - 20, 10, ["#FBBC04", "#ffffff"]); break;
        case "guarded": Rn().addFloater(DF.Venue.STATIONS[e.st] ? DF.Venue.STATIONS[e.st].px : 480, DF.Venue.STATIONS[e.st] ? DF.Venue.STATIONS[e.st].py : 200, "🛡️ " + quip("prevent"), "#1e8e3e", true); break;
        case "escalate": {
          DF.Audio.play("escalate");
          Rn().R.shake = 7; Rn().R.flash = 0.6;
          Rn().addFloater(e.x, e.y - 10, quip("escalate"), "#d93025", true);
          if (DF.PROBLEMS[e.ptype].pen >= 3) DF.UI.toast("⏱️ " + DF.t("radio.escalate", { p: pname(e.ptype) }), "alert", 4);
          break;
        }
        case "pickup": DF.Audio.play("pickup"); Rn().addFloater(e.x, e.y, DF.TOOLS[e.tool].icon + " " + DF.t("tools." + e.tool + ".name"), "#5f6368"); break;
        case "noTool": DF.UI.toast("📦 " + DF.t("radio.noTool", { tool: DF.t("tools." + e.tool + ".name") }), "info", 4); break;
        case "talkStart": {
          const se = (s.sessions || [])[e.session];
          if (se && se.kind !== "raffle") DF.Audio.play("applause");
          if (e.late && se) DF.UI.toast("🎙️ " + DF.t("radio.late", { t: DF.t("talks." + se.talk) }), "info", 3);
          break;
        }
        case "talkCancel": {
          const se = (s.sessions || [])[e.session];
          DF.Audio.play("escalate");
          if (se) DF.UI.toast("❌ " + DF.t("radio.talkCancel", { t: DF.t("talks." + se.talk) }), "alert", 5);
          break;
        }
        case "break": DF.Audio.play("chime"); DF.UI.toast((e.kind === "lunch" ? "🍽️ " : "☕ ") + DF.t("breaks." + e.key), "info", 3); break;
        case "lunch": DF.UI.toast("🍕 " + (e.late ? DF.t("radio.lunchLate") : DF.t("radio.lunch")), e.late ? "warn" : "ok", 3); break;
        case "murphy": DF.Audio.play("murphy"); DF.UI.toast(DF.t("radio.murphy", { where: where(e.target) }), "alert", 5); break;
        case "murphyCaught": DF.Audio.play("caught"); Rn().burst(e.x, e.y, 22, ["#7b3fbf", "#FBBC04", "#ffffff"]); break;
        case "sabotage": DF.UI.toast(DF.t("radio.sabotage", { where: where(e.target) }), "warn", 3); break;
        case "burnout": DF.Audio.play("burnout"); DF.UI.toast(DF.t("radio.burnout"), "alert", 5); break;
        case "raffle": DF.Audio.play("fanfare"); DF.Audio.finale(true); DF.UI.toast(DF.t("radio.raffle"), "ok", 4); break;
        case "photo": for (let i = 0; i < 6; i++) Rn().burst(80 + Math.random() * 300, 40 + Math.random() * 80, 24); DF.UI.toast(DF.t("radio.photo"), "ok", 4); break;
        case "synergy": DF.UI.toast(DF.t("radio.synergy"), "ok", 2); break;
        case "backup": DF.UI.toast(DF.t("radio.backup"), "ok", 4); break;
        case "improvised": DF.UI.toast(DF.t("radio.improvised"), "ok", 4); break;
        case "leave": if (e.n > 0) DF.UI.toast(DF.t("radio.leave", { n: e.n, why: DF.t("radio.why." + e.why) }), "warn", 4); break;
        case "stream": DF.UI.toast(DF.t("radio.stream"), "ok", 3); break;
        case "found": Rn().addFloater(e.x, e.y, (e.critter ? (DF.PROBLEMS[e.critter] ? DF.PROBLEMS[e.critter].icon : "") + " " : "") + DF.t("quips.found"), "#1e8e3e", true); break;
        case "assign": DF.Audio.play("click"); break;
        case "chat": DF.Audio.play(e.act ? "phone" : "ping"); if (e.act) firstTimeHint("chat"); break;
        case "chatResolved": {
          // the chat acts: say what the answer (or the silence) changed, and where
          const lines = e.tpl ? DF.t("chat.fx." + e.tpl) : null;
          const txt = Array.isArray(lines) ? lines[e.i < 0 ? 2 : e.i] : null;
          if (txt) DF.UI.toast((e.i < 0 ? "💬✗ " : "💬✓ ") + txt, e.i < 0 ? "warn" : e.i === 0 ? "ok" : "info", 5);
          else if (e.i < 0) DF.UI.toast("💬 " + DF.t("radio.chatMissed", { who: e.from }), "warn", 3);
          if (e.i >= 0) DF.Audio.play("pickup");
          const st = DF.Venue.STATIONS[CHAT_SPOT[e.tpl]];
          if (st && txt) Rn().addFloater(st.px, st.py - 24, (e.i < 0 ? "✗ " : "✓ ") + (DF.CHAT_FROM[(DF.CHAT_ACTS[e.tpl] || {}).from] || "💬"), e.i < 0 ? "#c5221f" : e.i === 0 ? "#1e8e3e" : "#5f6368");
          Rn().R.ratePulse = e.i === 0 ? 0.8 : 0; Rn().R.rateBad = e.i < 0 ? 0.8 : 0;
          break;
        }
        case "interrupt": DF.Audio.play("blip"); break;
        case "panic": DF.Audio.play("alarm"); DF.UI.toast("🌀 " + DF.t("radio.panic"), "alert", 4); break;
        case "firedrill": DF.Audio.play("alarm"); Rn().R.shake = 10; DF.UI.toast("🚨 " + DF.t("chaos.firedrill.title") + " " + DF.t("chaos.firedrill.text"), "alert", 6); break;
        case "firedrillEnd": DF.UI.toast(DF.t("chaos.firedrillEnd"), "info", 4); break;
        case "dog": DF.UI.toast(DF.t("radio.dog"), "warn", 4); firstTimeHint("dog"); break;
        case "vip": DF.UI.toast(DF.t("radio.vip"), "warn", 4); break;
        case "press": DF.UI.toast(DF.t("radio.press"), "ok", 4); firstTimeHint("press"); break;
        case "blackout": DF.Audio.play("escalate"); DF.UI.toast(DF.t("radio.blackout", { where: DF.t("rooms." + e.room) }), "alert", 4); break;
      }
    }
    s.events.length = 0;
  }

  function firstTimeHint(type) {
    if (G.seenHints[type] || coachOn()) return; // the coach cards replace the radio hints
    const h = DF.t("hints." + type);
    if (h === "hints." + type) return;
    G.seenHints[type] = true;
    DF.UI.toast(h, "tip", 6);
  }

  // ------------------------------------------------------------- taps
  // what the active organizer (or a teammate given an order) does with a tapped thing
  function commandFor(s, o, hit) {
    switch (hit.kind) {
      case "problem": {
        const pr = hit.ref, def = DF.PROBLEMS[pr.type];
        if (pr.type === "speaker") return { c: "target", target: { kind: "speaker", id: pr.ent } };
        if (DF.CRITTERS[pr.type]) return { c: "target", target: { kind: "critter", id: pr.ent } };
        // tap = go there and work on it, no need to hold
        const needTool = def.tool && pr.type !== "wifi" && o && !o.carry.includes(def.tool) && s.lo.tools && s.lo.tools[def.tool];
        if (needTool) return { c: "target", target: { kind: "station", id: "box" }, then: { kind: "problem", id: pr.id }, auto: true };
        if (pr.type === "wifi" && o && o.carry.includes("hotspot")) return { c: "target", target: { kind: "station", id: "lab" }, auto: true };
        return { c: "target", target: { kind: "problem", id: pr.id }, auto: true };
      }
      case "desk": return { c: "target", target: { kind: "station", id: "checkin" }, auto: true };
      case "speaker": return { c: "target", target: { kind: "speaker", id: hit.ref.id } };
      case "critter": return { c: "target", target: { kind: "critter", id: hit.ref.id } };
      case "murphy": return { c: "target", target: { kind: "murphy" } };
      case "box": return { c: "target", target: { kind: "station", id: "box" } };
      case "floor": return { c: "goto", x: hit.x, y: hit.y };
    }
    return null;
  }

  // a volunteer goes to the post that covers the tapped problem (or the tapped post)
  function orderVolunteer(s, org, vid, hit) {
    let post = hit.kind === "post" ? hit.ref : hit.kind === "desk" ? "checkin" : null;
    if (hit.kind === "problem") {
      const r = DF.Sim.volPostFor(s, hit.ref);
      if (!r.can) { DF.UI.toast("🙋 " + DF.t("radio.volCant"), "info", 4); return true; }
      post = r.post;
    }
    if (!post) return false;
    DF.Input.queue(org, { c: "assign", vol: vid, post });
    DF.UI.toast("🙋 " + DF.t("radio.volSent", { post: DF.t("posts." + post) }), "ok", 3);
    DF.Audio.play("click");
    return true;
  }

  // TAP: a problem = go and fix it; yourself = drive that organizer; a teammate
  // the game moves (the co-org, a volunteer) = select it, then tap its job
  DF.Input.onPick = function (lx, ly) {
    const s = G.sim || G.mirror;
    if (!s || G.phase !== "day" || G.paused || DF.Coach.blocking()) return;
    const org = DF.Input.activeOrg;
    const o = s.orgs.find((q) => q.id === org);
    const mates = G.online === "guest" ? [] : G.botOrgs.concat(G.remoteOrgs.filter((id) => !(DF.Online.O.players || {})[id]));
    const hit = DF.Render.pick(s, lx, ly, { selves: G.localOrgs, mates, volunteers: G.online !== "guest" });
    const R = DF.Render.R;
    if (hit.kind === "hud") { if (hit.ref === "pause") setPaused(true); else if (hit.ref === "ability") DF.Input.queue(org, { c: "ability" }); else DF.Audio.setMuted(!DF.Audio.muted); return; }
    if (hit.kind === "reply") { DF.Input.queue(org, { c: "reply", id: hit.ref, i: hit.i }); return; }
    if (hit.kind === "tool") {
      if (hit.inBox) DF.Input.queue(org, { c: "take", tool: hit.ref });
      else DF.UI.toast("📦 " + DF.t("radio.noTool", { tool: DF.t("tools." + hit.ref + ".name") }), "info", 3);
      return;
    }
    if (hit.kind === "none") return;
    if (hit.kind === "self") { DF.Input.activeOrg = hit.ref.id; R.select = null; DF.Audio.play("click"); return; }
    if (hit.kind === "mate" || hit.kind === "vol") {
      const kind = hit.kind === "vol" ? "vol" : "mate";
      if (R.select && R.select.id === hit.ref.id) { R.select = null; return; }
      R.select = { kind, id: hit.ref.id };
      DF.Audio.play("click");
      if (kind === "vol") DF.UI.toast("🙋 " + DF.t("radio.assign"), "tip", 4);
      else DF.UI.toast("👉 " + DF.t("radio.orgPick", { name: hit.ref.name || DF.t("roles." + hit.ref.role + ".name") }), "tip", 4);
      return;
    }
    if (R.select) {
      const sel = R.select;
      R.select = null;
      if (sel.kind === "vol") { if (orderVolunteer(s, org, sel.id, hit) || hit.kind === "floor") return; }
      else {
        const mate = s.orgs.find((q) => q.id === sel.id);
        const cmd = mate && commandFor(s, mate, hit);
        if (cmd) {
          DF.Input.queue(mate.id, Object.assign(cmd, { order: true }));
          DF.UI.toast("👉 " + DF.t("radio.orgSent", { name: mate.name || DF.t("roles." + mate.role + ".name") }), "ok", 3);
          DF.Audio.play("click");
          return;
        }
      }
    }
    const cmd = commandFor(s, o, hit);
    if (cmd) DF.Input.queue(org, cmd);
  };

  // Q / E answer the oldest open staff-chat message
  function replyKey(i) {
    const s = G.sim || G.mirror;
    if (!s || G.phase !== "day") return;
    const m = s.chat.find((q) => q.open);
    if (m) DF.Input.queue(DF.Input.activeOrg, { c: "reply", id: m.id, i });
  }

  // ------------------------------------------------------------ end
  function endDay() {
    keepAwake(false);
    landscape(false);
    G.phase = "retro";
    DF.Input.enabled = false;
    DF.Audio.finale(false); DF.Audio.stopMusic(); DF.Audio.play("fanfare");
    const sum = DF.Sim.summary(G.sim);
    DF.Stats.dayEnd(sum, G.run, G.cfg, G.sim.t);
    if (G.online === "host") DF.Online.hostRetro(sum, G.log, G.sim);
    DF.UI.showRetro(G.sim, sum, G.run, { host: G.online === "host" });
    if (G.rec) { DF.UI.weeklyDone(sum, G.rec, G.run); G.rec = null; }
  }

  function setPaused(p) {
    if (G.phase !== "day" || G.online === "guest") return;
    G.paused = p;
    if (G.online === "host" && G.sim) DF.Online.hostTick(G.sim, 1, []);
    DF.UI.show(p ? "pause" : null);
    if (p) DF.Audio.stopMusic(); else DF.Audio.startMusic();
  }
  G.setPaused = setPaused;
  G.startDay = startDay;
  G.quitToTitle = function () {
    if (G.phase === "day" && G.sim && G.online !== "guest") DF.Stats.quit(G.sim, G.run || {}, G.cfg && G.cfg.daySeconds);
    if (DF.Online.active) DF.Online.leave();
    landscape(false);
    DF.Render.R.select = null;
    G.online = null; G.mirror = null;
    G.phase = "title"; G.sim = null; DF.Input.enabled = false; DF.Audio.stopMusic(); keepAwake(false);
    resetRender();
    DF.UI.show("title");
  };

  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); }
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { wakeLock = null; }
  }

  // ------------------------------------------------------------ boot
  function boot() {
    const canvas = document.getElementById("game");
    DF.Render.init(canvas);
    DF.Input.attach(canvas);
    DF.UI.init();
    DF.AI.check();
    window.addEventListener("resize", () => DF.Render.resize());
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyP" || e.code === "Escape") { if (G.phase === "day") { setPaused(!G.paused); e.preventDefault(); } }
      if (e.code === "KeyM") DF.Audio.setMuted(!DF.Audio.muted);
      // the role's ability: F for the WASD player, . for the arrows player
      if (G.phase === "day" && !G.paused && !e.repeat && (e.code === "KeyF" || e.code === "Period")) {
        const want = e.code === "KeyF" ? "wasd" : "arrows";
        const org = G.localOrgs.find((id) => DF.Input.bindings[id] === want) || (want === "wasd" ? DF.Input.activeOrg : null);
        if (org) DF.Input.queue(org, { c: "ability" });
      }
      if (G.phase === "day" && !G.paused && !e.repeat) {
        if (e.code === "KeyQ") replyKey(0);
        if (e.code === "KeyE") replyKey(1);
      }
    });
    window.addEventListener("pagehide", () => { if (G.phase === "day" && G.sim && G.online !== "guest") DF.Stats.quit(G.sim, G.run || {}, G.cfg && G.cfg.daySeconds); });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && G.phase === "day" && !G.paused && G.online !== "guest") setPaused(true);
      if (!document.hidden && G.phase === "day") keepAwake(true);
    });
    const fontsReady = document.fonts ? Promise.all([
      document.fonts.load("700 16px 'Google Sans Flex'"), document.fonts.load("700 16px 'Google Sans Code'"),
      document.fonts.load("16px 'Noto Color Emoji'", "☕📽️🎤"), document.fonts.load("400 16px 'Bungee'"),
    ]).catch(() => {}) : Promise.resolve();
    fontsReady.then(() => { DF.Render.R.bg = null; });
    DF.onLang(() => { DF.Render.R.bg = null; });
    requestAnimationFrame(frame);

    const q = new URLSearchParams(location.search);
    if (q.has("dev")) {
      window.__df = {
        tick(n) { for (let i = 0; i < (n || 1); i++) tick(STEP); return G.sim && G.sim.orgs.map((o) => o.name + "@" + Math.round(o.x) + "," + Math.round(o.y) + (o.target ? ":" + o.target.kind : "")); },
        attract(sec) {
          for (let i = 0; i < (sec || 1) * 60; i++) attractStep(STEP);
          for (let k = 0; k < 20; k++) DF.Render.draw(G.attract, { dt: 1 / 30, activeOrg: null, attract: true });
          return DF.fmtClock(G.attract.clock);
        },
        advance(sec, profile) {
          const s = G.sim; if (!s) return "no day";
          for (let i = 0; i < sec * 60 && !s.over; i++) {
            const inputs = {};
            for (const o of s.orgs) inputs[o.id] = DF.Bot.think(s, o, DF.BOT_PROFILES[profile || "medio"], STEP);
            DF.Sim.stepDay(s, STEP, inputs);
            const evs = s.events.slice();
            handleEvents(s);
            if (G.online === "host") DF.Online.hostTick(s, STEP, evs);
          }
          if (s.over && G.phase === "day") { G.phase = "ending"; endDay(); }
          for (let k = 0; k < 30; k++) DF.Render.draw(s, { dt: 1 / 30, activeOrg: DF.Input.activeOrg });
          return DF.fmtClock(s.clock) + " sat " + s.sat.toFixed(1) + " problems " + s.problems.filter((p) => !p.done).map((p) => p.type).join(",");
        },
      };
    }
    if (q.has("day")) startDay(DF.UI.quickRun(q.get("day") || "solo", q.get("event") || "devfest"));
    else DF.UI.show("title");
    DF.Stats.visit(); // anonymous: see js/stats.js
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
