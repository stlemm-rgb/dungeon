/* C1 전투 화면 체험판: 실시간 자동 전투 + 이벤트 카드 좌·우·위 보내기 (가짜 숫자, 균형 없음)
 *
 * 목적: 카드 방향 방식 두 가지를 직접 끌어 보며 차이를 느끼기.
 *   섞기 = 방향은 분야(함정/몬스터/개입), 효과는 카드가 정함 -> 카드마다 3줄이 다름
 *   고정 = 방향이 효과를 정함, 카드는 상황 설명만 -> 3줄이 늘 같음
 *
 * 구조 (shell.js의 SCREEN_PLUGINS 방식)
 *  - BATTLE_CARDS: 카드 데이터 8장. FIXED_SIDES: 고정 모드의 방향별 효과.
 *  - start(el): 화면 하나를 만들고 requestAnimationFrame 루프를 돌린다. 나갈 때 api.onLeave로 멈춘다.
 *  - 연출용 무작위는 api.fxRandom만. 침입자 길 고르기·카드 순서·카드 간격은 고정 표(게임용 무작위 없음).
 *  - 곡선·시간·스와이프 기준·진동은 전부 MOTION.* 에서.
 */
(function () {
  'use strict';

  // ---------- 카드 데이터 ----------
  // side: { text, kind, power }  kind 목록
  //   trapCorr(복도 함정 피해 x power) · trapRoom(함정방) · trapAll(둘 다) · monAtk(몬스터 공격 x power) · monSpawn(추가 몬스터 power마리)
  //   strike(가장 앞 침입자에게 power 피해) · curse(모든 침입자에게 power 피해) · freeze(모든 침입자 power초 멈춤)
  // up에는 cost: { mood: 1 } 또는 { gold: 20 }
  var BATTLE_CARDS = [
    { id: 'c1', title: '모험가가 함정 복도에 들어섰다!',
      left:  { text: '이 복도 함정 피해 ×3', kind: 'trapCorr', power: 3 },
      right: { text: '대기실 몬스터 기습', kind: 'monSpawn', power: 2 },
      up:    { text: '천장 붕괴 (마왕 기분 -1)', kind: 'strike', power: 80, cost: { mood: 1 } } },
    { id: 'c2', title: '성직자가 회복 주문을 외운다',
      left:  { text: '가시 함정이 주문 끊기', kind: 'trapAll', power: 2 },
      right: { text: '몬스터가 성직자 집중 공격', kind: 'monAtk', power: 2.5 },
      up:    { text: '부대장이 저주 (자금 -20)', kind: 'curse', power: 25, cost: { gold: 20 } } },
    { id: 'c3', title: '도적이 함정 해제를 시도한다',
      left:  { text: '함정방 해제 방해 ×3', kind: 'trapRoom', power: 3 },
      right: { text: '그림자 몬스터 매복', kind: 'monSpawn', power: 1 },
      up:    { text: '부대장 일격 (마왕 기분 -1)', kind: 'strike', power: 70, cost: { mood: 1 } } },
    { id: 'c4', title: '겁먹은 신참이 주저한다',
      left:  { text: '함정방으로 몰아넣기 ×2', kind: 'trapRoom', power: 2 },
      right: { text: '몬스터 으르렁 공격 ×2', kind: 'monAtk', power: 2 },
      up:    { text: '마왕 호통 (마왕 기분 -1)', kind: 'curse', power: 15, cost: { mood: 1 } } },
    { id: 'c5', title: '일행이 보물방 쪽으로 몰린다',
      left:  { text: '보물 미끼 함정 ×3', kind: 'trapAll', power: 3 },
      right: { text: '보물 지킴이 소환', kind: 'monSpawn', power: 2 },
      up:    { text: '보물 폭파 (자금 -20)', kind: 'curse', power: 30, cost: { gold: 20 } } },
    { id: 'c6', title: '횃불이 꺼졌다!',
      left:  { text: '어둠 속 함정 ×2', kind: 'trapAll', power: 2 },
      right: { text: '어둠 속 몬스터 공격 ×3', kind: 'monAtk', power: 3 },
      up:    { text: '침입자 멈칫 (마왕 기분 -1)', kind: 'freeze', power: 3, cost: { mood: 1 } } },
    { id: 'c7', title: '용병단이 합류했다',
      left:  { text: '복도 함정 압박 ×2', kind: 'trapCorr', power: 2 },
      right: { text: '몬스터 총동원', kind: 'monSpawn', power: 3 },
      up:    { text: '부대장 돌격 (마왕 기분 -1)', kind: 'strike', power: 100, cost: { mood: 1 } } },
    { id: 'c8', title: '마왕이 구경하러 왔다',
      left:  { text: '마왕 앞 함정 시연 ×4', kind: 'trapAll', power: 4 },
      right: { text: '몬스터 힘자랑 ×3.5', kind: 'monAtk', power: 3.5 },
      up:    { text: '마왕 직접 한 방 (마왕 기분 -2)', kind: 'strike', power: 120, cost: { mood: 2 } } }
  ];
  // 고정 모드: 카드가 무엇이든 방향마다 효과가 같다 (종류도 세기도)
  var FIXED_SIDES = {
    left:  { text: '함정 강화', kind: 'trapAll', power: 2.5 },
    right: { text: '몬스터 강화', kind: 'monAtk', power: 2.5 },
    up:    { text: '부대장 개입 (마왕 기분 -1)', kind: 'strike', power: 70, cost: { mood: 1 } }
  };
  var MODE_INFO = {
    mix: { name: '섞기', desc: '방향은 분야, 카드가 효과를 정함', toast: '섞기: 다음 카드부터 카드마다 효과 3줄이 달라요' },
    fix: { name: '고정', desc: '방향이 효과를 정함, 카드는 상황 설명만', toast: '고정: 다음 카드부터 효과 3줄이 늘 같아요' }
  };
  var DIR_MARK = { left: '←', right: '→', up: '↑' };

  // ---------- 가짜 숫자 ----------
  var TOTAL = 12;              // 침입자 수
  var SPAWN_EVERY = 5;         // 초(전투 시간): 침입자 간격
  var BASE_SPEED = 11;         // 판 눈금(0~100)/초
  var TRAP_CORR_DPS = 9, TRAP_ROOM_DPS = 14, TRAP_ROOM_STAY = 3;
  var INV_DPS = 16, MON_DPS = 12, MON_HP = 60, MON_RESPAWN = 8;
  var FX_LEN = 7;              // 초(실제 시간): 카드 효과 지속
  var CARD_LIFE = 5;           // 초(실제 시간): 카드 제한시간
  var CARD_SLOW = 0.3;         // 카드가 떠 있는 동안 전투 속도 배율
  var CARD_GAPS = [3, 8, 7.5, 9, 7, 10, 8.5, 7]; // 카드 사이 간격(초, 실제 시간). 첫 카드는 3초 뒤
  var ROUTES_PICK = ['L', 'R', 'R', 'L', 'L', 'R', 'L', 'R', 'R', 'L', 'R', 'L']; // 갈림길: 반반 (게임용 무작위 아님)

  // 판 좌표는 0~100 눈금 (가로 x, 세로 y). 칸 = 사각형.
  var ROOMS = {
    entrance: { x1: 35, x2: 65, y1: 1,  y2: 11, label: '입구', cls: '' },
    corr:     { x1: 42, x2: 58, y1: 14, y2: 40, label: '함정 복도', cls: 'trap' },
    fork:     { x1: 36, x2: 64, y1: 43, y2: 53, label: '갈림길', cls: '' },
    trapRoom: { x1: 3,  x2: 41, y1: 58, y2: 80, label: '함정방', cls: 'trap' },
    monRoom:  { x1: 59, x2: 97, y1: 58, y2: 80, label: '몬스터 대기실', cls: 'mon' },
    boss:     { x1: 28, x2: 72, y1: 85, y2: 98, label: '보스방', cls: 'boss' }
  };
  var LINES = [[50, 11, 50, 14], [50, 40, 50, 43], [50, 53, 22, 58], [50, 53, 78, 58], [22, 80, 40, 85], [78, 80, 60, 85]];
  var ROUTE_L = [{ x: 50, y: 3 }, { x: 50, y: 44 }, { x: 50, y: 50 }, { x: 22, y: 66, stay: TRAP_ROOM_STAY }, { x: 36, y: 86 }, { x: 50, y: 92, end: true }];
  var ROUTE_R = [{ x: 50, y: 3 }, { x: 50, y: 44 }, { x: 50, y: 50 }, { x: 78, y: 66, fight: true }, { x: 64, y: 86 }, { x: 50, y: 92, end: true }];
  var MON_SLOTS = [[68, 72], [88, 72], [64, 64], [92, 64], [72, 76], [84, 76]];

  // 모드는 화면을 다시 들어와도 유지 (사용자가 고른 것)
  var mode = 'mix';

  function inRect(r, x, y) { return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2; }
  function zoneOf(x, y) {
    if (inRect(ROOMS.corr, x, y)) return 'corr';
    if (inRect(ROOMS.trapRoom, x, y)) return 'trapRoom';
    if (inRect(ROOMS.monRoom, x, y)) return 'monRoom';
    return '';
  }
  function fmtMult(m) { return (m % 1 ? m.toFixed(1) : String(m)); }
  function tf(x, y, r) { return 'translate(' + x + 'px,' + y + 'px) rotate(' + r + 'deg)'; }

  window.SCREEN_PLUGINS = window.SCREEN_PLUGINS || {};
  window.SCREEN_PLUGINS.battle = function (api) {
    var div = api.div, buzz = api.buzz, fxRandom = api.fxRandom;

    function start(el) {
      var run = { alive: true, raf: 0 };
      api.onLeave(function () { run.alive = false; cancelAnimationFrame(run.raf); });
      el.className = 'screen bz-screen';

      // ---------- 상태 ----------
      var B = {
        fast: 1, time: 0, spawned: 0, killed: 0, breached: 0, used: 0, missed: 0, usedMix: 0, usedFix: 0,
        mood: 5, gold: 1200, over: false,
        invaders: [], monsters: [], card: null, cardIdx: 0, nextIn: CARD_GAPS[0], spawnT: 0.5,
        fx: { corr: { m: 1, t: 0 }, room: { m: 1, t: 0 }, mon: { m: 1, t: 0 } }
      };

      // ---------- 화면 만들기 ----------
      el.innerHTML =
        '<div class="head"><button class="back" data-back="home">← 홈</button><h2>침입 전투</h2>' +
        '<button class="btn small bz-fast" type="button">빨리 감기 ×1</button></div>' +
        '<div class="bz-modebar"><div class="seg bz-seg"><button type="button" data-mode="mix">섞기</button><button type="button" data-mode="fix">고정</button></div>' +
        '<div class="bz-modedesc dim"></div></div>' +
        '<div class="bz-stats"><span class="bz-score"></span><span class="chip bz-mood"></span><span class="chip bz-gold"></span></div>' +
        '<div class="bz-field"></div>' +
        '<div class="bz-zone"><div class="bz-edge up">↑ 개입</div><div class="bz-edge left">← 함정</div>' +
        '<div class="bz-slot"><div class="bz-wait dim">다음 카드를 기다리는 중…</div></div>' +
        '<div class="bz-edge right">몬스터 →</div></div>' +
        '<div class="bz-btns"><button class="btn bz-b left" type="button" data-dir="left">← 함정</button>' +
        '<button class="btn bz-b up" type="button" data-dir="up">↑ 개입</button>' +
        '<button class="btn bz-b right" type="button" data-dir="right">몬스터 →</button></div>';

      var field = el.querySelector('.bz-field');
      var zone = el.querySelector('.bz-zone');
      var slot = el.querySelector('.bz-slot');
      var scoreEl = el.querySelector('.bz-score');
      var moodEl = el.querySelector('.bz-mood');
      var goldEl = el.querySelector('.bz-gold');
      var fastBtn = el.querySelector('.bz-fast');
      var modeDesc = el.querySelector('.bz-modedesc');
      var dirBtns = el.querySelectorAll('.bz-b');

      // 전투판: 길(선) + 칸 + 점 층 + 연출 층
      var svg = '<svg class="bz-lines" viewBox="0 0 100 100" preserveAspectRatio="none">';
      LINES.forEach(function (l) { svg += '<line x1="' + l[0] + '" y1="' + l[1] + '" x2="' + l[2] + '" y2="' + l[3] + '"/>'; });
      field.innerHTML = svg + '</svg>';
      var roomEls = {};
      Object.keys(ROOMS).forEach(function (k) {
        var r = ROOMS[k];
        var d = div('bz-room ' + r.cls, r.label + '<span class="bz-badge"></span>');
        d.style.left = r.x1 + '%'; d.style.top = r.y1 + '%';
        d.style.width = (r.x2 - r.x1) + '%'; d.style.height = (r.y2 - r.y1) + '%';
        field.appendChild(d); roomEls[k] = d;
      });
      var dotLayer = div('bz-layer'); field.appendChild(dotLayer);
      var fxLayer = div('bz-layer'); field.appendChild(fxLayer);
      var banner = div('bz-banner'); field.appendChild(banner);

      // ---------- 작은 도구 ----------
      function floatText(x, y, text, cls) {
        var f = div('bz-float ' + (cls || ''), text);
        f.style.left = x + '%'; f.style.top = y + '%';
        f.addEventListener('animationend', function () { if (f.parentNode) f.parentNode.removeChild(f); });
        fxLayer.appendChild(f);
      }
      function retrigger(node, cls) { // 같은 애니메이션을 처음부터 다시
        node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
      }
      function showBanner(dir, text) {
        banner.textContent = DIR_MARK[dir] + ' ' + text;
        banner.setAttribute('data-d', dir);
        retrigger(banner, 'show');
      }
      function shake() {
        field.animate([
          { transform: 'translate(0,0)' }, { transform: 'translate(-7px,4px)' }, { transform: 'translate(6px,-5px)' },
          { transform: 'translate(-4px,3px)' }, { transform: 'translate(3px,-2px)' }, { transform: 'translate(0,0)' }
        ], { duration: MOTION.dur.fx, easing: MOTION.ease.shake });
      }
      function drawModeBar() {
        el.querySelectorAll('[data-mode]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === mode); });
        modeDesc.textContent = MODE_INFO[mode].desc;
      }
      function drawStats() {
        scoreEl.textContent = '처치 ' + B.killed + ' · 돌파 ' + B.breached + ' · 남은 침입자 ' + (TOTAL - B.killed - B.breached);
        moodEl.textContent = '마왕 기분 ' + B.mood;
        goldEl.textContent = '자금 ' + B.gold.toLocaleString('en-US');
      }
      function setHot(hot, armed) {
        if (hot) el.setAttribute('data-hot', hot); else el.removeAttribute('data-hot');
        if (armed) el.setAttribute('data-armed', armed); else el.removeAttribute('data-armed');
      }

      // ---------- 점 만들기 ----------
      function newDot(cls) {
        var d = div('bz-dot ' + cls, '<i class="bz-hp"><b></b></i>');
        dotLayer.appendChild(d);
        return d;
      }
      function setHp(o) {
        var r = Math.max(0, o.hp / o.max);
        o.hpEl.style.width = (r * 100) + '%';
        o.el.classList.toggle('low', r < 0.35);
      }
      function spawnInvader() {
        var id = B.spawned;
        var route = ROUTES_PICK[id] === 'L' ? ROUTE_L : ROUTE_R;
        var d = newDot('inv');
        var inv = {
          id: id, route: route, wp: 1, x: route[0].x, y: route[0].y, prog: 0, wait: 0, frozen: 0, hurt: 0, hurtOn: false,
          hp: 90 + (id % 4) * 15, max: 0, el: d, hpEl: d.querySelector('b'), alive: true, fighting: false,
          ox: ((id * 7) % 9 - 4) * 0.8, oy: ((id * 5) % 7 - 3) * 0.8
        };
        inv.max = inv.hp;
        B.invaders.push(inv); B.spawned++;
        setHp(inv); placeInv(inv);
      }
      function placeInv(o) { o.el.style.left = (o.x + o.ox) + '%'; o.el.style.top = (o.y + o.oy) + '%'; }
      function addMonster(extra) {
        var used = {};
        B.monsters.forEach(function (m) { used[m.slot] = true; });
        var s = -1;
        for (var i = 0; i < MON_SLOTS.length; i++) { if (!used[i]) { s = i; break; } }
        if (s < 0) return;
        var d = newDot('mon pop');
        var m = { slot: s, hp: MON_HP, max: MON_HP, extra: extra, life: FX_LEN, down: 0, el: d, hpEl: d.querySelector('b'), hurt: 0, hurtOn: false };
        d.style.left = MON_SLOTS[s][0] + '%'; d.style.top = MON_SLOTS[s][1] + '%';
        B.monsters.push(m); setHp(m);
      }
      function removeDot(o, cls) {
        o.el.classList.add(cls || 'gone');
        o.el.addEventListener('animationend', function () { if (o.el.parentNode) o.el.parentNode.removeChild(o.el); });
      }
      addMonster(false); addMonster(false);

      // ---------- 카드 효과 ----------
      function boost(key, roomKey, m, label) {
        var f = B.fx[key]; f.m = m; f.t = FX_LEN;
        var r = roomEls[roomKey];
        r.classList.add('boost');
        r.querySelector('.bz-badge').textContent = label + ' ×' + fmtMult(m);
        retrigger(r, 'flash');
      }
      function frontInvader() {
        var best = null;
        B.invaders.forEach(function (o) { if (o.alive && (!best || o.prog > best.prog)) best = o; });
        return best;
      }
      function damageInv(o, dmg, big) {
        if (!o.alive) return;
        o.hp -= dmg; o.hurt = 0.18;
        floatText(o.x + o.ox, o.y + o.oy - 4, '-' + Math.round(dmg), big ? 'big' : '');
      }
      function applyEffect(dir, side, cost) {
        showBanner(dir, side.text);
        switch (side.kind) {
          case 'trapCorr': boost('corr', 'corr', side.power, '함정'); break;
          case 'trapRoom': boost('room', 'trapRoom', side.power, '함정'); break;
          case 'trapAll': boost('corr', 'corr', side.power, '함정'); boost('room', 'trapRoom', side.power, '함정'); break;
          case 'monAtk': boost('mon', 'monRoom', side.power, '공격'); break;
          case 'monSpawn':
            for (var i = 0; i < side.power; i++) addMonster(true);
            retrigger(roomEls.monRoom, 'flash'); roomEls.monRoom.classList.add('boost');
            roomEls.monRoom.querySelector('.bz-badge').textContent = '몬스터 +' + side.power;
            B.fx.mon.t = Math.max(B.fx.mon.t, FX_LEN);
            break;
          case 'strike':
            var f = frontInvader();
            if (f) { damageInv(f, side.power, true); f.el.classList.add('target'); retrigger(f.el, 'target'); }
            shake(); break;
          case 'curse':
            B.invaders.forEach(function (o) { damageInv(o, side.power, false); });
            shake(); break;
          case 'freeze':
            B.invaders.forEach(function (o) { if (o.alive) o.frozen = side.power; });
            shake(); break;
        }
        if (side.kind === 'strike' || side.kind === 'curse' || side.kind === 'freeze') {
          // 개입 계열 대가 표시
          if (cost) {
            if (cost.mood) { B.mood -= cost.mood; floatText(50, 62, '마왕 기분 -' + cost.mood, 'big cost'); retrigger(moodEl, 'pop'); }
            if (cost.gold) { B.gold -= cost.gold; floatText(50, 70, '자금 -' + cost.gold, 'big cost'); retrigger(goldEl, 'pop'); }
          }
        }
        drawStats();
      }

      // ---------- 카드 ----------
      function sidesFor(card) {
        return mode === 'fix' ? FIXED_SIDES : { left: card.left, right: card.right, up: card.up };
      }
      function setWait() { slot.classList.toggle('has-card', !!B.card); dirBtns.forEach(function (b) { b.disabled = !B.card || B.card.state !== 'idle'; }); }

      function spawnCard() {
        var data = BATTLE_CARDS[B.cardIdx % BATTLE_CARDS.length];
        var sides = sidesFor(data);
        var card = { data: data, sides: sides, mode: mode, state: 'idle', age: 0, dragging: false, dx: 0, dy: 0 };
        var c = div('bz-card',
          '<div class="bz-timer"><i></i></div><span class="bz-tag">' + MODE_INFO[mode].name + '</span>' +
          '<b class="bz-title">' + data.title + '</b>' +
          ['left', 'right', 'up'].map(function (d) {
            return '<div class="bz-line ' + d + '"><em>' + DIR_MARK[d] + '</em><span>' + sides[d].text + '</span></div>';
          }).join(''));
        card.el = c; card.bar = c.querySelector('.bz-timer');
        slot.appendChild(c);
        B.card = card; setWait();
        c.animate([{ transform: 'translateY(-300px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
          { duration: MOTION.dur.panel, easing: MOTION.ease.popS });
        attachDrag(card);
        B.cardIdx++;
        buzz('tap');
      }

      function endCard(card) { // 카드가 끝남: 속도 복귀, 다음 카드 시계
        B.card = null; B.nextIn = CARD_GAPS[B.cardIdx % CARD_GAPS.length];
        setHot(null, null); setWait();
      }

      function resolveCard(dir) {
        var card = B.card;
        if (!card || card.state !== 'idle' || B.over) return;
        card.state = 'done';
        B.used++; if (card.mode === 'fix') B.usedFix++; else B.usedMix++;
        endCard(card);
        applyEffect(dir, card.sides[dir], card.sides[dir].cost);
        buzz('good');
        // 날아가기: 반대로 16px 움츠렸다가 그 방향으로 460px
        var ux = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, uy = dir === 'up' ? -1 : 0;
        var r0 = card.dx * 0.05;
        var a = card.el.animate([
          { transform: tf(card.dx, card.dy, r0), opacity: 1, easing: 'ease-out' },
          { transform: tf(card.dx - 16 * ux, card.dy - 16 * uy, r0), opacity: 1, offset: 0.2, easing: MOTION.ease.out },
          { transform: tf(ux ? ux * 460 : card.dx, uy ? -460 : card.dy, r0 + ux * 10), opacity: 0.2 }
        ], { duration: MOTION.dur.panel, fill: 'forwards' });
        a.onfinish = function () { if (card.el.parentNode) card.el.parentNode.removeChild(card.el); };
      }

      function expireCard(card) {
        card.state = 'expired'; B.missed++;
        endCard(card);
        var a = card.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.dur.fade, fill: 'forwards' });
        a.onfinish = function () { if (card.el.parentNode) card.el.parentNode.removeChild(card.el); };
      }

      function attachDrag(card) {
        var c = card.el, sx = 0, sy = 0, pid = null, armed = null;
        function dirs(dx, dy) {
          var T = MOTION.swipe.threshold, adx = Math.abs(dx);
          var hot = null, arm = null;
          if (dy < -10 && -dy > adx) hot = 'up'; else if (adx > 10) hot = dx < 0 ? 'left' : 'right';
          if (dy < -T && -dy > adx) arm = 'up'; else if (adx > T) arm = dx < 0 ? 'left' : 'right';
          return { hot: hot, arm: arm };
        }
        c.addEventListener('pointerdown', function (e) {
          if (card.state !== 'idle' || pid !== null) return;
          c.getAnimations().forEach(function (a) { a.finish(); });
          pid = e.pointerId; sx = e.clientX; sy = e.clientY; card.dragging = true; armed = null;
          try { c.setPointerCapture(pid); } catch (err) { /* 무시 */ }
          c.classList.add('drag');
          e.preventDefault();
        });
        c.addEventListener('pointermove', function (e) {
          if (pid === null || e.pointerId !== pid) return;
          card.dx = e.clientX - sx; card.dy = e.clientY - sy;
          c.style.transform = tf(card.dx, card.dy, card.dx * 0.05);
          var d = dirs(card.dx, card.dy);
          if (d.arm && d.arm !== armed) buzz('tap'); // 기준을 넘는 순간 진동 한 번
          armed = d.arm;
          setHot(d.hot, d.arm);
        });
        function release(e, cancelled) {
          if (pid === null || e.pointerId !== pid) return;
          pid = null; card.dragging = false;
          c.classList.remove('drag');
          var arm = armed; armed = null;
          if (!cancelled && arm && card.state === 'idle') {
            c.style.transform = '';
            resolveCard(arm);
            return;
          }
          setHot(null, null);
          // 제자리 복귀 (스프링)
          var from = c.style.transform || tf(0, 0, 0);
          c.style.transform = '';
          c.animate([{ transform: from }, { transform: tf(0, 0, 0) }], { duration: MOTION.dur['return'], easing: MOTION.ease.spring });
          card.dx = 0; card.dy = 0;
        }
        c.addEventListener('pointerup', function (e) { release(e, false); });
        c.addEventListener('pointercancel', function (e) { release(e, true); });
      }

      // ---------- 이어지는 시계 ----------
      function tickCards(real) {
        if (B.over) return;
        var card = B.card;
        if (card) {
          if (card.state !== 'idle') return;
          if (!card.dragging) card.age += real; // 끌고 있는 동안은 제한시간이 멈춘다
          var left = Math.max(0, 1 - card.age / CARD_LIFE);
          card.bar.firstChild.style.width = (left * 100) + '%';
          card.bar.classList.toggle('low', left < 0.3);
          if (card.age >= CARD_LIFE) expireCard(card);
        } else if (B.spawned < TOTAL || B.invaders.some(function (o) { return o.alive; })) {
          B.nextIn -= real;
          if (B.nextIn <= 0) spawnCard();
        }
      }
      function tickEffects(real) {
        [['corr', 'corr'], ['room', 'trapRoom'], ['mon', 'monRoom']].forEach(function (p) {
          var f = B.fx[p[0]];
          if (f.t > 0) {
            f.t -= real;
            if (f.t <= 0) { f.m = 1; f.t = 0; roomEls[p[1]].classList.remove('boost'); }
          }
        });
        B.monsters.slice().forEach(function (m) {
          if (m.extra) {
            m.life -= real;
            if (m.life <= 0 || m.hp <= 0) { B.monsters.splice(B.monsters.indexOf(m), 1); removeDot(m, 'gone'); }
          }
        });
      }

      // ---------- 전투 ----------
      function stepBattle(dt, real) {
        // 침입자 들어오기
        if (B.spawned < TOTAL) {
          B.spawnT -= dt;
          if (B.spawnT <= 0) { spawnInvader(); B.spawnT += SPAWN_EVERY; }
        }
        var monsAlive = B.monsters.filter(function (m) { return m.hp > 0; });
        // 침입자 이동·피해
        B.invaders.forEach(function (o) {
          if (!o.alive) return;
          var z = zoneOf(o.x, o.y);
          if (z === 'corr') o.hp -= TRAP_CORR_DPS * B.fx.corr.m * dt;
          if (z === 'trapRoom') o.hp -= TRAP_ROOM_DPS * B.fx.room.m * dt;
          if (o.frozen > 0) { o.frozen -= dt; }
          else if (o.wait > 0) { o.wait -= dt; }
          else {
            var t = o.route[o.wp];
            var dx = t.x - o.x, dy = t.y - o.y, dist = Math.sqrt(dx * dx + dy * dy), stepLen = BASE_SPEED * dt;
            if (t.fight && monsAlive.length && dist <= Math.max(stepLen, 0.5)) { // 대기실에 도착했고 몬스터가 있으면 멈춰서 싸움
              o.x = t.x; o.y = t.y; o.fighting = true;
            } else {
              o.fighting = false;
              if (dist <= stepLen) {
                o.x = t.x; o.y = t.y; o.prog += dist;
                if (t.stay) { o.wait = t.stay; }
                o.wp++;
                if (t.end) { o.alive = false; B.breached++; removeDot(o, 'through'); floatText(50, 86, '돌파!', 'cost'); retrigger(roomEls.boss, 'flash'); }
              } else { o.x += dx / dist * stepLen; o.y += dy / dist * stepLen; o.prog += stepLen; }
            }
          }
          if (o.hurt > 0) o.hurt -= real;
        });
        // 몬스터와 침입자 맞붙기
        var fighters = B.invaders.filter(function (o) { return o.alive && o.fighting; });
        if (fighters.length && monsAlive.length) {
          var tgt = monsAlive[0];
          tgt.hp -= INV_DPS * fighters.length * dt; tgt.hurt = 0.12;
        }
        var inRoom = B.invaders.filter(function (o) { return o.alive && zoneOf(o.x, o.y) === 'monRoom'; });
        if (inRoom.length) {
          monsAlive.forEach(function (m) {
            if (m.hp <= 0) return;
            var v = inRoom[0];
            v.hp -= MON_DPS * B.fx.mon.m * dt; v.hurt = 0.12;
          });
        }
        // 쓰러짐 정리
        B.invaders.forEach(function (o) {
          if (o.alive && o.hp <= 0) {
            o.alive = false; B.killed++; removeDot(o, 'gone'); floatText(o.x + o.ox, o.y + o.oy - 4, '처치', 'cost');
          }
        });
        B.monsters.forEach(function (m) {
          if (m.hp <= 0 && !m.extra) {
            if (!m.down) { m.down = MON_RESPAWN; m.el.classList.add('down'); }
            m.down -= dt;
            if (m.down <= 0) { m.down = 0; m.hp = m.max; m.el.classList.remove('down'); retrigger(m.el, 'pop'); }
          }
        });
      }

      function paint() {
        B.invaders.forEach(function (o) {
          if (!o.alive) return;
          placeInv(o); setHp(o);
          var on = o.hurt > 0;
          if (on !== o.hurtOn) { o.hurtOn = on; o.el.classList.toggle('hit', on); }
          o.el.classList.toggle('frozen', o.frozen > 0);
        });
        B.monsters.forEach(function (m) {
          setHp(m);
          var on = m.hurt > 0;
          m.hurt -= 0.016;
          if (on !== m.hurtOn) { m.hurtOn = on; m.el.classList.toggle('hit', on); }
        });
        drawStats();
      }

      function finish() {
        B.over = true;
        if (B.card && B.card.state === 'idle') { B.card.state = 'done'; var cc = B.card; B.card = null; if (cc.el.parentNode) cc.el.parentNode.removeChild(cc.el); }
        setHot(null, null); setWait();
        var modeLabel = (B.usedMix && B.usedFix) ? '섞기 ' + B.usedMix + '장 · 고정 ' + B.usedFix + '장' : (B.usedFix ? '고정' : B.usedMix ? '섞기' : MODE_INFO[mode].name);
        var box = div('bz-result',
          '<div class="card bz-resbox"><h3>전투 끝</h3>' +
          '<div class="stat"><span>처치</span><b>' + B.killed + '</b></div>' +
          '<div class="stat"><span>돌파</span><b>' + B.breached + '</b></div>' +
          '<div class="stat"><span>쓴 카드</span><b>' + B.used + '장</b></div>' +
          '<div class="stat"><span>놓친 카드</span><b>' + B.missed + '장</b></div>' +
          '<div class="stat"><span>카드 방식</span><b>' + modeLabel + '</b></div>' +
          '<div class="stat"><span>마왕 기분 · 자금</span><b>' + B.mood + ' · ' + B.gold + '</b></div>' +
          '<div class="bz-resbtns"><button class="btn" type="button" data-again>다시 해 보기</button>' +
          '<button class="btn primary" type="button" data-go="result">정산으로</button></div></div>');
        box.querySelector('.card').animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
          { duration: MOTION.dur.panel, easing: MOTION.ease.popS });
        box.querySelector('[data-again]').addEventListener('click', function () {
          run.alive = false; cancelAnimationFrame(run.raf);
          buzz('tap');
          el.innerHTML = ''; start(el);
        });
        el.appendChild(box);
        buzz('stamp');
      }

      // ---------- 루프 ----------
      var last = performance.now();
      function frame(now) {
        if (!run.alive) return;
        run.raf = requestAnimationFrame(frame);
        var real = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
        if (B.over) return;
        tickCards(real);
        var spd = B.fast * ((B.card && B.card.state === 'idle') ? CARD_SLOW : 1);
        tickEffects(real);
        stepBattle(real * spd, real);
        paint();
        if (B.spawned >= TOTAL && B.killed + B.breached >= TOTAL) finish();
      }

      // ---------- 버튼 연결 ----------
      fastBtn.addEventListener('click', function () {
        B.fast = B.fast === 1 ? 2 : 1;
        fastBtn.textContent = '빨리 감기 ×' + B.fast;
        buzz('tap');
      });
      el.querySelector('.bz-seg').addEventListener('click', function (e) {
        var m = e.target.getAttribute && e.target.getAttribute('data-mode');
        if (!m || m === mode) return;
        mode = m; drawModeBar(); buzz('tap');
        api.toast(MODE_INFO[m].toast);
      });
      dirBtns.forEach(function (b) {
        b.addEventListener('click', function () { buzz('tap'); resolveCard(b.getAttribute('data-dir')); });
      });

      drawModeBar(); drawStats(); setWait();
      run.raf = requestAnimationFrame(frame);
    }

    return function (el) { start(el); };
  };
})();
