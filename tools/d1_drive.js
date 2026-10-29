// D1 데모(prototype/d1_demo) 화면을 헤드리스 Chrome으로 움직이는 검사 실행기: 화면 사진 찍기(shots) · 한 바퀴 진행(flow). shots.py·test_d1_flow.py가 부른다
// DS 구조 UI(2026-10-29, 시안 refs/mockup_ds_ui_2026-10-29, 지시서 refs/brief_ds_ui.md): 홈(던전 자동 전투가 늘 보이는 화면) + 하단 탭 6개(회사·카드·군단·도전·마계·상점)가 홈 위로 올리는 패널 + 건설 모드.
//  한 바퀴 = 첫 시작(의뢰 없음 홈) -> 왼쪽 [의뢰] 패널에서 수락 -> 일반 침입 자동 반복 -> 패널을 열어도 전투가 계속 도는지(위 150px) -> 군단·카드·잠긴 탭 -> 성장판 칸으로 건설(취소·미확정 묻기·확정)
//           -> 출진 창 -> 보스 실패(카드 창 넘기기) -> 배치 고치기 -> 재도전 성공 -> (API로 빨리) 5/5 -> 스테이지 막대·결과의 [납품] -> 정산 -> 데모 끝. 마석 숫자는 core-dev가 바꿀 수 있어 하드코딩하지 않고 API에서 읽어 비교한다.
//  보스 카드 (API.md 18절): 본줄기 보스 판의 카드 창은 전부 [넘기기] (창 2번·시간 정지·새로고침 복원·넘침 0, 결과에 넘기기 2줄) -> 끝에 카드 한 바퀴를 새 브라우저로 따로
//  (임시 수비대 [방 고르기] -> 취소 -> 다시 -> 새로고침 복원 -> 방 누름 -> [사용] -> 연막 -> 결과 카드 기록). 빨리 감기 단계는 카드 없이 API로 그대로.
/*
 * 사용: node tools/d1_drive.js shots <사진 폴더>   -> 사진 PNG + 마지막 줄 JSON { cases:[{ name, w, h, file, overflow, scrollWidth, wide[], logs[], problems[] }] }
 *       node tools/d1_drive.js flow                -> 마지막 줄 JSON { steps:[글], problems:[글], logs:[글] }
 * - 브라우저 = tools/cdp.js (GAME_BROWSER 환경 변수). 매번 새 프로필이라 내 브라우저 저장과 섞이지 않는다.
 * - 사진은 흔들리지 않게: ?seed=1 · 튜토리얼 건너뜀 · 설정 "움직임 줄이기"(캐릭터 걷기·반짝임 멈춤) ·
 *   연출용 무작위 고정(D1DRIVE_PRELOAD) · 전투 장면은 전투 계산을 페이지 안에서 정해진 초까지 돌려 저장 지점(멈춤)으로 넣고 새로고침(멈춘 상태로 이어짐).
 * - 값은 화면이 쓰는 공개 함수(PROGRESS·ZONES·BSIM, API.md)로만 바꾼다. RUN을 직접 고치지 않는다.
 */
'use strict';
const d1drive_path = require('path');
const { cdp_launch } = require('./cdp.js');

const D1DRIVE_ROOT = d1drive_path.dirname(__dirname);
const D1DRIVE_URL = 'file:///' + d1drive_path.join(D1DRIVE_ROOT, 'prototype', 'd1_demo', 'index.html').replace(/\\/g, '/').replace(/^\/+/, '');
// 페이지 스크립트보다 먼저: 연출용 무작위 고정 + (사진용) 움직임 줄이기·소리·진동 끔
const D1DRIVE_PRELOAD = '(function(){var s=20261024;Math.random=function(){s=(s*1103515245+12345)%2147483648;return s/2147483648;};' +
  'try{localStorage.setItem("dunguen_d1_settings",JSON.stringify({sound:false,vibe:false,reduce:true}));}catch(e){}})();';
const D1DRIVE_PRELOAD_FLOW = '(function(){var s=7;Math.random=function(){s=(s*1103515245+12345)%2147483648;return s/2147483648;};})();';

// 페이지 안에서 쓰는 도우미 (한 번 심어 두고 window.__d1t.이름(...)으로 부름). 정규식 글자 없이 쓴다
const D1DRIVE_PAGE = `window.__d1t = {
  screen: function () { return document.body.getAttribute('data-screen'); },
  // 1층 문 하나를 문 없는 다른 벽으로 옮길 수 있는 첫 짝 (미리보기 검사 통과)
  doorMove: function () {
    var Z = ZONES, P = PROGRESS, d = (Z.doors()[1] || Z.doors()['1'] || []).slice(), ed = Z.edges(1), has = {};
    d.forEach(function (x) { has[x] = 1; });
    for (var i = 0; i < d.length; i++) for (var j = 0; j < ed.length; j++) {
      var e = ed[j]; if (has[e.id]) continue;
      var l = d.map(function (x) { return x === d[i] ? e.id : x; });
      var p = P.previewLayout({ doors: { 1: l }, builds: {} });
      if (p.ok) return { from: d[i], to: e.id, x: e.x, y: e.y, list: l };
    }
    return null;
  },
  // 벽 조각 id의 화면 좌표 (1층 판)
  edgeOf: function (id) { var e = ZONES.edges(1).filter(function (x) { return x.id === id; })[0]; return e ? __d1t.edgeXY(e.x, e.y) : null; },
  // 벽 조각 가운데의 화면 좌표 (1층 판)
  edgeXY: function (x, y) {
    var w = document.querySelector('.zwrap[data-floor="1"]').getBoundingClientRect(), g = ZONES.grid(1);
    return { x: w.left + x / g.cols * w.width, y: w.top + (y - g.rowOff) / g.rows * w.height };
  },
  center: function (sel) {
    var e = document.querySelector(sel); if (!e) return null;
    var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  },
  // 일반 한 판을 끝까지 계산해 결과 반영 (첫 전투 정산 -> 군단 열림). 진행 중 판이 없게 끝낸다
  normalDone: function () {
    var P = PROGRESS; if (P.battlePlan()) P.stopBattle();
    var r = P.startBattle(); if (!r.ok) return 'startBattle 실패';
    var S = BSIM.create(P.battleInput());
    for (var i = 0; i < 20000 && !S.done; i++) BSIM.step(S, 0.05);
    return P.applyBattle(BSIM.result(S)) ? 'ok' : 'applyBattle 실패';
  },
  // 전투를 페이지 안에서 t초(또는 끝)까지 계산해 저장 지점으로 넣는다 -> 새로고침하면 그 장면에서 멈춘 채 이어짐 (일반 판)
  battleTo: function (t) {
    var P = PROGRESS;
    if (!P.battlePlan()) { var r = P.startBattle(); if (!r.ok) return 'startBattle 실패'; }
    var S = BSIM.create(P.battleInput());
    for (var i = 0; i < 20000 && !S.done && (t < 0 || S.t < t); i++) { BSIM.step(S, 0.05); if (S.pending) BSIM.nextFloor(S); }
    P.saveBattle({ snap: BSIM.snapshot(S), ui: { queue: [], cardsShown: 0, cardsUsed: 0, cardNo: 0, picks: [], paused: true } });
    return S.done ? 'done' : 't=' + Math.round(S.t * 10) / 10;
  },
  // 보스 지금 단계를 t초까지 계산해 멈춘 저장 지점으로 (보스 도전 장면 사진)
  bossTo: function (t) {
    var P = PROGRESS, c = P.challengeBoss(); if (!c.ok) return 'challengeBoss 실패: ' + c.msg;
    var S = BSIM.create(P.battleInput());
    for (var i = 0; i < 20000 && !S.done && S.t < t; i++) { BSIM.step(S, 0.05); if (S.pending) BSIM.nextFloor(S); }
    P.saveBattle({ snap: BSIM.snapshot(S), ui: { queue: [], cardsShown: 0, cardsUsed: 0, cardNo: 0, picks: [], paused: true } });
    return 't=' + Math.round(S.t * 10) / 10;
  },
  // 보스 지금 단계를 끝까지 계산해 결과 반영 (결과 창 = RUN.flow.show) -> 'ok' 또는 실패 이유
  bossResult: function () {
    var P = PROGRESS, c = P.challengeBoss(); if (!c.ok) return 'challengeBoss 실패: ' + c.msg;
    var S = BSIM.create(P.battleInput());
    for (var i = 0; i < 20000 && !S.done; i++) BSIM.step(S, 0.05);
    return P.applyBattle(BSIM.result(S)) ? 'ok' : 'applyBattle 실패';
  },
  // 가로 넘침 (문서 폭 > 창 폭) + 창 밖으로 나간 요소 몇 개 (힌트)
  overflow: function () {
    var W = window.innerWidth, sw = document.documentElement.scrollWidth, wide = [];
    if (sw > W) document.querySelectorAll('body *').forEach(function (e) {
      var r = e.getBoundingClientRect();
      if (wide.length < 5 && r.width > 0 && r.right > W + 1) wide.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').join('.') : ''));
    });
    return { overflow: sw > W, scrollWidth: sw, innerWidth: W, wide: wide };
  },
  // 눌러야 하는 버튼이 화면 안에 다 보이고 탭 막대에 안 가려졌는가 (선택자 목록 -> 안 보이는 것들)
  hidden: function (sels) {
    var tabs = document.getElementById('tabs'), tb = tabs && !tabs.hidden ? tabs.getBoundingClientRect().top : innerHeight, bad = [];
    sels.forEach(function (s) {
      var e = document.querySelector(s); if (!e) { bad.push(s + ' (없음)'); return; }
      var r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom > tb + 1 || r.top < -1 || r.right > innerWidth + 1) bad.push(s + ' (' + Math.round(r.top) + '~' + Math.round(r.bottom) + ', 탭 ' + Math.round(tb) + ')');
    });
    return bad;
  },
  // 시안 치수 (390x844): 위에서 아래로 상단 바 56 · 스테이지 막대 40 · 판 262x367 · 카드 칸 50 · 성장판 칸 58 · 하단 탭 62
  geo: function () {
    function g(s) { var e = document.querySelector(s); if (!e) return null; var r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; }
    return { hud: g('.hud'), sbar: g('.sbar'), bbox: g('.bbox'), arena: g('.arena'), cslot: g('.cslot'), gcell: g('.gcell'), tabs: g('#tabs'), panel: g('#panel') };
  },
  // 판의 모든 분대 점 위치 글 (시간이 흘렀는지 보는 용)
  dots: function () { return Array.prototype.map.call(document.querySelectorAll('.bt-sq'), function (e) { return e.style.left + ',' + e.style.top + e.className; }).join('|'); },
  // 눈에 보이는 칸 이름표(.zn)가 있는가 (없어야 함)
  names: function () { return Array.prototype.filter.call(document.querySelectorAll('.zl .zn'), function (e) { return getComputedStyle(e).display !== 'none'; }).length; }
};`;

