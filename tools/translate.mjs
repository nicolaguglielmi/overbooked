#!/usr/bin/env node
/* translate.mjs: writes js/lang/{fr,es,de}.js from the English pack with Gemini.
 *
 *   node tools/translate.mjs              all three languages
 *   node tools/translate.mjs de --only=cards,chat
 *   node tools/translate.mjs --only=ui.acct,ui.board   (sub-keys of a big key)
 *
 * Reads GEMINI_API_KEY from .env (it never reaches the browser). The English
 * pack is the source, the Italian one a reference for tone. The output is
 * checked against the English structure: same keys, same array lengths, same
 * {placeholders}. Anything that does not match stays in English and is listed
 * at the end, so a bad answer can never break the game. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch { /* env from the shell */ }
const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : d; };
const MODEL = opt("model", process.env.GEMINI_MODEL || "gemini-3.8-flash");
const LANGS = { fr: "French", es: "Spanish", de: "German" };
const TU = { fr: "informal 'tu'", es: "informal 'tú'", de: "informal 'du'" };
const targets = args.filter((a) => LANGS[a]);
const only = opt("only", "").split(",").filter(Boolean);
if (!KEY) { console.error("GEMINI_API_KEY missing (.env)"); process.exit(1); }

// ------------------------------------------------------------ the packs
const ctx = vm.createContext({ DF: {} });
for (const f of ["en", "it"]) vm.runInContext(fs.readFileSync(path.join(ROOT, "js/lang", f + ".js"), "utf8"), ctx, { filename: f + ".js" });
const EN = JSON.parse(JSON.stringify(ctx.DF.L.en));
const IT = JSON.parse(JSON.stringify(ctx.DF.L.it));

// units of work: top-level keys; big ones split into groups of sub-keys (~4 KB each)
const units = [];
for (const k of Object.keys(EN)) {
  const v = EN[k];
  if (v && typeof v === "object" && !Array.isArray(v) && JSON.stringify(v).length > 5000) {
    let group = [], size = 0;
    for (const sub of Object.keys(v)) {
      const n = JSON.stringify(v[sub]).length;
      if (group.length && size + n > 4000) { units.push({ key: k, subs: group }); group = []; size = 0; }
      group.push(sub); size += n;
    }
    if (group.length) units.push({ key: k, subs: group });
  } else units.push({ key: k });
}
const part = (o, u) => (u.subs ? Object.fromEntries(u.subs.map((s) => [s, o && o[u.key] ? o[u.key][s] : undefined])) : o[u.key]);
const label = (u) => (u.subs ? u.key + "." + u.subs[0] + (u.subs.length > 1 ? "…" + u.subs[u.subs.length - 1] : "") : u.key);

// ------------------------------------------------------------ Gemini
async function gemini(prompt) {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4, thinkingConfig: { thinkingLevel: "low" } },
  };
  for (let attempt = 1; ; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 120000);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify(body), signal: ctl.signal,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(`gemini ${res.status}: ${(j.error && j.error.message || "").slice(0, 200)}`);
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      return JSON.parse(text);
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    } finally { clearTimeout(timer); }
  }
}

const KEEP = "Overbooked!, Murphy, GDG, GDE, DevFest, Google, Google I/O, I/O Extended, Study Jam, Build with AI, Gemini, Gemma, Firebase, Flutter, Android, Kotlin, Chrome, Cloud, Wi-Fi, HDMI, USB-C, QR, RSVP, CoC, VIP";
function prompt(lang, en, it) {
  return [
    `Translate the string values of this JSON from English into ${LANGS[lang]}.`,
    "It is the UI and the dialogue of 'Overbooked!', a funny co-op game about running Google Developer Group community events (meetups, Study Jams, I/O Extended, DevFest): organizers, speakers, volunteers, sponsors, a staff group chat.",
    "Rules:",
    "- Return JSON with exactly the same structure: same keys (never translate keys), same nesting, same array lengths. Translate only the string values.",
    "- Keep every {placeholder} exactly as written, e.g. {n}, {name}, {chapter}.",
    "- Keep emoji, symbols (★ ☆ · → ✓ ✗ ⚠ ✱ €), keyboard keys (Q, E, WASD, Space, Enter, Esc) and these names unchanged: " + KEEP + ".",
    "- People's first names (Luca, Anna, Giada…) stay as they are; Italian place names stay as they are.",
    `- Natural, witty and short: as long as the English or shorter, the UI is tight. Address the player with the ${TU[lang]}. Talk like real community organizers in a group chat.`,
    "- Code of Conduct texts stay serious and respectful.",
    "- The Italian version is a second reference for meaning and tone (the game was written in Italian).",
    "",
    "English (translate this):",
    JSON.stringify(en),
    "",
    "Italian (reference only):",
    JSON.stringify(it === undefined ? null : it),
  ].join("\n");
}

