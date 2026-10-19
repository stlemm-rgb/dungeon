// 시안 A7 규칙: 사용자 빨간 선 그림 기준 구역 16곳(야외 + 입구 + 시설 구역 13 + 보스·보물방).
// 구역은 칸 여러 개짜리 덩어리. 큰 구역일수록 함정이 세고 몬스터 자리가 많다.
// 이동: 갈림길에서 나뉘고 시설에 따라 몰린다 (미끼 쪽으로 몰림, 몬스터가 보이는 대기실은 피함, 함정은 모름). 버려도 되는 코드.
var A7 = {
  budget: 300, days: [5, 6, 8], minValue: 450,
  inv: { name: '모험가', hp: 45, atk: 8 },
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
  // 길: 각 구역에서 갈 수 있는 다음 구역. 옆길은 아래로 내려가거나 가운데로 빠짐 (가운데 쪽으로만 가서 되돌아오지 않음)
  exits: { E: ['TL', 'CB', 'TR'], TL: ['LB'], TR: ['RB'], LB: ['LC', 'CB'], RB: ['RC', 'CB'], CB: ['CC'],
    LC: ['LD', 'CC'], RC: ['RD', 'CC'], CC: ['CD'], LD: ['LE', 'CD'], RD: ['RE', 'CD'], CD: ['B'], LE: ['B'], RE: ['B'] },
  order: ['E', 'TL', 'TR', 'LB', 'RB', 'CB', 'LC', 'RC', 'CC', 'LD', 'RD', 'CD', 'LE', 'RE'], // 침입 계산 순서 (앞 구역이 먼저)
  center: ['CB', 'CC', 'CD'],
  fac: {
    forest: { name: '숲', short: '숲', cost: 0, value: 0, kind: 'none', st: '아무 일 없음', for: 'yard' },
    thorn: { name: '덫 숲', short: '덫 숲', cost: 20, value: 10, kind: 'none', st: '들어오기 전 전원 -8', for: 'yard' },
    split: { name: '분기', short: '분기', cost: 0, value: 0, kind: 'turn', st: '갈림길 규칙대로 세 갈래로 나뉨 (미끼 쪽으로 몰리고 몬스터는 피함)', for: 'entry' },
    wait: { name: '대기', short: '대기', cost: 10, value: 0, kind: 'turn', st: '전원을 가운데로 (가장 짧은 길)', for: 'entry' },
    left: { name: '굽은길 ←', short: '굽은길←', cost: 10, value: 0, kind: 'turn', st: '전원을 왼쪽 길로', for: 'entry' },
    right: { name: '굽은길 →', short: '굽은길→', cost: 10, value: 0, kind: 'turn', st: '전원을 오른쪽 길로', for: 'entry' },
    empty: { name: '빈 구역', short: '빈 구역', perCell: 0, value: 0, kind: 'none', st: '그냥 지나감', for: 'room' },
    lure: { name: '미끼', short: '미끼', cost: 20, value: 0, kind: 'lure', st: '보물 냄새로 바로 앞 갈림길의 침입자를 전원 이쪽으로 끌어들임 (피해 없음)', for: 'room' },
    trap: { name: '함정 복도', short: '함정', perCell: 10, valuePerCell: 10, kind: 'trap', st: '지나는 적 전원에게 칸당 피해 6', for: 'room' },
    den: { name: '몬스터 대기실', short: '대기실', perCell: 10, valuePerCell: 5, kind: 'den', st: '칸당 몬스터 2자리. 몬스터가 보이면 침입자가 피해 감(다른 길이 있으면). 바로 앞이 함정이면 기습 ×1.5', for: 'room' },
    boss: { name: '보스·보물방', short: '보스·보물', cost: 0, value: 0, kind: 'none', st: '친위대 자리 (나중에)', for: 'boss' }
  },
  roster: { gob: 10, skel: 8, orc: 5 },
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
function slotsOf(k, z) { return A7.fac[k].kind === 'den' ? 2 * sizeOf(z) : 0; } // 칸당 몬스터 2자리
function trapDmgOf(z) { return A7.trapPerCell * sizeOf(z); }
// ---------- 몬스터 한 마리씩 (회차가 바뀌어도 회사에 남음, 레벨이 오르면 체력·공격 +20%) ----------
A7.monOf = function (id) { return { type: id, lv: 1 }; }; // 화면이 실제 명부로 바꿔 끼움 (규칙 시험용 기본값: id = 종류)
A7.levelUp = function (lv) { return lv * 2; }; // 다음 레벨까지 필요한 처치 수
function monStat(id) {
  var m = A7.monOf(id), b = PROTO.items[m.type], mul = 1 + 0.2 * (m.lv - 1);
  return { name: b.name, short: b.short, hp: Math.round(b.hp * mul), atk: Math.round(b.atk * mul), value: b.value, lv: m.lv, type: m.type };
}
// ---------- 회차와 의뢰서 ----------
// 명성이 오를수록 침입자가 늘고 강해지고, 요구와 보상도 커진다
function makeContracts(fame) {
  return ['trap', 'den'].map(function (kind) {
    return { kind: kind, name: A7.reqs[kind].name, days: [5 + fame, 6 + fame, 8 + fame], hp: 45 + 5 * fame,
      minValue: 450 + 50 * fame, fee: 200 + 50 * fame, advance: 300 + 50 * fame }; // advance: 마왕이 주는 공사 선금
  });
}
function applyContract(c, gold) { A7.days = c.days; A7.inv.hp = c.hp; A7.minValue = c.minValue; A7.budget = gold + c.advance; } // 공사 예산 = 회사 자금 + 선금
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
    (units[z] || []).forEach(function (m) { s.value += monStat(m).value; });
  });
  var tot = s.trap + s.den, r = A7.reqs[req];
  s.ratio = tot ? s[r.kind] / tot : 0;
  s.ratioOk = s.ratio >= 0.6; s.valueOk = s.value >= A7.minValue; s.ok = s.ratioOk && s.valueOk;
  s.left = A7.budget - s.cost;
  return s;
}
// 갈림길에서 어디로 갈까: 미끼 쪽 +2, 몬스터가 든 대기실 쪽 -1 (보여서 피함), 함정·빈 구역 0. 점수가 가장 높은 쪽들로 번갈아 나뉨
function exitScore(layout, units, z) {
  if (z === 'B') return 0;
  var f = A7.fac[layout[z]];
  if (f.kind === 'lure') return 2;
  if (f.kind === 'den' && (units[z] || []).length) return -1;
  return 0;
}
function chooseExits(layout, units, from) {
  var E = layout.E, ex = A7.exits[from];
  if (from === 'E' && E === 'wait') return ['CB'];
  if (from === 'E' && E === 'left') return ['TL'];
  if (from === 'E' && E === 'right') return ['TR'];
  var sc = ex.map(function (z) { return exitScore(layout, units, z); }), best = Math.max.apply(null, sc);
  return ex.filter(function (z, i) { return sc[i] === best; });
}
// 길만 계산 (전투 없이): 오늘 각 길로 몇 명이 지나갈지 미리 보기
function forecast(layout, units, n) {
  var at = { E: n }, flow = {};
  A7.order.forEach(function (z) {
    var k = at[z] || 0; if (!k) return;
    var to = chooseExits(layout, units, z);
    for (var i = 0; i < k; i++) { var t = to[i % to.length]; at[t] = (at[t] || 0) + 1; flow[z + '>' + t] = (flow[z + '>' + t] || 0) + 1; }
  });
  return { at: at, flow: flow };
}
function simulate(layout, units, n) {
  var steps = [], contrib = {}, flow = {}, groups = { E: [] }, kills = {}, exp = {};
  for (var i = 0; i < n; i++) groups.E.push({ hp: A7.inv.hp, trap: false });
  function alive(g) { return g.filter(function (v) { return v.hp > 0; }); }
  steps.push({ z: 'Y', n: n, text: A7.inv.name + ' ' + n + '명이 공터에 모였다' });
  if (layout.Y === 'thorn') { groups.E.forEach(function (v) { v.hp -= A7.forestDmg; }); steps.push({ z: 'Y', n: n, text: '덫 숲: 전원 -' + A7.forestDmg }); contrib.Y = { dmg: n * A7.forestDmg, kill: 0 }; }
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
    var us = (f.kind === 'den' ? units[z] || [] : []).map(function (m) { var st = monStat(m); return { m: m, hp: st.hp, atk: st.atk, kills: 0 }; });
    if (!us.length) { steps.push({ z: z, n: g.length, text: f.kind === 'lure' ? A7.names[z] + ' 미끼에 ' + g.length + '명이 몰려옴' : null }); return; }
    var before = g.length;
    for (var r = 0; r < A7.rounds; r++) {
      if (!alive(g).length || !us.some(function (u) { return u.hp > 0; })) break;
      alive(g).forEach(function () { for (var j = 0; j < us.length; j++) if (us[j].hp > 0) { us[j].hp -= A7.inv.atk; break; } });
      us.forEach(function (u) {
        if (u.hp <= 0) return;
        var t = alive(g)[0]; if (!t) return;
        var atk = u.atk * (amb ? A7.ambush : 1), b = t.hp;
        t.hp -= atk; c.dmg += Math.min(b, atk); if (t.hp <= 0) { c.kill++; u.kills++; kills[u.m] = (kills[u.m] || 0) + 1; }
      });
    }
    us.forEach(function (u) { exp[u.m] = (exp[u.m] || 0) + 1 + u.kills; }); // 경험치: 싸움에 참가 1 + 처치 1씩
    var lost = us.filter(function (u) { return u.hp <= 0; }).length;
    steps.push({ z: z, n: before, text: A7.names[z] + ' 대기실' + (amb ? ' 기습' : '') + ': 침입자 ' + before + '→' + alive(g).length + '명' + (lost ? ', 몬스터 ' + lost + '마리 쓰러짐' : '') });
  }
  A7.order.forEach(function (z) {
    var g = groups[z] || [];
    if (z === 'E') steps.push({ z: 'E', n: alive(g).length, text: '입구 (' + A7.fac[layout.E].name + ')' }); else zone(z, g);
    var live = alive(g); if (!live.length) return;
    var to = chooseExits(layout, units, z);
    if (to.length > 1 || A7.exits[z].length > 1) steps.push({ z: z, n: live.length, text: A7.names[z] + ' 갈림길 → ' + to.map(function (t) { return (A7.names[t] || t); }).join(' / ') + (to.length > 1 ? ' (나뉨)' : ' (몰림)') });
    live.forEach(function (v, i) { var t = to[i % to.length]; (groups[t] = groups[t] || []).push(v); flow[z + '>' + t] = (flow[z + '>' + t] || 0) + 1; });
  });
  var reached = alive(groups.B || []).length;
  steps.push({ z: 'B', n: reached, text: reached ? reached + '명이 보스·보물방까지 왔다! (친위대는 나중에)' : '아무도 보스·보물방에 못 왔다' });
  return { n: n, reached: reached, killed: n - reached, steps: steps, contrib: contrib, flow: flow, kills: kills, exp: exp };
}
