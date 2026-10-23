/* D1 판 규칙: 칸(5×7) + 문 토큰 + 탐험 이동 (화면 그리기 없음). 판 데이터는 battle_data.js GRID_BOARDS
 *
 *  3차(2026-10-24, docs/DESIGN_D1_DOORS.md): 옛 "여러 칸 구역 + 정해진 다음 구역(EXITS)" 판을 "칸(방) + 문 토큰"으로 바꿈.
 *  - 칸 id = 층 번호(1층 생략) + 열 글자 A~E + 행 숫자 1~7 ('C4', '2C4'). 1칸 = 1방(방 id = 칸 id). 입구 칸 = 방 'E'('2E'), 보물방 칸 = 방 'B'('2B'),
 *    고정 구역은 여러 칸 방 (판 데이터 rooms, 예 'FZ1' = B4·C4·D4). 야외 'Y'(문 없음).
 *  - 벽 조각(edge) id = 이웃한 두 칸 id를 위->아래·왼->오른 순서로 '-'로 이음 ('C2-C3', 'B3-C3'). 같은 방 안쪽 칸 사이는 벽 조각이 아님.
 *    문 = 벽 조각 하나에 열린 통로 (양방향). 문 배치는 progress.js RUN.site.doors { 층: [벽 조각 id] }. 층마다 문 수 = 판의 처음 문 수 (토큰 수 고정)
 *  - 계단: 위층 'B' -> 아래층 입구 (문 토큰 아님, 층이 열려 있을 때만)
 *  - 탐험(exploreRoute, 실험 prototype/door_lab/lab.js 규칙 그대로): 안 가 본 이웃 방부터, 그중 미끼 방 우선 -> 분대 습관(번호 % 3: 왼쪽·오른쪽·아래) 60% ->
 *    나머지 무작위(분대·방·갈림 순서로 만든 시드). 막히면 아는 방들로 가장 짧은 길로 되돌아감(맵핑, 같은 거리면 최근 방문). 보물방(층 맨 아래)에 들어가면 끝.
 *    층마다 따로 탐험 (2층은 가 본 방 기록을 비우고 2층 입구부터). 몬스터 든 대기실을 "보여서 피함"은 없음 (12절 9-1). 같은 배치 + 같은 시드 = 같은 길
 *  - 통과 비율·함정 횟수·문 통과 수(passInfo)는 고정 시드 GRID.previewSeeds × 습관 3 = 경로 12개로 셈 -> 전투력(B안)·문 위 숫자·한도 검사가 같은 계산
 *  - 상태는 지금 배치(판·층·열린 층·문)만. 시설 {방: 시설}·부대는 progress.js RUN.site
 *  - 옛 이름 호환 (화면이 아직 부름): MAP(1층 칸 배열 = 방 id) · NAMES · CELLS · ALL · ORDER · EXITS(문으로 이어진 이웃) · flowPairs · sharedEdge · anchorOf · doorOf · boardInfo · useBoard
 */
