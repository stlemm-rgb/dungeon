/* C1 진행 상태와 규칙 (화면 그리기 없음, 가짜 숫자, 균형 없음)
 *
 * 규칙 요약 (docs/GAME_PLAN.md "진행 구조" 줄 기준)
 *  1) 끝없이 이어진다. "다음 주"를 누르면 한 주가 지난다 (nextWeek). 한 판 길이·휴식주 없음.
 *  2) 침입 전투는 예고된 주(nextInvasionWeek)에만 있다. 침입 주에는 "다음 주"가 막히고 전투를 치러야 한다.
 *     전투 결과를 반영(applyBattle)하면 그 주가 끝나고, 2~4주 뒤로 다음 침입이 예고된다.
 *  3) 건설(buildZone)은 언제든, 금이 있는 만큼, 전투 중에는 못 지음. 구역 16곳에 시설을 하나씩 (규칙은 zones.js).
 *     지으면 부지(site.zones)에 저장된다. 쓴 금은 환불 없음 (바꿔 지어도 이전 시설 값은 안 돌아옴).
 *     대기실 몬스터 넣고 빼기(placeMonster/removeMonster)는 공짜. 건설 횟수(builds)는 금을 쓴 건설만 센다.
 *  4) 의뢰는 하나씩. 목표 2개(일반) / 3개(메인), 기한 없음. 목표를 다 채우면(checkQuest) 즉시 납품(deliver).
 *  5) 일반 의뢰를 3번 끝내면(questsDone) 다음 후보에 메인 의뢰가 한 장 끼어든다. 메인은 등급이 C -> B -> A -> S로 오른다.
 *  6) 납품하면 정산(보상) -> 친위대 고르기(최대 3) -> 다음 의뢰 후보 중 고르기(pickQuest) -> 새 부지에 새로 짓기.
 *     던전 가치와 건설 횟수는 초기화되고, 몬스터·자금·명성은 이어진다.
 *  7) 상태는 RUN 하나. 바뀔 때마다 localStorage에 저장 (막혀 있어도 동작). 이어하기 버튼은 없다: 켜면 그대로 이어진다.
 *  8) 무작위는 이 파일의 시드 무작위(rnd)만 쓴다. 시드는 RUN.seed에 저장되어 새로고침해도 이어진다.
 *     (새 게임 시작 때만 시계로 시드를 만든다. 연출용 무작위는 shell.js의 fxRandom)
 *
 * phase(RUN.phase): choose = 의뢰를 고르는 중(진행 중 의뢰 없음) · play = 의뢰 진행 중 · settle = 납품 직후 정산 화면
 */
