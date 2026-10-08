/* Overbooked! — the co-op game for people who run tech communities
 * core.js: shared namespace, constants, math helpers, seeded RNG.
 * Every js/*.js file is a classic script that adds to the global DF
 * namespace, so the game opens straight from file:// and the pure parts
 * (content, venue, sim, prep, bot) also load in Node for the playtest. */
"use strict";
var DF = (typeof globalThis !== "undefined" ? globalThis : window).DF = (typeof DF !== "undefined" && DF) || {};

DF.VERSION = "0.8.1";

// who made it (shown in "The project", on the title and in the shared texts)
DF.CREDITS = { author: "Nicola Guglielmi", title: "GDE", url: "https://gdg.community.dev/" }; // url: find a GDG near you

// Logical canvas, ~1.85:1: HUD on top, the venue, the staff radio below.
// Fits a phone in landscape and a laptop without covering the map.
DF.W = 960;
DF.H = 520;
DF.HUD_H = 48;
DF.RADIO_H = 40;
DF.TILE = 24;
DF.COLS = 40;
DF.ROWS = 18;

DF.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
DF.lerp = (a, b, t) => a + (b - a) * t;
DF.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
DF.approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

// mulberry32: small, fast, deterministic. The sim only draws from its own
// RNG so a seed replays the same day (playtest, online host).
DF.makeRng = function (seed) {
  let s = (seed >>> 0) || 1;
  const rng = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + rng() * (b - a);
  rng.int = (a, b) => Math.floor(a + rng() * (b - a + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  rng.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  return rng;
};

// Game clock: the DevFest day runs 09:00 → 18:00 in DAY_SECONDS real seconds.
DF.DAY_START = 9 * 60;
DF.DAY_END = 18 * 60;

DF.fmtClock = function (min) {
  const m = Math.max(0, Math.floor(min));
  const h = Math.floor(m / 60) % 24, mm = m % 60; // the hackathon runs past midnight
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
};

// Italian decimal comma, as everywhere in the copy.
DF.fmtDec = (v, digits = 1) => v.toFixed(digits).replace(".", ",");

DF.storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: ignore */ }
  },
};
