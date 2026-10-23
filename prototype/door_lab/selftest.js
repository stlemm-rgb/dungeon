'use strict';
const assert = require('node:assert/strict');
const lab = require('./lab.js');
let passed = 0;
function test(name, run) {
  try { run(); passed++; console.log(`통과 ${passed}. ${name}`); }
  catch (error) { console.error(`실패: ${name}`); throw error; }
}
const noFacilities = { facilities: {} };
function simulate(doors, chunk = 1 / 60, seed = lab.SEED) {
  const battle = lab.createBattle(doors, seed);
  let guard = 0;
  while (!battle.done && guard++ < 4000) lab.advanceBattle(battle, chunk);
  assert.ok(battle.done, '60초 안에 전투 종료');
  return battle;
}
test('3×4 판의 안쪽 벽 17개, 문 12개, 처음 배치 유효', () => {
  assert.equal(lab.EDGES.length, 17);
  assert.equal(lab.EDGES.filter(e => e.b - e.a === 1).length, 8);
  assert.equal(lab.EDGES.filter(e => e.b - e.a === 3).length, 9);
  assert.equal(lab.INITIAL_DOORS.length, 12);
  assert.equal(lab.validateLayout(lab.INITIAL_DOORS).ok, true);
  assert.equal(lab.reachableRooms(lab.INITIAL_DOORS).size, 12);
  assert.deepEqual(lab.routesOf(lab.INITIAL_DOORS).map(lab.countPassages), [5, 5, 9]);
  const moves = lab.INITIAL_DOORS.flatMap(from => lab.EDGES.map(e => lab.moveDoor(lab.INITIAL_DOORS, from, e.id)));
  assert.ok(moves.filter(move => move.ok).length > 1, '처음 배치에서 여러 합법 이동 가능');
});
test('보물방 길이 살아 있어도 문 없는 방·고립된 방 무리는 거절', () => {
  const group = ['0-1', '0-3', '1-2', '1-4', '2-5', '3-4', '3-6', '4-7', '5-8', '6-9', '7-10', '8-11'];
  for (const [layout, from, to] of [[lab.INITIAL_DOORS, '4-7', '3-4'], [group, '3-6', '4-5']]) {
    const doors = layout.slice();
    assert.equal(lab.validateLayout(doors).ok, true);
    const result = lab.moveDoor(doors, from, to);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'disconnected');
    assert.match(result.reason, /방이 다른 방과 끊겨요/);
    assert.equal(lab.isConnected(result.doors), true);
    assert.deepEqual(doors, layout);
  }
});
test('보물방이 끊긴 배치도 거절', () => {
  const doors = lab.INITIAL_DOORS.map(id => id === '9-10' ? '3-4' : id === '10-11' ? '6-7' : id);
  assert.equal(lab.isConnected(doors), false);
  assert.equal(lab.validateLayout(doors).code, 'disconnected');
});
test('왕복 포함 19회가 되는 문 이동 거절', () => {
  const doors = ['0-1', '0-3', '1-2', '1-4', '2-5', '3-6', '4-5', '4-7', '5-8', '6-9', '7-10', '8-11'];
  assert.equal(lab.reachableRooms(doors).size, 12);
  const result = lab.validateLayout(doors);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'limit');
  assert.equal(lab.countPassages(result.routes[0]), 19);
});
test('막다른 방은 들어온 길로 되짚고, 보물방 첫 진입에서 멈춤', () => {
  const route = lab.exploreRoute(['0-1', '1-4', '4-7', '7-10'], 1, noFacilities);
  assert.deepEqual(route.rooms, [1, 0, 1, 4, 7, 10]);
  assert.deepEqual(route.steps.map(s => s.backtrack), [false, true, false, false, false]);
  assert.equal(lab.countPassages(route), 5);
  assert.equal(route.reached, true);
  assert.equal(route.rooms.filter(room => room === lab.TREASURE).length, 1);
});
test('미끼는 방향·분대 번호보다 우선', () => {
  const doors = ['0-1', '1-2', '1-4'];
  for (let seed = 0; seed < 200; seed++) {
    for (const squad of [1, 2, 3]) {
      const route = lab.exploreRoute(doors, squad, { facilities: { 4: 'bait' }, seed });
      assert.equal(route.rooms[1], 4);
    }
  }
  assert.equal(lab.exploreRoute(['3-4', '4-5'], 1, { start: 4, facilities: lab.FACILITIES }).rooms[1], 5);
});
test('선호 방향 60% 습관, 다른 시드에서는 다른 방향도 선택', () => {
  const doors = ['0-1', '1-2', '1-4'];
  assert.deepEqual([1, 2, 3].map(k => lab.exploreRoute(doors, k, noFacilities).rooms[1]), [0, 2, 4]);
  assert.equal(lab.HABIT_CHANCE, .6);
  assert.deepEqual(lab.HABITS, ['주로 왼쪽', '주로 오른쪽', '주로 아래']);
  // 방 4의 네 방향이 모두 열린 실제 탐험: 60% + 나머지 각각 약 13.3%.
  for (const [squad, preferred] of [[1, 3], [2, 5], [3, 7]]) {
    const counts = { 1: 0, 3: 0, 5: 0, 7: 0 };
    for (let seed = 0; seed < 10000; seed++) {
      const route = lab.exploreRoute(['1-4', '3-4', '4-5', '4-7'], squad,
        { start: 4, facilities: {}, seed });
      counts[route.rooms[1]]++;
    }
    assert.ok(Math.abs(counts[preferred] / 10000 - .6) < .025, `분대 ${squad}: ${JSON.stringify(counts)}`);
    for (const room of [1, 3, 5, 7].filter(r => r !== preferred)) {
      assert.ok(Math.abs(counts[room] / 10000 - .4 / 3) < .02);
    }
  }
});

