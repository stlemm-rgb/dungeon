/* D1 전투 화면: 매주 전투 6단계 (계산은 battle_sim.js, 숫자는 battle_data.js, 판은 zones.js·build.js의 boardHtml)
 *
 *  ① 들어오면 멈춘 상태. "전투 시작"은 하단 탭의 가운데(회사) "다음 주" 버튼과 같은 자리(api.bar = 탭 막대 자리에 배속 · 전투 시작 · 안내)
 *  ② 무리가 대기 장소(야외)에 등급 낮은 무리부터 차례로 등장, 아래 안내 줄 "D급 OO 10명 평균 레벨 N · 짐꾼 N명"
 *  ③ 가장 높은 등급 무리가 나오면 비서가 침입자 카드로 효과를 확정 (카드 전용 화면, 눌러야 닫힘)
 *  ④ 10명 = 1분대가 작은 얼굴 도트로 실제 구역 판을 따라 이동. 함정·대기실 몬스터가 작동
 *  ⑤ 이벤트 카드 = 위기 때만 (BSIM 사건 'crisis': 대량 출현·보물방 근접·보스, 전투 한 번에 최대 P.cardRule().maxPerBattle장. 진행도 시점 카드는 없다).
 *     화면 전체를 덮는 카드 전용 화면 (위 3/4 그림 자리, 아래 1/4 제목·설명·효과). 아래 막대의 [카드 N장 남음]은 BSIM.crisisLeft(S).
 *     위·아래·왼쪽·오른쪽으로 끌면 그 가장자리 글이 커지고 색이 바뀜 (가장자리 글을 눌러도 됨). 떠 있는 동안 전투는 완전히 멈추고
 *     시간 초과도 없다 (고를 때까지 기다림). 그림은 나중에 외부 파일이 들어옴: 그림 자리에 data-art="카드의 art 키"
 *  - 화면 배치: 맨 위 한 줄(시간·진행바·처치·금·신석·보물방·퇴각) / 가운데 판(남는 높이를 채움) / 아래 한 줄 안내 + 버튼 줄(api.bar)
 *  - 판 = ZONES.stackMap()(열린 층을 위아래로 쌓음, 층 사이 한 줄 = 계단, 좌표가 분대·대기실 좌표와 같음). 2층이 열리면 줄이 늘어 칸을 줄이고(.tall) 구역 이름은 숨긴다.
 *    아직 잠긴 층은 판 아래에 🔒 한 줄로만 알린다 (전투는 열린 층까지)
 *  ⑥ 끝(모두 처치·보물방 도달·퇴각, 1분 지나면 퇴각) -> 결과표(회사 금·의뢰인 마석 보급·부대 경험치·아군 퇴각/쓰러짐/사망·쉬는 부대 안내·납품 기준 단계) -> 홈으로 (회사 진행 띠에서 [다음 주]·[납품하기])
 *     두 번째 현장 첫 전투 결과표에는 "데모 끝까지 왔어요" 한 줄 (계속 진행 가능)
 *  - D1: 전투 입력은 P.battleInput(plan) 그대로 (부대 인원만큼 싸우는 개체). 대기실 부대는 부대마다 한 줄, 인원 수만큼 점 (친위대는 큰 점).
 *    얼어붙은 하역장(chill 사건)을 지난 분대는 느려지고 얼음 테두리로 보인다. 아군 퇴각(mretreat 사건): 그 부대 점이 커졌다 흐려지고 "퇴각" 글자 (S.dens[z][i].out 이면 흐리게)
 *  - 배속 1·2·3·5는 RUN.prefs에 저장해 다음 전투도 그대로 (P.setBattleSpeed). 배속은 카드 수에 영향 없음 (위기 방식)
 *  - 결과는 전투가 끝나는 순간 api.finishBattle로 한 번만 반영 (새로고침해도 두 번 반영 안 됨)
 *  - 저장 지점 = 전투 시작 + 이벤트 카드를 고른 순간 (P.saveBattle에 전투 계산 상태를 통째로). 새로고침하면 마지막 저장 지점부터
 *    일시정지 상태로 이어지고, 고른 카드는 바꿀 수 없다. 배속은 바꿀 때마다 저장
 *  - 튜토리얼 말풍선(api.tutStart): 첫 전투 화면(battle) · 첫 이벤트 카드(card) · 첫 결과표(result). 안 켜져 있으면 아무 일도 안 일어난다.
 *    카드 전용 화면에서는 말풍선(#tut)이 카드 화면 위(z-index)에 떠 있고, 카드 화면은 말풍선 높이만큼 아래를 비워 가리지 않게 한다
 *  - 곡선·시간·스와이프 기준·진동은 MOTION.* 만. 연출용 무작위는 api.fxRandom만 (게임용 무작위는 battle_sim.js 시드)
 */
