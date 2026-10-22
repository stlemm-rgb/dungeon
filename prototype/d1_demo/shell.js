/* D1 첫 데모 화면 틀 (순수 JS, 임시 숫자·임시 문구). C1을 복사해 하단 탭 5개 구조로 바꾸는 중 (1차 = 화면 틀)
 *
 * 화면 목록과 이동 규칙
 *  - 한 페이지 안에서 주소 끝의 해시(#field 등)로 화면을 바꾼다. 브라우저 뒤로 가기 = 이전 화면
 *    (나중에 안드로이드 뒤로 버튼과 연결). 예전 이름 #home = 현장, #units = 군단은 그대로 받아서 옮겨 준다 (build.js·battle.js가 아직 'home'으로 돌아옴).
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
 *  - 새 로직 함수(P.deliveryStage · P.companyLevel · P.budget 등)는 "있으면 쓰고 없으면 자리표시"로 opt()를 거쳐 부른다 (2차에서 연결). 목록은 "D1 화면 틀" 절 주석.
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
  var SETTINGS_KEY = 'dunguen_c1_settings';
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
  function questTag(q) { return q.kind === 'main' ? '메인 · ' + q.grade + '급' : '일반'; }
  function goalLabel(g) { return P.GOAL_TYPES.filter(function (x) { return x.id === g.type; })[0]; }
  // 목표 목록. live=true면 진척 막대, false면 목표 숫자만
  function goalsHtml(q, live) {
    return q.goals.map(function (g) {
      var t = goalLabel(g);
      if (!live) return '<li>- ' + t.label + ' ' + g.target + t.unit + ' 이상</li>';
      var now = Math.min(P.goalNow(g), g.target);
      return '<div class="goal' + (now >= g.target ? ' done' : '') + '"><span>' + t.label + '</span><b>' + now + '/' + g.target + t.unit + '</b>' +
        '<div class="meter"><i style="width:' + pct(now, g.target) + '"></i></div></div>';
    }).join('');
  }
  // 판 미리보기·건설 요구·막힘 안내 조각 (build.js 의 ZONEVIEW. 계약 필드가 없으면 빈 글)
  function ZV() { return window.ZONEVIEW || {}; }
  function siteHtml(q) { return q && q.board && ZV().siteHtml ? ZV().siteHtml(q.board) : ''; }
  function demandCardHtml(q) { return q && q.demand && ZV().demandRowHtml ? ZV().demandRowHtml(q.demand, null) : ''; }
  function demandNowHtml(q) { return ZV().demandNowHtml ? ZV().demandNowHtml(q) : ''; }
  function blockerHtml() { return ZV().blockerHtml ? ZV().blockerHtml() : ''; }
  function showMsgs(msgs) { msgs.slice(0, MOTION.toast.max).forEach(function (m) { toast(m); }); }
  // 납품: 의뢰 완료(납품 기준 다 채움) 뒤 현장 진행표의 [납품하기]로만. 자동 납품은 없다.
  function deliverNow() {
    if (!P.checkQuest()) { toast('아직 납품 기준을 다 채우지 못했어요'); buzz('warn'); return false; }
    var rep = P.deliver();
    if (!rep) return false;
    toastsEl.innerHTML = ''; // 앞선 토스트는 치운다. 납품 알림은 정산 화면 머리의 도장("납품 완료")이 대신
    buzz('best');
    go('result', true);
    return true;
  }
  function autoDeliver() { return false; } // build.js·battle.js가 부르는 자리: D1은 자동 납품이 없어서 늘 false (의뢰 완료면 현장 진행표에 납품 버튼)

  // 다음 주: 현장 맨 위 버튼. 언제든 누르면 이번 주 전투를 시작한다 (안 되면 이유를 토스트로)
  function startWeek() {
    var r = P.startBattle();
    if (!r.ok) { showMsgs(r.msgs); buzz('warn'); return; }
    buzz('tap');
    go('battle', true);
  }

  // ---------- 화면들 (함수 하나씩) ----------
  var SCREENS = {};

  // ---------- D1 화면 틀: 새 로직 자리 · 위쪽 줄 · 입구 칸 ----------
  // "있으면 쓰고 없으면 자리표시": 아래 이름이 PROGRESS에 생기면 (core-dev, 2차) 자동으로 그 값이 화면에 나온다. 없으면 임시 값.
  //   P.deliveryStage()  -> { stage, total, value: { now, need }, power: { now, need }, done }   납품 기준 n/5 · 가치 · 전투력 · 의뢰 완료
  //   P.companyLevel()   -> 숫자 (또는 { lv })                                                    회사 레벨 (없으면 임시: 1 + 납품 횟수)
  //   P.companyGold()    -> 숫자                                                                  회사 금 (없으면 RUN.companyGold, 그것도 없으면 RUN.gold)
  //   P.budget()         -> 숫자                                                                  의뢰 예산 (없으면 RUN.budget, 그것도 없으면 "준비 중")
  //   P.corpsUnlocked()  -> true/false                                                            군단 탭 열림 = 첫 전투 끝 (없으면 임시: RUN.lastBattle 또는 2주째 이상)
  //   P.deliveredOnce()  -> true/false                                                            친위대·작품집 열림 = 첫 납품 끝 (없으면 임시: RUN.history 있음)
  //   P.floorOpen(n)     -> true/false                                                            지하 n층 열림 (없으면 닫힘)
  var LN = window.LINES || {};
  function opt(name) {
    var f = P[name];
    if (typeof f !== 'function') return null;
    try { var v = f.apply(P, Array.prototype.slice.call(arguments, 1)); return v == null ? null : v; } catch (e) { return null; }
  }
  function lineOf(group, key, fb) { var g = LN[group]; return g && typeof g[key] === 'string' && g[key].trim() ? g[key] : fb; }
  function soonText(key) { return lineOf('soon', key, '준비 중'); }
  function condText(key) { return lineOf('lock', key, '조건을 채우면 열려요'); }
  function corpsOpen() {
    var v = opt('corpsUnlocked');
    return v !== null ? !!v : (!!RUN.lastBattle || RUN.week > 1);
  }
  function deliveredOnce() {
    var v = opt('deliveredOnce');
    return v !== null ? !!v : RUN.history.length > 0;
  }
  function companyLevel() {
    var v = opt('companyLevel');
    if (v && typeof v === 'object') v = v.lv;
    v = Number(v);
    if (v > 0) return Math.floor(v);
    return 1 + RUN.history.length; // 임시
  }
  function companyGold() {
    var v = opt('companyGold');
    if (typeof v === 'number') return v;
    return typeof RUN.companyGold === 'number' ? RUN.companyGold : RUN.gold;
  }
  function budgetNow() {
    var v = opt('budget');
    if (typeof v === 'number') return v;
    return typeof RUN.budget === 'number' ? RUN.budget : null;
  }
  // 직급 칭호: lines.js ranks 12단계 (회사 레벨 구간. 임시로 레벨 3마다 한 단계)
  function rankOf(lv) {
    var r = Array.isArray(LN.ranks) ? LN.ranks : [];
    return r.length ? r[Math.min(r.length - 1, Math.floor((lv - 1) / 3))] : { title: '', desc: '' };
  }
  function questDone(q) { return q.goals.filter(function (g) { return P.goalNow(g) >= g.target; }).length; }

  // 입구 칸 한 개. kind: open(열림, go로 이동) · lock(🔒 + 열림 조건) · soon(취소선 + 준비 중 토스트) · stub(열려 있지만 화면 연결 전, 자리표시)
  function entry(o) {
    var attr = '', nm = o.name, sub = o.sub || '';
    if (o.kind === 'open') attr = o.go ? ' data-go="' + o.go + '"' : '';
    else if (o.kind === 'lock') { nm = '🔒 ' + o.name; sub = o.cond; attr = ' data-toast="' + esc('🔒 ' + o.name + ': ' + o.cond) + '"'; }
    else if (o.kind === 'soon') attr = ' data-toast="' + esc(soonText(o.name)) + '"';
    else attr = ' data-toast="' + esc(o.toast || soonText(o.name)) + '"';
    return '<button class="entry ' + o.kind + (o.on ? ' on' : '') + '"' + attr + (o.attrs || '') + '><span class="nm">' + nm + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  }

  // 위쪽 줄 (회사·군단·현장 공통): 회사 이름 · 상점(취소선) · 메뉴 · 설정 톱니 / 회사 레벨 · 회사 금 · 보석 · 주
  function topbar(el) {
    el.appendChild(div('topbar',
      '<span class="company">검은망치 건설</span>' +
      '<button class="topbtn nope" data-toast="' + esc(soonText('상점')) + '">상점</button>' +
      '<button class="topbtn" data-menu aria-label="메뉴">메뉴</button>' +
      '<button class="gear" data-go="settings" aria-label="설정">&#9881;&#xFE0E;</button>'));
    el.appendChild(div('resbar',
      '<span class="chip">회사 Lv ' + companyLevel() + '</span><span class="chip" data-chip="gold">회사 금 ' + money(companyGold()) + '</span>' +
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

  // ---------- 회사 탭: 하청 건설사 건물 단면 ----------
  SCREENS.company = function (el) {
    topbar(el);
    var lv = companyLevel(), rk = rankOf(lv);
    el.appendChild(div('card rankcard', '<div class="rankrow"><b class="ranktitle">' + esc(rk.title || '') + '</b><span class="chip accent">회사 Lv ' + lv + '</span></div>' +
      '<div class="dim small-text">' + esc(rk.desc || '') + '</div>'));

    // 무대: 아이소메트릭 방 (그림 = stage.js SVG) + 캐릭터 자리. 바깥 틀(.stage)은 남는 높이를 채우고 방(.stagebox)은 비율을 지킨 채 가운데에 놓는다
    var stage = div('stage'), box = div('stagebox', ST.roomSvg());
    stage.appendChild(box);
    var actors = startActors(stage, box);
    stage.appendChild(div('stagetag', '<span class="chip">검은망치 건설 본사</span>'));
    el.appendChild(stage);
    wanderActors(actors, stage);

    var q = RUN.quest;
    var board = q ? { kind: 'open', go: 'board', name: '의뢰 게시판', sub: esc(q.name) } : { kind: 'open', go: 'contract', name: '의뢰 게시판', sub: '의뢰 고르기' };
    var gal = deliveredOnce() ? { kind: 'open', go: 'gallery', name: '작품집', sub: '납품한 던전 ' + RUN.history.length + '곳' } : { kind: 'lock', name: '작품집', cond: condText('gallery') };
    el.appendChild(div('entries', entry(board) + entry(gal) + entry({ kind: 'soon', name: '비서실' }) +
      entry({ kind: 'soon', name: '응접실' }) + entry({ kind: 'soon', name: '소장실' }) + entry({ kind: 'soon', name: '직원실' })));
  };

  // ---------- 현장 탭: 다음 주 버튼 + 의뢰 진행표(고정) + 세로 지하 단면 ----------
  // 납품 기준 표 한 줄 (P.deliveryStage 가 없으면 임시: 기존 목표 달성 수 + 지금 던전 가치)
  function deliveryInfo(q) {
    var d = opt('deliveryStage');
    if (d && typeof d === 'object') {
      return { stage: Number(d.stage) || 0, total: Number(d.total) || 5, value: d.value || null, power: d.power || null,
        done: typeof d.done === 'boolean' ? d.done : P.checkQuest(), live: true };
    }
    return { stage: questDone(q), total: q.goals.length, value: { now: P.siteSummary().value, need: null }, power: null, done: P.checkQuest(), live: false };
  }
  function pcell(label, v) {
    var ok = v && v.need != null && v.now >= v.need;
    return '<div class="pcell' + (ok ? ' ok' : '') + '"><span>' + label + '</span><b>' + (v ? v.now : '?') + '/' + (v && v.need != null ? v.need : '?') + '</b></div>';
  }
  function progressHtml(q) {
    var d = deliveryInfo(q), bud = budgetNow();
    var h = '<div class="prog' + (d.done ? ' done' : '') + '" data-prog><div class="ptitle"><span class="chip accent">' + questTag(q) + '</span><b>' + q.name + '</b></div>';
    if (d.done) {
      h += '<div class="pdone"><b>의뢰 완료</b><button class="btn primary" data-deliver>납품하기</button></div>';
    } else {
      h += '<div class="prow"><div class="pcell' + (d.stage >= d.total && d.total > 0 ? ' ok' : '') + '"><span>납품 기준</span><b>' + d.stage + '/' + d.total + '</b></div>' +
        pcell('가치', d.value) + pcell('전투력', d.power) + '</div>';
    }
    h += '<div class="pbudget"><span>의뢰 예산 <small class="dim">(건설·부대 조달)</small></span><b>' + (bud == null ? '준비 중' : money(bud)) + '</b></div>';
    if (!d.live && !d.done) h += '<div class="pfall">' + goalsHtml(q, true) + '<div class="dim small-text">임시: 기존 목표 (납품 기준 표는 다음 작업에서 연결)</div></div>';
    return h + '</div>';
  }

  SCREENS.field = function (el) {
    var q = RUN.quest;
    topbar(el);
    var top = div('fieldtop');
    var surge = !!(q && P.planInfo().surge);
    top.appendChild(div('', '<button class="btn primary big weekbtn' + (surge ? ' danger' : '') + '" data-week>' + (surge ? '⚠ ' : '') + '다음 주 ▶<small>' + RUN.week + '주째 시작</small></button>'));
    if (q) top.appendChild(div('', progressHtml(q)));
    el.appendChild(top);
    if (!q) { el.appendChild(div('', '<button class="btn primary big" data-go="contract">의뢰 고르기</button>')); return; }

    // 목표는 채웠는데 건설 요구가 안 맞아 납품이 막혔으면 이유 한 줄 (그때만 보임)
    var blk = blockerHtml();
    if (blk) el.appendChild(div('', blk));
    // 이번 주 침입자 알림 한 줄. 대량 출현이면 경고와 합친다
    var pi = P.planInfo(), n = P.surgeIn();
    el.appendChild(div('invade' + (pi.surge ? ' now' : ''),
      '<span>' + (pi.surge ? '⚠ 모험가 대량 출현 예정! ' : '') + '이번 주 침입자 ' + pi.count + '명 · 최고 ' + pi.top + '급 · 평균 Lv ' + pi.lv +
      (pi.surge ? '' : ' <span class="dim">· 대량 출현 ' + n + '주 뒤</span>') + '</span>'));

    // 세로 지하 단면: 1층(입구 칸) / 2층(3단계 달성 시 열림) / 3층(데모에 없음)
    var f2 = opt('floorOpen', 2) === true;
    el.appendChild(div('shaft',
      '<div class="surface"><span>지상</span><small>현장 입구</small></div>' +
      '<div class="floor f1"><div class="fhead"><b>지하 1층</b><span>지금 짓는 층</span></div><div class="entries">' +
        entry({ kind: 'open', go: 'build', name: '건설', sub: '시설·몬스터' }) +
        entry({ kind: 'stub', name: '출진', sub: '곧 연결', toast: '출진은 다음 작업에서 이어 붙여요' }) +
        entry({ kind: 'soon', name: '포로 수용소' }) + '</div></div>' +
      (f2 ? '<div class="floor f2"><div class="fhead"><b>지하 2층</b><span>열림</span></div></div>'
          : '<div class="floor f2 gate"><span class="nm">🔒 지하 2층</span><small>' + condText('floor2') + '</small></div>') +
      '<div class="floor f3 gate soon"><span class="nm">지하 3층</span></div>'));
    // 지하 3층 칸도 누르면 준비 중 토스트
    var f3 = el.querySelector('.floor.f3');
    f3.addEventListener('click', function () { toast(soonText('지하 3층')); buzz('tap'); });
    var fl2 = el.querySelector('.floor.f2.gate');
    if (fl2) fl2.addEventListener('click', function () { toast('🔒 지하 2층: ' + condText('floor2')); buzz('tap'); });
  };

  // ---------- 의뢰 게시판 (회사 탭 입구): 지금 받은 의뢰 한 장. 새 의뢰는 납품한 뒤에 고른다 ----------
  function mainLineText(q) {
    var nextGrade = P.MAIN_GRADES[Math.min(P.MAIN_GRADES.length - 1, RUN.mainGrade + 1)];
    return q.kind === 'main' ? '지금 의뢰가 메인 의뢰예요. 끝내면 다음 메인은 ' + nextGrade + '급'
      : RUN.questsDone >= P.NORMAL_TO_MAIN ? '메인 의뢰가 열렸어요. 다음 후보에 나옵니다'
      : '메인 의뢰까지 일반 의뢰 ' + RUN.questsDone + '/' + P.NORMAL_TO_MAIN + ' (다음 메인 ' + P.MAIN_GRADES[RUN.mainGrade] + '급)';
  }
  SCREENS.board = function (el) {
    el.appendChild(head('의뢰 게시판', 'company'));
    var q = RUN.quest;
    if (!q) { el.appendChild(div('card dim', '진행 중인 의뢰가 없어요')); el.appendChild(div('', '<button class="btn primary" data-go="contract">의뢰 고르기</button>')); return; }
    var h = '<div class="qhead"><span class="chip accent">' + questTag(q) + '</span><h3>' + q.name + '</h3></div>';
    if (q.client) h += '<div class="qclient">' + (q.client.kind ? '<span class="chip">' + q.client.kind + '</span> ' : '') + '<b>' + (q.client.name || '') + '</b></div>';
    h += siteHtml(q);
    if (q.attr) h += '<div class="qattr"><div class="qattr-h"><span class="chip">던전 속성</span> <b>' + (q.attr.label || '') + '</b></div>' + (q.attr.effect ? '<div class="small-text">' + q.attr.effect + '</div>' : '') + '</div>';
    h += '<div class="poplabel">납품 기준 ' + questDone(q) + '/' + q.goals.length + '</div>' + goalsHtml(q, true) + demandNowHtml(q) + blockerHtml() +
      '<div class="stat"><span>보수</span><b>회사 금 ' + money(q.reward.gold) + ' · 명성 +' + q.reward.fame + '</b></div>';
    el.appendChild(div('card contract' + (q.kind === 'main' ? ' main' : ''), h));
    el.appendChild(div('dim small-text mainline', mainLineText(q)));
    el.appendChild(div('dim small-text', '한 번에 의뢰 하나만 받을 수 있어요. 납품 기준을 다 채우고 납품하면 새 의뢰를 고를 수 있어요.'));
  };

  // ---------- 작품집 (회사 탭 입구, 첫 납품 뒤 열림): 납품한 던전 목록. 효과(훈련 경험치 +10%)는 2차 ----------
  SCREENS.gallery = function (el) {
    el.appendChild(head('작품집', 'company'));
    var rows = RUN.history.slice().reverse().map(function (h) {
      return '<li>' + h.week + '주째 - ' + (h.kind === 'main' ? '[메인 ' + h.grade + '급] ' : '') + h.name + ' 납품</li>';
    });
    el.appendChild(div('card', '<h3>납품한 던전</h3>' + (rows.length ? '<ul class="plain">' + rows.join('') + '</ul>' : '<div class="dim small-text">아직 없어요</div>')));
    el.appendChild(div('card', '<h3>작품집 효과</h3><div class="dim small-text">현장 부대 훈련 경험치 +10% (다음 작업에서 연결)</div>'));
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


  // ---------- 보석 강화 (공방 · 몬스터 부족 공통 조각) ----------
  // 계약(progress.js): P.WORKSHOPS · P.workshopInfo(id) · P.upgradeWorkshop(id) · P.tribeInfo(name) · P.upgradeTribe(name). 없으면 그 부분은 숨기거나 "준비 중".
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function gemCost(info) { return info && info.cost && typeof info.cost.gems === 'number' ? info.cost.gems : null; }
  // 강화 버튼: 준비 중 / 최대 단계 / 강화 (보석 N) (모자라면 흐리게, 눌러도 토스트만)
  function upBtn(info, attr, key, notReady) {
    if (notReady) return '<button class="btn small upbtn" disabled>준비 중</button>';
    var c = gemCost(info);
    if (info.next == null || c == null) return '<button class="btn small upbtn" disabled>최대 단계</button>';
    return '<button class="btn small primary upbtn' + (info.canAfford ? '' : ' poor') + '" data-' + attr + '="' + esc(key) + '"' +
      (info.canAfford ? '' : ' aria-disabled="true"') + '>강화 (보석 ' + c + ')</button>';
  }
  // 강화 버튼을 눌렀을 때: 모자라면 이유 토스트, 아니면 강화 함수를 불러 결과를 토스트로. 성공하면 true
  function tryUpgrade(info, fn, key) {
    var c = gemCost(info);
    if (c != null && !info.canAfford) { toast('보석이 ' + (c - RUN.gems) + '개 모자라요 (필요 ' + c + ' · 보유 ' + RUN.gems + ')'); buzz('warn'); return false; }
    var r = fn(key);
    toast(r && r.msg ? r.msg : (r && r.ok ? '강화했어요' : '강화할 수 없어요'));
    if (r && r.ok) { buzz('good'); return true; }
    buzz('warn'); return false;
  }
  // 성공 연출: 그 요소를 짧게 반짝 (shell.css .upflash, 시간은 --dur-fx)
  function flashUp(node) { if (!node) return; node.classList.remove('upflash'); void node.offsetWidth; node.classList.add('upflash'); }

  // ---------- 몬스터 모집 (부대 탭) · 광고 뽑기 (상점 탭) ----------
  // 계약(progress.js): P.TRIBES · P.recruitInfo(name) · P.recruit(name) · P.gachaInfo() · P.gachaPull(). 하나라도 없으면 그 묶음은 통째로 숨긴다.
  function uiLine(key, fb) { var u = window.LINES && window.LINES.ui; return u && typeof u[key] === 'string' && u[key].trim() ? u[key] : fb; }
  function hasRecruit() { return Array.isArray(P.TRIBES) && P.TRIBES.length > 0 && typeof P.recruitInfo === 'function' && typeof P.recruit === 'function'; }
  function safe(fn, fb) { try { var v = fn(); return v == null ? fb : v; } catch (e) { return fb; } }
  function gradeBadge(g) { return '<span class="rg" data-g="' + esc(g) + '">' + esc(g) + '</span>'; }
  function recruitCost(inf) { return inf && inf.cost && typeof inf.cost.gold === 'number' ? inf.cost.gold : null; }
  function recruitFull(inf) { return inf && typeof inf.max === 'number' && typeof inf.count === 'number' && inf.count >= inf.max; }
  // 모집 묶음: 부족마다 한 줄 (계약한 부족을 위로). 금이 모자라거나 상한이면 버튼을 흐리게 (눌러도 이유 토스트만)
  function recruitHtml() {
    var all = P.TRIBES.map(function (t) { return { t: t, inf: safe(function () { return P.recruitInfo(t.name); }, {}) }; });
    var sorted = all.filter(function (x) { return x.inf.contracted; }).concat(all.filter(function (x) { return !x.inf.contracted; }));
    var rows = sorted.map(function (x) {
      var t = x.t, inf = x.inf, n = esc(t.name);
      if (!inf.contracted) {
        return '<div class="rrow off" data-rt="' + n + '">' + gradeBadge(t.grade) + '<div class="rinfo"><b>' + n + '</b><small>' + esc(uiLine('recruitLocked', '아직 계약하지 않은 부족')) + '</small></div></div>';
      }
      var cost = recruitCost(inf), full = recruitFull(inf), poor = full || inf.canAfford === false;
      var stat = (t.hp != null ? ' · 체력 ' + t.hp : '') + (t.atk != null ? ' · 공격 ' + t.atk : '');
      return '<div class="rrow' + (full ? ' full' : '') + '" data-rt="' + n + '">' + gradeBadge(t.grade) +
        '<div class="rinfo"><b>' + n + '</b><small>' + (typeof inf.count === 'number' ? inf.count + (typeof inf.max === 'number' ? '/' + inf.max : '') + '마리' : '') + stat + '</small></div>' +
        '<button class="btn small primary rbtn' + (poor ? ' poor' : '') + '" data-recruit="' + n + '"' + (poor ? ' aria-disabled="true"' : '') + '>' +
        (full ? '가득 참' : '모집' + (cost != null ? ' (금 ' + money(cost) + ')' : '')) + '</button></div>';
    }).join('');
    return '<div class="card recruit"><div class="rhead"><h3>' + esc(uiLine('recruitHead', '몬스터 모집')) + '</h3><span class="chip">회사 금 ' + money(companyGold()) + '</span></div>' + rows + '</div>';
  }
  // 모집 버튼을 눌렀을 때: 못 하는 이유가 있으면 토스트만, 아니면 P.recruit. 결과 { ok, msg, monster }를 돌려줌 (못 했으면 null)
  function tryRecruit(name) {
    var inf = safe(function () { return P.recruitInfo(name); }, {}), cost = recruitCost(inf);
    if (!inf.contracted) { toast(uiLine('recruitLocked', '아직 계약하지 않은 부족')); buzz('warn'); return null; }
    if (recruitFull(inf) || inf.canAfford === false) {
      toast(inf.why || (recruitFull(inf) ? name + '은(는) 더 모집할 수 없어요 (상한 ' + inf.max + '마리)' :
        cost != null ? '금이 ' + money(Math.max(0, cost - RUN.gold)) + ' 모자라요 (필요 ' + money(cost) + ' · 보유 ' + money(RUN.gold) + ')' : '지금은 모집할 수 없어요'));
      buzz('warn'); return null;
    }
    var r = safe(function () { return P.recruit(name); }, null);
    toast(r && r.msg ? r.msg : (r && r.ok ? '모집했어요' : '모집할 수 없어요'));
    if (r && r.ok) { buzz('good'); return r; }
    buzz('warn'); return null;
  }

  // 부대 탭 몬스터 묶음: 부족마다 한 묶음 (처음엔 접힘, 펼친 상태는 화면을 떠났다 와도 기억)
  var unitsOpen = {};
  function tribeOrder(name) { var T = P.TRIBES || []; for (var i = 0; i < T.length; i++) if (T[i].name === name) return i; return 999; }
  function tribeGradeOf(name) { var T = P.TRIBES || []; for (var i = 0; i < T.length; i++) if (T[i].name === name) return T[i].grade; return ''; }
  // 몬스터를 부족별로 묶어 돌려줌: [{ name, list(id 순) }] (부족 표 순서, 표에 없는 이름은 뒤에)
  function tribeGroups(mons) {
    var by = {}, names = [];
    mons.forEach(function (m) { if (!by[m.name]) { by[m.name] = []; names.push(m.name); } by[m.name].push(m); });
    names.sort(function (a, b) { return tribeOrder(a) - tribeOrder(b); });
    return names.map(function (n) { return { name: n, list: by[n] }; });
  }

  // ---------- 군단 탭: 부족 목록 하나(화면 안 구분) + 입구 5개. 첫 전투 뒤에 열린다 ----------
  SCREENS.corps = function (el) {
    topbar(el);
    var tab = 'mon';
    var segEl = div('entries');
    var listEl = div('', '');
    listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    var hasTribe = !!(P.tribeInfo && P.upgradeTribe);
    // 몬스터 부족 보석 강화 줄 (부족당 한 번, 묶음 머리 아래). 효과 글은 펼쳤을 때만
    function tribeHtml(name, open) {
      if (!hasTribe) return '';
      var t = P.tribeInfo(name);
      if (!t) return '';
      var btn = t.contracted === false ? '<button class="btn small upbtn" disabled>계약 필요</button>' : upBtn(t, 'uptribe', name);
      return '<div class="tribe"><div class="tribehead"><b>보석 강화 Lv ' + (t.lv || 0) + '</b>' + btn + '</div>' +
        (open ? '<div class="small-text">지금 ' + (t.effect || '없음') + '</div><div class="small-text dim">다음 ' + (t.next != null ? t.next : '최대 단계예요') + '</div>' : '') + '</div>';
    }
    function groupHtml(g) {
      var n = esc(g.name), open = !!unitsOpen[g.name];
      var guards = g.list.filter(function (m) { return RUN.guards.indexOf(m.id) >= 0; }).length;
      var h = '<div class="card tgroup' + (open ? ' open' : '') + '" data-tg="' + n + '">' +
        '<button class="tghead" data-tgtoggle="' + n + '" aria-expanded="' + open + '">' + (tribeGradeOf(g.name) ? gradeBadge(tribeGradeOf(g.name)) : '') +
        '<b class="tgname">' + n + '</b><span class="tgn">×' + g.list.length + '</span>' +
        (guards ? '<span class="chip accent">친위대 ' + guards + '</span>' : '') + '<i class="tgarrow">▾</i></button>' + tribeHtml(g.name, open);
      if (open) {
        h += '<div class="tgbody">' + g.list.map(function (m) {
          var guard = RUN.guards.indexOf(m.id) >= 0;
          return '<div class="mcard" data-mid="' + m.id + '"><div class="portrait">도트</div><div class="info"><div class="mtop"><span class="chip">Lv ' + m.lv + '</span>' +
            '<span class="chip">등급 ' + P.monGrade(m.lv) + '</span>' + (guard ? '<span class="chip accent">친위대</span>' : '') + '</div>' +
            '<div class="nums"><span>체력 ' + m.hp + '</span><span>공격 ' + m.atk + '</span><span>경험치 ' + m.exp + '/2</span></div></div></div>';
        }).join('') + '</div>';
      }
      return h + '</div>';
    }
    function draw() {
      var gOpen = deliveredOnce();
      segEl.innerHTML = entry({ kind: 'open', name: '부족', sub: '모집·보석 강화', on: tab === 'mon', attrs: ' data-t="mon"' }) +
        (gOpen ? entry({ kind: 'open', name: '친위대', sub: '최대 ' + P.GUARD_MAX + '칸', on: tab === 'guard', attrs: ' data-t="guard"' })
               : entry({ kind: 'lock', name: '친위대', cond: condText('guard') })) +
        entry({ kind: 'soon', name: '훈련' }) + entry({ kind: 'soon', name: '대장간' }) + entry({ kind: 'soon', name: '몬스터 숙소' });
      var s = '';
      if (tab === 'mon') {
        if (hasRecruit()) s += recruitHtml();
        if (hasTribe) s += '<div class="gemnote"><span class="chip accent">보석 ' + RUN.gems + '</span><span class="small-text dim">보석 강화는 부족에 붙어서 다음 현장에도 남아요. 현장 부대는 의뢰마다 새로 조달해요.</span></div>';
        var groups = tribeGroups(RUN.monsters), allOpen = groups.length > 0 && groups.every(function (g) { return unitsOpen[g.name]; });
        if (groups.length) {
          s += '<div class="tgbar"><span class="small-text dim">' + groups.length + '부족 · 몬스터 ' + RUN.monsters.length + '마리</span>' +
            '<button class="btn small" data-tgall>' + esc(allOpen ? uiLine('unitsCloseAll', '모두 접기') : uiLine('unitsOpenAll', '모두 펼치기')) + '</button></div>';
        }
        s += groups.map(groupHtml).join('');
      } else {
        s += '<p class="dim small-text" style="margin:0">친위대는 납품할 때 다음 현장에 데려갈 몬스터를 골라요. 이름 있는 몬스터라서 다음 현장에도 같이 가요.</p>';
        for (var i = 0; i < P.GUARD_MAX; i++) {
          var g = RUN.monsters.filter(function (m) { return m.id === RUN.guards[i]; })[0];
          s += '<div class="card unit"><div class="portrait">칸 ' + (i + 1) + '</div><div class="info"><b>' +
            (g ? g.name + ' Lv ' + g.lv : '비어 있음') + '</b></div></div>';
        }
      }
      listEl.innerHTML = s;
    }
    segEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-t]') : null;
      if (b) { tab = b.getAttribute('data-t'); buzz('tap'); draw(); }
    });
    listEl.addEventListener('click', function (e) {
      var rb = e.target.closest ? e.target.closest('[data-recruit]') : null;
      if (rb) {
        var rname = rb.getAttribute('data-recruit'), r = tryRecruit(rname);
        if (r && r.monster) unitsOpen[r.monster.name || rname] = true; // 새 몬스터가 든 묶음을 펼친다
        draw();
        if (r) { // 성공: 새 카드(와 모집 줄)만 짧게 반짝
          if (r.monster && r.monster.id != null) flashUp(listEl.querySelector('[data-mid="' + r.monster.id + '"]'));
          flashUp(listEl.querySelector('[data-rt="' + rname + '"]'));
        }
        return;
      }
      var tg = e.target.closest ? e.target.closest('[data-tgtoggle]') : null;
      if (tg) { var tn = tg.getAttribute('data-tgtoggle'); unitsOpen[tn] = !unitsOpen[tn]; buzz('tap'); draw(); return; }
      if (e.target.closest && e.target.closest('[data-tgall]')) {
        var gs = tribeGroups(RUN.monsters), open = !gs.every(function (g) { return unitsOpen[g.name]; });
        gs.forEach(function (g) { unitsOpen[g.name] = open; });
        buzz('tap'); draw(); return;
      }
      var b = e.target.closest ? e.target.closest('[data-uptribe]') : null;
      if (!b) return;
      var name = b.getAttribute('data-uptribe');
      var ok = tryUpgrade(P.tribeInfo(name) || {}, P.upgradeTribe, name);
      draw();
      if (ok) listEl.querySelectorAll('.tgroup').forEach(function (c) { if (c.getAttribute('data-tg') === name) flashUp(c); });
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
    el.appendChild(div('dim small-text', '되돌릴 수 없는 일은 길게 눌러야 동작합니다. 주·금·보석·몬스터·의뢰가 모두 처음으로 돌아갑니다.'));
    el.appendChild(div('mt-auto dim small-text', '버전: D1 첫 데모 (화면 1차 틀: 하단 탭 5개, 임시 숫자)'));
  };

  // 건설 화면은 build.js (구역 판). SCREEN_PLUGINS.build 가 아래에서 SCREENS.build 로 등록된다.

  // 납품·정산 + 새 의뢰 고르기: 한 화면 (contract와 result가 같은 함수)
  // 위에서 아래로: 정산(보상·판매 대금·걸린 주) -> 가져가는 것/사라지는 것 -> 친위대 고르기 -> 새 의뢰 후보 카드.
  // 납품은 현장 진행표의 [납품하기]로 이미 끝났다(deliverNow). 후보 카드를 누르면 P.pickQuest(q, 친위대 id들) -> 현장.
  // 첫 시작(phase 'choose', report 없음)에는 정산·친위대 없이 후보만.
  // 새 필드(rep.gems · rep.carry · rep.lost · q.client · q.attr · q.reward.gems)가 없으면 그 줄을 숨긴다.
  function listHtml(arr) {
    return arr.length ? '<ul class="plain">' + arr.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' : '<div class="dim small-text">없음</div>';
  }
  function rewardHtml(rw) {
    var h = '<div><span>회사 금</span><b>' + money(rw.gold || 0) + '</b></div>';
    if (rw.gems) h += '<div><span>보석</span><b>' + rw.gems + '</b></div>';
    return h + '<div><span>명성</span><b>+' + (rw.fame || 0) + '</b></div>';
  }
  function questCard(q, pick) {
    var h = '<div class="qhead"><span class="chip accent">' + questTag(q) + '</span><h3>' + q.name + '</h3></div>';
    if (q.client) h += '<div class="qclient">' + (q.client.kind ? '<span class="chip">' + q.client.kind + '</span> ' : '') + '<b>' + (q.client.name || '') + '</b></div>';
    h += siteHtml(q) + demandCardHtml(q);
    if (q.attr) h += '<div class="qattr"><div class="qattr-h"><span class="chip">던전 속성</span> <b>' + (q.attr.label || '') + '</b></div>' +
      (q.attr.effect ? '<div class="small-text">' + q.attr.effect + '</div>' : '') +
      (q.attr.counter ? '<div class="small-text qcounter">내 대응: ' + q.attr.counter + '</div>' : '') + '</div>';
    h += '<div class="poplabel qlabel">납품 기준</div><ul class="plain qgoals">' + goalsHtml(q, false) + '</ul>' +
      '<div class="money">' + rewardHtml(q.reward) + '</div>' +
      '<div class="qpick">이 의뢰 받기 ▶</div>';
    var c = div('card contract pickable' + (q.kind === 'main' ? ' main' : ''), h);
    c.setAttribute('role', 'button'); c.setAttribute('tabindex', '0');
    function act() { pick(q); }
    c.addEventListener('click', act);
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    return c;
  }
  function deliverScreen(el) {
    var r = RUN.phase === 'settle' ? RUN.report : null;
    var ids = RUN.guards.filter(function (id) { return !!P.monById(id); });
    var main = !!(r && r.wasMain);
    el.appendChild(head(r ? '납품·정산' : (RUN.history.length === 0 && RUN.siteNo === 0 ? '첫 의뢰를 고르세요' : '의뢰를 고르세요')));

    if (r) {
      el.appendChild(div('stamp' + (main ? ' main' : ''), main ? '메인 의뢰 완료!' : '납품 완료'));
      el.appendChild(div('dim small-text', r.quest.name + ' · 던전 가치 ' + r.value + ' · 건설 ' + r.builds + '회'));
      el.appendChild(div('card payout' + (main ? ' main' : ''),
        '<h3>정산</h3>' +
        '<div class="stat"><span>의뢰 보수</span><b>회사 금 +' + money(r.base) + (r.gems ? ' · 보석 +' + r.gems : '') + ' · 명성 +' + r.fame + '</b></div>' +
        '<div class="stat"><span>판매 대금 (가치의 절반)</span><b>금 +' + money(r.sale) + '</b></div>' +
        '<div class="stat"><span>걸린 기간</span><b>' + r.weeks + '주</b></div>' +
        '<div class="stat total"><span>회사 금 합계</span><b>+' + money(r.gold) + '</b></div>' +
        '<div class="stat"><span>회사 금</span><b>' + money(r.goldBefore) + ' → ' + money(RUN.gold) + '</b></div>' +
        '<div class="stat"><span>명성</span><b>' + r.fameBefore + ' → ' + RUN.fame + '</b></div>'));
      el.appendChild(div('dim small-text mainline', r.nextMain));

      if (Array.isArray(r.carry) || Array.isArray(r.lost)) {
        el.appendChild(div('cl',
          '<div class="card carry"><h3>가져가는 것</h3>' + listHtml(r.carry || []) + '</div>' +
          '<div class="card lost"><h3>사라지는 것</h3>' + listHtml(r.lost || []) + '</div>'));
      }

      var gbox = div('card');
      el.appendChild(gbox);
      var drawGuards = function () {
        gbox.innerHTML = '<h3>친위대 고르기 (' + ids.length + '/' + P.GUARD_MAX + ')</h3>' +
          '<div class="dim small-text" style="margin-bottom:6px">골라 둔 몬스터는 레벨을 지닌 채 새 부지로 넘어가요. 안 골라도 돼요.</div><div class="guards"></div>';
        var gl = gbox.querySelector('.guards');
        if (!RUN.monsters.length) gl.outerHTML = '<div class="dim small-text">고를 몬스터가 없어요</div>';
        RUN.monsters.forEach(function (m) {
          var on = ids.indexOf(m.id) >= 0;
          var b = document.createElement('button');
          b.className = 'gbtn' + (on ? ' on' : '');
          b.innerHTML = '<b>' + m.name + '</b><span>Lv ' + m.lv + ' · ' + P.monGrade(m.lv) + '</span>';
          b.addEventListener('click', function () {
            var i = ids.indexOf(m.id);
            if (i >= 0) ids.splice(i, 1);
            else if (ids.length >= P.GUARD_MAX) { toast('친위대는 최대 ' + P.GUARD_MAX + '칸이에요'); buzz('warn'); return; }
            else ids.push(m.id);
            if (P.setGuards) P.setGuards(ids.slice()); // 새로고침해도 고른 채로
            buzz('tap'); drawGuards();
          });
          gl.appendChild(b);
        });
      };
      drawGuards();
    }

    var list = P.offerQuests();
    var hasMain = list.some(function (q) { return q.kind === 'main'; });
    el.appendChild(div('qtitle', '<h3>새 의뢰를 고르세요</h3><div class="dim small-text">' + (hasMain ? '메인 의뢰가 열렸어요! ' : '') +
      '카드를 누르면 바로 시작해요. 한 장만 고르고, 기한은 없어요.' + (hasMain ? '' : ' (' + RUN.questsDone + '/' + P.NORMAL_TO_MAIN + ' 일반 의뢰 완료)') + '</div>'));
    var picked = false;
    list.forEach(function (q) {
      el.appendChild(questCard(q, function (qq) {
        if (picked) return;
        picked = true;
        if (P.pickQuest(qq, ids.slice())) { buzz('good'); toast('새 부지에서 시작: ' + qq.name); go('field', true); }
        else picked = false;
      }));
    });
    if (r) buzz(main ? 'best' : 'stamp');
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
    else if (name === 'field' && RUN.phase === 'play' && RUN.quest) {
      if (P.checkQuest()) tutStart('complete', { target: '#view [data-deliver]' });
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
    head: head, questTag: questTag, goalsHtml: goalsHtml, autoDeliver: autoDeliver,
    // 튜토리얼 (build.js·battle.js): 단계 보이기 · 끝내기(본 것으로 기록) · 떠 있나 · 건설 화면 강조 구역
    tutStart: tutStart, tutDone: function (id) { if (tutActive(id)) tutEnd(true); }, tutActive: tutActive, tutZones: tutZones,
    // 전투 화면용: 하단 탭 막대 자리 (전투 시작 버튼이 가운데 큰 버튼 자리에 오게 battle.js가 여기에 채운다)
    bar: function () { return tabsEl; },
    // 전투 화면용: 결과 반영(한 번만, 결과표 내용을 돌려줌) / 결과표에서 홈으로 (목표를 채웠으면 바로 납품)
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
