// 시안 A4: 바위 + 기본 통로(동굴)로 시작. 맨 윗줄은 공터, 입구는 모험가 집결지.
// 문은 칸 하나의 변에 1개씩, 방을 만들면 자동으로 붙고 끌어서 옮길 수 있다.
// 함정·부대 숫자는 ../common/rules.js(PROTO.items)를 같이 쓴다. 버려도 되는 코드.
var A4 = {
  cols: 5, rows: 7, entry: [0, 2], gold: [6, 2],
  budget: 180,
  maxRoom: 4,     // 방 하나에 고를 수 있는 칸 수
  maxDoors: 4,    // 방 하나의 문 최대 수
  party: { name: '모험가', count: 3, hp: 60, atk: 10 },
  supplies: 45,   // 보급(초). 걷기 1칸 = 1, 전투 1합 = 2. 바닥나면 입구로 도주
  maxRounds: 3,
  mazeCost: 8,
  extra: {
    maze: { name: '3×3 미로', short: '미로', kind: 'maze', cost: 30, value: 20, size: [3, 3] },
    boss: { name: '2×2 보스방', short: '보스', kind: 'boss', cost: 70, value: 70, size: [2, 2], hp: 140, atk: 16, unit: '오우거' }
  },
  // 기본 통로: 1줄 가로, 왼쪽·가운데·오른쪽 세로, 맨 아래 가로 (사용자 그림)
  tunnels: function (r, c) { return r === 1 || r === 6 || c === 0 || c === 2 || c === 4; },
  speeds: [{ label: '×1', ms: 700 }, { label: '×4', ms: 175 }, { label: '즉시', ms: 0 }]
};
var DIRS = [{ k: 'up', dr: -1, dc: 0 }, { k: 'down', dr: 1, dc: 0 }, { k: 'left', dr: 0, dc: -1 }, { k: 'right', dr: 0, dc: 1 }];

function itemOf(content) { return PROTO.items[content] || A4.extra[content]; }
function rng(seed) { // mulberry32
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------- 판 상태 ----------
// ground: yard(공터) / entry / rock / tunnel / gold. 방은 owner로 덮는다. doors: 변 key → [안쪽 칸, 바깥 칸]
var B = { ground: [], owner: [], pieces: {}, doors: {}, nextId: 1 };
function resetBoard() {
  B.ground = []; B.owner = []; B.pieces = {}; B.doors = {};
  for (var r = 0; r < A4.rows; r++) {
    B.ground.push([]); B.owner.push([]);
    for (var c = 0; c < A4.cols; c++) {
      var g = r === 0 ? 'yard' : A4.tunnels(r, c) ? 'tunnel' : 'rock';
      if (same([r, c], A4.entry)) g = 'entry';
      if (same([r, c], A4.gold)) g = 'gold';
      B.ground[r].push(g); B.owner[r].push(null);
    }
  }
}
function same(a, b) { return a[0] === b[0] && a[1] === b[1]; }
function key(x) { return x[0] + ',' + x[1]; }
function inB(r, c) { return r >= 0 && r < A4.rows && c >= 0 && c < A4.cols; }
function groundAt(x) { return B.ground[x[0]][x[1]]; }
function ownerAt(x) { return B.owner[x[0]][x[1]]; }
function pieceAt(x) { var o = ownerAt(x); return o ? B.pieces[o] : null; }
function isOpen(x) { var g = groundAt(x); return !!ownerAt(x) || g === 'tunnel' || g === 'gold' || g === 'entry'; }
function edgeKey(a, b) { var p = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a]; return key(p[0]) + '|' + key(p[1]); }
function nb(x) { return DIRS.map(function (d) { return [x[0] + d.dr, x[1] + d.dc]; }).filter(function (n) { return inB(n[0], n[1]); }); }

// a에서 b로 한 칸 갈 수 있나. 같은 방·통로끼리는 열려 있고, 방 경계는 문이 있어야 한다.
function canPass(a, b) {
  if (!inB(b[0], b[1]) || !isOpen(a) || !isOpen(b)) return false;
  if (ownerAt(a) === ownerAt(b)) return true;
  return !!B.doors[edgeKey(a, b)];
}
function bfs(start, goal, avoid) {
  var prev = {}, q = [start];
  prev[key(start)] = null;
  while (q.length) {
    var cur = q.shift();
    if (same(cur, goal)) {
      var path = [];
      for (var k = cur; !same(k, start); k = prev[key(k)]) path.unshift(k);
      return path;
    }
    nb(cur).forEach(function (n) {
      var o = ownerAt(n);
      if (prev[key(n)] !== undefined || !canPass(cur, n) || (avoid && o && avoid[o] && o !== ownerAt(start))) return;
      prev[key(n)] = cur;
      q.push(n);
    });
  }
  return null;
}
function distFrom(start) { // 모든 칸까지 걸음 수
  var d = {}, q = [start];
  d[key(start)] = 0;
  while (q.length) {
    var cur = q.shift();
    nb(cur).forEach(function (n) { if (d[key(n)] === undefined && canPass(cur, n)) { d[key(n)] = d[key(cur)] + 1; q.push(n); } });
  }
  return d;
}
function connected() { return !!bfs(A4.entry, A4.gold); }
function route() { return bfs(A4.entry, A4.gold) || []; }