async function d1drive_page(b) { await b.ev(D1DRIVE_PAGE); }
async function d1drive_go(b, hash) {   // 화면 바꾸고 새로고침 (토스트·튜토리얼 말풍선·애니메이션이 안 남게)
  await b.ev('location.hash = ' + JSON.stringify('#' + hash));
  await b.reload(300);
  await b.until('document.body.getAttribute("data-screen")', 5000);
  await b.ev('document.fonts.ready.then(function () { return 1; })');
  await b.sleep(200);
  await d1drive_page(b);
}

// ---------------- 화면 사진 ----------------
// 사진 하나 = { name, w, h, hash, expect(있어야 할 요소), must(가려지면 안 되는 버튼) }. 상태는 차례로 쌓인다: 의뢰 고름 -> 문 1개 옮기고 대기실 1곳 건설 -> 홈에 회사 패널(일반 판 12초, 멈춤)
//  -> 홈 -> 건설 -> 보스 도전(10초, 멈춤) -> 보스 1단계 결과. (이름은 예전 사진과 같게 두어 기준 이미지와 비교되게 함: company = 회사 패널, field = 홈, battle = 보스 도전 중)
const D1DRIVE_SHOTS = [
  { name: 'd1_company_390', w: 390, h: 844, hash: 'company', battle: 12, expect: '.pnl.p-company .stage', must: ['.pnl.p-company .stage', '.arena'] },
  { name: 'd1_field_390', w: 390, h: 844, hash: 'field', battle: 12, expect: '.sbar.op [data-fboss]', must: ['[data-fboss]', '[data-gcell="trap"]', '[data-fsortie]', '[data-fpause]', '.bt-board', '.cslot'] },
  { name: 'd1_build_390', w: 390, h: 844, hash: 'build', expect: '.buildmode [data-confirm]', must: ['[data-confirm]', '[data-end]', '.bt-board, .zwrap'] },
  { name: 'd1_battle_390', w: 390, h: 844, hash: 'field', boss: 10, expect: '.sbar.boss', must: ['[data-fpause]', '.bt-board'] },
  { name: 'd1_result_390', w: 390, h: 844, hash: 'field', result: true, expect: '.rsheet', must: ['[data-ffix]', '[data-fretry]', '[data-fresume]', '.bt-board'] },
  { name: 'd1_company_1280', w: 1280, h: 800, hash: 'company', battle: 12, expect: '.pnl.p-company .stage', must: ['.pnl.p-company .stage'] }
];

async function d1drive_setup(b) {   // 새 게임 -> 첫 의뢰 -> 튜토리얼 끔 -> 문 1개 옮김 + 대기실(C6) 확정
  await d1drive_page(b);
  const r = await b.ev(`(function () {
    var P = PROGRESS;
    if (P.RUN.phase !== 'choose') return '처음 상태가 의뢰 고르기가 아님: ' + P.RUN.phase;
    if (!P.pickQuest(P.offerQuests()[0])) return 'pickQuest 실패';
    P.skipTutorial();
    var m = __d1t.doorMove(); if (!m) return '옮길 수 있는 문이 없음';
    var c = P.commitLayout({ doors: { 1: m.list }, builds: { C6: 'den' } });
    return c.ok ? 'ok' : 'commitLayout 실패: ' + (c.msg || c.code);
  })()`);
  if (r !== 'ok') throw new Error('사진 준비 실패: ' + r);
}

async function d1drive_shots(outDir) {
  const out = [];
  const widths = [];
  D1DRIVE_SHOTS.forEach(c => { if (widths.indexOf(c.w + 'x' + c.h) < 0) widths.push(c.w + 'x' + c.h); });
  for (const wh of widths) {
    const [w, h] = wh.split('x').map(Number);
    const b = await cdp_launch(D1DRIVE_URL + '?seed=1', { w, h, preload: D1DRIVE_PRELOAD, wait: 500 });
    try {
      await d1drive_setup(b);
      for (const c of D1DRIVE_SHOTS.filter(x => x.w === w && x.h === h)) {
        const before = b.logs.length;
        if (c.battle !== undefined) {
          const st = await b.ev('__d1t.battleTo(' + c.battle + ')');
          if (st.indexOf('실패') >= 0) throw new Error(c.name + ': ' + st);
        }
        if (c.boss !== undefined) {
          const st = await b.ev('__d1t.bossTo(' + c.boss + ')');
          if (st.indexOf('실패') >= 0) throw new Error(c.name + ': ' + st);
        }
        if (c.result) {
          const st = await b.ev('__d1t.bossResult()');
          if (st !== 'ok') throw new Error(c.name + ': ' + st);
        }
        await d1drive_go(b, c.hash);
        const problems = [];
        if (c.expect && !(await b.ev('!!document.querySelector(' + JSON.stringify(c.expect) + ')'))) problems.push('화면에 ' + c.expect + ' 가 없음');
        const scr = await b.ev('__d1t.screen()');
        if (scr !== c.hash) problems.push('화면이 ' + c.hash + '가 아니라 ' + scr);
        const bad = await b.ev('__d1t.hidden(' + JSON.stringify(c.must || []) + ')');
        bad.forEach(x => problems.push('버튼·판이 가려지거나 화면 밖: ' + x));
        const ov = await b.ev('__d1t.overflow()');
        const file = d1drive_path.join(outDir, c.name + '.png');
        await b.shot(file);
        out.push({ name: c.name, w, h, file, overflow: ov.overflow, scrollWidth: ov.scrollWidth, innerWidth: ov.innerWidth, wide: ov.wide,
          logs: b.logs.slice(before), problems });
      }
    } finally { await b.close(); }
  }
  return { cases: out };
}

