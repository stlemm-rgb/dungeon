/* 독립 실험. 외부 라이브러리·기존 게임·저장소에 의존하지 않는다. */
(function () {
  'use strict';
  const COLS = 3;
  const ROWS = 4;
  const ENTRY = 1;
  const TREASURE = 10;
  const LIMIT = 18;
  const SEED = 7;
  // 실험용 임시 전투 수치. 경로 규칙과 분리해 비교 중에는 항상 동일하게 쓴다.
  const BALANCE = Object.freeze({ moveSeconds: 2, speedBoost: 1.5, duration: 60,
    people: 10, personHP: 10, trapDamage: 20, monsterHP: 34,
    monsterAttack: 6, personAttack: 1.4, monsters: 3 });
  const FACILITIES = Object.freeze({ 3: 'trap', 8: 'trap', 6: 'monster', 5: 'bait' });
  const edgeKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const EDGES = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = r * COLS + c;
      if (c < COLS - 1) EDGES.push({ a, b: a + 1, id: edgeKey(a, a + 1) });
      if (r < ROWS - 1) EDGES.push({ a, b: a + COLS, id: edgeKey(a, a + COLS) });
    }
  }
  const INITIAL_DOORS = Object.freeze(['0-1', '0-3', '3-6', '6-9', '9-10',
    '1-2', '2-5', '5-8', '8-11', '10-11', '1-4', '4-7']);

  function graphOf(doors) {
    const graph = Array.from({ length: ROWS * COLS }, () => []);
    const open = new Set(doors);
    for (const e of EDGES) {
      if (open.has(e.id)) { graph[e.a].push(e.b); graph[e.b].push(e.a); }
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
    if (to === from - 1) return 0; // 왼쪽
    if (to === from - COLS) return 1; // 위
    if (to === from + 1) return 2; // 오른쪽
    return 3; // 아래
  }
  function orderedCandidates(from, candidates, squad, facilities) {
    // 미끼 점수 동점만 번갈아 고른다. 첫 선택 뒤 나머지는 화면 방향 순서.
    const groups = [[], []];
    for (const to of candidates) groups[facilities[to] === 'bait' ? 0 : 1].push(to);
    return groups.flatMap(group => {
      group.sort((a, b) => direction(from, a) - direction(from, b));
      if (!group.length) return [];
      const first = group.splice((squad - 1) % group.length, 1)[0];
      return [first, ...group];
    });
  }
  function exploreRoute(doors, squad = 1, options = {}) {
    const start = options.start ?? ENTRY;
    const goal = options.goal ?? TREASURE;
    const facilities = options.facilities ?? FACILITIES;
    const graph = graphOf(doors);
    const visited = new Set([start]);
    const rooms = [start];
    const steps = [];
    function frame(room) {
      return { room, choices: orderedCandidates(room,
        graph[room].filter(to => !visited.has(to)), squad, facilities), cursor: 0 };
    }
    const stack = [frame(start)];
    while (stack.length && rooms[rooms.length - 1] !== goal) {
      const top = stack[stack.length - 1];
      let next;
      while (top.cursor < top.choices.length) {
        const candidate = top.choices[top.cursor++];
        if (!visited.has(candidate)) { next = candidate; break; }
      }
      if (next !== undefined) {
        steps.push({ from: top.room, to: next, edge: edgeKey(top.room, next), backtrack: false });
        rooms.push(next);
        visited.add(next);
        stack.push(frame(next));
      } else {
        stack.pop();
        if (!stack.length) break;
        const parent = stack[stack.length - 1].room;
        steps.push({ from: top.room, to: parent, edge: edgeKey(top.room, parent), backtrack: true });
        rooms.push(parent);
      }
    }
    return { squad, rooms, steps, reached: rooms[rooms.length - 1] === goal };
  }
  function countPassages(route) { return route.steps.length; }
  function routesOf(doors) { return [1, 2, 3].map(k => exploreRoute(doors, k)); }
  function doorPassages(routes) {
    const counts = {};
    for (const route of routes) {
      for (const step of route.steps) counts[step.edge] = (counts[step.edge] || 0) + 1;
    }
    return counts;
  }
  function validateLayout(doors) {
    const validIDs = new Set(EDGES.map(e => e.id));
    if (doors.length !== 12 || new Set(doors).size !== 12 || doors.some(id => !validIDs.has(id))) {
      return { ok: false, code: 'tokens', reason: '안쪽 벽에 문 12개를 유지해야 합니다.' };
    }
    if (!isConnected(doors)) {
      return { ok: false, code: 'disconnected', reason: '입구 → 보물방 연결이 끊깁니다.' };
    }
    const routes = routesOf(doors);
    const over = routes.find(route => countPassages(route) > LIMIT);
    if (over) return { ok: false, code: 'limit', routes,
      reason: `분대 ${over.squad} 문 통과 ${countPassages(over)}회: 최대 18회를 넘습니다.` };
    return { ok: true, routes };
  }
  function moveDoor(doors, from, to) {
    if (!doors.includes(from) || doors.includes(to) || !EDGES.some(e => e.id === to)) {
      return { ok: false, code: 'target', reason: '문이 없는 다른 안쪽 벽에 놓아 주세요.', doors: doors.slice() };
    }
    const candidate = doors.map(id => id === from ? to : id);
    return { ...validateLayout(candidate), doors: candidate };
  }
  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  }
  function peopleOf(squad) { return Math.max(0, Math.ceil(squad.hp / BALANCE.personHP)); }
  function monsterCount(battle) { return battle.monsterHP.filter(hp => hp > 0).length; }
  function createBattle(doors) {
    const validation = validateLayout(doors);
    if (!validation.ok) throw new Error(validation.reason);
    const random = seededRandom(SEED);
    const battle = { time: 0, done: false, trapActivations: 0, logs: [],
      monsterHP: Array.from({ length: BALANCE.monsters }, () => BALANCE.monsterHP),
      squads: validation.routes.map(route => ({ id: route.squad, route,
        hp: BALANCE.people * BALANCE.personHP, attack: BALANCE.personAttack * (.95 + random() * .1),
        room: ENTRY, stepIndex: 0, progress: 0, passages: 0, arrived: false,
        visited: new Set([ENTRY]), traps: {}, state: '이동' })) };
    addLog(battle, '침입자 30명이 위쪽 입구로 들어왔습니다.');
    return battle;
  }
  function addLog(battle, text) {
    battle.logs.push(`${battle.time.toFixed(1)}초 · ${text}`);
    if (battle.logs.length > 12) battle.logs.shift();
  }
  function damageMonsters(battle, damage) {
    for (let i = 0; i < battle.monsterHP.length && damage > 0; i++) {
      const hit = Math.min(battle.monsterHP[i], damage);
      battle.monsterHP[i] -= hit;
      damage -= hit;
    }
  }
  function enterRoom(battle, squad, room) {
    squad.room = room;
    squad.visited.add(room);
    const facility = FACILITIES[room];
    if (facility === 'trap' && (squad.traps[room] || 0) < 2) {
      squad.traps[room] = (squad.traps[room] || 0) + 1;
      squad.hp = Math.max(0, squad.hp - BALANCE.trapDamage);
      battle.trapActivations++;
      addLog(battle, `분대 ${squad.id}, 함정 (${Math.floor(room / COLS)},${room % COLS}) ${squad.traps[room]}번째 발동`);
    }
    if (squad.hp <= 0) {
      squad.state = '전멸';
      addLog(battle, `분대 ${squad.id}가 모두 쓰러졌습니다.`);
    } else if (room === TREASURE) {
      squad.arrived = true;
      squad.state = '도달';
      addLog(battle, `분대 ${squad.id}, ${peopleOf(squad)}명이 보물방에 도달했습니다.`);
    }
  }
  function advanceBattle(battle, seconds) {
    // 고정 1/60초 이하로만 갱신: 화면 주사율·탭 전환과 무관한 동일 결과.
    let remaining = Math.min(Math.max(0, seconds), BALANCE.duration - battle.time);
    while (!battle.done && remaining > 1e-9) {
      const dt = Math.min(1 / 60, remaining);
      remaining -= dt;
      battle.time = Math.min(BALANCE.duration, battle.time + dt);
      const fighters = battle.squads.filter(s => s.hp > 0 && !s.arrived &&
        FACILITIES[s.room] === 'monster' && monsterCount(battle) > 0);
      if (fighters.length) {
        const monsterDamage = monsterCount(battle) * BALANCE.monsterAttack * dt / fighters.length;
        const invaderDamage = fighters.reduce((n, s) => n + peopleOf(s) * s.attack * dt, 0);
        for (const squad of fighters) {
          squad.state = '교전';
          squad.hp = Math.max(0, squad.hp - monsterDamage);
          if (!squad.hp) { squad.state = '전멸'; addLog(battle, `분대 ${squad.id} 전멸`); }
        }
        const before = monsterCount(battle);
        damageMonsters(battle, invaderDamage);
        if (before && !monsterCount(battle)) addLog(battle, '대기실 몬스터가 모두 쓰러졌습니다.');
      }
      for (const squad of battle.squads) {
        if (squad.hp <= 0 || squad.arrived || fighters.includes(squad)) continue;
        const step = squad.route.steps[squad.stepIndex];
        if (!step) continue;
        squad.state = '이동';
        const fast = squad.visited.has(step.to) ||
          (FACILITIES[squad.room] === 'monster' && monsterCount(battle) === 0);
        squad.progress += dt / BALANCE.moveSeconds * (fast ? BALANCE.speedBoost : 1);
        if (squad.progress >= 1 - 1e-9) {
          squad.progress = 0;
          squad.stepIndex++;
          squad.passages++;
          enterRoom(battle, squad, step.to);
        }
      }
      if (battle.squads.every(s => s.hp <= 0 || s.arrived) || battle.time >= BALANCE.duration - 1e-8) {
        battle.done = true;
        for (const squad of battle.squads) {
          if (squad.hp > 0 && !squad.arrived) squad.state = '시간 초과';
        }
        addLog(battle, '전투가 끝났습니다.');
      }
    }
    return battle;
  }
  function battleResult(battle) {
    const reached = battle.squads.reduce((n, s) => n + (s.arrived ? peopleOf(s) : 0), 0);
    const alive = battle.squads.reduce((n, s) => n + peopleOf(s), 0);
    return { reached, defeated: 30 - alive, timeout: alive - reached,
      traps: battle.trapActivations, passages: battle.squads.map(s => s.passages),
      time: Number(battle.time.toFixed(2)), success: alive === 0, seed: SEED };
  }

  const api = { COLS, ROWS, ENTRY, TREASURE, LIMIT, SEED, EDGES, INITIAL_DOORS,
    FACILITIES, BALANCE, edgeKey, graphOf, reachableRooms, isConnected,
    orderedCandidates, exploreRoute, countPassages, routesOf, doorPassages,
    validateLayout, moveDoor, seededRandom, createBattle, advanceBattle, battleResult, peopleOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DoorLab = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }

  function mount() {
    const $ = id => document.getElementById(id);
    const svg = $('board');
    if (!svg) return;
    let doors = INITIAL_DOORS.slice();
    let history = [];
    let hidden = false;
    let selection = null;
    let drag = null;
    let battle = null;
    let previousResult = null;
    let currentResult = null;
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
    function edgePoint(edge) {
      const a = center(edge.a), b = center(edge.b);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vertical: edge.b - edge.a === 1 };
    }
    function routeMarkup(routes) {
      if (hidden) return '';
      return routes.map((route, i) => {
        const shift = (i - 1) * 6;
        return `<g class="s${i + 1}">${route.steps.map(step => {
          const a = center(step.from), b = center(step.to);
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
      const candidate = from && target ? moveDoor(doors, from, target) : null;
      const shownDoors = candidate && candidate.code !== 'target' ? candidate.doors : doors;
      const routes = routesOf(shownDoors);
      const counts = doorPassages(routes);
      const reachable = reachableRooms(shownDoors);
      const defs = `<defs>${[0, 1, 2].map(i => `<marker id="arrow-${i}" class="s${i + 1}" viewBox="0 0 8 8" refX="5" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path class="arrow" d="M0 0 L8 4 L0 8 Z"/></marker>`).join('')}</defs>`;
      const rooms = Array.from({ length: 12 }, (_, room) => {
        const p = center(room);
        const facility = FACILITIES[room];
        let label = facility === 'trap' ? '함정' : facility === 'monster' ? '대기실' : facility === 'bait' ? '미끼' : '';
        let symbol = facility === 'trap' ? '×' : facility === 'monster' ? '♟' : facility === 'bait' ? '◇' : '';
        if (room === ENTRY) { label = '입구'; symbol = '↓'; }
        if (room === TREASURE) { label = '보물방'; symbol = '◆'; }
        return `<g class="${reachable.has(room) ? '' : 'isolated'}"><rect class="room ${label ? 'special-room' : ''}" x="${p.x - 54}" y="${p.y - 54}" width="108" height="108"/><text class="room-coord" x="${p.x - 43}" y="${p.y + 42}">(${Math.floor(room / 3)},${room % 3})</text><text class="room-label" x="${p.x}" y="${p.y - 24}">${label}</text><text class="room-symbol" x="${p.x}" y="${p.y + 26}">${symbol}</text></g>`;
      }).join('');
      const walls = `<rect class="wall" x="18" y="24" width="324" height="432"/>` + EDGES.map(e => {
        const p = edgePoint(e);
        return `<path class="wall" d="${p.vertical ? `M${p.x},${p.y - 54}v108` : `M${p.x - 54},${p.y}h108`}"/>`;
      }).join('');
      const zones = from ? EDGES.filter(e => !doors.includes(e.id)).map(e => {
        const p = edgePoint(e), active = e.id === target;
        const invalid = active && candidate && !candidate.ok;
        return `<rect class="drop-zone ${active ? 'candidate' : ''} ${invalid ? 'invalid' : ''}" x="${p.x - (p.vertical ? 7 : 23)}" y="${p.y - (p.vertical ? 23 : 7)}" width="${p.vertical ? 14 : 46}" height="${p.vertical ? 46 : 14}" rx="4"/>`;
      }).join('') : '';
      const tokens = EDGES.filter(e => shownDoors.includes(e.id)).map(e => {
        const p = edgePoint(e);
        return `<rect class="door ${e.id === from ? 'departing selected' : ''}" x="${p.x - (p.vertical ? 7 : 20)}" y="${p.y - (p.vertical ? 20 : 7)}" width="${p.vertical ? 14 : 40}" height="${p.vertical ? 40 : 14}" rx="3"/>`;
      }).join('');
      const labels = hidden ? '' : EDGES.filter(e => shownDoors.includes(e.id)).map(e => {
        const p = edgePoint(e), x = p.x + (p.vertical ? 18 : 0), y = p.y + (p.vertical ? 0 : -18);
        return `<g><circle class="door-count-bg" cx="${x}" cy="${y}" r="9"/><text class="door-count" x="${x}" y="${y}">${counts[e.id] || 0}</text></g>`;
      }).join('');
      const hits = EDGES.map(e => {
        const p = edgePoint(e);
        const name = `(${Math.floor(e.a / 3)},${e.a % 3}) ↔ (${Math.floor(e.b / 3)},${e.b % 3})`;
        return `<path class="edge-hit" data-edge="${e.id}" role="button" tabindex="${running() ? '-1' : '0'}" aria-disabled="${!!running()}" aria-label="${doors.includes(e.id) ? '문' : '빈 벽'} ${name}" d="${p.vertical ? `M${p.x},${p.y - 22}v44` : `M${p.x - 22},${p.y}h44`}"/>`;
      }).join('');
      svg.innerHTML = defs + rooms + walls + zones + tokens + `<path class="outside-arrow" d="M180 2v22m-5 -6l5 6 5 -6"/><text class="outside-label" x="233" y="13">침입자 진입 ↓</text><g class="paths">${routeMarkup(routes)}</g><g class="door-counts">${labels}</g>${hits}<g class="actors" id="actors"></g>`;
      $('route-counts').innerHTML = routes.map((route, i) => `<div class="squad-card s${i + 1} ${route.steps.length > LIMIT ? 'over' : ''}"><strong>분대 ${i + 1}</strong><span>${hidden ? '경로 숨김' : `${countPassages(route)} / 18회`}</span></div>`).join('');
      $('undo').disabled = !history.length || !!running();
      $('reset').disabled = !!running();
      renderActors();
    }
    function renderActors() {
      if (!battle || !$('actors')) return;
      $('actors').innerHTML = battle.squads.filter(s => s.hp > 0).map(s => {
        const a = center(s.room);
        const step = s.route.steps[s.stepIndex];
        const b = step ? center(step.to) : a;
        const progress = s.arrived ? 0 : s.progress;
        const x = a.x + (b.x - a.x) * progress + (s.id - 2) * 13;
        const y = a.y + (b.y - a.y) * progress;
        return `<g class="s${s.id}"><circle class="actor" cx="${x}" cy="${y}" r="9"/><text class="actor-number" x="${x}" y="${y}">${s.id}</text></g>`;
      }).join('');
    }
    function clearBattleView() {
      battle = null;
      $('battle-squads').innerHTML = '';
      $('event-log').textContent = '';
      $('monster-state').textContent = '대기실 몬스터 3마리 · 매 전투 초기화';
      $('battle-state').textContent = '배치 변경 · 다시 비교할 수 있습니다';
      $('clock').textContent = '0.0 / 60초';
      $('time-progress').value = 0;
    }
    function commitMove(from, to) {
      const result = moveDoor(doors, from, to);
      if (result.ok) {
        history.push(doors.slice());
        doors = result.doors;
        metrics.edits++;
        clearBattleView();
        message('문을 옮겼습니다. 바뀐 경로를 확인해 보세요.');
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
      return { x: (event.clientX - box.left) / box.width * 360,
        y: (event.clientY - box.top) / box.height * 480 };
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
        const result = moveDoor(doors, drag.from, target);
        message(result.ok ? '미리보기 · 놓으면 이 경로가 됩니다.' : result.reason, !result.ok);
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
      message('한 단계 되돌렸습니다.');
      renderBoard(); showMetrics();
    });
    $('reset').addEventListener('click', () => {
      if (running()) return;
      cancelDrag();
      if (doors.slice().sort().join() !== INITIAL_DOORS.slice().sort().join()) {
        history.push(doors.slice()); metrics.edits++; doors = INITIAL_DOORS.slice();
      }
      clearBattleView();
      message('처음 배치입니다.');
      renderBoard(); showMetrics();
    });
    $('routes-toggle').addEventListener('click', () => {
      hidden = !hidden;
      $('routes-toggle').textContent = hidden ? '경로 보기' : '경로 숨기기';
      $('routes-toggle').setAttribute('aria-pressed', String(hidden));
      renderBoard();
    });
    function displayResult() {
      const rows = [
        ['보물방 도달', r => `${r.reached}명`], ['쓰러뜨린 인원', r => `${r.defeated}명`],
        ['시간 초과', r => `${r.timeout}명`], ['함정 발동', r => `${r.traps}회`],
        ...[0, 1, 2].map(i => [`분대 ${i + 1} 문 통과`, r => `${r.passages[i]}회`]),
        ['걸린 시간', r => `${r.time.toFixed(1)}초`],
        ['판정', r => r.success ? '방어 성공' : r.timeout ? '시간 초과 있음' : '보물방 도달']
      ];
      $('result-body').innerHTML = rows.map(([label, format]) => `<tr><th scope="row">${label}</th><td>${previousResult ? format(previousResult) : '—'}</td><td>${currentResult ? format(currentResult) : '—'}</td></tr>`).join('');
    }
    function renderBattle() {
      $('clock').textContent = `${Math.min(60, battle.time).toFixed(1)} / 60초`;
      $('time-progress').value = battle.time;
      $('battle-squads').innerHTML = battle.squads.map(s => `<div class="squad-card s${s.id}"><strong>분대 ${s.id} · ${peopleOf(s)}명</strong><span>${s.state} · ${s.passages}회</span></div>`).join('');
      $('monster-state').textContent = `대기실 몬스터 ${monsterCount(battle)} / 3마리 · 체력 ${battle.monsterHP.map(hp => Math.ceil(hp)).join(' / ')}`;
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
        displayResult();
        $('fight').disabled = false;
        $('fight').textContent = '같은 침입자로 다시 전투';
        $('battle-state').textContent = currentResult.success ? '방어 성공' : currentResult.timeout ? '종료 · 시간 초과는 별도 집계' : '전투 종료';
        message('전투가 끝났습니다. 문을 옮겨 직전 결과와 비교해 보세요.');
        renderBoard(); showMetrics();
      } else requestAnimationFrame(tick);
    }
    $('fight').addEventListener('click', () => {
      if (running()) return;
      measure(); cancelDrag();
      battle = createBattle(doors);
      metrics.fights++;
      lastTick = performance.now(); accumulator = 0;
      $('fight').disabled = true;
      $('battle-state').textContent = '탐험 중 · 문 배치 잠금';
      message('세 분대가 각자의 탐험 경로를 따라갑니다.');
      renderBoard(); renderBattle(); showMetrics();
      requestAnimationFrame(tick);
    });
    document.addEventListener('visibilitychange', () => { metricTick = performance.now(); });
    setInterval(showMetrics, 1000);
    renderBoard(); showMetrics();
  }
})();