// ---------- 문 ----------
function doorsOf(id) { // 이 방에 닿은 문 [{k, inner, outer}]
  var out = [];
  Object.keys(B.doors).forEach(function (k) {
    var e = B.doors[k], a = e[0], b = e[1];
    if (ownerAt(a) === id) out.push({ k: k, inner: a, outer: b });
    else if (ownerAt(b) === id) out.push({ k: k, inner: b, outer: a });
  });
  return out;
}
// 이 방 둘레에서 문을 낼 수 있는 변 (바깥이 통로·보물방·입구·다른 방이고, 다른 방은 문이 4개 미만)
function doorSpots(id) {
  var out = [];
  B.pieces[id].cells.forEach(function (c) {
    nb(c).forEach(function (n) {
      var o = ownerAt(n), k = edgeKey(c, n);
      if (o === id || !isOpen(n)) return;
      if (o && !B.doors[k] && doorsOf(o).length >= A4.maxDoors) return;
      out.push({ k: k, inner: c, outer: n });
    });
  });
  return out;
}
// 문 n개를 자동으로 붙인다: 입구 쪽에 가까운 자리 1개, 보물방 쪽에 가까운 자리 1개, 나머지는 다른 방향으로.
// 길이 이어지는 조합을 못 찾으면 이유를 돌려준다.
function autoDoors(id, n) {
  var old = doorsOf(id);
  // 옆 방이 이미 이쪽으로 낸 문은 그 방 것이라 지우지 않고, 이 방의 문 개수에 넣는다
  var fixed = old.filter(function (d) { var o = ownerAt(d.outer); return o && +o.slice(1) < +id.slice(1); });
  old.forEach(function (d) { if (fixed.indexOf(d) < 0) delete B.doors[d.k]; });
  n -= fixed.length;
  var spots = doorSpots(id).filter(function (s) { return !fixed.some(function (d) { return d.k === s.k; }); });
  if (n <= 0 || !spots.length) {
    if (fixed.length && connected()) return null;
    restore();
    return fixed.length ? '문 개수로는 길이 이어지지 않아요' : '통로나 다른 방과 맞닿아야 문을 낼 수 있어요';
  }
  n = Math.max(1, Math.min(n, A4.maxDoors - fixed.length, spots.length));
  var dE = distFrom(A4.entry), dG = distFrom(A4.gold);
  function v(m, x) { var t = m[key(x)]; return t === undefined ? 99 : t; }
  var order = [], used = {};
  function take(s) { if (s && !used[s.k]) { used[s.k] = true; order.push(s); } }
  take(spots.slice().sort(function (a, b) { return v(dE, a.outer) - v(dE, b.outer); })[0]);
  take(spots.slice().sort(function (a, b) { return v(dG, a.outer) - v(dG, b.outer); }).filter(function (s) { return !used[s.k]; })[0]);
  spots.slice().sort(function (a, b) { return (v(dE, a.outer) + v(dG, a.outer)) - (v(dE, b.outer) + v(dG, b.outer)); }).forEach(take);
  // 같은 방향으로 몰리지 않게: 아직 안 쓴 방향의 자리를 앞으로
  var dirsUsed = {}, spread = [];
  order.forEach(function (s) { var d = s.outer[0] - s.inner[0] + ',' + (s.outer[1] - s.inner[1]); if (!dirsUsed[d]) { dirsUsed[d] = true; spread.push(s); } });
  order.forEach(function (s) { if (spread.indexOf(s) < 0) spread.push(s); });
  order = spread.slice(0, 10);
  function set(list) { spots.forEach(function (s) { delete B.doors[s.k]; }); list.forEach(function (s) { B.doors[s.k] = [s.inner, s.outer]; }); }
  function combos(start, pick, acc) {
    if (acc.length === pick) { set(acc); return connected(); }
    for (var i = start; i < order.length; i++) { acc.push(order[i]); if (combos(i + 1, pick, acc)) return true; acc.pop(); }
    return false;
  }
  if (combos(0, n, [])) return null;
  set([]); restore();
  return '문 ' + n + '개로는 입구에서 보물방까지 길이 이어지지 않아요';
  function restore() { old.forEach(function (d) { B.doors[d.k] = [d.inner, d.outer]; }); }
}
// 문을 다른 자리로 옮길 수 있는 후보 (옮겨도 길이 이어지는 자리만)
function moveTargets(id, fromKey) {
  var e = B.doors[fromKey], out = [];
  delete B.doors[fromKey];
  doorSpots(id).forEach(function (s) {
    if (B.doors[s.k] || s.k === fromKey) return;
    B.doors[s.k] = [s.inner, s.outer];
    if (connected()) out.push(s);
    delete B.doors[s.k];
  });
  B.doors[fromKey] = e;
  return out;
}
// 문 옮기기: 옛 자리는 '닫음'으로 기억해 자동으로 다시 생기지 않게 한다
function moveDoor(id, fromKey, s) {
  delete B.doors[fromKey]; B.doors[s.k] = [s.inner, s.outer];
  B.pieces[id].closed[fromKey] = true; delete B.pieces[id].closed[s.k];
}
// 문 닫기 (판에서 문을 누름). 길이 끊기면 되돌린다.
function closeDoor(k) {
  var e = B.doors[k];
  delete B.doors[k];
  if (!connected()) { B.doors[k] = e; return '이 문을 닫으면 길이 끊겨요'; }
  [ownerAt(e[0]), ownerAt(e[1])].forEach(function (o) { if (o) B.pieces[o].closed[k] = true; });
  return null;
}
function dirOf(s) { return (s.outer[0] - s.inner[0]) + ',' + (s.outer[1] - s.inner[1]); }
// 판이 바뀔 때마다 문을 다시 맞춘다: 막힌 문(바위와 맞닿음)은 지우고,
// 문이 4개 미만인 방은 새로 맞닿은 길 쪽으로 문을 더한다 (아직 문이 없는 방향 먼저, 유저가 닫은 자리는 빼고)
function refreshDoors() {
  Object.keys(B.doors).forEach(function (k) {
    var e = B.doors[k];
    if (!isOpen(e[0]) || !isOpen(e[1]) || (!ownerAt(e[0]) && !ownerAt(e[1])) || ownerAt(e[0]) === ownerAt(e[1])) delete B.doors[k];
  });
  Object.keys(B.pieces).forEach(function (id) {
    var p = B.pieces[id];
    for (var guard = 0; guard < 8 && doorsOf(id).length < A4.maxDoors; guard++) {
      var dirs = {};
      doorsOf(id).forEach(function (d) { dirs[dirOf(d)] = true; });
      var spots = doorSpots(id).filter(function (s) { return !B.doors[s.k] && !p.closed[s.k]; });
      if (!spots.length) break;
      spots.sort(function (a, b) { return (dirs[dirOf(a)] ? 1 : 0) - (dirs[dirOf(b)] ? 1 : 0); });
      B.doors[spots[0].k] = [spots[0].inner, spots[0].outer];
    }
  });
}
function reopenDoors(id) { B.pieces[id].closed = {}; refreshDoors(); }

