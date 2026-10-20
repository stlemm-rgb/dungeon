/* C1 전체 화면 뼈대 시안 (순수 JS, 가짜 숫자·가짜 문구)
 *
 * 화면 목록과 이동 규칙
 *  - 한 페이지 안에서 주소 끝의 해시(#home 등)로 화면을 바꾼다. 브라우저 뒤로 가기 = 이전 화면
 *    (나중에 안드로이드 뒤로 버튼과 연결).
 *  - 하단 탭 5개 화면: home · dungeon · units · shop · settings  (탭 막대가 보임)
 *  - 홈에서 가는 곳: leaders(부대장) · records(기록·도감) · contract(의뢰 받기) · settings(톱니)
 *  - 회차 진행 화면 (탭 막대 숨김):  contract -> build -> battle -> result -> home
 *  - 화면 하나 = 함수 하나: SCREENS.이름 = function (el) { el에 내용을 채운다 }  (나중에 React 화면 하나로 옮기기 쉽게)
 *  - 전환 애니메이션은 앞으로 갈 때만 (var(--dur-sheet) var(--ease-out)). 뒤로/닫기는 즉시.
 *  - 이 시안은 state가 없다: 화면은 가짜 데이터를 그리기만 한다. 바뀌는 것은 설정(localStorage)뿐.
 */