test('선호 방향이 없으면 후보끼리 같은 확률, 후보 한 개면 반드시 그 방', () => {
  for (const [squad, doors, candidates] of [
    [1, ['1-4', '4-5', '4-7'], [1, 5, 7]],
    [2, ['1-4', '3-4', '4-7'], [1, 3, 7]],
    [3, ['1-4', '3-4', '4-5'], [1, 3, 5]]
  ]) {
    const counts = Object.fromEntries(candidates.map(r => [r, 0]));
    for (let seed = 0; seed < 10000; seed++) {
      counts[lab.exploreRoute(doors, squad, { start: 4, facilities: {}, seed }).rooms[1]]++;
    }
    assert.ok(Object.values(counts).every(n => Math.abs(n / 10000 - 1 / 3) < .025));
    assert.equal(lab.exploreRoute(['1-4'], squad, { start: 4, facilities: {} }).rooms[1], 1);
  }
});
test('방문 기록은 분대마다 독립, 같은 입력과 문 배열 순서는 같은 경로', () => {
  const before = lab.INITIAL_DOORS.slice();
  const first = lab.routesOf(before);
  lab.exploreRoute(before, 3);
  assert.deepEqual(lab.routesOf(before), first);
  assert.deepEqual(lab.routesOf(before.slice().reverse()), first);
  assert.deepEqual(before, lab.INITIAL_DOORS);
  assert.equal(first[0].rooms.includes(3), true);
  assert.deepEqual(first[2], lab.exploreRoute(before, 3));
  for (const seed of [0, 1, 7, 1234, 0xffffffff]) {
    const routes = lab.routesOf(before, seed);
    assert.deepEqual(routes, lab.routesOf(before.slice().reverse(), seed));
    for (const route of routes) assert.deepEqual(route,
      lab.exploreRoute(before, route.squad, { seed }));
  }
});
test('문별 통과 합계는 되짚기를 포함하며 모든 분대 합계와 같음', () => {
  const routes = lab.routesOf(lab.INITIAL_DOORS);
  const counts = lab.doorPassages(routes);
  assert.equal(counts['4-7'], 2);
  assert.equal(counts['0-1'], 1);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 19);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), routes.reduce((n, r) => n + lab.countPassages(r), 0));
});
test('문 옮기기는 기존 자리 닫기와 새 자리 열기를 함께 검사', () => {
  const result = lab.moveDoor(lab.INITIAL_DOORS, '0-1', '3-4');
  assert.equal(result.ok, true);
  assert.equal(result.doors.length, 12);
  assert.equal(result.doors.includes('0-1'), false);
  assert.equal(result.doors.includes('3-4'), true);
  for (const [from, to] of [['0-1', '0-1'], ['0-1', '1-2'], ['no', '3-4'], ['0-1', '0-10']]) {
    assert.equal(lab.moveDoor(lab.INITIAL_DOORS, from, to).ok, false);
  }
});
test('12문 배치 6,188개 전수 검사: 모든 방 연결·18회 제한·고립 거절', () => {
  let layouts = 0, valid = 0, isolated = 0, nearLimit = null;
  function combinations(start, chosen) {
    if (chosen.length === 12) {
      layouts++;
      const v = lab.validateLayout(chosen);
      const reachable = lab.reachableRooms(chosen);
      if (reachable.size !== 12) {
        isolated++;
        assert.equal(v.ok, false);
        assert.equal(v.code, 'disconnected');
      }
      if (v.ok) {
        valid++;
        assert.equal(reachable.size, 12);
        assert.ok(v.routes.every(r => r.reached && lab.countPassages(r) <= 18));
        if (v.routes.some(r => lab.countPassages(r) === 17)) nearLimit = chosen.slice();
        for (const route of v.routes) {
          assert.ok(route.rooms.every(room => reachable.has(room)));
          for (const step of route.steps) assert.ok(chosen.includes(step.edge));
          assert.equal(route.rooms.length, route.steps.length + 1);
        }
      } else assert.ok(['disconnected', 'limit'].includes(v.code));
      return;
    }
    if (lab.EDGES.length - start < 12 - chosen.length) return;
    for (let i = start; i < lab.EDGES.length; i++) combinations(i + 1, chosen.concat(lab.EDGES[i].id));
  }
  combinations(0, []);
  assert.equal(layouts, 6188);
  assert.ok(valid > 0);
  // 격자 이분 그래프의 입구·보물방 색이 달라 경로 길이는 항상 홀수다.
  assert.ok(nearLimit, '18회 제한 바로 아래의 가능한 경로(17회)는 허용');
  assert.ok(isolated > 0, '문 없는 방과 고립된 방 무리 모두 거절');
});
test('전투는 예고와 같은 경로, 시드 고정, 새 전투에 이력 미보존', () => {
  const one = simulate(lab.INITIAL_DOORS);
  const two = simulate(lab.INITIAL_DOORS);
  assert.deepEqual(one.squads.map(s => s.route), lab.routesOf(lab.INITIAL_DOORS));
  assert.deepEqual(lab.battleResult(one), lab.battleResult(two));
  const batched = simulate(lab.INITIAL_DOORS, 60);
  assert.deepEqual(lab.battleResult(one), lab.battleResult(batched));
  const fresh = lab.createBattle(lab.INITIAL_DOORS);
  assert.deepEqual(fresh.monsterHP, [34, 34, 34]);
  assert.ok(fresh.squads.every(s => s.visited.size === 1 && Object.keys(s.traps).length === 0));
  const result = lab.battleResult(one);
  assert.equal(result.reached + result.defeated + result.timeout, 30);
  assert.ok(result.time <= 60);
});

