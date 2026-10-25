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
 *    · 침입자 분대 체력 합이 처음의 CLASH.invaderRetreat 아래면 퇴각 (함정만으로도. 사건 iretreat { cause: 'trap'|'den'|'clash'|'card'|'timeout' })
 *    · 퇴각·시간 초과는 방어 성공 (보물방 도달만 실패). 사망 판정 없음 (몬스터 퇴각은 늘 big: false)
 *    · 위기 카드는 전투 수치 카드(monAtk 몬스터 공격·weak 침입자 받는 피해)만 승패 힘에 더함. 함정·이동 카드는 원래 뜻
 *    · 층별 차례 전투 (12절 9-4, 구조만): 분대는 계단(위층 B)에 닿으면 멈춤(state 'stairs'). 그 층 분대가 모두 퇴각·계단·시간 초과가 되면
 *      다음 층이 열려 있고 계단에 분대가 있을 때 사건 floorEnd { n, next, waiting } -> 화면이 알림 뒤 nextFloor(S)를 부르면 다음 층 전투 (시간 GRID.nextFloorTime)
 *  - 1층은 TIME_LIMIT초. 지나면 남은 분대는 퇴각 (보물방 침입으로 치지 않음)
 *  - 무작위는 plan.seed로 만든 시드 무작위만 (게임용, 상태 S.rs). 연출용 무작위는 쓰지 않는다
 *  - snapshot(S): 저장용 순수 데이터 (plan·zones·units·doors·icard·fx 참조는 뺌). restore(o, snap): create와 같은 o로 S를 되살림
 *  - 침입자 강함: 레벨(plan.groups[].lv) × 던전 가치 배율(plan.power). 던전 속성(plan.attr) fx는 침입자 카드 fx에 더함
 *  - 고정 구역 '얼어붙은 하역장'(kind fixed, FIXED_ZONES slow·span): 지나간 분대는 span 방 동안 느려짐 (q.chill, 사건 chill)
 *  - 카드 위기: 사건 'crisis' { kind: surge|treasure|boss, n, left } 전투당 최대 CARD_RULE.maxPerBattle (S.crisis에 저장)
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
  function grid() { return BD.GRID || { inspect: 0.6, speedBoost: 1.5, trapMax: 2, nextFloorTime: 30 }; }
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

  function create(o) {
    var plan = o.plan, zones = o.zones, units = o.units, doors = doorsOf(o);
    var S = {
      plan: plan, zones: zones, units: units, doors: doors, rs: plan.seed | 0, t: 0, released: 0, releaseT: 0,
      icard: cardById(plan.card), fx: mergeFx(plan), squads: [], dens: {}, fought: {}, guard: 0, freeze: 0, done: false, timeout: false, maxProg: 0,
      mod: { trapDmg: 0, trapRate: 0, monAtk: 0, slow: 0, weak: 0 },
      gain: { gold: 0, gems: 0, exp: 0, kills: 0, porterKills: 0 }, reached: 0, retreated: 0, loot: 0, total: 0,
      goal: o.goal || (Z.goal ? Z.goal() : 'B'), front: [], mu: {}, crisis: { n: 0, kinds: {}, sq: {} },
      floor: 1, floorT: 0, pending: 0, open: Z.OPEN || 1, tally: { trap: 0, den: 0, clash: 0, card: 0, timeout: 0 }, clashes: 0,
      up: upOf(o)
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
      q.clash = null; q.floor = 1; q.cause = ''; q.endT = 0;
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
    hurtAll(S, q, dmg, ev);
    checkInvader(S, q, 'trap', ev);
  }
  function trapLive(S, q) { return kindOf(S, q.zone) === 'trap' && (q.trapIn[q.zone] || 0) <= (grid().trapMax || 2); }
  function livingMon(S, z) { return (S.dens[z] || []).filter(function (m) { return m.hp > 0 && !m.out; }); }

  // ---------- 위기 감지 (이벤트 카드 B안) ----------
  function crisis(S, kind, q, ev) {
    var max = cardRule().maxPerBattle || 2, c = S.crisis;
    if (c.n >= max) return false;
    if (kind === 'treasure') { if (c.sq[q.id]) return false; c.sq[q.id] = true; }
    else if (c.kinds[kind]) return false;
    c.n++; c.kinds[kind] = (c.kinds[kind] || 0) + 1;
    ev.push({ type: 'crisis', kind: kind, n: c.n, left: max - c.n, id: q ? q.id : -1, x: q ? q.x : 2.5, y: q ? q.y : 0 });
    return true;
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
  // 방 가운데 도착: 보물방 · 계단 · 대기실 조우 · 처음 방 조사
  function arriveAnchor(S, q, t, ev) {
    if (t.z === S.goal) {
      if (S.guard > 0) { S.guard--; endSquad(S, q, 'retreat', 'card', ev); ev.push({ type: 'guarded', id: q.id, x: q.x, y: q.y }); return; }
      q.state = 'reached'; q.cause = 'treasure'; q.endT = S.t; S.reached++;
      var porters = aliveMem(q).filter(function (m) { return m.porter; }).length;
      var loot = BD.LOOT_BASE + porters * BD.LOOT_PER_PORTER;
      S.loot += loot;
      ev.push({ type: 'reach', id: q.id, x: q.x, y: q.y, loot: loot, porters: porters });
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
    if (S.done || S.pending) return ev;
    S.t += dt; S.floorT += dt;
    if (S.freeze > 0) S.freeze -= dt;
    var decay = Math.exp(-dt / (retreatRule().burstWindow || 4));
    Object.keys(S.mu).forEach(function (id) { S.mu[id].burst *= decay; });
    // 분대 진입 (1층만): SQUAD_GAP초마다 하나씩
    if (S.floor === 1 && S.released < S.squads.length) {
      S.releaseT -= dt;
      if (S.releaseT <= 0) {
        var nq = S.squads[S.released++]; nq.state = 'move'; S.releaseT = BD.SQUAD_GAP; ev.push({ type: 'enter', id: nq.id });
        if (S.released === 1 && S.plan.surge) crisis(S, 'surge', null, ev);
        if (S.released === 1 && S.plan.boss) crisis(S, 'boss', null, ev);
      }
    }
    // 분대 번호 순 (동시 조우도 번호 순)
    S.squads.forEach(function (q) {
      if (q.state === 'fight' && q.clash) { tickClash(S, q, dt, ev); return; }
      if (q.state !== 'move' || S.freeze > 0) return;
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
    var limit = S.floor === 1 ? BD.TIME_LIMIT : (grid().nextFloorTime || BD.TIME_LIMIT);
    if (S.floorT >= limit - 1e-9 && active.length) {
      // 이미 몬스터에게 진 분대(조우 말풍선 중)는 격퇴로 침
      active.forEach(function (q) { endSquad(S, q, 'retreat', q.clash && q.clash.win ? 'den' : 'timeout', ev); });
      S.timeout = true;
      ev.push({ type: 'timeout', n: active.length, floor: S.floor });
      active = [];
    }
    if (!active.length) {
      var waiting = S.squads.filter(function (q) { return q.state === 'stairs'; });
      if (waiting.length && S.floor < S.open) { S.pending = S.floor + 1; ev.push({ type: 'floorEnd', n: S.floor, next: S.pending, waiting: waiting.length }); }
      else {
        waiting.forEach(function (q) { endSquad(S, q, 'retreat', 'timeout', ev); });
        S.done = true; ev.push({ type: 'end' });
      }
    }
    return ev;
  }
  // 층별 차례 전투: floorEnd 사건 뒤 화면이 알림을 보여 주고 부른다. 계단에 있던 분대가 다음 층 탐험을 시작
  function nextFloor(S) {
    var ev = [];
    if (!S.pending) return ev;
    S.floor = S.pending; S.pending = 0; S.floorT = 0;
    S.squads.forEach(function (q) { if (q.state === 'stairs') { q.state = 'move'; q.floor = S.floor; q.depart = true; } });
    ev.push({ type: 'floorStart', n: S.floor });
    return ev;
  }
  // 이번 층 남은 시간(초)
  function timeLeft(S) { var limit = S.floor === 1 ? BD.TIME_LIMIT : (grid().nextFloorTime || BD.TIME_LIMIT); return Math.max(0, limit - S.floorT); }

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
        damage += m.lost;
        if (deployed.indexOf(m.id) < 0) deployed.push(m.id);
        if (S.fought && S.fought[z] && fought.indexOf(m.id) < 0) fought.push(m.id);
      });
    });
    var monRetreat = [], monDown = {};
    Object.keys(S.mu || {}).forEach(function (id) {
      var mu = S.mu[id];
      var down = 0; (S.dens[mu.z] || []).forEach(function (m) { if (m.id === id && m.hp <= 0) down++; });
      if (down) monDown[id] = down;
      if (mu.out) monRetreat.push({ id: id, big: false, down: down, guard: !!mu.guard });
    });
    var tl = S.tally || {};
    return {
      kills: S.gain.kills, porterKills: S.gain.porterKills, total: S.total, squads: S.squads.length,
      gold: S.gain.gold, gems: S.gain.gems, exp: S.gain.exp, reached: S.reached, retreated: S.retreated,
      timeout: S.timeout, loot: S.loot, damage: damage, time: S.t, deployed: deployed, fought: fought,
      monRetreat: monRetreat, monDown: monDown, crises: S.crisis ? S.crisis.n : 0,
      // 3차: 결과 요약 한 줄용 (함정으로 퇴각·전멸한 분대, 대기실에서 격퇴한 분대 ...) · 분대별 결과
      trapRetreats: tl.trap || 0, denRepels: tl.den || 0, clashRetreats: tl.clash || 0, timeouts: tl.timeout || 0, clashes: S.clashes || 0,
      squadResults: S.squads.map(function (q) { return { id: q.id, habit: q.habit, state: q.state, cause: q.cause, passes: q.passes, time: Math.round((q.endT || S.t) * 100) / 100 }; })
    };
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
    if (!S.tally || typeof S.tally !== 'object') S.tally = { trap: 0, den: 0, clash: 0, card: 0, timeout: 0 };
    if (typeof S.floor !== 'number') S.floor = 1;
    if (typeof S.floorT !== 'number') S.floorT = S.t;
    if (typeof S.pending !== 'number') S.pending = 0;
    if (typeof S.open !== 'number') S.open = Z.OPEN || 1;
    if (typeof S.goal !== 'string') S.goal = o.goal || (Z.goal ? Z.goal() : 'B');
    S.plan = o.plan; S.zones = o.zones; S.units = o.units; S.doors = doorsOf(o); S.icard = cardById(o.plan.card); S.fx = mergeFx(o.plan);
    if (!Array.isArray(S.front)) S.front = Z.bossFront ? Z.bossFront(S.doors) : [];
    // 강화 칸 없는 옛 저장 지점: 지금 입력으로 채움 (전투 중엔 강화를 못 바꿔 전투 시작 때와 같음. 대기실 체력은 저장된 값 그대로라 다시 곱하지 않음)
    if (!S.up || typeof S.up !== 'object' || !S.up.trap || !S.up.den) S.up = upOf(o);
    return S;
  }
  function squadInfo(q) { var a = aliveMem(q); return { alive: a.length, porters: a.filter(function (m) { return m.porter; }).length }; }

  window.BSIM = { create: create, snapshot: snapshot, restore: restore, step: step, applyCard: applyCard, progress: progress, result: result, squadInfo: squadInfo, cardById: cardById, attrById: attrById, livingMon: livingMon,
    crisisLeft: crisisLeft, nextFloor: nextFloor, timeLeft: timeLeft };
})();
