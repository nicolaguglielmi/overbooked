/* ui.js: the HTML screens laid over the canvas — title, season, setup, the
 * Countdown, the loadout, pause, the retro, help, the project, the forge.
 * Every text comes from the language packs (DF.t). */
"use strict";

(function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const t = (k, v) => DF.t(k, v);
  const SCREENS = ["title", "season", "setup", "lobby", "prep", "loadout", "pause", "retro", "help", "about", "forge", "kit", "ai", "account", "board", "privacy", "weekly"];
  const LANYARD = '<div class="lanyard" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
  const spriteSrc = (n) => (DF.SPRITE_DATA && DF.SPRITE_DATA[n]) || "assets/sprites/" + n + "." + (window.DF_SPRITE_EXT || "png");

  const U = {
    setup: {
      mode: "solo", event: "devfest", quick: false,
      chapter: DF.storage.get("ovb_chapter", ""), city: DF.storage.get("ovb_city", ""),
      players: [{ id: "p1", role: "lead", name: DF.storage.get("ovb_name", "") }],
    },
    prep: null, activeMember: null, view: "cards", lastResults: null, feel: null,
    aiKit: null, aiCard: {}, current: "title", notifTimer: null,
  };
  // this session's team (DF.castFor): two women and two men across the roles, shuffled
  U.cast = DF.castFor((Math.random() * 4294967296) >>> 0);
  const castSprite = (r, cast) => ((cast || U.cast) || {})[r] || DF.ROLES[r].sprite;
  const progress = () => DF.storage.get("ovb_progress", {});
  // the chapter's kit: upgrades paid with the season's stars, swappable any time
  const KIT = "ovb_kit";
  const starsTotal = () => Object.values(progress()).reduce((a, p) => a + ((p && p.stars) || 0), 0);
  const kitCost = (k) => Object.keys(k).filter((id) => k[id] && DF.PERKS[id]).reduce((a, id) => a + DF.PERKS[id].cost, 0);
  function activePerks() {
    const k = DF.storage.get(KIT, {}) || {};
    let budget = starsTotal();
    const out = {};
    for (const id of Object.keys(DF.PERKS)) if (k[id] && DF.PERKS[id].cost <= budget) { out[id] = true; budget -= DF.PERKS[id].cost; }
    return out;
  }
  const starsFree = () => starsTotal() - kitCost(activePerks());

  function unlocked(ev) {
    const i = DF.EVENT_ORDER.indexOf(ev);
    if (i <= 0) return true;
    const p = progress()[DF.EVENT_ORDER[i - 1]];
    return !!(p && p.stars >= 1);
  }

  function show(name) {
    U.current = name;
    for (const s of SCREENS) { const el = $("#screen-" + s); if (el) el.hidden = s !== name; }
    document.body.classList.toggle("in-day", !name && DF.Game && DF.Game.phase === "day");
    if (name === "title") renderTitle(); else stopNotifs();
    const el = name && $("#screen-" + name);
    if (el) { el.scrollTop = 0; const f = el.querySelector("[data-autofocus]"); if (f) setTimeout(() => f.focus({ preventScroll: true }), 30); }
    if (DF.Coach && DF.Coach.touring) DF.Coach.endTour();
    if (TOURS[name]) setTimeout(() => { if (U.current === name) TOURS[name](); }, 120);
  }

  // the first time on a screen: a short guided tour (the coach remembers)
  const TOURS = {
    prep: () => { if (U.view === "cards" && !(U.ctl && U.ctl.online)) DF.Coach.tour("tour:prep", [{ sel: "#screen-prep .weeks", key: "tPrepWeeks" }, { sel: "#screen-prep .team .member", key: "tPrepPips" }, { sel: "#screen-prep .card .opt", key: "tPrepOpt" }, { sel: "#screen-prep .card .ignore", key: "tPrepIgnore" }, { sel: "#screen-prep .meters", key: "tPrepMeters" }, { sel: "#p-close", key: "tPrepClose" }]); },
    loadout: () => DF.Coach.tour("tour:loadout", [{ sel: "#screen-loadout .stats", key: "tLoStats" }, { sel: "#screen-loadout .goals-list", key: "tLoGoals" }, { sel: "#l-go", key: "tLoGo" }]),
    season: () => DF.Coach.tour("tour:season", [{ sel: "#screen-season .ev", key: "tSeasonEv" }, { sel: "#se-kit", key: "tSeasonKit" }]),
  };

  function toast(text, kind, ttl) { if (DF.Game && (DF.Game.phase === "day" || DF.Game.phase === "ending")) DF.Render.radio(text, kind, ttl); }

  function rerender() {
    const r = { title: renderTitle, season: () => renderSeason(U.seasonMode), setup: renderSetup, prep: renderPrep, loadout: () => U.pendingRun && renderLoadout(U.pendingRun, U.loadoutOpts), help: renderHelp, about: renderAbout, forge: renderForge, pause: renderPause, kit: () => renderKit(), ai: () => renderAI(), account: () => renderAccount(), board: () => renderBoard(), weekly: () => renderWeekly(), privacy: () => renderPrivacy(), lobby: () => DF.Online.renderLobby() }[U.current];
    if (r) r();
    const rt = $("#rotate-text"); if (rt) rt.textContent = "↻ " + t("ui.common.ok");
  }

  // ---------------------------------------------------------------- title
  function renderTitle() {
    const rec = DF.storage.get("ovb_best", null);
    const marquee = t("ui.title.marquee");
    const runText = (Array.isArray(marquee) ? marquee : []).map((m) => esc(m)).join("<b>✱</b>");
    $("#screen-title").innerHTML = `
      <div class="topbar">
        <div class="chips">
          <button class="chip ${DF.AI.available ? "ai-on" : ""}" id="m-ai">${DF.AI.available ? "✨ " + esc(t("ui.title.aiOn")) + " · " + esc(DF.AI.model || "") : DF.AI.canUseKey() ? "✨ " + esc(t("ui.ai.chipOff")) : "📴 " + esc(t("ui.ai.chipNA"))}</button>
          ${acctChip()}
        </div>
        <div class="langs" role="group" aria-label="Language">${DF.LANGS.map((l) => `<button data-lang="${l.id}" aria-pressed="${DF.lang === l.id}" title="${esc(l.name)}">${l.id.toUpperCase()}</button>`).join("")}</div>
      </div>
      <div class="notifs" id="notifs" aria-hidden="true"></div>
      <div class="hero">
        <div class="ticket">
          <div class="by"><span>${esc(U.setup.chapter ? t("brand.by", { chapter: U.setup.chapter }) : t("brand.byAny"))}</span><span>ADMIT ONE · STAFF</span></div>
          <div class="serial">Nº ${String(Date.now()).slice(-6)}</div>
          <div class="logo"><span class="stamp">OVERBOOKED!</span></div>
          <div class="tag">${esc(t("brand.tagline"))}</div>
          <div class="sub">${esc(t("brand.sub"))}</div>
          <div class="perf"></div>
          <div class="cast" aria-hidden="true">${Object.keys(DF.ROLES).map((r) => `<img src="${spriteSrc(castSprite(r))}" alt="">`).join("")}<img class="murphy" src="${spriteSrc("murphy")}" alt=""></div>
        </div>
        <nav class="menu" aria-label="Menu">
          ${LANYARD}
          <button class="stub primary" id="m-play" data-autofocus><span class="ico">🎟️</span><span>${esc(t("ui.title.play"))}<small>${esc(t("ui.title.playSub"))}</small></span></button>
          <button class="stub" id="m-quick"><span class="ico">⚡</span><span>${esc(t("ui.title.quick"))}<small>${esc(t("ui.title.quickSub"))}</small></span></button>
          <button class="stub" id="m-weekly"><span class="ico">📅</span><span>${esc(t("ui.weekly.stub"))}<small>${esc(t("ui.weekly.stubSub", { event: t("events." + DF.Weekly.setup(DF.Weekly.weekOf(), "lead").event + ".name") }))}</small></span></button>
          <button class="stub" id="m-forge"><span class="ico">🃏</span><span>${esc(t("ui.title.forge"))}<small>${esc(t("ui.title.forgeSub"))}</small></span></button>
          <div class="row">
            <button class="btn ghost small grow" id="m-help">📖 ${esc(t("ui.title.help"))}</button>
            <button class="btn ghost small grow" id="m-about">🔎 ${esc(t("ui.title.about"))}</button>
            ${DF.Account.boardAvailable ? `<button class="btn ghost small grow" id="m-board">🏆 ${esc(t("ui.board.short"))}</button>` : ""}
          </div>
          <div class="record">${rec ? esc(t("ui.title.record", { fb: DF.fmtDec(rec.feedback), score: rec.score })) : esc(t("ui.title.noRecord"))}</div>
        </nav>
      </div>
      <div style="width:100%">
        <div class="tape" aria-hidden="true"><div class="run"><span>${runText}<b>✱</b>${runText}</span></div></div>
        <div class="foot">${esc(DF.CREDITS.author)} (${esc(DF.CREDITS.title)}) · ${esc(t("brand.disclaimer"))} · <button class="linkbtn" id="m-privacy">${esc(t("ui.privacy.link"))}</button></div>
      </div>`;
    const root = $("#screen-title");
    root.querySelectorAll("[data-lang]").forEach((b) => { b.onclick = () => { DF.setLang(b.dataset.lang); DF.Audio.play("click"); }; });
    $("#m-play").onclick = () => { DF.Audio.unlock(); DF.Audio.play("stamp"); U.setup.quick = false; renderSeason("season"); show("season"); };
    $("#m-quick").onclick = () => { DF.Audio.unlock(); DF.Audio.play("click"); U.setup.quick = true; renderSeason("quick"); show("season"); };
    $("#m-forge").onclick = () => { renderForge(); show("forge"); };
    $("#m-weekly").onclick = () => { DF.Audio.unlock(); DF.Audio.play("card"); renderWeekly(); show("weekly"); };
    $("#m-help").onclick = () => { renderHelp(); show("help"); };
    $("#m-about").onclick = () => { renderAbout(); show("about"); };
    $("#m-ai").onclick = () => { renderAI("title"); show("ai"); };
    const ac = $("#m-acct"); if (ac) ac.onclick = () => { renderAccount("title"); show("account"); };
    const bd = $("#m-board"); if (bd) bd.onclick = () => { renderBoard("title"); show("board"); };
    $("#m-privacy").onclick = () => { renderPrivacy("title"); show("privacy"); };
    startNotifs();
  }

  const firstName = (n) => String(n || "").trim().split(/\s+/)[0].slice(0, 14);
  function acctChip() {
    const A = DF.Account;
    if (!A.available) return "";
    if (A.status === "in") return `<button class="chip acct-on" id="m-acct">👤 ${esc(firstName(A.user.name) || t("ui.acct.eyebrow"))} ${A.sync.err ? "⚠️" : "✓"}</button>`;
    return `<button class="chip" id="m-acct">👤 ${esc(t("ui.acct.chip"))}</button>`;
  }

  // phone notifications popping on the title: the chaos starts before the game
  function startNotifs() {
    stopNotifs();
    let i = Math.floor(Math.random() * 10);
    const pop = () => {
      const box = $("#notifs");
      if (!box || U.current !== "title") return;
      const list = t("ui.title.notif");
      if (!Array.isArray(list) || !list.length) return;
      const icons = ["🎤", "💬", "🍕", "🔑", "🤝", "👵"];
      const n = document.createElement("div");
      n.className = "notif";
      n.innerHTML = `<span class="ico">${icons[i % icons.length]}</span><span>${esc(list[i % list.length])}<small>Staff · ${DF.fmtClock(9 * 60 + ((i * 7) % 50))}</small></span>`;
      box.prepend(n);
      i++;
      while (box.children.length > 3) box.lastChild.remove();
      setTimeout(() => n.classList.add("out"), 4200);
      setTimeout(() => n.remove(), 4700);
    };
    pop();
    U.notifTimer = setInterval(pop, 2600);
  }
  function stopNotifs() { if (U.notifTimer) clearInterval(U.notifTimer); U.notifTimer = null; }

  // ---------------------------------------------------------------- season
  function renderSeason(mode) {
    U.seasonMode = mode;
    const prog = progress();
    $("#screen-season").innerHTML = `
      <div class="sheet" style="width:min(1040px,100%)">
        ${LANYARD}
        <div class="eyebrow">${esc(mode === "quick" ? t("ui.title.quick") : t("ui.season.title"))}</div>
        <h2>${esc(mode === "quick" ? t("ui.title.quickSub") : t("ui.season.sub"))}</h2>
        <div class="events">${DF.EVENT_ORDER.map((id, i) => {
          const ev = DF.EVENTS[id], p = prog[id];
          const open = mode === "quick" || unlocked(id);
          const prev = i > 0 ? t("events." + DF.EVENT_ORDER[i - 1] + ".name") : "";
          return `<button class="ev" data-ev="${id}" ${open ? "" : "disabled"}>
            <span class="num">0${i + 1}</span><span class="ico">${ev.icon}</span>
            <span class="when">${esc(t("events." + id + ".when"))}</span>
            <b>${esc(t("events." + id + ".name"))}</b>
            ${open ? `<p>${esc(t("events." + id + ".blurb"))}</p>` : `<span class="lock">🔒 ${esc(t("ui.season.locked", { prev }))}</span>`}
            <span class="goals-mini">${(ev.goals || []).map((g, k) => `<i class="${p && p.goals && p.goals[k] ? "ok" : ""}">${DF.GOALS[g.id]}</i>`).join("")}</span>
            <span class="meta"><span>${esc(t("ui.season.people", { n: ev.attendees }))} · ${esc(t("ui.season.minutes", { n: Math.round(ev.daySeconds / 60 * 10) / 10 }))}</span><span class="stars">${p ? "★".repeat(p.stars) + "☆".repeat(3 - p.stars) : ""}${p && p.hard != null ? ` <b class="hot" title="${esc(t("ui.setup.soldout"))}">🔥${p.hard}</b>` : ""}</span></span>
          </button>`;
        }).join("")}</div>
        <details class="medal-shelf"><summary>🏅 ${esc(t("ui.medals.title"))}</summary><div class="medals">${medalChips()}</div></details>
        <div class="row" style="justify-content:space-between;align-items:center">
          <p class="record">⭐ ${starsTotal()}/${DF.EVENT_ORDER.length * 3} · 🏅 ${Object.keys(medals()).length}/${MEDALS.length}</p>
          <div class="row"><button class="btn ghost" id="se-kit">🧰 ${esc(t("ui.kit.title"))}${starsFree() > 0 ? ` <span class="badge">${starsFree()}</span>` : ""}</button><button class="btn ghost" id="se-back">${esc(t("ui.common.back"))}</button></div>
        </div>
      </div>`;
    $("#se-kit").onclick = () => { renderKit("season"); show("kit"); };
    $("#screen-season").querySelectorAll("[data-ev]").forEach((b) => {
      b.onclick = () => { if (b.disabled) return; U.setup.event = b.dataset.ev; DF.Audio.play("card"); renderSetup(); show("setup"); };
    });
    $("#se-back").onclick = () => show("title");
  }

  // ---------------------------------------------------------------- setup
  function renderSetup() {
    const st = U.setup;
    const transport = DF.Net && DF.Net.pickTransport();
    const modes = ["solo", "duo", "online"];
    const ev = DF.EVENTS[st.event];
    const roleCards = (p, i) => Object.keys(DF.ROLES).map((r) => `<button class="rolecard" data-role="${i}:${r}" aria-pressed="${p.role === r}" style="--rc:${DF.ROLES[r].color}"><img src="${spriteSrc(castSprite(r))}" alt=""><b>${esc(t("roles." + r + ".name"))}</b></button>`).join("");
    $("#screen-setup").innerHTML = `
      <div class="sheet">
        ${LANYARD}
        <div class="eyebrow">${ev.icon} ${esc(t("events." + st.event + ".name"))}</div>
        <h2>${esc(t("ui.setup.title"))}</h2>
        <div class="modes" role="group">${modes.map((m) => {
          const [name, text] = t("ui.setup.modes." + m);
          const dis = m === "online" && !transport;
          return `<button class="choice" data-mode="${m}" aria-pressed="${st.mode === m}" ${dis ? "disabled" : ""}><span class="ico">${m === "solo" ? "🧑‍💻" : m === "duo" ? "🧑‍🤝‍🧑" : "🌐"}</span><b>${esc(name)}</b><span>${esc(m === "online" && transport && transport.kind !== "firebase" ? t("ui.setup.onlineLocal") : text)}</span></button>`;
        }).join("")}</div>
        ${(DF.VENUES_FOR[st.event] || []).length > 1 ? `<div class="modes venues" role="group" aria-label="${esc(t("ui.setup.venue"))}">${DF.VENUES_FOR[st.event].map((v) => `<button class="choice" data-venue="${v}" aria-pressed="${DF.venueFor(st.event, st.venue) === v}"><span class="ico">${v === "cowork" ? "💻" : "🏫"}</span><b>${esc(t("venues." + v + ".name"))}</b><span>${esc(t("venues." + v + ".desc"))}</span></button>`).join("")}</div>` : ""}
        ${st.mode !== "online" ? `<label class="check"><input type="checkbox" id="f-relax" ${DF.storage.get("ovb_relax", false) ? "checked" : ""}><span><b>${esc(t("ui.setup.relax"))}</b> ${esc(t("ui.setup.relaxSub"))}</span></label>` : ""}
        ${st.mode !== "online" ? (soldoutOpen(st) ? `<label class="check hot"><input type="checkbox" id="f-soldout" ${st.soldout ? "checked" : ""}><span><b>🔥 ${esc(t("ui.setup.soldout"))}</b> ${esc(t("ui.setup.soldoutSub"))}</span></label>` : `<p class="record">🔒 🔥 ${esc(t("ui.setup.soldoutLocked"))}</p>`) : ""}
        <div class="row">
          <div class="field grow"><label for="f-chapter">${esc(t("ui.setup.chapter"))}</label><input id="f-chapter" maxlength="40" value="${esc(st.chapter)}" placeholder="${esc(t("ui.setup.chapterPh"))}"></div>
          <div class="field grow"><label for="f-city">${esc(t("ui.setup.city"))}</label><input id="f-city" maxlength="40" value="${esc(st.city)}" placeholder="${esc(t("ui.setup.cityPh"))}"></div>
        </div>
        ${st.players.map((p, i) => `
          <div class="row" style="align-items:flex-end">
            <div class="field" style="width:12em"><label for="f-name-${i}">${esc(t("ui.setup.player", { n: i + 1 }))}${st.mode === "duo" ? (i ? " · ⬅➡ + ↵" : " · WASD + ␣") : ""}</label><input id="f-name-${i}" maxlength="14" value="${esc(p.name)}" placeholder="${esc(t("ui.setup.name"))}"></div>
            <div class="roles grow">${roleCards(p, i)}</div>
          </div>`).join("")}
        <p>${st.players.map((p) => "<b>" + esc(t("roles." + p.role + ".name")) + "</b> — " + esc(t("roles." + p.role + ".blurb"))).join("<br>")}</p>
        ${st.mode === "online" ? `
        <div class="row" style="align-items:flex-end">
          <div class="field"><label for="f-code">${esc(t("ui.setup.code"))}</label><input id="f-code" maxlength="4" placeholder="ABCD" style="text-transform:uppercase;letter-spacing:.2em;width:8em;font-family:var(--mono)"></div>
          <button class="btn ghost" id="s-join">${esc(t("ui.setup.join"))}</button>
          <span class="grow"></span>
          <button class="btn go" id="s-create" data-autofocus>${esc(t("ui.setup.create"))}</button>
        </div>
        <p id="s-err" style="color:var(--stamp)"></p>
        <div class="row end"><button class="btn ghost" id="s-back">${esc(t("ui.setup.back"))}</button></div>` : `
        <div class="row end">
          <button class="btn ghost" id="s-back">${esc(t("ui.setup.back"))}</button>
          <button class="btn go" id="s-go" data-autofocus>${esc(st.quick ? t("ui.setup.startDay") : t("ui.setup.start"))} →</button>
        </div>`}
      </div>`;
    const root = $("#screen-setup");
    root.querySelectorAll("[data-mode]").forEach((b) => {
      b.onclick = () => {
        readSetup();
        st.mode = b.dataset.mode;
        const p0 = st.players[0];
        st.players = st.mode === "duo" ? [p0, { id: "p2", role: p0.role === "tech" ? "lead" : "tech", name: (st.players[1] && st.players[1].name) || "" }] : [p0];
        renderSetup();
      };
    });
    root.querySelectorAll("[data-venue]").forEach((b) => { b.onclick = () => { readSetup(); st.venue = b.dataset.venue; DF.Audio.play("click"); renderSetup(); }; });
    root.querySelectorAll("[data-role]").forEach((b) => {
      b.onclick = () => { readSetup(); const [i, r] = b.dataset.role.split(":"); st.players[+i].role = r; DF.Audio.play("click"); renderSetup(); };
    });
    $("#s-back").onclick = () => { renderSeason(U.seasonMode || "season"); show("season"); };
    if (st.mode === "online") {
      const err = (e) => { $("#s-err").textContent = e.message || String(e); };
      const profile = () => ({ name: st.players[0].name || t("roles." + st.players[0].role + ".name"), role: st.players[0].role });
      $("#s-create").onclick = async () => {
        readSetup(); DF.Audio.unlock();
        try { await DF.Online.create(profile(), st.chapter, st.event); DF.Online.renderLobby(); show("lobby"); } catch (e) { err(e); }
      };
      $("#s-join").onclick = async () => {
        readSetup(); DF.Audio.unlock();
        const code = ($("#f-code").value || "").trim().toUpperCase();
        if (code.length !== 4) { err(new Error(t("ui.setup.codeLen"))); return; }
        $("#s-join").disabled = true;
        try { await DF.Online.join(code, profile()); DF.Online.renderLobby(); show("lobby"); } catch (e) { err(e); } finally { const b = $("#s-join"); if (b) b.disabled = false; }
      };
      return;
    }
    $("#s-go").onclick = () => {
      readSetup();
      DF.Audio.unlock();
      if (st.quick) DF.Game.startDay(quickRun(st.mode, st.event));
      else startPrep();
    };
  }

  function readSetup() {
    const st = U.setup;
    const ch = $("#f-chapter"), city = $("#f-city");
    if (ch) st.chapter = ch.value.trim();
    if (city) st.city = city.value.trim() || "";
    st.players.forEach((p, i) => { const n = $("#f-name-" + i); if (n) p.name = n.value.trim(); });
    DF.storage.set("ovb_chapter", st.chapter); DF.storage.set("ovb_city", st.city);
    if (st.players[0]) DF.storage.set("ovb_name", st.players[0].name);
    const rx = $("#f-relax"); if (rx) DF.storage.set("ovb_relax", rx.checked);
    const so = $("#f-soldout"); st.soldout = !!(so && so.checked);
  }

  // sold-out: open once the event has three stars, and always in the quick game
  function soldoutOpen(st) { const p = progress()[st.event]; return st.quick || !!(p && p.stars >= 3); }

  // A standard preparation, for the quick game and ?day= in the URL.
  function quickRun(mode, event) {
    event = event || U.setup.event || "devfest";
    const ev = DF.EVENTS[event];
    const p0 = U.setup.players[0] || { role: "lead", name: "" };
    const players = mode === "duo"
      ? [{ id: "p1", role: p0.role || "lead", name: p0.name }, { id: "p2", role: (U.setup.players[1] && U.setup.players[1].role) || "tech", name: (U.setup.players[1] && U.setup.players[1].name) || "" }]
      : [{ id: "p1", role: p0.role || "lead", name: p0.name }, { id: "p2", role: p0.role === "tech" ? "lead" : "tech", name: "Co-org", ctrl: "bot" }];
    return { mode, event, players, chapter: U.setup.chapter, city: U.setup.city, ai: U.aiKit, soldout: !!U.setup.soldout && mode !== "online", venue: DF.venueFor(event, U.setup.venue), loadout: DF.Weekly.standardLoadout(event), cast: U.cast };
  }

  // ------------------------------------------------------------- countdown
  // The screen talks to a controller: locally it owns the state, in an
  // online room the host owns it and guests send their picks.
  const localCtl = {
    online: false, isHost: true, me: null,
    view() { return { st: U.prep, hand: U.prep.hand.map((id) => DF.Prep.cardOf(U.prep, id)), results: U.lastResults, mode: U.view }; },
    toggle(cid, oi, member) { return DF.Prep.toggle(U.prep, cid, oi, member); },
    close() { U.lastResults = DF.Prep.resolve(U.prep); U.view = "results"; },
    next() {
      if (U.prep.round >= U.prep.rounds) { renderLoadout(runFromPrep()); show("loadout"); return false; }
      DF.Prep.deal(U.prep); U.view = "cards";
      if (!U.prep.members.some((m) => m.id === U.activeMember)) U.activeMember = U.prep.members[0].id;
      askAiCard();
      return true;
    },
  };
  U.ctl = localCtl;

  function startPrep() {
    const st = U.setup;
    U.seed = (Date.now() % 1e9) | 0;
    U.ctl = localCtl;
    U.prep = DF.Prep.createPrep({ seed: U.seed, players: st.players, event: st.event });
    DF.Stats.countdown(st.event, st.mode);
    U.activeMember = U.prep.members[0].id;
    DF.Prep.deal(U.prep);
    U.view = "cards";
    prefetchKit();
    askAiCard();
    renderPrep();
    show("prep");
    DF.Audio.play("card");
  }

  // Gemini writes the day's staff chat while we prepare (again if the language changes)
  function prefetchKit() {
    const st = U.setup;
    U.aiKit = null;
    if (!DF.AI.available) return;
    const lang = DF.lang;
    DF.AI.dayKit({ event: st.event, chapter: st.chapter, city: st.city }).then((kit) => { if (kit && lang === DF.lang) U.aiKit = kit; });
  }

  // one extra card per round, written for this chapter (AI only)
  function askAiCard() {
    const st = U.prep;
    if (!DF.AI.available || !st) return;
    const round = st.round;
    const labels = t("ui.prep.rounds." + st.rounds) || [];
    U.aiCard[round] = "loading";
    const avoid = DF.PREP_CARDS.filter((c) => !c.mine).map((c) => DF.Prep.textOf(c).title).slice(0, 30);
    DF.AI.card({ event: st.event, chapter: U.setup.chapter, city: U.setup.city, when: labels[round] || "", avoid }).then((card) => {
      if (U.prep !== st || st.round !== round) return;
      U.aiCard[round] = card ? "ok" : "fail";
      if (card && U.view === "cards") { DF.Prep.addExtra(st, card); DF.Audio.play("card"); }
      if (U.current === "prep") renderPrep();
    });
  }

  const streamName = (k) => { const v = t("ui.streams." + k); return v === "ui.streams." + k ? k : v; };

  const METERS = [
    { k: "budget", fmt: (v) => (v < 0 ? "−" : "") + Math.abs(Math.round(v)) + " €", pct: (v) => DF.clamp((v + 500) / 2500, 0, 1), col: "#4285F4" },
    { k: "rsvp", fmt: (v) => Math.round(v), pct: (v) => DF.clamp(v / 300, 0, 1), col: "#a142f4" },
    { k: "community", fmt: (v) => Math.round(v), pct: (v) => v / 100, col: "#34A853" },
    { k: "partner", fmt: (v) => Math.round(v), pct: (v) => v / 100, col: "#F9AB00" },
    { k: "energy", fmt: (v) => Math.round(v), pct: (v) => v / 100, col: "#EA4335" },
  ];

  function fxChips(fx, set) {
    const out = [];
    for (const k in fx || {}) {
      const v = fx[k];
      if (!v) continue;
      const good = k === "budget" || k === "rsvp" || k === "community" || k === "partner" || k === "energy" ? v > 0 : false;
      out.push(`<span class="${good ? "pos" : "neg"}">${esc(t("ui.fx." + k, { s: v > 0 ? "+" : "−", v: Math.abs(v) }))}</span>`);
    }
    for (const k in set || {}) {
      if (k === "tools") set.tools.forEach((x) => out.push(`<span class="pos">${DF.TOOLS[x].icon} ${esc(t("tools." + x + ".name"))}</span>`));
      else if (k === "vols") out.push(`<span class="pos">${esc(t("ui.fx.vols", { v: set.vols }))}</span>`);
      else { const l = t("ui.set." + k); if (l && l !== "ui.set." + k) out.push(`<span class="pos">${esc(l)}</span>`); }
    }
    return out.join("");
  }

  function renderPrep() {
    const ctl = U.ctl;
    const v = ctl.view();
    const st = v.st;
    if (!st) return;
    if (ctl.me) U.activeMember = ctl.me;
    const rounds = st.rounds || 4;
    const labels = t("ui.prep.rounds." + rounds) || [];
    const label = labels[Math.min(st.round, rounds - 1)] || "";
    const meters = METERS.map((m) => `<div class="meter" data-k="${m.k}"><div class="lbl">${esc(t("ui.meters." + m.k))}<b>${m.fmt(st.meters[m.k])}</b></div><div class="bar"><i style="width:${Math.round(m.pct(st.meters[m.k]) * 100)}%;background:${m.col}"></i></div></div>`).join("");
    const team = st.members.map((m) => {
      const pips = [];
      for (let i = 0; i < Math.max(m.pips, m.used); i++) pips.push(`<i class="${i >= m.pips ? "over" : i < m.used ? "used" : ""}"></i>`);
      const mine = !ctl.online || m.id === ctl.me;
      const role = t("roles." + m.role + ".name");
      const name = m.name || (m.ai ? "Co-org" : role);
      return `<button class="member" data-m="${m.id}" aria-pressed="${U.activeMember === m.id}" ${mine ? "" : "disabled"}>
        <img src="${spriteSrc(castSprite(m.role))}" alt="">
        <span><span style="display:block;font:800 13px/1.1 var(--font)">${esc(name)} <small>${name === role ? "" : esc(role)}${m.ready ? " · ✓" : ""}</small></span>
        <span class="pips">${pips.join("")}</span></span></button>`;
    }).join("");

    let body;
    const hostOnly = ctl.online && !ctl.isHost;
    if (v.mode === "cards") {
      const loading = DF.AI.available && U.aiCard[st.round] === "loading" && !ctl.online;
      body = `<div class="cards">${v.hand.filter(Boolean).map((c) => cardHTML(st, c)).join("")}${loading ? `<article class="card loading"><span style="font-family:var(--emoji);font-size:28px">✨</span><p>${esc(U.setup.city || U.setup.chapter ? t("ui.prep.aiLoading", { city: U.setup.city || U.setup.chapter }) : t("ui.prep.aiLoadingAny"))}</p></article>` : ""}</div>
        <div class="row end">
          <p class="grow">${esc(ctl.online ? t("ui.prep.hintOnline") : st.members.length > 1 ? t("ui.prep.hintTeam") : "")} ${esc(t("ui.prep.hint"))}</p>
          ${hostOnly ? `<button class="btn ghost" id="p-ready">${esc(st.members.find((m) => m.id === ctl.me && m.ready) ? t("ui.prep.isReady") : t("ui.prep.ready"))}</button>` : `<button class="btn go" id="p-close" data-autofocus>${esc(t("ui.prep.close"))} →</button>`}
        </div>`;
    } else {
      body = resultsHTML(v.results, st) + (hostOnly ? `<div class="row end"><p>${esc(t("ui.prep.hostNext"))}</p></div>` : `<div class="row end"><button class="btn go" id="p-next" data-autofocus>${esc(st.round >= rounds ? t("ui.prep.toDay") : t("ui.prep.next") + " · " + (labels[st.round] || ""))}</button></div>`);
    }
    $("#screen-prep").innerHTML = `
      <div class="sheet">
        <div class="prep-head">
          <div class="weeks"><small>${esc(t("ui.prep.title"))} · ${esc(t("events." + st.event + ".name"))}${ctl.online ? " · " + esc(ctl.code) : ""}</small>${esc(v.mode === "cards" ? label : t("ui.prep.results"))}</div>
          <div class="meters">${meters}</div>
        </div>
        ${v.mode === "cards" ? `<div class="team" role="group">${team}</div>` : ""}
        ${body}
      </div>`;
    const root = $("#screen-prep");
    root.querySelectorAll("[data-m]").forEach((b) => { b.onclick = () => { if (ctl.online) return; U.activeMember = b.dataset.m; DF.Audio.play("click"); renderPrep(); }; });
    root.querySelectorAll("[data-opt]").forEach((b) => {
      b.onclick = () => {
        const [cid, oi] = b.dataset.opt.split(":");
        const r = ctl.toggle(cid, +oi, U.activeMember);
        if (r && !r.ok) { flashNote(b, t("ui.prep.tired", { name: r.who || "" })); return; }
        DF.Audio.play(r && r.removed ? "click" : "pickup");
        renderPrep();
      };
    });
    root.querySelectorAll("[data-why]").forEach((b) => { b.onclick = () => { const box = b.nextElementSibling; box.hidden = !box.hidden; }; });
    const ready = $("#p-ready");
    if (ready) ready.onclick = () => { ctl.ready(); DF.Audio.play("click"); };
    const close = $("#p-close");
    if (close) close.onclick = () => {
      const before = Object.assign({}, st.meters);
      ctl.close();
      DF.Audio.play("stamp");
      renderPrep();
      pulseMeters(before, ctl.view().st.meters);
    };
    const next = $("#p-next");
    if (next) next.onclick = () => {
      if (ctl.next() === false) return;
      DF.Audio.play("card");
      renderPrep();
      $("#screen-prep").scrollTop = 0;
    };
  }

  function cardHTML(st, c) {
    const tx = DF.Prep.textOf(c);
    const pick = st.picks[c.id];
    const am = st.members.find((m) => m.id === U.activeMember) || st.members[0];
    const aff = DF.AFFINITY[c.stream];
    const opts = c.opts.map((o, i) => {
      const chosen = pick && pick.opt === i;
      const who = chosen ? st.members.find((m) => m.id === pick.member) : null;
      const cost = chosen ? pick.cost : DF.Prep.costFor(st, c, o, am);
      const disc = !chosen && cost < o.cost;
      return `<button class="opt" data-opt="${c.id}:${i}" aria-pressed="${chosen}">
        <span class="top"><b>${esc(tx.o[i] || o.label || "")}</b><span class="cost">${cost ? '<i class="pip"></i>'.repeat(cost) : esc(t("ui.prep.free"))}${disc ? '<span class="disc">−1</span>' : ""}</span></span>
        <span class="fx">${fxChips(o.fx, o.set)}</span>
        ${who ? `<span class="who">${esc(t("ui.prep.who", { name: who.name || t("roles." + who.role + ".name") }))}</span>` : ""}
      </button>`;
    }).join("");
    const srcs = (c.src || []).map((k) => DF.SOURCES[k] ? `<a href="${esc(DF.SOURCES[k].u)}" target="_blank" rel="noopener">${esc(DF.SOURCES[k].t)}</a>` : "").filter(Boolean).join(" · ");
    const tip = tx.tipT || tx.tipD ? `<button class="why" data-why>ℹ️ ${esc(t("ui.prep.why"))}</button><div class="tipbox" hidden><b>${esc(tx.tipT)}</b> ${esc(tx.tipD)}${srcs ? "<br>" + srcs : ""}</div>` : "";
    return `<article class="card ${c.imprevisto ? "imprevisto" : ""} ${c.ai ? "ai" : ""}">
      <span class="tag" style="background:${c.ai ? "#b8860b" : DF.STREAM_COLOR[c.stream] || "#5f6b7d"}">${c.ai ? esc(t("ui.prep.ai")) : (c.imprevisto ? "⚠ " : "") + esc(streamName(c.stream))}</span>
      <h3><span class="e">${c.icon}</span>${esc(tx.title)}</h3>
      ${tx.text ? `<p>${esc(tx.text)}</p>` : ""}
      <div class="opts">${opts}</div>
      <div class="ignore"><b>${esc(t("ui.prep.ignore"))}:</b> ${esc(tx.ignore)} <span class="fx">${fxChips(c.ignore.fx, c.ignore.set)}</span></div>
      ${tip}
      ${aff && DF.ROLES[aff] ? `<div style="font:600 11px/1.3 var(--font);color:#8a8790">${esc(t("ui.prep.discount", { role: t("roles." + aff + ".name") }))}</div>` : ""}
    </article>`;
  }

  function resultsHTML(results, st) {
    if (!results) return "";
    const items = results.map((r) => {
      if (r.overtime) return `<div class="result"><span class="ico">🌙</span><div><b>${esc(t("ui.prep.overtime", { n: r.overtime, e: 7 * r.overtime }))}</b></div></div>`;
      const c = r.card || DF.Prep.card(r.id);
      if (!c) return "";
      const tx = DF.Prep.textOf(c);
      const who = r.member && st.members.find((m) => m.id === r.member);
      const what = r.ignored ? tx.ignore : (who ? (who.name || t("roles." + who.role + ".name")) + ": " : "") + (tx.o[r.opt] || "");
      const srcs = (c.src || []).map((k) => DF.SOURCES[k] ? `<a href="${esc(DF.SOURCES[k].u)}" target="_blank" rel="noopener">↗</a>` : "").join(" ");
      const stamp = `<span class="stamp small ${r.ignored ? "no" : "ok"}">${esc(r.ignored ? t("ui.prep.skipped") : t("ui.prep.done"))}</span>`;
      return `<div class="result"><span class="ico">${c.icon}</span><div style="min-width:0;flex:1"><div class="rhead"><b>${esc(tx.title)}</b>${stamp}</div><p>${esc(what)}</p>${tx.tipT ? `<div class="tip"><b>${esc(tx.tipT)}</b> ${esc(tx.tipD)} ${srcs}</div>` : ""}</div></div>`;
    }).join("");
    return `<div class="result-list">${items}</div>`;
  }

  function flashNote(el, text) {
    const n = document.createElement("div");
    n.className = "tip"; n.textContent = text;
    el.after(n);
    setTimeout(() => n.remove(), 2200);
  }

  function pulseMeters(before, after) {
    document.querySelectorAll("#screen-prep .meter").forEach((el) => {
      const k = el.dataset.k;
      if (after[k] > before[k]) el.classList.add("delta-up");
      else if (after[k] < before[k]) el.classList.add("delta-down");
    });
  }

  // --------------------------------------------------------------- loadout
  const FLAGS = [["checkinQR", "🧾"], ["catering", "🍕"], ["speakerCare", "🧭"], ["backupSpeaker", "🦸"], ["provaTecnica", "🧪"], ["networkCheck", "📡"], ["labReady", "🪑"], ["cocTeam", "🛡️"], ["runOfShow", "🗂️"], ["signage", "🪧"], ["raffle", "🎁"], ["sponsorPack", "🤝"], ["fireCheck", "🚨"], ["pressReady", "📰"], ["dogGate", "🚪"], ["streamTest", "📺"], ["vipReady", "🎖️"], ["timeKeeper", "⏳"], ["kidsCorner", "🧸"], ["photoLanyards", "📸"], ["accessRoute", "♿"], ["mentors", "🧩"], ["restArea", "🛌"], ["judgingRules", "📜"], ["nightGuard", "🌃"]];
  // what each event shows on the day before, even when missing
  const EVENT_FLAGS = { wtm: ["kidsCorner", "photoLanyards", "accessRoute", "cocTeam"], hack: ["mentors", "catering", "restArea", "judgingRules", "nightGuard"] };

  function runFromPrep() {
    const st = U.prep;
    const lo = DF.Prep.loadout(st);
    const players = U.setup.players.map((p) => ({ id: p.id, role: p.role, name: p.name }));
    if (lo.coLead && players.length === 1) players.push({ id: "p2", role: players[0].role === "tech" ? "lead" : "tech", name: "Co-org", ctrl: "bot" });
    return { mode: U.setup.mode, event: st.event, players, chapter: U.setup.chapter, city: U.setup.city, loadout: lo, seed: U.seed, ai: U.aiKit, prep: 1, cast: U.cast, venue: DF.venueFor(st.event, U.setup.venue), soldout: !!U.setup.soldout && soldoutOpen(U.setup) && U.setup.mode !== "online" };
  }

  function renderLoadout(run, opts) {
    opts = opts || {};
    U.pendingRun = run; U.loadoutOpts = opts;
    const lo = run.loadout;
    const ev = DF.EVENTS[run.event || lo.event];
    const relevant = FLAGS.filter(([k]) => lo.flags[k] || (EVENT_FLAGS[run.event || lo.event] || ["checkinQR", "catering", "speakerCare", "backupSpeaker", "provaTecnica", "cocTeam"]).includes(k));
    $("#screen-loadout").innerHTML = `
      <div class="sheet">
        ${LANYARD}
        <div class="eyebrow">${esc(t("ui.lo.eyebrow", { chapter: run.chapter || "" }).replace(/\s*·\s*$/, ""))} · ${ev.icon} ${esc(t("events." + (run.event || lo.event) + ".name"))}</div>
        <h2>${esc(t("ui.lo.title"))}</h2>
        <h3>🎯 ${esc(t("ui.lo.goals"))}</h3>
        <div class="goals-list">${(ev.goals || []).map((g) => `<div class="goal"><span class="ico">${DF.GOALS[g.id]}</span><span>${esc(DF.Game.goalText(g))}</span></div>`).join("")}</div>
        <div class="stats">
          <div class="stat"><b>${esc(t("ui.lo.people", { n: lo.attendees }))}</b><span>${esc(t("ui.lo.peopleSub", { rsvp: lo.rsvp, pct: Math.round(lo.showRate * 100) }))}</span></div>
          <div class="stat"><b>${lo.volunteers}</b><span>${esc(t("ui.lo.vols"))}</span></div>
          <div class="stat"><b>${Math.round(lo.energy)}</b><span>${esc(t("ui.lo.energy"))}</span></div>
          <div class="stat"><b>${lo.budget < 0 ? "−" : ""}${Math.abs(Math.round(lo.budget))} €</b><span>${esc(t("ui.lo.budget"))}</span></div>
          <div class="stat"><b>${DF.fmtDec(1 + 4 * lo.satStart / 100)}</b><span>${esc(t("ui.lo.sat"))}</span></div>
        </div>
        <h3>${esc(t("ui.lo.staff"))}</h3>
        <div class="loadout">${run.players.map((p) => `<div class="lo-item"><img src="${spriteSrc(castSprite(p.role, run.cast))}" alt=""><span>${p.name ? esc(p.name) + " · " : ""}${esc(t("roles." + p.role + ".name"))}${p.ctrl === "bot" ? " 🤖" : p.ctrl === "remote" ? " 🌐" : ""}</span></div>`).join("")}${lo.volunteers ? `<div class="lo-item"><img src="${spriteSrc("volunteer")}" alt=""><span>×${lo.volunteers} ${esc(t("ui.lo.vols"))}</span></div>` : ""}</div>
        <h3>${esc(t("ui.lo.box"))}</h3>
        <div class="loadout">${Object.keys(DF.TOOLS).map((x) => `<div class="lo-item ${lo.tools[x] ? "" : "off"}"><span class="ico">${DF.TOOLS[x].icon}</span><span>${esc(t("tools." + x + ".name"))}</span></div>`).join("")}</div>
        <h3>${esc(t("ui.lo.prep"))}</h3>
        <div class="loadout">${relevant.map(([k, ico]) => `<div class="lo-item ${lo.flags[k] ? "" : "off"}"><span class="ico">${ico}</span><span>${esc(t("ui.flags." + k))}</span></div>`).join("")}</div>
        ${(() => { const pk = Object.keys(activePerks()); return pk.length && run.mode !== "online" ? `<h3>🧰 ${esc(t("ui.kit.title"))}</h3><div class="loadout">${pk.map((id) => `<div class="lo-item"><span class="ico">${DF.PERKS[id].icon}</span><span>${esc(t("perks." + id + ".name"))}</span></div>`).join("")}</div>` : ""; })()}
        <p>💡 ${esc(t("ui.lo.controls"))}${DF.storage.get("ovb_relax", false) && run.mode !== "online" ? " · 🌿 " + esc(t("ui.setup.relax")) : ""}</p>
        <div class="row end">${opts.guest ? `<p>${esc(t("ui.lo.wait"))}</p>` : `<button class="btn ghost" id="l-menu">${esc(t("ui.pause.menu"))}</button><button class="btn go" id="l-go" data-autofocus>${esc(t("ui.lo.go"))} →</button>`}</div>
      </div>`;
    const menu = $("#l-menu");
    if (menu) menu.onclick = () => DF.Game.quitToTitle();
    const go = $("#l-go");
    if (go) go.onclick = () => { DF.Audio.unlock(); DF.Audio.play("stamp"); run.ai = U.aiKit || run.ai; DF.Game.startDay(run); };
  }

  // ---------------------------------------------------------------- pause
  function renderPause() {
    $("#screen-pause").innerHTML = `
      <div class="sheet narrow">
        <div class="eyebrow">${esc(t("ui.pause.title"))}</div>
        <h2>☕ ${esc(t("ui.pause.title"))}</h2>
        <p>${esc(t("ui.pause.text"))}</p>
        <div class="row">
          <button class="btn go" id="z-resume" data-autofocus>${esc(t("ui.pause.resume"))}</button>
          <button class="btn ghost" id="z-restart">${esc(t("ui.pause.restart"))}</button>
          <button class="btn ghost" id="z-help">${esc(t("ui.pause.help"))}</button>
          <button class="btn ghost" id="z-mute">${esc(DF.Audio.muted ? t("ui.pause.audioOff") : t("ui.pause.audioOn"))}</button>
          <button class="btn ghost" id="z-coach">${esc(DF.Coach.on ? t("ui.pause.coachOn") : t("ui.pause.coachOff"))}</button>
          <button class="btn ghost" id="z-menu">${esc(t("ui.pause.menu"))}</button>
        </div>
      </div>`;
    $("#z-resume").onclick = () => DF.Game.setPaused(false);
    $("#z-restart").onclick = () => DF.Game.startDay(Object.assign({}, DF.Game.run, { seed: null }));
    $("#z-mute").onclick = () => { DF.Audio.setMuted(!DF.Audio.muted); renderPause(); };
    $("#z-coach").onclick = () => { DF.Coach.setOn(!DF.Coach.on); renderPause(); };
    $("#z-help").onclick = () => { renderHelp(); show("help"); };
    $("#z-menu").onclick = () => DF.Game.quitToTitle();
  }

  // ---------------------------------------------------------------- retro
  function cityOf(run) { return run.city || String(run.chapter || "").replace(/^(GDG|GDSC|WTM)\s+/i, ""); }

  function headline(sum, run) {
    const vars = { ev: t("events." + sum.event + ".name"), city: cityOf(run), present: sum.present, ontime: sum.stats.talksOnTime, fb: DF.fmtDec(sum.feedback) };
    const tier = sum.feedback >= 4.4 ? 3 : sum.feedback >= 3.7 ? 2 : sum.feedback >= 3 ? 1 : 0;
    const key = tier >= 2 && sum.present < DF.EVENTS[sum.event].attendees * 0.6 ? "few" : "h" + tier;
    let [h, sub] = t("retro." + key);
    if (!vars.city) h = t("retro.anon." + key); // no chapter or city: the same news, without the place
    const fill = (x) => String(x).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return [fill(h), fill(sub)];
  }

  function lessons(sum, s) {
    const out = [];
    const b = sum.stats.byType, F = s.fl || {}, T = (s.lo && s.lo.tools) || {};
    const L = (key, score, vars, src) => { const [ti, d] = t("lessons." + key); out.push({ score, t: ti, d: String(d).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m)), src }); };
    const esc2 = (k) => (b[k] ? b[k].escalated : 0), imp = (k) => (b[k] ? b[k].improvised : 0), sp = (k) => (b[k] ? b[k].spawned : 0);
    if (esc2("hdmi") + imp("hdmi") > 0) L(T.adattatori ? "hdmiStage" : "hdmiKit", 3 + esc2("hdmi") * 2, { n: sp("hdmi") }, ["dayof"]);
    if (esc2("speaker") > 0 || sum.stats.talksLate > 2) L("speakers", 3 + esc2("speaker") * 2, null, ["quarksummit"]);
    if (sum.stats.talksCancelled > 0 && !F.backupSpeaker) L("backup", 4 + sum.stats.talksCancelled, null, ["quark", "zasadnyy"]);
    if (sum.maxQueue > 28) L("queue", 2 + sum.maxQueue / 15, { n: sum.maxQueue }, ["bevycheckin", "pk"]);
    if (esc2("wifi") > 0) L("wifi", 3 + esc2("wifi") * 2, null, ["wifi"]);
    if (sum.stats.lunchLate) L("lunch", 4, null, ["noshow", "davekiss"]);
    if (esc2("coc") > 0) L("coc", 9, null, ["gdgcoc", "pycon"]);
    else if (sp("coc") > 0 && F.cocTeam) L("cocOk", 1.5, null, ["gdgcoc"]);
    if (sum.stats.burnouts > 0) L("burnout", 5 + sum.stats.burnouts, null, ["davekiss", "strangeloop"]);
    if (esc2("tavoli") > 0) L("tavoli", 3, null, ["zasadnyy"]);
    if (sum.stats.delegated === 0 && s.vols && s.vols.length > 0) L("delegate", 2.5, null, ["zasadnyy"]);
    if (!s.vols || s.vols.length === 0) L("novols", 4, null, ["zasadnyy"]);
    if (esc2("overflow") > 0) L("overflow", 2.5, null, ["noshow"]);
    if (sum.stats.murphySabotage > 0) L("murphy", 1.5, null, ["zasadnyy"]);
    if (sum.event === "devfest" && sum.left > sum.attendees * 0.15 && !F.raffle) L("afternoon", 2, { n: sum.left }, ["hamptonroads"]);
    const ev = DF.EVENTS[sum.event];
    if (sum.present < ev.attendees * 0.72) L("turnout", 4.5, { n: sum.present }, ["quark", "noshow"]);
    if (sum.stats.chatIgnored >= 3) L("chat", 2 + sum.stats.chatIgnored * 0.6, { n: sum.stats.chatIgnored }, ["zasadnyy"]);
    if (sum.stats.interrupts >= 8) L("interrupt", 2, { n: sum.stats.interrupts }, ["dayof"]);
    if (esc2("kid") > 0) L("kids", 4 + esc2("kid") * 2, null, ["childcare"]);
    if (esc2("access") > 0 || (sp("access") > 0 && !F.accessRoute)) L("access", 4 + esc2("access") * 2, null, ["sigaccess"]);
    if (sp("foto") >= 2 && !F.photoLanyards) L("photo", 2 + sp("foto") * 0.5, null, ["lanyards", "mozlanyards"]);
    if (esc2("mentor") >= 2) L("mentors", 3 + esc2("mentor"), null, ["mlhguide"]);
    if (sum.event === "hack" && sum.stats.burnouts > 0 && !F.restArea) L("night", 5, null, ["mlhguide"]);
    if (sum.event === "hack" && !F.judgingRules) L("rules", 2.5, null, ["hackguide"]);
    out.sort((a, c) => c.score - a.score);
    if (!out.length) L("clean", 1, null, ["zasadnyy"]);
    return out.slice(0, 3);
  }

  function saveProgress(sum) {
    const prog = progress();
    if (sum.soldout) {
      const p = prog[sum.event] || { stars: 0, fb: 0, goals: [] };
      if (!(p.hard >= sum.stars)) { p.hard = sum.stars; prog[sum.event] = p; DF.storage.set("ovb_progress", prog); }
      return false;
    }
    const cur = prog[sum.event];
    if (!cur || sum.stars > cur.stars || (sum.stars === cur.stars && sum.feedback > cur.fb)) { prog[sum.event] = Object.assign({}, cur, { stars: sum.stars, fb: sum.feedback, goals: (sum.goals || []).map((g) => g.ok) }); DF.storage.set("ovb_progress", prog); }
    const best = DF.storage.get("ovb_best", null);
    const isBest = !best || sum.feedback > best.feedback + 1e-6;
    if (isBest) DF.storage.set("ovb_best", { feedback: sum.feedback, score: sum.score });
    return isBest;
  }

  // ------------------------------------------------------------- medals
  // across days and devices (the account syncs ovb_medals): what the day proved
  const MEDALS = [
    ["chat0", "💬", (sum) => sum.stats.chatIgnored === 0 && sum.stats.chatAnswered >= 3],
    ["speakers", "🧭", (sum) => sum.stats.talksCancelled === 0 && !((sum.stats.byType.speaker || {}).escalated) && sum.stats.talksTotal >= 3],
    ["onTime", "⏱️", (sum) => sum.stats.talksTotal >= 3 && sum.stats.talksOnTime === sum.stats.talksTotal],
    ["rushAll", "⚡", (sum) => sum.stats.rushTotal >= 2 && sum.stats.rushWon === sum.stats.rushTotal],
    ["prevent", "🔮", (sum) => sum.stats.prevented >= 5],
    ["murphy", "😈", (sum) => sum.stats.murphyCaught >= 2],
    ["team", "👉", (sum) => (sum.stats.orders || 0) + sum.stats.delegated >= 8],
    ["ability", "✨", (sum) => (sum.stats.abilities || 0) >= 4],
    ["noBurnout", "🧘", (sum) => (sum.event === "hack" || sum.event === "devfest") && sum.stats.burnouts === 0],
    ["devfest3", "🏆", (sum) => sum.event === "devfest" && sum.stars === 3 && !sum.soldout],
    ["soldout3", "🔥", (sum) => sum.soldout && sum.stars === 3],
    ["weekly", "📅", (sum, run) => !!run.weekly],
    ["season", "🎟️", () => DF.EVENT_ORDER.every((id) => ((progress()[id] || {}).stars || 0) >= 1)],
  ];
  const medals = () => DF.storage.get("ovb_medals", {}) || {};
  function earnMedals(sum, run) {
    const have = medals(), fresh = [];
    for (const [id, , test] of MEDALS) if (!have[id] && test(sum, run)) { have[id] = new Date().toISOString().slice(0, 10); fresh.push(id); }
    if (fresh.length) DF.storage.set("ovb_medals", have);
    return fresh;
  }
  function medalChips(only) {
    const have = medals();
    return MEDALS.filter(([id]) => !only || only.includes(id)).map(([id, icon]) => {
      const [name, how] = t("medals." + id);
      return `<span class="medal ${have[id] ? "on" : ""}" title="${esc(name + ": " + how)}"><i>${icon}</i>${esc(name)}</span>`;
    }).join("");
  }

  function showRetro(s, sum, run, opts) {
    opts = opts || {};
    DF.Game.phase = "retro";
    document.body.classList.remove("in-day");
    const wasLocked = DF.EVENT_ORDER.map((id) => !unlocked(id));
    const isBest = opts.guest ? false : saveProgress(sum);
    const fresh = opts.guest ? [] : earnMedals(sum, run);
    const nowUnlocked = DF.EVENT_ORDER.find((id, i) => wasLocked[i] && unlocked(id));
    const [h, sub] = headline(sum, run);
    const ls = lessons(sum, s);
    const st = sum.stats;
    const log = (DF.Game.log || []).slice(-14);
    const qs = t("retro.q").slice(0, 3);
    if (st.burnouts) qs.unshift(t("retro.qBurnout"));
    if (st.chatIgnored >= 2) qs.unshift(t("retro.qChat"));
    U.retro = { sum, run, ls, gazette: opts.gazette || null };
    const idx = DF.EVENT_ORDER.indexOf(sum.event);
    const nextEv = DF.EVENT_ORDER[idx + 1];
    const stamp = "★".repeat(sum.stars) + "☆".repeat(3 - sum.stars);
    $("#screen-retro").innerHTML = `
      <div class="sheet">
        <div class="gazette" id="gazette">
          <div class="mast"><b id="g-paper">${esc(t("ui.retro.paper"))}</b><span>${run.chapter ? esc(run.chapter) + " · " : ""}${esc(t("events." + sum.event + ".name"))}${sum.soldout ? " · 🔥 " + esc(t("ui.setup.soldout")) : ""}</span></div>
          <h2 id="g-head">${esc(h)}</h2>
          <p class="sub" id="g-sub">${esc(sub)}</p>
          <p class="article" id="g-article">${DF.AI.available && !opts.guest ? `<span class="wait">✨ ${esc(t("ui.retro.aiWriting"))}</span>` : ""}</p>
          <span class="stamp small ${sum.stars ? "ok" : "no"}">${stamp}</span>
        </div>
        <div class="row" style="justify-content:space-between">
          <div class="score"><span class="big">${DF.fmtDec(sum.feedback)}/5</span><p>${esc(t("ui.retro.points", { n: sum.score }))}${isBest ? " · " + esc(t("ui.retro.record")) : ""}${nowUnlocked ? " · 🔓 " + esc(t("ui.retro.unlocked", { ev: t("events." + nowUnlocked + ".name") })) : ""}</p></div>
          <div class="row">${opts.guest ? `<button class="btn ghost" id="r-menu">${esc(t("ui.retro.leave"))}</button>` : `<button class="btn ghost" id="r-menu">${esc(t("ui.retro.menu"))}</button><button class="btn ghost" id="r-again">${esc(t("ui.retro.again"))}</button>${run.weekly ? `<button class="btn go" id="r-weekly">📅 ${esc(t("ui.weekly.stub"))} →</button>` : nextEv && unlocked(nextEv) && run.mode !== "online" ? `<button class="btn go" id="r-next">${esc(t("ui.retro.next"))}: ${esc(t("events." + nextEv + ".name"))} →</button>` : `<button class="btn go" id="r-season">${esc(t("ui.retro.season"))} →</button>`}`}</div>
        </div>
        <div class="goal-stamps">${(sum.goals || []).map((g) => `<div class="gstamp"><span class="ico">${DF.GOALS[g.id]}</span><span class="gt">${esc(DF.Game.goalText(g))}</span><span class="stamp small ${g.ok ? "ok" : "no"}">${esc(g.ok ? t("ui.retro.goalOk") : t("ui.retro.goalNo"))}</span></div>`).join("")}</div>
        ${fresh.length ? `<div class="medals-new"><b>🏅 ${esc(t(fresh.length > 1 ? "ui.medals.newMany" : "ui.medals.new"))}</b><div class="medals">${medalChips(fresh)}</div></div>` : ""}
        ${!opts.guest && starsFree() > 0 && run.mode !== "online" ? `<div class="kit-call"><span>🧰 ${esc(t("ui.kit.spend", { n: starsFree() }))}</span><button class="btn small" id="r-kit">${esc(t("ui.kit.open"))}</button></div>` : ""}
        <div class="stats">
          <div class="stat"><b>${sum.present}</b><span>${esc(t("ui.retro.present"))}</span></div>
          <div class="stat"><b>${st.talksOnTime}/${st.talksTotal}</b><span>${esc(t("ui.retro.onTime"))}</span></div>
          <div class="stat"><b>${st.fixed}</b><span>${esc(t("ui.retro.fixed"))}</span></div>
          <div class="stat"><b>${st.prevented}</b><span>${esc(t("ui.retro.prevented"))}</span></div>
          <div class="stat"><b>${st.escalated}</b><span>${esc(t("ui.retro.escaped"))}</span></div>
          <div class="stat"><b>${st.chatAnswered}/${st.chatAnswered + st.chatIgnored}</b><span>${esc(t("ui.retro.chat"))}</span></div>
          ${st.rushTotal ? `<div class="stat"><b>${st.rushWon}/${st.rushTotal}</b><span>⚡ ${esc(t("ui.retro.rush"))}</span></div>` : ""}
        </div>
        <div class="two">
          <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
            <h3>${esc(t("ui.retro.feel"))}</h3>
            <div class="feel" role="group">${t("ui.retro.feels").map((f) => `<button aria-pressed="${U.feel === f}" data-feel="${esc(f)}">${esc(f)}</button>`).join("")}</div>
            <h3>${esc(t("ui.retro.moments"))}</h3>
            <div class="timeline">${log.length ? log.map((e) => `<div class="tl"><time>${esc(e.clock)}</time><span class="dot" style="background:${e.color}"></span><span>${esc(e.text)}</span></div>`).join("") : `<p>${esc(t("ui.retro.quiet"))}</p>`}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
            <h3>${esc(t("ui.retro.lessons"))}</h3>
            ${ls.map((l) => `<div class="lesson"><b>${esc(l.t)}</b><p>${esc(l.d)}</p><span class="src">${(l.src || []).map((k) => DF.SOURCES[k] ? `<a href="${esc(DF.SOURCES[k].u)}" target="_blank" rel="noopener">${esc(DF.SOURCES[k].t)}</a>` : "").join(" · ")}</span></div>`).join("")}
            <div class="coach" id="g-coach" ${DF.AI.available ? "" : "hidden"}></div>
          </div>
        </div>
        <div class="two">
          <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
            <h3>${esc(t("ui.retro.group"))}</h3>
            <ul style="margin:0;padding-left:18px;color:var(--muted);line-height:1.6;font-size:14px">${qs.slice(0, 4).map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
            <h3>${esc(t("ui.retro.commit"))}</h3>
            <div class="field"><textarea id="r-commit" rows="2" maxlength="200" placeholder="${esc(t("ui.retro.commitPh"))}"></textarea></div>
            <div class="row"><button class="btn small" id="r-copy">📋 ${esc(t("ui.retro.copy"))}</button><span id="r-copied" class="record" hidden>${esc(t("ui.retro.copied"))}</span></div>
          </div>
        </div>
      </div>`;
    show("retro");
    DF.Audio.play("stamp");
    const root = $("#screen-retro");
    root.querySelectorAll("[data-feel]").forEach((b) => { b.onclick = () => { U.feel = b.dataset.feel; root.querySelectorAll("[data-feel]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.feel === U.feel)); }; });
    $("#r-menu").onclick = () => DF.Game.quitToTitle();
    const rk = $("#r-kit");
    if (rk) rk.onclick = () => { renderKit("retro"); show("kit"); };
    const again = $("#r-again"), nx = $("#r-next"), season = $("#r-season");
    if (again) again.onclick = () => {
      if (opts.host && DF.Online.active) { DF.Game.startDay(Object.assign({}, run, { seed: null })); return; }
      if (U.prep && run.event === U.prep.event && !U.setup.quick && !run.weekly) startPrep(); else DF.Game.startDay(Object.assign({}, run, { seed: null }));
    };
    if (nx) nx.onclick = () => { U.setup.event = nextEv; U.setup.quick = false; renderSetup(); show("setup"); };
    const wk = $("#r-weekly"); if (wk) wk.onclick = () => { renderWeekly(); show("weekly"); };
    if (season) season.onclick = () => { if (opts.host && DF.Online.active) { DF.Online.renderLobby(); show("lobby"); return; } renderSeason("season"); show("season"); };
    $("#r-copy").onclick = () => {
      const text = summaryText(sum, run, ls);
      const done = () => { $("#r-copied").hidden = false; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
      else fallbackCopy(text, done);
    };
    // the newspaper, written by Gemini from what really happened
    const fillGazette = (g) => {
      if (!g || !$("#g-head")) return;
      U.retro.gazette = g;
      if (g.paper) $("#g-paper").textContent = g.paper;
      $("#g-head").textContent = g.headline; $("#g-sub").textContent = g.sub; $("#g-article").textContent = g.article;
      if (g.coach) { const c = $("#g-coach"); c.hidden = false; c.innerHTML = "<b>🧑‍🏫 " + esc(t("ui.retro.coach")) + ":</b> " + esc(g.coach); }
      if (opts.host && DF.Online.active) DF.Online.hostGazette(g);
    };
    if (opts.gazette) fillGazette(opts.gazette);
    else if (DF.AI.available && !opts.guest) {
      DF.AI.gazette({
        event: sum.event, chapter: run.chapter, city: cityOf(run),
        stats: { feedback: +sum.feedback.toFixed(1), stars: sum.stars, present: sum.present, onTime: st.talksOnTime + "/" + st.talksTotal, escaped: st.escalated, prevented: st.prevented, chatIgnored: st.chatIgnored, burnouts: st.burnouts, murphyCaught: st.murphyCaught, firedrills: st.firedrills, dogs: st.dogCaught, interviews: st.pressDone },
        log: log.map((e) => e.clock + " " + e.text),
      }).then((g) => { if (g) fillGazette(g); else { const a = $("#g-article"); if (a) a.textContent = ""; } });
    }
  }

  function summaryText(sum, run, ls) {
    const commit = ($("#r-commit") && $("#r-commit").value.trim()) || "";
    const stars = "★".repeat(sum.stars) + "☆".repeat(3 - sum.stars);
    const lines = [
      t("ui.retro.share", { ev: t("events." + sum.event + ".name"), chapter: run.chapter || "", stars, fb: DF.fmtDec(sum.feedback), present: sum.present, ontime: sum.stats.talksOnTime + "/" + sum.stats.talksTotal }),
      U.feel ? t("ui.retro.shareFeel", { feel: U.feel }) : null,
      ls[0] ? t("ui.retro.shareLesson", { lesson: ls[0].t }) : null,
      commit ? t("ui.retro.shareCommit", { commit }) : null,
    ].filter(Boolean);
    return lines.join("\n");
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { /* nothing else to try */ }
    ta.remove();
  }

  // ----------------------------------------------------------------- help
  function renderHelp() {
    const steps = t("help.steps");
    $("#screen-help").innerHTML = `
      <div class="sheet" style="width:min(1000px,100%)">
        ${LANYARD}
        <h2>${esc(t("help.title"))}</h2>
        <div class="steps">${steps.map(([ico, b, s]) => `<div class="step"><span class="ico">${ico}</span><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>
        <p>⌨️ ${esc(t("help.keys"))}</p>
        <h3>${esc(t("help.table"))}</h3>
        <div class="ptable">${Object.entries(DF.PROBLEMS).map(([k, p]) => `<div class="prow"><span class="ico">${p.icon}</span><span><b>${esc(t("problems." + k + ".name"))}</b><span>${esc(t("problems." + k + ".how"))}</span></span></div>`).join("")}</div>
        <div class="row end"><button class="btn ghost" id="h-coach">💡 ${esc(t("ui.coach.again"))}</button><button class="btn go" id="h-back" data-autofocus>${esc(t("ui.common.ok"))}</button></div>
      </div>`;
    $("#h-back").onclick = () => show(DF.Game.phase === "day" ? "pause" : "title");
    $("#h-coach").onclick = () => { DF.Coach.reset(); $("#h-coach").textContent = "✓ " + t("ui.coach.reset"); };
  }

  // the Google Developer Groups mark (js/brand.js; the single-file build inlines it)
  function brandLogo() {
    const src = DF.BRAND && DF.BRAND.gdg;
    return src ? `<img class="gdg-logo" src="${esc(src)}" alt="Google Developer Groups">` : "";
  }

  // ---------------------------------------------------------------- about
  function renderAbout() {
    const src = Object.values(DF.SOURCES).map((s) => `<li><a href="${esc(s.u)}" target="_blank" rel="noopener" style="color:#ffe68a">${esc(s.t)}</a></li>`).join("");
    $("#screen-about").innerHTML = `
      <div class="sheet">
        ${LANYARD}
        <div class="eyebrow">OVERBOOKED!</div>
        <h2>${esc(t("about.title"))}</h2>
        <p>${esc(t("about.p1"))}</p>
        <p>${esc(t("about.p2"))}</p>
        <div class="credits">${brandLogo()}<p>${esc(t("about.credits", { author: DF.CREDITS.author + " (" + DF.CREDITS.title + ")" }))} <a href="${esc(DF.CREDITS.url)}" target="_blank" rel="noopener" style="color:#ffe68a">${esc(t("about.find"))} ↗</a></p></div>
        <p>${esc(t("about.p3"))} ${esc(t("brand.disclaimer"))}</p>
        <h3>${esc(t("about.sources"))}</h3>
        <ul style="margin:0;padding-left:18px;color:var(--muted);line-height:1.7;font-size:13px;columns:2;column-gap:28px">${src}</ul>
        <div class="row end"><button class="btn go" id="a-back" data-autofocus>${esc(t("ui.common.back"))}</button></div>
      </div>`;
    $("#a-back").onclick = () => show("title");
  }

  // ------------------------------------------------------------------- ai
  // Gemini settings: off by default; the player's own key never leaves the browser
  function renderAI(back) {
    U.aiBack = back || U.aiBack || "title";
    const A = DF.AI, info = A.keyInfo();
    const status = A.mode === "off" ? (A.canUseKey() ? t("ui.ai.statusOff") : t("ui.ai.unavailableShort"))
      : A.paused ? t("ui.ai.statusPaused")
      : A.capped ? t("ui.ai.statusCap")
      : A.mode === "key" ? t("ui.ai.statusKey", { model: A.model || "" }) : t("ui.ai.statusServer", { model: A.model || "" });
    const links = [["https://aistudio.google.com/apikey", t("ui.ai.linkStudio")], ["https://console.cloud.google.com/apis/credentials", t("ui.ai.linkConsole")], ["https://ai.google.dev/gemini-api/docs/billing", t("ui.ai.linkBilling")]];
    $("#screen-ai").innerHTML = `
      <div class="sheet" style="width:min(760px,100%)">
        ${LANYARD}
        <div class="eyebrow">✨ Gemini</div>
        <h2>${esc(t("ui.ai.title"))}</h2>
        ${A.canUseKey() ? `<div class="ai-safe" role="note"><span class="ico" aria-hidden="true">🔒</span><div><b>${esc(t("ui.ai.safeTitle"))}</b><p>${esc(t("ui.ai.safeText"))}</p></div></div>` : ""}
        <p>${esc(t("ui.ai.intro"))}</p>
        <ul class="ai-feats">${t("ui.ai.feats").map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        <div class="ai-status ${A.available ? "on" : ""}"><b>${A.available ? "●" : "○"}</b> ${esc(status)}
          ${A.mode !== "off" ? `<button class="btn small ghost" id="ai-toggle">${esc(A.paused ? t("ui.ai.enable") : t("ui.ai.disable"))}</button>` : ""}</div>
        ${A.canUseKey() ? `
        <h3>${esc(t("ui.ai.yourKey"))}</h3>
        ${info ? `<div class="row"><p class="record">🔑 ${esc(t("ui.ai.saved", { key: info.masked, where: info.remember ? t("ui.ai.whereDevice") : t("ui.ai.whereSession") }))}</p><button class="btn small ghost" id="ai-remove">${esc(t("ui.ai.remove"))}</button></div>` : ""}
        <form id="ai-form" class="row" autocomplete="off" style="align-items:flex-end">
          <div class="field grow"><label for="ai-key">${esc(t("ui.ai.keyLabel"))}</label><input id="ai-key" type="password" autocomplete="off" spellcheck="false" placeholder="••••••••••••" maxlength="200"></div>
          <button class="btn go" type="submit" id="ai-test">${esc(t("ui.ai.test"))}</button>
        </form>
        <p class="ai-stays">🔒 ${esc(t("ui.ai.stays"))}</p>
        <label class="check"><input type="checkbox" id="ai-remember"><span><b>${esc(t("ui.ai.remember"))}</b> ${esc(t("ui.ai.rememberSub"))}</span></label>
        <p id="ai-msg" class="record" aria-live="polite"></p>
        <h3>${esc(t("ui.ai.howTitle"))}</h3>
        <ol class="ai-how">${t("ui.ai.how").map((step, i) => `<li>${esc(step)} <a href="${links[i][0]}" target="_blank" rel="noopener">${esc(links[i][1])} ↗</a></li>`).join("")}</ol>
        <p class="ai-privacy">🔒 ${esc(t("ui.ai.privacy"))}</p>` : `<p>${esc(t("ui.ai.unavailable"))}</p>`}
        <div class="row end"><button class="btn go" id="ai-back" data-autofocus>${esc(t("ui.common.ok"))}</button></div>
      </div>`;
    const tg = $("#ai-toggle");
    if (tg) tg.onclick = () => { A.setEnabled(A.paused); renderAI(); };
    const rm = $("#ai-remove");
    if (rm) rm.onclick = () => { A.clearKey(); renderAI(); };
    const form = $("#ai-form");
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const input = $("#ai-key"), msg = $("#ai-msg"), btn = $("#ai-test");
      const key = input.value.trim();
      if (!key) return;
      btn.disabled = true; msg.textContent = t("ui.ai.testing");
      const r = await A.testKey(key);
      btn.disabled = false;
      if (!r.ok) { msg.textContent = "⚠️ " + t("ui.ai.err." + r.why); return; }
      A.saveKey(key, $("#ai-remember").checked, r);
      input.value = "";
      DF.Audio.play("stamp");
      renderAI();
      $("#ai-msg").textContent = "✓ " + t("ui.ai.ok", { model: r.model });
    };
    $("#ai-back").onclick = () => {
      if (U.aiBack === "title") show("title"); else show(U.aiBack);
    };
  }

  // -------------------------------------------------------------- account
  // The optional Google account: the season on every device, the chapter
  // board, the contact consent, deleting it all. Playing never needs it.
  const GLOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  function syncState() {
    const s = DF.Account.sync;
    const time = s.at ? new Date(s.at).toLocaleTimeString(DF.lang, { hour: "2-digit", minute: "2-digit" }) : "";
    return { ok: !s.err, text: s.busy || !s.at ? t("ui.acct.syncing") : s.err ? t("ui.acct.syncErr") : t("ui.acct.synced", { time }) };
  }
  function updateSync() {
    const box = $("#ac-sync"), st = syncState();
    if (!box) return;
    box.classList.toggle("on", st.ok);
    box.querySelector("b").textContent = st.ok ? "●" : "!";
    box.querySelector("span").textContent = st.text;
  }
  function boardNote() {
    const A = DF.Account, ch = A.cleanName(U.setup.chapter);
    if (!(A.doc && A.doc.lb)) return "";
    if (!ch) return t("ui.acct.boardNoName");
    return A.isChapter(ch) ? t("ui.acct.boardLive", { chapter: ch }) : t("ui.acct.boardPending");
  }
  function delBox() {
    const A = DF.Account;
    if (A.needReauth) return `<p>${esc(t("ui.acct.reauth"))}</p><div class="row"><button class="btn red" id="ac-reauth">${esc(t("ui.acct.reauthBtn"))}</button></div>`;
    if (U.delAsk) return `<p>${esc(t("ui.acct.deleteSure"))}</p><div class="row"><button class="btn ghost" id="ac-delno">${esc(t("ui.acct.deleteNo"))}</button><button class="btn red" id="ac-delyes" ${A.busy ? "disabled" : ""}>${esc(t("ui.acct.deleteYes"))}</button></div>`;
    return `<p>${esc(t("ui.acct.deleteText"))}</p><div class="row"><button class="btn ghost small" id="ac-del">${esc(t("ui.acct.delete"))}</button></div>`;
  }
  function wireDel() {
    const A = DF.Account, box = $("#ac-delbox");
    if (!box) return;
    const again = () => { box.innerHTML = delBox(); wireDel(); };
    const d = $("#ac-del"); if (d) d.onclick = () => { U.delAsk = true; again(); };
    const no = $("#ac-delno"); if (no) no.onclick = () => { U.delAsk = false; again(); };
    const yes = $("#ac-delyes");
    if (yes) yes.onclick = () => { yes.disabled = true; A.deleteAccount().then((ok) => { if (ok) { U.delAsk = false; U.acctNote = t("ui.acct.deleted"); } renderAccount(); }); };
    const ra = $("#ac-reauth");
    if (ra) ra.onclick = () => { A.reauthAndDelete().then((ok) => { U.delAsk = false; if (ok) U.acctNote = t("ui.acct.deleted"); renderAccount(); }); };
  }

  function renderAccount(back) {
    U.acctBack = back || U.acctBack || "title";
    const A = DF.Account, u = A.user;
    if (A.available && !A.ready) A.prepare();
    const err = A.error ? `<p class="acct-err" role="alert">⚠️ ${esc(t("ui.acct.err." + A.error))}</p>` : "";
    const privacy = `<p class="ai-privacy">🔒 ${esc(t("ui.acct.privacyNote"))} <button class="linkbtn" id="ac-privacy">${esc(t("ui.privacy.link"))}</button></p>`;
    let body;
    if (!A.available) body = `<p>${esc(t("ui.acct.unavailable"))}</p>`;
    else if (!u) {
      body = `
        <div class="ai-safe" role="note"><span class="ico" aria-hidden="true">🎟️</span><div><b>${esc(t("ui.acct.freeTitle"))}</b><p>${esc(t("ui.acct.freeText"))}</p></div></div>
        <ul class="ai-feats">${t("ui.acct.feats").map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        ${U.acctNote ? `<p class="record">✓ ${esc(U.acctNote)}</p>` : ""}
        <button class="gsi" id="ac-in" ${A.ready && !A.busy ? "" : "disabled"}>${GLOGO}<span>${esc(A.ready ? t("ui.acct.signIn") : t("ui.acct.loading"))}</span></button>
        ${err}${privacy}`;
    } else {
      const st = syncState();
      body = `
        <div class="ai-status ${st.ok ? "on" : ""}" id="ac-sync"><b>${st.ok ? "●" : "!"}</b> <span>${esc(st.text)}</span><button class="btn small ghost" id="ac-out">${esc(t("ui.acct.signOut"))}</button></div>
        <p class="record">${esc(t("ui.acct.as", { email: u.email || "—" }))}</p>
        <h3>🏆 ${esc(t("ui.acct.boardTitle"))}</h3>
        <div class="field"><label for="ac-chapter">${esc(t("ui.setup.chapter"))}</label><input id="ac-chapter" maxlength="40" value="${esc(U.setup.chapter)}" placeholder="${esc(t("ui.setup.chapterPh"))}"></div>
        <label class="check"><input type="checkbox" id="ac-board" ${A.doc && A.doc.lb ? "checked" : ""}><span><b>${esc(t("ui.acct.boardOn"))}</b> ${esc(t("ui.acct.boardOnSub", { n: A.starsOf(progress()) }))}</span></label>
        <p class="record" id="ac-boardmsg">${esc(boardNote())}</p>
        <h3>✉️ ${esc(t("ui.acct.contactTitle"))}</h3>
        <label class="check"><input type="checkbox" id="ac-consent" ${A.consent && A.consent.ok ? "checked" : ""}><span><b>${esc(t("ui.acct.consent"))}</b> ${esc(t("ui.acct.consentSub"))}</span></label>
        ${err}
        <h3>${esc(t("ui.acct.deleteTitle"))}</h3>
        <div class="acct-del" id="ac-delbox">${delBox()}</div>
        ${privacy}`;
    }
    $("#screen-account").innerHTML = `
      <div class="sheet" style="width:min(720px,100%)">
        ${LANYARD}
        <div class="eyebrow">👤 ${esc(t("ui.acct.eyebrow"))}</div>
        <h2>${esc(u ? t("ui.acct.hello", { name: firstName(u.name) || "👋" }) : t("ui.acct.title"))}</h2>
        ${body}
        <div class="row end">${A.boardAvailable ? `<button class="btn ghost" id="ac-boardbtn">🏆 ${esc(t("ui.board.short"))}</button>` : ""}<button class="btn go" id="ac-back" data-autofocus>${esc(t("ui.common.back"))}</button></div>
      </div>`;
    $("#ac-back").onclick = () => {
      U.delAsk = false; U.acctNote = null; A.error = null;
      if (U.acctBack === "board") { renderBoard(); show("board"); }
      else if (U.acctBack === "privacy") { renderPrivacy(); show("privacy"); }
      else show("title");
    };
    const pv = $("#ac-privacy"); if (pv) pv.onclick = () => { renderPrivacy("account"); show("privacy"); };
    const bb = $("#ac-boardbtn"); if (bb) bb.onclick = () => { renderBoard("account"); show("board"); };
    const sin = $("#ac-in"); if (sin) sin.onclick = () => { U.acctNote = null; A.signIn(); };
    const out = $("#ac-out"); if (out) out.onclick = () => { out.disabled = true; A.signOut(); };
    const msg = () => { const m = $("#ac-boardmsg"); if (m) m.textContent = boardNote(); };
    const ch = $("#ac-chapter");
    if (ch) ch.onchange = () => { const v = ch.value.trim(); U.setup.chapter = v; DF.storage.set("ovb_chapter", v); msg(); };
    const bx = $("#ac-board"); if (bx) bx.onchange = () => { A.setBoard(bx.checked); msg(); };
    const cs = $("#ac-consent"); if (cs) cs.onchange = () => { cs.disabled = true; A.setConsent(cs.checked); };
    wireDel();
  }

  // ---------------------------------------------------------------- board
  // The chapters' season, from /api/board (refreshed every few minutes)
  function renderBoard(back) {
    U.boardBack = back || U.boardBack || "title";
    const A = DF.Account;
    const mine = A.status === "in" && A.doc && A.doc.lb ? A.slug(U.setup.chapter) : "";
    $("#screen-board").innerHTML = `
      <div class="sheet" style="width:min(720px,100%)">
        ${LANYARD}
        <div class="eyebrow">🏆 ${esc(t("ui.board.eyebrow"))}</div>
        <h2>${esc(t("ui.board.title"))}</h2>
        <p>${esc(t("ui.board.intro"))}</p>
        <ol class="board" id="bd-list" aria-live="polite"><li class="wait">${esc(t(A.boardAvailable ? "ui.board.loading" : "ui.board.unavailable"))}</li></ol>
        <p class="record" id="bd-meta"></p>
        <div class="row end">${A.available ? `<button class="btn ghost" id="bd-join">${esc(t(A.status === "in" ? "ui.board.mine" : "ui.board.join"))}</button>` : ""}<button class="btn go" id="bd-back" data-autofocus>${esc(t("ui.common.back"))}</button></div>
      </div>`;
    $("#bd-back").onclick = () => { if (U.boardBack === "account") { renderAccount(); show("account"); } else show("title"); };
    const j = $("#bd-join"); if (j) j.onclick = () => { renderAccount("board"); show("account"); };
    if (!A.boardAvailable) return;
    A.board().then((b) => {
      const list = $("#bd-list");
      if (!list) return;
      list.innerHTML = b.rows.length
        ? b.rows.map((r, i) => `<li class="${mine && A.slug(r.n) === mine ? "me" : ""}"><span class="rk">${i + 1}</span><b>${esc(r.n)}</b><span class="n">👥 ${Number(r.p) || 0}</span><span class="s">⭐ ${Number(r.s) || 0}</span></li>`).join("")
        : `<li class="wait">${esc(t("ui.board.empty"))}</li>`;
      $("#bd-meta").textContent = b.rows.length ? t("ui.board.meta", { chapters: b.chapters, players: b.players }) : "";
    }, () => { const list = $("#bd-list"); if (list) list.innerHTML = `<li class="wait">${esc(t("ui.board.error"))}</li>`; });
  }

  // -------------------------------------------------------------- privacy
  function renderPrivacy(back) {
    U.privBack = back || U.privBack || "title";
    const S = DF.Stats;
    const notWeb = !/^https?:$/.test(location.protocol) || !!window.DF_NO_STATS;
    const contact = (window.DF_FIREBASE && window.DF_FIREBASE.privacyContact) || "https://www.linkedin.com/in/nicola-guglielmi/";
    const sec = (k) => `<h3>${esc(t("ui.privacy." + k + "Title"))}</h3><p>${esc(t("ui.privacy." + k + "Text"))}</p>`;
    $("#screen-privacy").innerHTML = `
      <div class="sheet" style="width:min(760px,100%)">
        ${LANYARD}
        <div class="eyebrow">🔒 ${esc(t("ui.privacy.eyebrow"))}</div>
        <h2>${esc(t("ui.privacy.title"))}</h2>
        <p>${esc(t("ui.privacy.intro"))}</p>
        ${sec("stats")}
        ${S.blocked ? `<p class="record">${esc(t(notWeb ? "ui.privacy.statsOff" : "ui.privacy.statsDnt"))}</p>` : `<label class="check"><input type="checkbox" id="pv-stats" ${S.on ? "checked" : ""}><span><b>${esc(t("ui.privacy.statsOn"))}</b> ${esc(t("ui.privacy.statsOnSub"))}</span></label>`}
        ${sec("play")}
        ${sec("logs")}
        ${sec("acct")}
        ${sec("rooms")}
        ${sec("ai")}
        ${sec("who")}
        <p>${esc(t("ui.privacy.contact"))} ${/^https?:\/\//.test(contact) ? `<a href="${esc(contact)}" target="_blank" rel="noopener" style="color:#ffe68a">${esc(contact.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : `<b>${esc(contact)}</b>`}</p>
        <p class="record">${esc(t("ui.privacy.updated", { date: new Date(2026, 9, 7).toLocaleDateString(DF.lang) }))}</p>
        <div class="row end">${DF.Account.available ? `<button class="btn ghost" id="pv-acct">👤 ${esc(t("ui.acct.eyebrow"))}</button>` : ""}<button class="btn go" id="pv-back" data-autofocus>${esc(t("ui.common.back"))}</button></div>
      </div>`;
    const sw = $("#pv-stats"); if (sw) sw.onchange = () => S.setOn(sw.checked);
    const pa = $("#pv-acct"); if (pa) pa.onclick = () => { renderAccount("privacy"); show("account"); };
    $("#pv-back").onclick = () => { if (U.privBack === "account") { renderAccount(); show("account"); } else show("title"); };
  }

  // the account brought the season from another device: reload what the screens keep
  function syncFromStorage() {
    U.setup.chapter = DF.storage.get("ovb_chapter", U.setup.chapter);
    U.setup.city = DF.storage.get("ovb_city", U.setup.city);
    installMyCards();
    if (U.current === "title" || U.current === "season" || U.current === "kit") rerender();
  }

  // --------------------------------------------------------------- weekly
  // The same day for everyone, all week; the Chapter Cup adds each chapter's best three
  const WEEKLY = "ovb_weekly";
  const weeklyBest = (w) => { const r = DF.storage.get(WEEKLY, null); return r && r.week === w ? r : null; };
  function renderWeekly() {
    const W = DF.Weekly, w = W.weekOf(), role = U.weeklyRole || (U.setup.players[0] && U.setup.players[0].role) || "lead";
    const su = W.setup(w, role), ev = DF.EVENTS[su.event], best = weeklyBest(w);
    $("#screen-weekly").innerHTML = `
      <div class="sheet" style="width:min(820px,100%)">
        ${LANYARD}
        <div class="eyebrow">📅 ${esc(t("ui.weekly.eyebrow", { week: w.slice(5) }))}</div>
        <h2>${ev.icon} ${esc(t("events." + su.event + ".name"))}</h2>
        <p>${esc(t("ui.weekly.rules"))}</p>
        <div class="roles">${Object.keys(DF.ROLES).map((r) => `<button class="rolecard" data-wrole="${r}" aria-pressed="${role === r}" style="--rc:${DF.ROLES[r].color}"><img src="${spriteSrc(castSprite(r, DF.castFor(su.seed)))}" alt=""><b>${esc(t("roles." + r + ".name"))}</b></button>`).join("")}</div>
        <p>${esc(t("roles." + role + ".blurb"))} ${DF.Render.ABILITY_ICON[role]} ${esc(t("abilities." + role)[0])}.</p>
        <div class="row" style="align-items:flex-end">
          <div class="field grow"><label for="wk-chapter">${esc(t("ui.weekly.for"))}</label><input id="wk-chapter" maxlength="40" value="${esc(U.setup.chapter)}" placeholder="${esc(t("ui.setup.chapterPh"))}"></div>
          <button class="btn go" id="wk-go" data-autofocus>${esc(t("ui.weekly.play"))} →</button>
        </div>
        <p class="record">${best ? esc(t("ui.weekly.best", { n: best.score })) + (best.verified ? " ✓" : "") : esc(t("ui.weekly.noBest"))}</p>
        <h3>🏆 ${esc(t("ui.weekly.cup"))}</h3>
        <p>${esc(t("ui.weekly.cupNote"))}</p>
        <ol class="board" id="wk-cup"><li class="wait">${esc(t(DF.Account.net ? "ui.board.loading" : "ui.weekly.cupOff"))}</li></ol>
        <p class="record" id="wk-meta"></p>
        <div class="row end"><button class="btn ghost" id="wk-back">${esc(t("ui.common.back"))}</button></div>
      </div>`;
    $("#screen-weekly").querySelectorAll("[data-wrole]").forEach((b) => { b.onclick = () => { U.weeklyRole = b.dataset.wrole; DF.Audio.play("click"); renderWeekly(); }; });
    $("#wk-back").onclick = () => show("title");
    $("#wk-go").onclick = () => {
      const v = $("#wk-chapter").value.trim();
      U.setup.chapter = v; DF.storage.set("ovb_chapter", v);
      DF.Audio.unlock();
      DF.Game.startDay({ weekly: w, mode: "solo", players: [{ id: "p1", role, name: (U.setup.players[0] && U.setup.players[0].name) || "" }], chapter: v, city: U.setup.city });
    };
    if (!DF.Account.net) return;
    const mine = DF.Account.slug(U.setup.chapter);
    DF.Account.cup(w).then((b) => {
      const list = $("#wk-cup");
      if (!list) return;
      list.innerHTML = b.rows.length
        ? b.rows.map((r, i) => `<li class="${mine && DF.Account.slug(r.n) === mine ? "me" : ""}"><span class="rk">${i + 1}</span><b>${esc(r.n)}</b><span class="n">👥 ${Number(r.p) || 0}</span><span class="s">${Number(r.s) || 0}</span></li>`).join("")
        : `<li class="wait">${esc(t("ui.weekly.cupEmpty"))}</li>`;
      $("#wk-meta").textContent = b.rows.length ? t("ui.board.meta", { chapters: b.chapters, players: b.players }) : "";
    }, () => { const list = $("#wk-cup"); if (list) list.innerHTML = `<li class="wait">${esc(t("ui.board.error"))}</li>`; });
  }

  // the end of a weekly day: the local record, then the server's verified score
  function weeklyDone(sum, rec, run) {
    const score = DF.Weekly.score(sum), w = rec.week, prev = weeklyBest(w);
    if (!prev || score > prev.score) DF.storage.set(WEEKLY, { week: w, score, verified: false });
    const sheet = $("#screen-retro .sheet");
    if (!sheet) return;
    const box = document.createElement("div");
    box.className = "weekly-res";
    box.innerHTML = `<b>📅 ${esc(t("ui.weekly.retro", { n: score }))}</b><span id="wk-status">${esc(t(DF.Account.net ? "ui.weekly.sending" : "ui.weekly.cupOff"))}</span>`;
    sheet.insertBefore(box, sheet.children[1] || null);
    if (!DF.Account.net) return;
    DF.Account.submitWeekly({ w, role: rec.role, ch: run.chapter, log: rec.log }).then((r) => {
      const el = $("#wk-status");
      if (r.ok) {
        const cur = weeklyBest(w);
        if (cur && r.best >= cur.score) DF.storage.set(WEEKLY, { week: w, score: r.best, verified: true });
        if (el) el.textContent = t("ui.weekly.verified", { n: r.score, best: r.best }) + (r.rank ? " · " + t("ui.weekly.rank", { chapter: r.chapter, rank: r.rank }) : "");
      } else if (el) el.textContent = t("ui.weekly.notSent", { why: r.why || "?" });
    });
  }

  // ------------------------------------------------------------------ kit
  function renderKit(back) {
    U.kitBack = back || U.kitBack || "season";
    const owned = activePerks(), total = starsTotal(), free = total - kitCost(owned);
    $("#screen-kit").innerHTML = `
      <div class="sheet" style="width:min(980px,100%)">
        ${LANYARD}
        <div class="eyebrow">🧰 ${esc(t("ui.kit.title"))}</div>
        <h2>${esc(t("ui.kit.sub"))}</h2>
        <p>${esc(t("ui.kit.intro"))}</p>
        <div class="kit-stars"><b>⭐ ${free}</b><span>${esc(t("ui.kit.left", { n: free, total }))}</span></div>
        <div class="perks">${Object.keys(DF.PERKS).map((id) => {
          const pk = DF.PERKS[id], on = !!owned[id], can = on || pk.cost <= free;
          return `<button class="perk" data-perk="${id}" aria-pressed="${on}" ${can ? "" : "disabled"}><span class="ico">${pk.icon}</span><b>${esc(t("perks." + id + ".name"))}</b><span class="desc">${esc(t("perks." + id + ".desc"))}</span><span class="cost">${"⭐".repeat(pk.cost)}</span></button>`;
        }).join("")}</div>
        <div class="row end"><button class="btn go" id="kit-back" data-autofocus>${esc(t("ui.common.ok"))}</button></div>
      </div>`;
    $("#screen-kit").querySelectorAll("[data-perk]").forEach((b) => {
      b.onclick = () => {
        const cur = activePerks(), id = b.dataset.perk;
        if (cur[id]) delete cur[id];
        else if (DF.PERKS[id].cost <= starsTotal() - kitCost(cur)) cur[id] = true;
        else return;
        DF.storage.set(KIT, cur);
        DF.Audio.play(cur[id] ? "stamp" : "click");
        renderKit();
      };
    });
    $("#kit-back").onclick = () => {
      if (U.kitBack === "retro") show("retro");
      else { renderSeason(U.seasonMode || "season"); show("season"); }
    };
  }

  // ---------------------------------------------------------------- forge
  const MY_CARDS = "ovb_mycards";
  const myCards = () => DF.storage.get(MY_CARDS, []);
  const EFFECTS = ["budget:-200", "budget:400", "rsvp:30", "rsvp:-20", "partner:10", "community:10", "community:-10", "energy:-10", "energy:10"];

  function renderForge(prefill) {
    const cards = myCards();
    const streams = Object.keys(DF.AFFINITY);
    const pf = prefill || {};
    const effLabel = (e) => { const [k, v] = e.split(":"); const n = +v; return t("ui.fx." + k, { s: n > 0 ? "+" : "−", v: Math.abs(n) }); };
    $("#screen-forge").innerHTML = `
      <div class="sheet">
        ${LANYARD}
        <div class="eyebrow">🃏 ${esc(t("ui.forge.title"))}</div>
        <h2>${esc(t("ui.forge.title"))}</h2>
        <p>${esc(t("ui.forge.intro"))}</p>
        <div class="field"><label for="k-story">${esc(t("ui.forge.story"))}</label><textarea id="k-story" rows="3" maxlength="600" placeholder="${esc(t("ui.forge.storyPh"))}"></textarea></div>
        <div class="row"><button class="btn go" id="k-ai" ${DF.AI.available ? "" : "disabled"}>${esc(t("ui.forge.ai"))}</button><span class="record" id="k-aimsg">${DF.AI.available ? "" : esc(t("ui.forge.aiOff"))}</span></div>
        <h3>${esc(t("ui.forge.manual"))}</h3>
        <form id="forge" class="two" autocomplete="off">
          <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
            <div class="field"><label for="k-title">${esc(t("ui.forge.ctitle"))}</label><input id="k-title" required maxlength="60" value="${esc(pf.title || "")}"></div>
            <div class="field"><label for="k-text">${esc(t("ui.forge.ctext"))}</label><textarea id="k-text" required rows="2" maxlength="200">${esc(pf.text || "")}</textarea></div>
            <div class="row">
              <div class="field grow"><label for="k-stream">${esc(t("ui.forge.stream"))}</label><select id="k-stream">${streams.map((x) => `<option value="${x}" ${pf.stream === x ? "selected" : ""}>${esc(streamName(x))}</option>`).join("")}</select></div>
              <div class="field"><label for="k-round">${esc(t("ui.forge.round"))}</label><select id="k-round">${(t("ui.prep.rounds.4") || []).map((l, i) => `<option value="${i + 1}" ${(pf.round || 3) === i + 1 ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
            </div>
            <div class="field"><label for="k-ignore">${esc(t("ui.forge.cignore"))}</label><input id="k-ignore" required maxlength="120" value="${esc((pf.ignore && pf.ignore.text) || "")}"></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
            ${[0, 1].map((i) => {
              const o = (pf.opts && pf.opts[i]) || {};
              const cur = o.fx ? Object.entries(o.fx)[0] : null;
              return `<div class="field"><label for="k-o${i}">${esc(t("ui.forge.o", { n: i + 1 }))}</label><input id="k-o${i}" required maxlength="60" value="${esc(o.label || "")}"></div>
              <div class="row">
                <div class="field"><label for="k-c${i}">${esc(t("ui.forge.cost"))}</label><select id="k-c${i}">${[0, 1, 2].map((c) => `<option ${(o.cost != null ? o.cost : 2 - i) === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
                <div class="field grow"><label for="k-e${i}">${esc(t("ui.forge.effect"))}</label><select id="k-e${i}">${EFFECTS.map((e) => `<option value="${e}">${esc(effLabel(e))}</option>`).join("")}${cur ? `<option value="${cur[0]}:${cur[1]}" selected>${esc(effLabel(cur[0] + ":" + cur[1]))}</option>` : ""}</select></div>
              </div>`;
            }).join("")}
            <div class="field"><label for="k-tip">${esc(t("ui.forge.tip"))}</label><input id="k-tip" maxlength="180" value="${esc((pf.tip && pf.tip.d) || "")}"></div>
          </div>
          <div class="row end" style="grid-column:1/-1">
            <button class="btn ghost" type="button" id="k-back">${esc(t("ui.common.back"))}</button>
            <button class="btn go" type="submit">${esc(t("ui.forge.save"))}</button>
          </div>
        </form>
        <h3>${esc(t("ui.forge.mine", { n: cards.length }))}</h3>
        <div class="result-list" id="k-list">${cards.map((c, i) => `<div class="result"><span class="ico">${esc(c.icon || "🃏")}</span><div style="min-width:0"><b>${esc(c.title)}</b><p>${esc(c.text)}</p>
          <div class="row" style="margin-top:6px"><button class="btn small ghost" data-copy="${i}">${esc(t("ui.forge.copy"))}</button><button class="btn small ghost" data-del="${i}">${esc(t("ui.forge.del"))}</button></div></div></div>`).join("") || `<p>${esc(t("ui.forge.empty"))}</p>`}</div>
        <div class="field"><label for="k-import">${esc(t("ui.forge.import"))}</label><textarea id="k-import" rows="2" placeholder="${esc(t("ui.forge.importPh"))}"></textarea></div>
        <div class="row"><button class="btn small" id="k-doimport">${esc(t("ui.forge.importBtn"))}</button><span class="record" id="k-msg"></span></div>
      </div>`;
    $("#k-back").onclick = () => show("title");
    $("#k-ai").onclick = async () => {
      const story = $("#k-story").value.trim();
      if (story.length < 12) return;
      const btn = $("#k-ai"), msg = $("#k-aimsg");
      btn.disabled = true; msg.textContent = "✨ " + t("ui.forge.aiWorking");
      const card = await DF.AI.forge({ chapter: U.setup.chapter, story });
      btn.disabled = false;
      if (!card) { msg.textContent = t("ui.forge.aiFail"); return; }
      msg.textContent = "";
      renderForge(card);
      DF.Audio.play("stamp");
      $("#k-title").focus();
    };
    $("#forge").onsubmit = (e) => {
      e.preventDefault();
      const v = (id) => $("#" + id).value.trim();
      const eff = (i) => { const [k, n] = v("k-e" + i).split(":"); return { [k]: +n }; };
      const card = {
        ovb: 1, id: "my-" + Date.now().toString(36), round: +v("k-round"), stream: v("k-stream"), icon: pf.icon || "🃏", mine: true,
        title: v("k-title"), text: v("k-text"),
        opts: [0, 1].map((i) => ({ label: v("k-o" + i), cost: +v("k-c" + i), fx: eff(i) })),
        ignore: { text: v("k-ignore"), fx: (pf.ignore && pf.ignore.fx) || { community: -5 } },
        tip: v("k-tip") ? { t: (pf.tip && pf.tip.t) || U.setup.chapter, d: v("k-tip") } : null,
      };
      const list = myCards(); list.push(card); DF.storage.set(MY_CARDS, list);
      installMyCards(); renderForge();
    };
    $("#k-list").querySelectorAll("[data-del]").forEach((b) => { b.onclick = () => { const l = myCards(); l.splice(+b.dataset.del, 1); DF.storage.set(MY_CARDS, l); installMyCards(); renderForge(); }; });
    $("#k-list").querySelectorAll("[data-copy]").forEach((b) => {
      b.onclick = () => {
        const text = JSON.stringify(myCards()[+b.dataset.copy]);
        const ok = () => { b.textContent = t("ui.forge.copied"); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => fallbackCopy(text, ok)); else fallbackCopy(text, ok);
      };
    });
    $("#k-doimport").onclick = () => {
      try {
        const c = JSON.parse($("#k-import").value);
        if (!c || !(c.ovb === 1 || c.lmh === 1) || !c.title || !Array.isArray(c.opts)) throw new Error("format");
        const l = myCards(); l.push(Object.assign(DF.Prep.sanitizeCard(c, "imp-" + Date.now().toString(36)), { ovb: 1, mine: true })); DF.storage.set(MY_CARDS, l);
        installMyCards(); renderForge();
      } catch (e) { $("#k-msg").textContent = t("ui.forge.importErr"); }
    };
  }

  // lead-written cards join the Countdown deck
  function installMyCards() {
    const base = DF.PREP_CARDS.filter((c) => !c.mine);
    DF.PREP_CARDS.length = 0;
    base.forEach((c) => DF.PREP_CARDS.push(c));
    myCards().forEach((c, i) => { const s = DF.Prep.sanitizeCard(c, c.id || "my-" + i); s.mine = true; DF.PREP_CARDS.push(s); });
  }

  function init() {
    installMyCards();
    renderPause();
    DF.onLang(() => { rerender(); if (U.prep && U.ctl === localCtl && (U.current === "prep" || U.current === "loadout")) prefetchKit(); });
    DF.AI.onChange(() => { if (U.current === "title") renderTitle(); else if (U.current === "ai") renderAI(); });
    DF.Account.onChange((kind) => {
      if (U.current === "title") { const c = $("#m-acct"); if (c) { c.outerHTML = acctChip(); const n = $("#m-acct"); if (n) n.onclick = () => { renderAccount("title"); show("account"); }; } }
      else if (U.current === "account") { if (kind === "sync") updateSync(); else renderAccount(); }
    });
  }

  function guestGazette(g) {
    if (!g || !$("#g-head")) return;
    if (g.paper) $("#g-paper").textContent = g.paper;
    $("#g-head").textContent = g.headline; $("#g-sub").textContent = g.sub; $("#g-article").textContent = g.article;
    if (g.coach) { const c = $("#g-coach"); c.hidden = false; c.innerHTML = "<b>🧑‍🏫 " + esc(t("ui.retro.coach")) + ":</b> " + esc(g.coach); }
  }

  DF.UI = { init, show, toast, quickRun, showRetro, renderSetup, renderPrep, renderLoadout, renderSeason, renderKit, renderAI, renderAccount, renderBoard, renderPrivacy, renderWeekly, weeklyDone, syncFromStorage, guestGazette, activePerks, U };
})();
