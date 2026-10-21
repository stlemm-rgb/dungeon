/* C1 진행 상태와 규칙 (화면 그리기 없음, 가짜 숫자, 균형 없음)
 *
 * 규칙 요약 (docs/GAME_PLAN.md "플레이 흐름 (2026-10-21 사용자, 최우선)" 기준)
 *  1) 끝없이 이어진다. 홈의 "다음 주"를 누르면(startBattle) **매주 반드시 전투**를 치른다.
 *     전투 결과를 반영(applyBattle)하면 그 주가 끝나고 다음 주가 된다. 전투 중(RUN.battling)에는 다른 화면으로 못 간다.
 *  2) 이번 주 침입자 계획(RUN.plan: 무리·짐꾼·침입자 카드)은 미리 만들어 둔다 (홈에 "이번 주 침입자 N명 · 최고 X급").
 *     평소 = 일반 침입자(battle_data.js NORMAL), 예고된 주(RUN.surgeWeek)와 광고 본 주(watchAd) = 대량 출현(SURGE).
 *     침입자 레벨·힘은 던전 가치(던전 레벨)와 명성으로 정하고(fitPlan, 숫자는 battle_data.js), 전투 시작 때 확정한다.
 *     이 부지에서 금을 쓴 건설이 하나도 없으면 "다음 주"가 막힌다.
 *     전투 저장 지점(RUN.bsave) = 전투 시작 + 이벤트 카드를 고른 순간. 새로고침하면 마지막 저장 지점부터 (고른 카드는 못 바꿈)
 *  3) 건설(buildZone)은 언제든, 금이 있는 만큼, 전투 중에는 못 지음. 구역 16곳에 시설을 하나씩 (규칙은 zones.js).
 *     쓴 금은 환불 없음. 대기실 몬스터 넣고 빼기는 공짜. 건설 횟수(builds)는 돈(공사비 또는 금)을 쓴 건설만 센다.
 *     새 부지마다 첫 건설 전용 공사비(RUN.site.grant)를 준다. 건설은 공사비를 먼저 쓰고 모자라면 금. 부지가 바뀌면 남은 공사비는 사라짐.
 *  4) 의뢰는 하나씩. 목표 2개(일반) / 3개(메인), 기한 없음. 목표 = 전투로 얻은 금·보석·몬스터 경험치 + 보물방 방어 횟수.
 *     목표를 다 채우면(checkQuest) 즉시 납품(deliver). 의뢰마다 의뢰인(client)과 던전 속성(attr, 주된 피해 종류 1개)이 있고,
 *     속성은 그 부지의 침입자에게 효과 하나를 더한다 (battle_data.js ATTRS).
 *  5) 일반 의뢰를 3번 끝내면(questsDone) 다음 후보에 메인 의뢰가 한 장 끼어든다. 메인은 등급이 C -> B -> A -> S로 오른다.
 *  6) 납품(deliver) = 정산(금·보석·명성) + 새 의뢰 후보를 한 번에 만든다 (phase settle, 한 화면).
 *     그 화면에서 친위대(최대 3)와 새 의뢰를 고르면(pickQuest) 인계: 친위대가 아닌 몬스터의 레벨·경험치는 처음 값으로,
 *     친위대는 레벨 유지, 남은 공사비·시설·배치는 사라짐, 금·보석·명성은 남음 -> 새 부지에 새로 짓기.
 *  7) 재화: 금(gold) = 건설·수리, 보석(gems) = 1종, 지금은 쌓이기만. 약탈은 이번 전투에서 번 금 안에서만 (보물방은 미끼).
 *  8) 상태는 RUN 하나. 바뀔 때마다 localStorage에 저장. 이어하기 버튼은 없다: 켜면 그대로 이어진다.
 *  9) 무작위는 이 파일의 시드 무작위(rnd)만 쓴다. 전투 안의 무작위는 계획에 저장한 시드(plan.seed)로 battle_sim.js가 굴린다.
 *     (연출용 무작위는 shell.js의 fxRandom)
 *
 * phase(RUN.phase): choose = 의뢰를 고르는 중(진행 중 의뢰 없음) · play = 의뢰 진행 중 · settle = 납품 직후 정산 화면
 */
