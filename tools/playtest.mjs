// Playtest: the bot plays the season's events with human-like profiles.
// Every difficulty change is judged on these tables, not by feel.
//   node tools/playtest.mjs [runs] [--e2e] [--event=devfest]
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ctx = vm.createContext({ console, Math, JSON, Set, Map, Float32Array, Int32Array, Uint8Array, Error, Object, Array, Number, String, RegExp });
for (const f of ["core.js", "i18n.js", "lang/it.js", "lang/en.js", "content.js", "venue.js", "chat.js", "sim.js", "bot.js", "prep.js", "weekly.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", f), "utf8"), ctx, { filename: f });
}
export const DF = ctx.DF;

// a "medium" preparation per event, and the two extremes
export function loadoutFor(event, level) {
  const ev = DF.EVENTS[event];
  const base = { event, attendees: Math.round(ev.rsvp * 0.66), volunteers: 2, energy: 75, satStart: 60, coffeeCap: 100, budget: 300 };
  if (level === "preparato") return Object.assign(base, { attendees: Math.round(ev.attendees * 1.05), volunteers: 3, energy: 85, satStart: 64, coffeeCap: 120,
    tools: { adattatori: true, batterie: true, ciabatte: true, hotspot: true, badge: true, crediti: true },
    flags: { provaTecnica: true, speakerCare: true, cocTeam: true, checkinQR: true, catering: true, signage: true, raffle: true, backupSpeaker: true, runOfShow: true, networkCheck: true, fireCheck: true, timeKeeper: true, streamTest: true, vipReady: true } });
  if (level === "impreparato") return Object.assign(base, { attendees: Math.round(ev.attendees * 0.9), volunteers: 0, energy: 60, satStart: 55, coffeeCap: 80, tools: {}, flags: {} });
  return Object.assign(base, { attendees: ev.attendees, tools: { adattatori: true, batterie: event !== "meetup" }, flags: { speakerCare: true, checkinQR: event !== "meetup", catering: true } });
}

export function runDay({ seed, loadout, players, profiles, fps = 30, soldout = false, venue = "uni" }) {
  const event = loadout.event || "devfest";
  // sold-out: 40% more people, as js/main.js does
  if (soldout) loadout = Object.assign({}, loadout, { attendees: Math.round(loadout.attendees * 1.4), rsvp: Math.round((loadout.rsvp || loadout.attendees) * 1.4) });
  const chat = DF.Chat.build(event, seed, null, loadout.flags || {});
  const s = DF.Sim.createDay({ seed, event, players, loadout, chat, banterN: 14, soldout, venue });
  const dt = 1 / fps;
  let guard = 0;
  const limit = (DF.EVENTS[event].daySeconds + 5) * fps;
  while (!s.over && guard++ < limit) {
    const inputs = {};
    for (const o of s.orgs) inputs[o.id] = DF.Bot.think(s, o, DF.BOT_PROFILES[profiles[o.id]], dt);
    DF.Sim.stepDay(s, dt, inputs);
    s.events.length = 0;
  }
  return { s, sum: DF.Sim.summary(s) };
}

const SETUPS = [
  ["solo novizio", { p1: "novizio" }, [{ id: "p1", role: "lead" }]],
  ["solo medio", { p1: "medio" }, [{ id: "p1", role: "lead" }]],
  ["novizio + co-lead", { p1: "novizio", p2: "colead" }, [{ id: "p1", role: "lead" }, { id: "p2", role: "tech", ctrl: "bot" }]],
  ["coppia media", { p1: "medio", p2: "medio" }, [{ id: "p1", role: "lead" }, { id: "p2", role: "tech" }]],
];

