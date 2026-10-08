/* account.js: the optional Google account. Never needed to play.
 *
 * With it the season (stars, kit, forged cards, chapter) follows the player
 * across devices, and their chapter can join the board. Firebase loads only
 * when the account screen opens or this device signed in before.
 * Data: users/<uid> (owner only: the season as JSON, the contact consent) and
 * lb/u/<uid> (chapter name and stars, only if the player opts in); the board
 * itself comes from /api/board (functions/index.js). */
"use strict";

(function () {
  const FLAG = "ovb_acct"; // this device signed in before: restore the session at boot
  const SYNC = ["ovb_progress", "ovb_best", "ovb_kit", "ovb_mycards", "ovb_chapter", "ovb_city", "ovb_medals"];
  const q = new URLSearchParams(location.search);
  const emu = q.has("emu");
  const web = /^https?:$/.test(location.protocol);
  const cfg = emu ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-lmh", databaseURL: "http://127.0.0.1:9000?ns=demo-lmh", googleSignIn: true } : window.DF_FIREBASE;
  const API = emu ? "http://127.0.0.1:5001/demo-lmh/europe-west1/api" : "/api";
  const F = { fb: null, auth: null, db: null };
  const subs = [];

  const A = {
    available: !!(web && cfg && cfg.googleSignIn),
    net: !!(web && cfg && !window.DF_NO_STATS),   // the project is reachable: the weekly cup works even without Google sign-in
    boardAvailable: !!(web && cfg && cfg.googleSignIn && !window.DF_NO_STATS), // only signed-in players fill it
    ready: false,       // SDK loaded: the sign-in popup can open inside the click
    status: "out",      // out | in
    user: null,         // { uid, name, email }
    busy: false,
    error: null,        // a key of ui.acct.err
    sync: { at: 0, busy: false, err: null },
    doc: null,          // the last synced season (with the board opt-in)
    consent: null,      // { ok, at }
    needReauth: false,
  };
  if (!A.available) A.status = "off";

  const emit = (kind) => subs.forEach((fn) => { try { fn(kind || "user"); } catch (e) { console.warn(e); } });
  A.onChange = (fn) => subs.push(fn);

  function errKey(e) {
    const c = (e && e.code) || "";
    if (/popup-blocked/.test(c)) return "popup";
    if (/popup-closed|cancelled-popup|user-cancelled/.test(c)) return null; // the player changed their mind
    if (/operation-not-allowed|admin-restricted/.test(c)) return "disabled";
    if (/unauthorized-domain/.test(c)) return "domain";
    if (/network/.test(c)) return "network";
    if (/app-check|appCheck/i.test(c + " " + ((e && e.message) || ""))) return "check";
    if (/PERMISSION_DENIED/i.test(c + " " + ((e && e.message) || ""))) return "denied";
    return "generic";
  }

  // ------------------------------------------------------------- the SDK
  let initP = null;
  A.prepare = function () {
    if (!A.net) return Promise.resolve(false);
    if (!initP) initP = (async () => {
      const { fb, app } = await DF.Firebase.app(cfg, "ovb-account", emu);
      F.fb = fb; F.app = app; F.auth = app.auth(); F.db = app.database();
      if (emu) { F.auth.useEmulator("http://127.0.0.1:9099"); F.db.useEmulator("127.0.0.1", 9000); }
      F.auth.useDeviceLanguage();
      // warm up what the popup waits for (App Check token, auth iframe), so it
      // opens inside the click and no popup blocker steps in
      try { if (!emu && cfg.appCheckSiteKey) await app.appCheck().getToken(); } catch (e) { /* the sign-in will say */ }
      try { await F.auth.getRedirectResult(); } catch (e) { /* nothing pending */ }
      await new Promise((res) => { const off = F.auth.onAuthStateChanged(() => { off(); res(); }); });
      F.auth.onAuthStateChanged(onUser);
      A.ready = true;
      emit("ready");
      return true;
    })().catch((e) => { console.warn("account:", e); initP = null; A.error = "load"; emit(); return false; });
    return initP;
  };

  function onUser(u) {
    if (u && !u.isAnonymous) {
      const fresh = !A.user || A.user.uid !== u.uid;
      A.user = { uid: u.uid, name: u.displayName || "", email: u.email || "" };
      A.status = "in";
      DF.storage.set(FLAG, true);
      if (fresh) pull();
    } else {
      A.user = null; A.status = A.available ? "out" : "off"; A.doc = null; A.consent = null; A.needReauth = false; lastBoard = null;
      DF.storage.set(FLAG, false);
    }
    emit();
  }

  const provider = () => { const p = new F.fb.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" }); return p; };

  // called straight from the click: the popup must open before any await
  A.signIn = function () {
    if (!A.ready || A.busy) return Promise.resolve(false);
    A.error = null; A.busy = true;
    const op = F.auth.signInWithPopup(provider());
    emit();
    return op.then(() => { if (DF.Stats) DF.Stats.login(); return true; }, (e) => { A.error = errKey(e); return false; })
      .finally(() => { A.busy = false; emit(); });
  };

  A.signOut = async function () {
    if (!F.auth) return;
    if (timer) { clearTimeout(timer); timer = null; await push(); }
    await F.auth.signOut();
  };

  // ------------------------------------------------------------ the season
  const get = (k, f) => DF.storage.get(k, f);
  function localDoc() {
    return { v: 1, progress: get("ovb_progress", {}) || {}, best: get("ovb_best", null), kit: get("ovb_kit", {}) || {}, cards: get("ovb_mycards", []) || [], chapter: get("ovb_chapter", null), city: get("ovb_city", null), medals: get("ovb_medals", {}) || {}, lb: !!(A.doc && A.doc.lb) };
  }
  const better = (a, b) => (!b ? a : !a ? b : a.stars > b.stars || (a.stars === b.stars && (a.fb || 0) >= (b.fb || 0)) ? a : b);
  // pull: the account's settings win and the cards of both sides add up;
  // push: this device's settings and cards win. Records keep the best of both.
  function merge(local, remote, prefer) {
    if (!remote || typeof remote !== "object") return local;
    const pick = (k) => (prefer === "remote" ? (remote[k] != null ? remote[k] : local[k]) : (local[k] != null ? local[k] : remote[k]));
    const progress = {};
    for (const ev of new Set(Object.keys(remote.progress || {}).concat(Object.keys(local.progress || {})))) {
      const l = (local.progress || {})[ev], r = (remote.progress || {})[ev], b = better(l, r);
      const hard = Math.max(l && l.hard != null ? l.hard : -1, r && r.hard != null ? r.hard : -1); // the sold-out best, from either side
      progress[ev] = hard >= 0 ? Object.assign({}, b, { hard }) : b;
    }
    const lb = local.best, rb = remote.best;
    let cards = local.cards || [];
    if (prefer === "remote") {
      const seen = new Set();
      cards = (remote.cards || []).concat(local.cards || []).filter((c) => c && c.id && !seen.has(c.id) && seen.add(c.id));
    }
    return { v: 1, progress, best: !lb ? rb || null : !rb ? lb : lb.feedback >= rb.feedback ? lb : rb, kit: pick("kit") || {}, cards: cards.slice(-40), chapter: pick("chapter"), city: pick("city"), medals: Object.assign({}, remote.medals, local.medals), lb: !!pick("lb") };
  }

  let applying = false;
  function applyLocal(doc) {
    const want = { ovb_progress: doc.progress, ovb_best: doc.best, ovb_kit: doc.kit, ovb_mycards: doc.cards, ovb_chapter: doc.chapter, ovb_city: doc.city, ovb_medals: doc.medals };
    let changed = false;
    applying = true;
    for (const [k, v] of Object.entries(want)) {
      if (v == null || JSON.stringify(get(k, null)) === JSON.stringify(v)) continue;
      DF.storage.set(k, v); changed = true;
    }
    applying = false;
    if (changed && DF.UI && DF.UI.syncFromStorage) DF.UI.syncFromStorage();
  }

  // a chapter's name as the board stores it (functions/stats.js cleanName)
  A.cleanName = (s) => { const n = String(s || "").normalize("NFC").replace(/[^\p{L}\p{N} &'.-]/gu, " ").replace(/\s+/g, " ").trim(); return n.length >= 2 && n.length <= 40 ? n : ""; };
  A.slug = (s) => A.cleanName(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  A.isChapter = (s) => /^(GDG|GDSC|WTM|Google Developer (Groups?|Student Clubs?))(\s|$)/i.test(A.cleanName(s));
  A.starsOf = (progress) => Math.min(18, Object.values(progress || {}).reduce((a, p) => a + ((p && p.stars) || 0), 0));

  let lastBoard = null; // what lb/u/<uid> holds, as [name, stars] JSON ("" when off the board)
  async function write(doc) {
    const uid = A.user.uid, TS = F.fb.database.ServerValue.TIMESTAMP;
    let d = JSON.stringify(doc);
    while (d.length > 60000 && doc.cards.length) { doc.cards.shift(); d = JSON.stringify(doc); }
    await F.db.ref("users/" + uid).update({ d, t: TS });
    A.doc = doc;
    const name = A.cleanName(doc.chapter), stars = A.starsOf(doc.progress);
    const want = doc.lb && name ? JSON.stringify([name, stars]) : "";
    if (want !== lastBoard) {
      const ref = F.db.ref("lb/u/" + uid);
      if (want) await ref.set({ n: name, s: stars, t: TS }); else await ref.remove();
      lastBoard = want;
    }
  }

  async function pull() {
    if (!A.user) return;
    const uid = A.user.uid;
    A.sync.busy = true; emit("sync");
    try {
      const [snap, mine] = await Promise.all([F.db.ref("users/" + uid).get(), F.db.ref("lb/u/" + uid).get()]);
      const v = snap.val() || {}, b = mine.val();
      lastBoard = b && b.n ? JSON.stringify([b.n, b.s]) : "";
      A.consent = v.c ? { ok: !!v.c.ok, at: v.c.at || 0 } : null;
      let remote = null;
      try { remote = typeof v.d === "string" ? JSON.parse(v.d) : null; } catch (e) { remote = null; }
      const doc = merge(localDoc(), remote, "remote");
      applyLocal(doc);
      await write(doc);
      A.sync.at = Date.now(); A.sync.err = null;
    } catch (e) { console.warn("account pull:", e); A.sync.err = errKey(e) || "generic"; }
    A.sync.busy = false;
    emit("user");
  }

  let timer = null, pushing = null;
  function schedule() {
    if (A.status !== "in" || A.deleting) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; push(); }, 2500);
  }
  function push() {
    if (A.status !== "in" || !A.user || A.deleting) return Promise.resolve();
    if (pushing) return pushing.then(() => push());
    pushing = (async () => {
      A.sync.busy = true; emit("sync");
      try {
        const snap = await F.db.ref("users/" + A.user.uid + "/d").get();
        let remote = null;
        try { remote = typeof snap.val() === "string" ? JSON.parse(snap.val()) : null; } catch (e) { remote = null; }
        const doc = merge(localDoc(), remote, "local");
        applyLocal(doc);
        await write(doc);
        A.sync.at = Date.now(); A.sync.err = null;
      } catch (e) { console.warn("account push:", e); A.sync.err = errKey(e) || "generic"; }
      A.sync.busy = false; pushing = null;
      emit("sync");
    })();
    return pushing;
  }

  // every save of a synced key (stars, kit, cards, chapter) goes up a moment later
  const rawSet = DF.storage.set;
  DF.storage.set = function (key, value) {
    rawSet.call(DF.storage, key, value);
    if (!applying && SYNC.includes(key)) schedule();
  };
  document.addEventListener("visibilitychange", () => { if (document.hidden && timer) { clearTimeout(timer); timer = null; push(); } });

  // ------------------------------------------------- board, consent, delete
  A.setBoard = function (on) {
    A.doc = Object.assign({}, A.doc || localDoc(), { lb: !!on });
    return push();
  };

  A.setConsent = async function (ok) {
    if (!A.user) return false;
    const TS = F.fb.database.ServerValue.TIMESTAMP;
    try {
      await F.db.ref("users/" + A.user.uid + "/c").set(ok ? { ok: true, at: TS, email: A.user.email } : { ok: false, at: TS });
      A.consent = { ok: !!ok, at: Date.now() };
      A.error = null;
    } catch (e) { A.error = errKey(e) || "generic"; }
    emit();
    return !A.error;
  };

  // data first, then the account; Google may ask to sign in again first
  A.deleteAccount = async function () {
    const u = F.auth && F.auth.currentUser;
    if (!u) return false;
    A.deleting = true; clearTimeout(timer); timer = null;
    A.busy = true; A.error = null; emit();
    try {
      await F.db.ref("lb/u/" + u.uid).remove();
      await F.db.ref("users/" + u.uid).remove();
      await u.delete();
      A.deleting = false; A.busy = false;
      DF.storage.set(FLAG, false);
      emit();
      return true;
    } catch (e) {
      A.busy = false;
      if (e && e.code === "auth/requires-recent-login") A.needReauth = true;
      else { A.error = errKey(e) || "generic"; A.deleting = false; }
      emit();
      return false;
    }
  };
  // straight from the click, like the sign-in
  A.reauthAndDelete = function () {
    const u = F.auth && F.auth.currentUser;
    if (!u) return Promise.resolve(false);
    const op = u.reauthenticateWithPopup(provider());
    return op.then(() => { A.needReauth = false; return A.deleteAccount(); }, (e) => { A.error = errKey(e); A.deleting = false; A.needReauth = false; emit(); return false; });
  };

  // the weekly challenge: the recorded day goes to the server, which replays it.
  // Without a Google account the device signs in anonymously (App Check guards both).
  A.submitWeekly = async function (body) {
    if (!A.net) return { ok: false, why: "offline" };
    try {
      if (!(await A.prepare())) return { ok: false, why: "load" };
      if (!F.auth.currentUser) await F.auth.signInAnonymously();
      const headers = { "Content-Type": "application/json", Authorization: "Bearer " + (await F.auth.currentUser.getIdToken()) };
      if (!emu && cfg.appCheckSiteKey) headers["X-Firebase-AppCheck"] = (await F.app.appCheck().getToken()).token;
      const r = await fetch(API + "/weekly", { method: "POST", headers, body: JSON.stringify(body), credentials: "omit" });
      const j = await r.json().catch(() => ({}));
      return r.ok ? Object.assign({ ok: true }, j) : { ok: false, why: j.error || "http" };
    } catch (e) { console.warn("weekly:", e); return { ok: false, why: errKey(e) || "generic" }; }
  };
  A.cup = async function (w) {
    const r = await fetch(API + "/cup?w=" + encodeURIComponent(w), { credentials: "omit", cache: "no-store" });
    if (!r.ok) throw new Error("cup " + r.status);
    return r.json();
  };

  A.board = async function () {
    const r = await fetch(API + "/board", { credentials: "omit" });
    if (!r.ok) throw new Error("board " + r.status);
    const b = await r.json();
    return { rows: Array.isArray(b.rows) ? b.rows : [], chapters: b.chapters || 0, players: b.players || 0 };
  };

  // a device that signed in before restores its session in the background
  if (A.available && DF.storage.get(FLAG, false)) setTimeout(() => A.prepare(), 0);

  DF.Account = A;
})();
