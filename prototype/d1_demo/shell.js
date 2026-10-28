/* D1 첫 데모 화면 (순수 JS, 임시 숫자·임시 문구). 하단 탭 5개 구조 + 새 로직(progress.js, API.md) 연결 (4차: 탭 구조 · 회사 진행 띠 · 현장 단면 · 건설 모드 끌어 놓기)
 *
 * 4차 요약 (2026-10-23 사용자 결정, docs/GAME_PLAN.md "하단 탭·홈 대시보드·건설 모드")
 *  - 하단 탭: 마계 · 군단 · 회사(가운데) · 현장 · 내 집. 가운데 칸 = 회사가 아닌 화면에서는 [홈](회사로), 회사 화면에서는 [다음 주 ▶](P.startBattle). 다음 주는 여기서만.
 *  - 회사(홈) = 사무실 무대(캐릭터 걷기·터치 대사·입구)는 그대로 + 위에 얇은 진행 띠(의뢰·납품 기준 n/5·가치/전투력 막대·마석·주·침입자 예고·출진 요약). 의뢰 완료면 띠가 "의뢰 완료 → 납품" + [납품하기].
 *  - 현장 = 위 두 줄 요약 / 지하 단면(구역 판이 바로 보임, 층이 늘면 단면만 세로 스크롤) / 아래 [출진][건설] / 포로 수용소(취소선). 층 머리에는 출진 n/한도 · ⚔ 만.
 *  - 시설 강화 (2단계 화면, API.md 14절): 현장 기본 화면에서 지은 함정·대기실 방을 누르면 아래 강화 창(.upsheet). 값은 P.upgradeInfo, [강화] = P.upgradeFacility 한 번 (누른 뒤 UP_LOCK_MS 동안 잠금), [닫기]·바깥 누르기 = 함수 안 부름. 건설 모드에서는 창 안 뜸.
 *  - 출진 = 별도 화면(SCREENS.sortie, 현장 [출진]에서). 건설 모드 = 별도 화면(build.js, 현장 [건설]에서): 아래 시설 띠에서 끌어서 빈 구역에 놓기, 미확정 표시, [건설]로 확정.
 *  - 튜토리얼: 한 번에 하나만 반짝. 회사 [다음 주] 전에 현장 탭 -> [건설] -> 추천 칸 + 대기실 끌기 -> [건설] -> [홈] -> [다음 주]. (lines.js tofield·build·zones·place·tohome·nextweek)
 *  - 납품 직후 정산 화면의 'deliver' 안내는 P.deliver()가 튜토리얼을 안 끄므로 그냥 tutOn()으로 뜬다. 데모 의뢰를 다 납품하면 정산 끝에 [정산 마치기] -> P.leaveSettle() -> 현장 탭 자리에 "데모는 여기까지" 화면.
 *  - 보고 있는 층(curFloor)은 출진 화면이 쓴다 (build.js에는 api.floor()/setFloor(n)).
 *
 * 화면 목록과 이동 규칙
 *  - 한 페이지 안에서 주소 끝의 해시(#company 등)로 화면을 바꾼다. 브라우저 뒤로 가기 = 이전 화면
 *    (나중에 안드로이드 뒤로 버튼과 연결). 예전 이름 #home = 현장, #units = 군단은 그대로 받아서 옮겨 준다 (build.js가 'home'으로 돌아옴).
 *  - 하단 탭 5개 (GAME_STRUCTURE 1절): 마계 · 군단 · 회사(가운데) · 현장 · 내 집. 지금 보는 탭만 윗줄 표시(건설 모드는 현장 탭).
 *    데모에서 열린 탭 = 회사 · 현장 · 군단(첫 전투 뒤 열림, 그 전엔 🔒 + 조건). 마계·내 집은 이름에 가로 취소선, 누르면 "준비 중" 토스트.
 *    탭 막대가 보이는 화면: company · corps · field · build. 전투 화면은 같은 막대 자리에 배속 · 전투 시작 · 안내가 들어간다 (battle.js).
 *  - 보이는 방식 (GAME_STRUCTURE 2절): 데모에 없는 입구 = 취소선 + 준비 중(.entry.soon), 플레이하면 열리는 입구 = 🔒 + 열림 조건(.entry.lock). 두 가지를 섞지 않는다.
 *  - 탭 안 입구: 회사 = 의뢰 게시판(board) · 작품집(gallery) · 비서실·응접실·소장실·직원실 / 군단 = 부족 · 친위대 · 훈련 · 대장간 · 몬스터 숙소 /
 *    현장 = 건설(build) · 출진(sortie) · 포로 수용소 / 설정(settings, 위 톱니) · 메뉴(도감·업적) · 상점(위 버튼)
 *  - 진행 화면 (탭 막대 숨김): contract(첫 의뢰) -> company / field -> build / battle -> result(납품·정산·친위대·새 의뢰 후보 한 화면) -> field
 *    contract와 result는 같은 함수(deliverScreen). 첫 시작(report 없음)에는 정산·친위대 없이 후보만 보인다. 납품은 회사 진행 띠의 [납품하기]에서만 (자동 납품 없음).
 *  - "다음 주"를 누르면 이번 주 전투가 시작되고(PROGRESS.startBattle) 결과를 반영할 때까지 전투 화면에서 못 나간다.
 *  - 진행 상태와 규칙은 progress.js (window.PROGRESS). 이 파일은 그 값을 보고 그리기만 하고,
 *    값을 바꾸는 것은 PROGRESS의 정해진 함수(buildZone·startBattle·applyBattle·deliver·pickQuest …)로만 한다.
 *  - 읽는 함수 = API.md 그대로: questProgress(진행표) · company · budgetLeft · unlocks · worksInfo · squads/guards · offerQuests/lockedQuest 등. 자리표시(opt) 코드는 없앴다.
 *  - 화면 지킴이(render 안): 정산 중이면 어느 화면이든 result로, 의뢰가 없으면 contract로, 의뢰가 있으면 contract 못 들어감.
 *  - 건설 화면(구역 판)은 build.js, 전투 화면은 battle.js (SCREEN_PLUGINS). 판 규칙은 zones.js.
 *  - 화면 하나 = 함수 하나: SCREENS.이름 = function (el) { el에 내용을 채운다 }  (나중에 React 화면 하나로 옮기기 쉽게)
 *  - 전환 애니메이션은 앞으로 갈 때만 (var(--dur-sheet) var(--ease-out)). 뒤로/닫기는 즉시.
 *  - 튜토리얼: 은발 마왕 말풍선(#tut, 화면 위에 겹쳐 뜸: 탭 막대 바로 위, 대상을 가리면 위 자리). 대사는 lines.js, 단계 기록은 progress.js(P.tutorial 등). 아래 "튜토리얼" 절 참고.
 *  - 용어는 GAME_STRUCTURE 8절: 화면 글에 "퀘스트"를 쓰지 않는다 (의뢰·의뢰 완료·납품 기준·업무). 회사 금(영구) 와 마석(현장 전용)은 따로 표시.
 *  - 숫자는 가짜(균형 없음). 상태(RUN)는 progress.js가 localStorage에 자동 저장한다. 설정은 이 파일이 따로 저장.
 *  - 흐름 시험 (2026-10-28, P.flowInfo().on, API.md 15절, 임시 화면): 현장 탭·회사의 가운데 [운영 ▶] = 전투 화면(현장 운영: 일반 판 자동 반복 + [보스 도전]).
 *    옛 현장 화면은 "정비"(시설 강화·출진·건설 입구 + [운영 ▶]·[보스 도전]). 일반 판 중에는 자유롭게 다른 화면으로 감(그 판은 멈춤), 보스 판 중에만 전투 화면에 묶임.
 *    진행 띠·현장 위 줄은 "보스 검증 n/5 · 다음 보스". 튜토리얼은 시험 동안 끔(tutOn).
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
    { id: 'demon',   label: '마계', state: 'soon' },
    { id: 'corps',   label: '군단', state: 'gate' },
    { id: 'company', label: '회사', state: 'open' },   // 가운데: 회사가 아닌 화면에서는 [홈], 회사 화면에서는 [다음 주 ▶]
    { id: 'field',   label: '현장', state: 'open' },
    { id: 'house',   label: '내 집', state: 'soon' }
  ];
  var TAB_IDS = ['company', 'corps', 'field', 'build']; // 탭 막대가 보이는 화면 (마계·내 집은 화면이 없다. build = 현장 탭의 건설 모드)
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
  // 새로 오른 납품 기준 단계를 토스트로 (건설·조달·배치·전투 뒤). 층이 열리면 한 줄 더
  function stageToast(stages) {
    var q = RUN.quest;
    (stages || []).forEach(function (n) {
      toast('납품 기준 ' + n + '/' + (q ? q.stages.length : 5) + '단계 달성!');
      var stg = q && q.stages[n - 1];
      if (stg && stg.opens) toast('지하 ' + stg.opens + '층이 열렸어요');
    });
  }
  // 납품: 의뢰 완료(납품 기준 5단계 다 채움) 뒤 회사 진행 띠의 [납품하기]로만. 자동 납품은 없다.
  function deliverNow() {
    if (!P.checkQuest()) { toast(P.questBlockers()[0] || '아직 납품 기준을 다 채우지 못했어요'); buzz('warn'); return false; }
    var rep = P.deliver();   // 튜토리얼은 여기서 안 꺼진다 (정산 화면 'deliver' 안내가 뜸). 다음 의뢰를 고를 때·정산을 마칠 때 꺼짐 (API.md 10절)
    if (!rep) { toast(P.questBlockers()[0] || '지금은 납품할 수 없어요'); buzz('warn'); return false; }
    toastsEl.innerHTML = ''; // 앞선 토스트는 치운다. 납품 알림은 정산 화면 머리의 도장("납품 완료")이 대신
    buzz('best');
    go('result', true);
    return true;
  }

  // 다음 주: 회사 화면의 하단 가운데 탭. 언제든 누르면 이번 주 전투를 시작한다 (마석 0·건설 0이어도). 안 되면 이유를 토스트로
  function startWeek() {
    if (flowOn()) { buzz('tap'); go('battle', true); return; }   // 흐름 시험: 현장 운영 화면으로 (거기서 일반 판이 이어짐)
    var r = P.startBattle();
    if (!r.ok) { showMsgs(r.msgs); buzz('warn'); return; }
    buzz('tap');
    showMsgs(r.msgs);   // 막지 않는 알림 (싸울 부대 없음 · 쉬는 부대): 전투 화면 위에 토스트로
    go('battle', true);
  }

  // 흐름 시험이 켜져 있고 의뢰 진행 중인가 (API.md 15절)
  function flowOn() { try { return !!(P.flowInfo && P.flowInfo().on && RUN.phase === 'play'); } catch (e) { return false; } }
  // 진행 띠·현장 위 줄용 한 줄: 보스 검증 n/5 · 다음 보스 (흐름 시험)
  function flowLine(pr) {
    var b = pr && pr.boss;
    return pr.complete ? '<b class="ready">보스 검증 ' + pr.total + '/' + pr.total + '</b> · 홈에서 납품하세요'
      : '보스 검증 ' + pr.stage + '/' + pr.total + (b && b.name ? ' · 다음 보스: ' + esc(b.name) + ' (' + b.squads + '분대)' : '') + (b && b.tries ? ' · 도전 ' + b.tries + '번' : '');
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

  // 위쪽 줄 (회사·군단·현장 공통): 회사 이름 · 상점(취소선) · 메뉴 · 설정 톱니 / 회사 레벨 · 회사 금(영구) · 신석 · 주
  function topbar(el) {
    el.appendChild(div('topbar',
      '<span class="company">검은망치 건설</span>' +
      '<button class="topbtn nope" data-toast="' + esc(soonText('상점')) + '">상점</button>' +
      '<button class="topbtn" data-menu aria-label="메뉴">메뉴</button>' +
      '<button class="gear" data-go="settings" aria-label="설정">&#9881;&#xFE0E;</button>'));
    el.appendChild(div('resbar',
      '<span class="chip">회사 Lv ' + P.company().lv + '</span><span class="chip" data-chip="gold">회사 금 ' + money(RUN.gold) + '</span>' +
      '<span class="chip sinseok">🔷 신석 ' + RUN.gems + '</span><span class="chip accent">' + RUN.week + '주째</span>'));
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
    return '회사 금 +' + money(rw.gold || 0) + (rw.gems ? ' · 신석 +' + rw.gems : '') + ' · 회사 경험치 +' + (rw.companyExp || 0);
  }

  // ---------- 진행 띠 (회사 위) · 현장 요약 (현장 위) 공통 조각 ----------
  // 막대 한 개: 이름 · 막대 · 지금/다음 단계 기준. 기준을 채웠으면 초록
  function barHtml(label, now, need, cls) {
    var r = need ? Math.max(0, Math.min(1, now / need)) : 0;
    return '<div class="sbar' + (cls ? ' ' + cls : '') + (need != null && now >= need ? ' ok' : '') + '"><span>' + label + '</span><div class="sbar-t"><i style="width:' + Math.round(r * 100) + '%"></i></div><b>' + fmtN(now) + '/' + fmtN(need) + '</b></div>';
  }
  // 출진 요약: "출진 1층 2/3 · 2층 1/2" (열린 층만)
  function deployText() {
    var fis = P.floorsInfo().filter(function (f) { return f.open; });
    return '출진 ' + fis.map(function (f) { return f.n + '층 ' + f.units.length + '/' + f.cap; }).join(' · ');
  }
  function restingUnits() { return P.squads().concat(P.guards()).filter(function (u) { return u.resting; }); }
  // 회사 화면 맨 위 얇은 진행 띠. 의뢰 완료면 "의뢰 완료 → 납품" + [납품하기]로 바뀐다 (자동 납품 없음)
  function homeStripHtml(q) {
    var pr = P.questProgress();
    if (!pr) return '';
    var fl = flowOn();
    var h = '<div class="strip' + (pr.complete ? ' done' : '') + '" data-strip><div class="srow1"><b class="sname">' + esc(q.name) + (pr.complete ? '' : (fl ? ' · 보스 검증 ' : ' · 납품 기준 ') + pr.stage + '/' + pr.total) + '</b>' +
      '<span class="smas">마석 ' + money(pr.budget) + (P.weeklyBudget() ? ' <small>매주 +' + P.weeklyBudget() + '</small>' : '') + '</span><span class="swk">' + (fl ? '일반 ' + P.flowInfo().no + '판' : RUN.week + '주째') + '</span></div>';
    if (pr.complete) {
      h += '<div class="sdone"><b>의뢰 완료 → 납품</b><button class="btn primary" data-deliver' + (pr.canDeliver ? '' : ' aria-disabled="true"') + '>납품하기</button></div>';
      if (!pr.canDeliver) h += '<div class="pwhy">' + esc(pr.why) + '</div>';
    } else if (fl) {
      h += '<div class="snote">' + flowLine(pr) + '</div>';
    } else {
      var nx = pr.next;
      h += '<div class="sbars">' + barHtml('가치', pr.cur.value, nx.value) + barHtml('전투력', pr.cur.power, nx.power, 'p') + (nx.floor2 ? barHtml('2층 전투력', pr.cur.floor2, nx.floor2, 'p') : '') + '</div>';
    }
    if (fl) return h + '<div class="snote">' + deployText() + ' · 가치 ' + pr.cur.value + ' · 전투력 ' + pr.cur.power + '</div></div>';
    var pi = P.planInfo(), rests = restingUnits();
    h += '<div class="snote">' + (pi ? '이번 주 침입자 ' + pi.count + '명 · 최고 ' + pi.top + '급 · ' : '') + deployText() + (rests.length ? ' · <b class="zz">💤 쉬는 부대 ' + rests.length + '</b>' : '') + '</div>';
    return h + '</div>';
  }

  // ---------- 회사 탭: 사무실 무대(그대로) + 위에 얇은 진행 띠 ----------
  SCREENS.company = function (el) {
    topbar(el);
    var co = P.company(), lv = co.lv, rk = rankOf(lv);
    if (RUN.quest && RUN.phase === 'play') el.appendChild(div('', homeStripHtml(RUN.quest)));   // 위에 얇은 진행 띠 (무대는 그대로 아래에)
    el.appendChild(div('card rankcard', '<div class="rankrow"><b class="ranktitle">' + esc(rk.title || '') + '</b><span class="chip accent">회사 Lv ' + lv + '</span></div>' +
      '<div class="rankdesc small-text dim"><span>' + esc(rk.desc || '') + '</span><b>경험치 ' + co.exp + '/' + co.need + '</b></div><div class="xpbar"><i style="width:' + pct(co.exp, co.need) + '"></i></div>'));

    // 무대: 아이소메트릭 방 (그림 = stage.js SVG) + 캐릭터 자리. 바깥 틀(.stage)은 남는 높이를 채우고 방(.stagebox)은 비율을 지킨 채 가운데에 놓는다
    var stage = div('stage'), box = div('stagebox', ST.roomSvg());
    stage.appendChild(box);
    var actors = startActors(stage, box);
    stage.appendChild(div('stagetag', '<span class="chip">검은망치 건설 본사</span>'));
    el.appendChild(stage);
    wanderActors(actors, stage);

    var q = RUN.quest;
    var board = q ? { kind: 'open', go: 'board', name: '의뢰 게시판', sub: esc(q.name) }
      : RUN.phase === 'demoEnd' ? { kind: 'open', go: 'board', name: '의뢰 게시판', sub: '데모 의뢰 완료' } : { kind: 'open', go: 'contract', name: '의뢰 게시판', sub: '의뢰 고르기' };
    var gal = deliveredOnce() ? { kind: 'open', go: 'gallery', name: '작품집', sub: '납품한 던전 ' + RUN.works.length + '곳' } : { kind: 'lock', name: '작품집', cond: condText('gallery') };
    el.appendChild(div('entries', entry(board) + entry(gal) + entry({ kind: 'soon', name: '비서실' }) +
      entry({ kind: 'soon', name: '응접실' }) + entry({ kind: 'soon', name: '소장실' }) + entry({ kind: 'soon', name: '직원실' })));
  };

  // ---------- 현장 탭: 위 두 줄 요약 + 지하 단면(구역 판이 바로 보임) + 아래 [출진][건설] ----------
  // 위 두 줄 (현장·건설 모드 공통): 의뢰 이름·주·마석 / 납품 기준·가치·전투력 (의뢰 완료면 "홈에서 납품"). 숫자는 모두 P.questProgress / P.budgetLeft
  function siteHeader(q) {
    var pr = P.questProgress(), l2 = '';
    if (pr && flowOn()) l2 = flowLine(pr);
    else if (pr) l2 = pr.complete ? '<b class="ready">의뢰 완료</b> · 홈에서 납품하세요'
      : '납품 기준 ' + pr.stage + '/' + pr.total + ' · 가치 ' + fmtN(pr.cur.value) + '/' + fmtN(pr.next.value) + ' · 전투력 ' + fmtN(pr.cur.power) + '/' + fmtN(pr.next.power);
    return '<div class="fh1"><b>' + esc(q.name) + ' · ' + (flowOn() ? '일반 ' + P.flowInfo().no + '판' : RUN.week + '주째') + '</b><span class="fmas">마석 ' + money(P.budgetLeft()) + (P.weeklyBudget() ? ' <small>매주 +' + P.weeklyBudget() + '</small>' : '') + '</span></div><div class="fh2">' + l2 + '</div>';
  }
  // 층 머리: 층 이름 · 출진 n/한도 · ⚔ (층 안에 건설·출진 버튼은 두지 않는다)
  function floorHeadHtml(fi) {
    var cap = fi.cap ? '출진 ' + fi.units.length + '/' + fi.cap + (fi.fighting < fi.units.length ? ' (이번 주 ' + fi.fighting + ')' : '') : '출진 칸 없음 · 대기실을 지어요';
    return '<div class="fhead"><b>지하 ' + fi.n + '층</b><span class="fcap">' + cap + '</span><span class="fpow">⚔ ' + fmtN(fi.power) + '</span></div>';
  }
  // 지하 단면 전체: 지상 -> 열린 층(머리 + 구역 판) -> 잠긴 층(🔒 + 열림 조건, 판은 어둡게) -> 이 의뢰에 없는 층 -> 지하 3층(준비 중).
  // 구역 판 그리기는 boardFn(층 번호, 잠김, 잠김 글)이 맡는다 (현장 = 읽기만, 건설 모드 = build.js 가 미확정·끌어 놓기 칸을 붙임)
  function lockTextOf(fi, pr) { return '지하 ' + fi.n + '층: ' + (fi.lockAt ? '납품 기준 ' + fi.lockAt + '단계 달성 시 열림' + (pr ? ' (지금 ' + pr.stage + '단계)' : '') : '이 의뢰에서는 열리지 않아요'); }
  function shaftHtml(boardFn) {
    var pr = P.questProgress(), fis = P.floorsInfo(), h = '<div class="surface"><span>지상</span><small>현장 입구</small></div>';
    fis.forEach(function (fi) {
      if (fi.open) h += '<div class="floor f' + fi.n + '" data-floor-box="' + fi.n + '">' + floorHeadHtml(fi) + boardFn(fi.n, false, '') + '</div>';
      else h += '<div class="floor f' + fi.n + ' lockedfloor" data-floor-box="' + fi.n + '"><div class="fhead"><b>🔒 지하 ' + fi.n + '층</b><span class="fcap">' + (fi.lockAt ? '납품 기준 ' + fi.lockAt + '단계에서 열림' : '열리지 않아요') + '</span></div>' + boardFn(fi.n, true, lockTextOf(fi, pr)) + '</div>';
    });
    if (fis.length < 2) h += '<div class="floor f2 gate" data-f="none"><span class="nm">지하 2층</span><small>이 의뢰는 1층 현장이에요</small></div>';
    h += '<div class="floor f3 gate soon" data-f="soon"><span class="nm">지하 3층</span></div>';
    return h;
  }
  // 단면 안 눌림: 이 의뢰에 없는 층 · 지하 3층 안내 토스트
  function bindShaft(shaft) {
    shaft.querySelectorAll('.floor.gate[data-f]').forEach(function (g) {
      g.addEventListener('click', function () {
        toast(g.getAttribute('data-f') === 'soon' ? soonText('지하 3층') : '2층은 2층 의뢰에서 열려요');
        buzz('tap');
      });
    });
  }
  // 지을 수 있는 빈 구역 수 (열린 층의 방 중 빈 구역, 고정 구역 제외)
  function emptyZoneCount() {
    var Zn = window.ZONES, n = 0;
    (Zn.ALL || []).forEach(function (z) {
      if (Zn.zoneType(z) === 'room' && !RUN.site.fixed[z] && Zn.floorOpen(Zn.floorOf(z)) && RUN.site.zones[z] === 'empty') n++;
    });
    return n;
  }

  var UP_LOCK_MS = 600;   // [강화] 누른 뒤 다시 눌릴 때까지 (연타·더블탭에 두 번 차감 안 되게)
  SCREENS.field = function (el) {
    var q = RUN.quest;
    if (RUN.phase === 'demoEnd') { topbar(el); demoEndScreen(el); return; }
    if (!q) { topbar(el); el.appendChild(div('', '<button class="btn primary big" data-go="contract">의뢰 고르기</button>')); return; }
    el.classList.add('fixed');   // 화면을 꽉 채우고 단면만 세로로 스크롤 (위 요약·아래 버튼은 고정)
    var hdr = div('fhdr', siteHeader(q));
    el.appendChild(hdr);
    var shaft = div('shaft');
    var scroll = div('fscroll');
    scroll.appendChild(shaft);
    el.appendChild(scroll);
    var upSel = null;      // 강화 창이 열려 있는 방 (없으면 null)
    var upLock = false;    // [강화]를 누른 직후 잠깐 잠금 (빠른 두 번 누르기에 두 번 차감 안 됨)
    var upTimer = 0;
    var sheet = div('upsheet');
    sheet.hidden = true;
    // 위 요약 + 지하 단면 다시 그리기 (강화 뒤 마석·단계 표시를 함께 갱신. 처음 그릴 때도 이걸 씀)
    function drawField() {
      hdr.innerHTML = siteHeader(q);
      var dbg = ZV().debugData ? ZV().debugData() : null;   // ?debug 일 때만: 분대 색 경로 선 + 문 통과 수 (평소엔 통로(파이프)만 보인다. 문을 끄는 건 건설 모드에서)
      shaft.innerHTML = shaftHtml(function (n, locked, text) {
        return ZV().boardHtml ? ZV().boardHtml({ zones: RUN.site.zones, units: RUN.site.units, floor: n, noYard: true, locked: locked, lockText: text,
          sel: upSel, counts: dbg && dbg.counts, routes: dbg && dbg.routes }) : '';
      });
      bindShaft(shaft);
    }
    drawField();
    // ----- 시설 강화 창 (아래쪽 상세 창): 값은 P.upgradeInfo 만 읽고, [강화] = P.upgradeFacility 한 번. 닫기·바깥 누르기는 아무 함수도 안 부름 -----
    function upRow(label, html) { return '<div class="uprow"><span class="uplab">' + label + '</span><span class="upval">' + html + '</span></div>'; }
    function upUnitsText(inf) {
      var us = inf.units || [], names = us.slice(0, 3).map(function (u) { return esc(uname(u)) + (u.kind === 'guard' ? '' : ' ' + u.count + '명'); }).join(', ');
      return names + (us.length > 3 ? ' 외 ' + (us.length - 3) : '');
    }
    function upSheetHtml(inf) {
      var top = !inf.effectNext, h = '<div class="upbody">';
      h += '<div class="uphead"><b>' + esc(inf.name) + ' · ' + esc(inf.facName) + '</b><span class="uplv">단계 ' + inf.level + '/' + inf.max + (inf.level > 1 ? ' (+' + (inf.level - 1) + ')' : '') + '</span></div>';
      h += upRow('효과', top ? esc(inf.effectNow ? inf.effectNow.text : '') + ' <b class="uptop">최고 단계</b>'
        : esc(inf.effectNow.text) + ' → <b>' + esc(inf.effectNext.text) + '</b>');
      if (inf.kind === 'den') {
        h += upRow('출진 부대', inf.noEffect ? '<b class="upwarn">출진 부대가 없어 효과 없음</b>' : upUnitsText(inf));
        h += '<div class="upnote">이 방에서만 적용돼요 (전투 체력, 영구 성장 아님)</div>';
      }
      if (top) h += upRow('비용', '없음 · 남은 마석 <b class="mas">' + money(inf.budget) + '</b>');
      else if (inf.budgetAfter < 0) h += upRow('비용', '마석 <b>' + money(inf.cost) + '</b> · 지금 마석 <b class="mas">' + money(inf.budget) + '</b> <b class="upwarn">(모자람)</b>');
      else h += upRow('비용', '마석 <b>' + money(inf.cost) + '</b> · 남을 마석 <b class="mas">' + money(inf.budget) + ' → ' + money(inf.budgetAfter) + '</b>');
      h += upRow('전투력', top ? fmtN(inf.powerNow) : fmtN(inf.powerNow) + ' → <b>' + fmtN(inf.powerAfter) + '</b>' +
        (inf.powerAfter === inf.powerNow && inf.powerGain > 0 ? ' <small class="upgain">(+' + fmtN(inf.powerGain) + ')</small>' : ''));
      if (inf.pass < 0.2) h += '<div class="upnote upwarn">이 방은 지나가는 침입자가 적어요 — 문 배치부터 바꿔 보세요</div>';
      if (!top) h += '<div class="upnote dim">전투력은 예상이에요. 실제 전투 결과는 달라질 수 있어요</div>';
      return h + '</div>';
    }
    function drawSheet() {
      if (!upSel) { sheet.hidden = true; sheet.innerHTML = ''; el.classList.remove('upopen'); return; }
      var inf = P.upgradeInfo(upSel), off = !inf.ok || upLock;
      sheet.hidden = false;
      el.classList.add('upopen');
      sheet.innerHTML = upSheetHtml(inf) + '<div class="upfoot"><span class="upwhy">' + (inf.ok || upLock ? '' : esc(inf.why)) + '</span>' +
        '<button class="upbtn" type="button" data-up-close>닫기</button>' +
        '<button class="upbtn main' + (off ? ' off' : '') + '" type="button" data-up-do aria-disabled="' + (off ? 'true' : 'false') + '">강화' + (inf.cost ? ' · 마석 ' + inf.cost : '') + '</button></div>';
      tutPlace();
    }
    function showSel() {   // 선택한 방이 창에 가리지 않게 단면을 맞춰 준다
      var c = upSel ? shaft.querySelector('.zc[data-z="' + upSel + '"]') : null;
      if (!c) return;
      var sr = scroll.getBoundingClientRect(), cr = c.getBoundingClientRect();
      if (cr.bottom > sr.bottom - 6) scroll.scrollTop += cr.bottom - sr.bottom + 6;
      else if (cr.top < sr.top + 6) scroll.scrollTop -= sr.top - cr.top + 6;
    }
    function openUp(z) {
      upSel = z;
      drawField(); drawSheet(); showSel();
      tutPlace();
    }
    function closeUp() {
      if (!upSel) return;
      upSel = null;
      drawField(); drawSheet();
    }
    function doUp() {
      if (!upSel || upLock) return;
      var inf = P.upgradeInfo(upSel);
      if (!inf.ok) { toast(inf.why); buzz('warn'); drawSheet(); return; }
      upLock = true;   // 이 다음 눌림은 잠깐 막는다 (타이머가 풀어 줌)
      var r = P.upgradeFacility(upSel);
      if (r.ok) { buzz('good'); toast(r.msg); stageToast(r.stages); var pr = P.questProgress(); if (pr && pr.complete) toast('의뢰 완료! 홈의 진행 띠에서 [납품하기]를 누르세요'); }
      else { toast(r.msg); buzz('warn'); }
      drawField(); drawSheet(); showSel();
      flashUp(sheet.querySelector('.uplv'));
      clearTimeout(upTimer);
      upTimer = setTimeout(function () { upLock = false; if (upSel) drawSheet(); }, UP_LOCK_MS);
    }
    leaveHooks.push(function () { clearTimeout(upTimer); });
    sheet.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-up-close],[data-up-do]') : null;
      if (!t) return;
      if (t.hasAttribute('data-up-close')) { buzz('tap'); closeUp(); return; }
      if (t.getAttribute('aria-disabled') === 'true') { buzz('warn'); return; }
      doUp();
    });
    // 바깥 누르기 = 닫기 (판의 구역과 창 안은 빼고. 구역은 아래 판 눌림이 처리)
    el.addEventListener('click', function (e) {
      if (!upSel || !e.target.closest) return;
      var path = e.composedPath ? e.composedPath() : [];   // 눌린 뒤 창·판이 다시 그려져 target 이 떨어져 나갔어도 경로는 남아 있다
      if (path.indexOf(sheet) >= 0 || path.indexOf(shaft) >= 0) return;
      closeUp();
    });
    // 구역을 누르면: 지은 함정·대기실은 강화 창, 그 밖(빈 방·입구·고정 구역 등)은 이름·시설 한 줄 (건설은 [건설] 모드에서)
    shaft.addEventListener('click', function (e) {
      var lk = e.target.closest ? e.target.closest('.zlock') : null;   // 잠긴 층: 열림 조건
      if (lk) { toast('🔒 ' + (lk.querySelector('span') || lk).textContent); buzz('tap'); return; }
      var c = e.target.closest ? e.target.closest('.zc[data-z]') : null;
      if (!c) return;
      var z = c.getAttribute('data-z'), f = window.ZONES.FAC[RUN.site.zones[z]];
      var ui = f ? P.upgradeInfo(z) : null;
      if (ui && ui.code !== 'target' && ui.code !== 'locked') { buzz('tap'); openUp(z); return; }
      closeUp();
      if (f) { toast(zoneName(z) + ' — ' + f.name); buzz('tap'); }
    });
    el.appendChild(sheet);
    var empties = emptyZoneCount();
    el.appendChild(div('factions',
      '<button class="fbtn" data-go="sortie">출진<small>' + (RUN.site.auto ? '자동 편성 켬' : '자동 편성 꺼짐') + '</small></button>' +
      '<button class="fbtn main" data-go="build">건설<small>빈 구역 ' + empties + '곳</small></button>'));
    if (flowOn()) {   // 흐름 시험: 정비 화면에서 운영(일반 침입)으로 · 보스 도전
      var bi = P.bossInfo(), fr = div('factions flowacts',
        '<button class="fbtn main" data-go="battle">운영 ▶<small>일반 침입 자동 반복</small></button>' +
        '<button class="fbtn" data-fboss' + (bi && bi.canChallenge ? '' : ' aria-disabled="true"') + '>보스 도전' + (bi && !bi.done ? ' ' + bi.stage : '') + '<small>' + esc(bi ? (bi.done ? '모두 통과' : bi.name) : '') + '</small></button>');
      fr.querySelector('[data-fboss]').addEventListener('click', function () {
        var r = P.challengeBoss();
        if (!r.ok) { toast(r.msg); buzz('warn'); return; }
        buzz('warn'); go('battle', true);
      });
      el.appendChild(fr);
    }
    el.appendChild(div('soonline', '<button class="soonbtn" data-toast="' + esc(soonText('포로 수용소')) + '">포로 수용소</button>'));
  };

  // ---------- 출진 화면 (현장 탭 입구): 층 고르기 · 자동 편성 · 출진 칸 · 대기/다른 층 부대 ----------
  // 규칙(API.md 7절): 부대·친위대를 층에 출진시킨다. 한도 = min(층 한도, 그 층 대기실 자리 합). 한 부대는 한 층에만. 친위대도 한 칸. 쉬는 부대는 못 세움.
  // 손으로 바꾸면 자동 편성이 꺼진다. 안 되는 일은 P.sortieUnit이 이유를 돌려주므로 그 글을 토스트로 보여 준다.
  var curFloor = 1;   // 지금 보는 층 (현장 입구·건설 화면과 같이 씀)
  SCREENS.sortie = function (el) {
    el.appendChild(head('출진', 'field'));
    var box = div('sortiebox');
    el.appendChild(box);
    var floors = RUN.site ? RUN.site.floors : 1;
    if (curFloor < 1 || curFloor > floors) curFloor = 1;

    function unitRow(u, fi) {
      var where = u.floor ? u.floor + '층 출진 중' : '대기';
      var why = fi.cap === 0 ? '대기실 없음' : u.resting ? '쉬는 중' : fi.units.length >= fi.cap && u.floor !== fi.n ? '한도 참' : '';
      return '<div class="card urow' + (u.kind === 'guard' ? ' guard' : '') + (u.resting ? ' rest' : '') + '"><div class="sinfo"><div class="utop"><b>' + esc(uname(u)) + '</b>' +
        (u.kind === 'guard' ? '<span class="chip accent">친위대</span>' : '') + '</div>' +
        '<div class="utags"><span class="chip">' + esc(u.tribeName) + '</span>' + (u.kind === 'guard' ? '' : '<span class="chip">' + u.count + '/' + u.cap + '명</span>') +
        '<span class="chip">Lv ' + u.lv + '</span><span class="chip' + (u.floor ? ' ok' : '') + '">' + where + '</span>' +
        (u.resting ? '<span class="chip warn">💤 다음 주 복귀</span>' : '') + '</div><div class="nums">' + statLine(u) + '</div></div>' +
        '<button class="btn small' + (why ? ' poor' : ' primary') + '" data-in="' + u.id + '"' + (why ? ' aria-disabled="true" data-why="' + esc(why) + '"' : '') + '>' + fi.n + '층 출진</button></div>';
    }
    function draw() {
      var fis = P.floorsInfo(), fi = fis[curFloor - 1] || fis[0], pr = P.questProgress(), h = '';
      if (!fi) { box.innerHTML = '<div class="card dim">진행 중인 의뢰가 없어요</div>'; return; }
      // 층 고르기
      h += '<div class="seg floortabs">' + fis.map(function (f) {
        return '<button data-fl="' + f.n + '"' + (f.n === fi.n ? ' class="on"' : '') + '>' + (f.open ? '' : '🔒 ') + f.n + '층' + (f.open ? ' <small>⚔ ' + f.power + '</small>' : '') + '</button>';
      }).join('') + '</div>';
      // 자동 편성
      h += '<div class="card autobox"><div class="toggle"><span><b>자동 편성</b><small class="dim">빈 칸이 생기면 쉬지 않는 부대를 전투력 순으로 채워요. 손으로 바꾸면 꺼져요.</small></span>' +
        '<button class="sw' + (RUN.site.auto ? ' on' : '') + '" data-auto aria-label="자동 편성" aria-pressed="' + (RUN.site.auto ? 'true' : 'false') + '"></button></div></div>';
      if (!fi.open) {
        h += '<div class="card lockq"><h3>🔒 지하 ' + fi.n + '층</h3><div class="small-text dim">' + (fi.lockAt ? '납품 기준 ' + fi.lockAt + '단계를 달성하면 열려요' + (pr ? ' (지금 ' + pr.stage + '단계)' : '') : '이 의뢰에서는 열리지 않아요') +
          '</div></div>';
        box.innerHTML = h; return;
      }
      // 이 층 출진 칸
      var cells = '';
      for (var i = 0; i < fi.cap; i++) {
        var u = fi.units[i];
        cells += u ? '<button class="card sslot filled' + (u.kind === 'guard' ? ' guard' : '') + (u.resting ? ' rest' : '') + '" data-out="' + u.id + '"><b>' + esc(uname(u)) + '</b>' +
          '<small>' + (u.kind === 'guard' ? '친위대' : u.count + '명') + ' · Lv ' + u.lv + '</small>' +
          '<small>' + (u.placed ? esc(zoneName(u.placed)) + '에 서요' : '자리 대기') + '</small>' + (u.resting ? '<small class="zz">💤 다음 주 복귀</small>' : '') +
          '<small class="out">눌러서 빼기</small></button>' : '<div class="card sslot empty"><small>빈 칸</small><small>아래에서 골라요</small></div>';
      }
      h += '<div class="card"><div class="stat"><span><b>지하 ' + fi.n + '층 출진</b> <small class="dim">(한도 ' + fi.cap + ' = 층 한도 ' + fi.capMax + ' · 대기실 자리 ' + fi.slots + ')</small></span><b>' + fi.units.length + '/' + fi.cap + '</b></div>' +
        '<div class="stat"><span>층 전투력 ⚔</span><b>' + fi.power + '</b></div>' +
        (fi.cap ? '<div class="sslots">' + cells + '</div>' :
          '<div class="small-text dim" style="margin-top:6px">이 층에는 몬스터 대기실이 없어서 출진 칸이 0이에요. 건설에서 대기실을 지으면 칸이 생겨요.</div><button class="btn" style="margin-top:6px" data-tobuild>' + fi.n + '층 건설로 →</button>') + '</div>';
      // 부대·친위대 목록 (이 층 밖에 있는 것)
      var all = P.squads().concat(P.guards()).filter(function (u) { return u.floor !== fi.n && (u.kind === 'guard' || u.count > 0); });
      all.sort(function (a, b) { return (a.resting ? 1 : 0) - (b.resting ? 1 : 0) || (a.kind === 'guard' ? 1 : 0) - (b.kind === 'guard' ? 1 : 0); });
      h += '<h3 class="seclabel">대기 · 다른 층 부대 (' + all.length + ')</h3>' + (all.length ? all.map(function (u) { return unitRow(u, fi); }).join('') :
        '<div class="card dim small-text">출진시킬 부대가 더 없어요. 군단 탭에서 부대를 조달해요 (마석).</div>');
      h += '<div class="small-text dim">부대 하나는 한 층에만 설 수 있어요. 친위대도 한 칸을 차지해요. 큰 피해를 입고 퇴각한 부대는 다음 주까지 쉬어요.</div>';
      box.innerHTML = h;
    }
    function result(r) {
      toast(r.msg || (r.ok ? '완료' : '할 수 없어요'));
      if (r.ok) { buzz('tap'); stageToast(r.stages); } else buzz('warn');
      draw();
    }
    box.addEventListener('click', function (e) {
      var q = function (a) { return e.target.closest ? e.target.closest('[' + a + ']') : null; }, b;
      if ((b = q('data-fl'))) { curFloor = +b.getAttribute('data-fl'); buzz('tap'); draw(); return; }
      if ((b = q('data-auto'))) { result(P.setAutoDeploy(!RUN.site.auto)); return; }
      if ((b = q('data-in'))) { result(P.sortieUnit(b.getAttribute('data-in'), curFloor)); return; }
      if ((b = q('data-out'))) { result(P.withdrawUnit(b.getAttribute('data-out'))); return; }
      if ((b = q('data-tobuild'))) { buzz('tap'); go('build', true); }
    });
    draw();
  };

  // ---------- 의뢰 게시판 (회사 탭 입구): 지금 받은 의뢰 한 장. 새 의뢰는 납품한 뒤에 고른다 ----------
  SCREENS.board = function (el) {
    el.appendChild(head('의뢰 게시판', 'company'));
    var q = RUN.quest;
    if (!q && RUN.phase === 'demoEnd') { el.appendChild(div('card dim', '준비한 데모 의뢰를 모두 납품했어요. 다음 의뢰는 아직 준비 중이에요.')); return; }
    if (!q) { el.appendChild(div('card dim', '진행 중인 의뢰가 없어요')); el.appendChild(div('', '<button class="btn primary" data-go="contract">의뢰 고르기</button>')); return; }
    var pr = P.questProgress();
    var h = '<div class="qhead"><span class="chip accent">' + questTag(q) + '</span><h3>' + esc(q.name) + '</h3></div>';
    if (q.client) h += '<div class="qclient">' + (q.client.kind ? '<span class="chip">' + esc(q.client.kind) + '</span> ' : '') + '<b>' + esc(q.client.name || '') + '</b></div>';
    h += siteHtml(q) + fixedHtml(q);
    if (q.attr) h += '<div class="qattr"><div class="qattr-h"><span class="chip">던전 속성</span> <b>' + esc(q.attr.label || '') + '</b></div>' + (q.attr.effect ? '<div class="small-text">' + esc(q.attr.effect) + '</div>' : '') + '</div>';
    h += '<div class="poplabel qlabel">납품 기준 ' + q.stage + '/' + q.stages.length + (pr && pr.complete ? ' · 의뢰 완료' : '') + '</div>' + stagesHtml(q, q.stage) +
      '<div class="stat"><span>마석</span><b>' + money(P.budgetLeft()) + ' / ' + money(RUN.site.budgetStart) + '</b></div>' +
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
        '<div class="uinfo"><div class="utop"><b>' + esc(uname(u)) + '</b>' + (guard ? '<span class="chip accent">친위대</span>' : '') + '</div>' +
        '<div class="utags"><span class="chip">' + esc(u.tribeName) + '</span>' + (guard ? '' : '<span class="chip">' + u.count + '/' + u.cap + '명</span>' + (u.free ? '<span class="chip">무료 기본</span>' : '')) +
        '<span class="chip">Lv ' + u.lv + '</span><span class="chip">등급 ' + P.monGrade(u.lv) + '</span>' +
        (u.floor ? '<span class="chip ok">' + u.floor + '층 출진' + (u.placed ? ' · ' + esc(zoneName(u.placed)) : '') + '</span>' : '<span class="chip">대기</span>') +
        (u.resting ? '<span class="chip warn">💤 다음 주 복귀</span>' : '') + '</div>' +
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
          (full ? '정원 가득' : '1명 보충 (마석 ' + (rf ? rf.cost : '?') + ')') + '</button></div>';
      }
      return h + '</div>';
    }
    function tribeCardHtml(t) {
      var ti = P.tribeInfo(t.id), pc = P.procureInfo(t.id), c = gemCost(ti);
      var upBtn = !ti || ti.contracted === false ? '<button class="btn small" disabled>사용권 필요</button>'
        : ti.next == null || c == null ? '<button class="btn small" disabled>최대 단계</button>'
        : '<button class="btn small primary' + (ti.canAfford ? '' : ' poor') + '" data-uptribe="' + t.id + '"' + (ti.canAfford ? '' : ' aria-disabled="true"') + '>신석 강화 (신석 ' + c + ')</button>';
      var prBtn = pc ? '<button class="btn small primary' + (pc.canAfford ? '' : ' poor') + '" data-procure="' + t.id + '"' + (pc.canAfford ? '' : ' aria-disabled="true"') + '>새 부대 조달 (마석 ' + pc.cost + ')</button>' : '';
      return '<div class="card tribecard" data-tid="' + t.id + '"><div class="tribehead"><b>' + esc(t.name) + '</b><span class="chip">' + esc(t.role) + '</span>' +
        '<span class="chip">신석 강화 Lv ' + (ti ? ti.lv + '/' + ti.max : 0) + '</span></div>' +
        '<div class="small-text">' + esc(t.feature) + '</div><div class="small-text dim">' + esc(t.talk) + '</div>' +
        (ti ? '<div class="small-text dim">지금 ' + esc(ti.effect) + (ti.next ? ' · 다음 ' + esc(ti.next) : '') + '</div>' : '') +
        '<div class="row2">' + prBtn + upBtn + '</div></div>';
    }
    function draw() {
      var gOpen = deliveredOnce();
      segEl.innerHTML = entry({ kind: 'open', name: '부대·부족', sub: '조달·신석 강화', on: corpsTab === 'mon', attrs: ' data-t="mon"' }) +
        (gOpen ? entry({ kind: 'open', name: '친위대', sub: '최대 ' + P.GUARD_MAX + '명', on: corpsTab === 'guard', attrs: ' data-t="guard"' })
               : entry({ kind: 'lock', name: '친위대', cond: condText('guard') })) +
        entry({ kind: 'soon', name: '훈련' }) + entry({ kind: 'soon', name: '대장간' }) + entry({ kind: 'soon', name: '몬스터 숙소' });
      var s = '';
      if (corpsTab === 'mon') {
        s += '<div class="gemnote"><span class="chip maseok">🟣 마석 ' + money(P.budgetLeft()) + '</span><span class="chip sinseok">🔷 신석 ' + RUN.gems + '</span>' +
          '<span class="small-text dim">부대 조달·보충은 마석, 신석 강화는 신석을 써요. 신석 강화는 다음 현장에도 남고, 현장 부대는 납품 때 의뢰인에게 넘어가요.</span></div>';
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
    el.appendChild(div('dim small-text', '되돌릴 수 없는 일은 길게 눌러야 동작합니다. 주·회사 금·신석·부대·친위대·의뢰가 모두 처음으로 돌아갑니다.'));
    el.appendChild(div('mt-auto dim small-text', '버전: D1 첫 데모 (4차: 탭 구조·회사 진행 띠·건설 모드 끌어 놓기, 임시 숫자)'));
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
    el.appendChild(head(r ? '납품·정산' : (RUN.history.length === 0 ? '첫 의뢰를 고르세요' : '의뢰를 고르세요')));

    if (r) {
      el.appendChild(div('stamp', '납품 완료'));
      el.appendChild(div('dim small-text', r.quest.name + ' · ' + r.weeks + '주 · 가치 ' + r.value + ' · 전투력 ' + r.power + ' · 건설 ' + r.builds + '회'));
      var work = r.work;
      el.appendChild(div('card payout',
        '<h3>정산</h3>' +
        '<div class="stat"><span>의뢰 보수</span><b>회사 금 +' + money(r.gold) + (r.gems ? ' · 신석 +' + r.gems : '') + '</b></div>' +
        '<div class="stat"><span>회사 금</span><b>' + money(r.goldBefore) + ' → ' + money(RUN.gold) + '</b></div>' +
        (r.gems ? '<div class="stat"><span>신석</span><b>' + r.gemsBefore + ' → ' + RUN.gems + '</b></div>' : '') +
        '<div class="stat"><span>회사 경험치</span><b>+' + r.companyExp + '</b></div>' +
        '<div class="stat total"><span>회사 레벨</span><b>' + coText(r.companyBefore) + ' → ' + coText(r.companyAfter) + '</b></div>' +
        '<div class="stat"><span>걸린 기간</span><b>' + r.weeks + '주</b></div>' +
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
    }

    var list = P.offerQuests(), lk = P.lockedQuest();
    if (!demoEnd) el.appendChild(div('qtitle', (r ? '<h3>' + (list.length ? '새 의뢰를 고르세요' : '새 의뢰') + '</h3>' : '') + '<div class="dim small-text">' +
      (list.length ? '카드를 누르면 바로 시작해요. 한 장만 고르고, 기한은 없어요.' : '지금 받을 수 있는 의뢰가 없어요.') + '</div>'));
    var picked = false;
    list.forEach(function (q) {
      el.appendChild(questCard(q, function (qq) {
        if (picked) return;
        picked = true;
        if (P.pickQuest(qq, ids.slice())) { buzz('good'); toast('새 부지에서 시작: ' + qq.name); go(tutOn() ? 'company' : 'field', true); }   // 첫 의뢰(튜토리얼) = 회사에서 시작 -> 현장 탭 안내
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
        tutEnd(false); toastsEl.innerHTML = ''; buzz('best'); go('field', true);
      });
      el.appendChild(fin);
    }
    if (r) buzz('stamp');
  }

  // ---------- 데모 끝 (phase 'demoEnd'): 현장 탭 자리에 "데모는 여기까지" ----------
  // 다음 현장 예고(🔒 지하 3층 그림) · 지금까지의 기록 · [처음부터 다시] = P.reset(). 회사·군단 탭과 작품집은 그대로 볼 수 있다.
  function demoEndScreen(el) {
    var ds = P.demoState(), co = P.company();
    el.appendChild(div('card demoend', '<h3>데모는 여기까지예요</h3><div class="small-text">' + esc(String(ds.msg || '').replace('데모는 여기까지예요.', '').trim() || '플레이해 주셔서 고마워요!') + '</div>' +
      '<div class="stat"><span>납품한 던전</span><b>' + RUN.works.length + '곳</b></div><div class="stat"><span>회사 레벨</span><b>Lv ' + co.lv + '</b></div>' +
      '<div class="stat"><span>걸린 기간</span><b>' + RUN.week + '주째</b></div><div class="stat"><span>군단 친위대</span><b>' + RUN.guards.length + '/' + P.GUARD_MAX + '명</b></div>'));
    // 납품한 층: 끝낸 의뢰들 중 가장 깊은 층까지 (지금 데모는 1층 의뢰만 열려 있어 1층). 그 아래 한 층은 🔒 준비 중
    var BDm = window.BATTLE_DATA, deep = 1, doneFloors = '';
    ((BDm && BDm.QUESTS) || []).forEach(function (d) { if (RUN.doneQuests.indexOf(d.key) >= 0) deep = Math.max(deep, d.floors | 0); });
    for (var fl = 1; fl <= deep; fl++) doneFloors += '<div class="floor f' + Math.min(fl, 2) + ' done"><div class="fhead"><b>지하 ' + fl + '층</b><span>✓ 납품 완료</span></div></div>';
    el.appendChild(div('shaft demoshaft',
      '<div class="surface"><span>다음 현장 예고</span><small>더 깊은 의뢰가 기다려요</small></div>' + doneFloors +
      '<div class="floor f3 gate lockedfloor"><div class="flocktxt"><span class="nm">🔒 지하 ' + (deep + 1) + '층</span><small>' + esc(soonText('지하 3층')) + '</small></div></div>'));
    el.appendChild(div('dim small-text', '이 다음은 새 현장·마계·내 집이 차례로 열려요. 회사·군단 탭은 그대로 둘러볼 수 있어요.'));
    var rs = div('', '<button class="btn primary big" data-restart>처음부터 다시</button>');
    rs.querySelector('button').addEventListener('click', function () {
      P.reset(); tut.local = {}; tut.off = false; tutEnd(false); toast('처음부터 다시 시작해요'); buzz('good'); go('contract', true);
    });
    el.appendChild(rs);
  }
  SCREENS.contract = deliverScreen;
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
  // shell.js 가 직접 그리는 화면의 단계 (건설·전투 화면은 build.js·battle.js 가 api.tutStart 로)
  function tutCheck(name) {
    if (!tutOn()) return;
    if (name === 'contract' && RUN.phase === 'choose') tutStart('welcome', { target: '#view .card.contract' });
    else if (name === 'result' && RUN.phase === 'settle') tutStart('deliver', { target: '#view .payout' });
    else if (RUN.phase === 'play' && RUN.quest) {
      // 한 번에 하나만 반짝: 회사 [다음 주] 전에 현장 탭 -> [건설] -> (건설 화면: 추천 칸 + 대기실 끌기 -> [건설]) -> [홈] -> [다음 주]
      var done = P.checkQuest() || (P.questProgress() && P.questProgress().complete);
      if (name === 'company') {
        if (done) tutStart('complete', { target: '#view [data-deliver]' });
        else if (RUN.site.builds === 0) tutStart('tofield', { target: '#tabs [data-go="field"]' });
        else tutStart('nextweek', { target: '#tabs [data-week]' });
      } else if (name === 'field') {
        if (done || RUN.site.builds > 0) tutStart('tohome', { target: '#tabs [data-go="company"]' });
        else tutStart('build', { target: '#view [data-go="build"]' });
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

  // ---------- 화면 플러그인 (화면을 별도 파일로 뺄 때: battle.js) ----------
  // 별도 파일은 SCREEN_PLUGINS.이름 = function (api) { return function (el) {...}; } 로 등록한다.
  // api.onLeave(fn): 다른 화면으로 나갈 때 한 번 불러 준다 (타이머·루프 정리용).
  var leaveHooks = [];
  var API = {
    toast: toast, buzz: buzz, fxRandom: fxRandom, div: div, go: go, onLeave: function (fn) { leaveHooks.push(fn); },
    // 건설 화면용 (build.js): 위 요약 두 줄 · 지하 단면(구역 판은 build.js가 그림) · 단면 안내 눌림
    head: head, questTag: questTag, stageToast: stageToast, fixedHtml: fixedHtml, stagesHtml: stagesHtml,
    siteHeader: siteHeader, shaftHtml: shaftHtml, bindShaft: bindShaft,
    unitName: function (id) { var u = P.unitById(id); return u ? uname(u) : ''; },
    floor: function () { return curFloor; }, setFloor: function (n) { curFloor = n; },   // 지금 보는 층 (건설 화면 ↔ 출진 화면)
    // 튜토리얼 (build.js·battle.js): 단계 보이기 · 끝내기(본 것으로 기록) · 떠 있나 · 건설 화면 강조 구역
    tutPlace: tutPlace, tutStart: tutStart, tutDone: function (id) { if (tutActive(id)) tutEnd(true); }, tutActive: tutActive, tutZones: tutZones,
    // 전투 화면용: 하단 탭 막대 자리 (전투 시작 버튼이 가운데 큰 버튼 자리에 오게 battle.js가 여기에 채운다)
    bar: function () { return tabsEl; },
    // 전투 화면용: 결과 반영(한 번만, 결과표 내용을 돌려줌) / 결과표에서 현장으로
    finishBattle: function (result) { return P.applyBattle(result); },
    backHome: function () { go('company', false); },   // 결과표 뒤 = 홈 (진행 띠에서 바로 [다음 주] · [납품하기])
    rerender: function () { render(); }   // 흐름 시험: 같은 화면을 새로 그림 (다음 일반 판·보스 도전)
  };
  var plugins = window.SCREEN_PLUGINS || {};
  Object.keys(plugins).forEach(function (k) { SCREENS[k] = plugins[k](API); });

  // ---------- 화면 바꾸기 ----------
  // 화면 지킴이: 상태에 맞지 않는 화면이면 맞는 화면으로 바꾼다 (주소 기록은 덮어씀)
  function guardScreen(name) {
    var to = ALIAS[name] || name;
    if (!SCREENS[to]) to = 'field';
    if (RUN.phase === 'settle') to = 'result';                         // 납품 직후엔 정산부터
    else if (RUN.phase === 'play' && RUN.battling && (!flowOn() || P.flowInfo().mode === 'boss')) to = 'battle';   // 전투를 시작했으면 끝날 때까지 전투 화면 (흐름 시험은 보스 판만)
    else if (to === 'result') to = 'field';
    else if (RUN.phase === 'demoEnd' && ['build', 'battle', 'sortie', 'contract'].indexOf(to) >= 0) to = 'field'; // 데모 끝: 현장 탭 자리에 "데모는 여기까지" 화면
    else if (RUN.phase === 'choose' && (to === 'build' || to === 'battle' || to === 'sortie')) to = 'contract'; // 의뢰 없이 건설·출진·전투 불가
    else if (RUN.phase === 'play' && to === 'contract') to = 'field';
    else if (to === 'battle' && !(RUN.phase === 'play' && (RUN.battling || flowOn()))) to = 'field'; // 다음 주를 눌러야만 전투 (흐름 시험: 진행 중이면 늘 현장 운영)
    else if (bootCheck && (to === 'field' || to === 'company') && RUN.phase === 'choose') to = 'contract'; // 켜자마자 의뢰가 없으면 바로 고르게
    else if (to === 'corps' && !corpsOpen()) to = 'field';             // 군단은 첫 전투 뒤에 열림
    else if (to === 'gallery' && !deliveredOnce()) to = 'company';     // 작품집은 첫 납품 뒤에 열림
    bootCheck = false;
    if (to !== name) history.replaceState(null, '', '#' + to);
    return to;
  }
  var bootCheck = true;
  var lastName = '';
  var lastTab = 'company';   // 설정 등에서 뒤로 갈 곳 (마지막으로 본 탭 화면)
  var corpsWas = null;     // 군단 탭이 방금 열렸는지 알아채는 용 (열리면 토스트 한 번)

  function render() {
    leaveHooks.splice(0).forEach(function (fn) { fn(); });
    var name = guardScreen((location.hash || '#company').slice(1));   // 켜면 회사(홈)부터
    tutLeave(name);
    var keep = name === lastName && !animateNext ? view.scrollTop : 0; // 같은 화면을 다시 그릴 땐 스크롤 유지
    lastName = name;
    if (TAB_IDS.indexOf(name) >= 0 && name !== 'build') lastTab = name;
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

  // 하단 막대: 탭 화면(회사·군단·현장·건설 모드)에서 5개 탭 (마계 · 군단 · 회사 · 현장 · 내 집). 지금 보는 탭만 윗줄 표시(건설 모드 = 현장). 전투 화면에서는 비워 두고 battle.js가 채움. 그 외 화면은 숨김.
  //  열림 = 눌러 이동 · 🔒 = 열림 조건 토스트 · 취소선 = 준비 중 토스트
  //  가운데 칸(회사): 회사 화면이면 [다음 주 ▶] (진행 중인 의뢰가 있을 때), 다른 화면이면 [홈] (회사로). 설명 글은 붙이지 않는다.
  function tabState(t) { return t.state === 'gate' ? (corpsOpen() ? 'open' : 'lock') : t.state; }
  function drawTabs(name) {
    tabsEl.className = '';
    var now = corpsOpen();
    if (corpsWas === false && now) toast('군단이 열렸어요!');
    corpsWas = now;
    if (name === 'battle') { tabsEl.hidden = false; tabsEl.className = 'inbattle'; tabsEl.innerHTML = ''; return; }
    tabsEl.hidden = TAB_IDS.indexOf(name) < 0;
    var shown = name === 'build' ? 'field' : name;   // 건설 모드는 현장 탭
    tabsEl.innerHTML = TABS.map(function (t) {
      if (t.id === 'company') {
        if (name === 'company' && RUN.phase === 'play' && RUN.quest) return '<button class="tab-week" data-week><span class="nm">' + (flowOn() ? '운영 ▶' : '다음 주 ▶') + '</span></button>';
        return '<button class="open' + (name === 'company' ? ' on' : '') + '" data-go="company"><span class="nm">홈</span></button>';
      }
      var st = tabState(t);
      var attr = st === 'open' ? ' data-go="' + (t.id === 'field' && flowOn() ? 'battle' : t.id) + '"'
        : st === 'lock' ? ' data-toast="' + esc('🔒 ' + t.label + ': ' + condText(t.id)) + '"'
        : ' data-toast="' + esc(soonText(t.label)) + '"';
      return '<button class="' + st + (st === 'open' && t.id === shown ? ' on' : '') + '"' + attr + '><span class="nm">' + (st === 'lock' ? '🔒 ' : '') + t.label + '</span></button>';
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
    if (t.hasAttribute('data-floor')) curFloor = +t.getAttribute('data-floor') || 1;   // 입구·출진 칸을 누르면 그 층으로 맞춘다 (건설·출진 화면이 같이 씀)
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
  // 옛 v6 저장을 새 판으로 바꿨으면 첫 화면에서 한 번 알린다 (P.takeNotice 는 읽으면 지움)
  try { var notice = P.takeNotice(); if (notice) toast(notice); } catch (e) { /* 안내가 없는 환경: 무시 */ }
})();

