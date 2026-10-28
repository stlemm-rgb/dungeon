/* D1 데모 진행 상태와 규칙 (화면 그리기 없음). C1 progress.js에서 이어 옴. 숫자·글 표는 battle_data.js (DEMO 아래)
 *
 * 공개 함수 목록·RUN 모양은 prototype/d1_demo/API.md. 규칙 요약 (docs/GAME_STRUCTURE.md 3·6절, GAME_PLAN 2026-10-22·23 절)
 *  1) 매주 전투: 현장의 "다음 주"(startBattle) -> 전투 -> applyBattle로 한 주가 끝남. 마석 0·건설 0이어도 진행 가능 (무료 기본 부대)
 *  11) 사용자 플레이 소감 뒤(2026-10-23): 첫 의뢰 = 외길 판, 튜토리얼 강조 = 모두 지나는 큰길(tutorialPath) · 마석 보급 30(weeklyBudget) ·
 *     대기실을 지으면 기본 부대 +1 (DEN_GIFT, site.denGifts로 철거·재건 무한 생성 막음)
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
 *  12) 3차(2026-10-24, docs/DESIGN_D1_DOORS.md): 판 = 칸 + 문 토큰 (RUN.site.boards 층별 판 id · RUN.site.doors { 층: [벽 조각 id] }). 저장 v7.
 *     문 옮기기·시설 미확정을 한 번에 미리보기(previewLayout) -> [건설] 한 번에 확정(commitLayout). 문 옮기기는 무료, 매주 언제나.
 *     확정 불가: 문 수가 다름(tokens) · 없는 벽·겹침(target) · 끊긴 방(disconnected) · 미리보기 경로의 문 통과가 한도를 넘음(limit) · 마석 모자람(budget) · 잠김(locked)
 *     옛 v6 저장 = B안: 회사 기록(금·신석·회사 레벨·친위대·작품집·부족 강화·끝낸 의뢰)만 이어 받고, 진행 중 의뢰는 같은 의뢰를 새 판으로 처음부터 (migrateV6)
 *     데모 목록에서 숨긴 의뢰(QUESTS hidden: q2)는 고르지 않음 -> q1 납품 뒤 데모 끝
 *  13) 시설 강화 (2026-10-25, docs/specs/facility_upgrade.md): 함정 피해·대기실 전투 체력을 마석으로 단계 강화 (upgradeInfo -> upgradeFacility, 표 = BATTLE_DATA.FAC_UP).
 *     실제 전투(battleInput.up)와 전투력(powerParts)에 같이 반영, 가치에는 안 더함. 교체·철거 확정 때 강화 지우고 낸 마석만 환급. 저장 칸 site.ups (v7 그대로, 없으면 기본 단계)
 *  14) 흐름 시험 (2026-10-28, refs/brief_flow_test.md, BATTLE_DATA.FLOW.on 으로 켜고 끔): 주 단위 [다음 주] 대신 일반 침입이 한 판씩 자동으로 이어짐(startBattle = 다음 일반 판,
 *     시드 = 전투 번호 RUN.flow.no 로 정함) + [보스 도전](challengeBoss, 단계마다 고정 구성·고정 시드 BATTLE_DATA.BOSSES). 보스 판에서 보물방 도달 분대가 없으면 성공 -> 의뢰 단계 +1
 *     (가치·전투력으로 오르는 규칙은 끔, questUpdate는 아무것도 안 함). 마지막 단계 보스 성공 -> 납품. 일반 판: 금·신석만 (경험치·회사 경험치·마석 보급·다음 주 쉼 없음).
 *     일반 판 중에 배치를 바꾸면(afterChange) 그 판은 버리고 다음 판이 새 배치로 시작 (dropNormal). 보스 판 중에는 못 바꿈. 저장 칸 RUN.flow (v7 그대로)
 *  15) 마석 경제 (2026-10-29, refs/brief_ui_restructure_core.md, API.md 16절): 흐름 시험의 마석 = 의뢰 시작 마석(QUESTS budget) + 단계 보스를 처음 이겼을 때
 *     의뢰인 보급(QUESTS stages[i].budget, 단계마다 한 번) + 첫 성공 보상(FLOW.bossReward, 단계마다 한 번). 일반 판·실패·재도전은 마석 0. 새 저장 칸 없음
 * phase(RUN.phase): choose = 의뢰 고르는 중 · play = 의뢰 진행 중 · settle = 납품 직후 정산 화면 (여기서 친위대 고르고 다음 의뢰 pickQuest) · demoEnd = 데모 끝
 */
