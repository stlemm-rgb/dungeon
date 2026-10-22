/* D1 구역 판 규칙 (C1 zones.js에서 이어 옴. 화면 그리기 없음)
 *
 *  D1 2차: 세로 지하 층. useSite(판, 층 수, 열린 층 수)로 현장 배치를 끼운다 (1층 = 판 3종 중 하나, 2층 = 작은 판 FLOOR_BOARD_DATA).
 *    2층 구역 id는 층 번호를 붙여 '2E'·'2H'·'2B' (1층 id와 안 섞임). 2층이 열리면 1층 B = 계단 -> 2층 입구, 보물방 = goal() = '2B'.
 *    ZONES.MAP은 예전 화면 호환으로 1층만, 층별은 floorMap(n)·floorInfo(n)·stackMap(). 통과 비율은 층마다 그 층 입구 기준
 *  D1 바뀐 점: 던전 가치 = 시설 점수만(몬스터 제외) · 데모 시설 제한(BATTLE_DATA.DEMO_FACILITIES) · 고정 구역 시설('fz_' + id, 못 지음) ·
 *    대기실 자리 = 칸당 부대 하나(DEN_SLOTS_PER_CELL) · 전투력 B안용 passRatios(통과 비율)·trapScore(함정 점수)
 *  - 5x7 칸 판. 구역 id Y(야외)·E(입구, 맨 위 가운데)·B(보스·보물방, 맨 아래 가운데)는 모든 판 공통. 나머지 구역은 2~4칸 덩어리.
 *  - 부지 모양(판) 3종 = BOARD_DATA (fork3 세 갈래 · line 외길 · fork2x 이중 갈림길). 판마다 구역 id·이름·길(exits)·큰길(center)·입구 출구(entry).
 *    useBoard(id)로 지금 판을 바꿔 끼우면 ZONES.MAP·NAMES·EXITS·CENTER·CELLS·ALL·ORDER와 모든 계산 함수가 그 판 기준이 된다.
 *    지금 판은 progress.js(RUN.site.board)가 정하고 부지가 바뀌거나 불러올 때 useBoard를 부른다. boardInfo(id)는 지금 판이 아니어도 읽기 가능(의뢰 카드 미리보기)
 *  - 판 설계 기준: 전투는 분대(10명) 단위로 갈림길에서 번갈아 나뉘므로, 갈렸다가 다시 모이는 구역(합류점)이 있어야 함정 하나가 모두에게 닿는다.
 *    fork3 = 합류점 없음(옆길로 간 분대는 가운데를 안 지남) · fork2x = 합류점 1곳(HUB) · line = 큰길 전부가 합류점. 길이는 가장 긴 길이 ~11칸 안 (1분 제한에 퇴각이 쉬워지지 않게)
 *  - 시설은 구역 종류마다 정해진 목록 (fac[...].for). 비용·가치는 칸 수만큼 커진다 (perCell). 입구 시설 대기·굽은길은 그 판에 그 출구가 있을 때만
 *  - 이동 (사용자 결정): 갈림길에서 반반 나뉨, 미끼 쪽으로 몰림, 몬스터가 든 대기실은 피함, 함정은 모르고 들어감.
 *    forecast = 길만 계산해서 "침입자 n명이 각 문을 몇 명 지나가나" 미리 보기 (전투 없음).
 *  - 몬스터 가치는 A7이 종류 표를 썼지만 C1 몬스터는 하나씩 능력치가 달라서 임시 식으로 바꿈 (monValue).
 *  - 전투(battle_sim.js)는 routeOf(분대마다 길)·anchorOf·doorOf(칸 좌표)로 같은 판·같은 길 규칙을 따른다.
 *  - 튜토리얼 첫 부지(tutorialZones): fork3 판, 입구를 '대기'로 시작 -> 전원 가운데 길(E-CB-CC-CD-B) 한 줄. (입구 고정은 progress.js)
 *  - 상태는 갖지 않는다(지금 판 id만). 구역별 시설 {E:'split', ...}과 대기실 몬스터 {LB:[id,...]}는 progress.js의 RUN.site가 들고 있다.
 */
