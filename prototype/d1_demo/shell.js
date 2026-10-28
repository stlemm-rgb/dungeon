/* D1 첫 데모 화면 (순수 JS, 임시 숫자·임시 문구). UI 개편 (2026-10-29): 기준 docs/specs/ui_restructure.md 사용자 확정본, 지시서 refs/brief_ui_restructure_ui.md
 *
 * 화면 틀 (기획서 2절)
 *  - 하단 탭 3개: 회사 · 현장 · 군단 (순서·이름 고정, 행동 버튼으로 바꾸지 않음). 군단은 첫 전투 정산 전 `잠김 · 첫 전투 후 열림`. 마계·내 집·가운데 홈/다음 주/운영 버튼은 없다(데모에 없어 숨김).
 *  - 공통 상단 바 hud(): 상태(회사/운영/건설/보스/결과/군단) · 회사 레벨 · 현장 전투력(의뢰 없으면 —) · 그 탭에 맞는 재화(회사 = 회사 금 / 현장 = 마석 + 회사 금 / 군단 = 신석 + 회사 금) · 설정 /
 *    다음 목표 한 줄 / (현장만) 보스 검증 n/5 막대. 전투력은 참고 수치, 납품 조건처럼 그리지 않는다.
 *  - 현장 = 같은 5x7 판 4상태. 운영·보스 도전·보스 결과 = battle.js (SCREEN_PLUGINS.field), 건설 = build.js (SCREEN_PLUGINS.build, 탭은 현장).
 *    출진·부대 조달·보충은 현장 [출진] 창, 시설 강화는 지은 시설을 누르는 창 (둘 다 battle.js). 보스 도전 중에는 탭이 보이되 이동이 막힌다(bossLocked).
 *  - 회사 = 의뢰가 없으면 의뢰 게시판이 첫 영역(수락 -> 현장), 있으면 의뢰 요약 + [현장으로] + 사무실 인물 무대 + 작품집. 납품 실행 입구는 현장 5/5 결과 하나, 회사는 정산·안내.
 *    납품 직후 정산(settle)과 데모 끝(demoEnd)은 회사 쪽 화면. 군단 = 부족 · 친위대 하위 탭, 2열 카드 + 아래 상세 (출진 배치·조달은 현장).
 *
 * 규칙
 *  - 한 페이지 안에서 주소 끝의 해시(#company 등)로 화면을 바꾼다. 브라우저 뒤로 가기 = 이전 화면. 예전 이름 #home #battle #sortie = 현장, #units = 군단은 받아서 옮겨 준다.
 *  - 진행 상태와 규칙은 progress.js (window.PROGRESS). 이 파일은 그 값을 보고 그리기만 하고, 값을 바꾸는 것은 PROGRESS의 정해진 함수(buildZone·commitLayout·challengeBoss·deliver …)로만 한다.
 *    읽는 함수 = API.md 13~15절. 화면은 흐름 시험(BATTLE_DATA.FLOW.on = true)이 켜진 경우만 지원한다 (옛 주 단위 화면 코드는 지움, 로직은 남아 있음).
 *  - 화면 지킴이(guardScreen): 정산 중이면 어느 화면이든 result로, 보스 도전 중이면 현장으로, 데모 끝이면 회사로, 군단·작품집은 열림 조건 전엔 막는다.
 *  - 화면 하나 = 함수 하나: SCREENS.이름 = function (el) { el에 내용을 채운다 }. 별도 파일은 SCREEN_PLUGINS.이름 = function (api) { return function (el) {...}; }.
 *  - 전환 애니메이션은 앞으로 갈 때만 (var(--dur-sheet) var(--ease-out)). 뒤로/닫기는 즉시.
 *  - 튜토리얼: 은발 마왕 말풍선(#tut). 흐름 시험 동안은 꺼 둠(tutOn). 새 튜토리얼은 나중에 새 동선으로 다시 만든다 (옛 "다음 주" 문구는 lines.js에서 지움).
 *  - 용어: 화면 글에 "퀘스트"를 쓰지 않는다 (의뢰·보스 검증). 회사 금(영구) · 마석(현장 전용) · 신석(과금)은 따로 표시한다.
 *  - 숫자는 가짜(균형 없음). 상태(RUN)는 progress.js가 localStorage에 자동 저장한다. 설정은 이 파일이 따로 저장.
 */
