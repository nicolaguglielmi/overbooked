/* weekly.js: the weekly challenge — the same day for everyone, all week.
 *
 * Same seed, same event, the standard preparation, no kit, no relaxed mode,
 * no AI: the only difference is how you play. The browser records your inputs
 * step by step; the server replays them with this same code (functions/index.js)
 * to verify the score before it enters the Chapter Cup. Pure: no DOM. */
"use strict";

(function () {
  const STEP = 1 / 60;
  const PLAYER_CMDS = ["target", "goto", "take", "assign", "reply", "ability"];
  // the meetup is the tutorial: the cup rotates on the other five
  const ROTATION = ["devfest", "studyjam", "hack", "wtm", "ioext"];

  // ISO week of a date, as "2026-W41"
  function weekOf(d) {
    d = d || new Date();
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
    return t.getUTCFullYear() + "-W" + String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, "0");
  }
  const valid = (w) => typeof w === "string" && /^\d{4}-W\d{2}$/.test(w);
  function hash(str) {
    let h = 2166136261;
    for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0) || 1;
  }

  // the preparation everyone gets (the quick game uses it too)
  function standardLoadout(event) {
    const ev = DF.EVENTS[event];
    return {
      event, attendees: ev.attendees, rsvp: ev.rsvp, showRate: 0.64, volunteers: 2, energy: 80, satStart: 60, coffeeCap: 100, budget: 300,
      tools: { adattatori: true, batterie: true }, flags: { checkinQR: true, catering: true, speakerCare: true },
    };
  }

  function setup(w, role) {
    const n = Number(w.slice(0, 4)) * 53 + Number(w.slice(6));
    const event = ROTATION[n % ROTATION.length];
    role = DF.ROLES[role] ? role : "lead";
    return {
      week: w, event, seed: hash("overbooked/" + w), role,
      players: [{ id: "p1", role, name: "" }, { id: "p2", role: role === "tech" ? "lead" : "tech", name: "Co-org", ctrl: "bot" }],
      loadout: standardLoadout(event),
    };
  }

  // the day's configuration: js/main.js and the replay build exactly this
  function config(su) {
    const ev = DF.EVENTS[su.event];
    const banter = DF.t("banter");
    return {
      seed: su.seed, event: su.event, daySeconds: ev.daySeconds, players: su.players,
      loadout: DF.applyPerks(su.loadout, {}), perks: {}, soldout: false, relax: false,
      chat: DF.Chat.build(su.event, su.seed, null, su.loadout.flags || {}), banterN: Array.isArray(banter) ? banter.length : 14,
    };
  }

  // the recorded day, played again. log: [step, dir|0, hold, cmds|0, mateCmds|0]
  // whenever the player's input changes or a command goes out
  function replay(su, log) {
    const s = DF.Sim.createDay(config(su));
    const limit = Math.ceil((DF.EVENTS[su.event].daySeconds + 20) / STEP);
    let i = 0, dir = null, hold = false, step = 0;
    while (!s.over && step < limit) {
      let cmds = [], mate = [];
      while (i < log.length && log[i][0] <= step) {
        const e = log[i++];
        if (e[0] < step) continue; // out of order: ignored
        dir = Array.isArray(e[1]) ? [Number(e[1][0]) || 0, Number(e[1][1]) || 0] : null;
        hold = !!e[2];
        // only what a player can do from the game: no command the UI can't send
        if (Array.isArray(e[3])) cmds = e[3].filter((c) => c && PLAYER_CMDS.includes(c.c)).slice(0, 8);
        if (Array.isArray(e[4])) mate = e[4].filter((c) => c && (c.c === "target" || c.c === "goto")).slice(0, 4);
      }
      const bot = s.orgs.find((o) => o.id === "p2");
      const bi = DF.Bot.think(s, bot, DF.BOT_PROFILES.colead, STEP);
      bi.cmds = bi.cmds.concat(mate.map((c) => Object.assign({}, c, { order: true })));
      DF.Sim.stepDay(s, STEP, { p1: { dir, hold, cmds }, p2: bi });
      s.events.length = 0;
      step++;
    }
    return { s, sum: DF.Sim.summary(s), steps: step };
  }

  // what the cup counts: the day's points
  const score = (sum) => Math.max(0, Math.round(sum.score || 0));

  DF.Weekly = { STEP, ROTATION, weekOf, valid, setup, config, replay, score, standardLoadout };
})();
