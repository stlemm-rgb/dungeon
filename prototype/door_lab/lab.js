/* 독립 실험. 외부 라이브러리·기존 게임·저장소에 의존하지 않는다. */
(function () {
  'use strict';
  // Each instance owns its board; headless measurements never change the active UI.
  const BOARDS = {
    '3x4': { cols: 3, rows: 4, entry: 1, treasure: 10, limit: 18, fixed: [],
      facilities: { 3: 'trap', 8: 'trap', 6: 'monster', 5: 'bait' },
      doors: ['0-1', '0-3', '3-6', '6-9', '9-10', '1-2', '2-5', '5-8', '8-11', '10-11', '1-4', '4-7'],
      moveSeconds: 2, duration: 60, inspect: .6, habit: .6 },
    '5x7': { cols: 5, rows: 7, entry: 2, treasure: 32, limit: 30, fixed: [[16, 17]],
      facilities: { 5: 'trap', 9: 'trap', 18: 'trap', 21: 'trap', 28: 'trap',
        10: 'monster', 19: 'monster', 25: 'monster', 11: 'bait', 23: 'bait' },
      // Five vertical lanes, top connections, and two cross-lane shortcuts.
      doors: ['0-1','0-5','1-2','1-6','2-3','2-7','3-4','3-8','4-9',
        '5-10','6-11','7-12','8-13','9-14','10-11','10-15','11-16','12-17','13-18','14-19',
        '15-20','16-21','17-22','18-23','19-24','20-25','21-26','22-27','23-24','23-28',
        '24-29','25-30','26-31','27-32','28-33','29-34'],
      moveSeconds: 2, duration: 60, inspect: .6, habit: .6 }
  };
  function createLab(boardId = '3x4') {
  boardId = Object.hasOwn(BOARDS, boardId) ? boardId : '3x4';
  const BOARD = BOARDS[boardId] || BOARDS['3x4'];
  const { cols: COLS, rows: ROWS, entry: ENTRY, treasure: TREASURE, limit: LIMIT } = BOARD;
  const SEED = 7;
  const INSPECT_TIME = BOARD.inspect;
  const HABIT_CHANCE = BOARD.habit;
  const HABITS = Object.freeze(['주로 왼쪽', '주로 오른쪽', '주로 아래']);
  const PREFERRED_DIRECTIONS = [0, 2, 3];
  // Power = total remaining HP ? attack (count ? average HP ? attack).
  // Independent ?20% power jitter; winner loses half the loser's unjittered power.
  const BALANCE = Object.freeze({ moveSeconds: BOARD.moveSeconds, speedBoost: 1.5, duration: BOARD.duration,
    people: 10, personHP: 10, trapDamage: 20, monsterHP: 34,
    monsterAttack: 1.4, personAttack: 1.4, monsters: 3,
    jitter: .2, winnerDamage: .5, retreatRatio: .5, encounterSeconds: 1, outcomeSeconds: 1 });
  const FACILITIES = BOARD.facilities;
  const edgeKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const roomOf = cell => BOARD.fixed.find(group => group.includes(cell))?.[0] ?? cell;
  const ROOM_IDS = Array.from({ length: ROWS * COLS }, (_, i) => i).filter(i => roomOf(i) === i);
  const EDGES = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = r * COLS + c;
      for (const b of [c < COLS - 1 ? a + 1 : -1, r < ROWS - 1 ? a + COLS : -1]) {
        if (b >= 0 && roomOf(a) !== roomOf(b)) EDGES.push({ a, b, ra: roomOf(a), rb: roomOf(b), id: edgeKey(a, b) });
      }
    }
  }
  const INITIAL_DOORS = Object.freeze(BOARD.doors.slice());

  function graphOf(doors) {
    const graph = Array.from({ length: ROWS * COLS }, () => []);
    const open = new Set(doors);
    for (const e of EDGES) {
      if (open.has(e.id)) { if (!graph[e.ra].includes(e.rb)) graph[e.ra].push(e.rb); if (!graph[e.rb].includes(e.ra)) graph[e.rb].push(e.ra); }
    }
    return graph;
  }
  function reachableRooms(doors, start = ENTRY) {
    const graph = graphOf(doors);
    const seen = new Set([start]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      for (const next of graph[queue[i]]) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    return seen;
  }
  function isConnected(doors, start = ENTRY, goal = TREASURE) {
    return reachableRooms(doors, start).has(goal);
  }
  function direction(from, to) {
    const edge = EDGES.find(e => e.ra === from && e.rb === to || e.rb === from && e.ra === to);
    if (edge) { const forward = edge.ra === from; const delta = (edge.b - edge.a) * (forward ? 1 : -1); return delta === -1 ? 0 : delta === -COLS ? 1 : delta === 1 ? 2 : 3; }
    if (to === from - 1) return 0; // 왼쪽
    if (to === from - COLS) return 1; // 위
    if (to === from + 1) return 2; // 오른쪽
    return 3; // 아래
  }
  function chooseCandidate(from, candidates, squad, facilities, random) {
    // 후보 순서는 문 배열 순서와 무관하게 고정한다. 미끼가 여럿이면 같은 확률.
    const bait = candidates.filter(room => facilities[room] === 'bait');
    const pool = (bait.length ? bait : candidates).slice().sort((a, b) => a - b);
    if (pool.length < 2) return pool[0];
    if (!bait.length) {
      const preferred = pool.find(room => direction(from, room) === PREFERRED_DIRECTIONS[squad - 1]);
      if (preferred !== undefined) {
        if (random() < HABIT_CHANCE) return preferred;
        pool.splice(pool.indexOf(preferred), 1);
      }
    }
    return pool[Math.floor(random() * pool.length)];
  }
  function mappedReturn(graph, current, visited, lastVisit) {
    // 너비 우선 탐색은 이미 아는 방만 통과. 같은 거리의 목적지는 최근 방문 우선.
    const parent = new Map([[current, null]]);
    let layer = [current];
    while (layer.length) {
      const frontiers = layer.filter(room => graph[room].some(to => !visited.has(to)));
      if (frontiers.length) {
        const target = frontiers.sort((a, b) => lastVisit.get(b) - lastVisit.get(a))[0];
        const path = [];
        for (let room = target; room !== current; room = parent.get(room)) path.push(room);
        return path.reverse();
      }
      const nextLayer = [];
      for (const room of layer) {
        for (const to of graph[room]) {
          if (visited.has(to) && !parent.has(to)) {
            parent.set(to, room);
            nextLayer.push(to);
          }
        }
      }
      layer = nextLayer;
    }
    return [];
  }
  function exploreRoute(doors, squad = 1, options = {}) {
    const start = options.start ?? ENTRY;
    const goal = options.goal ?? TREASURE;
    const facilities = options.facilities ?? FACILITIES;
    const seed = options.seed ?? SEED;
    let fork = 0;
    const graph = graphOf(doors);
    const visited = new Set([start]);
    const rooms = [start];
    const steps = [];
    const lastVisit = new Map([[start, 0]]);
    function append(to, backtrack) {
      const from = rooms[rooms.length - 1];
      steps.push({ from, to, edge: EDGES.find(e => doors.includes(e.id) && ((e.ra === from && e.rb === to) || (e.rb === from && e.ra === to)))?.id, backtrack });
      rooms.push(to);
      visited.add(to);
      lastVisit.set(to, steps.length);
    }
    while (rooms[rooms.length - 1] !== goal) {
      const current = rooms[rooms.length - 1];
      const choices = graph[current].filter(to => !visited.has(to));
      if (choices.length) {
        // 분대·방·갈림 순서별 난수: 미리보기나 다른 분대의 계산은 영향을 주지 않는다.
        const random = seededRandom(seed ^ Math.imul(squad, 0x9e3779b9) ^
          Math.imul(current + 1, 0x85ebca6b) ^ Math.imul(fork, 0xc2b2ae35));
        if (choices.length > 1) fork++;
        append(chooseCandidate(current, choices, squad, facilities, random), false);
      }
      else {
        const path = mappedReturn(graph, current, visited, lastVisit);
        if (!path.length) break;
        for (const to of path) append(to, true);
      }
    }
    return { squad, rooms, steps, reached: rooms[rooms.length - 1] === goal };
  }
  function countPassages(route) { return route.steps.length; }
  function routesOf(doors, seed = SEED) { return [1, 2, 3].map(k => exploreRoute(doors, k, { seed })); }
  function doorPassages(routes) {
    const counts = {};
    for (const route of routes) {
      for (const step of route.steps) counts[step.edge] = (counts[step.edge] || 0) + 1;
    }
    return counts;
  }
  function validateLayout(doors, seed = SEED) {
    const validIDs = new Set(EDGES.map(e => e.id));
    if (doors.length !== INITIAL_DOORS.length || new Set(doors).size !== INITIAL_DOORS.length || doors.some(id => !validIDs.has(id))) {
      return { ok: false, code: 'tokens', reason: `안쪽 벽에 문 ${INITIAL_DOORS.length}개를 유지해야 합니다.` };
    }
    const reachable = reachableRooms(doors);
    if (reachable.size !== ROOM_IDS.length) {
      const room = ROOM_IDS.find(i => !reachable.has(i));
      return { ok: false, code: 'disconnected',
        reason: `(${Math.floor(room / COLS)},${room % COLS}) 방이 다른 방과 끊겨요.` };
    }
    const routes = routesOf(doors, seed);
    const over = routes.find(route => countPassages(route) > LIMIT);
    if (over && boardId === '3x4') return { ok: false, code: 'limit', routes,
      reason: `분대 ${over.squad} 문 통과 ${countPassages(over)}회: 최대 ${LIMIT}회를 넘습니다.` };
    return { ok: true, routes };
  }
  function moveDoor(doors, from, to, seed = SEED) {
    if (!doors.includes(from) || doors.includes(to) || !EDGES.some(e => e.id === to)) {
      return { ok: false, code: 'target', reason: '문이 없는 다른 안쪽 벽에 놓아 주세요.', doors: doors.slice() };
    }
    const candidate = doors.map(id => id === from ? to : id);
    return { ...validateLayout(candidate, seed), doors: candidate };
  }
  function seededRandom(seed) {
    let state = seed >>> 0;
    // 인접한 시드도 첫 선택부터 고르게 섞이도록 정수 해시로 초기화한다.
    state = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
    state = Math.imul(state ^ (state >>> 15), 0x735a2d97);
    state = (state ^ (state >>> 15)) >>> 0;
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  }
  function peopleOf(squad) { return Math.max(0, Math.ceil(squad.hp / BALANCE.personHP)); }
  function monsterCount(battle, room) {
    const groups = room === undefined ? Object.values(battle.dens) : [battle.dens[room] || []];
    return groups.flat().filter(hp => hp > 0).length;
  }
  function resolveEncounter(invaderHP, invaderAttack, monsterHP, monsterAttack, seed) {
    const random = seededRandom(seed);
    const invaderPower = invaderHP * invaderAttack;
    const monsterPower = monsterHP * monsterAttack;
    const jitter = () => 1 + (random() * 2 - 1) * BALANCE.jitter;
    const monsterWin = monsterPower * jitter() >= invaderPower * jitter();
    return { monsterWin, invaderPower, monsterPower,
      invaderHP: monsterWin ? invaderHP : Math.max(0, invaderHP - monsterPower * BALANCE.winnerDamage),
      monsterHP: monsterWin ? Math.max(0, monsterHP - invaderPower * BALANCE.winnerDamage) : 0 };
  }
  function createBattle(doors, seed = SEED, measurement = false) {
    seed = seed >>> 0;
    const validation = validateLayout(doors, seed);
    // Measurement runs every seed, even if a 3?4 route would fail the editing limit.
    if (!validation.ok && !(measurement && validation.code === 'limit')) throw new Error(validation.reason);
    const dens = Object.fromEntries(Object.entries(FACILITIES).filter(([, f]) => f === 'monster')
      .map(([room]) => [room, Array(BALANCE.monsters).fill(BALANCE.monsterHP)]));
    const battle = { seed, time: 0, done: false, trapActivations: 0, logs: [], dens,
      monsterHP: Object.values(dens)[0], encounterCount: 0,
      squads: validation.routes.map(route => ({ id: route.squad, route,
        hp: BALANCE.people * BALANCE.personHP, attack: BALANCE.personAttack,
        room: ENTRY, stepIndex: 0, progress: 0, passages: 0, arrived: false,
        result: null, cause: null, endedAt: null, encounter: null,
        visited: new Set([ENTRY]), traps: {}, inspectRemaining: INSPECT_TIME, state: '조사' })) };
    addLog(battle, '침입자 30명이 위쪽 입구로 들어왔습니다.');
    return battle;
  }
  function addLog(battle, text) {
    battle.logs.push(`${battle.time.toFixed(1)}? ? ${text}`);
    if (battle.logs.length > 12) battle.logs.shift();
  }
  function finishSquad(battle, squad, result, cause) {
    if (squad.result) return;
    squad.result = result; squad.cause = cause; squad.endedAt = battle.time;
    squad.state = result; squad.arrived = result === '보물방';
    addLog(battle, `분대 ${squad.id}: ${result}`);
  }
  function checkRetreat(battle, squad, cause) {
    if (squad.hp < BALANCE.people * BALANCE.personHP * BALANCE.retreatRatio) {
      finishSquad(battle, squad, '퇴각', cause); return true;
    }
    return false;
  }
  function startEncounter(battle, squad) {
    if (squad.encounter || squad.result || !monsterCount(battle, squad.room)) return;
    const hp = battle.dens[squad.room];
    const before = hp.reduce((a, b) => a + b, 0);
    const outcome = resolveEncounter(squad.hp, squad.attack, before, BALANCE.monsterAttack,
      battle.seed ^ Math.imul(squad.id, 0x9e3779b9) ^ Math.imul(squad.room + 1, 0x85ebca6b) ^ battle.encounterCount++);
    // Commit immediately: simultaneous arrivals see the remaining defenders, in squad ID order.
    let remaining = outcome.monsterHP;
    for (let i = 0; i < hp.length; i++) { hp[i] = Math.min(BALANCE.monsterHP, remaining); remaining -= hp[i]; }
    squad.hp = outcome.invaderHP;
    squad.encounter = { ...outcome, elapsed: 0 };
    squad.inspectRemaining = 0;
    squad.state = '⚔ 조우';
    addLog(battle, `분대 ${squad.id}, 대기실 조우`);
  }
  function enterRoom(battle, squad, room) {
    squad.room = room;
    squad.inspectRemaining = squad.visited.has(room) ? 0 : INSPECT_TIME;
    squad.visited.add(room);
    squad.state = squad.inspectRemaining > 0 ? '조사' : '이동';
    const facility = FACILITIES[room];
    if (facility === 'trap' && (squad.traps[room] || 0) < 2) {
      squad.traps[room] = (squad.traps[room] || 0) + 1;
      squad.hp = Math.max(0, squad.hp - BALANCE.trapDamage);
      battle.trapActivations++;
      addLog(battle, `분대 ${squad.id}, 함정 ${squad.traps[room]}번째 발동`);
    }
    if (checkRetreat(battle, squad, 'trap')) return;
    if (room === TREASURE) finishSquad(battle, squad, '보물방', 'treasure');
    else if (facility === 'monster') startEncounter(battle, squad);
  }
  function advanceBattle(battle, seconds) {
    let remaining = Math.min(Math.max(0, seconds), BALANCE.duration - battle.time);
    while (!battle.done && remaining > 1e-9) {
      const dt = Math.min(1 / 60, remaining);
      remaining -= dt;
      battle.time = Math.min(BALANCE.duration, battle.time + dt);
      for (const squad of battle.squads) {
        if (squad.result) continue;
        if (!squad.encounter && checkRetreat(battle, squad, 'health')) continue;
        if (FACILITIES[squad.room] === 'monster') startEncounter(battle, squad);
        if (squad.encounter) {
          const clash = squad.encounter;
          clash.elapsed += dt;
          squad.state = clash.elapsed < BALANCE.encounterSeconds - 1e-9 ? '⚔ 조우' : clash.monsterWin ? '✔ 몬스터 승' : '💨 몬스터 패';
          if (clash.elapsed >= BALANCE.encounterSeconds + BALANCE.outcomeSeconds - 1e-9) {
            squad.encounter = null;
            if (clash.monsterWin) finishSquad(battle, squad, '퇴각', 'monster');
            else checkRetreat(battle, squad, 'clashDamage');
          }
          continue;
        }
        if (squad.passages >= LIMIT) { finishSquad(battle, squad, '퇴각', 'limit'); continue; }
        if (squad.inspectRemaining > 1e-9) {
          squad.inspectRemaining = Math.max(0, squad.inspectRemaining - dt);
          squad.state = '조사'; continue;
        }
        const step = squad.route.steps[squad.stepIndex];
        if (!step) continue;
        squad.state = '이동';
        const fast = squad.visited.has(step.to) ||
          (FACILITIES[squad.room] === 'monster' && monsterCount(battle, squad.room) === 0);
        squad.progress += dt / BALANCE.moveSeconds * (fast ? BALANCE.speedBoost : 1);
        if (squad.progress >= 1 - 1e-9) {
          squad.progress = 0; squad.stepIndex++; squad.passages++;
          enterRoom(battle, squad, step.to);
          if (squad.arrived) break;
        }
      }
      const treasure = battle.squads.some(s => s.arrived);
      if (treasure || battle.squads.every(s => s.result) || battle.time >= BALANCE.duration - 1e-8) {
        battle.done = true;
        for (const squad of battle.squads) if (!squad.result) {
          // No invented timeout on early failure: these squads withdraw when treasure is lost.
          finishSquad(battle, squad, treasure ? '퇴각' : '시간 초과', treasure ? 'battleEnd' : 'timeout');
        }
        addLog(battle, '전투가 끝났습니다.');
      }
    }
    return battle;
  }
  function battleResult(battle) {
    const reached = battle.squads.reduce((n, s) => n + (s.arrived ? peopleOf(s) : 0), 0);
    const timeout = battle.squads.reduce((n, s) => n + (s.result === '시간 초과' ? peopleOf(s) : 0), 0);
    const byCause = cause => battle.squads.filter(s => s.cause === cause).length;
    return { reached, defeated: 30 - reached - timeout, timeout,
      traps: battle.trapActivations, passages: battle.squads.map(s => s.passages),
      squads: battle.squads.map(s => ({ id: s.id, passages: s.passages,
        time: Number((s.endedAt ?? battle.time).toFixed(2)), result: s.result, cause: s.cause })),
      summary: `함정으로 ${byCause('trap')}분대 퇴각, 대기실에서 ${byCause('monster')}분대 격퇴, 조우 피해로 ${byCause('clashDamage')}분대 퇴각`,
      time: Number(battle.time.toFixed(2)), success: !battle.squads.some(s => s.arrived), seed: battle.seed };
  }
  function measureSeeds(doors, count = 100) {
    const results = [];
    for (let seed = 0; seed < count; seed++) {
      const battle = createBattle(doors, seed, true);
      advanceBattle(battle, BALANCE.duration);
      results.push(battleResult(battle));
    }
    return { count, averagePassages: results.reduce((n, r) => n + r.passages.reduce((a, b) => a + b, 0), 0) / (count * 3),
      averageTime: results.reduce((n, r) => n + r.time, 0) / count,
      timeoutRate: results.filter(r => r.squads.some(s => s.result === '시간 초과')).length / count,
      defenseRate: results.filter(r => r.success).length / count };
  }

  const api = { COLS, ROWS, ENTRY, TREASURE, LIMIT, SEED, HABIT_CHANCE, INSPECT_TIME, HABITS, EDGES, INITIAL_DOORS,
    FACILITIES, BALANCE, edgeKey, graphOf, reachableRooms, isConnected,
    chooseCandidate, mappedReturn, exploreRoute, countPassages, routesOf, doorPassages,
    validateLayout, moveDoor, seededRandom, createBattle, advanceBattle, battleResult, peopleOf };
  return { ...api, BOARD, ROOM_IDS, roomOf, mount, resolveEncounter, enterRoom, measureSeeds, createLab };

  function mount() {
    const $ = id => document.getElementById(id);
    const svg = $('board');
    if (!svg) return;
    const width = COLS * 108 + 36, height = ROWS * 108 + 48;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('aria-label', `${COLS}열 ${ROWS}행 던전. 문 선택 후 빈 벽을 누르세요.`);
    $('board-badge').textContent = `${ROOM_IDS.length}방 · 문 ${INITIAL_DOORS.length}개`;
    $('board-wrap').setAttribute('style', `--board-ratio: ${width / height}`);
    for (const id of ['3x4', '5x7']) {
      $(`board-${id}`).setAttribute('aria-pressed', String(id === boardId));
      $(`board-${id}`).addEventListener('click', () => {
        if (running()) return;
        const params = new URLSearchParams(window.location.search);
        params.set('board', id);
        window.location.search = params.toString();
      });
    }
    let doors = INITIAL_DOORS.slice();
    let seed = SEED;
    let history = [];
    const debug = new URLSearchParams(window.location.search).has('debug');
    let hidden = !debug;
    document.querySelectorAll('[data-debug]').forEach(el => { el.hidden = !debug; });
    let selection = null;
    let drag = null;
    let battle = null;
    let previousResult = null;
    let currentResult = null;
    let invadersChanged = false;
    let lastTick = 0;
    let accumulator = 0;
    const metrics = { edits: 0, rejected: 0, fights: 0, editMs: 0 };
    let metricTick = performance.now();
    const running = () => battle && !battle.done;
    function measure() {
      const now = performance.now();
      if (!running() && document.visibilityState !== 'hidden') metrics.editMs += now - metricTick;
      metricTick = now;
    }
    function showMetrics() {
      measure();
      $('edit-count').textContent = `${metrics.edits}회`;
      $('reject-count').textContent = `${metrics.rejected}회`;
      $('fight-count').textContent = `${metrics.fights}회`;
      $('edit-time').textContent = `${Math.floor(metrics.editMs / 1000)}초`;
    }
    function message(text, error = false) {
      $('message').textContent = text;
      $('message').classList.toggle('error', error);
    }
    const center = room => ({ x: 72 + room % COLS * 108, y: 78 + Math.floor(room / COLS) * 108 });
    const roomCenter = room => {
      const cells = BOARD.fixed.find(group => group[0] === room) || [room];
      return { x: cells.reduce((n, cell) => n + center(cell).x, 0) / cells.length,
        y: cells.reduce((n, cell) => n + center(cell).y, 0) / cells.length };
    };
    function edgePoint(edge) {
      const a = center(edge.a), b = center(edge.b);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vertical: edge.b - edge.a === 1 };
    }
    function routeMarkup(routes) {
      if (!debug || hidden) return '';
      return routes.map((route, i) => {
        const shift = (i - 1) * 6;
        return `<g class="s${i + 1}">${route.steps.map(step => {
          const a = roomCenter(step.from), b = roomCenter(step.to);
          const edge = EDGES.find(e => e.id === step.edge);
          const mid = edgePoint(edge);
          // 문 중앙도 지나되 세 분대와 왕복 선을 분리한다.
          const back = step.backtrack ? 2.5 : 0;
          const dx = edge.b - edge.a === 1 ? 0 : shift + back;
          const dy = edge.b - edge.a === 1 ? shift + back : 0;
          return `<path class="route ${step.backtrack ? 'backtrack' : ''}" d="M${a.x + dx},${a.y + dy} L${mid.x + dx},${mid.y + dy} L${b.x + dx},${b.y + dy}" marker-mid="url(#arrow-${i})"/>`;
        }).join('')}</g>`;
      }).join('');
    }
    function renderBoard() {
      const from = drag ? drag.from : selection;
      const target = drag ? drag.target : null;
      const candidate = from && target ? moveDoor(doors, from, target, seed) : null;
      const shownDoors = candidate && candidate.code !== 'target' ? candidate.doors : doors;
      const routes = routesOf(shownDoors, seed);
      const counts = doorPassages(routes);
      const defs = !debug || hidden ? '' : `<defs>${[0, 1, 2].map(i => `<marker id="arrow-${i}" class="s${i + 1}" viewBox="0 0 8 8" refX="5" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path class="arrow" d="M0 0 L8 4 L0 8 Z"/></marker>`).join('')}</defs>`;
      const rooms = ROOM_IDS.map(room => {
        const p = roomCenter(room);
        const span = BOARD.fixed.find(group => group[0] === room)?.length || 1;
        const facility = FACILITIES[room];
        let label = facility === 'trap' ? '함정' : facility === 'monster' ? '대기실' : facility === 'bait' ? '미끼' : '';
        let symbol = facility === 'trap' ? '×' : facility === 'monster' ? '♟' : facility === 'bait' ? '◇' : '';
        if (span > 1) { label = '고정'; symbol = '↔'; }
        if (room === ENTRY) { label = '입구'; symbol = '↓'; }
        if (room === TREASURE) { label = '보물방'; symbol = '◆'; }
        return {
          surface: `<rect class="room ${label ? 'special-room' : ''}" x="${p.x - 54 * span}" y="${p.y - 54}" width="${108 * span}" height="108"/>`,
          labels: `<text class="room-coord" x="${p.x - 43}" y="${p.y + 42}">(${Math.floor(room / COLS)},${room % COLS})</text><text class="room-label" x="${p.x}" y="${p.y - 24}">${label}</text><text class="room-symbol" x="${p.x}" y="${p.y + 26}">${symbol}</text>`
        };
      });
      const walls = `<rect class="wall" x="18" y="24" width="${COLS * 108}" height="${ROWS * 108}"/>` + EDGES.map(e => {
        const p = edgePoint(e);
        return `<path class="wall" d="${p.vertical ? `M${p.x},${p.y - 54}v108` : `M${p.x - 54},${p.y}h108`}"/>`;
      }).join('');
      const zones = from ? EDGES.filter(e => !doors.includes(e.id)).map(e => {
        const p = edgePoint(e), active = e.id === target;
        const invalid = active && candidate && !candidate.ok;
        return `<rect class="drop-zone ${active ? 'candidate' : ''} ${invalid ? 'invalid' : ''}" x="${p.x - (p.vertical ? 7 : 23)}" y="${p.y - (p.vertical ? 23 : 7)}" width="${p.vertical ? 14 : 46}" height="${p.vertical ? 46 : 14}" rx="4"/>`;
      }).join('') : '';
      const pipes = EDGES.filter(e => shownDoors.includes(e.id)).map(e => {
        const a = roomCenter(e.ra), b = roomCenter(e.rb), mid = edgePoint(e);
        const path = `M${a.x},${a.y}L${mid.x},${mid.y}L${b.x},${b.y}`;
        return `<g><path class="pipe-rim" d="${path}"/><path class="pipe" d="${path}"/></g>`;
      }).join('');
      const tokens = EDGES.filter(e => shownDoors.includes(e.id)).map(e => {
        const p = edgePoint(e);
        return `<rect class="door ${e.id === from ? 'departing selected' : ''}" x="${p.x - (p.vertical ? 7 : 20)}" y="${p.y - (p.vertical ? 20 : 7)}" width="${p.vertical ? 14 : 40}" height="${p.vertical ? 40 : 14}" rx="3"/>`;
      }).join('');
      const labels = !debug || hidden ? '' : EDGES.filter(e => shownDoors.includes(e.id)).map(e => {
        const p = edgePoint(e), x = p.x + (p.vertical ? 18 : 0), y = p.y + (p.vertical ? 0 : -18);
        return `<g><circle class="door-count-bg" cx="${x}" cy="${y}" r="9"/><text class="door-count" x="${x}" y="${y}">${counts[e.id] || 0}</text></g>`;
      }).join('');
      const hits = EDGES.map(e => {
        const p = edgePoint(e);
        const name = `(${Math.floor(e.a / COLS)},${e.a % COLS}) ↔ (${Math.floor(e.b / COLS)},${e.b % COLS})`;
        return `<path class="edge-hit" data-edge="${e.id}" role="button" tabindex="${running() ? '-1' : '0'}" aria-disabled="${!!running()}" aria-label="${doors.includes(e.id) ? '문' : '빈 벽'} ${name}" d="${p.vertical ? `M${p.x},${p.y - 22}v44` : `M${p.x - 22},${p.y}h44`}"/>`;
      }).join('');
      svg.innerHTML = defs + rooms.map(room => room.surface).join('') + walls + `<g class="pipes">${pipes}</g>` + rooms.map(room => room.labels).join('') + zones + tokens + `<path class="outside-arrow" d="M${center(ENTRY).x} 2v22m-5 -6l5 6 5 -6"/><text class="outside-label" x="${center(ENTRY).x + 53}" y="13">침입자 진입 ↓</text><g class="paths">${routeMarkup(routes)}</g><g class="door-counts">${labels}</g>${hits}<g class="actors" id="actors"></g>`;
      $('route-counts').innerHTML = routes.map((route, i) => `<div class="squad-card s${i + 1} ${debug && route.steps.length > LIMIT ? 'over' : ''}"><strong>분대 ${i + 1}</strong><small>${HABITS[i]}</small>${debug && !hidden ? `<span>${countPassages(route)} / ${LIMIT}회</span>` : ''}</div>`).join('');
      for (const id of ['board-3x4', 'board-5x7', 'measure-seeds']) $(id).disabled = !!running();
      $('undo').disabled = !history.length || !!running();
      $('reset').disabled = !!running();
      $('new-invaders').disabled = !!running();
      $('seed').textContent = `시드 ${seed}`;
      $('fight').disabled = !!running() || !validateLayout(doors, seed).ok;
      renderActors();
    }
    function renderActors() {
      if (!battle || !$('actors')) return;
      $('actors').innerHTML = battle.squads.filter(s => !s.result || s.encounter).map(s => {
        const a = roomCenter(s.room);
        const step = s.route.steps[s.stepIndex];
        const b = step ? roomCenter(step.to) : a;
        const progress = s.arrived ? 0 : s.progress;
        const edge = step && EDGES.find(e => e.id === step.edge);
        const mid = edge ? edgePoint(edge) : a;
        const start = progress < .5 ? a : mid, end = progress < .5 ? mid : b;
        const fraction = progress < .5 ? progress * 2 : (progress - .5) * 2;
        const x = start.x + (end.x - start.x) * fraction + (s.id - 2) * 13;
        const y = start.y + (end.y - start.y) * fraction;
        return `<g class="s${s.id}"><circle class="actor" cx="${x}" cy="${y}" r="9"/><text class="actor-number" x="${x}" y="${y}">${s.id}</text>${s.encounter ? `<g class="clash-bubble"><rect x="${x - 18}" y="${y - 43}" width="36" height="27" rx="8"/><text x="${x}" y="${y - 23}">${s.encounter.elapsed < BALANCE.encounterSeconds - 1e-9 ? '⚔' : s.encounter.monsterWin ? '✔' : '💨'}</text></g>` : ''}${!s.arrived && s.inspectRemaining > 1e-9 ? `<text class="inspect-mark" x="${x}" y="${y - 14}">?</text>` : ''}</g>`;
      }).join('');
    }
    function clearBattleView() {
      battle = null;
      $('squad-results').innerHTML = '';
      $('batch-result').textContent = '현재 배치의 시드 0~99를 측정합니다.';
      $('result-summary').textContent = '';
      $('battle-squads').innerHTML = '';
      $('event-log').textContent = '';
      $('monster-state').textContent = `대기실 ${Object.values(FACILITIES).filter(f => f === 'monster').length}곳 · 각각 몬스터 3마리 · 매 전투 초기화`;
      $('battle-state').textContent = '배치 변경 · 다시 비교할 수 있습니다';
      $('clock').textContent = '0.0 / 60초';
      $('time-progress').value = 0;
    }
    function commitMove(from, to) {
      const result = moveDoor(doors, from, to, seed);
      if (result.ok) {
        history.push(doors.slice());
        doors = result.doors;
        metrics.edits++;
        clearBattleView();
        message('문을 옮겼습니다. 탐험 순서를 예상해 보세요.');
      } else {
        metrics.rejected++;
        message(result.reason, true);
      }
      selection = null;
      renderBoard();
      showMetrics();
    }
    function pointOf(event) {
      const box = svg.getBoundingClientRect();
      return { x: (event.clientX - box.left) / box.width * width,
        y: (event.clientY - box.top) / box.height * height };
    }
    function nearestEdge(event) {
      const point = pointOf(event);
      let best = null, distance = 25;
      for (const e of EDGES) {
        const p = edgePoint(e);
        const d = Math.hypot(point.x - p.x, point.y - p.y);
        if (d < distance) { best = e.id; distance = d; }
      }
      return best;
    }
    function ghostAt(event) {
      const ghost = $('drag-ghost');
      ghost.hidden = false;
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY - (event.pointerType === 'touch' ? 64 : 0)}px`;
    }
    svg.addEventListener('pointerdown', event => {
      if (running() || event.isPrimary === false || event.button !== 0) return;
      const edge = event.target.closest('[data-edge]')?.dataset.edge;
      if (!edge) return;
      if (selection && !doors.includes(edge)) { event.preventDefault(); commitMove(selection, edge); return; }
      if (!doors.includes(edge)) { message('먼저 옮길 문을 선택해 주세요.'); return; }
      event.preventDefault();
      drag = { from: edge, target: null, pointer: event.pointerId,
        startX: event.clientX, startY: event.clientY, moved: false, previousSelection: selection };
      selection = edge;
      svg.setPointerCapture(event.pointerId);
      ghostAt(event);
      message('밝은 빈 벽으로 끌어 놓으세요.');
      renderBoard();
    });
    svg.addEventListener('pointermove', event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
      ghostAt(event);
      const edge = nearestEdge(event);
      const target = edge && !doors.includes(edge) ? edge : null;
      if (target === drag.target) return;
      drag.target = target;
      if (target) {
        const result = moveDoor(doors, drag.from, target, seed);
        message(result.ok ? '미리보기 · 놓으면 이 통로가 열립니다.' : result.reason, !result.ok);
      } else message('밝은 빈 벽으로 끌어 놓으세요.');
      renderBoard();
    });
    function cancelDrag() {
      const pointer = drag?.pointer;
      drag = null;
      selection = null;
      $('drag-ghost').hidden = true;
      if (pointer !== undefined && svg.hasPointerCapture(pointer)) svg.releasePointerCapture(pointer);
      renderBoard();
    }
    svg.addEventListener('pointerup', event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      const old = drag;
      const target = nearestEdge(event);
      drag = null;
      $('drag-ghost').hidden = true;
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      if (old.moved && target && target !== old.from) commitMove(old.from, target);
      else {
        if (old.moved) {
          selection = null;
          metrics.rejected++;
          message('문이 없는 다른 안쪽 벽에 놓아 주세요.', true);
        } else {
          selection = old.previousSelection === old.from ? null : old.from;
          message(selection ? '문을 골랐습니다. 밝은 빈 벽을 누르세요.' : '문 선택을 취소했습니다.');
        }
        renderBoard();
        showMetrics();
      }
    });
    svg.addEventListener('pointercancel', () => { if (drag) { cancelDrag(); message('끌기를 취소했습니다.'); } });
    svg.addEventListener('lostpointercapture', () => { if (drag) cancelDrag(); });
    svg.addEventListener('keydown', event => {
      const edge = event.target.closest('[data-edge]')?.dataset.edge;
      if (!edge || running() || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      if (doors.includes(edge)) {
        selection = selection === edge ? null : edge;
        renderBoard();
        message(selection ? '문을 골랐습니다. 빈 벽을 선택하고 Enter를 누르세요.' : '선택을 취소했습니다.');
      } else if (selection) commitMove(selection, edge);
      svg.querySelector(`[data-edge="${edge}"]`)?.focus();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && (drag || selection)) { cancelDrag(); message('선택을 취소했습니다.'); }
    });
    $('undo').addEventListener('click', () => {
      if (running() || !history.length) return;
      cancelDrag();
      doors = history.pop();
      metrics.edits++;
      clearBattleView();
      const validation = validateLayout(doors, seed);
      message(validation.ok ? '한 단계 되돌렸습니다.' : validation.reason, !validation.ok);
      renderBoard(); showMetrics();
    });
    $('reset').addEventListener('click', () => {
      if (running()) return;
      cancelDrag();
      if (doors.slice().sort().join() !== INITIAL_DOORS.slice().sort().join()) {
        history.push(doors.slice()); metrics.edits++; doors = INITIAL_DOORS.slice();
      }
      clearBattleView();
      const validation = validateLayout(doors, seed);
      message(validation.ok ? '처음 배치입니다.' : validation.reason, !validation.ok);
      renderBoard(); showMetrics();
    });
    $('routes-toggle').addEventListener('click', () => {
      if (!debug) return;
      hidden = !hidden;
      $('routes-toggle').textContent = hidden ? '경로 보기' : '경로 숨기기';
      $('routes-toggle').setAttribute('aria-pressed', String(hidden));
      renderBoard();
    });
    $('new-invaders').addEventListener('click', () => {
      if (running()) return;
      cancelDrag();
      const value = new Uint32Array(1);
      window.crypto.getRandomValues(value);
      seed = value[0] === seed ? (seed + 1) >>> 0 : value[0];
      invadersChanged = true;
      clearBattleView();
      displayResult();
      const validation = validateLayout(doors, seed);
      message(validation.ok ? '침입자가 바뀌었습니다. 이 시드로 배치 전후를 비교하세요.' : validation.reason, !validation.ok);
      renderBoard();
    });
    function displayResult() {
      const changed = invadersChanged || (currentResult && currentResult.seed !== seed) ||
        (previousResult && currentResult && previousResult.seed !== currentResult.seed);
      $('comparison-note').textContent = `${changed ? '침입자 바뀜' : '동일 침입자'} · 현재 시드 ${seed}`;
      $('comparison-note').classList.toggle('changed', !!changed);
      if (currentResult) {
        $('result-summary').textContent = currentResult.summary;
        $('squad-results').innerHTML = currentResult.squads.map(s => `<tr><th>분대 ${s.id}</th><td>${s.passages}회</td><td>${s.time.toFixed(1)}초</td><td>${s.result}${s.cause === 'battleEnd' ? '(전투 종료)' : s.cause === 'limit' ? '(통과 한도)' : ''}</td></tr>`).join('');
      }
      const rows = [
        ['침입자 시드', r => r.seed],
        ['보물방 도달', r => `${r.reached}명`], ['도달·시간 초과 외 인원', r => `${r.defeated}명`],
        ['시간 초과', r => `${r.timeout}명`], ['함정 발동', r => `${r.traps}회`],
        ...(debug ? [0, 1, 2].map(i => [`분대 ${i + 1} 문 통과`, r => `${r.passages[i]}회`]) : []),
        ['걸린 시간', r => `${r.time.toFixed(1)}초`],
        ['판정', r => r.success ? '방어 성공' : '보물방 도달']
      ];
      $('result-body').innerHTML = rows.map(([label, format]) => `<tr><th scope="row">${label}</th><td>${previousResult ? format(previousResult) : '—'}</td><td>${currentResult ? format(currentResult) : '—'}</td></tr>`).join('');
    }
    function renderBattle() {
      $('clock').textContent = `${Math.min(60, battle.time).toFixed(1)} / 60초`;
      $('time-progress').value = battle.time;
      $('battle-squads').innerHTML = battle.squads.map(s => `<div class="squad-card s${s.id}"><strong>분대 ${s.id} · ${peopleOf(s)}명</strong><small>${HABITS[s.id - 1]}</small><span>${s.state}${debug ? ` · ${s.passages}회` : ''}</span></div>`).join('');
      $('monster-state').textContent = `대기실 몬스터 ${monsterCount(battle)}마리 · 방별 체력 ${Object.values(battle.dens).map(hp => Math.ceil(hp.reduce((a, b) => a + b, 0))).join(' / ')}`;
      $('event-log').innerHTML = battle.logs.slice(-3).map(log => `<div>${log}</div>`).join('');
      renderActors();
    }
    function tick(now) {
      if (!running()) return;
      accumulator += (now - lastTick) / 1000;
      lastTick = now;
      // 쌓인 시간을 버리지 않는다. 백그라운드에서도 60초 제한이 유지된다.
      while (accumulator >= 1 / 60 && !battle.done) {
        advanceBattle(battle, 1 / 60);
        accumulator -= 1 / 60;
      }
      renderBattle();
      if (battle.done) {
        metricTick = now;
        previousResult = currentResult;
        currentResult = battleResult(battle);
        invadersChanged = false;
        displayResult();
        $('fight').disabled = false;
        $('fight').textContent = '같은 침입자로 다시 전투';
        $('battle-state').textContent = currentResult.success ? '방어 성공' : '방어 실패 · 보물방 도달';
        message('전투가 끝났습니다. 문을 옮겨 직전 결과와 비교해 보세요.');
        renderBoard(); showMetrics();
      } else requestAnimationFrame(tick);
    }
    $('fight').addEventListener('click', () => {
      if (running()) return;
      measure(); cancelDrag();
      const validation = validateLayout(doors, seed);
      if (!validation.ok) { message(validation.reason, true); return; }
      battle = createBattle(doors, seed);
      metrics.fights++;
      lastTick = performance.now(); accumulator = 0;
      $('fight').disabled = true;
      $('battle-state').textContent = '탐험 중 · 문 배치 잠금';
      message('세 분대가 각자의 탐험 경로를 따라갑니다.');
      renderBoard(); renderBattle(); showMetrics();
      requestAnimationFrame(tick);
    });
    $('measure-seeds').addEventListener('click', () => {
      if (running()) return;
      const result = measureSeeds(doors);
      $('batch-result').textContent = `시드 0~99 · 분대당 평균 문 통과 ${result.averagePassages.toFixed(2)}회 · 전투 평균 시간 ${result.averageTime.toFixed(2)}초 · 시간 초과 전투 ${(result.timeoutRate * 100).toFixed(0)}% · 방어율 ${(result.defenseRate * 100).toFixed(0)}%`;
    });
    clearBattleView();
    document.addEventListener('visibilitychange' , () => { metricTick = performance.now(); });
    setInterval(showMetrics, 1000);
    renderBoard(); showMetrics();
  }
  }
  const selected = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('board') : '3x4';
  const lab = createLab(selected || '3x4');
  if (typeof module !== 'undefined' && module.exports) module.exports = lab;
  if (typeof window !== 'undefined') window.DoorLab = lab;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lab.mount);
    else lab.mount();
  }
})();
