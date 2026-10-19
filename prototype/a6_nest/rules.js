// 시안 A6 규칙: 둥지짓는 드래곤식 구역 11곳 + 시설 + 몬스터 대기실 배치.
// 시설 안 칸 이동은 없고 효과 순서로만 처리. 공격 대상이 정해져 있어 같은 배치는 늘 같은 결과. 버려도 되는 코드.
var A6 = {
  budget: 300, buildsPerDay: 4, days: [4, 5, 6], minValue: 250,
  inv: { name: '모험가', hp: 45, atk: 8 },
  trapDmg: 12, forestDmg: 8, rounds: 4, ambush: 1.5,
  // 칸 판(5×8) 위 구역 자리. lane: 이 구역을 지나는 갈래
  zones: [
    { k: 'Y', name: '야외', r: 0, c: 0, w: 5, kind: 'yard' },
    { k: 'E', name: '입구', r: 1, c: 2, kind: 'entry' },
    { k: 'L1', name: '왼쪽 1', r: 2, c: 0, lane: 'L' }, { k: 'C1', name: '가운데 1', r: 2, c: 2, lane: 'C' }, { k: 'R1', name: '오른쪽 1', r: 2, c: 4, lane: 'R' },
    { k: 'L2', name: '왼쪽 2', r: 3, c: 0, lane: 'L' }, { k: 'C2', name: '가운데 2', r: 3, c: 2, lane: 'C' }, { k: 'R2', name: '오른쪽 2', r: 3, c: 4, lane: 'R' },
    { k: 'L3', name: '왼쪽 3', r: 4, c: 0, lane: 'L' }, { k: 'R3', name: '오른쪽 3', r: 4, c: 4, lane: 'R' },
    { k: 'N', name: '용의 둥지', r: 6, c: 2, kind: 'nest' }
  ],
  lanes: { L: ['L1', 'L2', 'L3'], C: ['C1', 'C2'], R: ['R1', 'R2', 'R3'] },
  fac: {
    forest: { name: '숲', short: '숲', cost: 0, value: 0, kind: 'none', st: '아무 일 없음', for: 'yard' },
    thorn: { name: '덫 숲', short: '덫 숲', cost: 20, value: 10, kind: 'none', st: '들어오기 전 전원 -8', for: 'yard' },
    split: { name: '분기', short: '분기', cost: 0, value: 0, kind: 'turn', st: '침입자를 왼쪽·가운데·오른쪽으로 번갈아', for: 'entry' },
    wait: { name: '대기', short: '대기', cost: 10, value: 0, kind: 'turn', st: '전원을 가운데로 (가장 짧은 길)', for: 'entry' },
    left: { name: '굽은길 ←', short: '굽은길←', cost: 10, value: 0, kind: 'turn', st: '전원을 왼쪽 길로', for: 'entry' },
    right: { name: '굽은길 →', short: '굽은길→', cost: 10, value: 0, kind: 'turn', st: '전원을 오른쪽 길로', for: 'entry' },
    empty: { name: '빈 구역', short: '빈 구역', cost: 0, value: 0, kind: 'none', st: '그냥 지나감', for: 'room' },
    trap: { name: '함정 복도', short: '함정', cost: 20, value: 20, kind: 'trap', st: '지나는 적 전원에게 피해 12', for: 'room' },
    den: { name: '몬스터 대기실', short: '대기실', cost: 20, value: 10, kind: 'den', slots: 2, st: '몬스터 2마리 자리. 바로 앞이 함정이면 기습 ×1.5', for: 'room' },
    nestEmpty: { name: '빈 둥지', short: '빈 둥지', cost: 0, value: 0, kind: 'none', st: '그냥 지나감', for: 'nest' },
    bigDen: { name: '큰 대기실', short: '큰 대기실', cost: 40, value: 20, kind: 'den', slots: 4, st: '몬스터 4마리 자리. 마지막 관문', for: 'nest' }
  },
  roster: { gob: 6, skel: 4, orc: 3 }, // 대기 중인 몬스터 (PROTO.items 숫자 사용)
  reqs: {
    trap: { name: '함정 의뢰', text: '함정 복도 60% 이상 + 가치 250 이상', kind: 'trap' },
    den: { name: '몬스터 의뢰', text: '몬스터 대기실 60% 이상 + 가치 250 이상', kind: 'den' }
  }
};
function defaultLayout() {
  var L = {};
  A6.zones.forEach(function (z) { L[z.k] = z.kind === 'yard' ? 'forest' : z.kind === 'entry' ? 'split' : z.kind === 'nest' ? 'nestEmpty' : 'empty'; });
  return L;
}
function facFor(z) { var t = z.kind === 'yard' ? 'yard' : z.kind === 'entry' ? 'entry' : z.kind === 'nest' ? 'nest' : 'room'; return Object.keys(A6.fac).filter(function (k) { return A6.fac[k].for === t; }); }

