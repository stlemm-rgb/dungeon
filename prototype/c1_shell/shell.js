/* C1 전체 화면 뼈대 시안 (순수 JS, 가짜 숫자·가짜 문구)
 *
 * 화면 목록과 이동 규칙
 *  - 한 페이지 안에서 주소 끝의 해시(#home 등)로 화면을 바꾼다. 브라우저 뒤로 가기 = 이전 화면
 *    (나중에 안드로이드 뒤로 버튼과 연결).
 *  - 하단 탭: 홈 · 던전 · [다음 주 ▶] · 부대 · 상점. 가운데 "다음 주"는 어느 탭 화면에서든 누를 수 있다 (화면 이동이 아니라 동작 버튼).
 *    탭 막대가 보이는 화면: home · dungeon · units · shop. 전투 화면은 같은 막대 자리에 배속 · 전투 시작 · 안내가 들어간다 (battle.js).
 *  - 홈에서 가는 곳: leaders(부대장) · records(기록·도감) · workshop(공방, 보석 강화) · build(건설) · settings(오른쪽 위 톱니, 뒤로 가기) · battle(다음 주 = 매주 전투)
 *  - 진행 화면 (탭 막대 숨김): contract(첫 의뢰) -> home -> build / battle -> (목표 달성 즉시) result(납품·정산·친위대·새 의뢰 후보 한 화면) -> home
 *    contract와 result는 같은 함수(deliverScreen). 첫 시작(report 없음)에는 정산·친위대 없이 후보만 보인다.
 *  - "다음 주"를 누르면 이번 주 전투가 시작되고(PROGRESS.startBattle) 결과를 반영할 때까지 전투 화면에서 못 나간다.
 *  - 진행 상태와 규칙은 progress.js (window.PROGRESS). 이 파일은 그 값을 보고 그리기만 하고,
 *    값을 바꾸는 것은 PROGRESS의 정해진 함수(buildZone·startBattle·watchAd·applyBattle·deliver·pickQuest …)로만 한다.
 *  - 화면 지킴이(render 안): 정산 중이면 어느 화면이든 result로(납품·새 의뢰 한 화면), 의뢰가 없으면 contract로, 의뢰가 있으면 contract 못 들어감.
 *  - 건설 화면(구역 판)은 build.js, 전투 화면은 battle.js (SCREEN_PLUGINS). 판 규칙은 zones.js.
 *  - 화면 하나 = 함수 하나: SCREENS.이름 = function (el) { el에 내용을 채운다 }  (나중에 React 화면 하나로 옮기기 쉽게)
 *  - 전환 애니메이션은 앞으로 갈 때만 (var(--dur-sheet) var(--ease-out)). 뒤로/닫기는 즉시.
 *  - 튜토리얼: 은발 마왕 말풍선(#tut, 탭 막대 바로 위). 대사는 lines.js, 단계 기록은 progress.js(P.tutorial 등). 아래 "튜토리얼" 절 참고.
 *  - 숫자는 가짜(균형 없음). 상태(RUN)는 progress.js가 localStorage에 자동 저장한다. 설정은 이 파일이 따로 저장.
 */
