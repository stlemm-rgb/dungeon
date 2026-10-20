/* C1 전투 계산 (화면 그리기 없음). 숫자는 battle_data.js, 판·길 규칙은 zones.js
 *
 *  - create(o): o = { plan(progress.js의 이번 주 계획), zones, units(대기실 몬스터 id), monById } -> 전투 상태 S
 *  - step(S, dt): 게임 시간 dt초 진행. 일어난 일 목록(events)을 돌려준다 (화면이 연출에 씀)
 *  - applyCard(S, side): 이벤트 카드 한 방향 효과. 대부분 전투 끝까지(S.mod에 쌓임), once는 그 자리에서 한 번
 *  - progress(S): 가장 앞선 분대가 보물방까지 간 거리(%). result(S): 결과 (progress.js applyBattle에 넘김)
 *  - 분대 = 10명. 길은 ZONES.routeOf (갈림길에서 번갈아 나뉨, 미끼 쪽으로 몰림, 몬스터 든 대기실은 피함, 함정은 모르고 들어감)
 *  - 함정 구역: 들어설 때와 그 안에 있는 동안 TRAP_EVERY초마다 발동을 굴림 (확률 = TRAP_CHANCE + 카드 - 침입자 카드)
 *  - 몬스터 대기실: 산 몬스터가 있으면 분대가 멈추고 싸움. 바로 앞 구역이 함정이면 몬스터 피해 ×AMBUSH
 *  - 1분(TIME_LIMIT) 지나면 남은 분대는 퇴각 (보물방 침입으로 치지 않음)
 *  - 무작위는 plan.seed로 만든 시드 무작위만 (게임용). 연출용 무작위는 쓰지 않는다.
 */
