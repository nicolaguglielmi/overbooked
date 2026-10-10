/* content.js: game mechanics as data — roles, tools, problems, volunteer
 * posts, the six events of the season, goals, the chapter's kit, the
 * staff-chat templates.
 * Language-neutral: every text lives in js/lang/<id>.js. */
"use strict";

// Organizer roles. "fast" lists the problem types the role fixes at 2x.
DF.ROLES = {
  lead: { color: "#4285F4", tools: 1, sprite: "org_lead", fast: ["coc", "sponsor", "overflow", "speaker", "cancel", "perso", "vip", "press", "flame", "foto", "noise"] },
  tech: { color: "#EA4335", tools: 2, sprite: "org_tech", fast: ["hdmi", "mic", "wifi", "prese", "stampante", "blackout", "stream", "quota", "mentor"] },
  host: { color: "#F9AB00", tools: 1, sprite: "org_host", fast: ["queue", "coffee", "pizza", "perso", "stampante", "badge", "dog", "kid", "access"] },
  care: { color: "#34A853", tools: 1, sprite: "org_care", fast: ["speaker", "cancel", "hdmi", "mic", "overrun", "quota", "access", "mentor"] },
};

// Who plays each role: every role has a woman and a man (same clothes, same
// props); each game puts two women and two men in the four roles, shuffled
// from a seed, so no role belongs to one gender.
DF.ROLE_LOOKS = {
  lead: { m: "org_lead", f: "org_lead_b" }, tech: { m: "org_tech", f: "org_tech_b" },
  host: { f: "org_host", m: "org_host_b" }, care: { f: "org_care", m: "org_care_b" },
};
DF.castFor = function (seed) {
  const pairs = [["lead", "tech"], ["lead", "host"], ["lead", "care"], ["tech", "host"], ["tech", "care"], ["host", "care"]];
  let h = (Number(seed) >>> 0) || 1;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
  const women = pairs[h % pairs.length], cast = {};
  for (const r of Object.keys(DF.ROLE_LOOKS)) cast[r] = DF.ROLE_LOOKS[r][women.includes(r) ? "f" : "m"];
  return cast;
};

// Things in the chapter's box.
DF.TOOLS = {
  adattatori: { icon: "🔌" },
  batterie: { icon: "🔋" },
  ciabatte: { icon: "⚡" },
  hotspot: { icon: "📶" },
  badge: { icon: "🪪" },
  crediti: { icon: "🎟️" },
};

/* Problem types.
 *  fix        seconds of HOLD with the right tool (or no tool needed)
 *  fixNoTool  seconds when the tool is missing (improvised fix)
 *  dur        seconds before it escalates
 *  drain      satisfaction lost per second while active
 *  pen        satisfaction lost when it escalates
 *  warn       premonition seconds (0 = none): be there and it never happens
 *  persist    after escalating it stays on the map until fixed
 *  crew       people needed at the same time
 *  vol        a volunteer at the station can fix it (rate multiplier)
 *  bonus      an opportunity: fixing it adds satisfaction, missing it costs little */
