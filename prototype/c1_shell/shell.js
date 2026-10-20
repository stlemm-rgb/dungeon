/* C1 전체 화면 뼈대 시안 (순수 JS, 가짜 숫자·가짜 문구)
 *
 * 화면 목록과 이동 규칙
 *  - 한 페이지 안에서 주소 끝의 해시(#home 등)로 화면을 바꾼다. 브라우저 뒤로 가기 = 이전 화면
 *    (나중에 안드로이드 뒤로 버튼과 연결).
 *  - 하단 탭 5개 화면: home · dungeon · units · shop · settings  (탭 막대가 보임)
 *  - 홈에서 가는 곳: leaders(부대장) · records(기록·도감) · build(건설) · battle(다음 주 = 매주 전투) · settings(톱니)
 *  - 진행 화면 (탭 막대 숨김): contract(의뢰 고르기) -> home -> build / battle -> (목표 달성 즉시) result(납품·정산) -> contract
 *  - 홈 "다음 주"를 누르면 이번 주 전투가 시작되고(PROGRESS.startBattle) 결과를 반영할 때까지 전투 화면에서 못 나간다.
 *  - 진행 상태와 규칙은 progress.js (window.PROGRESS). 이 파일은 그 값을 보고 그리기만 하고,
 *    값을 바꾸는 것은 PROGRESS의 정해진 함수(buildZone·startBattle·watchAd·applyBattle·deliver·pickQuest …)로만 한다.
 *  - 화면 지킴이(render 안): 정산 중이면 어느 화면이든 result로, 의뢰가 없으면 contract로, 의뢰가 있으면 contract 못 들어감.
 *  - 건설 화면(구역 판)은 build.js, 전투 화면은 battle.js (SCREEN_PLUGINS). 판 규칙은 zones.js.
 *  - 화면 하나 = 함수 하나: SCREENS.이름 = function (el) { el에 내용을 채운다 }  (나중에 React 화면 하나로 옮기기 쉽게)
 *  - 전환 애니메이션은 앞으로 갈 때만 (var(--dur-sheet) var(--ease-out)). 뒤로/닫기는 즉시.
 *  - 숫자는 가짜(균형 없음). 상태(RUN)는 progress.js가 localStorage에 자동 저장한다. 설정은 이 파일이 따로 저장.
 */
