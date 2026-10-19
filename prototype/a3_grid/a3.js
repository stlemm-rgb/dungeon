// 시안 A3: 칸을 골라 방 만들기(팝업) + 방향별 문 + 끌어서 놓는 벽·빈 방·특수 방(미로, 보스방).
// 함정·부대 숫자는 ../common/rules.js(PROTO.items)를 같이 쓴다. 버려도 되는 코드.
var A3 = {
  cols: 5, rows: 7, entry: [0, 2], gold: [6, 2],
  budget: 180,
  maxRoom: 4,     // 방 하나에 고를 수 있는 칸 수
  party: { name: '모험가', count: 3, hp: 60, atk: 10 },
  supplies: 45,   // 보급(초). 걷기 1칸 = 1, 전투 1합 = 2. 바닥나면 입구로 도주
  maxRounds: 3,
  mazeCost: 8,    // 미로에서 헤매는 데 드는 보급
  extra: {
    empty: { name: '빈 방', short: '빈 방', kind: 'empty', cost: 3, value: 1 },
    wall: { name: '벽', short: '벽', kind: 'wall', cost: 2, value: 0 },
    maze: { name: '3×3 미로', short: '미로', kind: 'maze', cost: 30, value: 20, size: [3, 3] },
    boss: { name: '2×2 보스방', short: '보스', kind: 'boss', cost: 70, value: 70, size: [2, 2], hp: 140, atk: 16, unit: '오우거' }
  },
  speeds: [{ label: '×1', ms: 700 }, { label: '×4', ms: 175 }, { label: '즉시', ms: 0 }]
};
var DIRS = [{ k: 'up', dr: -1, dc: 0, label: '위' }, { k: 'down', dr: 1, dc: 0, label: '아래' },
  { k: 'left', dr: 0, dc: -1, label: '왼쪽' }, { k: 'right', dr: 0, dc: 1, label: '오른쪽' }];
var OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

