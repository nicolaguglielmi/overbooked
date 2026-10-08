/* stats.js: anonymous counters and the game diary.
 *
 * No cookies, no ids, nothing about the person. Each beacon carries a few
 * allowlisted values (event, language, stars, where the visit came from); the
 * server adds 1 to totals and, for the diary, keeps a summary of each day
 * played or left halfway and of each game error, with the date only
 * (functions/stats.js). It serves to tune the game, never marketing. Off under
 * Do Not Track or Global Privacy Control, outside the web (file://, the
 * Artifact), for bots, and with the switch on the privacy screen. */
"use strict";

(function () {
  const OFF = "ovb_nostats";
  const q = new URLSearchParams(location.search);
  // the local emulator suite when ?emu, otherwise the site's own /api (Firebase
  // Hosting -> Cloud Functions; server/server.mjs just logs them in dev)
  const API = q.has("emu") ? "http://127.0.0.1:5001/demo-lmh/europe-west1/api" : "/api";

  // where a visit came from: a ?s= tag on our shared links, else the referrer's site
  const TAGS = { li: "linkedin", md: "medium", x: "x", fb: "facebook", ig: "instagram", tg: "telegram", wa: "whatsapp", gh: "github", yt: "youtube", gdg: "gdg", mail: "mail", qr: "qr" };
  const SITES = [
    [/(^|\.)linkedin\.com$|^lnkd\.in$|^com\.linkedin\.android$/, "linkedin"],
    [/(^|\.)medium\.com$/, "medium"],
    [/(^|\.)google\.[a-z.]+$|^com\.google\.android\.googlequicksearchbox$/, "google"],
    [/^(t\.co|x\.com|twitter\.com|mobile\.twitter\.com)$/, "x"],
    [/(^|\.)facebook\.com$|^fb\.me$/, "facebook"],
    [/(^|\.)instagram\.com$/, "instagram"],
    [/^(t\.me|web\.telegram\.org|org\.telegram\.messenger)$/, "telegram"],
    [/(^|\.)whatsapp\.com$|^wa\.me$/, "whatsapp"],
    [/(^|\.)github\.com$/, "github"],
    [/(^|\.)youtube\.com$|^youtu\.be$/, "youtube"],
    [/(^|\.)reddit\.com$/, "reddit"],
    [/^dev\.to$/, "devto"],
    [/^gdg\.community\.dev$|^developers\.google\.com$/, "gdg"],
    [/(^|\.)bing\.com$/, "bing"],
    [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
    [/^(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|com\.google\.android\.gm)$/, "mail"],
  ];
  const SOURCES = ["direct", "other"].concat(Object.values(TAGS), SITES.map((s) => s[1]));

  function source() {
    const tag = TAGS[(q.get("s") || "").toLowerCase()];
    if (tag) return tag;
    let host = "";
    try { host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ""; } catch (e) { host = ""; }
    if (!host || host === location.hostname) return "direct";
    const hit = SITES.find(([re]) => re.test(host));
    return hit ? hit[1] : "other";
  }

  const S = {
    SOURCES,
    // the environment says no: not on the web, Artifact build, bots, DNT/GPC
    get blocked() {
      if (!/^https?:$/.test(location.protocol) || window.DF_NO_STATS || q.has("nostats")) return true;
      if (navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(navigator.userAgent || "")) return true;
      return navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl === true;
    },
    get on() { return !S.blocked && !DF.storage.get(OFF, false); },
    setOn(v) { DF.storage.set(OFF, !v); },
    send(b) {
      if (!S.on) return false;
      const body = JSON.stringify(b), url = API + "/stat";
      try { if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return true; } catch (e) { /* fall back to fetch */ }
      try { fetch(url, { method: "POST", body, keepalive: true, credentials: "omit", mode: "no-cors" }).catch(() => {}); } catch (e) { /* nothing else to try */ }
      return true;
    },
    // once per page load; the ?s= tag leaves the address bar so shared links stay clean
    visit() {
      const r = DF.storage.get("ovb_progress", null) || DF.storage.get("ovb_best", null) ? 1 : 0;
      let z = null;
      try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { z = null; }
      const s = source();
      if (q.has("s") && history.replaceState) {
        const rest = new URLSearchParams(location.search);
        rest.delete("s");
        history.replaceState(null, "", location.pathname + (rest.toString() ? "?" + rest : "") + location.hash);
      }
      return S.send({ k: "v", l: DF.lang, s, d: matchMedia("(pointer: coarse)").matches ? "m" : "d", r, z });
    },
    countdown(event, mode) { return S.send({ k: "c", e: event, m: mode }); },
    dayStart(run, relax) {
      return S.send({ k: "s", e: run.event, m: run.mode, a: run.ai ? 1 : 0, x: relax ? 1 : 0, p: run.prep ? 1 : 0, h: run.soldout ? 1 : 0 });
    },
    // the counters plus the day's summary for the diary; the chapter only when
    // it reads like one ("GDG ...", "WTM ..."), never a person's name
    dayEnd(sum, run, cfg, seconds) {
      const c = /^(GDG|GDSC|WTM|Google Developer (Groups?|Student Clubs?))(\s|$)/i.test(String(run.chapter || "").trim()) ? String(run.chapter).trim().slice(0, 40) : null;
      const st = sum.stats || {}, players = (cfg && cfg.players) || [], lo = (cfg && cfg.loadout) || {};
      const humans = players.filter((p) => p.ctrl !== "bot");
      const on = (o) => Object.keys(o || {}).filter((k) => o[k]);
      const p = {};
      for (const [type, v] of Object.entries(st.byType || {})) if (v && v.spawned) p[type] = [Math.min(99, v.spawned), Math.min(99, v.escalated || 0)];
      return S.send({
        k: "e", e: sum.event, m: run.mode, st: sum.stars, f: Math.max(0, Math.min(50, Math.round(sum.feedback * 10))), h: sum.soldout ? 1 : 0, c,
        v: DF.VERSION, l: DF.lang, d: matchMedia("(pointer: coarse)").matches ? "m" : "d",
        g: (sum.goals || []).map((g) => (g.ok ? 1 : 0)), n: Math.max(1, humans.length), b: players.length - humans.length,
        ro: humans.map((h) => h.role), pk: on(cfg && cfg.perks), rx: cfg && cfg.relax ? 1 : 0, ai: run.ai ? 1 : 0, pr: run.prep ? 1 : 0,
        co: DF.Coach && DF.Coach.on ? 1 : 0, sp: Math.round(seconds || 0),
        s: { rw: st.rushWon, rt: st.rushTotal, pr: sum.present, at: sum.attendees, mq: sum.maxQueue, ot: st.talksOnTime, tt: st.talksTotal, tc: st.talksCancelled, fx: st.fixed, pv: st.prevented, es: st.escalated, dl: st.delegated, ca: st.chatAnswered, ci: st.chatIgnored, bo: st.burnouts, it: st.interrupts, sc: sum.score, mc: st.murphyCaught, ms: st.murphySabotage },
        p,
        lo: { vo: lo.volunteers, en: lo.energy, bu: lo.budget, sr: Math.round((lo.showRate || 0) * 100), fl: on(lo.flags), tl: on(lo.tools) },
      });
    },
    // a day left halfway (back to the menu, restarted, or the tab closed)
    quit(sim, run, daySeconds) {
      if (!sim || sim.over || sim.quitSent) return false;
      sim.quitSent = true;
      return S.send({ k: "q", e: run.event || sim.evId, m: run.mode, pc: Math.max(0, Math.min(100, Math.round((100 * sim.t) / (daySeconds || 1)))), v: DF.VERSION });
    },
    login() { return S.send({ k: "l" }); },
  };

  // the game's own errors, at most three per page: where and when, never what the player typed
  const seenErr = new Set();
  function report(msg, src, ln) {
    if (seenErr.size >= 3 || !msg || seenErr.has(msg)) return;
    seenErr.add(msg);
    S.send({ k: "x", msg: String(msg).slice(0, 300), src, ln: ln || 0, ph: DF.Game && DF.Game.phase, v: DF.VERSION });
  }
  window.addEventListener("error", (ev) => {
    let file = "";
    try { file = ev.filename ? new URL(ev.filename, location.href) : ""; } catch (e) { file = ""; }
    if (!file || file.origin !== location.origin) return; // other sites' scripts (fonts, Firebase) aren't ours to report
    report(ev.message, (file.pathname.split("/").pop() || "index.html").toLowerCase(), ev.lineno);
  });
  window.addEventListener("unhandledrejection", (ev) => { const r = ev.reason; report(r && (r.code || r.message) ? String(r.code || "") + " " + String(r.message || "") : String(r), "promise", 0); });

  DF.Stats = S;
})();