// ---------- 놓기·고치기 ----------
function summary() {
  var s = { cost: 0, value: 0, traps: 0, units: 0 };
  Object.keys(B.pieces).forEach(function (id) {
    var p = B.pieces[id], it = itemOf(p.content), n = it.size ? 1 : p.cells.length;
    s.cost += it.cost * n; s.value += it.value * n;
    if (it.kind === 'trap') s.traps += n;
    if (it.kind === 'unit' || it.kind === 'boss') s.units += n;
  });
  var all = s.traps + s.units;
  s.ratio = all ? s.traps / all : 0;
  s.ratioOk = s.ratio > PROTO.demand.trapRatioOver;
  s.valueOk = s.value >= PROTO.demand.minValue;
  s.budgetOk = s.cost <= A4.budget;
  s.ok = s.ratioOk && s.valueOk && s.budgetOk;
  return s;
}
function pieceCost(content, n) { var it = itemOf(content); return it.cost * (it.size ? 1 : n); }
// 방은 바위든 통로든 지을 수 있다 (길이 끊기지 않으면). 통로 자체는 기능 없는 길.
function buildable(x) { return inB(x[0], x[1]) && !ownerAt(x) && (groundAt(x) === 'rock' || groundAt(x) === 'tunnel'); }
function contiguous(cells) {
  if (!cells.length) return false;
  var seen = [cells[0]], q = [cells[0]];
  while (q.length) {
    var c = q.shift();
    cells.forEach(function (x) {
      if (Math.abs(x[0] - c[0]) + Math.abs(x[1] - c[1]) === 1 && !seen.some(function (y) { return same(x, y); })) { seen.push(x); q.push(x); }
    });
  }
  return seen.length === cells.length;
}
function place(cells, content) {
  if (!cells.every(buildable)) return '그 자리에는 못 놓아요';
  if (content === 'boss' && Object.keys(B.pieces).some(function (id) { return B.pieces[id].content === 'boss'; })) return '보스방은 층마다 1개예요';
  if (summary().cost + pieceCost(content, cells.length) > A4.budget) return '금화가 모자라요';
  var id = 'p' + B.nextId++;
  B.pieces[id] = { id: id, content: content, cells: cells, closed: {} };
  cells.forEach(function (x) { B.owner[x[0]][x[1]] = id; });
  var err = autoDoors(id, A4.maxDoors); // 길이 이어지는 문 조합부터 잡고
  if (err) { removePiece(id); return err; }
  refreshDoors();                       // 나머지 맞닿은 길에도 문
  return null;
}
// 방을 허물면 그 자리는 통로가 된다. 다른 방과 맞닿은 문은 그 방의 문으로 남긴다.
function removePiece(id) {
  var p = B.pieces[id];
  doorsOf(id).forEach(function (d) { if (!ownerAt(d.outer) || ownerAt(d.outer) === id) delete B.doors[d.k]; });
  p.cells.forEach(function (x) { B.owner[x[0]][x[1]] = null; B.ground[x[0]][x[1]] = 'tunnel'; });
  delete B.pieces[id];
  refreshDoors();
}
function editPiece(id, content) {
  var p = B.pieces[id], others = summary().cost - pieceCost(p.content, p.cells.length);
  if (others + pieceCost(content, p.cells.length) > A4.budget) return '금화가 모자라요';
  p.content = content;
  return null;
}
// 통로 파기(바위→통로) / 메우기(통로→바위). 메워서 길이 끊기면 되돌린다.
function digFill(x, mode) {
  if (!inB(x[0], x[1]) || ownerAt(x)) return null;
  var g = groundAt(x);
  if (mode === 'dig' && g === 'rock') { B.ground[x[0]][x[1]] = 'tunnel'; refreshDoors(); return null; }
  if (mode === 'fill' && g === 'tunnel') {
    var gone = {};
    Object.keys(B.doors).forEach(function (k) { var e = B.doors[k]; if (same(e[0], x) || same(e[1], x)) { gone[k] = e; delete B.doors[k]; } });
    B.ground[x[0]][x[1]] = 'rock';
    if (!connected()) {
      B.ground[x[0]][x[1]] = 'tunnel';
      Object.keys(gone).forEach(function (k) { B.doors[k] = gone[k]; });
      return '여기를 메우면 길이 끊겨요';
    }
    refreshDoors();
  }
  return null;
}

