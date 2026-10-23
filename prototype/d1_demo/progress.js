/* D1 데모 진행 상태와 규칙 (화면 그리기 없음). C1 progress.js에서 이어 옴. 숫자·글 표는 battle_data.js (DEMO 아래)
 *
 * 공개 함수 목록·RUN 모양은 prototype/d1_demo/API.md. 규칙 요약 (docs/GAME_STRUCTURE.md 3·6절, GAME_PLAN 2026-10-22·23 절)
 *  1) 매주 전투: 현장의 "다음 주"(startBattle) -> 전투 -> applyBattle로 한 주가 끝남. 마석 0·건설 0이어도 진행 가능 (무료 기본 부대)
 *  2) 돈 분리: RUN.gold = 회사 금(영구, 전투 수입·납품 보수가 여기로) · RUN.site.budget = 마석(그 의뢰의 건설·부대 조달 전용).
 *     마석이 모자라면 거절 (회사 금으로 대신 내지 않음). 남은 마석은 납품 때 사라짐. 환불 없음
 *  3) 던전 가치 = 지어 둔 시설 점수 합(zones.js summary, 몬스터 제외).
 *     던전 전투력 = B안: Σ(인계할 현장 부대 점수 U × 통과 비율 w) + Σ(함정 점수 T × w). 친위대·부대장·카드 제외 (powerOf)
 *  4) 납품 기준 5단계 (의뢰 데이터 stages): 단계마다 가치+전투력(+2층 전투력) 묶은 기준선. 순서대로 채우면 단계가 오르고(questUpdate, 한 번만 보상)
 *     5단계 = "의뢰 완료". 납품은 deliver()를 불러야 함(자동 납품 없음). 납품 직전에 지금 값으로 5단계를 다시 확인
 *  5) 의뢰 = 데모 고정 목록(BATTLE_DATA.QUESTS): 1층 의뢰(은발 마왕) -> 회사 레벨 2부터 2층 의뢰. 2층은 3단계에 열림 (+ 추가 마석).
 *     다 납품하면 settle -> leaveSettle() -> phase 'demoEnd' (데모 끝)
 *  10) 2차: 세로 층 (zones.js useSite: 2층 구역 id는 '2E'·'2H'..., 열리면 1층 B = 계단) · 층별 출진 (site.deploy, 층마다 한도, 기본 자동 편성,
 *     출진한 부대는 그 층 대기실에 나눠 섬 = arrange) · 퇴각(다음 주 쉼)·사망(큰 피해 때만, 첫 의뢰 없음, 친위대 불사)·전멸 무료 보충 ·
 *     카드 위기(battle_sim.js 'crisis' 사건, 전투당 최대 2장) · 의뢰인 마석 보급 · 주소 옵션 ?seed=
 *     회사 레벨(RUN.company) = 전투·단계·납품으로 쌓는 경험치형. 침입자 강함이 옛 명성 대신 참조
 *  6) 부대 = 같은 부족 몇 명 묶음 (RUN.site.squads, 현장마다 새로, 납품 때 의뢰인에게 인계). 친위대(RUN.guards)만 이름 있는 개체, 다음 현장 동행.
 *     능력치는 statOf(unit, key) 한곳: 기본 × 레벨 + 강화 + 장비 + 인챈트 (장비·인챈트는 빈 자리 0). 경험치 = 출진·참여 단위
 *  7) 고정 구역: 의뢰마다(quest.fixed), 짓기·바꾸기를 로직에서 거부
 *  8) 데모에서 끈 기능(BATTLE_DATA.DEMO_OFF): 광고 뽑기·광고/예고 대량 출현·일일/주간 업무·방치 보상·공방 — 지급 경로에서 거부
 *  9) 무작위는 이 파일의 시드 무작위(rnd)만. 전투 안의 무작위는 plan.seed로 battle_sim.js가 굴림. 연출용 무작위는 shell.js fxRandom
 * phase(RUN.phase): choose = 의뢰 고르는 중 · play = 의뢰 진행 중 · settle = 납품 직후 정산 화면 (여기서 친위대 고르고 다음 의뢰 pickQuest) · demoEnd = 데모 끝
 */
