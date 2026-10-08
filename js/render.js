/* render.js: draws the venue, the people and the HUD on the canvas.
 * Reads the sim state, never writes it. Crowd people are cosmetic: the sim
 * keeps counts per area, the renderer animates walkers and fills seats.
 * Characters are sprites generated once with Gemini (assets/sprites). */
"use strict";

(function () {
  const V = DF.Venue, ST = V.STATIONS, T = DF.TILE, P = DF.PROBLEMS, ROLES = DF.ROLES;
  const W = DF.W, H = DF.H, HUD = DF.HUD_H, MAPH = DF.ROWS * DF.TILE;

  const C = {
    ink: "#14161f", inkSoft: "#5b6578", paper: "#ffffff",
    wall: "#1d2131", wallTop: "#343a52",
    hall: "#ece8e1", hallAlt: "#e4dfd6",
    A: "#c99a6b", Aalt: "#bf8f60", B: "#8fa7cf", Balt: "#859ec8", L: "#d7dbe1", Lalt: "#ccd1d8",
    R: "#4b5566", Ralt: "#454e5e", S: "#9cc5a4", Salt: "#93bd9b", E: "#e0ddd5", Ealt: "#d6d2c9", K: "#dfe5ec", Kalt: "#d3dae3",
    stage: "#3b2f45", stageTop: "#4e3f5c", seat: "#2e3a52", seatTop: "#41506d",
    table: "#f5f5f2", tableEdge: "#b9bec7", counter: "#f2efe9", counterEdge: "#a99f90",
    blue: "#4285F4", red: "#EA4335", yellow: "#FBBC04", green: "#34A853",
    brand: "#FFD23F", stamp: "#E63B2E",
  };
  const SKIN = ["#f1c7a5", "#e0ac83", "#c68a62", "#9a6646", "#6f4630", "#f6d4bd"];
  const HAIR = ["#2b1d14", "#4a3020", "#7a4b2a", "#c9a061", "#141414", "#8c8c8c", "#a3412b"];
  const SHIRTS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853", "#5f6b7d", "#ffffff", "#2a2f3a", "#8e6fd8", "#ff8a65", "#26a69a", "#90a4ae"];
  const FONT = "'Google Sans Flex','Google Sans',system-ui,sans-serif";
  const MONO = "'Google Sans Code',ui-monospace,monospace";

  const R = {
    canvas: null, ctx: null, dpr: 1, scale: 1,
    bg: null, bgEvent: null,
    time: 0,
    walkers: [], seatShown: { A: 0, B: 0, L: 0 },
    floaters: [], parts: [],
    shake: 0, flash: 0,
    select: null,     // a teammate waiting for its job: { kind: "vol" | "mate", id }
    // phones: the HUD and the bar grow (ui), the venue is seen through a
    // camera (zoom) that follows you; off-screen problems sit on the edges
    ui: 1, zoom: 1, touch: false, touchK: 1, cam: { x: W / 2, y: MAPH / 2 }, camSet: false, L: null, edges: [], ratePulse: 0,
    radio: [],        // system messages {text, kind, t, ttl}
    tray: null, hudBtns: null, chips: null,
    rects: {},        // where HUD parts are, for the tutorial spotlight
    banter: null,     // lines shown in speech bubbles (AI or language pack)
  };

  // ------------------------------------------------------------- sprites
  const SPRITES = ["org_lead", "org_tech", "org_host", "org_care", "volunteer", "speaker_a", "speaker_b", "speaker_c", "att_1", "att_2", "att_3", "att_4", "att_5", "att_6", "att_7", "att_8", "murphy", "dog", "vip", "rider", "press", "sponsor", "kid", "hacker", "judge", "neighbor"];
  const IMG = {};
  function loadSprites() {
    for (const n of SPRITES) {
      const img = new Image();
      img.decoding = "async";
      img.src = (DF.SPRITE_DATA && DF.SPRITE_DATA[n]) || "assets/sprites/" + n + "." + (window.DF_SPRITE_EXT || "png");
      IMG[n] = img;
    }
  }
  const ready = (img) => img && img.complete && img.naturalWidth > 0;

  // draw a character sprite standing on (x, y), h logical pixels tall
  function sprite(g, name, x, y, h, flip, bob, alpha) {
    const img = IMG[name];
    g.fillStyle = "rgba(0,0,0,.2)";
    g.beginPath(); g.ellipse(x, y + 1, h * 0.22, h * 0.07, 0, 0, 7); g.fill();
    if (!ready(img)) return false;
    const dw = img.naturalWidth * (h / img.naturalHeight);
    g.save();
    if (alpha != null) g.globalAlpha = alpha;
    g.translate(x, y + (bob || 0));
    if (flip) g.scale(-1, 1);
    g.drawImage(img, -dw / 2, -h, dw, h);
    g.restore();
    return true;
  }

  // ------------------------------------------------------------- setup
  function init(canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext("2d");
    loadSprites();
    resize();
  }

  function resize() {
    const cv = R.canvas;
    const parent = cv.parentElement;
    const scale = Math.min(parent.clientWidth / W, parent.clientHeight / H);
    R.scale = scale;
    const q = new URLSearchParams(location.search), force = q.has("mobile");
    R.touch = force || !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
    const small = force || (R.touch && scale < 0.95);
    R.ui = small ? DF.clamp(0.95 / scale, 1.15, 1.5) : 1;
    R.zoom = small ? DF.clamp(1 / scale, 1.25, 1.7) : 1;
    R.touchK = R.touch ? 1.35 : 1;
    R.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = Math.round(W * scale), ch = Math.round(H * scale);
    cv.style.width = cw + "px"; cv.style.height = ch + "px";
    cv.width = Math.round(cw * R.dpr); cv.height = Math.round(ch * R.dpr);
    R.bg = null;
  }

  function toLogical(clientX, clientY) {
    const r = R.canvas.getBoundingClientRect();
    return [(clientX - r.left) / r.width * W, (clientY - r.top) / r.height * H];
  }

  // ---------------------------------------------------- static background
  function buildBackground(s, kb) {
    const k = kb || R.scale * R.dpr;
    const cv = document.createElement("canvas");
    cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    const g = cv.getContext("2d");
    g.setTransform(k, 0, 0, k, 0, 0);
    g.translate(0, HUD);

    for (let ty = 0; ty < DF.ROWS; ty++) for (let tx = 0; tx < DF.COLS; tx++) {
      const ch = V.tileAt(tx, ty);
      if (ch === "#") continue;
      const room = V.roomAt(V.tc(tx), V.tc(ty));
      const base = C[room] || C.hall, alt = C[room + "alt"] || C.hallAlt;
      g.fillStyle = room === "A" ? (ty % 2 ? base : alt) : (tx + ty) % 2 ? base : alt;
      g.fillRect(tx * T, ty * T, T, T);
      if (room === "A") { g.fillStyle = "rgba(0,0,0,.06)"; g.fillRect(tx * T, ty * T + T - 1, T, 1); if ((tx + ty * 3) % 5 === 0) g.fillRect(tx * T + 11, ty * T, 1, T); }
      if (room === "B" || room === "S") { g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(tx * T + 3, ty * T + 3, T - 6, T - 6); }
    }
    const look = V.look;
    for (const k in look.stages) drawStage(g, ...look.stages[k]);

    for (let ty = 0; ty < DF.ROWS; ty++) for (let tx = 0; tx < DF.COLS; tx++) {
      const ch = V.tileAt(tx, ty), x = tx * T, y = ty * T;
      if (ch === "s") {
        for (const ox of [3, 15]) {
          g.fillStyle = C.seat; roundRect(g, x + ox - 1, y + 8, 8, 12, 2); g.fill();
          g.fillStyle = C.seatTop; roundRect(g, x + ox - 1, y + 5, 8, 5, 2); g.fill();
        }
      } else if (ch === "t") {
        g.fillStyle = C.tableEdge; g.fillRect(x, y + 6, T, 14);
        g.fillStyle = C.table; g.fillRect(x, y + 5, T, 12);
        g.fillStyle = "#5f6b7d"; g.fillRect(x + 6, y + 7, 12, 7);
        g.fillStyle = "#9fd0ff"; g.fillRect(x + 7, y + 8, 10, 4);
      } else if (ch === "c") {
        g.fillStyle = C.counterEdge; g.fillRect(x + 1, y + 2, T - 2, T - 2);
        g.fillStyle = C.counter; g.fillRect(x + 1, y + 1, T - 2, T - 5);
      } else if (ch === "f") {
        g.fillStyle = "#3d6b4f"; roundRect(g, x, y + 2, T, T - 2, 4); g.fill();
        g.fillStyle = "#4f8763"; roundRect(g, x + 2, y + 5, T - 4, T - 9, 3); g.fill();
      } else if (ch === "k") {
        g.fillStyle = "#c9c4ba"; g.fillRect(x, y + 4, T, T - 4);
        g.fillStyle = "#f7f5f0"; g.fillRect(x, y + 2, T, T - 7);
      } else if (ch === "w") {
        g.fillStyle = "#8a6a4a"; g.fillRect(x, y + 3, T, T - 6);
        g.fillStyle = "#a9835d"; g.fillRect(x, y + 2, T, T - 9);
      } else if (ch === "q") {
        g.fillStyle = "#2a2f3c"; g.fillRect(x + 4, y, T - 8, T);
        g.fillStyle = "#ffd23f"; g.fillRect(x + 6, y + 4, T - 12, 3);
        for (let i = 0; i < 3; i++) { g.fillStyle = "#11141c"; g.fillRect(x + 7, y + 10 + i * 4, T - 14, 2); }
      }
    }
    drawCoffeeUrns(g); drawSponsorRollups(g); drawRegia(g); drawCheckin(g); drawGreenRoom(g); drawInfo(g);

    for (let ty = 0; ty < DF.ROWS; ty++) for (let tx = 0; tx < DF.COLS; tx++) {
      if (V.tileAt(tx, ty) !== "#") continue;
      const x = tx * T, y = ty * T;
      g.fillStyle = C.wall; g.fillRect(x, y, T, T);
      if (V.tileAt(tx, ty + 1) !== "#" && ty + 1 < DF.ROWS) { g.fillStyle = C.wallTop; g.fillRect(x, y + T - 6, T, 6); g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, y + T, T, 4); }
    }
    for (let ty = 0; ty < DF.ROWS; ty++) for (let tx = 0; tx < DF.COLS; tx++) {
      if (V.tileAt(tx, ty) !== "d") continue;
      g.fillStyle = "#c8c2b6"; g.fillRect(tx * T, ty * T, T, T);
      g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(tx * T + 2, ty * T + 4, T - 4, T - 8);
    }
    g.fillStyle = "#3c4a63"; g.fillRect((ST.entrance.x - 1.5) * T - 6, (ST.entrance.y + 1.5) * T - 5, 3 * T + 12, 5); // doormat
    for (const k in look.screens) { const [x0, w] = look.screens[k]; g.fillStyle = "#0b0f18"; g.fillRect(x0 * T, 4, w * T, 14); }
    g.fillStyle = "#f4f4f4"; g.fillRect(look.board[0] * T, 3, look.board[1] * T, 10); // the lab's whiteboard

    const label = (txt, tx, ty, color) => {
      g.font = "700 9px " + FONT; g.fillStyle = color || "rgba(24,32,46,.55)";
      g.textAlign = "left"; g.textBaseline = "top";
      g.fillText(String(txt).toUpperCase(), tx * T + 4, ty * T + 3);
    };
    // room names: the venue's own (venues.<id>.rooms), else the university's
    const rn = (k) => { const v = DF.t("venues." + V.id + ".rooms." + k); return v.startsWith("venues.") ? DF.t("rooms." + k) : v; };
    for (const k in look.labels) { const [x, y, light] = look.labels[k]; label(rn(k), x, y, light ? "rgba(255,255,255,.8)" : null); }

    if (s && s.evId === "wtm") drawKidsCorner(g);
    // rooms not used by this event: dark, taped off
    const ev = s && s.ev;
    if (ev) for (const r of ["A", "B", "L"]) if (!ev.rooms.includes(r)) closedRoom(g, V.ROOMS[r]);
    R.bg = cv;
    R.bgEvent = s && s.evId;
    R.bgVenue = V.id;
    R.bgLang = DF.lang;
    R.bgK = k;
  }

  function closedRoom(g, r) {
    const x = r.x0 * T, y = r.y0 * T - (r.y0 === 1 ? T : 0), w = (r.x1 - r.x0 + 1) * T, h = (r.y1 - r.y0 + 1) * T + (r.y0 === 1 ? T : 0);
    g.fillStyle = "rgba(10,12,20,.62)"; g.fillRect(x, y, w, h);
    g.save(); g.beginPath(); g.rect(x, y + h / 2 - 9, w, 18); g.clip();
    for (let i = -2; i < w / 14 + 2; i++) { g.fillStyle = i % 2 ? C.brand : "#111"; g.beginPath(); g.moveTo(x + i * 14, y + h / 2 - 9); g.lineTo(x + i * 14 + 14, y + h / 2 - 9); g.lineTo(x + i * 14 + 4, y + h / 2 + 9); g.lineTo(x + i * 14 - 10, y + h / 2 + 9); g.fill(); }
    g.restore();
    g.font = "900 11px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
    const txt = DF.t("ui.hud.closed");
    const tw = g.measureText(txt).width + 14;
    g.fillStyle = "#111"; roundRect(g, x + w / 2 - tw / 2, y + h / 2 - 8, tw, 16, 3); g.fill();
    g.fillStyle = C.brand; g.fillText(txt, x + w / 2, y + h / 2 + 0.5);
  }

  function drawStage(g, tx, ty, w) {
    g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(tx * T - 2, ty * T + 2, w * T + 4, T + 4);
    g.fillStyle = C.stage; g.fillRect(tx * T, ty * T - 4, w * T, T + 4);
    g.fillStyle = C.stageTop; g.fillRect(tx * T, ty * T - 4, w * T, T - 2);
    const lx = (tx + w - 2) * T + 4;
    g.fillStyle = "#6d5a7d"; g.fillRect(lx, ty * T - 2, 12, 12);
    g.fillStyle = "#8b77a0"; g.fillRect(lx, ty * T - 3, 12, 4);
    const cols = [C.blue, C.red, C.yellow, C.green];
    for (let i = 0; i < w * 2; i++) { g.fillStyle = cols[i % 4]; g.fillRect(tx * T + i * 12 + 2, ty * T + T - 3, 8, 3); }
  }
  function drawCoffeeUrns(g) {
    const c = ST.coffee, y = (c.y - 1.5) * T + 4;
    for (const dx of [-1.3, -0.3, 0.7]) { const tx = c.x + dx; g.fillStyle = "#c9ccd2"; roundRect(g, tx * T, y, 14, 12, 3); g.fill(); g.fillStyle = "#9aa0aa"; g.fillRect(tx * T + 4, y - 2, 6, 3); }
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc((c.x - 1.5) * T + 6 + i * 11, (c.y - 1.5) * T + 19, 2.6, 0, 7); g.fill(); }
  }
  function drawSponsorRollups(g) {
    for (const [st, col] of [[ST.sponsor1, C.blue], [ST.sponsor2, C.green]]) {
      const tx = st.x - 1, ty = st.y - 0.5;
      g.fillStyle = col; g.fillRect(tx * T + 2, ty * T + 8, 2 * T - 4, 8);
      g.fillStyle = "#fff"; g.fillRect(tx * T + 8, ty * T + 10, 2 * T - 16, 2);
    }
  }
  function drawRegia(g) {
    const bx = (ST.box.x - 2.5) * T + 2, by = (ST.box.y - 1) * T + 2, rx = ST.router.x - 0.5, ry = ST.router.y - 1.5, av = ST.av;
    g.fillStyle = "#7a5530"; g.fillRect(bx, by + 4, 2 * T - 4, 2 * T - 6);
    g.fillStyle = "#a8773f"; g.fillRect(bx, by, 2 * T - 4, 2 * T - 12);
    g.fillStyle = "#8a6232"; g.fillRect(bx + 20, by, 4, 2 * T - 12);
    [C.blue, C.red, C.yellow, C.green].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(bx + 9 + i * 7, by + 22, 2.4, 0, 7); g.fill(); });
    g.fillStyle = "#11151d"; g.fillRect(rx * T + 1, ry * T, 2 * T - 2, T);
    g.fillStyle = "#273042"; for (let i = 0; i < 3; i++) g.fillRect(rx * T + 3, ry * T + 3 + i * 6, 2 * T - 6, 4);
    // AV desk: mixer and phone
    g.fillStyle = "#1b1f27"; roundRect(g, (av.x - 1) * T + 2, (av.y + 0.5) * T + 4, 2 * T - 4, 12, 2); g.fill();
    for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? "#3ddc84" : "#ffd23f"; g.fillRect((av.x - 1) * T + 6 + i * 7, (av.y + 0.5) * T + 7, 3, 6); }
    g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(rx * T + 6, (ry + 1) * T + 2); g.bezierCurveTo((rx - 1) * T, (ry + 2) * T, (ST.box.x - 0.5) * T, (ST.box.y + 1.5) * T, (ST.box.x - 1.5) * T, (ST.box.y + 2) * T); g.stroke();
  }
  function drawCheckin(g) {
    const c = ST.checkin;
    g.strokeStyle = "#b03a2e"; g.lineWidth = 2;
    for (const dy of [-0.9, 0.6, 2.1]) {
      const yy = c.y + dy;
      g.beginPath(); g.moveTo((c.x + 2.1) * T, yy * T); g.lineTo((c.x + 8.1) * T, yy * T); g.stroke();
      for (const dx of [2.1, 5.1, 8.1]) { g.fillStyle = "#7c858f"; g.beginPath(); g.arc((c.x + dx) * T, yy * T, 2.6, 0, 7); g.fill(); }
    }
    g.fillStyle = "#3c4452"; g.fillRect((c.x + 0.5) * T + 4, (c.y - 1.5) * T + 5, 16, 12);
    g.fillStyle = "#ffffff"; g.fillRect((c.x + 0.5) * T + 7, (c.y - 1.5) * T + 3, 10, 4);
  }
  function drawGreenRoom(g) {
    const gr = ST.green;
    g.fillStyle = "#e8f0ff"; g.fillRect((gr.x + 3) * T + 6, (gr.y - 1.5) * T + 4, 6, 10);
    g.fillStyle = "#cfe0ff"; g.fillRect((gr.x + 3) * T + 14, (gr.y - 1.5) * T + 6, 6, 10);
    g.fillStyle = "#2f7a46"; g.beginPath(); g.arc((gr.x - 3) * T + 10, (gr.y - 1.5) * T + 10, 8, 0, 7); g.fill();
    g.fillStyle = "#3f9a5a"; g.beginPath(); g.arc((gr.x - 3) * T + 7, (gr.y - 1.5) * T + 8, 4, 0, 7); g.fill();
  }
  function drawKidsCorner(g) {
    const st = ST.kids;
    g.fillStyle = "#ffd6e8"; roundRect(g, st.px - 26, st.py - 22, 52, 40, 8); g.fill();
    g.fillStyle = "#ffb3d1"; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(st.px - 16 + i * 11, st.py - 14, 3.5, 0, 7); g.fill(); }
    [C.blue, C.red, C.yellow, C.green].forEach((c, i) => { g.fillStyle = c; g.fillRect(st.px - 18 + i * 10, st.py + 8, 7, 7); });
  }
  function drawInfo(g) {
    const i = ST.info;
    g.fillStyle = C.blue; g.fillRect((i.x - 1) * T + 2, (i.y - 1.5) * T + 2, 2 * T - 4, 5);
    g.fillStyle = "#fff"; g.font = "800 8px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("INFO", i.x * T, (i.y - 1.5) * T + 14);
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // -------------------------------------------------------------- people
  function hash(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
  const attSprite = (n) => "att_" + (1 + Math.floor(hash(n + 0.37) * 8));

  function seatedHead(g, x, y, i, mood) {
    const shirt = SHIRTS[Math.floor(hash(i + 3) * SHIRTS.length)], skin = SKIN[Math.floor(hash(i + 11) * SKIN.length)], hair = HAIR[Math.floor(hash(i + 29) * HAIR.length)];
    g.fillStyle = shirt; g.beginPath(); g.ellipse(x, y + 3, 4.6, 3.6, 0, 0, 7); g.fill();
    g.fillStyle = skin; g.beginPath(); g.arc(x, y - 1.5, 3, 0, 7); g.fill();
    g.fillStyle = hair; g.beginPath(); g.arc(x, y - 2.2, 3.1, Math.PI, Math.PI * 2); g.fill();
    if (mood) { g.fillStyle = mood; g.beginPath(); g.arc(x + 3.5, y - 5, 1.6, 0, 7); g.fill(); }
  }

  // the line snakes between the ropes, from the desk to the door (relative to the check-in)
  const QUEUE_PATH = [[1.6, -0.1], [7.7, -0.1], [7.7, 1.35], [2.1, 1.35], [2.1, 2.8], [5, 2.8], [5, 4.1], [5, 5.5]];
  function queuePos(i) {
    let d = i * 13;
    const ox = ST.checkin.x, oy = ST.checkin.y;
    for (let k = 0; k < QUEUE_PATH.length - 1; k++) {
      const ax = QUEUE_PATH[k][0] + ox, ay = QUEUE_PATH[k][1] + oy, bx = QUEUE_PATH[k + 1][0] + ox, by = QUEUE_PATH[k + 1][1] + oy;
      const seg = Math.hypot(bx - ax, by - ay) * T;
      if (d <= seg) { const t = d / seg; return [(ax + (bx - ax) * t) * T, (ay + (by - ay) * t) * T]; }
      d -= seg;
    }
    return null;
  }

  // the counts change, someone walks: into a room when a talk starts, out when
  // it ends, through the desk into the hall, from the street to the line
  const DOORS = { A: () => [ST.doorA.px, ST.doorA.py - 6], B: () => [ST.doorB.px, ST.doorB.py - 6], L: () => [V.look.doorL[0] * T, V.look.doorL[1] * T] };
  function crowdFlows(s, dt) {
    const c = s.crowd;
    if (R.flowDay !== s) { R.flowDay = s; R.flows = []; R.flowAcc = {}; R.prevCrowd = { A: c.A, B: c.B, L: c.L, checkedIn: c.checkedIn, queue: c.queue }; return; }
    const prev = R.prevCrowd, acc = R.flowAcc;
    const rnd = { range: (a, b) => a + Math.random() * (b - a) };
    const add = (from, to) => { if (R.flows.length < (R.touch ? 36 : 60)) R.flows.push({ id: (R.walkerSeq = (R.walkerSeq || 0) + 1), x: from[0], y: from[1], tx: to[0], ty: to[1], face: to[0] >= from[0] ? 1 : -1 }); };
    const hall = () => V.randomPointIn("H", rnd);
    for (const k of ["A", "B", "L"]) {
      if (!s.ev.rooms.includes(k)) continue;
      acc[k] = (acc[k] || 0) + (c[k] - prev[k]); prev[k] = c[k];
      const door = DOORS[k]();
      while (acc[k] >= 3) { acc[k] -= 3; add(hall(), door); }
      while (acc[k] <= -3) { acc[k] += 3; add(door, hall()); }
    }
    acc.desk = (acc.desk || 0) + (c.checkedIn - prev.checkedIn); prev.checkedIn = c.checkedIn;
    while (acc.desk >= 2) { acc.desk -= 2; add([ST.checkin.px - 24, ST.checkin.py - 8], hall()); }
    acc.street = (acc.street || 0) + Math.max(0, c.queue - prev.queue); prev.queue = c.queue;
    while (acc.street >= 2) { acc.street -= 2; const q = queuePos(Math.min(c.queue, 29)) || [ST.checkin.px, ST.checkin.py]; add([ST.entrance.px + (Math.random() - 0.5) * 20, ST.entrance.py + 24], q); }
    for (let i = R.flows.length - 1; i >= 0; i--) {
      const w = R.flows[i], dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
      if (d < 2) { R.flows.splice(i, 1); continue; }
      const sp = 62 * dt;
      w.x += dx / d * Math.min(sp, d); w.y += dy / d * Math.min(sp, d);
      if (Math.abs(dx) > 0.5) w.face = dx > 0 ? 1 : -1;
    }
  }

  function syncWalkers(s, dt) {
    crowdFlows(s, dt);
    const want = Math.min(R.touch ? 70 : 90, Math.round(s.crowd.hall * 0.6));
    const ws = R.walkers;
    const rnd = { range: (a, b) => a + Math.random() * (b - a) };
    while (ws.length < want) {
      const id = (R.walkerSeq = (R.walkerSeq || 0) + 1);
      const from = Math.random() < 0.5 ? [ST.checkin.px + 30, ST.checkin.py - 40] : V.randomPointIn("H", rnd);
      ws.push({ id, x: from[0], y: from[1], tx: from[0], ty: from[1], wait: Math.random() * 2, leaving: false, face: 1 });
    }
    let extra = ws.length - want;
    for (const w of ws) {
      if (extra <= 0) break;
      if (!w.leaving) {
        w.leaving = true; extra--;
        const doors = [[ST.doorA.px, ST.doorA.py - 20], [ST.doorB.px, ST.doorB.py - 20], [V.look.doorL[0] * T, V.look.doorL[1] * T], [ST.entrance.px, ST.entrance.py + 20]];
        const d = doors[Math.floor(Math.random() * doors.length)];
        w.tx = d[0]; w.ty = d[1];
      }
    }
    const crowdAt = s.breakIdx >= 0 ? ST.coffee : null;
    for (let i = ws.length - 1; i >= 0; i--) {
      const w = ws[i];
      if (w.itemT > 0) w.itemT -= dt;
      const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
      if (d > 1.5) {
        const sp = (w.leaving ? 70 : 34) * dt;
        w.x += dx / d * Math.min(sp, d); w.y += dy / d * Math.min(sp, d); w.moving = true;
        if (Math.abs(dx) > 0.5) w.face = dx > 0 ? 1 : -1;
      } else {
        w.moving = false;
        if (w.leaving) { ws.splice(i, 1); continue; }
        w.wait -= dt;
        if (w.wait <= 0) {
          w.wait = 1.5 + Math.random() * 4;
          const p = crowdAt && Math.random() < 0.45 ? [crowdAt.px + (Math.random() - 0.5) * 120, crowdAt.py + (Math.random() - 0.3) * 30] : V.randomPointIn(Math.random() < 0.72 ? "H" : "E", rnd);
          if (V.isWalk(V.toTile(p[0]), V.toTile(p[1]))) { w.tx = p[0]; w.ty = p[1]; }
        }
      }
    }
  }

  // ------------------------------------------------------------- markers
  function ringColor(f) { return f > 0.5 ? C.yellow : f > 0.25 ? "#ff8f1f" : C.red; }

  function marker(g, s, pr, x, y) {
    const def = P[pr.type];
    const t = R.time;
    if (pr.warn > 0) {
      const b = Math.sin(t * 10) * 2;
      g.fillStyle = C.yellow;
      g.beginPath(); g.moveTo(x, y - 40 + b); g.lineTo(x + 9, y - 25 + b); g.lineTo(x - 9, y - 25 + b); g.closePath(); g.fill();
      g.fillStyle = C.ink; g.font = "900 11px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("!", x, y - 29 + b);
      return;
    }
    const frac = pr.escalated ? 0 : pr.remain / pr.dur;
    const urgent = !pr.escalated && frac < 0.3;
    const pulse = urgent ? 1 + Math.sin(t * 14) * 0.08 : 1;
    const by = y - (def.kind === "escort" ? 44 : 34);
    g.save();
    g.translate(x, by); g.scale(pulse, pulse);
    if (pr.escalated) g.translate(Math.sin(t * 40) * 1.2, 0);
    g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.arc(1, 2, 14, 0, 7); g.fill();
    g.fillStyle = pr.escalated ? "#ffe2df" : def.bonus ? "#fff6d6" : C.paper;
    g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill();
    g.beginPath(); g.moveTo(-5, 11); g.lineTo(0, 19); g.lineTo(5, 11); g.closePath(); g.fill();
    g.lineWidth = 3.5; g.lineCap = "round";
    if (pr.escalated) { g.strokeStyle = C.red; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.stroke(); }
    else {
      g.strokeStyle = "rgba(0,0,0,.08)"; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.stroke();
      g.strokeStyle = def.bonus ? C.brand : ringColor(frac); g.beginPath(); g.arc(0, 0, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); g.stroke();
    }
    if (pr.progress > 0) { g.strokeStyle = C.green; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 9.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr.progress); g.stroke(); }
    emoji(g, def.icon, 0, 0.5, 15);
    if (def.tool && pr.type !== "wifi") {
      const have = s.lo.tools && s.lo.tools[def.tool];
      g.fillStyle = have ? "#e8f0fe" : "#eceff1";
      g.beginPath(); g.arc(12, 10, 7, 0, 7); g.fill();
      g.globalAlpha = have ? 1 : 0.45; emoji(g, DF.TOOLS[def.tool].icon, 12, 10.5, 9); g.globalAlpha = 1;
    }
    if ((def.crew || 1) > 1) {
      g.fillStyle = pr.blockedCrew ? C.red : C.blue;
      roundRect(g, -22, -6, 13, 12, 3); g.fill();
      g.fillStyle = "#fff"; g.font = "800 8px " + MONO; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("×2", -15.5, 0.5);
    }
    g.restore();
  }

  function emoji(g, ch, x, y, size) {
    g.font = size + "px 'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(ch, x, y);
  }

  // ------------------------------------------------------------- frame
  // ------------------------------------------------------------- camera
  function layoutFor(view) {
    const plain = view && view.attract;
    const ui = plain ? 1 : R.ui, Z = plain ? 1 : R.zoom;
    const hudH = HUD * ui, barH = DF.RADIO_H * ui;
    return { ui, Z, hudH, barH, mapY: hudH, mapH: H - hudH - barH, compact: ui > 1 };
  }
  const toScreen = (wx, wy, L) => [(wx - R.cam.x) * L.Z + W / 2, (wy - R.cam.y) * L.Z + L.mapY + L.mapH / 2];
  const toWorld = (sx, sy, L) => [(sx - W / 2) / L.Z + R.cam.x, (sy - L.mapY - L.mapH / 2) / L.Z + R.cam.y];
  // follow your organizer (or what the tutorial is pointing at), never past the walls
  function updateCam(s, view, L, dt) {
    let tx = W / 2, ty = MAPH / 2;
    if (L.Z > 1) {
      const mine = s.orgs.filter((o) => (view.locals && view.locals.length ? view.locals : [view.activeOrg]).includes(o.id));
      if (view.focus) { tx = view.focus.x; ty = view.focus.y; }
      else if (mine.length) { tx = mine.reduce((a, o) => a + o.x, 0) / mine.length; ty = mine.reduce((a, o) => a + o.y, 0) / mine.length - 10; }
    }
    const k = R.camSet ? 1 - Math.exp(-(dt || 1 / 60) * 5) : 1;
    R.camSet = true;
    R.cam.x += (tx - R.cam.x) * k; R.cam.y += (ty - R.cam.y) * k;
    const hw = W / (2 * L.Z), hh = L.mapH / (2 * L.Z);
    R.cam.x = hw * 2 >= W ? W / 2 : DF.clamp(R.cam.x, hw, W - hw);
    R.cam.y = hh * 2 >= MAPH ? MAPH / 2 : DF.clamp(R.cam.y, hh, MAPH - hh);
  }
  // a tutorial spot on the map -> where it is on screen now
  function spotScreen(sp) {
    if (!sp || !sp.map) return sp;
    const L = R.L || layoutFor({});
    const [x, y] = toScreen(sp.x, sp.y, L);
    return { x, y, r: (sp.r || 30) * L.Z };
  }
  const scaleRect = (r, ox, oy, u) => (r ? Object.assign({}, r, { x: ox + r.x * u, y: oy + r.y * u, w: r.w * u, h: r.h * u }) : r);

  function draw(s, view) {
    const g = R.ctx;
    if (!R.scale || !R.canvas.width) { resize(); if (!R.scale || !R.canvas.width) return; } // hidden or zero-sized
    const k = R.scale * R.dpr;
    const L = R.L = layoutFor(view);
    const kb = k * L.Z;
    if (s.venue && s.venue !== V.id) V.use(s.venue); // a guest's mirror, or the title's attract day
    if (!R.bg || R.bgEvent !== s.evId || R.bgLang !== DF.lang || R.bgK !== kb || R.bgVenue !== V.id) buildBackground(s, kb);
    const dt = view.dt || 1 / 60;
    R.time += dt;
    updateCam(s, view, L, dt);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, R.canvas.width, R.canvas.height);
    let sx = 0, sy = 0;
    if (R.shake > 0) { R.shake = Math.max(0, R.shake - dt * 18); sx = (Math.random() - 0.5) * R.shake; sy = (Math.random() - 0.5) * R.shake; }
    g.setTransform(k, 0, 0, k, sx * k, sy * k);

    // the venue, through the camera
    g.save();
    g.beginPath(); g.rect(0, L.mapY, W, L.mapH); g.clip();
    g.fillStyle = C.wall; g.fillRect(0, L.mapY, W, L.mapH);
    g.translate(W / 2, L.mapY + L.mapH / 2); g.scale(L.Z, L.Z); g.translate(-R.cam.x, -R.cam.y);
    g.drawImage(R.bg, 0, Math.round(HUD * kb), Math.round(W * kb), Math.round(MAPH * kb), 0, 0, W, MAPH);
    drawScreens(g, s);
    drawCoffeeLevel(g, s);
    drawRouterLeds(g, s);
    drawSeated(g, s, dt);
    drawRoomOverlays(g, s);
    drawQueue(g, s);
    syncWalkers(s, dt);
    drawDynamicPeople(g, s, view);
    drawPostsHint(g, s);
    drawMarkers(g, s, view);
    drawFx(g, dt);
    if (s.ev && s.ev.night) drawNight(g, s);
    if (s.fire) drawFire(g);
    if (s.panic && !view.attract) drawPanic(g);
    drawToolTray(g, s, view);
    g.restore();
    drawEdges(g, s, L, view);
    drawRush(g, s, L, view);

    // HUD and bar, bigger on phones; their hit boxes go back to screen units
    R.ratePulse = Math.max(0, R.ratePulse - dt); R.rateBad = Math.max(0, (R.rateBad || 0) - dt);
    g.save(); g.scale(L.ui, L.ui); drawHUD(g, s, view, L); g.restore();
    R.hudBtns = (R.hudBtns || []).map((b) => scaleRect(b, 0, 0, L.ui));
    for (const n of ["rating", "goals", "energy", "ability"]) R.rects[n] = scaleRect(R.rects[n], 0, 0, L.ui);
    g.save(); g.translate(0, H - L.barH); g.scale(L.ui, L.ui); drawBar(g, s, view, dt, L); g.restore();
    R.chips = R.chips && R.chips.map((b) => scaleRect(b, 0, H - L.barH, L.ui));
    for (const n of ["chat", "radio"]) R.rects[n] = scaleRect(R.rects[n], 0, H - L.barH, L.ui);
    if (R.flash > 0) { R.flash = Math.max(0, R.flash - dt * 2.5); g.fillStyle = "rgba(234,67,53," + (R.flash * 0.35) + ")"; g.fillRect(0, 0, W, H); }
    if (!view.attract && DF.Coach && DF.Coach.blocking()) drawSpot(g, DF.Coach.spot());
  }

  // a rush hour: what's left and how long before the first one gets worse
  function drawRush(g, s, L, view) {
    R.rects.rush = null;
    const r = s.rush;
    if (!r || view.attract) return;
    const prs = r.ids.map((id) => s.problems.find((p) => p.id === id)).filter(Boolean);
    const open = prs.filter((p) => !p.done);
    const left = open.length ? Math.max(0, Math.min(...open.map((p) => p.remain))) : 0;
    const u = L.ui, w = 220 * u, h = 24 * u, x = W / 2 - w / 2, y = L.mapY + (s.panic ? 30 : 6) * u; // below the CHAOS! badge
    const pulse = 0.5 + Math.sin(R.time * 8) * 0.5;
    g.save();
    g.fillStyle = "rgba(20,22,31,.92)"; roundRect(g, x, y, w, h, h / 2); g.fill();
    g.strokeStyle = "rgba(255,210,63," + (0.55 + pulse * 0.45) + ")"; g.lineWidth = 2; g.stroke();
    g.fillStyle = C.brand; g.font = "900 " + 11 * u + "px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText("⚡ " + DF.t("ui.hud.rush"), x + 10 * u, y + h / 2 + 0.5);
    let px = x + w - 54 * u;
    for (const pr of prs) { g.fillStyle = pr.done ? C.green : "rgba(255,255,255,.25)"; g.beginPath(); g.arc(px, y + h / 2, 4.5 * u, 0, 7); g.fill(); px -= 12 * u; }
    g.fillStyle = left < 6 ? C.red : "#fff"; g.font = "800 " + 11 * u + "px " + MONO; g.textAlign = "right";
    g.fillText(Math.ceil(left) + "s", x + w - 10 * u, y + h / 2 + 0.5);
    g.restore();
    R.rects.rush = { x, y, w, h };
  }

  // problems the camera can't see: a badge on the edge, pointing at them (tap = go)
  function drawEdges(g, s, L, view) {
    R.edges = [];
    if (L.Z <= 1 || view.attract) return;
    const pad = 18 * L.ui, x0 = pad, x1 = W - pad, y0 = L.mapY + pad, y1 = L.mapY + L.mapH - pad;
    const cx = W / 2, cy = L.mapY + L.mapH / 2, r = 13 * L.ui;
    for (const pr of s.problems) {
      if (pr.done) continue;
      const [ax, ay] = DF.Sim.anchorOf(s, pr);
      const [px, py] = toScreen(ax, ay - 20, L);
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) continue;
      const dx = px - cx, dy = py - cy;
      const tx = dx > 0 ? (x1 - cx) / dx : dx < 0 ? (x0 - cx) / dx : Infinity;
      const ty = dy > 0 ? (y1 - cy) / dy : dy < 0 ? (y0 - cy) / dy : Infinity;
      const t = Math.min(tx, ty), ex = cx + dx * t, ey = cy + dy * t;
      const urgent = !pr.warn && pr.remain / pr.dur < 0.35;
      const a = Math.atan2(dy, dx);
      g.save();
      g.translate(ex, ey);
      g.fillStyle = pr.warn > 0 ? C.yellow : urgent ? C.red : "#ffffff";
      g.beginPath(); g.moveTo(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7)); g.lineTo(Math.cos(a + 0.5) * r, Math.sin(a + 0.5) * r); g.lineTo(Math.cos(a - 0.5) * r, Math.sin(a - 0.5) * r); g.fill();
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.strokeStyle = pr.rush ? C.brand : "rgba(20,22,31,.55)"; g.lineWidth = pr.rush ? 3 : 1.5; g.stroke();
      emoji(g, pr.warn > 0 ? "⚠️" : P[pr.type].icon, 0, 1, 13 * L.ui);
      g.restore();
      R.edges.push({ x: ex, y: ey, r: r + 8, pr });
    }
  }

  // the tutorial: dim everything but the thing being explained
  function drawSpot(g, sp) {
    g.save();
    g.fillStyle = "rgba(8,9,16,.6)";
    g.beginPath(); g.rect(0, 0, W, H);
    if (sp) {
      if (sp.w != null) {
        // a rounded hole, added to the same path (roundRect() would start a new one)
        const p = 5, x = sp.x - p, y = sp.y - p, w = sp.w + p * 2, h = sp.h + p * 2, r = 10;
        g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
      } else { g.moveTo(sp.x + sp.r, sp.y); g.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2, true); }
    }
    g.fill("evenodd");
    if (sp) {
      const pulse = 2 + Math.sin(R.time * 5) * 1.5;
      g.strokeStyle = C.brand; g.lineWidth = 2.5;
      g.beginPath();
      if (sp.w != null) roundRect(g, sp.x - 5 - pulse, sp.y - 5 - pulse, sp.w + 10 + pulse * 2, sp.h + 10 + pulse * 2, 12);
      else g.arc(sp.x, sp.y, sp.r + pulse, 0, 7);
      g.stroke();
    }
    g.restore();
  }

  function drawScreens(g, s) {
    for (const rid of Object.keys(V.look.screens)) {
      if (!s.ev.rooms.includes(rid)) continue;
      const [x0, w] = V.look.screens[rid];
      const room = s.rooms[rid];
      const x = x0 * T + 2, y = 6, ww = w * T - 4, hh = 10;
      const has = (type) => s.problems.some((p) => !p.done && p.type === type && (p.room === rid) && !p.warn);
      if (has("blackout")) { g.fillStyle = "#000"; g.fillRect(x, y, ww, hh); continue; }
      if (has("hdmi")) {
        g.fillStyle = "#1a3fd1"; g.fillRect(x, y, ww, hh);
        g.fillStyle = "#fff"; g.font = "700 7px " + MONO; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(Math.sin(R.time * 4) > -0.3 ? DF.t("ui.hud.noSignal") : "", x + ww / 2, y + hh / 2 + 0.5);
      } else if (room.state === "running") {
        const se = s.sessions[room.session];
        g.fillStyle = "#ffffff"; g.fillRect(x, y, ww, hh);
        g.fillStyle = [C.blue, C.red, C.yellow, C.green][room.session % 4]; g.fillRect(x, y, 3, hh);
        g.fillStyle = "#3c4043"; g.font = "600 6px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
        g.fillText(fit(g, DF.t("talks." + se.talk), ww - 10), x + 6, y + hh / 2 + 0.5);
        if (rid === "A" && has("stream")) emoji(g, "🔇", x + ww - 8, y + hh / 2, 8);
      } else if (room.state === "waiting") {
        g.fillStyle = "#202124"; g.fillRect(x, y, ww, hh);
        g.fillStyle = C.yellow; g.font = "600 6px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(room.delay > 4 ? DF.t("ui.hud.late", { m: Math.round(room.delay) }) : DF.t("ui.hud.starting"), x + ww / 2, y + hh / 2 + 0.5);
      }
    }
  }

  function fit(g, text, w) {
    text = String(text);
    if (g.measureText(text).width <= w) return text;
    let t = text;
    while (t.length > 3 && g.measureText(t + "…").width > w) t = t.slice(0, -1);
    return t + "…";
  }

  function drawCoffeeLevel(g, s) {
    const f = DF.clamp(s.coffee / s.coffeeCap, 0, 1);
    const x = (ST.coffee.x - 1.5) * T + 2, y = (ST.coffee.y - 1.5) * T - 1, w = 3 * T - 4;
    g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x, y, w, 3);
    g.fillStyle = f > 0.3 ? "#8d5b34" : f > 0 ? "#ff8f1f" : C.red; g.fillRect(x, y, w * f, 3);
  }

  function drawRouterLeds(g, s) {
    const wifi = s.problems.find((p) => !p.done && p.type === "wifi");
    for (let i = 0; i < 6; i++) {
      let col = Math.sin(R.time * (6 + i) + i) > 0 ? "#3ddc84" : "#1f7a45";
      if (wifi) col = wifi.warn > 0 ? (Math.sin(R.time * 12 + i) > 0 ? "#ffb300" : "#7a5600") : (Math.sin(R.time * 9 + i) > 0 ? "#ff3b30" : "#5a1410");
      g.fillStyle = col; g.fillRect((ST.router.x - 0.5) * T + 6 + i * 6, (ST.router.y - 1.5) * T + 4, 3, 2);
    }
  }

  function drawSeated(g, s, dt) {
    for (const rid of ["A", "B", "L"]) {
      R.seatShown[rid] = DF.approach(R.seatShown[rid], s.crowd[rid], dt * 40);
      const n = Math.round(R.seatShown[rid]);
      const seats = V.SEATS[rid];
      const room = s.rooms[rid];
      const waiting = room.state === "waiting" && room.delay > 4;
      for (let i = 0; i < Math.min(n, seats.length); i++) {
        const [x, y] = seats[i];
        seatedHead(g, x, y, i + rid.charCodeAt(0) * 100, waiting && hash(i + rid.charCodeAt(0)) < 0.3 ? C.red : null);
      }
      const extra = n - seats.length;
      const r = V.ROOMS[rid];
      for (let i = 0; i < extra && i < 30; i++) {
        const x = (r.x0 + 0.3 + (i % (r.x1 - r.x0))) * T + 6, y = (r.y1 + 0.6) * T - Math.floor(i / (r.x1 - r.x0)) * 10;
        seatedHead(g, x, y, i + 777, null);
      }
    }
    for (const rid of ["A", "B"]) {
      const n = s.crowd.overflow[rid] || 0;
      const st = rid === "A" ? ST.doorA : ST.doorB;
      for (let i = 0; i < Math.min(n, 12); i++) {
        const ang = i * 2.4, rr = 8 + i * 1.8;
        sprite(g, attSprite(i + 900), st.px + Math.cos(ang) * rr, st.py + 18 + Math.abs(Math.sin(ang)) * 8, 20, i % 2, 0);
      }
    }
  }

  function drawRoomOverlays(g, s) {
    for (const p of s.problems) {
      if (p.done || p.type !== "blackout" || !p.room) continue;
      const r = V.ROOMS[p.room];
      g.fillStyle = "rgba(4,6,14," + (0.55 + Math.sin(R.time * 3) * 0.05) + ")";
      g.fillRect(r.x0 * T, (r.y0 - 1) * T, (r.x1 - r.x0 + 1) * T, (r.y1 - r.y0 + 2) * T);
    }
  }

  function drawQueue(g, s) {
    const n = s.crowd.queue, shown = Math.min(n, 30);
    for (let i = 0; i < shown; i++) {
      const p = queuePos(i);
      if (!p) break;
      sprite(g, attSprite(i + 5000), p[0], p[1] + 6, 20, false, Math.sin(R.time * 3 + i) * 0.4);
    }
    if (n > shown) {
      g.fillStyle = C.red; roundRect(g, (ST.checkin.x + 6.1) * T, (ST.checkin.y + 3) * T, 30, 14, 4); g.fill();
      g.fillStyle = "#fff"; g.font = "700 9px " + MONO; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("+" + (n - shown), (ST.checkin.x + 6.1) * T + 15, (ST.checkin.y + 3) * T + 7.5);
    }
  }

  // extras on stage for some problems: the mayor, the press, the rider, the sponsor, the flame war
  function problemCast(s, list) {
    for (const pr of s.problems) {
      if (pr.done || pr.warn > 0) continue;
      const st = ST[pr.st];
      if (!st) continue;
      const add = (name, dx, dy, h, flip) => list.push({ y: st.py + dy, f: (g) => sprite(g, name, st.px + dx, st.py + dy, h, flip, Math.sin(R.time * 4 + pr.id) * 0.6) });
      if (pr.type === "vip") add(s.evId === "hack" ? "judge" : "vip", 14, 10, 32, true);
      else if (pr.type === "foto") { add("press", 14, 8, 30, true); list.push({ y: st.py + 9, f: (g) => bubble(g, st.px + 14, st.py - 30, "📸 click!", C.red) }); }
      else if (pr.type === "mentor") { add("hacker", 0, 2, 28, false); list.push({ y: st.py + 3, f: (g) => bubble(g, st.px, st.py - 30, "build ✗", C.red) }); }
      else if (pr.type === "noise") { add("neighbor", 16, 10, 30, true); list.push({ y: st.py + 11, f: (g) => bubble(g, st.px + 16, st.py - 24, "SHHH!", C.ink) }); }
      else if (pr.type === "press") add("press", 16, 8, 32, true);
      else if (pr.type === "pizza") add("rider", 14, 12, 32, true);
      else if (pr.type === "sponsor") add("sponsor", 0, -4, 30, false);
      else if (pr.type === "flame") {
        add(attSprite(pr.id), -10, 6, 24, false); add(attSprite(pr.id + 3), 10, 6, 24, true);
        list.push({ y: st.py + 7, f: (g) => { bubble(g, st.px - 16, st.py - 26, "TAB!", C.blue); bubble(g, st.px + 18, st.py - 30, "SPACE!", C.red); } });
      }
    }
  }

  function bubble(g, x, y, text, color) {
    g.font = "800 8px " + FONT;
    const w = g.measureText(text).width + 10;
    g.fillStyle = "#fff"; roundRect(g, x - w / 2, y - 7, w, 13, 6); g.fill();
    g.beginPath(); g.moveTo(x - 3, y + 5); g.lineTo(x, y + 10); g.lineTo(x + 3, y + 5); g.fill();
    g.fillStyle = color || C.ink; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, x, y);
  }

  function drawDynamicPeople(g, s, view) {
    const list = [];
    for (const w of R.flows || []) list.push({ y: w.y, f: () => sprite(g, attSprite(w.id), w.x, w.y + 6, 24, w.face < 0, -Math.abs(Math.sin(R.time * 11 + w.id)) * 1.6) });
    for (const w of R.walkers) list.push({ y: w.y, f: () => {
      sprite(g, attSprite(w.id), w.x, w.y + 6, 24, w.face < 0, w.moving ? -Math.abs(Math.sin(R.time * 10 + w.id)) * 1.5 : 0);
      if (w.itemT > 0) emoji(g, w.item, w.x + (w.face < 0 ? -7 : 7), w.y - 6, 11);
    } });
    for (const sp of s.speakers) if (sp.state !== "off" && sp.state !== "gone") list.push({ y: sp.y, f: () => drawSpeaker(g, sp) });
    for (const v of s.vols) list.push({ y: v.y, f: () => drawVolunteer(g, v) });
    // organizers on the same spot are drawn side by side (display only, the sim is untouched)
    for (const o of s.orgs) {
      const near = s.orgs.filter((q) => Math.abs(q.x - o.x) < 8 && Math.abs(q.y - o.y) < 8);
      const i = near.indexOf(o);
      const v = near.length > 1 ? Object.assign(Object.create(o), { x: o.x + (i - (near.length - 1) / 2) * 24, tagDy: i % 2 ? 11 : 0 }) : o;
      list.push({ y: o.y, f: () => drawOrg(g, s, v, view) });
    }
    for (const d of s.critters || []) {
      if (d.state === "gone") continue;
      const cr = DF.CRITTERS[d.kind] || DF.CRITTERS.dog;
      list.push({ y: d.y, f: () => {
        sprite(g, cr.sprite, d.x, d.y + 6, cr.h, d.kind === "dog" ? d.facing > 0 : d.facing < 0, d.path ? -Math.abs(Math.sin(R.time * 14)) * 2 : 0);
        if (d.state === "roam" && d.kind !== "dog") bubble(g, d.x, d.y - cr.h - 6, d.kind === "kid" ? "Mamma?" : "♿ ↗", d.kind === "kid" ? C.red : C.blue);
      } });
    }
    const m = s.murphy;
    if (m && m.state !== "gone") list.push({ y: m.y, f: () => drawMurphy(g, m) });
    problemCast(s, list);
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.f(g);
  }

  function nameTag(g, x, y, text, bg) {
    g.font = "700 8px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
    const w = g.measureText(text).width + 8;
    g.fillStyle = bg; roundRect(g, x - w / 2, y - 5.5, w, 11, 3); g.fill();
    g.fillStyle = "#fff"; g.fillText(text, x, y + 0.5);
  }

  function drawSpeaker(g, sp) {
    const name = ["speaker_a", "speaker_b", "speaker_c"][sp.look % 3];
    sprite(g, name, sp.x, sp.y + 6, 32, sp.facing > 0, sp.path ? -Math.abs(Math.sin(R.time * 10 + sp.look)) * 1.5 : 0);
    if (sp.state === "lost" || sp.state === "escort") nameTag(g, sp.x, sp.y - 34, sp.name.split(" ")[0], sp.state === "escort" ? C.green : "rgba(20,22,31,.88)");
  }

  function drawVolunteer(g, v) {
    const sel = !!(R.select && R.select.kind === "vol" && R.select.id === v.id);
    if (sel) { g.strokeStyle = C.brand; g.lineWidth = 3; g.beginPath(); g.ellipse(v.x, v.y + 7, 12, 5, 0, 0, 7); g.stroke(); }
    sprite(g, "volunteer", v.x, v.y + 6, 30, false, v.path ? -Math.abs(Math.sin(R.time * 10 + v.x)) * 1.5 : 0);
    if (v.busy) { g.fillStyle = C.green; g.font = "800 10px " + FONT; g.textAlign = "center"; g.fillText("…", v.x, v.y - 28); }
  }

  function drawOrg(g, s, o, view) {
    const role = ROLES[o.role];
    const active = view.activeOrg === o.id;
    g.strokeStyle = active ? "#ffffff" : role.color; g.lineWidth = active ? 3 : 2.5;
    g.beginPath(); g.ellipse(o.x, o.y + 7, 13, 5.5, 0, 0, 7); g.stroke();
    if (active) { g.strokeStyle = role.color; g.lineWidth = 1.5; g.beginPath(); g.ellipse(o.x, o.y + 7, 16, 7, 0, 0, 7); g.stroke(); }
    const picked = R.select && R.select.kind === "mate" && R.select.id === o.id;
    if (picked) { g.strokeStyle = C.brand; g.lineWidth = 3; g.beginPath(); g.ellipse(o.x, o.y + 7, 17 + Math.sin(R.time * 8) * 2, 7.5, 0, 0, 7); g.stroke(); }
    const bob = o.moving ? -Math.abs(Math.sin(R.time * 12 + o.x * 0.1)) * 2 : 0;
    sprite(g, role.sprite, o.x, o.y + 6, 36, o.facing < 0, bob, o.stun > 0 ? 0.6 : null);
    if (o.order || picked) { g.fillStyle = C.brand; g.beginPath(); g.arc(o.x - 15, o.y - 30, 8, 0, 7); g.fill(); emoji(g, "👉", o.x - 15, o.y - 29.5, 10); }
    if (o.stun > 0) emoji(g, "😵‍💫", o.x, o.y - 38, 14);
    nameTag(g, o.x, o.y + 18 + (o.tagDy || 0), o.name || DF.t("roles." + o.role + ".name"), role.color);
    o.carry.forEach((tool, i) => {
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(o.x + 14 + i * 12, o.y - 26, 7, 0, 7); g.fill();
      emoji(g, DF.TOOLS[tool].icon, o.x + 14 + i * 12, o.y - 25.5, 9);
    });
    if (o.working) { g.strokeStyle = C.green; g.lineWidth = 2.5; g.beginPath(); g.arc(o.x, o.y - 12, 22 + Math.sin(R.time * 10) * 1.5, 0, 7); g.stroke(); }
    if (o.energy < 22 && o.stun <= 0) emoji(g, "💧", o.x - 14, o.y - 30 + Math.sin(R.time * 6) * 1.5, 10);
    if (o.talking > 0 && o.bubble >= 0) {
      const lines = R.banter || DF.t("banter");
      const txt = Array.isArray(lines) && lines.length ? lines[o.bubble % lines.length] : "?";
      g.font = "600 9px " + FONT;
      const w = Math.min(170, g.measureText(txt).width + 14);
      const bx = DF.clamp(o.x, w / 2 + 4, W - w / 2 - 4), by = o.y - 48;
      g.fillStyle = "#fff"; roundRect(g, bx - w / 2, by - 9, w, 18, 8); g.fill();
      g.strokeStyle = "rgba(0,0,0,.12)"; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.moveTo(o.x - 4, by + 8); g.lineTo(o.x, by + 14); g.lineTo(o.x + 4, by + 8); g.fill();
      g.fillStyle = C.ink; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(fit(g, txt, w - 10), bx, by + 0.5);
    }
  }

  function drawMurphy(g, m) {
    const bob = Math.sin(R.time * 16) * 1.4;
    sprite(g, "murphy", m.x, m.y + 6, 32, m.facing > 0, bob);
    if (m.state === "sabotage") for (let i = 0; i < 4; i++) { g.fillStyle = C.yellow; g.fillRect(m.x + 10 + Math.random() * 8, m.y - 16 + Math.random() * 14, 2, 2); }
    nameTag(g, m.x, m.y - 36 + bob, "MURPHY", "#7b3fbf");
  }

  function drawPostsHint(g, s) {
    if (!R.select || R.select.kind !== "vol") return;
    for (const id of DF.postsFor(s.evId)) {
      const st = ST[id];
      const pulse = 1 + Math.sin(R.time * 6) * 0.12;
      g.strokeStyle = C.green; g.lineWidth = 2; g.setLineDash([4, 3]);
      g.beginPath(); g.arc(st.px, st.py, 15 * pulse, 0, 7); g.stroke();
      g.setLineDash([]);
      g.fillStyle = "rgba(30,120,60,.95)"; g.font = "800 8px " + FONT; g.textAlign = "center"; g.textBaseline = "top";
      g.fillText(DF.t("posts." + id), st.px, st.py + 16);
    }
  }

  function drawEscorts(g, s) {
    const goal = (st, label) => {
      const pulse = 12 + Math.sin(R.time * 6) * 3;
      g.strokeStyle = C.green; g.lineWidth = 2.5;
      g.beginPath(); g.arc(st.px, st.py, pulse, 0, 7); g.stroke();
      g.fillStyle = C.green; g.font = "900 9px " + FONT; g.textAlign = "center"; g.textBaseline = "top";
      g.fillText(label, st.px, st.py + 15);
    };
    const line = (e, st) => {
      g.strokeStyle = "rgba(52,168,83,.75)"; g.lineWidth = 2; g.setLineDash([5, 5]); g.lineDashOffset = -R.time * 30;
      g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(st.px, st.py); g.stroke();
      g.setLineDash([]); g.lineDashOffset = 0;
    };
    for (const sp of s.speakers) if (sp.state === "escort") { const st = ST[DF.Sim.stageOf(sp.room)]; line(sp, st); goal(st, DF.t("ui.hud.stage")); }
    for (const d of s.critters || []) if (d.state === "follow") { const st = ST[d.dest] || ST.entrance; line(d, st); goal(st, d.kind === "kid" ? "🧸" : d.kind === "access" ? "♿" : "🚪"); }
  }

  function drawMarkers(g, s, view) {
    drawEscorts(g, s);
    const items = [];
    for (const pr of s.problems) {
      if (pr.done) continue;
      const [x, y] = DF.Sim.anchorOf(s, pr);
      items.push([y, () => {
        marker(g, s, pr, x, y);
        // part of a rush hour: a lightning badge, pulsing
        if (pr.rush) { const p = 1 + Math.sin(R.time * 9) * 0.12; g.fillStyle = C.brand; g.beginPath(); g.arc(x + 15, y - 46, 8 * p, 0, 7); g.fill(); emoji(g, "⚡", x + 15, y - 45.5, 10 * p); }
      }]);
    }
    items.sort((a, b) => a[0] - b[0]);
    for (const [, f] of items) f();
    const o = s.orgs.find((q) => q.id === view.activeOrg);
    if (o && o.path && o.path.length) {
      const last = o.path[o.path.length - 1];
      g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 1.5;
      g.beginPath(); g.arc(last[0], last[1], 5 + Math.sin(R.time * 8), 0, 7); g.stroke();
    }
  }

  function drawFire(g) {
    const a = 0.12 + Math.max(0, Math.sin(R.time * 9)) * 0.22;
    g.fillStyle = "rgba(234,67,53," + a + ")"; g.fillRect(0, 0, W, H - HUD - DF.RADIO_H);
    const x = W / 2, y = 120;
    g.save(); g.translate(x, y);
    g.fillStyle = "rgba(20,22,31,.88)"; roundRect(g, -150, -22, 300, 44, 10); g.fill();
    g.fillStyle = C.brand; g.font = "900 16px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("🚨 " + DF.t("chaos.firedrill.title"), 0, -5);
    g.fillStyle = "#fff"; g.font = "500 10px " + FONT; g.fillText(fit(g, DF.t("chaos.firedrill.text"), 280), 0, 12);
    g.restore();
  }

  // night falls over the venue between 10pm and 7am; the screens keep glowing
  function drawNight(g, s) {
    const h = (s.clock / 60) % 24;
    const a = h >= 22 || h < 1 ? 0.12 + ((h >= 22 ? h - 22 : h + 2) / 3) * 0.2 : h < 5 ? 0.32 : h < 7.5 ? 0.32 * (1 - (h - 5) / 2.5) : 0;
    if (a <= 0.01) return;
    g.fillStyle = "rgba(8,14,46," + a.toFixed(3) + ")";
    g.fillRect(0, 0, W, H - HUD - DF.RADIO_H);
    if (h >= 22 || h < 6) {
      g.fillStyle = "rgba(160,210,255," + (a * 0.35).toFixed(3) + ")";
      for (const [x, y] of [[ST.tableA.px, ST.tableA.py], [ST.tableL.px, ST.tableL.py], [ST.coffee.px, ST.coffee.py]]) { g.beginPath(); g.arc(x, y, 46, 0, 7); g.fill(); }
    }
  }

  // chaos: more than four fires at once — the frame itself starts to panic
  function drawPanic(g) {
    const ph = H - HUD - DF.RADIO_H;
    const a = 0.55 + Math.sin(R.time * 8) * 0.35;
    g.save();
    g.globalAlpha = a;
    const stripe = (x, y, w, h) => {
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      for (let i = -2; i < (w + h) / 12 + 2; i++) { g.fillStyle = i % 2 ? C.brand : "#111"; g.beginPath(); g.moveTo(x + i * 12 - h, y + h); g.lineTo(x + i * 12, y); g.lineTo(x + i * 12 + 12, y); g.lineTo(x + i * 12 + 12 - h, y + h); g.fill(); }
      g.restore();
    };
    stripe(0, 0, W, 5); stripe(0, ph - 5, W, 5); stripe(0, 0, 5, ph); stripe(W - 5, 0, 5, ph);
    g.restore();
  }

  // ----------------------------------------------------------------- fx
  function addFloater(x, y, text, color, big) { R.floaters.push({ x, y, text, color: color || C.ink, t: 0, big: !!big }); }

  // a volunteer served someone at their post: the nearest person gets it, the rating ticks up
  const ABILITY_ICON = { lead: "📣", tech: "🛠️", host: "🎙️", care: "🫶" };
  const SERVE_FX = { coffee: "☕", info: "💬", entrance: "👋", checkin: "🎫", sponsor1: "🤝", kids: "🧸", stageA: "🎤", stageB: "🎤", lab: "💡", tableA: "💡" };
  function serve(e) {
    const icon = SERVE_FX[e.post] || "✓";
    // a round of coffee is for a few people at once; an answer or a welcome for one
    const free = R.walkers.filter((w) => !w.leaving && !(w.itemT > 0)).map((w) => [w, Math.hypot(w.x - e.x, w.y - e.y)]).filter(([, d]) => d < 190).sort((a, b) => a[1] - b[1]);
    for (const [w, d] of free.slice(0, e.post === "coffee" ? 3 : 1)) {
      w.item = icon; w.itemT = e.post === "coffee" ? 24 : 5;
      if (d > 40 && (e.post === "coffee" || e.post === "info")) { w.tx = e.x + (Math.random() - 0.5) * 50; w.ty = e.y + 14 + Math.random() * 12; w.wait = 3; }
    }
    addFloater(e.x, e.y - 28, icon + (e.v > 0 ? " +" : ""), "#1e8e3e");
    if (e.v > 0) R.ratePulse = 0.8;
  }
  function burst(x, y, n, colors) {
    const cols = colors || [C.blue, C.red, C.yellow, C.green];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 120;
      R.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: 0, life: 0.6 + Math.random() * 0.6, c: cols[i % cols.length], r: 1.5 + Math.random() * 2 });
    }
  }
  function drawFx(g, dt) {
    for (let i = R.parts.length - 1; i >= 0; i--) {
      const p = R.parts[i];
      p.t += dt; p.vy += 220 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t > p.life) { R.parts.splice(i, 1); continue; }
      g.globalAlpha = 1 - p.t / p.life; g.fillStyle = p.c; g.fillRect(p.x, p.y, p.r * 2, p.r * 2);
    }
    g.globalAlpha = 1;
    for (let i = R.floaters.length - 1; i >= 0; i--) {
      const f = R.floaters[i];
      f.t += dt;
      if (f.t > 1.3) { R.floaters.splice(i, 1); continue; }
      g.globalAlpha = f.t < 1 ? 1 : 1 - (f.t - 1) / 0.3;
      g.font = (f.big ? "900 14px " : "800 11px ") + FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,.92)"; g.strokeText(f.text, f.x, f.y - 30 - f.t * 24);
      g.fillStyle = f.color; g.fillText(f.text, f.x, f.y - 30 - f.t * 24);
    }
    g.globalAlpha = 1;
  }

  // ----------------------------------------------------------------- HUD
  function drawHUD(g, s, view, L) {
    const HW = W / L.ui, compact = L.compact;
    g.fillStyle = C.ink; g.fillRect(0, 0, HW, HUD);
    g.fillStyle = C.brand; g.fillRect(0, HUD - 2, HW, 2);
    g.fillStyle = "#ffffff"; g.font = "700 24px " + MONO; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(DF.fmtClock(s.clock), 14, compact ? 24 : 19);
    if (!compact) {
    g.font = "500 10px " + FONT; g.fillStyle = "#aab4c8";
    g.fillText(fit(g, nowLabel(s), 190), 14, 38);
    const tx = 104, tw = 120, ty = 14, span = s.end - s.start;
    g.fillStyle = "rgba(255,255,255,.12)"; roundRect(g, tx, ty, tw, 8, 4); g.fill();
    for (const b of s.breaks) {
      const x0 = tx + (b.start - s.start) / span * tw, x1 = tx + (b.end - s.start) / span * tw;
      g.fillStyle = b.kind === "lunch" ? "rgba(255,210,63,.55)" : "rgba(255,255,255,.28)"; g.fillRect(x0, ty, x1 - x0, 8);
    }
    g.fillStyle = C.brand; roundRect(g, tx, ty, Math.max(8, tw * (s.clock - s.start) / span), 8, 4); g.fill();
    }

    const cx = compact ? 100 : 252, fb = 1 + 4 * s.sat / 100;
    if (R.ratePulse > 0) { g.strokeStyle = "rgba(52,168,83," + Math.min(1, R.ratePulse * 1.6) + ")"; g.lineWidth = 2; roundRect(g, cx - 6, 4, 146, 40, 8); g.stroke(); }
    if (R.rateBad > 0) { g.strokeStyle = "rgba(234,67,53," + Math.min(1, R.rateBad * 1.6) + ")"; g.lineWidth = 2; roundRect(g, cx - 6, 4, 146, 40, 8); g.stroke(); }
    R.rects.rating = { x: cx - 6, y: 3, w: 150, h: 42 };
    g.font = "700 9px " + FONT; g.fillStyle = "#aab4c8"; g.textAlign = "left";
    g.fillText(DF.t("ui.hud.sat"), cx, 12);
    for (let i = 0; i < 5; i++) {
      const fill = DF.clamp(fb - i, 0, 1);
      star(g, cx + 9 + i * 20, 31, 8.5, "rgba(255,255,255,.14)");
      if (fill > 0) { g.save(); g.beginPath(); g.rect(cx + i * 20, 20, 18 * fill + 0.5, 24); g.clip(); star(g, cx + 9 + i * 20, 31, 8.5, s.sat < 30 ? C.red : C.brand); g.restore(); }
    }
    g.font = "700 16px " + MONO; g.fillStyle = "#fff"; g.fillText(DF.fmtDec(fb), cx + 106, 31);
    if (s.panic && !view.attract) {
      const a = 0.6 + Math.sin(R.time * 10) * 0.4;
      g.globalAlpha = a; g.fillStyle = C.stamp; roundRect(g, HW / 2 - 34, HUD + 6, 68, 20, 4); g.fill();
      g.fillStyle = "#fff"; g.font = "900 12px " + FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(DF.t("ui.hud.panic"), HW / 2, HUD + 16.5); g.globalAlpha = 1; g.textAlign = "left";
    }

    // the three goals of the day: grey waiting, green done, red missed
    const goals = s.goals || [];
    const gx = compact ? 258 : 412;
    g.font = "700 9px " + FONT; g.fillStyle = "#aab4c8"; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(DF.t("ui.hud.goals"), gx, 12);
    goals.forEach((gl, i) => {
      const x = gx + 12 + i * 28, y = 31;
      g.fillStyle = gl.state === "ok" ? C.green : gl.state === "fail" ? "rgba(234,67,53,.45)" : "rgba(255,255,255,.12)";
      g.beginPath(); g.arc(x, y, 11.5, 0, 7); g.fill();
      g.globalAlpha = gl.state === "fail" ? 0.55 : 1; emoji(g, DF.GOALS[gl.id] || "🎯", x, y + 0.5, 12); g.globalAlpha = 1;
      if (gl.state !== "pending") {
        g.fillStyle = gl.state === "ok" ? "#fff" : C.red; g.beginPath(); g.arc(x + 8, y - 8, 5, 0, 7); g.fill();
        g.fillStyle = gl.state === "ok" ? C.green : "#fff"; g.font = "900 8px " + FONT; g.textAlign = "center"; g.fillText(gl.state === "ok" ? "✓" : "✗", x + 8, y - 7.5);
      }
    });
    R.rects.goals = { x: gx - 4, y: 3, w: Math.max(3, goals.length) * 28 + 8, h: 42 };

    if (!compact) {
      g.textAlign = "right"; g.textBaseline = "middle";
      g.font = "700 9px " + FONT; g.fillStyle = "#aab4c8"; g.fillText(DF.t("ui.hud.points"), 584, 12);
      g.font = "700 18px " + MONO; g.fillStyle = "#fff"; g.fillText(String(s.score), 584, 30);
      if (s.combo >= 2) { g.font = "800 10px " + FONT; g.fillStyle = C.brand; g.fillText(DF.t("ui.hud.combo", { n: s.combo }), 584, 43); }
    }

    R.hudBtns = [{ id: "pause", x: HW - 40, y: 8, w: 30, h: 30 }, { id: "mute", x: HW - 76, y: 8, w: 30, h: 30 }];
    // the role's ability: icon, and a shade that shrinks while it recharges
    const me = s.orgs.find((q) => q.id === view.activeOrg);
    R.rects.ability = null;
    if (me && !view.attract) {
      const b = { id: "ability", x: HW - 116, y: 6, w: 34, h: 34 }, cd = me.abCd || 0;
      R.hudBtns.push(b); R.rects.ability = { x: b.x, y: b.y, w: b.w, h: b.h };
      g.fillStyle = cd > 0 ? "rgba(255,255,255,.1)" : C.brand; roundRect(g, b.x, b.y, b.w, b.h, 9); g.fill();
      emoji(g, ABILITY_ICON[me.role] || "✨", b.x + b.w / 2, b.y + b.h / 2 + 1, 17);
      if (cd > 0) {
        g.fillStyle = "rgba(20,22,31,.6)"; g.beginPath(); g.moveTo(b.x + b.w / 2, b.y + b.h / 2);
        g.arc(b.x + b.w / 2, b.y + b.h / 2, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, cd / 60)); g.fill();
        g.fillStyle = "#fff"; g.font = "800 9px " + MONO; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(Math.ceil(cd) + "", b.x + b.w / 2, b.y + b.h - 6);
      }
    }
    for (const b of R.hudBtns) {
      if (b.id === "ability") continue;
      g.fillStyle = "rgba(255,255,255,.1)"; roundRect(g, b.x, b.y, b.w, b.h, 8); g.fill();
      g.fillStyle = "#fff";
      if (b.id === "pause") { g.fillRect(b.x + 10, b.y + 9, 4, 12); g.fillRect(b.x + 17, b.y + 9, 4, 12); }
      else emoji(g, DF.Audio && DF.Audio.muted ? "🔇" : "🔊", b.x + 15, b.y + 16, 14);
    }

    let x = compact ? 350 : 596;
    R.rects.energy = { x: x - 2, y: 6, w: 84, h: 34 };
    for (const o of s.orgs) {
      const role = ROLES[o.role];
      g.fillStyle = role.color; g.beginPath(); g.arc(x + 10, 22, 9, 0, 7); g.fill();
      g.fillStyle = "#fff"; g.font = "800 9px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText((o.name || DF.t("roles." + o.role + ".name")).slice(0, 2).toUpperCase(), x + 10, 22.5);
      if (view.activeOrg === o.id) { g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.beginPath(); g.arc(x + 10, 22, 11, 0, 7); g.stroke(); }
      const e = o.energy / 100;
      g.fillStyle = "rgba(255,255,255,.12)"; roundRect(g, x + 24, 16, 52, 6, 3); g.fill();
      g.fillStyle = e > 0.4 ? C.green : e > 0.2 ? C.yellow : C.red; roundRect(g, x + 24, 16, Math.max(6, 52 * e), 6, 3); g.fill();
      g.font = "500 8px " + FONT; g.fillStyle = "#aab4c8"; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(o.stun > 0 ? DF.t("ui.hud.forced") : DF.t("roles." + o.role + ".name"), x + 24, 31);
      o.carry.forEach((tool, i) => emoji(g, DF.TOOLS[tool].icon, x + 30 + i * 13, 41, 10));
      x += 92;
      if (x + 84 > HW - 120) break;
    }
  }

  function star(g, x, y, r, color) {
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }

  function nowLabel(s) {
    const c = s.clock;
    const br = s.breaks.find((b) => c >= b.start && c < b.end);
    if (br) return DF.t("breaks." + br.key);
    const first = s.sessions[0];
    if (first && c < first.start) return DF.t("ui.hud.open");
    const running = s.sessions.filter((se) => c >= se.start && c < se.end);
    if (running.length) return DF.t("talks." + (running.find((se) => se.room === "A") || running[0]).talk);
    const next = s.sessions.find((se) => se.start > c);
    return next ? DF.t("ui.hud.next", { t: DF.t("talks." + next.talk) }) : DF.t("ui.hud.end");
  }

  // ------------------------------------------- bottom bar: radio + chat
  const RADIO_COL = { info: "#4285F4", warn: "#F9AB00", alert: "#EA4335", ok: "#34A853", tip: "#a142f4" };
  function radio(text, kind, ttl) {
    const last = R.radio[R.radio.length - 1];
    if (last && last.text === text) { last.t = 0; return; }
    R.radio.push({ text, kind: kind || "info", t: 0, ttl: ttl || 4 });
    if (R.radio.length > 6) R.radio.shift();
  }

  function drawBar(g, s, view, dt, L) {
    const BW = W / L.ui, y0 = 0, mid = L.compact ? Math.round(BW * 0.47) : 470;
    R.rects.chat = { x: mid + 2, y: y0 + 1, w: BW - mid - 4, h: DF.RADIO_H - 2 };
    R.rects.radio = { x: 2, y: y0 + 1, w: mid - 4, h: DF.RADIO_H - 2 };
    g.fillStyle = C.ink; g.fillRect(0, y0, BW, DF.RADIO_H);
    g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(0, y0, BW, 1); g.fillRect(mid, y0 + 6, 1, DF.RADIO_H - 12);
    // left: the radio (game alerts)
    for (const m of R.radio) m.t += dt;
    while (R.radio.length > 1 && R.radio[0].t > Math.max(2.2, R.radio[0].ttl * (R.radio.length > 2 ? 0.45 : 1))) R.radio.shift();
    const cur = R.radio[0];
    if (cur) {
      g.globalAlpha = cur.t < 0.2 ? cur.t / 0.2 : cur.t > cur.ttl ? Math.max(0.4, 1 - (cur.t - cur.ttl)) : 1;
      g.fillStyle = RADIO_COL[cur.kind] || RADIO_COL.info; roundRect(g, 10, y0 + 9, 4, 22, 2); g.fill();
      g.fillStyle = "#eef2fb"; g.textAlign = "left"; g.textBaseline = "middle";
      g.font = "500 11.5px " + FONT;
      const lines = wrap(g, cur.text, mid - 34, 2);
      if (lines.length === 1) g.fillText(lines[0], 22, y0 + 20);
      else { g.fillText(lines[0], 22, y0 + 13); g.fillText(lines[1], 22, y0 + 27); }
      g.globalAlpha = 1;
    }
    // right: the staff chat
    R.chips = null;
    const open = s.chat.filter((m) => m.open);
    const x0 = mid + 10, w0 = BW - x0 - 10;
    if (open.length) {
      const m = open[0];
      const left = Math.max(0, Math.min(1, (m.deadline - s.t) / (m.span || DF.CHAT_ACTS[m.tpl].deadline || 12)));
      const pulse = 0.5 + Math.sin(R.time * 8) * 0.5;
      g.fillStyle = "rgba(255,210,63," + (0.12 + pulse * 0.1) + ")"; roundRect(g, x0 - 4, y0 + 3, w0 + 8, DF.RADIO_H - 6, 8); g.fill();
      g.fillStyle = C.brand; g.fillRect(x0 - 4, y0 + DF.RADIO_H - 5, (w0 + 8) * left, 2);
      emoji(g, DF.CHAT_FROM[DF.CHAT_ACTS[m.tpl].from] || "💬", x0 + 8, y0 + 13, 12);
      g.textAlign = "left"; g.textBaseline = "middle";
      g.font = "800 10px " + FONT; g.fillStyle = C.brand;
      const from = fit(g, m.from, 120);
      g.fillText(from, x0 + 18, y0 + 12);
      const fw = g.measureText(from).width;
      g.font = "500 10.5px " + FONT; g.fillStyle = "#eef2fb";
      g.fillText(fit(g, m.text, w0 - fw - 30), x0 + 24 + fw, y0 + 12);
      R.chips = [];
      const cw = (w0 - 30) / 2;
      m.replies.forEach((label, i) => {
        const cx = x0 + 4 + i * (cw + 6), cy = y0 + 21, ch = 15;
        g.fillStyle = i === 0 ? C.brand : "rgba(255,255,255,.14)"; roundRect(g, cx, cy, cw, ch, 7); g.fill();
        g.fillStyle = i === 0 ? C.ink : "#fff"; g.font = "700 9.5px " + FONT; g.textAlign = "center";
        g.fillText(fit(g, (i === 0 ? "Q · " : "E · ") + label, cw - 8), cx + cw / 2, cy + ch / 2 + 0.5);
        R.chips.push({ id: m.id, i, x: cx, y: cy, w: cw, h: ch });
      });
      if (open.length > 1) { g.fillStyle = C.stamp; g.beginPath(); g.arc(BW - 14, y0 + 9, 7, 0, 7); g.fill(); g.fillStyle = "#fff"; g.font = "800 8px " + MONO; g.textAlign = "center"; g.fillText("+" + (open.length - 1), BW - 14, y0 + 9.5); }
    } else {
      const last = s.chat[s.chat.length - 1];
      g.font = "700 9px " + FONT; g.fillStyle = "#6f7c96"; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText("💬 " + DF.t("ui.hud.chat"), x0, y0 + 11);
      if (last) {
        const age = s.t - (last.t || 0);
        g.globalAlpha = age < 6 ? 1 : 0.55;
        g.font = "800 10px " + FONT; g.fillStyle = "#cfd6e6";
        const from = fit(g, last.from, 120);
        g.fillText(from, x0, y0 + 27);
        const fw = g.measureText(from).width;
        g.font = "500 10.5px " + FONT; g.fillStyle = "#eef2fb";
        g.fillText(fit(g, last.text, w0 - fw - 10), x0 + fw + 6, y0 + 27);
        g.globalAlpha = 1;
      }
    }
  }

  function wrap(g, text, maxW, maxLines) {
    const words = String(text).split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; if (lines.length === maxLines) break; }
      else cur = t;
    }
    if (lines.length < maxLines && cur) lines.push(cur);
    if (lines.length === maxLines) {
      let l = lines[maxLines - 1];
      const rest = words.join(" ");
      if (!rest.endsWith(l)) { while (l.length > 3 && g.measureText(l + "…").width > maxW) l = l.slice(0, -1); lines[maxLines - 1] = l + "…"; }
    }
    return lines;
  }

  // ------------------------------------------------------------ tool tray
  function drawToolTray(g, s, view) {
    R.tray = null;
    const o = s.orgs.find((q) => q.id === view.activeOrg);
    if (!o || !s.lo.tools || Math.hypot(o.x - ST.box.px, o.y - ST.box.py) > DF.Sim.ACT_R + 10) return;
    const tools = Object.keys(DF.TOOLS);
    // in the right half of the control room: the hall stays visible and the
    // organizer standing at the box (left half) is never covered
    const bw = 50, bh = 38, gap = 4, cols = 2;
    const x0 = (ST.box.x + 1.2) * T, y0 = (ST.box.y - 1.4) * T + 14;
    R.tray = [];
    g.fillStyle = "rgba(20,22,31,.94)"; roundRect(g, x0 - 4, y0 - 16, cols * (bw + gap) + 4, Math.ceil(tools.length / cols) * (bh + gap) + 18, 10); g.fill();
    g.fillStyle = "#aab4c8"; g.font = "700 8px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(fit(g, DF.t("ui.lo.box").toUpperCase(), cols * (bw + gap) - 6), x0 + 2, y0 - 7);
    tools.forEach((id, i) => {
      const x = x0 + (i % cols) * (bw + gap), y = y0 + Math.floor(i / cols) * (bh + gap);
      const inBox = !!s.lo.tools[id], have = o.carry.includes(id);
      g.globalAlpha = inBox ? 1 : 0.35;
      g.fillStyle = have ? "#d7f5df" : "#ffffff"; roundRect(g, x, y, bw, bh, 8); g.fill();
      emoji(g, DF.TOOLS[id].icon, x + bw / 2, y + 13, 14);
      g.fillStyle = C.ink; g.font = "700 7.5px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(fit(g, inBox ? DF.t("tools." + id + ".name") : DF.t("ui.hud.missing"), bw - 4), x + bw / 2, y + 29);
      g.globalAlpha = 1;
      R.tray.push({ id, x, y, w: bw, h: bh, inBox });
    });
  }

  // ------------------------------------------------------------ picking
  function pick(s, lx, ly, opts) {
    opts = opts || {};
    const L = R.L || layoutFor({});
    const pad = R.touch ? 6 : 0;
    const inRect = (b, x, y, p) => x >= b.x - p && x <= b.x + b.w + p && y >= b.y - p && y <= b.y + b.h + p;
    for (const b of R.hudBtns || []) if (inRect(b, lx, ly, pad)) return { kind: "hud", ref: b.id };
    for (const b of R.chips || []) if (inRect(b, lx, ly, 4 + pad)) return { kind: "reply", ref: b.id, i: b.i };
    for (const e of R.edges || []) if (Math.hypot(lx - e.x, ly - e.y) < e.r) return { kind: "problem", ref: e.pr, edge: true };
    if (ly < L.mapY || ly > L.mapY + L.mapH) return { kind: "none" };
    const [wx, y] = toWorld(lx, ly, L);
    for (const b of R.tray || []) if (inRect(b, wx, y, pad / L.Z)) return { kind: "tool", ref: b.id, inBox: b.inBox };
    const K = R.touchK;
    let best = null, bd = 1e9;
    // the nearest thing wins; problems a little more, they're what you came for
    const consider = (kind, ref, px, py, r, bias) => { const d = Math.hypot(wx - px, y - py) * (bias || 1); if (d < r * K && d < bd) { bd = d; best = { kind, ref }; } };
    for (const pr of s.problems) {
      if (pr.done) continue;
      const [x, yy] = DF.Sim.anchorOf(s, pr);
      consider("problem", pr, x, yy - (P[pr.type].kind === "escort" ? 44 : 34), 20, 0.85);
      consider("problem", pr, x, yy - 10, 18, 0.85);
    }
    for (const sp of s.speakers) if (sp.state === "lost") consider("speaker", sp, sp.x, sp.y - 12, 20);
    for (const d of s.critters || []) if (d.state === "roam") consider("critter", d, d.x, d.y - 6, 20);
    if (s.murphy && s.murphy.state !== "gone") consider("murphy", s.murphy, s.murphy.x, s.murphy.y - 12, 24);
    if (opts.volunteers !== false) for (const v of s.vols) consider("vol", v, v.x, v.y - 12, 18);
    for (const o of s.orgs) {
      if ((opts.selves || []).includes(o.id)) consider("self", o, o.x, o.y - 12, 18);
      else if ((opts.mates || []).includes(o.id)) consider("mate", o, o.x, o.y - 12, 18);
    }
    if (R.select && R.select.kind === "vol") for (const id of DF.postsFor(s.evId)) consider("post", id, ST[id].px, ST[id].py, 24);
    if (best) return Object.assign(best, { x: wx, y });
    consider("box", "box", ST.box.px - 18, ST.box.py, 26);
    consider("desk", "checkin", ST.checkin.px, ST.checkin.py, 22);
    if (best) return Object.assign(best, { x: wx, y });
    return { kind: "floor", x: wx, y };
  }

  DF.Render = { init, resize, draw, toLogical, pick, addFloater, burst, radio, serve, spotScreen, ABILITY_ICON, R, roundRect, emoji, sprite, IMG, C };
})();
