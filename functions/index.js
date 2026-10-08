/* Cloud Functions for Overbooked!
 *
 * billingGuard  The monthly budget (50 EUR) publishes its status on the
 *               "billing-cap" topic. When the month's actual cost reaches the
 *               budget, it unlinks the billing account from the project: no
 *               more charges until someone links it again from the console.
 * api           Behind Firebase Hosting (/api/**):
 *               POST /api/stat   anonymous counters (visits, days played);
 *               GET  /api/board  the chapter board, cached by the CDN.
 *               POST /api/weekly the weekly challenge: replays the recorded day
 *                                and keeps the verified score for the Chapter Cup;
 *               GET  /api/cup    the Chapter Cup of a week, cached by the CDN.
 * board         Keeps the board's per-chapter totals when a signed-in player
 *               joins, moves or leaves (lb/u/<uid> -> lb/c/<chapter>).
 *
 * The game itself runs on the free quotas; the AI is paid by each player's own
 * key, never by this project. Counters store no IP, no id, no cookie: here the
 * IP only feeds an in-memory rate limit, salted and hashed. Cloud Logging keeps
 * the platform's request logs (with IPs) for 30 days, for troubleshooting. */
"use strict";

const crypto = require("node:crypto");
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { onRequest } = require("firebase-functions/v2/https");
const { onValueWritten } = require("firebase-functions/v2/database");
const { logger } = require("firebase-functions");
const { CloudBillingClient } = require("@google-cloud/billing");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase, ServerValue } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");
const { getAppCheck } = require("firebase-admin/app-check");
const S = require("./stats");

const REGION = "europe-west1";
const EMU = process.env.FUNCTIONS_EMULATOR === "true";
const PROJECT = process.env.GCLOUD_PROJECT || "";
// the default database (Firebase passes its URL in FIREBASE_CONFIG; the emulator: one namespace per project)
const FB_CONFIG = JSON.parse(process.env.FIREBASE_CONFIG || "{}");
initializeApp({ databaseURL: EMU ? "https://" + PROJECT + ".firebaseio.com" : FB_CONFIG.databaseURL || "https://" + PROJECT + "-default-rtdb." + REGION + ".firebasedatabase.app" });
const billing = new CloudBillingClient();
const STATS_SA = "stats-writer@"; // the SDK completes it with the project: stats-writer@<project>.iam.gserviceaccount.com

exports.billingGuard = onMessagePublished(
  { topic: "billing-cap", region: REGION, serviceAccount: "billing-guard@", maxInstances: 1 },
  async (event) => {
    const msg = event.data.message.json || {};
    const cost = Number(msg.costAmount), budget = Number(msg.budgetAmount);
    logger.info("budget update", { cost, budget, currency: msg.currencyCode, threshold: msg.alertThresholdExceeded });
    if (!(cost >= budget) || !(budget > 0)) return;
    // least privilege: the guard may unlink billing (roles/billing.projectManager)
    // but not read it, so it just unlinks; doing it twice is harmless
    const name = "projects/" + PROJECT;
    await billing.updateProjectBillingInfo({ name, projectBillingInfo: { billingAccountName: "" } });
    logger.warn("monthly budget reached: billing unlinked", { cost, budget });
  },
);

// ------------------------------------------------------------ limits
// Per instance (at most 3): 60 beacons per IP every 10 minutes, 1200 a
// minute overall. A flood gets 429s and can't run up writes or costs.
const SALT = crypto.randomBytes(16);
const hits = new Map();
let minuteAt = 0, minuteN = 0;
function allow(req) {
  const now = Date.now();
  if (now - minuteAt > 60000) { minuteAt = now; minuteN = 0; if (hits.size > 50000) hits.clear(); }
  if (++minuteN > 1200) return false;
  const ip = String(req.get("x-forwarded-for") || req.ip || "").split(",")[0].trim();
  const key = crypto.createHash("sha256").update(SALT).update(ip).digest("base64").slice(0, 16);
  const h = hits.get(key);
  if (!h || now - h.t > 10 * 60 * 1000) { hits.set(key, { t: now, n: 1 }); return true; }
  return ++h.n <= 60;
}

// beacons come from the game's own pages (browsers always send Origin on a POST):
// the Hosting sites in SITES (functions/.env.<project>, out of git), else the project's default site
const SITES = (process.env.SITES || PROJECT).split(",").map((x) => x.trim()).filter(Boolean);
const ORIGINS = SITES.flatMap((site) => ["https://" + site + ".web.app", "https://" + site + ".firebaseapp.com"]);
const fromGame = (origin) => ORIGINS.includes(origin) || (EMU && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || ""));

