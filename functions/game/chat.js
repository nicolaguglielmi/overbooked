/* chat.js: builds the staff-chat script of a day — who writes, when, and
 * which messages need an answer. Texts come from Gemini when available
 * (ai.acts / ai.noise) or from the language pack; mechanics come from
 * DF.CHAT_ACTS. Deterministic for a given seed. */
"use strict";

(function () {
  function pick(rng, arr) { return arr && arr.length ? arr[Math.floor(rng() * arr.length)] : null; }

  // ai: { acts: {tpl: [{from,text,r:[a,b]}]}, noise: [{from,text}] } or null
  function build(evId, seed, ai, flags) {
    const ev = DF.EVENTS[evId];
    const rng = DF.makeRng((seed || 1) ^ 0x27d4eb2d);
    const fl = flags || {};
    const out = [];
    let n = 0;
    const variants = (tpl) => {
      const fromAi = ai && ai.acts && Array.isArray(ai.acts[tpl]) ? ai.acts[tpl].filter(ok) : [];
      const pack = DF.t("chat.acts." + tpl);
      return fromAi.length ? fromAi : Array.isArray(pack) ? pack.filter(ok) : [];
    };
    const ok = (m) => m && typeof m.text === "string" && m.text.length > 2 && Array.isArray(m.r) && m.r.length >= 2;
    const act = (tpl, at, extra) => {
      const v = pick(rng, variants(tpl));
      if (!v) return;
      out.push(Object.assign({ id: "c" + (++n), at, tpl, from: clip(v.from, 32), text: clip(v.text, 140), replies: [clip(v.r[0], 40), clip(v.r[1], 40)] }, extra || {}));
    };
    const speakers = ev.sessions.map((se, idx) => ({ se, idx })).filter((x) => x.se.speaker);

    // speakers on their way: parking or adapter, before they arrive
    for (const { se, idx } of speakers) {
      if (rng() < 0.42) {
        const tpl = rng() < 0.55 ? "parking" : "adapter";
        const lead = se.kind === "keynote" ? 60 : 45;
        act(tpl, se.start - lead - rng() * 6, { sp: "s" + idx });
      }
    }
    // the check-in rush
    if (ev.attendees > 40) act("queueHelp", ev.start + 12 + rng() * 10);
    // breaks
    for (const b of ev.breaks) {
      if (b.kind === "coffee" && rng() < 0.7) act("coffeeLow", b.start + 4);
      if (b.kind === "lunch" && !fl.catering && rng() < 0.85) act("pizzaTime", b.start - 70 - rng() * 20);
    }
    const span = ev.end - ev.start;
    const anyTime = () => ev.start + 20 + rng() * (span - 50);
    if (ev.spawn.sponsor > 0 && rng() < 0.7) act("logo", anyTime());
    if (ev.spawn.vip > 0 && rng() < 0.6) act("vipCall", anyTime());
    act("wifiPass", anyTime());
    if (rng() < 0.6) act("lostThing", anyTime());
    if (ev.spawn.kid > 0) act("kidsWhere", anyTime());
    if (ev.spawn.mentor > 0) { act("teamStuck", anyTime()); act("teamStuck", anyTime()); }
    act("mom", ev.start + span * (0.35 + rng() * 0.3));

    // background noise: someone writes every 9-16 real seconds (calmer in the first events)
    const noise = (ai && Array.isArray(ai.noise) && ai.noise.filter((m) => m && m.text).length >= 6) ? ai.noise : DF.t("chat.noise");
    const k = span / (ev.daySeconds || 300);
    if (Array.isArray(noise) && noise.length) {
      const order = rng.shuffle(noise.slice());
      let t = ev.start + 5 + rng() * 10, i = 0;
      while (t < ev.end - 10) {
        const m = order[i++ % order.length];
        out.push({ id: "c" + (++n), at: t, tpl: null, from: clip(m.from, 32), text: clip(m.text, 140) });
        t += (9 + rng() * 7) * k * (ev.pace || 1);
      }
    }
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  function clip(s, n) { return String(s == null ? "" : s).replace(/[<>]/g, "").slice(0, n); }

  // A few reactive messages written by Gemini during the day.
  function fromAi(msgs, clock) {
    return (Array.isArray(msgs) ? msgs : []).slice(0, 4).filter((m) => m && m.text).map((m, i) => ({ id: "r" + Math.round(clock) + "_" + i, at: clock + i * 2, tpl: null, from: clip(m.from, 32), text: clip(m.text, 140), ai: true }));
  }

  DF.Chat = { build, fromAi };
})();
