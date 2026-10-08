// Build: the game in three shapes.
//   node tools/build.mjs
// dist/index.html        one self-contained file (scripts, language packs,
//                        sprites inlined); loads ./firebase-config.js if present
// dist/artifact.html     the same page without the document skeleton, for an
//                        Artifact (no AI: the page can't reach Google there)
// dist/web/              multi-file site for Firebase Hosting: no inline
//                        scripts, a strict Content Security Policy built from
//                        firebase-config.js, WebP sprites, AI off by default and
//                        each player's own Gemini key (js/ai.js)
// With server/server.mjs next to the page the host's key can power the AI
// instead; without any of that the game uses the language packs and works the same.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist");
fs.mkdirSync(OUT, { recursive: true });

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, p) => `<style>\n${read(p)}\n</style>`);
// sprites as data URIs (WebP when tools/gen_sprites.py --webp made them), right after core.js
const SPR = path.join(ROOT, "assets/sprites");
const sprites = {};
for (const f of fs.readdirSync(SPR).filter((f) => f.endsWith(".png"))) {
  const n = f.slice(0, -4), webp = path.join(SPR, n + ".webp");
  sprites[n] = fs.existsSync(webp) ? "data:image/webp;base64," + fs.readFileSync(webp).toString("base64") : "data:image/png;base64," + fs.readFileSync(path.join(SPR, f)).toString("base64");
}
const spriteScript = `<script>DF.SPRITE_DATA = ${JSON.stringify(sprites)};</script>`;
// brand marks (assets/brand) travel inside the single file as data URIs
const inlineBrand = (src) => src.replace(/"(assets\/brand\/[\w.-]+\.svg)"/g, (m, f) => (fs.existsSync(path.join(ROOT, f)) ? JSON.stringify("data:image/svg+xml;base64," + fs.readFileSync(path.join(ROOT, f)).toString("base64")) : m));
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, p) => `<script>\n${(p === "js/brand.js" ? inlineBrand(read(p)) : read(p)).replace(/<\/script/gi, "<\\/script")}\n</script>` + (p === "js/core.js" ? "\n" + spriteScript : ""));
// the version shown in the page comes from js/core.js
const version = (read("js/core.js").match(/DF\.VERSION = "([^"]+)"/) || [])[1] || "dev";
html = html.replace("</title>", `</title>\n<!-- Overbooked! ${version} — built ${new Date().toISOString().slice(0, 10)} -->`);

fs.writeFileSync(path.join(OUT, "index.html"), html);
const CFG = fs.existsSync(path.join(ROOT, "firebase-config.js")) ? "firebase-config.js" : "firebase-config.example.js"; // the real one stays out of git
fs.copyFileSync(path.join(ROOT, CFG), path.join(OUT, "firebase-config.js"));

// Artifact flavour: the host wraps the page in its own skeleton and only
// allows a few CDNs, so the config is inlined (online rooms fall back to
// tabs of one browser) and the outer tags are dropped.
let art = html
  .replace(/<script src="firebase-config.js"><\/script>/, "<script>window.DF_FIREBASE = null; window.DF_NO_AI = true; window.DF_NO_STATS = true;</script>")
  .replace(/<!doctype html>\s*/i, "")
  .replace(/<html[^>]*>\s*/i, "")
  .replace(/<\/html>\s*$/i, "")
  .replace(/<head>\s*/i, "")
  .replace(/<\/head>\s*/i, "")
  .replace(/<body>\s*/i, "")
  .replace(/<\/body>\s*/i, "")
  .replace(/<meta charset="utf-8">\s*/i, "")
  .replace(/<meta name="viewport"[^>]*>\s*/i, "");
fs.writeFileSync(path.join(OUT, "artifact.html"), art);

const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + " KB";
console.log(`dist/index.html ${kb("index.html")} · dist/artifact.html ${kb("artifact.html")} · ${Object.keys(sprites).length} sprites · v${version}`);