(function () {
  'use strict';

  // ---------- 데이터 ----------
  var SAVE_KEY = 'dunguen_d1_run';  // 데모는 C1과 다른 저장 키 (C1 세이브 보존)
  var VERSION = 7;                  // 7 = 문 토큰 판 (site.boards·site.doors). 6 = D1 데모 첫 판 -> migrateV6 (B안). 그 밖의 버전은 새 게임
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
  //  budget 남은 마석 · budgetStart 처음 마석 · budgetAdded 단계 보상으로 늘어난 마석 · spent 쓴 마석 · builds 마석을 쓴 건설 수 · value·power 저장 때 맞춰 둠 ·
  //  denGifts 대기실을 지어 받은 기본 부대 수 (DEN_GIFT. 받은 수 <= 동시에 있었던 대기실 수 최고치 × DEN_GIFT -> 철거·재건으로 안 늘어남)
  //  boards 층별 판 id (GRID_BOARDS) · doors 확정된 문 { 층: [벽 조각 id] } (층마다 개수 = 그 판의 문 토큰 수)
  //  ups 시설 강화 { 방: { k 시설 id, lv 단계(2~), paid 실제 낸 강화 마석 } } (기본 단계는 칸 없음. 시설이 바뀌면 지움 + paid 환급. 납품 때 현장과 함께 인계)
  function freshSite(q) {
    var floors = q && q.floors > 1 ? q.floors | 0 : 1;
    var boards = questBoards(q, floors);
    ZONES.useSite(boards, floors, 1, null);
    var doors = ZONES.initialDoors();
    var fixed = {}, fx = q && q.fixed ? q.fixed : ZONES.boardFixed(boards, floors);
    Object.keys(fx).forEach(function (z) { fixed[z] = fx[z]; });
    var zones = ZONES.defaultZones(fixed);
    Object.keys(fixed).forEach(function (z) { if (zones[z] !== ZONES.fixedFac(fixed[z])) delete fixed[z]; }); // 판에 없는 구역은 버림
    var site = { boards: boards, doors: doors, zones: zones, fixed: fixed, units: {}, squads: [], nextSquadNo: 1,
      floors: floors, floorsOpen: 1, deploy: freshDeploy(floors), pins: {}, auto: true, rest: {},
      budget: q ? q.budget : 0, budgetStart: q ? q.budget : 0, budgetAdded: 0, spent: 0, builds: 0, value: 0, power: 0, denGifts: 0, ups: {} };
    if (q && BD.MON_SQUAD_FREE) {   // 무료 기본 부대 (마석 0이어도 진행 가능)
      site.squads.push(newSquad(site, BD.MON_SQUAD_FREE.tribe, BD.MON_SQUAD_FREE.count, true));
    }
    return site;
  }
  function freshDeploy(floors) { var d = {}; for (var n = 1; n <= floors; n++) d[n] = []; return d; }
  // 지금 현장의 판·층 배치를 ZONES에 끼운다 (불러오기·새 현장·층 열림 때)
  function useSiteLayout() { var s = RUN.site; ZONES.useSite(s.boards, s.floors || 1, s.floorsOpen || 1, s.doors); }
  // 의뢰의 층별 판 id (데이터 boards. 없거나 모자라면 첫 판으로 채움)
  function questBoards(q, floors) {
    var list = q && Array.isArray(q.boards) ? q.boards : [], out = [], first = ZONES.hasBoard(list[0]) ? list[0] : ZONES.DEFAULT_BOARD;
    for (var n = 1; n <= (floors || 1); n++) out.push(ZONES.hasBoard(list[n - 1]) ? list[n - 1] : first);
    return out;
  }
  // 문 배치 모양 { 층: [id] } 깊은 복사
  function copyDoors(d) { var o = {}; Object.keys(d || {}).forEach(function (n) { o[n] = (d[n] || []).slice(); }); return o; }
  function flatDoors(d) { var out = []; Object.keys(d || {}).sort().forEach(function (n) { out = out.concat(d[n] || []); }); return out; }
  // 데모 목록 의뢰 (hidden 뺌)
  function demoQuests() { return BD.QUESTS.filter(function (d) { return !d.hidden; }); }
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
    var seed = urlSeed() !== null ? urlSeed() : (Date.now() ^ 0x5bd1e995) | 0;
    return {
      v: VERSION, seed: seed,
      week: 1, gold: BD.START.gold, gems: BD.START.gems, company: { lv: 1, exp: 0 },
      phase: 'choose', quest: null, offers: null, report: null,
      qid: 1, siteNo: 0, doneQuests: [],
      site: null,
      guards: [], nextGuardNo: 1,
      tribes: {}, contracts: tribeIds(), works: [], stats: { battles: 0, delivers: 0 },
      surgeWeek: BD.SURGE_FIRST, adWeek: 0, plan: null, battling: false, bsave: null, lastBattle: null, history: [],
      prefs: freshPrefs(), workshop: freshWorkshop(),
      chores: freshChores(), idle: freshIdle(), lastSeen: now(),
      tutorial: { on: !flowOn(), seen: {} }, notice: '', flow: freshFlow(seed)
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
    st.floors = Math.max(1, Math.min(3, (st.floors | 0) || (RUN.quest && RUN.quest.floors) || 1));
    st.floorsOpen = Math.max(1, Math.min(st.floors, st.floorsOpen | 0));
    if (!Array.isArray(st.boards) || st.boards.length !== st.floors || !st.boards.every(ZONES.hasBoard)) st.boards = questBoards(Array.isArray(st.boards) ? st : RUN.quest, st.floors);
    delete st.board;
    // 문: 층마다 판의 문 수·있는 벽·모든 방 이어짐을 지켜야 함. 깨진 층은 판의 처음 문으로
    ZONES.useSite(st.boards, st.floors, st.floorsOpen, null);
    var dr = isObj(st.doors) ? st.doors : {}, nd = {};
    for (var fl = 1; fl <= st.floors; fl++) nd[fl] = ZONES.validateDoors(dr[fl], fl).ok ? dr[fl].slice() : ZONES.initialDoors(fl);
    st.doors = nd;
    if (typeof RUN.notice !== 'string') RUN.notice = '';
    useSiteLayout();
    var dz = ZONES.defaultZones({});   // 빠진 구역(예: 1차 저장의 2층)은 기본 시설로
    Object.keys(dz).forEach(function (z) { if (!ZONES.FAC[st.zones[z]] || ZONES.facFor(z).concat([dz[z]]).indexOf(st.zones[z]) < 0 && !ZONES.isFixedFac(st.zones[z])) st.zones[z] = dz[z]; });
    Object.keys(st.zones).forEach(function (z) { if (!(z in dz)) delete st.zones[z]; });
    if (!isObj(st.fixed)) st.fixed = {};
    Object.keys(st.fixed).forEach(function (z) { if (z in dz && ZONES.FAC[ZONES.fixedFac(st.fixed[z])]) st.zones[z] = ZONES.fixedFac(st.fixed[z]); else delete st.fixed[z]; });   // 고정 구역은 늘 그대로
    Object.keys(st.zones).forEach(function (z) { if (ZONES.isFixedFac(st.zones[z]) && !st.fixed[z]) st.zones[z] = dz[z]; });
    // 시설 강화: 칸 없는 v7 저장 = 모두 기본 단계. 시설이 다르거나 강화 못 하는 방·단계 밖은 지움 (환급 없음: 깨진 저장 보완)
    if (!isObj(st.ups)) st.ups = {};
    Object.keys(st.ups).forEach(function (z) {
      var u = st.ups[z], t = upTable(st.zones[z]);
      if (!isObj(u) || !t || u.k !== st.zones[z] || st.fixed[z] || ZONES.zoneType(z) !== 'room') { delete st.ups[z]; return; }
      u.lv = Math.max(1, Math.min(t.levels.length, u.lv | 0)); u.paid = Math.floor(nonNeg(u.paid));
      if (u.lv <= 1) delete st.ups[z];
    });
    if (!Array.isArray(st.squads)) st.squads = [];
    st.squads = st.squads.filter(function (s) { return isObj(s) && typeof s.id === 'string' && tribeData(s.tribe); });
    st.squads.forEach(function (s) { s.count = Math.max(0, Math.min(BD.MON_SQUAD.cap, s.count | 0)); s.free = s.free === true; fixLevel(s); });
    if (typeof st.nextSquadNo !== 'number') st.nextSquadNo = st.squads.length + 1;
    ['budget', 'budgetStart', 'budgetAdded', 'spent', 'builds'].forEach(function (k) { st[k] = nonNeg(st[k]); });
    // 대기실 부대 선물 칸이 없는 옛 v6 저장: 이미 있는 대기실은 받은 것으로 친다 (소급 지급 없음, 다음 새 대기실부터 받음)
    if (typeof st.denGifts !== 'number' || !isFinite(st.denGifts) || st.denGifts < 0) st.denGifts = denCount(st.zones) * Math.max(0, BD.DEN_GIFT | 0);
    st.denGifts = Math.floor(st.denGifts);
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
    fixFlow();
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

  // ---------- 흐름 시험 상태 (RUN.flow) ----------
  //  no = 지금까지 시작한 일반 판 수 (전투 번호, 일반 판 시드를 정함) · base = 일반 판 시드 바탕 (새 게임 때 한 번) · mode = 진행 중 전투 '' | 'normal' | 'boss' ·
  //  tries = 이 의뢰 보스 도전 횟수 · cleared = 첫 성공 보상을 받은 단계 번호 · show = 아직 닫지 않은 보스 결과 (새로고침해도 다시 보임, 보상은 applyBattle 때 한 번)
  function flowOn() { return !!(BD.FLOW && BD.FLOW.on); }
  function freshFlow(seed) { return { no: 0, base: mixSeed(seed | 0, 7919), mode: '', tries: 0, cleared: [], show: null }; }
  function fixFlow() {
    var fl = RUN.flow, had = isObj(fl);
    if (!had) fl = RUN.flow = freshFlow(RUN.seed);
    fl.no = Math.max(0, fl.no | 0); fl.base = fl.base | 0; fl.tries = Math.max(0, fl.tries | 0);
    fl.cleared = (Array.isArray(fl.cleared) ? fl.cleared : []).filter(function (n) { return typeof n === 'number' && n >= 1; });
    if (!isObj(fl.show)) fl.show = null;
    if (['', 'normal', 'boss'].indexOf(fl.mode) < 0) fl.mode = '';
    if (!flowOn()) return;
    // 흐름 칸이 없던 옛 v7 저장(주 단위 규칙): 단계는 보스 검증이 아니었으니 0부터, 진행 중 전투는 버림 (시험용 단순 처리)
    if (!had && RUN.phase === 'play' && RUN.quest) { RUN.quest.stage = 0; RUN.quest.stageWeeks = []; RUN.battling = false; RUN.bsave = null; RUN.plan = null; }
    if (RUN.battling && (!isObj(RUN.plan) || !Array.isArray(RUN.plan.groups))) { RUN.battling = false; RUN.bsave = null; RUN.plan = null; }
    if (!RUN.battling) fl.mode = '';
    else fl.mode = RUN.plan.mode === 'boss' ? 'boss' : 'normal';
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
        if (d && d.v === 6 && typeof d.week === 'number' && isObj(d.company)) { migrateV6(d); ensureStateReady(); ensurePlan(); save(); return true; }
      }
    } catch (e) { /* 깨진 저장은 무시하고 새로 시작 */ }
    setRun(freshRun());
    RUN.site = freshSite(null);
    return false;
  }
  // 옛 v6 저장 바꾸기 (B안, DESIGN_D1_DOORS 3-2): 회사 기록만 이어 받는다. 현장(옛 구역 판)·전투 중 저장·이번 주 계획은 버림.
  //  play 중이던 의뢰 = 같은 의뢰를 새 판으로 처음부터 (단계 0, 마석 처음 값, 무료 기본 부대만, 시작 주 = 지금 주).
  //  그 의뢰가 데모 목록에서 숨겨졌으면(q2) 데모 의뢰가 남았으면 choose, 다 끝냈으면 demoEnd. settle은 그대로(현장은 새 빈 현장 + 옛 부대 목록)
  var V6_KEEP = ['seed', 'week', 'gold', 'gems', 'company', 'qid', 'siteNo', 'doneQuests', 'guards', 'nextGuardNo', 'tribes', 'contracts', 'works', 'stats',
    'history', 'prefs', 'tutorial', 'surgeWeek', 'adWeek', 'workshop', 'chores', 'idle', 'lastSeen', 'report'];
  var V6_NOTICE = '새 판(문 토큰)으로 바뀌었어요. 회사 기록은 그대로이고, 진행 중이던 의뢰는 새 판에서 처음부터 시작해요.';
  function migrateV6(d) {
    var base = freshRun();
    V6_KEEP.forEach(function (k) { if (d[k] !== undefined) base[k] = d[k]; });
    base.v = VERSION; base.notice = V6_NOTICE;
    setRun(base);
    if (!isObj(RUN.company)) RUN.company = { lv: 1, exp: 0 };
    if (!Array.isArray(RUN.doneQuests)) RUN.doneQuests = [];
    var left = demoQuests().some(function (x) { return RUN.doneQuests.indexOf(x.key) < 0; });
    var qd = d.phase === 'play' && isObj(d.quest) ? questData(d.quest.key) : null;
    if (qd && !qd.hidden) {
      var q = makeQuest(qd);
      if (typeof d.quest.id === 'number') { q.id = d.quest.id; RUN.qid = Math.max(RUN.qid | 0, q.id + 1); }
      q.startWeek = RUN.week;
      RUN.quest = q; RUN.phase = 'play'; RUN.site = freshSite(q);
    } else if (d.phase === 'settle') {
      RUN.phase = 'settle'; RUN.site = freshSite(null);
      if (isObj(d.site) && Array.isArray(d.site.squads)) RUN.site.squads = d.site.squads.slice();   // 정산 화면 친위대 고르기용
    } else {
      RUN.phase = d.phase === 'demoEnd' || !left ? 'demoEnd' : 'choose';
      RUN.site = freshSite(null);
    }
    if (RUN.phase !== 'settle') RUN.report = null;
  }
  // 한 번 보여 줄 안내 (옛 저장 바꿈 등). 읽으면 지움
  function takeNotice() { var m = RUN.notice || ''; if (m) { RUN.notice = ''; save(); } return m; }
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
  // 흐름 시험: 씨앗 두 개를 섞은 새 씨앗 (일반 판 = 바탕 씨앗 + 전투 번호) · 그 씨앗 하나로만 도는 무작위 (RUN.seed를 건드리지 않음 -> 같은 번호 = 같은 판)
  function mixSeed(a, b) {
    var h = (a ^ Math.imul((b | 0) + 1, 0x9E3779B1)) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) | 0;
  }
  function seededRnd(seed) {
    var s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

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
  // 부대 점수 U (전투력 B안): 인원 × (1인 체력 × 대기실 강화 배율 ÷ hpDiv + 1인 초당 공격). hpMul 없으면 1 (전투 체력 = battle_sim과 같은 값)
  function squadScore(s, hpMul) { return s.count * (statOf(s, 'hp') * (hpMul || 1) / BD.POWER.hpDiv + statOf(s, 'atk')); }
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
  //  출진한 부대는 그 층의 대기실 구역들에 나눠 선다 (arrange: 한 부대씩 실제 전투력이 가장 커지는 대기실로. placeUnit으로 고른 곳(pins)이 먼저).
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
  //  doors = 문 배치 (없으면 지금 문). 통과 비율·전투력을 그 문으로 계산
  //  ups = 시설 강화 (없으면 지금 현장 강화). 강화된 대기실은 전투력이 커서 먼저 채워질 수 있음
  function formation(zones, deploy, pins, auto, doors, ups) {
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
    // 대기실에 나눠 서기: placeUnit으로 고른 곳(pins) 먼저, 나머지는 한 부대씩 "실제 전투력(부대 배치 반영 통과 비율)이 가장 커지는" 대기실로.
    //  전투력이 같으면(친위대는 전투력에 안 셈) 빈 판 통과 비율이 큰 곳 -> 그것도 같으면 덜 찬 곳 -> 길 순서. 같은 입력 = 같은 결과.
    //  (예전엔 빈 판 비율로만 순서를 정해서, 비율이 같아 보이는 대기실로 나눠 섰다가 몬스터가 보여 침입자가 피하는 바람에
    //   전투력이 줄었다: 2층 의뢰 previewBuild -26(미끼 있음), 미끼 없는 RB+TR 대기실 67 -> 37)
    var units = {}, w = null;
    for (var f = 1; f <= st.floors; f++) {
      if (!dep[f].length) continue;
      w = w || ZONES.passRatios(zones, {}, doors);
      var dens = ZONES.densOf(zones, f);
      dens.sort(function (a, b) { return (w[b] || 0) - (w[a] || 0); });   // 안정 정렬: 같으면 길 순서
      var free = {}; dens.forEach(function (z) { free[z] = ZONES.slotsOf(zones[z], z); units[z] = []; });
      var rest = [];
      dep[f].forEach(function (id) { var z = pins && pins[id]; if (z && free[z] > 0) { units[z].push(id); free[z]--; } else rest.push(id); });
      rest.forEach(function (id) {
        var pick = null, best = 0;
        dens.forEach(function (z) {
          if (!(free[z] > 0)) return;
          units[z].push(id);
          var p = powerParts(zones, units, doors, ups).raw;
          units[z].pop();
          var d = pick ? p - best : 1, dw = pick ? (w[z] || 0) - (w[pick] || 0) : 0;
          if (d > 1e-6 || (d > -1e-6 && (dw > 1e-9 || (dw > -1e-9 && units[z].length < units[pick].length)))) { pick = z; best = p; }
        });
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
  //  3차: 통과 비율·함정 횟수 = 미리보기 경로 12개 (ZONES.passInfo). 함정은 비율 대신 "경로마다 min(들어간 횟수, trapMax)의 평균"을 곱함 (막다른 방 왕복이 점수에 보임).
  //   parts[].w = 곱한 값 (대기실 = 통과 비율, 함정 = 평균 들어간 횟수). doors 없으면 지금 문
  //  시설 강화(ups, 없으면 지금 현장): 함정 점수 × (강화 피해 ÷ 기본 피해) · 대기실 부대 점수의 체력 × 배율. parts[].lv = 그 시설 단계
  function powerParts(zones, units, doors, ups) {
    var hand = handoverUnits(units), inf = ZONES.passInfo(zones, doors), w = inf.ratio, parts = [], total = 0, fl = {};
    Object.keys(zones).forEach(function (z) {
      var f = ZONES.FAC[zones[z]], n = ZONES.floorOf(z);
      if (!f || z === 'Y' || !ZONES.CELLS[z] || !ZONES.floorOpen(n)) return;
      var r = w[z] || 0, score = 0, lv = upLevel(z, zones, ups);
      if (f.kind === 'trap') { score = ZONES.trapScore(z, workshopEffect('lab')) * trapDmgAt(z, lv) / Math.max(1e-9, ZONES.trapDmgOf(z)); r = inf.trap[z] || 0; }
      else if (f.kind === 'den') { var mul = denHpMulAt(lv); (hand[z] || []).forEach(function (id) { score += squadScore(rawUnit(id), mul); }); }
      else return;
      if (!score) return;
      parts.push({ z: z, floor: n, kind: f.kind, lv: lv, score: Math.round(score * 10) / 10, w: Math.round(r * 1000) / 1000, power: Math.round(score * r * 10) / 10 });
      total += score * r; fl[n] = (fl[n] || 0) + score * r;
    });
    var floors = {}; Object.keys(fl).forEach(function (n) { floors[n] = Math.floor(fl[n] + 1e-6); });
    return { total: Math.floor(total + 1e-6), raw: total, parts: parts, floors: floors };   // raw = 버리기 전 합 (편성 비교용)
  }
  function powerOf(zones, units, doors, ups) { return powerParts(zones, units, doors, ups).total; }
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
  //  boards = 층별 판 id (board = 1층 판, 옛 화면 호환) · fixed = 판 데이터의 고정 구역 (방 id, 2층은 앞에 '2')
  function makeQuest(d) {
    var floors = d.floors > 1 ? d.floors | 0 : 1, boards = questBoards(d, floors);
    return {
      id: RUN.qid++, key: d.key, kind: 'normal', grade: '', name: d.name, tutorial: d.key === BD.QUESTS[0].key,
      client: { name: d.client.name, kind: d.client.kind }, attr: attrView(d.attr), floors: d.floors, board: boards[0], boards: boards,
      fixed: ZONES.boardFixed(boards, floors), budget: d.budget, reward: JSON.parse(JSON.stringify(d.reward)),
      stages: JSON.parse(JSON.stringify(d.stages)), stage: 0, stageWeeks: [], startWeek: 0, noDeath: !!d.noDeath
    };
  }
  // 후보: 데모 의뢰 중 회사 레벨이 되고 아직 안 끝낸 것 (순서대로). 한 번 만들면 저장 (새로고침해도 같음). 다 끝냈으면 []
  function offerQuests() {
    if (RUN.offers && RUN.offers.length) return RUN.offers;
    if (RUN.phase === 'play' || RUN.phase === 'demoEnd') return [];
    var list = demoQuests().filter(function (d) { return d.minCompanyLv <= RUN.company.lv && RUN.doneQuests.indexOf(d.key) < 0; }).map(makeQuest);
    RUN.offers = list;
    save();
    return list;
  }
  // 회사 레벨 때문에 아직 못 받는 다음 의뢰 (화면의 🔒 안내용). 없으면 null
  function lockedQuest() {
    var d = demoQuests().filter(function (x) { return x.minCompanyLv > RUN.company.lv && RUN.doneQuests.indexOf(x.key) < 0; })[0];
    return d ? { key: d.key, name: d.name, floors: d.floors, minCompanyLv: d.minCompanyLv } : null;
  }

  // ---------- 납품 기준 ----------
  function curValues() { return { value: siteValue(), power: sitePower(), floor2: floorPower(2) }; }
  function meets(stg, cur) { return cur.value >= stg.value && cur.power >= stg.power && (!stg.floor2 || cur.floor2 >= stg.floor2); }
  // 단계 올리기: 지금 값이 다음 단계를 채우면 순서대로 올림 (한 번만, 회사 경험치 + 층 열림 + 추가 마석). 새로 오른 단계 번호 목록
  //  층이 열리면 배치를 다시 끼우고(계단 연결, 보물방이 아래층으로) 편성도 다시 맞춘다
  function questUpdate() {
    var q = RUN.quest, out = [];
    if (RUN.phase !== 'play' || !q || flowOn()) return out;   // 흐름 시험: 단계는 보스 성공으로만 (applyFlow)
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
    var tgt = nx || last, why = '', line, flow = flowOn(), bi = flow ? bossInfo() : null;
    if (flow) {   // 흐름 시험: 납품 기준 = 보스 검증 n/5
      if (!complete) why = '보스 검증 ' + total + '단계를 모두 통과해야 납품할 수 있어요';
      else if (RUN.battling && RUN.flow.mode === 'boss') why = '보스전 중에는 납품할 수 없어요';
      line = complete ? '의뢰 완료 · 보스 검증 ' + total + '/' + total : '보스 검증 ' + q.stage + '/' + total + (bi && bi.name ? ' · 다음 보스: ' + bi.name : '');
    } else {
      if (!complete) why = '납품 기준 ' + total + '단계를 모두 채워야 납품할 수 있어요';
      else if (!meets(last, cur)) why = '지금 값이 ' + total + '단계 기준보다 낮아요 (가치 ' + cur.value + '/' + last.value + ' · 전투력 ' + cur.power + '/' + last.power + ')';
      else if (RUN.battling) why = '전투 중에는 납품할 수 없어요';
      line = (complete ? '의뢰 완료 · ' : '납품 기준 ' + q.stage + '/' + total + ' · ') + '가치 ' + cur.value + '/' + tgt.value + ' · 전투력 ' + cur.power + '/' + tgt.power;
      if (tgt.floor2) line += ' · 2층 전투력 ' + cur.floor2 + '/' + tgt.floor2;
    }
    return {
      stage: q.stage, total: total, complete: complete, canDeliver: !why, why: why, cur: cur,
      next: nx ? { stage: q.stage + 1, value: nx.value, power: nx.power, floor2: nx.floor2 || 0, opens: nx.opens || 0 } : null,
      floors: q.floors, floorsOpen: RUN.site.floorsOpen, floorLock: lock, line: line,
      budget: budgetLeft(), budgetStart: RUN.site.budgetStart, budgetAdded: RUN.site.budgetAdded || 0, weeklyBudget: weeklyBudget(), flow: flow, boss: bi
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
  // 튜토리얼 중 첫 현장에서 강조할 칸: 침입자 모두가 반드시 지나는 구역(ZONES.mustPass, 외길 판 = 큰길) 중 지을 수 있는 칸 (고정 구역 뺌).
  //  (lines.js 'zones' = "반짝이는 칸이 침입자가 반드시 지나는 길"이 늘 참이 되게. 예전: 분대 하나의 길이라 세 갈래 판에서 거짓이었음)
  //  반드시 지나는 칸이 없는 판(옛 저장의 세 갈래 첫 현장)이면 통과 비율이 가장 높은 칸들. 튜토리얼이 아니면 null
  function tutorialPath() {
    if (!RUN.tutorial.on || RUN.phase !== 'play' || RUN.siteNo !== 1) return null;
    var st = RUN.site;
    function buildable(z) { return ZONES.zoneType(z) === 'room' && !st.fixed[z] && ZONES.floorOpen(ZONES.floorOf(z)); }
    var must = ZONES.mustPass().filter(buildable);
    if (must.length) return must;
    // 3차: 반드시 지나는 방이 없으면(처음 g1 = 세 갈래 길) 보물방과 문으로 이어진 방들 (침입자는 보물방에 가려면 이 중 한 곳을 꼭 지남)
    var bf = ZONES.bossFront().filter(buildable);
    if (bf.length) return ZONES.ORDER.filter(function (z) { return bf.indexOf(z) >= 0; });
    var w = ZONES.passRatios(st.zones, st.units), top = 0;
    Object.keys(w).forEach(function (z) { if (buildable(z) && w[z] > top) top = w[z]; });
    return ZONES.ORDER.filter(function (z) { return buildable(z) && top > 0 && w[z] >= top - 1e-9; });
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
    RUN.flow.tries = 0; RUN.flow.cleared = []; RUN.flow.show = null; RUN.flow.mode = '';   // 보스 기록은 의뢰마다 (전투 번호·바탕 씨앗은 그대로)
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
    if (flowOn()) { dropNormal(); RUN.flow.show = null; }   // 흐름 시험: 진행 중 일반 판은 버리고 납품
    var q = RUN.quest, cur = curValues();
    var rep = {
      quest: q, gold: q.reward.gold, gems: q.reward.gems, companyExp: q.reward.companyExp || 0,
      goldBefore: RUN.gold, gemsBefore: RUN.gems, companyBefore: company(), weeks: RUN.week - q.startWeek + 1,
      value: cur.value, power: cur.power, stage: q.stage, builds: RUN.site.builds, board: RUN.site.boards[0], boards: RUN.site.boards.slice(),
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
    rep.upgrades = Object.keys(RUN.site.ups || {}).filter(function (z) { return upLevel(z) > 1; }).length;
    if (rep.upgrades) rep.lost.push('시설 강화 ' + rep.upgrades + '곳 (현장과 함께 인계)');
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
    var noMore = !demoQuests().some(function (d) { return RUN.doneQuests.indexOf(d.key) < 0; });
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
    if (flowOn() && RUN.battling && RUN.flow.mode === 'boss') return '보스전 중에는 바꿀 수 없어요';
    if (flowOn() && !battling) return '';   // 흐름 시험: 일반 판 중에도 바꿀 수 있음 (바꾸면 그 판은 버리고 다음 판부터 새 배치, afterChange)
    if (battling || RUN.battling) return '전투 중에는 바꿀 수 없어요';
    return '';
  }
  function budgetLeft() { return RUN.site && RUN.site.budget > 0 ? RUN.site.budget : 0; }
  // 의뢰인 마석 보급: 전투(한 주)가 끝날 때마다 마석 +이만큼 (BATTLE_DATA.WEEKLY_BUDGET). 화면의 "다음 주 마석 +N"
  function weeklyBudget() { return flowOn() ? 0 : Math.max(0, BD.WEEKLY_BUDGET | 0); }   // 흐름 시험: 보급 없음

  // ---------- 대기실 기본 부대 (DEN_GIFT) ----------
  //  대기실을 지으면 기본 부대(MON_SQUAD_FREE 부족·인원, 무료)가 같이 온다. 한 현장에서 받는 수 <= 동시에 있었던 대기실 수의 최고치 × DEN_GIFT
  //  (site.denGifts = 지금까지 받은 수). 그래서 철거 -> 재건, 다른 칸으로 옮겨 짓기로는 더 생기지 않는다. 마석이 0이면 대기실을 못 지으니 생기지 않는다
  function denCount(zones) { return ZONES.summary(zones, {}, null).den; }
  function denGiftOf(zones2) {
    var per = Math.max(0, BD.DEN_GIFT | 0), fr = BD.MON_SQUAD_FREE;
    if (!per || !fr || !RUN.site) return 0;
    return Math.max(0, denCount(zones2) * per - (RUN.site.denGifts || 0));
  }
  function giftSquad(site) { return newSquad(site, BD.MON_SQUAD_FREE.tribe, BD.MON_SQUAD_FREE.count, true); }
  function giftText(n) { var t = tribeData(BD.MON_SQUAD_FREE.tribe); return n > 0 ? '기본 부대 +' + n + ' (' + t.name + ' ' + BD.MON_SQUAD_FREE.count + '명' + (n > 1 ? '씩' : '') + ', 무료)' : ''; }
  function afterChange() { if (flowOn()) dropNormal(); arrange(); var st = questUpdate(); ensurePlan(); save(); return st; }

  // ---------- 건설·문 옮기기 (마석만, 문은 무료) ----------
  // 미확정 문·시설 전부를 한 번에 미리보기 (아무것도 바꾸지 않음). change = { doors: { 층: [벽 조각 id] }, builds: { 방: 시설 } } (둘 다 없어도 됨)
  //  -> { ok, why, code('tokens'·'disconnected'·'limit'·'target'·'budget'·'locked'·''), cost, budgetAfter, valueNow, valueAfter, powerNow, powerAfter,
  //       gift, giftTribe, giftCount, giftText, units(바뀐 뒤 대기실 배치), back, zones, doors({ 층: [...] } 바뀐 뒤), isolated[끊긴 방], floor(문 검사에 걸린 층),
  //       passes[습관별 한 층 최대 문 통과 수], limit, paid(돈 드는 건설 수), changed{ doors, builds },
  //       refund(교체·철거로 돌려받을 강화 마석, budgetAfter에 들어 있음), upLost[{ z, name, fac, level, paid }](사라질 강화), ups(바뀐 뒤 강화) }
  //  확인 순서: 잠김(전투 중·의뢰 없음·잠긴 층·고정 구역) -> 시설 이름 -> 문(개수·벽·이어짐) -> 마석 -> 문 통과 한도(미리보기 경로 12개)
  //  문이 깨진 배치면 전투력은 계산하지 않음 (powerAfter = powerNow)
  function previewLayout(change) {
    change = isObj(change) ? change : {};
    var st = RUN.site, why = canEdit(), code = why ? 'locked' : '', isolated = [], badFloor = 0;
    if (!st) return { ok: false, why: why || '현장이 없어요', code: 'locked' };
    var doors = copyDoors(st.doors), doorChanged = false;
    if (isObj(change.doors)) Object.keys(change.doors).forEach(function (key) {
      var n = key | 0, list = change.doors[key];
      if (n < 1 || n > st.floors) { if (!code) { code = 'target'; why = '없는 층이에요'; } return; }
      if (Array.isArray(list) && list.slice().sort().join() === (st.doors[n] || []).slice().sort().join()) return;
      doorChanged = true;
      doors[n] = Array.isArray(list) ? list.slice() : [];
      if (!code && n > st.floorsOpen) { code = 'locked'; why = n + '층은 아직 잠겨 있어요'; badFloor = n; }
    });
    var zones2 = {}; Object.keys(st.zones).forEach(function (q) { zones2[q] = st.zones[q]; });
    var cost = 0, paid = 0, built = [];
    if (isObj(change.builds)) Object.keys(change.builds).forEach(function (z) {
      var k = change.builds[z], fl = ZONES.floorOf(z);
      if (st.zones[z] === k) return;
      if (st.fixed && st.fixed[z]) { if (!code) { code = 'locked'; why = '고정 구역이라 바꿀 수 없어요'; } return; }
      if (!ZONES.FAC[k] || ZONES.ALL.indexOf(z) < 0 || ZONES.facFor(z).indexOf(k) < 0) { if (!code) { code = 'target'; why = '지을 수 없는 시설'; } return; }
      if (!ZONES.floorOpen(fl)) { if (!code) { code = 'locked'; why = fl + '층은 아직 잠겨 있어요'; } return; }
      zones2[z] = k; built.push(z);
      var c = buildCost(k, z); cost += c; if (c > 0) paid++;
    });
    var doorsOk = true;
    if (doorChanged) for (var n = 1; n <= st.floors; n++) {
      var v = ZONES.validateDoors(doors[n], n);
      if (!v.ok) { doorsOk = false; if (!code) { code = v.code; why = v.why; isolated = v.isolated; badFloor = n; } break; }
    }
    // 시설 강화: 교체·철거되는 방의 강화는 사라지고 실제 낸 강화 마석(paid)을 돌려받음 (확정 때 한 번). 돌려받을 마석도 이번 건설비에 쓸 수 있음
    var ups2 = copyUps(st.ups), upLost = [], refund = 0;
    built.forEach(function (z) {
      var lv = upLevel(z, st.zones, st.ups);
      if (lv <= 1 && !ups2[z]) return;
      if (lv > 1) { upLost.push({ z: z, name: ZONES.NAMES[z] || z, fac: st.zones[z], level: lv, paid: st.ups[z].paid }); refund += st.ups[z].paid; }
      delete ups2[z];
    });
    if (!code && cost > budgetLeft() + refund) { code = 'budget'; why = '마석 ' + (cost - budgetLeft() - refund) + ' 모자람'; }
    var useDoors = doorsOk ? flatDoors(doors) : flatDoors(st.doors);
    var info = ZONES.passInfo(zones2, useDoors), limit = ZONES.GRID.passLimit;
    if (!code && doorsOk && info.maxPass > limit) {
      code = 'limit'; why = '분대 ' + (info.worst + 1) + ' 문 통과 ' + info.maxPass + '회: 최대 ' + limit + '회를 넘습니다';
    }
    // 대기실 기본 부대: 받게 되면 잠깐 현장 부대에 넣어 편성·전투력을 계산하고 뺀다 (id = 지으면 실제로 붙을 번호)
    var gift = denGiftOf(zones2), temp = [], no0 = st.nextSquadNo;
    for (var gi = 0; gi < gift; gi++) temp.push(giftSquad(st));
    st.squads = st.squads.concat(temp);
    var fm = formation(zones2, st.deploy, st.pins, st.auto, useDoors, ups2), units2 = fm.units;
    var powerNow = sitePower(), powerAfter = doorsOk ? powerOf(zones2, units2, useDoors, ups2) : powerNow;
    st.squads = st.squads.slice(0, st.squads.length - temp.length); st.nextSquadNo = no0;
    return {
      ok: !code, why: why, code: code, cost: cost, budgetAfter: budgetLeft() - cost + refund, refund: refund, upLost: upLost, ups: ups2,
      valueNow: siteValue(), valueAfter: ZONES.summary(zones2, {}, null).value,
      powerNow: powerNow, powerAfter: powerAfter, gift: gift, giftTribe: gift ? BD.MON_SQUAD_FREE.tribe : '', giftCount: gift ? BD.MON_SQUAD_FREE.count : 0, giftText: giftText(gift),
      units: units2, back: fm.back, zones: zones2, doors: doors, isolated: isolated, floor: badFloor, passes: info.passes.slice(), limit: limit,
      paid: paid, changed: { doors: doorChanged, builds: built }
    };
  }
  // [건설]: 미확정 문·시설을 한 번에 확정 (previewLayout이 ok일 때만). -> { ok, msg, code, stages, gift, units(받은 부대 보기) }
  function commitLayout(change) {
    var p = previewLayout(change), st = RUN.site;
    if (!p.ok) return { ok: false, msg: p.why, code: p.code, stages: [], gift: 0, units: [] };
    if (!p.changed.doors && !p.changed.builds.length) return { ok: false, msg: '바뀐 것이 없어요', code: '', stages: [], gift: 0, units: [] };
    st.budget -= p.cost; st.spent += p.cost;   // 마석만 (회사 금 안 씀. 건설비 환불 없음)
    st.budget += p.refund; st.spent = Math.max(0, st.spent - p.refund); st.ups = copyUps(p.ups);   // 교체·철거된 방의 강화 마석만 한 번 환급
    p.changed.builds.forEach(function (z) { st.zones[z] = p.zones[z]; });
    if (p.changed.doors) { st.doors = copyDoors(p.doors); useSiteLayout(); }
    if (p.paid) { st.builds += p.paid; for (var i = 0; i < p.paid; i++) choreAdd('build'); }
    var gifts = [];
    for (var gi = 0; gi < p.gift; gi++) { var gs = giftSquad(st); st.squads.push(gs); gifts.push(gs); }
    st.denGifts += gifts.length;
    var stages = afterChange();
    var dv = p.valueAfter - p.valueNow, parts = [];
    if (p.changed.builds.length === 1) { var z = p.changed.builds[0]; parts.push(ZONES.NAMES[z] + ' ' + ZONES.FAC[st.zones[z]].name + ' 완공'); }
    else if (p.changed.builds.length) parts.push('시설 ' + p.changed.builds.length + '곳 완공');
    if (p.changed.doors) parts.push('문 배치 확정');
    var msg = parts.join(' · ') + (p.changed.builds.length ? ' (마석 -' + p.cost + ', 가치 ' + (dv >= 0 ? '+' : '') + dv + ')' : '') + (gifts.length ? ' · ' + giftText(gifts.length) : '') +
      (p.upLost.length ? ' · 강화 ' + p.upLost.length + '곳 사라짐, 강화 마석 +' + p.refund + ' 환급' : '');
    return { ok: true, msg: msg, code: '', stages: stages, gift: gifts.length, units: gifts.map(unitView), refund: p.refund, upLost: p.upLost };
  }
  // (호환) 방 z를 시설 k로 지으면: 비용·가치·전투력 변화·막히는 이유. previewLayout({ builds: { z: k } })에 옛 칸을 붙임
  //  units = 지은 뒤의 대기실 배치 (출진 한도가 줄면 back명이 대기로, 자동 편성이 켜져 있으면 빈 칸이 채워진 모습). floor = 그 방의 층
  function previewBuild(z, k) {
    if (RUN.site && RUN.site.fixed && RUN.site.fixed[z]) return { ok: false, why: '고정 구역이라 바꿀 수 없어요', fixed: true, code: 'locked' };
    var f = ZONES.FAC[k], fl = ZONES.floorOf(z);
    if (!f || ZONES.ALL.indexOf(z) < 0 || ZONES.facFor(z).indexOf(k) < 0) return { ok: false, why: '지을 수 없는 시설', code: 'target' };
    if (!ZONES.floorOpen(fl)) return { ok: false, why: fl + '층은 아직 잠겨 있어요', floor: fl, locked: true, code: 'locked' };
    var from = RUN.site.zones[z], bc = buildCostInfo(k, z), ch = {}; ch[z] = k;
    var p = previewLayout({ builds: ch });
    if (from === k) { p.cost = bc.cost; p.budgetAfter = budgetLeft() - bc.cost; }
    var why = canEdit() || (from === k ? '이미 이 시설이에요' : p.why);
    p.ok = !why; p.why = why; p.baseCost = bc.base; p.discount = bc.discount; p.counts = bc.cost > 0; p.from = from; p.floor = fl;
    return p;
  }
  function buildZone(z, k) {
    var p = previewBuild(z, k);
    if (!p.ok) return { ok: false, msg: p.why, code: p.code };
    var ch = {}; ch[z] = k;
    return commitLayout({ builds: ch });
  }
  // n층 문 정보 (건설 모드): { n, doors[벽 조각 id], count(토큰 수), limit(문 통과 한도), canEdit, why }
  function doorInfo(n) {
    var st = RUN.site; n = n | 0 || 1;
    if (!st || n < 1 || n > st.floors) return null;
    var why = canEdit() || (n > st.floorsOpen ? n + '층은 아직 잠겨 있어요' : '');
    return { n: n, doors: (st.doors[n] || []).slice(), count: ZONES.doorCount(n), limit: ZONES.GRID.passLimit, canEdit: !why, why: why };
  }
  // 분대 탐험 경로 (?debug 경로 선): seed 없으면 이번 주 계획 시드, 분대 수 = 이번 주 계획 분대 수 (계획이 없으면 3)
  //  -> [{ squad, habit, rooms, steps, reached }]. 같은 시드면 실제 전투 경로와 같다 (battle_sim이 같은 함수를 부름)
  function exploreRoutes(seed) {
    var plan = RUN.plan, n = 3;
    if (plan && plan.groups) { n = 0; plan.groups.forEach(function (g) { n += g.count / BD.SQUAD; }); }
    var sd = seed === undefined || seed === null ? (plan ? plan.seed : 0) : seed, doors = flatDoors(RUN.site.doors), out = [];
    for (var i = 0; i < n; i++) {
      var r = ZONES.exploreRoute(doors, RUN.site.zones, i, sd);
      out.push({ squad: r.squad, habit: r.habit, rooms: r.rooms, steps: r.steps, reached: r.reached, passes: r.passes });
    }
    return out;
  }
  // 건설비: 시설 비용 × 층 배율(BATTLE_DATA.FLOOR_BUILD_MUL, 깊은 층이 비쌈) - 공방 할인(데모에서 꺼짐)
  function buildCostInfo(k, z) {
    var mul = (BD.FLOOR_BUILD_MUL || {})[ZONES.floorOf(z)] || 1;
    var base = Math.round(ZONES.costOf(k, z) * mul), rate = workshopEffect('build');
    var discount = Math.min(base, Math.round(base * rate));
    return { base: base, discount: discount, cost: base - discount };
  }
  function buildCost(k, z) { return buildCostInfo(k, z).cost; }

  // ---------- 시설 강화 (docs/specs/facility_upgrade.md, 숫자 = BATTLE_DATA.FAC_UP) ----------
  //  함정 = 피해, 대기실 = 그 방에 출진한 부대·친위대의 전투 체력 (전투 시작 때만, 영구 성장 아님). 마석만 씀, 시간 안 흐름. 시설 가치에는 안 더함.
  //  site.ups[방] = { k, lv, paid }. 문만 옮기면 그대로, 시설 교체·철거 확정 때 지우고 paid만 한 번 환급 (commitLayout). 납품하면 현장과 함께 인계 (새 현장 = 빈 ups)
  function upTable(k) { var t = (BD.FAC_UP || {})[k]; return t && Array.isArray(t.levels) && t.levels.length ? t : null; }
  // 방 z의 강화 단계 (1 = 기본). zones·ups 없으면 지금 현장. 강화 칸의 시설이 지금 시설과 다르면 1
  function upLevel(z, zones, ups) {
    var st = RUN.site || {}; zones = zones || st.zones || {}; ups = ups || st.ups || {};
    var u = ups[z], t = upTable(zones[z]);
    return u && t && u.k === zones[z] ? Math.max(1, Math.min(t.levels.length, u.lv | 0)) : 1;
  }
  function upRow(k, lv) { var t = upTable(k); return t ? t.levels[Math.max(1, Math.min(t.levels.length, lv | 0)) - 1] : null; }
  // 함정 1회 피해 (칸당 기본 + 강화) · 대기실 전투 체력 배율
  function trapDmgAt(z, lv) { return ZONES.trapDmgOf(z) + ((upRow('trap', lv) || {}).dmgAdd || 0) * ZONES.sizeOf(z); }
  function denHpMulAt(lv) { var r = upRow('den', lv); return r && r.hpMul > 0 ? r.hpMul : 1; }
  // 효과 보기: 함정 { text, dmg } · 대기실 { text, hpMul }
  function upEffect(k, z, lv) {
    if (k === 'trap') { var d = trapDmgAt(z, lv); return { text: '피해 ' + d, dmg: d }; }
    var m = denHpMulAt(lv); return { text: '전투 체력 ×' + m.toFixed(2), hpMul: m };
  }
  // 전투 입력용 (battle_sim o.up): 기본 단계는 뺌
  function upMaps(zones, ups) {
    var out = { trap: {}, den: {} };
    Object.keys(ups || {}).forEach(function (z) {
      var lv = upLevel(z, zones, ups), k = zones[z];
      if (lv <= 1) return;
      if (k === 'trap') out.trap[z] = (upRow('trap', lv).dmgAdd || 0);
      else if (k === 'den') out.den[z] = denHpMulAt(lv);
    });
    return out;
  }
  function copyUps(u) { var o = {}; Object.keys(u || {}).forEach(function (z) { var x = u[z]; o[z] = { k: x.k, lv: x.lv, paid: x.paid }; }); return o; }
  // 강화 화면용: 방 z 강화 미리보기 (아무것도 바꾸지 않음). change = 화면의 미확정 배치 { builds } (그 방이 미확정이면 거절, 없어도 됨)
  //  -> { ok, why, code('locked'·'target'·'pending'·'max'·'budget'·''), z, name(방 이름), fac, facName, kind, level, max, cost(다음 단계, 최고면 0),
  //       effectNow, effectNext(최고면 null), paid(지금까지 낸 강화 마석), budget, budgetAfter, powerNow, powerAfter (정수, 납품 기준과 같은 값),
  //       powerGain(버리기 전 증가량 소수 1자리: 정수로는 +0이어도 조금 오르는 걸 보여 줄 때), valueNow(강화로 안 바뀜),
  //       pass(통과 비율 0~1, 낮으면 "문 배치부터"), units[대기실 출진 부대 보기], noEffect(빈 대기실 = 전투 효과 없음) }
  //  거절 순서: 전투 중·의뢰 없음 -> 없는 방 -> 잠긴 층 -> 고정 구역 -> 입구·보물방 -> 미확정 -> 빈 방·미끼·강화 없는 시설 -> 최고 단계 -> 마석
  function upgradeInfo(z, change) {
    var st = RUN.site, why = canEdit(), code = why ? 'locked' : '';
    function no(c, w) { if (!code) { code = c; why = w; } }
    var k = st && st.zones ? st.zones[z] : undefined, f = ZONES.FAC[k], t = upTable(k);
    if (!st || typeof z !== 'string' || z === 'Y' || !ZONES.CELLS[z] || !f) {
      return { ok: false, why: why || '없는 방이에요', code: code || 'target', z: z, level: 1, max: 1, cost: 0, effectNow: null, effectNext: null };
    }
    var fl = ZONES.floorOf(z), type = ZONES.zoneType(z), lv = upLevel(z), max = t ? t.levels.length : 1;
    if (!ZONES.floorOpen(fl)) no('locked', fl + '층은 아직 잠겨 있어요');
    if (st.fixed[z]) no('locked', '고정 구역은 강화할 수 없어요');
    if (type === 'entry') no('target', '입구는 강화할 수 없어요');
    if (type === 'boss') no('target', '보물방은 강화할 수 없어요');
    var pend = isObj(change) && isObj(change.builds) ? change.builds[z] : undefined;
    if (pend !== undefined && pend !== k) no('pending', '아직 확정하지 않은 시설이에요: [건설]로 확정한 뒤 강화할 수 있어요');
    if (k === 'empty') no('target', '빈 방이에요: 함정이나 대기실을 지으면 강화할 수 있어요');
    else if (f.kind === 'lure') no('target', '미끼는 강화할 수 없어요');
    else if (!t) no('target', '강화할 수 없는 시설이에요');
    var top = !t || lv >= max, cost = top ? 0 : Math.max(0, t.levels[lv].cost | 0);
    if (t && top) no('max', '최고 단계예요');
    if (!top && cost > budgetLeft()) no('budget', '마석 ' + (cost - budgetLeft()) + ' 모자람');
    var pp = powerParts(st.zones, st.units), powerNow = pp.total, powerAfter = powerNow, rawNow = pp.raw, rawAfter = rawNow;
    var paid = st.ups[z] && lv > 1 ? st.ups[z].paid : 0;
    if (t && !top && (!code || code === 'budget')) {
      var ups2 = copyUps(st.ups); ups2[z] = { k: k, lv: lv + 1, paid: paid + cost };
      var fm = formation(st.zones, st.deploy, st.pins, st.auto && RUN.phase === 'play', undefined, ups2);
      var pa = powerParts(st.zones, fm.units, undefined, ups2); powerAfter = pa.total; rawAfter = pa.raw;
    }
    var den = f.kind === 'den', us = den ? (st.units[z] || []).map(unitById) : [];
    return {
      ok: !code, why: why, code: code, z: z, name: ZONES.NAMES[z] || z, fac: k, facName: f.name, kind: f.kind, level: lv, max: max, cost: cost,
      effectNow: t ? upEffect(k, z, lv) : null, effectNext: t && !top ? upEffect(k, z, lv + 1) : null, paid: paid,
      budget: budgetLeft(), budgetAfter: budgetLeft() - cost, powerNow: powerNow, powerAfter: powerAfter,
      powerGain: Math.round((rawAfter - rawNow) * 10) / 10, valueNow: siteValue(),
      pass: Math.round((ZONES.passRatios(st.zones, {})[z] || 0) * 1000) / 1000, units: us, noEffect: den && !us.length
    };
  }
  // [강화]: 한 단계 올림 (upgradeInfo가 ok일 때만). 마석 차감 -> 편성·납품 단계·침입자 예고 다시 계산 -> 저장. -> { ok, msg, code, level, cost, stages }
  function upgradeFacility(z, change) {
    var inf = upgradeInfo(z, change), st = RUN.site;
    if (!inf.ok) return { ok: false, msg: inf.why, code: inf.code, level: inf.level, cost: 0, stages: [] };
    st.budget -= inf.cost; st.spent += inf.cost;
    st.ups[z] = { k: inf.fac, lv: inf.level + 1, paid: inf.paid + inf.cost };
    var stages = afterChange();
    return { ok: true, msg: inf.name + ' ' + inf.facName + ' ' + (inf.level + 1) + '단계 (마석 -' + inf.cost + ', ' + inf.effectNow.text + ' -> ' + inf.effectNext.text + ')',
      code: '', level: inf.level + 1, cost: inf.cost, stages: stages };
  }

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
  function forecast(zones, units, doors) { return ZONES.forecast(zones || RUN.site.zones, units || RUN.site.units, ZONES.PREVIEW_INVADERS, doors ? flatDoors(doors) : undefined); }

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
  // rf = 무작위 함수 (없으면 게임 무작위 rnd. 흐름 시험 일반 판은 전투 번호로 정한 씨앗 무작위)
  function makePlan(surge, rf) {
    var rr = rf || rnd, ri = function (n) { return Math.floor(rr() * n); };
    var spec = surge ? BD.SURGE : BD.NORMAL, groups = [], used = {};
    var card = BD.INVADER_CARDS[ri(BD.INVADER_CARDS.length)];
    spec.grades.forEach(function (g, i) {
      var names = BD.GROUP_NAMES[g], name;
      do { name = names[ri(names.length)]; } while (used[name] && names.length > 1);
      used[name] = true;
      var sq = spec.squads[0] + ri(spec.squads[1] - spec.squads[0] + 1);
      groups.push({ name: name, grade: g, count: sq * BD.SQUAD, top: i === spec.grades.length - 1, lv: 0, roll: ri(3),
        porters: BD.PORTER_MIN + ri(BD.PORTER_MAX - BD.PORTER_MIN + 1) });
    });
    var order = BD.EVENT_CARDS.map(function (c, i) { return i; });
    for (var k = order.length - 1; k > 0; k--) { var j = ri(k + 1), t = order[k]; order[k] = order[j]; order[j] = t; }
    return fitPlan({ week: RUN.week, surge: !!surge, ad: !OFF.adSurge && RUN.adWeek === RUN.week, groups: groups, card: card.id, order: order, seed: (rr() * 4294967296) | 0 });
  }
  // ---------- 흐름 시험: 일반 판·보스 판 계획 ----------
  // 일반 판 no번 = 바탕 씨앗 + 번호로 만든 씨앗 무작위 (같은 번호 = 같은 무리·같은 전투 시드). 강함은 지금 위협 점수(fitPlan) 그대로
  function normalPlan(no) {
    var p = makePlan(false, seededRnd(mixSeed(RUN.flow.base, no)));
    p.mode = 'normal'; p.no = no;
    return p;
  }
  // 보스 표 (BATTLE_DATA.BOSSES[의뢰 key][단계 0~]). 없으면 null
  function bossData(key, idx) { var t = (BD.BOSSES || {})[key]; return Array.isArray(t) && t[idx] ? t[idx] : null; }
  // 보스 판 = 표 그대로 (위협 점수·회사 레벨과 상관없음 -> 같은 단계는 늘 같은 무리·같은 시드 = 같은 배치면 같은 결과)
  function bossPlan(q, idx) {
    var b = bossData(q.key, idx);
    if (!b) return null;
    var groups = b.groups.map(function (g, i) {
      return { name: g.name, grade: g.grade, count: (g.squads || 1) * BD.SQUAD, top: i === b.groups.length - 1, lv: g.lv | 0, roll: 0, porters: g.porters | 0 };
    });
    return { week: RUN.week, surge: false, ad: false, groups: groups, card: b.card, order: BD.EVENT_CARDS.map(function (c, i) { return i; }), seed: b.seed | 0,
      mode: 'boss', stage: idx + 1, name: b.name, value: 0, dlv: 0, power: b.power || 1, attr: q.attr ? q.attr.id : '', trapBoost: 0 };
  }
  function ensurePlan() {
    if (flowOn()) return;   // 흐름 시험: 계획은 전투를 시작할 때만 만든다 (startBattle·challengeBoss)
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
    if (flowOn()) {   // 흐름 시험: 다음 일반 판 (전투 번호 +1). 보스 결과 창은 닫음
      RUN.flow.no++; RUN.flow.show = null; RUN.flow.mode = 'normal';
      RUN.plan = normalPlan(RUN.flow.no);
      RUN.battling = true; RUN.bsave = freshBattleSave();
      save();
      return { ok: true, plan: RUN.plan, msgs: battleNotes() };
    }
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
    return { plan: plan || RUN.plan, zones: RUN.site.zones, units: us, unitById: unitById, goal: ZONES.goal(), doors: copyDoors(RUN.site.doors),
      up: upMaps(RUN.site.zones, RUN.site.ups) };   // 시설 강화 (battle_sim이 전투 시작 때 한 번 적용)
  }

  // ---------- 전투 결과 반영 ----------
  // res = battle_sim.js result { kills, porterKills, total, squads, gold, gems(소수), exp, reached, retreated, timeout, loot, damage, deployed, fought, monRetreat, crises }
  //  회사 금 += 이번 전투 금 - 약탈(이번 전투 금 안에서만). 수리비 없음(D1). 경험치 = 출진 deploy + 실제로 싸웠으면 fight (현장 부대는 작품집 효과 +%)
  //  퇴각(monRetreat): 다음 주 쉼. 큰 피해로 퇴각한 부대만 쓰러진 인원마다 사망 확률 (첫 의뢰 noDeath는 없음, 친위대 불사). 숙련도·레벨은 그대로.
  //  인원이 0이 된 부대(전멸)는 다음 주에 기본 인원 무료 보충
  function applyBattle(res) {
    if (RUN.phase !== 'play' || !RUN.battling) return null;
    if (flowOn()) return applyFlow(res);
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
    var budgetGain = weeklyBudget();
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
    // 3차 결과표 한 줄: "함정으로 N분대 퇴각, 대기실에서 N분대 격퇴" (BATTLE_DATA.SUMMARY_TEXT)
    rep.trapRetreats = res.trapRetreats | 0; rep.denRepels = res.denRepels | 0; rep.clashes = res.clashes | 0;
    rep.summary = String(BD.SUMMARY_TEXT || '').replace('{trap}', rep.trapRetreats).replace('{den}', rep.denRepels);
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

  // ---------- 흐름 시험: 일반 판 자동 반복 + 보스 도전 (refs/brief_flow_test.md, API.md 15절) ----------
  // 진행 중 일반 판 버리기 (배치를 바꿨을 때·보스 도전·납품). 보상 없음. 버렸으면 true (저장은 부른 쪽이)
  function dropNormal() {
    if (!RUN.battling || RUN.flow.mode === 'boss') return false;
    RUN.battling = false; RUN.bsave = null; RUN.plan = null; RUN.flow.mode = '';
    return true;
  }
  // 다음 보스: { stage(도전할 단계 1~), total, name, squads, groups[{ name, grade, squads, lv }], tries, reward(첫 성공 마석), supply(그 단계 의뢰인 보급 마석),
  //  gain(이기면 받을 마석 = supply + reward, 이미 받은 단계면 0), done(모두 통과), canChallenge, why }
  function bossInfo() {
    var q = RUN.quest;
    if (!flowOn() || RUN.phase !== 'play' || !q) return null;
    var total = q.stages.length, done = q.stage >= total, b = done ? null : bossData(q.key, q.stage), why = '';
    if (done) why = '보스를 모두 이겼어요. 홈에서 납품하세요';
    else if (!b) why = '이 단계 보스 자료가 없어요';
    else if (RUN.battling && RUN.flow.mode === 'boss') why = '보스전 중이에요';
    var sq = 0; (b ? b.groups : []).forEach(function (g) { sq += g.squads || 1; });
    var reward = bossReward(), supply = done ? 0 : stageSupply(q, q.stage), got = done || RUN.flow.cleared.indexOf(q.stage + 1) >= 0;
    return { stage: Math.min(total, q.stage + 1), total: total, name: b ? b.name : '', squads: sq,
      groups: b ? b.groups.map(function (g) { return { name: g.name, grade: g.grade, squads: g.squads || 1, lv: g.lv | 0 }; }) : [],
      tries: RUN.flow.tries, reward: reward, supply: supply, gain: got ? 0 : supply + reward, done: done, canChallenge: !why, why: why };
  }
  // 마석 경제 (API.md 16절): 단계 보스 첫 성공 보상 · idx(0~)단계 의뢰인 보급
  function bossReward() { return Math.max(0, (BD.FLOW && BD.FLOW.bossReward) | 0); }
  function stageSupply(q, idx) { var s = q && q.stages ? q.stages[idx] : null; return s && s.budget > 0 ? s.budget | 0 : 0; }
  // [보스 도전]: 진행 중 일반 판은 버리고 바로 보스 판 (보스 중엔 일반 침입 없음). -> { ok, msg, plan, msgs }
  function challengeBoss() {
    if (!flowOn()) return { ok: false, msg: '흐름 시험이 꺼져 있어요', msgs: [] };
    if (RUN.phase !== 'play' || !RUN.quest) return { ok: false, msg: '진행 중인 의뢰가 없어요', msgs: [] };
    if (RUN.battling && RUN.flow.mode === 'boss') return { ok: true, msg: '', plan: RUN.plan, msgs: [] };
    var bi = bossInfo();
    if (!bi.canChallenge) return { ok: false, msg: bi.why, msgs: [] };
    dropNormal();
    RUN.plan = bossPlan(RUN.quest, RUN.quest.stage);
    RUN.flow.mode = 'boss'; RUN.flow.tries++; RUN.flow.show = null;
    RUN.battling = true; RUN.bsave = freshBattleSave();
    save();
    return { ok: true, msg: '보스 ' + bi.stage + '단계 도전: ' + bi.name, plan: RUN.plan, msgs: battleNotes() };
  }
  // 보스 결과 창 닫기 (show 지움). 보상은 이미 applyBattle 때 받음
  function closeBossResult() { if (!RUN.flow.show) return false; RUN.flow.show = null; save(); return true; }
  // 화면용 요약: { on, no(일반 판 번호), mode, battling, show(보스 결과), boss(bossInfo), rest(판 사이 쉬는 초), saveEvery }
  function flowInfo() {
    var F = BD.FLOW || {};
    return { on: flowOn(), no: RUN.flow ? RUN.flow.no : 0, mode: RUN.flow ? RUN.flow.mode : '', battling: !!RUN.battling, show: RUN.flow ? RUN.flow.show : null,
      boss: bossInfo(), rest: typeof F.rest === 'number' ? F.rest : 1.5, saveEvery: typeof F.saveEvery === 'number' ? F.saveEvery : 2 };
  }
  // 보스 결과 자세히: 분대마다 어디까지 갔나(지난 방 수·끝난 방·보물방 도달)·함정 피해·퇴각 원인
  var CAUSE_NAME = { trap: '함정', den: '대기실', clash: '조우 피해', card: '카드', timeout: '시간 초과', treasure: '보물방 도달' };
  function bossReport(res, p) {
    var rows = (Array.isArray(res.squadResults) ? res.squadResults : []).map(function (r) {
      return { id: r.id, grade: r.grade || '', state: r.state, cause: r.cause || '', causeText: r.state === 'reached' ? '보물방 도달' : (CAUSE_NAME[r.cause] || r.cause || ''),
        rooms: r.rooms | 0, last: r.last || '', lastName: ZONES.NAMES[r.last] || r.last || '', trapDmg: r.trapDmg | 0, hpLeft: r.hpLeft | 0 };
    });
    var causes = {}; rows.forEach(function (r) { if (r.state !== 'reached') causes[r.causeText] = (causes[r.causeText] || 0) + 1; });
    return { stage: p.stage, name: p.name, success: (res.reached | 0) === 0, reached: res.reached | 0, squads: res.squads | 0, rows: rows,
      trapDmg: Math.round(res.trapDmg || 0), causes: causes, tries: RUN.flow.tries, reward: 0, supply: 0, time: Math.round((res.time || 0) * 10) / 10 };
  }
  // 흐름 시험 결과 반영 (applyBattle이 부름). 일반 판: 금·신석만 (경험치·회사 경험치·마석 보급·쉼 없음, 부대는 다음 판에 회복).
  //  보스 판: 보물방 도달 0이면 성공 -> 의뢰 단계 +1 (+ 그 단계 의뢰인 보급 stages[i].budget + 첫 성공 마석 FLOW.bossReward, 단계마다 한 번만). 실패는 잃는 것 없음. 결과는 RUN.flow.show에 남김
  function applyFlow(res) {
    var p = RUN.plan || {}, st = RUN.site, q = RUN.quest, boss = p.mode === 'boss';
    var goldBefore = RUN.gold, gemsBefore = RUN.gems;
    var gold = Math.max(0, Math.round(res.gold || 0)), gems = Math.max(0, Math.floor(res.gems || 0));
    var loot = Math.min(Math.max(0, Math.round(res.loot || 0)), gold);
    RUN.gold += gold - loot; RUN.gems += gems;
    RUN.stats.battles++;
    var rep = { mode: boss ? 'boss' : 'normal', no: p.no || 0, kills: res.kills | 0, porterKills: res.porterKills | 0, total: res.total | 0,
      gold: gold, gems: gems, loot: loot, reached: res.reached | 0, squads: res.squads | 0, retreated: res.retreated | 0, timeout: !!res.timeout,
      defended: (res.reached | 0) === 0, goldBefore: goldBefore, goldAfter: RUN.gold, gemsBefore: gemsBefore, gemsAfter: RUN.gems,
      trapRetreats: res.trapRetreats | 0, denRepels: res.denRepels | 0, clashes: res.clashes | 0, stages: [], budgetGain: 0, boss: null };
    rep.summary = String(BD.SUMMARY_TEXT || '').replace('{trap}', rep.trapRetreats).replace('{den}', rep.denRepels);
    if (boss && q) {
      var b = bossReport(res, p), idx = (p.stage | 0) - 1;
      if (b.success && q.stage === idx && idx < q.stages.length) {
        var stg = q.stages[idx];
        q.stage++; q.stageWeeks.push(RUN.week); rep.stages.push(q.stage);
        if (stg.opens > st.floorsOpen) { st.floorsOpen = Math.min(st.floors, stg.opens); useSiteLayout(); arrange(); }
        if (RUN.flow.cleared.indexOf(p.stage) < 0) {   // 그 단계 의뢰인 보급 + 첫 성공 보상 (단계마다 한 번만, API.md 16절)
          var supply = stageSupply(q, idx), gain = bossReward();
          st.budget += supply + gain; st.budgetAdded += supply + gain; RUN.flow.cleared.push(p.stage);
          b.supply = supply; b.reward = gain; rep.budgetGain = supply + gain;
        }
      }
      b.stageAfter = q.stage; b.total = q.stages.length; b.complete = q.stage >= q.stages.length;
      rep.boss = b; RUN.flow.show = b;
    }
    RUN.battling = false; RUN.bsave = null; RUN.plan = null; RUN.flow.mode = ''; RUN.lastBattle = rep;
    rep.budgetAfter = budgetLeft();
    rep.progress = questProgress();
    save();
    return rep;
  }

  // ---------- 해금 (경험 중심, GAME_STRUCTURE 5절) ----------
  function unlocks() {
    return { corps: RUN.stats.battles > 0, guards: RUN.stats.delivers > 0, works: RUN.works.length > 0,
      floor2: !!(RUN.site && RUN.site.floorsOpen >= 2), secondQuest: RUN.company.lv >= (demoQuests()[1] ? demoQuests()[1].minCompanyLv : 99), demoEnd: RUN.phase === 'demoEnd' };
  }

  // ---------- 공방 (데모에서 꺼짐) ----------
  function workshopDef(id) { for (var i = 0; i < WORKSHOP_DEFS.length; i++) { if (WORKSHOP_DEFS[i].id === id) return WORKSHOP_DEFS[i]; } return null; }
  function workshopEffect(id) {
    var d = workshopDef(id);
    if (OFF.workshop || !d || !d.ready || !RUN.workshop) return 0;
    return d.per * (RUN.workshop[id] || 0);
  }
  function upgradeBlock() { return (flowOn() ? RUN.battling && RUN.flow.mode === 'boss' : RUN.battling) || battling ? '전투 중에는 강화할 수 없어요' : ''; }
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
    siteSummary: siteSummary, siteValue: siteValue, sitePower: sitePower, powerInfo: powerInfo, powerOf: powerOf, budgetLeft: budgetLeft, weeklyBudget: weeklyBudget,
    previewBuild: previewBuild, buildZone: buildZone, buildCost: buildCost, forecast: forecast,
    // 문 토큰 (3차)
    previewLayout: previewLayout, commitLayout: commitLayout, doorInfo: doorInfo, exploreRoutes: exploreRoutes, takeNotice: takeNotice,
    // 시설 강화
    upgradeInfo: upgradeInfo, upgradeFacility: upgradeFacility, upgradeLevel: function (z) { return RUN.site ? upLevel(z) : 1; },
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
    // 흐름 시험 (API.md 15절)
    flowInfo: flowInfo, bossInfo: bossInfo, challengeBoss: challengeBoss, closeBossResult: closeBossResult, stopBattle: function () { var r = dropNormal(); if (r) save(); return r; },
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
