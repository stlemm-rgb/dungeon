/* D1 전투 계산 (화면 그리기 없음). 숫자는 battle_data.js, 판·탐험 규칙은 zones.js
 *
 *  - create(o): o = { plan(progress.js의 이번 주 계획), zones, units(대기실 부대 id 목록), unitById, goal, doors(문 배치 { 층: [id] } 또는 배열) } -> 전투 상태 S
 *    unitById(id) -> { kind: 'squad'|'guard', name, count(인원), hp·atk·def(1명 능력치, progress.js statOf) }. 옛 이름 monById도 받음
 *  - step(S, dt): 게임 시간 dt초 진행. 일어난 일 목록(events)을 돌려준다 (화면이 연출에 씀)
 *  - applyCard(S, side): 이벤트 카드 한 방향 효과. progress(S): 가장 앞선 분대 진행도(%). result(S): 결과 (progress.js applyBattle에 넘김)
 *  - 3차 (2026-10-24, docs/DESIGN_D1_DOORS.md 4-2·11·12절):
 *    · 분대 길 = ZONES.exploreRoute(문, 시설, 분대 번호, plan.seed) (탐험 경로, 되돌아가는 걸음 포함). 같은 배치 + 같은 시드 = 미리보기 경로 = 실제 경로.
 *      지나갈 점 = 문이 놓인 벽 가운데(doorPoint) + 방 가운데. 전투 중 일(처치·퇴각)로 길을 바꾸지 않는다
 *    · 처음 들어간 방 가운데에서 조사 GRID.inspect초 멈춤 (사건 inspect). 다음 방을 이미 가 봤거나 지금 방이 빈 대기실이면 이동 × GRID.speedBoost
 *    · 함정: 들어설 때 + 안에 있는 동안 TRAP_EVERY초마다 굴림. 같은 분대가 그 함정 방에 GRID.trapMax번째 넘게 들어가면 굴리지 않음 (q.trapIn)
 *    · 대기실: 산 몬스터가 있는 대기실 가운데에 닿는 순간 승패를 바로 정함 (CLASH. 공방 주고받기 없음). 그 분대만 encounter + outcome초 멈춤 (사건 clash).
 *      몬스터 승 = 침입자 분대 퇴각 (격퇴) · 몬스터 패 = 그 대기실 부대 모두 퇴각(사건 mretreat, 다음 주 쉼), 침입자는 피해를 입고 계속 탐험.
 *      이긴 쪽 피해 = 지금 체력 × min(damageCap, damageK × 진 쪽 힘 ÷ 이긴 쪽 힘). 같은 대기실에 동시에 오면 분대 번호 순 (앞 분대 결과가 바로 반영)
 *    · 침입자 분대 체력 합이 처음의 CLASH.invaderRetreat 아래면 퇴각 (함정만으로도. 사건 iretreat { cause: 'trap'|'den'|'clash'|'card' })
 *    · 퇴각은 방어 성공 (보물방 도달만 실패). 사망 판정 없음 (몬스터 퇴각은 늘 big: false)
 *    · 위기 카드는 전투 수치 카드(monAtk 몬스터 공격·weak 침입자 받는 피해)만 승패 힘에 더함. 함정·이동 카드는 원래 뜻
 *    · 층별 차례 전투 (12절 9-4, 구조만): 분대는 계단(위층 B)에 닿으면 멈춤(state 'stairs'). 그 층 분대가 모두 퇴각·계단·보물방 도달이 되면
 *      다음 층이 열려 있고 계단에 분대가 있을 때 사건 floorEnd { n, next, waiting } -> 화면이 알림 뒤 nextFloor(S)를 부르면 다음 층 전투
 *  - 전투 시간 제한 없음 (2026-10-29 결정 C, API.md 17절): 모든 분대가 끝나야 판이 끝난다. elapsed(S) = 지난 시간(초, 판 전체)
 *    안전장치: 판 전체 시간이 BD.SAFETY_LIMIT(600초)를 넘으면 남은 분대는 보물방 도달로 침 (침입자 승, 노릴 수 없게). 걸린 수 = result().safety (정상이면 0)
 *    옛 저장 지점의 S.timeout · tally.timeout · 원인 'timeout'은 읽어도 무시한다
 *  - 무작위는 plan.seed로 만든 시드 무작위만 (게임용, 상태 S.rs). 연출용 무작위는 쓰지 않는다
 *  - snapshot(S): 저장용 순수 데이터 (plan·zones·units·doors·icard·fx 참조는 뺌). restore(o, snap): create와 같은 o로 S를 되살림
 *  - 침입자 강함: 레벨(plan.groups[].lv) × 던전 가치 배율(plan.power). 던전 속성(plan.attr) fx는 침입자 카드 fx에 더함
 *  - 고정 구역 '얼어붙은 하역장'(kind fixed, FIXED_ZONES slow·span): 지나간 분대는 span 방 동안 느려짐 (q.chill, 사건 chill)
 *  - 카드 위기: 사건 'crisis' { kind: surge|treasure|boss, n, left } 전투당 최대 CARD_RULE.maxPerBattle (S.crisis에 저장)
 *  - 보스전 카드 3종 (2026-10-29, docs/specs/dungeon_cards.md 0절, API.md 18절): o.cards = true + plan.mode 'boss'일 때만 (S.cards.on).
 *    기회 = 첫 분대 진입 1 + 이후 위기 1 (BD.BOSS_CARDS enter·crisis). 기회가 오면 step 끝에서 S.pick(후보 목록)을 만들고 그동안 step은 아무것도 안 함 (전투 완전 정지).
 *    화면이 pickSelect(대상 고르기 시작)·pickCancel(후보로 돌아감)·pickUse(카드, 방)·pickSkip(넘기기)를 부르면 적용하고 재개. 후보·시점은 전투 상태에서만 나옴 (무작위 안 씀)
 *    효과: smoke = 이동 분대 q.smoke초 정지 · reserve = 빈 대기실에 임시 부대(S.mu[id].tmp, result의 deployed·fought·monRetreat에서 빠짐) · trigger = 함정 기본 피해 1회
 *    기록 = S.cards.log (result().cards). 저장 지점(snapshot)에 S.cards·S.pick·q.smoke가 그대로 들어감 -> 복원하면 같은 선택 대기·같은 효과
 *  - 시설 강화 (docs/specs/facility_upgrade.md): o.up = { trap: { 방: 칸당 더할 피해 }, den: { 방: 전투 체력 배율 } } (progress.js battleInput이 만듦).
 *    S.up에 순수 데이터로 담아 저장 지점에도 남는다. 대기실 체력 배율은 create 때 전투 복사본에 한 번만 곱함 (restore는 저장된 체력을 그대로 써서 중복 없음)
 */