// 가치: 시설 가치 + 배치한 몬스터 가치
function summaryOf(layout, units, req) {
  var s = { cost: 0, value: 0, trap: 0, den: 0 };
  Object.keys(layout).forEach(function (z) {
    var f = A6.fac[layout[z]]; s.cost += f.cost; s.value += f.value;
    if (f.kind === 'trap') s.trap++;
    if (f.kind === 'den') s.den++;
    (units[z] || []).forEach(function (m) { s.value += PROTO.items[m].value; });
  });
  var tot = s.trap + s.den, r = A6.reqs[req];
  s.ratio = tot ? s[r.kind] / tot : 0;
  s.ratioOk = s.ratio >= 0.6; s.valueOk = s.value >= A6.minValue; s.ok = s.ratioOk && s.valueOk;
  s.left = A6.budget - s.cost;
  return s;
}

// 침입 계산. steps: 화면이 한 장씩 보여 줄 장면, contrib: 구역별 피해·처치
function simulate(layout, units, n) {
  var inv = [], steps = [], contrib = {};
  var E = layout.E;
  for (var i = 0; i < n; i++) inv.push({ hp: A6.inv.hp, trap: false, lane: E === 'wait' ? 'C' : E === 'left' ? 'L' : E === 'right' ? 'R' : ['L', 'C', 'R'][i % 3] });
  function alive(g) { return g.filter(function (v) { return v.hp > 0; }); }
  function nameOf(z) { return A6.zones.filter(function (x) { return x.k === z; })[0].name; }
  steps.push({ z: 'Y', n: n, text: A6.inv.name + ' ' + n + '명이 공터에 모였다' });
  if (layout.Y === 'thorn') { inv.forEach(function (v) { v.hp -= A6.forestDmg; }); steps.push({ z: 'Y', n: n, text: '덫 숲: 전원 -' + A6.forestDmg }); contrib.Y = { dmg: n * A6.forestDmg, kill: 0 }; }
  steps.push({ z: 'E', n: n, text: '입구 (' + A6.fac[E].name + ')' });
  function zone(z, group) {
    var g = alive(group), f = A6.fac[layout[z]], c = contrib[z] = contrib[z] || { dmg: 0, kill: 0 };
    if (!g.length) return;
    if (f.kind === 'trap') {
      g.forEach(function (v) { var b = v.hp; v.hp -= A6.trapDmg; c.dmg += Math.min(b, A6.trapDmg); if (v.hp <= 0) c.kill++; v.trap = true; });
      steps.push({ z: z, n: g.length, text: nameOf(z) + ' 함정: ' + g.length + '명 각 -' + A6.trapDmg });
      return;
    }
    var amb = g.some(function (v) { return v.trap; });
    g.forEach(function (v) { v.trap = false; });
    var us = (f.kind === 'den' ? units[z] || [] : []).map(function (m) { return { m: m, hp: PROTO.items[m].hp }; });
    if (!us.length) { steps.push({ z: z, n: g.length, text: null }); return; }
    var before = g.length;
    for (var r = 0; r < A6.rounds; r++) {
      if (!alive(g).length || !us.some(function (u) { return u.hp > 0; })) break;
      alive(g).forEach(function () { for (var j = 0; j < us.length; j++) if (us[j].hp > 0) { us[j].hp -= A6.inv.atk; break; } });
      us.forEach(function (u) {
        if (u.hp <= 0) return;
        var t = alive(g)[0]; if (!t) return;
        var atk = PROTO.items[u.m].atk * (amb ? A6.ambush : 1), b = t.hp;
        t.hp -= atk; c.dmg += Math.min(b, atk); if (t.hp <= 0) c.kill++;
      });
    }
    var lost = us.filter(function (u) { return u.hp <= 0; }).length;
    steps.push({ z: z, n: before, text: nameOf(z) + ' 대기실' + (amb ? ' 기습' : '') + ': 침입자 ' + before + '→' + alive(g).length + '명' + (lost ? ', 몬스터 ' + lost + '마리 쓰러짐' : '') });
  }
  ['L', 'C', 'R'].forEach(function (ln) { A6.lanes[ln].forEach(function (z) { zone(z, inv.filter(function (v) { return v.lane === ln; })); }); });
  zone('N', inv);
  var reached = alive(inv).length;
  steps.push({ z: 'G', n: reached, text: reached ? reached + '명이 보물방까지 왔다!' : '아무도 보물방에 못 왔다' });
  return { n: n, reached: reached, killed: n - reached, steps: steps, contrib: contrib };
}