(function () {
  'use strict';

  var BD = window.BATTLE_DATA || {};
  var TRAP_PER_CELL = 6;          // 함정 복도: 칸당 피해
  var PREVIEW_INVADERS = 20;      // 문 위 숫자를 계산할 침입자 수 (평소 전투 = 무리 2개 × 10명, battle_data.js NORMAL과 같게, 임시)

  // ---------- 판 데이터 (고칠 때는 여기만) ----------
  // map = 칸마다 구역 id (E는 [0][2], B는 [6][2]), exits = 각 구역에서 갈 수 있는 다음 구역, center = 큰길(모두 모이는 길, 화면 설명용),
  // entry = 입구 시설이 보내는 출구 { wait: 가운데, left: 왼쪽, right: 오른쪽 } (없는 것은 그 판에서 못 지음)
  var BOARD_DATA = {
    // 세 갈래 (사용자 빨간 선 그림, 처음 판·튜토리얼 판)
    fork3: {
      name: '세 갈래', desc: '입구에서 세 길로 나뉘고 옆길은 가운데로 빠지거나 내려가요. 다시 모이는 곳이 없어 길마다 막아야 해요.',
      map: [
        ['TL', 'TL', 'E', 'TR', 'TR'],
        ['TL', 'LB', 'CB', 'RB', 'TR'],
        ['LB', 'LB', 'CB', 'RB', 'RB'],
        ['LC', 'LC', 'CC', 'RC', 'RC'],
        ['LC', 'LC', 'CC', 'RC', 'RC'],
        ['LD', 'LD', 'CD', 'RD', 'RD'],
        ['LE', 'LE', 'B', 'RE', 'RE']
      ],
      names: { TL: '왼쪽 위', TR: '오른쪽 위', LB: '왼쪽 1', CB: '가운데 1', RB: '오른쪽 1', LC: '왼쪽 2', CC: '가운데 2', RC: '오른쪽 2',
        LD: '왼쪽 3', CD: '가운데 3', RD: '오른쪽 3', LE: '왼쪽 4', RE: '오른쪽 4' },
      exits: { E: ['TL', 'CB', 'TR'], TL: ['LB'], TR: ['RB'], LB: ['LC', 'CB'], RB: ['RC', 'CB'], CB: ['CC'],
        LC: ['LD', 'CC'], RC: ['RD', 'CC'], CC: ['CD'], LD: ['LE', 'CD'], RD: ['RE', 'CD'], CD: ['B'], LE: ['B'], RE: ['B'] },
      center: ['CB', 'CC', 'CD'],
      entry: { wait: 'CB', left: 'TL', right: 'TR' }
    },
    // 외길: 큰길 하나(R1~R5)에 곁방(N*)이 붙음. 곁방으로 빠져도 바로 다음 큰길로 돌아온다 -> 큰길 어디든 모두 지난다
    line: {
      name: '외길', desc: '큰길 하나에 곁방이 붙은 길. 곁방으로 빠진 침입자도 바로 큰길로 돌아와 모두 같은 길을 지나요.',
      map: [
        ['NL1', 'NL1', 'E', 'NR1', 'NR1'],
        ['NL1', 'R1', 'R1', 'R1', 'NR1'],
        ['NL2', 'R2', 'R2', 'R2', 'NR2'],
        ['NL2', 'R3', 'R3', 'R3', 'NR2'],
        ['NL3', 'R4', 'R4', 'R4', 'NR3'],
        ['NL3', 'R5', 'R5', 'R5', 'NR3'],
        ['NL3', 'NL3', 'B', 'NR3', 'NR3']
      ],
      names: { R1: '큰길 1', R2: '큰길 2', R3: '큰길 3', R4: '큰길 4', R5: '큰길 5',
        NL1: '왼쪽 곁방 1', NR1: '오른쪽 곁방 1', NL2: '왼쪽 곁방 2', NR2: '오른쪽 곁방 2', NL3: '왼쪽 곁방 3', NR3: '오른쪽 곁방 3' },
      // 갈림길마다 큰길 순서를 다르게: 분대는 갈림길마다 번갈아 나뉘므로, 같은 분대가 곁방 셋을 다 돌아 길이 길어지는(1분 퇴각) 일을 막는다 (곁방 최대 2곳)
      exits: { E: ['R1', 'NL1', 'NR1'], NL1: ['R1'], NR1: ['R1'], R1: ['R2'], R2: ['NL2', 'R3', 'NR2'], NL2: ['R3'], NR2: ['R3'],
        R3: ['R4'], R4: ['NL3', 'NR3', 'R5'], NL3: ['R5'], NR3: ['R5'], R5: ['B'] },
      center: ['R1', 'R2', 'R3', 'R4', 'R5'],
      entry: { wait: 'R1', left: 'NL1', right: 'NR1' }, midDoors: true
    },
    // 이중 갈림길: 입구에서 두 갈래 -> 합류점(HUB)에서 모였다가 -> 다시 두 갈래로 보스방까지
    fork2x: {
      name: '이중 갈림길', desc: '두 갈래로 나뉘었다가 합류점에서 모이고, 다시 두 갈래로 나뉘어 보스방으로 가요.',
      map: [
        ['UL', 'UL', 'E', 'UR', 'UR'],
        ['UL', 'HUB', 'HUB', 'HUB', 'UR'],
        ['DL1', 'DL1', 'DL1', 'DR1', 'DR1'],
        ['DL2', 'DL2', 'DL1', 'DR1', 'DR1'],
        ['DL2', 'DL2', 'DR2', 'DR2', 'DR2'],
        ['DL3', 'DL3', 'DR2', 'DR3', 'DR3'],
        ['DL3', 'DL3', 'B', 'DR3', 'DR3']
      ],
      names: { UL: '왼쪽 위', UR: '오른쪽 위', HUB: '합류점', DL1: '왼쪽 아래 1', DL2: '왼쪽 아래 2', DL3: '왼쪽 아래 3',
        DR1: '오른쪽 아래 1', DR2: '오른쪽 아래 2', DR3: '오른쪽 아래 3' },
      exits: { E: ['UL', 'UR'], UL: ['HUB'], UR: ['HUB'], HUB: ['DL1', 'DR1'], DL1: ['DL2'], DL2: ['DL3'], DL3: ['B'],
        DR1: ['DR2'], DR2: ['DR3'], DR3: ['B'] },
      center: ['HUB'],
      entry: { left: 'UL', right: 'UR' }, midDoors: true
    }
  };
  var BOARD_IDS = ['fork3', 'line', 'fork2x'];
  var DEFAULT_BOARD = 'fork3';

  // ---------- 아래층 판 (D1 세로 지하 층) ----------
  // 2층부터 쓰는 작은 판. 구역 id는 이 표에서는 짧게 쓰고, 현장에 끼울 때 층 번호를 앞에 붙인다 (2층: 'E' -> '2E', 'H' -> '2H').
  // 그래서 1층(TL·CB·B ...)과 2층('2E'·'2H'·'2B' ...) 구역 id가 절대 섞이지 않는다.
  // 1층 맨 아래 가운데 'B'는 2층이 잠겨 있으면 보스·보물방, 2층이 열리면 계단(2층 입구로 내려감). 보물방은 늘 가장 깊이 열린 층의 맨 아래
  var FLOOR_BOARD_DATA = {
    // 작은 2층: 두 갈래로 내려와 합류점(H)에서 모였다가 다시 두 갈래로 보물방
    mini2: {
      name: '작은 2층', desc: '두 길로 나뉘었다가 합류점에서 모이고, 다시 두 길로 보물방에 가요.',
      map: [
        ['L', 'L', 'E', 'R', 'R'],
        ['L', 'H', 'H', 'H', 'R'],
        ['DL', 'DL', 'H', 'DR', 'DR'],
        ['DL', 'DL', 'B', 'DR', 'DR']
      ],
      names: { E: '입구', B: '보스·보물방', L: '왼쪽 길', R: '오른쪽 길', H: '합류점', DL: '왼쪽 아래', DR: '오른쪽 아래' },
      exits: { E: ['L', 'R'], L: ['H'], R: ['H'], H: ['DL', 'DR'], DL: ['B'], DR: ['B'] },
      center: ['H']
    }
  };
  var FLOOR_BOARD_OF = { 2: 'mini2', 3: 'mini2' };   // 몇 층에 어떤 작은 판 (3층은 데모 밖, 자리만)
  var FLOOR_GAP = 1;                                 // 층 사이 빈 줄 (계단 자리, 전투 화면 좌표용)

  var FAC = {
    forest: { name: '숲', short: '숲', cost: 0, value: 0, kind: 'none', st: '아무 일 없음', for: 'yard' },
    thorn: { name: '덫 숲', short: '덫 숲', cost: 20, value: 10, kind: 'none', st: '들어오기 전 전원 -8', for: 'yard' },
    split: { name: '분기', short: '분기', cost: 0, value: 0, kind: 'turn', st: '갈림길 규칙대로 나뉨 (미끼 쪽으로 몰리고 몬스터는 피함)', for: 'entry' },
    wait: { name: '대기', short: '대기', cost: 10, value: 0, kind: 'turn', st: '전원을 가운데로 (가장 짧은 길)', for: 'entry', turn: 'wait' },
    left: { name: '굽은길 ←', short: '굽은길←', cost: 10, value: 0, kind: 'turn', st: '전원을 왼쪽 길로', for: 'entry', turn: 'left' },
    right: { name: '굽은길 →', short: '굽은길→', cost: 10, value: 0, kind: 'turn', st: '전원을 오른쪽 길로', for: 'entry', turn: 'right' },
    empty: { name: '빈 구역', short: '빈 구역', perCell: 0, value: 0, kind: 'none', st: '그냥 지나감', for: 'room' },
    lure: { name: '미끼', short: '미끼', cost: 20, value: 0, kind: 'lure', st: '보물 냄새로 바로 앞 갈림길의 침입자를 전원 이쪽으로 끌어들임 (피해 없음)', for: 'room' },
    trap: { name: '함정 복도', short: '함정', perCell: 10, valuePerCell: 10, kind: 'trap', st: '지나는 적 전원에게 칸당 피해 6', for: 'room' },
    den: { name: '몬스터 대기실', short: '대기실', perCell: 10, valuePerCell: 5, kind: 'den', st: '칸당 부대 1자리. 그 층에 출진한 부대가 여기서 싸워요. 몬스터가 보이면 침입자가 피해 감(다른 길이 있으면). 바로 앞이 함정이면 기습 ×1.5', for: 'room' },
    boss: { name: '보스·보물방', short: '보스·보물', cost: 0, value: 0, kind: 'none', st: '침입자가 여기까지 오면 금을 약탈해요', for: 'boss' }
  };
  // 고정 구역 시설 (BATTLE_DATA.FIXED_ZONES): 'fz_' + id. 지을 수 없다(for: 'fixed'). 길 계산에서는 빈 구역처럼 지나감
  var FIXED_PREFIX = 'fz_';
  Object.keys(BD.FIXED_ZONES || {}).forEach(function (id) {
    var d = BD.FIXED_ZONES[id];
    FAC[FIXED_PREFIX + id] = { name: d.name, short: d.short, cost: 0, value: d.value || 0, kind: 'fixed', st: d.st, for: 'fixed', fixedId: id };
  });
  function fixedFac(id) { return FIXED_PREFIX + id; }
  function isFixedFac(k) { return !!(FAC[k] && FAC[k].kind === 'fixed'); }

  // ---------- 판 하나 준비 (칸 목록·계산 순서) ----------
  function cellsOf(map, rowOff) {
    var cells = {};
    map.forEach(function (row, r) { row.forEach(function (k, c) { (cells[k] = cells[k] || []).push([r + (rowOff || 0), c]); }); });
    return cells;
  }
  // 침입 계산 순서: 길을 따라 앞 구역이 먼저 (위상 정렬, 같으면 판 칸 순서). goal(보물방)은 빼고, 나가는 길이 있는 구역만
  function orderOf(keys, exits, goal) {
    var indeg = {}, out = [];
    keys.forEach(function (z) { indeg[z] = 0; });
    Object.keys(exits).forEach(function (a) { exits[a].forEach(function (b) { indeg[b] = (indeg[b] || 0) + 1; }); });
    var ready = keys.filter(function (z) { return !indeg[z]; });
    while (ready.length) {
      var z = ready.shift();
      if (z !== goal) out.push(z);
      (exits[z] || []).forEach(function (b) { if (--indeg[b] === 0) ready.push(b); });
    }
    return out.filter(function (z) { return exits[z] && exits[z].length; });
  }
  // 층 하나: n층 판 데이터를 구역 id에 층 번호를 붙여 펼친다 (1층은 그대로)
  function floorPart(n, boardId, rowOff) {
    var d = n === 1 ? BOARD_DATA[boardId] : FLOOR_BOARD_DATA[FLOOR_BOARD_OF[n] || 'mini2'];
    var pre = n === 1 ? '' : String(n);
    function g(k) { return pre + k; }
    var map = d.map.map(function (row) { return row.map(g); });
    var exits = {}; Object.keys(d.exits).forEach(function (a) { exits[g(a)] = d.exits[a].map(g); });
    var names = {}; Object.keys(d.names).forEach(function (k) { names[g(k)] = (n === 1 ? '' : n + '층 ') + d.names[k]; });
    var cells = cellsOf(map, rowOff);
    return { n: n, board: n === 1 ? boardId : FLOOR_BOARD_OF[n] || 'mini2', name: d.name, desc: d.desc, MAP: map, rowOff: rowOff, rows: map.length,
      entry: g('E'), bottom: g('B'), ids: Object.keys(cells), cells: cells, exits: exits, names: names, center: (d.center || []).map(g), ENTRY: n === 1 ? d.entry || {} : {} };
  }
  // 현장 배치 하나 (판 + 층 수 + 열린 층 수)를 계산용으로 준비. 결과는 cur (지금 배치)
  function makeLayout(boardId, floors, open) {
    floors = Math.max(1, floors | 0 || 1); open = Math.max(1, Math.min(floors, open | 0 || 1));
    var parts = [], rowOff = 0;
    for (var n = 1; n <= floors; n++) { var p = floorPart(n, boardId, rowOff); parts.push(p); rowOff += p.rows + FLOOR_GAP; }
    var cells = {}, exits = {}, names = { Y: '야외', E: '입구', B: '보스·보물방' }, center = [], keys = [];
    parts.forEach(function (p) {
      Object.keys(p.cells).forEach(function (z) { cells[z] = p.cells[z]; keys.push(z); });
      Object.keys(p.exits).forEach(function (z) { exits[z] = p.exits[z]; });
      Object.keys(p.names).forEach(function (z) { names[z] = p.names[z]; });
      names[p.entry] = p.n === 1 ? '입구' : p.n + '층 입구';
      names[p.bottom] = '보스·보물방';
      if (p.n <= open) center = center.concat(p.center);
    });
    // 열린 층끼리 계단으로 잇는다: 위층 맨 아래 -> 아래층 입구
    for (var k = 1; k < open; k++) { exits[parts[k - 1].bottom] = [parts[k].entry]; names[parts[k - 1].bottom] = '계단 (' + (k + 1) + '층으로)'; }
    var goal = parts[open - 1].bottom, floorOfZ = {};
    parts.forEach(function (p) { p.ids.forEach(function (z) { floorOfZ[z] = p.n; }); });
    var f1 = parts[0];
    return { id: boardId, name: f1.name, desc: f1.desc, MAP: f1.MAP, NAMES: names, EXITS: exits, CENTER: center, ENTRY: f1.ENTRY,
      midDoors: !!BOARD_DATA[boardId].midDoors, CELLS: cells, ALL: keys.concat(['Y']), ORDER: orderOf(keys, exits, goal),
      floors: floors, open: open, parts: parts, goal: goal, floorOfZ: floorOfZ };
  }
  var cur = makeLayout(DEFAULT_BOARD, 1, 1);

  function hasBoard(id) { return BOARD_IDS.indexOf(id) >= 0; }

  function sizeOf(z) { return z === 'Y' ? 1 : cur.CELLS[z] ? cur.CELLS[z].length : 0; }
  function partOf(z) { var n = cur.floorOfZ[z]; return n ? cur.parts[n - 1] : null; }
  // 구역 종류: yard 야외 · entry 층 입구(1층 E, 2층 2E) · boss 층 맨 아래(보물방 또는 계단) · room 방
  function zoneType(z) {
    if (z === 'Y') return 'yard';
    var p = partOf(z);
    if (p) { if (z === p.entry) return 'entry'; if (z === p.bottom) return 'boss'; return 'room'; }
    return z === 'E' ? 'entry' : z === 'B' ? 'boss' : 'room';
  }
  // 몇 층 구역인가 (야외는 1층으로 침). 없는 구역이면 0
  function floorOf(z) { return z === 'Y' ? 1 : cur.floorOfZ[z] || 0; }
  function floorOpen(n) { return n >= 1 && n <= cur.open; }
  function isStairs(z) { var p = partOf(z); return !!p && z === p.bottom && p.n < cur.open; }
  // 입구 시설은 1층 입구만, 그 판에 그 출구가 있을 때만 (분기는 늘). 데모는 DEMO_FACILITIES에 있는 시설만 (없으면 제한 없음)
  function facFor(z) {
    var t = zoneType(z), allow = BD.DEMO_FACILITIES && BD.DEMO_FACILITIES[t], first = z === 'E';
    return Object.keys(FAC).filter(function (k) {
      return FAC[k].for === t && (!FAC[k].turn || (first && cur.ENTRY[FAC[k].turn])) && (!allow || allow.indexOf(k) >= 0);
    });
  }
  function costOf(k, z) { var f = FAC[k]; return f.perCell !== undefined ? f.perCell * sizeOf(z) : f.cost; }
  function valueOf(k, z) { var f = FAC[k]; return f.valuePerCell !== undefined ? f.valuePerCell * sizeOf(z) : f.value; }
  function slotsOf(k, z) { return FAC[k] && FAC[k].kind === 'den' ? (BD.DEN_SLOTS_PER_CELL || 2) * sizeOf(z) : 0; } // 칸당 부대 자리
  function trapDmgOf(z) { return TRAP_PER_CELL * sizeOf(z); }
  // (C1 화면 호환용으로 남김. D1 던전 가치에는 안 들어감) 몬스터 한 마리 점수 (임시 식)
  function monValue(m) { return Math.round(((m.hp || 0) + (m.atk || 0) * 4) / 6); }

  // 처음 현장: 층 입구는 분기, 야외는 숲, 층 맨 아래는 보스·보물방(계단), 나머지는 빈 구역 (모두 무료). 지금 배치의 모든 층 (잠긴 층 포함)
  // fixed = { 구역 id: FIXED_ZONES id } 고정 구역 (있으면 그 구역은 고정 구역 시설). 판에 없는 구역·없는 고정 구역은 무시
  function defaultZones(fixed) {
    var L = { Y: 'forest' };
    Object.keys(cur.CELLS).forEach(function (z) { L[z] = zoneType(z) === 'entry' ? 'split' : zoneType(z) === 'boss' ? 'boss' : 'empty'; });
    Object.keys(fixed || {}).forEach(function (z) {
      if (zoneType(z) === 'room' && cur.CELLS[z] && FAC[fixedFac(fixed[z])]) L[z] = fixedFac(fixed[z]);
    });
    return L;
  }

  // 튜토리얼 첫 부지: 처음 부지와 같고 입구만 entry 시설로 (무료로 깔아 둠, 건설 횟수 아님). progress.js가 fork3 판을 끼운 뒤 부른다
  function tutorialZones(entry) { var L = defaultZones(); L.E = entry; return L; }

  // 보물방 바로 앞 구역들 (보물방 = 가장 깊이 열린 층의 맨 아래)
  function bossFront() { return Object.keys(cur.EXITS).filter(function (z) { return cur.EXITS[z].indexOf(cur.goal) >= 0; }); }

  // 요약: 던전 가치 (D1: 지어 둔 시설 점수 합만, 몬스터 제외), 함정·대기실·미끼·고정 구역 수, 대기실에 든 부대 수(monsters).
  // unitById(id)가 있으면 있는 부대만 센다 (없으면 id 개수)
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
  // ---------- 던전 전투력 B안 재료 (BATTLE_DATA.POWER) ----------
  // 통과 비율: 침입자 n명(기본 POWER.flowN)을 길 계산으로 보냈을 때 구역마다 오는 비율 { 구역: 0~1 }.
  //  층마다 그 층 입구 기준 (윗층에서 몇 명이 쓰러지든 아래층 비율은 따로. 길 계산은 처치가 없어서 층 입구 = 전원)
  function passRatios(zones, units, n) {
    n = n || (BD.POWER && BD.POWER.flowN) || 600;
    var at = forecast(zones, units || {}, n).at, w = {};
    Object.keys(at).forEach(function (z) {
      var p = partOf(z), base = p ? at[p.entry] || 0 : n;
      w[z] = base ? at[z] / base : 0;
    });
    return w;
  }
  // 함정 점수 T (통과 비율 곱하기 전): 1회 피해 × 발동 확률 × 대상 수 × 발동 횟수 ÷ 10. boost = 함정 피해 추가 비율(연구실 등)
  function trapScore(z, boost) {
    var P = BD.POWER || { trapTargets: 10, trapStay: 3 }, every = BD.TRAP_EVERY || 1.2;
    var fires = 1 + Math.floor(P.trapStay / every);
    return trapDmgOf(z) * (1 + (boost || 0)) * (BD.TRAP_CHANCE || 0.85) * P.trapTargets * fires / 10;
  }
  // n층 대기실 구역 목록 (길 순서). zones = 구역별 시설
  function densOf(zones, n) {
    return cur.ORDER.concat(Object.keys(cur.CELLS)).filter(function (z, i, a) {
      return a.indexOf(z) === i && floorOf(z) === n && FAC[zones[z]] && FAC[zones[z]].kind === 'den';
    });
  }
  // n층 대기실 자리 합
  function denSlots(zones, n) { var s = 0; densOf(zones, n).forEach(function (z) { s += slotsOf(zones[z], z); }); return s; }

  // 갈림길에서 어디로 갈까: 미끼 쪽 +2, 몬스터가 든 대기실 쪽 -1 (보여서 피함), 함정·빈 구역 0. 점수가 가장 높은 쪽들로 번갈아 나뉨
  function exitScore(zones, units, z) {
    var f = FAC[zones[z]];
    if (!f || zoneType(z) !== 'room') return 0;
    if (f.kind === 'lure') return 2;
    if (f.kind === 'den' && (units[z] || []).length) return -1;
    return 0;
  }
  function chooseExits(zones, units, from) {
    var ex = cur.EXITS[from] || [];
    if (from === 'E') {
      var f = FAC[zones.E], to = f && f.turn ? cur.ENTRY[f.turn] : null;
      if (to) return [to];
    }
    var sc = ex.map(function (z) { return exitScore(zones, units, z); }), best = Math.max.apply(null, sc);
    return ex.filter(function (z, i) { return sc[i] === best; });
  }
  // 길만 계산 (전투 없이): 침입자 n명이 각 구역에 몇 명 오고(at), 각 문을 몇 명 지나가는지(flow, "TL>LB" 형식). 열린 층 모두
  function forecast(zones, units, n) {
    var at = { E: n }, flow = {};
    cur.ORDER.forEach(function (z) {
      var k = at[z] || 0; if (!k) return;
      var to = chooseExits(zones, units, z);
      if (!to.length) return;
      for (var i = 0; i < k; i++) { var t = to[i % to.length]; at[t] = (at[t] || 0) + 1; flow[z + '>' + t] = (flow[z + '>' + t] || 0) + 1; }
    });
    return { at: at, flow: flow };
  }

  // 문(구역 사이 길)과 맞닿은 두 칸 (화면이 문 표시 위치를 구할 때). 층 사이(계단)는 맞닿지 않아 null
  // 맞닿은 칸 쌍이 여럿이면: fork3는 첫 쌍(예전 그대로), midDoors 판은 가운데 쌍 (넓은 큰길에서 문이 한쪽 끝으로 쏠려 길이 지그재그가 되지 않게)
  function sharedEdge(a, b) {
    var A = cur.CELLS[a], Bc = cur.CELLS[b], all = [];
    if (!A || !Bc) return null;
    var mid = cur.midDoors || floorOf(a) > 1;
    for (var i = 0; i < A.length; i++) {
      var x = A[i];
      for (var j = 0; j < Bc.length; j++) {
        var y = Bc[j];
        if (Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) === 1) { if (!mid) return [x, y]; all.push([x, y]); }
      }
    }
    return all.length ? all[(all.length - 1) >> 1] : null;
  }
  // 문 목록 [a, b]. floor 없으면 1층 안의 문만 (예전 화면 호환: ZONES.MAP = 1층), floor = 'all'이면 열린 층 전부(계단 포함), 숫자면 그 층
  function flowPairs(floor) {
    var p = [], want = floor === undefined ? 1 : floor;
    Object.keys(cur.EXITS).forEach(function (a) {
      cur.EXITS[a].forEach(function (b) {
        if (want === 'all' || (floorOf(a) === want && floorOf(b) === want)) p.push([a, b]);
      });
    });
    return p;
  }

  // 전투 화면용 좌표 (칸 단위: x = 열 + 0.5, y = 행 + 0.5. 야외는 y < 0. 2층은 1층 아래 FLOOR_GAP줄 띄우고 이어짐)
  function anchorOf(z) {
    if (z === 'Y') return { x: 2.5, y: -0.3 };
    var cs = cur.CELLS[z], x = 0, y = 0;
    cs.forEach(function (c) { x += c[1] + 0.5; y += c[0] + 0.5; });
    return { x: x / cs.length, y: y / cs.length };
  }
  function doorOf(a, b) {
    if (a === 'Y') return { x: 2.5, y: 0 };
    var e = sharedEdge(a, b);
    if (!e) { var p = anchorOf(a), q = anchorOf(b); return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; }   // 계단: 두 구역 가운데
    return { x: (e[0][1] + e[1][1]) / 2 + 0.5, y: (e[0][0] + e[1][0]) / 2 + 0.5 };
  }
  // 분대 하나의 길: 1층 입구부터 보물방(가장 깊이 열린 층 맨 아래)까지 구역 목록. turn = 구역마다 몇 번째로 지나가는 분대인가 (갈림길에서 번갈아 나뉨)
  function routeOf(zones, units, turn) {
    var path = ['E'], z = 'E', guard = 0;
    while (z !== cur.goal && guard++ < 200) {
      var to = chooseExits(zones, units, z), k = turn[z] || 0;
      if (!to.length) break;
      turn[z] = k + 1;
      z = to[k % to.length];
      path.push(z);
    }
    return path;
  }

  // ---------- 판 바꿔 끼우기 ----------
  var api = window.ZONES = {
    FAC: FAC, PREVIEW_INVADERS: PREVIEW_INVADERS,
    BOARDS: BOARD_IDS.map(function (id) { return { id: id, name: BOARD_DATA[id].name, desc: BOARD_DATA[id].desc }; }),
    DEFAULT_BOARD: DEFAULT_BOARD,
    sizeOf: sizeOf, zoneType: zoneType, facFor: facFor, costOf: costOf, valueOf: valueOf, slotsOf: slotsOf, trapDmgOf: trapDmgOf,
    fixedFac: fixedFac, isFixedFac: isFixedFac, passRatios: passRatios, trapScore: trapScore,
    monValue: monValue, defaultZones: defaultZones, tutorialZones: tutorialZones, summary: summary, forecast: forecast, sharedEdge: sharedEdge, flowPairs: flowPairs,
    chooseExits: chooseExits, anchorOf: anchorOf, doorOf: doorOf, routeOf: routeOf, bossFront: bossFront,
    hasBoard: hasBoard, useBoard: useBoard, useSite: useSite, boardInfo: boardInfo, boardId: function () { return cur.id; },
    // 층 (2차)
    floorOf: floorOf, floorOpen: floorOpen, isStairs: isStairs, densOf: densOf, denSlots: denSlots, floorInfo: floorInfo, floorMap: floorMap,
    stackMap: stackMap, goal: function () { return cur.goal; }
  };
  // 지금 현장 배치를 끼운다: board = 1층 판 id, floors = 의뢰 층 수, open = 열린 층 수. ZONES.MAP 등 판 속성을 다시 붙인다.
  //  ZONES.MAP은 예전 화면 호환으로 1층 판만. 전체 층은 floorMap(n)·stackMap(). 돌려주는 값 = 실제로 끼운 판 id
  function useSite(boardId, floors, open) {
    cur = makeLayout(hasBoard(boardId) ? boardId : DEFAULT_BOARD, floors, open);
    api.board = cur.id; api.MAP = cur.MAP; api.NAMES = cur.NAMES; api.EXITS = cur.EXITS; api.CENTER = cur.CENTER; api.ENTRY = cur.ENTRY;
    api.CELLS = cur.CELLS; api.ALL = cur.ALL; api.ORDER = cur.ORDER;
    api.FLOORS = cur.floors; api.OPEN = cur.open; api.GOAL = cur.goal;
    return cur.id;
  }
  // 1층짜리 배치 (예전 이름). 층 수·열린 층은 1
  function useBoard(id) { return useSite(id, 1, 1); }
  // n층 정보: { n, board, name, desc, open, entry, bottom(맨 아래 구역 id), stairs(맨 아래가 계단인가), ids(구역 id), rows, rowOff, MAP }
  function floorInfo(n) {
    var p = cur.parts[n - 1];
    if (!p) return null;
    return { n: p.n, board: p.board, name: p.name, desc: p.desc, open: p.n <= cur.open, entry: p.entry, bottom: p.bottom, stairs: p.n < cur.open,
      ids: p.ids.slice(), rows: p.rows, rowOff: p.rowOff, MAP: p.MAP };
  }
  function floorMap(n) { var p = cur.parts[n - 1]; return p ? p.MAP : null; }
  // 모든 층을 위아래로 쌓은 칸 배열 (층 사이 FLOOR_GAP줄은 null). 칸 좌표가 CELLS·anchorOf와 같다 (세로 단면용)
  function stackMap() {
    var rows = [];
    cur.parts.forEach(function (p, i) {
      if (i) for (var g = 0; g < FLOOR_GAP; g++) rows.push(p.MAP[0].map(function () { return null; }));
      p.MAP.forEach(function (r) { rows.push(r.slice()); });
    });
    return rows;
  }
  // 판 정보 (지금 판이 아니어도): 화면의 의뢰 카드 미리보기용. MAP은 2차원 배열(구역 id). 1층 판
  function boardInfo(id) {
    var b = makeLayout(hasBoard(id) ? id : DEFAULT_BOARD, 1, 1);
    return { id: b.id, name: b.name, desc: b.desc, MAP: b.MAP, NAMES: b.NAMES, EXITS: b.EXITS, CENTER: b.CENTER };
  }
  useBoard(DEFAULT_BOARD);
})();