test('여러 시드에서 예고·전투 경로와 결과 재현, 문 이동 전후 같은 시드 유지', () => {
  const results = new Set();
  for (const seed of [0, 1, 7, 42, 1234, 0xffffffff]) {
    const first = simulate(lab.INITIAL_DOORS, 60, seed);
    const second = simulate(lab.INITIAL_DOORS, 1 / 60, seed);
    assert.equal(first.seed, seed);
    assert.equal(lab.battleResult(first).seed, seed);
    assert.deepEqual(first.squads.map(s => s.route), lab.routesOf(lab.INITIAL_DOORS, seed));
    assert.deepEqual(first, second);
    const { seed: ignored, ...result } = lab.battleResult(first);
    results.add(JSON.stringify(result));
    const moved = lab.moveDoor(lab.INITIAL_DOORS, '0-1', '3-4', seed);
    assert.equal(moved.ok, true);
    const after = simulate(moved.doors, 60, seed);
    assert.equal(lab.battleResult(after).seed, seed);
    assert.deepEqual(after.squads.map(s => s.route), lab.routesOf(moved.doors, seed));
  }
  assert.ok(results.size > 1, '시드에 따라 실제 결과도 달라진다');
});

test('18회 제한 검사와 전투 시작도 전달받은 시드의 경로를 사용', () => {
  const doors = ['0-1', '0-3', '1-2', '1-4', '2-5', '3-6', '4-5', '4-7', '5-8', '6-9', '7-10', '8-11'];
  let allowed = false, rejected = false;
  for (let seed = 0; seed < 100; seed++) {
    const routes = lab.routesOf(doors, seed);
    const validation = lab.validateLayout(doors, seed);
    const over = routes.some(route => lab.countPassages(route) > lab.LIMIT);
    assert.equal(validation.ok, !over);
    assert.deepEqual(validation.routes, routes);
    if (over) {
      rejected = true;
      assert.throws(() => lab.createBattle(doors, seed), /최대 18회/);
    } else {
      allowed = true;
      assert.deepEqual(lab.createBattle(doors, seed).squads.map(s => s.route), routes);
    }
  }
  assert.ok(allowed && rejected);
});
test('되짚는 방으로 이동할 때 1.5배, 빈 대기실에서도 1.5배', () => {
  const b = lab.createBattle(lab.INITIAL_DOORS);
  const squad = b.squads[0];
  squad.inspectRemaining = 0;
  lab.advanceBattle(b, 1);
  assert.ok(Math.abs(squad.progress - .5) < 1e-8);
  const revisit = lab.createBattle(lab.INITIAL_DOORS);
  revisit.squads[0].inspectRemaining = 0;
  revisit.squads[0].visited.add(0);
  lab.advanceBattle(revisit, 1);
  assert.ok(Math.abs(revisit.squads[0].progress - .75) < 1e-8);
  const empty = lab.createBattle(lab.INITIAL_DOORS);
  const s = empty.squads[0];
  s.inspectRemaining = 0;
  s.room = 6; s.stepIndex = 3; s.visited.add(6);
  empty.monsterHP.fill(0);
  lab.advanceBattle(empty, 1);
  assert.ok(Math.abs(s.progress - .75) < 1e-8);
});
test('살아 있는 몬스터와 싸우는 분대는 이동 정지', () => {
  const b = lab.createBattle(lab.INITIAL_DOORS);
  const squad = b.squads[0];
  squad.room = 6; squad.stepIndex = 3; squad.visited.add(6);
  squad.inspectRemaining = 0;
  lab.advanceBattle(b, .5);
  assert.equal(squad.progress, 0);
  assert.equal(squad.state, '⚔ 조우');
  assert.ok(squad.encounter);
  assert.ok(b.monsterHP.reduce((n, hp) => n + hp, 0) < 102);
  assert.ok(b.squads[1].inspectRemaining < .6, '다른 분대는 계속 진행');
});
test('같은 함정은 같은 분대에 두 번까지만 발동', () => {
  const b = lab.createBattle(lab.INITIAL_DOORS);
  b.monsterHP.fill(0);
  const squad = b.squads[0];
  squad.route = lab.exploreRoute(['0-1', '0-3'], 1, noFacilities);
  // 함정 재진입 조건을 직접 구성해 3번째도 피해를 받는 회귀를 검사한다.
  squad.route = { rooms: [0, 3, 0, 3, 0, 3], steps: [
    { from: 0, to: 3 }, { from: 3, to: 0 }, { from: 0, to: 3 },
    { from: 3, to: 0 }, { from: 0, to: 3 }
  ] };
  squad.room = 0;
  lab.advanceBattle(b, 15);
  assert.equal(squad.traps[3], 2);
  assert.equal(squad.hp, 60);
});
test('60초 초과도 방어 성공이며 남은 인원 별도 집계', () => {
  const b = lab.createBattle(lab.INITIAL_DOORS);
  b.time = 59.9;
  lab.advanceBattle(b, 2);
  const result = lab.battleResult(b);
  assert.equal(b.done, true);
  assert.equal(result.time, 60);
  assert.equal(result.timeout, 30);
  assert.equal(result.defeated, 0);
  assert.equal(result.success, true);
  assert.ok(b.squads.every(s => s.state === '시간 초과'));
});
test('고리에서 아는 지름길로 가장 짧게 복귀하며 실제 경로 목록에 포함', () => {
  const doors = ['0-1', '0-3', '3-4', '1-4', '1-2', '4-7', '2-5', '5-8', '8-11', '10-11', '3-6', '6-9'];
  assert.equal(lab.validateLayout(doors).ok, true);
  const route = lab.exploreRoute(doors, 1, { ...noFacilities, seed: 1 });
  assert.deepEqual(route.rooms, [1, 0, 3, 6, 9, 6, 3, 4, 7, 4, 1, 2, 5, 8, 11, 10]);
  assert.deepEqual(route.steps.filter(s => s.backtrack).map(s => [s.from, s.to]), [[9, 6], [6, 3], [7, 4], [4, 1]]);
  const battle = lab.createBattle(doors, 1);
  battle.monsterHP.fill(0);
  const squad = battle.squads[0];
  squad.hp = 1000;
  battle.squads.slice(1).forEach(s => { s.hp = 0; });
  const actual = [squad.room];
  while (!battle.done) {
    const passages = squad.passages;
    lab.advanceBattle(battle, 1 / 60);
    if (squad.passages !== passages) actual.push(squad.room);
  }
  assert.deepEqual(squad.route.rooms, route.rooms);
  assert.deepEqual(actual, route.rooms);
});
test('맵핑은 가까운 목적지 우선, 같은 거리면 최근에 들른 방', () => {
  const graph = lab.graphOf(['1-4', '4-5', '0-1', '2-5']);
  const visited = new Set([1, 4, 5]);
  assert.deepEqual(lab.mappedReturn(graph, 4, visited, new Map([[1, 1], [4, 3], [5, 2]])), [5]);
  assert.deepEqual(lab.mappedReturn(graph, 4, visited, new Map([[1, 2], [4, 3], [5, 1]])), [1]);
  assert.deepEqual(lab.mappedReturn(graph, 5, visited, new Map([[1, 20], [4, 3], [5, 2]])), []);
  const detour = lab.graphOf(['0-1', '1-4', '0-3', '3-6', '6-7', '4-7', '4-5']);
  // 안 가 본 이웃이 이미 있으면 복귀하지 않고 그 방에서 탐험을 계속한다.
  assert.deepEqual(lab.mappedReturn(detour, 0, new Set([0, 3, 4, 6, 7]),
    new Map([[0, 5], [3, 4], [6, 3], [7, 2], [4, 1]])), []);
  // 돌아가는 길의 모든 방은 해당 분대가 이미 방문한 방이어야 한다.
  const known = lab.graphOf(['1-4', '0-3', '3-6', '6-7', '4-7', '4-5']);
  assert.deepEqual(lab.mappedReturn(known, 0, new Set([0, 3, 4, 6, 7]),
    new Map([[0, 5], [3, 4], [6, 3], [7, 2], [4, 1]])), [3, 6, 7, 4]);
});
test('입구와 처음 들어간 방에서만 0.6초 조사, 재방문은 즉시 이동', () => {
  assert.equal(lab.INSPECT_TIME, .6);
  const b = lab.createBattle(lab.INITIAL_DOORS);
  const s = b.squads[0];
  lab.advanceBattle(b, .3);
  assert.equal(s.progress, 0);
  assert.equal(s.state, '조사');
  lab.advanceBattle(b, .3);
  assert.ok(s.inspectRemaining < 1e-9);
  lab.advanceBattle(b, 2);
  assert.equal(s.room, 0);
  assert.equal(s.inspectRemaining, lab.INSPECT_TIME);
  lab.advanceBattle(b, .6);
  assert.equal(s.progress, 0);
  lab.advanceBattle(b, .5);
  assert.ok(Math.abs(s.progress - .25) < 1e-8);
  const revisit = lab.createBattle(lab.INITIAL_DOORS);
  const r = revisit.squads[0];
  r.inspectRemaining = 0;
  r.visited.add(0);
  lab.advanceBattle(revisit, 4 / 3);
  assert.equal(r.room, 0);
  assert.equal(r.inspectRemaining, 0);
  lab.advanceBattle(revisit, .5);
  assert.ok(Math.abs(r.progress - .25) < 1e-8);
});
test('조사 중에도 함정 진입 피해와 몬스터 교전 처리', () => {
  const trap = lab.createBattle(lab.INITIAL_DOORS);
  const s = trap.squads[0];
  s.room = 0; s.stepIndex = 1; s.visited.add(0); s.inspectRemaining = 0;
  lab.advanceBattle(trap, 2);
  assert.equal(s.room, 3);
  assert.equal(s.inspectRemaining, lab.INSPECT_TIME);
  assert.equal(s.hp, 80);
  lab.advanceBattle(trap, .3);
  assert.equal(s.progress, 0);
  assert.equal(s.traps[3], 1);
  const battle = lab.createBattle(lab.INITIAL_DOORS);
  battle.squads.slice(1).forEach(squad => { squad.hp = 0; });
  const fighter = battle.squads[0];
  fighter.room = 6; fighter.stepIndex = 3; fighter.visited.add(6);
  lab.advanceBattle(battle, .3);
  assert.equal(fighter.progress, 0);
  assert.equal(fighter.state, '⚔ 조우');
  assert.ok(fighter.encounter);
  assert.ok(battle.monsterHP.reduce((n, hp) => n + hp, 0) < 102);
  lab.advanceBattle(battle, .5);
  assert.equal(fighter.state, '⚔ 조우');
  assert.equal(fighter.progress, 0);
});