(function () {
  'use strict';

  // ---------- 데이터 (고칠 때는 여기만) ----------
  var SAVE_KEY = 'dunguen_c1_run';
  var VERSION = 5;               // 저장 형식이 바뀌면 올린다 (옛 저장은 버리고 새로 시작). 2: 부지가 구역별 시설(site.zones). 3: 매주 전투(plan·battling·surgeWeek·adWeek), 보석(gems), 새 목표 종류
                                  // 4: 전투 저장 지점(bsave), 계획에 던전 레벨·힘 배율(plan.dlv·power, 무리 roll)
                                  // 5: 첫 건설 공사비(site.grant), 몬스터 처음 값(monsters[].base), 의뢰 의뢰인·속성·보석 보상, plan.attr
  var START_GOLD = 2000, START_FAME = 1;
  var BD = window.BATTLE_DATA;    // 전투 숫자 표 (battle_data.js)
  var NORMAL_TO_MAIN = 3;         // 일반 의뢰 몇 번이면 메인이 나오나
  var GUARD_MAX = 3;
  var MAIN_GRADES = ['C', 'B', 'A', 'S'];
  var MON_GRADES = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];

  // 목표 종류. calc(s): s = 의뢰 크기 (일반 1, 메인 C=2 B=3 A=4 S=5) -> 목표 숫자. 모두 전투에서 쌓인다 (quest.prog)
  var GOAL_TYPES = [
    { id: 'gold',    label: '전투로 얻은 금',  unit: '',  calc: function (s) { return 250 + 200 * (s - 1); } },
    { id: 'gems',    label: '전투로 얻은 보석', unit: '개', calc: function (s) { return 4 + 3 * (s - 1); } },
    { id: 'exp',     label: '몬스터 경험치',   unit: '',  calc: function (s) { return 30 + 25 * (s - 1); } },
    { id: 'defends', label: '보물방 방어',     unit: '회', calc: function (s) { return 2 + (s - 1); } }
  ];
  // 의뢰 이름표
  var NAMES_NORMAL = ['지하 창고 증축', '버섯 농장 던전', '폐광 개조 공사', '늪지 초소 건설', '도둑 소굴 리모델링',
    '해골 묘지 확장', '박쥐 동굴 정비', '안개 숲 함정길'];
  var NAMES_MAIN = ['북쪽 관문 요새', '용암 지대 거점', '구름 위 성채', '마왕의 옥좌실'];
  // 의뢰 보상 보석 (임시. 메인이 더 많게. 수급량은 밸런스 때)
  var GEMS_NORMAL = [5, 7], GEMS_MAIN = 15, GEMS_MAIN_PER_GRADE = 5;  // 일반 = 5~7, 메인 = 15 + 5 × 등급
  // 의뢰인 (임시 이름). 첫 의뢰(튜토리얼 자리)는 FIRST_CLIENT, 그 뒤는 CLIENTS에서 섞어서. kind: 마왕 · 드래곤 · 마계 종족
  var FIRST_CLIENT = { name: '은발 마왕', kind: '마왕' };
  var CLIENTS = [
    { name: '은발 마왕', kind: '마왕' }, { name: '검은 뿔 마왕', kind: '마왕' },
    { name: '붉은 비늘 드래곤', kind: '드래곤' }, { name: '서리 날개 드래곤', kind: '드래곤' },
    { name: '늪지 리자드맨 족장', kind: '마계 종족' }, { name: '흡혈귀 백작 가문', kind: '마계 종족' }, { name: '뼈 골짜기 리치', kind: '마계 종족' }
  ];
  var SITE_GRANT = 60;            // 새 부지마다 첫 건설 전용 공사비 (임시. 함정 복도 2~4칸·대기실 하나를 지을 만큼)
  var START_MONSTERS = [
    { name: '슬라임',   lv: 4, hp: 120, atk: 8 },  { name: '고블린',   lv: 3, hp: 90,  atk: 14 },
    { name: '스켈레톤', lv: 5, hp: 140, atk: 16 }, { name: '박쥐 떼',  lv: 2, hp: 60,  atk: 10 },
    { name: '늑대 사냥개', lv: 3, hp: 110, atk: 18 }, { name: '돌 골렘', lv: 6, hp: 300, atk: 12 }
  ];
  function levelNeed(lv) { return 4 + lv * 2; } // 경험치 몇이면 레벨업 (임시)

  // ---------- 상태: RUN 하나 (객체 자체는 바뀌지 않고 안의 값만 바뀐다) ----------
  var RUN = {};

  // 새 부지: 구역별 시설(zones), 대기실 몬스터(units: 구역 -> 몬스터 id 목록), 가치(value, 저장 때 맞춰 둠), 건설 횟수,
  // grant = 남은 첫 건설 전용 공사비 (이 부지에서만)
  function freshSite() { return { value: 0, builds: 0, zones: ZONES.defaultZones(), units: {}, grant: SITE_GRANT }; }

  // 몬스터: base = 처음 값(레벨·체력·공격). 새 부지로 갈 때 친위대가 아니면 이 값으로 돌아간다 (레벨업분만 사라짐)
  function freshRun() {
    var monsters = START_MONSTERS.map(function (m, i) {
      return { id: i, name: m.name, lv: m.lv, exp: 0, hp: m.hp, atk: m.atk, base: { lv: m.lv, hp: m.hp, atk: m.atk } };
    });
    return {
      v: VERSION, seed: (Date.now() ^ 0x5bd1e995) | 0,
      week: 1, gold: START_GOLD, gems: 0, fame: START_FAME,
      phase: 'choose', quest: null, offers: null, report: null,
      questsDone: 0, mainGrade: 0, qid: 1, siteNo: 0,
      site: freshSite(),
      monsters: monsters, guards: [],
      surgeWeek: BD.SURGE_FIRST, adWeek: 0, plan: null, battling: false, bsave: null, lastBattle: null, history: []
    };
  }
  // 전투 저장 지점: snap = battle_sim.js snapshot (null이면 전투 시작 지점), ui = 화면 진행(카드 몇 장째 등), 배속
  function freshBattleSave() { return { snap: null, ui: null, speedIdx: 0, fastUsed: false }; }
  // 불러온 뒤 빠진 칸 채우기
  function ensureStateReady() {
    if (RUN.battling && (!RUN.bsave || typeof RUN.bsave !== 'object')) RUN.bsave = freshBattleSave();
    if (!RUN.battling) RUN.bsave = null;
    if (typeof RUN.site.grant !== 'number' || RUN.site.grant < 0) RUN.site.grant = 0;
    if (!Array.isArray(RUN.guards)) RUN.guards = [];
    RUN.monsters.forEach(function (m) { if (!m.base) m.base = { lv: m.lv, hp: m.hp, atk: m.atk }; });
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
        if (d && d.v === VERSION && d.site && d.site.zones && d.site.units && d.monsters && typeof d.week === 'number' && typeof d.gems === 'number' &&
            typeof d.site.grant === 'number' && d.monsters.every(function (m) { return m && m.base; }) &&
            (d.phase !== 'settle' || (d.report && d.offers && d.offers.length)) &&
            (d.phase !== 'play' || (d.quest && d.quest.attr && d.quest.client && d.quest.reward && typeof d.quest.reward.gems === 'number'))) {
          setRun(d); ensureStateReady(); ensurePlan(); return true;
        }
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
  function isSurgeWeek() { return RUN.week >= RUN.surgeWeek || RUN.adWeek === RUN.week; }
  function surgeIn() { return Math.max(0, RUN.surgeWeek - RUN.week); }

  function monById(id) { for (var i = 0; i < RUN.monsters.length; i++) { if (RUN.monsters[i].id === id) return RUN.monsters[i]; } return null; }
  // 던전 가치 = 시설 가치 + 대기실에 든 몬스터 가치 (몬스터가 크면 가치도 오른다)
  function siteSummary() { return ZONES.summary(RUN.site.zones, RUN.site.units, monById); }
  function siteValue() { return siteSummary().value; }

  // 목표 하나의 지금 값: 의뢰를 받은 뒤 전투에서 쌓인 값
  function goalNow(g) { return RUN.quest && RUN.quest.prog[g.type] || 0; }
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
      var t = pool[rint(pool.length)];
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
      ? { gold: 1500 + 800 * RUN.mainGrade, gems: GEMS_MAIN + GEMS_MAIN_PER_GRADE * RUN.mainGrade, fame: 3 + RUN.mainGrade }
      : { gold: 500 + rint(5) * 50, gems: GEMS_NORMAL[0] + rint(GEMS_NORMAL[1] - GEMS_NORMAL[0] + 1), fame: 1 };
    // 의뢰인: 첫 의뢰(아직 끝낸 의뢰가 없고 첫 부지 전)는 튜토리얼 자리라 은발 마왕
    var first = RUN.siteNo === 0 && !RUN.history.length;
    var c = first ? FIRST_CLIENT : CLIENTS[rint(CLIENTS.length)];
    var a = BD.ATTRS[rint(BD.ATTRS.length)];
    return {
      id: RUN.qid++, kind: kind, grade: kind === 'main' ? MAIN_GRADES[RUN.mainGrade] : '',
      name: name, goals: goals, reward: reward, prog: { gold: 0, gems: 0, exp: 0, defends: 0 }, startWeek: 0,
      client: { name: c.name, kind: c.kind },
      attr: { id: a.id, label: a.label, effect: a.effect, counter: a.counter }
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
  // 의뢰를 받는다: 새 부지에 새로 짓기 시작 (시설·배치·남은 공사비는 사라지고 새 공사비, 금·보석·명성 유지)
  // choose(첫 시작) · settle(납품 화면) 둘 다에서 받는다. settle이면 인계: guardIds(최대 3, 없으면 지금 RUN.guards)를 친위대로 정하고
  // 친위대가 아닌 몬스터는 레벨·경험치·능력치를 처음 값(base)으로 (레벨업분만 사라짐. 보석 강화가 생기면 base에 들어가 남는다)
  function pickQuest(q, guardIds) {
    if ((RUN.phase !== 'choose' && RUN.phase !== 'settle') || !q || RUN.battling) return false;
    var found = (RUN.offers || []).filter(function (o) { return o.id === q.id; })[0];
    if (!found) return false;
    if (RUN.phase === 'settle') {
      var ids = Array.isArray(guardIds) ? guardIds : RUN.guards;
      var guards = [];
      ids.forEach(function (id) { if (guards.length < GUARD_MAX && monById(id) && guards.indexOf(id) < 0) guards.push(id); });
      RUN.guards = guards;
      RUN.monsters.forEach(function (m) {
        if (guards.indexOf(m.id) >= 0) return;
        m.lv = m.base.lv; m.hp = m.base.hp; m.atk = m.base.atk; m.exp = 0;
      });
      RUN.report = null;
    }
    found.startWeek = RUN.week;
    RUN.quest = found; RUN.offers = null; RUN.phase = 'play';
    RUN.site = freshSite();
    RUN.siteNo++;
    ensurePlan();   // 계획의 레벨·힘·속성은 새 부지(가치 0)와 새 의뢰 속성으로 다시 맞춰진다 (fitPlan)
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
      quest: q, base: q.reward.gold, sale: sale, gold: total, gems: q.reward.gems, fame: q.reward.fame, weeks: RUN.week - q.startWeek + 1,
      value: RUN.site.value, builds: RUN.site.builds, fameBefore: RUN.fame, goldBefore: RUN.gold, gemsBefore: RUN.gems, wasMain: wasMain,
      nextMain: '', carry: [], lost: []
    };
    RUN.gold += total; RUN.gems += q.reward.gems; RUN.fame += q.reward.fame;
    // 인계 표 (GAME_PLAN "총괄 제안 묶음" ①): 새 부지로 가져가는 것 · 사라지는 것 (화면 표시용 글)
    rep.carry = ['금 ' + comma(RUN.gold), '보석 ' + comma(RUN.gems), '명성 ' + RUN.fame, '부대장 전원',
      '친위대 몬스터의 레벨 (최대 ' + GUARD_MAX + ')'];
    rep.lost = ['이번 던전 시설·배치', '친위대가 아닌 몬스터의 레벨 (처음 값으로)'];
    if (grantLeft() > 0) rep.lost.push('남은 첫 건설 공사비 ' + comma(grantLeft()));
    if (wasMain) { RUN.questsDone = 0; RUN.mainGrade = Math.min(MAIN_GRADES.length - 1, RUN.mainGrade + 1); }
    else RUN.questsDone++;
    rep.nextMain = RUN.questsDone >= NORMAL_TO_MAIN ? '메인 의뢰가 열렸어요. 다음 후보에 나옵니다.'
      : '메인 의뢰까지 일반 의뢰 ' + RUN.questsDone + '/' + NORMAL_TO_MAIN + ' (다음 메인 ' + MAIN_GRADES[RUN.mainGrade] + '급)';
    RUN.history.push({ name: q.name, kind: q.kind, grade: q.grade, week: RUN.week });
    if (RUN.history.length > 30) RUN.history.shift();
    RUN.report = rep; RUN.quest = null; RUN.phase = 'settle';
    RUN.offers = null;
    offerQuests();                 // 같은 화면에서 고를 새 의뢰 후보 (안에서 저장)
    return rep;
  }
  function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  // 친위대: 몬스터 id 목록 (최대 3). 납품 화면에서 고르는 중에 저장해 둘 때 (pickQuest에 guardIds를 직접 줘도 된다)
  function setGuards(ids) {
    RUN.guards = ids.slice(0, GUARD_MAX);
    save();
  }
  // 예전 흐름(정산 -> 의뢰 고르기 화면) 호환용. 이제 납품 화면에서 바로 pickQuest하므로 상태를 바꾸지 않는다
  function toContract() { return RUN.phase === 'settle'; }

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
    if (battling || RUN.battling) return '전투 중에는 지을 수 없어요';
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
    // 첫 건설 공사비를 먼저 쓰고 모자란 만큼 금
    var fromGrant = Math.min(grantLeft(), cost), fromGold = cost - fromGrant;
    if (!why && RUN.gold < fromGold) why = '금 ' + (fromGold - RUN.gold) + ' 모자람';
    return {
      ok: !why, why: why, cost: cost, fromGrant: fromGrant, fromGold: fromGold, counts: cost > 0, goldAfter: RUN.gold - fromGold,
      grantAfter: grantLeft() - fromGrant, valueNow: now.value, valueAfter: after.value,
      back: back, zones: zones2, units: units2, from: cur
    };
  }
  function buildZone(z, k) {
    var p = previewBuild(z, k);
    if (!p.ok) return { ok: false, msg: p.why };
    RUN.site.grant -= p.fromGrant;         // 공사비 먼저
    RUN.gold -= p.fromGold;                // 쓴 금은 환불 없음
    RUN.site.zones[z] = k;
    RUN.site.units = p.units;
    if (p.counts) RUN.site.builds++;       // 돈(공사비·금)을 쓴 건설만 횟수에 센다 (공짜로 바꾸는 건 횟수 아님)
    save();
    var dv = p.valueAfter - p.valueNow, paid = [];
    if (p.fromGrant) paid.push('공사비 -' + p.fromGrant);
    if (p.fromGold || !p.fromGrant) paid.push('금 -' + p.fromGold);
    return { ok: true, msg: ZONES.NAMES[z] + ' ' + ZONES.FAC[k].name + ' 완공 (' + paid.join(', ') + ', 가치 ' + (dv >= 0 ? '+' : '') + dv + ')' };
  }
  // 이 부지에 남은 첫 건설 전용 공사비
  function grantLeft() { return RUN.site && RUN.site.grant > 0 ? RUN.site.grant : 0; }
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
    while (m.exp >= levelNeed(m.lv)) {
      var gBefore = gradeIdx(m.lv);
      m.exp -= levelNeed(m.lv); m.lv++;
      m.hp = Math.round(m.hp * 1.1); m.atk += 1;
      var line = m.name + ' Lv ' + m.lv + ' 레벨업';
      if (gradeIdx(m.lv) > gBefore) line += ' · 등급 ' + monGrade(m.lv) + ' 상승';
      msgs.push(line);
    }
  }

  // ---------- 이번 주 침입자 계획 ----------
  // 무리: { name, grade, count(명), lv(평균), roll(레벨 주사위 0~2), porters(분대 10명 중 짐꾼 수) }. 등급 낮은 무리부터 (등장 순서).
  // card = 가장 높은 등급 무리의 침입자 카드 id. order = 이벤트 카드 순서. seed = 전투 안 무작위 시드.
  // dlv = 던전 레벨, power = 침입자 힘 배율, attr = 이번 의뢰의 던전 속성 id. lv·dlv·power는 지금 던전 가치로 다시 맞춘다(fitPlan, 무작위 안 씀). 전투 시작 때 확정
  function dungeonLv(value) { return Math.floor(Math.max(0, value) / BD.VALUE_PER_DLV); }
  function enemyPower(value) { return BD.POWER_MIN + (1 - BD.POWER_MIN) * Math.min(1, Math.max(0, value) / BD.POWER_FULL_VALUE); }
  function fitPlan(p) {
    var v = siteValue(), dlv = dungeonLv(v), base = BD.BASE_LV + dlv + Math.floor(RUN.fame / BD.FAME_PER_LV);
    p.value = v; p.dlv = dlv; p.power = Math.round(enemyPower(v) * 100) / 100;
    p.attr = RUN.quest && RUN.quest.attr ? RUN.quest.attr.id : '';   // 던전 속성 (battle_sim.js가 fx를 더함)
    p.groups.forEach(function (g) { g.lv = base + BD.GRADE_STAT[g.grade].lvAdd + g.roll; });
    return p;
  }
  function makePlan(surge) {
    var spec = surge ? BD.SURGE : BD.NORMAL, groups = [], used = {};
    var card = BD.INVADER_CARDS[rint(BD.INVADER_CARDS.length)];
    spec.grades.forEach(function (g, i) {
      var st = BD.GRADE_STAT[g], names = BD.GROUP_NAMES[g], name;
      do { name = names[rint(names.length)]; } while (used[name] && names.length > 1);
      used[name] = true;
      var squads = spec.squads[0] + rint(spec.squads[1] - spec.squads[0] + 1);
      groups.push({
        name: name, grade: g, count: squads * BD.SQUAD, top: i === spec.grades.length - 1,
        lv: 0, roll: rint(3),
        porters: BD.PORTER_MIN + rint(BD.PORTER_MAX - BD.PORTER_MIN + 1)
      });
    });
    var order = BD.EVENT_CARDS.map(function (c, i) { return i; });
    for (var k = order.length - 1; k > 0; k--) { var j = rint(k + 1), t = order[k]; order[k] = order[j]; order[j] = t; }
    return fitPlan({ week: RUN.week, surge: !!surge, ad: RUN.adWeek === RUN.week, groups: groups, card: card.id, order: order, seed: (rnd() * 4294967296) | 0 });
  }
  // 전투 중이 아니면 계획을 이번 주에 맞추고, 레벨·힘은 지금 던전 가치로 다시 맞춘다
  function ensurePlan() {
    if (RUN.phase !== 'play' || RUN.battling) return;
    if (!RUN.plan || RUN.plan.week !== RUN.week || RUN.plan.surge !== isSurgeWeek()) RUN.plan = makePlan(isSurgeWeek());
    else fitPlan(RUN.plan);
  }
  // 홈 알림용: 이번 주 침입자 수·최고 등급·대량 출현 여부·평균 레벨(lv, 인원 가중)·던전 레벨(dlv)·힘 배율(power)
  function planInfo() {
    ensurePlan();
    var p = RUN.plan; if (!p) return null;
    var n = 0, lvSum = 0; p.groups.forEach(function (g) { n += g.count; lvSum += g.lv * g.count; });
    var top = p.groups[p.groups.length - 1];
    return { count: n, top: top.grade, topLv: top.lv, lv: n ? Math.round(lvSum / n) : 0, dlv: p.dlv, power: p.power,
      surge: p.surge, ad: p.ad, groups: p.groups.length };
  }
  // 광고 보기 (가짜): 이번 주를 대량 출현으로. 이미 대량 출현이면 아무 일 없음
  function watchAd() {
    if (RUN.phase !== 'play' || RUN.battling) return { ok: false, msg: '지금은 볼 수 없어요' };
    if (isSurgeWeek()) return { ok: false, msg: '이번 주는 이미 대량 출현이에요' };
    RUN.adWeek = RUN.week;
    ensurePlan();
    save();
    return { ok: true, msg: '광고 보상: 이번 주 모험가 대량 출현!' };
  }

  // ---------- 다음 주 = 이번 주 전투 시작 ----------
  // "다음 주"를 누르면 이번 주 전투가 시작된다 (취소 없음). 결과를 반영하면 한 주가 지나 다음 주가 된다
  // 이 부지에서 금을 쓴 건설이 하나도 없으면 막는다 (사용자 10-21). 레벨·힘은 여기서 확정 (전투 중에는 fitPlan 안 함)
  function startBattle() {
    if (RUN.phase !== 'play') return { ok: false, msgs: ['진행 중인 의뢰가 없어요'] };
    if (RUN.battling) return { ok: true, plan: RUN.plan, msgs: [] };
    if (!RUN.site.builds) return { ok: false, msgs: ['던전 건설에 금을 써야 다음 주로 진행할 수 있어요. [건설]에서 던전을 지어 주세요'] };
    ensurePlan();
    RUN.battling = true;
    RUN.bsave = freshBattleSave();
    save();
    return { ok: true, plan: RUN.plan, msgs: [] };
  }
  function battlePlan() { return RUN.battling ? RUN.plan : null; }
  // 전투 저장 지점 (새로고침하면 여기부터). 전투 시작 지점은 snap = null
  function battleSave() { return RUN.battling ? RUN.bsave : null; }
  // 카드를 고른 순간 battle.js가 부른다: cp = { snap, ui }. 배속은 setBattleSpeed로 따로
  function saveBattle(cp) {
    if (!RUN.battling || !cp || !cp.snap) return false;
    RUN.bsave.snap = cp.snap; RUN.bsave.ui = cp.ui || null;
    save();
    return true;
  }
  // 배속 설정은 바꿀 때마다 저장. 배속을 한 번 켰다는 기록(fastUsed)은 되돌아가지 않는다
  function setBattleSpeed(idx, fastUsed) {
    if (!RUN.battling) return;
    RUN.bsave.speedIdx = Math.max(0, Math.min(BD.SPEEDS.length - 1, idx | 0));
    RUN.bsave.fastUsed = RUN.bsave.fastUsed || !!fastUsed;
    save();
  }

  // ---------- 전투 결과 반영 ----------
  // res = battle_sim.js 결과 { kills, porterKills, total, squads, gold, gems(소수), exp, reached, retreated, timeout, loot(약탈 요청), damage(몬스터가 잃은 체력) }
  function applyBattle(res) {
    if (RUN.phase !== 'play' || !RUN.battling) return null;
    var msgs = [], p = RUN.plan;
    var goldBefore = RUN.gold, gemsBefore = RUN.gems;
    var gold = Math.max(0, Math.round(res.gold)), gems = Math.floor(res.gems), exp = Math.max(0, res.exp | 0);
    RUN.gold += gold;
    var loot = Math.min(Math.max(0, Math.round(res.loot)), gold);   // 약탈은 이번 전투에서 번 금 안에서만 (보물방은 미끼, 사용자 10-21)
    RUN.gold -= loot;
    var repair = Math.min(Math.round(res.damage * BD.REPAIR_PER_HP), RUN.gold);
    RUN.gold -= repair;
    RUN.gems += gems;
    // 경험치는 대기실에 든 몬스터에게 나눔 (아무도 없으면 부대 전체)
    var ids = Object.keys(usedIds()).map(Number), team = ids.length ? ids.map(monById) : RUN.monsters.slice();
    if (exp && team.length) {
      var each = Math.floor(exp / team.length), rest = exp - each * team.length;
      team.forEach(function (m, i) { addExp(m, each + (i < rest ? 1 : 0), msgs); });
    }
    var defended = res.reached === 0;  // 퇴각한 적은 보물방 침입으로 치지 않는다 (사용자 확인)
    var q = RUN.quest;
    q.prog.gold += gold; q.prog.gems += gems; q.prog.exp += exp; if (defended) q.prog.defends++;
    var rep = {
      week: RUN.week, surge: p.surge, ad: p.ad, kills: res.kills, porterKills: res.porterKills, total: res.total,
      gold: gold, gems: gems, exp: exp, reached: res.reached, squads: res.squads, retreated: res.retreated, timeout: !!res.timeout,
      loot: loot, repair: repair, goldBefore: goldBefore, goldAfter: RUN.gold, gemsBefore: gemsBefore, gemsAfter: RUN.gems,
      defended: defended, levelMsgs: msgs.slice(0, 4)
    };
    rep.hint = upgradeHint(gold - loot - repair, gems);
    // 한 주가 끝난다. 예고된 대량 출현을 치렀으면 다음 예고 (광고로 늘린 주는 예고와 따로)
    if (p.surge && RUN.week >= RUN.surgeWeek) RUN.surgeWeek = RUN.week + BD.SURGE_GAP[0] + rint(BD.SURGE_GAP[1] - BD.SURGE_GAP[0] + 1);
    RUN.week++;
    RUN.battling = false; RUN.bsave = null; RUN.plan = null; RUN.lastBattle = rep;
    ensurePlan();
    save();
    return rep;
  }
  // "이번 수입으로 할 수 있는 강화" 한 줄 (임시 문구)
  function upgradeHint(net, gems) {
    var parts = [];
    if (net > 0) {
      var c2 = ZONES.FAC.trap.perCell * 2, n = Math.floor(net / c2);
      parts.push(n > 0 ? '금 +' + net + '으로 2칸 함정 복도 ' + n + '곳을 지을 수 있어요' : '금 +' + net + ': 조금 더 모으면 함정 복도 (금 ' + c2 + ')');
    } else parts.push(net < 0 ? '금이 ' + (-net) + ' 줄었어요. 대기실 몬스터를 늘려 막아 보세요' : '이번엔 금 수입이 없어요. 함정이나 대기실을 지어 보세요');
    if (gems > 0) parts.push('보석 ' + gems + '개: ' + BD.GEM_UPGRADE.name + ' (준비 중)');
    return parts.join(' · ');
  }

  load();

  window.PROGRESS = {
    RUN: RUN, GOAL_TYPES: GOAL_TYPES, MAIN_GRADES: MAIN_GRADES, SITE_GRANT: SITE_GRANT,
    NORMAL_TO_MAIN: NORMAL_TO_MAIN, GUARD_MAX: GUARD_MAX,
    goalNow: goalNow, goalText: goalText, monGrade: monGrade, isSurgeWeek: isSurgeWeek, surgeIn: surgeIn,
    planInfo: planInfo, watchAd: watchAd, startBattle: startBattle, battlePlan: battlePlan, battleSave: battleSave, saveBattle: saveBattle, setBattleSpeed: setBattleSpeed, applyBattle: applyBattle, levelNeed: levelNeed, checkQuest: checkQuest, deliver: deliver,
    siteSummary: siteSummary, siteValue: siteValue, idleMonsters: idleMonsters, previewBuild: previewBuild, buildZone: buildZone,
    placeMonster: placeMonster, removeMonster: removeMonster, forecast: forecast, setBattle: setBattle, monById: monById,
    offerQuests: offerQuests, pickQuest: pickQuest, setGuards: setGuards, toContract: toContract, grantLeft: grantLeft,
    save: save, load: load, reset: reset
  };
})();
