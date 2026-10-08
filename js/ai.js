/* ai.js: Gemini at runtime — an extra, never required, off by default.
 * Two ways to switch it on:
 *  - "key": the player's own Gemini key. It lives only in this browser (this
 *    session, or this device if they say so) and goes only to Google: no game
 *    server ever sees it.
 *  - "server": whoever hosts the game runs server/server.mjs with their key;
 *    the key stays on that server.
 * Either way the tasks are the same (js/ai-tasks.js): fixed prompts,
 * structured output, everything validated again here. When AI is off every
 * call resolves to null and the game uses its offline content. */
"use strict";

(function () {
  const KEY_NAME = "ovb_gkey", OFF = "ovb_ai_off";
  const T = () => DF.AITasks;
  const A = {
    available: false, mode: "off", model: null, fast: null, listeners: [],
    cache: {}, serverOk: false, serverModel: null, serverFast: null, calls: [], fails: 0,
  };

  // ---- the player's key: this session by default, this device if remembered
  const sess = () => { try { return window.sessionStorage; } catch (e) { return null; } };
  const local = () => { try { return window.localStorage; } catch (e) { return null; } };
  const store = {
    get() {
      for (const s of [sess(), local()]) {
        try { const v = s && s.getItem(KEY_NAME); if (v) return JSON.parse(v); } catch (e) { /* unreadable: ignore */ }
      }
      return null;
    },
    set(rec, remember) {
      store.clear();
      try { const s = remember ? local() : sess(); if (s) s.setItem(KEY_NAME, JSON.stringify(rec)); } catch (e) { /* private mode: keep it in memory */ A.memKey = rec; }
    },
    clear() {
      A.memKey = null;
      for (const s of [sess(), local()]) { try { if (s) s.removeItem(KEY_NAME); } catch (e) { /* nothing to remove */ } }
    },
  };
  const keyRec = () => store.get() || A.memKey || null;

  function decide() {
    const rec = keyRec();
    if (window.DF_NO_AI) A.mode = "off";
    else if (rec && rec.key) { A.mode = "key"; A.model = rec.model || T().MODEL; A.fast = rec.fast || A.model; }
    else if (A.serverOk) { A.mode = "server"; A.model = A.serverModel; A.fast = A.serverFast; }
    else { A.mode = "off"; A.model = null; A.fast = null; }
    A.paused = A.mode !== "off" && !!DF.storage.get(OFF, false);
    A.available = A.mode !== "off" && !A.paused;
    A.fails = 0;
    A.listeners.forEach((f) => f(A.available));
  }

  A.check = async function () {
    A.serverOk = false;
    // a server only exists behind the dev/self-hosted page, never on static hosting
    if (!window.DF_NO_AI && !window.DF_STATIC && location.protocol !== "file:") {
      try {
        const res = await fetch("api/ai/health", { cache: "no-store" });
        if (res.ok) { const j = await res.json(); A.serverOk = !!j.ok; A.serverModel = j.model; A.serverFast = j.fast; }
      } catch (e) { A.serverOk = false; }
    }
    decide();
    return A.available;
  };
  A.onChange = (f) => A.listeners.push(f);
  A.setEnabled = (on) => { DF.storage.set(OFF, !on); decide(); };
  A.canUseKey = () => !window.DF_NO_AI;
  A.keyInfo = () => {
    const r = keyRec();
    return r && r.key ? { masked: "••••" + String(r.key).slice(-4), remember: !!r.remember, model: r.model, fast: r.fast } : null;
  };

  function fetchT(url, opts, ms) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), ms || 20000);
    return fetch(url, Object.assign({}, opts, { signal: ctl ? ctl.signal : undefined, referrerPolicy: "strict-origin-when-cross-origin" })).finally(() => clearTimeout(timer));
  }

  // Checks a key with Google and picks the models it can use (the game's
  // defaults when available). The key goes nowhere else.
  A.testKey = async function (key) {
    key = String(key || "").trim();
    if (!/^[A-Za-z0-9._-]{20,200}$/.test(key)) return { ok: false, why: "format" }; // AIza… and the newer dotted keys
    try {
      const res = await fetchT(T().ENDPOINT.slice(0, -1) + "?pageSize=200", { headers: { "x-goog-api-key": key } }, 12000);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, why: res.status === 400 || res.status === 401 || res.status === 403 ? "rejected" : res.status === 429 ? "quota" : "http" };
      const names = (j.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => String(m.name || "").replace(/^models\//, ""));
      const pick = (want, lite) => (names.includes(want) ? want
        : names.filter((n) => /^gemini-[\d.]+-flash/.test(n) && (lite ? /lite/.test(n) : !/lite/.test(n)) && !/image|tts|audio|live|exp|preview|thinking/.test(n)).sort().pop() || null);
      const model = pick(T().MODEL, false), fast = pick(T().MODEL_FAST, true) || model;
      if (!model) return { ok: false, why: "models" };
      return { ok: true, model, fast };
    } catch (e) { return { ok: false, why: "network" }; }
  };
  A.saveKey = function (key, remember, models) {
    store.set({ key: String(key).trim(), model: models.model, fast: models.fast, remember: !!remember }, !!remember);
    A.cache = {};
    DF.storage.set(OFF, false);
    decide();
  };
  A.clearKey = function () { store.clear(); A.cache = {}; decide(); };

  // brakes for the player's own quota: at most 40 calls every 10 minutes and
  // 150 a day on this device, so a stuck tab can't run up their bill
  const DAY_CAP = 150;
  function budget() {
    const now = Date.now();
    A.calls = A.calls.filter((t) => now - t < 600000);
    if (A.calls.length >= 40) return false;
    const today = new Date().toISOString().slice(0, 10);
    const d = DF.storage.get("ovb_ai_day", null);
    const n = d && d.d === today ? d.n : 0;
    if (n >= DAY_CAP) { A.capped = true; return false; }
    DF.storage.set("ovb_ai_day", { d: today, n: n + 1 });
    A.calls.push(now);
    A.capped = false;
    return true;
  }

  async function call(task, payload) {
    if (!A.available) return null;
    const t = T().TASKS[task];
    const data = Object.assign({ lang: DF.lang }, payload);
    try {
      if (A.mode === "server") {
        const res = await fetchT("api/ai/" + task, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }, t.timeout + 5000);
        return res.ok ? await res.json() : null;
      }
      // the player's key: straight to Google, nothing in between
      const rec = keyRec();
      if (!rec || !budget()) return null;
      const input = t.input(data);
      const model = t.fast ? (rec.fast || rec.model) : rec.model;
      const res = await fetchT(T().ENDPOINT + model + ":generateContent", {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": rec.key },
        body: JSON.stringify(T().body(model, t.prompt(input), t.schema)),
      }, t.timeout + 5000);
      const j = await res.json();
      if (!res.ok) throw new Error("gemini " + res.status);
      A.fails = 0;
      return t.clean(T().parse(j));
    } catch (e) {
      // a key that keeps failing (revoked, out of quota): stop asking for this session
      if (A.mode === "key" && ++A.fails >= 3) { A.available = false; A.listeners.forEach((f) => f(false)); }
      return null;
    }
  }

  const clip = (s, n) => String(s == null ? "" : s).replace(/[<>]/g, "").slice(0, n);

  // the day's staff chat for this chapter (prefetched during the Countdown)
  A.dayKit = async function (ctx) {
    const key = [DF.lang, ctx.event, ctx.chapter, ctx.city].join("|");
    if (A.cache[key]) return A.cache[key];
    const j = await call("daykit", ctx);
    if (!j || !j.acts) return null;
    const acts = {};
    for (const k of Object.keys(DF.CHAT_ACTS)) {
      acts[k] = (Array.isArray(j.acts[k]) ? j.acts[k] : []).filter((m) => m && m.text && Array.isArray(m.r) && m.r.length >= 2)
        .map((m) => ({ from: clip(m.from, 30), text: clip(m.text, 120), r: [clip(m.r[0], 36), clip(m.r[1], 36)] }));
    }
    const kit = {
      lang: DF.lang, acts,
      noise: (Array.isArray(j.noise) ? j.noise : []).filter((m) => m && m.text).map((m) => ({ from: clip(m.from, 30), text: clip(m.text, 120) })),
      banter: (Array.isArray(j.banter) ? j.banter : []).map((b) => clip(b, 52)).filter(Boolean),
    };
    A.cache[key] = kit;
    return kit;
  };

  A.card = async function (ctx) {
    const j = await call("card", ctx);
    return j && j.title ? DF.Prep.sanitizeCard(j) : null;
  };

  A.forge = async function (ctx) {
    const j = await call("forge", ctx);
    return j && j.title ? DF.Prep.sanitizeCard(j) : null;
  };

  A.gazette = async function (ctx) {
    const j = await call("gazette", ctx);
    if (!j || !j.headline) return null;
    return { paper: clip(j.paper, 40), headline: clip(j.headline, 80), sub: clip(j.sub, 130), article: clip(j.article, 440), coach: clip(j.coach, 170) };
  };

  A.react = async function (ctx) {
    const j = await call("react", Object.assign({ city: DF.UI && DF.UI.U.setup.city }, ctx));
    return Array.isArray(j) ? j.slice(0, 4).map((m) => ({ from: clip(m.from, 30), text: clip(m.text, 110) })) : null;
  };

  DF.AI = A;
})();