(function () {
  'use strict';

  // ---------- 연출용 무작위 (게임용 무작위 아님) ----------
  function fxRandom() { return Math.random(); }

  // ---------- 진행 상태 (progress.js) ----------
  var P = window.PROGRESS, RUN = P.RUN;

  // ---------- 가짜 데이터 ----------
  var TABS = [
    { id: 'home', label: '홈' }, { id: 'dungeon', label: '던전' }, { id: 'units', label: '부대' },
    { id: 'shop', label: '상점' }, { id: 'settings', label: '설정' }
  ];
  var TAB_IDS = TABS.map(function (t) { return t.id; });

  // 홈 무대의 도트 캐릭터 자리. 나중에 그림만 끼우면 된다. 좌표는 360x400 무대 기준 (바닥선 y=300).
  var STAGE_W = 360, STAGE_H = 400;
  var STAGE_SLOTS = [
    { id: 'demon',   name: '은발 마왕', x: 22,  y: 198, w: 72, h: 102, lines: ['흥, 이번엔 제대로 지어 와.', '늦으면 보수 깎는다. 알겠어?', '...기대 같은 건 안 하니까.'] },
    { id: 'boss',    name: '소장',     x: 144, y: 220, w: 72, h: 80,  lines: ['오늘도 안전 제일입니다.', '도면은 머릿속에 다 있죠.', '납기만 맞추면 됩니다.'] },
    { id: 'captain', name: '부대장 1', x: 266, y: 220, w: 64, h: 80,  lines: ['명령만 내리십시오.', '침입자는 제가 막죠.', '오늘 훈련은 끝났습니다.'] }
  ];

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
  function showMsgs(msgs) { msgs.slice(0, MOTION.toast.max).forEach(function (m) { toast(m); }); }
  // 목표를 다 채운 순간 어느 화면에서든 자동으로 납품(정산)으로 간다
  function autoDeliver() {
    if (!P.checkQuest()) return false;
    var rep = P.deliver();
    if (!rep) return false;
    toastsEl.innerHTML = ''; // 앞선 토스트는 치우고 납품 알림만
    toast((rep.wasMain ? '메인 의뢰 완료! ' : '목표 달성! ') + rep.quest.name + ' 납품');
    buzz('best');
    go('result', true);
    return true;
  }

  // ---------- 화면들 (함수 하나씩) ----------
  var SCREENS = {};

  SCREENS.home = function (el) {
    var q = RUN.quest;
    var status = div('status',
      '<div class="line1"><span class="company">검은망치 건설</span><span class="chip accent">' + RUN.week + '주째</span>' +
      '<button class="gear" data-go="settings" aria-label="설정">&#9881;&#xFE0E;</button></div>' +
      '<div class="line2"><span class="chip">금 ' + money(RUN.gold) + '</span><span class="chip">보석 ' + RUN.gems + '</span><span class="chip">명성 ' + RUN.fame + '</span></div>');
    el.appendChild(status);

    // 대기 화면 무대: STAGE_SLOTS를 그대로 그린다
    var stage = div('stage', '<div class="floor"></div><span class="hint">대기 화면 무대 (캐릭터를 누르면 말함)</span>');
    STAGE_SLOTS.forEach(function (s, i) {
      var b = document.createElement('button');
      b.className = 'slot' + (s.id === 'demon' ? ' boss' : '');
      b.style.left = pct(s.x, STAGE_W); b.style.top = pct(s.y, STAGE_H);
      b.style.width = pct(s.w, STAGE_W); b.style.height = pct(s.h, STAGE_H);
      b.style.animationDelay = (-i * 0.7) + 's';
      b.innerHTML = '도트 자리<b>' + s.name + '</b>' + s.w + '×' + s.h;
      b.addEventListener('click', function () { say(stage, s); });
      stage.appendChild(b);
    });
    // 부대장·기록·우편함 버튼은 무대 바닥 위에 얹는다 (홈이 한 화면에 들어오게)
    stage.appendChild(div('quick',
      '<button class="btn" data-go="leaders">부대장</button>' +
      '<button class="btn" data-go="records">기록·도감</button>' +
      '<button class="btn" data-toast="우편함은 아직 비어 있어요">우편함<span class="badge">2</span></button>'));
    el.appendChild(stage);

    // 현재 의뢰 카드 + 메인 의뢰까지 + 침입 예고
    if (q) {
      var nextGrade = P.MAIN_GRADES[Math.min(P.MAIN_GRADES.length - 1, RUN.mainGrade + 1)];
      var mainLine = q.kind === 'main' ? '지금 의뢰가 메인 의뢰예요. 끝내면 다음 메인은 ' + nextGrade + '급'
        : RUN.questsDone >= P.NORMAL_TO_MAIN ? '메인 의뢰가 열렸어요. 다음 후보에 나옵니다'
        : '메인 의뢰까지 일반 의뢰 ' + RUN.questsDone + '/' + P.NORMAL_TO_MAIN + ' (다음 메인 ' + P.MAIN_GRADES[RUN.mainGrade] + '급)';
      el.appendChild(div('card quest' + (q.kind === 'main' ? ' main' : ''),
        '<div class="qhead"><span class="chip accent">' + questTag(q) + '</span><b>' + q.name + '</b></div>' + goalsHtml(q, true) +
        '<div class="dim small-text mainline">' + mainLine + '</div>'));
      // 이번 주 침입자 알림 한 줄 + 광고 보기(가짜). 대량 출현이면 경고와 합친다
      var pi = P.planInfo(), n = P.surgeIn();
      var line = '이번 주 침입자 ' + pi.count + '명 · 최고 ' + pi.top + '급';
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

    // 아래 버튼 줄은 화면 아래에 붙여 둔다 (스크롤해도 보임)
    var bar = div('homebar');
    if (!q) {
      bar.innerHTML = '<button class="btn primary big" data-go="contract">의뢰 고르기</button>';
    } else {
      bar.innerHTML = '<button class="btn big" data-go="build">건설</button>' +
        '<button class="btn primary big' + (P.planInfo().surge ? ' danger' : '') + '" data-week>다음 주 ▶</button>';
      bar.querySelector('[data-week]').addEventListener('click', function () {
        var r = P.startBattle();
        if (!r.ok) { showMsgs(r.msgs); buzz('warn'); return; }
        buzz('tap');
        go('battle', true);
      });
    }
    el.appendChild(bar);
  };

  // 말풍선: 하나만 떠 있고 3초 뒤 사라진다
  var bubbleTimer = null;
  function say(stage, slot) {
    var old = stage.querySelector('.bubble');
    if (old) stage.removeChild(old);
    clearTimeout(bubbleTimer);
    var W = stage.clientWidth, H = stage.clientHeight, bw = 170;
    var cx = (slot.x + slot.w / 2) / STAGE_W * W;
    var left = Math.max(4, Math.min(W - bw - 4, cx - bw / 2));
    var line = slot.lines[Math.floor(fxRandom() * slot.lines.length)];
    var b = div('bubble', '<small>' + slot.name + '</small>' + line);
    b.style.left = left + 'px';
    b.style.setProperty('--tail', (cx - left) + 'px');
    stage.appendChild(b);
    b.style.top = Math.max(4, slot.y / STAGE_H * H - b.offsetHeight - 10) + 'px';
    buzz('tap');
    bubbleTimer = setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 3000);
  }

  SCREENS.dungeon = function (el) {
    el.appendChild(head('던전 관리'));
    el.appendChild(div('seg', '<button class="on">1층</button><button disabled>2층 잠김</button><button disabled>3층 잠김</button>'));
    var Z = window.ZONES, fc = P.forecast();
    el.appendChild(div('card', '<h3>1층 판 (5×7)</h3><div class="zboard">' + window.ZONEVIEW.boardHtml({ zones: RUN.site.zones, units: RUN.site.units, flow: fc.flow }) +
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
    if (RUN.quest) el.appendChild(div('card', '<h3>의뢰 목표</h3>' + goalsHtml(RUN.quest, true)));
    el.appendChild(div('mt-auto', '<button class="btn primary" data-go="' + (RUN.quest ? 'build' : 'contract') + '">' + (RUN.quest ? '건설하기' : '의뢰 고르기') + '</button>'));
  };

  SCREENS.units = function (el) {
    el.appendChild(head('부대'));
    var tab = 'mon';
    var segEl = div('seg');
    var listEl = div('', '');
    listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    function draw() {
      segEl.innerHTML = '<button data-t="mon" class="' + (tab === 'mon' ? 'on' : '') + '">몬스터</button>' +
        '<button data-t="guard" class="' + (tab === 'guard' ? 'on' : '') + '">친위대 (최대 3칸)</button>';
      var s = '';
      if (tab === 'mon') {
        RUN.monsters.forEach(function (m) {
          s += '<div class="card unit"><div class="portrait">도트<br>48×48</div><div class="info"><b>' + m.name + '</b> <span class="chip">Lv ' + m.lv + '</span> ' +
            '<span class="chip">등급 ' + P.monGrade(m.lv) + '</span>' +
            '<div class="nums"><span>체력 ' + m.hp + '</span><span>공격 ' + m.atk + '</span><span>경험치 ' + m.exp + '/2</span></div></div></div>';
        });
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

  SCREENS.shop = function (el) {
    el.appendChild(head('상점'));
    var tab = 'gacha';
    var segEl = div('seg');
    var body = div('');
    body.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    function draw() {
      segEl.innerHTML = '<button data-t="gacha" class="' + (tab === 'gacha' ? 'on' : '') + '">뽑기</button>' +
        '<button data-t="goods" class="' + (tab === 'goods' ? 'on' : '') + '">물품</button>';
      var s = '';
      if (tab === 'gacha') {
        var g = GRADES.map(function (x) { return '<span class="chip">' + x + '</span>'; }).join('');
        ['몬스터 뽑기', '부대장 뽑기', '던전 강화 물품 뽑기'].forEach(function (n) {
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
    segEl.addEventListener('click', function (e) {
      var t = e.target.getAttribute && e.target.getAttribute('data-t');
      if (t) { tab = t; draw(); }
    });
    el.appendChild(segEl); el.appendChild(body); draw();
  };

  SCREENS.settings = function (el) {
    el.appendChild(head('설정'));
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

  // 의뢰 고르기: 후보는 progress.js가 만들어 저장해 둔다 (새로고침해도 같은 후보)
  SCREENS.contract = function (el) {
    var first = RUN.history.length === 0 && RUN.siteNo === 0;
    el.appendChild(head(first ? '첫 의뢰를 고르세요' : '다음 의뢰를 고르세요'));
    var list = P.offerQuests();
    var hasMain = list.some(function (q) { return q.kind === 'main'; });
    el.appendChild(div('dim small-text', hasMain ? '메인 의뢰가 열렸어요! 한 장만 고릅니다. 목표를 다 채우면 바로 납품돼요. 기한은 없어요.'
      : '한 장만 고릅니다. 목표를 다 채우면 바로 납품돼요. 기한은 없어요. (' + RUN.questsDone + '/' + P.NORMAL_TO_MAIN + ' 일반 의뢰 완료)'));
    list.forEach(function (q) {
      var c = div('card contract' + (q.kind === 'main' ? ' main' : ''),
        '<div class="qhead"><span class="chip accent">' + questTag(q) + '</span><h3>' + q.name + '</h3></div>' +
        '<ul class="plain" style="margin-top:6px">' + goalsHtml(q, false) + '</ul>' +
        '<div class="money"><div>보수<b>' + money(q.reward.gold) + '</b></div><div>명성<b>+' + q.reward.fame + '</b></div></div>' +
        '<button class="btn primary" data-pick="' + q.id + '">이걸로</button>');
      c.querySelector('[data-pick]').addEventListener('click', function () {
        if (P.pickQuest(q)) { buzz('good'); toast('새 부지에서 시작: ' + q.name); go('home', true); }
      });
      el.appendChild(c);
    });
  };

  // 건설 화면은 build.js (구역 판). SCREEN_PLUGINS.build 가 아래에서 SCREENS.build 로 등록된다.

  // 납품·정산: 목표를 다 채운 순간 자동으로 여기로 온다
  SCREENS.result = function (el) {
    var r = RUN.report;
    var main = r.wasMain;
    el.appendChild(head('납품·정산'));
    el.appendChild(div('stamp' + (main ? ' main' : ''), main ? '메인 의뢰 완료!' : '납품 완료'));
    el.appendChild(div('dim small-text', r.quest.name + ' · ' + r.weeks + '주 걸림 · 던전 가치 ' + r.value + ' · 건설 ' + r.builds + '회'));
    el.appendChild(div('card payout' + (main ? ' main' : ''),
      '<h3>보상</h3>' +
      '<div class="stat"><span>의뢰 보수</span><b>+' + money(r.base) + '</b></div>' +
      '<div class="stat"><span>판매 대금 (가치의 절반)</span><b>+' + money(r.sale) + '</b></div>' +
      '<div class="stat total"><span>자금 합계</span><b>+' + money(r.gold) + '</b></div>' +
      '<div class="stat"><span>자금</span><b>' + money(r.goldBefore) + ' → ' + money(RUN.gold) + '</b></div>' +
      '<div class="stat"><span>명성</span><b>' + r.fameBefore + ' → ' + RUN.fame + '</b></div>'));
    el.appendChild(div('dim small-text mainline', r.nextMain));

    var gbox = div('card');
    el.appendChild(gbox);
    function drawGuards() {
      gbox.innerHTML = '<h3>친위대 고르기 (' + RUN.guards.length + '/' + P.GUARD_MAX + ')</h3>' +
        '<div class="dim small-text" style="margin-bottom:6px">다음 부지로 함께 갈 몬스터 부대입니다. 안 골라도 돼요.</div><div class="guards"></div>';
      var gl = gbox.querySelector('.guards');
      RUN.monsters.forEach(function (m) {
        var on = RUN.guards.indexOf(m.id) >= 0;
        var b = document.createElement('button');
        b.className = 'gbtn' + (on ? ' on' : '');
        b.innerHTML = '<b>' + m.name + '</b><span>Lv ' + m.lv + ' · ' + P.monGrade(m.lv) + '</span>';
        b.addEventListener('click', function () {
          var ids = RUN.guards.slice();
          var i = ids.indexOf(m.id);
          if (i >= 0) ids.splice(i, 1);
          else if (ids.length >= P.GUARD_MAX) { toast('친위대는 최대 ' + P.GUARD_MAX + '칸이에요'); buzz('warn'); return; }
          else ids.push(m.id);
          P.setGuards(ids); buzz('tap'); drawGuards();
        });
        gl.appendChild(b);
      });
    }
    drawGuards();
    var nb = div('mt-auto', '<button class="btn primary big" data-next>다음 의뢰 고르기</button>');
    nb.querySelector('[data-next]').addEventListener('click', function () {
      if (P.toContract()) { buzz('tap'); go('contract', true); }
    });
    el.appendChild(nb);
    buzz(main ? 'best' : 'stamp');
  };

  // ---------- 화면 플러그인 (화면을 별도 파일로 뺄 때: battle.js) ----------
  // 별도 파일은 SCREEN_PLUGINS.이름 = function (api) { return function (el) {...}; } 로 등록한다.
  // api.onLeave(fn): 다른 화면으로 나갈 때 한 번 불러 준다 (타이머·루프 정리용).
  var leaveHooks = [];
  var API = {
    toast: toast, buzz: buzz, fxRandom: fxRandom, div: div, go: go, onLeave: function (fn) { leaveHooks.push(fn); },
    // 건설 화면용 (build.js)
    head: head, questTag: questTag, goalsHtml: goalsHtml, autoDeliver: autoDeliver,
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
    else if (to === 'result') to = 'home';
    else if (RUN.phase === 'choose' && (to === 'build' || to === 'battle')) to = 'contract'; // 의뢰 없이 건설·전투 불가
    else if (RUN.phase === 'play' && to === 'contract') to = 'home';
    else if (RUN.phase === 'play' && RUN.battling) to = 'battle';                 // 전투를 시작했으면 끝날 때까지 전투 화면
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
    var keep = name === lastName && !animateNext ? view.scrollTop : 0; // 같은 화면을 다시 그릴 땐 스크롤 유지
    lastName = name;
    P.setBattle(name === 'battle'); // 전투 화면에 있는 동안은 건설 불가
    document.body.setAttribute('data-screen', name);
    var el = div('screen');
    SCREENS[name](el);
    if (animateNext) el.classList.add('enter');
    animateNext = false;
    view.innerHTML = '';
    view.appendChild(el);
    view.scrollTop = keep;
    // 탭 막대는 5개 화면에서만
    var isTab = TAB_IDS.indexOf(name) >= 0;
    tabsEl.hidden = !isTab;
    tabsEl.innerHTML = TABS.map(function (t) {
      return '<button data-go="' + t.id + '" class="' + (t.id === name ? 'on' : '') + '">' + t.label + '</button>';
    }).join('');
  }

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

  applyReduce();
  render();
})();