(function () {
  'use strict';
  var BD = window.BATTLE_DATA, Z = window.ZONES, SIM = window.BSIM;

  function tf(x, y, r) { return 'translate(' + x + 'px,' + y + 'px) rotate(' + r + 'deg)'; }
  function money(n) { return Number(Math.round(n)).toLocaleString('en-US'); }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  // 판 크기는 부지마다 다르다: 칸 수는 쓸 때마다 지금 판에서 읽는다. 줄 수 ROWS = 열린 층을 쌓은 판의 줄 수 (층 사이 한 줄 포함, 좌표가 ZONES.anchorOf와 같음)
  var ROWS = 7;
  function pctX(x) { return (x / Z.MAP[0].length * 100) + '%'; }
  function pctY(y) { return (y / ROWS * 100) + '%'; }
  // 열린 층까지 쌓은 판의 줄 수
  function stackRows() {
    var fi = Z.floorInfo && Z.floorInfo(Z.OPEN || 1);
    return fi ? fi.rowOff + fi.rows : Z.MAP.length;
  }

  window.SCREEN_PLUGINS = window.SCREEN_PLUGINS || {};
  window.SCREEN_PLUGINS.battle = function (api) {
    var div = api.div, buzz = api.buzz, fxRandom = api.fxRandom;
    function tutStart(id, target) { if (api.tutStart) api.tutStart(id, { target: target }); }
    function tutDone(id) { if (api.tutDone) api.tutDone(id); }

    return function (el) {
      Z = window.ZONES || Z; // 판이 바뀌었을 수 있으니 화면을 만들 때마다 다시 잡는다
      var P = window.PROGRESS, RUN = P.RUN, plan = P.battlePlan();
      if (!plan) { el.appendChild(div('dim', '전투가 없어요')); return; }
      var run = { alive: true, raf: 0 };
      api.onLeave(function () { run.alive = false; cancelAnimationFrame(run.raf); });
      el.className = 'screen bt-screen';

      var simIn = P.battleInput(plan);
      var bs = P.battleSave() || {};
      var S = bs.snap ? SIM.restore(simIn, bs.snap) : null, resumed = !!S;
      if (!S) S = SIM.create(simIn);
      ROWS = stackRows();
      var U = {
        phase: 'ready', paused: false, speedIdx: RUN.prefs.speedIdx, fastUsed: !!bs.fastUsed || RUN.prefs.speedIdx > 0,
        appearIdx: 0, appearT: 0, card: null, queue: [], cardsShown: 0, cardsUsed: 0, cardNo: 0, picks: []
      };
      // 저장 지점에 넣는 화면 진행 (기다리는 위기 카드 · 카드 몇 장째 · 고른 카드 목록)
      var UI_KEYS = ['queue', 'cardsShown', 'cardsUsed', 'cardNo', 'picks'];
      if (resumed && bs.ui) UI_KEYS.forEach(function (k) { if (bs.ui[k] !== undefined) U[k] = bs.ui[k]; });
      if (resumed) { U.phase = 'fight'; U.paused = true; U.appearIdx = plan.groups.length; }
      function checkpoint() {
        var ui = {}; UI_KEYS.forEach(function (k) { ui[k] = U[k]; });
        P.saveBattle({ snap: SIM.snapshot(S), ui: JSON.parse(JSON.stringify(ui)) });
      }
      var top = plan.groups[plan.groups.length - 1];
      var cr = P.cardRule(), cardMax = cr.maxPerBattle;   // 카드는 위기 때만, 전투 한 번에 최대 cardMax장
      function crisisInfo(kind) { return (cr.kinds || []).filter(function (k) { return k.id === kind; })[0] || { id: kind, label: '위기', text: '위기가 닥쳤어요!' }; }
      function lockWhy(n) { var f = P.floorInfo(n); return f && f.lockAt ? '납품 기준 ' + f.lockAt + '단계 달성 시 열림' : '이 의뢰에서는 열리지 않아요'; }

      // 맨 위 한 줄: 시간 · 진행바 · 처치 · 금 · 신석 · 보물방 · 퇴각. 가운데 판은 남는 높이를 채우고, 아래는 한 줄 안내
      function stat(cls, label) { return '<span class="bt-st ' + cls + '"><small>' + label + '</small><b></b></span>'; }
      el.innerHTML =
        '<div class="bt-top' + (plan.surge ? ' surge' : '') + '">' + (plan.surge ? '<span class="bt-surgechip">대량</span>' : '') +
        '<span class="bt-time">1:00</span><div class="bt-prog"><i></i><span class="bt-pct">0%</span></div>' +
        stat('kill', '처치') + stat('gold', '금') + stat('gem', '신석') + stat('reach sub', '보물방') + stat('flee sub', '퇴각') + '</div>' +
        '<div class="zboard bt-board' + (ROWS > 7 ? ' tall' : '') + '">' + window.ZONEVIEW.boardHtml({ zones: RUN.site.zones, units: RUN.site.units, stack: true, rows: ROWS }) + '</div>' +
        ((Z.FLOORS || 1) > (Z.OPEN || 1) ? '<div class="bt-locked">🔒 지하 ' + (Z.OPEN + 1) + '층 · ' + lockWhy(Z.OPEN + 1) + '</div>' : '') +
        '<div class="bt-log"></div>';

      // 아래 막대: 하단 탭 막대 자리에 [배속] [카드 남음] [전투 시작] [짧은 안내]. 전투 시작이 홈의 가운데 "다음 주" 탭과 같은 좌표·크기에 온다
      //  카드 = 위기 때만 (전투 한 번에 최대 maxPerBattle장). 가운데 왼쪽 버튼은 남은 장 수를 보여 주고, 누르면 규칙을 토스트로 알려 준다
      var bar = api.bar();
      bar.innerHTML = '<button class="bt-speed" type="button">배속 ×1</button>' +
        '<button class="bt-cards" type="button">카드 ' + cardMax + '장</button>' +
        '<button class="tab-main bt-start" type="button">전투 시작 ▶</button>' +
        '<span class="bt-note">전투 중 이동 불가</span>';

      var board = el.querySelector('.bt-board'), wrap = board.querySelector('.zwrap');
      board.style.setProperty('--rows', ROWS); // 판 세로 칸 수: 칸이 남는 높이를 나눠 가진다 (shell.css .bt-board)
      var layer = div('bt-layer'); wrap.appendChild(layer);
      var fxLayer = div('bt-layer'); wrap.appendChild(fxLayer);
      var logEl = el.querySelector('.bt-log');
      var timeEl = el.querySelector('.bt-time'), progEl = el.querySelector('.bt-prog i'), pctEl = el.querySelector('.bt-pct');
      var killEl = el.querySelector('.bt-st.kill b'), goldEl = el.querySelector('.bt-st.gold b'), gemEl = el.querySelector('.bt-st.gem b');
      var reachEl = el.querySelector('.bt-st.reach b'), fleeEl = el.querySelector('.bt-st.flee b');
      var speedBtn = bar.querySelector('.bt-speed'), cardsBtn = bar.querySelector('.bt-cards'), startBtn = bar.querySelector('.bt-start');

      // ---------- 카드 전용 화면 (이벤트 카드 · 침입자 카드 공통 바탕) ----------
      // 화면 전체(폭은 휴대폰 폭까지)를 덮는 어두운 화면. 튜토리얼 말풍선(#tut)은 이 화면보다 위에 있고, 그 높이(+하단 막대)만큼 아래를 비워 가리지 않는다
      var tutEl = document.getElementById('tut'), tabsEl = api.bar();
      var ov = null, ovBusy = 0; // ov = 지금 떠 있는 전용 화면, ovBusy = 사라지는 중인 화면 수 (끝나기 전엔 다음 카드를 안 띄움)
      api.onLeave(function () { removeNow(ov); ov = null; });
      function removeNow(o) { if (o && o.parentNode) o.parentNode.removeChild(o); }
      function openOverlay(kind, html) {
        removeNow(ov);
        ov = div('bt-ov ' + kind, html);
        document.body.appendChild(ov);
        ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.dur.fade, easing: MOTION.ease.out });
        fitOverlay();
        return ov;
      }
      function fitOverlay() { // 말풍선이 떠 있으면 그 높이 + 하단 막대 높이만큼 비움
        if (!ov) return;
        var h = tutEl && !tutEl.hidden ? tutEl.offsetHeight + tabsEl.offsetHeight : 0;
        if (ov.getAttribute('data-tut') !== String(h)) { ov.setAttribute('data-tut', h); ov.style.setProperty('--tut-h', h + 'px'); }
      }
      function dismissOverlay(o, ms) { // 부드럽게 사라진 뒤 치움 (애니메이션이 안 흐르는 환경에서도 치워지게 타이머도 둠)
        if (!o) return;
        if (o === ov) ov = null;
        o.style.pointerEvents = 'none'; ovBusy++;
        var gone = false;
        function fin() { if (gone) return; gone = true; removeNow(o); ovBusy--; }
        var a = o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: MOTION.ease.out, fill: 'forwards' });
        a.onfinish = fin; setTimeout(fin, ms + 120);
      }
      // 카드 한 장 모양: 위 3/4 그림 자리(data-art 로 나중에 그림을 끼움) + 아래 1/4 제목 → 설명 2줄 → 효과
      function cardHtml(o) {
        return '<div class="bt-ovcard">' +
          '<div class="bt-art" data-art="' + o.art + '"><span class="bt-artname">' + o.artName + '</span>' + (o.crisis ? '<span class="bt-crisis">' + o.crisis + '</span>' : '') +
          (o.tag ? '<span class="bt-tag">' + o.tag + '</span>' : '') + '</div>' +
          '<div class="bt-ctext"><b class="bt-ctitle">' + o.title + '</b><p class="bt-cdesc">' + o.desc + '</p><div class="bt-cfx">' + o.fx + '</div></div></div>';
      }

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
        killEl.textContent = r.kills + '/' + r.total; goldEl.textContent = '+' + money(r.gold); gemEl.textContent = '+' + Math.floor(r.gems);
        reachEl.textContent = r.reached; fleeEl.textContent = r.retreated;
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
      // 대기실 부대: 부대마다 한 줄, 인원 수만큼 점 (친위대는 큰 점). 줄은 구역 안에서 아래로 쌓인다
      Object.keys(S.dens).forEach(function (z) {
        var a = Z.anchorOf(z), rows = {}, order = [];
        S.dens[z].forEach(function (m) { if (!rows[m.id]) { rows[m.id] = []; order.push(m.id); } rows[m.id].push(m); });
        order.forEach(function (uid, ui) {
          var list = rows[uid];
          list.forEach(function (m, i) {
            var d = div('bt-mon' + (m.guard ? ' guard' : ''), '<i class="bt-hp"><u></u></i>');
            d.style.left = pctX(a.x + (i - (list.length - 1) / 2) * 0.16); d.style.top = pctY(a.y + 0.2 + ui * 0.2);
            d.title = m.name; layer.appendChild(d); monEls[z + ':' + uid + ':' + i] = { el: d, m: m };
          });
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
          d.classList.toggle('chilled', q.chill > 0);
        });
        Object.keys(monEls).forEach(function (k) {
          var o = monEls[k];
          o.el.querySelector('u').style.width = (o.m.hp / o.m.max * 100) + '%';
          o.el.classList.toggle('down', o.m.hp <= 0);
          o.el.classList.toggle('out', !!o.m.out);   // 퇴각한 부대 (흐리게)
        });
        drawScore();
        drawCards();
      }

      // ---------- 일어난 일 연출 ----------
      // 아군 퇴각 (BSIM 사건 mretreat { z, id, big, down, guard }): 그 부대 점들이 커졌다가 흐려지고(out) "퇴각" 글자가 뜬다. 다음 주까지 쉰다 (결과표에서 안내)
      function retreatFx(e) {
        var nm = '';
        Object.keys(monEls).forEach(function (k) {
          var o = monEls[k];
          if (o.m.id !== e.id) return;
          nm = (api.unitName && api.unitName(o.m.id)) || o.m.name;
          o.el.classList.remove('retreating'); void o.el.offsetWidth; o.el.classList.add('retreating');
        });
        var a = Z.anchorOf(e.z);
        floatText(a.x, a.y - 0.1, '퇴각', 'retreat');
        flashZone(e.z, 'bt-hit');
        log((nm || '부대') + (e.guard ? ' (친위대)' : '') + ' 퇴각' + (e.big ? ' — 큰 피해!' : '') + ' 다음 주까지 쉬어요', 'bad');
        buzz('warn');
      }
      function show(evs) {
        evs.forEach(function (e) {
          switch (e.type) {
            case 'trap': flashZone(e.z, 'bt-hit'); floatText(e.x, e.y - 0.2, '-' + e.dmg, 'trap'); break;
            case 'trapMiss': floatText(e.x, e.y - 0.2, '빗나감', 'miss'); break;
            case 'thorn': floatText(e.x, e.y, '덫 -' + BD.THORN_DMG, 'trap'); break;
            case 'kill': if (e.porter) floatText(e.x, e.y + 0.1, '+' + e.gold + '금', 'gold'); break;
            case 'wipe': floatText(e.x, e.y, '분대 전멸', 'big'); buzz('tap'); break;
            case 'mdown': flashZone(e.z, 'bt-hit'); log(Z.NAMES[e.z] + ' 대기실 부대원이 쓰러졌어요', 'bad'); break;
            case 'mretreat': retreatFx(e); break;
            case 'crisis': onCrisis(e); break;
            case 'chill': flashZone(e.z, 'bt-chill'); floatText(e.x, e.y - 0.2, '얼어붙음', 'chill'); log('분대 ' + (e.id + 1) + '가 얼어붙은 하역장에 들어서 느려져요', 'good'); break;
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
        var o = openOverlay('sec', '<div class="bt-ovmid">' + cardHtml({
          art: c.art || BD.SECRETARY_ART, artName: BD.SECRETARY, tag: BD.SECRETARY + ' · 침입 보고', title: c.tag,
          desc: '소장님, 마지막 무리 <b>' + g.grade + '급 ' + g.name + '</b> 등장! 침입자 특성이 확정됐어요.', fx: c.text
        }) + '</div><div class="bt-ovhint">눌러서 침입 시작</div>');
        o.querySelector('.bt-ovcard').animate([{ transform: 'translateY(-60px) scale(.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: MOTION.dur.panel, easing: MOTION.ease.popS });
        o.addEventListener('click', closeSecretary);
        buzz('warn');
      }
      function closeSecretary() {
        if (U.phase !== 'icard') return;
        dismissOverlay(ov, MOTION.dur.fade);
        log('침입자 카드 확정: ' + S.icard.tag + ' (' + S.icard.text + ')', 'icard');
        log('침입 시작! 10명씩 분대로 들어옵니다', 'good');
        U.phase = 'fight';
        startBtn.textContent = '일시정지 ❚❚'; startBtn.disabled = false;
        buzz('tap');
      }

      // ---------- ⑤ 이벤트 카드 (위기 때만) ----------
      // 카드는 진행도 시점이 아니라 BSIM 사건 'crisis'(대량 출현·보물방 근접·보스)가 올 때만 뜬다. 전투 한 번에 최대 cardMax장 (횟수는 S.crisis 안에 저장돼 배속·복원과 상관없이 같다).
      //  사건이 오면 줄(queue)에 넣고, 다른 카드·침입자 카드가 안 떠 있을 때 하나씩 띄운다
      function crisisLeft() { return SIM.crisisLeft ? SIM.crisisLeft(S) : 0; }
      function drawCards() {
        var left = crisisLeft();   // 앞으로 더 나올 수 있는 위기 카드 수 (이미 뜬 것·줄에 선 것은 센 뒤)
        cardsBtn.innerHTML = '카드 ' + left + '/' + cardMax + '<small>남음 · 위기 때만</small>';
        cardsBtn.classList.toggle('off', left <= 0);
      }
      function onCrisis(e) {
        var k = crisisInfo(e.kind);
        U.queue.push({ kind: e.kind, n: e.n, left: e.left });
        floatText(e.x, e.y - 0.3, '위기!', 'alarm');
        board.classList.remove('bt-alarm'); void board.offsetWidth; board.classList.add('bt-alarm');
        log('위기! ' + k.label + ' — ' + k.text, 'bad');
        buzz('warn');
      }
      function checkCards() {
        if (!U.card && !ovBusy && U.queue.length) spawnCard(U.queue.shift());
      }
      // 이벤트 카드 전용 화면: 큰 카드 한 장 + 화면 가장자리 네 곳에 방향별 선택 글. 전투는 멈춘다 (frame 에서 U.card 가 있으면 계산을 건너뜀)
      var HINT = '← ↑ → ↓ 밀어서 고르세요';
      function spawnCard(item) {
        if (typeof item !== 'object' || !item) item = { kind: 'surge', n: 1, left: 0 };   // 옛 저장 지점의 줄(진행도 숫자)
        var data = BD.EVENT_CARDS[plan.order[U.cardNo++ % plan.order.length]], ki = crisisInfo(item.kind);
        var card = { data: data, state: 'idle', dragging: false, dx: 0, dy: 0, at: item.kind, hint: HINT + (item.left > 0 ? ' (이후 카드 ' + item.left + '장 더)' : ' (이번 전투 마지막 카드)') };
        var edges = BD.DIRS.map(function (d) {
          return '<div class="bt-ovedge ' + d + '" data-dir="' + d + '"><em>' + BD.DIR_MARK[d] + '</em><div class="tx"><b>' + BD.DIR_LABEL[d] + '</b><span>' + data[d].text + '</span></div></div>';
        }).join('');
        var o = openOverlay('ev', edges + '<div class="bt-ovmid">' + cardHtml({
          art: data.art, artName: data.artName, crisis: '위기 · ' + ki.label, tag: item.n + '/' + cardMax + '번째', title: data.title, desc: data.desc, fx: card.hint }) + '</div>');
        card.el = o.querySelector('.bt-ovcard'); card.fx = o.querySelector('.bt-cfx'); card.ov = o;
        U.card = card; U.cardsShown++;
        card.el.animate([{ transform: 'translateY(-160px) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: MOTION.dur.panel, easing: MOTION.ease.popS });
        // 가장자리 글을 눌러도 그 방향으로 고른다
        o.querySelectorAll('.bt-ovedge').forEach(function (eg) {
          eg.addEventListener('click', function () { resolveCard(eg.getAttribute('data-dir')); });
        });
        attachDrag(card);
        buzz('tap');
        tutStart('card', '.bt-ovcard');
      }
      function endCard() { U.card = null; setHot(null, null); tutDone('card'); }
      // 끄는 방향(hot)·놓으면 고르는 거리까지 끈 방향(armed)을 전용 화면에 표시 (가장자리 글이 커지고 색이 바뀜, 카드 아래 효과 칸에 그 방향 효과)
      function setHot(hot, armed) {
        var o = U.card ? U.card.ov : ov;
        if (!o) return;
        if (hot) o.setAttribute('data-hot', hot); else o.removeAttribute('data-hot');
        if (armed) o.setAttribute('data-armed', armed); else o.removeAttribute('data-armed');
        if (U.card && U.card.fx) U.card.fx.textContent = hot ? BD.DIR_MARK[hot] + ' ' + BD.DIR_LABEL[hot] + ': ' + U.card.data[hot].text : U.card.hint;
      }
      function resolveCard(dir) {
        var card = U.card;
        if (!card || card.state !== 'idle') return;
        card.state = 'done'; U.cardsUsed++; card.el.classList.add('done');
        var side = card.data[dir];
        card.ov.setAttribute('data-chosen', dir);
        var fly = card.ov;
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
        // 고른 쪽으로 날아가는 연출 (카드가 날아가는 동안 전용 화면도 같이 사라진 뒤 치워지고, 그때부터 다음 카드가 뜰 수 있다)
        card.el.animate([
          { transform: tf(card.dx, card.dy, card.dx * 0.05), opacity: 1 },
          { transform: tf(card.dx - 16 * ux, card.dy - 16 * uy, 0), opacity: 1, offset: 0.2, easing: MOTION.ease.out },
          { transform: tf(ux * 460, uy * 460, ux * 10), opacity: 0.1 }
        ], { duration: MOTION.dur.panel, fill: 'forwards' });
        dismissOverlay(fly, MOTION.dur.panel);
      }
      function attachDrag(card) {
        var c = card.el, sx = 0, sy = 0, pid = null, armed = null;
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
          // (가장자리 글을 눌러 고르는 건 spawnCard 의 클릭 처리)
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
      // 출진 부대 인원: 전투가 끝난 뒤 산 인원 / 처음 인원 (대기실 개체 기준)
      function unitAlive() {
        var by = {}, order = [];
        Object.keys(S.dens).forEach(function (z) {
          S.dens[z].forEach(function (m) {
            if (!by[m.id]) { by[m.id] = { id: m.id, name: api.unitName ? api.unitName(m.id) || m.name : m.name, alive: 0, total: 0, guard: m.guard }; order.push(m.id); }
            by[m.id].total++; if (m.hp > 0) by[m.id].alive++;
          });
        });
        return order.map(function (id) { return by[id]; });
      }
      function nameOf(r) { return (api.unitName && api.unitName(r.id)) || r.name; }
      function coText(c) { return 'Lv ' + c.lv + ' (' + c.exp + '/' + c.need + ')'; }
      function finish() {
        U.phase = 'result';
        if (U.card) { endCard(); }
        removeNow(ov); ov = null;
        startBtn.disabled = true; speedBtn.disabled = true; cardsBtn.disabled = true;
        var alive = unitAlive();
        var rep = api.finishBattle(SIM.result(S));
        if (!rep) { api.go('company', false); return; }
        var ok = rep.defended, pr = rep.progress, cas = rep.casualties || { down: [], retreated: [], died: [] }, q = RUN.quest;
        var rows = [
          ['처치', rep.kills + ' / ' + rep.total + '명 (짐꾼 ' + rep.porterKills + ')'],
          ['얻은 금', '+' + money(rep.gold)], ['얻은 신석', '+' + rep.gems],
          ['보물방 도달', rep.reached + ' / ' + rep.squads + '분대'],
          ['침입자 퇴각', rep.retreated + '분대' + (rep.timeout ? ' (1분 지남)' : '')],
          ['약탈된 금', rep.loot ? '-' + money(rep.loot) : '0'],
          ['회사 금', money(rep.goldBefore) + ' → <b>' + money(rep.goldAfter) + '</b>'],
          ['신석', rep.gemsBefore + ' → <b>' + rep.gemsAfter + '</b>'],
          ['회사 레벨', coText(rep.companyBefore) + ' → <b>' + coText(rep.companyAfter) + '</b>'],
          ['위기 카드', U.cardsUsed + '장 사용 (위기 ' + (rep.crises || 0) + '번 · 최대 ' + cardMax + '장)']
        ];
        // 부대마다 경험치 (+ 퇴각·사망 표시)
        var unitRows = alive.length ? alive.map(function (u) {
          var g = rep.expGains.filter(function (x) { return x.id === u.id; })[0];
          var down = u.total - u.alive; // 전투 중 쓰러진 인원 (사망이 아니면 전투 뒤 회복)
          var out = cas.retreated.some(function (r) { return r.id === u.id; }), died = cas.died.filter(function (d) { return d.id === u.id; })[0];
          return '<div class="stat"><span>' + esc(u.name) + (u.guard ? '' : ' ' + u.total + '명' + (down ? ' (쓰러짐 ' + down + ')' : '')) + (out ? ' <span class="chip warn">퇴각</span>' : '') +
            (died ? ' <span class="chip warn">사망 ' + died.n + '</span>' : '') + '</span><b>' + (g ? '경험치 +' + g.exp + (g.lvAfter > g.lvBefore ? ' · Lv ' + g.lvBefore + '→' + g.lvAfter : '') : '') + '</b></div>';
        }).join('') : '<div class="dim small-text">출진한 부대가 없어요. 현장의 [출진]에서 부대를 층에 세우면 싸워요.</div>';
        // 아군 피해: 퇴각(다음 주 쉼) · 쓰러짐(전투 뒤 회복) · 사망 을 나눠서
        var hurtRows = '';
        cas.retreated.forEach(function (r) {
          hurtRows += '<div class="stat"><span class="lbl-retreat">퇴각</span><b>' + esc(nameOf(r)) + (r.big ? ' · 큰 피해' : '') + ' → 다음 주 쉬어요 💤</b></div>';
        });
        cas.down.forEach(function (d) {
          hurtRows += '<div class="stat"><span class="lbl-down">쓰러짐</span><b>' + esc(nameOf(d)) + ' ' + d.n + '명 → 전투 뒤 회복</b></div>';
        });
        cas.died.forEach(function (d) {
          hurtRows += '<div class="stat"><span class="lbl-died">사망</span><b>' + esc(nameOf(d)) + ' ' + d.n + '명' + (d.wiped ? ' · 전멸 → 기본 ' + d.refill + '명 무료 보충' : '') + '</b></div>';
        });
        if (!hurtRows) hurtRows = '<div class="stat"><span class="lbl-ok">모두 무사</span><b>퇴각·쓰러짐·사망 없음</b></div>';
        var restBox = (rep.restMsgs || []).length ? '<div class="small-text dim">' + rep.restMsgs.map(esc).join('<br>') + '</div>' +
          '<div class="small-text dim">쉬는 부대는 이번 주 전투에 안 나가요. 현장의 [출진]에서 다른 부대를 대신 세울 수 있어요.</div>' : '';
        var stageLines = (rep.stages || []).map(function (n) {
          var stg = q && q.stages[n - 1];
          return '<div class="bt-lv">납품 기준 ' + n + '/' + (pr ? pr.total : 5) + '단계 달성!' + (stg && stg.opens ? ' 🔓 지하 ' + stg.opens + '층이 열렸어요' : '') + '</div>';
        }).join('');
        // 두 번째 현장 이후 첫 전투 = 데모가 목표로 한 끝 장면. 계속 진행도 가능
        var demoLine = RUN.doneQuests.length >= 1 && q && rep.week === q.startWeek
          ? '<div class="bt-hint demo">데모 끝까지 왔어요! 계속하려면 [홈으로]를 누르세요. 납품 기준 3단계에서 2층이 열리고, 의뢰를 끝까지 납품하면 데모가 끝나요.</div>' : '';
        var box = div('bt-result',
          '<div class="card bt-resbox"><h3 class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? '방어 성공!' : '보물방 침입 ' + rep.reached + '분대') + '</h3>' +
          '<div class="dim small-text bt-ressub">' + rep.week + '주째 일반 침입' + (ok ? ' · 보물방 방어 +1회' : '') + '</div>' +
          rows.map(function (r) { return '<div class="stat"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') +
          '<div class="stat bt-grant"><span>의뢰인 마석 보급</span><b>마석 +' + (rep.budgetGain || 0) + ' → ' + money(rep.budgetAfter || 0) + '</b></div>' +
          '<div class="bt-sub">출진 부대 · 경험치</div>' + unitRows +
          '<div class="bt-sub">아군 피해' + (rep.noDeath ? ' <span class="dim">(이 의뢰는 사망 없음)</span>' : '') + '</div><div class="bt-group">' + hurtRows + '</div>' + restBox +
          (rep.levelMsgs.length ? '<div class="small-text bt-lv">' + rep.levelMsgs.join('<br>') + '</div>' : '') +
          (pr ? '<div class="bt-sub">납품 기준</div><div class="small-text">' + pr.line + '</div>' + stageLines +
            (pr.floorLock ? '<div class="small-text dim">🔒 지하 ' + pr.floorLock.floor + '층: 납품 기준 ' + pr.floorLock.atStage + '단계 달성 시 열림</div>' : '') +
            (pr.complete ? '<div class="bt-hint">의뢰 완료! 홈의 진행 띠에서 [납품하기]를 누르세요</div>' : '') : '') +
          demoLine + (rep.hint ? '<div class="bt-hint">' + rep.hint + '</div>' : '') +
          '<button class="btn primary big" type="button" data-home>홈으로</button></div>');
        box.querySelector('[data-home]').addEventListener('click', function () { buzz('tap'); api.backHome(); });
        box.querySelector('.card').animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: MOTION.dur.panel, easing: MOTION.ease.popS });
        el.appendChild(box);
        buzz(ok ? 'stamp' : 'warn');
        tutStart('result', '.bt-result [data-home]');
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
        U.fastUsed = BD.SPEEDS[U.speedIdx] > 1;   // 위기 카드 방식에서는 배속이 카드 수에 영향을 주지 않는다 (저장 칸만 유지)
        P.setBattleSpeed(U.speedIdx, U.fastUsed);
        drawSpeed();
        buzz('tap');
      });
      // 카드 버튼 = 남은 장 수 표시 (누르면 규칙 안내)
      cardsBtn.addEventListener('click', function () {
        api.toast('이벤트 카드는 위기(대량 출현·보물방 근접·보스) 때만 나와요. 전투 한 번에 최대 ' + cardMax + '장, 배속과 상관없어요');
        buzz('tap');
      });
      function drawSpeed() {
        var sp = BD.SPEEDS[U.speedIdx];
        speedBtn.textContent = '배속 ×' + sp; speedBtn.classList.toggle('on', sp > 1);
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
          fitOverlay();   // 침입 보고는 눌러야 닫힌다 (사용자 10-23: 저절로 사라지면 못 읽음)
        } else if (U.phase === 'fight' && !U.paused) {
          // 카드 전용 화면이 떠 있는 동안 전투는 완전히 멈춘다 (시간 초과도 없이 고를 때까지 기다림. 카드가 끝나면 이어서)
          if (U.card) fitOverlay();
          else {
            // 배속에서도 계산이 건너뛰지 않게 작게 나눠 진행
            var dt = real * BD.SPEEDS[U.speedIdx], n = Math.ceil(dt / 0.05);
            for (var i = 0; i < n && !S.done; i++) {
              show(SIM.step(S, dt / n));
              if (U.queue.length) break;   // 위기가 생기면 이번 프레임은 거기서 멈추고 바로 카드를 띄움
            }
          }
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
          if (cd) log('위기 카드 ' + BD.DIR_MARK[pk.dir] + ' ' + cd[pk.dir].text, 'card');
        });
        log('침입자 카드: ' + S.icard.tag + ' (' + S.icard.text + ') · ' + dlvLine, 'icard');
        startBtn.textContent = '계속 ▶';
      } else {
        log(plan.surge ? '<b>모험가 대량 출현!</b> 무리 ' + plan.groups.length + '개가 옵니다' : '이번 주 일반 침입자 무리 ' + plan.groups.length + '개', plan.surge ? 'bad' : '');
        log(dlvLine, 'dim');
        var dep = unitAlive();
        log(dep.length ? '출진: ' + dep.map(function (u) { return u.name + (u.guard ? '' : ' ' + u.total + '명'); }).join(' · ') : '출진한 부대가 없어요 (현장의 [출진]에서 정할 수 있어요)', 'dim');
        log('"전투 시작"을 누르세요. 최고 등급: ' + top.grade + '급 · 이벤트 카드는 위기 때만 최대 ' + cardMax + '장', 'dim');
      }
      if (!resumed) tutStart('battle', '.bt-start'); // 저장 지점에서 이어진 전투에는 안내 없음
      run.raf = requestAnimationFrame(frame);
    };
  };
})();