// ---------------- 한 바퀴 (DS 구조 UI, 지시서 refs/brief_ds_ui.md · API.md 15절) ----------------
async function d1drive_flow() {
  const steps = [], problems = [];
  const need = (cond, msg) => { if (!cond) problems.push(msg); return !!cond; };
  let tLast = Date.now();
  const step = (s) => { const now = Date.now(); steps.push(s + ' [' + ((now - tLast) / 1000).toFixed(1) + '초]'); tLast = now; };
  const b = await cdp_launch(D1DRIVE_URL + '?seed=7', { w: 390, h: 844, preload: D1DRIVE_PRELOAD_FLOW, wait: 500 });
  step('브라우저 열기');
  const scr = () => b.ev('__d1t.screen()');
  const fin = () => ({ steps, problems, logs: b.logs });
  const has = (sel) => b.ev('!!document.querySelector(' + JSON.stringify(sel) + ')');
  const count = (sel) => b.ev('document.querySelectorAll(' + JSON.stringify(sel) + ').length');
  const text = (sel) => b.ev('(function () { var e = document.querySelector(' + JSON.stringify(sel) + '); return e ? e.innerText : ""; })()');
  const attr = (sel, a) => b.ev('(function () { var e = document.querySelector(' + JSON.stringify(sel) + '); return e ? (e.getAttribute(' + JSON.stringify(a) + ') || "") : ""; })()');
  const noOverflow = async (what) => { const o = await b.ev('__d1t.overflow()'); need(!o.overflow, what + ': 가로 넘침 scrollWidth ' + o.scrollWidth + ' > ' + o.innerWidth + ' ' + (o.wide || []).join(',')); };
  const visible = async (what, sels) => { const bad = await b.ev('__d1t.hidden(' + JSON.stringify(sels) + ')'); need(!bad.length, what + ': 버튼이 가려지거나 화면 밖: ' + bad.join(' / ')); };
  const toastHas = async (s) => (await b.ev('document.getElementById("toasts").innerText')).indexOf(s) >= 0;
  const tabLabels = 'Array.prototype.map.call(document.querySelectorAll("#tabs .tb .nm"), function (x) { return x.textContent; }).join(",")';
  const battleSig = 'JSON.stringify({ no: PROGRESS.flowInfo().no, t: PROGRESS.RUN.bsave && PROGRESS.RUN.bsave.snap ? PROGRESS.RUN.bsave.snap.t : -1 })';
  // 보스 카드 창(API.md 18절)이 뜨면 전부 [넘기기] (카드 없는 판과 같은 결과). check = 몇 번째 창인지 받아 확인할 일
  const cardWin = '.cardline [data-cd-skip]';
  let cardWins = 0;
  const waitResult = async (check) => {
    const t = Date.now();
    while (Date.now() - t < 60000) {
      if (await has('.rsheet')) return true;
      if (await has(cardWin)) { cardWins++; if (check) await check(cardWins); await b.click('[data-cd-skip]'); await b.sleep(120); continue; }
      await b.sleep(200);
    }
    return false;
  };
  // 첫 보스전 첫 창: 후보·시간 정지·넘침 0·새로고침해도 같은 창
  const firstWin = async (n) => {
    if (n !== 1) return;
    need((await count('.cslot.cand')) >= 1 && (await text('.cardline')).indexOf('카드 1/2') >= 0 && (await has('.cardbox:not([hidden]) [data-cd-go]')), '첫 카드 창에 밝은 후보 카드 칸·`카드 1/2`·고른 카드 상자가 없음');
    await visible('카드 창', ['[data-cd-skip]', '.bt-board', '.cardbox']);
    await noOverflow('카드 창');
    const d0 = await b.ev('__d1t.dots()');
    await b.sleep(700);
    need((await b.ev('__d1t.dots()')) === d0, '카드 창이 떠 있는 동안 전투가 흘러감 (분대 점이 움직임)');
    await b.reload(500); await d1drive_page(b);
    need(await has(cardWin), '카드 창이 떠 있을 때 새로고침하면 같은 창이 돌아와야 함');
  };
  const rows = 'JSON.stringify(PROGRESS.flowInfo().show && PROGRESS.flowInfo().show.rows.map(function (r) { return [r.state, r.rooms, r.last, r.trapDmg]; }))';
  try {
    await d1drive_page(b);
    // 1) 새 게임 -> 홈 (의뢰 없음: 판 자리에 안내, 시안 구조 그대로 + 잠긴 칸)
    if (!need((await scr()) === 'field' && (await b.ev('PROGRESS.RUN.v')) === 7 && (await b.ev('PROGRESS.RUN.seed')) === 7 && (await b.ev('PROGRESS.flowInfo().on')) && (await b.ev('PROGRESS.RUN.phase')) === 'choose',
      '새 게임 첫 화면이 홈(저장 v7, seed 7, 흐름 시험 켬, 의뢰 고르기)이 아님: ' + (await scr()))) return fin();
    need((await b.ev(tabLabels)) === '회사,카드,군단,도전,마계,상점', '하단 탭이 회사·카드·군단·도전·마계·상점 6개가 아님: ' + (await b.ev(tabLabels)));
    need((await has('#tabs .tb.lock')) && (await attr('#tabs .tb.lock', 'data-toast')).indexOf('첫 전투 후 열림') >= 0, '군단 탭이 `🔒 첫 전투 후 열림` 토스트 칸이 아님');
    need((await has('.idlecard [data-go="board"]')) && (await has('.sbar.op')) && (await has('.cardrow')) && (await has('.growth.off')) && (await has('.aside.l')) && (await has('.aside.r')), '의뢰 없는 홈에 안내·스테이지 막대·카드 칸·성장판·좌우 아이콘이 없음');
    need((await count('.cslot.lock')) === 3 && (await count('.ibtn.locked')) === 4 && (await has('.ibtn.gear')), '잠긴 칸이 카드 4~6(3개)·작품집·랭킹·임무·출석(점선 4개)이 아님');
    need((await b.ev('document.querySelector(".hud .hpow").textContent')).indexOf('—') >= 0, '의뢰 없을 때 전투력이 `—`가 아님');
    await b.click('.ibtn.locked'); await b.sleep(150);
    need(await toastHas('🔒'), '잠긴 아이콘을 누르면 토스트가 떠야 함');
    await noOverflow('홈(의뢰 없음)');
    // 2) 왼쪽 [의뢰] -> 패널 (게시판) -> 카드 수락 -> 홈에서 일반 침입 시작
    await b.click('.aside.l [data-go="board"]'); await b.sleep(500);
    need((await scr()) === 'board' && (await has('.pnl.p-board .card.contract')) && (await b.ev('document.body.classList.contains("paneled")')), '[의뢰] 아이콘이 의뢰 패널(게시판)을 안 엶: ' + (await scr()));
    await noOverflow('의뢰 패널');
    await b.click('.pnl .card.contract');
    await b.sleep(700);
    need((await b.ev('PROGRESS.RUN.phase')) === 'play' && (await scr()) === 'field' && !(await b.ev('document.body.classList.contains("paneled")')), '의뢰 카드를 눌렀는데 홈(play)으로 안 돌아옴: ' + (await scr()));
    need((await b.ev('PROGRESS.flowInfo().mode')) === 'normal' && (await b.ev('PROGRESS.flowInfo().no')) === 1, '수락하면 일반 1판이 바로 시작돼야 함');
    need((await has('.hud')) && (await has('.sbar.op')) && (await has('[data-fboss]')) && (await has('[data-fsortie]')) && (await has('[data-gcell="trap"]')) && (await has('[data-gcell="door"]')) && (await has('[data-fpause]')) && (await has('.bt-speed')) && (await has('.goalbox')) && (await has('.arena .bt-board')),
      '홈에 상단 바·스테이지 막대·[보스 도전]·성장판 칸·부대 모집·배속·일시정지·다음 목표 상자·판이 없음');
    need(!(await has('[data-go="battle"]')) && !(await has('[data-fbuild]')) && (await b.ev('document.body.innerText.indexOf("다음 주") < 0')), '옛 [운영 ▶]·[건설] 버튼·`다음 주` 글이 남아 있음');
    need((await b.ev('__d1t.names()')) === 0, '판에 칸 이름표("왼쪽 끝 1" 등)가 보임');
    await visible('홈', ['[data-fboss]', '[data-gcell="trap"]', '[data-fsortie]', '[data-fpause]', '.bt-speed', '.bt-board', '.cslot', '.goalbox']);
    await noOverflow('홈');
    const geo = await b.ev('__d1t.geo()');
    need(geo.hud.h === 56 && geo.sbar.h === 40 && geo.cslot.h === 50 && geo.gcell.h === 58 && geo.tabs.h === 62 && geo.bbox.w === 262 && geo.bbox.h === 367,
      '시안 치수(상단 바 56·스테이지 막대 40·판 262x367·카드 칸 50·성장판 칸 58·하단 탭 62)와 다름: ' + JSON.stringify(geo));
    step('새 게임(?seed=7) -> 홈(의뢰 없음, 탭 6개·잠긴 칸 점선·시안 치수) -> 왼쪽 [의뢰] 패널 -> 카드 수락 -> 홈 일반 1판 자동 시작');
    // 3) 새로고침해도 같은 판 · 배속 ×5 -> 일반 판이 저절로 반복 (카드·결과표 없이)
    await b.reload(500); await d1drive_page(b);
    need((await scr()) === 'field' && (await b.ev('PROGRESS.flowInfo().no')) === 1 && (await b.ev('PROGRESS.RUN.battling')), '홈에서 새로고침하면 같은 일반 판으로 이어져야 함');
    for (let i = 0; i < 4; i++) { if ((await b.ev('document.querySelector(".bt-speed").textContent')).indexOf('×5') >= 0) break; await b.click('.bt-speed'); }
    need((await b.ev('document.querySelector(".bt-speed").textContent')).indexOf('×5') >= 0, '배속을 ×5로 못 바꿈');
    const keepOf = 'JSON.stringify({ s: PROGRESS.RUN.site.squads.map(function (s) { return [s.lv, s.exp]; }), w: PROGRESS.RUN.week, st: PROGRESS.RUN.quest.stage })';
    const keep0 = await b.ev(keepOf);
    const t0 = Date.now();
    let extra = false;
    while (Date.now() - t0 < 60000) {
      if ((await b.ev('PROGRESS.flowInfo().no')) >= 3) break;
      if (await has('.bt-ov, .bt-result, .rsheet')) extra = true;
      await b.sleep(200);
    }
    if (!need((await b.ev('PROGRESS.flowInfo().no')) >= 3, '일반 판이 60초(×5) 안에 저절로 3판째까지 안 감')) return fin();
    need(!extra, '일반 판에 카드·결과표 창이 뜸');
    const last = await b.ev('(function () { var r = PROGRESS.RUN.lastBattle; return r ? { mode: r.mode, no: r.no, summary: r.summary } : null; })()');
    need(last && last.mode === 'normal' && last.summary, '일반 판 결과(요약 한 줄)가 없음');
    need((await b.ev(keepOf)) === keep0, '일반 판 뒤 경험치·주·단계가 바뀜');
    need((await b.ev('PROGRESS.unlocks().corps')) === true && !(await has('#tabs .tb.lock')), '첫 전투 정산 뒤인데 군단 탭이 아직 잠겨 있음');
    step('일반 판 자동 반복 ' + (await b.ev('PROGRESS.flowInfo().no')) + '판째 (×5, ' + Math.round((Date.now() - t0) / 100) / 10 + '초) · 군단 열림');
    // 4) 회사 탭 = 패널이 홈 위로 (위 150px에 전투가 계속 보이고, 일반 판은 멈추지 않음), [닫기] = 같은 홈 그대로
    await b.ev('document.querySelector(".screen.home").__mark = 1');
    await b.click('#tabs [data-go="company"]'); await b.sleep(600);
    need((await scr()) === 'company' && (await has('.pnl.p-company .stage')) && (await b.ev('document.body.classList.contains("paneled")')), '회사 탭이 패널(직원 무대)을 안 엶: ' + (await scr()));
    const pg = await b.ev('__d1t.geo()');
    need(pg.arena.h === 150 && pg.panel.y === 214 && pg.arena.y === 56 && (await has('#tabs .tb.closing[data-close]')), '패널이 열렸을 때 위쪽 전투 띠 150px·패널 시작 214·탭 자리 [닫기]가 시안과 다름: ' + JSON.stringify(pg));
    need((await count('.subtabs .lockb')) === 2 && (await count('.hchip')) === 1, '회사 패널에 잠긴 하위 탭 2개(회사 운영·연구)·금 칩 하나가 아님');
    await visible('회사 패널', ['.pnl.p-company .stage', '.arena']);
    await noOverflow('회사 패널');
    const tm0 = await b.ev('document.querySelector(".bt-time").textContent'), st0 = await b.ev(battleSig);
    await b.sleep(1800);
    need((await b.ev(battleSig)) !== st0 || (await b.ev('document.querySelector(".bt-time").textContent')) !== tm0, '패널이 열려 있는 동안 일반 판이 멈춤 (전투 띠에서 계속 돌아야 함)');
    await b.click('.pnl .subtabs .lockb'); await b.sleep(150);
    need(await toastHas('준비 중') || await toastHas('🔒'), '잠긴 하위 탭을 누르면 토스트가 떠야 함');
    await b.click('#tabs [data-close]'); await b.sleep(300);
    need((await scr()) === 'field' && !(await has('#panel:not([hidden])')) && (await b.ev('!!document.querySelector(".screen.home").__mark')), '[닫기] 뒤 같은 홈(다시 그리지 않음)으로 돌아와야 함');
    // 군단 패널
    await b.click('#tabs [data-go="corps"]'); await b.sleep(500);
    if (need((await scr()) === 'corps' && (await has('.pnl.p-corps')), '군단 탭이 패널을 안 엶: ' + (await scr()))) {
      need((await count('.scells .scell')) === 5 && (await count('.tgrid .tcell')) === 5, '군단 패널에 출진 칸 5개·부족 격자 5칸이 아님');
      need((await count('.lockrow')) === 2 && (await count('.subtabs .lockb')) >= 1 && (await has('.pfoot [data-auto]')) && (await has('.pfoot .lockb')), '군단 패널에 잠긴 칸(총 보유 효과·걸러 보기·부대장·일괄 강화)·[자동 편성]이 없음');
      need((await b.ev('document.querySelector(".subtabs .lockb[data-toast*=\\"친위대\\"]") !== null')) && (await b.ev('document.querySelector(".subtabs").innerText.indexOf("친위대") >= 0')), '친위대 하위 탭이 잠김(첫 납품 후)으로 있어야 함');
      await b.click('.tgrid .tcell[data-pick]'); await b.sleep(200);
      need((await has('.cdetail [data-uptribe], .cdetail .btn[disabled]')) && !(await has('[data-procure], [data-refill]')), '부족 칸을 누르면 신석 강화 상세가 떠야 함 (조달·보충 버튼은 홈 [부대 모집] 창에만)');
      await visible('군단 패널', ['.pfoot [data-auto]', '.scells', '.tgrid', '.arena']);
      await noOverflow('군단 패널');
    }
    // 카드·도전·마계·상점
    await b.click('#tabs [data-go="cards"]'); await b.sleep(400);
    need((await scr()) === 'cards' && (await count('.p-cards .cinfo')) === 3 && (await count('.p-cards .cslot.lock')) === 3, '카드 탭에 카드 3종 목록·잠긴 칸 3개가 없음');
    await noOverflow('카드 패널');
    for (const t of ['challenge', 'demon', 'shop']) {
      await b.click('#tabs [data-go="' + t + '"]'); await b.sleep(300);
      need((await scr()) === t && (await has('.pnl .lockrow')), t + ' 탭이 잠김 한 줄 패널이 아님');
    }
    await b.click('#tabs [data-close]'); await b.sleep(300);
    need((await scr()) === 'field' && (await b.ev('PROGRESS.RUN.battling')), '탭을 다 둘러본 뒤 닫으면 홈 + 진행 중 전투여야 함');
    step('회사 탭 패널(위 150px에 전투 계속, [닫기]로 같은 홈) -> 군단(출진 5칸·부족 격자·잠긴 칸) -> 카드(3종+잠금) -> 도전·마계·상점(잠김 한 줄)');
    // 5) 성장판 [문] 칸 = 건설 모드(문 옮기기) -> 취소. [대기실] 칸 = 대기실이 골라진 채 건설 -> 끌기(미확정) -> 탭 누르면 묻기 -> [계속 수정] -> [취소]
    const mas0 = await b.ev('PROGRESS.budgetLeft()');
    await b.click('[data-gcell="door"]'); await b.sleep(500);
    need((await scr()) === 'build' && (await count('.zslot')) > 0 && (await b.ev('document.querySelector(".bsumline").innerText.indexOf("문") >= 0')), '[문] 칸이 문 옮기기(빈 벽 점선) 건설 모드를 안 엶: ' + (await scr()));
    await b.click('[data-end]'); await b.sleep(500);
    need((await scr()) === 'field', '[취소] 뒤 홈으로 돌아와야 함');
    await b.click('[data-gcell="den"]'); await b.sleep(600);
    if (!need((await scr()) === 'build', '성장판 [대기실] 칸이 건설 모드를 안 엶: ' + (await scr()))) return fin();
    need((await has('.hud.build')) && (await has('.tool.on[data-tool="den"]')), '건설 모드에 상단 바가 없거나 대기실이 골라진 채가 아님');
    need((await b.ev('__d1t.names()')) === 0, '건설 모드 판에 칸 이름표가 보임');
    await visible('건설', ['[data-confirm]', '[data-end]', '[data-tool="den"]', '.zwrap']);
    await noOverflow('건설');
    const tool = await b.ev('__d1t.center(\'[data-tool="den"]\')'), cell = await b.ev('__d1t.center(\'.zc[data-z="C6"]\')');
    need(tool && cell, '대기실 띠나 C6 칸이 없음');
    if (tool && cell) await b.mouseDrag(tool, cell);
    need(await has('.zc.pend[data-z="C6"]'), '대기실을 끌어 놓았는데 미확정 칸이 안 생김');
    await b.click('#tabs [data-go="company"]'); await b.sleep(300);
    need((await has('.popbg [data-pk="stay"]')) && (await scr()) === 'build', '미확정이 있는데 탭을 누르면 확정·취소를 묻는 창이 떠야 함');
    await b.click('.popbg [data-pk="stay"]'); await b.sleep(200);
    need((await scr()) === 'build' && (await has('.zc.pend[data-z="C6"]')) && !(await has('.popbg')), '[계속 수정] 뒤에도 건설 상태와 미확정이 그대로여야 함');
    const noBefore = await b.ev('PROGRESS.flowInfo().no');
    await b.click('[data-end]'); await b.sleep(600);
    need((await scr()) === 'field' && (await b.ev('PROGRESS.RUN.site.zones.C6')) !== 'den' && (await b.ev('PROGRESS.budgetLeft()')) === mas0 && (await b.ev('PROGRESS.flowInfo().no')) === noBefore && (await b.ev('PROGRESS.RUN.battling')),
      '[취소] 뒤 홈으로 돌아와 C6 미건설·마석 그대로·같은 일반 판이 이어져야 함');
    step('성장판 [문] 칸 = 문 옮기기 건설 모드 -> [취소] / [대기실] 칸 = 대기실이 골라진 건설 모드 -> C6 끌기(미확정) -> 탭 누르면 묻는 창 -> [계속 수정] -> [취소] (비용 0, 일반 판 이어서)');
    // 6) [대기실] 칸 -> 대기실 C6 -> [건설 확정] = 진행 중 일반 판은 버리고 바로 새 판
    await b.click('[data-gcell="den"]'); await b.sleep(600);
    const tool2 = await b.ev('__d1t.center(\'[data-tool="den"]\')'), cell2 = await b.ev('__d1t.center(\'.zc[data-z="C6"]\')');
    if (tool2 && cell2) await b.mouseDrag(tool2, cell2);
    need((await b.ev('document.querySelector("[data-confirm]").textContent')).indexOf('건설 확정') >= 0, '[건설 확정] 버튼 글이 아님');
    await b.click('[data-confirm]'); await b.sleep(700);
    need((await b.ev('PROGRESS.RUN.site.zones.C6')) === 'den' && (await scr()) === 'field' && (await b.ev('PROGRESS.flowInfo().no')) > noBefore && (await b.ev('PROGRESS.budgetLeft()')) < mas0,
      '[건설 확정] 뒤 C6 대기실 확정 + 홈 복귀 + 새 일반 판 시작이 안 됨');
    need((await text('[data-gcell="den"]')).indexOf('×1') >= 0, '성장판 [대기실] 칸에 지은 수(×1)가 안 보임: ' + (await text('[data-gcell="den"]')));
    step('[대기실] 칸 -> C6 끌기 -> [건설 확정] -> 홈으로 복귀 (진행 중 일반 판은 버리고 새 판, 성장판 대기실 ×1)');
    // 6-1) 출진 창: [부대 모집] = 열면 전투 멈춤, 닫으면 이어서 (바꾸지 않았을 때)
    await b.click('[data-fsortie]'); await b.sleep(300);
    need((await has('.fsheet:not([hidden]) .sslots')) && (await has('.fsheet [data-procure]')), '[부대 모집] 창에 출진 칸·부대 조달이 없음');
    await visible('출진 창', ['.fsheet [data-sheet-close]', '.bt-board']);
    await noOverflow('출진 창');
    await b.click('.fsheet [data-sheet-close]'); await b.sleep(300);
    need(!(await has('.fsheet:not([hidden])')) && (await has('[data-fboss]')) && (await has('.growth')), '[닫기] 뒤 출진 창이 닫히고 성장판이 보여야 함');
    // 7) [보스 도전] -> 보스 막대 · 보스 중 탭 이동 막힘 -> 카드 창(전부 넘기기) -> 실패 결과 -> 새로고침 유지 -> [다시 도전] 같은 결과
    await b.click('[data-fboss]'); await b.sleep(400);
    need((await b.ev('PROGRESS.flowInfo().mode')) === 'boss' && (await b.ev('PROGRESS.RUN.plan.stage')) === 1 && (await has('.sbar.boss')) && (await has('.bosslock')) && !(await has('.growth')), '[보스 도전]이 빨간 보스 막대·`보스전 중 잠김` 한 줄을 안 보임');
    need((await count('#tabs .tb.locked')) === 6 && (await b.ev('document.getElementById("tabs").classList.contains("bosslock")')), '보스 중에 하단 탭이 흐리게 막혀 있지 않음');
    await b.click('#tabs [data-toast]'); await b.ev('location.hash = "#company"'); await b.sleep(300);
    need((await scr()) === 'field' && !(await b.ev('document.body.classList.contains("paneled")')), '보스 판 중에는 패널·다른 화면으로 못 감 (홈 유지)');
    await visible('보스 도전', (await has(cardWin)) ? ['[data-cd-skip]', '.bt-board', '.cslot'] : ['[data-fpause]', '.bt-board', '.cslot']);
    await noOverflow('보스 도전');
    if (!need(await waitResult(firstWin), '보스 결과가 안 나옴')) return fin();
    need(cardWins === 2, '보스 한 판에 카드 창이 2번 떠야 함(진입 1 + 위기 1): ' + cardWins);
    need(await b.ev('(function () { var c = PROGRESS.flowInfo().show.cards; return !!c && c.length === 2 && c[0].card === "skip" && c[1].card === "skip"; })()') && (await count('.rsheet .rcard.skip')) === 2, '결과 창에 넘기기 기록 2줄이 없음');
    const fail = await b.ev('(function () { var s = PROGRESS.flowInfo().show; return s ? { ok: s.success, reached: s.reached, stage: PROGRESS.RUN.quest.stage, m: PROGRESS.RUN.site.budget } : null; })()');
    if (!need(fail && !fail.ok && fail.reached > 0 && fail.stage === 0, '대기실 하나로는 보스 1단계 실패여야 함: ' + JSON.stringify(fail))) return fin();
    need((await has('.rsheet .rrow2')) && (await has('[data-ffix]')) && (await has('[data-fretry]')) && (await has('[data-fresume]')) && !(await has('[data-deliver]')) && !(await has('[data-fnext]')),
      '실패 결과에 분대별 펼침·[배치 고치기]·[다시 도전]·[일반 침입 재개]가 없거나 [납품]이 있음');
    need((await text('.rsheet .rsum')).indexOf('함정 피해') >= 0, '결과 요약에 함정 피해가 없음');
    need((await count('#tabs .tb.locked')) === 0, '결과 상태에서는 탭 이동이 풀려야 함');
    await visible('보스 결과(실패)', ['[data-ffix]', '[data-fretry]', '[data-fresume]', '.bt-board']);
    await noOverflow('보스 결과');
    const r1 = await b.ev(rows);
    await b.ev('document.querySelectorAll(".rrow2 .rhead2")[1].click()'); await b.sleep(150);
    need(await has('.rrow2.open'), '분대 줄을 누르면 펼쳐져야 함');
    await b.reload(500); await d1drive_page(b);
    need((await scr()) === 'field' && (await has('.rsheet')) && (await b.ev('PROGRESS.RUN.site.budget')) === fail.m, '결과 직후 새로고침: 결과 상태 그대로, 마석 그대로여야 함');
    await b.click('#tabs [data-go="company"]'); await b.sleep(300); await b.click('#tabs [data-close]'); await b.sleep(400);
    need(await has('.rsheet [data-fretry]'), '패널을 열었다 닫아도 닫지 않은 결과가 그대로 있어야 함');
    await b.click('[data-fretry]'); await b.sleep(300);
    if (!need(await waitResult(), '다시 도전 결과가 안 나옴')) return fin();
    need((await b.ev(rows)) === r1, '같은 배치로 같은 보스 = 같은 결과여야 함: ' + r1 + ' / ' + (await b.ev(rows)));
    step('[보스 도전] 1단계 -> 보스 막대·잠김 한 줄·탭 막힘 -> 카드 창 2번(넘기기) -> 실패 ' + fail.reached + '분대 도달 -> 새로고침·패널 열고 닫기에도 결과 유지 -> [다시 도전] 같은 결과 (결정론)');
    // 8) [배치 고치기] -> 문 C1-D1을 B6-C6로 끌기 -> [건설 확정] -> 돌아와 결과 그대로 -> [다시 도전] 성공
    await b.click('[data-ffix]'); await b.sleep(600);
    if (!need((await scr()) === 'build', '[배치 고치기]가 건설 모드를 안 엶')) return fin();
    const from = await b.ev('__d1t.center(\'.zdoor[data-edge="C1-D1"]\')'), to = await b.ev('__d1t.edgeOf("B6-C6")');
    if (!need(from && to, '문 C1-D1 또는 벽 B6-C6가 화면에 없음')) return fin();
    await b.mouseDrag(from, to);
    await b.click('[data-confirm]'); await b.sleep(500);
    need(await b.ev('PROGRESS.RUN.site.doors[1].indexOf("B6-C6") >= 0 && PROGRESS.RUN.site.doors[1].indexOf("C1-D1") < 0'), '문 C1-D1 -> B6-C6 확정이 안 됨');
    need((await scr()) === 'field' && (await has('.rsheet [data-fretry]')), '확정 뒤 보스 결과(실패 기록)로 돌아와 [다시 도전]이 보여야 함');
    const m0 = await b.ev('PROGRESS.RUN.site.budget');
    await b.click('[data-fretry]'); await b.sleep(300);
    if (!need(await waitResult(), '고친 뒤 보스 결과가 안 나옴')) return fin();
    const win = await b.ev('(function () { var s = PROGRESS.flowInfo().show; return { ok: s.success, stage: PROGRESS.RUN.quest.stage, m: PROGRESS.RUN.site.budget, reward: s.reward, tries: s.tries }; })()');
    need(win.ok && win.stage === 1 && win.m >= m0 + win.reward && win.reward > 0, '문을 고친 뒤 보스 1단계 성공 -> 단계 1·첫 성공 마석: ' + JSON.stringify(win));
    need((await has('[data-fretry]')) && (await has('[data-fresume]')) && !(await has('[data-ffix]')) && !(await has('[data-deliver]')), '성공 결과에 [다음 보스 도전][일반 침입 재개]만 있어야 함');
    await b.reload(500); await d1drive_page(b);
    need((await b.ev('PROGRESS.RUN.quest.stage')) === 1 && (await b.ev('PROGRESS.RUN.site.budget')) === win.m && (await has('.rsheet')), '성공 직후 새로고침: 단계·마석 그대로 (보상 한 번만)');
    step('[배치 고치기] -> 문 C1-D1 -> B6-C6 끌기 -> [건설 확정] -> 결과로 복귀 -> [다시 도전] 성공 (보스 검증 1/5, 마석 +' + win.reward + ', ' + win.tries + '번째 도전)');
    // 9) [일반 침입 재개] -> 홈 (스테이지 막대 = 다음 보스 2단계)
    await b.click('[data-fresume]'); await b.sleep(500);
    need((await scr()) === 'field' && (await b.ev('PROGRESS.flowInfo().mode')) === 'normal' && !(await b.ev('PROGRESS.flowInfo().show')) && (await has('.sbar.op')) && (await b.ev('document.querySelector(".sb-no").textContent.indexOf("2-") === 0')), '[일반 침입 재개]가 일반 판 홈(스테이지 막대 2-n)을 안 엶');
    // 10) API로 빨리 감기: 건설 모드로 나가(전투 화면 정리) 대기실 2 + 함정 4(마석 60) + 문 여럿을 짓고 보스 2~5단계 (전투는 실제로 돌리되 승패는 방어 성공으로 고정 = 숫자와 무관, 2026-10-29 시간 제한 없앤 뒤). 마지막 결과는 안 닫아 둠
    await b.click('[data-gcell="trap"]'); await b.sleep(500);
    need((await scr()) === 'build' && (await has('.tool.on[data-tool="trap"]')), '성장판 [함정] 칸이 함정이 골라진 건설 모드를 안 엶: ' + (await scr()));
    const ff = await b.ev(`(function () {
      var P = PROGRESS, R = P.RUN, out_ = ['A4-A5', 'E2-E3', 'C2-C3', 'C3-C4', 'C4-C5', 'C6-C7', 'B5-C5', 'C5-D5', 'A4-B4'];
      var base = ZONES.initialDoors(1).filter(function (d) { return out_.indexOf(d) < 0; }).concat(['D4-E4', 'B6-C6', 'B3-B4', 'C3-D3', 'A5-B5', 'B3-C3', 'D6-D7', 'D3-D4', 'D4-D5']);
      var c = P.commitLayout({ doors: { 1: base }, builds: { B3: 'den', A1: 'den', A3: 'trap', B5: 'trap', B6: 'trap', B1: 'trap' } });
      if (!c.ok) return { ok: false, why: '건설 실패: ' + c.msg };
      var out = [];
      for (var k = 0; k < 6 && R.quest.stage < 5; k++) {
        var b = P.challengeBoss(); if (!b.ok) return { ok: false, why: '보스 도전 실패: ' + b.msg };
        var S = BSIM.create(P.battleInput());
        for (var i = 0; i < 20000 && !S.done; i++) BSIM.step(S, 0.05);
        // 시험용: 이 단계는 화면 동선 확인이라 승패를 숫자에 묶지 않음 (보스 판정 자체는 test_d1_core). 도달 분대를 대기실 격퇴로 바꿔 방어 성공으로 넘김
        var res = BSIM.result(S);
        res.reached = 0; res.loot = 0;
        res.squadResults.forEach(function (q) { if (q.state === 'reached') { q.state = 'retreat'; q.cause = 'den'; } });
        var rep = P.applyBattle(res);
        out.push(rep.boss.stage + (rep.boss.success ? '성공' : '실패'));
        if (R.quest.stage < 5) P.closeBossResult();
      }
      return { ok: R.quest.stage === 5 && P.checkQuest(), why: '보스 ' + out.join(' · ') + ' / ' + P.questProgress().line, line: P.questProgress().line, list: out.join(' · ') };
    })()`);
    if (!need(ff && ff.ok, '빨리 감기 실패: ' + (ff && ff.why))) return fin();
    step('API로 배치(대기실 2 + 함정 4 + 문 여럿) -> 보스 ' + ff.list + ' (' + ff.line + ')');
    // 11) 홈 의뢰 패널은 안내만 -> 5/5 결과의 큰 [납품] -> 정산(패널) -> 데모 끝
    await b.ev('location.hash = "#field"'); await b.reload(500); await d1drive_page(b);
    await b.ev('location.hash = "#board"'); await b.sleep(500);   // 결과 창이 떠 있는 홈에는 좌우 아이콘이 없어 주소로 연다
    need((await scr()) === 'board' && !(await has('.pnl [data-deliver]')) && (await text('.pnl .qsum')).indexOf('홈에서 납품') >= 0, '의뢰 패널에 `검증 완료 · 홈에서 납품` 안내만 있어야 함 ([납품] 버튼 없음)');
    await b.click('.pnl [data-close]'); await b.sleep(300);
    need((await scr()) === 'field' && (await has('.rsheet [data-deliver]')) && !(await has('[data-fretry]')) && (await count('.rsheet')) === 1, '5/5 결과에 큰 [납품]만 있고 [다음 보스 도전]은 없어야 함');
    await visible('5/5 결과', ['[data-deliver]', '[data-fresume]']);
    await b.click('[data-fresume]'); await b.sleep(500);
    need((await has('.sbar.op [data-deliver]')) && !(await has('[data-fboss]')) && (await has('.goalbox')), '[일반 침입 재개] 뒤 홈 스테이지 막대에서는 [보스 도전] 대신 [납품]이 보여야 함');
    await b.click('.sbar [data-deliver]'); await b.sleep(700);
    need((await scr()) === 'result' && (await b.ev('PROGRESS.RUN.phase')) === 'settle' && (await has('.pnl.p-result')) && !(await has('.pnl .pclose')), '[납품] 뒤 정산 패널(settle, 닫기 없음)이 아님');
    await b.reload(500); await d1drive_page(b);
    need((await scr()) === 'result' && (await b.ev('PROGRESS.RUN.phase')) === 'settle', '정산 중 새로고침하면 정산 패널이 복원돼야 함 (납품 한 번만)');
    if (!need(await has('.pnl [data-finish]'), '정산 패널에 [정산 마치기]가 없음 (q1 뒤 데모 끝이어야 함)')) return fin();
    const works0 = await b.ev('PROGRESS.RUN.works.length');
    await noOverflow('정산');
    await b.click('.pnl [data-finish]'); await b.sleep(700);
    need((await b.ev('PROGRESS.RUN.phase')) === 'demoEnd' && (await scr()) === 'board', '[정산 마치기] 뒤 의뢰 패널의 데모 끝(demoEnd)이 아님: ' + (await scr()));
    need(await b.ev('document.getElementById("panel").innerText.indexOf("데모는 여기까지") >= 0'), '데모 끝 화면 글("데모는 여기까지")이 없음');
    need(works0 === 1, '작품집이 등록되어야 함');
    await b.reload(500); await d1drive_page(b);
    need((await scr()) === 'board' && (await b.ev('document.getElementById("panel").innerText.indexOf("데모는 여기까지") >= 0')), '새로고침 뒤 데모 끝 화면이 유지 안 됨');
    await b.click('.pnl [data-close]'); await b.sleep(300);
    need((await scr()) === 'field' && (await has('.idlecard')) && (await has('.aside.l [data-go="gallery"]')), '데모 끝 홈에 안내·열린 [작품집] 아이콘이 있어야 함');
    await b.click('#tabs [data-go="corps"]'); await b.sleep(300);
    need((await scr()) === 'corps' && !(await has('.subtabs .lockb[data-toast*="친위대"]')) && (await has('.subtabs [data-t="guard"]')), '데모 끝에서 군단(친위대 열림)을 볼 수 있어야 함');
    await b.click('#tabs [data-close]'); await b.sleep(300);
    await b.click('.aside.l [data-go="gallery"]'); await b.sleep(300);
    need((await scr()) === 'gallery' && (await b.ev('document.getElementById("panel").innerText.indexOf("납품한 던전") >= 0')), '작품집을 볼 수 있어야 함');
    await noOverflow('작품집');
    await b.click('#panel [data-close]'); await b.sleep(300);
    await b.click('.aside.r .gear'); await b.sleep(400);
    need((await scr()) === 'settings' && (await count('.p-settings .sw')) === 3 && (await has('.p-settings .hold')), '오른쪽 [설정] 아이콘이 설정 패널(스위치 3개·처음부터)을 안 엶: ' + (await scr()));
    await noOverflow('설정');
    step('의뢰 패널은 안내만 -> 5/5 결과 큰 [납품] -> 스테이지 막대 [납품] -> 정산 패널(새로고침 복원) -> [정산 마치기] -> 데모 끝 (새로고침 유지, 군단·작품집 확인)');
  } finally {
    await b.close();
  }
  return fin();
}

