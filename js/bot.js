/* bot.js: an organizer that plays by itself.
 * Used for the AI co-lead in solo games and by the playtest gate
 * (tools/playtest.mjs), with human-like reaction profiles. Pure, no DOM. */
"use strict";

(function () {
  const ST = DF.Venue.STATIONS, P = DF.PROBLEMS, ROLES = DF.ROLES;

  // react: seconds between decisions; prevent: chases premonitions;
  // delegate: moves volunteers around; chat: chance to answer the staff chat
  DF.BOT_PROFILES = {
    novizio: { react: 1.1, prevent: false, delegate: false, coffeeAt: 18, murphy: 0.4, chat: 0.45, ability: 0 },
    medio:   { react: 0.6, prevent: true, delegate: true, coffeeAt: 28, murphy: 0.8, chat: 0.8, ability: 0.5 },
    esperto: { react: 0.3, prevent: true, delegate: true, coffeeAt: 32, murphy: 1, chat: 0.95, ability: 1 },
    colead:  { react: 1.0, prevent: false, delegate: false, coffeeAt: 25, murphy: 0.5, chat: 0.25, ability: 0.6 },
  };

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const STOCK = ["adattatori", "batterie", "ciabatte", "badge", "crediti"]; // most useful first
  const SPEED = 140;

  // extra seconds to pass by the GDG box on the way, or -1 if the box can't help
  function boxDetour(s, o, pr) {
    const tool = P[pr.type].tool;
    if (!tool || o.carry.includes(tool) || !s.lo.tools || !s.lo.tools[tool] || pr.type === "wifi") return -1;
    const anchor = DF.Sim.anchorOf(s, pr), me = [o.x, o.y], box = [ST.box.px, ST.box.py];
    return (dist(me, box) + dist(box, anchor) - dist(me, anchor)) / SPEED;
  }
  // the box is worth the walk only if the kit saves more time than the walk costs
  function viaBox(s, o, pr) {
    const d = boxDetour(s, o, pr), def = P[pr.type];
    return d >= 0 && d + (def.fix || 2) < (def.fixNoTool || 4);
  }

  function value(s, o, pr, claimedBy) {
    const def = P[pr.type];
    const anchor = DF.Sim.anchorOf(s, pr);
    const me = [o.x, o.y];
    const travel = dist(me, anchor) / SPEED;
    const tool = def.tool;
    const box = viaBox(s, o, pr);
    const detour = box ? boxDetour(s, o, pr) : 0;
    const fast = ROLES[o.role].fast.includes(pr.type) ? 2 : 1;
    const improvise = tool && !box && !o.carry.includes(tool) && pr.type !== "wifi";
    const fixSecs = ((improvise ? def.fixNoTool : def.fix) || 2) / fast;
    if (pr.warn > 0) return travel > pr.warn ? -1 : 1.4 / (1 + travel);
    const urgency = 1 - pr.remain / pr.dur;
    const severity = def.pen + def.drain * 40 + (def.bonus || 0) * 2 + (pr.type === "speaker" || pr.type === "cancel" ? 6 : 0);
    let v = (0.4 + urgency) * severity * (fast > 1 ? 1.4 : 1) / (1 + travel + fixSecs + detour * 0.6);
    if (pr.escalated) v *= 0.5;
    if (claimedBy && claimedBy !== o.id && (def.crew || 1) < 2) v *= 0.15;
    if (pr.remain < travel + 0.5 && !pr.escalated) v *= 0.4;
    return v;
  }

  function claims(s) {
    const m = {};
    for (const q of s.orgs) if (q.bot && q.bot.pid) m[q.bot.pid] = q.id;
    return m;
  }

  // an order from the lead is done when the job is gone, or once there for a spot
  function orderDone(s, o, ord) {
    if (ord.kind === "problem") { const pr = s.problems.find((p) => p.id === ord.id); return !pr || pr.done; }
    if (ord.kind === "speaker") { const sp = s.speakers.find((q) => q.id === ord.id); return !sp || sp.state !== "lost"; }
    if (ord.kind === "critter") { const d = (s.critters || []).find((q) => q.id === ord.id); return !d || d.state !== "roam"; }
    if (ord.kind === "murphy") return !s.murphy || (s.murphy.state !== "walk" && s.murphy.state !== "sabotage");
    if (ord.kind === "station" && ord.id === "checkin") return !o.path && s.crowd.queue <= 2;
    return !o.path;
  }

  function think(s, o, profile, dt) {
    const b = o.bot || (o.bot = { next: 0, pid: 0, mode: null, rest: false, seen: {} });
    const out = { dir: null, hold: false, cmds: [] };
    if (o.stun > 0 || o.talking > 0) return out;

    // the lead tapped this co-org and then a job: go and do it, then back to its own plan
    if (o.order) {
      if (!orderDone(s, o, o.order)) {
        b.mode = "order"; b.pid = o.order.kind === "problem" ? o.order.id : 0;
        const work = DF.Sim.workableProblem(s, o);
        if (work && work.id === b.pid) out.hold = true;
        if (o.order.kind === "station" && o.order.id === "checkin" && !o.path) out.hold = true;
        return out;
      }
      o.order = null; b.mode = null; b.pid = 0; b.next = 0;
    }

    const here = DF.Sim.workableProblem(s, o);
    if (here && b.pid === here.id) out.hold = true;
    if (b.mode === "desk" && s.crowd.queue > 2 && Math.hypot(o.x - ST.checkin.px, o.y - ST.checkin.py) < DF.Sim.ACT_R) out.hold = true;

    b.next -= dt || 1 / 60;
    if (b.next > 0) return out;
    b.next = profile.react;

    // the role's ability, when it's worth it
    // (a coin per moment: not everyone remembers the button)
    if (profile.ability && !(o.abCd > 0) && abilityWanted(s, o) && pseudo(Math.floor(s.t / 4), o.id + "ab") < profile.ability) out.cmds.push({ c: "ability" });

    // the staff chat: answer the good way, sometimes
    for (const m of s.chat) {
      if (!m.open || b.seen[m.id]) continue;
      b.seen[m.id] = true;
      if (pseudo(m.id, o.id) < profile.chat) { out.cmds.push({ c: "reply", id: m.id, i: 0 }); break; }
    }

    const cl = claims(s);
    const m = s.murphy;
    if (m && (m.state === "walk" || m.state === "sabotage") && profile.murphy > 0) {
      const d = Math.hypot(m.x - o.x, m.y - o.y);
      const someoneChasing = s.orgs.some((q) => q !== o && q.bot && q.bot.mode === "murphy");
      if (!someoneChasing && d < 420 * profile.murphy) {
        b.mode = "murphy"; b.pid = 0;
        out.cmds.push({ c: "target", target: { kind: "murphy" } });
        return out;
      }
    }

    // walking a speaker to the stage, or a dog out of the building
    const escorting = s.speakers.find((sp) => sp.state === "escort" && sp.follow === o.id);
    if (escorting) {
      if (b.mode !== "escort") { b.mode = "escort"; b.pid = 0; out.cmds.push({ c: "target", target: { kind: "station", id: DF.Sim.stageOf(escorting.room) } }); }
      return out;
    }
    const led = s.critters.find((d) => d.state === "follow" && d.follow === o.id);
    if (led) {
      if (b.mode !== "lead") { b.mode = "lead"; b.pid = 0; out.cmds.push({ c: "target", target: { kind: "station", id: led.dest } }); }
      return out;
    }

    let best = null, bv = 0;
    for (const pr of s.problems) {
      if (pr.done) continue;
      if (pr.warn > 0 && !profile.prevent) continue;
      if (pr.type === "queue") continue;
      if (pr.type === "speaker") { const sp = s.speakers.find((q) => q.id === pr.ent); if (sp && sp.state === "escort") continue; }
      if (DF.CRITTERS[pr.type]) { const d = s.critters.find((q) => q.id === pr.ent); if (d && d.state !== "roam") continue; }
      const v = value(s, o, pr, cl[pr.id]);
      if (v > bv) { bv = v; best = pr; }
    }
    const q = s.crowd.queue;
    const deskValue = q > 8 ? (q / 10) * (o.role === "host" ? 2 : 1) / (1 + Math.hypot(o.x - ST.checkin.px, o.y - ST.checkin.py) / SPEED) : 0;
    const deskTaken = s.orgs.some((x) => x !== o && x.bot && x.bot.mode === "desk");

    if (o.energy < profile.coffeeAt && s.coffee > 5 && bv < 1.2) b.rest = true;
    if (b.rest) {
      if (o.energy > 75 || s.coffee <= 0 || bv > 2.5) b.rest = false;
      else {
        if (b.mode !== "coffee") { b.mode = "coffee"; b.pid = 0; out.cmds.push({ c: "target", target: { kind: "station", id: "coffee" } }); }
        return out;
      }
    }

    if (deskValue > bv && !deskTaken) {
      if (b.mode !== "desk") { b.mode = "desk"; b.pid = 0; out.cmds.push({ c: "target", target: { kind: "station", id: "checkin" } }); }
      return out;
    }

    if (best) {
      if (b.pid !== best.id) {
        b.pid = best.id; b.mode = "problem";
        const def = P[best.type];
        if (best.type === "speaker") out.cmds.push({ c: "target", target: { kind: "speaker", id: best.ent } });
        else if (DF.CRITTERS[best.type]) out.cmds.push({ c: "target", target: { kind: "critter", id: best.ent } });
        else if (best.type === "wifi" && o.carry.includes("hotspot")) out.cmds.push({ c: "target", target: { kind: "station", id: "lab" } });
        else if (viaBox(s, o, best)) {
          b.mode = "tool";
          out.cmds.push({ c: "target", target: { kind: "station", id: "box" } });
        } else out.cmds.push({ c: "target", target: { kind: "problem", id: best.id } });
      } else if (b.mode === "tool") {
        const def = P[best.type];
        if (o.carry.includes(def.tool)) { b.mode = "problem"; out.cmds.push({ c: "target", target: { kind: "problem", id: best.id } }); }
        else if (Math.hypot(o.x - ST.box.px, o.y - ST.box.py) < DF.Sim.ACT_R + 6) out.cmds.push({ c: "take", tool: def.tool });
      }
    } else {
      // nothing burning: experienced organizers stock up from the GDG box
      const want = profile.prevent && s.lo.tools && o.carry.length < ROLES[o.role].tools
        ? STOCK.find((x) => s.lo.tools[x] && !o.carry.includes(x)) : null;
      if (want) {
        if (b.mode !== "stock") { b.mode = "stock"; b.pid = 0; out.cmds.push({ c: "target", target: { kind: "station", id: "box" } }); }
        else if (Math.hypot(o.x - ST.box.px, o.y - ST.box.py) < DF.Sim.ACT_R + 6) out.cmds.push({ c: "take", tool: want });
      } else if (b.mode !== "idle") {
        b.mode = "idle"; b.pid = 0;
        out.cmds.push({ c: "target", target: { kind: "station", id: "hall" } });
      }
    }

    if (profile.delegate) delegate(s, o, out);
    return out;
  }

  const TECH_FIX = ["hdmi", "mic", "wifi", "prese", "stream", "quota", "blackout", "stampante", "badge"];
  function abilityWanted(s, o) {
    if (o.role === "lead") return s.crowd.queue > 14;
    if (o.role === "tech") return s.problems.some((p) => !p.done && !(p.warn > 0) && TECH_FIX.includes(p.type) && p.remain / p.dur < 0.6);
    if (o.role === "host") return ["A", "B", "L"].some((r) => s.rooms[r].state === "waiting" && s.rooms[r].delay > 3);
    if (o.role === "care") return o.energy < 40 || s.orgs.some((q) => q !== o && q.energy < 35 && Math.hypot(q.x - o.x, q.y - o.y) < 220) || s.problems.some((p) => !p.done && p.type === "flame");
    return false;
  }

  // a deterministic coin per message and organizer (bots don't draw from the sim's RNG)
  function pseudo(a, b) {
    let h = 2166136261;
    for (const ch of String(a) + "|" + String(b)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000) / 1000;
  }

  // A staffing plan that follows the day.
  function delegate(s, o, out) {
    if (o.role !== "lead" && o.role !== "host") return;
    const f = (s.clock - s.start) / (s.end - s.start);
    const rooms = s.ev.rooms;
    const stage = rooms.includes("A") ? "stageA" : "stageB";
    const brk = s.breakIdx >= 0 ? s.breaks[s.breakIdx] : null;
    let want;
    if (f < 0.2) want = ["checkin", "checkin", "info", "coffee"];
    else if (brk && brk.kind === "lunch") want = [s.fl.catering ? "info" : "entrance", "coffee", "sponsor1", rooms.includes("L") ? "lab" : stage];
    else want = [rooms.includes("L") ? "lab" : "info", "coffee", "info", stage];
    if (s.problems.some((p) => !p.done && p.type === "tavoli")) want.unshift("lab");
    if (s.evId === "wtm") want.splice(1, 0, "kids");
    if (s.evId === "hack" && f > 0.1 && f < 0.85) want = ["tableA", "lab", "coffee", "info"];
    const posts = s.vols.map((v) => v.post);
    for (let i = 0; i < s.vols.length; i++) {
      const target = want[i % want.length];
      if (posts[i] !== target) { out.cmds.push({ c: "assign", vol: s.vols[i].id, post: target }); return; }
    }
  }

  DF.Bot = { think };
})();
