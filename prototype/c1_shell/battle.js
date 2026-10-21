/* C1 전투 화면: 매주 전투 6단계 (계산은 battle_sim.js, 숫자는 battle_data.js, 판은 zones.js·build.js의 boardHtml)
 *
 *  ① 들어오면 멈춘 상태. "전투 시작"은 하단 탭의 가운데 "다음 주" 버튼과 같은 자리(api.bar = 탭 막대 자리에 배속 · 전투 시작 · 안내)
 *  ② 무리가 대기 장소(야외)에 등급 낮은 무리부터 차례로 등장, 아래 안내 줄 "D급 OO 10명 평균 레벨 N · 짐꾼 N명"
 *  ③ 가장 높은 등급 무리가 나오면 비서가 침입자 카드로 효과를 확정 (눌러서 닫기, 몇 초 뒤 저절로)
 *  ④ 10명 = 1분대가 작은 얼굴 도트로 실제 구역 판을 따라 이동. 함정·대기실 몬스터가 작동
 *  ⑤ 가장 앞선 분대 진행도 15·30·45·60%에서 이벤트 카드 (위·아래·왼쪽·오른쪽으로 끌기, 칸을 눌러도 됨). 떠 있는 동안 0.3배
 *  ⑥ 끝(모두 처치·보물방 도달·퇴각, 1분 지나면 퇴각) -> 결과표 -> 홈
 *  - 배속 1·2·3·5와 배속 때 카드 수(0~4장)는 RUN.prefs에 저장해 다음 전투도 그대로 (P.setBattleSpeed·P.setCardCount).
 *    1배속이면 카드 4지점 모두. 배속을 한 번이라도 켜면(전투 시작 전 포함) 꺼도 그 전투 카드는 고른 N장까지, 먼저 닿는 지점부터
 *    (이미 나온 카드도 포함). 전투 중에는 이미 나온 카드 수보다 작게 못 줄인다
 *  - 결과는 전투가 끝나는 순간 api.finishBattle로 한 번만 반영 (새로고침해도 두 번 반영 안 됨)
 *  - 저장 지점 = 전투 시작 + 이벤트 카드를 고른 순간 (P.saveBattle에 전투 계산 상태를 통째로). 새로고침하면 마지막 저장 지점부터
 *    일시정지 상태로 이어지고, 고른 카드는 바꿀 수 없다. 배속·카드 수는 바꿀 때마다 저장
 *  - 곡선·시간·스와이프 기준·진동은 MOTION.* 만. 연출용 무작위는 api.fxRandom만 (게임용 무작위는 battle_sim.js 시드)
 */
