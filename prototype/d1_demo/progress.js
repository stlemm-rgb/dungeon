/* D1 데모 진행 상태와 규칙 (화면 그리기 없음). C1 progress.js에서 이어 옴. 숫자·글 표는 battle_data.js (DEMO 아래)
 *
 * 공개 함수 목록·RUN 모양은 prototype/d1_demo/API.md. 규칙 요약 (docs/GAME_STRUCTURE.md 3·6절, GAME_PLAN 2026-10-22·23 절)
 *  1) 매주 전투: 현장의 "다음 주"(startBattle) -> 전투 -> applyBattle로 한 주가 끝남. 예산 0·건설 0이어도 진행 가능 (무료 기본 부대)
 *  2) 돈 분리: RUN.gold = 회사 금(영구, 전투 수입·납품 보수가 여기로) · RUN.site.budget = 의뢰 예산(그 의뢰의 건설·부대 조달 전용).
 *     예산이 모자라면 거절 (회사 금으로 대신 내지 않음). 남은 예산은 납품 때 사라짐. 환불 없음
 *  3) 던전 가치 = 지어 둔 시설 점수 합(zones.js summary, 몬스터 제외).
 *     던전 전투력 = B안: Σ(인계할 현장 부대 점수 U × 통과 비율 w) + Σ(함정 점수 T × w). 친위대·부대장·카드 제외 (powerOf)
 *  4) 납품 기준 5단계 (의뢰 데이터 stages): 단계마다 가치+전투력(+2층 전투력) 묶은 기준선. 순서대로 채우면 단계가 오르고(questUpdate, 한 번만 보상)
 *     5단계 = "의뢰 완료". 납품은 deliver()를 불러야 함(자동 납품 없음). 납품 직전에 지금 값으로 5단계를 다시 확인
 *  5) 의뢰 = 데모 고정 목록(BATTLE_DATA.QUESTS): 1층 의뢰(은발 마왕) -> 회사 레벨 2부터 2층 의뢰. 2층은 3단계에 열림(층 실제 구현은 2차)
 *     회사 레벨(RUN.company) = 전투·단계·납품으로 쌓는 경험치형. 침입자 강함이 옛 명성 대신 참조
 *  6) 부대 = 같은 부족 몇 명 묶음 (RUN.site.squads, 현장마다 새로, 납품 때 의뢰인에게 인계). 친위대(RUN.guards)만 이름 있는 개체, 다음 현장 동행.
 *     능력치는 statOf(unit, key) 한곳: 기본 × 레벨 + 강화 + 장비 + 인챈트 (장비·인챈트는 빈 자리 0). 경험치 = 출진·참여 단위
 *  7) 고정 구역: 의뢰마다(quest.fixed), 짓기·바꾸기를 로직에서 거부
 *  8) 데모에서 끈 기능(BATTLE_DATA.DEMO_OFF): 광고 뽑기·광고/예고 대량 출현·일일/주간 업무·방치 보상·공방 — 지급 경로에서 거부
 *  9) 무작위는 이 파일의 시드 무작위(rnd)만. 전투 안의 무작위는 plan.seed로 battle_sim.js가 굴림. 연출용 무작위는 shell.js fxRandom
 * phase(RUN.phase): choose = 의뢰 고르는 중 · play = 의뢰 진행 중 · settle = 납품 직후 정산 화면 (여기서 친위대 고르고 다음 의뢰 pickQuest)
 */