DF.PROBLEMS = {
  queue:     { icon: "🧾", dur: 20, drain: 0, pen: 6, pts: 200, warn: 0, crew: 1, kind: "queue" },
  stampante: { icon: "🖨️", fix: 2.2, dur: 14, drain: 0.04, pen: 4, pts: 150, warn: 0, crew: 1, persist: true },
  speaker:   { icon: "🧭", dur: 20, drain: 0, pen: 6, pts: 250, warn: 0, crew: 1, kind: "escort" },
  hdmi:      { icon: "📽️", tool: "adattatori", fix: 1.0, fixNoTool: 4.5, dur: 16, drain: 0.02, pen: 5, pts: 150, warn: 0, crew: 1, persist: true, vol: 0.5 },
  mic:       { icon: "🎤", tool: "batterie", fix: 0.8, fixNoTool: 4.0, dur: 14, drain: 0.05, pen: 4, pts: 120, warn: 2.5, crew: 1, persist: true, vol: 0.5 },
  wifi:      { icon: "📡", tool: "hotspot", fix: 2.4, fixHotspot: 0.8, dur: 18, drain: 0.07, pen: 7, pts: 200, warn: 3, crew: 1, persist: true },
  prese:     { icon: "🔌", tool: "ciabatte", fix: 1.0, fixNoTool: 5.0, dur: 16, drain: 0.04, pen: 5, pts: 150, warn: 0, crew: 1, persist: true },
  coffee:    { icon: "☕", fix: 2.5, dur: 14, drain: 0.05, pen: 5, pts: 120, warn: 4, crew: 1, persist: true, vol: 0.6 },
  pizza:     { icon: "🍕", fix: 1.5, dur: 16, drain: 0.06, pen: 8, pts: 200, warn: 0, crew: 1, vol: 0.7 },
  overflow:  { icon: "🚪", fix: 2.0, dur: 15, drain: 0.03, pen: 5, pts: 180, warn: 0, crew: 1, vol: 0.5 },
  sponsor:   { icon: "🤝", fix: 2.2, dur: 18, drain: 0.01, pen: 3, pts: 150, warn: 0, crew: 1, vol: 0.4 },
  perso:     { icon: "❓", fix: 0.6, dur: 10, drain: 0.01, pen: 0.5, pts: 60, warn: 0, crew: 1, vol: 1.0 },
  coc:       { icon: "🛡️", fix: 3.0, fixTrained: 1.6, dur: 18, drain: 0.08, pen: 12, pts: 300, warn: 0, crew: 1 },
  cancel:    { icon: "📵", fix: 5.0, dur: 14, drain: 0.03, pen: 8, pts: 300, warn: 0, crew: 1 },
  tavoli:    { icon: "🪑", fix: 3.0, dur: 18, drain: 0.02, pen: 5, pts: 250, warn: 0, crew: 2, vol: 1.0 },
  // the chaos expansion
  overrun:   { icon: "⏰", fix: 1.4, dur: 14, drain: 0.03, pen: 3, pts: 140, warn: 0, crew: 1, vol: 0.6 },
  vip:       { icon: "🎖️", fix: 2.0, dur: 16, drain: 0.02, pen: 4, pts: 220, warn: 0, crew: 1 },
  dog:       { icon: "🐕", dur: 22, drain: 0.03, pen: 3, pts: 200, warn: 0, crew: 1, kind: "escort" },
  press:     { icon: "🎙️", fix: 2.0, dur: 16, drain: 0, pen: 1, pts: 250, warn: 0, crew: 1, bonus: 2.5 },
  flame:     { icon: "🔥", fix: 1.5, dur: 14, drain: 0.03, pen: 2, pts: 120, warn: 0, crew: 1, vol: 0.5 },
  blackout:  { icon: "💡", fix: 2.2, dur: 16, drain: 0.06, pen: 6, pts: 220, warn: 0, crew: 1, persist: true },
  quota:     { icon: "🚫", tool: "crediti", fix: 1.0, fixNoTool: 4.5, dur: 16, drain: 0.05, pen: 5, pts: 200, warn: 0, crew: 1, persist: true },
  stream:    { icon: "📺", fix: 2.0, dur: 15, drain: 0.04, pen: 4, pts: 160, warn: 2.5, crew: 1, persist: true },
  badge:     { icon: "🪪", tool: "badge", fix: 0.8, fixNoTool: 3.5, dur: 15, drain: 0.03, pen: 3, pts: 120, warn: 0, crew: 1, persist: true, vol: 0.5 },
  // the new events: Women Techmakers and the night hackathon
  kid:       { icon: "🧸", dur: 22, drain: 0.04, pen: 5, pts: 200, warn: 0, crew: 1, kind: "escort" },
  access:    { icon: "♿", dur: 24, drain: 0.02, pen: 5, pts: 220, warn: 0, crew: 1, kind: "escort" },
  foto:      { icon: "📸", fix: 1.4, dur: 14, drain: 0.03, pen: 4, pts: 160, warn: 2.5, crew: 1, vol: 0.5 },
  mentor:    { icon: "🧩", fix: 2.0, dur: 18, drain: 0.02, pen: 3, pts: 160, warn: 0, crew: 1 },
  noise:     { icon: "📢", fix: 1.6, dur: 15, drain: 0.02, pen: 4, pts: 180, warn: 0, crew: 1, vol: 0.4 },
};