(function () {
  'use strict';
  var BD = window.BATTLE_DATA, Z = window.ZONES, SIM = window.BSIM;

  function tf(x, y, r) { return 'translate(' + x + 'px,' + y + 'px) rotate(' + r + 'deg)'; }
  function money(n) { return Number(Math.round(n)).toLocaleString('en-US'); }
  function pctX(x) { return (x / 5 * 100) + '%'; }
  function pctY(y) { return (y / Z.MAP.length * 100) + '%'; }

  window.SCREEN_PLUGINS = window.SCREEN_PLUGINS || {};
  window.SCREEN_PLUGINS.battle = function (api) {
    var div = api.div, buzz = api.buzz, fxRandom = api.fxRandom;

    return function (el) {
      var P = window.PROGRESS, RUN = P.RUN, plan = P.battlePlan();
      if (!plan) { el.appendChild(div('dim', '전투가 없어요')); return; }
      var run = { alive: true, raf: 0 };
      api.onLeave(function () { run.alive = false; cancelAnimationFrame(run.raf); });
      el.className = 'screen bt-screen';

      var simIn = { plan: plan, zones: RUN.site.zones, units: RUN.site.units, monById: P.monById };
      var bs = P.battleSave() || {};
      var S = bs.snap ? SIM.restore(simIn, bs.snap) : null, resumed = !!S;
      if (!S) S = SIM.create(simIn);
      var U = {
        phase: 'ready', paused: false, speedIdx: RUN.prefs.speedIdx, fastUsed: !!bs.fastUsed || RUN.prefs.speedIdx > 0,
        appearIdx: 0, appearT: 0, secT: 0, card: null, queue: [], nextAt: 0, granted: 0, cardsShown: 0, cardsUsed: 0, skipped: 0, cardNo: 0, picks: []
      };
      // 저장 지점에 넣는 화면 진행 (카드 몇 장째·고른 카드 목록 등)
      var UI_KEYS = ['granted', 'queue', 'nextAt', 'cardsShown', 'cardsUsed', 'skipped', 'cardNo', 'picks'];
      if (resumed && bs.ui) {
        UI_KEYS.forEach(function (k) { if (bs.ui[k] !== undefined) U[k] = bs.ui[k]; });
        if (bs.ui.granted === undefined) U.granted = U.cardsShown + U.queue.length; // 옛 저장 지점
      }
      if (resumed) { U.phase = 'fight'; U.paused = true; U.appearIdx = plan.groups.length; }
      function checkpoint() {
        var ui = {}; UI_KEYS.forEach(function (k) { ui[k] = U[k]; });
        P.saveBattle({ snap: SIM.snapshot(S), ui: JSON.parse(JSON.stringify(ui)) });
      }
      var top = plan.groups[plan.groups.length - 1];

      el.innerHTML =
        '<div class="head"><h2>' + plan.week + '주째 전투 ' + (plan.surge ? '<span class="chip bt-surge">대량 출현</span>' : '<span class="chip">일반 침입</span>') + '</h2>' +
        '<span class="chip bt-wallet"></span></div>' +
        '<div class="bt-top"><span class="bt-time">1:00</span><div class="bt-prog"><i></i>' +
        BD.CARD_AT.map(function (a) { return '<b style="left:' + a + '%"></b>'; }).join('') + '</div><span class="bt-pct">0%</span></div>' +
        '<div class="zboard bt-board">' + window.ZONEVIEW.boardHtml({ zones: RUN.site.zones, units: RUN.site.units }) + '</div>' +
        '<div class="bt-score dim"></div>' +
        '<div class="bt-low"><div class="bt-log"></div><div class="bt-slot"></div></div>';

      // 아래 막대: 하단 탭 막대 자리에 [배속] [전투 시작] [안내]. 전투 시작이 홈의 가운데 "다음 주" 탭과 같은 좌표·크기에 온다
      var bar = api.bar();
      bar.innerHTML = '<button class="bt-speed" type="button">배속 ×1</button>' +
        '<button class="bt-cards" type="button">카드 전부</button>' +
        '<button class="tab-main bt-start" type="button">전투 시작 ▶</button>' +
        '<span class="bt-note">전투 중에는 다른 화면으로 못 가요</span>';

      var board = el.querySelector('.bt-board'), wrap = board.querySelector('.zwrap');
      var layer = div('bt-layer'); wrap.appendChild(layer);
      var fxLayer = div('bt-layer'); wrap.appendChild(fxLayer);
      var logEl = el.querySelector('.bt-log'), slot = el.querySelector('.bt-slot');
      var timeEl = el.querySelector('.bt-time'), progEl = el.querySelector('.bt-prog i'), pctEl = el.querySelector('.bt-pct');
      var scoreEl = el.querySelector('.bt-score'), walletEl = el.querySelector('.bt-wallet');
      var speedBtn = bar.querySelector('.bt-speed'), cardsBtn = bar.querySelector('.bt-cards'), startBtn = bar.querySelector('.bt-start');
      walletEl.textContent = '금 ' + money(RUN.gold) + ' · 보석 ' + RUN.gems;

      // ---------- 작은 도구 ----------
      function log(text, cls) {
        var l = div('bt-line ' + (cls || ''), text);
        logEl.appendChild(l);
        while (logEl.children.length > 30) logEl.removeChild(logEl.firstChild);
        logEl.scrollTop = logEl.scrollHeight;
        l.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: MOTION.dur.sheet, easing: MOTION.ease.out });
      }
      function floatText(x, y, text, cls) {
        var f = div('bt-float ' + (cls || ''), text);
        f.style.left = pctX(x + (fxRandom() - 0.5) * 0.3); f.style.top = pctY(y);
        f.addEventListener('animationend', function () { if (f.parentNode) f.parentNode.removeChild(f); });
        fxLayer.appendChild(f);
        while (fxLayer.children.length > 24) fxLayer.removeChild(fxLayer.firstChild);
      }
      function flashZone(z, cls) {
        board.querySelectorAll('.zc[data-z="' + z + '"]').forEach(function (c) { c.classList.remove(cls); void c.offsetWidth; c.classList.add(cls); });
      }
      function drawScore() {
        var r = SIM.result(S);
        scoreEl.innerHTML = '처치 <b>' + r.kills + '</b>/' + r.total + ' · 보물방 <b>' + r.reached + '</b>분대 · 퇴각 ' + r.retreated +
          ' · 금 +' + money(r.gold) + ' · 보석 +' + Math.floor(r.gems);
        var left = Math.max(0, BD.TIME_LIMIT - S.t), sec = Math.ceil(left);
        timeEl.textContent = Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2);
        timeEl.classList.toggle('low', U.phase === 'fight' && left < 10);
        var p = SIM.progress(S);
        progEl.style.width = p + '%'; pctEl.textContent = Math.floor(p) + '%';
      }

      // ---------- 분대·몬스터 도트 ----------
      var sqEls = {}, monEls = {};
      S.squads.forEach(function (q) {
        var d = div('bt-sq wait', '<i class="bt-hp"><u></u></i><b>' + BD.SQUAD + '</b>');
        d.setAttribute('data-g', q.grade); d.style.left = pctX(q.x); d.style.top = pctY(q.y);
        d.hidden = true; layer.appendChild(d); sqEls[q.id] = d;
        if (resumed) { // 저장 지점부터: 이미 나온 무리는 보이고, 끝난 분대는 처음부터 치움
          if (q.state === 'dead' || q.state === 'reached' || q.state === 'retreat') d.classList.add('out');
          else d.hidden = false;
        }
      });
      Object.keys(S.dens).forEach(function (z) {
        var a = Z.anchorOf(z);
        S.dens[z].forEach(function (m, i) {
          var d = div('bt-mon', '<i class="bt-hp"><u></u></i>');
          d.style.left = pctX(a.x + (i % 3 - 1) * 0.32); d.style.top = pctY(a.y + 0.25 + Math.floor(i / 3) * 0.32);
          d.title = m.name; layer.appendChild(d); monEls[z + ':' + i] = { el: d, m: m };
        });
      });
      function paint() {
        S.squads.forEach(function (q) {
          var d = sqEls[q.id]; if (!d || d.classList.contains('out')) return;
          if (q.state === 'dead' || q.state === 'reached' || q.state === 'retreat') {
            d.classList.add('out', q.state === 'dead' ? 'gone' : q.state === 'reached' ? 'through' : 'flee');
            d.addEventListener('animationend', function () { if (d.parentNode) d.parentNode.removeChild(d); });
            return;
          }
          var inf = SIM.squadInfo(q);
          d.style.left = pctX(q.x); d.style.top = pctY(q.y);
          d.querySelector('b').textContent = inf.alive;
          d.querySelector('u').style.width = (inf.alive / BD.SQUAD * 100) + '%';
          d.classList.toggle('wait', q.state === 'wait');
          d.classList.toggle('fight', q.state === 'fight');
          d.classList.toggle('frozen', S.freeze > 0);
        });
        Object.keys(monEls).forEach(function (k) {
          var o = monEls[k];
          o.el.querySelector('u').style.width = (o.m.hp / o.m.max * 100) + '%';
          o.el.classList.toggle('down', o.m.hp <= 0);
        });
        drawScore();
      }

      // ---------- 일어난 일 연출 ----------
      function show(evs) {
        evs.forEach(function (e) {
          switch (e.type) {
            case 'trap': flashZone(e.z, 'bt-hit'); floatText(e.x, e.y - 0.2, '-' + e.dmg, 'trap'); break;
            case 'trapMiss': floatText(e.x, e.y - 0.2, '빗나감', 'miss'); break;
            case 'thorn': floatText(e.x, e.y, '덫 -' + BD.THORN_DMG, 'trap'); break;
            case 'kill': if (e.porter) floatText(e.x, e.y + 0.1, '+' + e.gold + '금', 'gold'); break;
            case 'wipe': floatText(e.x, e.y, '분대 전멸', 'big'); buzz('tap'); break;
            case 'mdown': flashZone(e.z, 'bt-hit'); log(Z.NAMES[e.z] + ' 대기실 몬스터가 쓰러졌어요', 'bad'); break;
            case 'reach':
              flashZone('B', 'bt-hit'); floatText(e.x, e.y - 0.3, '약탈 -' + e.loot + '금', 'big');
              log('분대 ' + (e.id + 1) + '가 보물방에 닿았어요! 짐꾼 ' + e.porters + '명이 금 ' + e.loot + ' 약탈', 'bad'); buzz('warn'); break;
            case 'guarded': floatText(e.x, e.y - 0.3, '무적! 퇴각', 'big'); log('보물방 1회 무적: 분대 ' + (e.id + 1) + ' 퇴각', 'good'); break;
            case 'revive': flashZone(e.z, 'bt-boost'); break;
            case 'timeout': log('1분이 지났어요. 남은 ' + e.n + '분대가 퇴각합니다', 'good'); break;
          }
        });
      }

      // ---------- ② 무리 등장 ----------
      function appearNext() {
        var g = plan.groups[U.appearIdx++];
        var st = S.squads.filter(function (q) { return q.gi === U.appearIdx - 1; });
        st.forEach(function (q) {
          var d = sqEls[q.id]; d.hidden = false;
          d.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: MOTION.dur.panel, easing: MOTION.ease.popM });
        });
        log('<span class="bt-g" data-g="' + g.grade + '">' + g.grade + '</span> ' + g.name + ' <b>' + g.count + '명</b> 평균 레벨 ' + g.lv +
          ' · 짐꾼 ' + g.porters * (g.count / BD.SQUAD) + '명', 'appear');
        buzz('tap');
        if (g.top) { U.phase = 'icard'; showSecretary(g); }
      }
      // ---------- ③ 침입자 카드 (비서) ----------
      function showSecretary(g) {
        var c = S.icard;
        var box = div('bt-sec',
          '<div class="portrait">비서<br>도트</div><div class="bt-sectext"><small>' + BD.SECRETARY + '</small>' +
          '소장님, 마지막 무리 <b>' + g.grade + '급 ' + g.name + '</b> 등장! 특성: <b>' + c.tag + '</b>' +
          '<div class="bt-secfx">' + c.text + '</div><span class="bt-ok">효과 확정 · 눌러서 진입</span></div>');
        slot.innerHTML = ''; slot.appendChild(box); slot.classList.add('on');
        box.animate([{ transform: 'translateY(-60px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: MOTION.dur.panel, easing: MOTION.ease.popS });
        U.secT = 0;
        box.addEventListener('click', closeSecretary);
        buzz('warn');
      }
      function closeSecretary() {
        if (U.phase !== 'icard') return;
        slot.innerHTML = ''; slot.classList.remove('on');
        log('침입자 카드 확정: ' + S.icard.tag + ' (' + S.icard.text + ')', 'icard');
        log('침입 시작! 10명씩 분대로 들어옵니다', 'good');
        U.phase = 'fight';
        startBtn.textContent = '일시정지 ❚❚'; startBtn.disabled = false;
        buzz('tap');
      }

      // ---------- ⑤ 이벤트 카드 ----------
      function checkCards() {
        var p = SIM.progress(S);
        while (U.nextAt < BD.CARD_AT.length && p >= BD.CARD_AT[U.nextAt]) {
          var at = BD.CARD_AT[U.nextAt++];
          if (U.fastUsed && U.granted >= RUN.prefs.cards) { U.skipped++; log('진행도 ' + at + '%: 배속 중 카드 ' + RUN.prefs.cards + '장 설정이라 카드 없음', 'dim'); continue; }
          U.granted++;
          U.queue.push(at);
        }
        if (!U.card && U.queue.length) spawnCard(U.queue.shift());
      }
      function spawnCard(at) {
        var data = BD.EVENT_CARDS[plan.order[U.cardNo++ % plan.order.length]];
        var card = { data: data, state: 'idle', age: 0, dragging: false, dx: 0, dy: 0, at: at };
        var c = div('bt-card',
          '<div class="bt-timer"><i></i></div><span class="bt-tag">진행도 ' + at + '%</span>' +
          BD.DIRS.map(function (d) { return '<div class="bt-c ' + d + '" data-dir="' + d + '"><em>' + BD.DIR_MARK[d] + '</em><span>' + data[d].text + '</span></div>'; }).join('') +
          '<b class="bt-title">' + data.title + '</b>');
        card.el = c; card.bar = c.querySelector('.bt-timer i');
        slot.innerHTML = ''; slot.appendChild(c); slot.classList.add('on');
        U.card = card; U.cardsShown++;
        c.animate([{ transform: 'translateY(-200px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: MOTION.dur.panel, easing: MOTION.ease.popS });
        attachDrag(card);
        buzz('tap');
      }
      function endCard() { U.card = null; setHot(null, null); slot.classList.remove('on'); }
      function setHot(hot, armed) {
        if (hot) el.setAttribute('data-hot', hot); else el.removeAttribute('data-hot');
        if (armed) el.setAttribute('data-armed', armed); else el.removeAttribute('data-armed');
      }
      function resolveCard(dir) {
        var card = U.card;
        if (!card || card.state !== 'idle') return;
        card.state = 'done'; U.cardsUsed++; card.el.classList.add('done');
        var side = card.data[dir];
        endCard();
        var cev = SIM.applyCard(S, side);
        U.picks.push({ at: card.at, id: card.data.id, dir: dir });
        checkpoint(); // 고른 순간이 저장 지점: 새로고침해도 이 카드는 그대로
        show(cev);
        log(BD.DIR_MARK[dir] + ' ' + side.text + (side.once ? '' : ' (전투 끝까지)'), 'card');
        if (side.kind === 'quake') board.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-6px,4px)' }, { transform: 'translate(5px,-4px)' }, { transform: 'translate(0,0)' }],
          { duration: MOTION.dur.fx, easing: MOTION.ease.shake });
        buzz('good');
        var ux = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, uy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
        var a = card.el.animate([
          { transform: tf(card.dx, card.dy, card.dx * 0.05), opacity: 1 },
          { transform: tf(card.dx - 16 * ux, card.dy - 16 * uy, 0), opacity: 1, offset: 0.2, easing: MOTION.ease.out },
          { transform: tf(ux * 460, uy * 460, ux * 10), opacity: 0.1 }
        ], { duration: MOTION.dur.panel, fill: 'forwards' });
        slot.appendChild(card.el);
        a.onfinish = function () { if (card.el.parentNode) card.el.parentNode.removeChild(card.el); };
      }
      function expireCard() {
        var card = U.card; card.state = 'expired'; card.el.classList.add('done');
        endCard();
        log('카드를 놓쳤어요', 'dim');
        slot.appendChild(card.el);
        var a = card.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.dur.fade, fill: 'forwards' });
        a.onfinish = function () { if (card.el.parentNode) card.el.parentNode.removeChild(card.el); };
      }
      function attachDrag(card) {
        var c = card.el, sx = 0, sy = 0, pid = null, armed = null, startDir = null;
        function dirs(dx, dy) {
          var T = MOTION.swipe.threshold, ax = Math.abs(dx), ay = Math.abs(dy), hot = null, arm = null;
          var d = ax > ay ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
          if (Math.max(ax, ay) > 10) hot = d;
          if (Math.max(ax, ay) > T) arm = d;
          return { hot: hot, arm: arm };
        }
        c.addEventListener('pointerdown', function (e) {
          if (card.state !== 'idle' || pid !== null) return;
          c.getAnimations().forEach(function (a) { a.finish(); });
          pid = e.pointerId; sx = e.clientX; sy = e.clientY; card.dragging = true; armed = null;
          var sd = e.target.closest ? e.target.closest('[data-dir]') : null;
          startDir = sd ? sd.getAttribute('data-dir') : null;
          try { c.setPointerCapture(pid); } catch (err) { /* 무시 */ }
          c.classList.add('drag');
          e.preventDefault();
        });
        c.addEventListener('pointermove', function (e) {
          if (pid === null || e.pointerId !== pid) return;
          card.dx = e.clientX - sx; card.dy = e.clientY - sy;
          c.style.transform = tf(card.dx, card.dy, card.dx * 0.05);
          var d = dirs(card.dx, card.dy);
          if (d.arm && d.arm !== armed) buzz('tap');
          armed = d.arm;
          setHot(d.hot, d.arm);
        });
        function release(e, cancelled) {
          if (pid === null || e.pointerId !== pid) return;
          pid = null; card.dragging = false;
          c.classList.remove('drag');
          var arm = armed; armed = null;
          var moved = Math.abs(card.dx) + Math.abs(card.dy);
          if (!cancelled && !arm && moved < 8 && startDir) arm = startDir; // 칸을 눌러도 고를 수 있음
          if (!cancelled && arm && card.state === 'idle') { c.style.transform = ''; resolveCard(arm); return; }
          setHot(null, null);
          var from = c.style.transform || tf(0, 0, 0);
          c.style.transform = '';
          c.animate([{ transform: from }, { transform: tf(0, 0, 0) }], { duration: MOTION.dur['return'], easing: MOTION.ease.spring });
          card.dx = 0; card.dy = 0;
        }
        c.addEventListener('pointerup', function (e) { release(e, false); });
        c.addEventListener('pointercancel', function (e) { release(e, true); });
      }

      // ---------- ⑥ 결과표 ----------
      function finish() {
        U.phase = 'result';
        if (U.card) { var cc = U.card; endCard(); if (cc.el.parentNode) cc.el.parentNode.removeChild(cc.el); }
        startBtn.disabled = true; speedBtn.disabled = true; cardsBtn.disabled = true;
        var rep = api.finishBattle(SIM.result(S));
        if (!rep) { api.go('home', false); return; }
        var ok = rep.defended;
        var rows = [
          ['처치', rep.kills + ' / ' + rep.total + '명 (짐꾼 ' + rep.porterKills + ')'],
          ['얻은 금', '+' + money(rep.gold)], ['얻은 보석', '+' + rep.gems], ['몬스터 경험치', '+' + rep.exp],
          ['보물방 도달', rep.reached + ' / ' + rep.squads + '분대'],
          ['퇴각', rep.retreated + '분대' + (rep.timeout ? ' (1분 지남)' : '')],
          ['약탈된 금', rep.loot ? '-' + money(rep.loot) : '0'],
          ['부상 수리', rep.repair ? '-' + money(rep.repair) : '0'],
          ['금', money(rep.goldBefore) + ' → <b>' + money(rep.goldAfter) + '</b>'],
          ['보석', rep.gemsBefore + ' → <b>' + rep.gemsAfter + '</b>'],
          ['이벤트 카드', U.cardsUsed + '장 사용' + (U.fastUsed ? ' (배속)' : '')]
        ];
        var box = div('bt-result',
          '<div class="card bt-resbox"><h3 class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? '방어 성공!' : '보물방 침입 ' + rep.reached + '분대') + '</h3>' +
          '<div class="dim small-text bt-ressub">' + rep.week + '주째 ' + (rep.surge ? '대량 출현' : '일반 침입') + (ok ? ' · 보물방 방어 +1회' : '') + '</div>' +
          rows.map(function (r) { return '<div class="stat"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') +
          (rep.levelMsgs.length ? '<div class="small-text bt-lv">' + rep.levelMsgs.join('<br>') + '</div>' : '') +
          '<div class="bt-hint">' + rep.hint + '</div>' +
          '<button class="btn primary big" type="button" data-home>홈으로</button></div>');
        box.querySelector('[data-home]').addEventListener('click', function () { buzz('tap'); api.backHome(); });
        box.querySelector('.card').animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: MOTION.dur.panel, easing: MOTION.ease.popS });
        el.appendChild(box);
        buzz(ok ? 'stamp' : 'warn');
      }

      // ---------- 버튼 ----------
      startBtn.addEventListener('click', function () {
        if (U.phase === 'ready') {
          U.phase = 'appear'; U.appearT = 0.2;
          P.setBattleSpeed(U.speedIdx, U.fastUsed); // 시작하면 지금 배속 기준이 이 전투에 굳는다
          startBtn.textContent = '무리 등장 중…'; startBtn.disabled = true;
          log('전투 시작! 침입자 무리가 대기 장소에 모입니다', 'good');
          buzz('tap');
        } else if (U.phase === 'fight') {
          U.paused = !U.paused;
          startBtn.textContent = U.paused ? '계속 ▶' : '일시정지 ❚❚';
          buzz('tap');
        }
      });
      speedBtn.addEventListener('click', function () {
        U.speedIdx = (U.speedIdx + 1) % BD.SPEEDS.length;
        var sp = BD.SPEEDS[U.speedIdx], wasFast = U.fastUsed;
        // 전투 시작 전에는 지금 배속이 기준, 시작한 뒤에는 한 번 켜면 꺼도 유지
        U.fastUsed = U.phase === 'ready' ? sp > 1 : (U.fastUsed || sp > 1);
        if (U.fastUsed && !wasFast && U.phase !== 'ready') api.toast('배속을 켰어요: 이번 전투 이벤트 카드는 ' + cardsNow() + '장까지');
        P.setBattleSpeed(U.speedIdx, U.fastUsed);
        drawSpeed();
        buzz('tap');
      });
      // 이번 전투에 나올 카드 수 (배속을 켠 적이 있으면 고른 수, 이미 나온 카드가 더 많으면 그 수)
      function cardsNow() { return Math.max(RUN.prefs.cards, U.granted); }
      cardsBtn.addEventListener('click', function () {
        if (!U.fastUsed) { api.toast('배속(×2 이상)을 켜면 카드 수를 고를 수 있어요 (지금 ' + RUN.prefs.cards + '장)'); buzz('tap'); return; }
        var lo = U.granted, hi = BD.CARD_AT.length, n = cardsNow() + 1;
        if (n > hi) {
          n = lo;
          if (lo > 0) api.toast('이미 카드 ' + lo + '장이 나와서 ' + lo + '장 아래로는 못 줄여요');
        }
        P.setCardCount(n);
        drawSpeed();
        buzz('tap');
      });
      function drawSpeed() {
        var sp = BD.SPEEDS[U.speedIdx];
        speedBtn.textContent = '배속 ×' + sp; speedBtn.classList.toggle('on', sp > 1);
        cardsBtn.textContent = U.fastUsed ? '카드 ' + cardsNow() + '장' : '카드 전부';
        cardsBtn.classList.toggle('off', !U.fastUsed);
        cardsBtn.disabled = U.phase === 'result';
      }

      // ---------- 루프 ----------
      var last = performance.now();
      function frame(now) {
        if (!run.alive) return;
        run.raf = requestAnimationFrame(frame);
        var real = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
        if (U.phase === 'appear') {
          U.appearT -= real;
          if (U.appearT <= 0 && U.appearIdx < plan.groups.length) { appearNext(); U.appearT = BD.APPEAR_GAP; }
        } else if (U.phase === 'icard') {
          U.secT += real;
          if (U.secT >= BD.SECRETARY_LIFE) closeSecretary();
        } else if (U.phase === 'fight' && !U.paused) {
          var card = U.card;
          if (card && card.state === 'idle') {
            if (!card.dragging) card.age += real;
            var left = Math.max(0, 1 - card.age / BD.CARD_LIFE);
            card.bar.style.width = (left * 100) + '%';
            card.bar.classList.toggle('low', left < 0.3);
            if (card.age >= BD.CARD_LIFE) expireCard();
          }
          var spd = BD.SPEEDS[U.speedIdx] * (U.card ? BD.CARD_SLOW : 1);
          // 배속에서도 계산이 건너뛰지 않게 작게 나눠 진행
          var dt = real * spd, n = Math.ceil(dt / 0.05);
          for (var i = 0; i < n && !S.done; i++) show(SIM.step(S, dt / n));
          checkCards();
          paint();
          if (S.done) finish();
        }
      }
      drawSpeed();
      paint();
      var dlvLine = '던전 레벨 ' + (plan.dlv || 0) + ((plan.power || 1) < 1 ? ' · 새 던전이라 침입자 힘 ×' + plan.power : '');
      if (resumed) {
        log('저장 지점부터 이어집니다 (고른 카드 ' + U.picks.length + '장 · ' + Math.floor(S.t) + '초)', 'good');
        U.picks.forEach(function (pk) {
          var cd = BD.EVENT_CARDS.filter(function (c) { return c.id === pk.id; })[0];
          if (cd) log('진행도 ' + pk.at + '% ' + BD.DIR_MARK[pk.dir] + ' ' + cd[pk.dir].text, 'card');
        });
        log('침입자 카드: ' + S.icard.tag + ' (' + S.icard.text + ') · ' + dlvLine, 'icard');
        startBtn.textContent = '계속 ▶';
      } else {
        log(plan.surge ? '<b>모험가 대량 출현!</b> 무리 ' + plan.groups.length + '개가 옵니다' : '이번 주 일반 침입자 무리 ' + plan.groups.length + '개', plan.surge ? 'bad' : '');
        log(dlvLine, 'dim');
        if (U.fastUsed) log('저장된 배속 ×' + BD.SPEEDS[U.speedIdx] + ' · 이번 전투 카드 ' + RUN.prefs.cards + '장 (아래 버튼에서 바꿀 수 있어요)', 'dim');
        log('"전투 시작"을 누르세요. 최고 등급: ' + top.grade + '급', 'dim');
      }
      run.raf = requestAnimationFrame(frame);
    };
  };
})();