(function () {
  'use strict';
  var BD = window.BATTLE_DATA, Z = window.ZONES;

  function seeded(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cardById(id) { return BD.INVADER_CARDS.filter(function (c) { return c.id === id; })[0] || BD.INVADER_CARDS[0]; }
  function kindOf(S, z) { return z === 'B' || z === 'Y' ? 'none' : Z.FAC[S.zones[z]].kind; }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  function create(o) {
    var plan = o.plan, zones = o.zones, units = o.units;
    var S = {
      plan: plan, zones: zones, units: units, rng: seeded(plan.seed), t: 0, released: 0, releaseT: 0,
      icard: cardById(plan.card), squads: [], dens: {}, guard: 0, freeze: 0, done: false, timeout: false, maxProg: 0,
      mod: { trapDmg: 0, trapRate: 0, monAtk: 0, slow: 0, weak: 0 },
      gain: { gold: 0, gems: 0, exp: 0, kills: 0, porterKills: 0 }, reached: 0, retreated: 0, loot: 0, total: 0
    };
    // 대기실 몬스터 (전투 안에서만 쓰는 복사본. 잃은 체력은 수리 금으로)
    Object.keys(units).forEach(function (z) {
      if (Z.FAC[zones[z]].kind !== 'den') return;
      S.dens[z] = units[z].map(function (id) {
        var m = o.monById(id);
        return m ? { id: id, name: m.name, hp: m.hp, max: m.hp, atk: m.atk, lost: 0 } : null;
      }).filter(Boolean);
    });
    // 분대 만들기: 무리 순서(등급 낮은 무리부터)대로. 대기 장소(야외)에 한 줄로 선다
    var turn = {}, all = [];
    plan.groups.forEach(function (g, gi) {
      var st = BD.GRADE_STAT[g.grade], grow = 1 + BD.LVL_GROW * g.lv;
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
      q.len = len; q.went = 0; q.state = 'wait'; q.zone = 'Y'; q.prevZone = 'Y'; q.trapT = 0;
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
    var d = dmg * (1 - (S.icard.fx.def || 0)) * (1 + S.mod.weak);
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
    var chance = (BD.TRAP_CHANCE + S.mod.trapRate) * (1 - (S.icard.fx.trap || 0));
    if (S.rng() >= chance) { ev.push({ type: 'trapMiss', z: q.zone, x: q.x, y: q.y }); return; }
    var dmg = Z.trapDmgOf(q.zone) * (1 + S.mod.trapDmg);
    ev.push({ type: 'trap', z: q.zone, x: q.x, y: q.y, dmg: Math.round(dmg) });
    hurtAll(S, q, dmg, ev);
  }
  function livingMon(S, z) { return (S.dens[z] || []).filter(function (m) { return m.hp > 0; }); }

  function enterZone(S, q, z, ev) {
    q.prevZone = q.zone; q.zone = z;
    if (q.prevZone === 'Y' && S.zones.Y === 'thorn') { ev.push({ type: 'thorn', x: q.x, y: q.y }); hurtAll(S, q, BD.THORN_DMG, ev); }
    if (q.state === 'dead') return;
    if (kindOf(S, z) === 'trap') { q.trapT = BD.TRAP_EVERY; trapRoll(S, q, ev); }
  }

  function moveSquad(S, q, dt, ev) {
    var speed = BD.MOVE_SPEED * (1 + (S.icard.fx.speed || 0)) * Math.max(0.1, 1 - S.mod.slow), left = speed * dt;
    while (left > 0 && q.state === 'move') {
      var t = q.wps[q.wp], d = dist(q, t);
      var count = q.wp >= 2;
      if (d > left) { q.x += (t.x - q.x) / d * left; q.y += (t.y - q.y) / d * left; if (count) q.went += left; left = 0; break; }
      q.x = t.x; q.y = t.y; if (count) q.went += d; left -= d; q.wp++;
      if (t.door) { enterZone(S, q, t.z, ev); if (q.state !== 'move') break; }
      if (t.anchor && t.z === 'B') {
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
      var tgt = mons[0], d = Math.min(tgt.hp, atk * (1 + (S.icard.fx.atk || 0)) * dt);
      tgt.hp -= d; tgt.lost += d;
      if (tgt.hp <= 0) { tgt.hp = 0; ev.push({ type: 'mdown', z: z, id: tgt.id }); }
      // 몬스터 -> 분대 앞사람 (분대가 여럿이면 번갈아)
      mons.forEach(function (m, i) {
        if (m.hp <= 0) return;
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
    // 분대 진입: SQUAD_GAP초마다 하나씩
    if (S.released < S.squads.length) {
      S.releaseT -= dt;
      if (S.releaseT <= 0) { var nq = S.squads[S.released++]; nq.state = 'move'; S.releaseT = BD.SQUAD_GAP; ev.push({ type: 'enter', id: nq.id }); }
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
        Object.keys(S.dens).forEach(function (z) { S.dens[z].forEach(function (m) { if (m.hp < m.max) { m.hp = m.max; ev.push({ type: 'revive', z: z, id: m.id }); } }); });
        break;
      case 'quake':
        S.squads.forEach(function (q) {
          if (q.state !== 'move' && q.state !== 'fight') return;
          q.mem.forEach(function (m) { if (m.alive) hurt(S, q, m, m.max * side.v / ((1 - (S.icard.fx.def || 0)) * (1 + S.mod.weak)), ev); });
        });
        break;
      case 'guard': S.guard++; break;
      case 'freeze': S.freeze = Math.max(S.freeze, side.v); break;
    }
    return ev;
  }

  function result(S) {
    var damage = 0;
    Object.keys(S.dens).forEach(function (z) { S.dens[z].forEach(function (m) { damage += m.lost; }); });
    return {
      kills: S.gain.kills, porterKills: S.gain.porterKills, total: S.total, squads: S.squads.length,
      gold: S.gain.gold, gems: S.gain.gems, exp: S.gain.exp, reached: S.reached, retreated: S.retreated,
      timeout: S.timeout, loot: S.loot, damage: damage, time: S.t
    };
  }
  function squadInfo(q) { var a = aliveMem(q); return { alive: a.length, porters: a.filter(function (m) { return m.porter; }).length }; }

  window.BSIM = { create: create, step: step, applyCard: applyCard, progress: progress, result: result, squadInfo: squadInfo, cardById: cardById, livingMon: livingMon };
})();
