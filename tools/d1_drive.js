// D1 데모(prototype/d1_demo) 화면을 헤드리스 Chrome으로 움직이는 검사 실행기: 화면 사진 찍기(shots) · 한 바퀴 진행(flow). shots.py·test_d1_flow.py가 부른다
// UI 개편(2026-10-29, docs/specs/ui_restructure.md): 하단 탭 3개(회사·현장·군단) + 현장 4상태(운영·건설·보스 도전·보스 결과).
//  한 바퀴 = 회사에서 의뢰 수락 -> 현장 운영(일반 판 자동 반복) -> 탭 이동 멈춤/이어 감 -> 건설(취소·미확정 묻기·확정) -> 보스 실패 -> 배치 고치기 -> 재도전 성공
//           -> (API로 빨리) 5/5 -> 현장 [납품] -> 회사 정산 -> 데모 끝. 마석 숫자는 core-dev가 바꿀 수 있어 하드코딩하지 않고 API에서 읽어 비교한다.
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
// 사진 하나 = { name, w, h, hash, expect(있어야 할 요소), must(가려지면 안 되는 버튼) }. 상태는 차례로 쌓인다: 의뢰 고름 -> 문 1개 옮기고 대기실 1곳 건설 -> 회사 -> 현장 운영(일반 판 12초, 멈춤)
//  -> 건설 -> 보스 도전(10초, 멈춤) -> 보스 1단계 결과. (이름은 예전 사진과 같게 두어 기준 이미지와 비교되게 함: field = 현장 운영, battle = 보스 도전 중)
const D1DRIVE_SHOTS = [
  { name: 'd1_company_390', w: 390, h: 844, hash: 'company', expect: '.qsum', must: ['.qsum [data-go="field"]'] },
  { name: 'd1_field_390', w: 390, h: 844, hash: 'field', battle: 12, expect: '.fld .fld-recent', must: ['[data-fboss]', '[data-fsortie]', '[data-fbuild]', '[data-fpause]', '.bt-board'] },
  { name: 'd1_build_390', w: 390, h: 844, hash: 'build', expect: '.buildmode [data-confirm]', must: ['[data-confirm]', '[data-end]', '.bt-board, .zwrap'] },
  { name: 'd1_battle_390', w: 390, h: 844, hash: 'field', boss: 10, expect: '.hud.boss', must: ['[data-fpause]', '.bt-board'] },
  { name: 'd1_result_390', w: 390, h: 844, hash: 'field', result: true, expect: '.fld-result', must: ['[data-ffix]', '[data-fretry]', '[data-fresume]', '.bt-board'] },
  { name: 'd1_company_1280', w: 1280, h: 800, hash: 'company', expect: '.qsum', must: ['.qsum [data-go="field"]'] }
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

// ---------------- 한 바퀴 (UI 개편, 지시서 refs/brief_ui_restructure_ui.md · API.md 15절) ----------------
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
  const noOverflow = async (what) => { const o = await b.ev('__d1t.overflow()'); need(!o.overflow, what + ': 가로 넘침 scrollWidth ' + o.scrollWidth + ' > ' + o.innerWidth + ' ' + (o.wide || []).join(',')); };
  const visible = async (what, sels) => { const bad = await b.ev('__d1t.hidden(' + JSON.stringify(sels) + ')'); need(!bad.length, what + ': 버튼이 가려지거나 화면 밖: ' + bad.join(' / ')); };
  // 보스 결과 상태가 뜰 때까지 (배속 ×5 기준 넉넉히)
  const waitResult = async () => { const t = Date.now(); while (Date.now() - t < 40000) { if (await has('.fld-result')) return true; await b.sleep(200); } return false; };
  const rows = 'JSON.stringify(PROGRESS.flowInfo().show && PROGRESS.flowInfo().show.rows.map(function (r) { return [r.state, r.rooms, r.last, r.trapDmg]; }))';
  try {
    await d1drive_page(b);
    // 1) 새 게임 -> 회사 의뢰 게시판 -> 수락 -> 현장 운영
    if (!need((await scr()) === 'company' && (await b.ev('PROGRESS.RUN.v')) === 7 && (await b.ev('PROGRESS.RUN.seed')) === 7 && (await b.ev('PROGRESS.flowInfo().on')) && (await b.ev('PROGRESS.RUN.phase')) === 'choose',
      '새 게임 첫 화면이 회사 의뢰 게시판(저장 v7, seed 7, 흐름 시험 켬, 의뢰 고르기)이 아님: ' + (await scr()))) return fin();
    const tabNames = await b.ev('Array.prototype.map.call(document.querySelectorAll("#tabs button"), function (x) { return x.querySelector(".nm").textContent.replace("🔒 ", ""); }).join(",")');
    need(tabNames === '회사,현장,군단', '하단 탭이 회사·현장·군단 3개가 아님: ' + tabNames);
    need(await has('#tabs button.lock') && (await b.ev('document.querySelector("#tabs button.lock").textContent')).indexOf('첫 전투 후 열림') >= 0, '군단 탭이 `잠김 · 첫 전투 후 열림`이 아님');
    need(await has('#view .card.contract') && !(await has('[data-week]')) && (await b.ev('document.body.innerText.indexOf("다음 주") < 0')), '회사 게시판이 없거나 옛 [다음 주]가 남아 있음');
    need((await b.ev('document.querySelector(".hud .hpow").textContent')).indexOf('—') >= 0, '의뢰 없을 때 전투력이 `—`가 아님');
    await noOverflow('회사(게시판)');
    await b.click('#view .card.contract');
    await b.sleep(600);
    need((await b.ev('PROGRESS.RUN.phase')) === 'play' && (await scr()) === 'field', '의뢰 카드를 눌렀는데 현장 운영(play)이 아님: ' + (await scr()));
    need((await b.ev('PROGRESS.flowInfo().mode')) === 'normal' && (await b.ev('PROGRESS.flowInfo().no')) === 1, '수락하면 일반 1판이 바로 시작돼야 함');
    need((await has('.hud.op')) && (await has('.hboss')) && (await has('[data-fboss]')) && (await has('[data-fsortie]')) && (await has('[data-fbuild]')) && (await has('[data-fpause]')) && (await has('.bt-speed')), '현장 운영에 상단 바·보스 검증 막대·[보스 도전][출진][건설][배속][일시정지]가 없음');
    need(!(await has('[data-go="battle"]')) && !(await has('[data-ffield]')), '옛 [운영 ▶]·[정비] 버튼이 남아 있음');
    await visible('현장 운영', ['[data-fboss]', '[data-fsortie]', '[data-fbuild]', '[data-fpause]', '.bt-board', '.bt-time']);
    await noOverflow('현장 운영');
    step('새 게임(?seed=7) -> 회사 의뢰 게시판 카드 -> 현장 운영 (탭 3개, 군단 잠김, 일반 1판 자동 시작)');
    // 2) 새로고침해도 같은 판 · 배속 ×5 -> 일반 판이 저절로 반복 (카드·결과표 없이)
    await b.reload(500); await d1drive_page(b);
    need((await scr()) === 'field' && (await b.ev('PROGRESS.flowInfo().no')) === 1 && (await b.ev('PROGRESS.RUN.battling')), '운영 중 새로고침하면 같은 일반 판으로 이어져야 함');
    for (let i = 0; i < 4; i++) { if ((await b.ev('document.querySelector(".bt-speed").textContent')).indexOf('×5') >= 0) break; await b.click('.bt-speed'); }
    need((await b.ev('document.querySelector(".bt-speed").textContent')).indexOf('×5') >= 0, '배속을 ×5로 못 바꿈');
    const keepOf = 'JSON.stringify({ s: PROGRESS.RUN.site.squads.map(function (s) { return [s.lv, s.exp]; }), w: PROGRESS.RUN.week, st: PROGRESS.RUN.quest.stage })';
    const keep0 = await b.ev(keepOf);
    const t0 = Date.now();
    let extra = false;
    while (Date.now() - t0 < 60000) {
      if ((await b.ev('PROGRESS.flowInfo().no')) >= 3) break;
      if (await has('.bt-ov, .bt-result')) extra = true;
      await b.sleep(200);
    }
    if (!need((await b.ev('PROGRESS.flowInfo().no')) >= 3, '일반 판이 60초(×5) 안에 저절로 3판째까지 안 감')) return fin();
    need(!extra, '일반 판에 카드·결과표 창이 뜸');
    const last = await b.ev('(function () { var r = PROGRESS.RUN.lastBattle; return r ? { mode: r.mode, no: r.no, summary: r.summary } : null; })()');
    need(last && last.mode === 'normal' && last.summary, '일반 판 결과(요약 한 줄)가 없음');
    need((await b.ev('document.querySelector(".fld-recent").innerText')).indexOf('일반 ') >= 0, '운영 화면 `최근:` 줄에 지난 일반 판 한 줄이 없음');
    need((await b.ev(keepOf)) === keep0, '일반 판 뒤 경험치·주·단계가 바뀜');
    need(!(await has('#tabs button.lock')), '첫 전투 정산 뒤인데 군단 탭이 아직 잠겨 있음');
    step('일반 판 자동 반복 ' + (await b.ev('PROGRESS.flowInfo().no')) + '판째 (×5, ' + Math.round((Date.now() - t0) / 100) / 10 + '초) · 최근 정산 한 줄 · 군단 열림');
    // 3) 현장 밖 = 일반전 멈춤, 돌아오면 이어 감 (회사 탭 -> 군단 탭 -> 현장 탭)
    await b.click('#tabs [data-go="company"]'); await b.sleep(500);
    need((await scr()) === 'company' && (await has('.qsum')), '회사 탭으로 못 감');
    const frozen = await b.ev('JSON.stringify({ no: PROGRESS.flowInfo().no, t: PROGRESS.RUN.bsave && PROGRESS.RUN.bsave.snap ? PROGRESS.RUN.bsave.snap.t : -1 })');
    await b.sleep(1800);
    need((await b.ev('JSON.stringify({ no: PROGRESS.flowInfo().no, t: PROGRESS.RUN.bsave && PROGRESS.RUN.bsave.snap ? PROGRESS.RUN.bsave.snap.t : -1 })')) === frozen, '현장 밖에서도 일반 판이 계속 진행됨 (멈춰야 함)');
    need(!(await has('[data-deliver]')), '회사에 [납품] 실행 버튼이 있음 (실행 입구는 현장 5/5 결과 하나)');
    await b.click('#tabs [data-go="corps"]'); await b.sleep(400);
    if (need((await scr()) === 'corps' && (await b.ev('document.querySelectorAll(".cgrid .ccard").length')) >= 2, '군단 탭에 2열 카드가 없음')) {
      need((await has('.cdetail [data-uptribe], .cdetail .btn[disabled]')) && !(await has('[data-procure], [data-refill]')), '군단 상세에 신석 강화 버튼이 없거나 조달·보충 버튼이 남아 있음');
      need((await has('.corpstabs .lockbtn')) && (await b.ev('document.querySelector(".corpstabs .lockbtn").textContent')).indexOf('첫 납품 후 열림') >= 0, '친위대 하위 탭이 `잠김 · 첫 납품 후 열림`이 아님');
      await noOverflow('군단');
    }
    await b.click('#tabs [data-go="field"]'); await b.sleep(3500);
    const back = JSON.parse(await b.ev('JSON.stringify({ no: PROGRESS.flowInfo().no, t: PROGRESS.RUN.bsave && PROGRESS.RUN.bsave.snap ? PROGRESS.RUN.bsave.snap.t : -1 })'));
    const was = JSON.parse(frozen);
    need((await scr()) === 'field' && (back.no > was.no || back.t > was.t), '현장에 돌아와도 일반 판이 이어지지 않음: ' + frozen + ' -> ' + JSON.stringify(back));
    step('회사 탭: 일반 판 멈춤 (회사에 [납품] 없음) -> 군단 탭: 부족 2열 카드·신석 강화·친위대 잠김 -> 현장 탭: 이어 감');
    // 4) [건설]: 대기실을 끌어 놓고(미확정) 탭을 누르면 묻고, [계속 수정] 뒤 [취소] = 비용 없이 복귀(일반 판 이어서)
    const mas0 = await b.ev('PROGRESS.budgetLeft()');
    await b.click('[data-fbuild]'); await b.sleep(600);
    if (!need((await scr()) === 'build', '운영 화면 [건설]이 건설 상태를 안 엶: ' + (await scr()))) return fin();
    need((await has('.hud.build')) && (await has('#tabs button.on')) && (await b.ev('document.querySelector("#tabs button.on").textContent')).indexOf('현장') >= 0, '건설 상태에 상단 바가 없거나 현장 탭이 선택돼 있지 않음');
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
      '[취소] 뒤 현장 운영으로 돌아와 C6 미건설·마석 그대로·같은 일반 판이 이어져야 함');
    step('[건설] 대기실 C6 끌기(미확정) -> 탭 누르면 묻는 창 -> [계속 수정] -> [취소] (비용 0, 일반 판 이어서)');
    // 5) [건설] -> 대기실 C6 -> [건설 확정] = 진행 중 일반 판은 버리고 바로 새 판
    await b.click('[data-fbuild]'); await b.sleep(600);
    const tool2 = await b.ev('__d1t.center(\'[data-tool="den"]\')'), cell2 = await b.ev('__d1t.center(\'.zc[data-z="C6"]\')');
    if (tool2 && cell2) await b.mouseDrag(tool2, cell2);
    need((await b.ev('document.querySelector("[data-confirm]").textContent')).indexOf('건설 확정') >= 0, '[건설 확정] 버튼 글이 아님');
    await b.click('[data-confirm]'); await b.sleep(700);
    need((await b.ev('PROGRESS.RUN.site.zones.C6')) === 'den' && (await scr()) === 'field' && (await b.ev('PROGRESS.flowInfo().no')) > noBefore && (await b.ev('PROGRESS.budgetLeft()')) < mas0,
      '[건설 확정] 뒤 C6 대기실 확정 + 현장 운영 복귀 + 새 일반 판 시작이 안 됨');
    step('[건설] -> 대기실 C6 끌기 -> [건설 확정] -> 현장 운영으로 복귀 (진행 중 일반 판은 버리고 새 판)');
    // 5-1) 출진 창: 열면 전투 멈춤, 닫으면 이어서 (바꾸지 않았을 때)
    await b.click('[data-fsortie]'); await b.sleep(300);
    need((await has('.fsheet:not([hidden]) .sslots')) && (await has('.fsheet [data-procure]')), '[출진] 창에 출진 칸·부대 조달이 없음');
    await visible('출진 창', ['.fsheet [data-sheet-close]', '.bt-board']);
    await noOverflow('출진 창');
    await b.click('.fsheet [data-sheet-close]'); await b.sleep(300);
    need(!(await has('.fsheet:not([hidden])')) && (await has('[data-fboss]')), '[닫기] 뒤 출진 창이 닫히고 운영 버튼이 보여야 함');
    // 6) [보스 도전] -> 보스 중 탭 이동 막힘 -> 실패 결과 -> 새로고침 유지 -> [다시 도전] 같은 결과
    await b.click('[data-fboss]'); await b.sleep(400);
    need((await b.ev('PROGRESS.flowInfo().mode')) === 'boss' && (await b.ev('PROGRESS.RUN.plan.stage')) === 1 && (await has('.hud.boss')), '[보스 도전]이 보스 1단계를 안 엶');
    need((await b.ev('document.querySelectorAll("#tabs button.locked").length')) === 2 && (await b.ev('document.querySelector("#tabs").innerText.indexOf("보스전 종료 후") >= 0')), '보스 중에 다른 탭이 `보스전 종료 후 이동`으로 막혀 있지 않음');
    await b.click('#tabs [data-toast]'); await b.ev('location.hash = "#company"'); await b.sleep(300);
    need((await scr()) === 'field', '보스 판 중에는 다른 화면으로 못 감 (현장 유지)');
    await visible('보스 도전', ['[data-fpause]', '.bt-board']);
    await noOverflow('보스 도전');
    if (!need(await waitResult(), '보스 결과가 안 나옴')) return fin();
    const fail = await b.ev('(function () { var s = PROGRESS.flowInfo().show; return s ? { ok: s.success, reached: s.reached, stage: PROGRESS.RUN.quest.stage, m: PROGRESS.RUN.site.budget } : null; })()');
    if (!need(fail && !fail.ok && fail.reached > 0 && fail.stage === 0, '대기실 하나로는 보스 1단계 실패여야 함: ' + JSON.stringify(fail))) return fin();
    need((await has('.fld-result .rrow2')) && (await has('[data-ffix]')) && (await has('[data-fretry]')) && (await has('[data-fresume]')) && !(await has('[data-deliver]')) && !(await has('[data-fnext]')),
      '실패 결과에 분대별 펼침·[배치 고치기]·[다시 도전]·[일반 침입 재개]가 없거나 [납품]이 있음');
    need((await b.ev('document.querySelector(".fld-result .rsum").innerText')).indexOf('함정 피해') >= 0, '결과 요약에 함정 피해가 없음');
    need((await b.ev('document.querySelectorAll("#tabs button.locked").length')) === 0, '결과 상태에서는 탭 이동이 풀려야 함');
    await visible('보스 결과(실패)', ['[data-ffix]', '[data-fretry]', '[data-fresume]', '.bt-board']);
    await noOverflow('보스 결과');
    const r1 = await b.ev(rows);
    await b.ev('document.querySelectorAll(".rrow2 .rhead2")[1].click()'); await b.sleep(150);
    need(await has('.rrow2.open'), '분대 줄을 누르면 펼쳐져야 함');
    await b.reload(500); await d1drive_page(b);
    need((await scr()) === 'field' && (await has('.fld-result')) && (await b.ev('PROGRESS.RUN.site.budget')) === fail.m, '결과 직후 새로고침: 결과 상태 그대로, 마석 그대로여야 함');
    await b.click('#tabs [data-go="company"]'); await b.sleep(300); await b.click('#tabs [data-go="field"]'); await b.sleep(400);
    need(await has('.fld-result'), '다른 탭에 다녀와도 닫지 않은 결과가 복원돼야 함');
    await b.click('[data-fretry]'); await b.sleep(300);
    if (!need(await waitResult(), '다시 도전 결과가 안 나옴')) return fin();
    need((await b.ev(rows)) === r1, '같은 배치로 같은 보스 = 같은 결과여야 함: ' + r1 + ' / ' + (await b.ev(rows)));
    step('[보스 도전] 1단계 -> 보스 중 탭 이동 막힘 -> 실패 ' + fail.reached + '분대 도달 -> 새로고침·탭 왕복에도 결과 유지 -> [다시 도전] 같은 결과 (결정론)');
    // 7) [배치 고치기] -> 문 C1-D1을 B6-C6로 끌기 -> [건설 확정] -> 돌아와 결과 그대로 -> [다시 도전] 성공
    await b.click('[data-ffix]'); await b.sleep(600);
    if (!need((await scr()) === 'build', '[배치 고치기]가 건설 상태를 안 엶')) return fin();
    const from = await b.ev('__d1t.center(\'.zdoor[data-edge="C1-D1"]\')'), to = await b.ev('__d1t.edgeOf("B6-C6")');
    if (!need(from && to, '문 C1-D1 또는 벽 B6-C6가 화면에 없음')) return fin();
    await b.mouseDrag(from, to);
    await b.click('[data-confirm]'); await b.sleep(500);
    need(await b.ev('PROGRESS.RUN.site.doors[1].indexOf("B6-C6") >= 0 && PROGRESS.RUN.site.doors[1].indexOf("C1-D1") < 0'), '문 C1-D1 -> B6-C6 확정이 안 됨');
    need((await scr()) === 'field' && (await has('.fld-result [data-fretry]')), '확정 뒤 보스 결과(실패 기록)로 돌아와 [다시 도전]이 보여야 함');
    const m0 = await b.ev('PROGRESS.RUN.site.budget');
    await b.click('[data-fretry]'); await b.sleep(300);
    if (!need(await waitResult(), '고친 뒤 보스 결과가 안 나옴')) return fin();
    const win = await b.ev('(function () { var s = PROGRESS.flowInfo().show; return { ok: s.success, stage: PROGRESS.RUN.quest.stage, m: PROGRESS.RUN.site.budget, reward: s.reward, tries: s.tries }; })()');
    need(win.ok && win.stage === 1 && win.m >= m0 + win.reward && win.reward > 0, '문을 고친 뒤 보스 1단계 성공 -> 단계 1·첫 성공 마석: ' + JSON.stringify(win));
    need((await has('[data-fretry]')) && (await has('[data-fresume]')) && !(await has('[data-ffix]')) && !(await has('[data-deliver]')), '성공 결과에 [다음 보스 도전][일반 침입 재개]만 있어야 함');
    await b.reload(500); await d1drive_page(b);
    need((await b.ev('PROGRESS.RUN.quest.stage')) === 1 && (await b.ev('PROGRESS.RUN.site.budget')) === win.m && (await has('.hsegs i.on')), '성공 직후 새로고침: 단계·마석 그대로 (보상 한 번만)');
    step('[배치 고치기] -> 문 C1-D1 -> B6-C6 끌기 -> [건설 확정] -> 결과로 복귀 -> [다시 도전] 성공 (보스 검증 1/5, 마석 +' + win.reward + ', ' + win.tries + '번째 도전)');
    // 8) [일반 침입 재개] -> 운영 (큰 버튼 = 다음 보스 2단계)
    await b.click('[data-fresume]'); await b.sleep(500);
    need((await scr()) === 'field' && (await b.ev('PROGRESS.flowInfo().mode')) === 'normal' && !(await b.ev('PROGRESS.flowInfo().show')) && (await has('.hud.op')) && (await b.ev('document.querySelector("[data-fboss]").innerText.indexOf("2") >= 0')), '[일반 침입 재개]가 일반 판 운영(보스 2단계 예고)을 안 엶');
    // 9) API로 빨리 감기: 회사 탭으로 나가(전투 화면 정리) 대기실 2 + 함정 4(마석 60) + 문 여럿을 짓고 보스 2~5단계 (전투는 실제로 돌리되 승패는 방어 성공으로 고정 = 숫자와 무관, 2026-10-29 시간 제한 없앤 뒤). 마지막 결과는 안 닫아 둠
    await b.click('#tabs [data-go="company"]'); await b.sleep(400);
    need((await scr()) === 'company', '회사 탭으로 못 감');
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
    // 10) 회사는 안내만 -> 현장 5/5 결과의 [납품]
    await b.reload(500); await d1drive_page(b);
    await b.ev('location.hash = "#company"'); await b.sleep(400);
    need((await scr()) === 'company' && !(await has('[data-deliver]')) && (await b.ev('document.querySelector(".qsum").innerText.indexOf("현장에서 납품") >= 0')), '회사에 `검증 완료 · 현장에서 납품` 안내만 있어야 함 ([납품] 버튼 없음)');
    await b.click('#tabs [data-go="field"]'); await b.sleep(500);
    need((await scr()) === 'field' && (await has('.fld-result [data-deliver]')) && !(await has('[data-fretry]')) && (await b.ev('document.querySelectorAll(".hsegs i.on").length')) === 5, '5/5 결과에 큰 [납품]만 있고 [다음 보스 도전]은 없어야 함');
    await visible('5/5 결과', ['[data-deliver]', '[data-fresume]']);
    await b.click('[data-fresume]'); await b.sleep(500);
    need((await has('.hud.op')) && (await has('.fld-dock [data-deliver]')) && !(await has('[data-fboss]')), '[일반 침입 재개] 뒤 운영에서는 [보스 도전] 대신 큰 [납품]이 보여야 함');
    await b.click('[data-deliver]'); await b.sleep(700);
    need((await scr()) === 'result' && (await b.ev('PROGRESS.RUN.phase')) === 'settle', '[납품] 뒤 회사 쪽 정산 화면(settle)이 아님');
    await b.reload(500); await d1drive_page(b);
    need((await scr()) === 'result' && (await b.ev('PROGRESS.RUN.phase')) === 'settle', '정산 중 새로고침하면 정산 화면이 복원돼야 함 (납품 한 번만)');
    if (!need(await has('#view [data-finish]'), '정산 화면에 [정산 마치기]가 없음 (q1 뒤 데모 끝이어야 함)')) return fin();
    const works0 = await b.ev('PROGRESS.RUN.works.length');
    await noOverflow('정산');
    await b.click('#view [data-finish]'); await b.sleep(600);
    need((await b.ev('PROGRESS.RUN.phase')) === 'demoEnd' && (await scr()) === 'company', '[정산 마치기] 뒤 회사의 데모 끝(demoEnd)이 아님');
    need(await b.ev('document.querySelector("#view").innerText.indexOf("데모는 여기까지") >= 0'), '데모 끝 화면 글("데모는 여기까지")이 없음');
    need(works0 === 1 && (await has('.entries.one [data-go="gallery"]')), '작품집이 등록·열림이어야 함');
    await b.reload(500); await d1drive_page(b);
    need(await b.ev('document.querySelector("#view").innerText.indexOf("데모는 여기까지") >= 0'), '새로고침 뒤 데모 끝 화면이 유지 안 됨');
    await b.click('#tabs [data-go="field"]'); await b.sleep(300);
    need((await scr()) === 'company', '데모 끝에서 현장 탭은 회사 데모 끝 화면으로 가야 함');
    await b.click('#tabs [data-go="corps"]'); await b.sleep(300);
    need((await scr()) === 'corps' && !(await has('.corpstabs .lockbtn')), '데모 끝에서 군단(친위대 열림)을 볼 수 있어야 함');
    await b.click('#tabs [data-go="company"]'); await b.sleep(300);
    await b.click('#view [data-go="gallery"]'); await b.sleep(300);
    need((await scr()) === 'gallery' && (await b.ev('document.querySelector("#view").innerText.indexOf("납품한 던전") >= 0')), '작품집을 볼 수 있어야 함');
    step('회사는 안내만 -> 현장 5/5 결과 큰 [납품] -> 회사 정산(새로고침 복원) -> [정산 마치기] -> 데모 끝 (새로고침 유지, 군단·작품집 확인)');
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