(function () {
  'use strict';

  // ---------- 연출용 무작위 (게임용 무작위 아님) ----------
  function fxRandom() { return Math.random(); }

  // ---------- 진행 상태 (progress.js) ----------
  var P = window.PROGRESS, RUN = P.RUN;

  // ---------- 가짜 데이터 ----------
  // 가운데(세 번째) 자리는 "다음 주" 동작 버튼이라 TABS 목록에는 없다 (drawTabs가 끼워 넣음). 설정은 홈 톱니로만.
  var TABS = [
    { id: 'home', label: '홈' }, { id: 'dungeon', label: '던전' }, { id: 'units', label: '부대' }, { id: 'shop', label: '상점' }
  ];
  var TAB_IDS = TABS.map(function (t) { return t.id; });

  // 홈 무대 = 아이소메트릭 방. 캐릭터·가구·벽 소품 자리는 stage.js 표에 있다 (나중에 도트 그림만 끼우면 됨)
  var ST = window.STAGE;
  var STAGE_POS = {}; // 캐릭터별 지금 서 있는 칸 [gx, gy]. 화면을 다시 그려도 제자리에 있게 기억 (저장 안 함)

  var LEADERS = [
    { name: '철벽 카르마', trait: '문 앞에서 버티는 수비형', skill: '방패 올리기: 3초간 받는 피해 절반' },
    { name: '쾌속 린',     trait: '먼저 달려드는 영격형',   skill: '돌진: 첫 침입자에게 큰 피해' },
    { name: '약초꾼 보리', trait: '뒤에서 돕는 지원형',     skill: '응급 처치: 아군 한 마리 체력 회복' }
  ];
  var GRADES = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSR'];
  var GOODS = [
    { name: '강화 석재',   desc: '벽 칸 가치 +5', price: 300 },
    { name: '독 바른 못',  desc: '함정 피해 +2',  price: 450 },
    { name: '영양 만점 사료', desc: '몬스터 경험치 +1', price: 600 },
    { name: '마왕 인증 도장', desc: '선금 +10%',     price: 900 }
  ];

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
  function head(title, backTo, backLabel, right) {
    var h = div('head');
    if (backTo) h.innerHTML += '<button class="back" data-back="' + backTo + '">' + (backLabel || '← 홈') + '</button>';
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
  // 목표를 다 채운 순간 어느 화면에서든 자동으로 납품(정산)으로 간다
  function autoDeliver() {
    if (!P.checkQuest()) return false;
    var rep = P.deliver();
    if (!rep) return false;
    toastsEl.innerHTML = ''; // 앞선 토스트는 치운다. 납품 알림은 정산 화면 머리의 도장("납품 완료")이 대신해서 토스트는 안 띄움 (의뢰 카드를 가리지 않게)
    buzz('best');
    go('result', true);
    return true;
  }

  // 다음 주: 어느 탭에서든 누르면 이번 주 전투를 시작한다 (안 되면 이유를 토스트로)
  function startWeek() {
    if (autoDeliver()) return; // 목표·요구를 이미 채웠으면 전투 대신 납품
    var r = P.startBattle();
    if (!r.ok) { showMsgs(r.msgs); buzz('warn'); return; }
    buzz('tap');
    go('battle', true);
  }

  // ---------- 화면들 (함수 하나씩) ----------
  var SCREENS = {};

  SCREENS.home = function (el) {
    var q = RUN.quest;
    var status = div('status',
      '<div class="line1"><span class="company">검은망치 건설</span><span class="chip accent">' + RUN.week + '주째</span>' +
      '<button class="gear" data-go="settings" aria-label="설정">&#9881;&#xFE0E;</button></div>' +
      '<div class="line2"><span class="chip" data-chip="gold">금 ' + money(RUN.gold) + '</span><span class="chip" data-chip="gems">보석 ' + RUN.gems + '</span><span class="chip">명성 ' + RUN.fame + '</span></div>');
    el.appendChild(status);

    // 대기 화면 무대: 아이소메트릭 방 (그림 = stage.js SVG) + 캐릭터 자리 (stage.js 표)
    // 바깥 틀(.stage)은 남는 높이를 채우고, 방(.stagebox)은 가로세로 비율을 지킨 채 가운데에 놓는다
    var stage = div('stage'), box = div('stagebox', ST.roomSvg());
    stage.appendChild(box);
    var actors = startActors(stage, box);
    // 부대장·기록·공방 버튼은 무대 바닥 위에 얹는다 (홈이 한 화면에 들어오게)
    stage.appendChild(div('quick',
      '<button class="btn" data-go="leaders">부대장</button>' +
      '<button class="btn" data-go="records">기록·도감</button>' +
      '<button class="btn" data-go="workshop">공방</button>'));
    // 퀘스트 버튼: 무대 오른쪽 위. 누르면 [의뢰 / 일일 / 주간] 팝업. 일일·주간 보상을 받을 수 있으면 빨간 점 (계약 함수가 없으면 의뢰만)
    if (q || choresNow()) {
      var qb = document.createElement('button');
      qb.setAttribute('data-quest', '');
      qb.addEventListener('click', function () { buzz('tap'); openQuestPop(RUN.quest); });
      fillQuestBtn(qb);
      stage.appendChild(qb);
    }
    // 쌓인 금 버튼: 무대 왼쪽 위. 방치 보상이 있을 때만 (팝업을 닫아도 여기서 다시 받을 수 있음)
    if (idleNow()) {
      var ib = document.createElement('button');
      ib.className = 'idlebtn'; ib.setAttribute('data-idle', '');
      ib.addEventListener('click', function () { buzz('tap'); openIdlePop(); });
      fillIdleBtn(ib);
      stage.appendChild(ib);
    }
    el.appendChild(stage);
    wanderActors(actors, stage);
    // 홈에 들어왔을 때 방치 보상이 있으면 작은 팝업 (받지 않고 닫았으면 다시 받을 때까지 자동으로는 안 띄움)
    if (justEnteredHome && !idleSeen && idleNow()) openIdlePop();

    // 목표는 채웠는데 건설 요구가 안 맞아 납품이 막혔으면 이유 한 줄 (그때만 보임)
    var blk = blockerHtml();
    if (blk) el.appendChild(div('', blk));

    // 이번 주 침입자 알림 한 줄 + 광고 보기(가짜). 대량 출현이면 경고와 합친다
    if (q) {
      var pi = P.planInfo(), n = P.surgeIn();
      var line = '이번 주 침입자 ' + pi.count + '명 · 최고 ' + pi.top + '급 · 평균 Lv ' + pi.lv;
      var inv = div('invade' + (pi.surge ? ' now' : ''),
        '<span>' + (pi.surge ? '⚠ 모험가 대량 출현 예정! ' + (pi.ad ? '(광고) ' : '') : '') + line +
        (pi.surge ? '' : ' <span class="dim">· 대량 출현 ' + n + '주 뒤</span>') + '</span>' +
        (pi.surge ? '' : '<button class="btn small adbtn" data-ad>광고 보기</button>'));
      var ad = inv.querySelector('[data-ad]');
      if (ad) ad.addEventListener('click', function () {
        var r = P.watchAd();
        toast(r.msg); buzz(r.ok ? 'warn' : 'tap');
        render();
      });
      el.appendChild(inv);
    }

    // 아래 버튼 줄은 화면 아래에 붙여 둔다 (스크롤해도 보임). 의뢰가 있으면 넓은 "건설" 버튼 하나 (다음 주는 하단 탭 가운데)
    var bar = div('homebar');
    bar.innerHTML = q ? '<button class="btn big" data-go="build">건설</button>'
      : '<button class="btn primary big" data-go="contract">의뢰 고르기</button>';
    el.appendChild(bar);
  };

  // ---------- 홈 무대: 캐릭터 자리 · 걷기 · 말풍선 · 퀘스트 팝업 ----------
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

  // 퀘스트 팝업: 현재 의뢰 이름·일반/메인·목표 진행도·메인까지 남은 정보. 바깥 누르기·닫기 버튼·Esc 로 닫는다.
  var questPop = null;
  function questDone(q) { return q.goals.filter(function (g) { return P.goalNow(g) >= g.target; }).length; }
  function mainLineText(q) {
    var nextGrade = P.MAIN_GRADES[Math.min(P.MAIN_GRADES.length - 1, RUN.mainGrade + 1)];
    return q.kind === 'main' ? '지금 의뢰가 메인 의뢰예요. 끝내면 다음 메인은 ' + nextGrade + '급'
      : RUN.questsDone >= P.NORMAL_TO_MAIN ? '메인 의뢰가 열렸어요. 다음 후보에 나옵니다'
      : '메인 의뢰까지 일반 의뢰 ' + RUN.questsDone + '/' + P.NORMAL_TO_MAIN + ' (다음 메인 ' + P.MAIN_GRADES[RUN.mainGrade] + '급)';
  }
  // 팝업은 한 번에 하나만 (퀘스트 팝업 · 방치 보상 팝업이 이 자리를 같이 씀). 닫을 때 popOnClose 가 있으면 한 번 부른다
  var popOnClose = null;
  function closeQuestPop() {
    if (questPop && questPop.parentNode) questPop.parentNode.removeChild(questPop);
    questPop = null;
    if (popOnClose) { var f = popOnClose; popOnClose = null; f(); }
  }

  // ---------- 일일·주간 퀘스트 · 방치 보상 (progress.js 계약 함수. 없거나 오류면 그 칸·팝업을 숨김) ----------
  var CHORE_SCOPES = [{ id: 'daily', label: '일일' }, { id: 'weekly', label: '주간' }];
  var questTab = 'quest';      // 마지막으로 본 칸 (팝업을 다시 열어도 기억)
  var idleSeen = false;        // 방치 보상 팝업을 받지 않고 닫았으면 true (받으면 false로)
  var justEnteredHome = false; // render 가 정함: 이번에 다른 화면에서 홈으로 들어왔는가
  function choresNow() {
    if (typeof P.chores !== 'function' || typeof P.claimChore !== 'function') return null;
    try {
      var c = P.chores();
      if (!c) return null;
      var out = {};
      CHORE_SCOPES.forEach(function (sc) { if (c[sc.id] && Array.isArray(c[sc.id].tasks)) out[sc.id] = c[sc.id]; });
      return Object.keys(out).length ? out : null;
    } catch (e) { return null; }
  }
  function claimableAll() {
    if (typeof P.choresClaimable !== 'function') return 0;
    try { return Math.max(0, Number(P.choresClaimable()) || 0); } catch (e) { return 0; }
  }
  function claimableIn(sc) { return sc.tasks.filter(function (t) { return t.done && !t.claimed; }).length; }
  function gemsOf(t) { return (t.reward && Number(t.reward.gems)) || 0; }
  function resetText(ms) {
    var min = Math.max(0, Math.ceil((Number(ms) || 0) / 60000)), d = Math.floor(min / 1440), h = Math.floor(min % 1440 / 60), m = min % 60;
    if (min <= 0) return '곧 새로 시작해요';
    return (d > 0 ? d + '일 ' + h + '시간' : h > 0 ? h + '시간 ' + m + '분' : m + '분') + ' 뒤 새로';
  }
  function minutesText(min) {
    min = Math.max(0, Math.floor(Number(min) || 0));
    var h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? h + '시간 ' + m + '분' : m + '분';
  }
  function idleNow() {
    if (typeof P.idleInfo !== 'function' || typeof P.claimIdle !== 'function') return null;
    try { var i = P.idleInfo(); return i && Number(i.gold) > 0 ? i : null; } catch (e) { return null; }
  }
  // 홈 위쪽 숫자 칩·버튼을 다시 채운다 (팝업을 닫지 않고 값만 맞춤)
  function fillQuestBtn(qb) {
    var q = RUN.quest, n = claimableAll();
    qb.className = 'questbtn' + (q && q.kind === 'main' ? ' main' : '');
    qb.innerHTML = '<span class="qmark">!</span>퀘스트' + (q ? '<b class="qbadge">' + questDone(q) + '/' + q.goals.length + '</b>' : '') +
      (n > 0 ? '<span class="qdot" aria-label="받을 보상 ' + n + '개">' + n + '</span>' : '');
  }
  function fillIdleBtn(ib) { var i = idleNow(); ib.innerHTML = '<span class="qmark">+</span>쌓인 금' + (i ? '<b class="qbadge">' + money(Math.floor(i.gold)) + '</b>' : ''); }
  function refreshHomeBits() {
    var g = document.querySelector('[data-chip="gold"]'), m = document.querySelector('[data-chip="gems"]');
    if (g) g.textContent = '금 ' + money(RUN.gold);
    if (m) m.textContent = '보석 ' + RUN.gems;
    var qb = document.querySelector('[data-quest]'); if (qb) fillQuestBtn(qb);
    var ib = document.querySelector('[data-idle]');
    if (ib) { if (idleNow()) fillIdleBtn(ib); else if (ib.parentNode) ib.parentNode.removeChild(ib); }
  }

  function questTabHtml(q) {
    if (!q) return '<div class="dim">진행 중인 의뢰가 없어요</div>';
    return '<div class="qhead"><span class="chip accent">' + questTag(q) + '</span><b>' + q.name + '</b></div>' +
      '<div class="poplabel">목표 ' + questDone(q) + '/' + q.goals.length + '</div>' + goalsHtml(q, true) + demandNowHtml(q) + blockerHtml() +
      siteHtml(q) + '<div class="stat"><span>보수</span><b>금 ' + money(q.reward.gold) + ' · 명성 +' + q.reward.fame + '</b></div>' +
      '<div class="dim small-text mainline">' + mainLineText(q) + '</div>';
  }
  function choreTabHtml(sc, scopeId) {
    var rest = 0, ready = 0;
    var rows = sc.tasks.map(function (t) {
      var need = Math.max(1, Number(t.need) || 1), prog = Math.max(0, Math.min(Number(t.prog) || 0, need));
      var g = gemsOf(t);
      if (!t.claimed) { rest += g; if (t.done) ready += g; }
      var act = t.claimed ? '<span class="cdone">받음</span>'
        : t.done ? '<button class="btn small primary" data-claimchore="' + esc(t.id) + '">받기</button>'
        : '<span class="dim small-text">진행 중</span>';
      return '<div class="chore' + (t.claimed ? ' claimed' : t.done ? ' ready' : '') + '" data-chore="' + esc(t.id) + '">' +
        '<div class="chead"><span>' + esc(t.label) + '</span><b>' + prog + '/' + need + '</b></div>' +
        '<div class="meter"><i style="width:' + pct(prog, need) + '"></i></div>' +
        '<div class="cfoot"><span class="creward">보석 ' + g + '</span>' + act + '</div></div>';
    }).join('');
    return '<div class="resetline">' + resetText(sc.resetIn) + '</div>' + (rows || '<div class="dim">지금은 퀘스트가 없어요</div>') +
      '<div class="stat total"><span>' + (rest > 0 ? '모두 받으면' : '모두 받았어요') + '</span><b>보석 ' + rest + '</b></div>' +
      (rest > 0 && ready > 0 ? '<div class="dim small-text">지금 받을 수 있는 보석 ' + ready + '</div>' : '') +
      '<div class="dim small-text choreNote">받지 않은 보상은 ' + (scopeId === 'weekly' ? '주' : '날') + '이 바뀌면 사라져요</div>';
  }

  function openQuestPop(q) {
    closeQuestPop();
    var chores = choresNow(), scopes = chores ? CHORE_SCOPES.filter(function (sc) { return chores[sc.id]; }) : [];
    if (questTab !== 'quest' && !scopes.some(function (sc) { return sc.id === questTab; })) questTab = 'quest';
    var bg = div('popbg', '<div class="pop" role="dialog" aria-label="퀘스트"><div class="seg poptabs"></div><div class="popbody"></div>' +
      '<button class="btn primary" data-closepop>닫기</button></div>');
    var pop = bg.firstChild, tabs = pop.querySelector('.poptabs'), body = pop.querySelector('.popbody');
    function draw() {
      var cur = choresNow(), sc = cur && cur[questTab];
      if (questTab !== 'quest' && !sc) questTab = 'quest';
      pop.classList.toggle('main', questTab === 'quest' && !!q && q.kind === 'main');
      tabs.hidden = !cur;
      tabs.innerHTML = [{ id: 'quest', label: '의뢰' }].concat(scopes).map(function (t) {
        var n = t.id !== 'quest' && cur && cur[t.id] ? claimableIn(cur[t.id]) : 0;
        return '<button data-qtab="' + t.id + '" class="' + (t.id === questTab ? 'on' : '') + '">' + t.label + (n > 0 ? '<i class="tdot"></i>' : '') + '</button>';
      }).join('');
      body.className = 'popbody' + (questTab === 'quest' ? '' : ' chores');
      body.innerHTML = questTab === 'quest' ? questTabHtml(RUN.quest || q) : choreTabHtml(sc, questTab);
    }
    bg.addEventListener('click', function (e) {
      var t = e.target;
      if (t === bg || (t.closest && t.closest('[data-closepop]'))) { closeQuestPop(); buzz('tap'); return; }
      var tab = t.closest && t.closest('[data-qtab]');
      if (tab) { questTab = tab.getAttribute('data-qtab'); buzz('tap'); draw(); return; }
      var cb = t.closest && t.closest('[data-claimchore]');
      if (cb) {
        var id = cb.getAttribute('data-claimchore'), r = P.claimChore(questTab, id) || {};
        toast(r.msg || (r.ok ? '보석을 받았어요' : '받을 수 없어요'));
        buzz(r.ok ? 'good' : 'warn');
        draw(); refreshHomeBits();
        if (r.ok) { flashUp(body.querySelector('[data-chore="' + id + '"]')); flashUp(document.querySelector('[data-chip="gems"]')); }
      }
    });
    draw();
    document.body.appendChild(bg);
    questPop = bg;
    leaveHooks.push(closeQuestPop); // 다른 화면으로 가거나 홈을 다시 그리면 같이 닫힘
  }

  // 방치 보상 팝업: 공방이 꺼져 있는 동안 쌓인 금. 받기 -> P.claimIdle()
  function openIdlePop() {
    var info = idleNow();
    if (!info) return;
    closeQuestPop();
    var cap = info.capped ? '<div class="idlecap">가득 찼어요. 최대 ' + (Number(info.maxHours) || 8) + '시간까지 쌓여요</div>' : '';
    var rate = Number(info.rate) > 0 ? '시간당 금 ' + money(Math.round(info.rate)) + ' · ' : '';
    var bg = div('popbg', '<div class="pop idle" role="dialog" aria-label="쌓인 금">' +
      '<div class="idlehead">공방이 쌓아 둔 금</div>' +
      '<div class="idlegold">금 ' + money(Math.floor(info.gold)) + '</div>' +
      '<div class="dim small-text idletime">' + minutesText(info.minutes) + ' 동안 쌓였어요</div>' + cap +
      '<div class="dim small-text">' + rate + '공방을 강화하면 늘어나요</div>' +
      '<button class="btn primary" data-claimidle>받기</button>' +
      '<button class="btn" data-closepop>나중에</button></div>');
    bg.addEventListener('click', function (e) {
      var t = e.target;
      if (t === bg || (t.closest && t.closest('[data-closepop]'))) { closeQuestPop(); buzz('tap'); return; }
      if (t.closest && t.closest('[data-claimidle]')) {
        var r = P.claimIdle() || {};
        popOnClose = null; closeQuestPop();
        idleSeen = false;
        toast(r.msg || (r.ok ? '금을 받았어요' : '받을 수 없어요'));
        buzz(r.ok ? 'good' : 'warn');
        refreshHomeBits();
        if (r.ok) flashUp(document.querySelector('[data-chip="gold"]'));
      }
    });
    document.body.appendChild(bg);
    questPop = bg;
    popOnClose = function () { idleSeen = true; }; // 받지 않고 닫음: 다시 홈에 와도 자동으로는 안 띄움 (무대 옆 버튼으로 받기)
    leaveHooks.push(closeQuestPop);
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeQuestPop(); });

  SCREENS.dungeon = function (el) {
    el.appendChild(head('던전 관리'));
    el.appendChild(div('seg', '<button class="on">1층</button><button disabled>2층 잠김</button><button disabled>3층 잠김</button>'));
    var Z = window.ZONES, fc = P.forecast();
    el.appendChild(div('card', '<h3>1층 판 (' + Z.MAP[0].length + '×' + Z.MAP.length + ')</h3><div class="zboard">' + window.ZONEVIEW.boardHtml({ zones: RUN.site.zones, units: RUN.site.units, flow: fc.flow }) +
      '</div><p class="dim small-text" style="text-align:center;margin:6px 0 0">문 위 숫자 = 침입자 ' + Z.PREVIEW_INVADERS + '명이 오면 지나갈 인원</p>'));
    var count = {}, skip = ['empty', 'boss', 'forest', 'split'];
    Object.keys(RUN.site.zones).forEach(function (zk) { var k = RUN.site.zones[zk]; if (skip.indexOf(k) < 0) count[k] = (count[k] || 0) + 1; });
    var rows = Object.keys(count).map(function (k) { return '<div class="stat"><span>' + Z.FAC[k].name + '</span><b>' + count[k] + '곳</b></div>'; }).join('');
    var sm = P.siteSummary();
    el.appendChild(div('card',
      '<h3>이 부지의 던전 (' + RUN.siteNo + '번째 부지)</h3>' +
      '<div class="stat"><span>던전 가치</span><b>' + sm.value + '</b></div>' +
      '<div class="stat"><span>건설 횟수</span><b>' + RUN.site.builds + '회</b></div>' +
      '<div class="stat"><span>대기실 몬스터</span><b>' + sm.monsters + '마리</b></div>' +
      (rows || '<div class="dim small-text">아직 지은 시설이 없어요</div>')));
    if (RUN.quest) el.appendChild(div('card', '<h3>의뢰 목표</h3>' + goalsHtml(RUN.quest, true) + demandNowHtml(RUN.quest) + blockerHtml()));
    el.appendChild(div('mt-auto', '<button class="btn primary" data-go="' + (RUN.quest ? 'build' : 'contract') + '">' + (RUN.quest ? '건설하기' : '의뢰 고르기') + '</button>'));
  };

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

  // 공방 화면 (탭 아님, 왼쪽 위 "← 홈"). 카드 3장 = P.WORKSHOPS 순서
  SCREENS.workshop = function (el) {
    el.appendChild(head('공방', 'home'));
    var gemBar = div('gembar'), list = div('wslist');
    el.appendChild(gemBar); el.appendChild(list);
    function draw() {
      gemBar.innerHTML = '<span>보유 보석</span><b>' + RUN.gems + '</b>';
      if (!(P.WORKSHOPS && P.workshopInfo)) { list.innerHTML = '<div class="card dim">공방은 준비 중이에요</div>'; return; }
      list.innerHTML = P.WORKSHOPS.map(function (w) {
        var inf = P.workshopInfo(w.id) || {}, off = w.ready === false || inf.ready === false, maxLv = inf.maxLv || w.maxLv || 0;
        var h = '<div class="card ws' + (off ? ' off' : '') + '" data-ws="' + esc(w.id) + '">' +
          '<div class="wshead"><h3>' + w.name + '</h3>' + (off ? '<span class="chip">준비 중</span>' : '<span class="chip accent">단계 ' + (inf.lv || 0) + '/' + maxLv + '</span>') + '</div>' +
          '<div class="dim small-text">' + (w.desc || '') + '</div>';
        if (!off) {
          h += '<div class="stat"><span>지금 효과</span><b>' + (inf.effect || '없음') + '</b></div>' +
            '<div class="stat"><span>다음 단계</span><b>' + (inf.next != null ? inf.next : '최대 단계예요') + '</b></div>';
        }
        return h + upBtn(inf, 'upws', w.id, off) + '</div>';
      }).join('');
    }
    list.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-upws]') : null;
      if (!b) return;
      var id = b.getAttribute('data-upws');
      var ok = tryUpgrade(P.workshopInfo(id) || {}, P.upgradeWorkshop, id);
      draw();
      if (ok) { flashUp(list.querySelector('[data-ws="' + id + '"]')); flashUp(gemBar); }
    });
    draw();
  };

  // ---------- 몬스터 모집 (부대 탭) · 광고 뽑기 (상점 탭) ----------
  // 계약(progress.js): P.TRIBES · P.recruitInfo(name) · P.recruit(name) · P.gachaInfo() · P.gachaPull(). 하나라도 없으면 그 묶음은 통째로 숨긴다.
  function uiLine(key, fb) { var u = window.LINES && window.LINES.ui; return u && typeof u[key] === 'string' && u[key].trim() ? u[key] : fb; }
  function hasRecruit() { return Array.isArray(P.TRIBES) && P.TRIBES.length > 0 && typeof P.recruitInfo === 'function' && typeof P.recruit === 'function'; }
  function hasGacha() { return typeof P.gachaInfo === 'function' && typeof P.gachaPull === 'function'; }
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
        return '<div class="rrow off" data-rt="' + n + '">' + gradeBadge(t.grade) + '<div class="rinfo"><b>' + n + '</b><small>' + esc(uiLine('recruitLocked', '상점의 광고 뽑기로 계약')) + '</small></div></div>';
      }
      var cost = recruitCost(inf), full = recruitFull(inf), poor = full || inf.canAfford === false;
      var stat = (t.hp != null ? ' · 체력 ' + t.hp : '') + (t.atk != null ? ' · 공격 ' + t.atk : '');
      return '<div class="rrow' + (full ? ' full' : '') + '" data-rt="' + n + '">' + gradeBadge(t.grade) +
        '<div class="rinfo"><b>' + n + '</b><small>' + (typeof inf.count === 'number' ? inf.count + (typeof inf.max === 'number' ? '/' + inf.max : '') + '마리' : '') + stat + '</small></div>' +
        '<button class="btn small primary rbtn' + (poor ? ' poor' : '') + '" data-recruit="' + n + '"' + (poor ? ' aria-disabled="true"' : '') + '>' +
        (full ? '가득 참' : '모집' + (cost != null ? ' (금 ' + money(cost) + ')' : '')) + '</button></div>';
    }).join('');
    return '<div class="card recruit"><div class="rhead"><h3>' + esc(uiLine('recruitHead', '몬스터 모집')) + '</h3><span class="chip">보유 금 ' + money(RUN.gold) + '</span></div>' + rows + '</div>';
  }
  // 모집 버튼을 눌렀을 때: 못 하는 이유가 있으면 토스트만, 아니면 P.recruit. 결과 { ok, msg, monster }를 돌려줌 (못 했으면 null)
  function tryRecruit(name) {
    var inf = safe(function () { return P.recruitInfo(name); }, {}), cost = recruitCost(inf);
    if (!inf.contracted) { toast(uiLine('recruitLocked', '상점의 광고 뽑기로 계약')); buzz('warn'); return null; }
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

  SCREENS.units = function (el) {
    el.appendChild(head('부대'));
    var tab = 'mon';
    var segEl = div('seg');
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
      segEl.innerHTML = '<button data-t="mon" class="' + (tab === 'mon' ? 'on' : '') + '">몬스터</button>' +
        '<button data-t="guard" class="' + (tab === 'guard' ? 'on' : '') + '">친위대 (최대 3칸)</button>';
      var s = '';
      if (tab === 'mon') {
        if (hasRecruit()) s += recruitHtml();
        if (hasTribe) s += '<div class="gemnote"><span class="chip accent">보석 ' + RUN.gems + '</span><span class="small-text dim">보석 강화는 몬스터 부족에 붙어 새 부지로 가도 남아요. 레벨은 친위대만 남아요.</span></div>';
        var groups = tribeGroups(RUN.monsters), allOpen = groups.length > 0 && groups.every(function (g) { return unitsOpen[g.name]; });
        if (groups.length) {
          s += '<div class="tgbar"><span class="small-text dim">' + groups.length + '부족 · 몬스터 ' + RUN.monsters.length + '마리</span>' +
            '<button class="btn small" data-tgall>' + esc(allOpen ? uiLine('unitsCloseAll', '모두 접기') : uiLine('unitsOpenAll', '모두 펼치기')) + '</button></div>';
        }
        s += groups.map(groupHtml).join('');
      } else {
        s += '<p class="dim small-text" style="margin:0">친위대는 납품(정산) 때 고릅니다. 보스·보물방을 지키는 몬스터입니다 (가짜).</p>';
        for (var i = 0; i < P.GUARD_MAX; i++) {
          var g = RUN.monsters.filter(function (m) { return m.id === RUN.guards[i]; })[0];
          s += '<div class="card unit"><div class="portrait">칸 ' + (i + 1) + '</div><div class="info"><b>' +
            (g ? g.name + ' Lv ' + g.lv : '비어 있음') + '</b></div></div>';
        }
      }
      listEl.innerHTML = s;
    }
    segEl.addEventListener('click', function (e) {
      var t = e.target.getAttribute && e.target.getAttribute('data-t');
      if (t) { tab = t; draw(); }
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

  SCREENS.leaders = function (el) {
    el.appendChild(head('부대장', 'home'));
    LEADERS.forEach(function (l) {
      el.appendChild(div('card unit',
        '<div class="portrait">도트<br>64×64</div><div class="info"><b>' + l.name + '</b><div class="dim small-text">' + l.trait + '</div>' +
        '<div class="small-text" style="margin-top:4px"><span class="chip accent">스킬</span> ' + l.skill + '</div></div>'));
    });
  };

  // 뽑기 결과의 대체 보상 글 (문자열이면 그대로, 숫자면 금, 객체면 금·보석)
  function refundText(rf) {
    if (rf == null || rf === false || rf === 0) return '';
    if (typeof rf === 'string') return rf;
    if (typeof rf === 'number') return '금 ' + money(rf);
    var p = [];
    if (rf.gold) p.push('금 ' + money(rf.gold));
    if (rf.gems) p.push('보석 ' + rf.gems);
    if (rf.text) p.push(String(rf.text));
    return p.join(' · ');
  }
  var BURST = { A: 6, S: 10, SS: 14, SSR: 22 }; // 등급별 터지는 알갱이 수 (높을수록 화려하게)
  var SHEEN = { A: 1, S: 1, SS: 1, SSR: 1 };

  SCREENS.shop = function (el) {
    el.appendChild(head('상점'));
    var tab = 'gacha', ratesOpen = false, busy = false, adTimer = null, buzzTimer = null, scrim = null, resBg = null;
    var segEl = div('seg');
    var body = div('');
    body.style.cssText = 'display:flex;flex-direction:column;gap:8px';

    // 광고 뽑기 카드 (몬스터). 안 되는 환경이면 빈 글
    function gachaHtml() {
      var gi = safe(function () { return P.gachaInfo(); }, null);
      if (!gi) return '';
      var left = Math.max(0, Number(gi.left) || 0), max = Math.max(left, typeof gi.perDay === 'number' && gi.perDay > 0 ? gi.perDay : (typeof gi.max === 'number' && gi.max > 0 ? gi.max : 3)), used = max - left;
      var ms = gi.resetIn != null ? gi.resetIn : gi.resetMs;
      var h = '<div class="card gacha"><h3>몬스터 뽑기</h3><div class="dim small-text">광고를 보면 몬스터 부족과 새로 계약하거나 몬스터를 얻어요</div>' +
        '<button class="btn big primary gadbtn' + (left ? '' : ' poor') + '" data-gad' + (left ? '' : ' aria-disabled="true"') + '>' + esc(uiLine('adButton', '광고 보고 뽑기')) +
        '<small>오늘 남은 ' + left + '/' + max + '</small></button>';
      if (!left) h += '<div class="gawait">' + esc(uiLine('gachaSoldOut', '오늘 뽑기를 다 썼어요')) + ' · ' + (typeof ms === 'number' ? resetText(ms) : '내일 다시 뽑을 수 있어요') + '</div>';
      var rates = Array.isArray(gi.rates) ? gi.rates : [];
      if (rates.length) {
        h += '<button class="gtoggle" data-grates aria-expanded="' + ratesOpen + '"><span>등급 확률</span><i>▾</i></button>';
        if (ratesOpen) {
          h += '<div class="grates">' + rates.map(function (r) {
            return '<div class="grate" data-g="' + esc(r.grade) + '">' + gradeBadge(r.grade) + '<div class="meter"><i style="width:' + Math.max(0, Math.min(100, Number(r.pct) || 0)) + '%"></i></div><b>' + esc(r.pct) + '%</b></div>';
          }).join('') + '</div>';
        }
      }
      var pool = Array.isArray(gi.pool) ? gi.pool : [];
      if (pool.length) {
        h += '<div class="gplbl">뽑기 대상 부족</div><div class="gpool">' + pool.map(function (p) {
          return '<div class="gprow">' + gradeBadge(p.grade) + '<b>' + esc(p.name) + '</b>' + (p.contracted ? '<span class="chip ok">계약함</span>' : '<span class="chip">미계약</span>') + '</div>';
        }).join('') + '</div>';
      }
      return h + '</div>';
    }
    function draw() {
      segEl.innerHTML = '<button data-t="gacha" class="' + (tab === 'gacha' ? 'on' : '') + '">뽑기</button>' +
        '<button data-t="goods" class="' + (tab === 'goods' ? 'on' : '') + '">물품</button>';
      var s = '';
      if (tab === 'gacha') {
        var g = GRADES.map(function (x) { return '<span class="chip">' + x + '</span>'; }).join('');
        var real = hasGacha() ? gachaHtml() : '';
        s += real;
        (real ? ['부대장 뽑기', '던전 강화 물품 뽑기'] : ['몬스터 뽑기', '부대장 뽑기', '던전 강화 물품 뽑기']).forEach(function (n) {
          s += '<div class="card"><h3>' + n + '</h3><div class="dim small-text">나올 수 있는 등급</div><div class="grades">' + g + '</div>' +
            '<div class="row"><button class="btn small grow" data-toast="광고는 출시 때 연결">광고 보고 뽑기</button>' +
            '<button class="btn small grow" data-toast="금 500을 썼어요 (가짜)">금 500 뽑기</button></div></div>';
        });
      } else {
        GOODS.forEach(function (it) {
          s += '<div class="card item"><div class="info"><b>' + it.name + '</b><div class="dim small-text">' + it.desc + '</div></div>' +
            '<button class="btn small" data-toast="' + it.name + ' 구매 (가짜)">금 ' + it.price + '</button></div>';
        });
      }
      body.innerHTML = s;
    }

    // 가짜 광고: 가림막을 잠깐 보여 준 뒤 뽑는다 (움직임 줄이기면 더 짧게). 도중에 다른 화면으로 가면 뽑지 않고 접는다
    function closeAd() {
      clearTimeout(adTimer); adTimer = null;
      if (scrim && scrim.parentNode) scrim.parentNode.removeChild(scrim);
      scrim = null; busy = false;
    }
    function closeRes() {
      clearTimeout(buzzTimer); buzzTimer = null;
      if (resBg && resBg.parentNode) resBg.parentNode.removeChild(resBg);
      resBg = null;
    }
    leaveHooks.push(function () { closeAd(); closeRes(); });
    function startAd() {
      if (busy) return;
      var gi = safe(function () { return P.gachaInfo(); }, null);
      if (!gi || !(Number(gi.left) > 0)) {
        var ms = gi && (gi.resetIn != null ? gi.resetIn : gi.resetMs);
        toast(esc(uiLine('gachaSoldOut', '오늘 뽑기를 다 썼어요')) + (typeof ms === 'number' ? ' · ' + resetText(ms) : ''));
        buzz('warn'); return;
      }
      busy = true; buzz('tap');
      var dur = S.reduce ? 400 : 1500;
      scrim = div('adscrim', '<div class="adbox" role="dialog" aria-label="광고"><b>' + esc(uiLine('adWatching', '광고 시청 중…')) + '</b>' +
        '<div class="dim small-text">' + esc(uiLine('adFake', '가짜 광고예요. 출시 때 진짜 광고가 연결돼요.')) + '</div><div class="adbar"><i></i></div></div>');
      document.body.appendChild(scrim);
      var bar = scrim.querySelector('.adbar i');
      void bar.offsetWidth;
      bar.style.transition = 'width ' + dur + 'ms linear';
      bar.style.width = '100%';
      adTimer = setTimeout(finishAd, dur);
    }
    function finishAd() {
      closeAd();
      var r = safe(function () { return P.gachaPull(); }, null);
      draw();
      if (!r || !r.ok || !r.result) { toast(r && r.msg ? r.msg : '뽑을 수 없어요'); buzz('warn'); return; }
      showResult(r.result, r.msg);
    }
    // 결과: 뒷면이 뒤집히며 등급 색 카드가 나타난다. 높을수록 빛·알갱이가 늘어난다. 움직임 줄이기에서는 바로 앞면
    function showResult(res, msg) {
      closeRes();
      var g = String(res.grade || 'F'), mon = res.monster, rf = refundText(res.refund);
      var stats = mon && mon.hp != null ? '체력 ' + mon.hp + (mon.atk != null ? ' · 공격 ' + mon.atk : '') : '';
      var parts = '';
      for (var i = 0, n = S.reduce ? 0 : (BURST[g] || 0); i < n; i++) {
        var ang = fxRandom() * Math.PI * 2, dist = 90 + fxRandom() * 70;
        parts += '<i class="gp' + (fxRandom() < 0.4 ? ' alt' : '') + '" style="--dx:' + Math.round(Math.cos(ang) * dist) + 'px;--dy:' + Math.round(Math.sin(ang) * dist) + 'px"></i>';
      }
      resBg = div('popbg gres', '<div class="gwrap" data-g="' + esc(g) + '"><div class="gflip"><div class="gface gback">?</div>' +
        '<div class="gface gfront">' + (SHEEN[g] ? '<div class="gsheen"></div>' : '') + '<div class="gg">' + esc(g) + '</div><div class="gn">' + esc(res.name || '???') + '</div>' +
        (stats ? '<div class="gs">' + esc(stats) + '</div>' : '') +
        (res.isNewContract ? '<span class="gnew">' + esc(uiLine('newContract', '새 계약!')) + '</span>' : '') +
        (rf ? '<div class="grefund">대체 보상 ' + esc(rf) + '</div>' : '') +
        (msg ? '<div class="gm dim">' + esc(msg) + '</div>' : '') + '</div></div>' + parts + '</div>' +
        '<button class="btn primary" data-closepop>확인</button>');
      resBg.setAttribute('role', 'dialog'); resBg.setAttribute('aria-label', '뽑기 결과');
      resBg.addEventListener('click', function (e) {
        if (e.target === resBg || (e.target.closest && e.target.closest('[data-closepop]'))) { closeRes(); buzz('tap'); }
      });
      document.body.appendChild(resBg);
      var strong = g === 'SSR' || g === 'SS' || g === 'S', mid = g === 'A' || g === 'B';
      buzzTimer = setTimeout(function () { buzz(strong ? 'best' : mid ? 'good' : 'tap'); }, S.reduce ? 0 : MOTION.dur.panel * 2.2);
    }

    segEl.addEventListener('click', function (e) {
      var t = e.target.getAttribute && e.target.getAttribute('data-t');
      if (t) { tab = t; draw(); }
    });
    body.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-gad],[data-grates]') : null;
      if (!t) return;
      if (t.hasAttribute('data-grates')) { ratesOpen = !ratesOpen; buzz('tap'); draw(); return; }
      startAd();
    });
    el.appendChild(segEl); el.appendChild(body); draw();
  };

  SCREENS.settings = function (el) {
    el.appendChild(head('설정', 'home'));
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
    el.appendChild(div('dim small-text', '되돌릴 수 없는 일은 길게 눌러야 동작합니다. 주·금·보석·명성·몬스터·의뢰가 모두 처음으로 돌아갑니다.'));
    el.appendChild(div('mt-auto dim small-text', '버전: C1 진행 구조 시안 0.4 (매주 전투, 구역 판 건설, 자동 저장)'));
  };

  SCREENS.records = function (el) {
    el.appendChild(head('기록·도감', 'home'));
    var lines = RUN.history.slice().reverse().map(function (h) {
      return '<li>' + h.week + '주째 - ' + (h.kind === 'main' ? '[메인 ' + h.grade + '급] ' : '') + h.name + ' 납품</li>';
    });
    lines.push('<li>창립 - 검은망치 건설, 직원은 소장 한 명</li>');
    el.appendChild(div('card', '<h3>회사 연혁</h3><ul class="plain">' + lines.join('') + '</ul>'));
    var dex = '';
    for (var i = 1; i <= 6; i++) dex += '<div>도감 자리<b>???</b></div>';
    el.appendChild(div('card', '<h3>침입자 도감</h3><div class="dim small-text" style="margin-bottom:8px">만난 침입자가 여기에 모입니다 (0 / 6)</div><div class="dex">' + dex + '</div>'));
  };

  // 건설 화면은 build.js (구역 판). SCREEN_PLUGINS.build 가 아래에서 SCREENS.build 로 등록된다.

  // 납품·정산 + 새 의뢰 고르기: 한 화면 (contract와 result가 같은 함수)
  // 위에서 아래로: 정산(보상·판매 대금·걸린 주) -> 가져가는 것/사라지는 것 -> 친위대 고르기 -> 새 의뢰 후보 카드.
  // 납품은 자동(목표 달성 시 autoDeliver)이라 "납품하기" 버튼은 없다. 후보 카드를 누르면 P.pickQuest(q, 친위대 id들) -> 홈.
  // 첫 시작(phase 'choose', report 없음)에는 정산·친위대 없이 후보만.
  // 새 필드(rep.gems · rep.carry · rep.lost · q.client · q.attr · q.reward.gems)가 없으면 그 줄을 숨긴다.
  function listHtml(arr) {
    return arr.length ? '<ul class="plain">' + arr.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' : '<div class="dim small-text">없음</div>';
  }
  function rewardHtml(rw) {
    var h = '<div><span>금</span><b>' + money(rw.gold || 0) + '</b></div>';
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
    h += '<ul class="plain qgoals">' + goalsHtml(q, false) + '</ul>' +
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
        '<div class="stat"><span>의뢰 보수</span><b>금 +' + money(r.base) + (r.gems ? ' · 보석 +' + r.gems : '') + ' · 명성 +' + r.fame + '</b></div>' +
        '<div class="stat"><span>판매 대금 (가치의 절반)</span><b>금 +' + money(r.sale) + '</b></div>' +
        '<div class="stat"><span>걸린 기간</span><b>' + r.weeks + '주</b></div>' +
        '<div class="stat total"><span>자금 합계</span><b>+' + money(r.gold) + '</b></div>' +
        '<div class="stat"><span>자금</span><b>' + money(r.goldBefore) + ' → ' + money(RUN.gold) + '</b></div>' +
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
        if (P.pickQuest(qq, ids.slice())) { buzz('good'); toast('새 부지에서 시작: ' + qq.name); go('home', true); }
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
    else if (name === 'home' && RUN.phase === 'play' && RUN.quest) {
      if (RUN.site.builds === 0) tutStart('build', { target: '#view .homebar [data-go="build"]' });
      else tutStart('nextweek', { target: '#tabs [data-week]' });
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
    // 전투 화면용: 하단 탭 막대 자리 (전투 시작 버튼이 가운데 "다음 주" 자리와 같은 곳에 오게 battle.js가 여기에 채운다)
    bar: function () { return tabsEl; },
    // 전투 화면용: 결과 반영(한 번만, 결과표 내용을 돌려줌) / 결과표에서 홈으로 (목표를 채웠으면 바로 납품)
    finishBattle: function (result) { return P.applyBattle(result); },
    backHome: function () { if (!autoDeliver()) go('home', false); }
  };
  var plugins = window.SCREEN_PLUGINS || {};
  Object.keys(plugins).forEach(function (k) { SCREENS[k] = plugins[k](API); });

  // ---------- 화면 바꾸기 ----------
  // 화면 지킴이: 상태에 맞지 않는 화면이면 맞는 화면으로 바꾼다 (주소 기록은 덮어씀)
  function guardScreen(name) {
    var to = name;
    if (!SCREENS[to]) to = 'home';
    if (RUN.phase === 'settle') to = 'result';                         // 납품 직후엔 정산부터
    else if (RUN.phase === 'play' && RUN.battling) to = 'battle';      // 전투를 시작했으면 끝날 때까지 전투 화면 (다른 보정보다 먼저)
    else if (to === 'result') to = 'home';
    else if (RUN.phase === 'choose' && (to === 'build' || to === 'battle')) to = 'contract'; // 의뢰 없이 건설·전투 불가
    else if (RUN.phase === 'play' && to === 'contract') to = 'home';
    else if (to === 'battle' && !(RUN.phase === 'play' && RUN.battling)) to = 'home'; // 다음 주를 눌러야만 전투
    else if (bootCheck && to === 'home' && RUN.phase === 'choose') to = 'contract'; // 켜자마자 의뢰가 없으면 바로 고르게
    bootCheck = false;
    if (to !== name) history.replaceState(null, '', '#' + to);
    return to;
  }
  var bootCheck = true;
  var lastName = '';

  function render() {
    leaveHooks.splice(0).forEach(function (fn) { fn(); });
    var name = guardScreen((location.hash || '#home').slice(1));
    if (name === 'home' && P.checkQuest() && autoDeliver()) return; // 결과표에서 새로고침한 경우 등: 목표를 채웠으면 납품
    tutLeave(name);
    var keep = name === lastName && !animateNext ? view.scrollTop : 0; // 같은 화면을 다시 그릴 땐 스크롤 유지
    justEnteredHome = name === 'home' && lastName !== 'home';
    lastName = name;
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

  // 하단 막대: 탭 화면(홈·던전·부대·상점)에서는 홈 · 던전 · [다음 주 ▶] · 부대 · 상점. 전투 화면에서는 비워 두고 battle.js가 채움. 그 외 화면은 숨김.
  function tabBtn(t, name) { return '<button data-go="' + t.id + '" class="' + (t.id === name ? 'on' : '') + '">' + t.label + '</button>'; }
  function drawTabs(name) {
    tabsEl.className = '';
    if (name === 'battle') { tabsEl.hidden = false; tabsEl.className = 'inbattle'; tabsEl.innerHTML = ''; return; }
    tabsEl.hidden = TAB_IDS.indexOf(name) < 0;
    var surge = RUN.phase === 'play' && RUN.quest && P.planInfo().surge;
    tabsEl.innerHTML = tabBtn(TABS[0], name) + tabBtn(TABS[1], name) +
      '<button class="tab-main' + (surge ? ' danger' : '') + '" data-week aria-label="다음 주">다음 주 ▶</button>' +
      tabBtn(TABS[2], name) + tabBtn(TABS[3], name);
  }
  tabsEl.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-week]')) startWeek();
  });

  // 눌림은 한 곳에서 받는다: data-go(앞으로, 애니메이션) · data-back(즉시) · data-toast
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-go],[data-back],[data-toast]') : null;
    if (!t) return;
    if (t.hasAttribute('data-toast')) { toast(t.getAttribute('data-toast')); buzz('tap'); return; }
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
