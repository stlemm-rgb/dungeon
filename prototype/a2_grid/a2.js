// 시안 A2: 칸 단위 + 조각(방·벽) 배치 + 문 + 침입자 무리(퇴각·돌파·도주).
// 함정·부대 숫자는 ../common/rules.js(PROTO.items)를 같이 쓴다. 버려도 되는 코드.
var A2 = {
  cols: 7, rows: 9, entry: [0, 3], gold: [8, 3],
  budget: 180,
  party: { name: '모험가', count: 3, hp: 60, atk: 10 },
  supplies: 45,   // 보급(초). 걷기 1칸 = 1, 전투 1합 = 2. 바닥나면 입구로 도망
  maxRounds: 3,   // 몬스터 방에서 싸우는 최대 합 수
  extra: {
    empty: { name: '빈 방', short: '빈 방', kind: 'empty', cost: 3, value: 1 },
    wall: { name: '벽', short: '벽', kind: 'wall', cost: 2, value: 0 }
  },
  contents: ['spike', 'rock', 'gob', 'skel', 'orc', 'empty', 'wall'],
  shapes: {
    one: { label: '1칸', cells: [[0, 0]] },
    two: { label: '2칸', cells: [[0, 0], [0, 1]] },
    three: { label: '3칸', cells: [[0, 0], [0, 1], [0, 2]] },
    bend: { label: 'ㄱ자', cells: [[0, 0], [0, 1], [1, 1]] }
  },
  speeds: [{ label: '×1', ms: 700 }, { label: '×4', ms: 175 }, { label: '즉시', ms: 0 }]
};
var DIRS = [{ dr: -1, dc: 0, label: '위' }, { dr: 1, dc: 0, label: '아래' }, { dr: 0, dc: -1, label: '왼쪽' }, { dr: 0, dc: 1, label: '오른쪽' }];