(function () {
  'use strict';

  // ---------- 연출용 무작위 (게임용 무작위 아님) ----------
  function fxRandom() { return Math.random(); }

  // ---------- 진행 상태 (progress.js) ----------
  var P = window.PROGRESS, RUN = P.RUN;

  // ---------- 하단 탭 3개 (기획서 2절): 회사 · 현장 · 군단 ----------
  // state: open = 열림 · gate = 진행하면 열림(잠김 + 조건, 지금 열렸는지는 tabState가 정함)
  var TABS = [
    { id: 'company', label: '회사', state: 'open' },
    { id: 'field',   label: '현장', state: 'open' },
    { id: 'corps',   label: '군단', state: 'gate' }
  ];
  var TAB_IDS = ['company', 'field', 'corps', 'build'];   // 탭 막대가 보이는 화면 (build = 현장 탭의 건설 상태)
  // 예전 주소 이름 -> 새 화면
  var ALIAS = { home: 'field', dungeon: 'field', battle: 'field', sortie: 'field', units: 'corps', shop: 'company', leaders: 'company', workshop: 'company', records: 'company', contract: 'company' };

  // 홈 무대 = 아이소메트릭 방. 캐릭터·가구·벽 소품 자리는 stage.js 표에 있다 (나중에 도트 그림만 끼우면 됨)
  var ST = window.STAGE;
  var STAGE_POS = {}; // 캐릭터별 지금 서 있는 칸 [gx, gy]. 화면을 다시 그려도 제자리에 있게 기억 (저장 안 함)

  // ---------- 설정 (localStorage, 막혀도 동작) ----------
  var SETTINGS_KEY = 'dunguen_d1_settings';
  var S = { sound: true, vibe: true, reduce: false };
  try {
    var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    ['sound', 'vibe', 'reduce'].forEach(function (k) { if (typeof saved[k] === 'boolean') S[k] = saved[k]; });
  } catch (e) { /* 저장이 막힌 환경: 기본값 사용 */ }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ } }

  // 움직임 줄이기: 모든 시간 토큰을 10ms로. 끄면 원래 값으로.
  var DUR0 = {};
  Object.keys(MOTION.dur).forEach(function (k) { DUR0[k] = MOTION.dur[k]; });
  function applyReduce() {
    document.body.classList.toggle('reduce', S.reduce);
    Object.keys(DUR0).forEach(function (k) {
      MOTION.dur[k] = S.reduce ? 10 : DUR0[k];
      document.documentElement.style.setProperty('--dur-' + k, MOTION.dur[k] + 'ms');
    });
  }
  // 진동은 꺼져 있으면 MOTION.buzz를 부르지 않는다.
  function buzz(name) { if (S.vibe) MOTION.buzz(name); }

  // ---------- 작은 도구 ----------
  var view = document.getElementById('view');
  var tabsEl = document.getElementById('tabs');
  var toastsEl = document.getElementById('toasts');
  function div(cls, html) { var d = document.createElement('div'); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; }
  function pct(v, total) { return (v / total * 100) + '%'; }
  function go(hash, animate) {
    if (location.hash === '#' + hash) return; // 같은 화면이면 아무것도 안 함
    animateNext = !!animate; location.hash = '#' + hash;
  }
  var animateNext = false;

  function toast(msg) {
    while (toastsEl.children.length >= MOTION.toast.max) toastsEl.removeChild(toastsEl.firstChild);
    var t = div('toast', msg);
    toastsEl.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, MOTION.toast.life);
  }
  // 머리글: 제목 + (뒤로 가기 버튼)
  var BACK_LABEL = { company: '← 회사', corps: '← 군단', field: '← 현장', home: '← 현장' }; // build.js는 'home'으로 부른다
  function head(title, backTo, backLabel, right) {
    var h = div('head');
    if (backTo) h.innerHTML += '<button class="back" data-back="' + backTo + '">' + (backLabel || BACK_LABEL[backTo] || '← 뒤로') + '</button>';
    h.innerHTML += '<h2>' + title + '</h2>' + (right || '');
    return h;
  }
  function money(n) { return Number(n).toLocaleString('en-US'); }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function fmtN(n) { return String(Math.round(Number(n) * 10) / 10); }
  function questTag(q) { return q.floors + '층 의뢰'; }
  // 부대 이름: 같은 부족 부대가 둘 이상이면 뒤에 #번호 (구분용. 친위대는 이름 그대로)
  function uname(u) {
    if (!u || u.kind === 'guard') return u ? u.name : '';
    var same = P.squads().filter(function (x) { return x.tribe === u.tribe; }), i = -1;
    same.forEach(function (x, n) { if (x.id === u.id) i = n; });
    return same.length > 1 && i >= 0 ? u.name + ' #' + (i + 1) : u.name;
  }
  // 판 미리보기·고정 구역 조각 (build.js 의 ZONEVIEW. 없으면 빈 글)
  function ZV() { return window.ZONEVIEW || {}; }
  function siteHtml(q) { return q && q.board && ZV().siteHtml ? ZV().siteHtml(q.board) : ''; }
  function fixedHtml(q) { return q && ZV().fixedHtml ? ZV().fixedHtml(q) : ''; }
  function showMsgs(msgs) { (msgs || []).slice(0, MOTION.toast.max).forEach(function (m) { toast(m); }); }
  // 새로 오른 보스 검증 단계를 토스트로 (건설·강화·조달·보스 뒤). 층이 열리면 한 줄 더
  function stageToast(stages) {
    var q = RUN.quest;
    (stages || []).forEach(function (n) {
      toast('보스 검증 ' + n + '/' + (q ? q.stages.length : 5) + ' 달성!');
      var stg = q && q.stages[n - 1];
      if (stg && stg.opens) toast('지하 ' + stg.opens + '층이 열렸어요');
    });
  }
  // 납품: 보스 검증 5/5 뒤 현장 보스 결과의 [납품]으로만 (실행 입구 하나). 자동 납품은 없다. 정산은 회사 쪽 화면(result)에서.
  function deliverNow() {
    if (!P.checkQuest()) { toast(P.questBlockers()[0] || '아직 보스 검증을 다 채우지 못했어요'); buzz('warn'); return false; }
    var rep = P.deliver();   // 튜토리얼은 여기서 안 꺼진다 (정산 화면 'deliver' 안내가 뜸). 다음 의뢰를 고를 때·정산을 마칠 때 꺼짐 (API.md 10절)
    if (!rep) { toast(P.questBlockers()[0] || '지금은 납품할 수 없어요'); buzz('warn'); return false; }
    try { P.closeBossResult(); } catch (e) { /* 결과 창이 없으면 무시 */ }
    toastsEl.innerHTML = ''; // 앞선 토스트는 치운다. 납품 알림은 정산 화면 머리의 도장("납품 완료")이 대신
    buzz('best');
    go('result', true);
    return true;
  }

  // 흐름 시험이 켜져 있고 의뢰 진행 중인가 (API.md 15절)
  function flowOn() { try { return !!(P.flowInfo && P.flowInfo().on && RUN.phase === 'play'); } catch (e) { return false; } }
  // 보스 도전 중인가: 탭 이동·설정·건설이 막힌다
  function bossLocked() { try { var f = P.flowInfo(); return !!(f.on && RUN.phase === 'play' && f.battling && f.mode === 'boss'); } catch (e) { return false; } }

  // ---------- 화면들 (함수 하나씩) ----------
  var SCREENS = {};

  // ---------- 위쪽 줄 · 입구 칸 · 열림 조건 ----------
  var LN = window.LINES || {};
  function lineOf(group, key, fb) { var g = LN[group]; return g && typeof g[key] === 'string' && g[key].trim() ? g[key] : fb; }
  function condText(key) { return lineOf('lock', key, '조건을 채우면 열려요'); }
  function corpsOpen() { return !!P.unlocks().corps; }      // 군단 탭 = 첫 전투 정산 뒤
  function deliveredOnce() { return !!P.unlocks().guards; } // 친위대·작품집 = 첫 납품 끝
  // 직급 칭호: lines.js ranks 12단계 (회사 레벨 구간. 임시로 레벨 3마다 한 단계)
  function rankOf(lv) {
    var r = Array.isArray(LN.ranks) ? LN.ranks : [];
    return r.length ? r[Math.min(r.length - 1, Math.floor((lv - 1) / 3))] : { title: '', desc: '' };
  }

  // 입구 칸 한 개. kind: open(열림, go로 이동) · lock(잠김 + 열림 조건). 데모에 없는 입구는 만들지 않는다(기획서 확정 ③)
  function entry(o) {
    var attr = '', nm = o.name, sub = o.sub || '';
    if (o.kind === 'open') attr = o.go ? ' data-go="' + o.go + '"' : '';
    else { nm = '🔒 ' + o.name; sub = o.cond; attr = ' data-toast="' + esc('🔒 ' + o.name + ': ' + o.cond) + '"'; }
    return '<button class="entry ' + o.kind + (o.on ? ' on' : '') + '"' + attr + (o.attrs || '') + '><span class="nm">' + nm + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  }

  // ---------- 공통 상단 바 hud · 다음 목표 · 보스 검증 막대 (기획서 2·7절) ----------
  function powerText() { try { return RUN.phase === 'play' && RUN.quest ? fmtN(P.sitePower()) : '—'; } catch (e) { return '—'; } }
  // 다음 목표 한 줄 (행동 + 대상). 우선순위: 정산/납품 -> 미확정 수정 -> 실패 후 수정 -> 다음 보스
  function goalText(c) {
    c = c || {};
    if (RUN.phase === 'settle') return '납품 정산을 마치세요';
    if (RUN.phase === 'demoEnd') return '작품집과 군단을 둘러보세요';
    if (RUN.phase !== 'play' || !RUN.quest) return '의뢰를 받아 현장을 여세요';
    if (c.pending) return '미확정 배치를 확정하거나 취소하세요';
    var pr = P.questProgress(), fi = P.flowInfo(), bi = fi.boss;
    if (pr && pr.complete) return '납품하고 회사에서 정산하세요';
    if (bossLocked()) return '보물방 도달을 막으세요';
    if (fi.show && !fi.show.success) return '보물방에 도달한 길의 배치를 고치세요';
    if (c.state === 'build') return '문·시설 배치를 정해 확정하세요';
    return bi && bi.stage > 1 ? '보스 ' + bi.stage + '단계에 도전하세요' : '첫 보스에 도전해 방어를 확인하세요';
  }
  // 보스 검증 막대: 성공한 보스 수 n/5 (도전 중인 번호는 따로 표시)
  function bossBarHtml(c) {
    var pr = P.questProgress();
    if (!pr) return '';
    var fi = P.flowInfo(), n = pr.stage, tot = pr.total, segs = '', i, note;
    var challenging = bossLocked();
    for (i = 0; i < tot; i++) segs += '<i class="' + (i < n ? 'on' : '') + (i === n && challenging ? ' now' : '') + '"></i>';
    if (pr.complete) note = '검증 완료';
    else if (challenging) note = (n + 1) + '단계 도전 중';
    else if (c && c.state === 'build') note = '전투 정지';
    else if (fi.show && fi.show.stage === n + 1 && !fi.show.success) note = (n + 1) + '단계 실패';
    else note = '다음 ' + (n + 1) + '단계';
    return '<div class="hboss"><b>보스 검증 ' + n + '/' + tot + '</b><span class="hsegs">' + segs + '</span><small>' + note + '</small></div>';
  }
  function hudInner(c) {
    var tab = c.tab || 'company', co = P.company(), boss = bossLocked();
    var label = c.label || (tab === 'corps' ? '군단' : tab === 'field' ? '운영' : '회사');
    var extra = tab === 'field' ? '<span class="chip maseok" data-chip="mas">마석 ' + money(P.budgetLeft()) + '</span>'
      : tab === 'corps' ? '<span class="chip sinseok" data-chip="gem">신석 ' + RUN.gems + '</span>' : '';
    return '<div class="hud1"><span class="hstate">' + label + '</span><span class="hpow">Lv ' + co.lv + ' · 전투력 <b>' + powerText() + '</b></span>' +
      '<span class="chip" data-chip="gold">회사 금 ' + money(RUN.gold) + '</span>' +
      '<button class="gear" type="button" ' + (boss ? 'data-toast="보스전이 끝나면 열 수 있어요"' : 'data-go="settings"') + ' aria-label="설정">&#9881;&#xFE0E;</button></div>' +
      '<div class="hud2">' + extra + '<span class="hgoal">목표: ' + esc(goalText(c)) + '</span></div>' +
      (tab === 'field' && RUN.phase === 'play' && RUN.quest ? bossBarHtml(c) : '');
  }
  // c = { tab: 'company'|'field'|'corps', label(상태 글), state(CSS 색 구분: op·build·boss·res), pending(건설 미확정 있음) }. 다시 그릴 땐 hudRefresh(노드)
  function hud(c) {
    var h = div('hud' + (c && c.state ? ' ' + c.state : ''));
    h._ctx = c || {};
    h.innerHTML = hudInner(h._ctx);
    return h;
  }
  function hudRefresh(h) { if (h && h._ctx) h.innerHTML = hudInner(h._ctx); }

  // 보스 검증 단계 목록 (의뢰 카드·게시판 공통). cur = 지금 단계(0~5, 없으면 모두 앞으로)
  function stagesHtml(q, cur) {
    var list = ((window.BATTLE_DATA && window.BATTLE_DATA.BOSSES) || {})[q.key] || [];
    return '<ul class="plain stglist">' + q.stages.map(function (s, i) {
      var st = cur == null ? '' : i < cur ? ' done' : i === cur ? ' now' : '';
      var t = '보스 ' + (i + 1) + '단계 방어' + (list[i] ? ' · ' + esc(list[i].name) : '') + (s.opens ? ' · 🔓 ' + s.opens + '층 열림' : '');
      return '<li class="stg' + st + '"><b>' + (i < (cur || 0) ? '✓' : (i + 1)) + '</b><span>' + t + '</span></li>';
    }).join('') + '</ul>';
  }
  function rewardText(rw) {
    return '회사 금 +' + money(rw.gold || 0) + (rw.gems ? ' · 신석 +' + rw.gems : '') + ' · 회사 경험치 +' + (rw.companyExp || 0);
  }

  // ---------- 지하 단면 (건설 상태가 쓴다): 열린 층의 판만 세로로 (층이 하나면 층 머리도 없음). 구역 판 그리기는 boardFn(층 번호, 잠김, 잠김 글)이 맡는다 ----------
  function lockTextOf(fi, pr) { return '지하 ' + fi.n + '층: ' + (fi.lockAt ? '보스 검증 ' + fi.lockAt + '단계 달성 시 열림' + (pr ? ' (지금 ' + pr.stage + '단계)' : '') : '이 의뢰에서는 열리지 않아요'); }
  function shaftHtml(boardFn) {
    var pr = P.questProgress(), fis = P.floorsInfo(), h = '';
    fis.forEach(function (fi) {
      var head = fis.length > 1 ? '<div class="fhead"><b>' + (fi.open ? '' : '🔒 ') + '지하 ' + fi.n + '층</b></div>' : '';
      if (fi.open) h += '<div class="floor f' + fi.n + '" data-floor-box="' + fi.n + '">' + head + boardFn(fi.n, false, '') + '</div>';
      else if (fi.lockAt) h += '<div class="floor f' + fi.n + ' lockedfloor" data-floor-box="' + fi.n + '">' + head + boardFn(fi.n, true, lockTextOf(fi, pr)) + '</div>';
    });
    return h;
  }
  // 단면 안 눌림 처리는 건설 화면이 직접 한다 (잠긴 층 눌림은 build.js)
  function bindShaft() { /* 자리만 남김 (예전 호출 호환) */ }


  // ---------- 회사 탭 ----------
  // 의뢰 수락 -> 현장 운영 (일반 판이 바로 시작)
  function acceptQuest(qq) {
    if (!P.pickQuest(qq, [])) return false;
    buzz('good'); toast('새 부지에서 시작: ' + qq.name);
    go('field', true);
    return true;
  }
  // 의뢰 게시판 (의뢰가 없을 때 회사의 첫 영역): 후보 카드 + 아직 못 받는 의뢰의 해금 조건
  function boardInto(el) {
    var list = P.offerQuests(), lk = P.lockedQuest(), picked = false;
    el.appendChild(div('qtitle', '<h3>의뢰 게시판</h3><div class="dim small-text">' +
      (list.length ? '카드를 누르면 바로 시작해요. 한 장만 고르고, 기한은 없어요.' : '지금 받을 수 있는 의뢰가 없어요.') + '</div>'));
    list.forEach(function (q) {
      el.appendChild(questCard(q, function (qq) {
        if (picked) return;
        picked = true;
        if (!acceptQuest(qq)) picked = false;
      }));
    });
    if (lk) el.appendChild(div('card lockq', '<div class="qhead"><span class="chip">' + lk.floors + '층 의뢰</span><h3>🔒 ' + esc(lk.name) + '</h3></div>' +
      '<div class="small-text dim">회사 레벨 ' + lk.minCompanyLv + '부터 받을 수 있어요 (지금 Lv ' + P.company().lv + ')</div>'));
  }
  // 의뢰 있음: 이름 · 보스 검증 요약 · [현장으로]. 납품 실행 버튼은 두지 않는다 (현장 5/5 결과 하나) -> 검증 완료면 안내만
  function questSummary(q) {
    var pr = P.questProgress(), bi = pr && pr.boss, h = '<div class="qhead"><span class="chip accent">' + questTag(q) + '</span><h3>' + esc(q.name) + '</h3></div>';
    if (q.client) h += '<div class="qclient">' + (q.client.kind ? '<span class="chip">' + esc(q.client.kind) + '</span> ' : '') + '<b>' + esc(q.client.name || '') + '</b></div>';
    h += '<div class="stat"><span>보스 검증</span><b>' + pr.stage + '/' + pr.total + '</b></div>';
    h += pr.complete ? '<div class="qnote"><b class="ready">검증 완료 · 현장에서 납품</b></div>'
      : '<div class="qnote small-text dim">다음 보스: ' + esc(bi && bi.name ? bi.name + ' (' + bi.squads + '분대)' : '—') + (bi && bi.tries ? ' · 도전 ' + bi.tries + '번' : '') + '</div>';
    h += '<div class="row2"><button class="btn primary" type="button" data-go="field">현장으로</button><button class="btn" type="button" data-go="board">계약 보기</button></div>';
    return div('card qsum', h);
  }
  SCREENS.company = function (el) {
    el.appendChild(hud({ tab: 'company', label: '회사' }));
    var co = P.company(), lv = co.lv, rk = rankOf(lv), q = RUN.quest;
    if (RUN.phase === 'demoEnd') demoEndScreen(el);
    else if (RUN.phase === 'play' && q) el.appendChild(questSummary(q));
    else boardInto(el);
    el.appendChild(div('card rankcard', '<div class="rankrow"><b class="ranktitle">' + esc(rk.title || '') + '</b><span class="chip accent">회사 Lv ' + lv + '</span></div>' +
      '<div class="rankdesc small-text dim"><span>' + esc(rk.desc || '') + '</span><b>경험치 ' + co.exp + '/' + co.need + '</b></div><div class="xpbar"><i style="width:' + pct(co.exp, co.need) + '"></i></div>'));

    // 무대: 아이소메트릭 방 (그림 = stage.js SVG) + 캐릭터 자리. 바깥 틀(.stage)은 남는 높이를 채우고 방(.stagebox)은 비율을 지킨 채 가운데에 놓는다
    var stage = div('stage'), box = div('stagebox', ST.roomSvg());
    stage.appendChild(box);
    var actors = startActors(stage, box);
    stage.appendChild(div('stagetag', '<span class="chip">검은망치 건설 본사</span>'));
    el.appendChild(stage);
    wanderActors(actors, stage);

    var gal = deliveredOnce() ? { kind: 'open', go: 'gallery', name: '작품집', sub: '납품한 던전 ' + RUN.works.length + '곳' } : { kind: 'lock', name: '작품집', cond: condText('gallery') };
    el.appendChild(div('entries one', entry(gal)));
  };

  // ---------- 계약 보기 (회사 탭 안): 지금 받은 의뢰 한 장. 계약·보상 확인용이라 보스 도전 버튼은 없다 ----------
  SCREENS.board = function (el) {
    el.appendChild(head('계약 보기', 'company'));
    var q = RUN.quest;
    if (!q) { el.appendChild(div('card dim', '진행 중인 의뢰가 없어요')); return; }
    var pr = P.questProgress();
    var h = '<div class="qhead"><span class="chip accent">' + questTag(q) + '</span><h3>' + esc(q.name) + '</h3></div>';
    if (q.client) h += '<div class="qclient">' + (q.client.kind ? '<span class="chip">' + esc(q.client.kind) + '</span> ' : '') + '<b>' + esc(q.client.name || '') + '</b></div>';
    h += siteHtml(q) + fixedHtml(q);
    if (q.attr) h += '<div class="qattr"><div class="qattr-h"><span class="chip">던전 속성</span> <b>' + esc(q.attr.label || '') + '</b></div>' + (q.attr.effect ? '<div class="small-text">' + esc(q.attr.effect) + '</div>' : '') + '</div>';
    h += '<div class="poplabel qlabel">보스 검증 ' + q.stage + '/' + q.stages.length + (pr && pr.complete ? ' · 검증 완료' : '') + '</div>' + stagesHtml(q, q.stage) +
      '<div class="stat"><span>마석</span><b>' + money(P.budgetLeft()) + ' / ' + money(RUN.site.budgetStart) + '</b></div>' +
      '<div class="stat"><span>납품 보수</span><b>' + rewardText(q.reward) + '</b></div>';
    el.appendChild(div('card contract', h));
    el.appendChild(div('dim small-text', '한 번에 의뢰 하나만 받을 수 있어요. 보스 5단계를 모두 막으면 현장의 [납품]으로 끝낼 수 있어요.'));
  };

  // ---------- 작품집 (회사 탭 입구, 첫 납품 뒤 열림): 납품한 던전 목록 + 작품집 효과 ----------
  SCREENS.gallery = function (el) {
    el.appendChild(head('작품집', 'company'));
    var wi = P.worksInfo();
    var rows = wi.list.slice().reverse().map(function (w) {
      return '<li><b>No.' + w.no + ' ' + esc(w.name) + '</b><br><span class="dim small-text">' + esc(w.client) + ' · 가치 ' + w.value + ' · 전투력 ' + w.power + '</span></li>';
    });
    el.appendChild(div('card', '<h3>납품한 던전</h3>' + (rows.length ? '<ul class="plain">' + rows.join('') + '</ul>' : '<div class="dim small-text">아직 없어요</div>')));
    var ef = wi.effect;
    el.appendChild(div('card', '<h3>작품집 효과</h3><div class="stat"><span>' + esc(ef.label) + '</span><b>' + (ef.active ? '적용 중' : '작품 1개부터') + '</b></div><div class="small-text dim">' + esc(ef.text) + '</div>'));
  };

  // ---------- 회사 무대: 캐릭터 자리 · 걷기 · 말풍선 ----------
  // 캐릭터 한 명 = div.actor (움직이는 틀) 안에 button.slot (도트 자리). 위치는 칸 좌표 -> 무대 비율(%)로 둔다.
  function placeActor(act, pos) {
    var a = act.a, f = ST.feet(pos[0], pos[1]), s = act.node.style;
    s.left = pct(f.x - a.w / 2, ST.W); s.top = pct(f.y - a.h, ST.H);
    s.width = pct(a.w, ST.W); s.height = pct(a.h, ST.H);
    s.zIndex = Math.round(f.y); // 아래(앞)에 선 사람이 위에 보이게
    act.at = pos; STAGE_POS[a.id] = pos;
  }
  function startActors(stage, box) {
    return ST.ACTORS.map(function (a, i) {
      var node = div('actor'), btn = document.createElement('button');
      btn.className = 'slot' + (a.boss ? ' boss' : '');
      btn.setAttribute('aria-label', a.name);
      btn.innerHTML = '<b>' + a.tag + '</b>' + a.w + '×' + a.h; // 도트 그림이 들어갈 자리 표시
      btn.style.animationDelay = (-i * 0.7) + 's';
      node.appendChild(btn);
      var act = { a: a, node: node, at: null, held: false, timer: null };
      placeActor(act, STAGE_POS[a.id] || a.at);
      btn.addEventListener('click', function () { say(stage, act); });
      box.appendChild(node);
      return act;
    });
  }
  // 가끔 한 명이 방 안 다른 자리로 천천히 걸어간다. 움직임 줄이기가 켜져 있으면 가만히 서 있는다.
  function wanderActors(actors, stage) {
    var timer = null;
    function walk(act) {
      var taken = actors.map(function (x) { return x.at; }).filter(function (p) { return p !== act.at; });
      var to = ST.pickSpot(act.a, act.at, taken, fxRandom);
      if (!to) return;
      var dx = to[0] - act.at[0], dy = to[1] - act.at[1];
      var ms = Math.round(MOTION.dur.fx * 1.6 * Math.max(1, Math.sqrt(dx * dx + dy * dy)));
      act.node.style.transitionDuration = ms + 'ms';
      act.node.classList.add('walk');
      placeActor(act, to);
      clearTimeout(act.timer);
      act.timer = setTimeout(function () { act.node.classList.remove('walk'); }, ms);
    }
    function next() {
      timer = setTimeout(function () {
        if (!S.reduce) {
          var free = actors.filter(function (x) { return !x.held && !x.node.classList.contains('walk'); });
          if (free.length) walk(free[Math.floor(fxRandom() * free.length)]);
        }
        next();
      }, DUR0.fx * (5 + fxRandom() * 6)); // 2.5~5.5초마다
    }
    next();
    leaveHooks.push(function () {
      clearTimeout(timer);
      actors.forEach(function (x) { clearTimeout(x.timer); });
      speaking = null; clearTimeout(bubbleTimer);
    });
  }
  // 걷는 도중이면 그 자리에서 멈춘다 (지금 보이는 위치를 새 위치로)
  function freezeActor(act) {
    var cs = getComputedStyle(act.node), a = act.a, box = act.node.parentNode;
    var x = parseFloat(cs.left) / box.clientWidth * ST.W + a.w / 2, y = parseFloat(cs.top) / box.clientHeight * ST.H + a.h;
    act.node.style.transitionDuration = '0ms';
    act.node.classList.remove('walk');
    clearTimeout(act.timer);
    var g = ST.grid(x, y);
    placeActor(act, [g[0], g[1]]);
  }

  // 말풍선: 하나만 떠 있고 3초 뒤 사라진다. 말하는 동안 그 캐릭터는 멈춰 있는다.
  var bubbleTimer = null, speaking = null;
  function say(stage, act) {
    var old = stage.querySelector('.bubble');
    if (old) stage.removeChild(old);
    clearTimeout(bubbleTimer);
    if (speaking) speaking.held = false;
    speaking = act; act.held = true;
    freezeActor(act);
    var sr = stage.getBoundingClientRect(), nr = act.node.getBoundingClientRect(), bw = 170;
    var cx = nr.left - sr.left + nr.width / 2;
    var left = Math.max(4, Math.min(sr.width - bw - 4, cx - bw / 2));
    var line = act.a.lines[Math.floor(fxRandom() * act.a.lines.length)];
    var b = div('bubble', '<small>' + act.a.name + '</small>' + line);
    b.style.left = left + 'px';
    b.style.setProperty('--tail', (cx - left) + 'px');
    stage.appendChild(b);
    b.style.top = Math.max(4, nr.top - sr.top - b.offsetHeight - 10) + 'px';
    buzz('tap');
    bubbleTimer = setTimeout(function () {
      if (b.parentNode) b.parentNode.removeChild(b);
      act.held = false; if (speaking === act) speaking = null;
    }, 3000);
  }

  function flashUp(node) { if (!node) return; node.classList.remove('upflash'); void node.offsetWidth; node.classList.add('upflash'); } // 성공 연출: 그 요소를 짧게 반짝 (shell.css .upflash)
  function gemCost(info) { return info && info.cost && typeof info.cost.gems === 'number' ? info.cost.gems : null; }
  function tribeById(id) { var T = P.TRIBES || []; for (var i = 0; i < T.length; i++) if (T[i].id === id) return T[i]; return null; }
  function zoneName(z) { var Zn = window.ZONES; return z && Zn && Zn.NAMES ? Zn.NAMES[z] || z : ''; }
  function fmtStat(key, v) { return key === 'def' ? Math.round(v * 100) + '%' : fmtN(v); }
  function fmtPart(key, v, plus) { return !v ? '0' : (plus ? '+' : '') + fmtStat(key, v); }
  // 능력치 한 줄 요약: 체력 · 초당 공격 · 방어
  function statLine(u) {
    return P.STATS.map(function (s) { return s.label.replace(/\(.*\)/, '') + ' ' + fmtStat(s.key, u[s.key]); }).join(' · ');
  }
  // 능력치 펼침: 항목마다 기본·레벨·강화·장비·인챈트 (장비·인챈트는 아직 0)
  function statDetailHtml(u) {
    return '<div class="sdetail">' + P.STATS.map(function (s) {
      var p = P.statParts(u.id, s.key);
      if (!p) return '';
      return '<div class="srow"><div class="sname"><b>' + esc(s.label) + '</b><b class="stot">' + fmtStat(s.key, P.statOf(u.id, s.key)) + '</b></div>' +
        '<div class="sparts"><span>기본 ' + fmtPart(s.key, p.base, false) + '</span><span>레벨 ' + fmtPart(s.key, p.level, true) + '</span><span>강화 ' + fmtPart(s.key, p.upgrade, true) +
        '</span><span class="empty">장비 ' + fmtPart(s.key, p.equip, true) + '</span><span class="empty">인챈트 ' + fmtPart(s.key, p.enchant, true) + '</span></div></div>';
    }).join('') + '<div class="small-text dim">1명 기준 값이에요. 장비·인챈트는 아직 빈칸(0)이에요.</div></div>';
  }


  // ---------- 군단 탭: 부족 / 친위대 하위 탭, 2열 카드 + 아래 상세 (기획서 5절). 첫 전투 정산 뒤에 열린다 ----------
  // 부족 = 내가 쓰는 몬스터 종류(신석 강화는 계속 유지). 친위대 = 이름 있는 개체(다음 현장 동행, 첫 납품 뒤 열림). 출진 배치·부대 조달·보충은 현장 [출진] 창에서만 (여기엔 실행 버튼 없음, 신석 강화만).
  // 능력치는 1명 기준 (statOf·statParts). 성장 창 공통 표시: 대상 -> 지금/다음 효과 -> 비용이 적힌 실행 버튼 하나. 잔액·부족 이유는 버튼 옆.
  var corpsTab = 'tribe', corpsSel = { tribe: null, guard: null };
  function whereText(u) {   // "1층 C3 출진 중" / "대기"
    return u.floor ? u.floor + '층 ' + (u.placed ? esc(zoneName(u.placed)) + ' ' : '') + '출진 중' : '대기';
  }
  SCREENS.corps = function (el) {
    el.appendChild(hud({ tab: 'corps', label: '군단' }));
    var segEl = div('seg corpstabs'), gridEl = div('cgrid'), detEl = div('card cdetail');
    var T = P.TRIBES || [];
    function squadsOf(tid) { return P.squads().filter(function (u) { return u.tribe === tid; }); }

    function tribeCardHtml(t) {
      var ti = P.tribeInfo(t.id), n = squadsOf(t.id).length, on = corpsSel.tribe === t.id;
      return '<button class="ccard' + (on ? ' on' : '') + '" type="button" data-pick="' + t.id + '"><div class="portrait">도트</div><b class="cname">' + esc(t.name) + '</b>' +
        '<span class="chip">' + esc(t.role) + '</span><small class="cmeta">강화 Lv ' + (ti ? ti.lv + '/' + ti.max : 0) + '</small>' +
        '<small class="cmeta">' + (ti && ti.contracted === false ? '사용권 없음' : '현장 부대 ' + n) + '</small></button>';
    }
    function tribeDetailHtml(t) {
      var ti = P.tribeInfo(t.id), c = gemCost(ti), sq = squadsOf(t.id);
      var upBtn = !ti || ti.contracted === false ? '<button class="btn primary" type="button" disabled>사용권 필요</button>'
        : ti.next == null || c == null ? '<button class="btn primary" type="button" disabled>최고 단계</button>'
        : '<button class="btn primary' + (ti.canAfford ? '' : ' poor') + '" type="button" data-uptribe="' + t.id + '"' + (ti.canAfford ? '' : ' aria-disabled="true"') + '>신석 강화 · 신석 ' + c + '</button>';
      var why = ti && ti.next != null && !ti.canAfford ? esc(ti.why) : '';
      return '<h3>' + esc(t.name) + ' <span class="chip">' + esc(t.role) + '</span></h3>' +
        '<div class="small-text">' + esc(t.feature) + '</div><div class="small-text dim">' + esc(t.talk) + '</div>' +
        '<div class="grow-box"><div class="uphead"><b>신석 강화</b><span class="chip keep">계속 유지</span></div>' +
        '<div class="uprow"><span class="uplab">지금</span><span class="upval">' + esc(ti ? ti.effect : '—') + '</span></div>' +
        '<div class="uprow"><span class="uplab">다음</span><span class="upval">' + (ti && ti.next ? '<b>' + esc(ti.next) + '</b>' : '최고 단계') + '</span></div>' +
        '<div class="upfoot2"><span class="upwhy">' + why + '</span>' + upBtn + '</div>' +
        '<div class="small-text dim">신석 ' + RUN.gems + ' 보유 · 누르면 바로 적용돼요 (진행 중인 일반 판은 새 판으로 바뀌어요)</div></div>' +
        '<div class="bt-sub">현장 부대 ' + sq.length + '곳 (배치는 현장 [출진] 창에서)</div>' +
        (sq.length ? sq.map(function (u) {
          return '<div class="stat"><span>' + esc(uname(u)) + ' · ' + u.count + '/' + u.cap + '명 · Lv ' + u.lv + '</span><b>' + whereText(u) + '</b></div>';
        }).join('') : '<div class="small-text dim">부대가 없어요. 현장의 [출진] 창에서 조달해요.</div>');
    }
    function guardCardHtml(u, i) {
      if (!u) return '<div class="ccard empty"><div class="portrait">칸 ' + (i + 1) + '</div><b class="cname dim">비어 있음</b><small class="cmeta">납품 때 지정</small></div>';
      var on = corpsSel.guard === u.id;
      return '<button class="ccard guard' + (on ? ' on' : '') + '" type="button" data-pick="' + u.id + '"><div class="portrait">친위대</div><b class="cname">' + esc(u.name) + '</b>' +
        '<span class="chip">' + esc(u.tribeName) + '</span><small class="cmeta">Lv ' + u.lv + ' · 등급 ' + P.monGrade(u.lv) + '</small><small class="cmeta">' + whereText(u) + '</small></button>';
    }
    function guardDetailHtml(u) {
      var raw = RUN.guards.filter(function (g) { return g.id === u.id; })[0] || {}, t = tribeById(u.tribe);
      return '<h3>' + esc(u.name) + ' <span class="chip accent">친위대</span></h3>' +
        '<div class="small-text dim">' + esc((t && t.guardIntro) || '') + (raw.from ? ' (출신 현장: ' + esc(raw.from) + ')' : '') + '</div>' +
        '<div class="utags"><span class="chip">' + esc(u.tribeName) + '</span><span class="chip">Lv ' + u.lv + '</span><span class="chip">등급 ' + P.monGrade(u.lv) + '</span><span class="chip' + (u.floor ? ' ok' : '') + '">' + whereText(u) + '</span></div>' +
        '<div class="nums small-text">' + statLine(u) + '</div>' +
        '<div class="xprow small-text dim"><span>경험치</span><b>' + u.exp + '/' + u.need + '</b></div><div class="xpbar"><i style="width:' + pct(u.exp, u.need) + '"></i></div>' +
        statDetailHtml(u);
    }
    function draw() {
      var gOpen = deliveredOnce();
      if (corpsTab === 'guard' && !gOpen) corpsTab = 'tribe';
      segEl.innerHTML = '<button type="button" data-t="tribe"' + (corpsTab === 'tribe' ? ' class="on"' : '') + '>부족</button>' +
        (gOpen ? '<button type="button" data-t="guard"' + (corpsTab === 'guard' ? ' class="on"' : '') + '>친위대 <small>최대 ' + P.GUARD_MAX + '명</small></button>'
          : '<button type="button" class="lockbtn" data-toast="' + esc('🔒 친위대: ' + condText('guard')) + '">🔒 친위대 <small>잠김 · ' + esc(condText('guard')) + '</small></button>');
      if (corpsTab === 'tribe') {
        if (!corpsSel.tribe && T.length) corpsSel.tribe = T[0].id;
        gridEl.innerHTML = T.map(tribeCardHtml).join('');
        var t = tribeById(corpsSel.tribe);
        detEl.innerHTML = t ? tribeDetailHtml(t) : '';
      } else {
        var gs = P.guards(), h = '';
        if (!corpsSel.guard || !gs.some(function (g) { return g.id === corpsSel.guard; })) corpsSel.guard = gs[0] ? gs[0].id : null;
        for (var i = 0; i < P.GUARD_MAX; i++) h += guardCardHtml(gs[i], i);
        gridEl.innerHTML = h;
        var g = gs.filter(function (x) { return x.id === corpsSel.guard; })[0];
        detEl.innerHTML = g ? guardDetailHtml(g) : '<div class="small-text dim">친위대는 납품할 때 부대 대장 중에서 골라요. 이름 있는 몬스터라서 레벨을 지닌 채 다음 현장에도 같이 가요.</div>';
      }
    }
    segEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-t]') : null;
      if (b) { corpsTab = b.getAttribute('data-t'); buzz('tap'); draw(); }
    });
    gridEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-pick]') : null;
      if (!b) return;
      corpsSel[corpsTab === 'guard' ? 'guard' : 'tribe'] = b.getAttribute('data-pick');
      buzz('tap'); draw();
    });
    detEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-uptribe]') : null;
      if (!b) return;
      var tn = b.getAttribute('data-uptribe'), inf = P.tribeInfo(tn);
      if (!inf || !inf.canAfford) { toast((inf && inf.why) || '지금은 할 수 없어요'); buzz('warn'); return; }
      var r = P.upgradeTribe(tn);
      toast(r && r.msg ? r.msg : '완료');
      if (r && r.ok) { buzz('good'); stageToast(r.stages); } else buzz('warn');
      draw(); hudRefresh(hudNode);
      if (r && r.ok) flashUp(detEl.querySelector('.grow-box'));
    });
    var hudNode = el.firstChild;
    el.appendChild(segEl); el.appendChild(gridEl); el.appendChild(detEl); draw();
  };


  SCREENS.settings = function (el) {
    el.appendChild(head('설정', lastTab));
    var box = div('card');
    var defs = [['sound', '소리'], ['vibe', '진동'], ['reduce', '움직임 줄이기']];
    function drawToggles() {
      box.innerHTML = defs.map(function (d) {
        return '<div class="toggle"><span>' + d[1] + '</span><button class="sw' + (S[d[0]] ? ' on' : '') + '" data-sw="' + d[0] + '" aria-label="' + d[1] + '"></button></div>';
      }).join('');
    }
    box.addEventListener('click', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-sw');
      if (!k) return;
      S[k] = !S[k]; saveSettings();
      if (k === 'reduce') applyReduce();
      drawToggles();
      buzz('tap');
    });
    drawToggles();
    el.appendChild(box);

    var hold = document.createElement('button');
    hold.className = 'btn hold';
    hold.innerHTML = '<div class="fill"></div><span>처음부터 (길게 누르세요)</span>';
    hold.querySelector('.fill').style.transitionDuration = MOTION.hold.charge + 'ms';
    var holdTimer = null;
    function stopHold() { clearTimeout(holdTimer); hold.classList.remove('charging'); }
    hold.addEventListener('pointerdown', function () {
      hold.classList.add('charging');
      holdTimer = setTimeout(function () {
        stopHold(); buzz('warn');
        P.reset();
        tut.local = {}; tut.off = false; tutEnd(false); // 튜토리얼도 처음부터
        toast('처음부터 다시 시작해요');
        go('company', true);
      }, MOTION.hold.charge);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { hold.addEventListener(ev, stopHold); });
    el.appendChild(hold);
    el.appendChild(div('dim small-text', '되돌릴 수 없는 일은 길게 눌러야 동작합니다. 회사 금·신석·부대·친위대·의뢰가 모두 처음으로 돌아갑니다.'));
    el.appendChild(div('mt-auto dim small-text', '버전: D1 첫 데모 (UI 개편: 3탭·현장 4상태, 임시 숫자)'));
  };

  // 건설 상태는 build.js (구역 판). SCREEN_PLUGINS.build 가 아래에서 SCREENS.build 로 등록된다.

  // 납품 직후 정산 (회사 쪽 화면, 탭 막대 없음): 정산(보수·회사 금·회사 레벨·작품 등록) -> 남는 것/인계되는 것 -> 친위대로 데려갈 부대 고르기 -> 새 의뢰 후보 (+ 아직 못 받는 의뢰).
  // 납품은 현장 5/5 보스 결과의 [납품]으로 이미 끝났다(deliverNow). 데모 의뢰를 다 납품하면 새 의뢰 대신 [정산 마치기] -> 데모 끝 (회사 탭).
  function listHtml(arr) {
    return arr.length ? '<ul class="plain">' + arr.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '<div class="dim small-text">없음</div>';
  }
  function coText(c) { return 'Lv ' + c.lv + ' (' + c.exp + '/' + c.need + ')'; }
  function questCard(q, pick) {
    var h = '<div class="qhead"><span class="chip accent">' + questTag(q) + '</span><h3>' + esc(q.name) + '</h3></div>';
    if (q.client) h += '<div class="qclient">' + (q.client.kind ? '<span class="chip">' + esc(q.client.kind) + '</span> ' : '') + '<b>' + esc(q.client.name || '') + '</b></div>';
    h += siteHtml(q) + fixedHtml(q);
    if (q.attr) h += '<div class="qattr"><div class="qattr-h"><span class="chip">던전 속성</span> <b>' + esc(q.attr.label || '') + '</b></div>' +
      (q.attr.effect ? '<div class="small-text">' + esc(q.attr.effect) + '</div>' : '') +
      (q.attr.counter ? '<div class="small-text qcounter">내 대응: ' + esc(q.attr.counter) + '</div>' : '') + '</div>';
    h += '<div class="poplabel qlabel">보스 검증 5단계 (보스 5명을 차례로 막기)</div>' + stagesHtml(q, null) +
      '<div class="money"><div>🟣 마석<b>' + money(q.budget) + '</b></div><div>보수<b>회사 금 ' + money(q.reward.gold) + '</b></div></div>' +
      '<div class="small-text dim">보수: ' + rewardText(q.reward) + '</div>' +
      '<div class="qpick">이 의뢰 받기 ▶</div>';
    var c = div('card contract pickable', h);
    c.setAttribute('role', 'button'); c.setAttribute('tabindex', '0');
    function act() { pick(q); }
    c.addEventListener('click', act);
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    return c;
  }
  function deliverScreen(el) {
    var r = RUN.phase === 'settle' ? RUN.report : null;
    var ids = [];   // 친위대로 데려갈 현장 부대 id
    var demoEnd = !!(r && P.demoState().canLeave);   // 데모 의뢰를 다 납품함: 새 의뢰 대신 [정산 마치기] -> 데모 끝 화면
    el.appendChild(head('납품 정산'));
    if (!r) { el.appendChild(div('card dim', '정산할 내용이 없어요')); el.appendChild(div('', '<button class="btn primary" data-go="company">회사로</button>')); return; }

    el.appendChild(div('stamp', '납품 완료'));
    el.appendChild(div('dim small-text', r.quest.name + ' · 보스 검증 ' + r.stage + '/' + (r.quest.stages ? r.quest.stages.length : 5) + ' · 건설 ' + r.builds + '회'));
    var work = r.work;
    el.appendChild(div('card payout',
      '<h3>정산</h3>' +
      '<div class="stat"><span>의뢰 보수</span><b>회사 금 +' + money(r.gold) + (r.gems ? ' · 신석 +' + r.gems : '') + '</b></div>' +
      '<div class="stat"><span>회사 금</span><b>' + money(r.goldBefore) + ' → ' + money(RUN.gold) + '</b></div>' +
      (r.gems ? '<div class="stat"><span>신석</span><b>' + r.gemsBefore + ' → ' + RUN.gems + '</b></div>' : '') +
      '<div class="stat"><span>회사 경험치</span><b>+' + r.companyExp + '</b></div>' +
      '<div class="stat total"><span>회사 레벨</span><b>' + coText(r.companyBefore) + ' → ' + coText(r.companyAfter) + '</b></div>' +
      (work ? '<div class="stat"><span>작품집 등록</span><b>No.' + work.no + ' ' + esc(work.name) + '</b></div>' : '') +
      (r.worksEffectNew ? '<div class="worksnew"><b>작품집 효과 해금!</b> ' + esc(P.worksInfo().effect.label) + ': ' + esc(P.worksInfo().effect.text) + '</div>' : '')));

    el.appendChild(div('cl',
      '<div class="card carry"><h3>남는 것</h3>' + listHtml(r.carry || []) + '</div>' +
      '<div class="card lost"><h3>인계되는 것</h3>' + listHtml(r.lost || []) + '</div>'));

    // 친위대로 데려갈 부대: 그 부대의 대장이 이름 있는 친위대가 되어 레벨을 이어받는다 (데모 끝이면 다음 현장이 없어 고르지 않음)
    var gbox = div('card');
    if (!demoEnd) el.appendChild(gbox);
    var slots = Math.max(0, P.GUARD_MAX - RUN.guards.length);
    var drawGuards = function () {
      gbox.innerHTML = '<h3>친위대 고르기 (' + ids.length + '/' + slots + ')</h3>' +
        '<div class="dim small-text" style="margin-bottom:6px">부대 하나를 고르면 그 대장이 이름 있는 친위대가 되어 레벨을 지닌 채 다음 현장에 같이 가요. 나머지 부대는 의뢰인에게 넘어가요. 안 골라도 돼요. (지금 친위대 ' + RUN.guards.length + '/' + P.GUARD_MAX + ')</div><div class="guards"></div>';
      var gl = gbox.querySelector('.guards');
      if (!r.handover.length) gl.outerHTML = '<div class="dim small-text">고를 부대가 없어요</div>';
      else if (!slots) gl.outerHTML = '<div class="dim small-text">친위대 자리가 가득 찼어요</div>';
      else r.handover.forEach(function (m) {
        var on = ids.indexOf(m.id) >= 0, t = tribeById(m.tribe);
        var b = document.createElement('button');
        b.className = 'gbtn' + (on ? ' on' : '');
        b.setAttribute('data-gid', m.id);
        b.innerHTML = '<b>' + esc(m.tribeName) + ' 부대</b><span>' + m.count + '명 · Lv ' + m.lv + '</span><span class="gn">→ ' + esc(t ? t.guardName : '대장') + '</span>';
        b.addEventListener('click', function () {
          var i = ids.indexOf(m.id);
          if (i >= 0) ids.splice(i, 1);
          else if (ids.length >= slots) { toast('친위대는 ' + P.GUARD_MAX + '명까지예요'); buzz('warn'); return; }
          else ids.push(m.id);
          buzz('tap'); drawGuards();
        });
        gl.appendChild(b);
      });
    };
    drawGuards();

    var list = P.offerQuests(), lk = P.lockedQuest();
    if (!demoEnd) el.appendChild(div('qtitle', '<h3>' + (list.length ? '새 의뢰를 고르세요' : '새 의뢰') + '</h3><div class="dim small-text">' +
      (list.length ? '카드를 누르면 바로 시작해요. 한 장만 고르고, 기한은 없어요.' : '지금 받을 수 있는 의뢰가 없어요.') + '</div>'));
    var picked = false;
    list.forEach(function (q) {
      el.appendChild(questCard(q, function (qq) {
        if (picked) return;
        picked = true;
        if (P.pickQuest(qq, ids.slice())) { buzz('good'); toast('새 부지에서 시작: ' + qq.name); go('field', true); }
        else picked = false;
      }));
    });
    if (lk) el.appendChild(div('card lockq', '<div class="qhead"><span class="chip">' + lk.floors + '층 의뢰</span><h3>🔒 ' + esc(lk.name) + '</h3></div>' +
      '<div class="small-text dim">회사 레벨 ' + lk.minCompanyLv + '부터 받을 수 있어요 (지금 Lv ' + P.company().lv + ')</div>'));
    if (demoEnd) {
      el.appendChild(div('card', '<h3>준비한 의뢰를 모두 납품했어요</h3><div class="small-text dim">데모에 준비한 의뢰는 여기까지예요. 정산을 마치면 마지막 화면이 나와요.</div>'));
      var fin = div('', '<button class="btn primary big" data-finish>정산 마치기 ▶</button>');
      fin.querySelector('button').addEventListener('click', function () {
        var lr = P.leaveSettle();
        if (!lr.ok) { toast(lr.msg); buzz('warn'); return; }
        tutEnd(false); toastsEl.innerHTML = ''; buzz('best'); go('company', true);
      });
      el.appendChild(fin);
    }
    buzz('stamp');
  }

  // ---------- 데모 끝 (phase 'demoEnd'): 회사 탭 맨 위에 "데모는 여기까지" ----------
  // 다음 현장 예고(🔒 지하 3층 그림) · 지금까지의 기록 · [처음부터 다시] = P.reset(). 작품집과 군단 탭은 그대로 볼 수 있다.
  function demoEndScreen(el) {
    var ds = P.demoState(), co = P.company();
    el.appendChild(div('card demoend', '<h3>데모는 여기까지예요</h3><div class="small-text">' + esc(String(ds.msg || '').replace('데모는 여기까지예요.', '').trim() || '플레이해 주셔서 고마워요!') + '</div>' +
      '<div class="stat"><span>납품한 던전</span><b>' + RUN.works.length + '곳</b></div><div class="stat"><span>회사 레벨</span><b>Lv ' + co.lv + '</b></div>' +
      '<div class="stat"><span>군단 친위대</span><b>' + RUN.guards.length + '/' + P.GUARD_MAX + '명</b></div>'));
    // 납품한 층: 끝낸 의뢰들 중 가장 깊은 층까지 (지금 데모는 1층 의뢰만 열려 있어 1층). 그 아래 한 층은 🔒 준비 중
    var BDm = window.BATTLE_DATA, deep = 1, doneFloors = '';
    ((BDm && BDm.QUESTS) || []).forEach(function (d) { if (RUN.doneQuests.indexOf(d.key) >= 0) deep = Math.max(deep, d.floors | 0); });
    for (var fl = 1; fl <= deep; fl++) doneFloors += '<div class="floor f' + Math.min(fl, 2) + ' done"><div class="fhead"><b>지하 ' + fl + '층</b><span>✓ 납품 완료</span></div></div>';
    el.appendChild(div('shaft demoshaft',
      '<div class="surface"><span>다음 현장 예고</span><small>더 깊은 의뢰가 기다려요</small></div>' + doneFloors +
      '<div class="floor f3 gate lockedfloor"><div class="flocktxt"><span class="nm">🔒 지하 ' + (deep + 1) + '층</span><small>' + esc(lineOf('soon', '지하 3층', '준비 중')) + '</small></div></div>'));
    el.appendChild(div('dim small-text', '이 다음은 새 현장이 차례로 열려요. 아래 작품집과 군단 탭은 그대로 둘러볼 수 있어요.'));
    var rs = div('', '<button class="btn primary big" data-restart>처음부터 다시</button>');
    rs.querySelector('button').addEventListener('click', function () {
      P.reset(); tut.local = {}; tut.off = false; tutEnd(false); toast('처음부터 다시 시작해요'); buzz('good'); goFresh('company');
    });
    el.appendChild(rs);
  }
  SCREENS.result = deliverScreen;

  // ---------- 튜토리얼: 은발 마왕 말풍선 (대사는 lines.js, 단계 기록은 progress.js 계약 함수) ----------
  // 계약: P.tutorial() -> { on, seen } · P.tutorialSeen(id) (본 단계로 기록) · P.skipTutorial() · P.tutorialPath() (구역 id 배열 또는 null).
  // 하나라도 없거나 오류면 튜토리얼을 아예 안 띄운다. 말풍선(#tut)은 화면 위에 겹쳐 뜬다 (아래 화면 배치는 안 움직임). 아래 자리(탭 막대 바로 위)가 기본, 반짝이는 대상(.tut-hl)을 가리면 위 자리로 옮긴다 (tutPlace).
  // 단계 하나 = LINES.tutorial 에서 id 가 같은 줄들. 탭하면 다음 줄, 마지막 줄에서 탭하면 닫히고 "본 단계"로 기록.
  // 강조 = 목표 요소에 .tut-hl (shell.css). 목표를 누르거나 다른 화면으로 가면 그 단계는 끝난 것으로 기록.
  var tutEl = document.getElementById('tut');
  var tut = { cur: null, local: {}, off: false };
  function tutLines(id) {
    var L = window.LINES, a = L && Array.isArray(L.tutorial) ? L.tutorial : [];
    return a.filter(function (l) { return l && l.id === id && typeof l.text === 'string' && l.text.trim(); });
  }
  function tutOn() {
    if (flowOn()) return false;   // 흐름 시험 동안 튜토리얼 끔 (새 흐름과 안 맞는 말풍선)
    if (tut.off || typeof P.tutorial !== 'function' || typeof P.tutorialSeen !== 'function' || typeof P.skipTutorial !== 'function') return false;
    try { var t = P.tutorial(); return !!(t && t.on); } catch (e) { return false; }
  }
  function tutSeenIn(id) { // progress.js 기록에 있는가 (seen 은 id 배열이거나 { id: true } 표)
    try {
      var sn = P.tutorial().seen;
      return Array.isArray(sn) ? sn.indexOf(id) >= 0 : !!(sn && sn[id]);
    } catch (e) { return false; }
  }
  function tutSeenNow(id) { return !!tut.local[id] || tutSeenIn(id); }
  function tutMark(id) {
    try { P.tutorialSeen(id); } catch (e) { /* 무시 */ }
    if (!tutSeenIn(id)) tut.local[id] = true; // 기록이 안 남는 경우에도 이번에 켜 둔 동안은 다시 안 띄움
  }
  function tutClearHl() {
    if (tut.cur && tut.cur.nodes) tut.cur.nodes.forEach(function (n) { n.classList.remove('tut-hl'); });
  }
  function tutApply() { // 목표 요소 강조 (화면에 이미 붙어 있는 것만)
    var c = tut.cur;
    if (!c || !c.target) return;
    tutClearHl();
    c.nodes = Array.prototype.slice.call(document.querySelectorAll(c.target));
    c.nodes.forEach(function (n) { n.classList.add('tut-hl'); });
    tutPlace(); tutPlaceSoon();   // 대상이 막 붙은 화면이면 한 프레임 뒤에 다시 (자리 잡힌 뒤 크기로)
  }
  function tutDraw() {
    var c = tut.cur;
    if (!c) { tutEl.hidden = true; tutEl.innerHTML = ''; tutEl.classList.remove('top'); document.body.style.setProperty('--tut-h', '0px'); document.body.style.setProperty('--tut-top', '0px'); return; }
    var l = c.lines[c.i], last = c.i >= c.lines.length - 1;
    if (tutEl.hidden || !tutEl.firstChild) {
      tutEl.innerHTML = '<div class="tut-face" aria-hidden="true"><b>마왕</b>도트<br>48×48</div>' +
        '<div class="tut-bubble"><div class="tut-top"><small class="tut-who"></small><button class="tut-skip" type="button">건너뛰기</button></div>' +
        '<div class="tut-text"></div>' +
        '<div class="tut-foot"><span class="tut-count"></span><button class="tut-next" type="button"></button></div></div>';
      tutEl.hidden = false;
    }
    tutEl.querySelector('.tut-who').textContent = (typeof l.who === 'string' && l.who) ? l.who : '은발 마왕';
    tutEl.querySelector('.tut-text').textContent = l.text; // 글자 그대로 (줄바꿈은 CSS pre-line)
    tutEl.querySelector('.tut-count').textContent = c.lines.length > 1 ? (c.i + 1) + '/' + c.lines.length : '';
    tutEl.querySelector('.tut-next').textContent = last ? '닫기' : '다음 ▶';
    tutPlace();
  }
  // 말풍선 자리 정하기: 아래(탭 막대 바로 위)가 기본. 반짝이는 대상(.tut-hl)을 가리면 위로 (덜 가리는 쪽). 화면 배치는 건드리지 않는다 (겹쳐 뜰 뿐).
  // 카드 전용 화면(.bt-ov) 안의 대상은 따지지 않는다 (그 화면이 말풍선 자리를 따로 비워 둠). --tut-h = 아래 자리일 때 말풍선 높이 (토스트가 그 위로 비켜 섬)
  function tutPlace() {
    if (tutEl.hidden) { document.body.style.setProperty('--tut-h', '0px'); document.body.style.setProperty('--tut-top', '0px'); return; }
    var app = document.getElementById('app'), ar = app.getBoundingClientRect(), h = tutEl.offsetHeight, gap = 8;
    var tabsH = tabsEl.hidden ? 0 : tabsEl.offsetHeight;
    var nodes = Array.prototype.slice.call(document.querySelectorAll('.tut-hl')).filter(function (n) { return !(n.closest && n.closest('.bt-ov')); });
    function covered(top) {   // 말풍선을 그 자리에 두면 가려지는 대상 면적 합
      var y0 = top ? ar.top + gap : ar.bottom - tabsH - gap - h, y1 = y0 + h, x0 = ar.left + gap, x1 = ar.right - gap, sum = 0;
      nodes.forEach(function (n) {
        var r = n.getBoundingClientRect(), w = Math.min(r.right, x1) - Math.max(r.left, x0), t = Math.min(r.bottom, y1) - Math.max(r.top, y0);
        if (w > 0 && t > 0) sum += w * t;
      });
      return sum;
    }
    var top = tutEl.classList.contains('top'), here = covered(top), other = covered(!top);
    if (here > 0 && other < here) top = !top;
    if (tutEl.classList.contains('top') !== top) tutEl.classList.toggle('top', top);
    document.body.style.setProperty('--tut-h', top ? '0px' : (h + gap) + 'px');
    document.body.style.setProperty('--tut-top', top ? (h + gap) + 'px' : '0px');
  }
  var tutPlaceRaf = 0;
  function tutPlaceSoon() { if (tutPlaceRaf || tutEl.hidden) return; tutPlaceRaf = requestAnimationFrame(function () { tutPlaceRaf = 0; tutPlace(); }); }
  window.addEventListener('resize', tutPlaceSoon);
  document.addEventListener('scroll', tutPlaceSoon, true);   // 판을 스크롤해 대상이 말풍선 밑으로 들어가면 자리를 바꿈
  function tutEnd(mark) {
    var c = tut.cur;
    if (!c) return;
    tutClearHl();
    tut.cur = null;
    if (mark) tutMark(c.id);
    tutDraw();
  }
  // 단계 보이기. opts.target = 강조할 요소 선택자, opts.keep = true 면 목표를 눌러도 끝나지 않음. 보였으면 true
  function tutStart(id, opts) {
    opts = opts || {};
    if (!tutOn() || tutSeenNow(id)) return false;
    if (tut.cur && tut.cur.id === id) { tutApply(); return true; }
    var lines = tutLines(id);
    if (!lines.length) return false;
    if (tut.cur) tutEnd(true); // 앞 단계가 남아 있으면 본 것으로 치고 새 단계로
    opts = opts || {};
    tut.cur = { id: id, lines: lines, i: 0, target: opts.target || null, keep: !!opts.keep, nodes: [], screen: lastName };
    tutDraw(); tutApply();
    return true;
  }
  function tutActive(id) { return !!(tut.cur && tut.cur.id === id); }
  function tutNext() {
    var c = tut.cur;
    if (!c) return;
    buzz('tap');
    if (c.i >= c.lines.length - 1) tutEnd(true);
    else { c.i++; tutDraw(); }
  }
  tutEl.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.tut-skip')) {
      try { P.skipTutorial(); } catch (err) { /* 무시 */ }
      tut.off = true; tutEnd(false); buzz('tap');
      if (lastName === 'contract') render(); // 튜토리얼 의뢰 후보가 버려졌으니 일반 후보로 다시 그림
      return;
    }
    if (e.target.closest && e.target.closest('.tut-bubble')) tutNext();
  });
  // 강조한 목표를 누르면 그 단계는 끝 (누른 동작은 그대로 진행)
  document.addEventListener('click', function (e) {
    var c = tut.cur;
    if (!c || c.keep || !c.nodes.length || !e.target.closest || e.target.closest('#tut')) return;
    if (c.nodes.some(function (n) { return n.contains(e.target); })) tutEnd(true);
  }, true);
  // 화면이 바뀔 때 (render 가 부름): 다른 화면으로 갔으면 끝난 것으로 기록, 같은 화면을 다시 그리는 거면 그냥 접어 두고 다시 시작
  function tutLeave(name) { if (tut.cur) tutEnd(tut.cur.screen !== name); }

  // shell.js 가 직접 그리는 화면의 단계 (건설·현장 화면은 build.js·battle.js 가 api.tutStart 로). 흐름 시험 동안은 tutOn 이 거짓이라 아무것도 안 뜬다.
  function tutCheck(name) {
    if (!tutOn()) return;
    if (name === 'company' && RUN.phase === 'choose') tutStart('welcome', { target: '#view .card.contract' });
    else if (name === 'result' && RUN.phase === 'settle') tutStart('deliver', { target: '#view .payout' });
    else if (RUN.phase === 'play' && RUN.quest) {
      // 한 번에 하나만 반짝: 회사 -> 현장 탭 -> [건설] -> (건설: 추천 칸 + 대기실 끌기 -> 확정) -> 회사 -> [현장으로] -> [보스 도전]
      var done = P.checkQuest() || (P.questProgress() && P.questProgress().complete);
      if (name === 'company') {
        if (done) tutStart('complete', { target: '#view [data-go="field"]' });
        else if (RUN.site.builds === 0) tutStart('tofield', { target: '#tabs [data-go="field"]' });
        else tutStart('nextweek', { target: '#view [data-go="field"]' });
      } else if (name === 'field') {
        if (done || RUN.site.builds > 0) tutStart('tohome', { target: '#tabs [data-go="company"]' });
        else tutStart('build', { target: '#view [data-fbuild]' });
      }
    }
    tutApply();
  }
  // 건설 화면 강조 구역: P.tutorialPath() 중 입구(E)·보물방(B)은 빼고 지을 수 있는 방 전부 (처음 판 = 보물방 바로 앞 방들. 침입자는 이 중 한 곳을 꼭 지남). 'zones' 단계가 떠 있을 때만
  function tutZones() {
    if (!tutActive('zones') || typeof P.tutorialPath !== 'function') return [];
    try {
      var p = P.tutorialPath();
      p = Array.isArray(p) ? p.filter(function (z) { return z !== 'E' && z !== 'B'; }) : [];
      return p.slice(0, 4);
    } catch (e) { return []; }
  }

  // ---------- 화면 플러그인 (화면을 별도 파일로 뺄 때: battle.js = 현장 운영·보스·결과, build.js = 건설) ----------
  // 별도 파일은 SCREEN_PLUGINS.이름 = function (api) { return function (el) {...}; } 로 등록한다.
  // api.onLeave(fn): 다른 화면으로 나갈 때 한 번 불러 준다 (타이머·루프 정리용).
  var leaveHooks = [];
  var guardFn = null;   // 건설 상태가 미확정 배치를 지키려고 등록: function (dest, proceed) -> 막았으면 true
  var API = {
    toast: toast, buzz: buzz, fxRandom: fxRandom, div: div, go: go, onLeave: function (fn) { leaveHooks.push(fn); },
    head: head, questTag: questTag, stageToast: stageToast, fixedHtml: fixedHtml, stagesHtml: stagesHtml,
    shaftHtml: shaftHtml, bindShaft: bindShaft,
    // 공통 상단 바 · 탭 이동 막기(보스 도전 중) · 미확정 지킴이(건설)
    hud: hud, hudRefresh: hudRefresh, bossLocked: bossLocked, setGuard: function (fn) { guardFn = fn; },
    // 출진 창·강화 창이 쓰는 글 도우미
    uname: uname, statLine: statLine, zoneName: zoneName, fmtN: fmtN, money: money, flashUp: flashUp,
    unitName: function (id) { var u = P.unitById(id); return u ? uname(u) : ''; },
    // 튜토리얼 (build.js·battle.js): 단계 보이기 · 끝내기(본 것으로 기록) · 떠 있나 · 건설 화면 강조 구역
    tutPlace: tutPlace, tutStart: tutStart, tutDone: function (id) { if (tutActive(id)) tutEnd(true); }, tutActive: tutActive, tutZones: tutZones,
    // 결과 반영(한 번만, 결과표 내용을 돌려줌)
    finishBattle: function (result) { return P.applyBattle(result); },
    rerender: function () { render(); }   // 같은 화면을 새로 그림 (다음 일반 판·보스 도전·결과로)
  };
  var plugins = window.SCREEN_PLUGINS || {};
  Object.keys(plugins).forEach(function (k) { SCREENS[k] = plugins[k](API); });

  // ---------- 화면 바꾸기 ----------
  // 화면 지킴이: 상태에 맞지 않는 화면이면 맞는 화면으로 바꾼다 (주소 기록은 덮어씀)
  function guardScreen(name) {
    var to = ALIAS[name] || name;
    if (!SCREENS[to]) to = 'company';
    if (RUN.phase === 'settle') to = 'result';                         // 납품 직후엔 정산부터
    else if (bossLocked()) to = 'field';                               // 보스 도전 중엔 탭 이동 막음 (끝나면 결과로 자동 전환)
    else if (to === 'result') to = 'company';
    else if (RUN.phase === 'demoEnd' && (to === 'field' || to === 'build')) to = 'company';   // 데모 끝: 회사 탭에 "데모는 여기까지" 화면
    else if (RUN.phase === 'choose' && to === 'build') to = 'field';   // 의뢰 없이 건설 불가 (현장은 회사 게시판 안내만)
    else if (to === 'corps' && !corpsOpen()) to = 'field';             // 군단은 첫 전투 정산 뒤에 열림
    else if (to === 'gallery' && !deliveredOnce()) to = 'company';     // 작품집은 첫 납품 뒤에 열림
    if (to !== name) history.replaceState(null, '', '#' + to);
    return to;
  }
  var lastName = '';
  var lastTab = 'company';   // 설정 등에서 뒤로 갈 곳 (마지막으로 본 탭 화면)
  var corpsWas = null;     // 군단 탭이 방금 열렸는지 알아채는 용 (열리면 토스트 한 번)

  function render() {
    leaveHooks.splice(0).forEach(function (fn) { fn(); });
    guardFn = null;
    var name = guardScreen((location.hash || '#company').slice(1));   // 켜면 회사부터
    tutLeave(name);
    var keep = name === lastName && !animateNext ? view.scrollTop : 0; // 같은 화면을 다시 그릴 땐 스크롤 유지
    lastName = name;
    if (TAB_IDS.indexOf(name) >= 0 && name !== 'build') lastTab = name;
    P.setBattle(false); // 흐름 시험: 일반 판 중에도 배치를 바꿀 수 있다 (보스 중만 progress.js 가 막음)
    document.body.setAttribute('data-screen', name);
    drawTabs(name);
    var el = div('screen');
    SCREENS[name](el);
    if (animateNext) el.classList.add('enter');
    animateNext = false;
    view.innerHTML = '';
    view.appendChild(el);
    view.scrollTop = keep;
    tutCheck(name);
  }
  // 같은 화면이면 해시가 안 바뀌어 hashchange 가 없으니 직접 다시 그린다 (처음부터 다시 등)
  function goFresh(hash) { if ((location.hash || '#company') === '#' + hash) render(); else go(hash, true); }

  // 하단 막대: 탭 화면(회사·현장·건설 상태·군단)에서 3개 탭. 지금 보는 탭만 윗줄 표시(건설 = 현장).
  //  군단 = 첫 전투 정산 전 `잠김 · 첫 전투 후 열림`. 보스 도전 중에는 탭이 보이되 이동이 막히고 `보스전 종료 후`를 적는다.
  function tabState(t) { return t.state === 'gate' ? (corpsOpen() ? 'open' : 'lock') : t.state; }
  function drawTabs(name) {
    tabsEl.className = '';
    var now = corpsOpen();
    if (corpsWas === false && now) toast('군단이 열렸어요!');
    corpsWas = now;
    tabsEl.hidden = TAB_IDS.indexOf(name) < 0;
    var shown = name === 'build' ? 'field' : name, lock = bossLocked();
    tabsEl.classList.toggle('bosslock', lock);
    tabsEl.innerHTML = TABS.map(function (t) {
      var st = tabState(t), on = st === 'open' && t.id === shown;
      if (st === 'lock') return '<button class="lock" type="button" data-toast="' + esc('🔒 ' + t.label + ': ' + condText(t.id)) + '"><span class="nm">🔒 ' + t.label + '</span><small>잠김 · ' + condText(t.id) + '</small></button>';
      if (lock && !on) return '<button class="open locked" type="button" data-toast="보스전이 끝나면 이동할 수 있어요"><span class="nm">' + t.label + '</span><small>보스전 종료 후 이동</small></button>';
      return '<button class="open' + (on ? ' on' : '') + '" type="button" data-go="' + t.id + '"><span class="nm">' + t.label + '</span></button>';
    }).join('');
  }

  // 눌림은 한 곳에서 받는다: data-go(앞으로, 애니메이션) · data-back(즉시) · data-toast · data-deliver(납품)
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-go],[data-back],[data-toast],[data-deliver]') : null;
    if (!t) return;
    if (t.hasAttribute('data-toast')) { toast(t.getAttribute('data-toast')); buzz('tap'); return; }
    if (t.hasAttribute('data-deliver')) { deliverNow(); return; }
    var dest = t.hasAttribute('data-back') ? t.getAttribute('data-back') : t.getAttribute('data-go'), anim = !t.hasAttribute('data-back');
    if (guardFn && guardFn(dest, function () { buzz('tap'); go(dest, anim); })) return;   // 건설 미확정: 확정·취소를 먼저 물음
    buzz('tap');
    go(dest, anim);
  });
  window.addEventListener('hashchange', render);

  // 방치 시간은 마지막으로 저장한 때(RUN.lastSeen)부터 재므로, 화면을 켜 둔 동안은 1분마다 저장하고 가리거나 닫을 때도 저장한다.
  // 전투 중에도 저장한다: P.save()는 RUN을 그대로 쓸 뿐이라 전투 저장 지점(RUN.bsave)은 안 바뀐다 (bsave는 saveBattle 로만 갱신).
  function keepSeen() { if (typeof P.save === 'function') { try { P.save(); } catch (e) { /* 저장이 막힌 환경: 무시 */ } } }
  setInterval(function () { if (!document.hidden) keepSeen(); }, 60000);
  document.addEventListener('visibilitychange', function () { if (document.hidden) keepSeen(); });
  window.addEventListener('pagehide', keepSeen);

  applyReduce();
  render();
  // 옛 v6 저장을 새 판으로 바꿨으면 첫 화면에서 한 번 알린다 (P.takeNotice 는 읽으면 지움)
  try { var notice = P.takeNotice(); if (notice) toast(notice); } catch (e) { /* 안내가 없는 환경: 무시 */ }
})();