// People who follow you once you reach them: where they go, where they wander.
DF.CRITTERS = {
  dog:    { sprite: "dog", h: 22, from: "entrance", dest: "entrance", roam: ["H", "E", "H", "K"], speed: 92 },
  kid:    { sprite: "kid", h: 20, from: "kids", dest: "kids", roam: ["E", "H", "H", "K"], speed: 70 },
  access: { sprite: "att_6", h: 28, from: "entrance", dest: "doorA", roam: null, speed: 60 },
};

// Where volunteers can be posted (some events add their own spots).
DF.POSTS = ["checkin", "coffee", "info", "stageA", "stageB", "lab", "entrance", "sponsor1"];
// where each event can be held (the first is the default): the coworking suits the small ones
DF.VENUES_FOR = { meetup: ["uni", "cowork"], studyjam: ["uni", "cowork"] };
DF.venueFor = (evId, want) => { const list = DF.VENUES_FOR[evId] || ["uni"]; return list.includes(want) ? want : list[0]; };

DF.postsFor = (evId) => DF.POSTS.concat(evId === "wtm" ? ["kids"] : evId === "hack" ? ["tableA"] : []);

/* The season: six events in the same venue, from a weekday meetup to the
 * DevFest. rooms = rooms in use; sessions/breaks in minutes from midnight;
 * spawn = what can go wrong (rates are multipliers, 0 = never).
 * Talk titles are in the language packs (talks.<key>). */