function itemOf(content) { return PROTO.items[content] || A2.extra[content]; }
function rng(seed) { // mulberry32
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------- 판 상태 ----------
var B = { pieces: {}, owner: [], doors: {}, nextId: 1 };
function resetBoard() {
  B.pieces = {}; B.doors = {}; B.owner = [];
  for (var r = 0; r < A2.rows; r++) { B.owner.push([]); for (var c = 0; c < A2.cols; c++) B.owner[r].push(null); }
}
function same(a, b) { return a[0] === b[0] && a[1] === b[1]; }
function inB(r, c) { return r >= 0 && r < A2.rows && c >= 0 && c < A2.cols; }
function ownerAt(cell) { return B.owner[cell[0]][cell[1]]; }
function pieceAt(cell) { var o = ownerAt(cell); return o ? B.pieces[o] : null; }
function isWall(cell) { var p = pieceAt(cell); return !!p && p.content === 'wall'; }
function edgeKey(r, c, dr, dc) {
  if (dr === 1) return r + ',' + c + 'S';
  if (dr === -1) return (r - 1) + ',' + c + 'S';
  if (dc === 1) return r + ',' + c + 'E';
  return r + ',' + (c - 1) + 'E';
}
function canPass(a, b) {
  if (!inB(b[0], b[1]) || isWall(a) || isWall(b)) return false;
  if (ownerAt(a) === ownerAt(b)) return true;
  return !!B.doors[edgeKey(a[0], a[1], b[0] - a[0], b[1] - a[1])];
}
function neighbors(cell) {
  return DIRS.map(function (d) { return [cell[0] + d.dr, cell[1] + d.dc]; })
    .filter(function (n) { return canPass(cell, n); });
}
// start에서 goal까지 가장 짧은 길 (start 제외). avoid에 든 방은 지나지 않는다.
function bfs(start, goal, avoid) {
  var prev = {}, q = [start], key = function (x) { return x[0] + ',' + x[1]; };
  prev[key(start)] = null;
  while (q.length) {
    var cur = q.shift();
    if (same(cur, goal)) {
      var path = [];
      for (var k = cur; !same(k, start); k = prev[key(k)]) path.unshift(k);
      return path;
    }
    neighbors(cur).forEach(function (n) {
      var o = ownerAt(n);
      if (prev[key(n)] !== undefined || (o && avoid[o] && o !== ownerAt(start))) return;
      prev[key(n)] = cur;
      q.push(n);
    });
  }
  return null;
}
function connected() { return !!bfs(A2.entry, A2.gold, {}); }

function shapeCells(shape, rot) {
  var cells = A2.shapes[shape].cells.map(function (x) { return x.slice(); });
  for (var i = 0; i < rot % 4; i++) cells = cells.map(function (x) { return [x[1], -x[0]]; });
  var mr = Math.min.apply(null, cells.map(function (x) { return x[0]; }));
  var mc = Math.min.apply(null, cells.map(function (x) { return x[1]; }));
  return cells.map(function (x) { return [x[0] - mr, x[1] - mc]; });
}

function summary() {
  var s = { cost: 0, value: 0, traps: 0, units: 0 };
  Object.keys(B.pieces).forEach(function (id) {
    var p = B.pieces[id], it = itemOf(p.content), n = p.cells.length;
    s.cost += it.cost * n; s.value += it.value * n;
    if (it.kind === 'trap') s.traps += n;
    if (it.kind === 'unit') s.units += n;
  });
  var all = s.traps + s.units;
  s.ratio = all ? s.traps / all : 0;
  s.ratioOk = s.ratio > PROTO.demand.trapRatioOver;
  s.valueOk = s.value >= PROTO.demand.minValue;
  s.budgetOk = s.cost <= A2.budget;
  s.ok = s.ratioOk && s.valueOk && s.budgetOk;
  return s;
}

// 조각 놓기. 실패하면 이유 글자를 돌려준다.
function place(r, c, content, shape, rot) {
  var cells = shapeCells(shape, rot).map(function (x) { return [x[0] + r, x[1] + c]; });
  for (var i = 0; i < cells.length; i++) {
    var x = cells[i];
    if (!inB(x[0], x[1])) return '판 밖으로 나가요';
    if (same(x, A2.entry) || same(x, A2.gold)) return '입구·보물방에는 못 놓아요';
    if (ownerAt(x)) return '이미 무언가 있어요';
  }
  if (summary().cost + itemOf(content).cost * cells.length > A2.budget) return '금화가 모자라요';
  var id = 'p' + B.nextId++;
  B.pieces[id] = { id: id, content: content, cells: cells };
  cells.forEach(function (x) { B.owner[x[0]][x[1]] = id; });
  if (content !== 'wall') cells.forEach(function (x) { // 방은 바깥 변이 모두 문으로 열린 채 시작. 필요 없는 문은 유저가 닫는다
    DIRS.forEach(function (d) { if (doorable(x, d)) B.doors[edgeKey(x[0], x[1], d.dr, d.dc)] = true; });
  });
  if (!connected()) { removePiece(id); return '입구에서 보물방까지 길이 막혀요'; }
  return null;
}
function removePiece(id) {
  var cells = B.pieces[id].cells;
  delete B.pieces[id];
  cells.forEach(function (x) { B.owner[x[0]][x[1]] = null; });
  cells.forEach(function (x) { // 이웃 방과 맞닿은 문은 남긴다 (이웃 방 입장에서는 바닥으로 난 문)
    DIRS.forEach(function (d) {
      var n = [x[0] + d.dr, x[1] + d.dc];
      if (!inB(n[0], n[1]) || !pieceAt(n) || isWall(n)) delete B.doors[edgeKey(x[0], x[1], d.dr, d.dc)];
    });
  });
}
// 방 칸의 한 변에 문을 낼 수 있는가 (방 경계이고, 바깥이 판 안이고 벽이 아님)
function doorable(cell, d) {
  var p = pieceAt(cell), n = [cell[0] + d.dr, cell[1] + d.dc];
  return !!p && p.content !== 'wall' && inB(n[0], n[1]) && ownerAt(n) !== p.id && !isWall(n);
}
function toggleDoor(cell, d) {
  if (!doorable(cell, d)) return '여기에는 문을 낼 수 없어요';
  var k = edgeKey(cell[0], cell[1], d.dr, d.dc);
  var had = !!B.doors[k];
  if (had) delete B.doors[k]; else B.doors[k] = true;
  if (!connected()) { if (had) B.doors[k] = true; else delete B.doors[k]; return '이 문을 닫으면 길이 막혀요'; }
  return null;
}

// ---------- 침입 계산 ----------
// frames: 화면이 한 장씩 보여 줄 장면. cost = 걸린 초(보급).
function simulate(seed) {
  var rand = rng(seed), P = A2.party, inv = [], rooms = {}, frames = [], lostUnits = 0;
  for (var i = 0; i < P.count; i++) inv.push(P.hp);
  Object.keys(B.pieces).forEach(function (id) {
    var p = B.pieces[id], it = itemOf(p.content);
    if (it.kind === 'unit') rooms[id] = p.cells.map(function () { return it.hp; });
  });
  var pos = A2.entry, sup = A2.supplies, time = 0, avoid = {}, mode = 'attack', outcome = null, fled = 0, forced = null;
  function alive() { return inv.filter(function (h) { return h > 0; }).length; }
  function aliveIdx() { var a = []; inv.forEach(function (h, k) { if (h > 0) a.push(k); }); return a; }
  function unitsAlive(id) { return rooms[id].filter(function (h) { return h > 0; }).length; }
  function snap() { var s = {}; Object.keys(rooms).forEach(function (id) { s[id] = unitsAlive(id); }); return s; }
  function frame(cell, text, cost) {
    sup -= cost; time += cost;
    frames.push({ cell: cell, text: text, cost: cost, alive: alive(), hp: inv.slice(), sup: Math.max(sup, 0), rooms: snap(), mode: mode });
  }
  function hitRandom(dmg) {
    var a = aliveIdx(); if (!a.length) return;
    var k = a[Math.floor(rand() * a.length)];
    inv[k] -= dmg;
    return inv[k] <= 0;
  }
  function enterRoom(id, from, inner) {
    var p = B.pieces[id], it = itemOf(p.content), n = p.cells.length, res = 'pass';
    frame(inner, it.name + (it.kind === 'empty' ? '' : ' ×' + n) + ' 방에 들어감', 1);
    if (it.kind === 'trap') {
      var dead = 0;
      for (var t = 0; t < n; t++) if (hitRandom(it.dmg)) dead++;
      frame(inner, it.name + ' ' + n + '개 발동! 각 -' + it.dmg + (dead ? ', ' + dead + '명 쓰러짐' : ''), 1);
    } else if (it.kind === 'unit') {
      var u = rooms[id];
      if (mode === 'flee') {
        u.forEach(function (h) { if (h > 0) hitRandom(it.atk); });
        frame(inner, '도망치는 등 뒤로 ' + it.name + '가 공격', 1);
      } else {
        for (var round = 1; round <= A2.maxRounds && alive() && unitsAlive(id); round++) {
          var before = alive(), ub = unitsAlive(id);
          aliveIdx().forEach(function () { // 침입자는 살아 있는 첫 부대를 노림
            for (var j = 0; j < u.length; j++) if (u[j] > 0) { u[j] -= P.atk; if (u[j] <= 0) lostUnits++; break; }
          });
          u.forEach(function (h) { if (h > 0) hitRandom(it.atk); });
          frame(inner, round + '합: 부대 ' + ub + '→' + unitsAlive(id) + ', 침입자 ' + before + '→' + alive(), 2);
        }
        if (!alive()) return;
        res = !unitsAlive(id) ? 'clear' : alive() > unitsAlive(id) ? 'push' : 'retreat';
      }
    }
    if (mode === 'flee') { pos = inner; return; }
    if (res === 'retreat') { avoid[id] = true; pos = from; frame(from, '밀려서 퇴각! 다른 길을 찾는다', 1); return; }
    // 나갈 문을 무작위로 (들어온 문 포함)
    var exits = [];
    p.cells.forEach(function (c) {
      DIRS.forEach(function (d) {
        var o = [c[0] + d.dr, c[1] + d.dc];
        if (ownerAt(o) !== id && canPass(c, o)) exits.push([c, o]);
      });
    });
    var ex = exits[Math.floor(rand() * exits.length)];
    pos = ex[0]; forced = ex[1]; // 다음 걸음은 고른 문 밖으로
    frame(pos, (res === 'clear' ? '방을 정리하고' : res === 'push' ? '수로 밀어붙여' : '방을 지나') + ' 문 ' + exits.length + '개 중 하나로 나감', 0);
  }

  frame(pos, P.name + ' ' + P.count + '명이 입구로 들어왔다', 0);
  for (var guard = 0; guard < 600 && !outcome; guard++) {
    if (!alive()) { outcome = 'wiped'; break; }
    if (mode === 'attack' && same(pos, A2.gold)) { outcome = 'breach'; break; }
    if (mode === 'flee' && same(pos, A2.entry)) { fled = alive(); outcome = 'fled'; break; }
    if (mode === 'attack' && sup <= 0) { mode = 'flee'; forced = null; frame(pos, '보급이 바닥났다! 입구로 도망친다', 0); }
    var next = forced;
    forced = null;
    if (!next) {
      var goal = mode === 'flee' ? A2.entry : A2.gold;
      var path = bfs(pos, goal, mode === 'flee' ? {} : avoid);
      if (!path) { avoid = {}; path = bfs(pos, goal, {}); }
      if (!path) break;
      next = path[0];
    }
    var o = ownerAt(next);
    if (o && o !== ownerAt(pos)) enterRoom(o, pos, next);
    else { pos = next; frame(pos, null, 1); }
  }
  return { outcome: outcome || 'wiped', fled: fled, killed: A2.party.count - alive(), lostUnits: lostUnits,
    time: time, frames: frames };
}
