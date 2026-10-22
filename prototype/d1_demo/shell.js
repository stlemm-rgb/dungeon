/* D1 첫 데모 화면 (순수 JS, 임시 숫자·임시 문구). 하단 탭 5개 구조 + 새 로직(progress.js, API.md) 연결 (2차)
 *
 * 화면 목록과 이동 규칙
 *  - 한 페이지 안에서 주소 끝의 해시(#field 등)로 화면을 바꾼다. 브라우저 뒤로 가기 = 이전 화면
 *    (나중에 안드로이드 뒤로 버튼과 연결). 예전 이름 #home = 현장, #units = 군단은 그대로 받아서 옮겨 준다 (build.js가 'home'으로 돌아옴).
 *  - 하단 탭 5개 (GAME_STRUCTURE 1절): 회사 · 군단 · 현장(가운데) · 마계 · 내 집. 모두 같은 모양(특정 탭 강조 없음, 지금 보는 탭만 윗줄 표시).
 *    데모에서 열린 탭 = 회사 · 현장 · 군단(첫 전투 뒤 열림, 그 전엔 🔒 + 조건). 마계·내 집은 이름에 가로 취소선, 누르면 "준비 중" 토스트.
 *    탭 막대가 보이는 화면: company · corps · field. 전투 화면은 같은 막대 자리에 배속 · 전투 시작 · 안내가 들어간다 (battle.js).
 *  - 보이는 방식 (GAME_STRUCTURE 2절): 데모에 없는 입구 = 취소선 + 준비 중(.entry.soon), 플레이하면 열리는 입구 = 🔒 + 열림 조건(.entry.lock). 두 가지를 섞지 않는다.
 *  - 탭 안 입구: 회사 = 의뢰 게시판(board) · 작품집(gallery) · 비서실·응접실·소장실·직원실 / 군단 = 부족 · 친위대 · 훈련 · 대장간 · 몬스터 숙소 /
 *    현장 = 건설(build) · 출진 · 포로 수용소 + 지하 층 단면 / 설정(settings, 위 톱니) · 메뉴(도감·업적) · 상점(위 버튼)
 *  - 현장 맨 위 [다음 주] 버튼 (언제든 PROGRESS.startBattle) 바로 아래에 의뢰 진행표 고정 (납품 기준 n/5 · 가치 · 전투력). 의뢰 완료면 [납품하기]가 그 자리에 뜬다 (자동 납품 없음).
 *  - 진행 화면 (탭 막대 숨김): contract(첫 의뢰) -> field -> build / battle -> (의뢰 완료 뒤 [납품하기]) result(납품·정산·친위대·새 의뢰 후보 한 화면) -> field
 *    contract와 result는 같은 함수(deliverScreen). 첫 시작(report 없음)에는 정산·친위대 없이 후보만 보인다.
 *  - "다음 주"를 누르면 이번 주 전투가 시작되고(PROGRESS.startBattle) 결과를 반영할 때까지 전투 화면에서 못 나간다.
 *  - 진행 상태와 규칙은 progress.js (window.PROGRESS). 이 파일은 그 값을 보고 그리기만 하고,
 *    값을 바꾸는 것은 PROGRESS의 정해진 함수(buildZone·startBattle·applyBattle·deliver·pickQuest …)로만 한다.
 *  - 읽는 함수 = API.md 그대로: questProgress(진행표) · company · budgetLeft · unlocks · worksInfo · squads/guards · offerQuests/lockedQuest 등. 자리표시(opt) 코드는 없앴다.
 *  - 화면 지킴이(render 안): 정산 중이면 어느 화면이든 result로, 의뢰가 없으면 contract로, 의뢰가 있으면 contract 못 들어감.
 *  - 건설 화면(구역 판)은 build.js, 전투 화면은 battle.js (SCREEN_PLUGINS). 판 규칙은 zones.js.
 *  - 화면 하나 = 함수 하나: SCREENS.이름 = function (el) { el에 내용을 채운다 }  (나중에 React 화면 하나로 옮기기 쉽게)
 *  - 전환 애니메이션은 앞으로 갈 때만 (var(--dur-sheet) var(--ease-out)). 뒤로/닫기는 즉시.
 *  - 튜토리얼: 은발 마왕 말풍선(#tut, 탭 막대 바로 위). 대사는 lines.js, 단계 기록은 progress.js(P.tutorial 등). 아래 "튜토리얼" 절 참고.
 *  - 용어는 GAME_STRUCTURE 8절: 화면 글에 "퀘스트"를 쓰지 않는다 (의뢰·의뢰 완료·납품 기준·업무). 회사 금(영구) 와 의뢰 예산(현장 전용)은 따로 표시.
 *  - 숫자는 가짜(균형 없음). 상태(RUN)는 progress.js가 localStorage에 자동 저장한다. 설정은 이 파일이 따로 저장.
 */
