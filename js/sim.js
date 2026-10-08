/* sim.js: an event day as a pure, deterministic simulation.
 *   DF.Sim.createDay(cfg) -> state
 *   DF.Sim.stepDay(state, dt, inputs)   (mutates state, pushes state.events)
 * No DOM and no Math.random: the same seed and inputs replay the same day,
 * which is what the playtest bot and the online host rely on. Texts (chat,
 * banter) arrive as data in cfg; the sim never reads the language packs. */
"use strict";

(function () {
  const V = DF.Venue, ST = V.STATIONS, P = DF.PROBLEMS, ROLES = DF.ROLES;
  const ACT_R = 32;          // px: how close you stand to work on a station
  const TOUCH_R = 24;        // px: touching a person (speaker, Murphy, dog)
  const ORG_SPEED = 140;     // px/s
  const VOL_SPEED = 100;
  const SPK_SPEED = 78;
  const MURPHY_SPEED = 64;

  const clampSat = (v) => DF.clamp(v, 0, 100);
  // short events have fewer good moments: their gains count more
  const gain = (s, v) => { s.sat = clampSat(s.sat + v * s.gainK); };
  const DEFAULT_POSTS = {
    meetup: ["checkin", "stageB", "info", "entrance"],
    studyjam: ["checkin", "lab", "coffee", "info", "stageB"],
    wtm: ["checkin", "kids", "info", "stageA", "coffee"],
    ioext: ["checkin", "checkin", "stageA", "info", "sponsor1"],
    hack: ["checkin", "tableA", "lab", "coffee", "info"],
    devfest: ["checkin", "checkin", "coffee", "info", "stageA", "lab"],
  };

  // ------------------------------------------------------------------ setup
  function createDay(cfg) {
    const evId = cfg.event || (cfg.loadout && cfg.loadout.event) || "devfest";
    // the venue first: stations, rooms and paths move with it (js/venue.js)
    DF.Venue.use(cfg.venue || "uni");
    const vfx = DF.Venue.fx || {};
    const base0 = DF.EVENTS[evId];
    const base = vfx.wifi ? Object.assign({}, base0, { spawn: Object.assign({}, base0.spawn, { wifi: (base0.spawn.wifi || 0) * vfx.wifi }) }) : base0;
    // sold-out: the same event with more people (main.js grows the loadout), more trouble, less slack
    const ev = cfg.soldout ? Object.assign({}, base, { soldout: true, spawn: Object.fromEntries(Object.entries(base.spawn).map(([k, v]) => [k, typeof v === "number" ? v * 1.25 : v])) }) : base;
    const rng = DF.makeRng(cfg.seed || 1);
    const lo = cfg.loadout;
    const fl = lo.flags || {};
    const players = cfg.players || [{ id: "p1", role: "lead", name: "" }];
    const humans = players.filter((p) => p.ctrl !== "bot").length, bots = players.length - humans;
    const s = {
      cfg, ev, evId, rng, lo, fl, venue: DF.Venue.id,
      sessions: ev.sessions, breaks: ev.breaks, start: ev.start, end: ev.end,
      t: 0,
      k: (ev.end - ev.start) / (cfg.daySeconds || ev.daySeconds),
      clock: ev.start, prevClock: ev.start,
      over: false,
      sat: clampSat(lo.satStart != null ? lo.satStart : 62),
      score: 0, combo: 0, bestCombo: 0,
      nextId: 1,
      problems: [], events: [],
      orgs: [], vols: [], speakers: [], critters: [],
      murphy: null,
      coffee: (lo.coffeeCap || 100) * (vfx.coffeeCap || 1), coffeeCap: (lo.coffeeCap || 100) * (vfx.coffeeCap || 1),
      lunch: { state: "none" },
      crowd: { expected: lo.attendees || ev.attendees, arrivedF: 0, inF: 0, queue: 0, hall: 0, A: 0, B: 0, L: 0, overflow: { A: 0, B: 0 }, checkedIn: 0, left: 0, maxQueue: 0 },
      rooms: { A: mkRoom(), B: mkRoom(), L: mkRoom() },
      stats: {
        fixed: 0, prevented: 0, escalated: 0, delegated: 0, byType: {},
        talksTotal: 0, talksOnTime: 0, talksLate: 0, talksCancelled: 0, improvised: 0, cancelWhy: {},
        murphyCaught: 0, murphySabotage: 0, burnouts: 0, coffeeOut: 0, lunchLate: false, queueTimeOver: 0, synergy: 0,
        chatAnswered: 0, chatIgnored: 0, chatMissed: [], interrupts: 0, panicTime: 0, firedrills: 0, pressDone: 0, vipDone: 0, dogCaught: 0, guarded: 0,
        escorted: 0, demoFail: 0, rushWon: 0, rushTotal: 0, abilities: 0, orders: 0,
      },
      breakIdx: -1, queueCooldown: 0,
      timers: {}, script: {}, guards: {},
      chat: [], chatQueue: (cfg.chat || []).map((m) => Object.assign({}, m)),
      banterN: Math.max(1, cfg.banterN || 14),
      coopK: 0.85 + 0.3 * Math.max(0, humans - 1) + 0.15 * bots,
      panic: false, fire: null,
      gainK: ev.gainK || 1,
      // more time for everything in the first events and in relaxed mode
      pace: (ev.pace || 1) * (cfg.relax ? 1.3 : 1) * (ev.soldout ? 0.92 : 1),
      perks: cfg.perks || {},
      goals: (ev.goals || []).map((g) => Object.assign({}, g, { state: "pending" })),
    };
    if (fl.vipReady) s.guards.vip = 1;

    players.forEach((p, i) => {
      s.orgs.push({
        id: p.id, role: p.role, name: p.name || "", ctrl: p.ctrl || "human",
        x: ST.box.px + 18 + i * 18, y: ST.box.py + 22 + (i % 2) * 10,
        path: null, pi: 0, target: null, then: null, repath: 0,
        carry: [], hold: false, working: null,
        energy: DF.clamp(lo.energy != null ? lo.energy : 85, 10, 100),
        stun: 0, talking: 0, bubble: -1, icd: 4, moving: false, facing: 1, auto: false,
      });
    });

    const posts = DEFAULT_POSTS[evId] || DEFAULT_POSTS.devfest;
    for (let i = 0; i < (lo.volunteers || 0); i++) {
      const post = posts[i % posts.length];
      const st = ST[post];
      s.vols.push({ id: "v" + (i + 1), post, x: st.px + (i % 2 ? 10 : -10), y: st.py + 6, path: null, pi: 0, at: true, busy: 0, react: 0, look: i });
    }

    ev.sessions.forEach((se, idx) => {
      if (!se.speaker) return;
      const early = se.kind === "keynote" ? rng.int(40, 55) : rng.int(22, 45);
      s.speakers.push({
        id: "s" + idx, session: idx, name: se.speaker, room: se.room,
        state: "off", arriveAt: se.start - early, x: ST.entrance.px, y: ST.entrance.py + 20,
        path: null, pi: 0, follow: null, linger: 0, lost: false, probId: 0, look: idx,
      });
    });

    planScript(s);
    // the meetup venue: nobody arranged the keys, the doors stay shut for a while
    s.lockedUntil = s.evId === "meetup" && !s.fl.venueKey ? s.start + 15 : 0;
    return s;
  }

  function mkRoom() { return { session: -1, state: "idle", delay: 0, carry: 0, micRolled: false, overrunRolled: false, quotaRolled: false, improvised: false }; }

  // What will go wrong today, decided up front from the seed.
  function planScript(s) {
    const { rng, ev, fl, lo } = s, sp = ev.spawn, sc = s.script;
    const span = ev.end - ev.start;
    const mid = (a, b) => ev.start + span * (a + rng() * (b - a));
    const talks = ev.sessions.map((se, i) => [se, i]).filter(([se], k) => se.kind === "talk" && se.speaker && k > 0);
    sc.cancelSession = -1;
    if (talks.length && rng() < Math.min(1, sp.cancel)) {
      const late = talks.filter(([se]) => se.start >= ev.start + span * 0.4);
      sc.cancelSession = rng.pick(late.length ? late : talks)[1];
    }
    if (fl.backupSpeaker) sc.backupFor = sc.cancelSession;
    sc.cocAt = rng() < 0.8 * sp.coc ? mid(0.2, 0.8) : -1;
    sc.murphy = [];
    let m = sp.murphy;
    while (m > 0) { if (rng() < Math.min(1, m)) sc.murphy.push(mid(0.25, 0.85)); m -= 1; }
    sc.printerAt = rng() < sp.printer * (fl.checkinQR ? 0.4 : 1) ? ev.start + rng.int(6, 30) : -1;
    const workshops = ev.sessions.filter((se) => se.kind === "workshop");
    sc.tavoliAt = sp.tavoli && !fl.labReady && workshops.length > 1 ? workshops[1].start - 22 : -1;
    const demo = ev.sessions.find((se) => se.kind === "demo");
    sc.vipAt = rng() < sp.vip ? (demo ? demo.start - 25 : mid(0.25, 0.7)) : -1; // at the hackathon the VIP is the jury
    sc.dogAt = rng() < sp.dog * (fl.dogGate ? 0.2 : 1) ? mid(0.2, 0.8) : -1;
    sc.pressAt = rng() < Math.min(1, sp.press * (fl.pressReady ? 1.3 : 0.75)) ? mid(0.3, 0.75) : -1;
    sc.blackoutAt = rng() < sp.blackout ? mid(0.3, 0.8) : -1;
    sc.fireAt = !fl.fireCheck && rng() < sp.firedrill ? mid(0.3, 0.7) : -1;
    sc.badgeAt = rng() < sp.badge * (lo.tools && lo.tools.badge ? 0.6 : 1) ? ev.start + rng.int(8, 35) : -1;
    // Women Techmakers: children wander off, the accessible route, photo consent
    sc.kids = [];
    let kd = (sp.kid || 0) * (fl.kidsCorner ? 0.45 : 1);
    while (kd > 0) { if (rng() < Math.min(1, kd)) sc.kids.push(mid(0.2, 0.85)); kd -= 1; }
    sc.accessAt = rng() < (sp.access || 0) * (fl.accessRoute ? 0.25 : 1) ? ev.start + rng.int(12, 40) : -1;
    // the night: the neighbours call around 2am
    sc.noiseAt = rng() < (sp.noise || 0) * (fl.nightGuard ? 0.3 : 1) ? ev.start + 7.5 * 60 + rng.int(0, 90) : -1;
    s.timers.wifi = sp.wifi > 0 ? (fl.networkCheck ? 95 : 62) * rng.range(0.6, 1.2) / sp.wifi * s.pace : 1e9;
    s.timers.perso = sp.perso > 0 ? rng.range(10, 22) / sp.perso * s.pace : 1e9;
    s.timers.foto = sp.foto > 0 ? rng.range(20, 40) / sp.foto * s.pace : 1e9;
    s.timers.mentor = sp.mentor > 0 ? rng.range(8, 14) : 1e9;
    // rush hours: a few things at once, later in the day bigger (and more of them sold-out)
    // (their own random stream: adding them leaves the rest of the day as it was)
    const rr = s.rushRng = DF.makeRng(((s.cfg.seed || 1) ^ 0x5bd1e995) >>> 0);
    const nRush = Math.min(3, Math.ceil((ev.order || 1) / 2)) + (ev.soldout ? 1 : 0);
    sc.rush = [];
    for (let i = 0; i < nRush; i++) {
      const f = nRush === 1 ? 0.5 : 0.28 + 0.52 * (i / (nRush - 1));
      sc.rush.push({ at: ev.start + span * f + rr.range(-5, 5), level: Math.min(3, i + 1 + (ev.soldout ? 1 : 0)) });
    }
  }

  // ------------------------------------------------------------ rush hours
  // Several problems at once: fix them all before any gets worse and the day
  // takes off (rating, points); miss one and they just stay problems.
  const runningStage = (s, rr) => { const r = ["A", "B"].find((k) => s.ev.rooms.includes(k) && s.rooms[k].state === "running"); return r ? [stageOf(r), { room: r }] : null; };
  const RUSH_KINDS = {
    flame: (s, rr) => [rr.pick(["hall", "expo", "coffee"])],
    perso: (s, rr) => [rr.pick(["info", "hall", "expo"])],
    wifi: () => ["router"],
    stampante: () => ["checkin"],
    sponsor: (s, rr) => [rr.chance(0.5) ? "sponsor1" : "sponsor2"],
    foto: (s, rr) => [rr.pick(["hall", "expo", "doorA"])],
    mic: runningStage,
    hdmi: runningStage,
    prese: (s) => (s.ev.rooms.includes("L") ? ["lab", { room: "L" }] : null),
  };
  function updateRush(s) {
    const r = s.rush;
    if (r) {
      const prs = r.ids.map((id) => s.problems.find((p) => p.id === id)).filter(Boolean);
      const won = prs.every((p) => p.done && !p.escalated);
      if (won || prs.some((p) => p.escalated) || s.t > r.until) {
        s.rush = null;
        s.stats.rushTotal++;
        if (won) {
          s.stats.rushWon++;
          s.sat = clampSat(s.sat + 0.5 + 0.4 * r.level);
          addScore(s, 250 * r.level, ST.hall.px, ST.hall.py, "rush");
          emit(s, "rushWon", { level: r.level });
        } else emit(s, "rushLost", { level: r.level });
      }
      return;
    }
    const next = s.script.rush && s.script.rush[0];
    if (!next || s.clock < next.at || s.fire) return;
    s.script.rush.shift();
    const size = Math.min(4, next.level + 1 + ((s.ev.order || 1) >= 6 ? 1 : 0)); // the DevFest is the final exam
    // the first events only throw people problems; tools and tech come later
    const TECH = ["wifi", "mic", "hdmi", "prese"];
    const rr = s.rushRng;
    const kinds = rr.shuffle(Object.keys(RUSH_KINDS).filter((t) => ((s.ev.spawn[t] || 0) > 0 || t === "stampante" || t === "flame") && ((s.ev.order || 1) >= 3 || !TECH.includes(t))));
    const ids = [];
    for (const t of kinds) {
      if (ids.length >= size) break;
      const where = RUSH_KINDS[t](s, rr);
      if (!where) continue;
      const pr = spawn(s, t, where[0], Object.assign({ rush: true, warn: 0 }, where[1] || {}));
      if (pr) ids.push(pr.id);
    }
    if (ids.length < 2) { for (const id of ids) { const p = s.problems.find((q) => q.id === id); if (p) p.rush = false; } return; }
    const prs = ids.map((id) => s.problems.find((p) => p.id === id));
    s.rush = { level: next.level, ids, until: s.t + Math.max(...prs.map((p) => p.dur)) + 1 };
    emit(s, "rush", { level: next.level, n: ids.length });
  }

  // --------------------------------------------------------------- helpers
  function emit(s, type, data) { s.events.push(Object.assign({ type, t: s.t }, data || {})); }

  function stat(s, type, key) {
    const b = s.stats.byType[type] || (s.stats.byType[type] = { spawned: 0, fixed: 0, prevented: 0, escalated: 0, improvised: 0 });
    b[key]++;
  }

  function entity(s, id) {
    return s.speakers.find((q) => q.id === id) || s.critters.find((q) => q.id === id) || null;
  }

  function anchorOf(s, pr) {
    if (pr.ent) {
      const e = entity(s, pr.ent);
      if (e) return [e.x, e.y];
    }
    const st = ST[pr.st] || ST.hall;
    return [st.px, st.py];
  }

  function findProblem(s, type, st) {
    return s.problems.find((p) => p.type === type && p.st === st && !p.done);
  }

  const DEFAULT_ST = { vip: "entrance", press: "expo", flame: "hall", sponsor: "sponsor1", pizza: "entrance", hdmi: "stageA", coffee: "coffee", wifi: "router" };

  function spawn(s, type, st, extra) {
    st = st || DEFAULT_ST[type] || "hall";
    if (findProblem(s, type, st)) return null;
    if (s.guards[type] > 0) {
      s.guards[type]--;
      s.stats.guarded++;
      if (type === "vip") s.stats.vipDone++; // the prepared welcome still counts
      emit(s, "guarded", { ptype: type, st });
      return null;
    }
    const def = P[type];
    let warn = (def.warn || 0) * s.pace;
    if (warn && s.fl.runOfShow) warn *= 1.8;
    const dur = def.dur * s.pace * (type === "coc" && s.fl.cocTeam ? 1.3 : 1);
    const pr = Object.assign({
      id: s.nextId++, type, st, t0: s.t, warn, dur, remain: dur,
      progress: 0, escalated: false, done: false, workers: 0,
    }, extra || {});
    s.problems.push(pr);
    stat(s, type, "spawned");
    emit(s, warn ? "warn" : "spawn", { id: pr.id, ptype: type, st });
    return pr;
  }

  function addScore(s, pts, x, y, label) {
    const v = Math.round(pts * (1 + Math.min(s.combo, 10) * 0.1));
    s.score += v;
    emit(s, "points", { v, x, y, label });
  }

  function resolve(s, pr, how) {
    if (pr.done) return;
    pr.done = true;
    const def = P[pr.type];
    const [x, y] = anchorOf(s, pr);
    s.combo++; s.bestCombo = Math.max(s.bestCombo, s.combo);
    if (how === "prevented") {
      s.stats.prevented++; stat(s, pr.type, "prevented");
      gain(s, 0.5);
      addScore(s, 150, x, y, "prevent");
      emit(s, "prevent", { id: pr.id, ptype: pr.type, x, y });
    } else {
      s.stats.fixed++; stat(s, pr.type, "fixed");
      if (pr.improvised) { s.stats.improvised++; stat(s, pr.type, "improvised"); }
      gain(s, (pr.escalated ? 0.1 : 0.35) + (def.bonus || 0));
      addScore(s, def.pts, x, y, null);
      emit(s, "fix", { id: pr.id, ptype: pr.type, x, y, combo: s.combo, by: how });
    }
    onResolved(s, pr);
  }

  function escalate(s, pr) {
    const def = P[pr.type];
    pr.escalated = true;
    s.stats.escalated++; stat(s, pr.type, "escalated");
    s.combo = 0;
    // a rush hour's problems cost half: missing the challenge is losing its prize
    s.sat = clampSat(s.sat - def.pen * (pr.type === "coc" && s.fl.cocTeam ? 0.6 : 1) * (pr.rush ? 0.5 : 1));
    const [x, y] = anchorOf(s, pr);
    emit(s, "escalate", { id: pr.id, ptype: pr.type, x, y });
    onEscalated(s, pr);
    if (!def.persist) pr.done = true;
  }

  // ------------------------------------------------- problem consequences
  function onResolved(s, pr) {
    const c = s.crowd;
    switch (pr.type) {
      case "coffee": s.coffee = s.coffeeCap; break;
      case "pizza": s.lunch.state = "served"; gain(s, 1.5); emit(s, "lunch", {}); break;
      case "overflow": { const n = c.overflow[pr.room]; c.overflow[pr.room] = 0; c.hall += n; emit(s, "stream", { room: pr.room, n }); break; }
      case "cancel": {
        const room = s.rooms[pr.room];
        room.improvised = true;
        const sp = s.speakers.find((q) => q.session === room.session);
        if (sp) sp.state = "gone";
        emit(s, "improvised", { room: pr.room });
        break;
      }
      case "queue": s.queueCooldown = 6; break;
      case "vip": s.stats.vipDone++; gain(s, 1.5); break;
      case "press": s.stats.pressDone++; if (s.fl.pressReady) gain(s, 1); break;
      case "dog": case "kid": case "access": {
        const d = entity(s, pr.ent);
        if (d) critterOut(s, d, true);
        if (pr.type === "dog") s.stats.dogCaught++; else s.stats.escorted++;
        break;
      }
    }
  }

  function onEscalated(s, pr) {
    const c = s.crowd;
    switch (pr.type) {
      case "queue": {
        const gone = Math.round(c.queue * 0.25);
        c.queue -= gone; c.left += gone;
        emit(s, "leave", { n: gone, why: "coda" });
        s.queueCooldown = 8;
        pr.done = true;
        break;
      }
      case "overflow": { const gone = c.overflow[pr.room]; c.overflow[pr.room] = 0; c.left += gone; emit(s, "leave", { n: gone, why: "overflow" }); break; }
      case "coffee": s.stats.coffeeOut++; break;
      case "pizza": s.stats.lunchLate = true; s.lunch.state = "served"; emit(s, "lunch", { late: true }); break;
      case "cancel": cancelTalk(s, pr.room, "nospeaker"); break;
      case "overrun": if (pr.room) s.rooms[pr.room].carry = 12; break;
      case "dog": case "kid": case "access": {
        const d = entity(s, pr.ent);
        if (d) critterOut(s, d, false);
        break;
      }
      case "hdmi": if (pr.demo) s.stats.demoFail++; break;
    }
  }

  function cancelTalk(s, roomId, why) {
    const room = s.rooms[roomId];
    if (room.state !== "waiting" && room.state !== "idle") return;
    room.state = "cancelled";
    s.stats.talksCancelled++;
    if (roomId === "L") s.stats.labCancelled = true;
    if (s.sessions[room.session] && s.sessions[room.session].kind === "demo") s.stats.demoFail++;
    s.stats.cancelWhy[why] = (s.stats.cancelWhy[why] || 0) + 1;
    s.sat = clampSat(s.sat - 4);
    const c = s.crowd;
    c.hall += c[roomId]; c[roomId] = 0;
    emit(s, "talkCancel", { room: roomId, session: room.session, why });
    s.problems.forEach((p) => {
      if (!p.done && (p.room === roomId || (p.st && ST[p.st] && ST[p.st].room === roomId)) && ["hdmi", "mic", "cancel", "speaker", "overrun"].includes(p.type)) p.done = true;
    });
  }

  // ------------------------------------------------------------- movement
  function setPath(ent, x, y) {
    const path = V.findPath(ent.x, ent.y, x, y);
    ent.path = path; ent.pi = path ? 1 : 0;
  }

  function followPath(ent, speed, dt) {
    if (!ent.path || ent.pi >= ent.path.length) { ent.path = null; return false; }
    let budget = speed * dt;
    while (budget > 0 && ent.path && ent.pi < ent.path.length) {
      const [tx, ty] = ent.path[ent.pi];
      const dx = tx - ent.x, dy = ty - ent.y;
      const d = Math.hypot(dx, dy);
      if (d <= budget) { ent.x = tx; ent.y = ty; budget -= d; ent.pi++; }
      else {
        ent.x += (dx / d) * budget; ent.y += (dy / d) * budget;
        if (Math.abs(dx) > 1) ent.facing = dx > 0 ? 1 : -1;
        budget = 0;
      }
    }
    if (ent.pi >= ent.path.length) ent.path = null;
    return true;
  }

  function moveDir(ent, dx, dy, speed, dt) {
    const len = Math.hypot(dx, dy);
    if (!len) return false;
    const vx = (dx / len) * speed * dt, vy = (dy / len) * speed * dt;
    const free = (x, y) => [[-7, -7], [7, -7], [-7, 7], [7, 7]].every(([ox, oy]) => V.isWalk(V.toTile(x + ox), V.toTile(y + oy)));
    let moved = false;
    if (free(ent.x + vx, ent.y)) { ent.x += vx; moved = true; }
    if (free(ent.x, ent.y + vy)) { ent.y += vy; moved = true; }
    if (Math.abs(vx) > 0.01) ent.facing = vx > 0 ? 1 : -1;
    return moved;
  }

  const near = (ent, x, y, r) => Math.hypot(ent.x - x, ent.y - y) <= r;
  const atStation = (ent, id, r) => near(ent, ST[id].px, ST[id].py, r || ACT_R);
  const stageOf = (room) => (room === "A" ? "stageA" : room === "B" ? "stageB" : "lab");

  // ---------------------------------------------------------- organizers
  function orgSpeed(s, o) { return (o.energy < 20 ? ORG_SPEED * 0.75 : ORG_SPEED) * (s.perks.shoes ? 1.12 : 1); }

  function targetPoint(s, o) {
    const tg = o.target;
    if (!tg) return null;
    if (tg.kind === "point") return [tg.x, tg.y];
    if (tg.kind === "station") return [ST[tg.id].px, ST[tg.id].py];
    if (tg.kind === "problem") { const pr = s.problems.find((p) => p.id === tg.id && !p.done); return pr ? anchorOf(s, pr) : null; }
    if (tg.kind === "speaker" || tg.kind === "critter") { const e = entity(s, tg.id); return e ? [e.x, e.y] : null; }
    if (tg.kind === "murphy") return s.murphy && s.murphy.state !== "gone" ? [s.murphy.x, s.murphy.y] : null;
    return null;
  }

  function applyCommand(s, o, cmd) {
    switch (cmd.c) {
      case "goto":
        o.then = null; o.auto = false;
        o.target = { kind: "point", x: cmd.x, y: cmd.y };
        o.order = cmd.order ? o.target : null;
        if (cmd.order) s.stats.orders++;
        setPath(o, cmd.x, cmd.y); o.repath = 0.4;
        break;
      case "target":
        o.target = cmd.target;
        o.then = cmd.then || null;
        o.auto = !!cmd.auto; // tapped a problem: once there, work on it without holding
        o.order = cmd.order ? (cmd.then || cmd.target) : null; // the lead sent this co-org: the bot obeys until it's done
        if (cmd.order) s.stats.orders++;
        { const p = targetPoint(s, o); if (p) setPath(o, p[0], p[1]); }
        o.repath = 0.4;
        break;
      case "take": takeTool(s, o, cmd.tool); break;
      case "ability": useAbility(s, o); break;
      case "assign": {
        const v = s.vols.find((q) => q.id === cmd.vol);
        if (v && ST[cmd.post] && v.post !== cmd.post) {
          v.post = cmd.post; v.at = false; v.react = 0;
          setPath(v, ST[cmd.post].px + (s.rng() - 0.5) * 16, ST[cmd.post].py + 4);
          s.stats.delegated++;
          emit(s, "assign", { vol: v.id, post: cmd.post });
        }
        break;
      }
      case "reply": {
        const m = s.chat.find((q) => q.id === cmd.id && q.open);
        if (m) resolveChat(s, m, cmd.i === 1 ? 1 : 0, o);
        break;
      }
      case "inject": // reactive staff-chat messages written by the AI (host only)
        for (const m of cmd.msgs || []) s.chatQueue.push(Object.assign({}, m, { at: Math.max(s.clock, m.at || s.clock) }));
        s.chatQueue.sort((a, b) => a.at - b.at);
        break;
    }
  }

  function takeTool(s, o, tool) {
    if (!atStation(o, "box", ACT_R + 8)) return false;
    if (!s.lo.tools || !s.lo.tools[tool]) { emit(s, "noTool", { org: o.id, tool }); return false; }
    if (o.carry.includes(tool)) return false;
    if (o.carry.length >= ROLES[o.role].tools) o.carry.shift();
    o.carry.push(tool);
    emit(s, "pickup", { org: o.id, tool, x: o.x, y: o.y });
    return true;
  }

  // Which problem is this organizer standing on?
  function workableProblem(s, o) {
    let best = null, bd = 1e9;
    for (const pr of s.problems) {
      if (pr.done || pr.warn > 0) continue;
      if (P[pr.type].kind === "escort") continue;
      const [x, y] = anchorOf(s, pr);
      let d = Math.hypot(o.x - x, o.y - y);
      if (pr.type === "wifi" && o.carry.includes("hotspot")) d = Math.min(d, Math.hypot(o.x - ST.lab.px, o.y - ST.lab.py));
      if (d <= ACT_R && d < bd) { best = pr; bd = d; }
    }
    return best;
  }

  // automatic work after a tap: the problem you are standing on, or the desk
  function autoWork(s, o) {
    if (workableProblem(s, o)) return true;
    return !!(o.target && o.target.kind === "station" && o.target.id === "checkin" && atStation(o, "checkin") && s.crowd.queue > 0);
  }

  // 1am-6am at a night event
  function isNight(s) {
    if (!s.ev.night) return false;
    const h = (s.clock / 60) % 24;
    return h >= 1 && h < 6;
  }

  function fixRate(s, o, pr) {
    const def = P[pr.type];
    let secs = def.fix || 2, improvised = false;
    if (pr.type === "wifi") secs = o.carry.includes("hotspot") && atStation(o, "lab") ? def.fixHotspot : def.fix;
    else if (def.tool && !o.carry.includes(def.tool)) { secs = def.fixNoTool; improvised = true; }
    if (pr.type === "coc" && s.fl.cocTeam) secs = def.fixTrained;
    if (pr.type === "cancel" && s.fl.lightningJolly) secs *= 0.6;
    let rate = 1 / secs;
    if (ROLES[o.role].fast.includes(pr.type)) rate *= 2;
    if (o.energy < 20) rate *= 0.75;
    return { rate, improvised };
  }

  // ------------------------------------------------------------ abilities
  // One per role, with a cooldown: the lead's megaphone, the tech's hotfix,
  // the host filling a late talk, the care's breather.
  const ABILITY_CD = { lead: 60, tech: 85, host: 60, care: 60 };
  const TECH_FIX = ["hdmi", "mic", "wifi", "prese", "stream", "quota", "blackout", "stampante", "badge"];
  const fxOn = (s, k) => !!(s.fx && s.fx[k] > s.t);
  function useAbility(s, o) {
    if ((o.abCd || 0) > 0 || o.stun > 0) return;
    const fx = s.fx || (s.fx = {});
    const extra = {};
    if (o.role === "lead") fx.megaphone = s.t + 12 * s.pace;
    else if (o.role === "tech") {
      const pr = s.problems.filter((p) => !p.done && !(p.warn > 0) && TECH_FIX.includes(p.type)).sort((a, b) => a.remain / a.dur - b.remain / b.dur)[0];
      if (!pr) { emit(s, "abilityNone", { org: o.id, role: o.role }); return; }
      resolve(s, pr, "org");
      extra.ptype = pr.type;
    } else if (o.role === "host") fx.host = s.t + 20 * s.pace;
    else if (o.role === "care") {
      for (const q of s.orgs) if (Math.hypot(q.x - o.x, q.y - o.y) < 220) q.energy = Math.min(100, q.energy + 25);
      for (const p of s.problems) { if (p.done || p.type !== "flame") continue; const [x, y] = anchorOf(s, p); if (Math.hypot(x - o.x, y - o.y) < 240) resolve(s, p, "org"); }
    }
    o.abCd = (ABILITY_CD[o.role] || 60) * s.pace;
    s.stats.abilities++;
    emit(s, "ability", Object.assign({ org: o.id, role: o.role, x: o.x, y: o.y }, extra));
  }

  function updateOrg(s, o, inp, dt) {
    if (o.abCd > 0) o.abCd = Math.max(0, o.abCd - dt);
    if (inp && inp.cmds) for (const c of inp.cmds) applyCommand(s, o, c);
    o.working = null;
    if (o.stun > 0) {
      o.stun -= dt; o.hold = false; o.moving = false;
      if (o.stun <= 0) emit(s, "recover", { org: o.id });
      return;
    }
    if (o.talking > 0) { o.talking -= dt; o.moving = false; if (o.talking <= 0) o.bubble = -1; return; }
    const dir = inp && inp.dir;
    const steering = !!(dir && (dir[0] || dir[1]));
    if (steering) o.auto = false;
    o.hold = !!(inp && inp.hold) || (o.auto && !o.path && autoWork(s, o));

    let moved = false;
    if (steering) {
      o.path = null; o.target = null; o.then = null;
      moved = moveDir(o, dir[0], dir[1], orgSpeed(s, o), dt);
    } else if (!o.hold || !workableProblem(s, o)) {
      if (o.target && ["speaker", "critter", "murphy", "problem"].includes(o.target.kind)) {
        o.repath -= dt;
        if (o.repath <= 0) {
          o.repath = 0.4;
          const p = targetPoint(s, o);
          if (p) { if (!near(o, p[0], p[1], 10)) setPath(o, p[0], p[1]); }
          else o.target = null;
        }
      }
      moved = followPath(o, orgSpeed(s, o), dt);
    }
    o.moving = moved;

    // "go to the box, then to that problem": take its tool and carry on
    if (o.then && !o.path && atStation(o, "box", ACT_R + 8)) {
      const pr = o.then.kind === "problem" ? s.problems.find((p) => p.id === o.then.id && !p.done) : null;
      if (pr) {
        const tool = P[pr.type].tool;
        if (tool) takeTool(s, o, tool);
        o.target = o.then;
        const p = targetPoint(s, o);
        if (p) setPath(o, p[0], p[1]);
      }
      o.then = null;
    }
    if (atStation(o, "box", ACT_R + 8) && o.target && o.target.kind === "problem") {
      const pr = s.problems.find((p) => p.id === o.target.id && !p.done);
      const tool = pr && P[pr.type].tool;
      if (tool && s.lo.tools && s.lo.tools[tool] && !o.carry.includes(tool)) takeTool(s, o, tool);
    }

    // touching: speakers and dogs follow you, Murphy runs away
    for (const sp of s.speakers) {
      if (sp.state === "lost" && near(o, sp.x, sp.y, TOUCH_R + 6)) {
        sp.state = "escort"; sp.follow = o.id; sp.repath = 0;
        emit(s, "found", { org: o.id, x: sp.x, y: sp.y });
        if (o.target && o.target.kind === "speaker" && o.target.id === sp.id) {
          o.target = { kind: "station", id: stageOf(sp.room) };
          setPath(o, ST[stageOf(sp.room)].px, ST[stageOf(sp.room)].py);
        }
      }
    }
    for (const d of s.critters) {
      if (d.state === "roam" && near(o, d.x, d.y, TOUCH_R + 8)) {
        d.state = "follow"; d.follow = o.id; d.repath = 0;
        emit(s, "found", { org: o.id, x: d.x, y: d.y, critter: d.kind });
        if (o.target && o.target.kind === "critter" && o.target.id === d.id) {
          const dest = ST[d.dest];
          o.target = { kind: "station", id: d.dest }; o.auto = false;
          setPath(o, dest.px, dest.py);
        }
      }
    }
    const m = s.murphy;
    if (m && (m.state === "walk" || m.state === "sabotage") && near(o, m.x, m.y, TOUCH_R + 4)) {
      m.state = "flee";
      setPath(m, ST.entrance.px, ST.entrance.py + 18);
      s.stats.murphyCaught++;
      s.combo++; s.bestCombo = Math.max(s.bestCombo, s.combo);
      gain(s, 1);
      addScore(s, 300, m.x, m.y, "murphy");
      emit(s, "murphyCaught", { x: m.x, y: m.y, org: o.id });
      if (o.target && o.target.kind === "murphy") o.target = null;
    }

    // HOLD: work on the problem you're standing on, the desk, or the box
    let effort = 0;
    if (o.hold) {
      const pr = workableProblem(s, o);
      if (pr) {
        const { rate, improvised } = fixRate(s, o, pr);
        pr.workRate = (pr.workRate || 0) + rate;
        pr.workers = (pr.workers || 0) + 1;
        pr.orgWorkers = (pr.orgWorkers || 0) + 1;
        if (improvised) pr.improvisedNow = true;
        o.working = pr.id;
        effort = 1;
      } else if (atStation(o, "checkin") && s.crowd.queue > 0) {
        o.working = "desk"; effort = 1;
      } else if (atStation(o, "box", ACT_R + 8) && !o.boxPicked) {
        o.boxPicked = true;
        const need = s.problems
          .filter((p) => !p.done && P[p.type].tool && p.type !== "wifi" && s.lo.tools && s.lo.tools[P[p.type].tool] && !o.carry.includes(P[p.type].tool))
          .sort((a, b) => a.remain - b.remain)[0];
        if (need) takeTool(s, o, P[need.type].tool);
        else if (s.problems.some((p) => !p.done && p.type === "wifi") && s.lo.tools && s.lo.tools.hotspot && !o.carry.includes("hotspot")) takeTool(s, o, "hotspot");
      }
    } else o.boxPicked = false;

    // walking through the crowd: someone always has a question for the staff
    if (moved) {
      o.icd -= dt;
      const room = V.roomAt(o.x, o.y);
      if (o.icd <= 0 && (room === "H" || room === "E" || room === "K") && s.crowd.hall > 8) {
        const dens = Math.min(1.5, s.crowd.hall / 60);
        let rate = 0.03 * dens * (o.role === "lead" ? 1.5 : 1) * (s.fl.signage ? 0.6 : 1) * (fxOn(s, "megaphone") ? 0 : 1); // after the announcement nobody stops you
        if (s.vols.some((v) => v.post === "info" && v.at)) rate *= 0.7;
        if (s.rng() < rate * dt * 10) {
          o.talking = 0.9; o.bubble = s.rng.int(0, s.banterN - 1); o.icd = 8;
          gain(s, 0.12);
          s.stats.interrupts++;
          emit(s, "interrupt", { org: o.id, x: o.x, y: o.y, n: o.bubble });
        }
      }
    }

    // energy: work and walking tire you, coffee and the speaker room recharge;
    // in the small hours of a hackathon everything costs more
    const night = isNight(s);
    const tire = night ? 1.5 : 1;
    if (effort) o.energy -= 1.5 * tire * dt;
    else if (moved) o.energy -= 0.3 * tire * dt;
    else {
      let regen = 0.9;
      if (atStation(o, "coffee") && s.coffee > 0) { regen = 11; s.coffee = Math.max(0, s.coffee - 1.4 * dt); }
      else if (V.roomAt(o.x, o.y) === "S") regen = s.fl.restArea ? 10 : 6;
      o.energy += regen * (night && !s.fl.restArea ? 0.8 : 1) * dt;
    }
    o.energy = DF.clamp(o.energy, 0, 100);
    if (o.energy <= 0) {
      o.stun = 6; o.energy = 35; o.path = null; o.target = null; o.hold = false;
      s.stats.burnouts++;
      s.sat = clampSat(s.sat - 3);
      emit(s, "burnout", { org: o.id, x: o.x, y: o.y });
    }
  }

  // ----------------------------------------------------------- volunteers
  const VOL_COVERS = {
    checkin: ["checkin"], coffee: ["coffee"], info: ["info", "hall"], stageA: ["stageA"], stageB: ["stageB"],
    lab: ["lab", "tableL"], entrance: ["entrance"], sponsor1: ["sponsor1", "sponsor2", "expo"],
    kids: ["kids", "expo"], tableA: ["tableA"],
  };

  // the post whose volunteer covers a problem's spot, and whether volunteers can fix that kind at all
  function volPostFor(s, pr) {
    const def = P[pr.type];
    const can = !!((pr.type === "mentor" && s.fl.mentors) || def.vol) && !(def.tool && !(s.lo.tools && s.lo.tools[def.tool]));
    const post = DF.postsFor(s.evId).find((id) => (VOL_COVERS[id] || [id]).includes(pr.st)) || null;
    return { post, can: can && !!post };
  }

  function updateVol(s, v, dt) {
    if (v.path) { followPath(v, VOL_SPEED, dt); v.at = false; return; }
    if (!v.at) {
      v.at = atStation(v, v.post, ACT_R + 6);
      if (!v.at) { setPath(v, ST[v.post].px, ST[v.post].py + 4); if (!v.path) v.at = true; return; }
    }
    v.react += dt;
    if (v.react < 1.2) return;
    const covers = VOL_COVERS[v.post] || [v.post];
    for (const pr of s.problems) {
      if (pr.done || !covers.includes(pr.st)) continue;
      const def = P[pr.type];
      if (pr.warn > 0) {
        if (pr.type === "coffee" && v.post === "coffee") resolve(s, pr, "prevented");
        continue;
      }
      const vol = pr.type === "mentor" && s.fl.mentors ? 0.45 : def.vol; // mentors recruited: volunteers can unblock teams
      if (!vol) continue;
      if (def.tool && !(s.lo.tools && s.lo.tools[def.tool])) continue;
      const secs = def.tool ? def.fix * 2.5 : def.fix;
      pr.workRate = (pr.workRate || 0) + vol / secs;
      pr.workers = (pr.workers || 0) + 1;
      v.busy = pr.id;
      return;
    }
    v.busy = 0;
    serve(s, v, dt);
  }

  // A volunteer at a post with nothing to fix serves people: a coffee, an
  // answer, a welcome, a badge. Each one is a small gain you can see (the
  // renderer hands out the cup); a post with nobody to serve gives nothing,
  // so where you put volunteers matters through the day.
  const running = (s, r) => s.ev.rooms.includes(r) && s.rooms[r].state === "running";
  const coffeeTime = (s) => (s.breakIdx >= 0 && s.breaks[s.breakIdx].kind !== "lunch") || s.clock < s.start + 45;
  const SERVICE = {
    coffee: { every: 3.2, v: 0.06, when: (s) => coffeeTime(s) && s.coffee > 2 && s.crowd.hall > 4 },
    info: { every: 5, v: 0.025, when: (s) => s.crowd.hall > 10 },
    entrance: { every: 3.5, v: 0.05, when: (s) => s.clock < s.start + 60 || s.crowd.queue > 4 },
    checkin: { every: 2.4, v: 0, when: (s) => s.crowd.queue > 0 },
    sponsor1: { every: 5, v: 0.04, when: (s) => s.breakIdx >= 0 && s.crowd.hall > 10 },
    kids: { every: 5, v: 0.03, when: (s) => s.crowd.hall + s.crowd.A > 20 },
    stageA: { every: 6, v: 0.03, when: (s) => running(s, "A") },
    stageB: { every: 6, v: 0.03, when: (s) => running(s, "B") },
    lab: { every: 5, v: 0.03, when: (s) => running(s, "L") },
    tableA: { every: 5, v: 0.03, when: (s) => running(s, "A") || running(s, "L") },
  };
  function serve(s, v, dt) {
    const sv = SERVICE[v.post];
    if (!sv || !sv.when(s)) { v.serveT = 0; return; }
    v.serveT = (v.serveT || 0) + dt;
    if (v.serveT < sv.every) return;
    v.serveT = 0;
    if (v.post === "coffee") s.coffee = Math.max(0, s.coffee - 0.5); // a cup poured
    // the same total over a short meetup and a long DevFest
    const d = sv.v * 240 / s.ev.daySeconds;
    if (d) s.sat = clampSat(s.sat + d);
    s.stats.served = (s.stats.served || 0) + 1;
    emit(s, "serve", { post: v.post, vol: v.id, x: v.x, y: v.y, v: d });
  }

  // ------------------------------------------------------------- speakers
  function updateSpeakers(s, dt) {
    const c = s.clock;
    for (const sp of s.speakers) {
      const se = s.sessions[sp.session];
      if (sp.state === "off") {
        if (sp.session === s.script.cancelSession && !s.script.backupFor) continue; // never comes
        if (c >= sp.arriveAt) {
          // a message from this speaker still unanswered: now it's too late
          for (const m of s.chat) if (m.open && m.sp === sp.id) resolveChat(s, m, -1, null);
          sp.state = "arrive";
          sp.x = ST.entrance.px; sp.y = ST.entrance.py + 10;
          const greeted = s.vols.some((v) => (v.post === "info" || v.post === "entrance") && v.at);
          const pLost = s.fl.speakerCare ? 0.1 : 0.32;
          sp.lost = !greeted && s.rng.chance(pLost);
          if (sp.safe) sp.lost = false;
          if (sp.forceLost) sp.lost = true;
          if (sp.session === s.script.backupFor) { sp.lost = false; sp.backup = true; emit(s, "backup", { room: sp.room }); }
          if (sp.lost) { sp.state = "lost"; wander(s, sp, ["H", "H", "E", "H"]); }
          else setPath(sp, ST.green.px + s.rng.range(-20, 20), ST.green.py + s.rng.range(-8, 14));
          emit(s, "speakerArrive", { sp: sp.id });
        }
        continue;
      }
      if (sp.state === "arrive") {
        if (!followPath(sp, SPK_SPEED, dt)) sp.state = "green";
      } else if (sp.state === "lost") {
        if (sp.path) followPath(sp, SPK_SPEED * 0.8, dt);
        else { sp.linger -= dt; if (sp.linger <= 0) wander(s, sp, ["H", "H", "E", "H"]); }
      } else if (sp.state === "escort") {
        trail(s, sp, dt);
        if (atStation(sp, stageOf(sp.room), ACT_R + 12)) {
          sp.state = "stage"; sp.follow = null; sp.path = null;
          const pr = s.problems.find((p) => p.type === "speaker" && p.ent === sp.id && !p.done);
          if (pr) resolve(s, pr, "org");
          onSpeakerOnStage(s, sp);
        }
      } else if (sp.state === "toStage") {
        if (!followPath(sp, SPK_SPEED, dt)) { sp.state = "stage"; onSpeakerOnStage(s, sp); }
      } else if (sp.state === "done") {
        if (!followPath(sp, SPK_SPEED, dt)) sp.state = "gone";
      }
      // call to the stage 15 minutes before the start
      if (c >= se.start - 15 && c < se.end) {
        if (sp.state === "green" || (sp.state === "arrive" && !sp.direct)) {
          sp.direct = true;
          sp.state = "toStage";
          const st = ST[stageOf(sp.room)];
          setPath(sp, st.px + s.rng.range(-14, 14), sp.room === "L" ? st.py : 1.3 * DF.TILE);
        } else if (sp.state === "lost" && !sp.probId) {
          const pr = spawn(s, "speaker", null, { ent: sp.id, room: sp.room });
          if (pr) sp.probId = pr.id;
        }
      }
    }
  }

  function trail(s, e, dt) {
    const o = s.orgs.find((q) => q.id === e.follow);
    if (!o) return;
    e.repath = (e.repath || 0) - dt;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (e.repath <= 0 && d > 22) { e.repath = 0.35; setPath(e, o.x, o.y); }
    if (d > 20) followPath(e, ORG_SPEED * 0.95, dt);
  }

  function wander(s, e, rooms) {
    const [x, y] = V.randomPointIn(s.rng.pick(rooms), s.rng);
    setPath(e, x, y);
    e.linger = s.rng.range(1.5, 4);
  }

  function onSpeakerOnStage(s, sp) {
    const se = s.sessions[sp.session];
    if (se.kind === "lightning" || se.kind === "raffle") return;
    if (sp.noHdmi) return;
    const p = (s.fl.provaTecnica ? 0.12 : 0.4) * s.ev.spawn.hdmi * s.coopK;
    if (sp.forceHdmi || s.rng.chance(p)) spawn(s, "hdmi", stageOf(sp.room), { room: sp.room });
  }

  // ---------------------------------------------------------- the chat
  function updateChat(s) {
    while (s.chatQueue.length && s.chatQueue[0].at <= s.clock) {
      const m = s.chatQueue.shift();
      const tpl = m.tpl ? DF.CHAT_ACTS[m.tpl] : null;
      if (tpl && tpl.need && !(s.ev.spawn[tpl.need] > 0)) continue;
      if (m.sp) { const sp = s.speakers.find((q) => q.id === m.sp); if (!sp || sp.state !== "off") continue; }
      m.t = s.t;
      if (tpl) { m.open = true; m.span = tpl.deadline * s.pace * (s.perks.walkie ? 1.5 : 1); m.deadline = s.t + m.span; }
      s.chat.push(m);
      if (s.chat.length > 80) s.chat.splice(0, s.chat.length - 80);
      emit(s, "chat", { id: m.id, act: !!tpl });
    }
    for (const m of s.chat) if (m.open && s.t > m.deadline) resolveChat(s, m, -1, null);
  }

  function resolveChat(s, m, i, org) {
    if (!m.open) return;
    m.open = false; m.answer = i;
    const tpl = DF.CHAT_ACTS[m.tpl];
    const fx = i >= 0 ? tpl.replies[i].fx : tpl.ignore;
    const sp = m.sp ? s.speakers.find((q) => q.id === m.sp) : null;
    for (const f of fx) {
      switch (f.op) {
        case "sat": if (f.v > 0) gain(s, f.v); else s.sat = clampSat(s.sat + f.v); break;
        case "spawn": spawn(s, f.type, f.st); break;
        case "guard":
          if (f.type === "hdmi" && sp) sp.noHdmi = true;
          else s.guards[f.type] = (s.guards[f.type] || 0) + 1;
          break;
        case "coffee": s.coffee = Math.min(s.coffeeCap, s.coffee + f.v); break;
        case "energy": (org ? [org] : s.orgs).forEach((o) => { o.energy = DF.clamp(o.energy + f.v / (org ? 1 : 2), 0, 100); }); break;
        case "queue": s.crowd.queue += f.v; break;
        case "vol": {
          const st = ST[f.post];
          const v = s.vols.filter((q) => q.post !== f.post).sort((a, b) => Math.hypot(a.x - st.px, a.y - st.py) - Math.hypot(b.x - st.px, b.y - st.py))[0];
          if (v) { v.post = f.post; v.at = false; v.react = 0; setPath(v, st.px, st.py + 4); }
          break;
        }
        case "speakerSafe": if (sp) sp.safe = true; break;
        case "speakerLost": if (sp) sp.forceLost = true; break;
        case "spawnSoon": if (sp && f.type === "hdmi") sp.forceHdmi = true; break;
      }
    }
    if (i >= 0) s.stats.chatAnswered++;
    else { s.stats.chatIgnored++; if (s.stats.chatMissed.length < 12) s.stats.chatMissed.push(m.from); }
    emit(s, "chatResolved", { id: m.id, i, tpl: m.tpl, from: m.from });
  }

  // ------------------------------------------------------- talks and crowd
  function sessionStart(s, idx) {
    const se = s.sessions[idx];
    const room = s.rooms[se.room];
    room.session = idx; room.state = "waiting"; room.delay = room.carry || 0; room.carry = 0;
    room.improvised = false; room.micRolled = false; room.overrunRolled = false; room.quotaRolled = false;
    if (se.kind !== "raffle") s.stats.talksTotal++;
    fillRooms(s, [idx]);
    if (idx === s.script.cancelSession && !s.script.backupFor) spawn(s, "cancel", stageOf(se.room), { room: se.room });
    if (se.stream && s.rng() < 0.7 * s.ev.spawn.stream * (s.fl.streamTest ? 0.3 : 1)) s.timers.streamAt = se.start + 10;
    // the awards without public rules: someone contests the verdict
    if (se.kind === "raffle" && s.evId === "hack" && !s.fl.judgingRules) spawn(s, "flame", "stageA");
    // demo time: every team plugs in its own laptop
    if (se.kind === "demo") s.timers.demoHdmi = [0.08, 0.28, 0.48, 0.68, 0.88].filter(() => s.rng.chance(s.fl.provaTecnica ? 0.35 : 0.75)).map((f) => se.start + (se.end - se.start) * f);
  }

  function fillRooms(s, idxs) {
    const c = s.crowd;
    const weights = idxs.map((i) => {
      const se = s.sessions[i];
      let w = se.room === "A" ? 1 : se.room === "B" ? 0.62 : 0.38;
      if (se.popular) w *= 1.8;
      if (se.kind === "keynote" || se.kind === "raffle" || se.kind === "lightning" || se.kind === "demo") w = 3;
      if (se.kind === "hack") w = se.room === "L" ? 0.4 : 1.4;
      return w;
    });
    const tot = weights.reduce((a, b) => a + b, 0) || 1;
    const pool = Math.floor(c.hall * 0.92);
    idxs.forEach((i, k) => {
      const se = s.sessions[i];
      const want = Math.round(pool * weights[k] / tot);
      const cap = se.kind === "raffle" ? 999 : V.ROOMS[se.room].cap;
      const seat = Math.max(0, Math.min(want, cap - c[se.room]));
      c[se.room] += seat; c.hall -= seat;
      const extra = want - seat;
      if (extra > 4 && (se.room === "A" || se.room === "B") && se.kind !== "raffle") {
        c.overflow[se.room] += extra; c.hall -= extra;
        spawn(s, "overflow", se.room === "A" ? "doorA" : "doorB", { room: se.room });
      }
    });
  }

  function sessionEnd(s, idx) {
    const se = s.sessions[idx];
    const room = s.rooms[se.room];
    const c = s.crowd;
    if (room.state === "running") emit(s, "talkEnd", { room: se.room, session: idx });
    if (room.state === "waiting") cancelTalk(s, se.room, "late");
    room.state = "idle";
    c.hall += c[se.room] + (c.overflow[se.room] || 0);
    c[se.room] = 0;
    if (c.overflow[se.room]) c.overflow[se.room] = 0;
    s.problems.forEach((p) => {
      if (!p.done && p.room === se.room && ["hdmi", "mic", "cancel", "speaker", "overflow", "quota"].includes(p.type)) { p.done = true; emit(s, "expire", { id: p.id }); }
    });
    const sp = s.speakers.find((q) => q.session === idx);
    if (sp && sp.state !== "off" && sp.state !== "gone") {
      sp.state = "done"; sp.follow = null;
      const [x, y] = V.randomPointIn("H", s.rng);
      setPath(sp, x, y);
    }
  }

  function updateRooms(s, dt) {
    const c = s.clock;
    s.sessions.forEach((se, idx) => {
      if (s.prevClock < se.start && c >= se.start) sessionStart(s, idx);
      if (s.prevClock < se.end && c >= se.end) sessionEnd(s, idx);
    });
    for (const rid of ["A", "B", "L"]) {
      const room = s.rooms[rid];
      if (room.state === "running") { rollDuringTalk(s, rid, room); continue; }
      if (room.state !== "waiting") continue;
      const se = s.sessions[room.session];
      const sp = s.speakers.find((q) => q.session === room.session);
      const stageId = stageOf(rid);
      const blocked = !!s.fire || s.problems.some((p) => !p.done && ((p.st === stageId && (p.type === "hdmi" || p.type === "cancel" || p.type === "tavoli")) || (p.type === "blackout" && p.room === rid)));
      const speakerReady = !se.speaker || (sp && sp.state === "stage") || room.improvised;
      if (speakerReady && !blocked) {
        room.state = "running";
        if (se.kind !== "raffle") {
          if (room.delay <= 4) { s.stats.talksOnTime++; gain(s, 0.8); }
          else s.stats.talksLate++;
        }
        emit(s, "talkStart", { room: rid, session: room.session, late: room.delay > 4 });
        if (se.kind === "raffle") { gain(s, (s.fl.raffle ? 3 : 1.5)); emit(s, "raffle", {}); }
        continue;
      }
      room.delay += dt * s.k;
      if (!fxOn(s, "host")) s.sat = clampSat(s.sat - 0.035 * dt * Math.min(1.5, s.crowd[rid] / 50)); // the host keeps the room warm
      if (room.delay > 26 && se.kind !== "raffle") cancelTalk(s, rid, "late");
    }
  }

  // things that go wrong while a session is running
  function rollDuringTalk(s, rid, room) {
    const se = s.sessions[room.session];
    if (!se || se.kind === "raffle" || se.kind === "hack") return;
    const f = (s.clock - se.start) / (se.end - se.start);
    const sp = s.ev.spawn;
    if (!room.micRolled && rid !== "L" && f >= 0.3) {
      room.micRolled = true;
      if (s.rng.chance(0.32 * sp.mic * s.coopK)) spawn(s, "mic", stageOf(rid), { room: rid });
    }
    if (!room.overrunRolled && se.speaker && f >= 0.72) {
      room.overrunRolled = true;
      if (s.rng.chance(0.2 * sp.overrun * (s.fl.timeKeeper ? 0.35 : 1) * s.coopK)) spawn(s, "overrun", stageOf(rid), { room: rid });
    }
    if (!room.quotaRolled && rid === "L" && se.kind === "workshop" && f >= 0.25) {
      room.quotaRolled = true;
      if (s.rng.chance(0.6 * sp.quota)) spawn(s, "quota", "lab", { room: "L" });
    }
  }

  function arrivalShare(s) {
    const t = s.clock - s.start, span = s.end - s.start;
    const first = s.sessions[0] ? Math.max(15, s.sessions[0].start - s.start) : 40;
    if (t < first + 5) return 0.62 / (first + 5);
    if (t < first + 50) return 0.22 / 45;
    if (t < span * 0.4) return 0.1 / Math.max(30, span * 0.4 - first - 50);
    if (t < span * 0.55) return 0.06 / Math.max(20, span * 0.15);
    return 0;
  }

  function updateCrowd(s, dt) {
    const c = s.crowd;
    c.arrivedF += arrivalShare(s) * c.expected * dt * s.k;
    const arrivals = Math.floor(c.arrivedF);
    if (arrivals > 0) { c.arrivedF -= arrivals; c.queue += arrivals; }

    const qr = s.fl.checkinQR ? 1.6 : 1;
    let rate = 0.12;
    for (const o of s.orgs) if (o.working === "desk") rate += (o.role === "host" ? 2.4 : 1.25) * qr;
    for (const v of s.vols) if (v.post === "checkin" && v.at) rate += 0.75 * qr;
    if (s.lockedUntil) {
      if (!s.lockedSaid) { s.lockedSaid = true; emit(s, "locked", {}); }
      if (s.clock < s.lockedUntil) rate = 0;
      else { s.lockedUntil = 0; s.sat = clampSat(s.sat - Math.min(10, c.queue * 0.4)); emit(s, "unlocked", { n: c.queue }); }
    }
    if (fxOn(s, "megaphone")) rate *= 1.5; // the lead's megaphone: "QR ready, two lines!"
    if (s.problems.some((p) => p.type === "stampante" && !p.done && p.warn <= 0)) rate *= 0.2;
    if (s.problems.some((p) => p.type === "badge" && !p.done)) rate *= 0.6;
    c.inF += rate * dt;
    const n = Math.min(c.queue, Math.floor(c.inF));
    if (n > 0) { c.inF -= n; c.queue -= n; c.checkedIn += n; c.hall += n; }
    if (c.queue === 0) c.inF = Math.min(c.inF, 1);
    c.maxQueue = Math.max(c.maxQueue, c.queue);

    if (c.queue > 12) { s.sat = clampSat(s.sat - 0.0035 * (c.queue - 12) * dt); s.stats.queueTimeOver += dt; }
    s.queueCooldown = Math.max(0, s.queueCooldown - dt);
    const qp = findProblem(s, "queue", "checkin");
    if (!qp && c.queue >= 18 && s.queueCooldown <= 0) spawn(s, "queue", "checkin");
    if (qp && c.queue <= 5) resolve(s, qp, "org");

    const br = s.breaks.findIndex((b) => s.clock >= b.start && s.clock < b.end);
    if (br !== s.breakIdx) {
      if (br >= 0) onBreakStart(s, s.breaks[br]);
      s.breakIdx = br;
    }
    const brk = br >= 0 ? s.breaks[br] : null;
    if (brk && brk.kind === "coffee") s.coffee = Math.max(0, s.coffee - c.hall * 0.018 * dt);
    else if (s.clock < s.start + 45) s.coffee = Math.max(0, s.coffee - c.hall * 0.006 * dt);
    if (s.coffee < s.coffeeCap * 0.22 && !findProblem(s, "coffee", "coffee") && ((brk && brk.kind === "coffee") || s.clock < s.start + 45)) spawn(s, "coffee", "coffee");
    if (brk && brk.kind === "lunch" && s.lunch.state !== "served") s.sat = clampSat(s.sat - 0.05 * dt);

    // part of the audience leaves after lunch
    const lunch = s.breaks.find((b) => b.kind === "lunch");
    if (lunch && !s.timers.attrition && s.clock >= lunch.end - 5 && s.evId === "devfest") {
      s.timers.attrition = true;
      let p = s.fl.raffle ? 0.06 : 0.18;
      if (s.sat < 45) p *= 1.6;
      const gone = Math.round(c.hall * p);
      c.hall -= gone; c.left += gone;
      emit(s, "leave", { n: gone, why: "afternoon" });
    }
  }

  function onBreakStart(s, b) {
    emit(s, "break", { kind: b.kind, key: b.key });
    const sp = s.ev.spawn;
    if (b.kind === "coffee") {
      if (s.coffee > s.coffeeCap * 0.5) gain(s, 0.8);
      if (s.rng.chance((s.fl.sponsorPack ? 0.25 : 0.65) * sp.sponsor * s.coopK)) spawn(s, "sponsor", s.rng.chance(0.5) ? "sponsor1" : "sponsor2");
    }
    if (b.kind === "lunch") {
      if (s.fl.catering) { s.lunch.state = "served"; gain(s, 1.5); emit(s, "lunch", {}); }
      else if (s.rng.chance(0.75)) { s.lunch.state = "late"; if (!spawn(s, "pizza", "entrance")) { s.lunch.state = "served"; emit(s, "lunch", {}); } }
      else { s.lunch.state = "served"; gain(s, 1); emit(s, "lunch", {}); }
      if (s.rng.chance((s.fl.sponsorPack ? 0.15 : 0.4) * sp.sponsor)) spawn(s, "sponsor", s.rng.chance(0.5) ? "sponsor1" : "sponsor2");
    }
    if (s.rng.chance(0.5 * sp.flame)) spawn(s, "flame", s.rng.pick(["hall", "expo", "coffee"]));
  }

  // -------------------------------------------------------- random events
  function updateRandom(s, dt) {
    const c = s.clock, sc = s.script, sp = s.ev.spawn;
    const anyRunning = ["A", "B", "L"].some((r) => s.rooms[r].state === "running");
    s.timers.wifi -= dt;
    if (s.timers.wifi <= 0) {
      s.timers.wifi = (s.fl.networkCheck ? 95 : 62) * s.rng.range(0.7, 1.3) / Math.max(0.05, sp.wifi) * s.pace / s.coopK;
      if (anyRunning && sp.wifi > 0) spawn(s, "wifi", "router");
    }
    if (sc.printerAt > 0 && c >= sc.printerAt) { sc.printerAt = -1; spawn(s, "stampante", "checkin"); }
    if (sc.badgeAt > 0 && c >= sc.badgeAt) { sc.badgeAt = -1; spawn(s, "badge", "checkin"); }
    if (sc.cocAt > 0 && c >= sc.cocAt) { sc.cocAt = -1; spawn(s, "coc", s.rng.pick(["hall", "expo", "coffee", "doorB"])); }
    if (sc.tavoliAt > 0 && c >= sc.tavoliAt) { sc.tavoliAt = -1; spawn(s, "tavoli", "lab", { room: "L" }); }
    if (sc.vipAt > 0 && c >= sc.vipAt) { sc.vipAt = -1; if (spawn(s, "vip", "entrance")) emit(s, "vip", {}); }
    if (sc.pressAt > 0 && c >= sc.pressAt) { sc.pressAt = -1; if (spawn(s, "press", "expo")) emit(s, "press", {}); }
    if (sc.dogAt > 0 && c >= sc.dogAt) { sc.dogAt = -1; if (startCritter(s, "dog")) emit(s, "dog", {}); }
    if (sc.blackoutAt > 0 && c >= sc.blackoutAt) {
      const rooms = ["A", "B"].filter((r) => s.ev.rooms.includes(r) && s.rooms[r].state === "running");
      if (rooms.length) { sc.blackoutAt = -1; const r = s.rng.pick(rooms); if (spawn(s, "blackout", "quadro", { room: r })) emit(s, "blackout", { room: r }); }
    }
    if (s.timers.streamAt && c >= s.timers.streamAt) { s.timers.streamAt = 0; spawn(s, "stream", "av", { room: "A" }); }
    if (s.timers.demoHdmi && s.timers.demoHdmi.length && c >= s.timers.demoHdmi[0]) { s.timers.demoHdmi.shift(); if (s.rooms.A.state === "running") spawn(s, "hdmi", "stageA", { room: "A", demo: true }); }
    for (let i = 0; i < sc.kids.length; i++) if (sc.kids[i] > 0 && c >= sc.kids[i]) { sc.kids[i] = -1; startCritter(s, "kid"); }
    if (sc.accessAt > 0 && c >= sc.accessAt) { sc.accessAt = -1; startCritter(s, "access"); }
    if (sc.noiseAt > 0 && c >= sc.noiseAt) { sc.noiseAt = -1; if (spawn(s, "noise", "entrance")) emit(s, "noise", {}); }
    s.timers.foto -= dt;
    if (s.timers.foto <= 0) {
      s.timers.foto = (s.fl.photoLanyards ? 60 : 26) * s.rng.range(0.7, 1.3) / Math.max(0.05, sp.foto || 0) * s.pace / s.coopK;
      if ((sp.foto || 0) > 0 && s.crowd.hall + s.crowd.A > 10 && c < s.end - 15) spawn(s, "foto", s.rng.pick(["hall", "expo", "doorA"]));
    }
    s.timers.mentor -= dt;
    if (s.timers.mentor <= 0) {
      s.timers.mentor = 10 * s.rng.range(0.7, 1.3) / Math.max(0.05, sp.mentor || 0) * s.pace / s.coopK;
      const hacking = ["A", "L"].filter((r) => s.rooms[r].state === "running" && s.rooms[r].session >= 0 && s.sessions[s.rooms[r].session].kind === "hack");
      if ((sp.mentor || 0) > 0 && hacking.length) { const r = s.rng.pick(hacking); spawn(s, "mentor", r === "A" ? "tableA" : "tableL", { room: r }); }
    }
    if (sc.fireAt > 0 && c >= sc.fireAt && !s.fire) { sc.fireAt = -1; startFire(s); }
    if (s.fire && s.t >= s.fire.until) endFire(s);
    s.timers.perso -= dt;
    if (s.timers.perso <= 0) {
      s.timers.perso = (s.fl.signage ? 64 : 36) * s.rng.range(0.7, 1.3) / Math.max(0.05, sp.perso) * s.pace / s.coopK;
      if (sp.perso > 0 && s.crowd.hall > 10 && c < s.end - 30) spawn(s, "perso", s.rng.pick(["info", "hall", "expo"]));
    }
    for (const se of s.sessions) {
      if (se.room === "L" && s.prevClock < se.start + 2 && c >= se.start + 2 && sp.prese > 0) {
        if (s.rng.chance((s.fl.labReady ? 0.2 : 0.65) * sp.prese)) spawn(s, "prese", "lab", { room: "L" });
      }
    }
    for (let i = 0; i < sc.murphy.length; i++) if (sc.murphy[i] > 0 && c >= sc.murphy[i]) { sc.murphy[i] = -1; startMurphy(s); }
    updateMurphy(s, dt);
    updateCritters(s, dt);
  }

  function startFire(s) {
    const c = s.crowd;
    s.fire = { until: s.t + 16, saved: { A: c.A, B: c.B, L: c.L } };
    c.hall += c.A + c.B + c.L; c.A = 0; c.B = 0; c.L = 0;
    s.sat = clampSat(s.sat - 2);
    s.stats.firedrills++;
    emit(s, "firedrill", {});
  }
  function endFire(s) {
    const c = s.crowd, sv = s.fire.saved;
    for (const r of ["A", "B", "L"]) {
      if (s.rooms[r].state === "running" || s.rooms[r].state === "waiting") {
        const n = Math.min(sv[r], c.hall);
        c[r] += n; c.hall -= n;
      }
    }
    s.fire = null;
    emit(s, "firedrillEnd", {});
  }

  // someone to walk somewhere: a dog out, a child back to the kids' corner,
  // a guest to the main hall along the accessible route
  function startCritter(s, kind) {
    const C = DF.CRITTERS[kind];
    if (s.guards[kind] > 0) { s.guards[kind]--; s.stats.guarded++; emit(s, "guarded", { ptype: kind, st: C.from }); return null; }
    const from = ST[C.from];
    const d = { id: "d" + s.nextId++, kind, dest: C.dest, x: from.px, y: from.py + 10, path: null, pi: 0, state: "roam", follow: null, linger: 0, facing: -1 };
    s.critters.push(d);
    if (C.roam) wander(s, d, C.roam); else d.linger = 1e9; // waits where it is
    spawn(s, kind, null, { ent: d.id });
    emit(s, "critter", { kind, id: d.id });
    return d;
  }

  function critterOut(s, d, ok) {
    d.follow = null;
    d.state = "out";
    // the guest goes in, the child goes back to the corner, the dog trots away
    if (d.kind === "access" && ok) setPath(d, ST[d.dest].px, ST[d.dest].py - 30);
    else if (d.kind === "kid") setPath(d, ST.kids.px + 8, ST.kids.py + 6);
    else setPath(d, ST.entrance.px, ST.entrance.py + 26);
  }

  function updateCritters(s, dt) {
    for (const d of s.critters) {
      const C = DF.CRITTERS[d.kind];
      if (d.state === "roam") {
        if (d.path) followPath(d, C.speed, dt);
        else if (C.roam) { d.linger -= dt; if (d.linger <= 0) wander(s, d, C.roam.concat(s.ev.rooms.filter((r) => r !== "L"))); }
      } else if (d.state === "follow") {
        trail(s, d, dt);
        if (atStation(d, d.dest, ACT_R + 14)) {
          const pr = s.problems.find((p) => p.type === d.kind && p.ent === d.id && !p.done);
          if (pr) resolve(s, pr, "org");
          else critterOut(s, d, true);
        }
      } else if (d.state === "out") {
        if (!followPath(d, C.speed * 1.2, dt)) d.state = "gone";
      }
    }
    if (s.critters.length && s.critters.every((d) => d.state === "gone")) s.critters = [];
  }

  function startMurphy(s) {
    if (s.murphy && s.murphy.state !== "gone") return;
    const targets = ["router", "coffee"];
    if (s.rooms.A.state === "running") targets.push("stageA");
    if (s.rooms.B.state === "running") targets.push("stageB");
    const tgt = s.rng.pick(targets);
    const m = { x: ST.entrance.px, y: ST.entrance.py + 14, path: null, pi: 0, state: "walk", target: tgt, t: 0, facing: -1 };
    setPath(m, ST[tgt].px + 10, ST[tgt].py + 6);
    s.murphy = m;
    emit(s, "murphy", { target: tgt });
  }

  function updateMurphy(s, dt) {
    const m = s.murphy;
    if (!m || m.state === "gone") return;
    if (m.state === "walk") {
      if (!followPath(m, MURPHY_SPEED, dt)) { m.state = "sabotage"; m.t = 2.4; }
    } else if (m.state === "sabotage") {
      m.t -= dt;
      if (m.t <= 0) {
        s.stats.murphySabotage++;
        const t = m.target;
        let pr;
        if (t === "router") pr = spawn(s, "wifi", "router");
        else if (t === "coffee") { s.coffee = 0; pr = spawn(s, "coffee", "coffee"); }
        else pr = spawn(s, "hdmi", t, { room: ST[t].room });
        if (pr) pr.warn = 0;
        emit(s, "sabotage", { target: t, x: m.x, y: m.y });
        m.state = "flee";
        setPath(m, ST.entrance.px, ST.entrance.py + 18);
      }
    } else if (m.state === "flee") {
      if (!followPath(m, MURPHY_SPEED * 1.6, dt)) m.state = "gone";
    }
  }

  // ------------------------------------------------------------ problems
  function updateProblems(s, dt) {
    let active = 0;
    for (const pr of s.problems) {
      if (pr.done) continue;
      const def = P[pr.type];
      if (pr.warn > 0) {
        pr.warn -= dt;
        const [x, y] = anchorOf(s, pr);
        if (s.orgs.some((o) => o.stun <= 0 && near(o, x, y, ACT_R))) { resolve(s, pr, "prevented"); continue; }
        if (pr.warn <= 0) {
          pr.warn = 0;
          if (pr.type === "coffee") s.coffee = 0;
          emit(s, "spawn", { id: pr.id, ptype: pr.type, st: pr.st });
        }
        continue;
      }
      active++;
      const needCrew = def.crew || 1;
      const workers = pr.workers || 0;
      if (pr.workRate) {
        let rate = pr.workRate;
        if (workers < needCrew) rate *= 0.3; // a two-person job, done alone: slowly
        if ((pr.orgWorkers || 0) >= 2) { rate *= 1.15; if (!pr.synergy) { pr.synergy = true; s.stats.synergy++; emit(s, "synergy", { id: pr.id }); } }
        pr.progress += rate * dt;
        if (pr.improvisedNow) pr.improvised = true;
        if (pr.progress >= 1) { resolve(s, pr, pr.orgWorkers ? "org" : "vol"); continue; }
      } else if (pr.progress > 0) pr.progress = Math.max(0, pr.progress - 0.25 * dt);
      pr.blockedCrew = workers > 0 && workers < needCrew;
      pr.workRate = 0; pr.workers = 0; pr.orgWorkers = 0; pr.improvisedNow = false;

      s.sat = clampSat(s.sat - def.drain * dt * (pr.escalated ? 1.4 : 1) * (pr.rush ? 0.5 : 1));
      if (!pr.escalated) {
        pr.remain -= dt;
        if (pr.remain <= 0) { pr.remain = 0; escalate(s, pr); }
      }
    }
    if (s.fire) s.sat = clampSat(s.sat - 0.03 * dt);
    const panic = active >= 4;
    if (panic && !s.panic) emit(s, "panic", { n: active });
    s.panic = panic;
    if (panic) s.stats.panicTime += dt;
    if (s.problems.length > 60) s.problems = s.problems.filter((p) => !p.done);
  }

  // ------------------------------------------------------------- goals
  // live state of a goal: "ok" and "fail" are final, "pending" waits for the end
  function goalLive(s, g) {
    const st = s.stats, b = (k) => st.byType[k] || { escalated: 0, fixed: 0 };
    switch (g.id) {
      case "onTime": return st.talksLate || st.talksCancelled ? "fail" : "pending";
      case "noCancel": return st.talksCancelled ? "fail" : "pending";
      case "pizza": return st.lunchLate ? "fail" : s.lunch.state === "served" ? "ok" : "pending";
      case "lab": return b("prese").escalated + b("tavoli").escalated + b("quota").escalated > 0 || st.labCancelled ? "fail" : "pending";
      case "chat": return st.chatAnswered >= (g.n || 3) ? "ok" : "pending";
      case "care": return b("kid").escalated + b("access").escalated > 0 ? "fail" : "pending";
      case "coc": return b("coc").escalated > 0 ? "fail" : "pending";
      case "stream": return b("stream").escalated > 0 ? "fail" : "pending";
      case "vip": return st.vipDone > 0 ? "ok" : b("vip").escalated > 0 ? "fail" : "pending";
      case "mentors": return b("mentor").fixed >= (g.n || 6) ? "ok" : "pending";
      case "demo": return st.demoFail > 0 ? "fail" : "pending";
      case "murphy": return st.murphyCaught > 0 ? "ok" : "pending";
      default: return "pending"; // rating: at the end
    }
  }
  const SURVIVE = ["onTime", "noCancel", "lab", "care", "coc", "stream", "demo"]; // kept until the end = met

  function updateGoals(s) {
    for (const g of s.goals) {
      if (g.state !== "pending") continue;
      const st = goalLive(s, g);
      if (st !== "pending") { g.state = st; emit(s, "goal", { id: g.id, ok: st === "ok" }); }
    }
  }

  function finalGoals(s, feedback) {
    return s.goals.map((g) => {
      let ok = g.state === "ok";
      if (g.state === "pending") {
        if (g.id === "rating") ok = feedback >= (g.min || 3.5);
        else if (g.id === "pizza") ok = s.lunch.state === "served" && !s.stats.lunchLate;
        else ok = SURVIVE.includes(g.id);
      }
      return { id: g.id, ok, min: g.min, n: g.n };
    });
  }

  // ---------------------------------------------------------------- step
  function stepDay(s, dt, inputs) {
    if (s.over) return;
    dt = Math.min(dt, 0.1);
    s.t += dt;
    s.prevClock = s.clock;
    s.clock = Math.min(s.end, s.clock + dt * s.k);

    for (const o of s.orgs) updateOrg(s, o, inputs && inputs[o.id], dt);
    for (const v of s.vols) updateVol(s, v, dt);
    updateSpeakers(s, dt);
    updateChat(s);
    updateRooms(s, dt);
    updateCrowd(s, dt);
    updateRandom(s, dt);
    updateProblems(s, dt);
    updateRush(s);
    updateGoals(s);

    const raffle = s.sessions.find((se) => se.kind === "raffle");
    if (!s.photo && s.clock >= (raffle ? raffle.end : s.end - 10)) {
      s.photo = true;
      gain(s, 1);
      emit(s, "photo", {});
    }
    if (s.clock >= s.end) { s.over = true; emit(s, "end", {}); }
  }

  // Final numbers for the retro.
  function summary(s) {
    const c = s.crowd;
    const present = Math.max(0, c.checkedIn - c.left);
    const feedback = 1 + 4 * (s.sat / 100);
    const goals = finalGoals(s, feedback);
    const stars = goals.filter((g) => g.ok).length;
    return {
      event: s.evId, soldout: !!s.ev.soldout, feedback, stars, goals, score: s.score, bestCombo: s.bestCombo,
      attendees: c.checkedIn, present, left: c.left, expected: c.expected, maxQueue: c.maxQueue,
      stats: s.stats,
    };
  }

  DF.Sim = { createDay, stepDay, summary, workableProblem, anchorOf, entity, goalLive, isNight, volPostFor, ACT_R, TOUCH_R, stageOf };
})();
