// D1 데모(prototype/d1_demo) 화면을 헤드리스 Chrome으로 움직이는 검사 실행기: 화면 사진 찍기(shots) · 한 바퀴 진행(flow). shots.py·test_d1_flow.py가 부른다
// 흐름 시험(2026-10-28, BATTLE_DATA.FLOW.on, API.md 15절): 한 바퀴 = 일반 판 자동 반복 -> 보스 실패 -> 문 고치기 -> 보스 성공 -> 빨리 감기 -> 납품 -> 데모 끝.
//  사진의 전투 장면은 멈춤 상태(ui.paused)로 저장해 흔들리지 않게, 결과 사진은 보스 결과 창
/*
 * 사용: node tools/d1_drive.js shots <사진 폴더>   -> 사진 PNG + 마지막 줄 JSON { cases:[{ name, w, h, file, overflow, scrollWidth, wide[], logs[] }] }
 *       node tools/d1_drive.js flow                -> 마지막 줄 JSON { steps:[글], problems:[글], logs:[글] }
 * - 브라우저 = tools/cdp.js (GAME_BROWSER 환경 변수). 매번 새 프로필이라 내 브라우저 저장과 섞이지 않는다.
 * - 사진은 흔들리지 않게: ?seed=1 · 튜토리얼 건너뜀(대사 파일을 고쳐도 사진이 안 바뀌게) · 설정 "움직임 줄이기"(캐릭터 걷기·반짝임 멈춤) ·
 *   연출용 무작위 고정(D1DRIVE_PRELOAD) · 전투 장면은 전투 계산을 페이지 안에서 정해진 초까지 돌려 저장 지점으로 넣고 새로고침(멈춘 상태로 이어짐).
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
  // 전투를 페이지 안에서 t초(또는 끝)까지 계산해 저장 지점으로 넣는다 -> 새로고침하면 그 장면에서 멈춘 채 이어짐 (흐름 시험도 paused로 멈춤)
  battleTo: function (t) {
    var P = PROGRESS;
    if (!P.battlePlan()) { var r = P.startBattle(); if (!r.ok) return 'startBattle 실패'; }
    var S = BSIM.create(P.battleInput());
    for (var i = 0; i < 20000 && !S.done && (t < 0 || S.t < t); i++) { BSIM.step(S, 0.05); if (S.pending) BSIM.nextFloor(S); }
    P.saveBattle({ snap: BSIM.snapshot(S), ui: { queue: [], cardsShown: 0, cardsUsed: 0, cardNo: 0, picks: [], paused: true } });
    return S.done ? 'done' : 't=' + Math.round(S.t * 10) / 10;
  },
  // 흐름 시험: 보스 지금 단계를 끝까지 계산해 결과 반영 (결과 창 = RUN.flow.show) -> 'ok' 또는 실패 이유
  bossResult: function () {
    var P = PROGRESS, c = P.challengeBoss(); if (!c.ok) return 'challengeBoss 실패: ' + c.msg;
    var S = BSIM.create(P.battleInput());
    for (var i = 0; i < 20000 && !S.done; i++) BSIM.step(S, 0.05);
    return P.applyBattle(BSIM.result(S)) ? 'ok' : 'applyBattle 실패';
  },
  // 한 주를 화면 없이: 전투 시작 -> 끝까지 계산 -> 결과 반영
  weekByApi: function () {
    var P = PROGRESS, r = P.startBattle();
    if (!r.ok) return null;
    var S = BSIM.create(P.battleInput());
    for (var i = 0; i < 20000 && !S.done; i++) { BSIM.step(S, 0.1); if (S.pending) BSIM.nextFloor(S); }
    return P.applyBattle(BSIM.result(S));
  },
  // 가로 넘침 (문서 폭 > 창 폭) + 창 밖으로 나간 요소 몇 개 (힌트)
  overflow: function () {
    var W = window.innerWidth, sw = document.documentElement.scrollWidth, wide = [];
    if (sw > W) document.querySelectorAll('body *').forEach(function (e) {
      var r = e.getBoundingClientRect();
      if (wide.length < 5 && r.width > 0 && r.right > W + 1) wide.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').join('.') : ''));
    });
    return { overflow: sw > W, scrollWidth: sw, innerWidth: W, wide: wide };
  }
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
// 사진 하나 = { name, w, h }. 상태는 차례로 쌓인다: 의뢰 고름 -> 문 1개 옮기고 대기실 1곳 건설 -> 회사·현장(정비)·건설 모드 -> 일반 판 12초(멈춤) -> 보스 1단계 결과 창
const D1DRIVE_SHOTS = [
  { name: 'd1_company_390', w: 390, h: 844, hash: 'company' },
  { name: 'd1_field_390', w: 390, h: 844, hash: 'field' },
  { name: 'd1_build_390', w: 390, h: 844, hash: 'build' },
  { name: 'd1_battle_390', w: 390, h: 844, hash: 'battle', battle: 12 },
  { name: 'd1_result_390', w: 390, h: 844, hash: 'battle', boss: true },
  { name: 'd1_company_1280', w: 1280, h: 800, hash: 'company' }
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
        if (c.boss) {
          const st = await b.ev('__d1t.bossResult()');
          if (st !== 'ok') throw new Error(c.name + ': ' + st);
        }
        await d1drive_go(b, c.hash);
        const problems = [];
        if (c.boss && !(await b.ev('!!document.querySelector(".bt-bossres")'))) problems.push('보스 결과 창이 안 나옴');
        const scr = await b.ev('__d1t.screen()');
        if (scr !== c.hash) problems.push('화면이 ' + c.hash + '가 아니라 ' + scr);
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

// ---------------- 한 바퀴 (흐름 시험, refs/brief_flow_test.md · API.md 15절) ----------------
async function d1drive_flow() {
  const steps = [], problems = [];
  const need = (cond, msg) => { if (!cond) problems.push(msg); return !!cond; };
  let tLast = Date.now();
  const step = (s) => { const now = Date.now(); steps.push(s + ' [' + ((now - tLast) / 1000).toFixed(1) + '초]'); tLast = now; };
  const b = await cdp_launch(D1DRIVE_URL + '?seed=7', { w: 390, h: 844, preload: D1DRIVE_PRELOAD_FLOW, wait: 500 });
  step('브라우저 열기');
  const scr = () => b.ev('__d1t.screen()');
  const fin = () => ({ steps, problems, logs: b.logs });
  // 보스 결과 창이 뜰 때까지 (배속 ×5 기준 넉넉히)
  const waitBoss = async () => { const t = Date.now(); while (Date.now() - t < 40000) { if (await b.ev('!!document.querySelector(".bt-bossres")')) return true; await b.sleep(200); } return false; };
  const rows = 'JSON.stringify(PROGRESS.flowInfo().show && PROGRESS.flowInfo().show.rows.map(function (r) { return [r.state, r.rooms, r.last, r.trapDmg]; }))';
  try {
    await d1drive_page(b);
    // 1) 새 게임 -> 의뢰 고르기 -> 현장(정비)
    if (!need((await scr()) === 'contract' && (await b.ev('PROGRESS.RUN.v')) === 7 && (await b.ev('PROGRESS.RUN.seed')) === 7 && (await b.ev('PROGRESS.flowInfo().on')),
      '새 게임 첫 화면이 의뢰 고르기(저장 v7, seed 7, 흐름 시험 켬)가 아님: ' + (await scr()))) return fin();
    await b.click('#view .card.contract');
    await b.sleep(400);
    need((await b.ev('PROGRESS.RUN.phase')) === 'play' && (await scr()) === 'field', '의뢰 카드를 눌렀는데 현장 화면(play)이 아님: ' + (await scr()));
    need(await b.ev('!!document.querySelector("#view [data-fboss]") && !!document.querySelector("#view [data-go=\'battle\']")'), '현장에 [운영 ▶]·[보스 도전]이 없음');
    step('새 게임(?seed=7) -> 의뢰 카드 -> 현장(정비: 운영·보스 도전 버튼)');
    // 2) [운영 ▶] -> 일반 판 자동 시작, 새로고침해도 같은 판
    await b.click('#view [data-go="battle"]'); await b.sleep(500);
    if (!need((await scr()) === 'battle' && (await b.ev('PROGRESS.flowInfo().mode')) === 'normal' && (await b.ev('PROGRESS.flowInfo().no')) === 1, '[운영 ▶]이 일반 1판을 안 엶')) return fin();
    await b.reload(500); await d1drive_page(b);
    need((await scr()) === 'battle' && (await b.ev('PROGRESS.flowInfo().no')) === 1 && (await b.ev('PROGRESS.RUN.battling')), '운영 중 새로고침하면 같은 일반 판으로 이어져야 함');
    // 3) 배속 ×5 -> 일반 판이 저절로 2번 더 (카드·결과표 없이)
    for (let i = 0; i < 4; i++) { if ((await b.ev('document.querySelector(".bt-speed").textContent')).indexOf('×5') >= 0) break; await b.click('.bt-speed'); }
    need((await b.ev('document.querySelector(".bt-speed").textContent')).indexOf('×5') >= 0, '배속을 ×5로 못 바꿈');
    const keep0 = await b.ev('JSON.stringify({ m: PROGRESS.RUN.site.budget, s: PROGRESS.RUN.site.squads.map(function (s) { return [s.lv, s.exp]; }), w: PROGRESS.RUN.week, st: PROGRESS.RUN.quest.stage })');
    const t0 = Date.now();
    let extra = false;
    while (Date.now() - t0 < 60000) {
      if ((await b.ev('PROGRESS.flowInfo().no')) >= 3) break;
      if (await b.ev('!!document.querySelector(".bt-ov, .bt-result")')) extra = true;
      await b.sleep(200);
    }
    if (!need((await b.ev('PROGRESS.flowInfo().no')) >= 3, '일반 판이 60초(×5) 안에 저절로 3판째까지 안 감')) return fin();
    need(!extra, '일반 판에 카드·결과표 창이 뜸');
    const last = await b.ev('(function () { var r = PROGRESS.RUN.lastBattle; return r ? { mode: r.mode, no: r.no, summary: r.summary } : null; })()');
    need(last && last.mode === 'normal' && last.summary, '일반 판 결과(요약 한 줄)가 없음');
    need((await b.ev('document.querySelector(".bt-log").innerText')).indexOf('일반 ' + last.no + '판') >= 0, '운영 화면 기록 줄에 지난 일반 판 한 줄이 없음');
    const keep1 = await b.ev('JSON.stringify({ m: PROGRESS.RUN.site.budget, s: PROGRESS.RUN.site.squads.map(function (s) { return [s.lv, s.exp]; }), w: PROGRESS.RUN.week, st: PROGRESS.RUN.quest.stage })');
    need(keep0 === keep1, '일반 판 뒤 마석·경험치·주·단계가 바뀜: ' + keep0 + ' -> ' + keep1);
    step('[운영 ▶] -> 일반 판 자동 반복 ' + (await b.ev('PROGRESS.flowInfo().no')) + '판째 (×5, ' + Math.round((Date.now() - t0) / 100) / 10 + '초) · 마지막 "' + last.summary + '"');
    // 4) [건설] -> 대기실 하나만 (대충 지은 판) -> [건설] 확정 = 진행 중 일반 판은 버림
    await b.click('#tabs [data-fbuild]'); await b.sleep(600);
    if (!need((await scr()) === 'build', '운영 화면 [건설]이 건설 모드를 안 엶: ' + (await scr()))) return fin();
    const tool = await b.ev('__d1t.center(\'[data-tool="den"]\')'), cell = await b.ev('__d1t.center(\'.zc[data-z="C6"]\')');
    need(tool && cell, '대기실 띠나 C6 칸이 없음');
    if (tool && cell) await b.mouseDrag(tool, cell);
    await b.click('#view [data-confirm]'); await b.sleep(300);
    need((await b.ev('PROGRESS.RUN.site.zones.C6')) === 'den' && !(await b.ev('PROGRESS.RUN.battling')), '[건설] 뒤 C6 대기실 확정 + 일반 판 버림이 안 됨');
    step('[건설] -> 대기실 C6 끌기 -> [건설] 확정 (진행 중 일반 판은 버림)');
    // 5) [보스 도전] -> 실패 결과 -> 같은 배치로 다시 = 같은 결과
    await b.click('#tabs [data-go="battle"]'); await b.sleep(500);
    need((await scr()) === 'battle' && (await b.ev('PROGRESS.flowInfo().mode')) === 'normal', '현장 탭이 운영(일반 판)으로 안 감');
    await b.click('.bt-start'); await b.sleep(300);
    need((await b.ev('PROGRESS.flowInfo().mode')) === 'boss' && (await b.ev('PROGRESS.RUN.plan.stage')) === 1, '[보스 도전]이 보스 1단계를 안 엶');
    await b.ev('location.hash = "#company"'); await b.sleep(300);
    need((await scr()) === 'battle', '보스 판 중에는 다른 화면으로 못 감 (전투 화면 유지)');
    if (!need(await waitBoss(), '보스 결과 창이 안 나옴')) return fin();
    const fail = await b.ev('(function () { var s = PROGRESS.flowInfo().show; return s ? { ok: s.success, reached: s.reached, stage: PROGRESS.RUN.quest.stage, m: PROGRESS.RUN.site.budget } : null; })()');
    if (!need(fail && !fail.ok && fail.reached > 0 && fail.stage === 0, '대기실 하나로는 보스 1단계 실패여야 함: ' + JSON.stringify(fail))) return fin();
    need(await b.ev('document.querySelector(".bt-bossres").innerText.indexOf("어디까지") >= 0 && !!document.querySelector("[data-ffix]") && !!document.querySelector("[data-fretry]") && !!document.querySelector("[data-fresume]")'),
      '실패 결과 창에 어디까지 갔나·[배치 고치기]·[다시 도전]·[일반 침입 재개]가 없음');
    const r1 = await b.ev(rows);
    await b.reload(500); await d1drive_page(b);
    need((await scr()) === 'battle' && (await b.ev('!!document.querySelector(".bt-bossres")')) && (await b.ev('PROGRESS.RUN.site.budget')) === fail.m, '결과 직후 새로고침: 결과 창이 그대로, 마석 그대로여야 함');
    await b.click('[data-fretry]'); await b.sleep(300);
    if (!need(await waitBoss(), '다시 도전 결과 창이 안 나옴')) return fin();
    need((await b.ev(rows)) === r1, '같은 배치로 같은 보스 = 같은 결과여야 함: ' + r1 + ' / ' + (await b.ev(rows)));
    step('[보스 도전] 1단계 -> 실패 ' + fail.reached + '분대 도달 -> 새로고침 유지 -> [다시 도전] 같은 결과 (결정론)');
    // 6) [배치 고치기] -> 문 C1-D1을 B6-C6로 끌기 -> [건설] -> 돌아와 [다시 도전] = 성공
    await b.click('[data-ffix]'); await b.sleep(600);
    if (!need((await scr()) === 'build', '[배치 고치기]가 건설 모드를 안 엶')) return fin();
    const from = await b.ev('__d1t.center(\'.zdoor[data-edge="C1-D1"]\')'), to = await b.ev('__d1t.edgeOf("B6-C6")');
    if (!need(from && to, '문 C1-D1 또는 벽 B6-C6가 화면에 없음')) return fin();
    await b.mouseDrag(from, to);
    await b.click('#view [data-confirm]'); await b.sleep(300);
    need(await b.ev('PROGRESS.RUN.site.doors[1].indexOf("B6-C6") >= 0 && PROGRESS.RUN.site.doors[1].indexOf("C1-D1") < 0'), '문 C1-D1 -> B6-C6 확정이 안 됨');
    await b.click('#tabs [data-go="battle"]'); await b.sleep(500);
    need((await scr()) === 'battle' && (await b.ev('!!document.querySelector(".bt-bossres [data-fretry]")')), '돌아오면 보스 결과 창([다시 도전])이 남아 있어야 함');
    const m0 = await b.ev('PROGRESS.RUN.site.budget');
    await b.click('[data-fretry]'); await b.sleep(300);
    if (!need(await waitBoss(), '고친 뒤 보스 결과 창이 안 나옴')) return fin();
    const win = await b.ev('(function () { var s = PROGRESS.flowInfo().show; return { ok: s.success, stage: PROGRESS.RUN.quest.stage, m: PROGRESS.RUN.site.budget, reward: s.reward, tries: s.tries }; })()');
    need(win.ok && win.stage === 1 && win.m === m0 + win.reward && win.reward > 0, '문을 고친 뒤 보스 1단계 성공 -> 단계 1·첫 성공 마석: ' + JSON.stringify(win));
    await b.reload(500); await d1drive_page(b);
    need((await b.ev('PROGRESS.RUN.quest.stage')) === 1 && (await b.ev('PROGRESS.RUN.site.budget')) === win.m, '성공 직후 새로고침: 단계·마석 그대로 (보상 한 번만)');
    step('[배치 고치기] -> 문 C1-D1 -> B6-C6 끌기 -> [다시 도전] 성공 (보스 검증 1/5, 마석 +' + win.reward + ', ' + win.tries + '번째 도전)');
    // 7) [일반 침입 재개] -> 일반 판
    await b.click('[data-fresume]'); await b.sleep(500);
    need((await scr()) === 'battle' && (await b.ev('PROGRESS.flowInfo().mode')) === 'normal' && !(await b.ev('PROGRESS.flowInfo().show')), '[일반 침입 재개]가 일반 판을 안 엶');
    // 8) API로 빨리 감기: 현장(정비)으로 나가 대기실 3 + 함정 9 + 문 하나(A2-A3 -> C3-D3)를 짓고 보스 2~5단계 (실제 전투 계산)
    await b.click('#tabs [data-ffield]'); await b.sleep(400);
    need((await scr()) === 'field', '[정비]가 현장 화면으로 안 감');
    const ff = await b.ev(`(function () {
      var P = PROGRESS, R = P.RUN, base = ZONES.initialDoors(1).map(function (d) { return d === 'A2-A3' ? 'C3-D3' : d; });
      var c = P.commitLayout({ doors: { 1: base }, builds: { B7: 'den', D7: 'den', C5: 'trap', A7: 'trap', E7: 'trap', A6: 'trap', E6: 'trap', C3: 'trap', C2: 'trap', A5: 'trap', E5: 'trap' } });
      if (!c.ok) return { ok: false, why: '건설 실패: ' + c.msg };
      var out = [];
      for (var k = 0; k < 6 && R.quest.stage < 5; k++) {
        var b = P.challengeBoss(); if (!b.ok) return { ok: false, why: '보스 도전 실패: ' + b.msg };
        var S = BSIM.create(P.battleInput());
        for (var i = 0; i < 20000 && !S.done; i++) BSIM.step(S, 0.05);
        var rep = P.applyBattle(BSIM.result(S));
        out.push(rep.boss.stage + (rep.boss.success ? '성공' : '실패'));
        P.closeBossResult();
      }
      return { ok: R.quest.stage === 5 && P.checkQuest(), why: '보스 ' + out.join(' · ') + ' / ' + P.questProgress().line, line: P.questProgress().line, list: out.join(' · ') };
    })()`);
    if (!need(ff && ff.ok, '빨리 감기 실패: ' + (ff && ff.why))) return fin();
    step('API로 배치(대기실 3 + 함정 9 + 문 1) -> 보스 ' + ff.list + ' (' + ff.line + ')');
    // 9) 화면으로 납품 -> 정산 -> 데모 끝
    await b.reload(500); await d1drive_page(b);
    await b.ev('location.hash = "#company"'); await b.sleep(400);
    need((await scr()) === 'company', '빨리 감은 뒤 회사 화면이 아님');
    if (!need(await b.ev('!!document.querySelector("#view [data-deliver]")'), '회사 진행 띠에 [납품하기]가 없음')) return fin();
    await b.click('#view [data-deliver]'); await b.sleep(600);
    need((await scr()) === 'result' && (await b.ev('PROGRESS.RUN.phase')) === 'settle', '[납품하기] 뒤 정산 화면(settle)이 아님');
    if (!need(await b.ev('!!document.querySelector("#view [data-finish]")'), '정산 화면에 [정산 마치기]가 없음 (q1 뒤 데모 끝이어야 함)')) return fin();
    await b.click('#view [data-finish]'); await b.sleep(600);
    need((await b.ev('PROGRESS.RUN.phase')) === 'demoEnd', '[정산 마치기] 뒤 demoEnd가 아님');
    need(await b.ev('document.querySelector("#view").innerText.indexOf("데모는 여기까지") >= 0'), '데모 끝 화면 글("데모는 여기까지")이 없음');
    await b.reload(500); await d1drive_page(b);
    need(await b.ev('document.querySelector("#view").innerText.indexOf("데모는 여기까지") >= 0'), '새로고침 뒤 데모 끝 화면이 유지 안 됨');
    step('[납품하기] -> 정산 -> [정산 마치기] -> 데모 끝 화면 (새로고침 뒤에도 유지)');
  } finally {
    await b.close();
  }
  return fin();
}

async function d1drive_main() {
  const mode = process.argv[2];
  let r;
  if (mode === 'shots') r = await d1drive_shots(process.argv[3]);
  else if (mode === 'flow') r = await d1drive_flow();
  else throw new Error('사용: node tools/d1_drive.js shots <폴더> | flow');
  return r;
}

// 다 쓰면 바로 끝낸다 (안 그러면 열린 연결이 저절로 닫힐 때까지 node가 약 9초 더 기다림)
function d1drive_out(obj, code) { process.stdout.write(JSON.stringify(obj) + '\n', () => process.exit(code)); }
d1drive_main().then(r => d1drive_out(r, 0), e => d1drive_out({ fatal: String(e && e.stack || e) }, 1));
