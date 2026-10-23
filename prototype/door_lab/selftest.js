'use strict';
const assert = require('node:assert/strict');
const lab = require('./lab.js');
let passed = 0;
function test(name, run) {
  try { run(); passed++; console.log(`통과 ${passed}. ${name}`); }
  catch (error) { console.error(`실패: ${name}`); throw error; }
}
const noFacilities = { facilities: {} };
function simulate(doors, chunk = 1 / 60) {
  const battle = lab.createBattle(doors);
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
});
test('입구와 보물방 연결을 끊는 문 이동 거절, 원본 보존', () => {
  const doors = ['0-1', '0-3', '1-2', '1-4', '2-5', '3-4', '3-6', '4-5', '4-7', '5-8', '6-7', '7-10'];
  assert.equal(lab.validateLayout(doors).ok, true);
  const before = doors.slice();
  const result = lab.moveDoor(doors, '7-10', '6-9');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'disconnected');
  assert.equal(lab.isConnected(result.doors), false);
  assert.deepEqual(doors, before);
});
test('왕복 포함 19회가 되는 문 이동 거절', () => {
  const doors = ['0-1', '0-3', '1-2', '1-4', '2-5', '3-4', '3-6', '4-7', '6-7', '6-9', '7-8', '7-10'];
  assert.equal(lab.validateLayout(doors).ok, true);
  const result = lab.moveDoor(doors, '0-3', '8-11');
  assert.equal(lab.isConnected(result.doors), true);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'limit');
  assert.equal(lab.countPassages(result.routes[1]), 19);
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
  for (const squad of [1, 2, 3]) {
    const route = lab.exploreRoute(doors, squad, { facilities: { 4: 'bait' } });
    assert.equal(route.rooms[1], 4);
  }
  assert.equal(lab.exploreRoute(['3-4', '4-5'], 1, { start: 4, facilities: lab.FACILITIES }).rooms[1], 5);
});
test('동점은 왼쪽·위·오른쪽·아래 정렬 후 분대 번호로 첫 방 교대', () => {
  const doors = ['0-1', '1-2', '1-4'];
  assert.deepEqual([1, 2, 3].map(k => lab.exploreRoute(doors, k, noFacilities).rooms[1]), [0, 2, 4]);
  assert.deepEqual(lab.orderedCandidates(4, [7, 5, 1, 3], 1, {}), [3, 1, 5, 7]);
  assert.deepEqual(lab.orderedCandidates(4, [7, 5, 1, 3], 2, {}), [1, 3, 5, 7]);
  assert.deepEqual(lab.orderedCandidates(4, [7, 5, 1, 3], 3, {}), [5, 3, 1, 7]);
  // 첫 선택 뒤 남은 방에서는 번호를 다시 돌리지 않는다.
  assert.deepEqual(lab.exploreRoute(doors, 2, noFacilities).rooms, [1, 2, 1, 0, 1, 4, 1]);
});
test('방문 기록은 분대마다 독립, 같은 입력과 문 배열 순서는 같은 경로', () => {
  const before = lab.INITIAL_DOORS.slice();
  const first = lab.routesOf(before);
  lab.exploreRoute(before, 3);
  assert.deepEqual(lab.routesOf(before), first);
  assert.deepEqual(lab.routesOf(before.slice().reverse()), first);
  assert.deepEqual(before, lab.INITIAL_DOORS);
  assert.equal(first[0].rooms.includes(3), true);
  assert.equal(first[2].rooms.includes(3), true);
});
test('문별 통과 합계는 되짚기를 포함하며 모든 분대 합계와 같음', () => {
  const routes = lab.routesOf(lab.INITIAL_DOORS);
  const counts = lab.doorPassages(routes);
  assert.equal(counts['4-7'], 2);
  assert.equal(counts['0-1'], 2);
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
test('12문 배치 6,188개 전수 검사: 연결·18회 제한·합법 고립 방', () => {
  let layouts = 0, valid = 0, isolatedFacility = null, nearLimit = null;
  function combinations(start, chosen) {
    if (chosen.length === 12) {
      layouts++;
      const v = lab.validateLayout(chosen);
      if (v.ok) {
        valid++;
        assert.equal(lab.isConnected(chosen), true);
        assert.ok(v.routes.every(r => r.reached && lab.countPassages(r) <= 18));
        if (v.routes.some(r => lab.countPassages(r) === 17)) nearLimit = chosen.slice();
        const reachable = lab.reachableRooms(chosen);
        if (Object.keys(lab.FACILITIES).some(room => !reachable.has(Number(room)))) isolatedFacility = chosen.slice();
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
  assert.ok(isolatedFacility, '고립된 시설이 있는 배치 허용');
  const reachable = lab.reachableRooms(isolatedFacility);
  const b = simulate(isolatedFacility, 60);
  for (const squad of b.squads) {
    assert.ok([...squad.visited].every(room => reachable.has(room)));
    assert.ok(Object.keys(squad.traps).every(room => reachable.has(Number(room))));
  }
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
test('되짚는 방으로 이동할 때 1.5배, 빈 대기실에서도 1.5배', () => {
  const b = lab.createBattle(lab.INITIAL_DOORS);
  const squad = b.squads[0];
  lab.advanceBattle(b, 1);
  assert.ok(Math.abs(squad.progress - .5) < 1e-8);
  const revisit = lab.createBattle(lab.INITIAL_DOORS);
  revisit.squads[0].visited.add(0);
  lab.advanceBattle(revisit, 1);
  assert.ok(Math.abs(revisit.squads[0].progress - .75) < 1e-8);
  const empty = lab.createBattle(lab.INITIAL_DOORS);
  const s = empty.squads[0];
  s.room = 6; s.stepIndex = 3; s.visited.add(6);
  empty.monsterHP.fill(0);
  lab.advanceBattle(empty, 1);
  assert.ok(Math.abs(s.progress - .75) < 1e-8);
});
test('살아 있는 몬스터와 싸우는 분대는 이동 정지', () => {
  const b = lab.createBattle(lab.INITIAL_DOORS);
  const squad = b.squads[0];
  squad.room = 6; squad.stepIndex = 3; squad.visited.add(6);
  lab.advanceBattle(b, .5);
  assert.equal(squad.progress, 0);
  assert.equal(squad.state, '교전');
  assert.ok(squad.hp < 100);
  assert.ok(b.monsterHP.reduce((n, hp) => n + hp, 0) < 102);
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
test('60초 초과는 방어 성공이 아니며 남은 인원 별도 집계', () => {
  const b = lab.createBattle(lab.INITIAL_DOORS);
  b.time = 59.9;
  lab.advanceBattle(b, 2);
  const result = lab.battleResult(b);
  assert.equal(b.done, true);
  assert.equal(result.time, 60);
  assert.equal(result.timeout, 30);
  assert.equal(result.defeated, 0);
  assert.equal(result.success, false);
  assert.ok(b.squads.every(s => s.state === '시간 초과'));
});
console.log(`\n전체 ${passed}개 검사 통과`);
