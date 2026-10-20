/* C1 구역 판 규칙 (시안 A7 prototype/a7_nest16/rules.js 에서 복사, 숫자 그대로. 화면 그리기 없음)
 *
 *  - 5x7 칸 판, 구역 16곳 (야외 Y, 입구 E, 시설 구역 13곳, 보스·보물방 B). 구역은 2~4칸 덩어리.
 *  - 시설은 구역 종류마다 정해진 목록 (fac[...].for). 비용·가치는 칸 수만큼 커진다 (perCell).
 *  - 이동 (사용자 결정): 갈림길에서 반반 나뉨, 미끼 쪽으로 몰림, 몬스터가 든 대기실은 피함, 함정은 모르고 들어감.
 *    forecast = 길만 계산해서 "침입자 n명이 각 문을 몇 명 지나가나" 미리 보기 (전투 없음).
 *  - 몬스터 가치는 A7이 종류 표를 썼지만 C1 몬스터는 하나씩 능력치가 달라서 임시 식으로 바꿈 (monValue).
 *  - 상태는 갖지 않는다. 구역별 시설 {E:'split', ...}과 대기실 몬스터 {LB:[id,...]}는 progress.js의 RUN.site가 들고 있다.
 */
(function () {
  'use strict';

  var TRAP_PER_CELL = 6;          // 함정 복도: 칸당 피해
  var PREVIEW_INVADERS = 12;      // 문 위 숫자를 계산할 침입자 수 (battle.js의 TOTAL과 같게, 임시)

  // 5x7 판의 칸마다 구역 키 (사용자 빨간 선 그림)
  var MAP = [
    ['TL', 'TL', 'E', 'TR', 'TR'],
    ['TL', 'LB', 'CB', 'RB', 'TR'],
    ['LB', 'LB', 'CB', 'RB', 'RB'],
    ['LC', 'LC', 'CC', 'RC', 'RC'],
    ['LC', 'LC', 'CC', 'RC', 'RC'],
    ['LD', 'LD', 'CD', 'RD', 'RD'],
    ['LE', 'LE', 'B', 'RE', 'RE']
  ];
  var NAMES = { Y: '야외', E: '입구', TL: '왼쪽 위', TR: '오른쪽 위', LB: '왼쪽 1', CB: '가운데 1', RB: '오른쪽 1', LC: '왼쪽 2', CC: '가운데 2', RC: '오른쪽 2',
    LD: '왼쪽 3', CD: '가운데 3', RD: '오른쪽 3', LE: '왼쪽 4', RE: '오른쪽 4', B: '보스·보물방' };
  // 길: 각 구역에서 갈 수 있는 다음 구역
  var EXITS = { E: ['TL', 'CB', 'TR'], TL: ['LB'], TR: ['RB'], LB: ['LC', 'CB'], RB: ['RC', 'CB'], CB: ['CC'],
    LC: ['LD', 'CC'], RC: ['RD', 'CC'], CC: ['CD'], LD: ['LE', 'CD'], RD: ['RE', 'CD'], CD: ['B'], LE: ['B'], RE: ['B'] };
  var ORDER = ['E', 'TL', 'TR', 'LB', 'RB', 'CB', 'LC', 'RC', 'CC', 'LD', 'RD', 'CD', 'LE', 'RE']; // 침입 계산 순서 (앞 구역이 먼저)
  var CENTER = ['CB', 'CC', 'CD'];
  var FAC = {
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
  };

  // 구역별 칸 수·칸 목록
  var CELLS = {};
  MAP.forEach(function (row, r) { row.forEach(function (k, c) { (CELLS[k] = CELLS[k] || []).push([r, c]); }); });

  function sizeOf(z) { return z === 'Y' ? 1 : CELLS[z].length; }
  function zoneType(z) { return z === 'Y' ? 'yard' : z === 'E' ? 'entry' : z === 'B' ? 'boss' : 'room'; }
  function facFor(z) { var t = zoneType(z); return Object.keys(FAC).filter(function (k) { return FAC[k].for === t; }); }
  function costOf(k, z) { var f = FAC[k]; return f.perCell !== undefined ? f.perCell * sizeOf(z) : f.cost; }
  function valueOf(k, z) { var f = FAC[k]; return f.valuePerCell !== undefined ? f.valuePerCell * sizeOf(z) : f.value; }
  function slotsOf(k, z) { return FAC[k].kind === 'den' ? 2 * sizeOf(z) : 0; } // 칸당 몬스터 2자리
  function trapDmgOf(z) { return TRAP_PER_CELL * sizeOf(z); }
  // 몬스터 한 마리의 던전 가치 (임시 식: 체력과 공격으로. A7은 종류별 표 14~40)
  function monValue(m) { return Math.round((m.hp + m.atk * 4) / 6); }

  // 처음 부지: 입구는 분기, 야외는 숲, 나머지는 빈 구역 (모두 무료)
  function defaultZones() {
    var L = { Y: 'forest' };
    Object.keys(CELLS).forEach(function (z) { L[z] = zoneType(z) === 'entry' ? 'split' : zoneType(z) === 'boss' ? 'boss' : 'empty'; });
    return L;
  }

  // 요약: 던전 가치 (시설 + 대기실 몬스터), 함정·대기실 수. monById(id) -> 몬스터
  function summary(zones, units, monById) {
    var s = { value: 0, trap: 0, den: 0, monsters: 0 };
    Object.keys(zones).forEach(function (z) {
      var k = zones[z], f = FAC[k];
      if (!f) return;
      s.value += valueOf(k, z);
      if (f.kind === 'trap') s.trap++;
      if (f.kind === 'den') s.den++;
      (units[z] || []).forEach(function (id) {
        var m = monById(id);
        if (m) { s.value += monValue(m); s.monsters++; }
      });
    });
    return s;
  }

  // 갈림길에서 어디로 갈까: 미끼 쪽 +2, 몬스터가 든 대기실 쪽 -1 (보여서 피함), 함정·빈 구역 0. 점수가 가장 높은 쪽들로 번갈아 나뉨
  function exitScore(zones, units, z) {
    if (z === 'B') return 0;
    var f = FAC[zones[z]];
    if (f.kind === 'lure') return 2;
    if (f.kind === 'den' && (units[z] || []).length) return -1;
    return 0;
  }
  function chooseExits(zones, units, from) {
    var E = zones.E, ex = EXITS[from];
    if (from === 'E' && E === 'wait') return ['CB'];
    if (from === 'E' && E === 'left') return ['TL'];
    if (from === 'E' && E === 'right') return ['TR'];
    var sc = ex.map(function (z) { return exitScore(zones, units, z); }), best = Math.max.apply(null, sc);
    return ex.filter(function (z, i) { return sc[i] === best; });
  }
  // 길만 계산 (전투 없이): 침입자 n명이 각 구역에 몇 명 오고(at), 각 문을 몇 명 지나가는지(flow, "TL>LB" 형식)
  function forecast(zones, units, n) {
    var at = { E: n }, flow = {};
    ORDER.forEach(function (z) {
      var k = at[z] || 0; if (!k) return;
      var to = chooseExits(zones, units, z);
      for (var i = 0; i < k; i++) { var t = to[i % to.length]; at[t] = (at[t] || 0) + 1; flow[z + '>' + t] = (flow[z + '>' + t] || 0) + 1; }
    });
    return { at: at, flow: flow };
  }

  // 문(구역 사이 길)과 맞닿은 두 칸 (화면이 문 표시 위치를 구할 때)
  function sharedEdge(a, b) {
    for (var i = 0; i < CELLS[a].length; i++) {
      var x = CELLS[a][i];
      for (var j = 0; j < CELLS[b].length; j++) { var y = CELLS[b][j]; if (Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) === 1) return [x, y]; }
    }
    return null;
  }
  function flowPairs() {
    var p = [];
    Object.keys(EXITS).forEach(function (a) { EXITS[a].forEach(function (b) { p.push([a, b]); }); });
    return p;
  }

  window.ZONES = {
    MAP: MAP, NAMES: NAMES, EXITS: EXITS, CENTER: CENTER, FAC: FAC, CELLS: CELLS,
    PREVIEW_INVADERS: PREVIEW_INVADERS, ALL: Object.keys(CELLS).concat(['Y']),
    sizeOf: sizeOf, zoneType: zoneType, facFor: facFor, costOf: costOf, valueOf: valueOf, slotsOf: slotsOf, trapDmgOf: trapDmgOf,
    monValue: monValue, defaultZones: defaultZones, summary: summary, forecast: forecast, sharedEdge: sharedEdge, flowPairs: flowPairs
  };
})();