function table(runs, only) {
  const rows = [];
  for (const event of DF.EVENT_ORDER) {
    if (only && event !== only) continue;
    for (const level of ["preparato", "medio", "impreparato"]) {
      for (const [name, profiles, players] of SETUPS) {
        let fb = 0, min = 9, stars = [0, 0, 0, 0], esc = 0, ok = 0, tot = 0, chatA = 0, chatI = 0, inter = 0, panic = 0;
        const typeEsc = {};
        for (let r = 0; r < runs; r++) {
          const { sum } = runDay({ seed: 1000 + r * 7919, loadout: loadoutFor(event, level), players, profiles });
          fb += sum.feedback; min = Math.min(min, sum.feedback); stars[sum.stars]++;
          esc += sum.stats.escalated; ok += sum.stats.talksOnTime; tot += sum.stats.talksTotal;
          chatA += sum.stats.chatAnswered; chatI += sum.stats.chatIgnored; inter += sum.stats.interrupts; panic += sum.stats.panicTime;
          for (const [k, v] of Object.entries(sum.stats.byType)) typeEsc[k] = (typeEsc[k] || 0) + v.escalated;
        }
        const top = Object.entries(typeEsc).sort((a, b) => b[1] - a[1]).slice(0, 3).filter((x) => x[1] > 0).map(([k, v]) => `${k}:${(v / runs).toFixed(1)}`).join(" ");
        rows.push({ evento: event, prep: level, setup: name, fb: (fb / runs).toFixed(2), min: min.toFixed(2), "0/1/2/3★": stars.join("/"), escal: (esc / runs).toFixed(1), "in orario": `${(ok / runs).toFixed(1)}/${(tot / runs).toFixed(1)}`, chat: `${(chatA / runs).toFixed(1)}✓ ${(chatI / runs).toFixed(1)}✗`, stop: (inter / runs).toFixed(1), caos: (panic / runs).toFixed(0) + "s", top });
      }
    }
  }
  console.table(rows);
}

// ---- end to end: a Countdown played by a simple strategy, then the day ----
const ESSENTIAL = ["team", "volontari", "catering", "kitav", "promo", "reminder", "sede", "speakercare", "checkin", "riserva", "m_pizza", "m_promo", "sj_quota", "kitlab", "io_stream", "wtm_kids", "wtm_access", "wtm_photo", "coc", "hk_mentors", "hk_food", "hk_rest"];
export function playPrep(strategy, seed, players, event = "devfest") {
  const st = DF.Prep.createPrep({ seed, players, event });
  const rng = DF.makeRng(seed ^ 0x9e3779b9);
  for (let r = 0; r < st.rounds; r++) {
    DF.Prep.deal(st);
    let hand = st.hand.slice();
    if (strategy === "essenziale") hand.sort((a, b) => (ESSENTIAL.includes(b) ? 1 : 0) - (ESSENTIAL.includes(a) ? 1 : 0));
    else rng.shuffle(hand);
    for (const id of hand) {
      const c = DF.Prep.cardOf(st, id);
      let opt;
      if (strategy === "pigro") opt = c.opts.findIndex((o) => o.cost === 0);
      else if (strategy === "essenziale") opt = 0;
      else opt = rng.int(0, 1);
      if (opt < 0) continue;
      const m = st.members.slice().sort((a, b) => (b.pips - b.used + (DF.AFFINITY[c.stream] === b.role ? 0.5 : 0)) - (a.pips - a.used + (DF.AFFINITY[c.stream] === a.role ? 0.5 : 0)))[0];
      const cost = DF.Prep.costFor(st, c, c.opts[opt], m);
      if (m.used + cost <= m.pips) DF.Prep.toggle(st, id, opt, m.id);
    }
    DF.Prep.resolve(st);
  }
  return DF.Prep.loadout(st);
}

function endToEnd(runs, only) {
  const rows = [];
  for (const event of DF.EVENT_ORDER) {
    if (only && event !== only) continue;
    for (const strategy of ["pigro", "a caso", "essenziale"]) {
      for (const profile of ["novizio", "medio", "esperto"]) {
        let fb = 0, stars = [0, 0, 0, 0], att = 0, co = 0;
        const goalOk = {};
        for (let r = 0; r < runs; r++) {
          const seed = 5000 + r * 7919;
          const lo = playPrep(strategy, seed, [{ id: "p1", role: "lead" }], event);
          const players = [{ id: "p1", role: "lead" }];
          const profiles = { p1: profile };
          if (lo.coLead) { players.push({ id: "p2", role: "tech", ctrl: "bot" }); profiles.p2 = "colead"; co++; }
          const { sum } = runDay({ seed, loadout: lo, players, profiles });
          fb += sum.feedback; stars[sum.stars]++; att += sum.present;
          for (const g of sum.goals) goalOk[g.id] = (goalOk[g.id] || 0) + (g.ok ? 1 : 0);
        }
        rows.push({ evento: event, countdown: strategy, giocatore: profile, fb: (fb / runs).toFixed(2), "0/1/2/3★": stars.join("/"), obiettivi: Object.entries(goalOk).map(([k, v]) => k + " " + v + "/" + runs).join(" "), presenti: (att / runs).toFixed(0), "co-lead": `${co}/${runs}` });
      }
    }
  }
  console.table(rows);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = Number(process.argv[2] || 10);
  const ev = (process.argv.find((a) => a.startsWith("--event=")) || "").split("=")[1];
  if (process.argv.includes("--e2e")) endToEnd(runs, ev);
  else table(runs, ev);
}