(function () {
  'use strict';

  var BD = window.BATTLE_DATA || {};
  var G = BD.GRID || { cols: 5, rows: 7, colLetters: 'ABCDE', colNames: ['A', 'B', 'C', 'D', 'E'], inspect: 0.6, habit: 0.6, speedBoost: 1.5, trapMax: 2, passLimit: 30, previewSeeds: [1, 2, 3, 4], nextFloorTime: 30 };
  var GB = BD.GRID_BOARDS || {};
  var COLS = G.cols, ROWS = G.rows, LETTERS = G.colLetters;
  var TRAP_PER_CELL = 6;          // 함정 복도: 칸당 피해
  var PREVIEW_INVADERS = 20;      // 문 위 숫자를 계산할 침입자 수 (평소 전투 = 분대 2개 × 10명)
  var FLOOR_GAP = 1;              // 층 사이 빈 줄 (계단 자리, 전투 화면 좌표용)
  var BOARD_IDS = Object.keys(GB);
  var DEFAULT_BOARD = BOARD_IDS[0] || 'g1';
  var HABIT_DIRS = ['left', 'right', 'down'];   // 분대 번호 % 3

  var FAC = {
    forest: { name: '숲', short: '숲', cost: 0, value: 0, kind: 'none', st: '아무 일 없음', for: 'yard' },
    thorn: { name: '덫 숲', short: '덫 숲', cost: 20, value: 10, kind: 'none', st: '들어오기 전 전원 -8', for: 'yard' },
    split: { name: '입구', short: '입구', cost: 0, value: 0, kind: 'turn', st: '침입자가 여기서 탐험을 시작해요', for: 'entry' },
    wait: { name: '대기', short: '대기', cost: 10, value: 0, kind: 'turn', st: '(문 토큰 판에서는 안 씀)', for: 'entry', turn: 'wait' },
    left: { name: '굽은길 ←', short: '굽은길←', cost: 10, value: 0, kind: 'turn', st: '(문 토큰 판에서는 안 씀)', for: 'entry', turn: 'left' },
    right: { name: '굽은길 →', short: '굽은길→', cost: 10, value: 0, kind: 'turn', st: '(문 토큰 판에서는 안 씀)', for: 'entry', turn: 'right' },
    empty: { name: '빈 방', short: '빈 방', perCell: 0, value: 0, kind: 'none', st: '그냥 지나감', for: 'room' },
    lure: { name: '미끼', short: '미끼', cost: 20, value: 0, kind: 'lure', st: '보물 냄새: 갈림길에서 안 가 본 방 중 미끼 방으로 먼저 감 (피해 없음)', for: 'room' },
    trap: { name: '함정 복도', short: '함정', perCell: 10, valuePerCell: 10, kind: 'trap', st: '지나는 적 전원에게 칸당 피해 6 (같은 분대는 두 번 들어갈 때까지만)', for: 'room' },
    den: { name: '몬스터 대기실', short: '대기실', perCell: 10, valuePerCell: 5, kind: 'den', st: '칸당 부대 1자리. 침입자 분대와 만나는 순간 승패가 정해져요 (진 쪽 퇴각). 바로 앞이 함정이면 기습 ×1.5', for: 'room' },
    boss: { name: '보스·보물방', short: '보스·보물', cost: 0, value: 0, kind: 'none', st: '침입자가 여기까지 오면 금을 약탈해요', for: 'boss' }
  };
  // 고정 구역 시설 (BATTLE_DATA.FIXED_ZONES): 'fz_' + id. 지을 수 없다(for: 'fixed'). 길 계산에서는 빈 방처럼 지나감
  var FIXED_PREFIX = 'fz_';
  Object.keys(BD.FIXED_ZONES || {}).forEach(function (id) {
    var d = BD.FIXED_ZONES[id];
    FAC[FIXED_PREFIX + id] = { name: d.name, short: d.short, cost: 0, value: d.value || 0, kind: 'fixed', st: d.st, for: 'fixed', fixedId: id };
  });
  function fixedFac(id) { return FIXED_PREFIX + id; }
  function isFixedFac(k) { return !!(FAC[k] && FAC[k].kind === 'fixed'); }

  // ---------- 층 하나 펼치기 ----------
  function hasBoard(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(GB, id); }
  function cellName(pre, r, c) { return pre + LETTERS.charAt(c) + (r + 1); }
  // 판 데이터 하나를 n층으로: 칸·방·벽 조각·처음 문 (id에 층 번호를 붙임)
  function floorPart(n, boardId, rowOff) {
    var d = GB[boardId] || GB[DEFAULT_BOARD], pre = n === 1 ? '' : String(n);
    var multi = {};
    Object.keys(d.rooms || {}).forEach(function (rid) { d.rooms[rid].forEach(function (cid) { multi[pre + cid] = pre + rid; }); });
    var map = [], cellRoom = {}, cellRC = {}, cells = {}, roomCells = {}, ids = [], idx = {};
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        var cid = cellName(pre, r, c);
        var room = cid === pre + d.entry ? pre + 'E' : cid === pre + d.goal ? pre + 'B' : multi[cid] || cid;
        row.push(room); cellRoom[cid] = room; cellRC[cid] = [r + rowOff, c];
        if (!cells[room]) { cells[room] = []; roomCells[room] = []; ids.push(room); idx[room] = n * 100 + r * COLS + c; }
        cells[room].push([r + rowOff, c]); roomCells[room].push(cid);
      }
      map.push(row);
    }
    var edges = [], edgeById = {};
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      var a = cellName(pre, r, c);
      [[0, 1], [1, 0]].forEach(function (dd) {
        var r2 = r + dd[0], c2 = c + dd[1];
        if (r2 >= ROWS || c2 >= COLS) return;
        var b = cellName(pre, r2, c2);
        if (cellRoom[a] === cellRoom[b]) return;   // 같은 방 안쪽 칸 사이는 벽 조각 아님
        var e = { id: a + '-' + b, a: a, b: b, ra: cellRoom[a], rb: cellRoom[b], floor: n,
          x: (c + c2) / 2 + 0.5, y: (r + r2) / 2 + 0.5 + rowOff, vertical: dd[0] === 0 };   // vertical = 벽이 세로 (가로 이웃)
        edges.push(e); edgeById[e.id] = e;
      });
    }
    var names = {}, colNames = G.colNames || [];
    ids.forEach(function (room) {
      var rc = cells[room][0], nm;
      if (room === pre + 'E') nm = n === 1 ? '입구' : n + '층 입구';
      else if (room === pre + 'B') nm = '보스·보물방';
      else if (d.names && d.names[room.slice(pre.length)]) nm = d.names[room.slice(pre.length)];
      else nm = (colNames[rc[1]] || LETTERS.charAt(rc[1])) + ' ' + (rc[0] - rowOff + 1);
      names[room] = (n === 1 || room === pre + 'E') ? nm : n + '층 ' + nm;
    });
    var fixed = {};
    Object.keys(d.fixed || {}).forEach(function (rid) { if (cells[pre + rid]) fixed[pre + rid] = d.fixed[rid]; });
    var doors = (d.doors || []).map(function (id) { var p = id.split('-'); return pre + p[0] + '-' + pre + p[1]; }).filter(function (id) { return !!edgeById[id]; });
    return { n: n, board: GB[boardId] ? boardId : DEFAULT_BOARD, name: d.name, desc: d.desc, MAP: map, rowOff: rowOff, rows: ROWS, pre: pre,
      entry: pre + 'E', bottom: pre + 'B', ids: ids, cells: cells, roomCells: roomCells, cellRoom: cellRoom, cellRC: cellRC, idx: idx,
      edges: edges, edgeById: edgeById, names: names, fixed: fixed, doors: doors };
  }
  function boardList(boards, floors) {
    var list = typeof boards === 'string' ? [boards] : Array.isArray(boards) ? boards : [];
    var out = [];
    for (var n = 1; n <= floors; n++) { var b = list[n - 1]; out.push(hasBoard(b) ? b : hasBoard(list[0]) ? list[0] : DEFAULT_BOARD); }
    return out;
  }
  // 현장 배치: 층별 판 + 층 수 + 열린 층 수 + 문 (없거나 깨진 층은 판의 처음 문). 결과는 cur
  function makeLayout(boards, floors, open, doors) {
    floors = Math.max(1, floors | 0 || 1); open = Math.max(1, Math.min(floors, open | 0 || 1));
    var bl = boardList(boards, floors), parts = [], rowOff = 0;
    for (var n = 1; n <= floors; n++) { var p = floorPart(n, bl[n - 1], rowOff); parts.push(p); rowOff += p.rows + FLOOR_GAP; }
    var L = { boards: bl, floors: floors, open: open, parts: parts, CELLS: {}, NAMES: { Y: '야외' }, floorOfZ: {}, idx: {}, edgeById: {}, cellRC: {}, roomCells: {} };
    parts.forEach(function (p) {
      p.ids.forEach(function (z) { L.CELLS[z] = p.cells[z]; L.floorOfZ[z] = p.n; L.idx[z] = p.idx[z]; L.roomCells[z] = p.roomCells[z]; L.NAMES[z] = p.names[z]; });
      Object.keys(p.edgeById).forEach(function (id) { L.edgeById[id] = p.edgeById[id]; });
      Object.keys(p.cellRC).forEach(function (id) { L.cellRC[id] = p.cellRC[id]; });
    });
    for (var k = 1; k < open; k++) L.NAMES[parts[k - 1].bottom] = '계단 (' + (k + 1) + '층으로)';
    L.goal = parts[open - 1].bottom;
    L.doorsBy = {};
    var given = byFloor(doors, L);
    parts.forEach(function (p) { L.doorsBy[p.n] = given[p.n] && checkFloor(L, p.n, given[p.n]).ok ? given[p.n].slice() : p.doors.slice(); });
    L.doors = flatOf(L.doorsBy);
    L.graph = graphOf(L, L.doors);
    L.ORDER = orderOf(L);
    L.EXITS = {};
    L.ORDER.concat([L.goal]).forEach(function (z) { L.EXITS[z] = (L.graph[z] || []).slice(); });
    return L;
  }
  // 문 목록 -> { 층: [id] }. 배열이면 벽 조각의 층으로 나눔, 객체면 그대로 (없는 층은 빠짐)
  function byFloor(doors, L) {
    var o = {};
    if (Array.isArray(doors)) doors.forEach(function (id) { var e = L.edgeById[id]; if (e) (o[e.floor] = o[e.floor] || []).push(id); });
    else if (doors && typeof doors === 'object') Object.keys(doors).forEach(function (n) { if (Array.isArray(doors[n])) o[n | 0] = doors[n].slice(); });
    return o;
  }
  function flatOf(by) { var out = []; Object.keys(by).sort().forEach(function (n) { out = out.concat(by[n]); }); return out; }
  function flatDoors(doors) { return doors === undefined || doors === null ? cur.doors : Array.isArray(doors) ? doors : flatOf(byFloor(doors, cur)); }
  // 문 그래프 { 방: [이웃 방] } (벽 조각 순서 = 칸 순서라 결정적). 계단은 넣지 않음 (층마다 따로)
  function graphOf(L, doors) {
    var g = {}, open = {};
    doors.forEach(function (id) { open[id] = true; });
    Object.keys(L.CELLS).forEach(function (z) { g[z] = []; });
    L.parts.forEach(function (p) {
      p.edges.forEach(function (e) {
        if (!open[e.id]) return;
        if (g[e.ra].indexOf(e.rb) < 0) g[e.ra].push(e.rb);
        if (g[e.rb].indexOf(e.ra) < 0) g[e.rb].push(e.ra);
      });
    });
    return g;
  }
  // 방 순서: 1층 입구부터 문(+ 열린 계단)으로 너비 우선. 못 닿는 방은 칸 순서로 뒤에. 보물방(goal)은 뺌
  function orderOf(L) {
    var seen = { E: true }, q = ['E'], out = [];
    for (var i = 0; i < q.length; i++) {
      var z = q[i];
      var next = (L.graph[z] || []).slice();
      var p = L.parts[L.floorOfZ[z] - 1];
      if (p && z === p.bottom && p.n < L.open) next.push(L.parts[p.n].entry);
      next.forEach(function (b) { if (!seen[b]) { seen[b] = true; q.push(b); } });
    }
    q.forEach(function (z) { if (z !== L.goal) out.push(z); });
    L.parts.forEach(function (p) { p.ids.forEach(function (z) { if (!seen[z] && z !== L.goal) out.push(z); }); });
    return out;
  }
  var cur = makeLayout([DEFAULT_BOARD], 1, 1, null);

  // ---------- 문 검사 ----------
  // n층 문 목록 검사: { ok, code('tokens' 개수 · 'target' 없는 벽·겹침 · 'disconnected' 끊긴 방), why, isolated[방] }
  function checkFloor(L, n, list) {
    var p = L.parts[n - 1];
    if (!p) return { ok: false, code: 'target', why: '없는 층이에요', isolated: [] };
    if (!Array.isArray(list)) return { ok: false, code: 'tokens', why: '안쪽 벽에 문 ' + p.doors.length + '개를 유지해야 해요', isolated: [] };
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      if (!p.edgeById[list[i]] || seen[list[i]]) return { ok: false, code: 'target', why: '문이 없는 다른 안쪽 벽에 놓아 주세요', isolated: [] };
      seen[list[i]] = true;
    }
    if (list.length !== p.doors.length) return { ok: false, code: 'tokens', why: '안쪽 벽에 문 ' + p.doors.length + '개를 유지해야 해요', isolated: [] };
    var g = graphOf({ CELLS: p.cells, parts: [p] }, list), reach = { }, q = [p.entry];
    reach[p.entry] = true;
    for (i = 0; i < q.length; i++) g[q[i]].forEach(function (b) { if (!reach[b]) { reach[b] = true; q.push(b); } });
    var iso = p.ids.filter(function (z) { return !reach[z]; });
    if (iso.length) return { ok: false, code: 'disconnected', why: '(' + L.NAMES[iso[0]] + ') 방이 다른 방과 끊겨요', isolated: iso };
    return { ok: true, code: '', why: '', isolated: [] };
  }
  function validateDoors(list, n) { return checkFloor(cur, n | 0 || 1, list); }
  // 처음 문 배치 { 층: [id] } (모든 층) 또는 n층 목록
  function initialDoors(n) {
    if (n) { var p = cur.parts[n - 1]; return p ? p.doors.slice() : []; }
    var o = {}; cur.parts.forEach(function (p) { o[p.n] = p.doors.slice(); }); return o;
  }
  function doorCount(n) { var p = cur.parts[(n | 0 || 1) - 1]; return p ? p.doors.length : 0; }
  function doorsNow() { var o = {}; Object.keys(cur.doorsBy).forEach(function (n) { o[n] = cur.doorsBy[n].slice(); }); return o; }

  // ---------- 탐험 (실험 lab.js exploreRoute·chooseCandidate·mappedReturn·seededRandom) ----------
  function seededRandom(seed) {
    var state = seed >>> 0;
    state = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
    state = Math.imul(state ^ (state >>> 15), 0x735a2d97);
    state = (state ^ (state >>> 15)) >>> 0;
    return function () { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  }
  // 열린 문 표 { 'ra|rb': 벽 조각 id } (같은 두 방 사이에 문이 여럿이면 칸 순서로 첫 문)
  function doorPairs(L, doors) {
    var open = {}, m = {};
    doors.forEach(function (id) { open[id] = true; });
    L.parts.forEach(function (p) { p.edges.forEach(function (e) {
      if (!open[e.id]) return;
      if (!m[e.ra + '|' + e.rb]) m[e.ra + '|' + e.rb] = e.id;
      if (!m[e.rb + '|' + e.ra]) m[e.rb + '|' + e.ra] = e.id;
    }); });
    return m;
  }
  // from -> to 방향 (그 문의 칸 기준): 'left' · 'right' · 'up' · 'down'
  function dirOf(L, pairs, from, to) {
    var e = L.edgeById[pairs[from + '|' + to]];
    if (!e) return '';
    var fwd = e.ra === from, a = L.cellRC[fwd ? e.a : e.b], b = L.cellRC[fwd ? e.b : e.a];
    return b[1] < a[1] ? 'left' : b[1] > a[1] ? 'right' : b[0] < a[0] ? 'up' : 'down';
  }
  function chooseCandidate(L, pairs, from, candidates, habit, zones, random) {
    // 후보 순서는 문 배열 순서와 무관하게 고정 (방 번호 순). 미끼가 여럿이면 같은 확률
    var bait = candidates.filter(function (z) { return FAC[zones[z]] && FAC[zones[z]].kind === 'lure'; });
    var pool = (bait.length ? bait : candidates).slice().sort(function (a, b) { return L.idx[a] - L.idx[b]; });
    if (pool.length < 2) return pool[0];
    if (!bait.length) {
      var want = HABIT_DIRS[habit], pref = pool.filter(function (z) { return dirOf(L, pairs, from, z) === want; })[0];
      if (pref !== undefined) {
        if (random() < G.habit) return pref;
        pool.splice(pool.indexOf(pref), 1);
      }
    }
    return pool[Math.floor(random() * pool.length)];
  }
  function mappedReturn(graph, current, visited, lastVisit) {
    // 너비 우선 탐색은 이미 아는 방만 통과. 같은 거리의 목적지는 최근 방문 우선
    var parent = {}; parent[current] = null;
    var layer = [current];
    while (layer.length) {
      var frontiers = layer.filter(function (z) { return graph[z].some(function (to) { return !visited[to]; }); });
      if (frontiers.length) {
        var target = frontiers.sort(function (a, b) { return lastVisit[b] - lastVisit[a]; })[0], path = [];
        for (var z = target; z !== current; z = parent[z]) path.push(z);
        return path.reverse();
      }
      var next = [];
      layer.forEach(function (z) { graph[z].forEach(function (to) { if (visited[to] && !(to in parent)) { parent[to] = z; next.push(to); } }); });
      layer = next;
    }
    return [];
  }
  // 한 층 탐험: start -> goal. steps에 { from, to, edge, backtrack, floor } 를 붙임. st = { fork }
  function exploreFloor(L, graph, pairs, p, zones, squad, seed, st, steps) {
    var habit = squad % 3, visited = {}, lastVisit = {}, rooms = [p.entry], guard = 0;
    visited[p.entry] = true; lastVisit[p.entry] = steps.length;
    function append(to, back) {
      var from = rooms[rooms.length - 1];
      steps.push({ from: from, to: to, edge: pairs[from + '|' + to], backtrack: back, floor: p.n });
      rooms.push(to); visited[to] = true; lastVisit[to] = steps.length;
    }
    while (rooms[rooms.length - 1] !== p.bottom && guard++ < 2000) {
      var now = rooms[rooms.length - 1];
      var choices = graph[now].filter(function (to) { return !visited[to]; });
      if (choices.length) {
        // 분대·방·갈림 순서별 난수: 미리보기나 다른 분대의 계산은 영향을 주지 않는다
        var random = seededRandom((seed ^ Math.imul(squad + 1, 0x9e3779b9) ^ Math.imul(L.idx[now] + 1, 0x85ebca6b) ^ Math.imul(st.fork, 0xc2b2ae35)) >>> 0);
        if (choices.length > 1) st.fork++;
        append(chooseCandidate(L, pairs, now, choices, habit, zones, random), false);
      } else {
        var path = mappedReturn(graph, now, visited, lastVisit);
        if (!path.length) break;
        path.forEach(function (to) { append(to, true); });
      }
    }
    return rooms[rooms.length - 1] === p.bottom;
  }
  var routeCache = {}, routeCacheN = 0;
  function baitKey(zones) {
    var out = [];
    Object.keys(zones || {}).forEach(function (z) { if (FAC[zones[z]] && FAC[zones[z]].kind === 'lure') out.push(z); });
    return out.sort().join(',');
  }
  // 분대 하나의 탐험 경로 (열린 층 모두, 층 사이는 계단 걸음 { stairs: true }).
  //  -> { squad, habit, rooms[방], steps[{ from, to, edge, backtrack, floor, stairs? }], reached, passes{ 층: 문 통과 수 } }
  function exploreRoute(doors, zones, squad, seed) {
    var flat = flatDoors(doors).slice().sort();
    squad = squad | 0; seed = seed >>> 0;
    var key = flat.join(',') + '#' + baitKey(zones) + '#' + cur.boards.join(',') + cur.open + '#' + seed + '#' + squad;
    if (routeCache[key]) return JSON.parse(routeCache[key]);
    var graph = graphOf(cur, flat), pairs = doorPairs(cur, flat), steps = [], st = { fork: 0 }, reached = true, passes = {};
    for (var n = 1; n <= cur.open; n++) {
      var p = cur.parts[n - 1], before = steps.length;
      if (n > 1) steps.push({ from: cur.parts[n - 2].bottom, to: p.entry, edge: null, backtrack: false, floor: n, stairs: true });
      reached = exploreFloor(cur, graph, pairs, p, zones || {}, squad, seed, st, steps);
      passes[n] = steps.length - before - (n > 1 ? 1 : 0);
      if (!reached) break;
    }
    var rooms = ['E'].concat(steps.map(function (s) { return s.to; }));
    var r = { squad: squad, habit: squad % 3, rooms: rooms, steps: steps, reached: reached && rooms[rooms.length - 1] === cur.goal, passes: passes };
    if (routeCacheN++ > 4000) { routeCache = {}; routeCacheN = 0; }
    routeCache[key] = JSON.stringify(r);
    return r;
  }
  // 미리보기 경로 12개(고정 시드 × 습관 3)에서 센 값. -> { n(경로 수), ratio{방: 지난 경로 비율}, trap{방: 경로마다 min(들어간 횟수, trapMax) 평균},
  //  passes[습관별 한 층 최대 문 통과 수], maxPass, worst(가장 많이 지난 습관 번호), flow{ 'a>b': 지난 횟수 평균 } }. 층 입구 기준 (모든 경로가 층 입구를 지남)
  var infoCache = {}, infoCacheN = 0;
  function passInfo(zones, doors) {
    var flat = flatDoors(doors).slice().sort();
    var key = flat.join(',') + '#' + baitKey(zones) + '#' + cur.boards.join(',') + cur.open;
    if (infoCache[key]) return infoCache[key];
    var seeds = G.previewSeeds || [1, 2, 3, 4], seen = {}, trap = {}, flow = {}, passes = [0, 0, 0], n = 0;
    seeds.forEach(function (sd) {
      for (var h = 0; h < 3; h++) {
        var r = exploreRoute(flat, zones, h, sd), here = {}, cnt = {};
        n++;
        r.rooms.forEach(function (z) { here[z] = true; });
        r.steps.forEach(function (s) { cnt[s.to] = (cnt[s.to] || 0) + 1; if (!s.stairs) flow[s.from + '>' + s.to] = (flow[s.from + '>' + s.to] || 0) + 1; });
        Object.keys(here).forEach(function (z) { seen[z] = (seen[z] || 0) + 1; });
        Object.keys(cnt).forEach(function (z) { trap[z] = (trap[z] || 0) + Math.min(cnt[z], G.trapMax || 2); });
        Object.keys(r.passes).forEach(function (f) { passes[h] = Math.max(passes[h], r.passes[f]); });
      }
    });
    var ratio = {}, tr = {}, fl = {};
    Object.keys(seen).forEach(function (z) { ratio[z] = seen[z] / n; });
    Object.keys(trap).forEach(function (z) { tr[z] = trap[z] / n; });
    Object.keys(flow).forEach(function (k) { fl[k] = flow[k] / n; });
    var maxPass = Math.max.apply(null, passes), worst = passes.indexOf(maxPass);
    var out = { n: n, ratio: ratio, trap: tr, passes: passes, maxPass: maxPass, worst: worst, flow: fl };
    if (infoCacheN++ > 500) { infoCache = {}; infoCacheN = 0; }
    infoCache[key] = out;
    return out;
  }

  // ---------- 방 정보 ----------
  function sizeOf(z) { return z === 'Y' ? 1 : cur.CELLS[z] ? cur.CELLS[z].length : 0; }
  function partOf(z) { var n = cur.floorOfZ[z]; return n ? cur.parts[n - 1] : null; }
  // 방 종류: yard 야외 · entry 층 입구(1층 E, 2층 2E) · boss 층 맨 아래(보물방 또는 계단) · room 방
  function zoneType(z) {
    if (z === 'Y') return 'yard';
    var p = partOf(z);
    if (p) { if (z === p.entry) return 'entry'; if (z === p.bottom) return 'boss'; return 'room'; }
    return z === 'E' ? 'entry' : z === 'B' ? 'boss' : 'room';
  }
  function floorOf(z) { return z === 'Y' ? 1 : cur.floorOfZ[z] || 0; }
  function floorOpen(n) { return n >= 1 && n <= cur.open; }
  function isStairs(z) { var p = partOf(z); return !!p && z === p.bottom && p.n < cur.open; }
  // 지을 수 있는 시설 (데모는 DEMO_FACILITIES에 있는 것만). 입구 대기·굽은길은 문 토큰 판에서 없음 (turn 시설은 데이터가 허락해도 안 나옴)
  function facFor(z) {
    var t = zoneType(z), allow = BD.DEMO_FACILITIES && BD.DEMO_FACILITIES[t];
    return Object.keys(FAC).filter(function (k) { return FAC[k].for === t && !FAC[k].turn && (!allow || allow.indexOf(k) >= 0); });
  }
  function costOf(k, z) { var f = FAC[k]; return f.perCell !== undefined ? f.perCell * sizeOf(z) : f.cost; }
  function valueOf(k, z) { var f = FAC[k]; return f.valuePerCell !== undefined ? f.valuePerCell * sizeOf(z) : f.value; }
  function slotsOf(k, z) { return FAC[k] && FAC[k].kind === 'den' ? (BD.DEN_SLOTS_PER_CELL || 2) * sizeOf(z) : 0; }
  function trapDmgOf(z) { return TRAP_PER_CELL * sizeOf(z); }
  // (C1 화면 호환용으로 남김. D1 던전 가치에는 안 들어감) 몬스터 한 마리 점수 (임시 식)
  function monValue(m) { return Math.round(((m.hp || 0) + (m.atk || 0) * 4) / 6); }

  // 처음 현장: 층 입구 = 입구(split), 야외 = 숲, 층 맨 아래 = 보스·보물방(계단), 나머지 = 빈 방. fixed = { 방 id: FIXED_ZONES id }
  function defaultZones(fixed) {
    var L = { Y: 'forest' };
    Object.keys(cur.CELLS).forEach(function (z) { L[z] = zoneType(z) === 'entry' ? 'split' : zoneType(z) === 'boss' ? 'boss' : 'empty'; });
    Object.keys(fixed || {}).forEach(function (z) {
      if (zoneType(z) === 'room' && cur.CELLS[z] && FAC[fixedFac(fixed[z])]) L[z] = fixedFac(fixed[z]);
    });
    return L;
  }
  // 층별 판들의 고정 구역 { 방 id: FIXED_ZONES id } (2층은 방 id 앞에 '2')
  function boardFixed(boards, floors) {
    var bl = boardList(boards, floors || (Array.isArray(boards) ? boards.length : 1)), o = {};
    bl.forEach(function (b, i) {
      var pre = i ? String(i + 1) : '', d = GB[b];
      Object.keys(d.fixed || {}).forEach(function (rid) { o[pre + rid] = d.fixed[rid]; });
    });
    return o;
  }

  // 반드시 지나는 방: 그 방을 막으면 층 입구에서 그 층 맨 아래(보물방·계단)까지 길이 없어지는 방 (지금 문 배치, 열린 층). 입구·맨 아래는 뺌. 방 순서(ORDER)
  function mustPass(doors) {
    var flat = flatDoors(doors), g = graphOf(cur, flat), out = [];
    function reach(p, block) {
      var seen = {}, q = [p.entry]; seen[p.entry] = true;
      for (var i = 0; i < q.length; i++) {
        if (q[i] === p.bottom) return true;
        g[q[i]].forEach(function (b) { if (b !== block && !seen[b]) { seen[b] = true; q.push(b); } });
      }
      return false;
    }
    cur.ORDER.forEach(function (z) {
      var p = partOf(z);
      if (!p || p.n > cur.open || z === p.entry || z === p.bottom) return;
      if (!reach(p, z)) out.push(z);
    });
    return out;
  }
  // 보물방과 문으로 이어진 방들 (위기 '보물방 근접'. 문을 옮기면 바뀜)
  function bossFront(doors) { var g = graphOf(cur, flatDoors(doors)); return (g[cur.goal] || []).slice(); }

  // 요약: 던전 가치 (지어 둔 시설 점수 합만, 몬스터 제외), 함정·대기실·미끼·고정 구역 수, 대기실에 든 부대 수(monsters)
  function summary(zones, units, unitById) {
    var s = { value: 0, trap: 0, den: 0, lure: 0, fixed: 0, monsters: 0 };
    units = units || {};
    Object.keys(zones).forEach(function (z) {
      var k = zones[z], f = FAC[k];
      if (!f || (z !== 'Y' && !cur.CELLS[z])) return;
      s.value += valueOf(k, z);
      if (f.kind === 'trap') s.trap++;
      if (f.kind === 'den') s.den++;
      if (f.kind === 'lure') s.lure++;
      if (f.kind === 'fixed') s.fixed++;
      if (f.kind === 'den') (units[z] || []).forEach(function (id) { if (!unitById || unitById(id)) s.monsters++; });
    });
    return s;
  }
  // ---------- 던전 전투력 B안 재료 ----------
  // 통과 비율 { 방: 0~1 } = 미리보기 경로 12개 중 그 방을 지난 비율 (층 입구 기준). units는 길에 영향 없음 (보여서 피함 없음, 옛 인자 자리)
  function passRatios(zones, units, doors) { var r = passInfo(zones, doors).ratio, o = {}; Object.keys(r).forEach(function (z) { o[z] = r[z]; }); return o; }
  // 함정 점수 T (경로마다 들어간 횟수 곱하기 전): 1회 피해 × 발동 확률 × 대상 수 × 발동 횟수 ÷ 10. boost = 함정 피해 추가 비율(연구실 등)
  function trapScore(z, boost) {
    var P = BD.POWER || { trapTargets: 10, trapStay: 3 }, every = BD.TRAP_EVERY || 1.2;
    var fires = 1 + Math.floor(P.trapStay / every);
    return trapDmgOf(z) * (1 + (boost || 0)) * (BD.TRAP_CHANCE || 0.85) * P.trapTargets * fires / 10;
  }
  function densOf(zones, n) {
    return cur.ORDER.concat(Object.keys(cur.CELLS)).filter(function (z, i, a) {
      return a.indexOf(z) === i && floorOf(z) === n && FAC[zones[z]] && FAC[zones[z]].kind === 'den';
    });
  }
  function denSlots(zones, n) { var s = 0; densOf(zones, n).forEach(function (z) { s += slotsOf(zones[z], z); }); return s; }
  // 길만 계산 (전투 없이): 침입자 n명이 오면 방마다 몇 명(at), 문을 어느 쪽으로 몇 명(flow 'a>b'). 미리보기 경로 12개의 평균 × n
  function forecast(zones, units, n, doors) {
    n = n || PREVIEW_INVADERS;
    var inf = passInfo(zones, doors), at = {}, flow = {};
    Object.keys(inf.ratio).forEach(function (z) { at[z] = Math.round(inf.ratio[z] * n); });
    Object.keys(inf.flow).forEach(function (k) { flow[k] = Math.round(inf.flow[k] * n); });
    return { at: at, flow: flow };
  }

  // ---------- 좌표 (칸 단위: x = 열 + 0.5, y = 행 + 0.5. 야외는 y < 0. 2층은 1층 아래 FLOOR_GAP줄 띄우고 이어짐) ----------
  function roomCenter(z) {
    if (z === 'Y') return { x: 2.5, y: -0.3 };
    var cs = cur.CELLS[z], x = 0, y = 0;
    if (!cs) return { x: 2.5, y: 0 };
    cs.forEach(function (c) { x += c[1] + 0.5; y += c[0] + 0.5; });
    return { x: x / cs.length, y: y / cs.length };
  }
  function doorPoint(edgeId) { var e = cur.edgeById[edgeId]; return e ? { x: e.x, y: e.y } : null; }
  // 층 입구 위쪽 문 (야외 -> 1층 입구, 계단 -> 아래층 입구)
  function entryPoint(n) { var p = cur.parts[(n || 1) - 1], c = roomCenter(p.entry); return { x: c.x, y: c.y - 0.5 }; }
  // 두 방 사이 열린 문 좌표 (옛 이름). 야외 -> 입구 = 입구 위, 계단 = 아래층 입구 위, 문이 없으면 두 방 가운데
  function doorOf(a, b, doors) {
    if (a === 'Y') return entryPoint(1);
    var pa = partOf(a), pb = partOf(b);
    if (pa && pb && pa.n !== pb.n) return entryPoint(pb.n);
    var id = doorPairs(cur, flatDoors(doors))[a + '|' + b];
    if (id) return doorPoint(id);
    var p = roomCenter(a), q = roomCenter(b);
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  }
  // 두 방 사이 문의 두 칸 [[행, 열], [행, 열]] (옛 화면 호환: 문 표시 위치). 문이 없으면 맞닿은 첫 벽, 안 맞닿으면 null
  function sharedEdge(a, b, doors) {
    var id = doorPairs(cur, flatDoors(doors))[a + '|' + b], e = id ? cur.edgeById[id] : null;
    if (!e) {
      var p = partOf(a);
      if (!p) return null;
      e = p.edges.filter(function (x) { return (x.ra === a && x.rb === b) || (x.ra === b && x.rb === a); })[0];
    }
    if (!e) return null;
    var fwd = e.ra === a;
    return [cur.cellRC[fwd ? e.a : e.b].slice(), cur.cellRC[fwd ? e.b : e.a].slice()];
  }
  // 문 목록 [방 a, 방 b] (옛 화면 호환). floor 없으면 1층, 'all'이면 열린 층 전부 + 계단, 숫자면 그 층
  function flowPairs(floor, doors) {
    var want = floor === undefined ? 1 : floor, flat = flatDoors(doors), out = [];
    flat.forEach(function (id) {
      var e = cur.edgeById[id];
      if (!e) return;
      if (want === 'all' ? e.floor <= cur.open : e.floor === want) out.push([e.ra, e.rb]);
    });
    if (want === 'all') for (var k = 1; k < cur.open; k++) out.push([cur.parts[k - 1].bottom, cur.parts[k].entry]);
    return out;
  }

  // ---------- 판 그리기용 (5절) ----------
  // n층: { n, cols, rows, rowOff, cells[행][열] = 방 id, rooms{ 방 id: [칸 id] }, entry, goal(그 층 맨 아래), stairs(맨 아래가 계단인가), open }
  function grid(n) {
    var p = cur.parts[(n | 0 || 1) - 1];
    if (!p) return null;
    var rooms = {}; p.ids.forEach(function (z) { rooms[z] = p.roomCells[z].slice(); });
    return { n: p.n, cols: COLS, rows: ROWS, rowOff: p.rowOff, cells: p.MAP.map(function (r) { return r.slice(); }), rooms: rooms,
      entry: p.entry, goal: p.bottom, stairs: p.n < cur.open, open: p.n <= cur.open, board: p.board };
  }
  // n층 벽 조각 [{ id, a, b(칸), ra, rb(방), x, y(전투 좌표 = 벽 가운데), vertical(벽이 세로) }] (같은 방 안쪽 벽 제외)
  function edges(n) {
    var p = cur.parts[(n | 0 || 1) - 1];
    return p ? p.edges.map(function (e) { return { id: e.id, a: e.a, b: e.b, ra: e.ra, rb: e.rb, x: e.x, y: e.y, vertical: e.vertical }; }) : [];
  }

  var api = window.ZONES = {
    FAC: FAC, PREVIEW_INVADERS: PREVIEW_INVADERS, GRID: G,
    BOARDS: BOARD_IDS.map(function (id) { return { id: id, name: GB[id].name, desc: GB[id].desc }; }),
    DEFAULT_BOARD: DEFAULT_BOARD,
    sizeOf: sizeOf, zoneType: zoneType, facFor: facFor, costOf: costOf, valueOf: valueOf, slotsOf: slotsOf, trapDmgOf: trapDmgOf,
    fixedFac: fixedFac, isFixedFac: isFixedFac, passRatios: passRatios, passInfo: passInfo, trapScore: trapScore,
    monValue: monValue, defaultZones: defaultZones, boardFixed: boardFixed, summary: summary, forecast: forecast, sharedEdge: sharedEdge, flowPairs: flowPairs,
    anchorOf: roomCenter, roomCenter: roomCenter, doorOf: doorOf, doorPoint: doorPoint, entryPoint: entryPoint, bossFront: bossFront, mustPass: mustPass,
    hasBoard: hasBoard, useBoard: useBoard, useSite: useSite, boardInfo: boardInfo, boardId: function () { return cur.boards[0]; }, boards: function () { return cur.boards.slice(); },
    // 문 토큰 (3차)
    grid: grid, edges: edges, initialDoors: initialDoors, doorCount: doorCount, doors: doorsNow, validateDoors: validateDoors,
    exploreRoute: exploreRoute, seededRandom: seededRandom,
    // 층
    floorOf: floorOf, floorOpen: floorOpen, isStairs: isStairs, densOf: densOf, denSlots: denSlots, floorInfo: floorInfo, floorMap: floorMap,
    stackMap: stackMap, goal: function () { return cur.goal; }
  };
  // 지금 현장 배치를 끼운다: boards = 층별 판 id 목록(문자열 하나도 됨), floors = 층 수, open = 열린 층 수, doors = { 층: [id] } 또는 배열 (없으면 처음 문).
  //  ZONES.MAP 등 판 속성을 다시 붙인다. 돌려주는 값 = 1층 판 id
  function useSite(boards, floors, open, doors) {
    cur = makeLayout(boards, floors, open, doors);
    api.board = cur.boards[0]; api.MAP = cur.parts[0].MAP; api.NAMES = cur.NAMES; api.EXITS = cur.EXITS; api.CENTER = []; api.ENTRY = {};
    api.CELLS = cur.CELLS; api.ALL = Object.keys(cur.CELLS).concat(['Y']); api.ORDER = cur.ORDER;
    api.FLOORS = cur.floors; api.OPEN = cur.open; api.GOAL = cur.goal; api.DOORS = cur.doors.slice();
    return cur.boards[0];
  }
  function useBoard(id) { return useSite([id], 1, 1, null); }
  function floorInfo(n) {
    var p = cur.parts[n - 1];
    if (!p) return null;
    return { n: p.n, board: p.board, name: p.name, desc: p.desc, open: p.n <= cur.open, entry: p.entry, bottom: p.bottom, stairs: p.n < cur.open,
      ids: p.ids.slice(), rows: p.rows, rowOff: p.rowOff, MAP: p.MAP, doors: (cur.doorsBy[p.n] || []).slice() };
  }
  function floorMap(n) { var p = cur.parts[n - 1]; return p ? p.MAP : null; }
  function stackMap() {
    var rows = [];
    cur.parts.forEach(function (p, i) {
      if (i) for (var g = 0; g < FLOOR_GAP; g++) rows.push(p.MAP[0].map(function () { return null; }));
      p.MAP.forEach(function (r) { rows.push(r.slice()); });
    });
    return rows;
  }
  // 판 정보 (지금 판이 아니어도): 의뢰 카드 미리보기용. MAP = 방 id 칸 배열, EXITS = 처음 문으로 이어진 이웃
  function boardInfo(id) {
    var b = makeLayout([hasBoard(id) ? id : DEFAULT_BOARD], 1, 1, null);
    return { id: b.boards[0], name: b.parts[0].name, desc: b.parts[0].desc, MAP: b.parts[0].MAP, NAMES: b.NAMES, EXITS: b.EXITS, CENTER: [], doors: b.doors.slice() };
  }
  useBoard(DEFAULT_BOARD);
})();