let boardCache = null;

// ------------------------------------------------------- weekly challenge
// The game's own pure modules (copied into game/ by tools/build.mjs): the
// server replays the recorded inputs with the same code the browser ran.
let GAME = null;
function game() {
  if (GAME) return GAME;
  const ctx = vm.createContext({ console, Math, JSON, Set, Map, Float32Array, Int32Array, Uint8Array, Error, Object, Array, Number, String, RegExp, Date });
  for (const f of ["core.js", "i18n.js", "lang/it.js", "content.js", "venue.js", "chat.js", "sim.js", "bot.js", "weekly.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "game", f), "utf8"), ctx, { filename: f });
  }
  GAME = ctx.DF;
  return GAME;
}
const plays = new Map();
function allowPlay(uid) {
  const now = Date.now(), p = plays.get(uid);
  if (!p || now - p.t > 3600e3) { plays.set(uid, { t: now, n: 1 }); return true; }
  return ++p.n <= 20;
}
// the cup of a week: each chapter counts the sum of its three best players
function cupRows(players, ok) {
  ok = ok || {};
  const by = {};
  for (const r of Object.values(players || {})) {
    if (!r || typeof r.ch !== "string" || !(r.s >= 0)) continue;
    const k = S.slug(r.ch);
    if (!k || ok[k] === false || !(ok[k] === true || S.isChapter(r.ch))) continue;
    (by[k] = by[k] || { n: r.ch, scores: [] }).scores.push(r.s);
  }
  const rows = Object.values(by).map((c) => ({ n: c.n, p: c.scores.length, s: c.scores.sort((a, b) => b - a).slice(0, 3).reduce((a, v) => a + v, 0) }))
    .sort((a, b) => b.s - a.s || a.n.localeCompare(b.n));
  return { rows: rows.slice(0, 30), chapters: rows.length, players: Object.keys(players || {}).length };
}
const cupCache = new Map();

// the diary keeps a year: once a day per instance, drop the days before that
let prunedOn = "";
async function prune() {
  const today = S.romeDate();
  if (prunedOn === today) return;
  prunedOn = today;
  const db = getDatabase(), drop = {};
  for (const kind of ["d", "q", "x"]) {
    const old = await db.ref("logs/" + kind).orderByKey().endBefore(S.keepFrom()).limitToFirst(60).get();
    old.forEach((day) => { drop["logs/" + kind + "/" + day.key] = null; });
  }
  if (Object.keys(drop).length) { await db.ref().update(drop); logger.info("diary pruned", { days: Object.keys(drop).length }); }
}

exports.api = onRequest(
  { region: REGION, maxInstances: 3, concurrency: 40, memory: "512MiB", timeoutSeconds: 30, invoker: "public", cors: EMU, serviceAccount: STATS_SA },
  async (req, res) => {
    const route = req.path.replace(/^\/api(?=\/)/, "");
    res.set("X-Content-Type-Options", "nosniff");
    if (route === "/stat") {
      res.set("Cache-Control", "no-store");
      if (req.method !== "POST") return res.status(405).end();
      if (!fromGame(req.get("origin"))) return res.status(403).end();
      const raw = req.rawBody ? req.rawBody.toString("utf8") : typeof req.body === "string" ? req.body : "";
      const b = S.parseBeacon(raw);
      if (!b) return res.status(400).end();
      if (!allow(req)) return res.status(429).end();
      const day = S.romeDate();
      const updates = S.statUpdates(b, day), diary = S.diaryRecord(b, day);
      if (req.get("x-ovb-dry-run") === "1") return res.status(200).json({ updates, diary }); // smoke test: nothing written
      const inc = {};
      for (const [p, n] of Object.entries(updates)) inc["stats/" + p] = ServerValue.increment(n);
      // diary records get random keys: push ids would carry the exact time
      if (diary) inc[diary.path + "/" + crypto.randomBytes(9).toString("base64url")] = diary.rec;
      await getDatabase().ref().update(inc);
      await prune();
      return res.status(204).end();
    }
    if (route === "/weekly") {
      res.set("Cache-Control", "no-store");
      if (req.method !== "POST") return res.status(405).end();
      if (!fromGame(req.get("origin"))) return res.status(403).end();
      // who (anonymous or Google) and from where (App Check): no scripts, no bots
      let uid;
      try {
        if (!EMU) await getAppCheck().verifyToken(req.get("x-firebase-appcheck") || "");
        uid = (await getAuth().verifyIdToken(String(req.get("authorization") || "").replace(/^Bearer /, ""))).uid;
      } catch (e) { return res.status(401).json({ error: "auth" }); }
      if (!allowPlay(uid)) return res.status(429).json({ error: "slow down" });
      const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
      if (raw.length > 400000) return res.status(413).json({ error: "too large" });
      let b;
      try { b = JSON.parse(raw); } catch (e) { return res.status(400).json({ error: "json" }); }
      const G = game(), W = G.Weekly;
      const week = W.weekOf(new Date()), prev = W.weekOf(new Date(Date.now() - 864e5)); // a day of grace on Monday
      if (!b || !W.valid(b.w) || (b.w !== week && b.w !== prev) || !Array.isArray(b.log) || b.log.length > 30000) return res.status(400).json({ error: "week" });
      const t0 = Date.now();
      const { sum, steps } = W.replay(W.setup(b.w, b.role), b.log);
      if (!sum || steps < 60) return res.status(400).json({ error: "replay" });
      const score = W.score(sum), ch = S.isChapter(b.ch) ? S.cleanName(b.ch) : null;
      const ref = getDatabase().ref("cup/" + b.w + "/u/" + uid);
      const old = (await ref.get()).val();
      const best = !old || score > old.s;
      if (best) await ref.set({ s: score, f: Math.round(sum.feedback * 10), st: sum.stars, ch, role: b.role, t: ServerValue.TIMESTAMP });
      else if (ch && old.ch !== ch) await ref.update({ ch });
      cupCache.delete(b.w);
      // where the player's chapter stands now
      let rank = 0;
      if (ch) {
        const [players, okv] = await Promise.all([getDatabase().ref("cup/" + b.w + "/u").get(), getDatabase().ref("lb/ok").get()]);
        rank = cupRows(players.val(), okv.val()).rows.findIndex((r) => S.slug(r.n) === S.slug(ch)) + 1;
      }
      logger.info("weekly", { week: b.w, ms: Date.now() - t0, steps, score, best });
      return res.status(200).json({ week: b.w, score, stars: sum.stars, feedback: Math.round(sum.feedback * 10) / 10, best: best ? score : old.s, chapter: ch, rank });
    }
    if (route === "/cup") {
      if (req.method !== "GET") return res.status(405).end();
      const W = game().Weekly, w = W.valid(String(req.query.w || "")) ? String(req.query.w) : W.weekOf(new Date());
      const hit = cupCache.get(w);
      let body = hit && Date.now() - hit.t < 60000 ? hit.body : null;
      if (!body) {
        const [players, ok] = await Promise.all([getDatabase().ref("cup/" + w + "/u").get(), getDatabase().ref("lb/ok").get()]);
        body = Object.assign({ week: w, event: W.setup(w, "lead").event }, cupRows(players.val(), ok.val()));
        cupCache.set(w, { t: Date.now(), body });
      }
      res.set("Cache-Control", "public, max-age=60, s-maxage=120");
      return res.status(200).json(body);
    }
    if (route === "/board") {
      if (req.method !== "GET") return res.status(405).end();
      const now = Date.now();
      if (!boardCache || now - boardCache.t > 60000) {
        const [all, ok] = await Promise.all([getDatabase().ref("lb/c").get(), getDatabase().ref("lb/ok").get()]);
        boardCache = { t: now, body: S.boardRows(all.val(), ok.val(), 30) };
      }
      res.set("Cache-Control", "public, max-age=60, s-maxage=300");
      return res.status(200).json(boardCache.body);
    }
    return res.status(404).end();
  },
);

// ------------------------------------------------------------- board
// lb/u/<uid> = {n: chapter, s: stars} is written by the signed-in player
// (database.rules.json checks owner, sizes and pace); lb/c/<slug> = {n, p, s, m}
// and lb/w/<uid> (the chapter where that player counts) are ours. Events can
// arrive late, twice or out of order, so each run rebuilds from what lb/u says
// now; every chapter changes in a transaction, so concurrent members never
// lose each other's stars.
exports.board = onValueWritten(
  { ref: "/lb/u/{uid}", region: REGION, maxInstances: 2, serviceAccount: STATS_SA },
  async (event) => {
    const uid = event.params.uid, db = getDatabase();
    const [cur, where] = await Promise.all([db.ref("lb/u/" + uid).get(), db.ref("lb/w/" + uid).get()]);
    const v = cur.val(), was = where.val() || "", now = v ? S.slug(v.n) : "";
    if (was && was !== now) await db.ref("lb/c/" + was).transaction((c) => S.boardMember(c, uid, null, null));
    if (now) await db.ref("lb/c/" + now).transaction((c) => S.boardMember(c, uid, v.s, S.cleanName(v.n)));
    if (was !== now) await db.ref("lb/w/" + uid).set(now || null);
  },
);
