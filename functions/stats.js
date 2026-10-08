/* Anonymous counters and the chapter board: pure helpers shared by the Cloud
 * Functions (index.js) and the publication gate (tools/check.mjs).
 *
 * A beacon carries a few allowlisted values and nothing that identifies a
 * person: no IP, no cookie, no id, no free text. The only text that can reach
 * the counters is a chapter name, and only when it looks like one ("GDG ...",
 * "WTM ..."), so a player who types their own name there is never counted.
 * The game diary (logs/d, q, x) keeps one record per day played, per day left
 * halfway and per game error, with the date only (random keys, no timestamp),
 * to tune the game; records older than a year are pruned. */
"use strict";

const EVENTS = ["meetup", "studyjam", "wtm", "ioext", "hack", "devfest"];
const LANGS = ["it", "en", "fr", "es", "de"];
const SOURCES = ["direct", "linkedin", "medium", "google", "x", "facebook", "instagram", "telegram", "whatsapp", "github", "youtube", "reddit", "devto", "gdg", "bing", "duckduckgo", "mail", "qr", "other"];
const MODES = ["solo", "duo", "online"];
const MAX_STARS = EVENTS.length * 3;
const PROBLEMS = ["queue", "stampante", "speaker", "hdmi", "mic", "wifi", "prese", "coffee", "pizza", "overflow", "sponsor", "perso", "coc", "cancel", "tavoli", "overrun", "vip", "dog", "press", "flame", "blackout", "quota", "stream", "badge", "kid", "access", "foto", "mentor", "noise"];
const FLAGS = ["checkinQR", "catering", "speakerCare", "backupSpeaker", "provaTecnica", "networkCheck", "labReady", "cocTeam", "runOfShow", "signage", "raffle", "sponsorPack", "fireCheck", "pressReady", "dogGate", "streamTest", "vipReady", "timeKeeper", "kidsCorner", "photoLanyards", "accessRoute", "mentors", "restArea", "judgingRules", "nightGuard"];
const TOOLS = ["adattatori", "batterie", "ciabatte", "hotspot", "badge", "crediti"];
const PERKS = ["walkie", "qr", "kit", "signs", "moka", "shoes", "squad", "colead"];
const ROLES = ["lead", "tech", "host", "care"];
const PHASES = ["title", "prep", "loadout", "day", "ending", "retro"];
const KEEP_DAYS = 365;
const CHAPTER_RE = /^(GDG|GDSC|WTM|Google Developer (Groups?|Student Clubs?))(\s|$)/i;

const pick = (v, list) => (typeof v === "string" && list.includes(v) ? v : null);
const bit = (v) => (v === 1 || v === true ? 1 : 0);
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

