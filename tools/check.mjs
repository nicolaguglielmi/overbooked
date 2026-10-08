// Pre-publication gate: syntax, language packs, secrets, then the playtest bot.
//   node tools/check.mjs        (exits 1 if anything is off)
// Same rule as Last Mile Hero: no publication without a passing playability
// check. Thresholds describe the difficulty curve we want, not "feel".
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { DF, runDay, loadoutFor, playPrep } from "./playtest.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
let failed = 0;
const ok = (cond, label, detail) => {
  console.log(`${cond ? "OK  " : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failed++;
};
const list = (dir, ext) => fs.existsSync(path.join(ROOT, dir)) ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f)) : [];

// 1. every script parses
for (const f of [...list("js", ".js"), ...list("js/lang", ".js"), ...list("server", ".mjs"), ...list("tools", ".mjs"), ...list("functions", ".js")]) {
  try { execFileSync(process.execPath, ["--check", path.join(ROOT, f)], { stdio: "pipe" }); ok(true, "sintassi " + f); }
  catch (e) { ok(false, "sintassi " + f, String(e.stderr || e).split("\n").slice(0, 3).join(" ")); }
}
for (const f of ["database.rules.json", "firebase.json"]) {
  try { JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); ok(true, f); } catch (e) { ok(false, f, e.message); }
}

// 2. language packs: same keys, same array lengths, same {placeholders} as English
const lctx = vm.createContext({ DF: {} });
for (const l of ["en", "it", "fr", "es", "de"]) vm.runInContext(fs.readFileSync(path.join(ROOT, "js/lang", l + ".js"), "utf8"), lctx, { filename: l + ".js" });
const holes = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
function compare(a, b, where, out) {
  if (typeof a === "string") { if (typeof b !== "string") out.push(where + " manca"); else if (holes(a) !== holes(b)) out.push(where + " segnaposto"); return; }
  if (Array.isArray(a)) { if (!Array.isArray(b) || a.length !== b.length) { out.push(where + " lunghezza"); return; } a.forEach((x, i) => compare(x, b[i], where + "[" + i + "]", out)); return; }
  if (a && typeof a === "object") { for (const k of Object.keys(a)) compare(a[k], b ? b[k] : undefined, where + "." + k, out); }
}
for (const l of ["it", "fr", "es", "de"]) {
  const out = [];
  compare(lctx.DF.L.en, lctx.DF.L[l], l, out);
  ok(out.length === 0, "lingua " + l + " allineata all'inglese", out.length ? out.length + " differenze: " + out.slice(0, 4).join("; ") : "");
}

// 3. no API key in anything the browser can load (the host's key stays in .env)
const KEYLIKE = /AIza[0-9A-Za-z_-]{30,}/;
let hostKey = "";
try { const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8"); hostKey = ((env.match(/^\s*(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(\S+)/m) || [])[1] || "").replace(/^["']|["']$/g, ""); } catch (e) { /* no .env: nothing to compare */ }
const walk = (d) => fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : [];
const CFG = fs.existsSync(path.join(ROOT, "firebase-config.js")) ? "firebase-config.js" : "firebase-config.example.js"; // the real one stays out of git
const shipped = [...list("js", ".js"), ...list("js/lang", ".js"), ...list("css", ".css"), ...walk("dist").filter((f) => /\.(html|js|css|json)$/.test(f)), "index.html", CFG];
// the Firebase web config's apiKey is public by design (it identifies the project; it's restricted by domain and API)
const fbKey = (fs.readFileSync(path.join(ROOT, CFG), "utf8").match(/apiKey:\s*"([^"]+)"/) || [])[1] || "";
const leaks = shipped.filter((f) => {
  if (!fs.existsSync(path.join(ROOT, f))) return false;
  const txt = fs.readFileSync(path.join(ROOT, f), "utf8").split(fbKey || "\u0000").join("");
  return KEYLIKE.test(txt) || (hostKey.length >= 20 && txt.includes(hostKey));
});
ok(leaks.length === 0, "nessuna chiave API nei file pubblici (anche la chiave di .env)", leaks.join(", "));

// 4. the player's own Gemini key: kept in one module, sent only to Google
const jsFiles = [...list("js", ".js"), ...list("js/lang", ".js")];
const keyUsers = jsFiles.filter((f) => /ovb_gkey|x-goog-api-key/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
ok(keyUsers.length === 1 && keyUsers[0] === "js/ai.js", "la chiave del giocatore vive solo in js/ai.js", keyUsers.join(", "));
const aiSrc = fs.readFileSync(path.join(ROOT, "js/ai.js"), "utf8");
const hosts = [...aiSrc.matchAll(/https?:\/\/([\w.-]+)/g)].map((m) => m[1]);
ok(hosts.every((h) => h === "generativelanguage.googleapis.com"), "js/ai.js parla solo con generativelanguage.googleapis.com", [...new Set(hosts)].join(", "));
const webIndex = path.join(ROOT, "dist/web/index.html");
if (fs.existsSync(webIndex)) {
  const page = fs.readFileSync(webIndex, "utf8");
  const meta = (page.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
  ok(/script-src 'self'/.test(meta) && !/script-src[^;]*unsafe-inline/.test(meta), "build web: CSP senza script inline", meta.slice(0, 60));
  ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(page), "build web: nessuno script inline nella pagina");
  const signIn = /googleSignIn:\s*true/.test(fs.readFileSync(path.join(ROOT, CFG), "utf8"));
  if (signIn) ok(/script-src[^;]*https:\/\/apis\.google\.com/.test(meta) && /frame-src[^;]*firebaseapp\.com/.test(meta), "build web: CSP pronta per il login Google (apis.google.com, authDomain)");
}

// 4b. anonymous stats and the account: nothing personal leaves the browser
const Stats = createRequire(import.meta.url)("../functions/stats.js");
ok(JSON.stringify(Stats.EVENTS) === JSON.stringify(DF.EVENT_ORDER), "statistiche: gli eventi del server sono quelli del gioco", Stats.EVENTS.join(","));
ok(Stats.MAX_STARS === DF.EVENT_ORDER.length * 3, "classifica: massimo stelle = eventi × 3", String(Stats.MAX_STARS));
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8")).rules;
ok((rules.lb.u.$uid.s[".validate"] || "").includes("<= " + Stats.MAX_STARS), "classifica: le regole limitano le stelle a " + Stats.MAX_STARS);
ok(/auth\.uid === \$uid/.test(rules.users.$uid[".read"]) && /auth\.uid === \$uid/.test(rules.users.$uid[".write"]) && /google\.com/.test(rules.users.$uid[".write"]), "account: users/<uid> lo legge e scrive solo il proprietario con Google");
ok(rules.$other[".read"] === false && rules.$other[".write"] === false && !rules.stats, "database: le statistiche non sono leggibili né scrivibili dai client");
const sctx = vm.createContext({
  DF: { storage: { get: () => null, set() {} }, lang: "it", VERSION: "0.5.0", Coach: { on: true }, Game: { phase: "day" } }, URLSearchParams, URL, Intl, JSON,
  location: { search: "?s=li&dev", protocol: "https:", hostname: "overbooked.web.app", pathname: "/", hash: "", origin: "https://overbooked.web.app", href: "https://overbooked.web.app/" },
  document: { referrer: "" }, navigator: {}, history: { replaceState() {} }, matchMedia: () => ({ matches: false }), fetch: () => Promise.resolve(),
});
sctx.window = sctx;
const listeners = {};
sctx.addEventListener = (type, fn) => { listeners[type] = fn; };
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/stats.js"), "utf8"), sctx, { filename: "stats.js" });
const sent = [];
sctx.navigator.sendBeacon = (url, body) => { sent.push([url, body]); return true; };
const CS = sctx.DF.Stats;
ok(CS.SOURCES.every((x) => Stats.SOURCES.includes(x)), "statistiche: ogni provenienza del client è ammessa dal server", CS.SOURCES.filter((x) => !Stats.SOURCES.includes(x)).join(","));
// a real day, simulated, feeds the diary beacon
const dayRun = { seed: 4242, loadout: loadoutFor("devfest", "medio"), players: [{ id: "p1", role: "lead" }, { id: "p2", role: "tech", ctrl: "bot" }], profiles: { p1: "medio", p2: "colead" } };
const day = runDay(dayRun);
CS.visit();
CS.countdown("devfest", "solo");
CS.dayStart({ event: "devfest", mode: "solo", ai: null, prep: 1 }, true);
CS.dayEnd(day.sum, { mode: "solo", chapter: "Mario Rossi", prep: 1 }, { players: dayRun.players, loadout: dayRun.loadout, perks: { walkie: true }, relax: false }, 312.4);
CS.dayEnd({ event: "wtm", stars: 3, feedback: 4.8 }, { mode: "duo", chapter: "GDG Campobasso" });
CS.quit({ t: 90, evId: "hack" }, { mode: "solo" }, 300);
CS.quit({ t: 120, evId: "hack", quitSent: true }, { mode: "solo" }, 300);
listeners.error({ message: "TypeError: boom at https://overbooked.web.app/js/sim.js:12 for a@b.co", filename: "https://overbooked.web.app/js/sim.js", lineno: 12 });
listeners.error({ message: "Script error.", filename: "https://www.gstatic.com/firebasejs/x.js", lineno: 1 });
const beacons = sent.map(([, body]) => JSON.parse(body));
const parsed = sent.map(([, body]) => Stats.parseBeacon(body));
ok(sent.length === 7 && sent.every(([u]) => u === "/api/stat") && parsed.every(Boolean), "statistiche: i beacon del client passano la validazione del server", sent.length + " beacon: " + beacons.map((b) => b.k).join(""));
ok(beacons[0].s === "linkedin" && beacons[3].c === null && parsed[4].c === "gdg-campobasso", "statistiche: ?s=li conta LinkedIn; un nome di persona non diventa mai un chapter");
const allowed = { v: ["k", "l", "s", "d", "r", "z"], c: ["k", "e", "m"], s: ["k", "e", "m", "a", "x", "p", "h"], e: ["k", "e", "m", "st", "f", "h", "c", "v", "l", "d", "g", "n", "b", "ro", "pk", "rx", "ai", "pr", "co", "sp", "s", "p", "lo"], q: ["k", "e", "m", "pc", "v"], x: ["k", "msg", "src", "ln", "ph", "v"], l: ["k"] };
ok(beacons.every((b) => Object.keys(b).every((k) => allowed[b.k].includes(k))), "statistiche: i beacon portano solo i campi ammessi");
const rec = Stats.diaryRecord(parsed[3], "2026-10-07");
const diaryOk = rec && rec.path === "logs/d/2026-10-07" && rec.rec.g.length === 3 && Object.keys(rec.rec.p).length > 0 && rec.rec.lo.fl.length > 0 && rec.rec.sp === 312 && rec.rec.n === 1 && rec.rec.b === 1 && !("c" in rec.rec);
ok(diaryOk, "diario: la giornata finisce nel diario con obiettivi, problemi e Countdown, senza chapter", rec && JSON.stringify(rec.rec).length + " byte");
const lostKeys = Object.keys(beacons[3].s).filter((k) => !(k in rec.rec.s)).concat(Object.keys(beacons[3].p).filter((k) => !(k in rec.rec.p)), beacons[3].lo.fl.filter((f) => !rec.rec.lo.fl.includes(f)));
ok(lostKeys.length === 0, "diario: il server conosce tutti i valori che il gioco manda (problemi, attrezzi, scelte)", lostKeys.join(","));
const quitRec = Stats.diaryRecord(parsed[5], "2026-10-07"), errRec = Stats.diaryRecord(parsed[6], "2026-10-07");
ok(quitRec && quitRec.rec.pc === 30 && errRec && errRec.rec.src === "sim.js" && !/https?:|@/.test(errRec.rec.msg), "diario: abbandoni ed errori del gioco, senza indirizzi né email; gli script di altri siti non contano", errRec && errRec.rec.msg);
const ui = fs.readFileSync(path.join(ROOT, "js/ui.js"), "utf8");
const gameFlags = [...((ui.match(/const FLAGS = \[(.*)\];/) || [])[1] || "").matchAll(/\["(\w+)"/g)].map((m) => m[1]);
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
ok(same(Stats.PROBLEMS, Object.keys(DF.PROBLEMS)) && same(Stats.FLAGS, gameFlags) && same(Stats.TOOLS, Object.keys(DF.TOOLS)) && same(Stats.PERKS, Object.keys(DF.PERKS)) && same(Stats.ROLES, Object.keys(DF.ROLES)), "diario: le liste del server (problemi, scelte, attrezzi, kit, ruoli) sono quelle del gioco");
const bad = [JSON.stringify({ k: "v", l: "it", s: "evil.com", d: "m" }), JSON.stringify({ k: "e", e: "devfest", m: "solo", st: 9, f: 40 }), "x".repeat(3000), "[1]", JSON.stringify({ k: "q" }), JSON.stringify({ k: "x", msg: "" })];
ok(bad.every((r) => Stats.parseBeacon(r) === null), "statistiche: il server scarta valori fuori lista, fuori scala o troppo lunghi");
const paths = parsed.flatMap((b) => Object.keys(Stats.statUpdates(b, "2026-10-07")));
ok(paths.every((x) => !/[.#$[\]]/.test(x)), "statistiche: chiavi valide per il database", paths.filter((x) => /[.#$[\]]/.test(x)).join(","));
let bm = Stats.boardMember(null, "u1", 7, "GDG Campobasso");
bm = Stats.boardMember(bm, "u2", 30, "gdg campobasso");
bm = Stats.boardMember(bm, "u1", null, null);
ok(bm.p === 1 && bm.s === Stats.MAX_STARS && bm.n === "GDG Campobasso" && Stats.boardMember(bm, "u2", null) === null, "classifica: un chapter somma i membri, limita le stelle e sparisce vuoto");
const board = Stats.boardRows({ a: { n: "GDG Roma", p: 2, s: 20 }, b: { n: "Mario Rossi", p: 1, s: 18 }, c: { n: "WTM Milano", p: 1, s: 30 }, d: { n: "GDG Nascosto", p: 1, s: 1 } }, { d: false });
ok(board.rows.map((r) => r.n).join(",") === "WTM Milano,GDG Roma", "classifica: solo nomi da chapter (o approvati), ordinati per stelle", board.rows.map((r) => r.n).join(","));
for (const [f, hosts] of [["js/stats.js", ["127.0.0.1"]], ["js/account.js", ["127.0.0.1"]], ["js/fb.js", ["www.gstatic.com"]]]) {
  const used = [...fs.readFileSync(path.join(ROOT, f), "utf8").matchAll(/https?:\/\/([\w.-]+)/g)].map((m) => m[1]);
  ok(used.every((h) => hosts.includes(h)), f + " parla solo con " + hosts.join(", ") + " (e con il sito stesso)", [...new Set(used)].join(", "));
}
const fbcfg = (() => { const c = vm.createContext({ window: {} }); vm.runInContext(fs.readFileSync(path.join(ROOT, CFG), "utf8"), c); return c.window.DF_FIREBASE; })();
const hostingAll = [].concat(JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8")).hosting);
const hosting = hostingAll.find((h) => h.public === "dist/web") || {};
ok(hosting.target === "game" && hostingAll.every((h) => !h.site), "hosting: il gioco sul target \"game\" (i nomi dei siti stanno in .firebaserc, fuori da git)");
const coop = (hosting.headers[0].headers.find((h) => h.key === "Cross-Origin-Opener-Policy") || {}).value;
ok(!fbcfg || !fbcfg.googleSignIn || coop === "same-origin-allow-popups", "login Google: COOP lascia lavorare il popup", coop);
ok((hosting.rewrites || []).some((r) => r.source === "/api/**" && r.function && r.function.functionId === "api"), "hosting: /api/** va alla funzione api");

// the server replays with the same files the browser runs (tools/build.mjs copies them)
const stale = ["core.js", "i18n.js", "lang/it.js", "content.js", "venue.js", "chat.js", "sim.js", "bot.js", "weekly.js"].filter((f) => { try { return fs.readFileSync(path.join(ROOT, "functions/game", f), "utf8") !== fs.readFileSync(path.join(ROOT, "js", f), "utf8"); } catch (e) { return true; } });
ok(stale.length === 0, "sfida della settimana: il server rigioca con gli stessi file del gioco (node tools/build.mjs)", stale.join(", "));
// 4c. the weekly challenge: a recorded day replays to the same result (the server is the referee)
{
  const Wk = DF.Weekly, su = Wk.setup("2026-W41", "host"), s0 = DF.Sim.createDay(Wk.config(su));
  const log = []; let key = "", step = 0, mind;
  while (!s0.over) {
    const me = s0.orgs.find((o) => o.id === "p1"), bot = s0.orgs.find((o) => o.id === "p2");
    // a bot plays the human, keeping its mind off the org (a person leaves no bot state for the co-org to read)
    me.bot = mind; const p1 = DF.Bot.think(s0, me, DF.BOT_PROFILES.medio, Wk.STEP); mind = me.bot; delete me.bot;
    const pr = step % 900 === 450 ? s0.problems.find((p) => !p.done && !(p.warn > 0)) : null; // now and then, an order to the co-org
    const mate = pr ? [{ c: "target", target: { kind: "problem", id: pr.id }, auto: true, order: true }] : [];
    const bi = DF.Bot.think(s0, bot, DF.BOT_PROFILES.colead, Wk.STEP); bi.cmds = bi.cmds.concat(mate);
    const dir = p1.dir ? [p1.dir[0], p1.dir[1]] : 0, hold = p1.hold ? 1 : 0, k = JSON.stringify([dir, hold]);
    if (k !== key || p1.cmds.length || mate.length) { log.push([step, dir, hold, p1.cmds.length ? JSON.parse(JSON.stringify(p1.cmds)) : 0, mate.length ? mate : 0]); key = k; }
    DF.Sim.stepDay(s0, Wk.STEP, { p1, p2: bi }); s0.events.length = 0; step++;
  }
  const t0 = Date.now(), re = Wk.replay(su, JSON.parse(JSON.stringify(log))), ms = Date.now() - t0, orig = DF.Sim.summary(s0);
  ok(re.sum.score === orig.score && re.sum.stars === orig.stars && re.steps === step, "sfida della settimana: la giornata registrata si rigioca identica", `${su.event}, ${log.length} voci, ${(JSON.stringify(log).length / 1024).toFixed(0)} KB, replay ${ms} ms, ${orig.score} punti`);
  const forged = Wk.replay(su, log.map((e) => [e[0], e[1], e[2], [{ c: "inject", msgs: [] }, { c: "ability" }], e[4]]));
  ok(forged.sum.score < orig.score, "sfida della settimana: comandi falsi o fuori dal gioco non gonfiano il punteggio", `${forged.sum.score} < ${orig.score}`);
  ok(Wk.weekOf(new Date(Date.UTC(2026, 9, 7))) === "2026-W41" && Wk.weekOf(new Date(Date.UTC(2027, 0, 1))) === "2026-W53", "sfida della settimana: settimane ISO", Wk.weekOf(new Date(Date.UTC(2026, 9, 7))));
}

// 5. the difficulty curve, event by event: a Countdown strategy, then the day
const RUNS = 10;
const solo = [{ id: "p1", role: "lead" }];
const duo = [{ id: "p1", role: "lead" }, { id: "p2", role: "tech" }];
const avg = (fn) => { let t = 0; for (let r = 0; r < RUNS; r++) t += fn(r); return t / RUNS; };
const e2e = (event, strategy, profile, soldout, venue) => avg((r) => {
  const seed = 5000 + r * 7919;
  const lo = playPrep(strategy, seed, solo, event);
  const players = solo.slice(), profiles = { p1: profile };
  if (lo.coLead) { players.push({ id: "p2", role: "tech", ctrl: "bot" }); profiles.p2 = "colead"; }
  return runDay({ seed, loadout: lo, players, profiles, soldout, venue }).sum.feedback;
});
const f2 = (v) => v.toFixed(2);

// meetup: the tutorial, forgiving
let v = e2e("meetup", "pigro", "novizio");
ok(v >= 3.4, "meetup: anche senza Countdown un novizio se la cava (almeno 3,4)", f2(v));
v = e2e("meetup", "essenziale", "medio");
ok(v >= 3.7, "meetup: preparato e attento, almeno 3,7", f2(v));

// Study Jam, Women Techmakers, I/O Extended, the hackathon: the Countdown starts to matter
for (const ev of ["studyjam", "wtm", "ioext", "hack"]) {
  const lazy = e2e(ev, "pigro", "medio"), good = e2e(ev, "essenziale", "medio");
  ok(lazy <= 3.3, ev + ": chi salta il Countdown soffre (al massimo 3,3)", f2(lazy));
  ok(good >= 3.5, ev + ": Countdown curato, almeno 3,5", f2(good));
  ok(good - lazy >= 0.7, ev + ": la preparazione conta (+0,7 almeno)", f2(good - lazy));
}

// stars come from goals: preparing well must be worth them
for (const ev of ["wtm", "hack"]) {
  const st = avg((r) => {
    const seed = 5000 + r * 7919;
    const lo = playPrep("essenziale", seed, solo, ev);
    return runDay({ seed, loadout: lo, players: solo, profiles: { p1: "medio" } }).sum.stars;
  });
  ok(st >= 2, ev + ": con un buon Countdown almeno 2 stelle in media", f2(st));
}

// DevFest: the final exam
const dfLazy = e2e("devfest", "pigro", "medio");
ok(dfLazy <= 2.5, "devfest: chi salta il Countdown fallisce (al massimo 2,5)", f2(dfLazy));
const dfNovice = e2e("devfest", "essenziale", "novizio");
ok(dfNovice >= 4.0, "devfest: novizio con un Countdown curato, almeno 4,0", f2(dfNovice));
const dfRandom = e2e("devfest", "a caso", "medio");
ok(dfRandom >= 3.5 && dfRandom <= 4.6, "devfest: Countdown a caso, tra 3,5 e 4,6", f2(dfRandom));
const dfBest = e2e("devfest", "essenziale", "medio");
ok(dfBest <= 4.8, "devfest: mai una passeggiata (al massimo 4,8)", f2(dfBest));
const couple = avg((r) => runDay({ seed: 9000 + r * 7919, loadout: loadoutFor("devfest", "medio"), players: duo, profiles: { p1: "medio", p2: "medio" } }).sum.feedback);
ok(couple >= 4.0 && couple <= 4.8, "devfest: coppia media tra 4,0 e 4,8 (sfida, non passeggiata)", f2(couple));

// the coworking (small rooms, good Wi-Fi, real coffee): the same curve as the university
{
  const m = e2e("meetup", "pigro", "novizio", false, "cowork"), mg = e2e("meetup", "essenziale", "medio", false, "cowork");
  ok(m >= 3.4 && mg >= 3.7, "coworking: il meetup resta un tutorial (senza Countdown ≥ 3,4, curato ≥ 3,7)", f2(m) + " / " + f2(mg));
  const sl = e2e("studyjam", "pigro", "medio", false, "cowork"), sg = e2e("studyjam", "essenziale", "medio", false, "cowork");
  ok(sl <= 3.3 && sg >= 3.5 && sg - sl >= 0.7, "coworking: allo Study Jam la preparazione conta (≤ 3,3 / ≥ 3,5 / +0,7)", f2(sl) + " / " + f2(sg));
}

// sold-out (40% more people, more trouble): harder than the normal day, still winnable with a good Countdown
const soldWorse = DF.EVENT_ORDER.filter((ev) => e2e(ev, "essenziale", "medio", true) <= e2e(ev, "essenziale", "medio") + 0.1);
ok(soldWorse.length >= DF.EVENT_ORDER.length - 1, "sold-out: più difficile del giorno normale (quasi ovunque)", soldWorse.length + "/" + DF.EVENT_ORDER.length);
const soldMin = Math.min(...DF.EVENT_ORDER.map((ev) => e2e(ev, "essenziale", "esperto", true)));
ok(soldMin >= 3.0, "sold-out: un esperto preparato lo vince sempre (almeno 3,0)", f2(soldMin));

console.log(failed ? `\n${failed} controlli falliti: non pubblicare.` : "\nTutto OK: si può pubblicare.");
process.exit(failed ? 1 : 0);