DF.EVENTS = {
  meetup: {
    order: 1, icon: "🍕", rooms: ["B"], start: 18 * 60 + 30, end: 21 * 60 + 30, daySeconds: 180, gainK: 4.2, pace: 1.35,
    attendees: 45, rsvp: 70, prepRounds: 1,
    breaks: [{ kind: "lunch", start: 20 * 60 + 40, end: 21 * 60 + 25, key: "pizza" }],
    sessions: [
      { room: "B", start: 19 * 60, end: 19 * 60 + 40, kind: "talk", talk: "meetupAI", speaker: "Sara P." },
      { room: "B", start: 19 * 60 + 50, end: 20 * 60 + 35, kind: "talk", talk: "meetupFlutter", speaker: "Marco D.", popular: true },
    ],
    spawn: { wifi: 0.6, perso: 1, coc: 0.3, murphy: 0, printer: 0.6, prese: 0, tavoli: false, mic: 1.3, hdmi: 1.5, sponsor: 0, overrun: 1.2, flame: 1, vip: 0, dog: 0, press: 0, blackout: 0, firedrill: 0, stream: 0, quota: 0, cancel: 0.3, badge: 0.8 },
    deck: ["m_pizza", "m_porta", "m_promo", "kitav", "m_speaker"],
    goals: [{ id: "rating", min: 3.5 }, { id: "onTime" }, { id: "pizza" }],
  },
  studyjam: {
    order: 2, icon: "🧪", rooms: ["B", "L"], start: 9 * 60 + 30, end: 13 * 60 + 30, daySeconds: 200, gainK: 1.9, pace: 1.15,
    attendees: 60, rsvp: 95, prepRounds: 2,
    breaks: [{ kind: "coffee", start: 11 * 60 + 20, end: 11 * 60 + 40, key: "coffee" }],
    sessions: [
      { room: "B", start: 9 * 60 + 50, end: 10 * 60 + 20, kind: "keynote", talk: "sjIntro", speaker: "Giulia R." },
      { room: "L", start: 10 * 60 + 30, end: 11 * 60 + 20, kind: "workshop", talk: "sjLab1", speaker: "Luca T." },
      { room: "B", start: 10 * 60 + 30, end: 11 * 60 + 10, kind: "talk", talk: "sjPrompt", speaker: "Ilaria N." },
      { room: "L", start: 11 * 60 + 40, end: 12 * 60 + 40, kind: "workshop", talk: "sjLab2", speaker: "Chiara B." },
      { room: "B", start: 11 * 60 + 40, end: 12 * 60 + 20, kind: "talk", talk: "sjGemma", speaker: "Davide F.", popular: true },
      { room: "B", start: 12 * 60 + 45, end: 13 * 60 + 20, kind: "lightning", talk: "lightning", speaker: null },
    ],
    spawn: { wifi: 1.6, perso: 0.6, coc: 0.4, murphy: 0.5, printer: 0.5, prese: 1, tavoli: true, mic: 0.8, hdmi: 1, sponsor: 0.3, overrun: 0.6, flame: 0.4, vip: 0, dog: 0, press: 0, blackout: 0.3, firedrill: 0, stream: 0, quota: 1, cancel: 0.3, badge: 0.4 },
    deck: ["kitlab", "sj_quota", "volontari", "kitav", "checkin", "sj_aule", "prova"],
    goals: [{ id: "rating", min: 3.7 }, { id: "lab" }, { id: "chat", n: 3 }],
  },
  wtm: {
    order: 3, icon: "💜", rooms: ["A", "B"], start: 14 * 60, end: 19 * 60, daySeconds: 210, gainK: 1.6, pace: 1.1,
    attendees: 80, rsvp: 120, prepRounds: 2, budget: 400,
    breaks: [{ kind: "coffee", start: 16 * 60 + 5, end: 16 * 60 + 30, key: "coffee" }],
    sessions: [
      { room: "A", start: 14 * 60 + 30, end: 15 * 60 + 10, kind: "keynote", talk: "wtmKeynote", speaker: "Giulia R." },
      { room: "A", start: 15 * 60 + 20, end: 16 * 60, kind: "talk", talk: "wtmCareer", speaker: "Anna C." },
      { room: "B", start: 15 * 60 + 20, end: 16 * 60, kind: "talk", talk: "wtmAI", speaker: "Ilaria N.", popular: true },
      { room: "A", start: 16 * 60 + 35, end: 17 * 60 + 25, kind: "talk", talk: "wtmPanel", speaker: "Federica L." },
      { room: "B", start: 16 * 60 + 35, end: 17 * 60 + 25, kind: "talk", talk: "wtmMentoring", speaker: "Chiara B." },
      { room: "A", start: 17 * 60 + 35, end: 18 * 60 + 15, kind: "talk", talk: "wtmLeadership", speaker: "Elena M.", popular: true },
      { room: "A", start: 18 * 60 + 25, end: 18 * 60 + 55, kind: "raffle", talk: "wtmPhoto", speaker: null },
    ],
    spawn: { wifi: 0.7, perso: 0.8, coc: 1.2, murphy: 0.6, printer: 0.5, prese: 0, tavoli: false, mic: 1, hdmi: 1, sponsor: 0.5, overrun: 0.8, flame: 0.3, vip: 0, dog: 0, press: 0.6, blackout: 0, firedrill: 0, stream: 0, quota: 0, cancel: 0.4, badge: 0.5, kid: 2.4, access: 1, foto: 1.3 },
    deck: ["wtm_kids", "wtm_photo", "wtm_access", "coc", "volontari", "wtm_speakers", "checkin"],
    must: ["wtm_kids", "coc"],
    goals: [{ id: "rating", min: 4.0 }, { id: "care" }, { id: "coc" }],
  },
  ioext: {
    order: 4, icon: "📺", rooms: ["A", "B"], start: 16 * 60 + 30, end: 21 * 60, daySeconds: 210, gainK: 1.7,
    attendees: 100, rsvp: 150, prepRounds: 2, budget: 400,
    breaks: [{ kind: "lunch", start: 19 * 60 + 15, end: 20 * 60, key: "dinner" }],
    sessions: [
      { room: "A", start: 17 * 60, end: 18 * 60, kind: "keynote", talk: "ioKeynote", speaker: null, stream: true },
      { room: "B", start: 18 * 60 + 10, end: 18 * 60 + 50, kind: "talk", talk: "ioAndroid", speaker: "Paolo V." },
      { room: "A", start: 18 * 60 + 10, end: 18 * 60 + 50, kind: "talk", talk: "ioWeb", speaker: "Federica L.", popular: true },
      { room: "A", start: 20 * 60, end: 20 * 60 + 40, kind: "talk", talk: "ioGemini", speaker: "Elena M.", popular: true },
      { room: "B", start: 20 * 60, end: 20 * 60 + 40, kind: "talk", talk: "ioFirebase", speaker: "Roberto S." },
    ],
    spawn: { wifi: 1, perso: 0.8, coc: 0.6, murphy: 1, printer: 0.6, prese: 0, tavoli: false, mic: 1, hdmi: 1, sponsor: 1, overrun: 1, flame: 0.6, vip: 1, dog: 0, press: 1, blackout: 0, firedrill: 0, stream: 1, quota: 0, cancel: 0.5, badge: 0.6 },
    deck: ["volontari", "checkin", "io_stream", "io_vip", "overbooking", "sponsor", "speakercare", "promo"],
    must: ["volontari", "io_stream"], // one per round, the rest shuffled
    goals: [{ id: "rating", min: 3.8 }, { id: "stream" }, { id: "vip" }],
  },
  hack: {
    order: 5, icon: "🌙", rooms: ["A", "B", "L"], start: 18 * 60, end: 34 * 60, daySeconds: 300, gainK: 1.3, pace: 1, night: true,
    attendees: 90, rsvp: 130, prepRounds: 2, budget: 600,
    breaks: [
      { kind: "lunch", start: 23 * 60 + 45, end: 24 * 60 + 30, key: "midnight" },
      { kind: "coffee", start: 28 * 60, end: 28 * 60 + 20, key: "coffee4" },
      { kind: "coffee", start: 31 * 60 + 15, end: 31 * 60 + 50, key: "breakfast" },
    ],
    sessions: [
      { room: "A", start: 19 * 60, end: 19 * 60 + 30, kind: "keynote", talk: "hkKickoff", speaker: "Giulia R." },
      { room: "A", start: 19 * 60 + 30, end: 31 * 60, kind: "hack", talk: "hkHackA", speaker: null },
      { room: "L", start: 19 * 60 + 30, end: 31 * 60, kind: "hack", talk: "hkHackL", speaker: null },
      { room: "B", start: 21 * 60, end: 21 * 60 + 40, kind: "talk", talk: "hkMentors", speaker: "Luca T." },
      { room: "B", start: 25 * 60, end: 25 * 60 + 40, kind: "talk", talk: "hkLate", speaker: "Davide F.", popular: true },
      { room: "A", start: 32 * 60, end: 33 * 60 + 30, kind: "demo", talk: "hkDemo", speaker: null },
      { room: "A", start: 33 * 60 + 30, end: 34 * 60, kind: "raffle", talk: "hkAwards", speaker: null },
    ],
    spawn: { wifi: 1.4, perso: 0.5, coc: 0.6, murphy: 1.2, printer: 0.3, prese: 1.2, tavoli: false, mic: 0.6, hdmi: 1, sponsor: 0.4, overrun: 0.4, flame: 1.2, vip: 1, dog: 0, press: 0.4, blackout: 0.4, firedrill: 0, stream: 0, quota: 0, cancel: 0.3, badge: 0.3, mentor: 1, noise: 1 },
    deck: ["hk_mentors", "hk_food", "hk_rest", "hk_rules", "hk_night", "kitav", "kitlab"],
    must: ["hk_mentors", "hk_food"],
    goals: [{ id: "rating", min: 3.9 }, { id: "mentors", n: 10 }, { id: "demo" }],
  },
  devfest: {
    order: 6, icon: "🎪", rooms: ["A", "B", "L"], start: 9 * 60, end: 18 * 60, daySeconds: 300,
    attendees: 140, rsvp: 110, prepRounds: 4,
    breaks: [
      { kind: "coffee", start: 11 * 60, end: 11 * 60 + 20, key: "coffee" },
      { kind: "lunch", start: 12 * 60 + 10, end: 13 * 60 + 30, key: "lunch" },
      { kind: "coffee", start: 15 * 60, end: 15 * 60 + 20, key: "coffee" },
    ],
    sessions: [
      { room: "A", start: 9 * 60 + 40, end: 10 * 60 + 10, kind: "keynote", talk: "dfKeynote", speaker: "Giulia R." },
      { room: "A", start: 10 * 60 + 20, end: 11 * 60, kind: "talk", talk: "dfAdk", speaker: "Marco D." },
      { room: "B", start: 10 * 60 + 20, end: 11 * 60, kind: "talk", talk: "dfFlutter", speaker: "Sara P." },
      { room: "L", start: 10 * 60 + 20, end: 12 * 60 + 10, kind: "workshop", talk: "dfCodelab", speaker: "Luca T." },
      { room: "A", start: 11 * 60 + 20, end: 12 * 60, kind: "talk", talk: "dfGemini", speaker: "Elena M." },
      { room: "B", start: 11 * 60 + 20, end: 12 * 60, kind: "talk", talk: "dfA11y", speaker: "Anna C." },
      { room: "A", start: 13 * 60 + 30, end: 14 * 60 + 10, kind: "talk", talk: "dfGemma", speaker: "Davide F.", popular: true },
      { room: "B", start: 13 * 60 + 30, end: 14 * 60 + 10, kind: "talk", talk: "dfKmp", speaker: "Paolo V." },
      { room: "L", start: 13 * 60 + 30, end: 15 * 60, kind: "workshop", talk: "dfFirebase", speaker: "Chiara B." },
      { room: "A", start: 14 * 60 + 20, end: 15 * 60, kind: "talk", talk: "dfFrantoio", speaker: "Antonio G.", popular: true },
      { room: "B", start: 14 * 60 + 20, end: 15 * 60, kind: "talk", talk: "dfBaseline", speaker: "Federica L." },
      { room: "A", start: 15 * 60 + 20, end: 16 * 60, kind: "talk", talk: "dfMonolith", speaker: "Roberto S." },
      { room: "B", start: 15 * 60 + 20, end: 16 * 60, kind: "talk", talk: "dfPrompt", speaker: "Ilaria N." },
      { room: "A", start: 16 * 60 + 10, end: 16 * 60 + 50, kind: "lightning", talk: "lightning", speaker: null },
      { room: "A", start: 17 * 60, end: 17 * 60 + 40, kind: "raffle", talk: "raffle", speaker: null },
    ],
    spawn: { wifi: 1, perso: 1, coc: 0.8, murphy: 1.7, printer: 0.75, prese: 1, tavoli: true, mic: 1, hdmi: 1, sponsor: 1, overrun: 1, flame: 1, vip: 0.7, dog: 0.6, press: 0.7, blackout: 0.6, firedrill: 0.5, stream: 0, quota: 0.4, cancel: 1, badge: 0.7 },
    deck: null, // the full Countdown deck (js/prep.js)
    goals: [{ id: "rating", min: 4.0 }, { id: "noCancel" }, { id: "murphy" }],
  },
};
DF.EVENT_ORDER = ["meetup", "studyjam", "wtm", "ioext", "hack", "devfest"];

