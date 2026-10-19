// 시안 A7 규칙: 사용자 빨간 선 그림 기준 구역 16곳(야외 + 입구 + 시설 구역 13 + 보스·보물방).
// 구역은 칸 여러 개짜리 덩어리. 큰 구역일수록 함정이 세고 몬스터 자리가 많다.
// 이동은 아직 왼쪽·가운데·오른쪽 길을 차례로 지나는 임시 방식 (사용자 메모: 추후 수정). 버려도 되는 코드.
var A7 = {
  budget: 300, buildsPerDay: 4, days: [5, 6, 8], minValue: 450,
  inv: { name: '모험가', hp: 50, atk: 8 },
  trapPerCell: 6, forestDmg: 8, rounds: 4, ambush: 1.5,
  // 5×7 판의 칸마다 구역 키 (사용자 빨간 선 그림)
  map: [
    ['TL', 'TL', 'E', 'TR', 'TR'],
    ['TL', 'LB', 'CB', 'RB', 'TR'],
    ['LB', 'LB', 'CB', 'RB', 'RB'],
    ['LC', 'LC', 'CC', 'RC', 'RC'],
    ['LC', 'LC', 'CC', 'RC', 'RC'],
    ['LD', 'LD', 'CD', 'RD', 'RD'],
    ['LE', 'LE', 'B', 'RE', 'RE']
  ],
  names: { Y: '야외', E: '입구', TL: '왼쪽 위', TR: '오른쪽 위', LB: '왼쪽 1', CB: '가운데 1', RB: '오른쪽 1', LC: '왼쪽 2', CC: '가운데 2', RC: '오른쪽 2',
    LD: '왼쪽 3', CD: '가운데 3', RD: '오른쪽 3', LE: '왼쪽 4', RE: '오른쪽 4', B: '보스·보물방' },
  lanes: { L: ['TL', 'LB', 'LC', 'LD', 'LE'], C: ['CB', 'CC', 'CD'], R: ['TR', 'RB', 'RC', 'RD', 'RE'] },
  fac: {
    forest: { name: '숲', short: '숲', cost: 0, value: 0, kind: 'none', st: '아무 일 없음', for: 'yard' },
    thorn: { name: '덫 숲', short: '덫 숲', cost: 20, value: 10, kind: 'none', st: '들어오기 전 전원 -8', for: 'yard' },
    split: { name: '분기', short: '분기', cost: 0, value: 0, kind: 'turn', st: '침입자를 왼쪽·가운데·오른쪽으로 번갈아', for: 'entry' },
    wait: { name: '대기', short: '대기', cost: 10, value: 0, kind: 'turn', st: '전원을 가운데로 (가장 짧은 길)', for: 'entry' },
    left: { name: '굽은길 ←', short: '굽은길←', cost: 10, value: 0, kind: 'turn', st: '전원을 왼쪽 길로', for: 'entry' },
    right: { name: '굽은길 →', short: '굽은길→', cost: 10, value: 0, kind: 'turn', st: '전원을 오른쪽 길로', for: 'entry' },
    empty: { name: '빈 구역', short: '빈 구역', perCell: 0, value: 0, kind: 'none', st: '그냥 지나감', for: 'room' },
    trap: { name: '함정 복도', short: '함정', perCell: 10, valuePerCell: 10, kind: 'trap', st: '지나는 적 전원에게 칸당 피해 6', for: 'room' },
    den: { name: '몬스터 대기실', short: '대기실', perCell: 10, valuePerCell: 5, kind: 'den', st: '칸 수만큼 몬스터 자리. 바로 앞이 함정이면 기습 ×1.5', for: 'room' },
    boss: { name: '보스·보물방', short: '보스·보물', cost: 0, value: 0, kind: 'none', st: '친위대 자리 (나중에)', for: 'boss' }
  },
  roster: { gob: 8, skel: 6, orc: 4 },
  reqs: {
    trap: { name: '함정 의뢰', text: '함정 복도 60% 이상 + 가치 450 이상', kind: 'trap' },
    den: { name: '몬스터 의뢰', text: '몬스터 대기실 60% 이상 + 가치 450 이상', kind: 'den' }
  }
};
// 구역별 칸 수
A7.cells = {};
A7.map.forEach(function (row, r) { row.forEach(function (k, c) { (A7.cells[k] = A7.cells[k] || []).push([r, c]); }); });
function sizeOf(z) { return z === 'Y' ? 1 : A7.cells[z].length; }
function zoneType(z) { return z === 'Y' ? 'yard' : z === 'E' ? 'entry' : z === 'B' ? 'boss' : 'room'; }
function facFor(z) { var t = zoneType(z); return Object.keys(A7.fac).filter(function (k) { return A7.fac[k].for === t; }); }
function costOf(k, z) { var f = A7.fac[k]; return f.perCell !== undefined ? f.perCell * sizeOf(z) : f.cost; }
function valueOf(k, z) { var f = A7.fac[k]; return f.valuePerCell !== undefined ? f.valuePerCell * sizeOf(z) : f.value; }
function slotsOf(k, z) { return A7.fac[k].kind === 'den' ? sizeOf(z) : 0; }
function trapDmgOf(z) { return A7.trapPerCell * sizeOf(z); }
function defaultLayout() {
  var L = { Y: 'forest' };
  Object.keys(A7.cells).forEach(function (z) { L[z] = zoneType(z) === 'entry' ? 'split' : zoneType(z) === 'boss' ? 'boss' : 'empty'; });
  return L;
}
function summaryOf(layout, units, req) {
  var s = { cost: 0, value: 0, trap: 0, den: 0 };
  Object.keys(layout).forEach(function (z) {
    var k = layout[z], f = A7.fac[k]; s.cost += costOf(k, z); s.value += valueOf(k, z);
    if (f.kind === 'trap') s.trap++;
    if (f.kind === 'den') s.den++;
    (units[z] || []).forEach(function (m) { s.value += PROTO.items[m].value; });
  });
  var tot = s.trap + s.den, r = A7.reqs[req];
  s.ratio = tot ? s[r.kind] / tot : 0;
  s.ratioOk = s.ratio >= 0.6; s.valueOk = s.value >= A7.minValue; s.ok = s.ratioOk && s.valueOk;
  s.left = A7.budget - s.cost;
  return s;
}
function simulate(layout, units, n) {
  var inv = [], steps = [], contrib = {}, E = layout.E;
  for (var i = 0; i < n; i++) inv.push({ hp: A7.inv.hp, trap: false, lane: E === 'wait' ? 'C' : E === 'left' ? 'L' : E === 'right' ? 'R' : ['L', 'C', 'R'][i % 3] });
  function alive(g) { return g.filter(function (v) { return v.hp > 0; }); }
  steps.push({ z: 'Y', n: n, text: A7.inv.name + ' ' + n + '명이 공터에 모였다' });
  if (layout.Y === 'thorn') { inv.forEach(function (v) { v.hp -= A7.forestDmg; }); steps.push({ z: 'Y', n: n, text: '덫 숲: 전원 -' + A7.forestDmg }); contrib.Y = { dmg: n * A7.forestDmg, kill: 0 }; }
  steps.push({ z: 'E', n: n, text: '입구 (' + A7.fac[E].name + ')' });
  function zone(z, group) {
    var g = alive(group), f = A7.fac[layout[z]], c = contrib[z] = contrib[z] || { dmg: 0, kill: 0 };
    if (!g.length) return;
    if (f.kind === 'trap') {
      var d = trapDmgOf(z);
      g.forEach(function (v) { var b = v.hp; v.hp -= d; c.dmg += Math.min(b, d); if (v.hp <= 0) c.kill++; v.trap = true; });
      steps.push({ z: z, n: g.length, text: A7.names[z] + ' 함정: ' + g.length + '명 각 -' + d });
      return;
    }
    var amb = g.some(function (v) { return v.trap; });
    g.forEach(function (v) { v.trap = false; });
    var us = (f.kind === 'den' ? units[z] || [] : []).map(function (m) { return { m: m, hp: PROTO.items[m].hp }; });
    if (!us.length) { steps.push({ z: z, n: g.length, text: null }); return; }
    var before = g.length;
    for (var r = 0; r < A7.rounds; r++) {
      if (!alive(g).length || !us.some(function (u) { return u.hp > 0; })) break;
      alive(g).forEach(function () { for (var j = 0; j < us.length; j++) if (us[j].hp > 0) { us[j].hp -= A7.inv.atk; break; } });
      us.forEach(function (u) {
        if (u.hp <= 0) return;
        var t = alive(g)[0]; if (!t) return;
        var atk = PROTO.items[u.m].atk * (amb ? A7.ambush : 1), b = t.hp;
        t.hp -= atk; c.dmg += Math.min(b, atk); if (t.hp <= 0) c.kill++;
      });
    }
    var lost = us.filter(function (u) { return u.hp <= 0; }).length;
    steps.push({ z: z, n: before, text: A7.names[z] + ' 대기실' + (amb ? ' 기습' : '') + ': 침입자 ' + before + '→' + alive(g).length + '명' + (lost ? ', 몬스터 ' + lost + '마리 쓰러짐' : '') });
  }
  ['L', 'C', 'R'].forEach(function (ln) { A7.lanes[ln].forEach(function (z) { zone(z, inv.filter(function (v) { return v.lane === ln; })); }); });
  var reached = alive(inv).length;
  steps.push({ z: 'B', n: reached, text: reached ? reached + '명이 보스·보물방까지 왔다! (친위대는 나중에)' : '아무도 보스·보물방에 못 왔다' });
  return { n: n, reached: reached, killed: n - reached, steps: steps, contrib: contrib };
}