test('화면의 시드 변경·전투 중 잠금·비교 표 표시와 debug 경로 일치', () => {
  const vm = require('node:vm');
  const source = require('node:fs').readFileSync(require.resolve('./lab.js'), 'utf8');
  function mount(search) {
    const elements = new Map();
    const frames = [];
    let now = 0;
    const html = require('node:fs').readFileSync(require.resolve('./index.html'), 'utf8');
    const element = id => {
      assert.ok(id === 'actors' || html.includes(`id="${id}"`), `HTML에 ${id} 필요`);
      if (!elements.has(id)) elements.set(id, {
        textContent: '', innerHTML: '', disabled: false, events: {},
        classList: { toggle() {} },
        addEventListener(type, callback) { this.events[type] = callback; },
        setAttribute() {}
      });
      return elements.get(id);
    };
    const window = { location: { search }, crypto: { getRandomValues(value) { value[0] = 42; } } };
    vm.runInNewContext(source, {
      window, URLSearchParams, Uint32Array,
      document: { readyState: 'complete', visibilityState: 'visible',
        getElementById: element, querySelectorAll: () => [], addEventListener() {} },
      performance: { now: () => now }, setInterval() {},
      requestAnimationFrame: callback => frames.push(callback)
    });
    return { element, finish() { now += 60000; frames.shift()(now); } };
  }
  for (const search of ['', '?debug', '?board=5x7', '?board=5x7&debug']) {
    const instance = search.includes('5x7') ? lab.createLab('5x7') : lab;
    const debug = search.includes('debug');
    const ui = mount(search);
    const el = ui.element;
    assert.equal(el('seed').textContent, '시드 7');
    assert.equal(el('board').innerHTML.includes('class="route '), debug);
    // 아직 전투 결과가 없어도 버튼을 누르는 즉시 변경 표시가 떠야 한다.
    el('new-invaders').events.click();
    assert.equal(el('seed').textContent, '시드 42');
    assert.match(el('comparison-note').textContent, /침입자 바뀜/);
    if (debug) {
      const drawn = (el('board').innerHTML.match(/class="route /g) || []).length;
      assert.equal(drawn, instance.routesOf(instance.INITIAL_DOORS, 42).reduce((n, r) => n + r.steps.length, 0));
    }
    el('measure-seeds').events.click();
    assert.match(el('batch-result').textContent, /시드 0~99/);
    el('fight').events.click();
    assert.equal(el('board-3x4').disabled, true);
    assert.equal(el('measure-seeds').disabled, true);
    assert.equal(el('new-invaders').disabled, true);
    el('new-invaders').events.click();
    assert.equal(el('seed').textContent, '시드 42');
    ui.finish();
    assert.equal(el('new-invaders').disabled, false);
    assert.match(el('comparison-note').textContent, /동일 침입자/);
    const measured = instance.createBattle(instance.INITIAL_DOORS, 42);
    instance.advanceBattle(measured, 60);
    const result = instance.battleResult(measured);
    assert.ok(el('result-body').innerHTML.includes(`<td>${result.reached}명</td>`));
    el('new-invaders').events.click(); // 동일한 난수가 나와도 시드는 반드시 바뀐다.
    assert.equal(el('seed').textContent, '시드 43');
    el('fight').events.click();
    ui.finish();
    assert.match(el('comparison-note').textContent, /침입자 바뀜/);
    assert.ok(el('result-body').innerHTML.includes('<td>42</td><td>43</td>'));
    el('fight').events.click();
    ui.finish();
    assert.match(el('comparison-note').textContent, /동일 침입자/);
    assert.ok(el('result-body').innerHTML.includes('<td>43</td><td>43</td>'));
    assert.ok(el('squad-results').innerHTML.includes('분대 3'));
    el('board-5x7').events.click();
  }
});
const large = lab.createLab('5x7');
test('5×7 처음 배치: 34방·36문 연결, 입구 C1·보물방 C7, 시설 수', () => {
  assert.equal(large.ROOM_IDS.length, 34);
  assert.equal(large.INITIAL_DOORS.length, large.ROOM_IDS.length + 2);
  assert.equal(large.reachableRooms(large.INITIAL_DOORS).size, 34);
  assert.ok(large.validateLayout(large.INITIAL_DOORS).ok);
  assert.equal(large.ENTRY, 2); assert.equal(large.TREASURE, 32);
  for (const [facility, count] of [['trap', 5], ['monster', 3], ['bait', 2]])
    assert.equal(Object.values(large.FACILITIES).filter(f => f === facility).length, count);
  assert.ok(large.INITIAL_DOORS.flatMap(from => large.EDGES.map(e => large.moveDoor(large.INITIAL_DOORS, from, e.id))).filter(r => r.ok).length > 1);
});
test('고정 B4·C4는 한 방, 안쪽 벽과 문 통과 없음', () => {
  assert.equal(large.roomOf(16), large.roomOf(17));
  assert.ok(!large.EDGES.some(e => e.id === '16-17'));
  assert.equal(large.moveDoor(large.INITIAL_DOORS, '0-1', '16-17').code, 'target');
  for (const route of large.routesOf(large.INITIAL_DOORS)) {
    assert.ok(!route.rooms.includes(17));
    assert.ok(route.steps.every(step => large.INITIAL_DOORS.includes(step.edge)));
  }
});
test('조우 시드 재현, 압도적 힘 95% 이상·동등한 힘 30~70%', () => {
  let strong = 0, equal = 0;
  for (let seed = 0; seed < 100; seed++) {
    const result = lab.resolveEncounter(100, 1, 100, 1, seed);
    assert.deepEqual(result, lab.resolveEncounter(100, 1, 100, 1, seed));
    if (result.monsterWin) equal++;
    if (lab.resolveEncounter(100, 1, 300, 1, seed).monsterWin) strong++;
    if (result.monsterWin) assert.equal(result.monsterHP, 50);
    else assert.equal(result.invaderHP, 50);
  }
  assert.ok(strong >= 95); assert.ok(equal >= 30 && equal <= 70);
});
test('체력 절반은 유지, 절반 아래는 함정만으로 퇴각', () => {
  const b = lab.createBattle(lab.INITIAL_DOORS), s = b.squads[0];
  s.hp = 70; lab.enterRoom(b, s, 3);
  assert.equal(s.hp, 50); assert.equal(s.result, null);
  lab.enterRoom(b, s, 8);
  assert.equal(s.result, '퇴각'); assert.equal(s.cause, 'trap');
});
test('조우 즉시 피해 확정, 1초+1초 동안 해당 분대만 정지', () => {
  const b = lab.createBattle(lab.INITIAL_DOORS), s = b.squads[0];
  lab.enterRoom(b, s, 6);
  const hp = s.hp, den = b.monsterHP.slice();
  lab.advanceBattle(b, .9);
  assert.equal(s.state, '⚔ 조우'); assert.equal(s.progress, 0);
  assert.ok(b.squads[1].progress > 0);
  lab.advanceBattle(b, .2);
  assert.match(s.state, /✔|💨/); assert.equal(s.progress, 0);
  assert.equal(s.hp, hp); assert.deepEqual(b.monsterHP, den);
  lab.advanceBattle(b, .9); assert.equal(s.encounter, null);
});
test('보물방 진입 즉시 방어 실패, 다른 분대는 종료 퇴각', () => {
  const b = lab.createBattle(lab.INITIAL_DOORS);
  lab.enterRoom(b, b.squads[0], lab.TREASURE);
  lab.advanceBattle(b, 1 / 60);
  assert.ok(b.done); assert.equal(lab.battleResult(b).success, false);
  assert.ok(b.squads.slice(1).every(s => s.cause === 'battleEnd'));
});
test('5×7 통과 30회 한도·대기실별 독립 체력', () => {
  const b = large.createBattle(large.INITIAL_DOORS);
  const other = b.dens[19].slice();
  large.enterRoom(b, b.squads[0], 10);
  assert.deepEqual(b.dens[19], other);
  b.squads[1].passages = 30;
  large.advanceBattle(b, 1 / 60);
  assert.equal(b.squads[1].cause, 'limit');
});
test('두 판의 시드 100개 측정은 화면 없이 결정적, 입력 보존', () => {
  for (const instance of [lab, large]) {
    const doors = instance.INITIAL_DOORS.slice();
    const before = doors.slice();
    const first = instance.measureSeeds(doors);
    assert.deepEqual(first, instance.measureSeeds(doors)); assert.deepEqual(doors, before);
    assert.equal(first.count, 100); assert.ok(first.averageTime <= 60);
    assert.ok(first.averagePassages <= instance.LIMIT);
    assert.ok(first.defenseRate >= 0 && first.defenseRate <= 1);
  }
});
console.log('5×7 처음 배치 측정:', JSON.stringify(large.measureSeeds(large.INITIAL_DOORS)));
console.log(`\n전체 ${passed}개 검사 통과`);
