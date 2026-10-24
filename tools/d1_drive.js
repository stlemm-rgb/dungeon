// D1 데모(prototype/d1_demo) 화면을 헤드리스 Chrome으로 움직이는 검사 실행기: 화면 사진 찍기(shots) · 한 바퀴 진행(flow). shots.py·test_d1_flow.py가 부른다
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
  // 벽 조각 가운데의 화면 좌표 (1층 판)
  edgeXY: function (x, y) {
    var w = document.querySelector('.zwrap[data-floor="1"]').getBoundingClientRect(), g = ZONES.grid(1);
    return { x: w.left + x / g.cols * w.width, y: w.top + (y - g.rowOff) / g.rows * w.height };
  },
  center: function (sel) {
    var e = document.querySelector(sel); if (!e) return null;
    var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  },
  // 전투를 페이지 안에서 t초(또는 끝)까지 계산해 저장 지점으로 넣는다 -> 새로고침하면 그 장면에서 멈춘 채 이어짐
  battleTo: function (t) {
    var P = PROGRESS;
    if (!P.battlePlan()) { var r = P.startBattle(); if (!r.ok) return 'startBattle 실패'; }
    var S = BSIM.create(P.battleInput());
    for (var i = 0; i < 20000 && !S.done && (t < 0 || S.t < t); i++) { BSIM.step(S, 0.05); if (S.pending) BSIM.nextFloor(S); }
    P.saveBattle({ snap: BSIM.snapshot(S), ui: { queue: [], cardsShown: 0, cardsUsed: 0, cardNo: 0, picks: [] } });
    return S.done ? 'done' : 't=' + Math.round(S.t * 10) / 10;
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
// 사진 하나 = { name, w, h }. 상태는 차례로 쌓인다: 의뢰 고름 -> 문 1개 옮기고 대기실 1곳 건설 -> 회사·현장·건설 모드 -> 전투 12초 -> 결과표
const D1DRIVE_SHOTS = [
  { name: 'd1_company_390', w: 390, h: 844, hash: 'company' },
  { name: 'd1_field_390', w: 390, h: 844, hash: 'field' },
  { name: 'd1_build_390', w: 390, h: 844, hash: 'build' },
  { name: 'd1_battle_390', w: 390, h: 844, hash: 'battle', battle: 12 },
  { name: 'd1_result_390', w: 390, h: 844, hash: 'battle', battle: -1, finish: true },
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
        await d1drive_go(b, c.hash);
        const problems = [];
        if (c.finish) {   // 끝난 전투 저장 지점 -> [계속] 한 번 = 바로 결과표 (전투 계산은 이미 끝나 있어 시간에 안 흔들림)
          await b.click('.bt-start');
          if (!(await b.until('document.querySelector(".bt-result")', 5000))) problems.push('결과표가 안 나옴');
          await b.sleep(400);
        }
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

// ---------------- 한 바퀴 ----------------
async function d1drive_flow() {
  const steps = [], problems = [];
  const need = (cond, msg) => { if (!cond) problems.push(msg); return !!cond; };
  let tLast = Date.now();
  const step = (s) => { const now = Date.now(); steps.push(s + ' [' + ((now - tLast) / 1000).toFixed(1) + '초]'); tLast = now; };
  const b = await cdp_launch(D1DRIVE_URL + '?seed=7', { w: 390, h: 844, preload: D1DRIVE_PRELOAD_FLOW, wait: 500 });
  step('브라우저 열기');
  const scr = () => b.ev('__d1t.screen()');
  try {
    await d1drive_page(b);
    // 1) 새 게임 -> 의뢰 고르기
    if (!need((await scr()) === 'contract' && (await b.ev('PROGRESS.RUN.v')) === 7 && (await b.ev('PROGRESS.RUN.seed')) === 7,
      '새 게임 첫 화면이 의뢰 고르기(저장 v7, seed 7)가 아님: ' + (await scr()))) return { steps, problems, logs: b.logs };
    await b.click('#view .card.contract');
    await b.sleep(400);
    need((await b.ev('PROGRESS.RUN.phase')) === 'play' && (await scr()) === 'company', '의뢰 카드를 눌렀는데 회사 화면(play)이 아님');
    step('새 게임(?seed=7) -> 의뢰 카드 누름 -> 회사 화면');
    // 2) 현장 -> 건설 모드
    await b.click('#tabs [data-go="field"]'); await b.sleep(400);
    need((await scr()) === 'field', '현장 탭이 안 열림');
    await b.click('#view [data-go="build"]'); await b.sleep(600);
    if (!need((await scr()) === 'build', '건설 모드가 안 열림')) return { steps, problems, logs: b.logs };
    // 3) 문 하나 끌어 옮기기 (마우스로 진짜 끌기)
    const mv = await b.ev('__d1t.doorMove()');
    if (!need(mv, '옮길 수 있는 문을 못 찾음 (previewLayout이 모두 거절)')) return { steps, problems, logs: b.logs };
    const from = await b.ev('__d1t.center(' + JSON.stringify('.zdoor[data-edge="' + mv.from + '"]') + ')');
    if (!need(from, '건설 모드에 문 표시 ' + mv.from + '가 없음')) return { steps, problems, logs: b.logs };
    await b.mouseDrag(from, await b.ev('__d1t.edgeXY(' + mv.x + ',' + mv.y + ')'));
    need((await b.ev('document.querySelectorAll(".zdoor.pend").length')) === 1, '문을 끌어 놓았는데 미확정 문이 안 보임');
    need((await b.ev('document.querySelector("#view").innerText.indexOf("문 1개 옮김") >= 0')), '아래 합계에 "문 1개 옮김"이 없음');
    // 4) 대기실 하나 끌어 놓기 (튜토리얼 추천 칸 C6)
    const tool = await b.ev('__d1t.center(\'[data-tool="den"]\')');
    const cell = await b.ev('__d1t.center(\'.zc[data-z="C6"]\')');
    need(tool && cell, '대기실 띠나 C6 칸이 없음');
    if (tool && cell) await b.mouseDrag(tool, cell);
    need((await b.ev('document.querySelectorAll(".zc.pend").length')) >= 1, '대기실을 끌어 놓았는데 미확정 칸이 없음');
    // 5) [건설] = 문 + 시설 함께 확정
    await b.click('#view [data-confirm]'); await b.sleep(300);
    const site = await b.ev('(function(){var s=PROGRESS.RUN.site;return {builds:s.builds,doors:s.doors[1]||s.doors["1"],c6:s.zones.C6};})()');
    need(site.builds >= 1 && site.c6 === 'den', '[건설] 뒤 C6 대기실이 확정 안 됨: ' + JSON.stringify(site.c6));
    need(site.doors.indexOf(mv.to) >= 0 && site.doors.indexOf(mv.from) < 0, '[건설] 뒤 문 ' + mv.from + ' -> ' + mv.to + '가 확정 안 됨');
    step('건설 모드: 문 ' + mv.from + ' -> ' + mv.to + ' 끌기 + 대기실 C6 끌기 -> [건설] 확정');
    // 6) 홈 -> 다음 주 -> 전투 화면 (새로고침해도 전투 화면 유지)
    await b.click('#tabs [data-go="company"]'); await b.sleep(400);
    need((await scr()) === 'company', '[홈]이 회사 화면으로 안 감');
    const week0 = await b.ev('PROGRESS.RUN.week');
    await b.click('#tabs [data-week]'); await b.sleep(500);
    if (!need((await scr()) === 'battle' && (await b.ev('PROGRESS.RUN.battling')), '[다음 주 ▶]가 전투 화면을 안 엶')) return { steps, problems, logs: b.logs };
    await b.reload(500); await d1drive_page(b);
    need((await scr()) === 'battle', '전투 화면에서 새로고침하면 전투 화면으로 돌아와야 함: ' + (await scr()));
    // 7) 배속 최대 -> 전투 시작 -> 끝까지 (침입자 카드·위기 카드·층 알림은 눌러 넘김)
    for (let i = 0; i < 4; i++) { if ((await b.ev('document.querySelector(".bt-speed").textContent')).indexOf('×5') >= 0) break; await b.click('.bt-speed'); }
    need((await b.ev('document.querySelector(".bt-speed").textContent')).indexOf('×5') >= 0, '배속을 ×5로 못 바꿈');
    await b.click('.bt-start');
    const t0 = Date.now();
    let cards = 0, done = false;
    while (Date.now() - t0 < 60000) {
      const st = await b.ev(`(function () {
        if (document.querySelector('.bt-result')) return 'result';
        var nf = document.querySelector('.bt-ov [data-nextfloor]'); if (nf) { nf.click(); return 'floor'; }
        var ed = document.querySelector('.bt-ov.ev [data-dir]'); if (ed && ed.closest('.bt-ov').style.pointerEvents !== 'none') { ed.click(); return 'card'; }
        var sec = document.querySelector('.bt-ov.sec'); if (sec && sec.style.pointerEvents !== 'none') { sec.click(); return 'icard'; }
        return 'run';
      })()`);
      if (st === 'result') { done = true; break; }
      if (st === 'card' || st === 'icard') cards++;
      await b.sleep(150);
    }
    if (!need(done, '전투가 60초(×5) 안에 결과표까지 안 감')) return { steps, problems, logs: b.logs };
    const rep = await b.ev('(function(){var r=PROGRESS.RUN.lastBattle;return r?{summary:r.summary||"",week:PROGRESS.RUN.week,battling:PROGRESS.RUN.battling}:null;})()');
    need(rep && rep.summary && !rep.battling, '결과 보고에 요약 한 줄(summary)이 없음');
    need(rep && (await b.ev('document.querySelector(".bt-result").innerText')).indexOf(rep.summary) >= 0, '결과표에 요약 한 줄이 안 보임: ' + (rep && rep.summary));
    need(rep && rep.week === week0 + 1, '전투 뒤 주가 1 늘어야 함: ' + week0 + ' -> ' + (rep && rep.week));
    step('다음 주 -> 전투(×5, 카드·알림 ' + cards + '번 누름, ' + Math.round((Date.now() - t0) / 100) / 10 + '초) -> 결과표 "' + (rep && rep.summary) + '"');
    // 8) 홈 -> 저장·새로고침 뒤 이어짐
    await b.click('.bt-result [data-home]'); await b.sleep(400);
    need((await scr()) === 'company', '결과표 [홈으로]가 회사로 안 감');
    const keep = 'JSON.stringify({w:PROGRESS.RUN.week,g:PROGRESS.RUN.gold,d:PROGRESS.RUN.site.doors,z:PROGRESS.RUN.site.zones,b:PROGRESS.RUN.site.builds,s:PROGRESS.RUN.quest&&PROGRESS.RUN.quest.stage})';
    const k0 = await b.ev(keep);
    await b.reload(500); await d1drive_page(b);
    need((await b.ev(keep)) === k0 && (await scr()) === 'company', '새로고침 뒤 진행이 이어지지 않음');
    step('홈 -> 새로고침 -> 같은 주·문·시설·금으로 이어짐');
    // 9) API로 빨리 감기: 매주 남은 마석으로 시설 짓기(앞 방 대기실 -> 함정) + 전투 계산, 의뢰 완료까지
    const ff = await b.ev(`(function () {
      var P = PROGRESS, plan = [['B7','den'],['D7','den'],['C5','trap'],['B6','trap'],['D6','trap'],['C3','trap'],['C2','trap'],['B5','trap'],['D5','trap'],['A6','trap'],['E6','trap'],['B3','trap'],['D3','trap'],['A5','trap'],['E5','trap']];
      for (var wk = 0; wk < 20; wk++) {
        P.questUpdate();
        if (P.checkQuest()) return { ok: true, weeks: wk, week: P.RUN.week, line: P.questProgress().line };
        plan.forEach(function (p) { if (P.RUN.site.zones[p[0]] === 'empty' || !P.RUN.site.zones[p[0]]) P.buildZone(p[0], p[1]); });
        if (!__d1t.weekByApi()) return { ok: false, why: '전투 진행 실패 (주 ' + P.RUN.week + ')' };
      }
      return { ok: false, why: '20주 안에 의뢰 완료 못 함: ' + P.questProgress().line };
    })()`);
    if (!need(ff && ff.ok, '빨리 감기 실패: ' + (ff && ff.why))) return { steps, problems, logs: b.logs };
    step('API로 ' + ff.weeks + '주 빨리 감음 -> 의뢰 완료 (' + ff.line + ', ' + ff.week + '주째)');
    // 10) 화면으로 납품 -> 정산 -> 데모 끝
    await b.reload(500); await d1drive_page(b);
    need((await scr()) === 'company', '빨리 감은 뒤 회사 화면이 아님');
    if (!need(await b.ev('!!document.querySelector("#view [data-deliver]")'), '회사 진행 띠에 [납품하기]가 없음')) return { steps, problems, logs: b.logs };
    await b.click('#view [data-deliver]'); await b.sleep(600);
    need((await scr()) === 'result' && (await b.ev('PROGRESS.RUN.phase')) === 'settle', '[납품하기] 뒤 정산 화면(settle)이 아님');
    if (!need(await b.ev('!!document.querySelector("#view [data-finish]")'), '정산 화면에 [정산 마치기]가 없음 (q1 뒤 데모 끝이어야 함)')) return { steps, problems, logs: b.logs };
    await b.click('#view [data-finish]'); await b.sleep(600);
    need((await b.ev('PROGRESS.RUN.phase')) === 'demoEnd', '[정산 마치기] 뒤 demoEnd가 아님');
    need(await b.ev('document.querySelector("#view").innerText.indexOf("데모는 여기까지") >= 0'), '데모 끝 화면 글("데모는 여기까지")이 없음');
    await b.reload(500); await d1drive_page(b);
    need(await b.ev('document.querySelector("#view").innerText.indexOf("데모는 여기까지") >= 0'), '새로고침 뒤 데모 끝 화면이 유지 안 됨');
    step('[납품하기] -> 정산 -> [정산 마치기] -> 데모 끝 화면 (새로고침 뒤에도 유지)');
  } finally {
    await b.close();
  }
  return { steps, problems, logs: b.logs };
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
