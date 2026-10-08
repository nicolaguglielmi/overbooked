#!/usr/bin/env node
/* shots.mjs: screenshots of the game for articles and posts (docs/comunicazione/img).
 *
 *   node server/server.mjs 8765          (in another terminal)
 *   node tools/shots.mjs [outDir] [it en]
 *
 * Drives a headless Chrome over the DevTools protocol (no dependencies), with
 * the first-visit look of the published site: AI off, coach off, no stats. */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = process.argv[2] || "docs/comunicazione/img";
const LANGS = process.argv.slice(3).length ? process.argv.slice(3) : ["it", "en"];
const BASE = "http://localhost:8765/";
const PORT = 9333, W = 1400, H = 788, DPR = 2;
mkdirSync(OUT, { recursive: true });

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "ovb-shots-"))}`,
  "--mute-audio", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", `--window-size=${W},${H}`, "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let list;
for (let i = 0; i < 50; i++) {
  try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.some((t) => t.type === "page")) break; } catch (e) {}
  await sleep(200);
}
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const wait = new Map();
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
const send = (method, params) => new Promise((res, rej) => { const i = ++id; wait.set(i, (d) => (d.error ? rej(new Error(method + ": " + d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(expr.slice(0, 60) + ": " + r.exceptionDetails.exception?.description); return r.result.value; };
const go = async (url) => { await send("Page.navigate", { url }); await sleep(2500); };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64")); console.log("✓", name); };

await send("Page.enable");
// the first-visit look: AI off (the dev server has a host key)
await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.DF_STATIC = true;" });
const CUP = JSON.stringify(await (await fetch("https://overbooked.web.app/api/cup")).json()); // the live cup, as it is now
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });

for (const lang of LANGS) {
  await go(BASE + "?nostats");
  await js(`localStorage.clear(); localStorage.setItem("ovb_lang", JSON.stringify("${lang}")); localStorage.setItem("ovb_coach_off", "true"); localStorage.setItem("ovb_nostats", "true")`);

  // 1. the title, over the attract mode
  await go(BASE + "?dev&nostats");
  await js(`__df.attract(45)`); await sleep(800);
  await shot(`${lang}-1-titolo`);

  // 2. the day: DevFest, played by a novice bot until it gets busy
  await go(BASE + "?dev&nostats&day=solo&event=devfest");
  let best = null;
  for (let k = 0; k < 120; k++) {
    const r = await js(`__df.advance(2, "novizio")`);
    const n = (r.split("problems ")[1] || "").split(",").filter(Boolean).length;
    const clock = r.split(" ")[0];
    if (n >= 4 && clock >= "10:30") { best = r; break; }
    if (/^1[6-9]:/.test(clock)) break;
  }
  await sleep(600);
  console.log("  day:", best || "no chaos found");
  await shot(`${lang}-2-giornata`);

  // 3. the retro, after the end of the day
  for (let k = 0; k < 400; k++) { const r = await js(`__df.advance(5, "medio")`); if (!/problems/.test(r) || r === "no day") break; if (await js(`!!document.querySelector("#screen-retro.active, #screen-retro:not([hidden])") && getComputedStyle(document.querySelector("#screen-retro")).display !== "none"`)) break; }
  await sleep(2500);
  await shot(`${lang}-3-retro`);

  // 4. the weekly challenge
  await go(BASE + "?nostats");
  await js(`DF.Account.cup = async () => (${CUP}); document.querySelector("#m-weekly").click()`); await sleep(1500);
  await shot(`${lang}-4-settimanale`);
}
ws.close(); chrome.kill();