(function () {
  'use strict';
  var BD = window.BATTLE_DATA, Z = window.ZONES;

  // 시드 무작위 (게임용). 상태는 S.rs 숫자 하나
  function rand(S) {
    S.rs = (S.rs + 0x6D2B79F5) | 0;
    var t = S.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function cardById(id) { return BD.INVADER_CARDS.filter(function (c) { return c.id === id; })[0] || BD.INVADER_CARDS[0]; }
  function attrById(id) { return (BD.ATTRS || []).filter(function (a) { return a.id === id; })[0] || null; }
  function mergeFx(plan) {
    var fx = {}, a = attrById(plan.attr);
    [cardById(plan.card).fx, a ? a.fx : {}].forEach(function (f) { Object.keys(f).forEach(function (k) { fx[k] = (fx[k] || 0) + f[k]; }); });
    if (fx.trap) fx.trap = Math.min(0.95, fx.trap);
    return fx;
  }
  function grid() { return BD.GRID || { inspect: 0.6, speedBoost: 1.5, trapMax: 2 }; }
  function safetyLimit() { return typeof BD.SAFETY_LIMIT === 'number' && BD.SAFETY_LIMIT > 0 ? BD.SAFETY_LIMIT : 600; }
  function clashRule() { return BD.CLASH || { encounter: 1, outcome: 1, jitter: 0.2, damageK: 0.5, damageCap: 0.4, invaderRetreat: 0.5 }; }
  function kindOf(S, z) { var f = z === 'Y' ? null : Z.FAC[S.zones[z]]; return f ? f.kind : 'none'; }
  function fixedDef(S, z) { var f = z === 'Y' ? null : Z.FAC[S.zones[z]]; return f && f.fixedId ? (BD.FIXED_ZONES || {})[f.fixedId] || null : null; }
  function cardRule() { return BD.CARD_RULE || { maxPerBattle: 2, crisisProgress: 85, massSquads: 3 }; }
  function retreatRule() { return BD.RETREAT || { hpRatio: 0.35, burstWindow: 4, bigShare: 0.4 }; }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function doorsOf(o) { return o.doors || (Z.doors ? Z.doors() : null); }
  // 시설 강화 입력 -> 순수 데이터 { trap: { 방: 칸당 더할 피해 }, den: { 방: 체력 배율 } } (없으면 빈 표)
  function upOf(o) {
    var u = o && o.up && typeof o.up === 'object' ? o.up : {}, out = { trap: {}, den: {} };
    ['trap', 'den'].forEach(function (k) {
      var t = u[k] && typeof u[k] === 'object' ? u[k] : {};
      Object.keys(t).forEach(function (z) { if (typeof t[z] === 'number' && isFinite(t[z])) out[k][z] = t[z]; });
    });
    return out;
  }

  // ---------- 보스전 카드 (API.md 18절) ----------
  function bossCards() { return BD.BOSS_CARDS || { enter: 1, crisis: 1, list: [] }; }
  function cardDef(id) { return (bossCards().list || []).filter(function (c) { return c.id === id; })[0] || null; }
  // 임시 수비대 1명 능력치 (progress.js battleInput이 기본 능력치로 만듦) -> 순수 데이터
  function cardUnitOf(o) {
    var u = o && o.cardUnit;
    if (!u || typeof u.hp !== 'number' || !(u.hp > 0)) return null;
    return { name: String(u.name || '임시 수비대'), count: Math.max(1, u.count | 0), hp: u.hp, atk: +u.atk || 0, def: +u.def || 0, tribe: String(u.tribe || '') };
  }
  function freshCards(on, unit) {
    var B = bossCards();
    return { on: !!on, slots: { enter: Math.max(0, B.enter | 0), crisis: Math.max(0, B.crisis | 0) }, enterSeen: false, used: 0, hits: [], seen: {}, log: [], missed: [], unit: unit || null, tmp: 0, tmpAt: {} };
  }

  function create(o) {
    var plan = o.plan, zones = o.zones, units = o.units, doors = doorsOf(o);
    var S = {
      plan: plan, zones: zones, units: units, doors: doors, rs: plan.seed | 0, t: 0, released: 0, releaseT: 0,
      icard: cardById(plan.card), fx: mergeFx(plan), squads: [], dens: {}, fought: {}, guard: 0, freeze: 0, done: false, safety: 0, maxProg: 0,
      mod: { trapDmg: 0, trapRate: 0, monAtk: 0, slow: 0, weak: 0 },
      gain: { gold: 0, gems: 0, exp: 0, kills: 0, porterKills: 0 }, reached: 0, retreated: 0, loot: 0, total: 0,
      goal: o.goal || (Z.goal ? Z.goal() : 'B'), front: [], mu: {}, crisis: { n: 0, kinds: {}, sq: {} },
      floor: 1, floorT: 0, pending: 0, open: Z.OPEN || 1, tally: { trap: 0, den: 0, clash: 0, card: 0 }, clashes: 0,
      up: upOf(o), pick: null,
      cards: freshCards(!!(o.cards && plan.mode === 'boss'), cardUnitOf(o))   // 보스전 카드 (API.md 18절)
    };
    S.front = Z.bossFront ? Z.bossFront(doors) : [];
    // 대기실 부대 (전투 안에서만 쓰는 복사본). 부대 하나 = 인원 수만큼의 개체
    //  S.mu[부대 id] = { z, max(부대 전체 체력), burst, out(퇴각), big(늘 false), guard }
    var getU = o.unitById || o.monById;
    Object.keys(units).forEach(function (z) {
      if (!Z.FAC[zones[z]] || Z.FAC[zones[z]].kind !== 'den') return;
      var list = [];
      units[z].forEach(function (id) {
        var u = getU ? getU(id) : null;
        if (!u || S.mu[id]) return;
        var n = Math.max(1, (u.count === undefined ? 1 : u.count) | 0), hp = u.hp * (S.up.den[z] || 1);   // 대기실 강화: 이 방의 전투 체력만
        for (var i = 0; i < n; i++) list.push({ id: id, n: i, name: u.name, hp: hp, max: hp, atk: u.atk, def: u.def || 0, guard: u.kind === 'guard', lost: 0, out: false });
        S.mu[id] = { z: z, max: hp * n, burst: 0, out: false, big: false, guard: u.kind === 'guard' };
      });
      S.dens[z] = list;
    });
    // 분대 만들기: 무리 순서(등급 낮은 무리부터). 대기 장소(야외)에 한 줄로 선다
    var all = [];
    plan.groups.forEach(function (g, gi) {
      var st = BD.GRADE_STAT[g.grade], grow = (1 + BD.LVL_GROW * g.lv) * (plan.power || 1);
      for (var k = 0; k < g.count / BD.SQUAD; k++) {
        var mem = [];
        for (var i = 0; i < BD.SQUAD; i++) {
          var porter = i < g.porters, hp = st.hp * grow * (porter ? BD.PORTER.hpMul : 1);
          mem.push({ hp: hp, max: hp, atk: porter ? 0 : st.atk * grow, porter: porter, alive: true });
        }
        all.push({ gi: gi, grade: g.grade, mem: mem });
      }
    });
    var n = all.length;
    all.forEach(function (q, i) {
      var route = Z.exploreRoute(doors, zones, i, plan.seed);
      var home = { x: n > 1 ? 1.1 + 2.8 * i / (n - 1) : 2.5, y: -0.3 };
      var d0 = Z.doorOf('Y', 'E'), a0 = Z.roomCenter('E');
      var wps = [{ x: home.x, y: home.y, z: 'Y' }, { x: d0.x, y: d0.y, z: 'E', door: true, s: 0 }, { x: a0.x, y: a0.y, z: 'E', anchor: true, s: 0 }];
      route.steps.forEach(function (st, si) {
        var d = st.stairs ? Z.entryPoint(st.floor) : Z.doorPoint(st.edge) || Z.doorOf(st.from, st.to, doors), a = Z.roomCenter(st.to);
        wps.push({ x: d.x, y: d.y, z: st.to, door: true, s: si + 1, stairs: !!st.stairs, back: !!st.backtrack });
        wps.push({ x: a.x, y: a.y, z: st.to, anchor: true, s: si + 1 });
      });
      var len = 0; // 진행도는 입구 문부터 끝까지 (대기 장소에서 걷는 거리는 빼고, 되돌아가는 길 포함)
      for (var w = 2; w < wps.length; w++) len += dist(wps[w - 1], wps[w]);
      var maxHp = 0; q.mem.forEach(function (m) { maxHp += m.max; });
      q.id = i; q.habit = i % 3; q.route = route; q.wps = wps; q.wp = 1; q.x = home.x; q.y = home.y; q.home = home;
      q.len = len || 1; q.went = 0; q.state = 'wait'; q.zone = 'Y'; q.prevZone = 'Y'; q.trapT = 0; q.chill = 0; q.chillSlow = 0;
      q.maxHp = maxHp; q.seen = {}; q.insp = {}; q.trapIn = {}; q.passes = 0; q.inspect = 0; q.fast = false; q.depart = false;
      q.clash = null; q.floor = 1; q.cause = ''; q.endT = 0; q.smoke = 0; q.stopped = 0; q.cardDmg = 0;
      S.total += q.mem.length;
    });
    S.squads = all;
    return S;
  }

  function aliveMem(q) { return q.mem.filter(function (m) { return m.alive; }); }
  function hpOf(q) { var s = 0; q.mem.forEach(function (m) { if (m.alive) s += Math.max(0, m.hp); }); return s; }
  function prog(q) { return q.state === 'reached' ? 100 : Math.min(100, q.went / q.len * 100); }
  function progress(S) {
    S.squads.forEach(function (q) { if (q.state !== 'wait') S.maxProg = Math.max(S.maxProg, prog(q)); });
    return S.maxProg;
  }
  function isActive(q) { return q.state === 'wait' || q.state === 'move' || q.state === 'fight'; }

  // 침입자 한 명 죽음 (보상 쌓기)
  function killMem(S, q, m, ev) {
    m.alive = false; m.hp = 0;
    var st = BD.GRADE_STAT[q.grade], gm = m.porter ? BD.PORTER.goldMul : 1;
    S.gain.gold += st.gold * gm; S.gain.gems += st.gem; S.gain.exp += st.exp; S.gain.kills++;
    if (m.porter) S.gain.porterKills++;
    ev.push({ type: 'kill', x: q.x, y: q.y, porter: m.porter, gold: st.gold * gm });
    if (!aliveMem(q).length) { endSquad(S, q, 'dead', q.cause || 'trap', ev); ev.push({ type: 'wipe', id: q.id, x: q.x, y: q.y }); }
  }
  // 침입자 한 명에게 피해 (방어·약화 반영). 죽으면 true
  function hurt(S, q, m, dmg, ev) {
    if (!m.alive) return false;
    m.hp -= dmg * (1 - (S.fx.def || 0)) * (1 + S.mod.weak);
    if (m.hp > 0) return false;
    killMem(S, q, m, ev);
    return true;
  }
  function hurtAll(S, q, dmg, ev) { q.mem.forEach(function (m) { hurt(S, q, m, dmg, ev); }); }
  function front(q) { for (var i = q.mem.length - 1; i >= 0; i--) { if (q.mem[i].alive) return q.mem[i]; } return null; } // 짐꾼은 뒤에

  // 분대가 싸움에서 빠짐: state = 'retreat'(퇴각) | 'dead'(전멸) | 'reached'. cause는 결과 요약용
  function endSquad(S, q, state, cause, ev) {
    if (!isActive(q) && q.state !== 'stairs') return;
    q.state = state; q.cause = cause; q.endT = S.t; q.clash = null;
    if (state === 'retreat') { S.retreated++; ev.push({ type: 'iretreat', id: q.id, cause: cause, x: q.x, y: q.y }); }
    if ((state === 'retreat' || state === 'dead') && S.tally[cause] !== undefined) S.tally[cause]++;
  }
  // 침입자 체력 절반 아래면 퇴각 (함정만으로도)
  function checkInvader(S, q, cause, ev) {
    if (q.state !== 'move' && q.state !== 'fight') return false;
    if (hpOf(q) >= q.maxHp * clashRule().invaderRetreat) return false;
    endSquad(S, q, 'retreat', cause, ev);
    return true;
  }

  function trapRoll(S, q, ev) {
    var chance = (BD.TRAP_CHANCE + S.mod.trapRate) * (1 - (S.fx.trap || 0));
    if (rand(S) >= chance) { ev.push({ type: 'trapMiss', z: q.zone, x: q.x, y: q.y }); return; }
    var dmg = (Z.trapDmgOf(q.zone) + (S.up.trap[q.zone] || 0) * Z.sizeOf(q.zone)) * (1 +S.mod.trapDmg + (S.plan.trapBoost || 0));
    ev.push({ type: 'trap', z: q.zone, x: q.x, y: q.y, dmg: Math.round(dmg), id: q.id });
    q.cause = 'trap';
    var hp0 = hpOf(q);
    hurtAll(S, q, dmg, ev);
    q.trapDmg = (q.trapDmg || 0) + (hp0 - hpOf(q));   // 흐름 시험 보스 결과: 이 분대가 함정에 잃은 체력 합
    checkInvader(S, q, 'trap', ev);
  }
  function trapLive(S, q) { return kindOf(S, q.zone) === 'trap' && (q.trapIn[q.zone] || 0) <= (grid().trapMax || 2); }
  function livingMon(S, z) { return (S.dens[z] || []).filter(function (m) { return m.hp > 0 && !m.out; }); }

  // ---------- 위기 감지 (이벤트 카드 B안) ----------
  function crisis(S, kind, q, ev) {
    cardHit(S, kind, q);
    var max = cardRule().maxPerBattle || 2, c = S.crisis;
    if (c.n >= max) return false;
    if (kind === 'treasure') { if (c.sq[q.id]) return false; c.sq[q.id] = true; }
    else if (c.kinds[kind]) return false;
    c.n++; c.kinds[kind] = (c.kinds[kind] || 0) + 1;
    ev.push({ type: 'crisis', kind: kind, n: c.n, left: max - c.n, id: q ? q.id : -1, x: q ? q.x : 2.5, y: q ? q.y : 0 });
    return true;
  }
  // 보스전 카드: 위기 기록 (종류마다 한 번, 보물방 근접은 분대마다 한 번). 이번 step 끝에 cardMoment가 봄
  function cardHit(S, kind, q) {
    var c = S.cards;
    if (!c || !c.on) return;
    var key = kind === 'treasure' && q ? 't' + q.id : kind;
    if (c.seen[key]) return;
    c.seen[key] = true;
    c.hits.push({ kind: kind, id: q ? q.id : -1, z: q ? q.zone : '' });
  }
  function crisisLeft(S) { return Math.max(0, (cardRule().maxPerBattle || 2) - (S.crisis ? S.crisis.n : 0)); }

  // ---------- 아군 퇴각 ----------
  function unitHp(S, id) {
    var mu = S.mu[id], s = 0;
    (S.dens[mu.z] || []).forEach(function (m) { if (m.id === id) s += Math.max(0, m.hp); });
    return s;
  }
  function retreatUnit(S, id, ev) {
    var mu = S.mu[id];
    if (!mu || mu.out) return;
    mu.out = true; mu.big = false;   // 데모 사망 없음: 큰 피해 판정 안 함
    if (mu.tmp) { var tr = cardTmpRec(S, id); if (tr) tr.out = true; }
    var down = 0;
    (S.dens[mu.z] || []).forEach(function (m) { if (m.id === id) { m.out = true; if (m.hp <= 0) down++; } });
    ev.push({ type: 'mretreat', z: mu.z, id: id, big: false, down: down, guard: mu.guard });
  }
  // 피해를 받은 뒤: 전체 체력 비율이 퇴각 기준 아래면 그 부대(친위대)는 빠진다
  function checkRetreat(S, id, ev) {
    var mu = S.mu[id];
    if (!mu || mu.out) return;
    if (unitHp(S, id) < mu.max * retreatRule().hpRatio) retreatUnit(S, id, ev);
  }

  // ---------- 조우 즉시 승패 ----------
  // 힘 = (산 쪽 체력 합 ÷ 받는 피해 배율) × 평균 공격. 침입자: 카드 공격 +·방어(받는 피해 -)·약화(받는 피해 +). 몬스터: 방어 · 카드 몬스터 공격 + · 기습(바로 앞이 함정)
  function invaderPower(S, q) {
    var a = aliveMem(q), hp = 0, atk = 0;
    a.forEach(function (m) { hp += Math.max(0, m.hp); atk += m.atk; });
    if (!a.length) return 0;
    var taken = Math.max(0.05, (1 - (S.fx.def || 0)) * (1 + S.mod.weak));
    return hp / taken * (atk / a.length) * (1 + (S.fx.atk || 0));
  }
  function monsterPower(S, q, mons) {
    var hp = 0, atk = 0;
    mons.forEach(function (m) { hp += m.hp / Math.max(0.05, 1 - Math.min(BD.DEF_MAX || 0.8, m.def || 0)); atk += m.atk; });
    if (!mons.length) return 0;
    var amb = kindOf(S, q.prevZone) === 'trap' ? BD.AMBUSH : 1;
    return hp * (atk / mons.length) * (1 + S.mod.monAtk) * amb;
  }
  function startClash(S, q, z, ev) {
    var C = clashRule(), mons = livingMon(S, z);
    var ip = invaderPower(S, q), mp = monsterPower(S, q, mons);
    var jm = 1 + (rand(S) * 2 - 1) * C.jitter, ji = 1 + (rand(S) * 2 - 1) * C.jitter;
    var win = mp * jm >= ip * ji;   // 몬스터 승
    var frac = Math.min(C.damageCap, C.damageK * (win ? ip / Math.max(1e-9, mp) : mp / Math.max(1e-9, ip)));
    S.fought[z] = true; S.clashes++;
    var tmpSeen = {};   // 임시 수비대가 실제로 싸움: 카드 기록에 교전·격퇴
    mons.forEach(function (m) {
      if (!m.tmp || tmpSeen[m.id]) return;
      tmpSeen[m.id] = true;
      var tr = cardTmpRec(S, m.id);
      if (tr) { tr.fights++; if (win) tr.repels++; tr.ids.push(q.id); }
    });
    if (win) {
      // 이긴 몬스터 피해: 지금 체력 합 × frac, 앞 개체부터
      var left = 0; mons.forEach(function (m) { left += m.hp; }); left *= frac;
      var hitIds = {};
      mons.forEach(function (m) {
        if (left <= 0) return;
        var d = Math.min(m.hp, left); m.hp -= d; m.lost += d; left -= d; hitIds[m.id] = true;
        if (S.mu[m.id]) S.mu[m.id].burst += d;
        if (m.hp <= 0) { m.hp = 0; ev.push({ type: 'mdown', z: z, id: m.id }); }
      });
      Object.keys(hitIds).forEach(function (id) { checkRetreat(S, id, ev); });
    } else {
      // 진 몬스터: 그 대기실 부대 모두 퇴각. 이긴 침입자 피해: 지금 체력 합 × frac, 앞사람부터 (쓰러지면 처치 보상)
      var ids = {}; mons.forEach(function (m) { ids[m.id] = true; });
      Object.keys(ids).forEach(function (id) { retreatUnit(S, id, ev); });
      var dmg = hpOf(q) * frac;
      while (dmg > 1e-9) {
        var f = front(q);
        if (!f) break;
        var d2 = Math.min(f.hp, dmg); f.hp -= d2; dmg -= d2;
        if (f.hp <= 1e-9) killMem(S, q, f, ev);
      }
    }
    if (q.state === 'dead') return;
    q.clash = { z: z, win: win, t: 0, ip: Math.round(ip), mp: Math.round(mp) };
    q.state = 'fight'; q.inspect = 0;
    ev.push({ type: 'clash', id: q.id, z: z, win: win, x: q.x, y: q.y, t: S.t });
  }
  function tickClash(S, q, dt, ev) {
    var C = clashRule(), c = q.clash;
    c.t += dt;
    if (c.t < C.encounter + C.outcome - 1e-9) return;
    q.clash = null;
    if (c.win) { endSquad(S, q, 'retreat', 'den', ev); return; }
    q.state = 'move';
    if (checkInvader(S, q, 'clash', ev)) return;
    q.depart = true;
  }

  function enterZone(S, q, z, ev) {
    q.prevZone = q.zone; q.zone = z;
    q.seen[z] = true;
    if (S.front.indexOf(z) >= 0) crisis(S, 'treasure', q, ev);
    var fd = fixedDef(S, z);
    if (fd && fd.slow) { q.chill = fd.span || 1; q.chillSlow = fd.slow; ev.push({ type: 'chill', id: q.id, z: z, x: q.x, y: q.y }); }
    else if (q.chill > 0) { q.chill--; if (!q.chill) q.chillSlow = 0; }
    if (q.prevZone === 'Y' && S.zones.Y === 'thorn') { ev.push({ type: 'thorn', x: q.x, y: q.y }); hurtAll(S, q, BD.THORN_DMG, ev); }
    if (q.state !== 'move') return;
    if (kindOf(S, z) === 'trap') {
      q.trapIn[z] = (q.trapIn[z] || 0) + 1;
      if (trapLive(S, q)) { q.trapT = BD.TRAP_EVERY; trapRoll(S, q, ev); }
    }
  }
  // 보물방 도달 (약탈). 안전장치도 이 길로 (분대 state 'reached', cause 'treasure')
  function reachSquad(S, q, ev) {
    q.state = 'reached'; q.cause = 'treasure'; q.endT = S.t; q.clash = null; S.reached++;
    var porters = aliveMem(q).filter(function (m) { return m.porter; }).length;
    var loot = BD.LOOT_BASE + porters * BD.LOOT_PER_PORTER;
    S.loot += loot;
    ev.push({ type: 'reach', id: q.id, x: q.x, y: q.y, loot: loot, porters: porters });
  }
  // 안전장치: 끝나지 않는 판(버그)을 끝냄. 남은 분대(계단 대기 포함) = 보물방 도달. 화면 사건은 reach만 (따로 알리지 않음)
  function safetyEnd(S, list, ev) {
    if (!list.length) return;
    S.safety = (S.safety | 0) + list.length;
    list.forEach(function (q) { reachSquad(S, q, ev); });
  }
  // 방 가운데 도착: 보물방 · 계단 · 대기실 조우 · 처음 방 조사
  function arriveAnchor(S, q, t, ev) {
    if (t.z === S.goal) {
      if (S.guard > 0) { S.guard--; endSquad(S, q, 'retreat', 'card', ev); ev.push({ type: 'guarded', id: q.id, x: q.x, y: q.y }); return; }
      reachSquad(S, q, ev);
      return;
    }
    if (Z.isStairs && Z.isStairs(t.z) && q.wps[q.wp] && q.wps[q.wp].stairs) { q.state = 'stairs'; ev.push({ type: 'stairs', id: q.id, z: t.z, x: q.x, y: q.y }); return; }
    if (kindOf(S, t.z) === 'den' && livingMon(S, t.z).length) { startClash(S, q, t.z, ev); return; }
    if (!q.insp[t.z]) { q.insp[t.z] = true; q.inspect = grid().inspect || 0; if (q.inspect > 0) ev.push({ type: 'inspect', id: q.id, z: t.z, x: q.x, y: q.y }); }
    q.depart = true;
  }
  function moveSquad(S, q, dt, ev) {
    if (q.inspect > 1e-9) { q.inspect = Math.max(0, q.inspect - dt); return; }
    if (q.depart) {   // 방을 떠나는 순간: 다음 방을 이미 가 봤거나 지금 방이 빈 대기실이면 빠르게
      q.depart = false;
      var nx = q.wps[q.wp];
      q.fast = !!(nx && (q.seen[nx.z] || (kindOf(S, q.zone) === 'den' && !livingMon(S, q.zone).length)));
    }
    var speed = BD.MOVE_SPEED * (1 + (S.fx.speed || 0)) * Math.max(0.1, 1 - S.mod.slow - (q.chill > 0 ? q.chillSlow || 0 : 0)) * (q.fast ? grid().speedBoost || 1 : 1);
    var left = speed * dt;
    while (left > 0 && q.state === 'move') {
      var t = q.wps[q.wp];
      if (!t) break;
      var d = dist(q, t), count = q.wp >= 2;
      if (d > left) { q.x += (t.x - q.x) / d * left; q.y += (t.y - q.y) / d * left; if (count) q.went += left; left = 0; break; }
      q.x = t.x; q.y = t.y; if (count) q.went += d; left -= d; q.wp++;
      if (t.door) { if (t.s > 0 && !t.stairs) q.passes++; enterZone(S, q, t.z, ev); if (q.state !== 'move') break; }
      if (t.anchor) { arriveAnchor(S, q, t, ev); if (q.state !== 'move' || q.inspect > 1e-9) break; }
    }
  }

  function step(S, dt) {
    var ev = [];
    if (S.done || S.pending || S.pick) return ev;   // S.pick = 카드 선택 대기 (전투 완전 정지)
    S.t += dt; S.floorT += dt;
    var entered = false;
    if (S.cards) S.cards.hits = [];
    if (S.freeze > 0) S.freeze -= dt;
    var decay = Math.exp(-dt / (retreatRule().burstWindow || 4));
    Object.keys(S.mu).forEach(function (id) { S.mu[id].burst *= decay; });
    // 분대 진입 (1층만): SQUAD_GAP초마다 하나씩
    if (S.floor === 1 && S.released < S.squads.length) {
      S.releaseT -= dt;
      if (S.releaseT <= 0) {
        var nq = S.squads[S.released++]; nq.state = 'move'; S.releaseT = BD.SQUAD_GAP; ev.push({ type: 'enter', id: nq.id });
        if (S.released === 1) entered = true;
        if (S.released === 1 && S.plan.surge) crisis(S, 'surge', null, ev);
        if (S.released === 1 && S.plan.boss) crisis(S, 'boss', null, ev);
      }
    }
    // 분대 번호 순 (동시 조우도 번호 순)
    S.squads.forEach(function (q) {
      if (q.state === 'fight' && q.clash) { tickClash(S, q, dt, ev); return; }
      if (q.state !== 'move' || S.freeze > 0) return;
      if (q.smoke > 0) {   // 연막 살포: 이 분대만 정지 (이동·함정 다시 굴리기 멈춤)
        q.smoke = Math.max(0, q.smoke - dt);
        if (q.smoke <= 1e-9) { q.smoke = 0; ev.push({ type: 'smokeEnd', id: q.id, x: q.x, y: q.y }); }
        return;
      }
      moveSquad(S, q, dt, ev);
      if (q.state === 'move' && trapLive(S, q)) {
        q.trapT -= dt;
        if (q.trapT <= 0) { q.trapT += BD.TRAP_EVERY; trapRoll(S, q, ev); }
      }
    });
    progress(S);
    var cr = cardRule(), inside = 0;
    S.squads.forEach(function (q) {
      if (q.state !== 'move' && q.state !== 'fight') return;
      inside++;
      if (cr.crisisProgress && prog(q) >= cr.crisisProgress) crisis(S, 'treasure', q, ev);
    });
    if (cr.massSquads && inside >= cr.massSquads) crisis(S, 'surge', null, ev);
    var active = S.squads.filter(isActive);
    // 시간 제한 없음. 안전장치(판 전체 SAFETY_LIMIT초)만: 남은 분대 = 보물방 도달
    if (S.t >= safetyLimit() - 1e-9 && active.length) { safetyEnd(S, active, ev); active = []; }
    if (!active.length) {
      var waiting = S.squads.filter(function (q) { return q.state === 'stairs'; });
      if (waiting.length && S.floor < S.open) { S.pending = S.floor + 1; ev.push({ type: 'floorEnd', n: S.floor, next: S.pending, waiting: waiting.length }); }
      else {
        safetyEnd(S, waiting, ev);   // 열리지 않은 층 계단에서 기다림 = 정상 길에서는 안 생김 (안전장치로 셈)
        S.done = true; ev.push({ type: 'end' });
      }
    }
    if (S.cards && S.cards.on && !S.done && !S.pending) cardMoment(S, entered, ev);
    if (S.cards) S.cards.hits = [];
    return ev;
  }
  // ---------- 보스전 카드: 기회 열기 · 후보 · 고르기 (API.md 18절) ----------
  // 이번 step에 첫 분대 진입이 있었으면 진입 기회 (같은 순간 위기는 합침), 아니면 위기가 있었을 때 위기 기회. 후보가 없으면 창 없이 기회 안 씀
  function cardMoment(S, entered, ev) {
    var c = S.cards, slot = '';
    if (entered && !c.enterSeen) { c.enterSeen = true; if (c.slots.enter > 0) slot = 'enter'; }
    else if (c.hits.length && c.enterSeen && c.slots.crisis > 0) slot = 'crisis';
    if (!slot) return;
    var cands = cardCands(S), kinds = c.hits.map(function (h) { return h.kind; });
    if (!cands.length) { c.missed.push({ slot: slot, at: Math.round(S.t * 100) / 100, kinds: kinds }); return; }
    S.pick = { n: c.used + 1, slot: slot, kinds: kinds, where: c.hits.slice(), at: Math.round(S.t * 100) / 100, floor: S.floor, sel: '', cands: cands };
    ev.push({ type: 'cardPick', n: S.pick.n, slot: slot, kinds: kinds, where: S.pick.where, cands: cands.map(function (x) { return x.id; }) });
  }
  function cardFloorCap(f) { var t = BD.FLOOR_CAP || {}; return t[f] || t[1] || 3; }
  // 지금 쓸 수 있는 카드 (BOSS_CARDS.list 순서). 대상: smoke = 이동 분대 ids · reserve = 빈 대기실 rooms[{ z }] · trigger = 함정 rooms[{ z, ids, dmg }]
  function cardCands(S) {
    var f = S.floor, out = [];
    var moving = S.squads.filter(function (q) { return q.state === 'move' && (q.floor || 1) === f; });
    (bossCards().list || []).forEach(function (d) {
      var c = { id: d.id, kind: d.kind, name: d.name, text: d.text, grade: d.grade || 1, target: d.target || 'auto' };
      if (d.id === 'smoke') {
        if (!moving.length) return;
        c.ids = moving.map(function (q) { return q.id; }); c.sec = d.sec || 3;
      } else if (d.id === 'reserve') {
        var u = S.cards.unit, used = 0;
        Object.keys(S.mu).forEach(function (id) { if (Z.floorOf(S.mu[id].z) === f) used++; });
        if (!u || used >= cardFloorCap(f)) return;
        c.rooms = Object.keys(S.zones).filter(function (z) { return z !== 'Y' && kindOf(S, z) === 'den' && Z.floorOf(z) === f && !(S.dens[z] && S.dens[z].length); }).sort()
          .map(function (z) { return { z: z }; });
        if (!c.rooms.length) return;
        c.count = u.count; c.unitName = u.name;
      } else if (d.id === 'trigger') {
        var rooms = {};
        moving.forEach(function (q) {
          if (q.zone === 'Y' || kindOf(S, q.zone) !== 'trap' || (q.trapIn[q.zone] || 0) > (grid().trapMax || 2)) return;
          (rooms[q.zone] = rooms[q.zone] || []).push(q.id);
        });
        c.rooms = Object.keys(rooms).sort().map(function (z) { return { z: z, ids: rooms[z], dmg: Z.trapDmgOf(z) }; });
        if (!c.rooms.length) return;
      } else return;
      out.push(c);
    });
    return out;
  }
  function cardTmpRec(S, id) { var c = S.cards, i = c && c.tmpAt ? c.tmpAt[id] : undefined; return typeof i === 'number' ? c.log[i] : null; }
  function pickCand(S, id) { return S.pick ? S.pick.cands.filter(function (c) { return c.id === id; })[0] || null : null; }
  function cardResolve(S) { var c = S.cards; if (c.slots[S.pick.slot] > 0) c.slots[S.pick.slot]--; c.used++; S.pick = null; }
  // 화면용: 선택 대기 정보 (없으면 null). 복사본이라 고쳐도 상태는 안 바뀜
  function pickInfo(S) {
    if (!S.pick) return null;
    var p = JSON.parse(JSON.stringify(S.pick)), B = bossCards();
    p.max = (B.enter | 0) + (B.crisis | 0); p.left = cardsLeft(S);
    return p;
  }
  // 남은 기회 (지금 열린 창 포함). 카드가 꺼진 전투 = 0
  function cardsLeft(S) {
    var c = S.cards;
    if (!c || !c.on) return 0;
    var e = c.enterSeen && !(S.pick && S.pick.slot === 'enter') ? 0 : c.slots.enter;
    return e + c.slots.crisis;
  }
  // 대상 고르기 시작 (방을 고르는 카드). 아무것도 적용 안 함, 저장 지점에 sel로 남음
  function pickSelect(S, id) {
    var c = pickCand(S, id);
    if (!c) return { ok: false, why: S.pick ? '지금 쓸 수 없는 카드예요' : '카드를 고를 때가 아니에요' };
    S.pick.sel = id;
    return { ok: true, card: JSON.parse(JSON.stringify(c)) };
  }
  // 대상 고르기 취소 -> 후보 선택으로 돌아감 (기회 그대로)
  function pickCancel(S) { if (!S.pick || !S.pick.sel) return false; S.pick.sel = ''; return true; }
  // 넘기기: 기회 1회 사용, 효과 없음
  function pickSkip(S) {
    if (!S.pick) return { ok: false, why: '카드를 고를 때가 아니에요', ev: [] };
    var p = S.pick;
    S.cards.log.push({ n: p.n, slot: p.slot, kinds: p.kinds, at: p.at, floor: p.floor, card: 'skip', name: '넘기기' });
    cardResolve(S);
    return { ok: true, ev: [{ type: 'card', card: 'skip', n: p.n }] };
  }
  // 카드 쓰기: id = 후보 id, z = 방(target 'room'일 때). 한 번 쓰면 S.pick이 없어져 두 번째 호출은 거절 (연타 중복 없음)
  function pickUse(S, id, z) {
    var c = pickCand(S, id), ev = [];
    if (!c) return { ok: false, why: S.pick ? '지금 쓸 수 없는 카드예요' : '카드를 고를 때가 아니에요', ev: ev };
    var room = null;
    if (c.target === 'room') {
      room = (c.rooms || []).filter(function (r) { return r.z === z; })[0];
      if (!room) return { ok: false, why: '이 방에는 쓸 수 없어요', ev: ev };
    }
    var p = S.pick, rec = { n: p.n, slot: p.slot, kinds: p.kinds, at: p.at, floor: p.floor, card: id, name: c.name, grade: c.grade };
    if (id === 'smoke') {
      var ids = [];
      S.squads.forEach(function (q) {
        if (c.ids.indexOf(q.id) < 0 || q.state !== 'move') return;
        q.smoke = Math.max(q.smoke || 0, c.sec); q.stopped = (q.stopped || 0) + c.sec; ids.push(q.id);
      });
      rec.ids = ids; rec.sec = c.sec;
      ev.push({ type: 'card', card: 'smoke', n: p.n, ids: ids, sec: c.sec });
    } else if (id === 'reserve') {
      var u = S.cards.unit, uid = 'tmp' + (++S.cards.tmp), list = [];
      for (var i = 0; i < u.count; i++) list.push({ id: uid, n: i, name: u.name, hp: u.hp, max: u.hp, atk: u.atk, def: u.def, guard: false, lost: 0, out: false, tmp: true });
      S.dens[z] = list;
      S.mu[uid] = { z: z, max: u.hp * u.count, burst: 0, out: false, big: false, guard: false, tmp: true };
      rec.z = z; rec.unit = uid; rec.unitName = u.name; rec.count = u.count; rec.fights = 0; rec.repels = 0; rec.out = false; rec.ids = [];
      S.cards.tmpAt[uid] = S.cards.log.length;
      ev.push({ type: 'card', card: 'reserve', n: p.n, z: z, unit: uid, count: u.count });
    } else if (id === 'trigger') {
      var dmg = Z.trapDmgOf(z), hit = [], lost = 0, back = 0, head = { type: 'card', card: 'trigger', n: p.n, z: z, dmg: dmg };
      ev.push(head);
      S.squads.forEach(function (q) {
        if (room.ids.indexOf(q.id) < 0 || q.state !== 'move' || q.zone !== z) return;
        var hp0 = hpOf(q);
        q.cause = 'card';
        hurtAll(S, q, dmg, ev);
        var l = hp0 - hpOf(q); q.cardDmg = (q.cardDmg || 0) + l; lost += l; hit.push(q.id);
        if (q.state === 'dead' || checkInvader(S, q, 'card', ev)) back++;
      });
      rec.z = z; rec.dmg = dmg; rec.ids = hit; rec.lost = Math.round(lost); rec.retreats = back;
      head.ids = hit; head.lost = rec.lost; head.retreats = back;
    }
    S.cards.log.push(rec);
    cardResolve(S);
    return { ok: true, ev: ev, rec: JSON.parse(JSON.stringify(rec)) };
  }
  // 층별 차례 전투: floorEnd 사건 뒤 화면이 알림을 보여 주고 부른다. 계단에 있던 분대가 다음 층 탐험을 시작
  function nextFloor(S) {
    var ev = [];
    if (!S.pending) return ev;
    S.floor = S.pending; S.pending = 0; S.floorT = 0;
    S.squads.forEach(function (q) { q.smoke = 0; });   // 카드 효과는 그 층에서만 (연막은 층이 끝나면 없앰)
    S.squads.forEach(function (q) { if (q.state === 'stairs') { q.state = 'move'; q.floor = S.floor; q.depart = true; } });
    ev.push({ type: 'floorStart', n: S.floor });
    return ev;
  }
  // 지난 시간(초, 판 전체). 화면 시간 표시용 (제한 없음)
  function elapsed(S) { return Math.max(0, S.t || 0); }

  function applyCard(S, side) {
    var ev = [];
    switch (side.kind) {
      case 'trapDmg': case 'trapRate': case 'monAtk': case 'slow': case 'weak': S.mod[side.kind] += side.v; break;
      case 'revive':
        Object.keys(S.dens).forEach(function (z) { S.dens[z].forEach(function (m) { if (m.hp < m.max || m.out) { m.hp = m.max; m.out = false; ev.push({ type: 'revive', z: z, id: m.id }); } }); });
        Object.keys(S.mu).forEach(function (id) { var mu = S.mu[id]; mu.out = false; mu.big = false; mu.burst = 0; });
        break;
      case 'quake':
        S.squads.forEach(function (q) {
          if (q.state !== 'move' && q.state !== 'fight') return;
          q.cause = 'card';
          q.mem.forEach(function (m) { if (m.alive) hurt(S, q, m, m.max * side.v / ((1 - (S.fx.def || 0)) * (1 + S.mod.weak)), ev); });
          if (q.state === 'move') checkInvader(S, q, 'card', ev);
        });
        break;
      case 'guard': S.guard++; break;
      case 'freeze': S.freeze = Math.max(S.freeze, side.v); break;
    }
    return ev;
  }

  function result(S) {
    var damage = 0, deployed = [], fought = [];
    Object.keys(S.dens).forEach(function (z) {
      S.dens[z].forEach(function (m) {
        if (m.tmp) return;   // 임시 수비대(카드)는 영구 부대가 아님: 경험치·쉼·수리에 안 셈
        damage += m.lost;
        if (deployed.indexOf(m.id) < 0) deployed.push(m.id);
        if (S.fought && S.fought[z] && fought.indexOf(m.id) < 0) fought.push(m.id);
      });
    });
    var monRetreat = [], monDown = {};
    Object.keys(S.mu || {}).forEach(function (id) {
      var mu = S.mu[id];
      if (mu.tmp) return;
      var down = 0; (S.dens[mu.z] || []).forEach(function (m) { if (m.id === id && m.hp <= 0) down++; });
      if (down) monDown[id] = down;
      if (mu.out) monRetreat.push({ id: id, big: false, down: down, guard: !!mu.guard });
    });
    var tl = S.tally || {}, trapDmg = 0;
    S.squads.forEach(function (q) { trapDmg += q.trapDmg || 0; });
    return {
      kills: S.gain.kills, porterKills: S.gain.porterKills, total: S.total, squads: S.squads.length,
      gold: S.gain.gold, gems: S.gain.gems, exp: S.gain.exp, reached: S.reached, retreated: S.retreated,
      safety: S.safety | 0, loot: S.loot, damage: damage, time: S.t, deployed: deployed, fought: fought,
      monRetreat: monRetreat, monDown: monDown, crises: S.crisis ? S.crisis.n : 0,
      // 3차: 결과 요약 한 줄용 (함정으로 퇴각·전멸한 분대, 대기실에서 격퇴한 분대 ...) · 분대별 결과
      trapRetreats: tl.trap || 0, denRepels: tl.den || 0, clashRetreats: tl.clash || 0, clashes: S.clashes || 0,
      squadResults: S.squads.map(function (q) { return { id: q.id, habit: q.habit, state: q.state, cause: q.cause, passes: q.passes, time: Math.round((q.endT || S.t) * 100) / 100,
        grade: q.grade, rooms: Object.keys(q.seen || {}).length, last: q.zone, trapDmg: Math.round(q.trapDmg || 0), hpLeft: Math.round(hpOf(q) / (q.maxHp || 1) * 100),
        cardDmg: Math.round(q.cardDmg || 0), stopped: q.stopped || 0 }; }),
      cards: cardResult(S),   // 보스전 카드 기록 (API.md 18절)
      trapDmg: Math.round(trapDmg)   // 흐름 시험: 함정이 침입자에게 준 피해 합 · squadResults[].rooms(지난 방 수)·last(끝난 방)·trapDmg·hpLeft(남은 체력 %)
    };
  }
  function cardResult(S) {
    var c = S.cards || freshCards(false, null);
    return { on: !!c.on, used: c.used | 0, left: cardsLeft(S), log: JSON.parse(JSON.stringify(c.log || [])), missed: (c.missed || []).length };
  }
  var REFS = { plan: 1, zones: 1, units: 1, doors: 1, icard: 1, fx: 1 };
  function snapshot(S) {
    var o = {};
    Object.keys(S).forEach(function (k) { if (!REFS[k]) o[k] = S[k]; });
    return JSON.parse(JSON.stringify(o));
  }
  // o = create와 같은 { plan, zones, units, unitById, goal, doors }. snap이 이상하면 null (그러면 처음부터)
  function restore(o, snap) {
    if (!snap || typeof snap.t !== 'number' || typeof snap.rs !== 'number' || !snap.squads || !snap.dens || !snap.mod || !snap.gain) return null;
    var S = JSON.parse(JSON.stringify(snap));
    if (!S.fought || typeof S.fought !== 'object') S.fought = {};
    if (!S.mu || typeof S.mu !== 'object') S.mu = {};
    if (!S.crisis || typeof S.crisis !== 'object') S.crisis = { n: 0, kinds: {}, sq: {} };
    if (!S.tally || typeof S.tally !== 'object') S.tally = { trap: 0, den: 0, clash: 0, card: 0 };
    // 옛 시간 제한 칸 (결정 C 전 저장 지점): 읽고 버림. 이미 끝난 분대의 cause 'timeout'은 그대로 둠 (퇴각으로 셈)
    delete S.timeout; delete S.tally.timeout;
    if (typeof S.safety !== 'number') S.safety = 0;
    if (typeof S.floor !== 'number') S.floor = 1;
    if (typeof S.floorT !== 'number') S.floorT = S.t;
    if (typeof S.pending !== 'number') S.pending = 0;
    if (typeof S.open !== 'number') S.open = Z.OPEN || 1;
    if (typeof S.goal !== 'string') S.goal = o.goal || (Z.goal ? Z.goal() : 'B');
    S.plan = o.plan; S.zones = o.zones; S.units = o.units; S.doors = doorsOf(o); S.icard = cardById(o.plan.card); S.fx = mergeFx(o.plan);
    if (!Array.isArray(S.front)) S.front = Z.bossFront ? Z.bossFront(S.doors) : [];
    // 강화 칸 없는 옛 저장 지점: 지금 입력으로 채움 (전투 중엔 강화를 못 바꿔 전투 시작 때와 같음. 대기실 체력은 저장된 값 그대로라 다시 곱하지 않음)
    if (!S.up || typeof S.up !== 'object' || !S.up.trap || !S.up.den) S.up = upOf(o);
    // 카드 칸 없는 옛 저장 지점 = 그 전투는 카드 없이 (종전 규칙으로 마침)
    if (!S.cards || typeof S.cards !== 'object' || !S.cards.slots) S.cards = freshCards(false, null);
    ['hits', 'log', 'missed'].forEach(function (k) { if (!Array.isArray(S.cards[k])) S.cards[k] = []; });
    if (!S.cards.seen || typeof S.cards.seen !== 'object') S.cards.seen = {};
    if (!S.cards.tmpAt || typeof S.cards.tmpAt !== 'object') S.cards.tmpAt = {};
    if (!S.pick || typeof S.pick !== 'object' || !Array.isArray(S.pick.cands)) S.pick = null;
    S.squads.forEach(function (q) { if (typeof q.smoke !== 'number') q.smoke = 0; if (typeof q.stopped !== 'number') q.stopped = 0; if (typeof q.cardDmg !== 'number') q.cardDmg = 0; });
    return S;
  }
  function squadInfo(q) { var a = aliveMem(q); return { alive: a.length, porters: a.filter(function (m) { return m.porter; }).length }; }

  window.BSIM = { create: create, snapshot: snapshot, restore: restore, step: step, applyCard: applyCard, progress: progress, result: result, squadInfo: squadInfo, cardById: cardById, attrById: attrById, livingMon: livingMon,
    crisisLeft: crisisLeft, nextFloor: nextFloor, elapsed: elapsed,
    // 보스전 카드 (API.md 18절)
    pickInfo: pickInfo, pickSelect: pickSelect, pickCancel: pickCancel, pickUse: pickUse, pickSkip: pickSkip, cardsLeft: cardsLeft, cardDef: cardDef };
})();