// ---------- 침입 계산 (A3와 같음, 출구는 문 단위) ----------
function simulate(seed) {
  var rand = rng(seed), P = A4.party, inv = [], rooms = {}, frames = [], lostUnits = 0;
  for (var i = 0; i < P.count; i++) inv.push(P.hp);
  Object.keys(B.pieces).forEach(function (id) {
    var p = B.pieces[id], it = itemOf(p.content);
    if (it.kind === 'unit') rooms[id] = p.cells.map(function () { return it.hp; });
    if (it.kind === 'boss') rooms[id] = [it.hp];
  });
  var pos = A4.entry, sup = A4.supplies, time = 0, avoid = {}, mode = 'attack', outcome = null, fled = 0, forced = null, justLeft = null;
  function alive() { return inv.filter(function (h) { return h > 0; }).length; }
  function aliveIdx() { var a = []; inv.forEach(function (h, k) { if (h > 0) a.push(k); }); return a; }
  function unitsAlive(id) { return rooms[id].filter(function (h) { return h > 0; }).length; }
  function snap() { var s = {}; Object.keys(rooms).forEach(function (id) { s[id] = unitsAlive(id); }); return s; }
  function frame(cell, text, cost) {
    sup -= cost; time += cost;
    frames.push({ cell: cell, text: text, cost: cost, alive: alive(), hp: inv.slice(), sup: Math.max(sup, 0), rooms: snap(), mode: mode });
  }
  function hitRandom(dmg) {
    var a = aliveIdx(); if (!a.length) return false;
    var k = a[Math.floor(rand() * a.length)];
    inv[k] -= dmg;
    return inv[k] <= 0;
  }
  function fightRound(id, atk) {
    var u = rooms[id];
    aliveIdx().forEach(function () {
      for (var j = 0; j < u.length; j++) if (u[j] > 0) { u[j] -= P.atk; if (u[j] <= 0) lostUnits++; break; }
    });
    u.forEach(function (h) { if (h > 0) hitRandom(atk); });
  }
  function enterRoom(id, from, inner) {
    var p = B.pieces[id], it = itemOf(p.content), n = p.cells.length, res = 'pass';
    frame(inner, it.name + (it.kind === 'trap' || it.kind === 'unit' ? ' ×' + n + ' 방' : '') + '에 들어감', 1);
    if (it.kind === 'trap') {
      var dead = 0;
      for (var t = 0; t < n; t++) if (hitRandom(it.dmg)) dead++;
      frame(inner, it.name + ' ' + n + '개 발동! 각 -' + it.dmg + (dead ? ', ' + dead + '명 쓰러짐' : ''), 1);
    } else if (it.kind === 'maze' && mode !== 'flee') {
      frame(inner, '미로에서 헤맴 (보급 -' + A4.mazeCost + ')', A4.mazeCost);
    } else if ((it.kind === 'unit' || it.kind === 'boss') && unitsAlive(id)) {
      var name = it.kind === 'boss' ? it.unit : it.name;
      if (mode === 'flee') {
        rooms[id].forEach(function (h) { if (h > 0) hitRandom(it.atk); });
        frame(inner, '도망치는 등 뒤로 ' + name + '가 공격', 1);
      } else if (it.kind === 'boss') {
        for (var br = 1; alive() && unitsAlive(id); br++) {
          fightRound(id, it.atk);
          frame(inner, '보스전 ' + br + '합: ' + it.unit + ' 체력 ' + Math.max(rooms[id][0], 0) + ', 침입자 ' + alive() + '명', 2);
        }
        if (!alive()) return;
        res = 'clear';
      } else {
        for (var round = 1; round <= A4.maxRounds && alive() && unitsAlive(id); round++) {
          var before = alive(), ub = unitsAlive(id);
          fightRound(id, it.atk);
          frame(inner, round + '합: 부대 ' + ub + '→' + unitsAlive(id) + ', 침입자 ' + before + '→' + alive(), 2);
        }
        if (!alive()) return;
        res = !unitsAlive(id) ? 'clear' : alive() > unitsAlive(id) ? 'push' : 'retreat';
      }
    }
    if (mode === 'flee') { pos = inner; return; }
    if (res === 'retreat') { avoid[id] = true; pos = from; frame(from, '밀려서 퇴각! 다른 길을 찾는다', 1); return; }
    var exits = doorsOf(id).filter(function (d) { return canPass(d.inner, d.outer); }); // 들어온 문 포함, 문마다 같은 확률
    var ex = exits[Math.floor(rand() * exits.length)];
    pos = ex.inner; forced = ex.outer; justLeft = id;
    frame(pos, (res === 'clear' ? '방을 정리하고' : res === 'push' ? '수로 밀어붙여' : '방을 지나') + ' 문 ' + exits.length + '개 중 하나로 나감', 0);
  }

  frame(pos, P.name + ' ' + P.count + '명이 입구에 모였다', 0);
  for (var guard = 0; guard < 600 && !outcome; guard++) {
    if (!alive()) { outcome = 'wiped'; break; }
    if (mode === 'attack' && same(pos, A4.gold)) { outcome = 'breach'; break; }
    if (mode === 'flee' && same(pos, A4.entry)) { fled = alive(); outcome = 'fled'; break; }
    if (mode === 'attack' && sup <= 0) { mode = 'flee'; forced = null; frame(pos, '보급이 바닥났다! 입구로 도주한다', 0); }
    var next = forced;
    forced = null;
    if (!next) {
      var goal = mode === 'flee' ? A4.entry : A4.gold, av = {};
      if (mode !== 'flee') { Object.keys(avoid).forEach(function (k) { av[k] = true; }); if (justLeft) av[justLeft] = true; }
      var path = bfs(pos, goal, av);
      if (!path && justLeft && mode !== 'flee') { delete av[justLeft]; path = bfs(pos, goal, av); }
      if (!path) { avoid = {}; path = bfs(pos, goal, {}); }
      if (!path) break;
      next = path[0];
    }
    var o = ownerAt(next);
    if (o && o !== ownerAt(pos)) {
      if (o !== justLeft) justLeft = null;
      enterRoom(o, pos, next);
    } else { pos = next; frame(pos, null, 1); }
  }
  return { outcome: outcome || 'wiped', fled: fled, killed: A4.party.count - alive(), lostUnits: lostUnits, time: time, frames: frames };
}