(function () {
  'use strict';

  // ---------- 연출용 무작위 (게임용 무작위 아님) ----------
  function fxRandom() { return Math.random(); }

  // ---------- 진행 상태 (progress.js) ----------
  var P = window.PROGRESS, RUN = P.RUN;

  // ---------- 하단 탭 5개 (GAME_STRUCTURE 1·2절) ----------
  // state: open = 열림 · gate = 진행하면 열림(🔒 + 조건, 지금 열렸는지는 tabState가 정함) · soon = 데모에 없음(취소선 + 준비 중)
  var TABS = [
    { id: 'company', label: '회사', state: 'open' },
    { id: 'corps',   label: '군단', state: 'gate' },
    { id: 'field',   label: '현장', state: 'open' },
    { id: 'demon',   label: '마계', state: 'soon' },
    { id: 'house',   label: '내 집', state: 'soon' }
  ];
  var TAB_IDS = ['company', 'corps', 'field']; // 탭 막대가 보이는 화면 (마계·내 집은 화면이 없다)
  // 예전 주소 이름 -> 새 화면 (build.js·battle.js가 'home'으로 돌아오기 때문)
  var ALIAS = { home: 'field', dungeon: 'field', units: 'corps', shop: 'company', leaders: 'company', workshop: 'company', records: 'company' };

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
  // 판 미리보기·고정 구역 조각 (build.js 의 ZONEVIEW. 없으면 빈 글)
  function ZV() { return window.ZONEVIEW || {}; }
  function siteHtml(q) { return q && q.board && ZV().siteHtml ? ZV().siteHtml(q.board) : ''; }
  function fixedHtml(q) { return q && ZV().fixedHtml ? ZV().fixedHtml(q) : ''; }
  function showMsgs(msgs) { (msgs || []).slice(0, MOTION.toast.max).forEach(function (m) { toast(m); }); }
  // 새로 오른 납품 기준 단계를 토스트로 (건설·조달·배치·전투 뒤). 층이 열리면 한 줄 더
  function stageToast(stages) {
    var q = RUN.quest;
    (stages || []).forEach(function (n) {
      toast('납품 기준 ' + n + '/' + (q ? q.stages.length : 5) + '단계 달성!');
      var stg = q && q.stages[n - 1];
      if (stg && stg.opens) toast('지하 ' + stg.opens + '층이 열렸어요');
    });
  }
  // 납품: 의뢰 완료(납품 기준 5단계 다 채움) 뒤 현장 진행표의 [납품하기]로만. 자동 납품은 없다.
  function deliverNow() {
    if (!P.checkQuest()) { toast(P.questBlockers()[0] || '아직 납품 기준을 다 채우지 못했어요'); buzz('warn'); return false; }
    var wasTut = tutOn();   // 납품하면 progress.js 가 튜토리얼을 끄므로, 정산 화면의 'deliver' 안내용으로 미리 기억 (core-dev 요청 목록)
    var rep = P.deliver();
    if (!rep) { toast(P.questBlockers()[0] || '지금은 납품할 수 없어요'); buzz('warn'); return false; }
    tut.settleStep = wasTut;
    toastsEl.innerHTML = ''; // 앞선 토스트는 치운다. 납품 알림은 정산 화면 머리의 도장("납품 완료")이 대신
    buzz('best');
    go('result', true);
    return true;
  }

  // 다음 주: 현장 맨 위 버튼. 언제든 누르면 이번 주 전투를 시작한다 (예산 0·건설 0이어도). 안 되면 이유를 토스트로
  function startWeek() {
    var r = P.startBattle();
    if (!r.ok) { showMsgs(r.msgs); buzz('warn'); return; }
    buzz('tap');
    go('battle', true);
  }

  // ---------- 화면들 (함수 하나씩) ----------
  var SCREENS = {};

  // ---------- 위쪽 줄 · 입구 칸 · 열림 조건 ----------
  var LN = window.LINES || {};
  function lineOf(group, key, fb) { var g = LN[group]; return g && typeof g[key] === 'string' && g[key].trim() ? g[key] : fb; }
  function soonText(key) { return lineOf('soon', key, '준비 중'); }
  function condText(key) { return lineOf('lock', key, '조건을 채우면 열려요'); }
  function corpsOpen() { return !!P.unlocks().corps; }      // 군단 탭 = 첫 전투 끝
  function deliveredOnce() { return !!P.unlocks().guards; } // 친위대·작품집 = 첫 납품 끝
  // 직급 칭호: lines.js ranks 12단계 (회사 레벨 구간. 임시로 레벨 3마다 한 단계)
  function rankOf(lv) {
    var r = Array.isArray(LN.ranks) ? LN.ranks : [];
    return r.length ? r[Math.min(r.length - 1, Math.floor((lv - 1) / 3))] : { title: '', desc: '' };
  }

  // 입구 칸 한 개. kind: open(열림, go로 이동) · lock(🔒 + 열림 조건) · soon(취소선 + 준비 중 토스트) · stub(열려 있지만 화면 연결 전, 자리표시)
  function entry(o) {
    var attr = '', nm = o.name, sub = o.sub || '';
    if (o.kind === 'open') attr = o.go ? ' data-go="' + o.go + '"' : '';
    else if (o.kind === 'lock') { nm = '🔒 ' + o.name; sub = o.cond; attr = ' data-toast="' + esc('🔒 ' + o.name + ': ' + o.cond) + '"'; }
    else if (o.kind === 'soon') attr = ' data-toast="' + esc(soonText(o.name)) + '"';
    else attr = ' data-toast="' + esc(o.toast || soonText(o.name)) + '"';
    return '<button class="entry ' + o.kind + (o.on ? ' on' : '') + '"' + attr + (o.attrs || '') + '><span class="nm">' + nm + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  }

  // 위쪽 줄 (회사·군단·현장 공통): 회사 이름 · 상점(취소선) · 메뉴 · 설정 톱니 / 회사 레벨 · 회사 금(영구) · 보석 · 주
  function topbar(el) {
    el.appendChild(div('topbar',
      '<span class="company">검은망치 건설</span>' +
      '<button class="topbtn nope" data-toast="' + esc(soonText('상점')) + '">상점</button>' +
      '<button class="topbtn" data-menu aria-label="메뉴">메뉴</button>' +
      '<button class="gear" data-go="settings" aria-label="설정">&#9881;&#xFE0E;</button>'));
    el.appendChild(div('resbar',
      '<span class="chip">회사 Lv ' + P.company().lv + '</span><span class="chip" data-chip="gold">회사 금 ' + money(RUN.gold) + '</span>' +
      '<span class="chip">보석 ' + RUN.gems + '</span><span class="chip accent">' + RUN.week + '주째</span>'));
  }

  // 메뉴 팝업: 도감 · 업적 (데모에 없음 = 취소선). 바깥 누르기·닫기 버튼·Esc 로 닫는다.
  var menuPop = null;
  function closeMenu() { if (menuPop && menuPop.parentNode) menuPop.parentNode.removeChild(menuPop); menuPop = null; }
  function openMenu() {
    closeMenu();
    var bg = div('popbg', '<div class="pop" role="dialog" aria-label="메뉴"><h3 class="pophead">메뉴</h3><div class="entries cols2">' +
      entry({ kind: 'soon', name: '도감' }) + entry({ kind: 'soon', name: '업적' }) + '</div><button class="btn primary" data-closepop>닫기</button></div>');
    bg.addEventListener('click', function (e) {
      var t = e.target;
      if (t === bg || (t.closest && t.closest('[data-closepop]'))) { closeMenu(); buzz('tap'); }
    });
    document.body.appendChild(bg);
    menuPop = bg;
    leaveHooks.push(closeMenu);
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  // 납품 기준 5단계 목록 (의뢰 카드·게시판 공통). cur = 지금 단계(0~5, 없으면 모두 앞으로)
  function stagesHtml(q, cur) {
    return '<ul class="plain stglist">' + q.stages.map(function (s, i) {
      var st = cur == null ? '' : i < cur ? ' done' : i === cur ? ' now' : '';
      var t = '가치 ' + s.value + ' · 전투력 ' + s.power + (s.floor2 ? ' (2층 ' + s.floor2 + ')' : '') + (s.opens ? ' · 🔓 ' + s.opens + '층 열림' : '');
      return '<li class="stg' + st + '"><b>' + (i < (cur || 0) ? '✓' : (i + 1)) + '</b><span>' + t + '</span></li>';
    }).join('') + '</ul>';
  }
  function rewardText(rw) {
    return '회사 금 +' + money(rw.gold || 0) + (rw.gems ? ' · 보석 +' + rw.gems : '') + ' · 회사 경험치 +' + (rw.companyExp || 0);
  }

  // ---------- 회사 탭: 하청 건설사 건물 단면 ----------
  SCREENS.company = function (el) {
    topbar(el);
    var co = P.company(), lv = co.lv, rk = rankOf(lv);
    el.appendChild(div('card rankcard', '<div class="rankrow"><b class="ranktitle">' + esc(rk.title || '') + '</b><span class="chip accent">회사 Lv ' + lv + '</span></div>' +
      '<div class="dim small-text">' + esc(rk.desc || '') + '</div>' +
      '<div class="xprow small-text dim"><span>회사 경험치</span><b>' + co.exp + '/' + co.need + '</b></div><div class="xpbar"><i style="width:' + pct(co.exp, co.need) + '"></i></div>'));

    // 무대: 아이소메트릭 방 (그림 = stage.js SVG) + 캐릭터 자리. 바깥 틀(.stage)은 남는 높이를 채우고 방(.stagebox)은 비율을 지킨 채 가운데에 놓는다
    var stage = div('stage'), box = div('stagebox', ST.roomSvg());
    stage.appendChild(box);
    var actors = startActors(stage, box);
    stage.appendChild(div('stagetag', '<span class="chip">검은망치 건설 본사</span>'));
    el.appendChild(stage);
    wanderActors(actors, stage);

    var q = RUN.quest;
    var board = q ? { kind: 'open', go: 'board', name: '의뢰 게시판', sub: esc(q.name) } : { kind: 'open', go: 'contract', name: '의뢰 게시판', sub: '의뢰 고르기' };
    var gal = deliveredOnce() ? { kind: 'open', go: 'gallery', name: '작품집', sub: '납품한 던전 ' + RUN.works.length + '곳' } : { kind: 'lock', name: '작품집', cond: condText('gallery') };
    el.appendChild(div('entries', entry(board) + entry(gal) + entry({ kind: 'soon', name: '비서실' }) +
      entry({ kind: 'soon', name: '응접실' }) + entry({ kind: 'soon', name: '소장실' }) + entry({ kind: 'soon', name: '직원실' })));
  };

  // ---------- 현장 탭: 다음 주 버튼 + 의뢰 진행표(고정) + 세로 지하 단면 ----------
  function pcell(label, now, need) {
    var ok = need != null && now >= need;
    return '<div class="pcell' + (ok ? ' ok' : '') + '"><span>' + label + '</span><b>' + fmtN(now) + '/' + (need == null ? '-' : fmtN(need)) + '</b></div>';
  }
  // 진행표 (P.questProgress): 납품 기준 n/5 · 가치 · 전투력 · (2층 전투력) · 의뢰 예산. 5단계를 채우면 의뢰 완료 + [납품하기]
  function progressHtml(q) {
    var pr = P.questProgress();
    if (!pr) return '';
    var h = '<div class="prog' + (pr.complete ? ' done' : '') + '" data-prog><div class="ptitle"><span class="chip accent">' + questTag(q) + '</span><b>' + esc(q.name) + '</b></div>';
    if (pr.complete) {
      h += '<div class="pdone"><b>의뢰 완료</b><button class="btn primary" data-deliver' + (pr.canDeliver ? '' : ' aria-disabled="true"') + '>납품하기</button></div>';
      if (!pr.canDeliver) h += '<div class="pwhy">' + esc(pr.why) + '</div>';
    } else {
      var nx = pr.next;
      h += '<div class="prow"><div class="pcell"><span>납품 기준</span><b>' + pr.stage + '/' + pr.total + '</b></div>' +
        pcell('가치', pr.cur.value, nx.value) + pcell('전투력', pr.cur.power, nx.power) + (nx.floor2 ? pcell('2층 전투력', pr.cur.floor2, nx.floor2) : '') + '</div>';
      if (pr.floorLock) h += '<div class="pwhy">🔒 지하 ' + pr.floorLock.floor + '층: ' + pr.floorLock.atStage + '단계 달성 시 열림</div>';
    }
    h += '<div class="pbudget"><span>의뢰 예산 <small class="dim">(건설·부대 조달)</small></span><b>' + money(pr.budget) + ' / ' + money(pr.budgetStart) + '</b></div>';
    return h + '</div>';
  }

  SCREENS.field = function (el) {
    var q = RUN.quest;
    topbar(el);
    var top = div('fieldtop');
    top.appendChild(div('', '<button class="btn primary big weekbtn" data-week>다음 주 ▶<small>' + RUN.week + '주째 시작</small></button>'));
    if (q) top.appendChild(div('', progressHtml(q)));
    el.appendChild(top);
    if (!q) { el.appendChild(div('', '<button class="btn primary big" data-go="contract">의뢰 고르기</button>')); return; }

    // 이번 주 침입자 알림 한 줄 (데모는 대량 출현을 꺼서 일반 침입만)
    var pi = P.planInfo();
    if (pi) el.appendChild(div('invade', '<span>이번 주 침입자 ' + pi.count + '명 · 최고 ' + pi.top + '급 · 평균 Lv ' + pi.lv + '</span>'));

    // 세로 지하 단면: 1층(건설·출진) / 2층(의뢰가 2층이면 3단계 달성 시 열림) / 3층(데모에 없음)
    var pr = P.questProgress(), un = P.unlocks();
    var allU = P.squads().concat(P.guards()), placed = allU.filter(function (u) { return !!u.placed; }).length;
    var f2;
    if (un.floor2) f2 = '<div class="floor f2"><div class="fhead"><b>지하 2층</b><span>열림</span></div><div class="entries">' +
      entry({ kind: 'stub', name: '건설', sub: '곧 연결', toast: '2층 건설은 다음 작업에서 이어 붙여요' }) + '</div></div>';
    else if (pr && pr.floorLock) f2 = '<div class="floor f2 gate" data-f2="lock"><span class="nm">🔒 지하 2층</span><small>' + pr.floorLock.atStage + '단계 달성 시 열림</small></div>';
    else f2 = '<div class="floor f2 gate" data-f2="none"><span class="nm">지하 2층</span><small>이 의뢰는 1층 현장이에요</small></div>';
    el.appendChild(div('shaft',
      '<div class="surface"><span>지상</span><small>현장 입구</small></div>' +
      '<div class="floor f1"><div class="fhead"><b>지하 1층</b><span>출진 ' + placed + '/' + allU.length + '</span></div><div class="entries">' +
        entry({ kind: 'open', go: 'build', name: '건설', sub: '시설·부대 배치' }) +
        entry({ kind: 'stub', name: '출진', sub: '곧 연결', toast: '층별 출진은 다음 작업에서 이어 붙여요 (지금은 건설 화면의 대기실에서 부대를 넣어요)' }) +
        entry({ kind: 'soon', name: '포로 수용소' }) + '</div></div>' + f2 +
      '<div class="floor f3 gate soon"><span class="nm">지하 3층</span></div>'));
    // 지하 3층·잠긴 2층 칸도 누르면 안내 토스트
    var f3 = el.querySelector('.floor.f3');
    f3.addEventListener('click', function () { toast(soonText('지하 3층')); buzz('tap'); });
    var fl2 = el.querySelector('.floor.f2.gate');
    if (fl2) fl2.addEventListener('click', function () {
      toast(fl2.getAttribute('data-f2') === 'lock' ? '🔒 지하 2층: ' + pr.floorLock.atStage + '단계 달성 시 열림' : '2층은 2층 의뢰에서 열려요');
      buzz('tap');
    });
  };

  // ---------- 의뢰 게시판 (회사 탭 입구): 지금 받은 의뢰 한 장. 새 의뢰는 납품한 뒤에 고른다 ----------
  SCREENS.board = function (el) {
    el.appendChild(head('의뢰 게시판', 'company'));
    var q = RUN.quest;
    if (!q) { el.appendChild(div('card dim', '진행 중인 의뢰가 없어요')); el.appendChild(div('', '<button class="btn primary" data-go="contract">의뢰 고르기</button>')); return; }
    var pr = P.questProgress();
    var h = '<div class="qhead"><span class="chip accent">' + questTag(q) + '</span><h3>' + esc(q.name) + '</h3></div>';
    if (q.client) h += '<div class="qclient">' + (q.client.kind ? '<span class="chip">' + esc(q.client.kind) + '</span> ' : '') + '<b>' + esc(q.client.name || '') + '</b></div>';
    h += siteHtml(q) + fixedHtml(q);
    if (q.attr) h += '<div class="qattr"><div class="qattr-h"><span class="chip">던전 속성</span> <b>' + esc(q.attr.label || '') + '</b></div>' + (q.attr.effect ? '<div class="small-text">' + esc(q.attr.effect) + '</div>' : '') + '</div>';
    h += '<div class="poplabel qlabel">납품 기준 ' + q.stage + '/' + q.stages.length + (pr && pr.complete ? ' · 의뢰 완료' : '') + '</div>' + stagesHtml(q, q.stage) +
      '<div class="stat"><span>의뢰 예산</span><b>' + money(P.budgetLeft()) + ' / ' + money(RUN.site.budgetStart) + '</b></div>' +
      '<div class="stat"><span>납품 보수</span><b>' + rewardText(q.reward) + '</b></div>';
    el.appendChild(div('card contract', h));
    el.appendChild(div('dim small-text', '한 번에 의뢰 하나만 받을 수 있어요. 납품 기준 5단계를 다 채우고 [납품하기]를 누르면 새 의뢰를 고를 수 있어요.'));
  };

  // ---------- 작품집 (회사 탭 입구, 첫 납품 뒤 열림): 납품한 던전 목록 + 작품집 효과 ----------
  SCREENS.gallery = function (el) {
    el.appendChild(head('작품집', 'company'));
    var wi = P.worksInfo();
    var rows = wi.list.slice().reverse().map(function (w) {
      return '<li><b>No.' + w.no + ' ' + esc(w.name) + '</b><br><span class="dim small-text">' + esc(w.client) + ' · 가치 ' + w.value + ' · 전투력 ' + w.power + ' · ' + w.week + '주째 납품</span></li>';
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


  // ---------- 군단 탭: 부대·부족 / 친위대 + 입구 5개. 첫 전투 뒤에 열린다 ----------
  // 부대(현장 부대, 의뢰마다 새로) = 같은 부족 몇 명 묶음. 친위대 = 이름 있는 개체(다음 현장 동행). 능력치는 1명 기준 (statOf·statParts)
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

  var corpsTab = 'mon', unitsOpen = {};
  SCREENS.corps = function (el) {
    topbar(el);
    var segEl = div('entries');
    var listEl = div('', '');
    listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px';

    function unitCardHtml(u) {
      var open = !!unitsOpen[u.id], guard = u.kind === 'guard', t = tribeById(u.tribe);
      var h = '<div class="card ucard' + (open ? ' open' : '') + (guard ? ' guard' : '') + '" data-uid="' + u.id + '">' +
        '<button class="uhead" data-utoggle="' + u.id + '" aria-expanded="' + open + '"><div class="portrait">' + (guard ? '친위대' : '도트') + '</div>' +
        '<div class="uinfo"><div class="utop"><b>' + esc(u.name) + '</b>' + (guard ? '<span class="chip accent">친위대</span>' : '') + '</div>' +
        '<div class="utags"><span class="chip">' + esc(u.tribeName) + '</span>' + (guard ? '' : '<span class="chip">' + u.count + '/' + u.cap + '명</span>' + (u.free ? '<span class="chip">무료 기본</span>' : '')) +
        '<span class="chip">Lv ' + u.lv + '</span><span class="chip">등급 ' + P.monGrade(u.lv) + '</span>' +
        (u.placed ? '<span class="chip ok">' + esc(zoneName(u.placed)) + ' 출진</span>' : '<span class="chip">대기</span>') + '</div>' +
        '<div class="nums">' + statLine(u) + '</div>' +
        '<div class="xprow small-text dim"><span>경험치</span><b>' + u.exp + '/' + u.need + '</b></div><div class="xpbar"><i style="width:' + pct(u.exp, u.need) + '"></i></div></div>' +
        '<i class="tgarrow">▾</i></button>';
      if (open) {
        h += '<div class="ubody">' + (guard ? '<div class="small-text dim">' + esc((t && t.guardIntro) || '') + (RUN.guards.filter(function (g) { return g.id === u.id; })[0].from ? ' (출신 현장: ' + esc(RUN.guards.filter(function (g) { return g.id === u.id; })[0].from) + ')' : '') + '</div>' : '') +
          statDetailHtml(u) + '</div>';
      }
      if (!guard) {
        var rf = P.refillInfo(u.id), full = rf && u.count >= u.cap;
        h += '<div class="uact"><button class="btn small' + (full ? '' : ' primary') + (rf && !rf.canAfford ? ' poor' : '') + '" data-refill="' + u.id + '"' + (rf && !rf.canAfford ? ' aria-disabled="true"' : '') + '>' +
          (full ? '정원 가득' : '1명 보충 (예산 ' + (rf ? rf.cost : '?') + ')') + '</button></div>';
      }
      return h + '</div>';
    }
    function tribeCardHtml(t) {
      var ti = P.tribeInfo(t.id), pc = P.procureInfo(t.id), c = gemCost(ti);
      var upBtn = !ti || ti.contracted === false ? '<button class="btn small" disabled>사용권 필요</button>'
        : ti.next == null || c == null ? '<button class="btn small" disabled>최대 단계</button>'
        : '<button class="btn small primary' + (ti.canAfford ? '' : ' poor') + '" data-uptribe="' + t.id + '"' + (ti.canAfford ? '' : ' aria-disabled="true"') + '>보석 강화 (보석 ' + c + ')</button>';
      var prBtn = pc ? '<button class="btn small primary' + (pc.canAfford ? '' : ' poor') + '" data-procure="' + t.id + '"' + (pc.canAfford ? '' : ' aria-disabled="true"') + '>새 부대 조달 (예산 ' + pc.cost + ')</button>' : '';
      return '<div class="card tribecard" data-tid="' + t.id + '"><div class="tribehead"><b>' + esc(t.name) + '</b><span class="chip">' + esc(t.role) + '</span>' +
        '<span class="chip">보석 강화 Lv ' + (ti ? ti.lv + '/' + ti.max : 0) + '</span></div>' +
        '<div class="small-text">' + esc(t.feature) + '</div><div class="small-text dim">' + esc(t.talk) + '</div>' +
        (ti ? '<div class="small-text dim">지금 ' + esc(ti.effect) + (ti.next ? ' · 다음 ' + esc(ti.next) : '') + '</div>' : '') +
        '<div class="row2">' + prBtn + upBtn + '</div></div>';
    }
    function draw() {
      var gOpen = deliveredOnce();
      segEl.innerHTML = entry({ kind: 'open', name: '부대·부족', sub: '조달·보석 강화', on: corpsTab === 'mon', attrs: ' data-t="mon"' }) +
        (gOpen ? entry({ kind: 'open', name: '친위대', sub: '최대 ' + P.GUARD_MAX + '명', on: corpsTab === 'guard', attrs: ' data-t="guard"' })
               : entry({ kind: 'lock', name: '친위대', cond: condText('guard') })) +
        entry({ kind: 'soon', name: '훈련' }) + entry({ kind: 'soon', name: '대장간' }) + entry({ kind: 'soon', name: '몬스터 숙소' });
      var s = '';
      if (corpsTab === 'mon') {
        s += '<div class="gemnote"><span class="chip accent">의뢰 예산 ' + money(P.budgetLeft()) + '</span><span class="chip accent">보석 ' + RUN.gems + '</span>' +
          '<span class="small-text dim">부대 조달·보충은 의뢰 예산, 보석 강화는 보석을 써요. 보석 강화는 다음 현장에도 남고, 현장 부대는 납품 때 의뢰인에게 넘어가요.</span></div>';
        var sq = P.squads();
        s += '<h3 class="seclabel">현장 부대 (' + sq.length + ')</h3>' + (sq.length ? sq.map(unitCardHtml).join('') : '<div class="card dim small-text">부대가 없어요. 아래에서 조달하세요.</div>');
        s += '<h3 class="seclabel">부족</h3>' + P.TRIBES.map(tribeCardHtml).join('');
      } else {
        var gs = P.guards();
        s += '<p class="dim small-text" style="margin:0">친위대는 납품할 때 부대 대장 중에서 골라요. 이름 있는 몬스터라서 레벨을 지닌 채 다음 현장에도 같이 가요.</p>';
        s += gs.map(unitCardHtml).join('');
        for (var i = gs.length; i < P.GUARD_MAX; i++) s += '<div class="card unit"><div class="portrait">칸 ' + (i + 1) + '</div><div class="info"><b class="dim">비어 있음</b></div></div>';
      }
      listEl.innerHTML = s;
    }
    segEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-t]') : null;
      if (b) { corpsTab = b.getAttribute('data-t'); buzz('tap'); draw(); }
    });
    // 못 하는 이유가 있으면 토스트만, 아니면 함수를 불러 결과를 토스트로. 성공하면 결과 객체
    function act(info, fn, key) {
      if (!info.canAfford) { toast(info.why || '지금은 할 수 없어요'); buzz('warn'); return null; }
      var r = fn(key);
      toast(r && r.msg ? r.msg : (r && r.ok ? '완료' : '할 수 없어요'));
      if (r && r.ok) { buzz('good'); stageToast(r.stages); return r; }
      buzz('warn'); return null;
    }
    listEl.addEventListener('click', function (e) {
      var q = function (a) { return e.target.closest ? e.target.closest('[' + a + ']') : null; }, b;
      if ((b = q('data-utoggle'))) { var id = b.getAttribute('data-utoggle'); unitsOpen[id] = !unitsOpen[id]; buzz('tap'); draw(); return; }
      if ((b = q('data-refill'))) {
        var uid = b.getAttribute('data-refill'), inf = P.refillInfo(uid);
        if (!inf) return;
        var r1 = act(inf, P.refillSquad, uid);
        draw(); if (r1) flashUp(listEl.querySelector('[data-uid="' + uid + '"]'));
        return;
      }
      if ((b = q('data-procure'))) {
        var tid = b.getAttribute('data-procure'), r2 = act(P.procureInfo(tid), P.procureSquad, tid);
        if (r2 && r2.unit) unitsOpen[r2.unit.id] = true;
        draw(); if (r2 && r2.unit) flashUp(listEl.querySelector('[data-uid="' + r2.unit.id + '"]'));
        return;
      }
      if ((b = q('data-uptribe'))) {
        var tn = b.getAttribute('data-uptribe'), r3 = act(P.tribeInfo(tn), P.upgradeTribe, tn);
        draw(); if (r3) flashUp(listEl.querySelector('[data-tid="' + tn + '"]'));
      }
    });
    el.appendChild(segEl); el.appendChild(listEl); draw();
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

    el.appendChild(div('row',
      '<button class="btn grow" data-toast="저장 내보내기는 출시 때 연결 (가짜)">저장 내보내기</button>' +
      '<button class="btn grow" data-toast="저장 불러오기는 출시 때 연결 (가짜)">저장 불러오기</button>'));

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
        go('contract', true);
      }, MOTION.hold.charge);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { hold.addEventListener(ev, stopHold); });
    el.appendChild(hold);
    el.appendChild(div('dim small-text', '되돌릴 수 없는 일은 길게 눌러야 동작합니다. 주·회사 금·보석·부대·친위대·의뢰가 모두 처음으로 돌아갑니다.'));
    el.appendChild(div('mt-auto dim small-text', '버전: D1 첫 데모 (2차: 새 로직 연결, 임시 숫자)'));
  };

  // 건설 화면은 build.js (구역 판). SCREEN_PLUGINS.build 가 아래에서 SCREENS.build 로 등록된다.

  // 납품·정산 + 새 의뢰 고르기: 한 화면 (contract와 result가 같은 함수)
  // 위에서 아래로: 정산(보수·회사 금·회사 레벨·작품 등록) -> 남는 것/인계되는 것 -> 친위대로 데려갈 부대 고르기 -> 새 의뢰 후보 카드(+ 🔒 아직 못 받는 의뢰).
  // 납품은 현장 진행표의 [납품하기]로 이미 끝났다(deliverNow). 후보 카드를 누르면 P.pickQuest(q, 친위대로 올릴 부대 id들) -> 현장.
  // 첫 시작(phase 'choose', report 없음)에는 정산·친위대 없이 후보만.
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
    h += '<div class="poplabel qlabel">납품 기준 5단계 (가치 + 전투력)</div>' + stagesHtml(q, null) +
      '<div class="money"><div>의뢰 예산<b>' + money(q.budget) + '</b></div><div>보수<b>회사 금 ' + money(q.reward.gold) + '</b></div></div>' +
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
    el.appendChild(head(r ? '납품·정산' : (RUN.history.length === 0 ? '첫 의뢰를 고르세요' : '의뢰를 고르세요')));

    if (r) {
      el.appendChild(div('stamp', '납품 완료'));
      el.appendChild(div('dim small-text', r.quest.name + ' · ' + r.weeks + '주 · 가치 ' + r.value + ' · 전투력 ' + r.power + ' · 건설 ' + r.builds + '회'));
      var work = r.work;
      el.appendChild(div('card payout',
        '<h3>정산</h3>' +
        '<div class="stat"><span>의뢰 보수</span><b>회사 금 +' + money(r.gold) + (r.gems ? ' · 보석 +' + r.gems : '') + '</b></div>' +
        '<div class="stat"><span>회사 금</span><b>' + money(r.goldBefore) + ' → ' + money(RUN.gold) + '</b></div>' +
        (r.gems ? '<div class="stat"><span>보석</span><b>' + r.gemsBefore + ' → ' + RUN.gems + '</b></div>' : '') +
        '<div class="stat"><span>회사 경험치</span><b>+' + r.companyExp + '</b></div>' +
        '<div class="stat total"><span>회사 레벨</span><b>' + coText(r.companyBefore) + ' → ' + coText(r.companyAfter) + '</b></div>' +
        '<div class="stat"><span>걸린 기간</span><b>' + r.weeks + '주</b></div>' +
        (work ? '<div class="stat"><span>작품집 등록</span><b>No.' + work.no + ' ' + esc(work.name) + '</b></div>' : '') +
        (r.worksEffectNew ? '<div class="worksnew"><b>작품집 효과 해금!</b> ' + esc(P.worksInfo().effect.label) + ': ' + esc(P.worksInfo().effect.text) + '</div>' : '')));

      el.appendChild(div('cl',
        '<div class="card carry"><h3>남는 것</h3>' + listHtml(r.carry || []) + '</div>' +
        '<div class="card lost"><h3>인계되는 것</h3>' + listHtml(r.lost || []) + '</div>'));

      // 친위대로 데려갈 부대: 그 부대의 대장이 이름 있는 친위대가 되어 레벨을 이어받는다
      var gbox = div('card');
      el.appendChild(gbox);
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
    }

    var list = P.offerQuests(), lk = P.lockedQuest();
    el.appendChild(div('qtitle', (r ? '<h3>' + (list.length ? '새 의뢰를 고르세요' : '새 의뢰') + '</h3>' : '') + '<div class="dim small-text">' +
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
    if (!list.length && !lk && r) {
      el.appendChild(div('card', '<h3>데모는 여기까지예요</h3><div class="small-text dim">준비한 의뢰를 모두 납품했어요. 처음부터 다시 해 볼 수 있어요.</div>'));
      var rs = div('', '<button class="btn primary" data-restart>처음부터 다시 시작</button>');
      rs.querySelector('button').addEventListener('click', function () {
        P.reset(); tut.local = {}; tut.off = false; tutEnd(false); toast('처음부터 다시 시작해요'); buzz('good'); go('contract', true);
      });
      el.appendChild(rs);
    }
    if (r) buzz('stamp');
  }
  SCREENS.contract = deliverScreen;
  SCREENS.result = deliverScreen;

  // ---------- 튜토리얼: 은발 마왕 말풍선 (대사는 lines.js, 단계 기록은 progress.js 계약 함수) ----------
  // 계약: P.tutorial() -> { on, seen } · P.tutorialSeen(id) (본 단계로 기록) · P.skipTutorial() · P.tutorialPath() (구역 id 배열 또는 null).
  // 하나라도 없거나 오류면 튜토리얼을 아예 안 띄운다. 말풍선은 화면 아래 탭 막대 바로 위(#tut)에 끼어 들어가 화면이 그만큼 줄어들 뿐 아무것도 가리지 않는다.
  // 단계 하나 = LINES.tutorial 에서 id 가 같은 줄들. 탭하면 다음 줄, 마지막 줄에서 탭하면 닫히고 "본 단계"로 기록.
  // 강조 = 목표 요소에 .tut-hl (shell.css). 목표를 누르거나 다른 화면으로 가면 그 단계는 끝난 것으로 기록.
  var tutEl = document.getElementById('tut');
  var tut = { cur: null, local: {}, off: false };
  function tutLines(id) {
    var L = window.LINES, a = L && Array.isArray(L.tutorial) ? L.tutorial : [];
    return a.filter(function (l) { return l && l.id === id && typeof l.text === 'string' && l.text.trim(); });
  }
  function tutOn() {
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
  }
  function tutDraw() {
    var c = tut.cur;
    if (!c) { tutEl.hidden = true; tutEl.innerHTML = ''; return; }
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
  }
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
    if ((!tutOn() && !opts.force) || tutSeenNow(id)) return false;
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
  // shell.js 가 직접 그리는 화면의 단계 (건설·전투 화면은 build.js·battle.js 가 api.tutStart 로)
  function tutCheck(name) {
    if (!tutOn() && !(name === 'result' && tut.settleStep)) return;
    if (name === 'contract' && RUN.phase === 'choose') tutStart('welcome', { target: '#view .card.contract' });
    else if (name === 'result' && RUN.phase === 'settle') tutStart('deliver', { target: '#view .payout', force: !!tut.settleStep });
    else if (name === 'field' && RUN.phase === 'play' && RUN.quest) {
      if (P.checkQuest() || (P.questProgress() && P.questProgress().complete)) tutStart('complete', { target: '#view [data-deliver]' });
      else if (RUN.site.builds === 0) tutStart('build', { target: '#view [data-go="build"]' });
      else tutStart('nextweek', { target: '#view [data-week]' });
    }
    tutApply();
  }
  // 건설 화면 강조 구역: P.tutorialPath() 중 입구(E)·보물방(B)은 빼고 지을 수 있는 칸만. 'zones' 단계가 떠 있을 때만
  function tutZones() {
    if (!tutActive('zones') || typeof P.tutorialPath !== 'function') return [];
    try {
      var p = P.tutorialPath();
      return Array.isArray(p) ? p.filter(function (z) { return z !== 'E' && z !== 'B'; }) : [];
    } catch (e) { return []; }
  }

  // ---------- 화면 플러그인 (화면을 별도 파일로 뺄 때: battle.js) ----------
  // 별도 파일은 SCREEN_PLUGINS.이름 = function (api) { return function (el) {...}; } 로 등록한다.
  // api.onLeave(fn): 다른 화면으로 나갈 때 한 번 불러 준다 (타이머·루프 정리용).
  var leaveHooks = [];
  var API = {
    toast: toast, buzz: buzz, fxRandom: fxRandom, div: div, go: go, onLeave: function (fn) { leaveHooks.push(fn); },
    // 건설 화면용 (build.js)
    head: head, questTag: questTag, stageToast: stageToast, fixedHtml: fixedHtml, stagesHtml: stagesHtml,
    // 튜토리얼 (build.js·battle.js): 단계 보이기 · 끝내기(본 것으로 기록) · 떠 있나 · 건설 화면 강조 구역
    tutStart: tutStart, tutDone: function (id) { if (tutActive(id)) tutEnd(true); }, tutActive: tutActive, tutZones: tutZones,
    // 전투 화면용: 하단 탭 막대 자리 (전투 시작 버튼이 가운데 큰 버튼 자리에 오게 battle.js가 여기에 채운다)
    bar: function () { return tabsEl; },
    // 전투 화면용: 결과 반영(한 번만, 결과표 내용을 돌려줌) / 결과표에서 현장으로
    finishBattle: function (result) { return P.applyBattle(result); },
    backHome: function () { go('field', false); }
  };
  var plugins = window.SCREEN_PLUGINS || {};
  Object.keys(plugins).forEach(function (k) { SCREENS[k] = plugins[k](API); });

  // ---------- 화면 바꾸기 ----------
  // 화면 지킴이: 상태에 맞지 않는 화면이면 맞는 화면으로 바꾼다 (주소 기록은 덮어씀)
  function guardScreen(name) {
    var to = ALIAS[name] || name;
    if (!SCREENS[to]) to = 'field';
    if (RUN.phase === 'settle') to = 'result';                         // 납품 직후엔 정산부터
    else if (RUN.phase === 'play' && RUN.battling) to = 'battle';      // 전투를 시작했으면 끝날 때까지 전투 화면 (다른 보정보다 먼저)
    else if (to === 'result') to = 'field';
    else if (RUN.phase === 'choose' && (to === 'build' || to === 'battle')) to = 'contract'; // 의뢰 없이 건설·전투 불가
    else if (RUN.phase === 'play' && to === 'contract') to = 'field';
    else if (to === 'battle' && !(RUN.phase === 'play' && RUN.battling)) to = 'field'; // 다음 주를 눌러야만 전투
    else if (bootCheck && to === 'field' && RUN.phase === 'choose') to = 'contract'; // 켜자마자 의뢰가 없으면 바로 고르게
    else if (to === 'corps' && !corpsOpen()) to = 'field';             // 군단은 첫 전투 뒤에 열림
    else if (to === 'gallery' && !deliveredOnce()) to = 'company';     // 작품집은 첫 납품 뒤에 열림
    bootCheck = false;
    if (to !== name) history.replaceState(null, '', '#' + to);
    return to;
  }
  var bootCheck = true;
  var lastName = '';
  var lastTab = 'field';   // 설정 등에서 뒤로 갈 곳 (마지막으로 본 탭 화면)
  var corpsWas = null;     // 군단 탭이 방금 열렸는지 알아채는 용 (열리면 토스트 한 번)

  function render() {
    leaveHooks.splice(0).forEach(function (fn) { fn(); });
    var name = guardScreen((location.hash || '#field').slice(1));
    tutLeave(name);
    var keep = name === lastName && !animateNext ? view.scrollTop : 0; // 같은 화면을 다시 그릴 땐 스크롤 유지
    lastName = name;
    if (TAB_IDS.indexOf(name) >= 0) lastTab = name;
    P.setBattle(name === 'battle'); // 전투 화면에 있는 동안은 건설 불가
    document.body.setAttribute('data-screen', name);
    drawTabs(name); // 전투 화면은 이 막대 자리를 battle.js가 채우므로 화면보다 먼저
    var el = div('screen');
    SCREENS[name](el);
    if (animateNext) el.classList.add('enter');
    animateNext = false;
    view.innerHTML = '';
    view.appendChild(el);
    view.scrollTop = keep;
    tutCheck(name);
  }

  // 하단 막대: 탭 화면(회사·군단·현장)에서 5개 탭. 전부 같은 모양, 지금 보는 탭만 윗줄 표시. 전투 화면에서는 비워 두고 battle.js가 채움. 그 외 화면은 숨김.
  //  열림 = 눌러 이동 · 🔒 = 열림 조건 토스트 · 취소선 = 준비 중 토스트
  function tabState(t) { return t.state === 'gate' ? (corpsOpen() ? 'open' : 'lock') : t.state; }
  function drawTabs(name) {
    tabsEl.className = '';
    var now = corpsOpen();
    if (corpsWas === false && now) toast('군단이 열렸어요!');
    corpsWas = now;
    if (name === 'battle') { tabsEl.hidden = false; tabsEl.className = 'inbattle'; tabsEl.innerHTML = ''; return; }
    tabsEl.hidden = TAB_IDS.indexOf(name) < 0;
    tabsEl.innerHTML = TABS.map(function (t) {
      var st = tabState(t);
      var attr = st === 'open' ? ' data-go="' + t.id + '"'
        : st === 'lock' ? ' data-toast="' + esc('🔒 ' + t.label + ': ' + condText(t.id)) + '"'
        : ' data-toast="' + esc(soonText(t.label)) + '"';
      return '<button class="' + st + (st === 'open' && t.id === name ? ' on' : '') + '"' + attr + '><span class="nm">' + (st === 'lock' ? '🔒 ' : '') + t.label + '</span></button>';
    }).join('');
  }

  // 눌림은 한 곳에서 받는다: data-go(앞으로, 애니메이션) · data-back(즉시) · data-toast · data-week(다음 주) · data-deliver(납품하기) · data-menu(메뉴)
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-go],[data-back],[data-toast],[data-week],[data-deliver],[data-menu]') : null;
    if (!t) return;
    if (t.hasAttribute('data-toast')) { toast(t.getAttribute('data-toast')); buzz('tap'); return; }
    if (t.hasAttribute('data-week')) { startWeek(); return; }
    if (t.hasAttribute('data-deliver')) { deliverNow(); return; }
    if (t.hasAttribute('data-menu')) { buzz('tap'); openMenu(); return; }
    buzz('tap');
    if (t.hasAttribute('data-back')) go(t.getAttribute('data-back'), false);
    else go(t.getAttribute('data-go'), true);
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
})();

