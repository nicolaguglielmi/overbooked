/* prep.js: Act 1, the Countdown. Rounds before the event; each round deals
 * situations taken from real organizer problems. The team spends energy on
 * them, and whatever nobody takes care of happens anyway. The outcome is the
 * loadout the event day starts with. Mechanics only: texts are in the
 * language packs (cards.<id>). Pure, no DOM. */
"use strict";

(function () {
  // Which role is at home in which workstream (costs 1 energy less).
  const AFFINITY = { Sede: "tech", Logistica: "tech", Speaker: "care", Sponsor: "lead", Community: "lead", Volontari: "host", Accoglienza: "host", Team: "lead" };
  const STREAM_COLOR = { Sede: "#5f6b7d", Logistica: "#EA4335", Speaker: "#34A853", Sponsor: "#4285F4", Community: "#a142f4", Volontari: "#F9AB00", Accoglienza: "#F9AB00", Team: "#1b2233" };
  DF.STREAM_COLOR = STREAM_COLOR;
  DF.AFFINITY = AFFINITY;

  /* Card fields (texts in cards.<id>: title, text, o[0], o[1], ignore, tipT, tipD)
   *   opts[].cost   energy pips
   *   opts[].fx     budget (€), rsvp (people), partner, community, energy (0-100)
   *   opts[].set    loadout flags / tools / volunteers it gives
   *   ignore        what happens if nobody takes care of it
   *   src           sources of the tip (DF.SOURCES) */
  const C = (id, round, stream, icon, opts, ignore, src, extra) => Object.assign({ id, round, stream, icon, opts, ignore, src }, extra || {});
  DF.PREP_CARDS = [
    // ------------------------------------------------- DevFest, round 1
    C("sede", 1, "Sede", "🏛️", [{ cost: 2, fx: { partner: 12 }, set: { venue: "uni" } }, { cost: 1, fx: { budget: -400 }, set: { venue: "congressi", networkCheck: true } }], { fx: { energy: -12, partner: -5 } }, ["gdgspain", "wifi"], { must: true }),
    C("sponsor", 1, "Sponsor", "🤝", [{ cost: 2, fx: { budget: 900, partner: 6 }, set: { sponsorPack: true, sponsorDeal: "pulito" } }, { cost: 1, fx: { budget: 1500, community: -18, rsvp: -20 }, set: { sponsorDeal: "dati" } }], { fx: {} }, ["gdgsponsor", "gdpr"], { must: true }),
    C("team", 1, "Team", "🧩", [{ cost: 2, fx: { energy: 6 }, set: { coLead: true } }, { cost: 1, fx: { partner: 6 }, set: { vols: 2 } }], { fx: { energy: -10 } }, ["zasadnyy", "hn"], { must: true }),
    // ------------------------------------------------- round 2
    C("promo", 2, "Community", "📣", [{ cost: 2, fx: { rsvp: 70, partner: 4 } }, { cost: 1, fx: { budget: -120, rsvp: 40 } }], { fx: { rsvp: 15 } }, ["quark", "zasadnyy"], { must: true }),
    C("volontari", 2, "Volontari", "🙋", [{ cost: 2, fx: {}, set: { vols: 2 } }, { cost: 1, fx: {}, set: { vols: 1 } }], { fx: {} }, ["zasadnyy"], { must: true }),
    C("cfp", 2, "Speaker", "🎤", [{ cost: 2, fx: { partner: 10, community: 8, rsvp: 15 } }, { cost: 1, fx: { rsvp: 5 } }], { fx: { rsvp: -15, community: -6 } }, ["meetup", "devfestitalia"]),
    C("coc", 2, "Community", "🛡️", [{ cost: 1, fx: { community: 4 }, set: { cocTeam: true } }, { cost: 0, fx: {} }], { fx: {} }, ["gdgcoc", "pycon"]),
    C("diversita", 2, "Speaker", "🌈", [{ cost: 2, fx: { community: 14, partner: 4, rsvp: 15 } }, { cost: 0, fx: { community: -12 } }], { fx: { community: -12 } }, ["devfestna"]),
    C("accesso", 2, "Sede", "♿", [{ cost: 1, fx: { partner: 3, community: 6 }, set: { signage: true } }, { cost: 0, fx: { community: -8 } }], { fx: { community: -8 } }, ["sigaccess"]),
    C("swag", 2, "Community", "👕", [{ cost: 1, fx: { budget: -150, community: 6 } }, { cost: 0, fx: { community: -3 } }], { fx: {} }, ["hamptonroads"]),
    C("sponsorvia", 2, "Sponsor", "💸", [{ cost: 2, fx: { budget: -300 } }, { cost: 1, fx: { budget: -800, partner: 8 }, set: { catering: true } }], { fx: { budget: -900 } }, ["hn", "techcrunch"], { imprevisto: true, cond: (st) => !!st.flags.sponsorDeal }),
    C("promotalk", 2, "Community", "📢", [{ cost: 1, fx: { community: 4, partner: -3 } }, { cost: 0, fx: { community: -10, budget: 200 } }], { fx: { community: -6 } }, ["gdglegal"], { imprevisto: true }),
    // ------------------------------------------------- round 3
    C("catering", 3, "Accoglienza", "🍕", [{ cost: 1, fx: { budget: -350 }, set: { catering: true } }, { cost: 0, fx: { budget: -150 } }], { fx: { budget: -150 } }, ["noshow", "davekiss"], { must: true }),
    C("kitav", 3, "Logistica", "📦", [{ cost: 1, fx: { budget: -60 }, set: { tools: ["adattatori", "batterie"] } }, { cost: 0, fx: { budget: -35 }, set: { tools: ["adattatori"] } }], { fx: {} }, ["dayof"], { must: true }),
    C("kitlab", 3, "Logistica", "🔌", [{ cost: 1, fx: { budget: -90 }, set: { tools: ["ciabatte", "hotspot"] } }, { cost: 1, fx: { partner: 4 }, set: { networkCheck: true } }], { fx: {} }, ["wifi"]),
    C("prova", 3, "Sede", "🧪", [{ cost: 2, fx: { energy: -4 }, set: { provaTecnica: true, networkCheck: true } }, { cost: 1, fx: {}, set: { labReady: true } }], { fx: {} }, ["quarksummit"]),
    C("checkin", 3, "Accoglienza", "🧾", [{ cost: 1, fx: { budget: -40 }, set: { checkinQR: true } }, { cost: 0, fx: {} }], { fx: {} }, ["bevycheckin", "pk"]),
    C("badgekit", 3, "Accoglienza", "🪪", [{ cost: 1, fx: { budget: -50 }, set: { tools: ["badge"] } }, { cost: 0, fx: {} }], { fx: {} }, ["dayof"]),
    C("speakercare", 3, "Speaker", "🧭", [{ cost: 1, fx: {}, set: { speakerCare: true } }, { cost: 0, fx: {} }], { fx: {} }, ["quarksummit"]),
    C("riserva", 3, "Speaker", "🦸", [{ cost: 2, fx: {}, set: { backupSpeaker: true } }, { cost: 1, fx: { community: 4 }, set: { lightningJolly: true } }], { fx: {} }, ["quark", "zasadnyy"]),
    C("overbooking", 3, "Community", "🎟️", [{ cost: 1, fx: {}, set: { waitlist: true } }, { cost: 0, fx: { rsvp: 40 } }], { fx: { rsvp: 40 } }, ["noshow", "deposit"]),
    C("antincendio", 3, "Sede", "🚨", [{ cost: 1, fx: { partner: 4 }, set: { fireCheck: true } }, { cost: 0, fx: {} }], { fx: {} }, ["dayof"]),
    C("stampa", 3, "Community", "📰", [{ cost: 1, fx: { community: 4 }, set: { pressReady: true } }, { cost: 0, fx: {} }], { fx: {} }, ["zasadnyy"]),
    // ------------------------------------------------- round 4
    C("reminder", 4, "Community", "📬", [{ cost: 1, fx: {}, set: { reminder: true } }, { cost: 0, fx: {}, set: { reminderSoft: true } }], { fx: {} }, ["reichardt", "hamptonroads"], { must: true }),
    C("runofshow", 4, "Team", "🗂️", [{ cost: 2, fx: { energy: 4 }, set: { runOfShow: true } }, { cost: 0, fx: {} }], { fx: {} }, ["zasadnyy"]),
    C("premi", 4, "Sponsor", "🎁", [{ cost: 1, fx: {}, set: { raffle: true } }, { cost: 0, fx: { community: 3 } }], { fx: {} }, ["hamptonroads"]),
    C("segnaletica", 4, "Logistica", "🪧", [{ cost: 1, fx: { budget: -30 }, set: { signage: true } }, { cost: 0, fx: {} }], { fx: {} }, ["dayof"]),
    C("bar", 4, "Accoglienza", "☕", [{ cost: 1, fx: { budget: -120 }, set: { coffeePlus: true } }, { cost: 0, fx: {} }], { fx: {} }, ["davekiss"]),
    C("calendario", 4, "Community", "🗓️", [{ cost: 1, fx: { partner: 10, rsvp: 10 } }, { cost: 0, fx: { rsvp: -25 } }], { fx: { rsvp: -25 } }, ["calendar2025", "devfestna"], { imprevisto: true }),
    C("stanchezza", 4, "Team", "🫠", [{ cost: 2, fx: { energy: 20 } }, { cost: 0, fx: { energy: -12 } }], { fx: { energy: -12 } }, ["davekiss", "strangeloop"], { imprevisto: true }),
    C("cani", 4, "Sede", "🐕", [{ cost: 1, fx: {}, set: { dogGate: true } }, { cost: 0, fx: {} }], { fx: {} }, ["dayof"], { imprevisto: true }),
    // ------------------------------------------------- the other events
    C("m_pizza", 1, "Accoglienza", "🍕", [{ cost: 1, fx: { budget: -180 }, set: { catering: true } }, { cost: 0, fx: { budget: -90 } }], { fx: { budget: -90 } }, ["davekiss"], { event: true }),
    C("m_porta", 1, "Sede", "🔑", [{ cost: 1, fx: { partner: 4 }, set: { venueKey: true } }, { cost: 0, fx: {} }], { fx: { energy: -6 } }, ["meetup"], { event: true }),
    C("m_promo", 1, "Community", "📣", [{ cost: 1, fx: { rsvp: 30 } }, { cost: 0, fx: { rsvp: 10 } }], { fx: {} }, ["quark"], { event: true }),
    C("m_speaker", 1, "Speaker", "⏳", [{ cost: 1, fx: {}, set: { timeKeeper: true } }, { cost: 0, fx: { community: 2 } }], { fx: {} }, ["quarksummit"], { event: true }),
    C("sj_quota", 1, "Logistica", "🎟️", [{ cost: 1, fx: { partner: 4 }, set: { tools: ["crediti"] } }, { cost: 0, fx: {} }], { fx: {} }, ["buildwithai"], { event: true }),
    C("sj_aule", 1, "Sede", "🧪", [{ cost: 1, fx: {}, set: { waitlist: true, labReady: true } }, { cost: 0, fx: { rsvp: 20 } }], { fx: { rsvp: 20 } }, ["noshow"], { event: true }),
    C("io_stream", 1, "Logistica", "📺", [{ cost: 1, fx: {}, set: { streamTest: true } }, { cost: 0, fx: {} }], { fx: {} }, ["gdgspain"], { event: true }),
    C("io_vip", 1, "Sponsor", "🎖️", [{ cost: 1, fx: { partner: 8 }, set: { vipReady: true } }, { cost: 0, fx: { partner: -4 } }], { fx: {} }, ["gdgsponsor"], { event: true }),
    // Women Techmakers
    C("wtm_kids", 1, "Accoglienza", "🧸", [{ cost: 1, fx: { budget: -150, community: 6 }, set: { kidsCorner: true } }, { cost: 0, fx: { community: -4 } }], { fx: { community: -6 } }, ["childcare", "wtmiwd"], { event: true }),
    C("wtm_photo", 1, "Community", "📸", [{ cost: 1, fx: { budget: -30, community: 4 }, set: { photoLanyards: true } }, { cost: 0, fx: {} }], { fx: { community: -3 } }, ["lanyards", "mozlanyards"], { event: true }),
    C("wtm_access", 1, "Sede", "♿", [{ cost: 2, fx: { partner: 4, community: 6 }, set: { accessRoute: true, signage: true } }, { cost: 1, fx: {}, set: { accessRoute: true } }], { fx: { community: -6 } }, ["sigaccess"], { event: true }),
    C("wtm_speakers", 1, "Speaker", "🎤", [{ cost: 2, fx: { community: 12, rsvp: 15 } }, { cost: 1, fx: { rsvp: 5 } }], { fx: { community: -8, rsvp: -10 } }, ["wtmiwd", "devfestna"], { event: true }),
    // the night hackathon
    C("hk_mentors", 1, "Team", "🧩", [{ cost: 2, fx: { partner: 6 }, set: { mentors: true, vols: 2 } }, { cost: 1, fx: {}, set: { mentors: true, vols: 1 } }], { fx: { community: -6 } }, ["mlhguide", "hackguide"], { event: true }),
    C("hk_food", 1, "Accoglienza", "🍕", [{ cost: 1, fx: { budget: -350 }, set: { catering: true, coffeePlus: true } }, { cost: 0, fx: { budget: -150 } }], { fx: { budget: -150 } }, ["mlhguide"], { event: true }),
    C("hk_rest", 1, "Sede", "🛌", [{ cost: 1, fx: { budget: -80 }, set: { restArea: true } }, { cost: 0, fx: { energy: -6 } }], { fx: { energy: -6 } }, ["mlhguide", "strangeloop"], { event: true }),
    C("hk_rules", 1, "Community", "📜", [{ cost: 1, fx: { community: 6 }, set: { judgingRules: true } }, { cost: 0, fx: {} }], { fx: { community: -5 } }, ["hackguide"], { event: true }),
    C("hk_night", 1, "Sede", "🌃", [{ cost: 1, fx: { partner: 4 }, set: { nightGuard: true } }, { cost: 0, fx: {} }], { fx: {} }, ["mlhguide"], { event: true }),
  ];

  // Sources for the tips. Real pages found in the research for this game.
  DF.SOURCES = {
    gdgspain: { t: "GDG Spain — DevFest 2021", u: "https://medium.com/gdgeurope/how-we-organized-devfest-2021-in-spain-activities-streaming-techniques-and-the-unique-joy-of-a65c47aaeee0" },
    wifi: { t: "Fireline — bandwidth per attendee", u: "https://www.firelinebroadband.com/2026/08/10/bandwidth-attendees-2" },
    meetup: { t: "How to run a meetup", u: "https://ayunascode.medium.com/how-to-run-a-meetup-badf619e5b82" },
    devfestitalia: { t: "DevFest Italia 2020", u: "https://gdg.community.dev/events/details/google-gdg-torino-presents-devfest-italia-2020/" },
    gdgsponsor: { t: "Google Developer Groups — funding & sponsors", u: "https://support.google.com/developergroups/answer/2947318" },
    gdglegal: { t: "Google Developer Groups — legal entities", u: "https://support.google.com/developergroups/answer/3547244" },
    gdpr: { t: "EU Regulation 2016/679 (GDPR)", u: "https://eur-lex.europa.eu/eli/reg/2016/679/oj" },
    zasadnyy: { t: "The definitive guide to large scale events (GDG)", u: "https://speakerdeck.com/zasadnyy/the-definitive-guide-to-large-scale-events-or-devfest-season-is-coming-dot-dot-dot" },
    hn: { t: "Hacker News — meetup organizers", u: "https://news.ycombinator.com/item?id=40557969" },
    quark: { t: "Lessons learned after hosting a GDG DevFest", u: "https://medium.com/quark-works/lessons-learned-after-hosting-a-gdg-devfest-d3ce8e682e71" },
    quarksummit: { t: "GDG Summit tips for hosting a DevFest", u: "https://medium.com/quark-works/gdg-summit-tips-and-tricks-learned-for-hosting-a-devfest-7ba56d43d688" },
    gdgcoc: { t: "Google Developer Groups — Code of Conduct", u: "https://support.google.com/developergroups/answer/3340512" },
    pycon: { t: "PyCon 2019 — Code of Conduct transparency", u: "https://pycon.blogspot.com/2019/06/pycon-2019-code-of-conduct-transparency.html" },
    devfestna: { t: "DevFest 2018 — GDG North America", u: "https://github.com/GDGNorthAmerica/info-and-resources/wiki/DevFest-2018" },
    sigaccess: { t: "SIGACCESS accessible conference guide", u: "https://www.sigaccess.org/welcome-to-sigaccess/resources/accessible-conference-guide/" },
    techcrunch: { t: "TechCrunch — conference cancelled after sponsor exit", u: "https://techcrunch.com/?p=23395" },
    noshow: { t: "Venuera — event no-show rates", u: "https://venuera.com/event-no-show-rates-by-event-type/" },
    davekiss: { t: "12 lessons from 5 years of running a tech meetup", u: "https://davekiss.com/blog/12-lessons-from-5-years-of-running-a-tech-meetup" },
    dayof: { t: "A first DevFest, from the inside", u: "https://medium.com/@manik23265/my-first-devfest-as-well-as-the-first-event-ive-attended-outside-college-the-beginning-of-a-new-2119a59c25b4" },
    bevycheckin: { t: "Google Developer Groups — check-ins", u: "https://support.google.com/developergroups/answer/7375709" },
    pk: { t: "Organizing a Google Developers Festival", u: "https://medium.com/@syed.sohaib/whats-it-like-to-organize-the-google-developers-festival-55b07ddb920d" },
    deposit: { t: "Skift — the $100 deposit experiment", u: "https://meetings.skift.com/2026/09/02/the-100-experiment-that-slashed-no-show-rates-to-just-10/" },
    reichardt: { t: "Managing no-shows at meetups", u: "https://www.linkedin.com/pulse/managing-no-shows-your-meetups-networking-events-sarah-reichardt" },
    hamptonroads: { t: "Hampton Roads DevFest 2024 retrospective", u: "https://consultwithgriff.com/hampton-roads-devfest-2024-retrospective" },
    calendar2025: { t: "GDG Bari — DevFest Bari 2025", u: "https://gdg.community.dev/events/details/google-gdg-bari-presents-devfest-bari-2025/" },
    strangeloop: { t: "The end of Strange Loop", u: "https://byelanie.substack.com/p/strange-loop" },
    buildwithai: { t: "Build with AI — Google for Developers", u: "https://developers.google.com/community/build-with-ai" },
    wtmiwd: { t: "Women Techmakers IWD at GDG Bangalore", u: "https://gdg.community.dev/events/details/google-gdg-bangalore-presents-women-techmakers-international-womens-day/" },
    childcare: { t: "Conference childcare: thoughts for organizers", u: "https://medium.com/leaky-abstractions/conference-childcare-part-1-helpful-thoughts-for-conference-organizers-203d2b34df5b" },
    lanyards: { t: "Coloured lanyards to opt out of photos", u: "https://alexwlchan.net/ideas-for-inclusive-events/ideas/photography-opt-out/" },
    mozlanyards: { t: "Mozilla — red lanyards mean no photos", u: "https://blog.mozilla.org/en/firefox/red-lanyards-mean-no-photos-please/" },
    mlhguide: { t: "MLH — member event guidelines", u: "https://github.com/MLH/mlh-policies/blob/main/member-event-guidelines.md" },
    hackguide: { t: "Hackathon organizer's guide", u: "http://ruthgrace.github.io/hackathon-organizer-guide/" },
  };

  // ------------------------------------------------------------- state
  function createPrep(cfg) {
    const ev = DF.EVENTS[cfg.event || "devfest"];
    const rng = DF.makeRng((cfg.seed || 7) ^ 0x5bd1e995);
    const solo = cfg.players.length === 1;
    const members = cfg.players.map((p) => ({ id: p.id, role: p.role, name: p.name || "", pips: solo ? 4 : 3, used: 0 }));
    return {
      rng, round: 0, rounds: ev.prepRounds, event: cfg.event || "devfest", members,
      meters: { budget: ev.budget || 300, rsvp: ev.rsvp, partner: 50, community: 50, energy: 80 },
      flags: {}, tools: {}, vols: 0, overtime: 0,
      hand: [], extra: [], picks: {}, history: [], seen: new Set(), solo,
      deck: ev.deck ? eventDeck(ev, rng) : null,
    };
  }

  // smaller events: a shuffled deck with each must-have card on top of its round
  function eventDeck(ev, rng) {
    const must = ev.must || [];
    const deck = rng.shuffle(ev.deck.filter((id) => !must.includes(id)));
    must.forEach((id, i) => deck.splice(Math.min(i * 3, deck.length), 0, id));
    return deck;
  }

  const card = (id) => DF.PREP_CARDS.find((c) => c.id === id) || null;

  function deal(st) {
    const r = st.round + 1;
    let hand;
    if (st.deck) {
      hand = st.deck.splice(0, 3).map(card).filter(Boolean);
    } else {
      const pool = DF.PREP_CARDS.filter((c) => c.round === r && !c.event && !st.seen.has(c.id) && (!c.cond || c.cond(st)));
      const must = pool.filter((c) => c.must);
      const imprevisti = pool.filter((c) => c.imprevisto);
      const mine = pool.filter((c) => c.mine);
      const rest = st.rng.shuffle(pool.filter((c) => !c.must && !c.imprevisto && !c.mine));
      hand = must.slice(0, 3);
      if (hand.length >= 3 && mine.length) hand[2] = mine[0];
      else if (mine.length) hand.push(mine[0]);
      if (hand.length < 3 && imprevisti.length && r >= 2 && st.rng.chance(r === 2 ? 0.75 : 0.7)) hand.push(st.rng.pick(imprevisti));
      for (const c of rest) { if (hand.length >= 3) break; hand.push(c); }
      hand = hand.slice(0, 3);
    }
    hand.forEach((c) => st.seen.add(c.id));
    st.hand = hand.map((c) => c.id);
    st.extra = [];
    st.picks = {};
    st.members.forEach((m) => { m.used = 0; });
    return hand;
  }

  // An extra card for this round (written by the AI for the chapter).
  function addExtra(st, c) {
    if (!c || st.extra.length) return false;
    const clean = sanitizeCard(c, "ai-" + st.round);
    clean.ai = true;
    st.extra.push(clean);
    st.hand.push(clean.id);
    return true;
  }

  function cardOf(st, id) { return card(id) || (st.extra || []).find((c) => c.id === id) || null; }

  function costFor(st, c, opt, member) {
    let cost = opt.cost;
    if (cost > 0 && member && AFFINITY[c.stream] === member.role) cost -= 1;
    return cost;
  }

  // Assign (or un-assign) an option of a card to a member.
  function toggle(st, cardId, optIdx, memberId) {
    const c = cardOf(st, cardId);
    if (!c) return { ok: false, why: "?" };
    const m = st.members.find((q) => q.id === memberId) || st.members[0];
    const cur = st.picks[cardId];
    if (cur) {
      const prev = st.members.find((q) => q.id === cur.member);
      if (prev) prev.used -= cur.cost;
      delete st.picks[cardId];
      if (cur.opt === optIdx && cur.member === m.id) return { ok: true, removed: true };
    }
    const cost = costFor(st, c, c.opts[optIdx], m);
    if (m.used + cost > m.pips + 2) return { ok: false, why: "tired", who: m.name };
    m.used += cost;
    st.picks[cardId] = { opt: optIdx, member: m.id, cost };
    return { ok: true };
  }

  function addFx(st, fx) {
    const M = st.meters;
    for (const k in fx) if (k in M) M[k] = (M[k] || 0) + fx[k];
    M.partner = DF.clamp(M.partner, 0, 100);
    M.community = DF.clamp(M.community, 0, 100);
    M.energy = DF.clamp(M.energy, 0, 100);
    M.rsvp = Math.max(20, M.rsvp);
  }

  function applySet(st, set) {
    if (!set) return;
    for (const k in set) {
      if (k === "tools") set.tools.forEach((t) => { if (DF.TOOLS[t]) st.tools[t] = true; });
      else if (k === "vols") st.vols += set.vols;
      else st.flags[k] = set[k];
    }
  }

  // Close the round: picked options happen, ignored cards happen anyway.
  function resolve(st) {
    const out = [];
    let over = 0;
    st.members.forEach((m) => { over += Math.max(0, m.used - m.pips); });
    for (const id of st.hand) {
      const c = cardOf(st, id), p = st.picks[id];
      if (!c) continue;
      if (p) {
        const o = c.opts[p.opt];
        addFx(st, o.fx || {}); applySet(st, o.set);
        out.push({ id: c.id, ai: !!c.ai, card: c.ai ? c : undefined, opt: p.opt, member: p.member, fx: o.fx || {} });
      } else {
        addFx(st, c.ignore.fx || {}); applySet(st, c.ignore.set);
        out.push({ id: c.id, ai: !!c.ai, card: c.ai ? c : undefined, ignored: true, fx: c.ignore.fx || {} });
      }
    }
    if (over > 0) {
      addFx(st, { energy: -7 * over });
      st.overtime += over;
      out.push({ overtime: over });
    }
    if (st.flags.coLead && !st.members.some((m) => m.ai)) {
      st.members.push({ id: "co", role: "tech", name: "", pips: 2, used: 0, ai: true });
    }
    st.history.push({ round: st.round, results: out });
    st.round++;
    return out;
  }

  // From the countdown to the event day.
  function loadout(st) {
    const M = st.meters, F = st.flags, ev = DF.EVENTS[st.event];
    const seats = ev.rooms.reduce((a, r) => a + DF.Venue.ROOMS[r].cap, 0);
    const showRate = 0.6 + (F.reminder ? 0.1 : F.reminderSoft ? 0.03 : 0) + (F.waitlist ? 0.06 : 0);
    let rsvp = M.rsvp;
    if (F.waitlist) rsvp = Math.min(rsvp, Math.round(seats * 1.5));
    const attendees = DF.clamp(Math.round(rsvp * showRate), 20, 230);
    const budget = M.budget;
    const vols = Math.min(st.vols + (M.partner >= 70 ? 1 : 0), 5);
    let satStart = 56 + (M.community - 50) / 4 + (M.partner - 50) / 12;
    if (budget < 0) satStart -= 4;
    if (F.sponsorDeal === "dati") satStart -= 3;
    return {
      event: st.event, attendees, rsvp, showRate, volunteers: vols,
      energy: DF.clamp(M.energy, 25, 100),
      satStart: DF.clamp(Math.round(satStart), 40, 72),
      coffeeCap: DF.clamp(Math.round(80 + Math.max(0, budget) / 25 + (F.coffeePlus ? 30 : 0)), 70, 170),
      tools: Object.assign({}, st.tools),
      flags: Object.assign({}, F),
      coLead: !!F.coLead,
      budget,
    };
  }

  // Cards from outside (the AI, another chapter) are untrusted: known fields
  // only, bounded effects, plain text.
  function sanitizeCard(c, id) {
    const str = (s, n) => String(s == null ? "" : s).replace(/[<>]/g, "").slice(0, n);
    const num = (v, a, b) => DF.clamp(Math.round(Number(v) || 0), a, b);
    const fx = (o) => {
      const out = {};
      for (const k of ["budget", "rsvp", "partner", "community", "energy"]) {
        if (o && o[k]) out[k] = num(o[k], k === "budget" ? -1500 : -60, k === "budget" ? 1500 : 70);
      }
      return out;
    };
    const streams = Object.keys(AFFINITY);
    const opts = (Array.isArray(c.opts) ? c.opts : []).slice(0, 2).map((o) => ({ label: str(o.label, 60), cost: num(o.cost, 0, 2), fx: fx(o.fx), set: {} }));
    while (opts.length < 2) opts.push({ label: "—", cost: 0, fx: {}, set: {} });
    return {
      id: id || "x-" + Date.now().toString(36), round: num(c.round, 1, 4) || 3,
      stream: streams.includes(c.stream) ? c.stream : "Community", icon: str(c.icon, 4) || "🃏",
      title: str(c.title, 70), text: str(c.text, 200), opts,
      ignore: { text: str(c.ignore && c.ignore.text, 120), fx: fx(c.ignore && c.ignore.fx) },
      tip: c.tip ? { t: str(c.tip.t, 60), d: str(c.tip.d, 200) } : null,
      src: [],
    };
  }

  // Text of a card in the current language (own and AI cards carry their text).
  function textOf(c) {
    if (c.title !== undefined) {
      return { title: c.title, text: c.text, o: c.opts.map((o) => o.label), ignore: c.ignore.text, tipT: c.tip ? c.tip.t : "", tipD: c.tip ? c.tip.d : "" };
    }
    const t = DF.t("cards." + c.id);
    return typeof t === "object" ? t : { title: c.id, text: "", o: ["", ""], ignore: "", tipT: "", tipD: "" };
  }

  DF.Prep = { createPrep, deal, toggle, resolve, loadout, card, cardOf, costFor, addExtra, sanitizeCard, textOf, AFFINITY };
})();