(function () {
  'use strict';

  // ---------- 데이터 ----------
  var SAVE_KEY = 'dunguen_d1_run';  // 데모는 C1과 다른 저장 키 (C1 세이브 보존)
  var VERSION = 6;                  // 6 = D1 데모 (회사 금/마석 분리, 부대·친위대, 납품 기준 단계, 회사 레벨). 다르면 새 게임 (변환 없음)
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

  // 새 현장. q = 의뢰(없으면 의뢰 고르기 전 빈 현장). 배치를 끼운 뒤(useSite: 판 + 층 수 + 열린 층) 시설을 만든다
  //  zones 구역별 시설 (모든 층, 2층 구역 id는 '2E'·'2H'처럼 층 번호가 붙음) · fixed 고정 구역 { 구역: FIXED_ZONES id } ·
  //  floors 의뢰 층 수 · floorsOpen 열린 층 수 · deploy 층별 출진 { '1': [부대·친위대 id], '2': [...] } (층마다 출진 한도) ·
  //  pins 예전 placeUnit으로 고른 대기실 { id: 구역 } · auto 기본 자동 편성 켬 · rest 쉬는 부대 { id: 쉬는 주 } ·
  //  units 대기실 배치 { 구역: [id] } (deploy에서 계산해 저장, 읽기 전용) · squads 현장 부대 ·
  //  budget 남은 마석 · budgetStart 처음 마석 · budgetAdded 단계 보상으로 늘어난 마석 · spent 쓴 마석 · builds 마석을 쓴 건설 수 · value·power 저장 때 맞춰 둠
  function freshSite(q) {
    var floors = q && q.floors > 1 ? q.floors | 0 : 1;
    var b = ZONES.useSite(q && q.board || ZONES.DEFAULT_BOARD, floors, 1);
    var fixed = {}; Object.keys(q && q.fixed || {}).forEach(function (z) { fixed[z] = q.fixed[z]; });
    var zones = ZONES.defaultZones(fixed);
    Object.keys(fixed).forEach(function (z) { if (zones[z] !== ZONES.fixedFac(fixed[z])) delete fixed[z]; }); // 판에 없는 구역은 버림
    var site = { board: b, zones: zones, fixed: fixed, units: {}, squads: [], nextSquadNo: 1,
      floors: floors, floorsOpen: 1, deploy: freshDeploy(floors), pins: {}, auto: true, rest: {},
      budget: q ? q.budget : 0, budgetStart: q ? q.budget : 0, budgetAdded: 0, spent: 0, builds: 0, value: 0, power: 0 };
    if (q && BD.MON_SQUAD_FREE) {   // 무료 기본 부대 (마석 0이어도 진행 가능)
      site.squads.push(newSquad(site, BD.MON_SQUAD_FREE.tribe, BD.MON_SQUAD_FREE.count, true));
    }
    return site;
  }
  function freshDeploy(floors) { var d = {}; for (var n = 1; n <= floors; n++) d[n] = []; return d; }
  // 지금 현장의 판·층 배치를 ZONES에 끼운다 (불러오기·새 현장·층 열림 때)
  function useSiteLayout() { var s = RUN.site; ZONES.useSite(s.board, s.floors || 1, s.floorsOpen || 1); }
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

  // 주소 옵션 ?seed=숫자: 새 게임 씨앗 고정 (저장이 없을 때·reset 때. 재현 검사용). 없거나 숫자가 아니면 null
  function urlSeed() {
    try {
      var m = /[?&]seed=(-?\d+)/.exec(window.location && window.location.search || '');
      return m ? parseInt(m[1], 10) | 0 : null;
    } catch (e) { return null; }
  }
  function freshRun() {
    return {
      v: VERSION, seed: urlSeed() !== null ? urlSeed() : (Date.now() ^ 0x5bd1e995) | 0,
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
    if (['choose', 'play', 'settle', 'demoEnd'].indexOf(RUN.phase) < 0) RUN.phase = 'choose';
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
    st.floors = Math.max(1, Math.min(3, (st.floors | 0) || (RUN.quest && RUN.quest.floors) || 1));
    st.floorsOpen = Math.max(1, Math.min(st.floors, st.floorsOpen | 0));
    useSiteLayout();
    var dz = ZONES.defaultZones({});   // 빠진 구역(예: 1차 저장의 2층)은 기본 시설로
    Object.keys(dz).forEach(function (z) { if (!ZONES.FAC[st.zones[z]] || ZONES.facFor(z).concat([dz[z]]).indexOf(st.zones[z]) < 0 && !ZONES.isFixedFac(st.zones[z])) st.zones[z] = dz[z]; });
    Object.keys(st.zones).forEach(function (z) { if (!(z in dz)) delete st.zones[z]; });
    if (!isObj(st.fixed)) st.fixed = {};
    Object.keys(st.fixed).forEach(function (z) { if (z in dz && ZONES.FAC[ZONES.fixedFac(st.fixed[z])]) st.zones[z] = ZONES.fixedFac(st.fixed[z]); else delete st.fixed[z]; });   // 고정 구역은 늘 그대로
    Object.keys(st.zones).forEach(function (z) { if (ZONES.isFixedFac(st.zones[z]) && !st.fixed[z]) st.zones[z] = dz[z]; });
    if (!Array.isArray(st.squads)) st.squads = [];
    st.squads = st.squads.filter(function (s) { return isObj(s) && typeof s.id === 'string' && tribeData(s.tribe); });
    st.squads.forEach(function (s) { s.count = Math.max(0, Math.min(BD.MON_SQUAD.cap, s.count | 0)); s.free = s.free === true; fixLevel(s); });
    if (typeof st.nextSquadNo !== 'number') st.nextSquadNo = st.squads.length + 1;
    ['budget', 'budgetStart', 'budgetAdded', 'spent', 'builds'].forEach(function (k) { st[k] = nonNeg(st[k]); });
    st.auto = st.auto !== false;
    if (!isObj(st.rest)) st.rest = {};
    Object.keys(st.rest).forEach(function (id) { if (!rawUnit(id) || typeof st.rest[id] !== 'number' || st.rest[id] < RUN.week) delete st.rest[id]; });
    if (!isObj(st.pins)) st.pins = {};
    // 층별 출진: 없으면(1차 저장) 대기실 배치(units)에서 옮긴다. 중복·없는 부대·잠긴 층은 버림 (한도는 arrange가 맞춤)
    if (!isObj(st.deploy)) {
      st.deploy = freshDeploy(st.floors);
      if (isObj(st.units)) Object.keys(st.units).forEach(function (z) {
        (Array.isArray(st.units[z]) ? st.units[z] : []).forEach(function (id) { var n = ZONES.floorOf(z); if (n) { st.deploy[n].push(id); st.pins[id] = z; } });
      });
    }
    var seen = {}, dep = freshDeploy(st.floors);
    for (var n = 1; n <= st.floors; n++) {
      dep[n] = (Array.isArray(st.deploy[n]) ? st.deploy[n] : []).filter(function (id) {
        var u = rawUnit(id), ok = !!u && !seen[id] && n <= st.floorsOpen; seen[id] = true; return ok;
      });
    }
    st.deploy = dep;
    Object.keys(st.pins).forEach(function (id) { if (!seen[id] || typeof st.pins[id] !== 'string') delete st.pins[id]; });
    arrange();
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

  // 능력치 한 항목의 조각: base 기본 · level 레벨 성장 · upgrade 부족 신석 강화 · equip 장비 · enchant 인챈트 (장비·인챈트는 아직 0, 자리만)
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
    var rest = isResting(u.id);
    return { id: u.id, kind: g ? 'guard' : 'squad', tribe: t.id, tribeName: t.name, name: g ? u.name : t.name + ' 부대',
      count: g ? 1 : u.count, cap: g ? 1 : BD.MON_SQUAD.cap, lv: u.lv, exp: u.exp, need: levelNeed(u.lv),
      hp: st.hp, atk: st.atk, def: st.def, free: !!u.free, placed: placedZone(u.id),
      floor: deployedFloor(u.id), resting: rest, restWeek: rest ? RUN.site.rest[u.id] : 0 };
  }
  function unitById(id) { return unitView(rawUnit(id)); }
  function placedZone(id) {
    var us = RUN.site ? RUN.site.units : {};
    for (var z in us) { if (us[z].indexOf(id) >= 0) return z; }
    return '';
  }
  function squads() { return (RUN.site ? RUN.site.squads : []).map(unitView); }
  function guards() { return RUN.guards.map(unitView); }
  // 출진 중인 부대·친위대 id (모든 층)
  function usedIds() {
    var used = {}, d = RUN.site && RUN.site.deploy || {};
    Object.keys(d).forEach(function (n) { d[n].forEach(function (id) { used[id] = true; }); });
    return used;
  }
  // 출진 안 한 부대·친위대 (보기 목록. 쉬는 부대도 resting으로 보임)
  function idleUnits() {
    var used = usedIds();
    return RUN.site.squads.concat(RUN.guards).filter(function (u) { return !used[u.id] && (isGuard(u) || u.count > 0); }).map(unitView);
  }

  // ---------- 층별 출진 (2차) ----------
  //  부대·친위대를 층에 출진시킨다 (site.deploy). 층마다 출진 한도 = min(FLOOR_CAP[층], 그 층 대기실 자리 합). 친위대도 한 칸 차지. 중복 출진 없음.
  //  출진한 부대는 그 층의 대기실 구역들에 나눠 선다 (arrange: 침입자가 많이 오는 대기실부터, 덜 찬 곳으로. placeUnit으로 고른 곳(pins)이 먼저).
  //  기본 자동 편성(site.auto, 처음 켬): 빈 칸이 있으면 쉬지 않는 부대를 전투력 큰 순으로 채운다 (부대 먼저, 그다음 친위대). 손으로 바꾸면 꺼짐
  //  쉬는 부대(site.rest): 퇴각한 다음 주 전투에 안 나감 (자리는 그대로, 전투력에는 셈). 그 주가 지나면 저절로 풀림
  function deployedFloor(id) {
    var d = RUN.site && RUN.site.deploy || {};
    for (var n in d) { if (d[n].indexOf(id) >= 0) return +n; }
    return 0;
  }
  function isResting(id) { var r = RUN.site && RUN.site.rest; return !!(r && typeof r[id] === 'number' && r[id] >= RUN.week); }
  function floorCapData(n) { var t = BD.FLOOR_CAP || {}; return t[n] !== undefined ? t[n] : t[1] || 3; }
  // n층 출진 한도 (zones 기준). 잠긴 층은 0
  function floorCap(n, zones) {
    if (!RUN.site || n > RUN.site.floorsOpen) return 0;
    return Math.min(floorCapData(n), ZONES.denSlots(zones || RUN.site.zones, n));
  }
  // 편성 계산 (상태를 바꾸지 않음): 한도 맞추기 -> (auto면) 빈 칸 채우기 -> 대기실에 나눠 서기.
  //  돌려주는 값 { deploy, units, back(한도가 줄어 대기로 돌아간 수) }
  function formation(zones, deploy, pins, auto) {
    var st = RUN.site, dep = {}, back = 0, used = {};
    for (var n = 1; n <= st.floors; n++) {
      var cap = floorCap(n, zones), list = (deploy[n] || []).filter(function (id) {
        var u = rawUnit(id), ok = !!u && !used[id] && (isGuard(u) || u.count > 0); used[id] = true; return ok;
      });
      back += Math.max(0, list.length - cap);
      dep[n] = list.slice(0, cap);
      list.slice(cap).forEach(function (id) { delete used[id]; });
    }
    if (auto) {
      var cand = st.squads.filter(function (s) { return !used[s.id] && s.count > 0 && !isResting(s.id); })
        .sort(function (a, b) { return squadScore(b) - squadScore(a); })
        .concat(RUN.guards.filter(function (g) { return !used[g.id] && !isResting(g.id); }).sort(function (a, b) { return b.lv - a.lv; }));
      cand.forEach(function (u) {
        var best = 0, room = 0;
        for (var n = 1; n <= st.floorsOpen; n++) { var r = floorCap(n, zones) - dep[n].length; if (r > room) { room = r; best = n; } }
        if (best) { dep[best].push(u.id); used[u.id] = true; }
      });
    }
    // 대기실에 나눠 서기
    var units = {}, w = null;
    for (var f = 1; f <= st.floors; f++) {
      if (!dep[f].length) continue;
      w = w || ZONES.passRatios(zones, {});
      var dens = ZONES.densOf(zones, f);
      dens.sort(function (a, b) { return (w[b] || 0) - (w[a] || 0); });   // 안정 정렬: 같으면 길 순서
      var free = {}; dens.forEach(function (z) { free[z] = ZONES.slotsOf(zones[z], z); units[z] = []; });
      var rest = [];
      dep[f].forEach(function (id) { var z = pins && pins[id]; if (z && free[z] > 0) { units[z].push(id); free[z]--; } else rest.push(id); });
      rest.forEach(function (id) {
        var pick = null;
        dens.forEach(function (z) { if (free[z] > 0 && (!pick || units[z].length < units[pick].length)) pick = z; });
        if (pick) { units[pick].push(id); free[pick]--; }
      });
      dens.forEach(function (z) { if (!units[z].length) delete units[z]; });
    }
    return { deploy: dep, units: units, back: back };
  }
  // 지금 현장 편성 다시 맞추기 (site.deploy·site.units). 바뀐 뒤마다 부른다
  function arrange() {
    var st = RUN.site;
    if (!st || !st.deploy) return;
    var fm = formation(st.zones, st.deploy, st.pins, st.auto && RUN.phase === 'play');
    st.deploy = fm.deploy; st.units = fm.units;
    var on = usedIds();
    Object.keys(st.pins).forEach(function (id) { if (!on[id] || placedZone(id) !== st.pins[id]) delete st.pins[id]; });
  }
  // 층 보기: { n, open, cap(지금 한도), capMax(데이터 한도), slots(대기실 자리), dens[구역], units[보기], fighting(이번 주 싸울 수), lockAt(열리는 단계) }
  function floorInfo(n) {
    var st = RUN.site;
    if (!st || n < 1 || n > st.floors) return null;
    var open = n <= st.floorsOpen, list = (st.deploy[n] || []).map(unitById);
    var lockAt = 0, q = RUN.quest;
    if (!open && q) q.stages.forEach(function (s, i) { if (!lockAt && s.opens >= n) lockAt = i + 1; });
    return { n: n, open: open, cap: floorCap(n), capMax: floorCapData(n), slots: ZONES.denSlots(st.zones, n), dens: ZONES.densOf(st.zones, n),
      units: list, fighting: list.filter(function (u) { return !u.resting; }).length, lockAt: lockAt, power: open ? floorPower(n) : 0 };
  }
  function floorsInfo() { var o = []; for (var n = 1; n <= (RUN.site ? RUN.site.floors : 0); n++) o.push(floorInfo(n)); return o; }
  // 층에 출진 (공짜). 다른 층에 있던 부대면 옮긴다 (중복 출진 없음). 손으로 바꾸면 자동 편성 꺼짐
  function sortieUnit(id, floor) {
    var why = canEdit();
    if (why) return { ok: false, msg: why };
    var st = RUN.site, n = floor | 0, u = rawUnit(id);
    if (!u || (!isGuard(u) && u.count <= 0)) return { ok: false, msg: '출진할 수 없는 부대' };
    if (n < 1 || n > st.floors) return { ok: false, msg: '없는 층이에요' };
    if (n > st.floorsOpen) return { ok: false, msg: n + '층은 아직 잠겨 있어요' };
    if (isResting(id)) return { ok: false, msg: unitView(u).name + '은(는) 쉬는 중이에요 (다음 주 복귀)' };
    var from = deployedFloor(id);
    if (from === n) return { ok: false, msg: '이미 ' + n + '층에 출진 중이에요' };
    var cap = floorCap(n);
    if (!cap) return { ok: false, msg: n + '층에 몬스터 대기실이 없어요' };
    if (st.deploy[n].length >= cap) return { ok: false, msg: n + '층 출진 한도(' + cap + ')가 찼어요' };
    if (from) st.deploy[from] = st.deploy[from].filter(function (x) { return x !== id; });
    delete st.pins[id];
    st.deploy[n].push(id);
    st.auto = false;
    var stages = afterChange();
    return { ok: true, msg: unitView(u).name + ' ' + n + '층 출진' + (from ? ' (' + from + '층에서 옮김)' : ''), stages: stages };
  }
  // 출진 해제 (대기로)
  function withdrawUnit(id) {
    var why = canEdit();
    if (why) return { ok: false, msg: why };
    var st = RUN.site, from = deployedFloor(id), u = rawUnit(id);
    if (!from) return { ok: false, msg: '출진 중이 아니에요' };
    st.deploy[from] = st.deploy[from].filter(function (x) { return x !== id; });
    delete st.pins[id];
    st.auto = false;
    var stages = afterChange();
    return { ok: true, msg: (u ? unitView(u).name : '부대') + ' 대기로', stages: stages };
  }
  // 기본 자동 편성 켜기·끄기 (켜면 바로 빈 칸을 채움)
  function setAutoDeploy(on) {
    var why = canEdit();
    if (why) return { ok: false, msg: why };
    RUN.site.auto = !!on;
    var stages = afterChange();
    return { ok: true, msg: on ? '자동 편성 켬' : '자동 편성 끔', stages: stages };
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
  // 던전 전투력 B안 (+ 구역별 조각 + 층별 합). 통과 비율은 층마다 그 층 입구 기준 (zones.js passRatios). 열린 층만
  //  units = 대기실 배치 (출진 한도 안의 편성. 쉬는 부대도 인계 편성이라 셈). 친위대는 뺀다
  function powerParts(zones, units) {
    var hand = handoverUnits(units), w = ZONES.passRatios(zones, hand), parts = [], total = 0, fl = {};
    Object.keys(zones).forEach(function (z) {
      var f = ZONES.FAC[zones[z]], n = ZONES.floorOf(z);
      if (!f || z === 'Y' || !ZONES.CELLS[z] || !ZONES.floorOpen(n)) return;
      var r = w[z] || 0, score = 0;
      if (f.kind === 'trap') score = ZONES.trapScore(z, workshopEffect('lab'));
      else if (f.kind === 'den') (hand[z] || []).forEach(function (id) { score += squadScore(rawUnit(id)); });
      else return;
      if (!score) return;
      parts.push({ z: z, floor: n, kind: f.kind, score: Math.round(score * 10) / 10, w: Math.round(r * 1000) / 1000, power: Math.round(score * r * 10) / 10 });
      total += score * r; fl[n] = (fl[n] || 0) + score * r;
    });
    var floors = {}; Object.keys(fl).forEach(function (n) { floors[n] = Math.floor(fl[n] + 1e-6); });
    return { total: Math.floor(total + 1e-6), parts: parts, floors: floors };
  }
  function powerOf(zones, units) { return powerParts(zones, units).total; }
  function sitePower() { return powerOf(RUN.site.zones, RUN.site.units); }
  function powerInfo() { return powerParts(RUN.site.zones, RUN.site.units); }
  // n층 전투력 (그 층 입구 기준 통과 비율). 잠긴 층은 0
  function floorPower(floor) { return powerParts(RUN.site.zones, RUN.site.units).floors[floor] || 0; }
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
      stages: JSON.parse(JSON.stringify(d.stages)), stage: 0, stageWeeks: [], startWeek: 0, noDeath: !!d.noDeath
    };
  }
  // 후보: 데모 의뢰 중 회사 레벨이 되고 아직 안 끝낸 것 (순서대로). 한 번 만들면 저장 (새로고침해도 같음). 다 끝냈으면 []
  function offerQuests() {
    if (RUN.offers && RUN.offers.length) return RUN.offers;
    if (RUN.phase === 'play' || RUN.phase === 'demoEnd') return [];
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
  // 단계 올리기: 지금 값이 다음 단계를 채우면 순서대로 올림 (한 번만, 회사 경험치 + 층 열림 + 추가 마석). 새로 오른 단계 번호 목록
  //  층이 열리면 배치를 다시 끼우고(계단 연결, 보물방이 아래층으로) 편성도 다시 맞춘다
  function questUpdate() {
    var q = RUN.quest, out = [];
    if (RUN.phase !== 'play' || !q) return out;
    var cur = curValues();
    while (q.stage < q.stages.length && meets(q.stages[q.stage], cur)) {
      var stg = q.stages[q.stage];
      q.stage++; q.stageWeeks.push(RUN.week); out.push(q.stage);
      addCompanyExp(BD.COMPANY.gain.stage);
      if (stg.budget > 0) { RUN.site.budget += stg.budget; RUN.site.budgetAdded += stg.budget; }
      if (stg.opens > RUN.site.floorsOpen) {
        RUN.site.floorsOpen = Math.min(RUN.site.floors, stg.opens);
        useSiteLayout();
        arrange();
        cur = curValues();
      }
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
      budget: budgetLeft(), budgetStart: RUN.site.budgetStart, budgetAdded: RUN.site.budgetAdded || 0
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
  //  나머지 현장 부대·시설·남은 마석은 의뢰인에게 인계 (사라짐). 회사 금·신석·회사 레벨·부족 강화·작품집은 남음
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
      RUN.tutorial.on = false;   // 정산 안내를 본 뒤 새 의뢰를 고르는 순간 튜토리얼 끝
    }
    found.startWeek = RUN.week;
    RUN.quest = found; RUN.offers = null; RUN.phase = 'play';
    RUN.siteNo++;
    RUN.site = freshSite(found);   // 판·층 배치도 여기서 바꿔 끼운다
    arrange();
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
    choreAdd('deliver');   // 튜토리얼은 여기서 끄지 않는다 (정산 화면 'deliver' 안내가 떠야 함). 다음 의뢰를 고를 때(pickQuest)·데모 끝(leaveSettle) 때 끔
    // 인계 표 (화면 표시용 글): 남는 것 · 의뢰인에게 넘어가는 것
    rep.carry = ['회사 금 ' + comma(RUN.gold), '신석 ' + comma(RUN.gems), '회사 레벨 ' + RUN.company.lv, '친위대 (최대 ' + BD.GUARD.max + ', 다음 현장 동행)', '작품집 ' + RUN.works.length + '점'];
    var tb = Object.keys(RUN.tribes).filter(function (n) { return RUN.tribes[n] > 0; }).map(function (n) { return tribeData(n).name + ' +' + RUN.tribes[n]; });
    if (tb.length) rep.carry.push('부족 신석 강화: ' + tb.join(' · '));
    rep.lost = ['던전 시설 (의뢰인에게 인계)', '현장 부대 ' + rep.handover.length + '개 (의뢰인에게 인계, 친위대로 고른 대장은 동행)'];
    if (rep.budgetLeft > 0) rep.lost.push('남은 마석 ' + comma(rep.budgetLeft));
    RUN.history.push({ name: q.name, key: q.key, week: RUN.week });
    if (RUN.history.length > 30) RUN.history.shift();
    RUN.report = rep; RUN.quest = null; RUN.phase = 'settle'; RUN.plan = null;
    RUN.offers = null;
    offerQuests();   // 같은 화면에서 고를 다음 의뢰 후보 (안에서 저장). 데모 의뢰를 다 끝냈으면 []
    rep.demoEnd = !RUN.offers.length;   // true면 다음 의뢰가 없음 -> 정산 화면을 닫을 때 leaveSettle()
    return rep;
  }
  // ---------- 데모 끝 ----------
  // 데모 의뢰를 다 납품하면 settle 화면에 고를 의뢰가 없다. leaveSettle()로 phase 'demoEnd'(데모 끝)로 넘어간다.
  //  demoEnd: 진행 중 의뢰 없음, 다음 주·건설·출진 불가 (canEdit·startBattle이 거절), 회사·군단·작품집은 볼 수 있음. 새 게임은 reset()
  function demoState() {
    var noMore = !BD.QUESTS.some(function (d) { return RUN.doneQuests.indexOf(d.key) < 0; });
    var end = RUN.phase === 'demoEnd' || (RUN.phase === 'settle' && noMore);
    return { end: end, phase: RUN.phase, canLeave: RUN.phase === 'settle' && noMore,
      msg: end ? '데모는 여기까지예요. 플레이해 주셔서 고마워요!' : '' };
  }
  function leaveSettle() {
    var d = demoState();
    if (!d.canLeave) return { ok: false, msg: RUN.phase === 'settle' ? '다음 의뢰를 골라 주세요' : '정산 중이 아니에요', phase: RUN.phase };
    RUN.phase = 'demoEnd'; RUN.offers = null; RUN.tutorial.on = false;
    save();
    return { ok: true, msg: d.msg, phase: RUN.phase };
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
  function afterChange() { arrange(); var st = questUpdate(); ensurePlan(); save(); return st; }

  // ---------- 건설 (마석만) ----------
  // 구역 z를 시설 k로 지으면: 비용·가치·전투력 변화·막히는 이유. 미리보기 (아무것도 바꾸지 않음)
  //  units = 지은 뒤의 대기실 배치 (출진 한도가 줄면 back명이 대기로, 자동 편성이 켜져 있으면 빈 칸이 채워진 모습). floor = 그 구역의 층
  function previewBuild(z, k) {
    if (RUN.site && RUN.site.fixed && RUN.site.fixed[z]) return { ok: false, why: '고정 구역이라 바꿀 수 없어요', fixed: true };
    var f = ZONES.FAC[k], fl = ZONES.floorOf(z);
    if (!f || ZONES.ALL.indexOf(z) < 0 || ZONES.facFor(z).indexOf(k) < 0) return { ok: false, why: '지을 수 없는 시설' };
    if (!ZONES.floorOpen(fl)) return { ok: false, why: fl + '층은 아직 잠겨 있어요', floor: fl, locked: true };
    var cur = RUN.site.zones[z], bc = buildCostInfo(k, z), cost = bc.cost;
    var zones2 = {}; Object.keys(RUN.site.zones).forEach(function (q) { zones2[q] = RUN.site.zones[q]; });
    zones2[z] = k;
    var fm = formation(zones2, RUN.site.deploy, RUN.site.pins, RUN.site.auto), units2 = fm.units, back = fm.back;
    var why = canEdit();
    if (!why && cur === k) why = '이미 이 시설이에요';
    if (!why && cost > budgetLeft()) why = '마석 ' + (cost - budgetLeft()) + ' 모자람';
    return {
      ok: !why, why: why, cost: cost, baseCost: bc.base, discount: bc.discount, counts: cost > 0,
      budgetAfter: budgetLeft() - cost, valueNow: siteValue(), valueAfter: ZONES.summary(zones2, {}, null).value,
      powerNow: sitePower(), powerAfter: powerOf(zones2, units2),
      back: back, zones: zones2, units: units2, from: cur, floor: fl
    };
  }
  function buildZone(z, k) {
    var p = previewBuild(z, k);
    if (!p.ok) return { ok: false, msg: p.why };
    RUN.site.budget -= p.cost;      // 마석만 (회사 금 안 씀, 환불 없음)
    RUN.site.spent += p.cost;
    RUN.site.zones[z] = k;          // 편성(한도·대기실 나눠 서기)은 afterChange -> arrange가 맞춤
    if (p.counts) { RUN.site.builds++; choreAdd('build'); }
    var stages = afterChange();
    var dv = p.valueAfter - p.valueNow;
    return { ok: true, msg: ZONES.NAMES[z] + ' ' + ZONES.FAC[k].name + ' 완공 (마석 -' + p.cost + ', 가치 ' + (dv >= 0 ? '+' : '') + dv + ')', stages: stages };
  }
  // 건설비: 시설 비용 × 층 배율(BATTLE_DATA.FLOOR_BUILD_MUL, 깊은 층이 비쌈) - 공방 할인(데모에서 꺼짐)
  function buildCostInfo(k, z) {
    var mul = (BD.FLOOR_BUILD_MUL || {})[ZONES.floorOf(z)] || 1;
    var base = Math.round(ZONES.costOf(k, z) * mul), rate = workshopEffect('build');
    var discount = Math.min(base, Math.round(base * rate));
    return { base: base, discount: discount, cost: base - discount };
  }
  function buildCost(k, z) { return buildCostInfo(k, z).cost; }

  // ---------- 부대 조달 (마석만) ----------
  function procureInfo(tribe) {
    var t = tribeData(tribe);
    if (!t) return null;
    var cost = BD.MON_SQUAD.newCost[tribe], why = canEdit();
    if (!why && RUN.contracts.indexOf(tribe) < 0) why = t.name + ' 사용권이 없어요';
    if (!why && cost > budgetLeft()) why = '마석 ' + (cost - budgetLeft()) + ' 모자람';
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
    return { ok: true, msg: inf.name + ' 부대 조달 (마석 -' + inf.cost + ', ' + s.count + '명)', unit: unitView(s), stages: stages };
  }
  function refillInfo(id) {
    var s = squadById(id);
    if (!s) return null;
    var cost = BD.MON_SQUAD.memberCost[s.tribe], why = canEdit();
    if (!why && s.count >= BD.MON_SQUAD.cap) why = '정원(' + BD.MON_SQUAD.cap + '명)이 찼어요';
    if (!why && cost > budgetLeft()) why = '마석 ' + (cost - budgetLeft()) + ' 모자람';
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
    return { ok: true, msg: tribeData(s.tribe).name + ' 부대 보충 (마석 -' + inf.cost + ', ' + s.count + '/' + BD.MON_SQUAD.cap + '명)', stages: stages };
  }

  // ---------- 대기실 배치 (예전 방식, 호환) ----------
  // placeUnit(z, id) = 그 대기실의 층에 출진 + 그 대기실을 고름(pins). removeUnit(z, i) = 그 자리 부대 출진 해제. 둘 다 자동 편성을 끔
  function placeUnit(z, id) {
    var why = canEdit();
    if (why) return { ok: false, msg: why };
    var st = RUN.site, k = st.zones[z], slots = k ? ZONES.slotsOf(k, z) : 0, us = st.units[z] || [], n = ZONES.floorOf(z);
    if (!slots) return { ok: false, msg: '몬스터 대기실이 아니에요' };
    if (!ZONES.floorOpen(n)) return { ok: false, msg: n + '층은 아직 잠겨 있어요' };
    if (us.length >= slots) return { ok: false, msg: '자리가 없어요' };
    var u = rawUnit(id);
    if (!u || usedIds()[id] || (!isGuard(u) && u.count <= 0)) return { ok: false, msg: '넣을 수 없는 부대' };
    if (isResting(id)) return { ok: false, msg: unitView(u).name + '은(는) 쉬는 중이에요 (다음 주 복귀)' };
    if (st.deploy[n].length >= floorCap(n)) return { ok: false, msg: n + '층 출진 한도(' + floorCap(n) + ')가 찼어요' };
    st.deploy[n].push(id); st.pins[id] = z; st.auto = false;
    var stages = afterChange();
    return { ok: true, msg: unitView(u).name + ' 출진', stages: stages };
  }
  function removeUnit(z, index) {
    var why = canEdit(), us = RUN.site.units[z] || [];
    if (why) return { ok: false, msg: why };
    if (us[index] === undefined) return { ok: false, msg: '뺄 부대가 없어요' };
    var r = withdrawUnit(us[index]);
    return { ok: r.ok, msg: r.msg };
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
  // 이벤트 카드 규칙 (B안: 위기 때만, 전투 한 번(= 한 주)에 최대 maxPerBattle장). 위기 감지는 battle_sim.js (사건 'crisis').
  //  { mode, maxPerBattle, crisisProgress(보물방 근접으로 치는 진행도 %), kinds[{ id, label, text }] }. 배속·재접속과 상관없이 같은 제한 (횟수는 전투 상태 S 안에 저장됨)
  function cardRule() {
    var c = BD.CARD_RULE;
    return { mode: c.mode, maxPerBattle: c.maxPerBattle, crisisProgress: c.crisisProgress,
      kinds: (c.kinds || []).map(function (k) { return { id: k.id, label: k.label, text: k.text }; }) };
  }

  // ---------- 다음 주 = 이번 주 전투 시작 ----------
  // 언제든 진행 가능 (마석 0·건설 0이어도. 무료 기본 부대). msgs = 알림 (막지 않음): 싸울 부대가 없음 · 쉬는 부대
  function startBattle() {
    if (RUN.phase !== 'play') return { ok: false, msgs: ['진행 중인 의뢰가 없어요'] };
    if (RUN.battling) return { ok: true, plan: RUN.plan, msgs: [] };
    ensurePlan();
    RUN.battling = true;
    RUN.bsave = freshBattleSave();
    save();
    return { ok: true, plan: RUN.plan, msgs: battleNotes() };
  }
  function battleNotes() {
    var out = [], used = usedIds(), resting = [], fighting = 0;
    Object.keys(used).forEach(function (id) { if (isResting(id)) resting.push(unitById(id).name); else fighting++; });
    if (!fighting) out.push(ZONES.summary(RUN.site.zones, {}, null).den ? '출진한 부대가 없어요 (현장에서 층에 출진시킬 수 있어요)' : '몬스터 대기실이 없어서 부대가 싸울 자리가 없어요 (대기실을 지으면 기본 부대가 자동으로 출진해요)');
    if (resting.length) out.push('쉬는 부대: ' + resting.join(', ') + ' (이번 주 전투에 안 나가요)');
    return out;
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
  // 전투 입력 (battle.js가 BSIM.create에 그대로 넘김). units = 대기실 배치에서 쉬는 부대를 뺀 것 (이번 주 싸우는 부대만). goal = 보물방 구역
  function battleInput(plan) {
    var us = {};
    Object.keys(RUN.site.units).forEach(function (z) {
      var l = RUN.site.units[z].filter(function (id) { return !isResting(id); });
      if (l.length) us[z] = l;
    });
    return { plan: plan || RUN.plan, zones: RUN.site.zones, units: us, unitById: unitById, goal: ZONES.goal() };
  }

  // ---------- 전투 결과 반영 ----------
  // res = battle_sim.js result { kills, porterKills, total, squads, gold, gems(소수), exp, reached, retreated, timeout, loot, damage, deployed, fought, monRetreat, crises }
  //  회사 금 += 이번 전투 금 - 약탈(이번 전투 금 안에서만). 수리비 없음(D1). 경험치 = 출진 deploy + 실제로 싸웠으면 fight (현장 부대는 작품집 효과 +%)
  //  퇴각(monRetreat): 다음 주 쉼. 큰 피해로 퇴각한 부대만 쓰러진 인원마다 사망 확률 (첫 의뢰 noDeath는 없음, 친위대 불사). 숙련도·레벨은 그대로.
  //  인원이 0이 된 부대(전멸)는 다음 주에 기본 인원 무료 보충
  function applyBattle(res) {
    if (RUN.phase !== 'play' || !RUN.battling) return null;
    var msgs = [], p = RUN.plan, st = RUN.site;
    var goldBefore = RUN.gold, gemsBefore = RUN.gems, compBefore = company();
    var gold = Math.max(0, Math.round(res.gold || 0)), gems = Math.max(0, Math.floor(res.gems || 0));
    var loot = Math.min(Math.max(0, Math.round(res.loot || 0)), gold);   // 약탈은 이번 전투에서 번 금 안에서만
    RUN.gold += gold - loot;
    RUN.gems += gems;
    var deployed = Array.isArray(res.deployed) ? res.deployed : Object.keys(usedIds()).filter(function (id) { return !isResting(id); });
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
    // 퇴각·사망
    var R = BD.RETREAT, safe = !!(RUN.quest && RUN.quest.noDeath), retreats = [], deaths = 0, wiped = [];
    (Array.isArray(res.monRetreat) ? res.monRetreat : []).forEach(function (m) {
      var u = m && rawUnit(m.id);
      if (!u || retreats.some(function (x) { return x.id === u.id; })) return;
      var g = isGuard(u), down = Math.max(0, Math.min(g ? 1 : u.count, m.down | 0)), died = 0;
      if (!g && !safe && m.big) {
        for (var i = 0; i < down; i++) { if (rnd() < R.deathChance) died++; }
        u.count -= died; deaths += died;
      }
      st.rest[u.id] = RUN.week + 1;   // 다음 주 전투에 안 나감 (자리는 그대로)
      var r = { id: u.id, name: unitView(u).name, kind: g ? 'guard' : 'squad', big: !!m.big, down: down, died: died, wiped: !g && u.count <= 0, refill: 0 };
      if (r.wiped) wiped.push(u);
      retreats.push(r);
    });
    addCompanyExp(BD.COMPANY.gain.battle);
    RUN.stats.battles++;
    var defended = res.reached === 0;  // 퇴각한 적은 보물방 침입으로 치지 않는다
    choreAdd('battle'); if (defended) choreAdd('defend');
    if (!OFF.surge && p.surge && RUN.week >= RUN.surgeWeek) RUN.surgeWeek = RUN.week + BD.SURGE_GAP[0] + rint(BD.SURGE_GAP[1] - BD.SURGE_GAP[0] + 1);
    RUN.week++;
    // 새 주: 지난 쉼 풀기 · 전멸 부대 기본 인원 무료 보충 (숙련도 그대로)
    Object.keys(st.rest).forEach(function (id) { if (st.rest[id] < RUN.week) delete st.rest[id]; });
    wiped.forEach(function (u) {
      u.count = BD.MON_SQUAD.start;
      retreats.forEach(function (r) { if (r.id === u.id) r.refill = u.count; });
    });
    // 의뢰인 마석 보급 (BATTLE_DATA.WEEKLY_BUDGET): 마석을 부대에 다 써서 가치 기준을 못 채우고 막히는 일을 막는 안전판
    var budgetGain = Math.max(0, BD.WEEKLY_BUDGET | 0);
    if (budgetGain) { st.budget += budgetGain; st.budgetAdded += budgetGain; }
    arrange();
    var stages = questUpdate();
    var rep = {
      budgetGain: budgetGain, budgetAfter: budgetLeft(),
      week: RUN.week - 1, surge: p.surge, ad: p.ad, kills: res.kills, porterKills: res.porterKills, total: res.total,
      gold: gold, gems: gems, exp: res.exp | 0, reached: res.reached, squads: res.squads, retreated: res.retreated, timeout: !!res.timeout,
      loot: loot, repair: 0, goldBefore: goldBefore, goldAfter: RUN.gold, gemsBefore: gemsBefore, gemsAfter: RUN.gems,
      defended: defended, levelMsgs: msgs.slice(0, 4), expGains: gains, stages: stages,
      retreats: retreats, deaths: deaths, noDeath: safe, crises: res.crises | 0,
      companyBefore: compBefore, companyAfter: company(), progress: questProgress()
    };
    rep.hint = gems > 0 ? '신석 +' + gems + ' (지금 ' + RUN.gems + '개): 군단에서 부족 신석 강화에 쓸 수 있어요' : '';
    // 쓰러짐·퇴각·사망을 나눈 목록 (화면 결과표용). down = 체력 0이 됐던 인원(사망 아니면 전투 뒤 회복) · retreated = 퇴각해 다음 주 쉼 · died = 실제 사망
    var downMap = isObj(res.monDown) ? res.monDown : {};
    retreats.forEach(function (r) { if (r.down && !downMap[r.id]) downMap[r.id] = r.down; });
    rep.casualties = {
      down: Object.keys(downMap).filter(function (id) { return rawUnit(id); }).map(function (id) { return { id: id, name: unitView(rawUnit(id)).name, n: downMap[id] | 0 }; }),
      retreated: retreats.map(function (r) { return { id: r.id, name: r.name, kind: r.kind, big: r.big }; }),
      died: retreats.filter(function (r) { return r.died; }).map(function (r) { return { id: r.id, name: r.name, n: r.died, wiped: r.wiped, refill: r.refill }; })
    };
    rep.restMsgs = retreats.map(function (r) {
      return r.name + ' 퇴각 -> 다음 주 쉼' + (r.died ? ' · ' + r.died + '명 사망' : '') + (r.wiped ? ' · 전멸, 기본 ' + r.refill + '명 무료 보충' : '') + (r.kind === 'guard' ? ' (친위대는 죽지 않아요)' : '');
    });
    RUN.battling = false; RUN.bsave = null; RUN.plan = null; RUN.lastBattle = rep;
    ensurePlan();
    save();
    return rep;
  }

  // ---------- 해금 (경험 중심, GAME_STRUCTURE 5절) ----------
  function unlocks() {
    return { corps: RUN.stats.battles > 0, guards: RUN.stats.delivers > 0, works: RUN.works.length > 0,
      floor2: !!(RUN.site && RUN.site.floorsOpen >= 2), secondQuest: RUN.company.lv >= (BD.QUESTS[1] ? BD.QUESTS[1].minCompanyLv : 99), demoEnd: RUN.phase === 'demoEnd' };
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
    if (RUN.gems < c) return { ok: false, msg: '신석 ' + (c - RUN.gems) + '개 모자람' };
    RUN.gems -= c; RUN.workshop[id] = lv + 1;
    afterChange();
    return { ok: true, msg: d.name + ' ' + (lv + 1) + '단계' };
  }

  // ---------- 부족 신석 강화 (영구, 신석) ----------
  function tribeCost(lv) { var c = BD.TRIBE_UP.costs; return c[Math.min(c.length - 1, lv)]; }
  function tribeStepOf(t) { return { hp: Math.max(1, Math.round(t.base.hp * BD.TRIBE_UP.per)), atk: Math.max(1, Math.round(t.base.atk * BD.TRIBE_UP.per)) }; }
  function tribeInfo(id) {
    var t = tribeData(id);
    if (!t) return null;
    var lv = RUN.tribes[id] || 0, st = tribeStepOf(t), top = lv >= BD.TRIBE_UP.max, c = top ? null : tribeCost(lv);
    var why = top ? '데모에서는 ' + BD.TRIBE_UP.max + '단계까지예요' : upgradeBlock();
    if (!why && RUN.contracts.indexOf(id) < 0) why = t.name + ' 사용권이 없어요';
    if (!why && RUN.gems < c) why = '신석 ' + (c - RUN.gems) + '개 모자람';
    return {
      id: id, name: t.name, lv: lv, max: BD.TRIBE_UP.max, contracted: RUN.contracts.indexOf(id) >= 0,
      effect: lv ? '1명 체력 +' + st.hp * lv + ' · 공격 +' + st.atk * lv : '신석 강화 없음',
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
    return { ok: true, msg: inf.name + ' 신석 강화 +' + (inf.lv + 1) + ' (신석 -' + inf.cost.gems + ', ' + tribeInfo(id).effect + ')', stages: stages };
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
    return { ok: true, msg: d.label + ' 보상: 신석 +' + d.gems, gems: d.gems };
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
    // 현장: 가치·전투력·마석·건설
    siteSummary: siteSummary, siteValue: siteValue, sitePower: sitePower, powerInfo: powerInfo, powerOf: powerOf, budgetLeft: budgetLeft,
    previewBuild: previewBuild, buildZone: buildZone, buildCost: buildCost, forecast: forecast,
    // 부대·친위대
    TRIBES: BD.TRIBES, STATS: BD.STATS, squads: squads, guards: guards, unitById: unitById, monById: unitById, idleUnits: idleUnits,
    statOf: function (id, key) { var u = rawUnit(id); return u ? statOf(u, key) : 0; },
    statParts: function (id, key) { var u = rawUnit(id); return u ? statParts(u, key) : null; },
    procureInfo: procureInfo, procureSquad: procureSquad, refillInfo: refillInfo, refillSquad: refillSquad,
    placeUnit: placeUnit, removeUnit: removeUnit, levelNeed: levelNeed, monGrade: monGrade,
    // 층별 출진 (2차)
    floorInfo: floorInfo, floorsInfo: floorsInfo, floorPower: floorPower, sortieUnit: sortieUnit, withdrawUnit: withdrawUnit, setAutoDeploy: setAutoDeploy,
    isResting: isResting, battleNotes: battleNotes,
    tribeInfo: tribeInfo, upgradeTribe: upgradeTribe,
    // 회사·작품집·해금
    company: company, worksInfo: worksInfo, unlocks: unlocks, demoState: demoState, leaveSettle: leaveSettle,
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