// ------------------------------------------------------------ checks
const holes = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
function merge(en, tr, where, issues) {
  if (typeof en === "string") {
    if (typeof tr !== "string" || !tr.trim()) { issues.push(where + ": missing"); return en; }
    if (holes(en) !== holes(tr)) { issues.push(where + ": placeholders " + holes(en) + " ≠ " + holes(tr)); return en; }
    return tr;
  }
  if (Array.isArray(en)) {
    if (!Array.isArray(tr) || tr.length !== en.length) { issues.push(where + ": array length"); return en; }
    return en.map((x, i) => merge(x, tr[i], where + "[" + i + "]", issues));
  }
  if (en && typeof en === "object") {
    const out = {};
    for (const k of Object.keys(en)) out[k] = merge(en[k], tr && typeof tr === "object" ? tr[k] : undefined, where + "." + k, issues);
    return out;
  }
  return en; // numbers, booleans
}

async function pool(items, n, f) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await f(items[k], k); } }));
  return out;
}

// ------------------------------------------------------------ run
const langs = targets.length ? targets : Object.keys(LANGS);
for (const lang of langs) {
  const file = path.join(ROOT, "js/lang", lang + ".js");
  // keep what we already have for the units we are not redoing
  let prev = {};
  if (only.length) {
    const c = vm.createContext({ DF: {} });
    try { vm.runInContext(fs.readFileSync(file, "utf8"), c); prev = JSON.parse(JSON.stringify(c.DF.L[lang] || {})); } catch { prev = {}; }
  }
  // --only=cards,ui.acct: whole top-level keys, or single sub-keys of a big one
  const todo = !only.length ? units : units.filter((u) => only.includes(u.key))
    .concat(only.filter((o) => o.includes(".")).map((o) => ({ key: o.split(".")[0], subs: [o.split(".")[1]] })));
  const issues = [];
  const t0 = Date.now();
  const results = await pool(todo, 5, async (u) => {
    const en = part(EN, u), it = part(IT, u);
    try {
      const tr = await gemini(prompt(lang, en, it));
      process.stdout.write(".");
      return merge(en, tr, label(u), issues);
    } catch (e) {
      issues.push(label(u) + ": " + e.message);
      process.stdout.write("x");
      return en;
    }
  });
  const pack = JSON.parse(JSON.stringify(EN));
  // start from the English shape, put back the previous translation, then the new units
  for (const k of Object.keys(pack)) if (prev[k] !== undefined) pack[k] = merge(EN[k], prev[k], k, []);
  todo.forEach((u, i) => {
    if (u.subs) Object.assign(pack[u.key], results[i]);
    else pack[u.key] = results[i];
  });
  const src = `/* ${LANGS[lang]}: generated by tools/translate.mjs from the English pack (${MODEL}). Edit freely. */\n"use strict";\nDF.L = DF.L || {};\nDF.L.${lang} = ${JSON.stringify(pack, null, 2)};\n`;
  fs.writeFileSync(file, src);
  console.log(`\n${lang}: ${todo.length} units in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${path.relative(ROOT, file)} (${(src.length / 1024).toFixed(0)} KB)`);
  if (issues.length) console.log("  kept in English:\n  - " + issues.slice(0, 40).join("\n  - ") + (issues.length > 40 ? `\n  … ${issues.length - 40} more` : ""));
}