// The three goals of each event: one star each. Icons here, texts in ui.goals.
DF.GOALS = { rating: "⭐", onTime: "⏱️", noCancel: "🎤", pizza: "🍕", lab: "🧪", chat: "💬", care: "🤝", coc: "🛡️", stream: "📺", vip: "🎖️", mentors: "🧩", demo: "🏆", murphy: "😈" };

/* The chapter's kit: lasting upgrades bought with the season's stars (an
 * upgrade costs stars; swap them freely between events). */
DF.PERKS = {
  walkie: { icon: "📻", cost: 2 },   // staff-chat deadlines +50%
  qr:     { icon: "🧾", cost: 2 },   // QR check-in at every event
  kit:    { icon: "🧰", cost: 2 },   // adapters and batteries always in the box
  signs:  { icon: "🪧", cost: 1 },   // reusable signage: fewer lost people and questions
  moka:   { icon: "☕", cost: 1 },   // +40 coffee
  shoes:  { icon: "👟", cost: 2 },   // +12% walking speed
  squad:  { icon: "🙋", cost: 3 },   // one more volunteer
  colead: { icon: "🤝", cost: 4 },   // a co-organizer joins every solo event
};
// The loadout with the kit applied (never mutates the original).
DF.applyPerks = function (lo, perks) {
  const p = perks || {};
  const out = Object.assign({}, lo, { flags: Object.assign({}, lo.flags || {}), tools: Object.assign({}, lo.tools || {}) });
  if (p.qr) out.flags.checkinQR = true;
  if (p.signs) out.flags.signage = true;
  if (p.kit) { out.tools.adattatori = true; out.tools.batterie = true; }
  if (p.moka) out.coffeeCap = (out.coffeeCap || 100) + 40;
  if (p.squad) out.volunteers = Math.min(6, (out.volunteers || 0) + 1);
  return out;
};

