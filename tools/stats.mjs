#!/usr/bin/env node
/* stats.mjs: the anonymous counters and the chapter board, for the organizers.
 *
 *   node tools/stats.mjs                  report: visits, sources, days played, chapters
 *   node tools/stats.mjs --days=30        the daily table over 30 days (default 14)
 *   node tools/stats.mjs --board          every chapter on the board, approved or not
 *   node tools/stats.mjs --approve=<slug> show a chapter whose name doesn't start with GDG/GDSC/WTM
 *   node tools/stats.mjs --hide=<slug>    take a chapter off the board (--reset=<slug> undoes both)
 *   node tools/stats.mjs --contacts       emails of the players who asked to hear from us
 *   node tools/stats.mjs --diary=d        the game diary as CSV: d = days played, q = days
 *                                         left halfway, x = game errors (--days=N, default 30)
 *   node tools/stats.mjs --emu            the local emulator instead of the project
 *
 * Reads the Realtime Database with your gcloud login (project owner): the
 * counters are not readable from the browser (database.rules.json). */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";

const S = createRequire(import.meta.url)("../functions/stats.js");
const args = process.argv.slice(2);
const opt = (k) => { const a = args.find((x) => x === "--" + k || x.startsWith("--" + k + "=")); return a === undefined ? undefined : a.includes("=") ? a.split("=").slice(1).join("=") : true; };
const EMU = !!opt("emu");
// the database comes from your firebase-config.js (out of git)
const BASE = EMU ? "http://127.0.0.1:9000" : (() => { try { return new URL((fs.readFileSync(new URL("../firebase-config.js", import.meta.url), "utf8").match(/databaseURL:\s*"([^"]+)"/) || [])[1]).origin; } catch (e) { console.error("Serve firebase-config.js con databaseURL (vedi firebase-config.example.js)"); process.exit(1); } })();
const url = (path, extra) => BASE + "/" + path + ".json?" + [EMU ? "ns=demo-lmh" : "", extra || ""].filter(Boolean).join("&");
let token = "owner";
if (!EMU) {
  try { token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim(); }
  catch (e) { console.error("Serve gcloud con l'account proprietario del progetto: gcloud auth login"); process.exit(1); }
}
async function db(path, method, body, extra) {
  const res = await fetch(url(path, extra), { method: method || "GET", headers: { Authorization: "Bearer " + token }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(path + ": " + res.status + " " + (await res.text()).slice(0, 200));
  return res.json();
}

const n = (v) => Number(v || 0).toLocaleString("it-IT");
const pct = (a, b) => (b ? Math.round((100 * (a || 0)) / b) + "%" : "–");
const dec = (v) => (Number.isFinite(v) ? v.toFixed(1).replace(".", ",") : "–");
const sum = (o) => Object.values(o || {}).reduce((a, v) => a + (Number(v) || 0), 0);
const share = (o, top) => {
  const all = sum(o);
  return Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, top || 8).map(([k, v]) => `${k.replace(/~/g, "/")} ${pct(v, all)}`).join(" · ") || "–";
};
const pad = (s, w) => String(s).padEnd(w);
const lpad = (s, w) => String(s).padStart(w);

// ---------------------------------------------------------- moderation
for (const [flag, value] of [["approve", true], ["hide", false], ["reset", null]]) {
  const slug = opt(flag);
  if (typeof slug === "string" && slug) {
    await db("lb/ok/" + slug, value === null ? "DELETE" : "PUT", value === null ? undefined : value);
    console.log(`${slug}: ${value === true ? "approvato" : value === false ? "nascosto" : "torna alla regola automatica"} (la classifica pubblica si aggiorna entro 5 minuti)`);
    process.exit(0);
  }
}

if (opt("board")) {
  const [all, ok] = await Promise.all([db("lb/c"), db("lb/ok")]);
  const rows = Object.entries(all || {}).sort((a, b) => (b[1].s || 0) - (a[1].s || 0));
  if (!rows.length) { console.log("Classifica vuota."); process.exit(0); }
  for (const [slug, c] of rows) {
    const state = (ok || {})[slug] === false ? "nascosto" : (ok || {})[slug] === true ? "approvato" : S.isChapter(c.n) ? "automatico" : "IN ATTESA";
    console.log(`${pad(c.n, 32)} ${lpad("⭐ " + c.s, 7)} ${lpad("👥 " + c.p, 6)}  ${pad(state, 10)} ${slug}`);
  }
  console.log("\nIn attesa: node tools/stats.mjs --approve=<slug> · da togliere: --hide=<slug>");
  process.exit(0);
}

if (opt("contacts")) {
  const uids = Object.keys((await db("users", "GET", undefined, "shallow=true")) || {});
  const out = [];
  for (const uid of uids) { const c = await db("users/" + uid + "/c"); if (c && c.ok && c.email) out.push([c.email, new Date(c.at).toISOString().slice(0, 10)]); }
  console.log(out.length ? out.map(([e, d]) => `${e}\t(consenso dal ${d})`).join("\n") : "Nessuno ha ancora chiesto di essere contattato.");
  console.log(`\n${out.length} su ${uids.length} account. Scrivi solo per OVERBOOKED!, come promesso nell'informativa.`);
  process.exit(0);
}

// -------------------------------------------------------------- diary
// one record per day played (d), left halfway (q) or per game error (x), by date
async function diary(kind, nDays) {
  const from = S.romeDate(new Date(Date.now() - (nDays - 1) * 864e5));
  const all = (await db("logs/" + kind, "GET", undefined, "orderBy=%22$key%22&startAt=%22" + from + "%22")) || {};
  return Object.entries(all).sort().flatMap(([date, recs]) => Object.values(recs || {}).map((r) => Object.assign({ date }, r)));
}
const csv = (rows, cols) => [cols.join(",")].concat(rows.map((r) => cols.map((c) => { const v = c.split(".").reduce((o, k) => (o == null ? o : o[k]), r); const s = v == null ? "" : Array.isArray(v) ? v.join(" ") : typeof v === "object" ? Object.entries(v).map(([k, x]) => k + ":" + [].concat(x).join("/")).join(" ") : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(","))).join("\n");
const DIARY_COLS = {
  d: ["date", "e", "m", "st", "f", "h", "v", "l", "d", "g", "n", "b", "ro", "pk", "rx", "ai", "pr", "co", "sp", ...Object.keys({ rw: 0, rt: 0, pr: 0, at: 0, mq: 0, ot: 0, tt: 0, tc: 0, fx: 0, pv: 0, es: 0, dl: 0, ca: 0, ci: 0, bo: 0, it: 0, sc: 0, mc: 0, ms: 0 }).map((k) => "s." + k), "p", "lo.vo", "lo.en", "lo.bu", "lo.sr", "lo.fl", "lo.tl"],
  q: ["date", "e", "m", "pc", "v"],
  x: ["date", "src", "ln", "ph", "v", "msg"],
};
const kind = opt("diary");
if (kind) {
  if (!DIARY_COLS[kind]) { console.error("--diary=d (giornate), q (abbandoni) o x (errori)"); process.exit(1); }
  const rows = await diary(kind, Number(opt("days")) > 0 ? Number(opt("days")) : 30);
  console.log(csv(rows, DIARY_COLS[kind]));
  process.exit(0);
}

// ------------------------------------------------------------- report
const st = (await db("stats")) || {};
const t = st.t || {}, days = st.d || {};
const today = S.romeDate();
const span = Number(opt("days")) > 0 ? Number(opt("days")) : 14;
const dates = [];
for (let i = span - 1; i >= 0; i--) dates.push(S.romeDate(new Date(Date.now() - i * 864e5)));
const last7 = dates.slice(-7).reduce((a, d) => a + ((days[d] && days[d].v) || 0), 0);
const starts = sum(t.s), ends = sum(t.e);

console.log(`OVERBOOKED! · statistiche anonime · ${today}${EMU ? " · EMULATORE" : ""}`);
if (!Object.keys(t).length) { console.log("\nAncora nessun dato: i conteggi arrivano dal sito pubblicato (Firebase Hosting)."); process.exit(0); }
console.log(`\nVisite        ${n(t.v)} in tutto · ${n(last7)} negli ultimi 7 giorni · tornano ${pct((t.ret || {}).back, t.v)} · da telefono ${pct((t.dev || {}).m, t.v)}`);
console.log(`Provenienza   ${share(t.src)}`);
console.log(`Lingue        ${share(t.lang)}`);
console.log(`Giornate      iniziate ${n(starts)} · finite ${n(ends)} (${pct(ends, starts)})`);
console.log(`              AI attiva ${pct((t.ai || {}).on, starts)} · modalità tranquilla ${pct((t.relax || {}).on, starts)} · ${share(t.mode)}`);
console.log(`\n  ${pad("evento", 10)}${lpad("Countdown", 10)}${lpad("iniziate", 9)}${lpad("finite", 8)}${lpad("lasciate", 9)}${lpad("⭐ media", 10)}${lpad("voto", 7)}${lpad("preparate", 11)}`);
for (const ev of S.EVENTS) {
  const s = (t.s || {})[ev] || 0, e = (t.e || {})[ev] || 0;
  let stars = 0;
  for (let k = 0; k <= 3; k++) stars += k * ((t.stars || {})[ev + "~" + k] || 0);
  const prepYes = (t.prep || {})[ev + "~yes"] || 0, prepNo = (t.prep || {})[ev + "~no"] || 0;
  const q = (t.q || {})[ev] || 0, qpc = (t.qpc || {})[ev] || 0;
  console.log(`  ${pad(ev, 10)}${lpad(n((t.cd || {})[ev]), 10)}${lpad(n(s), 9)}${lpad(n(e), 8)}${lpad(q ? n(q) + " @" + Math.round(qpc / q) + "%" : "0", 9)}${lpad(e ? dec(stars / e) : "–", 10)}${lpad(e ? dec(((t.fb || {})[ev] || 0) / 10 / e) : "–", 7)}${lpad(pct(prepYes, prepYes + prepNo), 11)}`);
}
console.log(`\nChapter       ${Object.entries(t.ch || {}).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${n(v)}`).join(" · ") || "–"}  (giornate finite)`);
console.log(`Fusi orari    ${share(t.tz, 8)}`);
console.log(`Sold-out      ${share(t.soldout)}`);
console.log(`Login Google  ${n(t.l)}`);
if (t.x) {
  const errs = await diary("x", 30), top = {};
  for (const r of errs) { const k = (r.src || "?") + ":" + (r.ln || 0) + " " + r.msg; top[k] = (top[k] || 0) + 1; }
  console.log(`Errori        ${n(t.x)} in tutto · nei 30 giorni: ` + (Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${v}× ${k}`).join(" · ") || "–"));
}
console.log(`Diario        node tools/stats.mjs --diary=d (giornate) · q (abbandoni) · x (errori), in CSV`);
const max = Math.max(1, ...dates.map((d) => (days[d] && days[d].v) || 0));
console.log(`\nUltimi ${span} giorni (visite · giornate finite)`);
for (const d of dates) {
  const v = (days[d] && days[d].v) || 0, e = sum(days[d] && days[d].e);
  console.log(`  ${d.slice(5)} ${pad("█".repeat(Math.round((24 * v) / max)), 24)} ${lpad(n(v), 6)} · ${n(e)}`);
}