// ---------------- 보스 카드 한 바퀴 (지시서 refs/brief_cards_ui.md · API.md 18절, 시안 ②) ----------------
// 새 브라우저로 따로 돈다 (한 바퀴 본줄기의 승패·마석 숫자를 건드리지 않게). 대기실 2곳 + 함정 3곳을 짓고 부대 하나를 빼서 빈 대기실을 만든 뒤 보스 1단계:
//  첫 창(진입) = 카드 6칸 중 후보만 밝음·고른 카드 상자·"카드 1/2" 줄, 멈춘 시간, 390px 넘침 0 -> 임시 수비대 칸 -> [방 고르기] -> 방 고르기(줄이 [취소][사용]) -> [취소] -> 다시 -> 새로고침 복원 -> 방 누름 -> [사용] -> 임시 부대 점·"임시" 표시, 새로고침해도 그대로
//  둘째 창(위기) = 연막 [사용] -> 분대 위 연막·남은 초 -> 결과 창에 카드 기록 줄 (새로고침 뒤에도). 넘기기는 본줄기(보스 실패 2번)가 이미 함.
async function d1drive_cards(steps, problems, logs) {
  const need = (cond, msg) => { if (!cond) problems.push(msg); return !!cond; };
  const b = await cdp_launch(D1DRIVE_URL + '?seed=7', { w: 390, h: 844, preload: D1DRIVE_PRELOAD_FLOW, wait: 500 });
  const has = (sel) => b.ev('!!document.querySelector(' + JSON.stringify(sel) + ')');
  const count = (sel) => b.ev('document.querySelectorAll(' + JSON.stringify(sel) + ').length');
  const cardWin = '.cardline [data-cd-skip], .cardline [data-cd-cancel]';
  const waitWin = (ms) => b.until('document.querySelector(' + JSON.stringify(cardWin) + ')', ms);
  const lineText = () => b.ev('document.querySelector(".cardline").innerText');
  const noOverflow = async (what) => { const o = await b.ev('__d1t.overflow()'); need(!o.overflow, what + ': 가로 넘침 scrollWidth ' + o.scrollWidth + ' > ' + o.innerWidth + ' ' + (o.wide || []).join(',')); };
  const visible = async (what, sels) => { const bad = await b.ev('__d1t.hidden(' + JSON.stringify(sels) + ')'); need(!bad.length, what + ': 버튼이 가려지거나 화면 밖: ' + bad.join(' / ')); };
  const t0 = Date.now();
  try {
    await d1drive_page(b);
    const r = await b.ev(`(function () {
      var P = PROGRESS;
      if (!P.pickQuest(P.offerQuests()[0])) return 'pickQuest 실패';
      P.skipTutorial();
      var c = P.commitLayout({ builds: { C6: 'den', A6: 'den', B6: 'trap', B5: 'trap', C5: 'trap' } });
      if (!c.ok) return 'commitLayout 실패: ' + c.msg;
      var out = P.squads().filter(function (x) { return x.floor; });
      if (out.length < 2) return '출진 부대가 2개 미만: ' + out.length;
      var w = P.withdrawUnit(out[0].id); if (!w.ok) return '부대 빼기 실패: ' + w.msg;
      var ch = P.challengeBoss(); return ch.ok ? 'ok' : '보스 도전 실패: ' + ch.msg;
    })()`);
    if (!need(r === 'ok', '카드 시험 준비 실패: ' + r)) return;
    await b.ev('location.hash = "#field"'); await b.reload(400); await d1drive_page(b);
    for (let i = 0; i < 4; i++) { if ((await b.ev('document.querySelector(".bt-speed").textContent')).indexOf('×5') >= 0) break; await b.click('.bt-speed'); }
    // 1) 첫 창
    if (!need(await waitWin(15000), '보스 시작 뒤 카드 창이 안 뜸')) return;
    const w1 = await lineText();
    need(w1.indexOf('카드 1/2') >= 0 && (await has('.cslot.cand[data-card="smoke"]')) && (await has('.cslot.cand[data-card="reserve"]')) && !(await has('.cslot.cand[data-card="trigger"]')) && (await has('[data-cd-skip]')) && (await has('.cardbox:not([hidden]) [data-cd-go]')),
      '첫 창에 `카드 1/2`·밝은 칸(연막·수비대)·[넘기기]·고른 카드 상자가 없음: ' + w1.replace(/\n/g, ' | '));
    need((await b.ev('document.querySelector(".cardbox").innerText.indexOf("연막 살포") >= 0')) && (await has('.cslot.sel[data-card="smoke"]')), '처음엔 첫 후보(연막 살포)가 골라져 상자에 보여야 함');
    need(await b.ev('document.querySelectorAll(".bt-board .zc.cd-where").length === 0'), '진입 창에는 위기 위치가 없어야 함');
    await visible('카드 창(후보)', ['[data-cd-skip]', '.bt-board', '.cslot[data-card="reserve"]', '.cardbox']);
    await noOverflow('카드 창(후보)');
    const d1 = await b.ev('__d1t.dots()');
    await b.sleep(900);
    need((await b.ev('__d1t.dots()')) === d1, '카드 창이 떠 있는 동안 전투가 흘러감');
    d1drive_step(steps, t0, '[카드] 첫 창(진입 1/2): 카드 6칸 중 후보 연막·수비대만 밝음·연막 선택 상자·[넘기기], 전투 정지, 넘침 0');
    // 2) 임시 수비대 칸 -> [방 고르기] -> 대상 고르기 -> 취소 -> 다시 -> 새로고침 복원
    await b.click('.cslot[data-card="reserve"]'); await b.sleep(200);
    need((await has('.cslot.sel[data-card="reserve"]')) && (await b.ev('document.querySelector(".cardbox").innerText.indexOf("임시 수비대") >= 0')) && (await b.ev('document.querySelector("[data-cd-go]").innerText.indexOf("방 고르기") >= 0')), '수비대 칸을 누르면 임시 수비대가 골라져 [방 고르기]가 보여야 함');
    await b.click('[data-cd-go]'); await b.sleep(250);
    need((await has('[data-cd-cancel]')) && (await has('[data-cd-use][aria-disabled="true"]')) && (await count('.bt-board .zc.cd-ok')) >= 1 && (await b.ev('document.querySelector(".bt-board").classList.contains("cd-pickmode")')),
      '[방 고르기] 뒤 대상 고르기(초록 점선 방, 줄이 [취소]·꺼진 [사용])여야 함');
    await visible('카드 창(대상 고르기)', ['[data-cd-cancel]', '[data-cd-use]', '.bt-board']);
    await noOverflow('카드 창(대상 고르기)');
    const boardH = await b.ev('document.querySelector(".bt-board").getBoundingClientRect().height');
    need(boardH >= 300, '대상 고르기 중 판이 너무 작음: ' + Math.round(boardH) + 'px');
    await b.click('[data-cd-use]'); await b.sleep(150);
    need(await has('[data-cd-use]'), '방을 안 골랐는데 [사용]이 눌려 창이 닫힘');
    await b.click('[data-cd-cancel]'); await b.sleep(250);
    need((await has('.cardbox:not([hidden]) [data-cd-go]')) && !(await has('[data-cd-cancel]')) && (await b.ev('PROGRESS.battleSave().snap.pick.sel')) === '', '[취소] 뒤 카드 상자로 돌아가고 저장도 sel 없음이어야 함');
    await b.click('[data-cd-go]'); await b.sleep(250);
    need((await b.ev('PROGRESS.battleSave().snap.pick.sel')) === 'reserve', '대상 고르기 시작이 저장 지점에 안 남음');
    await b.reload(500); await d1drive_page(b);
    if (!need(await waitWin(5000), '새로고침 뒤 카드 창이 안 돌아옴')) return;
    need((await has('[data-cd-cancel]')) && (await count('.bt-board .zc.cd-ok')) >= 1 && (await lineText()).indexOf('고른') < 0 && (await lineText()).indexOf('초록 점선') >= 0, '새로고침 뒤 대상 고르는 화면부터 이어져야 함');
    d1drive_step(steps, t0, '[카드] 임시 수비대 칸 -> [방 고르기](초록 점선, 판 ' + Math.round(boardH) + 'px) -> [취소] -> 다시 -> 새로고침해도 대상 고르는 중');
    // 3) 방 누름 -> 사용
    const zr = await b.ev('document.querySelector(".bt-board .zc.cd-ok").getAttribute("data-z")');
    await b.click('.bt-board .zc.cd-ok'); await b.sleep(200);
    need((await has('[data-cd-use]:not([aria-disabled="true"])')) && (await b.ev('document.querySelector(".bt-board .zc.sel") !== null')) && (await lineText()).indexOf('고른 방') >= 0, '방을 누르면 고른 방 표시와 켜진 [사용]이어야 함');
    await b.click('[data-cd-use]'); await b.sleep(300);
    need(!(await has(cardWin)) && !(await b.ev('document.querySelector(".cardbox") && !document.querySelector(".cardbox").hidden')), '[사용] 뒤 카드 창이 닫혀야 함');
    need((await count('.bt-mon.tmp')) === 3 && (await count('.bt-tmptag')) === 1, '임시 수비대 부대 점 3개와 "임시" 표시가 판에 안 그려짐');
    need((await b.ev('document.querySelector(".fld-cardnote").textContent')).indexOf('임시 수비대') >= 0, '카드 한 줄 안내에 마지막 카드가 없음');
    await b.reload(500); await d1drive_page(b);
    need((await count('.bt-mon.tmp')) === 3 && (await b.ev('PROGRESS.battleSave().snap.cards.log.length')) >= 1, '새로고침 뒤 임시 수비대가 그대로 이어져야 함');
    d1drive_step(steps, t0, '[카드] 방 ' + zr + ' 누름 -> [사용] -> 임시 부대 점 3개 + "임시" 표시 -> 새로고침해도 그대로');
    // 4) 둘째 창(위기): 연막 -> 분대 위 연막 + 남은 초
    if (!need(await waitWin(20000), '위기 카드 창이 안 뜸')) return;
    const w2 = await lineText();
    need(w2.indexOf('카드 2/2') >= 0 && w2.indexOf('위기') >= 0 && (await has('.cslot.cand[data-card="smoke"]')), '둘째 창에 카드 2/2·위기·연막 후보가 없음: ' + w2.replace(/\n/g, ' | '));
    await visible('카드 창(위기)', ['[data-cd-skip]', '.bt-board', '.cardbox']);
    await noOverflow('카드 창(위기)');
    await b.click('.cslot[data-card="smoke"]'); await b.sleep(150);
    const smk = await b.ev('(function () { document.querySelector("[data-cd-go]").click(); return Array.prototype.map.call(document.querySelectorAll(".bt-smk:not([hidden])"), function (e) { return e.textContent; }); })()');
    need(smk.length >= 1 && smk[0].indexOf('초') >= 0, '연막을 쓰면 분대 위에 연막·남은 초가 보여야 함: ' + JSON.stringify(smk));
    need(!(await has(cardWin)), '연막 [사용] 뒤 창이 닫혀야 함');
    d1drive_step(steps, t0, '[카드] 위기 2/2 연막 살포 [사용] -> 분대 위 ' + smk.length + '곳 연막 ' + smk[0]);
    // 5) 결과 창: 카드 기록 줄 (새로고침해도)
    const t1 = Date.now(); let res = false;
    while (Date.now() - t1 < 60000) { if (await has('.rsheet')) { res = true; break; } if (await has(cardWin)) await b.click('[data-cd-skip]'); await b.sleep(200); }
    if (!need(res, '카드를 쓴 보스전 결과가 안 나옴')) return;
    const txt = await b.ev('Array.prototype.map.call(document.querySelectorAll(".rsheet .rcard"), function (e) { return e.innerText.replace(/\\n/g, " "); }).join(" | ")');
    need(txt.indexOf('임시 수비대') >= 0 && txt.indexOf('연막 살포') >= 0, '결과 창에 카드 기록(임시 수비대·연막 살포) 줄이 없음: ' + txt);
    await visible('보스 결과(카드 기록)', ['[data-ffix], [data-fretry]', '[data-fresume]', '.bt-board']);
    await noOverflow('보스 결과(카드 기록)');
    await b.reload(500); await d1drive_page(b);
    need((await count('.rsheet .rcard')) >= 2, '새로고침 뒤에도 결과 창 카드 기록이 있어야 함');
    d1drive_step(steps, t0, '[카드] 보스 결과 창 카드 기록: ' + txt);
  } finally {
    b.logs.forEach(l => logs.push('(카드 시험) ' + l));
    await b.close();
  }
}
function d1drive_step(steps, t0, s) { steps.push(s + ' [' + ((Date.now() - t0) / 1000).toFixed(1) + '초 지점]'); }

async function d1drive_main() {
  const mode = process.argv[2];
  let r;
  if (mode === 'shots') r = await d1drive_shots(process.argv[3]);
  else if (mode === 'flow') {
    r = await d1drive_flow();
    if (!r.problems.length) await d1drive_cards(r.steps, r.problems, r.logs);   // 카드 한 바퀴 (본줄기가 통과했을 때만)
  }
  else throw new Error('사용: node tools/d1_drive.js shots <폴더> | flow');
  return r;
}

// 다 쓰면 바로 끝낸다 (안 그러면 열린 연결이 저절로 닫힐 때까지 node가 약 9초 더 기다림)
function d1drive_out(obj, code) { process.stdout.write(JSON.stringify(obj) + '\n', () => process.exit(code)); }
d1drive_main().then(r => d1drive_out(r, 0), e => d1drive_out({ fatal: String(e && e.stack || e) }, 1));