(function () {
  'use strict';

  // ---------- 데이터 ----------
  var SAVE_KEY = 'dunguen_d1_run';  // 데모는 C1과 다른 저장 키 (C1 세이브 보존)
  var VERSION = 6;                  // 6 = D1 데모 (회사 금/의뢰 예산 분리, 부대·친위대, 납품 기준 단계, 회사 레벨). 다르면 새 게임 (변환 없음)
  var BD = window.BATTLE_DATA;
  var OFF = BD.DEMO_OFF || {};
  var OFF_MSG = '데모에서는 준비 중이에요';
  var MON_GRADES = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
  function levelNeed(lv) { return 4 + lv * 2; } // 부대·친위대 경험치 몇이면 레벨업 (C1 그대로, 임시)
  function tribeData(id) { for (var i = 0; i < BD.TRIBES.length; i++) { if (BD.TRIBES[i].id === id) return BD.TRIBES[i]; } return null; }
  function tribeIds() { return BD.TRIBES.map(function (t) { return t.id; }); }

  // C1에서 이어 온 끈 기능의 숫자 (DEMO_OFF로 꺼져 있음. 다시 켤 때를 위해 남김)
  var WORKSHOP_DEFS = [
    { id: 'build', name: '건설 공방', desc: '건설비 할인', ready: true, maxLv: 3, per: 0.10, costs: [3, 6, 10] },
    { id: 'lab',   name: '연구실',   desc: '함정 연구: 함정 피해 증가', ready: true, maxLv: 3, per: 0.15, costs: [3, 6, 10] },
    { id: 'craft', name: '제작 공방', desc: '장비·인챈트 제작 (준비 중)', ready: false, maxLv: 3, per: 0, costs: [] }
  ];
  var CHORE_DEFS = {
    daily: [
      { id: 'd_battle',  ev: 'battle',  label: '전투 3번',          need: 3, gems: 2 },
      { id: 'd_build',   ev: 'build',   label: '던전 건설 2번',      need: 2, gems: 2 },
      { id: 'd_upgrade', ev: 'upgrade', label: '공방·부족 강화 1번', need: 1, gems: 3 }
    ],
    weekly: [
      { id: 'w_battle',  ev: 'battle',  label: '전투 15번',         need: 15, gems: 10 },
      { id: 'w_deliver', ev: 'deliver', label: '의뢰 납품 2번',      need: 2,  gems: 10 },
      { id: 'w_defend',  ev: 'defend',  label: '보물방 방어 5번',    need: 5,  gems: 10 }
    ]
  };
  var IDLE_BASE = 30, IDLE_PER_LV = 15, IDLE_MAX_HOURS = 8, IDLE_MIN_MIN = 10;

  // ---------- 지금 시각 (한곳) ----------
  var clockFn = null;
  function now() { return clockFn ? clockFn() : Date.now(); }
  function setClock(fn) { clockFn = typeof fn === 'function' ? fn : null; }

  // ---------- 상태: RUN 하나 (객체 자체는 바뀌지 않고 안의 값만 바뀐다) ----------
  var RUN = {};

  // 새 현장. q = 의뢰(없으면 의뢰 고르기 전 빈 현장). 판을 끼운 뒤(useBoard) 시설을 만든다
  //  zones 구역별 시설 · fixed 고정 구역 { 구역: FIXED_ZONES id } · units 대기실 { 구역: [부대·친위대 id] } · squads 현장 부대 ·
  //  budget 남은 의뢰 예산 · budgetStart 처음 예산 · spent 쓴 예산 · builds 예산을 쓴 건설 수 · value·power 저장 때 맞춰 둠 · floorsOpen 열린 층 수
  function freshSite(q) {
    var b = ZONES.useBoard(q && q.board || ZONES.DEFAULT_BOARD);
    var fixed = {}; Object.keys(q && q.fixed || {}).forEach(function (z) { fixed[z] = q.fixed[z]; });
    var zones = ZONES.defaultZones(fixed);
    Object.keys(fixed).forEach(function (z) { if (zones[z] !== ZONES.fixedFac(fixed[z])) delete fixed[z]; }); // 판에 없는 구역은 버림
    var site = { board: b, zones: zones, fixed: fixed, units: {}, squads: [], nextSquadNo: 1,
      budget: q ? q.budget : 0, budgetStart: q ? q.budget : 0, spent: 0, builds: 0, value: 0, power: 0, floorsOpen: 1 };
    if (q && BD.MON_SQUAD_FREE) {   // 무료 기본 부대 (예산 0이어도 진행 가능)
      site.squads.push(newSquad(site, BD.MON_SQUAD_FREE.tribe, BD.MON_SQUAD_FREE.count, true));
    }
    return site;
  }
  // 부대 하나: id 's'+번호, tribe 부족 id, count 인원, lv·exp 숙련도, free 무료 기본 부대인가
  function newSquad(site, tribe, count, free) {
    var sq = { id: 's' + site.nextSquadNo++, tribe: tribe, count: count, lv: squadStartLv(), exp: 0, free: !!free };
    return sq;
  }
  // 새 부대 시작 레벨: 회사 레벨에 따라 (BATTLE_DATA.SQUAD_START_LV)
  function squadStartLv() {
    var t = BD.SQUAD_START_LV || [1], lv = RUN.company ? RUN.company.lv : 1;
    return t[Math.min(t.length - 1, Math.max(0, lv - 1))];
  }

  function freshRun() {
    return {
      v: VERSION, seed: (Date.now() ^ 0x5bd1e995) | 0,
      week: 1, gold: BD.START.gold, gems: BD.START.gems, company: { lv: 1, exp: 0 },
      phase: 'choose', quest: null, offers: null, report: null,
      qid: 1, siteNo: 0, doneQuests: [],
      site: null,
      guards: [], nextGuardNo: 1,
      tribes: {}, contracts: tribeIds(), works: [], stats: { battles: 0, delivers: 0 },
      surgeWeek: BD.SURGE_FIRST, adWeek: 0, plan: null, battling: false, bsave: null, lastBattle: null, history: [],
      prefs: freshPrefs(), workshop: freshWorkshop(),
      chores: freshChores(), idle: freshIdle(), lastSeen: now(),
      tutorial: { on: true, seen: {} }
    };
  }
  // ---------- 일일·주간 업무 상태 (데모에서 꺼짐: 진행·받기 없음) ----------
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function mondayOf(ms) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7); }
  function weekKey(ms) { return dayKey(mondayOf(ms).getTime()); }
  function choreKey(scope, ms) { return scope === 'daily' ? dayKey(ms) : weekKey(ms); }
  function choreResetIn(scope, ms) {
    var d = new Date(ms), next;
    if (scope === 'daily') next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    else { var m = mondayOf(ms); next = new Date(m.getFullYear(), m.getMonth(), m.getDate() + 7); }
    return Math.max(0, next.getTime() - ms);
  }
  function freshChoreScope(scope, ms) {
    return { key: choreKey(scope, ms), tasks: CHORE_DEFS[scope].map(function (t) { return { id: t.id, prog: 0, claimed: false }; }) };
  }
  function freshChores() { var t = now(); return { daily: freshChoreScope('daily', t), weekly: freshChoreScope('weekly', t) }; }
  function freshIdle() { return { gold: 0, minutes: 0 }; }
  function freshWorkshop() { var w = {}; WORKSHOP_DEFS.forEach(function (d) { w[d.id] = 0; }); return w; }
  // 설정 칸: 마지막 배속(BD.SPEEDS 번호)과 배속 때 카드 수
  function freshPrefs() { return { speedIdx: 0, cards: 1 }; }
  // 전투 저장 지점: snap = battle_sim.js snapshot (null이면 전투 시작 지점), ui = 화면 진행, fastUsed = 이 전투에서 배속을 켠 적
  function freshBattleSave() { return { snap: null, ui: null, fastUsed: false }; }

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function nonNeg(v) { return typeof v === 'number' && isFinite(v) && v > 0 ? v : 0; }
  // 불러온 뒤 빠지거나 깨진 칸 채우기 (v6 저장 칸 전부)
  function ensureStateReady() {
    if (typeof RUN.week !== 'number' || RUN.week < 1) RUN.week = 1;
    RUN.gold = Math.floor(nonNeg(RUN.gold)); RUN.gems = Math.floor(nonNeg(RUN.gems));
    if (!isObj(RUN.company)) RUN.company = { lv: 1, exp: 0 };
    RUN.company.lv = Math.max(1, RUN.company.lv | 0); RUN.company.exp = Math.max(0, RUN.company.exp | 0);
    if (typeof RUN.qid !== 'number') RUN.qid = 1;
    if (typeof RUN.siteNo !== 'number') RUN.siteNo = 0;
    if (!Array.isArray(RUN.doneQuests)) RUN.doneQuests = [];
    if (!Array.isArray(RUN.history)) RUN.history = [];
    if (!Array.isArray(RUN.works)) RUN.works = [];
    if (!isObj(RUN.stats)) RUN.stats = { battles: 0, delivers: 0 };
    RUN.stats.battles = Math.max(0, RUN.stats.battles | 0); RUN.stats.delivers = Math.max(0, RUN.stats.delivers | 0);
    if (['choose', 'play', 'settle'].indexOf(RUN.phase) < 0) RUN.phase = 'choose';
    if (RUN.battling && (!RUN.bsave || typeof RUN.bsave !== 'object')) RUN.bsave = freshBattleSave();
    if (!RUN.battling) { RUN.battling = false; RUN.bsave = null; }
    var pf = isObj(RUN.prefs) ? RUN.prefs : (RUN.prefs = freshPrefs());
    if (typeof pf.speedIdx !== 'number') pf.speedIdx = 0;
    pf.speedIdx = Math.max(0, Math.min(BD.SPEEDS.length - 1, pf.speedIdx | 0));
    if (typeof pf.cards !== 'number') pf.cards = 1;
    pf.cards = Math.max(0, Math.min(BD.CARD_AT.length, pf.cards | 0));
    // 끈 기능 칸 (값은 남겨 둠)
    if (!isObj(RUN.workshop)) RUN.workshop = freshWorkshop();
    WORKSHOP_DEFS.forEach(function (d) { var v = RUN.workshop[d.id]; RUN.workshop[d.id] = typeof v === 'number' ? Math.max(0, Math.min(d.maxLv, v | 0)) : 0; });
    if (!isObj(RUN.chores)) RUN.chores = freshChores();
    ['daily', 'weekly'].forEach(function (sc) {
      var c = RUN.chores[sc];
      if (!isObj(c) || typeof c.key !== 'string' || !Array.isArray(c.tasks)) { RUN.chores[sc] = freshChoreScope(sc, now()); return; }
      var byId = {}; c.tasks.forEach(function (t) { if (t && typeof t.id === 'string') byId[t.id] = t; });
      c.tasks = CHORE_DEFS[sc].map(function (d) {
        var o = byId[d.id] || {};
        return { id: d.id, prog: typeof o.prog === 'number' ? Math.max(0, Math.min(d.need, o.prog | 0)) : 0, claimed: o.claimed === true };
      });
    });
    if (!isObj(RUN.idle)) RUN.idle = freshIdle();
    RUN.idle.gold = Math.floor(nonNeg(RUN.idle.gold)); RUN.idle.minutes = Math.min(IDLE_MAX_HOURS * 60, Math.floor(nonNeg(RUN.idle.minutes)));
    if (typeof RUN.lastSeen !== 'number') RUN.lastSeen = null;
    if (typeof RUN.surgeWeek !== 'number') RUN.surgeWeek = BD.SURGE_FIRST;
    if (typeof RUN.adWeek !== 'number') RUN.adWeek = 0;
    // 부족 강화·사용권
    if (!isObj(RUN.tribes)) RUN.tribes = {};
    Object.keys(RUN.tribes).forEach(function (k) {
      if (!tribeData(k)) { delete RUN.tribes[k]; return; }
      var v = RUN.tribes[k]; RUN.tribes[k] = typeof v === 'number' && v > 0 ? Math.min(BD.TRIBE_UP.max, v | 0) : 0;
    });
    var cs = []; (Array.isArray(RUN.contracts) ? RUN.contracts : tribeIds()).forEach(function (n) { if (tribeData(n) && cs.indexOf(n) < 0) cs.push(n); });
    RUN.contracts = cs;
    // 친위대
    if (!Array.isArray(RUN.guards)) RUN.guards = [];
    RUN.guards = RUN.guards.filter(function (g) { return isObj(g) && typeof g.id === 'string' && tribeData(g.tribe); }).slice(0, BD.GUARD.max);
    RUN.guards.forEach(fixLevel);
    if (typeof RUN.nextGuardNo !== 'number') RUN.nextGuardNo = RUN.guards.length + 1;
    // 현장
    if (!isObj(RUN.site) || !isObj(RUN.site.zones)) RUN.site = freshSite(RUN.phase === 'choose' ? null : RUN.quest);
    var st = RUN.site;
    if (!ZONES.hasBoard(st.board)) st.board = ZONES.DEFAULT_BOARD;
    ZONES.useBoard(st.board);
    if (!isObj(st.fixed)) st.fixed = {};
    Object.keys(st.fixed).forEach(function (z) { st.zones[z] = ZONES.fixedFac(st.fixed[z]); });   // 고정 구역은 늘 그대로
    if (!Array.isArray(st.squads)) st.squads = [];
    st.squads = st.squads.filter(function (s) { return isObj(s) && typeof s.id === 'string' && tribeData(s.tribe); });
    st.squads.forEach(function (s) { s.count = Math.max(0, Math.min(BD.MON_SQUAD.cap, s.count | 0)); s.free = s.free === true; fixLevel(s); });
    if (typeof st.nextSquadNo !== 'number') st.nextSquadNo = st.squads.length + 1;
    ['budget', 'budgetStart', 'spent', 'builds'].forEach(function (k) { st[k] = nonNeg(st[k]); });
    st.floorsOpen = Math.max(1, st.floorsOpen | 0);
    if (!isObj(st.units)) st.units = {};
    var seen = {};
    Object.keys(st.units).forEach(function (z) {
      var k = st.zones[z], slots = k ? ZONES.slotsOf(k, z) : 0;
      var list = (Array.isArray(st.units[z]) ? st.units[z] : []).filter(function (id) { var ok = !seen[id] && !!rawUnit(id); seen[id] = true; return ok; }).slice(0, slots);
      if (list.length) st.units[z] = list; else delete st.units[z];
    });
    // 튜토리얼
    var tu = RUN.tutorial;
    if (!isObj(tu)) tu = RUN.tutorial = { on: false, seen: {} };
    tu.on = tu.on === true;
    if (!isObj(tu.seen)) tu.seen = {};
    if (RUN.phase === 'play' && !RUN.quest) RUN.phase = 'choose';
    if (RUN.quest) fixQuest(RUN.quest);
  }
  function fixLevel(u) { u.lv = Math.max(1, u.lv | 0); u.exp = Math.max(0, u.exp | 0); }
  function fixQuest(q) {
    q.stage = Math.max(0, Math.min(q.stages.length, q.stage | 0));
    if (!Array.isArray(q.stageWeeks)) q.stageWeeks = [];
  }
  function setRun(src) {
    Object.keys(RUN).forEach(function (k) { delete RUN[k]; });
    Object.keys(src).forEach(function (k) { RUN[k] = src[k]; });
  }

  // ---------- 저장 (막혀도 동작) ----------
  function save() {
    if (RUN.site && RUN.site.zones) { RUN.site.value = siteValue(); RUN.site.power = sitePower(); } // 저장된 가치·전투력은 늘 지금 값
    RUN.lastSeen = now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(RUN)); } catch (e) { /* 저장이 막힌 환경: 그냥 계속 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.v === VERSION && typeof d.week === 'number' && typeof d.gold === 'number' && isObj(d.company) && isObj(d.site) &&
            isObj(d.site.zones) && Array.isArray(d.site.squads) &&
            (d.phase !== 'play' || (isObj(d.quest) && Array.isArray(d.quest.stages) && d.quest.stages.length))) {
          setRun(d); ensureStateReady(); ensurePlan(); accrueIdle(); save(); return true;
        }
      }
    } catch (e) { /* 깨진 저장은 무시하고 새로 시작 */ }
    setRun(freshRun());
    RUN.site = freshSite(null);
    return false;
  }
  function reset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
    setRun(freshRun());
    RUN.site = freshSite(null);
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
  function gradeIdx(lv) { return Math.max(0, Math.min(MON_GRADES.length - 1, Math.floor(lv / 2))); }
  function monGrade(lv) { return MON_GRADES[gradeIdx(lv)]; }
  function isSurgeWeek() { return (!OFF.surge && RUN.week >= RUN.surgeWeek) || (!OFF.adSurge && RUN.adWeek === RUN.week); }
  function surgeIn() { return OFF.surge ? null : Math.max(0, RUN.surgeWeek - RUN.week); }
  function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  // ---------- 부대·친위대 ----------
  function squadById(id) { var l = RUN.site ? RUN.site.squads : []; for (var i = 0; i < l.length; i++) { if (l[i].id === id) return l[i]; } return null; }
  function guardById(id) { for (var i = 0; i < RUN.guards.length; i++) { if (RUN.guards[i].id === id) return RUN.guards[i]; } return null; }
  function rawUnit(id) { return typeof id !== 'string' ? null : id.charAt(0) === 's' ? squadById(id) : id.charAt(0) === 'g' ? guardById(id) : null; }
  function isGuard(u) { return !!u && typeof u.id === 'string' && u.id.charAt(0) === 'g'; }

  // 능력치 한 항목의 조각: base 기본 · level 레벨 성장 · upgrade 부족 보석 강화 · equip 장비 · enchant 인챈트 (장비·인챈트는 아직 0, 자리만)
  // u = 부대 또는 친위대 (RUN 안의 원본). 1명 기준 값. 친위대는 GUARD.mul 배
  function statParts(u, key) {
    var t = tribeData(u.tribe), mul = isGuard(u) ? (BD.GUARD.mul[key] || 1) : 1;
    var b = (t.base[key] || 0) * mul, g = t.grow[key] || 0, up = RUN.tribes[t.id] || 0;
    var step = (key === 'hp' || key === 'atk') ? Math.max(1, Math.round(t.base[key] * BD.TRIBE_UP.per)) * mul : 0;
    return { base: b, level: b * g * (u.lv - 1), upgrade: step * up, equip: 0, enchant: 0 };
  }
  // 능력치 한 항목 (계산은 여기 한곳). key = BATTLE_DATA.STATS의 key (hp 체력 · atk 초당 공격 · def 받는 피해 감소)
  function statOf(u, key) {
    var p = statParts(u, key), v = p.base + p.level + p.upgrade + p.equip + p.enchant;
    if (key === 'def') return Math.min(BD.DEF_MAX, Math.round(v * 100) / 100);
    if (key === 'hp') return Math.round(v);
    return Math.round(v * 100) / 100;
  }
  function statsOf(u) { var o = {}; BD.STATS.forEach(function (s) { o[s.key] = statOf(u, s.key); }); return o; }
  // 부대 점수 U (전투력 B안): 인원 × (1인 체력 ÷ hpDiv + 1인 초당 공격)
  function squadScore(s) { return s.count * (statOf(s, 'hp') / BD.POWER.hpDiv + statOf(s, 'atk')); }
  // 화면·전투용 보기: { id, kind, tribe, tribeName, name, count, cap, lv, exp, need, hp, atk, def, free, placed(구역 또는 '') }
  function unitView(u) {
    if (!u) return null;
    var t = tribeData(u.tribe), g = isGuard(u), st = statsOf(u);
    return { id: u.id, kind: g ? 'guard' : 'squad', tribe: t.id, tribeName: t.name, name: g ? u.name : t.name + ' 부대',
      count: g ? 1 : u.count, cap: g ? 1 : BD.MON_SQUAD.cap, lv: u.lv, exp: u.exp, need: levelNeed(u.lv),
      hp: st.hp, atk: st.atk, def: st.def, free: !!u.free, placed: placedZone(u.id) };
  }
  function unitById(id) { return unitView(rawUnit(id)); }
  function placedZone(id) {
    var us = RUN.site ? RUN.site.units : {};
    for (var z in us) { if (us[z].indexOf(id) >= 0) return z; }
    return '';
  }
  function squads() { return (RUN.site ? RUN.site.squads : []).map(unitView); }
  function guards() { return RUN.guards.map(unitView); }
  function usedIds() {
    var used = {};
    Object.keys(RUN.site.units).forEach(function (z) { RUN.site.units[z].forEach(function (id) { used[id] = true; }); });
    return used;
  }
  // 대기실에 안 든 부대·친위대 (보기 목록)
  function idleUnits() {
    var used = usedIds();
    return RUN.site.squads.concat(RUN.guards).filter(function (u) { return !used[u.id] && (isGuard(u) || u.count > 0); }).map(unitView);
  }

  // ---------- 던전 가치·전투력 ----------
  function siteSummary() {
    var s = ZONES.summary(RUN.site.zones, RUN.site.units, rawUnit);
    s.power = sitePower();
    s.budget = budgetLeft();
    return s;
  }
  function siteValue() { return ZONES.summary(RUN.site.zones, {}, null).value; }
  // 인계 편성: 대기실 배치에서 친위대를 뺀 것 (현장 부대만)
  function handoverUnits(units) {
    var o = {};
    Object.keys(units).forEach(function (z) {
      var l = units[z].filter(function (id) { var u = rawUnit(id); return u && !isGuard(u) && u.count > 0; });
      if (l.length) o[z] = l;
    });
    return o;
  }
  // 던전 전투력 B안 (+ 구역별 조각). floor = 층 (지금은 1층뿐. 2층 전투력은 2차에서)
  function powerParts(zones, units) {
    var hand = handoverUnits(units), w = ZONES.passRatios(zones, hand), parts = [], total = 0;
    Object.keys(zones).forEach(function (z) {
      var f = ZONES.FAC[zones[z]];
      if (!f || z === 'Y' || !ZONES.CELLS[z]) return;
      var r = w[z] || 0, score = 0;
      if (f.kind === 'trap') score = ZONES.trapScore(z, workshopEffect('lab'));
      else if (f.kind === 'den') (hand[z] || []).forEach(function (id) { score += squadScore(rawUnit(id)); });
      else return;
      if (!score) return;
      parts.push({ z: z, kind: f.kind, score: Math.round(score * 10) / 10, w: Math.round(r * 1000) / 1000, power: Math.round(score * r * 10) / 10 });
      total += score * r;
    });
    return { total: Math.floor(total + 1e-6), parts: parts };
  }
  function powerOf(zones, units) { return powerParts(zones, units).total; }
  function sitePower() { return powerOf(RUN.site.zones, RUN.site.units); }
  function powerInfo() { return powerParts(RUN.site.zones, RUN.site.units); }
  function floorPower(floor) { return floor === 1 ? sitePower() : 0; }   // 2층 이상은 2차 (지금은 0)
  // 침입자 강함에 쓰는 위협 점수 = 가치 + 전투력
  function threatOf() { return siteValue() + sitePower(); }

  // ---------- 회사 레벨 ----------
  function companyNeed(lv) { var t = BD.COMPANY.need; return t[Math.min(t.length - 1, Math.max(0, lv - 1))]; }
  function addCompanyExp(n) {
    var c = RUN.company, ups = 0;
    c.exp += Math.max(0, n | 0);
    while (c.exp >= companyNeed(c.lv)) { c.exp -= companyNeed(c.lv); c.lv++; ups++; }
    return ups;
  }
  function company() { return { lv: RUN.company.lv, exp: RUN.company.exp, need: companyNeed(RUN.company.lv) }; }

  // ---------- 작품집 ----------
  function worksBonus() { var e = BD.WORKS_EFFECT; return RUN.works.length >= e.needWorks ? e.squadExp : 0; }
  function worksInfo() {
    var e = BD.WORKS_EFFECT;
    return { list: RUN.works.slice(), effect: { id: e.id, label: e.label, text: e.text, active: RUN.works.length >= e.needWorks } };
  }

  // ---------- 의뢰 ----------
  function questData(key) { for (var i = 0; i < BD.QUESTS.length; i++) { if (BD.QUESTS[i].key === key) return BD.QUESTS[i]; } return null; }
  function attrView(id) { var a = BD.ATTRS.filter(function (x) { return x.id === id; })[0] || BD.ATTRS[0]; return { id: a.id, label: a.label, effect: a.effect, counter: a.counter }; }
  function makeQuest(d) {
    return {
      id: RUN.qid++, key: d.key, kind: 'normal', grade: '', name: d.name, tutorial: d.key === BD.QUESTS[0].key,
      client: { name: d.client.name, kind: d.client.kind }, attr: attrView(d.attr), floors: d.floors, board: d.board,
      fixed: JSON.parse(JSON.stringify(d.fixed || {})), budget: d.budget, reward: JSON.parse(JSON.stringify(d.reward)),
      stages: JSON.parse(JSON.stringify(d.stages)), stage: 0, stageWeeks: [], startWeek: 0
    };
  }
  // 후보: 데모 의뢰 중 회사 레벨이 되고 아직 안 끝낸 것 (순서대로). 한 번 만들면 저장 (새로고침해도 같음). 다 끝냈으면 []
  function offerQuests() {
    if (RUN.offers && RUN.offers.length) return RUN.offers;
    if (RUN.phase === 'play') return [];
    var list = BD.QUESTS.filter(function (d) { return d.minCompanyLv <= RUN.company.lv && RUN.doneQuests.indexOf(d.key) < 0; }).map(makeQuest);
    RUN.offers = list;
    save();
    return list;
  }
  // 회사 레벨 때문에 아직 못 받는 다음 의뢰 (화면의 🔒 안내용). 없으면 null
  function lockedQuest() {
    var d = BD.QUESTS.filter(function (x) { return x.minCompanyLv > RUN.company.lv && RUN.doneQuests.indexOf(x.key) < 0; })[0];
    return d ? { key: d.key, name: d.name, floors: d.floors, minCompanyLv: d.minCompanyLv } : null;
  }

  // ---------- 납품 기준 ----------
  function curValues() { return { value: siteValue(), power: sitePower(), floor2: floorPower(2) }; }
  function meets(stg, cur) { return cur.value >= stg.value && cur.power >= stg.power && (!stg.floor2 || cur.floor2 >= stg.floor2); }
  // 단계 올리기: 지금 값이 다음 단계를 채우면 순서대로 올림 (한 번만, 회사 경험치 + 층 열림). 새로 오른 단계 번호 목록
  function questUpdate() {
    var q = RUN.quest, out = [];
    if (RUN.phase !== 'play' || !q) return out;
    var cur = curValues();
    while (q.stage < q.stages.length && meets(q.stages[q.stage], cur)) {
      var stg = q.stages[q.stage];
      q.stage++; q.stageWeeks.push(RUN.week); out.push(q.stage);
      addCompanyExp(BD.COMPANY.gain.stage);
      if (stg.opens) RUN.site.floorsOpen = Math.max(RUN.site.floorsOpen, stg.opens);
    }
    return out;
  }
  // 진행표: { stage, total, complete(5단계 기록), canDeliver(지금 값으로도 5단계 충족), why, cur{value,power,floor2}, next(다음 기준) | null,
  //  floors, floorsOpen, floorLock { floor, atStage } | null, line(한 줄 글) }
  function questProgress() {
    var q = RUN.quest;
    if (RUN.phase !== 'play' || !q) return null;
    var cur = curValues(), total = q.stages.length, complete = q.stage >= total;
    var nx = complete ? null : q.stages[q.stage], last = q.stages[total - 1];
    var lock = null;
    if (q.floors > RUN.site.floorsOpen) {
      for (var i = 0; i < total; i++) { if (q.stages[i].opens > RUN.site.floorsOpen) { lock = { floor: q.stages[i].opens, atStage: i + 1 }; break; } }
    }
    var tgt = nx || last, why = '';
    if (!complete) why = '납품 기준 ' + total + '단계를 모두 채워야 납품할 수 있어요';
    else if (!meets(last, cur)) why = '지금 값이 ' + total + '단계 기준보다 낮아요 (가치 ' + cur.value + '/' + last.value + ' · 전투력 ' + cur.power + '/' + last.power + ')';
    else if (RUN.battling) why = '전투 중에는 납품할 수 없어요';
    var line = (complete ? '의뢰 완료 · ' : '납품 기준 ' + q.stage + '/' + total + ' · ') + '가치 ' + cur.value + '/' + tgt.value + ' · 전투력 ' + cur.power + '/' + tgt.power;
    if (tgt.floor2) line += ' · 2층 전투력 ' + cur.floor2 + '/' + tgt.floor2;
    return {
      stage: q.stage, total: total, complete: complete, canDeliver: !why, why: why, cur: cur,
      next: nx ? { stage: q.stage + 1, value: nx.value, power: nx.power, floor2: nx.floor2 || 0, opens: nx.opens || 0 } : null,
      floors: q.floors, floorsOpen: RUN.site.floorsOpen, floorLock: lock, line: line,
      budget: budgetLeft(), budgetStart: RUN.site.budgetStart
    };
  }
  function checkQuest() { var p = questProgress(); return !!(p && p.canDeliver); }
  function questBlockers() { var p = questProgress(); return p && p.why ? [p.why] : []; }

  // ---------- 튜토리얼 ----------
  function tutorial() {
    var seen = {}; Object.keys(RUN.tutorial.seen).forEach(function (k) { seen[k] = true; });
    return { on: RUN.tutorial.on, seen: seen };
  }
  function tutorialSeen(id) {
    if (typeof id !== 'string' || !id) return false;
    RUN.tutorial.seen[id] = true;
    save();
    return true;
  }
  // 건너뛰기: 안내만 끈다 (데모 의뢰 순서는 그대로)
  function skipTutorial() { RUN.tutorial.on = false; save(); return true; }
  // 튜토리얼 중 첫 현장에서 분대 하나가 갈 길 (입구 'E'부터 보물방 'B'). 아니면 null
  function tutorialPath() {
    if (!RUN.tutorial.on || RUN.phase !== 'play' || RUN.siteNo !== 1) return null;
    return ZONES.routeOf(RUN.site.zones, RUN.site.units, {});
  }

  // ---------- 의뢰 받기 (새 현장) ----------
  // q = 후보 의뢰(또는 그 id). settle(납품 화면)에서는 promoteIds = 친위대로 데려갈 현장 부대 id 목록:
  //  그 부대의 대장이 이름 있는 친위대가 되어 부대의 레벨·경험치를 이어받는다 (친위대 최대 GUARD.max, 이미 있는 친위대는 늘 남음).
  //  나머지 현장 부대·시설·남은 예산은 의뢰인에게 인계 (사라짐). 회사 금·보석·회사 레벨·부족 강화·작품집은 남음
  function pickQuest(q, promoteIds) {
    if ((RUN.phase !== 'choose' && RUN.phase !== 'settle') || !q || RUN.battling) return false;
    var qid = typeof q === 'object' ? q.id : q;
    var found = (RUN.offers || []).filter(function (o) { return o.id === qid; })[0];
    if (!found) return false;
    if (RUN.phase === 'settle') {
      (Array.isArray(promoteIds) ? promoteIds : []).forEach(function (id) {
        var s = squadById(id);
        if (!s || RUN.guards.length >= BD.GUARD.max || RUN.guards.some(function (g) { return g.fromSquad === s.id + '@' + RUN.siteNo; })) return;
        RUN.guards.push(makeGuard(s));
      });
      RUN.report = null;
    }
    found.startWeek = RUN.week;
    RUN.quest = found; RUN.offers = null; RUN.phase = 'play';
    RUN.siteNo++;
    RUN.site = freshSite(found);   // 판도 여기서 바꿔 끼운다
    questUpdate();
    ensurePlan();
    save();
    return true;
  }
  function makeGuard(s) {
    var t = tribeData(s.tribe), same = RUN.guards.filter(function (g) { return g.tribe === s.tribe; }).length;
    return { id: 'g' + RUN.nextGuardNo++, tribe: s.tribe, name: t.guardName + (same ? ' ' + (same + 1) + '호' : ''), intro: t.guardIntro,
      lv: s.lv, exp: s.exp, from: RUN.history.length ? RUN.history[RUN.history.length - 1].name : '', fromSquad: s.id + '@' + RUN.siteNo };
  }

  // ---------- 납품 ----------
  // 5단계를 채운 뒤(의뢰 완료) 불러야 납품. 지금 값으로 5단계를 다시 확인. 안 되면 null (이유는 questBlockers)
  function deliver() {
    if (!checkQuest()) return null;
    var q = RUN.quest, cur = curValues();
    var rep = {
      quest: q, gold: q.reward.gold, gems: q.reward.gems, companyExp: q.reward.companyExp || 0,
      goldBefore: RUN.gold, gemsBefore: RUN.gems, companyBefore: company(), weeks: RUN.week - q.startWeek + 1,
      value: cur.value, power: cur.power, stage: q.stage, builds: RUN.site.builds, board: RUN.site.board,
      budgetLeft: budgetLeft(), budgetStart: RUN.site.budgetStart,
      handover: RUN.site.squads.filter(function (s) { return s.count > 0; }).map(unitView), work: null, worksEffectNew: false,
      carry: [], lost: []
    };
    var hadEffect = worksBonus() > 0;
    RUN.gold += rep.gold; RUN.gems += rep.gems;
    addCompanyExp(rep.companyExp);
    rep.companyAfter = company();
    var work = { no: RUN.works.length + 1, key: q.key, name: q.name, client: q.client.name, attr: q.attr.id, value: cur.value, power: cur.power, week: RUN.week };
    RUN.works.push(work);
    rep.work = work; rep.worksEffectNew = !hadEffect && worksBonus() > 0;
    RUN.doneQuests.push(q.key);
    RUN.stats.delivers++;
    choreAdd('deliver');
    RUN.tutorial.on = false;
    // 인계 표 (화면 표시용 글): 남는 것 · 의뢰인에게 넘어가는 것
    rep.carry = ['회사 금 ' + comma(RUN.gold), '보석 ' + comma(RUN.gems), '회사 레벨 ' + RUN.company.lv, '친위대 (최대 ' + BD.GUARD.max + ', 다음 현장 동행)', '작품집 ' + RUN.works.length + '점'];
    var tb = Object.keys(RUN.tribes).filter(function (n) { return RUN.tribes[n] > 0; }).map(function (n) { return tribeData(n).name + ' +' + RUN.tribes[n]; });
    if (tb.length) rep.carry.push('부족 보석 강화: ' + tb.join(' · '));
    rep.lost = ['던전 시설 (의뢰인에게 인계)', '현장 부대 ' + rep.handover.length + '개 (의뢰인에게 인계, 친위대로 고른 대장은 동행)'];
    if (rep.budgetLeft > 0) rep.lost.push('남은 의뢰 예산 ' + comma(rep.budgetLeft));
    RUN.history.push({ name: q.name, key: q.key, week: RUN.week });
    if (RUN.history.length > 30) RUN.history.shift();
    RUN.report = rep; RUN.quest = null; RUN.phase = 'settle'; RUN.plan = null;
    RUN.offers = null;
    offerQuests();   // 같은 화면에서 고를 다음 의뢰 후보 (안에서 저장). 데모 의뢰를 다 끝냈으면 []
    return rep;
  }

  // ---------- 편집 공통 ----------
  var battling = false;   // 전투 화면에 있는 동안 (shell.js가 setBattle로 알려 줌. 저장하지 않음)
  function setBattle(b) { battling = !!b; }
  function canEdit() {
    if (RUN.phase !== 'play') return '진행 중인 의뢰가 없어요';
    if (battling || RUN.battling) return '전투 중에는 바꿀 수 없어요';
    return '';
  }
  function budgetLeft() { return RUN.site && RUN.site.budget > 0 ? RUN.site.budget : 0; }
  function afterChange() { var st = questUpdate(); ensurePlan(); save(); return st; }

  // ---------- 건설 (의뢰 예산만) ----------
  // 구역 z를 시설 k로 지으면: 비용·가치·전투력 변화·막히는 이유. 미리보기 (아무것도 바꾸지 않음)
  function previewBuild(z, k) {
    if (RUN.site && RUN.site.fixed && RUN.site.fixed[z]) return { ok: false, why: '고정 구역이라 바꿀 수 없어요', fixed: true };
    var f = ZONES.FAC[k];
    if (!f || ZONES.ALL.indexOf(z) < 0 || ZONES.facFor(z).indexOf(k) < 0) return { ok: false, why: '지을 수 없는 시설' };
    var cur = RUN.site.zones[z], bc = buildCostInfo(k, z), cost = bc.cost;
    var zones2 = {}; Object.keys(RUN.site.zones).forEach(function (q) { zones2[q] = RUN.site.zones[q]; });
    zones2[z] = k;
    var units2 = {}; Object.keys(RUN.site.units).forEach(function (q) { units2[q] = RUN.site.units[q].slice(); });
    var slots = ZONES.slotsOf(k, z), back = 0;
    if (units2[z]) { back = Math.max(0, units2[z].length - slots); units2[z] = units2[z].slice(0, slots); if (!units2[z].length) delete units2[z]; }
    var why = canEdit();
    if (!why && cur === k) why = '이미 이 시설이에요';
    if (!why && cost > budgetLeft()) why = '의뢰 예산 ' + (cost - budgetLeft()) + ' 모자람';
    return {
      ok: !why, why: why, cost: cost, baseCost: bc.base, discount: bc.discount, counts: cost > 0,
      budgetAfter: budgetLeft() - cost, valueNow: siteValue(), valueAfter: ZONES.summary(zones2, {}, null).value,
      powerNow: sitePower(), powerAfter: powerOf(zones2, units2),
      back: back, zones: zones2, units: units2, from: cur
    };
  }
  function buildZone(z, k) {
    var p = previewBuild(z, k);
    if (!p.ok) return { ok: false, msg: p.why };
    RUN.site.budget -= p.cost;      // 의뢰 예산만 (회사 금 안 씀, 환불 없음)
    RUN.site.spent += p.cost;
    RUN.site.zones[z] = k;
    RUN.site.units = p.units;
    if (p.counts) { RUN.site.builds++; choreAdd('build'); }
    var stages = afterChange();
    var dv = p.valueAfter - p.valueNow;
    return { ok: true, msg: ZONES.NAMES[z] + ' ' + ZONES.FAC[k].name + ' 완공 (예산 -' + p.cost + ', 가치 ' + (dv >= 0 ? '+' : '') + dv + ')', stages: stages };
  }
  function buildCostInfo(k, z) {
    var base = ZONES.costOf(k, z), rate = workshopEffect('build');
    var discount = Math.min(base, Math.round(base * rate));
    return { base: base, discount: discount, cost: base - discount };
  }
  function buildCost(k, z) { return buildCostInfo(k, z).cost; }

  // ---------- 부대 조달 (의뢰 예산만) ----------
  function procureInfo(tribe) {
    var t = tribeData(tribe);
    if (!t) return null;
    var cost = BD.MON_SQUAD.newCost[tribe], why = canEdit();
    if (!why && RUN.contracts.indexOf(tribe) < 0) why = t.name + ' 사용권이 없어요';
    if (!why && cost > budgetLeft()) why = '의뢰 예산 ' + (cost - budgetLeft()) + ' 모자람';
    return { tribe: tribe, name: t.name, count: BD.MON_SQUAD.start, cap: BD.MON_SQUAD.cap, lv: squadStartLv(), cost: cost, canAfford: !why, why: why };
  }
  // 새 부대 조달 (START명). 대기 중으로 들어온다
  function procureSquad(tribe) {
    var inf = procureInfo(tribe);
    if (!inf) return { ok: false, msg: '없는 부족이에요', unit: null };
    if (!inf.canAfford) return { ok: false, msg: inf.why, unit: null };
    RUN.site.budget -= inf.cost; RUN.site.spent += inf.cost;
    var s = newSquad(RUN.site, tribe, BD.MON_SQUAD.start, false);
    RUN.site.squads.push(s);
    var stages = afterChange();
    return { ok: true, msg: inf.name + ' 부대 조달 (예산 -' + inf.cost + ', ' + s.count + '명)', unit: unitView(s), stages: stages };
  }
  function refillInfo(id) {
    var s = squadById(id);
    if (!s) return null;
    var cost = BD.MON_SQUAD.memberCost[s.tribe], why = canEdit();
    if (!why && s.count >= BD.MON_SQUAD.cap) why = '정원(' + BD.MON_SQUAD.cap + '명)이 찼어요';
    if (!why && cost > budgetLeft()) why = '의뢰 예산 ' + (cost - budgetLeft()) + ' 모자람';
    return { id: id, count: s.count, cap: BD.MON_SQUAD.cap, cost: cost, canAfford: !why, why: why };
  }
  // 부대에 1명 보충
  function refillSquad(id) {
    var inf = refillInfo(id);
    if (!inf) return { ok: false, msg: '없는 부대예요' };
    if (!inf.canAfford) return { ok: false, msg: inf.why };
    var s = squadById(id);
    RUN.site.budget -= inf.cost; RUN.site.spent += inf.cost;
    s.count++;
    var stages = afterChange();
    return { ok: true, msg: tribeData(s.tribe).name + ' 부대 보충 (예산 -' + inf.cost + ', ' + s.count + '/' + BD.MON_SQUAD.cap + '명)', stages: stages };
  }

  // ---------- 대기실 배치 (공짜) ----------
  function placeUnit(z, id) {
    var why = canEdit();
    if (why) return { ok: false, msg: why };
    var k = RUN.site.zones[z], slots = k ? ZONES.slotsOf(k, z) : 0, us = RUN.site.units[z] || [];
    if (!slots) return { ok: false, msg: '몬스터 대기실이 아니에요' };
    if (us.length >= slots) return { ok: false, msg: '자리가 없어요' };
    var u = rawUnit(id);
    if (!u || usedIds()[id] || (!isGuard(u) && u.count <= 0)) return { ok: false, msg: '넣을 수 없는 부대' };
    RUN.site.units[z] = us.concat([id]);
    var stages = afterChange();
    return { ok: true, msg: unitView(u).name + ' 출진', stages: stages };
  }
  function removeUnit(z, index) {
    var why = canEdit();
    if (why) return { ok: false, msg: why };
    var us = RUN.site.units[z] || [];
    if (us[index] === undefined) return { ok: false, msg: '뺄 부대가 없어요' };
    var u = unitById(us[index]);
    RUN.site.units[z] = us.slice(0, index).concat(us.slice(index + 1));
    if (!RUN.site.units[z].length) delete RUN.site.units[z];
    afterChange();
    return { ok: true, msg: (u ? u.name : '부대') + ' 대기로' };
  }
  // 문 위 숫자 미리 보기
  function forecast(zones, units) { return ZONES.forecast(zones || RUN.site.zones, units || RUN.site.units, ZONES.PREVIEW_INVADERS); }

  // ---------- 성장 (출진·참여 경험치) ----------
  function addExp(u, n, msgs) {
    u.exp += n;
    while (u.exp >= levelNeed(u.lv)) {
      u.exp -= levelNeed(u.lv); u.lv++;
      msgs.push(unitView(u).name + ' Lv ' + u.lv + ' 레벨업');
    }
  }

  // ---------- 이번 주 침입자 계획 ----------
  // dlv = 던전 레벨, power = 침입자 힘 배율. 위협 점수(가치 + 전투력)와 회사 레벨로 다시 맞춘다 (무작위 안 씀). 전투 시작 때 확정
  function dungeonLv(score) { return Math.floor(Math.max(0, score) / BD.VALUE_PER_DLV); }
  function enemyPower(score) { return BD.POWER_MIN + (1 - BD.POWER_MIN) * Math.min(1, Math.max(0, score) / BD.POWER_FULL_VALUE); }
  function fitPlan(p) {
    var v = threatOf(), dlv = dungeonLv(v), base = BD.BASE_LV + dlv + Math.floor((RUN.company.lv - 1) / BD.CLV_PER_LV);
    p.value = v; p.dlv = dlv; p.power = Math.round(enemyPower(v) * 100) / 100;
    p.attr = RUN.quest && RUN.quest.attr ? RUN.quest.attr.id : '';
    p.trapBoost = Math.round(workshopEffect('lab') * 100) / 100;
    p.groups.forEach(function (g) { g.lv = base + BD.GRADE_STAT[g.grade].lvAdd + g.roll; });
    return p;
  }
  function makePlan(surge) {
    var spec = surge ? BD.SURGE : BD.NORMAL, groups = [], used = {};
    var card = BD.INVADER_CARDS[rint(BD.INVADER_CARDS.length)];
    spec.grades.forEach(function (g, i) {
      var names = BD.GROUP_NAMES[g], name;
      do { name = names[rint(names.length)]; } while (used[name] && names.length > 1);
      used[name] = true;
      var sq = spec.squads[0] + rint(spec.squads[1] - spec.squads[0] + 1);
      groups.push({ name: name, grade: g, count: sq * BD.SQUAD, top: i === spec.grades.length - 1, lv: 0, roll: rint(3),
        porters: BD.PORTER_MIN + rint(BD.PORTER_MAX - BD.PORTER_MIN + 1) });
    });
    var order = BD.EVENT_CARDS.map(function (c, i) { return i; });
    for (var k = order.length - 1; k > 0; k--) { var j = rint(k + 1), t = order[k]; order[k] = order[j]; order[j] = t; }
    return fitPlan({ week: RUN.week, surge: !!surge, ad: !OFF.adSurge && RUN.adWeek === RUN.week, groups: groups, card: card.id, order: order, seed: (rnd() * 4294967296) | 0 });
  }
  function ensurePlan() {
    if (RUN.phase !== 'play' || RUN.battling) return;
    if (!RUN.plan || RUN.plan.week !== RUN.week || RUN.plan.surge !== isSurgeWeek()) RUN.plan = makePlan(isSurgeWeek());
    else fitPlan(RUN.plan);
  }
  function planInfo() {
    ensurePlan();
    var p = RUN.plan; if (!p) return null;
    var n = 0, lvSum = 0; p.groups.forEach(function (g) { n += g.count; lvSum += g.lv * g.count; });
    var top = p.groups[p.groups.length - 1];
    return { count: n, top: top.grade, topLv: top.lv, lv: n ? Math.round(lvSum / n) : 0, dlv: p.dlv, power: p.power,
      surge: p.surge, ad: p.ad, groups: p.groups.length };
  }
  // 광고 보기 (데모에서 꺼짐)
  function watchAd() {
    if (OFF.adSurge) return { ok: false, msg: OFF_MSG };
    if (RUN.phase !== 'play' || RUN.battling) return { ok: false, msg: '지금은 볼 수 없어요' };
    if (isSurgeWeek()) return { ok: false, msg: '이번 주는 이미 대량 출현이에요' };
    RUN.adWeek = RUN.week;
    ensurePlan();
    save();
    return { ok: true, msg: '광고 보상: 이번 주 모험가 대량 출현!' };
  }
  // 이벤트 카드 규칙 (B안 위기 때만 최대 2장. 위기 감지는 2차): { mode, maxPerBattle, crisisProgress }
  function cardRule() { var c = BD.CARD_RULE; return { mode: c.mode, maxPerBattle: c.maxPerBattle, crisisProgress: c.crisisProgress }; }

  // ---------- 다음 주 = 이번 주 전투 시작 ----------
  // 언제든 진행 가능 (예산 0·건설 0이어도. 무료 기본 부대)
  function startBattle() {
    if (RUN.phase !== 'play') return { ok: false, msgs: ['진행 중인 의뢰가 없어요'] };
    if (RUN.battling) return { ok: true, plan: RUN.plan, msgs: [] };
    ensurePlan();
    RUN.battling = true;
    RUN.bsave = freshBattleSave();
    save();
    return { ok: true, plan: RUN.plan, msgs: [] };
  }
  function battlePlan() { return RUN.battling ? RUN.plan : null; }
  function battleSave() { return RUN.battling ? RUN.bsave : null; }
  function saveBattle(cp) {
    if (!RUN.battling || !cp || !cp.snap) return false;
    RUN.bsave.snap = cp.snap; RUN.bsave.ui = cp.ui || null;
    save();
    return true;
  }
  function setBattleSpeed(idx, fastUsed) {
    RUN.prefs.speedIdx = Math.max(0, Math.min(BD.SPEEDS.length - 1, idx | 0));
    if (RUN.battling && RUN.bsave) RUN.bsave.fastUsed = !!fastUsed;
    save();
  }
  function setCardCount(n) {
    RUN.prefs.cards = Math.max(0, Math.min(BD.CARD_AT.length, n | 0));
    save();
  }
  // 전투 입력 (battle.js가 BSIM.create에 그대로 넘김)
  function battleInput(plan) { return { plan: plan || RUN.plan, zones: RUN.site.zones, units: RUN.site.units, unitById: unitById }; }

  // ---------- 전투 결과 반영 ----------
  // res = battle_sim.js result { kills, porterKills, total, squads, gold, gems(소수), exp, reached, retreated, timeout, loot, damage, deployed, fought }
  //  회사 금 += 이번 전투 금 - 약탈(이번 전투 금 안에서만). 수리비 없음(D1). 경험치 = 출진 deploy + 실제로 싸웠으면 fight (현장 부대는 작품집 효과 +%)
  function applyBattle(res) {
    if (RUN.phase !== 'play' || !RUN.battling) return null;
    var msgs = [], p = RUN.plan;
    var goldBefore = RUN.gold, gemsBefore = RUN.gems, compBefore = company();
    var gold = Math.max(0, Math.round(res.gold || 0)), gems = Math.max(0, Math.floor(res.gems || 0));
    var loot = Math.min(Math.max(0, Math.round(res.loot || 0)), gold);   // 약탈은 이번 전투에서 번 금 안에서만
    RUN.gold += gold - loot;
    RUN.gems += gems;
    var deployed = Array.isArray(res.deployed) ? res.deployed : Object.keys(usedIds());
    var fought = Array.isArray(res.fought) ? res.fought : [];
    var gains = [], bonus = worksBonus();
    deployed.forEach(function (id) {
      var u = rawUnit(id);
      if (!u) return;
      var n = BD.EXP.deploy + (fought.indexOf(id) >= 0 ? BD.EXP.fight : 0);
      if (!isGuard(u)) n = Math.round(n * (1 + bonus));
      var lv0 = u.lv;
      addExp(u, n, msgs);
      gains.push({ id: id, name: unitView(u).name, exp: n, lvBefore: lv0, lvAfter: u.lv });
    });
    addCompanyExp(BD.COMPANY.gain.battle);
    RUN.stats.battles++;
    var defended = res.reached === 0;  // 퇴각한 적은 보물방 침입으로 치지 않는다
    choreAdd('battle'); if (defended) choreAdd('defend');
    var stages = questUpdate();
    var rep = {
      week: RUN.week, surge: p.surge, ad: p.ad, kills: res.kills, porterKills: res.porterKills, total: res.total,
      gold: gold, gems: gems, exp: res.exp | 0, reached: res.reached, squads: res.squads, retreated: res.retreated, timeout: !!res.timeout,
      loot: loot, repair: 0, goldBefore: goldBefore, goldAfter: RUN.gold, gemsBefore: gemsBefore, gemsAfter: RUN.gems,
      defended: defended, levelMsgs: msgs.slice(0, 4), expGains: gains, stages: stages,
      companyBefore: compBefore, companyAfter: company(), progress: questProgress()
    };
    rep.hint = gems > 0 ? '보석 +' + gems + ' (지금 ' + RUN.gems + '개): 군단에서 부족 보석 강화에 쓸 수 있어요' : '';
    if (!OFF.surge && p.surge && RUN.week >= RUN.surgeWeek) RUN.surgeWeek = RUN.week + BD.SURGE_GAP[0] + rint(BD.SURGE_GAP[1] - BD.SURGE_GAP[0] + 1);
    RUN.week++;
    RUN.battling = false; RUN.bsave = null; RUN.plan = null; RUN.lastBattle = rep;
    ensurePlan();
    save();
    return rep;
  }

  // ---------- 해금 (경험 중심, GAME_STRUCTURE 5절) ----------
  function unlocks() {
    return { corps: RUN.stats.battles > 0, guards: RUN.stats.delivers > 0, works: RUN.works.length > 0,
      floor2: !!(RUN.site && RUN.site.floorsOpen >= 2), secondQuest: RUN.company.lv >= (BD.QUESTS[1] ? BD.QUESTS[1].minCompanyLv : 99) };
  }

  // ---------- 공방 (데모에서 꺼짐) ----------
  function workshopDef(id) { for (var i = 0; i < WORKSHOP_DEFS.length; i++) { if (WORKSHOP_DEFS[i].id === id) return WORKSHOP_DEFS[i]; } return null; }
  function workshopEffect(id) {
    var d = workshopDef(id);
    if (OFF.workshop || !d || !d.ready || !RUN.workshop) return 0;
    return d.per * (RUN.workshop[id] || 0);
  }
  function upgradeBlock() { return RUN.battling || battling ? '전투 중에는 강화할 수 없어요' : ''; }
  function workshopInfo(id) {
    var d = workshopDef(id);
    if (!d) return null;
    var lv = RUN.workshop[id] || 0;
    return { lv: lv, maxLv: d.maxLv, ready: d.ready && !OFF.workshop, off: !!OFF.workshop, effect: OFF.workshop ? OFF_MSG : d.desc, next: null, cost: null, canAfford: false };
  }
  function upgradeWorkshop(id) {
    if (OFF.workshop) return { ok: false, msg: OFF_MSG };
    var d = workshopDef(id);
    if (!d || !d.ready) return { ok: false, msg: '준비 중이에요' };
    var lv = RUN.workshop[id] || 0;
    if (lv >= d.maxLv) return { ok: false, msg: d.name + '은(는) 최대 단계예요' };
    var why = upgradeBlock(); if (why) return { ok: false, msg: why };
    var c = d.costs[lv];
    if (RUN.gems < c) return { ok: false, msg: '보석 ' + (c - RUN.gems) + '개 모자람' };
    RUN.gems -= c; RUN.workshop[id] = lv + 1;
    afterChange();
    return { ok: true, msg: d.name + ' ' + (lv + 1) + '단계' };
  }

  // ---------- 부족 보석 강화 (영구, 보석) ----------
  function tribeCost(lv) { var c = BD.TRIBE_UP.costs; return c[Math.min(c.length - 1, lv)]; }
  function tribeStepOf(t) { return { hp: Math.max(1, Math.round(t.base.hp * BD.TRIBE_UP.per)), atk: Math.max(1, Math.round(t.base.atk * BD.TRIBE_UP.per)) }; }
  function tribeInfo(id) {
    var t = tribeData(id);
    if (!t) return null;
    var lv = RUN.tribes[id] || 0, st = tribeStepOf(t), top = lv >= BD.TRIBE_UP.max, c = top ? null : tribeCost(lv);
    var why = top ? '데모에서는 ' + BD.TRIBE_UP.max + '단계까지예요' : upgradeBlock();
    if (!why && RUN.contracts.indexOf(id) < 0) why = t.name + ' 사용권이 없어요';
    if (!why && RUN.gems < c) why = '보석 ' + (c - RUN.gems) + '개 모자람';
    return {
      id: id, name: t.name, lv: lv, max: BD.TRIBE_UP.max, contracted: RUN.contracts.indexOf(id) >= 0,
      effect: lv ? '1명 체력 +' + st.hp * lv + ' · 공격 +' + st.atk * lv : '보석 강화 없음',
      next: top ? null : '1명 체력 +' + st.hp * (lv + 1) + ' · 공격 +' + st.atk * (lv + 1),
      cost: top ? null : { gems: c }, canAfford: !why, why: why
    };
  }
  // 그 부족 전원(현장 부대·친위대·앞으로 조달할 부대)의 강화 단계 +1 (statOf가 RUN.tribes를 읽음)
  function upgradeTribe(id) {
    var inf = tribeInfo(id);
    if (!inf) return { ok: false, msg: '없는 부족이에요' };
    if (!inf.canAfford) return { ok: false, msg: inf.why };
    RUN.gems -= inf.cost.gems;
    RUN.tribes[id] = inf.lv + 1;
    choreAdd('upgrade');
    var stages = afterChange();
    return { ok: true, msg: inf.name + ' 보석 강화 +' + (inf.lv + 1) + ' (보석 -' + inf.cost.gems + ', ' + tribeInfo(id).effect + ')', stages: stages };
  }

  // ---------- 광고 뽑기 (데모에서 꺼짐. C1 원본은 prototype/c1_shell/progress.js) ----------
  function gachaInfo() { return { off: true, left: 0, perDay: 0, resetIn: 0, rates: [], pool: [] }; }
  function gachaPull() { return { ok: false, msg: OFF_MSG, result: null }; }

  // ---------- 일일·주간 업무 (데모에서 꺼짐: 진행이 안 오르고 보상도 못 받음) ----------
  function choreRoll() {
    var t = now(), changed = false;
    ['daily', 'weekly'].forEach(function (sc) {
      if (RUN.chores[sc].key !== choreKey(sc, t)) { RUN.chores[sc] = freshChoreScope(sc, t); changed = true; }
    });
    return changed;
  }
  function choreDef(scope, id) { var l = CHORE_DEFS[scope] || []; for (var i = 0; i < l.length; i++) { if (l[i].id === id) return l[i]; } return null; }
  function choreAdd(ev, n) {
    if (OFF.chores) return;
    choreRoll();
    ['daily', 'weekly'].forEach(function (sc) {
      RUN.chores[sc].tasks.forEach(function (t) {
        var d = choreDef(sc, t.id);
        if (d && d.ev === ev) t.prog = Math.min(d.need, t.prog + (n || 1));
      });
    });
  }
  function choreView(sc, t) {
    var c = RUN.chores[sc];
    return {
      key: c.key, resetIn: choreResetIn(sc, t), off: !!OFF.chores,
      tasks: c.tasks.map(function (x) {
        var d = choreDef(sc, x.id);
        return { id: x.id, label: d.label, need: d.need, prog: x.prog, reward: { gems: d.gems }, done: x.prog >= d.need, claimed: x.claimed };
      })
    };
  }
  function chores() {
    if (choreRoll()) save();
    var t = now();
    return { off: !!OFF.chores, daily: choreView('daily', t), weekly: choreView('weekly', t) };
  }
  function claimChore(scope, id) {
    if (OFF.chores) return { ok: false, msg: OFF_MSG, gems: 0 };
    if (scope !== 'daily' && scope !== 'weekly') return { ok: false, msg: '없는 업무예요', gems: 0 };
    if (choreRoll()) save();
    var d = choreDef(scope, id), t = RUN.chores[scope].tasks.filter(function (x) { return x.id === id; })[0];
    if (!d || !t) return { ok: false, msg: '없는 업무예요', gems: 0 };
    if (t.claimed) return { ok: false, msg: '이미 받았어요', gems: 0 };
    if (t.prog < d.need) return { ok: false, msg: '아직 못 채웠어요 (' + t.prog + '/' + d.need + ')', gems: 0 };
    t.claimed = true;
    RUN.gems += d.gems;
    save();
    return { ok: true, msg: d.label + ' 보상: 보석 +' + d.gems, gems: d.gems };
  }
  function choresClaimable() {
    if (OFF.chores) return 0;
    if (choreRoll()) save();
    var n = 0;
    ['daily', 'weekly'].forEach(function (sc) {
      RUN.chores[sc].tasks.forEach(function (x) { var d = choreDef(sc, x.id); if (d && !x.claimed && x.prog >= d.need) n++; });
    });
    return n;
  }

  // ---------- 방치 보상 (데모에서 꺼짐: 쌓이지도 받지도 않음) ----------
  function idleRate() {
    var sum = 0; WORKSHOP_DEFS.forEach(function (d) { sum += RUN.workshop[d.id] || 0; });
    return IDLE_BASE + sum * IDLE_PER_LV;
  }
  function accrueIdle() {
    if (OFF.idle) return;
    var t = now(), last = RUN.lastSeen;
    if (typeof last !== 'number' || t <= last) return;
    var maxMin = IDLE_MAX_HOURS * 60;
    var mins = Math.floor(Math.min(t - last, maxMin * 60000) / 60000);
    if (mins < IDLE_MIN_MIN) return;
    var add = Math.min(mins, maxMin - RUN.idle.minutes);
    if (add <= 0) return;
    RUN.idle.minutes += add;
    RUN.idle.gold += Math.round(idleRate() * add / 60);
  }
  function idleInfo() {
    if (OFF.idle) return { off: true, gold: 0, minutes: 0, capped: false, maxHours: IDLE_MAX_HOURS, rate: 0 };
    return { off: false, gold: RUN.idle.gold, minutes: RUN.idle.minutes, capped: RUN.idle.minutes >= IDLE_MAX_HOURS * 60, maxHours: IDLE_MAX_HOURS, rate: idleRate() };
  }
  function claimIdle() {
    if (OFF.idle) return { ok: false, msg: OFF_MSG, gold: 0 };
    var g = RUN.idle.gold;
    if (g <= 0) return { ok: false, msg: '받을 방치 보상이 없어요', gold: 0 };
    RUN.gold += g;
    RUN.idle = freshIdle();
    save();
    return { ok: true, msg: '공방 생산: 금 +' + g, gold: g };
  }

  load();

  window.PROGRESS = {
    RUN: RUN, VERSION: VERSION, SAVE_KEY: SAVE_KEY, GUARD_MAX: BD.GUARD.max, OFF: OFF,
    // 의뢰·납품
    offerQuests: offerQuests, lockedQuest: lockedQuest, pickQuest: pickQuest, questProgress: questProgress, questUpdate: questUpdate,
    checkQuest: checkQuest, questBlockers: questBlockers, deliver: deliver,
    // 현장: 가치·전투력·예산·건설
    siteSummary: siteSummary, siteValue: siteValue, sitePower: sitePower, powerInfo: powerInfo, powerOf: powerOf, budgetLeft: budgetLeft,
    previewBuild: previewBuild, buildZone: buildZone, buildCost: buildCost, forecast: forecast,
    // 부대·친위대
    TRIBES: BD.TRIBES, STATS: BD.STATS, squads: squads, guards: guards, unitById: unitById, monById: unitById, idleUnits: idleUnits,
    statOf: function (id, key) { var u = rawUnit(id); return u ? statOf(u, key) : 0; },
    statParts: function (id, key) { var u = rawUnit(id); return u ? statParts(u, key) : null; },
    procureInfo: procureInfo, procureSquad: procureSquad, refillInfo: refillInfo, refillSquad: refillSquad,
    placeUnit: placeUnit, removeUnit: removeUnit, levelNeed: levelNeed, monGrade: monGrade,
    tribeInfo: tribeInfo, upgradeTribe: upgradeTribe,
    // 회사·작품집·해금
    company: company, worksInfo: worksInfo, unlocks: unlocks,
    // 전투
    planInfo: planInfo, isSurgeWeek: isSurgeWeek, surgeIn: surgeIn, watchAd: watchAd, cardRule: cardRule,
    startBattle: startBattle, battlePlan: battlePlan, battleInput: battleInput, battleSave: battleSave, saveBattle: saveBattle,
    setBattleSpeed: setBattleSpeed, setCardCount: setCardCount, applyBattle: applyBattle, setBattle: setBattle,
    // 튜토리얼
    tutorial: tutorial, tutorialSeen: tutorialSeen, skipTutorial: skipTutorial, tutorialPath: tutorialPath,
    // 데모에서 꺼진 기능 (늘 거절·0)
    WORKSHOPS: WORKSHOP_DEFS.map(function (d) { return { id: d.id, name: d.name, desc: d.desc, ready: d.ready && !OFF.workshop, maxLv: d.maxLv }; }),
    workshopInfo: workshopInfo, upgradeWorkshop: upgradeWorkshop, gachaInfo: gachaInfo, gachaPull: gachaPull,
    chores: chores, claimChore: claimChore, choresClaimable: choresClaimable, idleInfo: idleInfo, claimIdle: claimIdle,
    // 저장·시계
    setClock: setClock, save: save, load: load, reset: reset
  };
})();
