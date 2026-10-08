// Overbooked! server: serves the game and, for a chapter that wants to offer
// the AI with its own key, runs the Gemini tasks.
//   node server/server.mjs [port]        (reads GEMINI_API_KEY from .env)
//
// The API key never reaches the browser. The client cannot send prompts:
// it calls a fixed set of tasks with small, validated context; the server
// builds the prompt, asks Gemini for structured JSON (responseSchema) and
// validates/clamps the answer again before returning it. Rate limits per IP
// and per day keep a public demo from turning into a free LLM proxy.
// Without a server (Firebase Hosting) each player can use their own key:
// the same tasks then run in the browser (js/ai.js).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const ROOT = path.resolve(import.meta.dirname, "..");
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch { /* env from the platform */ }
const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MODEL_FAST = process.env.GEMINI_MODEL_FAST || "gemini-3.5-flash-lite";
const PORT = Number(process.argv[2] || process.env.PORT || 8765);
const STATIC_ROOT = process.env.STATIC_ROOT ? path.resolve(ROOT, process.env.STATIC_ROOT) : ROOT;
const DEV = !process.env.STATIC_ROOT;

// ------------------------------------------------------------- limits
const PER_IP = { max: 40, windowMs: 10 * 60 * 1000 };
const PER_DAY = Number(process.env.AI_DAILY_CAP || 3000);
const buckets = new Map();
let day = new Date().toDateString(), dayCount = 0;
function allow(ip) {
  const now = Date.now();
  if (new Date().toDateString() !== day) { day = new Date().toDateString(); dayCount = 0; }
  if (dayCount >= PER_DAY) return false;
  const b = buckets.get(ip) || { n: 0, t: now };
  if (now - b.t > PER_IP.windowMs) { b.n = 0; b.t = now; }
  if (b.n >= PER_IP.max) return false;
  b.n++; dayCount++;
  buckets.set(ip, b);
  return true;
}

// --------------------------------------------------------------- tasks
// The same tasks the browser runs with a player's own key (js/ai-tasks.js):
// one source for prompts, schemas and validation.
const ctx = vm.createContext({ DF: {}, console });
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ai-tasks.js"), "utf8"), ctx, { filename: "ai-tasks.js" });
const { TASKS, body, parse } = ctx.DF.AITasks;

async function gemini(task, input) {
  const model = task.fast ? MODEL_FAST : MODEL;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), task.timeout || 25000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify(body(model, task.prompt(input), task.schema)), signal: ctl.signal,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(j.error && j.error.message || "").slice(0, 160)}`);
    return parse(j);
  } finally { clearTimeout(timer); }
}

// The anonymous counters and the board live in Cloud Functions on Firebase
// Hosting (functions/index.js); here they are only checked and logged.
const Stats = createRequire(import.meta.url)("../functions/stats.js");

// --------------------------------------------------------------- http
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".webp": "image/webp", ".ico": "image/x-icon", ".mp3": "audio/mpeg" };
const SERVE = /^\/(index\.html|firebase-config\.js|css\/[\w.-]+\.css|js\/[\w/.-]+\.js|assets\/[\w/.-]+\.(png|jpg|webp|svg|mp3)|dist\/[\w.-]+\.(html|js))?$/;

function send(res, code, obj, headers) {
  res.writeHead(code, Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, headers || {}));
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim();
  if (url.pathname === "/api/ai/health") return send(res, 200, { ok: !!KEY, model: KEY ? MODEL : null, fast: KEY ? MODEL_FAST : null });
  if (url.pathname === "/api/stat" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 400) break; }
    const b = Stats.parseBeacon(raw);
    console.log("stat " + (b ? Object.values(b).filter((v) => v !== null).join(" ") : "rejected"));
    res.writeHead(b ? 204 : 400, { "Cache-Control": "no-store" });
    return res.end();
  }
  if (url.pathname === "/api/board") return send(res, 200, { rows: [], chapters: 0, players: 0 });
  const m = url.pathname.match(/^\/api\/ai\/(\w+)$/);
  if (m) {
    const task = TASKS[m[1]];
    if (!task || req.method !== "POST") return send(res, 404, { error: "unknown task" });
    if (!KEY) return send(res, 503, { error: "AI not configured" });
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: "cross-origin" });
    if (!allow(ip)) return send(res, 429, { error: "slow down" });
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 16000) return send(res, 413, { error: "too large" }); }
    const t0 = Date.now();
    try {
      const input = task.input(JSON.parse(raw || "{}"));
      const out = task.clean(await gemini(task, input));
      console.log(`ai ${m[1]} ${input.lang} ${Date.now() - t0}ms ok`);
      return send(res, 200, out);
    } catch (e) {
      console.log(`ai ${m[1]} ${Date.now() - t0}ms FAIL ${String(e.message || e).slice(0, 160)}`);
      return send(res, 502, { error: "AI failed" });
    }
  }
  // static files
  let p = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!SERVE.test(p)) { res.writeHead(404); return res.end("not found"); }
  let file = path.join(STATIC_ROOT, p);
  if (!file.startsWith(STATIC_ROOT)) { res.writeHead(403); return res.end(); }
  // no local Firebase config yet: serve the example (DF_FIREBASE = null)
  if (p === "/firebase-config.js" && !fs.existsSync(file)) file = path.join(STATIC_ROOT, "firebase-config.example.js");
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": DEV ? "no-store" : "public, max-age=300" });
    res.end(data);
  });
});

server.listen(PORT, process.env.HOST || "127.0.0.1", () => {
  console.log(`Overbooked! on http://localhost:${PORT} · AI ${KEY ? MODEL + " / " + MODEL_FAST : "off (no GEMINI_API_KEY)"}`);
});
