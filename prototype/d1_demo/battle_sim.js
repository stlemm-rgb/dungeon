/* D1 전투 계산 (C1 battle_sim.js에서 이어 옴. 화면 그리기 없음). 숫자는 battle_data.js, 판·길 규칙은 zones.js
 *
 *  - create(o): o = { plan(progress.js의 이번 주 계획), zones, units(대기실 부대 id 목록), unitById } -> 전투 상태 S
 *    unitById(id) -> { kind: 'squad'|'guard', name, count(인원), hp·atk·def(1명 능력치, progress.js statOf) }. 옛 이름 monById도 받음
 *    D1: 대기실에는 부대 인원 수만큼 싸우는 개체가 생긴다(각 1명 능력치). 방어(def) = 받는 피해 감소 비율
 *  - 고정 구역 '얼어붙은 하역장'(kind fixed, BATTLE_DATA.FIXED_ZONES slow·span): 지나간 분대는 span 구역 동안 이동이 느려짐 (q.chill)
 *  - result(S)에 deployed(대기실에 든 부대 id) · fought(실제로 싸운 대기실의 부대 id) 추가 -> progress.js 참여 경험치
 *  - step(S, dt): 게임 시간 dt초 진행. 일어난 일 목록(events)을 돌려준다 (화면이 연출에 씀)
 *  - applyCard(S, side): 이벤트 카드 한 방향 효과. 대부분 전투 끝까지(S.mod에 쌓임), once는 그 자리에서 한 번
 *  - progress(S): 가장 앞선 분대가 보물방까지 간 거리(%). result(S): 결과 (progress.js applyBattle에 넘김)
 *  - 분대 = 10명. 길은 ZONES.routeOf (갈림길에서 번갈아 나뉨, 미끼 쪽으로 몰림, 몬스터 든 대기실은 피함, 함정은 모르고 들어감)
 *  - 함정 구역: 들어설 때와 그 안에 있는 동안 TRAP_EVERY초마다 발동을 굴림 (확률 = TRAP_CHANCE + 카드 - 침입자 카드)
 *  - 몬스터 대기실: 산 몬스터가 있으면 분대가 멈추고 싸움. 바로 앞 구역이 함정이면 몬스터 피해 ×AMBUSH
 *  - 1분(TIME_LIMIT) 지나면 남은 분대는 퇴각 (보물방 침입으로 치지 않음)
 *  - 무작위는 plan.seed로 만든 시드 무작위만 (게임용). 연출용 무작위는 쓰지 않는다.
 *    무작위 상태(S.rs)도 S 안에 숫자로 들고 있어서 S를 통째로 저장·복원할 수 있다.
 *  - snapshot(S): 저장용 순수 데이터 (plan·zones·units·icard·fx 참조는 뺌). restore(o, snap): create와 같은 o로 S를 되살림.
 *    카드를 고른 순간이 저장 지점 (battle.js가 progress.js saveBattle로 RUN에 넣음)
 *  - 침입자 강함: 레벨(plan.groups[].lv) × 던전 가치 배율(plan.power). 둘 다 progress.js가 전투 시작 때 확정
 *  - 연구실 함정 피해(plan.trapBoost, progress.js 공방): 함정 피해 × (1 + 카드 trapDmg + trapBoost). 계획에 들어 있어 복원해도 같다
 *  - 던전 속성(plan.attr = battle_data.js ATTRS id): 그 fx를 침입자 카드 fx에 더해 S.fx로 쓴다 (저장하지 않고 늘 다시 계산)
 *  - 2차: 보물방 = o.goal (2층이 열리면 '2B', 길은 1층 -> 계단 B -> 2층). 아군 퇴각: 부대 체력 비율이 RETREAT.hpRatio 아래면 빠짐 (사건 'mretreat',
 *    m.out = true), 큰 피해(최근 burstWindow초 피해 ≥ bigShare)였는지 기록 -> result.monRetreat·monDown. 사망·쉼은 progress.js가 정함.
 *    카드 위기: 사건 'crisis' { kind: surge|treasure|boss, n, left } 전투당 최대 CARD_RULE.maxPerBattle (S.crisis에 저장 -> 배속·복원 같음)
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
  // 침입자 카드 fx + 던전 속성 fx (같은 칸은 더함. 함정 발동 감소는 0.95까지)
  function mergeFx(plan) {
    var fx = {}, a = attrById(plan.attr);
    [cardById(plan.card).fx, a ? a.fx : {}].forEach(function (f) { Object.keys(f).forEach(function (k) { fx[k] = (fx[k] || 0) + f[k]; }); });
    if (fx.trap) fx.trap = Math.min(0.95, fx.trap);
    return fx;
  }
  function kindOf(S, z) { var f = z === 'Y' ? null : Z.FAC[S.zones[z]]; return f ? f.kind : 'none'; }
  function fixedDef(S, z) { var f = z === 'Y' ? null : Z.FAC[S.zones[z]]; return f && f.fixedId ? (BD.FIXED_ZONES || {})[f.fixedId] || null : null; }
  function cardRule() { return BD.CARD_RULE || { maxPerBattle: 2, crisisProgress: 85, massSquads: 3 }; }
  function retreatRule() { return BD.RETREAT || { hpRatio: 0.35, burstWindow: 4, bigShare: 0.4 }; }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  function create(o) {
    var plan = o.plan, zones = o.zones, units = o.units;
    var S = {
      plan: plan, zones: zones, units: units, rs: plan.seed | 0, t: 0, released: 0, releaseT: 0,
      icard: cardById(plan.card), fx: mergeFx(plan), squads: [], dens: {}, fought: {}, guard: 0, freeze: 0, done: false, timeout: false, maxProg: 0,
      mod: { trapDmg: 0, trapRate: 0, monAtk: 0, slow: 0, weak: 0 },
      gain: { gold: 0, gems: 0, exp: 0, kills: 0, porterKills: 0 }, reached: 0, retreated: 0, loot: 0, total: 0,
      goal: o.goal || (Z.goal ? Z.goal() : 'B'), front: [], mu: {}, crisis: { n: 0, kinds: {}, sq: {} }
    };
    S.front = Z.bossFront ? Z.bossFront() : [];
    // 대기실 부대 (전투 안에서만 쓰는 복사본). 부대 하나 = 인원 수만큼의 개체 (n = 몇 번째 사람). out = 퇴각해서 빠짐
    //  S.mu[부대 id] = { z, max(부대 전체 체력), burst(최근 받은 피해, 시간에 따라 줄어듦), out(퇴각), big(큰 피해로 퇴각), guard }
    var getU = o.unitById || o.monById;
    Object.keys(units).forEach(function (z) {
      if (!Z.FAC[zones[z]] || Z.FAC[zones[z]].kind !== 'den') return;
      var list = [];
      units[z].forEach(function (id) {
        var u = getU ? getU(id) : null;
        if (!u || S.mu[id]) return;
        var n = Math.max(1, (u.count === undefined ? 1 : u.count) | 0);
        for (var i = 0; i < n; i++) list.push({ id: id, n: i, name: u.name, hp: u.hp, max: u.hp, atk: u.atk, def: u.def || 0, guard: u.kind === 'guard', lost: 0, out: false });
        S.mu[id] = { z: z, max: u.hp * n, burst: 0, out: false, big: false, guard: u.kind === 'guard' };
      });
      S.dens[z] = list;
    });
    // 분대 만들기: 무리 순서(등급 낮은 무리부터)대로. 대기 장소(야외)에 한 줄로 선다
    var turn = {}, all = [];
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
      var route = Z.routeOf(zones, units, turn);
      var home = { x: n > 1 ? 1.1 + 2.8 * i / (n - 1) : 2.5, y: -0.3 };
      var wps = [{ x: home.x, y: home.y, z: 'Y' }], prev = 'Y';
      route.forEach(function (z) {
        var d = Z.doorOf(prev, z), a = Z.anchorOf(z);
        wps.push({ x: d.x, y: d.y, z: z, door: true });
        wps.push({ x: a.x, y: a.y, z: z, anchor: true });
        prev = z;
      });
      var len = 0; // 진행도는 입구 문부터 보물방까지 (대기 장소에서 걷는 거리는 빼고)
      for (var w = 2; w < wps.length; w++) len += dist(wps[w - 1], wps[w]);
      q.id = i; q.route = route; q.wps = wps; q.wp = 1; q.x = home.x; q.y = home.y; q.home = home;
      q.len = len; q.went = 0; q.state = 'wait'; q.zone = 'Y'; q.prevZone = 'Y'; q.trapT = 0; q.chill = 0; q.chillSlow = 0;
      S.total += q.mem.length;
    });
    S.squads = all;
    return S;
  }

  function aliveMem(q) { return q.mem.filter(function (m) { return m.alive; }); }
  function prog(q) { return q.state === 'reached' ? 100 : Math.min(100, q.went / q.len * 100); }
  function progress(S) {
    S.squads.forEach(function (q) { if (q.state !== 'wait') S.maxProg = Math.max(S.maxProg, prog(q)); });
    return S.maxProg;
  }

  // 침입자 한 명에게 피해. 죽으면 보상을 쌓고 true
  function hurt(S, q, m, dmg, ev) {
    if (!m.alive) return false;
    var d = dmg * (1 - (S.fx.def || 0)) * (1 + S.mod.weak);
    m.hp -= d;
    if (m.hp > 0) return false;
    m.alive = false;
    var st = BD.GRADE_STAT[q.grade], gm = m.porter ? BD.PORTER.goldMul : 1;
    S.gain.gold += st.gold * gm; S.gain.gems += st.gem; S.gain.exp += st.exp; S.gain.kills++;
    if (m.porter) S.gain.porterKills++;
    ev.push({ type: 'kill', x: q.x, y: q.y, porter: m.porter, gold: st.gold * gm });
    if (!aliveMem(q).length) { q.state = 'dead'; ev.push({ type: 'wipe', id: q.id, x: q.x, y: q.y }); }
    return true;
  }
  function hurtAll(S, q, dmg, ev) { q.mem.forEach(function (m) { hurt(S, q, m, dmg, ev); }); }
  function front(q) { for (var i = q.mem.length - 1; i >= 0; i--) { if (q.mem[i].alive) return q.mem[i]; } return null; } // 짐꾼은 뒤에

  function trapRoll(S, q, ev) {
    var chance = (BD.TRAP_CHANCE + S.mod.trapRate) * (1 - (S.fx.trap || 0));
    if (rand(S) >= chance) { ev.push({ type: 'trapMiss', z: q.zone, x: q.x, y: q.y }); return; }
    var dmg = Z.trapDmgOf(q.zone) * (1 + S.mod.trapDmg + (S.plan.trapBoost || 0));
    ev.push({ type: 'trap', z: q.zone, x: q.x, y: q.y, dmg: Math.round(dmg) });
    hurtAll(S, q, dmg, ev);
  }
  function livingMon(S, z) { return (S.dens[z] || []).filter(function (m) { return m.hp > 0 && !m.out; }); }

  // ---------- 위기 감지 (이벤트 카드 B안) ----------
  // 위기 하나 = 사건 { type:'crisis', kind, n(이번 전투 몇 번째), left(남은 장 수), id(분대, 없으면 -1), x, y }. 전투 한 번에 최대 maxPerBattle.
  //  surge·boss는 전투마다 한 번, treasure는 분대마다 한 번. 횟수는 S.crisis에 있어 저장·복원·배속과 상관없이 같다
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
  // 부대 id의 남은 체력 합
  function unitHp(S, id) {
    var mu = S.mu[id], s = 0;
    (S.dens[mu.z] || []).forEach(function (m) { if (m.id === id) s += Math.max(0, m.hp); });
    return s;
  }
  // 피해를 받은 뒤: 전체 체력 비율이 퇴각 기준 아래면 그 부대(친위대)는 빠진다. 큰 피해(최근 피해가 크면)였는지 기록
  function checkRetreat(S, id, ev) {
    var mu = S.mu[id], R = retreatRule();
    if (!mu || mu.out) return;
    if (unitHp(S, id) >= mu.max * R.hpRatio) return;
    mu.out = true; mu.big = mu.burst >= mu.max * R.bigShare;
    var down = 0;
    (S.dens[mu.z] || []).forEach(function (m) { if (m.id === id) { m.out = true; if (m.hp <= 0) down++; } });
    ev.push({ type: 'mretreat', z: mu.z, id: id, big: mu.big, down: down, guard: mu.guard });
  }

  function enterZone(S, q, z, ev) {
    q.prevZone = q.zone; q.zone = z;
    if (S.front.indexOf(z) >= 0) crisis(S, 'treasure', q, ev);
    // 고정 구역 느려짐: 들어서면 span 구역 동안 (이 구역 포함). 다른 구역에 들어설 때마다 하나씩 줄어듦
    var fd = fixedDef(S, z);
    if (fd && fd.slow) { q.chill = fd.span || 1; q.chillSlow = fd.slow; ev.push({ type: 'chill', id: q.id, z: z, x: q.x, y: q.y }); }
    else if (q.chill > 0) { q.chill--; if (!q.chill) q.chillSlow = 0; }
    if (q.prevZone === 'Y' && S.zones.Y === 'thorn') { ev.push({ type: 'thorn', x: q.x, y: q.y }); hurtAll(S, q, BD.THORN_DMG, ev); }
    if (q.state === 'dead') return;
    if (kindOf(S, z) === 'trap') { q.trapT = BD.TRAP_EVERY; trapRoll(S, q, ev); }
  }

  function moveSquad(S, q, dt, ev) {
    var speed = BD.MOVE_SPEED * (1 + (S.fx.speed || 0)) * Math.max(0.1, 1 - S.mod.slow - (q.chill > 0 ? q.chillSlow || 0 : 0)), left = speed * dt;
    while (left > 0 && q.state === 'move') {
      var t = q.wps[q.wp], d = dist(q, t);
      var count = q.wp >= 2;
      if (d > left) { q.x += (t.x - q.x) / d * left; q.y += (t.y - q.y) / d * left; if (count) q.went += left; left = 0; break; }
      q.x = t.x; q.y = t.y; if (count) q.went += d; left -= d; q.wp++;
      if (t.door) { enterZone(S, q, t.z, ev); if (q.state !== 'move') break; }
      if (t.anchor && t.z === S.goal) {
        if (S.guard > 0) { S.guard--; q.state = 'retreat'; S.retreated++; ev.push({ type: 'guarded', id: q.id, x: q.x, y: q.y }); break; }
        q.state = 'reached'; S.reached++;
        var porters = aliveMem(q).filter(function (m) { return m.porter; }).length;
        var loot = BD.LOOT_BASE + porters * BD.LOOT_PER_PORTER;
        S.loot += loot;
        ev.push({ type: 'reach', id: q.id, x: q.x, y: q.y, loot: loot, porters: porters });
        break;
      }
      if (t.anchor && kindOf(S, t.z) === 'den' && livingMon(S, t.z).length) { q.state = 'fight'; ev.push({ type: 'fight', id: q.id, z: t.z }); break; }
    }
  }

  function fightDens(S, dt, ev) {
    Object.keys(S.dens).forEach(function (z) {
      var qs = S.squads.filter(function (q) { return q.state === 'fight' && q.zone === z; });
      if (!qs.length) return;
      var mons = livingMon(S, z);
      if (!mons.length) { qs.forEach(function (q) { q.state = 'move'; }); return; }
      if (S.freeze > 0) return;
      // 침입자 -> 앞 몬스터
      var atk = 0;
      qs.forEach(function (q) { aliveMem(q).forEach(function (m) { atk += m.atk; }); });
      S.fought[z] = true;
      var tgt = mons[0], d = Math.min(tgt.hp, atk * (1 + (S.fx.atk || 0)) * (1 - Math.min(BD.DEF_MAX || 0.8, tgt.def || 0)) * dt);
      tgt.hp -= d; tgt.lost += d;
      if (S.mu[tgt.id]) S.mu[tgt.id].burst += d;
      if (tgt.hp <= 0) { tgt.hp = 0; ev.push({ type: 'mdown', z: z, id: tgt.id }); }
      if (S.mu[tgt.id]) checkRetreat(S, tgt.id, ev);
      // 몬스터 -> 분대 앞사람 (분대가 여럿이면 번갈아)
      mons.forEach(function (m, i) {
        if (m.hp <= 0 || m.out) return;
        var q = qs[i % qs.length];
        if (q.state !== 'fight') return;
        var amb = kindOf(S, q.prevZone) === 'trap' ? BD.AMBUSH : 1;
        var f = front(q);
        if (f) hurt(S, q, f, m.atk * (1 + S.mod.monAtk) * amb * dt, ev);
      });
      ev.push({ type: 'clash', z: z });
    });
  }

  function step(S, dt) {
    var ev = [];
    if (S.done) return ev;
    S.t += dt;
    if (S.freeze > 0) S.freeze -= dt;
    // 최근 받은 피해는 시간이 지나면 줄어든다 (큰 피해 판단용)
    var decay = Math.exp(-dt / (retreatRule().burstWindow || 4));
    Object.keys(S.mu).forEach(function (id) { S.mu[id].burst *= decay; });
    // 분대 진입: SQUAD_GAP초마다 하나씩
    if (S.released < S.squads.length) {
      S.releaseT -= dt;
      if (S.releaseT <= 0) {
        var nq = S.squads[S.released++]; nq.state = 'move'; S.releaseT = BD.SQUAD_GAP; ev.push({ type: 'enter', id: nq.id });
        if (S.released === 1 && S.plan.surge) crisis(S, 'surge', null, ev);
        if (S.released === 1 && S.plan.boss) crisis(S, 'boss', null, ev);
      }
    }
    S.squads.forEach(function (q) {
      if (q.state !== 'move') return;
      if (S.freeze > 0) return;
      moveSquad(S, q, dt, ev);
      if (q.state === 'move' && kindOf(S, q.zone) === 'trap') {
        q.trapT -= dt;
        if (q.trapT <= 0) { q.trapT += BD.TRAP_EVERY; trapRoll(S, q, ev); }
      }
    });
    fightDens(S, dt, ev);
    progress(S);
    // 위기: 분대 진행도가 보물방 근접 기준 이상 · 던전 안 분대가 많음
    var cr = cardRule(), inside = 0;
    S.squads.forEach(function (q) {
      if (q.state !== 'move' && q.state !== 'fight') return;
      inside++;
      if (cr.crisisProgress && prog(q) >= cr.crisisProgress) crisis(S, 'treasure', q, ev);
    });
    if (cr.massSquads && inside >= cr.massSquads) crisis(S, 'surge', null, ev);
    var active = S.squads.filter(function (q) { return q.state === 'wait' || q.state === 'move' || q.state === 'fight'; });
    if (S.t >= BD.TIME_LIMIT && active.length) {
      active.forEach(function (q) { q.state = 'retreat'; S.retreated++; });
      S.timeout = true;
      ev.push({ type: 'timeout', n: active.length });
      active = [];
    }
    if (!active.length) { S.done = true; ev.push({ type: 'end' }); }
    return ev;
  }

  function applyCard(S, side) {
    var ev = [];
    switch (side.kind) {
      case 'trapDmg': case 'trapRate': case 'monAtk': case 'slow': case 'weak': S.mod[side.kind] += side.v; break;
      case 'revive':
        // 쓰러진 몬스터 모두 일으키고 체력 회복. 퇴각했던 부대도 돌아온다 (퇴각 기록 지움)
        Object.keys(S.dens).forEach(function (z) { S.dens[z].forEach(function (m) { if (m.hp < m.max || m.out) { m.hp = m.max; m.out = false; ev.push({ type: 'revive', z: z, id: m.id }); } }); });
        Object.keys(S.mu).forEach(function (id) { var mu = S.mu[id]; mu.out = false; mu.big = false; mu.burst = 0; });
        break;
      case 'quake':
        S.squads.forEach(function (q) {
          if (q.state !== 'move' && q.state !== 'fight') return;
          q.mem.forEach(function (m) { if (m.alive) hurt(S, q, m, m.max * side.v / ((1 - (S.fx.def || 0)) * (1 + S.mod.weak)), ev); });
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
    // 아군 퇴각 목록: { id, big(큰 피해), down(쓰러진 인원), guard }. 사망·쉼은 progress.js applyBattle이 정한다
    //  monDown = 부대마다 쓰러진(체력 0) 인원 { id: 수 } (퇴각 안 한 부대 포함. 쓰러짐은 전투 뒤 회복, 사망은 큰 피해 퇴각 때만)
    var monRetreat = [], monDown = {};
    Object.keys(S.mu || {}).forEach(function (id) {
      var mu = S.mu[id];
      var down = 0; (S.dens[mu.z] || []).forEach(function (m) { if (m.id === id && m.hp <= 0) down++; });
      if (down) monDown[id] = down;
      if (mu.out) monRetreat.push({ id: id, big: !!mu.big, down: down, guard: !!mu.guard });
    });
    return {
      kills: S.gain.kills, porterKills: S.gain.porterKills, total: S.total, squads: S.squads.length,
      gold: S.gain.gold, gems: S.gain.gems, exp: S.gain.exp, reached: S.reached, retreated: S.retreated,
      timeout: S.timeout, loot: S.loot, damage: damage, time: S.t, deployed: deployed, fought: fought,
      monRetreat: monRetreat, monDown: monDown, crises: S.crisis ? S.crisis.n : 0
    };
  }
  // 저장 지점: S를 순수 데이터로 (참조 빼고 깊은 복사)
  var REFS = { plan: 1, zones: 1, units: 1, icard: 1, fx: 1 };
  function snapshot(S) {
    var o = {};
    Object.keys(S).forEach(function (k) { if (!REFS[k]) o[k] = S[k]; });
    return JSON.parse(JSON.stringify(o));
  }
  // o = create와 같은 { plan, zones, units, monById }. snap이 이상하면 null (그러면 처음부터)
  function restore(o, snap) {
    if (!snap || typeof snap.t !== 'number' || typeof snap.rs !== 'number' || !snap.squads || !snap.dens || !snap.mod || !snap.gain) return null;
    var S = JSON.parse(JSON.stringify(snap));
    if (!S.fought || typeof S.fought !== 'object') S.fought = {};
    if (!S.mu || typeof S.mu !== 'object') S.mu = {};
    if (!S.crisis || typeof S.crisis !== 'object') S.crisis = { n: 0, kinds: {}, sq: {} };
    if (typeof S.goal !== 'string') S.goal = o.goal || (Z.goal ? Z.goal() : 'B');
    if (!Array.isArray(S.front)) S.front = Z.bossFront ? Z.bossFront() : [];
    S.plan = o.plan; S.zones = o.zones; S.units = o.units; S.icard = cardById(o.plan.card); S.fx = mergeFx(o.plan);
    return S;
  }
  function squadInfo(q) { var a = aliveMem(q); return { alive: a.length, porters: a.filter(function (m) { return m.porter; }).length }; }

  window.BSIM = { create: create, snapshot: snapshot, restore: restore, step: step, applyCard: applyCard, progress: progress, result: result, squadInfo: squadInfo, cardById: cardById, attrById: attrById, livingMon: livingMon,
    crisisLeft: crisisLeft };
})();