(function () {
  'use strict';

  // ---------- 데이터 (고칠 때는 여기만) ----------
  var SAVE_KEY = 'dunguen_c1_run';
  var VERSION = 2;                // 저장 형식이 바뀌면 올린다 (옛 저장은 버리고 새로 시작). 2: 부지가 구역별 시설(site.zones)
  var START_GOLD = 2000, START_FAME = 1;
  var WEEKLY_INCOME = 100;        // 다음 주마다 들어오는 돈
  var KILL_LOOT = 20;             // 침입자 한 명 처치당 전리품
  var NORMAL_TO_MAIN = 3;         // 일반 의뢰 몇 번이면 메인이 나오나
  var GUARD_MAX = 3;
  var MAIN_GRADES = ['C', 'B', 'A', 'S'];
  var MON_GRADES = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];

  // 목표 종류. calc(s): s = 의뢰 크기 (일반 1, 메인 C=2 B=3 A=4 S=5) -> 목표 숫자
  var GOAL_TYPES = [
    { id: 'value',   label: '던전 가치',     unit: '',  calc: function (s) { return 150 + 150 * (s - 1); } },
    { id: 'builds',  label: '건설',          unit: '회', calc: function (s) { return s === 1 ? 3 : s + 3; } },
    { id: 'levelups', label: '몬스터 레벨업', unit: '회', calc: function (s) { return s === 1 ? 2 : s + 2; } },
    { id: 'kills',   label: '침입자 처치',   unit: '명', calc: function (s) { return 6 + 5 * (s - 1); } },
    { id: 'rankups', label: '몬스터 등급 상승', unit: '회', calc: function (s) { return s <= 2 ? 1 : Math.ceil(s / 2); } }
  ];
  // 의뢰 이름표
  var NAMES_NORMAL = ['지하 창고 증축', '버섯 농장 던전', '폐광 개조 공사', '늪지 초소 건설', '도둑 소굴 리모델링',
    '해골 묘지 확장', '박쥐 동굴 정비', '안개 숲 함정길'];
  var NAMES_MAIN = ['북쪽 관문 요새', '용암 지대 거점', '구름 위 성채', '마왕의 옥좌실'];
  var START_MONSTERS = [
    { name: '슬라임',   lv: 4, hp: 120, atk: 8 },  { name: '고블린',   lv: 3, hp: 90,  atk: 14 },
    { name: '스켈레톤', lv: 5, hp: 140, atk: 16 }, { name: '박쥐 떼',  lv: 2, hp: 60,  atk: 10 },
    { name: '늑대 사냥개', lv: 3, hp: 110, atk: 18 }, { name: '돌 골렘', lv: 6, hp: 300, atk: 12 }
  ];
  var LEVEL_NEED = 2;             // 경험치 몇이면 레벨업

  // ---------- 상태: RUN 하나 (객체 자체는 바뀌지 않고 안의 값만 바뀐다) ----------
  var RUN = {};

  // 새 부지: 구역별 시설(zones), 대기실 몬스터(units: 구역 -> 몬스터 id 목록), 가치(value, 저장 때 맞춰 둠), 건설 횟수
  function freshSite() { return { value: 0, builds: 0, zones: ZONES.defaultZones(), units: {} }; }

  function freshRun() {
    var monsters = START_MONSTERS.map(function (m, i) {
      return { id: i, name: m.name, lv: m.lv, exp: 0, hp: m.hp, atk: m.atk };
    });
    return {
      v: VERSION, seed: (Date.now() ^ 0x5bd1e995) | 0,
      week: 1, gold: START_GOLD, fame: START_FAME,
      phase: 'choose', quest: null, offers: null, report: null,
      questsDone: 0, mainGrade: 0, qid: 1, siteNo: 0,
      site: freshSite(),
      monsters: monsters, guards: [],
      nextInvasionWeek: 3, history: []
    };
  }
  function setRun(src) {
    Object.keys(RUN).forEach(function (k) { delete RUN[k]; });
    Object.keys(src).forEach(function (k) { RUN[k] = src[k]; });
  }

  // ---------- 저장 (막혀도 동작) ----------
  function save() {
    if (RUN.site && RUN.site.zones) RUN.site.value = siteValue(); // 저장된 가치는 늘 지금 값
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(RUN)); } catch (e) { /* 저장이 막힌 환경: 그냥 계속 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.v === VERSION && d.site && d.site.zones && d.site.units && d.monsters && typeof d.week === 'number') { setRun(d); return true; }
      }
    } catch (e) { /* 깨진 저장은 무시하고 새로 시작 */ }
    setRun(freshRun());
    return false;
  }
  function reset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
    setRun(freshRun());
    save();
  }

  // ---------- 시드 무작위 (게임용) ----------
  function rnd() {
    RUN.seed = (RUN.seed + 0x6D2B79F5) | 0;
    var t = RUN.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rint(n) { return Math.floor(rnd() * n); }

  // ---------- 작은 계산 ----------
  function goalType(id) { for (var i = 0; i < GOAL_TYPES.length; i++) { if (GOAL_TYPES[i].id === id) return GOAL_TYPES[i]; } return null; }
  function gradeIdx(lv) { return Math.max(0, Math.min(MON_GRADES.length - 1, Math.floor(lv / 2))); }
  function monGrade(lv) { return MON_GRADES[gradeIdx(lv)]; }
  function isInvasionWeek() { return RUN.week >= RUN.nextInvasionWeek; }
  function invasionIn() { return Math.max(0, RUN.nextInvasionWeek - RUN.week); }

  function monById(id) { for (var i = 0; i < RUN.monsters.length; i++) { if (RUN.monsters[i].id === id) return RUN.monsters[i]; } return null; }
  // 던전 가치 = 시설 가치 + 대기실에 든 몬스터 가치 (몬스터가 크면 가치도 오른다)
  function siteSummary() { return ZONES.summary(RUN.site.zones, RUN.site.units, monById); }
  function siteValue() { return siteSummary().value; }

  // 목표 하나의 지금 값. value·builds는 부지에서, 나머지는 의뢰를 받은 뒤 쌓인 값
  function goalNow(g) {
    if (g.type === 'value') return siteValue();
    if (g.type === 'builds') return RUN.site.builds;
    return RUN.quest && RUN.quest.prog[g.type] || 0;
  }
  function goalText(g) {
    var t = goalType(g.type);
    return t.label + ' ' + Math.min(goalNow(g), g.target) + '/' + g.target + t.unit;
  }

  // ---------- 의뢰 만들기·고르기 ----------
  function makeQuest(kind, usedNames) {
    var s = kind === 'main' ? 2 + RUN.mainGrade : 1;
    var count = kind === 'main' ? 3 : 2;
    var pool = GOAL_TYPES.slice();
    var goals = [];
    for (var i = 0; i < count; i++) {
      // 첫 목표는 건설 쪽(가치·건설 횟수) 중 하나, 나머지는 진행 쪽(레벨업·처치·등급): 건설과 주 넘기기가 함께 필요하도록
      var cand = pool.filter(function (x) { var b = x.id === 'value' || x.id === 'builds'; return i === 0 ? b : !b; });
      var t = cand[rint(cand.length)];
      pool.splice(pool.indexOf(t), 1);
      goals.push({ type: t.id, target: t.calc(s) });
    }
    var name;
    if (kind === 'main') name = NAMES_MAIN[RUN.mainGrade];
    else {
      do { name = NAMES_NORMAL[rint(NAMES_NORMAL.length)]; } while (usedNames.indexOf(name) >= 0);
    }
    usedNames.push(name);
    var reward = kind === 'main'
      ? { gold: 1500 + 800 * RUN.mainGrade, fame: 3 + RUN.mainGrade }
      : { gold: 500 + rint(5) * 50, fame: 1 };
    return {
      id: RUN.qid++, kind: kind, grade: kind === 'main' ? MAIN_GRADES[RUN.mainGrade] : '',
      name: name, goals: goals, reward: reward, prog: { levelups: 0, kills: 0, rankups: 0 }, startWeek: 0
    };
  }
  // 후보: 일반 2~3장, 메인이 열렸으면 메인 1장 더. 한 번 만들면 저장해 두어 새로고침해도 같다.
  function offerQuests() {
    if (RUN.offers && RUN.offers.length) return RUN.offers;
    var used = [], list = [];
    var n = 2 + rint(2);
    for (var i = 0; i < n; i++) list.push(makeQuest('normal', used));
    if (RUN.questsDone >= NORMAL_TO_MAIN) list.unshift(makeQuest('main', used)); // 메인은 맨 위에
    RUN.offers = list;
    save();
    return list;
  }
  // 의뢰를 받는다: 새 부지에 새로 짓기 시작 (가치·건설 기록 초기화, 몬스터·자금·명성 유지)
  function pickQuest(q) {
    if (RUN.phase !== 'choose' || !q) return false;
    var found = (RUN.offers || []).filter(function (o) { return o.id === q.id; })[0];
    if (!found) return false;
    found.startWeek = RUN.week;
    RUN.quest = found; RUN.offers = null; RUN.phase = 'play';
    RUN.site = freshSite();
    RUN.siteNo++;
    save();
    return true;
  }

  // ---------- 달성 판단·납품 ----------
  function checkQuest() {
    if (RUN.phase !== 'play' || !RUN.quest) return false;
    return RUN.quest.goals.every(function (g) { return goalNow(g) >= g.target; });
  }
  function deliver() {
    if (!checkQuest()) return null;
    var q = RUN.quest;
    RUN.site.value = siteValue();
    var sale = Math.floor(RUN.site.value / 2);                 // 판매 대금: 던전 가치의 절반
    var total = q.reward.gold + sale;
    var wasMain = q.kind === 'main';
    var rep = {
      quest: q, base: q.reward.gold, sale: sale, gold: total, fame: q.reward.fame, weeks: RUN.week - q.startWeek + 1,
      value: RUN.site.value, builds: RUN.site.builds, fameBefore: RUN.fame, goldBefore: RUN.gold, wasMain: wasMain,
      nextMain: ''
    };
    RUN.gold += total; RUN.fame += q.reward.fame;
    if (wasMain) { RUN.questsDone = 0; RUN.mainGrade = Math.min(MAIN_GRADES.length - 1, RUN.mainGrade + 1); }
    else RUN.questsDone++;
    rep.nextMain = RUN.questsDone >= NORMAL_TO_MAIN ? '메인 의뢰가 열렸어요. 다음 후보에 나옵니다.'
      : '메인 의뢰까지 일반 의뢰 ' + RUN.questsDone + '/' + NORMAL_TO_MAIN + ' (다음 메인 ' + MAIN_GRADES[RUN.mainGrade] + '급)';
    RUN.history.push({ name: q.name, kind: q.kind, grade: q.grade, week: RUN.week });
    if (RUN.history.length > 30) RUN.history.shift();
    RUN.report = rep; RUN.quest = null; RUN.phase = 'settle';
    save();
    return rep;
  }
  // 친위대: 몬스터 id 목록 (최대 3). 정산 화면에서 고른다.
  function setGuards(ids) {
    RUN.guards = ids.slice(0, GUARD_MAX);
    save();
  }
  function toContract() {
    if (RUN.phase !== 'settle') return false;
    RUN.phase = 'choose'; RUN.report = null;
    offerQuests();
    return true;
  }

  // ---------- 건설 ----------
  // 전투 화면에 있는 동안은 못 짓는다 (shell.js가 setBattle로 알려 줌. 저장하지 않음)
  var battling = false;
  function setBattle(b) { battling = !!b; }
  function usedIds() {
    var used = {};
    Object.keys(RUN.site.units).forEach(function (z) { RUN.site.units[z].forEach(function (id) { used[id] = true; }); });
    return used;
  }
  function idleMonsters() { var used = usedIds(); return RUN.monsters.filter(function (m) { return !used[m.id]; }); }
  function canEdit() {
    if (RUN.phase !== 'play') return '진행 중인 의뢰가 없어요';
    if (battling) return '전투 중에는 지을 수 없어요';
    return '';
  }
  // 구역 z를 시설 k로 지으면: 비용·가치 변화·막히는 이유. 짓기 전 미리보기용 (아무것도 바꾸지 않음)
  function previewBuild(z, k) {
    var f = ZONES.FAC[k];
    if (!f || ZONES.ALL.indexOf(z) < 0 || ZONES.facFor(z).indexOf(k) < 0) return { ok: false, why: '지을 수 없는 시설' };
    var cur = RUN.site.zones[z], cost = ZONES.costOf(k, z);
    var zones2 = {}; Object.keys(RUN.site.zones).forEach(function (q) { zones2[q] = RUN.site.zones[q]; });
    zones2[z] = k;
    var units2 = {}; Object.keys(RUN.site.units).forEach(function (q) { units2[q] = RUN.site.units[q].slice(); });
    var slots = ZONES.slotsOf(k, z), back = 0;
    if (units2[z]) { back = Math.max(0, units2[z].length - slots); units2[z] = units2[z].slice(0, slots); if (!units2[z].length) delete units2[z]; }
    var after = ZONES.summary(zones2, units2, monById), now = siteSummary();
    var why = canEdit();
    if (!why && cur === k) why = '이미 이 시설이에요';
    if (!why && RUN.gold < cost) why = '금 ' + (cost - RUN.gold) + ' 모자람';
    return {
      ok: !why, why: why, cost: cost, counts: cost > 0, goldAfter: RUN.gold - cost, valueNow: now.value, valueAfter: after.value,
      back: back, zones: zones2, units: units2, from: cur
    };
  }
  function buildZone(z, k) {
    var p = previewBuild(z, k);
    if (!p.ok) return { ok: false, msg: p.why };
    RUN.gold -= p.cost;                    // 쓴 금은 환불 없음
    RUN.site.zones[z] = k;
    RUN.site.units = p.units;
    if (p.counts) RUN.site.builds++;       // 금을 쓴 건설만 횟수에 센다 (공짜로 바꾸는 건 횟수 아님)
    save();
    var dv = p.valueAfter - p.valueNow;
    return { ok: true, msg: ZONES.NAMES[z] + ' ' + ZONES.FAC[k].name + ' 완공 (금 -' + p.cost + ', 가치 ' + (dv >= 0 ? '+' : '') + dv + ')' };
  }
  // 몬스터 대기실에 몬스터 한 마리 넣기·빼기 (공짜)
  function placeMonster(z, id) {
    var why = canEdit();
    if (why) return { ok: false, msg: why };
    var k = RUN.site.zones[z], slots = k ? ZONES.slotsOf(k, z) : 0;
    var us = RUN.site.units[z] || [];
    if (!slots) return { ok: false, msg: '몬스터 대기실이 아니에요' };
    if (us.length >= slots) return { ok: false, msg: '자리가 없어요' };
    var m = monById(id);
    if (!m || usedIds()[id]) return { ok: false, msg: '넣을 수 없는 몬스터' };
    RUN.site.units[z] = us.concat([id]);
    save();
    return { ok: true, msg: m.name + ' 배치' };
  }
  function removeMonster(z, index) {
    var why = canEdit();
    if (why) return { ok: false, msg: why };
    var us = RUN.site.units[z] || [];
    if (us[index] === undefined) return { ok: false, msg: '빼낼 몬스터가 없어요' };
    var m = monById(us[index]);
    RUN.site.units[z] = us.slice(0, index).concat(us.slice(index + 1));
    if (!RUN.site.units[z].length) delete RUN.site.units[z];
    save();
    return { ok: true, msg: (m ? m.name : '몬스터') + ' 대기로' };
  }
  // 문 위 숫자 미리 보기: 침입자 n명이 이 판을 지나면 각 길로 몇 명씩 (zones·units를 주면 그 배치로, 아니면 지금 부지)
  function forecast(zones, units) { return ZONES.forecast(zones || RUN.site.zones, units || RUN.site.units, ZONES.PREVIEW_INVADERS); }

  // ---------- 몬스터 성장 ----------
  function addExp(m, n, msgs) {
    m.exp += n;
    while (m.exp >= LEVEL_NEED) {
      var gBefore = gradeIdx(m.lv);
      m.exp -= LEVEL_NEED; m.lv++;
      m.hp = Math.round(m.hp * 1.1); m.atk += 1;
      if (RUN.quest) RUN.quest.prog.levelups++;
      var line = m.name + ' Lv ' + m.lv + ' 레벨업';
      if (gradeIdx(m.lv) > gBefore) {
        if (RUN.quest) RUN.quest.prog.rankups++;
        line += ' · 등급 ' + monGrade(m.lv) + ' 상승';
      }
      msgs.push(line);
    }
  }
  // 경험치가 가장 많은 몬스터들(같으면 무작위)을 n마리 고른다
  function topMonsters(n) {
    var arr = RUN.monsters.map(function (m) { return { m: m, k: m.exp + rnd() * 0.5 }; });
    arr.sort(function (a, b) { return b.k - a.k; });
    return arr.slice(0, n).map(function (a) { return a.m; });
  }

  // ---------- 주 넘기기 ----------
  function passWeek(msgs) {
    RUN.week++;
    RUN.gold += WEEKLY_INCOME;
    msgs.push('주간 수입 +' + WEEKLY_INCOME);
    addExp(topMonsters(1)[0], 1, msgs); // 훈련
  }
  function nextWeek() {
    var msgs = [];
    if (RUN.phase !== 'play') return { ok: false, msgs: ['진행 중인 의뢰가 없어요'] };
    if (isInvasionWeek()) return { ok: false, invasion: true, msgs: ['이번 주는 침입이 있어요. 먼저 맞서야 해요'] };
    passWeek(msgs);
    var inv = isInvasionWeek();
    if (inv) msgs.push('침입 주예요! 침입자가 몰려옵니다');
    save();
    return { ok: true, invasion: inv, msgs: msgs };
  }

  // ---------- 전투 결과 반영 ----------
  // result = { kills, breached }. 침입 주에만 의미가 있다 (연습 전투는 부르지 않는다).
  function applyBattle(result) {
    var msgs = [];
    if (RUN.phase !== 'play' || !isInvasionWeek()) return { ok: false, msgs: ['반영할 침입이 없어요'] };
    var kills = Math.max(0, result.kills | 0);
    RUN.quest.prog.kills += kills;
    var loot = kills * KILL_LOOT;
    RUN.gold += loot;
    msgs.push('처치 ' + kills + '명 · 돌파 ' + (result.breached | 0) + '명 · 전리품 +' + loot);
    topMonsters(2).forEach(function (m) { addExp(m, 1, msgs); }); // 싸운 몬스터 경험치
    passWeek(msgs);                                                // 침입을 치르면 그 주가 끝난다
    RUN.nextInvasionWeek = RUN.week + 2 + rint(3);               // 다음 침입은 2~4주 뒤
    save();
    return { ok: true, msgs: msgs };
  }

  load();

  window.PROGRESS = {
    RUN: RUN, GOAL_TYPES: GOAL_TYPES, MAIN_GRADES: MAIN_GRADES,
    NORMAL_TO_MAIN: NORMAL_TO_MAIN, GUARD_MAX: GUARD_MAX,
    goalNow: goalNow, goalText: goalText, monGrade: monGrade, isInvasionWeek: isInvasionWeek, invasionIn: invasionIn,
    nextWeek: nextWeek, applyBattle: applyBattle, checkQuest: checkQuest, deliver: deliver,
    siteSummary: siteSummary, siteValue: siteValue, idleMonsters: idleMonsters, previewBuild: previewBuild, buildZone: buildZone,
    placeMonster: placeMonster, removeMonster: removeMonster, forecast: forecast, setBattle: setBattle, monById: monById,
    offerQuests: offerQuests, pickQuest: pickQuest, setGuards: setGuards, toContract: toContract,
    save: save, load: load, reset: reset
  };
})();