// a chapter's display name: letters, digits, spaces and a few signs, 2-40 chars
function cleanName(s) {
  if (typeof s !== "string") return "";
  const n = s.normalize("NFC").replace(/[^\p{L}\p{N} &'.-]/gu, " ").replace(/\s+/g, " ").trim();
  return n.length >= 2 && n.length <= 40 ? n : "";
}
const slug = (s) => cleanName(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const isChapter = (s) => CHAPTER_RE.test(cleanName(s));
const clampStars = (v) => Math.max(0, Math.min(MAX_STARS, Math.round(Number(v) || 0)));

// "Europe/Rome" -> "Europe~Rome": database keys can't hold "/"
function zone(z) {
  return typeof z === "string" && z.length <= 40 && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(z) ? z.replace(/\//g, "~") : null;
}

// the day the counters go to, on the organizers' clock
const romeDate = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(d || new Date());

const list = (v, allowed) => (Array.isArray(v) ? [...new Set(v.filter((x) => allowed.includes(x)))].slice(0, 30) : []);
// {key: integer within [lo, hi]} for the keys a record may hold; anything else is dropped
function ints(o, spec) {
  const out = {};
  if (!o || typeof o !== "object") return out;
  for (const [k, [lo, hi]] of Object.entries(spec)) { const v = int(o[k], lo, hi); if (v !== null) out[k] = v; }
  return out;
}
const VERSION_RE = /^\d{1,2}\.\d{1,2}\.\d{1,3}$/;
const version = (v) => (typeof v === "string" && VERSION_RE.test(v) ? v : null);
// an error message without addresses, emails or long numbers, printable ASCII only
function cleanMsg(m) {
  if (typeof m !== "string") return null;
  const out = m.replace(/https?:\/\/\S+/g, "<url>").replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>").replace(/\d{4,}/g, "<n>").replace(/[^\x20-\x7E]/g, "?").trim().slice(0, 140);
  return out || null;
}
const DAY_STATS = { rw: [0, 9], rt: [0, 9], pr: [0, 5000], at: [0, 5000], mq: [0, 1000], ot: [0, 99], tt: [0, 99], tc: [0, 99], fx: [0, 999], pv: [0, 999], es: [0, 999], dl: [0, 999], ca: [0, 999], ci: [0, 999], bo: [0, 99], it: [0, 9999], sc: [0, 999999], mc: [0, 99], ms: [0, 99] };
const LOADOUT = { vo: [0, 50], en: [0, 300], bu: [-9999, 9999], sr: [0, 100] };

// the summary of a day for the diary (the "e" beacon's optional part)
function daySummary(b) {
  if (!b.s || typeof b.s !== "object") return null;
  const p = {};
  if (b.p && typeof b.p === "object") {
    for (const [type, v] of Object.entries(b.p)) {
      if (!PROBLEMS.includes(type) || !Array.isArray(v)) continue;
      const sp = int(v[0], 0, 99), es = int(v[1], 0, 99);
      if (sp !== null && es !== null) p[type] = [sp, es];
    }
  }
  const lo = b.lo && typeof b.lo === "object" ? Object.assign(ints(b.lo, LOADOUT), { fl: list(b.lo.fl, FLAGS), tl: list(b.lo.tl, TOOLS) }) : null;
  return {
    v: version(b.v), l: pick(b.l, LANGS), d: pick(b.d, ["m", "d"]),
    g: Array.isArray(b.g) ? b.g.slice(0, 3).map(bit) : [],
    n: int(b.n, 1, 4), b: int(b.b, 0, 3), ro: list(b.ro, ROLES), pk: list(b.pk, PERKS),
    rx: bit(b.rx), ai: bit(b.ai), pr: bit(b.pr), co: bit(b.co), sp: int(b.sp, 0, 3600),
    s: ints(b.s, DAY_STATS), p, lo,
  };
}

// raw request body -> a clean beacon, or null
function parseBeacon(raw) {
  if (typeof raw !== "string" || raw.length > 2500) return null;
  let b;
  try { b = JSON.parse(raw); } catch (e) { return null; }
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  if (b.k === "v") { // a visit
    const l = pick(b.l, LANGS), s = pick(b.s, SOURCES), d = pick(b.d, ["m", "d"]);
    return l && s && d ? { k: "v", l, s, d, r: bit(b.r), z: zone(b.z) } : null;
  }
  if (b.k === "s") { // a day starts
    const e = pick(b.e, EVENTS), m = pick(b.m, MODES);
    return e && m ? { k: "s", e, m, a: bit(b.a), x: bit(b.x), p: bit(b.p), h: bit(b.h) } : null;
  }
  if (b.k === "e") { // a day ends: stars and the rating x10, plus the summary for the diary
    const e = pick(b.e, EVENTS), m = pick(b.m, MODES), st = int(b.st, 0, 3), f = int(b.f, 0, 50);
    return e && m && st !== null && f !== null ? { k: "e", e, m, st, f, h: bit(b.h), c: isChapter(b.c) ? slug(b.c) : null, x: daySummary(b) } : null;
  }
  if (b.k === "c") { // a Countdown starts
    const e = pick(b.e, EVENTS), m = pick(b.m, MODES);
    return e && m ? { k: "c", e, m } : null;
  }
  if (b.k === "q") { // a day left halfway: how far it got, in percent
    const e = pick(b.e, EVENTS), m = pick(b.m, MODES), pc = int(b.pc, 0, 100);
    return e && m && pc !== null ? { k: "q", e, m, pc, v: version(b.v) } : null;
  }
  if (b.k === "x") { // a game error
    const msg = cleanMsg(b.msg);
    const src = typeof b.src === "string" && /^[a-z0-9-]{1,30}\.(js|html)$|^promise$/.test(b.src) ? b.src : null;
    return msg ? { k: "x", msg, src, ln: int(b.ln, 0, 999999), ph: pick(b.ph, PHASES), v: version(b.v) } : null;
  }
  if (b.k === "l") return { k: "l" }; // a Google sign-in
  return null;
}

// a beacon -> {path under stats/: amount to add}; "d/<day>/..." per day, "t/..." all time
function statUpdates(b, day) {
  const u = {};
  const add = (p, n) => { u[p] = (u[p] || 0) + (n == null ? 1 : n); };
  const both = (p, n) => { add("d/" + day + "/" + p, n); add("t/" + p, n); };
  const yes = (v, a, b) => (v ? a : b); // words, not 0/1: the database would turn numeric keys into arrays
  if (b.k === "v") { both("v"); both("src/" + b.s); both("lang/" + b.l); both("dev/" + b.d); both("ret/" + yes(b.r, "back", "new")); if (b.z) add("t/tz/" + b.z); }
  if (b.k === "s") { both("s/" + b.e); add("t/mode/" + b.m); add("t/ai/" + yes(b.a, "on", "off")); add("t/relax/" + yes(b.x, "on", "off")); add("t/prep/" + b.e + "~" + yes(b.p, "yes", "no")); if (b.h) add("t/soldout/" + b.e); }
  if (b.k === "e") { both("e/" + b.e); add("t/stars/" + b.e + "~" + b.st); add("t/fb/" + b.e, b.f); if (b.c) add("t/ch/" + b.c); }
  if (b.k === "c") both("cd/" + b.e);
  if (b.k === "q") { both("q/" + b.e); add("t/qpc/" + b.e, b.pc); }
  if (b.k === "x") both("x");
  if (b.k === "l") both("l");
  return u;
}

// a beacon -> the diary record it leaves (under logs/), or null
function diaryRecord(b, day) {
  if (b.k === "e" && b.x) return { path: "logs/d/" + day, rec: Object.assign({ e: b.e, m: b.m, st: b.st, f: b.f, h: b.h }, b.x) };
  if (b.k === "q") return { path: "logs/q/" + day, rec: { e: b.e, m: b.m, pc: b.pc, v: b.v } };
  if (b.k === "x") return { path: "logs/x/" + day, rec: { msg: b.msg, src: b.src, ln: b.ln, ph: b.ph, v: b.v } };
  return null;
}
// the first day the diary keeps (older days are pruned)
const keepFrom = (now) => romeDate(new Date((now || Date.now()) - KEEP_DAYS * 864e5));

// one chapter on the board after a member joins, moves or leaves (a transaction body)
function boardMember(cur, uid, stars, name) {
  const c = cur && typeof cur === "object" ? cur : {};
  const m = Object.assign({}, c.m);
  if (stars == null) delete m[uid]; else m[uid] = clampStars(stars);
  const vals = Object.values(m);
  if (!vals.length) return null;
  return { n: c.n || name || "?", m, p: vals.length, s: vals.reduce((a, v) => a + (Number(v) || 0), 0) };
}

// what /api/board shows: chapters with players, approved by name pattern or by hand (lb/ok)
function boardRows(all, ok, limit) {
  ok = ok || {};
  const rows = Object.entries(all || {})
    .filter(([k, c]) => c && c.p > 0 && typeof c.n === "string" && ok[k] !== false && (ok[k] === true || isChapter(c.n)))
    .map(([, c]) => ({ n: c.n, p: c.p, s: c.s }))
    .sort((a, b) => b.s - a.s || b.p - a.p || a.n.localeCompare(b.n));
  return { rows: rows.slice(0, limit || 30), chapters: rows.length, players: rows.reduce((a, r) => a + r.p, 0) };
}

module.exports = { EVENTS, LANGS, SOURCES, MODES, MAX_STARS, PROBLEMS, FLAGS, TOOLS, PERKS, ROLES, PHASES, KEEP_DAYS, CHAPTER_RE, cleanName, cleanMsg, slug, isChapter, clampStars, zone, romeDate, parseBeacon, statUpdates, diaryRecord, keepFrom, boardMember, boardRows };