(function () {
  'use strict';

  // ---------- 연출용 무작위 (게임용 무작위 아님) ----------
  function fxRandom() { return Math.random(); }

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
    { id: 'captain', name: '부대장 1', x: 266, y: 220, w: 64, h: 80,  lines: ['명령만 내리십시오.', '침입자는 제가 막죠.', '오늘 훈련은 끝났습니다.'] },
    { id: 'mon1',    name: '몬스터 1', x: 98, y: 284, w: 52, h: 54,  lines: ['끄륵?', '배고프다...', '끄르륵!'] },
    { id: 'mon2',    name: '몬스터 2', x: 212, y: 284, w: 52, h: 54,  lines: ['꾸웅.', '주인, 놀자.', '꾸엑!'] }
  ];

  var MONSTERS = [
    { name: '슬라임',   lv: 4, hp: 120, atk: 8 },  { name: '고블린',   lv: 3, hp: 90,  atk: 14 },
    { name: '스켈레톤', lv: 5, hp: 140, atk: 16 }, { name: '박쥐 떼',  lv: 2, hp: 60,  atk: 10 },
    { name: '늑대 사냥개', lv: 3, hp: 110, atk: 18 }, { name: '돌 골렘', lv: 6, hp: 300, atk: 12 }
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
  var RECORDS = ['1장 1회차 - 첫 납품 성공. 보수 800', '1장 2회차 - 진행 중', '창립 - 검은망치 건설, 직원은 소장 한 명'];
  var BOARD = ['.....', '.B...', '.....', '..S..', '.....', '.....', '..E..']; // B=보스 S=시설 E=입구 (가짜)
  var CONTRACTS = [
    { title: '함정 위주 던전', demon: '은발 마왕', need: ['함정 구역 4곳 이상', '던전 가치 600 이상', '입구에서 보스방까지 구역 7곳'],
      advance: 400, pay: 900, foe: '모험가 3명 (체력 180, 공격 14)' },
    { title: '몬스터 위주 던전', demon: '은발 마왕', need: ['몬스터 대기실 3곳 이상', '몬스터 6마리 배치', '보물방 지키기'],
      advance: 300, pay: 1100, foe: '모험가 4명 + 사제 1명' }
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
  function boardHtml() {
    var s = '';
    BOARD.forEach(function (row) {
      row.split('').forEach(function (c) {
        var mark = c === 'B' ? '보스' : c === 'S' ? '시설' : c === 'E' ? '입구' : '';
        s += '<i' + (mark ? ' class="sp"' : '') + '>' + mark + '</i>';
      });
    });
    return '<div class="board">' + s + '</div>';
  }

  // ---------- 화면들 (함수 하나씩) ----------
  var SCREENS = {};

  SCREENS.home = function (el) {
    var status = div('status',
      '<div class="line1"><span class="company">검은망치 건설</span><span class="chip accent">1장 2회차</span>' +
      '<button class="gear" data-go="settings" aria-label="설정">&#9881;&#xFE0E;</button></div>' +
      '<div class="line2"><span class="chip">자금 12,400</span><span class="chip">명성 3</span></div>');
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
    el.appendChild(stage);

    var quick = div('quick',
      '<button class="btn" data-go="leaders">부대장</button>' +
      '<button class="btn" data-go="records">기록·도감</button>' +
      '<button class="btn" data-toast="우편함은 아직 비어 있어요">우편함<span class="badge">2</span></button>');
    el.appendChild(quick);
    var big = div('mt-auto', '<button class="btn primary big" data-go="contract">의뢰 받기</button>');
    el.appendChild(big);
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
    el.appendChild(div('card', '<h3>1층 판 (5×7)</h3>' + boardHtml() + '<p class="dim small-text" style="text-align:center;margin:6px 0 0">가짜 미리보기</p>'));
    el.appendChild(div('card',
      '<h3>던전 가치와 요구 조건</h3>' +
      '<div class="stat"><span>던전 가치</span><b>480 / 600</b></div>' +
      '<div class="stat"><span>함정 구역</span><b>3 / 4</b></div>' +
      '<div class="stat"><span>몬스터 대기실</span><b>1 / 2</b></div>'));
    el.appendChild(div('mt-auto', '<a class="btn primary" href="../a7_nest16/index.html">건설하기 (시안 A7 열기)</a>'));
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
        MONSTERS.forEach(function (m) {
          s += '<div class="card unit"><div class="portrait">도트<br>48×48</div><div class="info"><b>' + m.name + '</b> <span class="chip">Lv ' + m.lv + '</span>' +
            '<div class="nums"><span>체력 ' + m.hp + '</span><span>공격 ' + m.atk + '</span></div></div></div>';
        });
      } else {
        s += '<p class="dim small-text" style="margin:0">친위대는 보스·보물방을 지키는 몬스터입니다 (가짜).</p>';
        ['돌 골렘 Lv 6', '스켈레톤 Lv 5', '비어 있음'].forEach(function (n, i) {
          s += '<div class="card unit"><div class="portrait">칸 ' + (i + 1) + '</div><div class="info"><b>' + n + '</b></div></div>';
        });
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
      holdTimer = setTimeout(function () { stopHold(); buzz('warn'); toast('시안이라 아무 일도 일어나지 않아요'); }, MOTION.hold.charge);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { hold.addEventListener(ev, stopHold); });
    el.appendChild(hold);
    el.appendChild(div('dim small-text', '되돌릴 수 없는 일은 길게 눌러야 동작합니다. (시안에서는 실제로 지우지 않음)'));
    el.appendChild(div('mt-auto dim small-text', '버전: C1 뼈대 시안 0.1'));
  };

  SCREENS.records = function (el) {
    el.appendChild(head('기록·도감', 'home'));
    el.appendChild(div('card', '<h3>회사 연혁</h3><ul class="plain">' + RECORDS.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>'));
    var dex = '';
    for (var i = 1; i <= 6; i++) dex += '<div>도감 자리<b>???</b></div>';
    el.appendChild(div('card', '<h3>침입자 도감</h3><div class="dim small-text" style="margin-bottom:8px">만난 침입자가 여기에 모입니다 (0 / 6)</div><div class="dex">' + dex + '</div>'));
  };

  SCREENS.contract = function (el) {
    el.appendChild(head('마왕의 의뢰서', 'home'));
    el.appendChild(div('dim small-text', '두 장 중 한 장을 고르세요.'));
    CONTRACTS.forEach(function (c) {
      el.appendChild(div('card contract',
        '<h3>' + c.title + '</h3><div class="dim small-text">의뢰인: ' + c.demon + '</div>' +
        '<ul class="plain" style="margin-top:6px">' + c.need.map(function (n) { return '<li>- ' + n + '</li>'; }).join('') + '</ul>' +
        '<div class="money"><div>선금<b>' + c.advance + '</b></div><div>보수<b>' + c.pay + '</b></div></div>' +
        '<div class="dim small-text" style="margin-bottom:8px">침입자: ' + c.foe + '</div>' +
        '<button class="btn primary" data-go="build">이걸로</button>'));
    });
  };

  SCREENS.build = function (el) {
    el.appendChild(head('1일째 건설', 'contract', '← 의뢰'));
    el.appendChild(div('days', '<span class="on">1일 건설</span><span>2일 건설</span><span>3일 침입</span>'));
    el.appendChild(div('card', boardHtml() + '<p class="dim small-text" style="text-align:center;margin:6px 0 0">남은 예산 1,150 (가짜)</p>'));
    el.appendChild(div('mt-auto', '<a class="btn" href="../a7_nest16/index.html">시안 A7에서 짓기</a>'));
    el.appendChild(div('', '<button class="btn primary big" data-go="battle">침입 시작</button>'));
  };

  SCREENS.battle = function (el) {
    var fastBtn = '<button class="btn small" data-fast>빨리 감기 ×1</button>';
    el.appendChild(head('3일째 침입', null, null, fastBtn));
    var field = div('field');
    var dots = [['p1', '', 9], ['p2', '', 11], ['p3', '', 13], ['p1', 'foe', 7], ['p2', 'foe', 8], ['p3', 'foe', 10]];
    dots.forEach(function (d, i) {
      var dot = div('dot ' + d[0] + ' ' + d[1]);
      dot.style.setProperty('--t', d[2] + 's');
      dot.style.animationDelay = (-i * 1.3) + 's';
      field.appendChild(dot);
    });
    el.appendChild(field);
    el.appendChild(div('bar', '<i></i>'));
    el.appendChild(div('dim small-text', '위쪽: 자동 실시간 전투 (가짜 점 움직임). 흰 점 = 우리, 주황 점 = 침입자'));

    var zone = div('cardzone',
      '<button class="edge top" data-toast="효과 C: 위로 보냄 (가짜)">↑ 효과 C</button>' +
      '<button class="edge left" data-toast="효과 A: 왼쪽으로 보냄 (가짜)">← 효과 A</button>' +
      '<div class="event"><b>이벤트 카드</b><span class="small-text">위에서 내려온 카드. 좌·우·위로 보내면 강력한 효과 (끌기는 3단계)</span></div>' +
      '<button class="edge right" data-toast="효과 B: 오른쪽으로 보냄 (가짜)">효과 B →</button>');
    el.appendChild(zone);
    el.appendChild(div('', '<button class="btn primary" data-go="result">전투 끝 (가짜)</button>'));
    var fast = false;
    el.querySelector('[data-fast]').addEventListener('click', function (e) {
      fast = !fast;
      field.classList.toggle('fast', fast);
      e.currentTarget.textContent = '빨리 감기 ×' + (fast ? 2 : 1);
    });
  };

  SCREENS.result = function (el) {
    el.appendChild(head('정산'));
    el.appendChild(div('stamp', '납품 성공'));
    el.appendChild(div('card',
      '<h3>받은 돈</h3>' +
      '<div class="stat"><span>남은 선금</span><b>+150</b></div>' +
      '<div class="stat"><span>보수</span><b>+900</b></div>' +
      '<div class="stat"><span>판매 대금</span><b>+240</b></div>' +
      '<div class="stat"><span>합계</span><b>+1,290</b></div>'));
    el.appendChild(div('card', '<h3>명성</h3><div class="stat"><span>명성</span><b>3 → 4</b></div>'));
    el.appendChild(div('card',
      '<h3>몬스터 레벨업</h3><ul class="plain"><li>슬라임 Lv 4 → 5</li><li>고블린 Lv 3 → 4</li><li>스켈레톤 경험치 +2</li></ul>'));
    el.appendChild(div('mt-auto', '<button class="btn primary big" data-go="home">다음 회차로</button>'));
    buzz('stamp');
  };

  // ---------- 화면 바꾸기 ----------
  function render() {
    var name = (location.hash || '#home').slice(1);
    if (!SCREENS[name]) { name = 'home'; history.replaceState(null, '', '#home'); }
    var el = div('screen');
    SCREENS[name](el);
    if (animateNext) el.classList.add('enter');
    animateNext = false;
    view.innerHTML = '';
    view.appendChild(el);
    view.scrollTop = 0;
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
