/* net.js: online rooms for leads in different cities.
 *
 * The host's browser runs the game; guests send their inputs and render the
 * host's snapshots. Two transports with the same small API:
 *   - Firebase Realtime Database + anonymous auth (window.DF_FIREBASE set by
 *     firebase-config.js, or ?emu for the local emulator);
 *   - BroadcastChannel: two tabs of the same browser, no setup (preview/QA).
 *
 * Channels are "latest wins" state (lobby, prep, run, snap, retro); guest ->
 * host traffic is a queue of messages plus one latest-wins input per player. */
"use strict";

(function () {
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  const newId = () => "u" + Math.random().toString(36).slice(2, 10);

  // ------------------------------------------------------- BroadcastChannel
  function localTransport() {
    let bc = null, me = null, code = null, host = false;
    const subs = {}, latest = {};
    let onMsg = null, onInput = null, onPlayers = null, onGone = null;
    const players = {};
    let beat = null;

    // JSON round-trip, like Firebase does: functions and undefined disappear
    function post(m) { if (bc) bc.postMessage(JSON.parse(JSON.stringify(Object.assign({ from: me }, m)))); }
    function handle(m) {
      if (!m || m.from === me) return;
      switch (m.k) {
        case "pub": latest[m.ch] = m.data; (subs[m.ch] || []).forEach((cb) => cb(m.data)); break;
        case "msg": if (host && onMsg) onMsg(m.from, m.data); break;
        case "input": if (host && onInput) onInput(m.from, m.data); break;
        case "hello":
          if (host) { players[m.from] = Object.assign({ id: m.from, seen: Date.now() }, m.data); if (onPlayers) onPlayers(Object.assign({}, players)); for (const ch in latest) post({ k: "pub", ch, data: latest[ch] }); }
          break;
        case "beat": if (host && players[m.from]) players[m.from].seen = Date.now(); break;
        case "bye":
          if (host && players[m.from]) { delete players[m.from]; if (onPlayers) onPlayers(Object.assign({}, players)); }
          if (!host && m.from === "host" && onGone) onGone();
          break;
      }
    }
    return {
      kind: "local",
      label: "Schede di questo browser",
      async create(profile) {
        code = newCode(); me = "host"; host = true;
        bc = new BroadcastChannel("lmh-df-" + code);
        bc.onmessage = (e) => handle(e.data);
        players[me] = Object.assign({ id: me, seen: Date.now() }, profile);
        beat = setInterval(() => {
          const now = Date.now();
          let changed = false;
          for (const id in players) if (id !== me && now - players[id].seen > 6000) { delete players[id]; changed = true; }
          if (changed && onPlayers) onPlayers(Object.assign({}, players));
        }, 2000);
        return { code, me };
      },
      async join(c, profile) {
        code = c.toUpperCase(); me = newId(); host = false;
        bc = new BroadcastChannel("lmh-df-" + code);
        bc.onmessage = (e) => handle(e.data);
        post({ k: "hello", data: profile });
        beat = setInterval(() => post({ k: "beat" }), 2000);
        // no reply within a while: there is no such room
        await new Promise((r) => setTimeout(r, 700));
        if (!latest.lobby) { this.leave(); throw new Error("Stanza " + code + " non trovata (in questa modalità, l'host deve essere una scheda aperta di questo browser)."); }
        return { code, me };
      },
      publish(ch, data) { latest[ch] = JSON.parse(JSON.stringify(data)); post({ k: "pub", ch, data }); },
      subscribe(ch, cb) { (subs[ch] || (subs[ch] = [])).push(cb); if (latest[ch]) cb(latest[ch]); },
      send(data) { post({ k: "msg", data }); },
      setInput(data) { post({ k: "input", data }); },
      onMessage(cb) { onMsg = cb; },
      onInput(cb) { onInput = cb; },
      onPlayers(cb) { onPlayers = cb; cb(Object.assign({}, players)); },
      onHostGone(cb) { onGone = cb; },
      leave() { post({ k: "bye" }); clearInterval(beat); if (bc) bc.close(); bc = null; },
    };
  }

  // ------------------------------------------- Firebase Realtime Database
  function firebaseTransport(config, emulator) {
    let db = null, uid = null, code = null, host = false, ref = null;
    const offs = [];
    let onGone = null;
    async function init() {
      if (db) return;
      // a named app per tab keeps each tab's anonymous user separate; App Check
      // (js/fb.js) loads only when someone opens an online room
      const { fb, app } = await DF.Firebase.app(config, "lmh-" + Math.random().toString(36).slice(2, 10), emulator);
      const auth = app.auth();
      db = app.database();
      if (emulator) {
        auth.useEmulator("http://127.0.0.1:9099");
        db.useEmulator("127.0.0.1", 9000);
      }
      // one anonymous player per tab: two tabs of one browser are two leads
      await auth.setPersistence(fb.auth.Auth.Persistence.NONE);
      const cred = await auth.signInAnonymously();
      uid = cred.user.uid;
    }
    const roomRef = () => db.ref("rooms/" + code);
    function listen(r, ev, cb) { r.on(ev, cb); offs.push(() => r.off(ev, cb)); }

    return {
      kind: "firebase",
      label: emulator ? "Firebase (emulatore locale)" : "Firebase",
      async create(profile) {
        await init();
        host = true;
        for (let i = 0; i < 6; i++) {
          code = newCode();
          const res = await roomRef().child("meta").transaction((cur) => (cur ? undefined : { host: uid, created: Date.now(), v: 1 }));
          if (res.committed) break;
          code = null;
        }
        if (!code) throw new Error("Non riesco a creare la stanza, riprova.");
        ref = roomRef();
        await ref.child("players/" + uid).set(Object.assign({ id: uid }, profile));
        ref.child("players/" + uid).onDisconnect().remove();
        ref.onDisconnect().remove(); // the host leaving closes the room
        return { code, me: uid };
      },
      async join(c, profile) {
        await init();
        code = c.toUpperCase(); host = false;
        ref = roomRef();
        const meta = await ref.child("meta").once("value");
        if (!meta.exists()) throw new Error("Stanza " + code + " non trovata.");
        await ref.child("players/" + uid).set(Object.assign({ id: uid }, profile));
        ref.child("players/" + uid).onDisconnect().remove();
        listen(ref.child("meta"), "value", (snap) => { if (!snap.exists() && onGone) onGone(); });
        return { code, me: uid };
      },
      publish(ch, data) { ref.child("state/" + ch).set(JSON.stringify(data)); },
      subscribe(ch, cb) { listen(ref.child("state/" + ch), "value", (snap) => { const v = snap.val(); if (v) cb(JSON.parse(v)); }); },
      send(data) { ref.child("toHost").push({ from: uid, data: JSON.stringify(data) }); },
      setInput(data) { ref.child("inputs/" + uid).set(JSON.stringify(data)); },
      onMessage(cb) {
        listen(ref.child("toHost"), "child_added", (snap) => {
          const v = snap.val();
          snap.ref.remove();
          if (v) cb(v.from, JSON.parse(v.data));
        });
      },
      onInput(cb) { listen(ref.child("inputs"), "child_changed", (snap) => cb(snap.key, JSON.parse(snap.val()))); listen(ref.child("inputs"), "child_added", (snap) => cb(snap.key, JSON.parse(snap.val()))); },
      onPlayers(cb) { listen(ref.child("players"), "value", (snap) => cb(snap.val() || {})); },
      onHostGone(cb) { onGone = cb; },
      leave() {
        offs.splice(0).forEach((f) => f());
        if (ref) { if (host) ref.remove(); else ref.child("players/" + uid).remove(); }
      },
    };
  }

  function pickTransport() {
    const q = new URLSearchParams(location.search);
    if (q.has("emu")) return firebaseTransport({ apiKey: "demo-key", projectId: "demo-lmh", databaseURL: "http://127.0.0.1:9000?ns=demo-lmh" }, true);
    if (window.DF_FIREBASE) return firebaseTransport(window.DF_FIREBASE, false);
    if (typeof BroadcastChannel !== "undefined") return localTransport();
    return null;
  }

  // -------------------------------------------- compact day snapshots
  const r1 = (v) => Math.round(v);
  function snapshot(s, events) {
    return {
      t: +s.t.toFixed(2), clock: +s.clock.toFixed(2), sat: +s.sat.toFixed(2), score: s.score, combo: s.combo, over: s.over,
      coffee: r1(s.coffee), breakIdx: s.breakIdx,
      orgs: s.orgs.map((o) => [o.id, r1(o.x), r1(o.y), r1(o.energy), +o.stun.toFixed(1), o.carry.join(","), o.working ? 1 : 0, o.moving ? 1 : 0, o.facing, Math.ceil(o.abCd || 0)]),
      vols: s.vols.map((v) => [v.id, r1(v.x), r1(v.y), v.post, v.busy ? 1 : 0, v.path ? 1 : 0]),
      sp: s.speakers.filter((q) => q.state !== "off" && q.state !== "gone").map((q) => [q.id, r1(q.x), r1(q.y), q.state, q.name, q.session, q.room, q.path ? 1 : 0]),
      m: s.murphy && s.murphy.state !== "gone" ? [r1(s.murphy.x), r1(s.murphy.y), s.murphy.state] : null,
      pr: s.problems.filter((p) => !p.done).map((p) => [p.id, p.type, p.st, p.ent || 0, +p.warn.toFixed(1), +p.remain.toFixed(1), p.dur, +p.progress.toFixed(2), p.escalated ? 1 : 0, p.blockedCrew ? 1 : 0, p.room || 0]),
      cr: [s.crowd.queue, s.crowd.hall, s.crowd.A, s.crowd.B, s.crowd.L, s.crowd.overflow.A, s.crowd.overflow.B],
      rm: ["A", "B", "L"].map((k) => [s.rooms[k].state, s.rooms[k].session, +s.rooms[k].delay.toFixed(1)]),
      ev: events,
      paused: !!(DF.Game && DF.Game.paused),
      cr2: (s.critters || []).filter((d) => d.state !== "gone").map((d) => [d.id, r1(d.x), r1(d.y), d.state, d.facing, d.path ? 1 : 0, d.kind, d.dest]),
      gl: (s.goals || []).map((g) => [g.id, g.state]),
      fire: s.fire ? 1 : 0, panic: s.panic ? 1 : 0,
      chat: s.chat.slice(-6).map((m) => [m.id, m.tpl || 0, m.from, m.text, m.replies || 0, m.open ? 1 : 0, m.open ? +(m.deadline - s.t).toFixed(1) : 0, m.span || 0]),
      orgTalk: s.orgs.map((o) => [o.talking > 0 ? 1 : 0, o.bubble]),
    };
  }

  // A render-ready state object built from snapshots, smoothing positions.
  function mirror(run) {
    const lo = run.loadout, players = run.players, ev = DF.EVENTS[run.event || lo.event || "devfest"];
    return {
      mirror: true, venue: DF.venueFor(run.event || lo.event || "devfest", run.venue), lo, fl: lo.flags || {}, ev, evId: run.event || lo.event || "devfest", sessions: ev.sessions, breaks: ev.breaks, start: ev.start, end: ev.end,
      t: 0, clock: ev.start, sat: 60, score: 0, combo: 0, over: false, critters: [], chat: [], fire: null, panic: false,
      goals: (ev.goals || []).map((g) => Object.assign({}, g, { state: "pending" })),
      coffee: lo.coffeeCap || 100, coffeeCap: lo.coffeeCap || 100, breakIdx: -1,
      orgs: players.map((p) => ({ id: p.id, role: p.role, name: p.name, x: DF.Venue.STATIONS.box.px, y: DF.Venue.STATIONS.box.py + 20, tx: 0, ty: 0, carry: [], energy: 100, stun: 0, talking: 0, bubble: -1, working: null, moving: false, facing: 1 })),
      vols: [], speakers: [], murphy: null, problems: [],
      crowd: { queue: 0, hall: 0, A: 0, B: 0, L: 0, overflow: { A: 0, B: 0 } },
      rooms: { A: { state: "idle", session: -1, delay: 0 }, B: { state: "idle", session: -1, delay: 0 }, L: { state: "idle", session: -1, delay: 0 } },
      events: [], lastEv: 0,
    };
  }

  function applySnapshot(m, sn) {
    m.t = sn.t; m.clock = sn.clock; m.sat = sn.sat; m.score = sn.score; m.combo = sn.combo; m.over = sn.over;
    m.coffee = sn.coffee; m.breakIdx = sn.breakIdx;
    if (sn.paused && !m.paused) DF.UI.toast("⏸️ " + DF.t("radio.hostPaused"), "info", 3);
    m.paused = !!sn.paused;
    for (const [id, x, y, energy, stun, carry, working, moving, facing, abCd] of sn.orgs) {
      const o = m.orgs.find((q) => q.id === id);
      if (!o) continue;
      o.tx = x; o.ty = y; o.energy = energy; o.stun = stun; o.carry = carry ? carry.split(",") : []; o.working = working ? 1 : null; o.moving = !!moving; o.facing = facing; o.abCd = abCd || 0;
      if (!o.seen) { o.x = x; o.y = y; o.seen = true; }
    }
    const vols = {};
    m.vols.forEach((v) => { vols[v.id] = v; });
    m.vols = sn.vols.map(([id, x, y, post, busy, moving]) => { const v = vols[id] || { id, x, y }; v.tx = x; v.ty = y; v.post = post; v.busy = busy; v.path = moving ? 1 : null; return v; });
    const sps = {};
    m.speakers.forEach((q) => { sps[q.id] = q; });
    m.speakers = sn.sp.map(([id, x, y, state, name, session, room, moving]) => { const q = sps[id] || { id, x, y }; q.tx = x; q.ty = y; q.state = state; q.name = name; q.session = session; q.room = room; q.path = moving ? 1 : null; return q; });
    if (sn.m) { if (!m.murphy) m.murphy = { x: sn.m[0], y: sn.m[1] }; m.murphy.tx = sn.m[0]; m.murphy.ty = sn.m[1]; m.murphy.state = sn.m[2]; }
    else m.murphy = null;
    m.problems = sn.pr.map(([id, type, st, ent, warn, remain, dur, progress, escalated, blockedCrew, room]) => ({ id, type, st, ent: ent || null, warn, remain, dur, progress, escalated: !!escalated, blockedCrew: !!blockedCrew, room: room || null, done: false }));
    const [queue, hall, A, B, L, oA, oB] = sn.cr;
    Object.assign(m.crowd, { queue, hall, A, B, L }); m.crowd.overflow.A = oA; m.crowd.overflow.B = oB;
    ["A", "B", "L"].forEach((k, i) => { const [state, session, delay] = sn.rm[i]; Object.assign(m.rooms[k], { state, session, delay }); });
    for (const e of sn.ev || []) if (e.n > m.lastEv) { m.events.push(e); m.lastEv = e.n; }
    const crit = {};
    m.critters.forEach((d) => { crit[d.id] = d; });
    m.critters = (sn.cr2 || []).map(([id, x, y, state, facing, moving, kind, dest]) => { const d = crit[id] || { id, x, y }; d.tx = x; d.ty = y; d.state = state; d.facing = facing; d.path = moving ? 1 : null; d.kind = kind || "dog"; d.dest = dest || "entrance"; return d; });
    for (const [id, state] of sn.gl || []) { const g = m.goals.find((q) => q.id === id); if (g) g.state = state; }
    m.fire = sn.fire ? {} : null; m.panic = !!sn.panic;
    // the staff chat: keep what we have, update open/closed and deadlines
    for (const [id, tpl, from, text, replies, open, left, span] of sn.chat || []) {
      let c = m.chat.find((q) => q.id === id);
      if (!c) { c = { id, tpl: tpl || null, from, text, replies: replies || null, t: m.t }; m.chat.push(c); }
      c.open = !!open; c.deadline = m.t + left; c.span = span || 0;
    }
    if (m.chat.length > 30) m.chat.splice(0, m.chat.length - 30);
    (sn.orgTalk || []).forEach(([talk, bubble], i) => { const o = m.orgs[i]; if (o) { o.talking = talk ? 1 : 0; o.bubble = bubble; } });
  }

  function smooth(m, dt) {
    const k = 1 - Math.exp(-dt * 14);
    const step = (e) => { if (e.tx == null) return; e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; };
    m.orgs.forEach(step); m.vols.forEach(step); m.speakers.forEach(step); m.critters.forEach(step); if (m.murphy) step(m.murphy);
  }

  DF.Net = { pickTransport, snapshot, mirror, applySnapshot, smooth };
})();