/* Staff chat: actionable message templates. The text comes from the AI (or
 * the fallback pool in the language pack); the mechanics come from here.
 * fx ops: sat{v}, spawn{type,st}, guard{type} (the next one of that type
 * won't happen), coffee{v}, energy{v}, queue{v}, vol{post}, speakerSafe,
 * speakerLost, spawnSoon{type}. */
DF.CHAT_ACTS = {
  parking:   { from: "speaker", when: "beforeTalk", deadline: 14, replies: [{ fx: [{ op: "speakerSafe" }, { op: "sat", v: 0.4 }] }, { fx: [] }], ignore: [{ op: "speakerLost" }] },
  adapter:   { from: "speaker", when: "beforeTalk", deadline: 14, replies: [{ fx: [{ op: "guard", type: "hdmi" }, { op: "sat", v: 0.3 }] }, { fx: [] }], ignore: [{ op: "spawnSoon", type: "hdmi" }] },
  logo:      { from: "sponsor", when: "any", deadline: 16, need: "sponsor", replies: [{ fx: [{ op: "guard", type: "sponsor" }, { op: "sat", v: 0.3 }] }, { fx: [{ op: "sat", v: -0.2 }] }], ignore: [{ op: "spawn", type: "sponsor" }] },
  coffeeLow: { from: "volunteer", when: "break", deadline: 12, replies: [{ fx: [{ op: "coffee", v: 45 }] }, { fx: [] }], ignore: [] },
  queueHelp: { from: "volunteer", when: "rush", deadline: 10, replies: [{ fx: [{ op: "vol", post: "checkin" }] }, { fx: [{ op: "queue", v: 4 }] }], ignore: [{ op: "queue", v: 8 }] },
  pizzaTime: { from: "pizzeria", when: "beforeLunch", deadline: 16, replies: [{ fx: [{ op: "guard", type: "pizza" }] }, { fx: [] }], ignore: [] },
  wifiPass:  { from: "attendee", when: "any", deadline: 12, replies: [{ fx: [{ op: "sat", v: 0.4 }] }, { fx: [{ op: "sat", v: 0.1 }] }], ignore: [{ op: "sat", v: -0.6 }] },
  vipCall:   { from: "city", when: "any", deadline: 16, need: "vip", replies: [{ fx: [{ op: "guard", type: "vip" }, { op: "sat", v: 0.5 }] }, { fx: [] }], ignore: [{ op: "spawn", type: "vip", st: "entrance" }] },
  mom:       { from: "mom", when: "any", deadline: 20, replies: [{ fx: [{ op: "energy", v: 8 }] }, { fx: [{ op: "energy", v: 3 }] }], ignore: [] },
  lostThing: { from: "attendee", when: "any", deadline: 14, replies: [{ fx: [{ op: "sat", v: 0.5 }] }, { fx: [] }], ignore: [{ op: "sat", v: -0.4 }] },
  kidsWhere: { from: "attendee", when: "any", deadline: 14, need: "kid", replies: [{ fx: [{ op: "guard", type: "kid" }, { op: "sat", v: 0.3 }] }, { fx: [] }], ignore: [{ op: "sat", v: -0.4 }] },
  teamStuck: { from: "team", when: "any", deadline: 14, need: "mentor", replies: [{ fx: [{ op: "guard", type: "mentor" }, { op: "sat", v: 0.3 }] }, { fx: [{ op: "sat", v: -0.2 }] }], ignore: [{ op: "spawn", type: "mentor", st: "tableA" }] },
};
// avatars for whoever writes in the staff chat
DF.CHAT_FROM = { volunteer: "🙋", speaker: "🎤", sponsor: "🤝", pizzeria: "🍕", attendee: "🧑‍💻", city: "🏛️", mom: "👵", team: "🧩", venue: "🏢", press: "📰" };