function itemOf(content) { return PROTO.items[content] || A3.extra[content]; }
function rng(seed) { // mulberry32
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------- 판 상태 ----------
var B = { pieces: {}, owner: [], nextId: 1 };
function resetBoard() {
  B.pieces = {}; B.owner = [];
  for (var r = 0; r < A3.rows; r++) { B.owner.push([]); for (var c = 0; c < A3.cols; c++) B.owner[r].push(null); }
}
function same(a, b) { return a[0] === b[0] && a[1] === b[1]; }
function inB(r, c) { return r >= 0 && r < A3.rows && c >= 0 && c < A3.cols; }
function ownerAt(cell) { return B.owner[cell[0]][cell[1]]; }
function pieceAt(cell) { var o = ownerAt(cell); return o ? B.pieces[o] : null; }
function isWall(cell) { var p = pieceAt(cell); return !!p && p.content === 'wall'; }
function dirOf(a, b) { for (var i = 0; i < 4; i++) if (DIRS[i].dr === b[0] - a[0] && DIRS[i].dc === b[1] - a[1]) return DIRS[i].k; }
function doorCount(p) { return DIRS.filter(function (d) { return p.doors[d.k]; }).length; }

// a에서 b로 한 칸 갈 수 있나. 방은 그 방향 문이 열려 있어야 하고, 방과 방 사이는 마주 보는 문이 둘 다 열려야 한다.
function canPass(a, b) {
  if (!inB(b[0], b[1]) || isWall(a) || isWall(b)) return false;
  var pa = pieceAt(a), pb = pieceAt(b), d = dirOf(a, b);
  if (pa === pb) return true;
  if (pa && !pa.doors[d]) return false;
  if (pb && !pb.doors[OPP[d]]) return false;
  return true;
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
function connected() { return !!bfs(A3.entry, A3.gold, {}); }

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
  s.budgetOk = s.cost <= A3.budget;
  s.ok = s.ratioOk && s.valueOk && s.budgetOk;
  return s;
}
function pieceCost(content, n) { var it = itemOf(content); return it.cost * (it.size ? 1 : n); }

// 고른 칸들이 서로 이어져 있나
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

// 조각 놓기. 실패하면 이유 글자를 돌려준다. doors 생략 시 4방향 모두 열림.
function place(cells, content, doors) {
  for (var i = 0; i < cells.length; i++) {
    var x = cells[i];
    if (!inB(x[0], x[1])) return '판 밖으로 나가요';
    if (same(x, A3.entry) || same(x, A3.gold)) return '입구·보물방에는 못 놓아요';
    if (ownerAt(x)) return '이미 무언가 있어요';
  }
  if (content === 'boss' && Object.keys(B.pieces).some(function (id) { return B.pieces[id].content === 'boss'; })) return '보스방은 층마다 1개예요';
  if (summary().cost + pieceCost(content, cells.length) > A3.budget) return '금화가 모자라요';
  var id = 'p' + B.nextId++;
  B.pieces[id] = { id: id, content: content, cells: cells, doors: doors || { up: true, down: true, left: true, right: true } };
  cells.forEach(function (x) { B.owner[x[0]][x[1]] = id; });
  if (!connected()) { removePiece(id); return '입구에서 보물방까지 길이 막혀요'; }
  return null;
}
function removePiece(id) {
  B.pieces[id].cells.forEach(function (x) { B.owner[x[0]][x[1]] = null; });
  delete B.pieces[id];
}
// 방의 내용·문 바꾸기 (팝업에서). 길이 막히면 되돌린다.
function editPiece(id, content, doors) {
  var p = B.pieces[id], old = { content: p.content, doors: p.doors };
  var others = summary().cost - pieceCost(p.content, p.cells.length);
  if (others + pieceCost(content, p.cells.length) > A3.budget) return '금화가 모자라요';
  p.content = content; p.doors = doors;
  if (!connected()) { p.content = old.content; p.doors = old.doors; return '이 문을 닫으면 길이 막혀요'; }
  return null;
}

// ---------- 침입 계산 ----------
function simulate(seed) {
  var rand = rng(seed), P = A3.party, inv = [], rooms = {}, frames = [], lostUnits = 0;
  for (var i = 0; i < P.count; i++) inv.push(P.hp);
  Object.keys(B.pieces).forEach(function (id) {
    var p = B.pieces[id], it = itemOf(p.content);
    if (it.kind === 'unit') rooms[id] = p.cells.map(function () { return it.hp; });
    if (it.kind === 'boss') rooms[id] = [it.hp];
  });
  var pos = A3.entry, sup = A3.supplies, time = 0, avoid = {}, mode = 'attack', outcome = null, fled = 0, forced = null, justLeft = null;
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
  function fightRound(id, atk) { // 침입자는 살아 있는 첫 부대를 노리고, 부대는 무작위 침입자를 노린다
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
      frame(inner, '미로에서 헤맴 (보급 -' + A3.mazeCost + ')', A3.mazeCost);
    } else if ((it.kind === 'unit' || it.kind === 'boss') && unitsAlive(id)) {
      var name = it.kind === 'boss' ? it.unit : it.name;
      if (mode === 'flee') {
        rooms[id].forEach(function (h) { if (h > 0) hitRandom(it.atk); });
        frame(inner, '도망치는 등 뒤로 ' + name + '가 공격', 1);
      } else if (it.kind === 'boss') { // 보스방: 퇴각 없이 한쪽이 쓰러질 때까지
        for (var br = 1; alive() && unitsAlive(id); br++) {
          fightRound(id, it.atk);
          frame(inner, '보스전 ' + br + '합: ' + it.unit + ' 체력 ' + Math.max(rooms[id][0], 0) + ', 침입자 ' + alive() + '명', 2);
        }
        if (!alive()) return;
        res = 'clear';
      } else {
        for (var round = 1; round <= A3.maxRounds && alive() && unitsAlive(id); round++) {
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
    // 나갈 문을 무작위로 (들어온 문 포함). 문(방향) 단위로 고르고, 그 방향에 맞닿은 칸이 여럿이면 그중 하나
    var byDir = {};
    p.cells.forEach(function (c) {
      DIRS.forEach(function (d) {
        var o = [c[0] + d.dr, c[1] + d.dc];
        if (inB(o[0], o[1]) && ownerAt(o) !== id && canPass(c, o)) (byDir[d.k] = byDir[d.k] || []).push([c, o]);
      });
    });
    var exits = Object.keys(byDir), opts = byDir[exits[Math.floor(rand() * exits.length)]];
    var ex = opts[Math.floor(rand() * opts.length)];
    pos = ex[0]; forced = ex[1]; justLeft = id; // 다음 걸음은 고른 문 밖으로, 방금 나온 방은 곧바로 다시 안 들어감
    frame(pos, (res === 'clear' ? '방을 정리하고' : res === 'push' ? '수로 밀어붙여' : '방을 지나') + ' 출구 ' + exits.length + '곳 중 하나로 나감', 0);
  }

  frame(pos, P.name + ' ' + P.count + '명이 입구로 들어왔다', 0);
  for (var guard = 0; guard < 600 && !outcome; guard++) {
    if (!alive()) { outcome = 'wiped'; break; }
    if (mode === 'attack' && same(pos, A3.gold)) { outcome = 'breach'; break; }
    if (mode === 'flee' && same(pos, A3.entry)) { fled = alive(); outcome = 'fled'; break; }
    if (mode === 'attack' && sup <= 0) { mode = 'flee'; forced = null; frame(pos, '보급이 바닥났다! 입구로 도주한다', 0); }
    var next = forced;
    forced = null;
    if (!next) {
      var goal = mode === 'flee' ? A3.entry : A3.gold, av = {};
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
  return { outcome: outcome || 'wiped', fled: fled, killed: A3.party.count - alive(), lostUnits: lostUnits, time: time, frames: frames };
}
