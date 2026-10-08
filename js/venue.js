/* venue.js: the venues — tile map, rooms, stations, pathfinding.
 * Pure data + geometry: no DOM, loads in Node for the playtest.
 *
 * The station contract: every venue has the same 22 stations and the same
 * room ids (A, B, L, H, R, S, E, K) in different places, so the sim, the bots
 * and the problems work anywhere. DF.Venue.use(id) swaps the map in place:
 * the objects other modules hold (STATIONS, ROOMS, SEATS, MAP) stay the same. */
"use strict";

(function () {
  const T = DF.TILE, COLS = DF.COLS, ROWS = DF.ROWS;

  // 40 x 18 tiles, built from segments so every row is exactly 40 wide.
  // Legend:
  //  #  wall            A B L  Aula Magna / Aula B / Lab floor
  //  H  hall            R S E K  Regia / Speaker room / Expo / Check-in
  //  d  door            p  stage (walkable, drawn raised)
  //  s  seats           t  lab tables    c  counter/desk
  //  x  Scatola GDG     r  router rack   f  sofa
  //  k  sponsor stand   w  coffee table   q  breaker panel
  function row(segments) {
    const s = segments.join("");
    if (s.length !== COLS) throw new Error("venue row width " + s.length + ": " + s);
    return s;
  }
  const rep = (ch, n) => ch.repeat(n);
  const A_SEATS = ["A", "ssssss", "AA", "ssssss", "A"];         // cols 1-16
  const B_SEATS = ["B", "sss", "BB", "sss", "B"];                 // cols 18-27
  const L_TABLES = ["L", "ttt", "LL", "ttt", "L"];                // cols 29-38
  const UNI = [
    row([rep("#", 40)]),                                                                   // 0
    row(["#", "AAA", rep("p", 10), "AAA", "#", "B", rep("p", 8), "B", "#", rep("L", 10), "#"]), // 1 stages
    row(["#", rep("A", 16), "#", rep("B", 10), "#", ...L_TABLES, "#"]),                     // 2
    row(["#", ...A_SEATS, "#", ...B_SEATS, "#", ...L_TABLES, "#"]),                         // 3
    row(["#", ...A_SEATS, "#", ...B_SEATS, "#", rep("L", 10), "#"]),                         // 4
    row(["#", ...A_SEATS, "#", ...B_SEATS, "#", ...L_TABLES, "#"]),                         // 5
    row(["#", ...A_SEATS, "#", ...B_SEATS, "#", ...L_TABLES, "#"]),                         // 6
    row([rep("#", 8), "dd", rep("#", 6), "d", rep("#", 5), "dd", rep("#", 9), "dd", rep("#", 5)]), // 7 doors
    row(["#", rep("H", 17), "www", rep("H", 15), "cc", "H", "#"]),                          // 8 coffee, info
    row(["#", rep("H", 38), "#"]),                                                         // 9
    row(["#", rep("H", 38), "#"]),                                                         // 10
    row(["#", "###", "dd", "###", "#", "##", "dd", "###", "#", rep("E", 10), "#", rep("K", 10), "#"]), // 11
    row(["#", "xx", "RRRR", "rr", "#", rep("S", 6), "c", "#", rep("E", 10), "#", "K", "c", rep("K", 8), "#"]), // 12
    row(["#", "xx", rep("R", 6), "#", rep("S", 6), "c", "#", rep("E", 10), "#", "K", "c", rep("K", 8), "#"]), // 13
    row(["#", rep("R", 8), "#", rep("S", 7), "#", rep("E", 10), "#", "K", "c", rep("K", 8), "#"]), // 14
    row(["#", rep("R", 7), "q", "#", "S", "ffff", "SS", "#", "E", "kk", "EEE", "kk", "EE", "#", rep("K", 10), "#"]), // 15 breaker panel
    row(["#", "RRR", "cc", "RR", "q", "#", "S", "ffff", "SS", "#", "E", "kk", "EEE", "kk", "EE", "#", rep("K", 10), "#"]), // 16 AV desk
    row([rep("#", 33), "ddd", rep("#", 4)]),                                               // 17 entrance
  ];

  // The coworking: one big event room, a glass meeting room as the lab, an open
  // space with desks, the reception in the middle and a kitchen with real coffee.
  const B_ROWS = ["B", "ssss", "BB", "ssss", "BB", "ssss", "BBB"];   // cols 1-20
  const L_DESKS = ["L", "ttt", "L", "ttt", "L", "ttt", "L"];          // cols 26-38
  const COWORK = [
    row([rep("#", 40)]),                                                                         // 0
    row(["#", "BBB", rep("p", 10), rep("B", 7), "#", "AAA", "#", rep("L", 13), "#"]),            // 1 stage
    row(["#", rep("B", 20), "#", "AAA", "#", ...L_DESKS, "#"]),                                  // 2
    row(["#", ...B_ROWS, "#", "AAA", "#", rep("L", 13), "#"]),                                   // 3
    row(["#", ...B_ROWS, "#", "AAA", "#", ...L_DESKS, "#"]),                                     // 4
    row(["#", ...B_ROWS, "#", "AAA", "#", rep("L", 13), "#"]),                                   // 5
    row(["#", ...B_ROWS, "#", "AAA", "#", ...L_DESKS, "#"]),                                     // 6
    row([rep("#", 12), "dd", rep("#", 9), "d", rep("#", 6), "d", rep("#", 9)]),                  // 7 doors (on the aisles)
    row(["#", rep("H", 38), "#"]),                                                               // 8
    row(["#", "HHHH", "tt", rep("H", 6), "tt", rep("H", 13), "tt", rep("H", 9), "#"]),           // 9 desks
    row(["#", rep("H", 38), "#"]),                                                               // 10
    row(["#", "##", "dd", "##", "#", "##", "dd", "###", "#", rep("K", 10), "#", rep("E", 12), "#"]), // 11
    row(["#", "xx", "RR", "rr", "#", rep("S", 7), "#", "K", "c", rep("K", 8), "#", "E", "www", rep("E", 8), "#"]), // 12 coffee bar
    row(["#", "xx", "RRRR", "#", rep("S", 7), "#", "K", "c", rep("K", 8), "#", rep("E", 12), "#"]), // 13
    row(["#", rep("R", 6), "#", "S", "ff", "SSSS", "#", "K", "c", rep("K", 8), "#", "E", "kk", rep("E", 6), "kk", "E", "#"]), // 14
    row(["#", rep("R", 5), "q", "#", "S", "ff", "SSSS", "#", rep("K", 10), "#", rep("E", 12), "#"]), // 15
    row(["#", "RR", "cc", "RR", "#", rep("S", 7), "#", rep("K", 10), "#", rep("E", 12), "#"]),  // 16 AV desk
    row([rep("#", 20), "ddd", rep("#", 17)]),                                                    // 17 entrance
  ];

  const VENUES = {
    uni: {
      map: UNI,
      rooms: {
        A: { x0: 1, y0: 1, x1: 16, y1: 6, cap: 96 }, B: { x0: 18, y0: 1, x1: 27, y1: 6, cap: 48 }, L: { x0: 29, y0: 1, x1: 38, y1: 6, cap: 24 },
        H: { x0: 1, y0: 8, x1: 38, y1: 10 }, R: { x0: 1, y0: 12, x1: 8, y1: 16 }, S: { x0: 10, y0: 12, x1: 16, y1: 16 },
        E: { x0: 18, y0: 11, x1: 27, y1: 16 }, K: { x0: 29, y0: 11, x1: 38, y1: 16 },
      },
      stations: {
        stageA: [9, 2.5], stageB: [23, 2.5], lab: [34, 4.5], doorA: [9, 8.5], doorB: [23, 8.5], coffee: [19.5, 9.5], info: [37, 9.5],
        sponsor1: [20, 14.5], sponsor2: [25, 14.5], checkin: [29.5, 13.5], entrance: [34.5, 16.5], box: [3.5, 13], router: [7.5, 13.5],
        phone: [5, 15.5], av: [5, 15.5], quadro: [7.4, 15.6], green: [13, 13.5], hall: [9, 9.5], expo: [22.5, 12.5], kids: [26, 12.5],
        tableA: [8.5, 4.5], tableL: [33.5, 3.5],
      },
      // what the renderer draws: stages, projector screens (top wall), the lab's whiteboard, labels, the lab door
      look: {
        stages: { A: [4, 1, 10], B: [19, 1, 8] }, screens: { A: [5.5, 7], B: [20, 6] }, board: [30, 8], doorL: [34, 7.17],
        labels: { A: [1, 6.35, 1], B: [18, 6.35, 1], L: [29, 1], H: [1, 8], R: [4.2, 14.3, 1], S: [10, 12], E: [21.4, 15.3], K: [32, 11.2] },
      },
      fx: {},
    },
    cowork: {
      map: COWORK,
      rooms: {
        A: { x0: 22, y0: 1, x1: 24, y1: 6, cap: 6 }, B: { x0: 1, y0: 1, x1: 20, y1: 6, cap: 44 }, L: { x0: 26, y0: 1, x1: 38, y1: 6, cap: 22 },
        H: { x0: 1, y0: 8, x1: 38, y1: 10 }, R: { x0: 1, y0: 12, x1: 6, y1: 16 }, S: { x0: 8, y0: 12, x1: 14, y1: 16 },
        E: { x0: 27, y0: 11, x1: 38, y1: 16 }, K: { x0: 16, y0: 11, x1: 25, y1: 16 },
      },
      stations: {
        stageA: [23, 2.5], stageB: [8.5, 2.5], lab: [32, 3.5], doorA: [23, 8.5], doorB: [12.5, 8.5], coffee: [29.5, 13.5], info: [16.5, 9.5],
        sponsor1: [29.5, 15.5], sponsor2: [36, 15.5], checkin: [16.5, 13.5], entrance: [21.5, 16.5], box: [3.5, 13], router: [5.5, 13.5],
        phone: [3.5, 15.5], av: [3.5, 15.5], quadro: [5.4, 15.6], green: [11, 13.5], hall: [9, 10.5], expo: [33, 12.5], kids: [37, 12.5],
        tableA: [23, 1.5], tableL: [31.5, 3.5],
      },
      look: {
        stages: { B: [4, 1, 10] }, screens: { B: [5.5, 7] }, board: [28, 8], doorL: [30.5, 7.17],
        labels: { A: [22, 6.2, 1], B: [1, 6.35, 1], L: [26, 1], H: [1, 8], R: [1, 14.3, 1], S: [8, 12], E: [32, 16.2], K: [19, 11.2] },
      },
      // the trade-off: steady Wi-Fi and a real coffee machine, small rooms
      fx: { wifi: 0.35, coffeeCap: 1.5 },
    },
  };
  for (const id in VENUES) if (VENUES[id].map.length !== ROWS) throw new Error("venue rows " + id);

  const MAP = UNI.slice();

  const SOLID = new Set(["#", "s", "t", "c", "x", "r", "f", "k", "w", "q"]);

  const walk = new Uint8Array(COLS * ROWS);
  function buildWalk() {
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        walk[y * COLS + x] = SOLID.has(MAP[y][x]) ? 0 : 1;
  }
  buildWalk();

  const isWalk = (tx, ty) => tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS && walk[ty * COLS + tx] === 1;

  // World coordinates: pixels inside the play area (the HUD sits above it).
  const tc = (tx) => tx * T + T / 2;            // tile centre
  const toTile = (px) => Math.floor(px / T);

  const ROOMS = {};
  for (const k in VENUES.uni.rooms) ROOMS[k] = Object.assign({ id: k }, VENUES.uni.rooms[k]);

  function roomAt(px, py) {
    const tx = toTile(px), ty = toTile(py);
    for (const k in ROOMS) {
      const r = ROOMS[k];
      if (tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1) return k;
    }
    return "H"; // doors count as hall
  }

  // Stations: where problems appear and where people stand to act.
  // (x, y) is the stand point (walkable), in tiles; px/py filled below.
  const STATIONS = {
    stageA:   { name: "Palco Aula Magna", room: "A", x: 9, y: 2.5 },
    stageB:   { name: "Palco Aula B", room: "B", x: 23, y: 2.5 },
    lab:      { name: "Lab", room: "L", x: 34, y: 4.5 },
    doorA:    { name: "Ingresso Aula Magna", room: "H", x: 9, y: 8.5 },
    doorB:    { name: "Ingresso Aula B", room: "H", x: 23, y: 8.5 },
    coffee:   { name: "Caffè", room: "H", x: 19.5, y: 9.5 },
    info:     { name: "Info point", room: "H", x: 37, y: 9.5 },
    sponsor1: { name: "Stand sponsor", room: "E", x: 20, y: 14.5 },
    sponsor2: { name: "Stand sponsor", room: "E", x: 25, y: 14.5 },
    checkin:  { name: "Check-in", room: "K", x: 29.5, y: 13.5 },
    entrance: { name: "Ingresso", room: "K", x: 34.5, y: 16.5 },
    box:      { name: "Scatola del GDG", room: "R", x: 3.5, y: 13 },
    router:   { name: "Armadio rete", room: "R", x: 7.5, y: 13.5 },
    phone:    { name: "Banco regia", room: "R", x: 5, y: 15.5 },
    av:       { name: "Banco regia", room: "R", x: 5, y: 15.5 },
    quadro:   { name: "Quadro elettrico", room: "R", x: 7.4, y: 15.6 },
    green:    { name: "Sala speaker", room: "S", x: 13, y: 13.5 },
    hall:     { name: "Hall", room: "H", x: 9, y: 9.5 },
    expo:     { name: "Expo", room: "E", x: 22.5, y: 12.5 },
    kids:     { name: "Spazio bimbi", room: "E", x: 26, y: 12.5 },
    tableA:   { name: "Tavoli Aula Magna", room: "A", x: 8.5, y: 4.5 },
    tableL:   { name: "Tavoli Lab", room: "L", x: 33.5, y: 3.5 },
  };
  function placeStations(v) {
    for (const k in STATIONS) {
      const s = STATIONS[k], at = v.stations[k];
      if (!at) throw new Error("station missing in venue: " + k);
      s.id = k; s.x = at[0]; s.y = at[1];
      s.px = s.x * T; s.py = s.y * T;
      s.room = roomAt(s.px, s.py);
      if (!isWalk(toTile(s.px), toTile(s.py))) throw new Error("station on solid tile: " + k);
    }
  }
  placeStations(VENUES.uni);

  // ---- A* on the tile grid, 8-neighbour without corner cutting ----
  const N = COLS * ROWS;
  const gScore = new Float32Array(N), fScore = new Float32Array(N);
  const came = new Int32Array(N), closed = new Uint8Array(N), openMark = new Uint8Array(N);

  function nearestWalkable(tx, ty) {
    if (isWalk(tx, ty)) return [tx, ty];
    for (let r = 1; r < 6; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && isWalk(tx + dx, ty + dy)) return [tx + dx, ty + dy];
    return [tx, ty];
  }

  function astar(sx, sy, gx, gy) {
    [sx, sy] = nearestWalkable(sx, sy);
    [gx, gy] = nearestWalkable(gx, gy);
    const start = sy * COLS + sx, goal = gy * COLS + gx;
    if (start === goal) return [[sx, sy]];
    gScore.fill(Infinity); closed.fill(0); openMark.fill(0); came.fill(-1);
    const open = [start];
    gScore[start] = 0;
    fScore[start] = Math.hypot(gx - sx, gy - sy);
    openMark[start] = 1;
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1]; open.pop();
      openMark[cur] = 0;
      if (cur === goal) break;
      closed[cur] = 1;
      const cx = cur % COLS, cy = (cur / COLS) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!isWalk(nx, ny)) continue;
        if (dx && dy && (!isWalk(cx + dx, cy) || !isWalk(cx, cy + dy))) continue;
        const ni = ny * COLS + nx;
        if (closed[ni]) continue;
        const g = gScore[cur] + (dx && dy ? 1.4142 : 1);
        if (g < gScore[ni]) {
          came[ni] = cur; gScore[ni] = g;
          fScore[ni] = g + Math.hypot(gx - nx, gy - ny);
          if (!openMark[ni]) { open.push(ni); openMark[ni] = 1; }
        }
      }
    }
    if (came[goal] === -1) return null;
    const out = [];
    for (let c = goal; c !== -1; c = came[c]) out.push([c % COLS, (c / COLS) | 0]);
    return out.reverse();
  }

  // Line of sight on the grid (sampled), used to smooth paths.
  function clearLine(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(d / (T * 0.25));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      // check a small box around the point so bodies don't clip corners
      for (const [ox, oy] of [[-6, -6], [6, -6], [-6, 6], [6, 6]])
        if (!isWalk(toTile(x + ox), toTile(y + oy))) return false;
    }
    return true;
  }

  // Path in pixel coordinates from (ax, ay) to (bx, by), smoothed.
  function findPath(ax, ay, bx, by) {
    const tiles = astar(toTile(ax), toTile(ay), toTile(bx), toTile(by));
    if (!tiles) return null;
    const pts = tiles.map(([x, y]) => [tc(x), tc(y)]);
    // replace last point with the exact target if it's walkable
    if (isWalk(toTile(bx), toTile(by))) pts[pts.length - 1] = [bx, by];
    pts[0] = [ax, ay];
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !clearLine(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  // Random walkable point inside a room, for wandering people.
  function randomPointIn(roomId, rng) {
    const r = ROOMS[roomId];
    for (let k = 0; k < 40; k++) {
      const tx = Math.floor(rng.range(r.x0, r.x1 + 1)), ty = Math.floor(rng.range(r.y0, r.y1 + 1));
      if (isWalk(tx, ty)) return [tc(tx) + rng.range(-6, 6), tc(ty) + rng.range(-6, 6)];
    }
    return [tc(r.x0), tc(r.y0)];
  }

  // Seat slots per room, two people per seat tile, front rows first.
  const SEATS = { A: [], B: [], L: [] };
  function buildSeats() {
    for (const k in SEATS) SEATS[k].length = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const ch = MAP[y][x];
      const room = roomAt(tc(x), tc(y));
      if (ch === "s" && SEATS[room]) {
        SEATS[room].push([x * T + 6, y * T + 12], [x * T + 18, y * T + 12]);
      } else if (ch === "t" && room === "L") {
        SEATS.L.push([x * T + 12, y * T + 2]);
      }
    }
    for (const k in SEATS) { const r = ROOMS[k], cx = (r.x0 + r.x1 + 1) / 2 * T; SEATS[k].sort((a, b) => a[1] - b[1] || Math.abs(a[0] - cx) - Math.abs(b[0] - cx)); }
  }
  buildSeats();

  // swap the venue in place (the sim calls it when a day starts)
  let current = "uni";
  function use(id) {
    const v = VENUES[id] || VENUES.uni;
    id = VENUES[id] ? id : "uni";
    if (id === current) return id;
    MAP.length = 0; v.map.forEach((r) => MAP.push(r));
    buildWalk();
    for (const k in ROOMS) Object.assign(ROOMS[k], v.rooms[k]);
    placeStations(v);
    buildSeats();
    current = id;
    return id;
  }
  // check every venue once: stations on walkable tiles, rows the right width
  for (const id of Object.keys(VENUES)) use(id);
  use("uni");

  DF.Venue = {
    MAP, ROOMS, STATIONS, SEATS, use, IDS: Object.keys(VENUES),
    get id() { return current; },
    get look() { return VENUES[current].look; },
    get fx() { return VENUES[current].fx; },
    isWalk, toTile, tc, roomAt, findPath, randomPointIn, nearestWalkable,
    tileAt: (tx, ty) => (tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS ? MAP[ty][tx] : "#"),
  };
})();