// ------------------------------------------------------------------ web
// Firebase Hosting: files as they are, a CSP that lets the page talk only to
// itself, Gemini (each player's own key) and this project's database.
const WEB = path.join(OUT, "web");
fs.rmSync(WEB, { recursive: true, force: true });
const copy = (rel, dest) => { const to = path.join(WEB, dest || rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), to); };
copy("css/game.css");
copy(CFG, "firebase-config.js");
for (const dir of ["js", "js/lang"]) for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".js"))) copy(dir + "/" + f);
for (const f of fs.readdirSync(SPR).filter((f) => f.endsWith(".webp"))) copy("assets/sprites/" + f);
if (fs.existsSync(path.join(ROOT, "assets/brand"))) for (const f of fs.readdirSync(path.join(ROOT, "assets/brand"))) copy("assets/brand/" + f);
fs.writeFileSync(path.join(WEB, "config.js"), "/* Firebase Hosting build: no game server, WebP sprites. */\nwindow.DF_STATIC = true;\nwindow.DF_SPRITE_EXT = \"webp\";\n");

// the database the online rooms use, if configured
let fbHosts = "", appCheck = false, authDomain = "";
try {
  const c = vm.createContext({ window: {} });
  vm.runInContext(read(CFG), c);
  const cfg = c.window.DF_FIREBASE;
  if (cfg && cfg.databaseURL) {
    const host = new URL(cfg.databaseURL).host;
    const zone = host.endsWith(".firebasedatabase.app") ? "*.firebasedatabase.app" : "*.firebaseio.com"; // the SDK hops to a shard of the same zone
    fbHosts = ` https://${host} wss://${host} https://${zone} wss://${zone} https://identitytoolkit.googleapis.com https://securetoken.googleapis.com`;
    if (cfg.appCheckSiteKey) appCheck = true;
    if (cfg.googleSignIn && cfg.authDomain) authDomain = cfg.authDomain; // the sign-in popup talks to the page through an iframe there
  }
} catch (e) { console.warn("firebase-config.js not readable: online rooms only between tabs"); }
// App Check with reCAPTCHA Enterprise (loaded only when a room or the account opens);
// Google sign-in loads its iframe helper from apis.google.com
const rc = appCheck ? " https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/" : "";
const gsi = authDomain ? " https://apis.google.com" : "";
const frames = [appCheck ? "https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/" : "", authDomain ? "https://" + authDomain : ""].filter(Boolean).join(" ");
const csp = [
  "default-src 'self'",
  "script-src 'self' https://www.gstatic.com/firebasejs/" + rc + gsi,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:" + (appCheck ? " https://www.gstatic.com/recaptcha/" : ""),
  "connect-src 'self' https://generativelanguage.googleapis.com" + fbHosts + (appCheck ? " https://content-firebaseappcheck.googleapis.com https://www.google.com/recaptcha/" : ""),
  "frame-src " + (frames || "'none'"),
  "media-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join("; ");
let page = read("index.html")
  .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">`)
  .replace('<script src="firebase-config.js"></script>', '<script src="config.js"></script>\n<script src="firebase-config.js"></script>')
  .replace("</title>", `</title>\n<!-- Overbooked! ${version} — built ${new Date().toISOString().slice(0, 10)} -->`);
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(page)) throw new Error("web build: inline script found (the CSP would block it)");
fs.writeFileSync(path.join(WEB, "index.html"), page);
// the project's default site (hosting target "redirect") only redirects to
// the game's site (firebase.json); this page is the fallback behind it
const MOVED = path.join(OUT, "moved");
fs.rmSync(MOVED, { recursive: true, force: true });
fs.mkdirSync(MOVED, { recursive: true });
fs.writeFileSync(path.join(MOVED, "index.html"), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0; url=https://overbooked.web.app/"><title>OVERBOOKED!</title><p style="font:16px system-ui;padding:24px">OVERBOOKED! ora è su <a href="https://overbooked.web.app/">overbooked.web.app</a>.</p>\n');
// the server replays the weekly challenge with the game's own pure modules
const GAME_FILES = ["core.js", "i18n.js", "lang/it.js", "content.js", "venue.js", "chat.js", "sim.js", "bot.js", "weekly.js"];
for (const f of GAME_FILES) { const to = path.join(ROOT, "functions/game", f); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(ROOT, "js", f), to); }
const files = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? files(path.join(d, e.name)) : 1), 0);
console.log(`dist/web/ ${files(WEB)} files · CSP ${fbHosts ? "with Firebase rooms" + (appCheck ? " + App Check" : "") + (authDomain ? " + Google sign-in" : "") : "without Firebase rooms"}`);
