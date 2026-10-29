/* D1 홈 화면 (DS 구조 UI 다시 만들기 2026-10-29, 시안 refs/mockup_ds_ui_2026-10-29 Main·Boss, 지시서 refs/brief_ds_ui.md): 던전에서 자동 전투가 늘 보이는 화면.
 * 계산은 battle_sim.js, 숫자는 battle_data.js, 판 그리기는 build.js의 ZONEVIEW.boardHtml, 상태·규칙은 progress.js (API.md 13~18절).
 *
 *  - 한 화면 = 상단 바(shell.js hud) · 스테이지 막대 · 전투장(판 + 좌우 아이콘 + 다음 목표) · 카드 6칸 · 시설 성장판. 상태는 progress.js를 보고 정한다 (화면이 따로 기억하지 않음):
 *    의뢰 없음(첫 시작·정산·데모 끝) = 판 자리에 안내 / 닫지 않은 보스 결과(P.flowInfo().show)가 있으면 [보스 결과] / 진행 중 전투가 보스면 [보스 도전] / 그 밖엔 일반 침입 (홈에 들어오면 다음 일반 판이 바로 시작: P.startBattle).
 *  - 일반 침입: 판 한 판씩 자동 반복 (판 끝 -> FLOW.rest초 -> 다음 판). 스테이지 막대 = "단계-판" · 점 5개(5판마다 한 바퀴) · 지난 시간 · [보스 도전] (5/5면 [납품]). 판 모서리 = [배속][일시정지].
 *    판 위에 잠깐 뜨는 한 줄 = 방금 끝난 판 결과. 탭·패널이 열려도 전투는 계속 돈다 (shell.js 패널은 홈 위에 얹힌 별도 창, 판은 위쪽 150px 띠로 줄고 싸우는 분대 쪽을 보여 줌).
 *    성장판 칸(함정·대기실·미끼·문)을 누르면 건설 모드(build.js, 그 시설이 골라진 채). [부대 모집]은 아래 출진 창, 지은 시설(판)을 누르면 아래 강화 창 (둘 다 열려 있는 동안 전투를 멈추고,
 *    하나라도 바꾸면 진행 중 일반 판은 버린 채 창을 닫을 때 새 판).
 *  - 보스 도전: 스테이지 막대가 빨간 보스 막대(이름 · 남은 분대)로 바뀜. 카드 기회(S.pick)가 오면 전투가 완전히 멈추고 카드 6칸 중 후보만 밝아진다. 판 아래 겹친 상자 = 고른 카드 설명 + [사용]
 *    ([방 고르기] -> 판에서 방 누르기 -> 줄이 [취소][사용]), 판 아래 줄 = "카드 n/2 · 이유" + [넘기기]. 시설 성장판은 "보스전 중 잠김" 한 줄, 탭 이동은 shell.js가 막는다. 끝나면 잠깐 뒤 보스 결과로 자동 전환.
 *  - 보스 결과: 위쪽에 작은 판 + 아래에서 올라온 창 (결론 · 분대별 펼침 · 카드 기록 · 버튼). 실패 [배치 고치기][다시 도전][일반 침입 재개], 성공 [다음 보스 도전][일반 침입 재개], 5/5 [납품](shell.js가 data-deliver를 받음).
 *    결과는 닫기 전까지 새로고침·패널 열기 뒤에도 복원된다 (P.flowInfo().show). 보상은 applyBattle 때 한 번만.
 *  - 옛 위기 카드(spawnCard) 코드와 층 넘어가기 알림 코드는 옛 규칙용으로 남아 있다. 새 흐름은 위기 사건(crisis)을 무시하고 위 카드 UI만 쓴다.
 *  - 판 = ZONEVIEW.boardHtml: 싸우는 층 하나. 분대는 q.x·q.y 그대로, 좌표 = 칸 단위. 방 이름표는 안 보인다(CSS), 입구·보물방·고정 구역·지은 시설만. 말풍선: 조사 중 ?, 조우 ⚔ -> ✔/💨, 퇴각 "퇴각". ?debug 면 분대 색 경로 선 + 문 통과 수.
 *  - 배속 1·2·3·5는 RUN.prefs에 저장 (P.setBattleSpeed). 진행 중 전투는 FLOW.saveEvery초마다·화면을 떠날 때 저장 -> 새로고침하면 이어서 (멈춤 상태도 그대로).
 *  - 곡선·시간·스와이프 기준·진동은 MOTION.* 만. 연출용 무작위는 api.fxRandom만 (게임용 무작위는 battle_sim.js 시드). 색은 shell.css 맨 위 변수만.
 */
(function () {
  'use strict';
  var BD = window.BATTLE_DATA, Z = window.ZONES, SIM = window.BSIM;

  function tf(x, y, r) { return 'translate(' + x + 'px,' + y + 'px) rotate(' + r + 'deg)'; }
  function money(n) { return Number(Math.round(n)).toLocaleString('en-US'); }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function fmtN(n) { return String(Math.round(Number(n) * 10) / 10); }
  // 지금 보는 층 하나의 판 (화면은 싸우는 층 하나만). 좌표는 칸 단위 (x = 열 + 0.5, y = 층 줄 오프셋 + 행 + 0.5, 분대·대기실 좌표 = ZONES.anchorOf와 같음)
  var V = { floor: 1, cols: 5, rows: 7, off: 0 };
  function setView(n) { var g = Z.grid(n); V.floor = n; V.cols = g.cols; V.rows = g.rows; V.off = g.rowOff; }
  function pctX(x) { return (x / V.cols * 100) + '%'; }
  function pctY(y) { return ((y - V.off) / V.rows * 100) + '%'; }

  window.SCREEN_PLUGINS = window.SCREEN_PLUGINS || {};
  window.SCREEN_PLUGINS.field = function (api) {
    var div = api.div, buzz = api.buzz, fxRandom = api.fxRandom;
    var P = window.PROGRESS, RUN = P.RUN;
    function tutStart(id, target) { if (api.tutStart) api.tutStart(id, { target: target }); }
    function tutDone(id) { if (api.tutDone) api.tutDone(id); }
    var recent = [];   // 최근 일반 판 한 줄 기록 (새로 그린 화면에 다시 보여 줌, 저장 안 함. 새로고침 뒤엔 RUN.lastBattle)
    var CAUSE_ROW = { reached: '보물방 도달', retreat: '퇴각', dead: '전멸' };
    var UP_LOCK_MS = 600;   // [강화] 누른 뒤 다시 눌릴 때까지 (연타·더블탭에 두 번 차감 안 되게)

    // 지을 수 있는 빈 구역 수 (열린 층의 방 중 빈 구역, 고정 구역 제외)
    function emptyZoneCount() {
      var n = 0;
      (Z.ALL || []).forEach(function (z) {
        if (Z.zoneType(z) === 'room' && !RUN.site.fixed[z] && Z.floorOpen(Z.floorOf(z)) && RUN.site.zones[z] === 'empty') n++;
      });
      return n;
    }
    // 지금 확정된 배치로 판 한 층 (전투 점 없음). 보스 결과·창을 연 채 배치가 바뀐 뒤에 쓴다
    function plainBoard(floor) {
      return window.ZONEVIEW.boardHtml({ zones: RUN.site.zones, units: RUN.site.units, doors: Z.doors(), floor: floor || 1 });
    }
    function repLine(rep) {   // 일반 판 결과 한 줄
      return '일반 ' + rep.no + '판 ' + (rep.defended ? '방어 성공' : '보물방 침입 ' + rep.reached + '분대') + ' · 회사 금 +' + money((rep.gold || 0) - (rep.loot || 0)) + (rep.summary ? ' · ' + rep.summary : '');
    }
    function recentInfo() {
      var r = recent.length ? recent[recent.length - 1] : null;
      if (r) return { text: r.text, cls: r.ok ? 'good' : 'bad' };
      var lb = RUN.lastBattle;
      if (lb && lb.mode === 'normal') return { text: repLine(lb), cls: lb.defended ? 'good' : 'bad' };
      return { text: '아직 정산 없음 · 첫 판이 진행 중이에요', cls: '' };
    }

    var ic = api.icon;
    var CARD_SHORT = { smoke: '연막', reserve: '수비대', trigger: '긴급' };
    var CARD_LOOK = { smoke: ['smoke', 'c-grey'], reserve: ['shield', 'c-blue'], trigger: ['spikes', 'c-red'] };

    // ---------- 홈 조각 (시안 ①②): 스테이지 막대 · 좌우 아이콘 · 다음 목표 · 카드 6칸 · 시설 성장판 ----------
    // 일반 판 점 5개 + 보스 표시. n번째 판이면 n-1개 초록, n번째 노랑 (5판마다 한 바퀴. 보스는 언제든 도전할 수 있다)
    function stageBarHtml(no, bi, pr, canBoss) {
      var k = no ? ((no - 1) % 5) : -1, dots = '', i;
      for (i = 0; i < 5; i++) dots += '<i class="' + (i < k ? 'done' : i === k ? 'now' : '') + '"></i>';
      var st = pr && pr.complete ? pr.total : bi && !bi.done ? bi.stage : pr ? pr.total : 0;
      var btn = pr && pr.complete ? '<button class="sb-boss" type="button" data-deliver>납품</button>'
        : '<button class="sb-boss" type="button" data-fboss' + (canBoss && bi && bi.canChallenge ? '' : ' aria-disabled="true"') + '>보스 도전</button>';
      return '<div class="sbar op"><b class="sb-no">' + (no ? st + '-' + (k + 1) : '—') + '</b><span class="sb-dots">' + dots + ic('crown', 'c-danger', 16) + '</span>' +
        '<span class="sb-time bt-time">0:00</span><span class="grow"></span>' + btn + '</div>';
    }
    function bossBarHtml(plan, left, tot) {
      return '<div class="sbar boss"><div class="sb-row">' + ic('crown', '', 15) + '<span class="sb-name">보스 ' + plan.stage + ' · ' + esc(plan.name) + '</span><span class="grow"></span>' +
        '<span class="sb-left">남은 분대 ' + left + '/' + tot + '</span></div><span class="sb-meter"><i style="width:' + (tot ? left / tot * 100 : 0) + '%"></i></span></div>';
    }
    // 판 옆 아이콘: 왼쪽 의뢰·작품집·랭킹 / 오른쪽 임무·출석·설정. 기능 없는 것은 점선 칸 + 자물쇠
    function ibtn(icon, label, attr, locked) {
      return '<button type="button" class="ibtn' + (locked ? ' locked' : '') + '" ' + attr + ' aria-label="' + label + '">' + ic(icon, '', 18) + label + (locked ? ic('lock', 'lk', 10) : '') + '</button>';
    }
    function asideHtml() {
      var gal = api.galleryOpen();
      return '<div class="aside l">' + ibtn('doc', '의뢰', 'data-go="board"') +
        (gal ? ibtn('gallery', '작품집', 'data-go="gallery"') : ibtn('gallery', '작품집', 'data-toast="' + esc('🔒 작품집: ' + api.condText('gallery')) + '"', true)) +
        ibtn('rank', '랭킹', 'data-toast="' + esc(api.soonText('랭킹')) + '"', true) + '</div>' +
        '<div class="aside r">' + ibtn('task', '임무', 'data-toast="' + esc(api.soonText('임무')) + '"', true) +
        ibtn('cal', '출석', 'data-toast="' + esc(api.soonText('출석')) + '"', true) +
        '<button type="button" class="ibtn gear" data-go="settings" aria-label="설정">' + ic('gear', '', 18) + '</button></div>';
    }
    function goalHtml(bi, pr, q) {
      var done = pr && pr.complete;
      return '<div class="goalbox"><small>다음 목표</small><b>' + (done ? '납품하기' : bi && !bi.done ? '보스 ' + bi.stage + ' 막기' : '—') + '</b>' +
        '<span>' + (done ? '회사 금 +' + money(q.reward.gold) : bi && bi.gain ? '마석 +' + bi.gain : '첫 성공 보상 받음') + '</span></div>';
    }
    // 카드 6칸: 1~3 = 보스전 카드 (홈에서는 설명만), 4~6 = 잠김
    function cardRowHtml() {
      var h = '', i;
      Object.keys(CARD_SHORT).forEach(function (id) {
        h += '<button type="button" class="cslot" data-card="' + id + '">' + ic(CARD_LOOK[id][0], CARD_LOOK[id][1], 20) + CARD_SHORT[id] + '</button>';
      });
      for (i = 4; i <= 6; i++) h += '<button type="button" class="cslot lock" data-toast="' + esc(api.soonText('카드 칸 ' + i)) + '" aria-label="카드 칸 ' + i + ' 잠김">' + ic('lock', '', 16) + '</button>';
      return '<div class="cardrow">' + h + '</div>';
    }
    // 시설 성장판: 지은 함정·대기실·미끼 수와 단계, 문 수. 칸을 누르면 그 시설이 골라진 채 건설 모드. 오른쪽 = 부대 모집 (출진 창)
    function growthData() {
      var d = { trap: [0, 1], den: [0, 1], lure: [0, 1], doors: 0, cost: 0 }, z = RUN.site ? RUN.site.zones : {}, n, tr;
      Object.keys(z).forEach(function (id) {
        var f = Z.FAC[z[id]];
        if (!f || !d[f.kind] || id === 'Y') return;
        d[f.kind][0]++;
        if (f.kind !== 'lure') d[f.kind][1] = Math.max(d[f.kind][1], P.upgradeLevel ? P.upgradeLevel(id) : 1);
      });
      if (RUN.site) for (n = 1; n <= RUN.site.floorsOpen; n++) { var di = P.doorInfo(n); if (di) d.doors += di.count; }
      (P.TRIBES || []).forEach(function (t) { var pc = P.procureInfo(t.id); if (pc && (!d.cost || pc.cost < d.cost)) d.cost = pc.cost; });
      return d;
    }
    function growthHtml(on) {
      var d = on ? growthData() : { trap: [0, 1], den: [0, 1], lure: [0, 1], doors: 0, cost: 0 };
      function cell(kind, cls, icon, fill, name, sub, subCls) {
        return '<button type="button" class="gcell ' + cls + '" data-gcell="' + kind + '">' + ic(icon, 'c-' + cls, 18, fill) + name + '<span class="' + subCls + '">' + sub + '</span></button>';
      }
      return '<div class="growth' + (on ? '' : ' off') + '"><div class="gcells">' +
        cell('trap', 'trap', 'spikes2', true, '함정 ×' + d.trap[0], 'Lv' + d.trap[1], 'lv') +
        cell('den', 'den', 'dens', true, '대기실 ×' + d.den[0], 'Lv' + d.den[1], 'lv') +
        cell('lure', 'lure', 'lure', false, '미끼', d.lure[0], 'dim') +
        cell('door', 'door', 'door', false, '문 ' + d.doors, '옮기기', 'dim') + '</div>' +
        '<button type="button" class="gmember" data-fsortie>' + ic('recruit', 'c-green', 26) + '부대 모집<span>마석 ' + d.cost + '</span></button></div>';
    }

    // ---------- 의뢰가 없을 때(첫 시작·정산 중·데모 끝): 같은 홈 틀 + 판 자리에 안내 ----------
    function idleHome(el) {
      el.className = 'screen home idle';
      el.appendChild(api.hud({ tab: 'field', state: 'op' }));
      var ph = RUN.phase, msg = ph === 'settle' ? ['납품 정산이 기다려요', '정산을 마치면 새 의뢰를 고를 수 있어요.', 'result', '정산 보기']
        : ph === 'demoEnd' ? ['데모는 여기까지예요', '의뢰 칸에서 지금까지의 기록을 볼 수 있어요.', 'board', '의뢰 보기']
        : ['의뢰를 골라 시작하세요', '의뢰 한 장을 받으면 이곳에서 침입자가 자동으로 몰려와요.', 'board', '의뢰 보기'];
      el.insertAdjacentHTML('beforeend', stageBarHtml(0, null, null, false) +
        '<div class="arena">' + asideHtml() + '<div class="bbox idle"><div class="idlecard"><b>' + msg[0] + '</b><small>' + msg[1] + '</small>' +
        '<button class="btn primary" type="button" data-go="' + msg[2] + '">' + msg[3] + '</button></div></div><div class="arena-tag">의뢰 없음</div></div>' +
        cardRowHtml() + growthHtml(false));
      el.querySelector('[data-fboss]').setAttribute('data-toast', '의뢰를 받으면 보스에 도전할 수 있어요');
      el.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-gcell],[data-fsortie],[data-card]') : null;
        if (!b) return;
        api.toast(b.hasAttribute('data-card') ? '보스전 카드는 의뢰를 받은 뒤 보스전에서 써요' : '의뢰를 받으면 열려요'); buzz('tap');
      });
    }

    // ---------- 보스 결과 (b = RUN.flow.show): 위쪽에 작은 판 + 아래에서 올라온 창 (결론 · 분대별 펼침 · 카드 기록 · 버튼) ----------
    function resultView(el, b) {
      var pr = P.questProgress(), ok = b.success, complete = !!(pr && pr.complete), rows = b.rows || [];
      el.className = 'screen home res';
      el.appendChild(api.hud({ tab: 'field', state: 'res' }));
      el.insertAdjacentHTML('beforeend', '<div class="sbar boss res"><div class="sb-row">' + ic('crown', '', 15) + '<span class="sb-name">보스 ' + b.stage + ' · ' + esc(b.name) + '</span><span class="grow"></span>' +
        '<span class="sb-left ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '격퇴' : b.reached + '/' + b.squads + ' 도달') + '</span></div>' +
        '<span class="sb-meter"><i style="width:' + (b.squads ? (ok ? 0 : b.reached / b.squads * 100) : 0) + '%"></i></span></div>' +
        '<div class="arena small"><div class="bbox"><div class="bt-board zboard"></div></div><div class="arena-tag">보스 ' + b.stage + ' 결과</div></div>');
      var board = el.querySelector('.bt-board');
      board.innerHTML = plainBoard(1);
      function selRoom(z) {
        board.querySelectorAll('.zc.sel').forEach(function (c) { c.classList.remove('sel'); });
        if (z) board.querySelectorAll('.zc[data-z="' + z + '"]').forEach(function (c) { c.classList.add('sel'); });
      }
      var causes = Object.keys(b.causes || {}).map(function (k) { return k + ' ' + b.causes[k]; }).join(' · ') || '없음';
      var rowsHtml = rows.map(function (r, i) {
        var what = r.state === 'reached' ? '보물방 도달' : (CAUSE_ROW[r.state] || r.state) + ' · ' + r.causeText;
        return '<div class="rrow2" data-row="' + i + '"><button class="rhead2" type="button" data-sq="' + i + '"><b>분대 ' + (r.id + 1) + ' · ' + esc(r.grade) + '급</b>' +
          '<span class="' + (r.state === 'reached' ? 'bad' : 'ok') + '">' + esc(what) + '</span><i class="tgarrow">▾</i></button>' +
          '<div class="rdet" hidden><div>지난 방 ' + r.rooms + '곳 · 끝: <b>' + esc(r.lastName || '—') + '</b></div><div>함정 피해 ' + r.trapDmg + (r.state === 'reached' ? ' · 남은 체력 ' + r.hpLeft + '%' : '') + '</div></div></div>';
      }).join('');
      var panel = div('rbody',
        '<h3 class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? '보스 격퇴! 보스 검증 ' + b.stageAfter + '/' + b.total : '보스 실패: ' + b.reached + '/' + b.squads + '분대가 보물방 도달') + '</h3>' +
        '<div class="dim small-text bt-ressub">보스 ' + b.stage + '단계 · ' + esc(b.name) + ' · ' + b.tries + '번째 도전 · ' + b.time + '초</div>' +
        (b.reward || b.supply ? '<div class="bt-lv">마석 +' + ((b.supply || 0) + (b.reward || 0)) + ' (의뢰인 보급 ' + (b.supply || 0) + ' · 첫 성공 ' + (b.reward || 0) + ')</div>' : '') +
        '<div class="rsum">보물방 도달 ' + b.reached + '/' + b.squads + ' · 함정 피해 ' + b.trapDmg + ' · 퇴각 원인 ' + esc(causes) + '</div>' +
        ((b.cards || []).length ? '<div class="rcards"><div class="bt-sub">보스 카드 기록</div>' + b.cards.map(function (c) {
          return '<div class="rcard' + (c.card === 'skip' ? ' skip' : '') + '"><b>' + c.n + '번째</b><span>' + esc(c.text) + '</span></div>';
        }).join('') + '</div>' : '') +
        (ok ? '' : '<div class="small-text dim">잃는 것은 없어요. 문·시설을 바꾸고 다시 도전해 보세요 (같은 배치 = 같은 결과)</div>') +
        '<div class="bt-sub">분대별 기록 (눌러서 펼치기 · 판에 끝 방 표시)</div>' + rowsHtml);
      var btns = ok
        ? (complete ? '<button class="fbtn main bigbtn" type="button" data-deliver>납품<small>보스 검증 ' + pr.total + '/' + pr.total + ' 완료 · 정산은 의뢰 창에서</small></button>'
            : '<button class="fbtn main bigbtn" type="button" data-fretry>다음 보스 도전 ▶<small>' + esc(pr && pr.boss ? pr.boss.name : '') + '</small></button>') +
          '<button class="fbtn slim" type="button" data-fresume>일반 침입 재개</button>'
        : '<div class="factions"><button class="fbtn main" type="button" data-ffix>배치 고치기</button><button class="fbtn" type="button" data-fretry>다시 도전</button></div>' +
          '<button class="fbtn slim" type="button" data-fresume>일반 침입 재개</button>';
      var sheet = div('rsheet'), dock = div('rfoot', btns);
      sheet.appendChild(panel); sheet.appendChild(dock);
      el.appendChild(sheet);
      panel.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-sq]') : null;
        if (!t) return;
        var i = +t.getAttribute('data-sq'), row = t.parentNode, det = row.querySelector('.rdet'), open = det.hidden;
        panel.querySelectorAll('.rrow2').forEach(function (r) { r.classList.remove('open'); r.querySelector('.rdet').hidden = true; });
        if (open) { det.hidden = false; row.classList.add('open'); selRoom(rows[i] && rows[i].last); } else selRoom(null);
        buzz('tap');
      });
      dock.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-ffix],[data-fretry],[data-fresume]') : null;
        if (!t) return;
        buzz('tap');
        if (t.hasAttribute('data-ffix')) { api.go('build', true); return; }   // 결과 창은 남겨 둠: 건설을 마치면 이 결과로 돌아옴
        if (t.hasAttribute('data-fretry')) { var r = P.challengeBoss(); if (!r.ok) { api.toast(r.msg); buzz('warn'); return; } api.rerender(); return; }
        P.closeBossResult(); P.startBattle(); api.rerender();   // 일반 침입 재개
      });
      if (rows.length && rows[0].last) selRoom(rows[0].last);
      var first = panel.querySelector('.rrow2');
      if (first) { first.classList.add('open'); first.querySelector('.rdet').hidden = false; }
      buzz(ok ? 'stamp' : 'warn');
      tutStart('result', '.rsheet .main');
    }

    return function (el) {
      Z = window.ZONES || Z; // 판이 바뀌었을 수 있으니 화면을 만들 때마다 다시 잡는다
      var FL = P.flowInfo();
      el.className = 'screen home fld';
      if (!FL.on) { el.appendChild(div('card dim', '흐름 시험이 꺼져 있어요 (BATTLE_DATA.FLOW.on). 이 화면은 흐름 시험이 켜진 경우만 지원해요.')); return; }
      if (RUN.phase !== 'play' || !RUN.quest) { idleHome(el); return; }
      var plan = P.battlePlan();
      if (!plan && FL.show) { resultView(el, FL.show); return; }
      if (!plan) { P.startBattle(); plan = P.battlePlan(); }   // 홈: 들어오면 다음 일반 판
      if (!plan) { idleHome(el); return; }
      var boss = plan.mode === 'boss', restTimer = 0, endTimer = 0, saveT = 0, noteT = 0;
      api.onLeave(function () { clearTimeout(restTimer); clearTimeout(endTimer); clearTimeout(upTimer); clearTimeout(noteT); flowSave(); });
      var run = { alive: true, raf: 0 };
      api.onLeave(function () { run.alive = false; cancelAnimationFrame(run.raf); });

      var simIn = P.battleInput(plan, boss ? { cards: true } : undefined);   // 보스 판만 카드 켬 (create·restore 둘 다)
      var bs = P.battleSave() || {};
      var S = bs.snap ? SIM.restore(simIn, bs.snap) : null, resumed = !!S;
      if (!S) S = SIM.create(simIn);
      setView(S.floor || 1);
      var U = {
        phase: 'fight', paused: false, speedIdx: RUN.prefs.speedIdx, fastUsed: !!bs.fastUsed || RUN.prefs.speedIdx > 0,
        card: null, queue: [], cardsShown: 0, cardsUsed: 0, cardNo: 0, picks: [],
        floorNotice: null, notice: false,   // 층 넘어가기 알림 (floorEnd 사건 -> 알림 -> [N층으로])
        hold: false, dead: false            // hold = 아래 창이 열려 전투를 멈춤 · dead = 창에서 배치를 바꿔 이 판은 버려짐 (창을 닫으면 새 판)
      };
      // 저장 지점에 넣는 화면 진행 (기다리는 위기 카드 · 카드 몇 장째 · 고른 카드 목록 · 일시정지)
      var UI_KEYS = ['queue', 'cardsShown', 'cardsUsed', 'cardNo', 'picks', 'paused'];
      if (resumed && bs.ui) UI_KEYS.forEach(function (k) { if (bs.ui[k] !== undefined) U[k] = bs.ui[k]; });
      if (S.pending) U.floorNotice = { type: 'floorEnd', n: S.floor, next: S.pending };
      function checkpoint() {
        var ui = {}; UI_KEYS.forEach(function (k) { ui[k] = U[k]; });
        P.saveBattle({ snap: SIM.snapshot(S), ui: JSON.parse(JSON.stringify(ui)) });
      }
      // 진행 중 전투 저장 (이 화면의 전투가 아직 진행 중일 때만. 보스 도전·배치 변경으로 바뀌었으면 안 함)
      function flowSave() { if (!U.dead && !S.done && P.battlePlan() === plan) checkpoint(); }
      var cr = P.cardRule(), cardMax = cr.maxPerBattle;   // 옛 위기 카드 규칙 (새 흐름은 보스 카드 창만 씀)
      function crisisInfo(kind) { return (cr.kinds || []).filter(function (k) { return k.id === kind; })[0] || { id: kind, label: '위기', text: '위기가 닥쳤어요!' }; }
      function lockWhy(n) { var f = P.floorInfo(n); return f && f.lockAt ? '보스 검증 ' + f.lockAt + '단계 달성 시 열림' : '이 의뢰에서는 열리지 않아요'; }

      // ---------- 화면 틀 (시안 ①②): 상단 바 / 스테이지 막대(보스면 빨간 보스 막대) / 전투장 / (보스) 카드 줄 / 카드 6칸 / 시설 성장판(보스면 잠김 한 줄) ----------
      var hudEl = api.hud({ tab: 'field', state: boss ? 'boss' : 'op' });
      el.appendChild(hudEl);
      var bi0 = P.bossInfo(), pr0 = P.questProgress(), q0 = RUN.quest;
      el.insertAdjacentHTML('beforeend',
        (boss ? bossBarHtml(plan, S.squads.length, S.squads.length) : stageBarHtml(plan.no || 1, bi0, pr0, true)) +
        '<div class="arena">' + (boss ? '' : asideHtml()) +
        '<div class="bbox"><div class="bt-board zboard"></div>' +
        '<div class="spdbtns"><button class="bt-speed" type="button" aria-label="배속">×1</button><button type="button" data-fpause aria-label="일시정지"></button></div><div class="arena-note"></div></div>' +
        (boss ? '<div class="cardbox" hidden></div>' : goalHtml(bi0, pr0, q0)) +
        '<div class="arena-tag">' + (boss ? '보스 ' + plan.stage + ' · 보스전 진행 중' : (bi0 && !bi0.done ? bi0.stage : pr0 ? pr0.total : 1) + '-' + ((((plan.no || 1) - 1) % 5) + 1) + ' · 일반 침입 진행 중') + '</div></div>' +
        (boss ? '<div class="cardline"><span class="cl-text fld-cardnote"></span></div>' : '') +
        cardRowHtml() +
        (boss ? '<div class="bosslock">' + ic('lock', '', 14) + '보스전 중에는 시설·부대를 바꿀 수 없어요</div>' : growthHtml(true)) +
        '<div class="bt-log" hidden></div>');

      var board = el.querySelector('.bt-board'), boxEl = el.querySelector('.bbox'), wrap = null;
      var layer = div('bt-layer'), fxLayer = div('bt-layer');
      var logEl = el.querySelector('.bt-log'), noteEl = el.querySelector('.arena-note');
      var timeEl = el.querySelector('.bt-time'), leftEl = el.querySelector('.sb-left'), meterEl = el.querySelector('.sb-meter i');
      var speedBtn = el.querySelector('.bt-speed'), pauseBtn = el.querySelector('[data-fpause]'), bossBtn = el.querySelector('[data-fboss]');
      var cardlineEl = el.querySelector('.cardline'), cardboxEl = el.querySelector('.cardbox'), cslots = Array.prototype.slice.call(el.querySelectorAll('.cslot[data-card]'));
      var sheetEl = div('upsheet fsheet');
      sheetEl.hidden = true;
      el.appendChild(sheetEl);
      // 아래 이어지는 코드는 같은 이름을 쓴다 (pauseBtn 등)
      function note(text) {   // 판 위에 잠깐 뜨는 한 줄 (일반 판 결과)
        if (!noteEl) return;
        noteEl.textContent = text; noteEl.classList.add('on');
        clearTimeout(noteT); noteT = setTimeout(function () { noteEl.classList.remove('on'); }, 4000);
      }
      // 패널이 열려 판이 위쪽 150px 띠로 줄었을 때: 지금 싸우는 분대 쪽이 보이게 판을 옮겨 놓는다
      var cropAt = null;
      function crop() {
        if (!document.body.classList.contains('paneled') || !boxEl || !wrap || run.alive === false) return;
        var H = boxEl.offsetHeight, ys = [], fy;
        S.squads.forEach(function (q) { if ((q.state === 'move' || q.state === 'fight') && (q.floor || 1) === V.floor) ys.push(q.y); });
        fy = ys.length ? ys.reduce(function (a, b) { return a + b; }, 0) / ys.length : V.off + V.rows / 2;
        var px = wrap.offsetTop + (fy - V.off) / V.rows * wrap.offsetHeight, top = Math.max(0, Math.min(H - 150, px - 75));
        if (cropAt === null || Math.abs(cropAt - top) > 3) { cropAt = top; boxEl.style.setProperty('--crop', (-top) + 'px'); }
      }
      function onPanelChange() { cropAt = null; crop(); }
      document.addEventListener('panelchange', onPanelChange);
      api.onLeave(function () { document.removeEventListener('panelchange', onPanelChange); });
      // ---------- 카드 전용 화면 (이벤트 카드 · 침입자 카드 공통 바탕) ----------
      // 화면 전체(폭은 휴대폰 폭까지)를 덮는 어두운 화면. 튜토리얼 말풍선(#tut)은 이 화면보다 위에 있고, 그 높이(+하단 막대)만큼 아래를 비워 가리지 않는다
      var tutEl = document.getElementById('tut'), tabsEl = document.getElementById('tabs');
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
        var h = tutEl && !tutEl.hidden && !tutEl.classList.contains('top') ? tutEl.offsetHeight + tabsEl.offsetHeight + 8 : 0;   // 말풍선은 겹쳐 뜨고(8px 띄움), 이 카드 화면만 그 자리를 비운다
        h = Math.max(h, +ov.getAttribute('data-tut') || 0);   // 한 번 비운 자리는 이 카드가 떠 있는 동안 유지: 말풍선이 닫혀도 카드가 안 움직임
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
        if (timeEl) {
          var sec = Math.floor(SIM.elapsed(S));   // 지난 시간 (판 전체, 시간 제한 없음 = 결정 C)
          timeEl.textContent = Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2);
        }
        if (leftEl) {   // 보스 막대: 남은 분대 (끝난 분대 = 보물방 도달·퇴각·전멸)
          var tot = S.squads.length, rem = 0;
          S.squads.forEach(function (q) { if (q.state !== 'dead' && q.state !== 'reached' && q.state !== 'retreat') rem++; });
          leftEl.textContent = '남은 분대 ' + rem + '/' + tot;
          if (meterEl) meterEl.style.width = (tot ? rem / tot * 100 : 0) + '%';
        }
      }

      // ---------- 분대·몬스터 도트 ----------
      // 분대 점 위의 말풍선(.bt-bub): 조사 중 = 작은 ?, 조우 = ⚔ 1초 -> 몬스터 승이면 ✔ 아니면 💨 1초 (기호만, 글 없음). 상태(q.inspect·q.clash)를 그대로 읽어 배속·일시정지·불러오기와 늘 맞는다
      var sqEls = {}, monEls = {}, CL = BD.CLASH || { encounter: 1 };
      S.squads.forEach(function (q) {
        var d = div('bt-sq wait', '<i class="bt-hp"><u></u></i><b>' + BD.SQUAD + '</b><span class="bt-bub" hidden></span><span class="bt-smk" hidden></span>');
        d.setAttribute('data-g', q.grade); d.style.left = pctX(q.x); d.style.top = pctY(q.y);
        d.hidden = true; layer.appendChild(d); sqEls[q.id] = d;
        if (resumed) { // 저장 지점부터: 이미 나온 무리는 보이고, 끝난 분대는 처음부터 치움
          if (q.state === 'dead' || q.state === 'reached' || q.state === 'retreat') d.classList.add('out');
          else d.hidden = false;
        }
      });
      // ?debug: 분대 색 경로 선 + 문 통과 수 (건설 화면과 같은 함수·같은 시드라 실제 전투 경로와 같음)
      var dbg = window.ZONEVIEW.debugData ? window.ZONEVIEW.debugData() : null;
      // 싸우는 층 하나의 판 + 그 층 대기실 부대 점. 부대마다 한 줄, 인원 수만큼 점 (친위대는 큰 점). 줄은 방 안에서 아래로 쌓인다
      function drawFloor(n) {
        setView(n);
        board.innerHTML = window.ZONEVIEW.boardHtml({ zones: RUN.site.zones, units: RUN.site.units, doors: simIn.doors, floor: n, counts: dbg && dbg.counts, routes: dbg && dbg.routes });
        wrap = board.querySelector('.zwrap');
        wrap.appendChild(layer); wrap.appendChild(fxLayer);
        Object.keys(monEls).forEach(function (k) { var o = monEls[k]; if (o.el.parentNode) o.el.parentNode.removeChild(o.el); });
        monEls = {};
        Object.keys(S.dens).forEach(function (z) {
          if (Z.floorOf(z) !== n) return;
          var a = Z.anchorOf(z), rows = {}, order = [];
          S.dens[z].forEach(function (m) { if (!rows[m.id]) { rows[m.id] = []; order.push(m.id); } rows[m.id].push(m); });
          if (S.dens[z].some(function (m) { return m.tmp; })) {   // 임시 수비대(카드)가 선 방: "임시" 표시
            var tg = div('bt-tmptag', '임시'); tg.style.left = pctX(a.x); tg.style.top = pctY(a.y - 0.22); layer.appendChild(tg);
            monEls[z + ':tag'] = { el: tg, m: null };
          }
          order.forEach(function (uid, ui) {
            var list = rows[uid];
            list.forEach(function (m, i) {
              var d = div('bt-mon' + (m.guard ? ' guard' : '') + (m.tmp ? ' tmp' : ''), '<i class="bt-hp"><u></u></i>');
              d.style.left = pctX(a.x + (i - (list.length - 1) / 2) * 0.16); d.style.top = pctY(a.y + 0.2 + ui * 0.2);
              d.title = m.name; layer.appendChild(d); monEls[z + ':' + uid + ':' + i] = { el: d, m: m };
            });
          });
        });
      }
      drawFloor(V.floor);
      function bubbleOf(q) {
        if (q.state === 'fight' && q.clash) return { cls: 'clash', txt: q.clash.t < CL.encounter - 1e-9 ? '⚔' : q.clash.win ? '✔' : '💨' };
        if (q.state === 'move' && q.inspect > 1e-9) return { cls: 'ask', txt: '?' };
        return { cls: '', txt: '' };
      }
      function paint() {
        S.squads.forEach(function (q) {
          var d = sqEls[q.id]; if (!d || d.classList.contains('out')) return;
          if (q.state === 'dead' || q.state === 'reached' || q.state === 'retreat') {
            d.classList.add('out', q.state === 'dead' ? 'gone' : q.state === 'reached' ? 'through' : 'flee');
            d.addEventListener('animationend', function () { if (d.parentNode) d.parentNode.removeChild(d); });
            return;
          }
          var inf = SIM.squadInfo(q), bub = d.querySelector('.bt-bub'), bb = bubbleOf(q);
          // 위층으로 막 내려온 분대는 층 위쪽 야외 띠 높이에서 들어온다 (계단 쪽 좌표가 판 밖이라)
          d.style.left = pctX(q.x); d.style.top = pctY(V.floor > 1 ? Math.max(q.y, V.off - 0.3) : q.y);
          d.classList.toggle('offfloor', (q.floor || 1) !== V.floor && q.state !== 'wait');
          d.querySelector('b').textContent = inf.alive;
          d.querySelector('u').style.width = (inf.alive / BD.SQUAD * 100) + '%';
          d.classList.toggle('wait', q.state === 'wait' || q.state === 'stairs');
          d.classList.toggle('fight', q.state === 'fight');
          d.classList.toggle('frozen', S.freeze > 0);
          d.classList.toggle('chilled', q.chill > 0);
          var sm = d.querySelector('.bt-smk'), smOn = q.smoke > 1e-9, smTxt = smOn ? '☁ ' + Math.ceil(q.smoke - 1e-9) + '초' : '';   // 연막: 분대 위에 구름 + 남은 초 (글자라 움직임 줄이기에서도 같음)
          d.classList.toggle('smoked', smOn);
          if (sm.textContent !== smTxt) sm.textContent = smTxt;
          sm.hidden = !smOn;
          if (bub.textContent !== bb.txt) bub.textContent = bb.txt;
          bub.className = 'bt-bub ' + bb.cls; bub.hidden = !bb.txt;
        });
        Object.keys(monEls).forEach(function (k) {
          var o = monEls[k];
          if (!o.m) return;   // 임시 표시 글
          o.el.querySelector('u').style.width = (o.m.hp / o.m.max * 100) + '%';
          o.el.classList.toggle('down', o.m.hp <= 0);
          o.el.classList.toggle('out', !!o.m.out);   // 퇴각한 부대 (흐리게)
        });
        drawScore();
        crop();
      }

      // ---------- 일어난 일 연출 ----------
      // 아군 퇴각 (BSIM 사건 mretreat { z, id, big, down, guard }): 그 부대 점들이 커졌다가 흐려지고(out) "퇴각" 글자가 뜬다. 다음 주까지 쉰다 (결과표에서 안내)
      function retreatFx(e) {
        var nm = '';
        Object.keys(monEls).forEach(function (k) {
          var o = monEls[k];
          if (!o.m || o.m.id !== e.id) return;
          nm = (api.unitName && api.unitName(o.m.id)) || o.m.name;
          o.el.classList.remove('retreating'); void o.el.offsetWidth; o.el.classList.add('retreating');
        });
        var a = Z.anchorOf(e.z);
        floatText(a.x, a.y - 0.1, '퇴각', 'retreat');
        flashZone(e.z, 'bt-hit');
        log((nm || '부대') + (e.guard ? ' (친위대)' : '') + ' 퇴각' + (e.big ? ' — 큰 피해!' : '') + ' (다음 판엔 회복)', 'bad');
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
            case 'crisis': break;   // 새 흐름은 옛 위기 사건을 무시 (보스 카드는 S.pick 창)
            case 'cardPick': log('카드 기회 ' + e.n + '/' + cdMax() + ' — 전투가 멈췄어요', 'card'); break;
            case 'card': cardFx(e); break;
            case 'smokeEnd': log('분대 ' + (e.id + 1) + ' 연막이 풀렸어요', ''); break;
            case 'chill': flashZone(e.z, 'bt-chill'); floatText(e.x, e.y - 0.2, '얼어붙음', 'chill'); log('분대 ' + (e.id + 1) + '가 얼어붙은 하역장에 들어서 느려져요', 'good'); break;
            case 'reach':
              flashZone(S.goal, 'bt-hit'); floatText(e.x, e.y - 0.3, '약탈 -' + e.loot + '금', 'big');
              log('분대 ' + (e.id + 1) + '가 보물방에 닿았어요! 짐꾼 ' + e.porters + '명이 금 ' + e.loot + ' 약탈', 'bad'); buzz('warn'); break;
            case 'guarded': floatText(e.x, e.y - 0.3, '무적! 퇴각', 'big'); log('보물방 1회 무적: 분대 ' + (e.id + 1) + ' 퇴각', 'good'); break;
            case 'revive': flashZone(e.z, 'bt-boost'); break;
            // 말풍선(? ⚔ ✔ 💨)은 paint 가 분대 상태에서 읽는다. 여기서는 한 줄 안내만
            case 'clash': log('분대 ' + (e.id + 1) + ' · ' + (Z.NAMES[e.z] || e.z) + ' 대기실 조우', ''); break;
            case 'iretreat':
              floatText(e.x, e.y - 0.25, '퇴각', 'flee');
              log('분대 ' + (e.id + 1) + ' 퇴각 (' + (CAUSE_TEXT[e.cause] || '') + ')', 'good');
              break;
            case 'stairs': floatText(e.x, e.y - 0.25, '▼ 계단', 'chill'); log('분대 ' + (e.id + 1) + '가 계단에 닿았어요', ''); break;
            case 'floorEnd': U.floorNotice = e; checkpoint(); break;   // 이 층 전투 끝: 알림은 프레임 루프가 띄움 (눌러야 다음 층)
            case 'floorStart': drawFloor(e.n); log(e.n + '층 전투 시작!', 'good'); break;
          }
        });
      }
      var CAUSE_TEXT = { trap: '함정에 당해', den: '대기실에 막혀', clash: '조우 피해로', card: '카드 효과로' };

      // ---------- 층 넘어가기 알림 (12절 9-4): 1층이 완전히 끝나면 알림 -> 누르면 2층 전투 ----------
      function showFloorNotice(e) {
        U.notice = true;
        var wait = S.squads.filter(function (q) { return q.state === 'stairs'; }).length;
        var o = openOverlay('sec', '<div class="bt-ovmid">' + cardHtml({
          art: 'floor', artName: '계단', tag: e.n + '층 전투 끝', title: e.n + '층 전투 끝 · ' + e.next + '층으로',
          desc: '침입자 ' + wait + '분대가 계단을 내려가요.',
          fx: '<button class="btn primary big" type="button" data-nextfloor>' + e.next + '층으로 ▶</button>'
        }) + '</div>');
        o.querySelector('[data-nextfloor]').addEventListener('click', function () {
          if (!U.notice) return;
          U.notice = false; U.floorNotice = null;
          dismissOverlay(o, MOTION.dur.fade);
          show(SIM.nextFloor(S));
          paint();   // 일시정지 중이어도 새 층 좌표로 분대 점을 다시 놓는다
          checkpoint();
          buzz('good');
        });
        buzz('warn');
      }
      function checkFloorNotice() { if (U.floorNotice && !U.notice && !ovBusy && !U.card) showFloorNotice(U.floorNotice); }

      // ---------- 이벤트 카드 (후속 보스전용, 지금은 안 뜸): 위기 사건이 오면 줄에 넣고 카드 전용 화면을 띄우는 코드. 후속 보스 카드(최대 2회)를 만들 때 이어 쓴다 ----------
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


      // ---------- 보스 카드 (API.md 18절, 시안 ②): S.pick이 있으면 전투가 멈추고, 카드 6칸 중 후보만 밝아진다 ----------
      // 판 아래 겹친 작은 상자 = 고른 카드 설명 + [사용](방을 고르는 카드는 [방 고르기]), 판 아래 줄 = "카드 n/2 · 이유" + [넘기기].
      // 방을 고르는 카드는 [방 고르기] -> 판에서 초록 점선 방 누르기 -> 줄이 [취소][사용]으로 바뀜. 상태는 전부 S.pick(후보·sel), 여기는 고른 방(cd.room)·미리 고른 카드(cd.pre)만 기억
      var cd = { open: false, room: '', pre: '' }, cardsOn = !!(S.cards && S.cards.on);
      function cdMax() { var p = SIM.pickInfo(S); return p ? p.max : 2; }
      function cdWhy(inf) {   // 이 창이 뜬 이유 (위기 종류는 규칙 표의 라벨)
        if (inf.slot === 'enter') return '첫 침입자 진입! 전투 멈춤';
        var ks = (inf.kinds || []).map(function (k) { return crisisInfo(k).label; });
        return '위기! ' + (ks.length ? ks.join(' · ') : '보물방에 다가와요') + ' · 전투 멈춤';
      }
      function cdTarget(c) {   // 대상 한 줄
        if (c.id === 'smoke') return '자동 · 움직이는 ' + (c.ids || []).length + '분대 · ' + c.sec + '초';
        if (c.id === 'reserve') return '방 고르기 · 빈 대기실 ' + (c.rooms || []).length + '곳 · ' + esc(c.unitName) + ' ' + c.count + '명';
        if (c.id === 'trigger') return '방 고르기 · 침입자 있는 함정 ' + (c.rooms || []).length + '곳 · 피해 ' + (c.rooms || []).map(function (r) { return r.dmg; }).join('/');
        return c.target === 'room' ? '방 고르기' : '자동';
      }
      function cdCand(inf, id) { return (inf.cands || []).filter(function (c) { return c.id === id; })[0] || null; }
      function cdRoomInfo(c, z) {
        var r = (c.rooms || []).filter(function (x) { return x.z === z; })[0];
        if (!r) return '';
        if (c.id === 'reserve') return api.zoneName(z) + ' 대기실 · ' + esc(c.unitName) + ' ' + c.count + '명이 서요';
        return api.zoneName(z) + ' 함정 · 안에 ' + (r.ids || []).length + '분대 · 피해 ' + r.dmg;
      }
      function cdMarks(inf) {   // 판 표시: 위기 방(빨강) · 고를 수 있는 방(초록 점선) · 고른 방(주황)
        board.querySelectorAll('.zc.cd-where, .zc.cd-ok, .zc.sel').forEach(function (c) { c.classList.remove('cd-where', 'cd-ok', 'sel'); });
        board.classList.toggle('cd-pickmode', !!(inf && inf.sel));
        if (!inf) return;
        (inf.where || []).forEach(function (w) { if (w.z && w.z !== 'Y') setCls(w.z, 'cd-where'); });
        var c = inf.sel ? cdCand(inf, inf.sel) : null;
        if (c) (c.rooms || []).forEach(function (r) { setCls(r.z, 'cd-ok'); });
        if (c && cd.room) setCls(cd.room, 'sel');
      }
      function drawCard() {
        var inf = SIM.pickInfo(S);
        if (!inf) { closeCard(); return; }
        if (inf.sel && !cdCand(inf, inf.sel)) { SIM.pickCancel(S); inf = SIM.pickInfo(S); }
        var sel = inf.sel ? cdCand(inf, inf.sel) : null;
        if (!sel && !cdCand(inf, cd.pre)) cd.pre = inf.cands.length ? inf.cands[0].id : '';
        var cur = sel || cdCand(inf, cd.pre);
        el.classList.add('picking');
        cslots.forEach(function (b) {
          var c = cdCand(inf, b.getAttribute('data-card'));
          b.classList.toggle('cand', !!c); b.classList.toggle('sel', !!c && !!cur && cur.id === c.id);
        });
        if (sel) {
          var ok = !!(cd.room && (sel.rooms || []).some(function (r) { return r.z === cd.room; }));
          cardlineEl.innerHTML = '<span class="cl-text' + (ok ? ' ok' : '') + '">' + (ok ? '고른 방: ' + cdRoomInfo(sel, cd.room) : '초록 점선 방을 눌러요 (' + (sel.rooms ? sel.rooms.length : 0) + '곳)') + '</span>' +
            '<button class="cl-btn" type="button" data-cd-cancel>취소</button><button class="cl-btn main' + (ok ? '' : ' off') + '" type="button" data-cd-use aria-disabled="' + (ok ? 'false' : 'true') + '">사용</button>';
          cardboxEl.hidden = true; cardboxEl.innerHTML = '';
        } else {
          cardlineEl.innerHTML = '<span class="cl-text">카드 ' + inf.n + '/' + inf.max + ' · ' + esc(cdWhy(inf)) + '</span><button class="cl-btn" type="button" data-cd-skip>넘기기</button>';
          if (cur) {
            var lk = CARD_LOOK[cur.id] || ['doc', ''];
            cardboxEl.hidden = false;
            cardboxEl.innerHTML = ic(lk[0], lk[1], 30) + '<div class="cb-t"><b>' + esc(cur.name) + '</b><span>' + esc(cur.text) + '</span><small>' + cdTarget(cur) + '</small></div>' +
              '<button class="cb-use" type="button" data-cd-go>' + (cur.target === 'room' ? '방 고르기' : '사용') + '</button>';
          } else { cardboxEl.hidden = true; cardboxEl.innerHTML = ''; }
        }
        cdMarks(inf);
      }
      function openCardUi() {   // 창이 열리는 순간이 저장 지점 (새로고침해도 같은 창)
        var inf = SIM.pickInfo(S); if (!inf) return;
        cd.open = true; cd.room = ''; cd.pre = '';
        paint();
        drawCard();
        (inf.where || []).forEach(function (w) {
          var a = w.z && w.z !== 'Y' ? Z.anchorOf(w.z) : null;
          if (a) floatText(a.x, a.y - 0.3, '위기!', 'alarm');
        });
        board.classList.remove('bt-alarm'); void board.offsetWidth; board.classList.add('bt-alarm');
        buzz('warn');
        checkpoint();
      }
      function closeCard() {
        cd.open = false; cd.room = ''; cd.pre = '';
        el.classList.remove('picking');
        cslots.forEach(function (b) { b.classList.remove('cand', 'sel'); });
        if (cardboxEl) { cardboxEl.hidden = true; cardboxEl.innerHTML = ''; }
        cdMarks(null);
        drawCardNote();
      }
      function drawCardNote() {
        if (!cardlineEl || cd.open) return;
        var r = SIM.result(S).cards, last = r.log.length ? r.log[r.log.length - 1] : null;
        cardlineEl.innerHTML = '<span class="cl-text fld-cardnote">' + (cardsOn ? '카드 기회 ' + SIM.cardsLeft(S) + '회 남음' + (last ? ' · 마지막: ' + esc(last.name) : '') : '') + '</span>';
      }
      function cdSelect(id) {
        var r = SIM.pickSelect(S, id);
        if (!r.ok) { api.toast(r.why); buzz('warn'); drawCard(); return; }
        cd.room = ''; buzz('tap'); drawCard(); checkpoint();
      }
      function cdCancel() { SIM.pickCancel(S); cd.room = ''; buzz('tap'); drawCard(); checkpoint(); }
      function cdUse(id, z) {
        var r = SIM.pickUse(S, id, z);
        if (!r.ok) { api.toast(r.why || '지금은 쓸 수 없어요'); buzz('warn'); if (SIM.pickInfo(S)) drawCard(); return; }
        closeCard();
        var rec = r.rec || {};
        var text = rec.card === 'smoke' ? '연막 살포 · ' + (rec.ids || []).length + '분대 ' + rec.sec + '초 정지'
          : rec.card === 'reserve' ? '임시 수비대 · ' + api.zoneName(rec.z) + '에 ' + rec.count + '명 배치'
          : '긴급 작동 · ' + api.zoneName(rec.z) + ' 피해 -' + rec.lost + (rec.retreats ? ' · 퇴각 ' + rec.retreats + '분대' : '');
        log(text, 'card');
        show(r.ev);
        paint(); drawCardNote(); buzz('good');
        checkpoint();
      }
      function cdSkip() {
        var r = SIM.pickSkip(S);
        if (!r.ok) { api.toast(r.why || '지금은 넘길 수 없어요'); return; }
        closeCard(); log('카드를 넘겼어요 (효과 없음)', 'dim'); show(r.ev); buzz('tap'); checkpoint();
      }
      // 판에서 방 누르기 (대상 고르는 중일 때만): 후보 방이면 고른 방으로, 아니면 안내
      function cdBoardClick(z) {
        var inf = SIM.pickInfo(S), c = inf && inf.sel ? cdCand(inf, inf.sel) : null;
        if (!c) return;
        if (!(c.rooms || []).some(function (r) { return r.z === z; })) { api.toast(api.zoneName(z) + '에는 쓸 수 없어요 (초록 점선 방만)'); buzz('warn'); return; }
        cd.room = z; buzz('tap'); drawCard();
      }
      // 카드 칸을 누름: 카드 기회 중이면 그 카드를 고른다 (후보만). 아니면 카드 설명 한 줄
      function slotClick(id) {
        var inf = cd.open ? SIM.pickInfo(S) : null, list = (window.BATTLE_DATA.BOSS_CARDS || {}).list || [], card = list.filter(function (c) { return c.id === id; })[0];
        if (!inf) { api.toast((card ? card.name + ': ' + card.text : CARD_SHORT[id]) + ' (보스전에서 카드 기회가 올 때 써요)'); buzz('tap'); return; }
        var c = cdCand(inf, id);
        if (!c) { api.toast((card ? card.name : CARD_SHORT[id]) + ': 지금은 쓸 수 없어요'); buzz('warn'); return; }
        if (inf.sel && inf.sel !== id) SIM.pickCancel(S);
        else if (inf.sel === id) return;
        cd.pre = id; cd.room = ''; buzz('tap'); drawCard(); checkpoint();
      }
      // 연막·임시 수비대·긴급 작동의 화면 연출 (사건 card): 일어난 일만 그린다. 연막 초는 분대 위 글(paint)이 보여 주고, 여기는 떠오르는 글
      function cardFx(e) {
        if (e.card === 'smoke') {
          (e.ids || []).forEach(function (id) { var q = S.squads.filter(function (x) { return x.id === id; })[0]; if (q && (q.floor || 1) === V.floor) floatText(q.x, q.y - 0.3, '☁ 연막', 'smoke'); });
        } else if (e.card === 'reserve') {
          drawFloor(V.floor);
          var a = Z.anchorOf(e.z);
          flashZone(e.z, 'bt-boost'); floatText(a.x, a.y - 0.35, '임시 수비대', 'reserve');
        } else if (e.card === 'trigger') {
          var t = Z.anchorOf(e.z);
          flashZone(e.z, 'bt-trig'); floatText(t.x, t.y - 0.2, '긴급 작동 -' + e.lost, 'trap');
        }
      }


      // ---------- 아래 창: 시설 강화 · 출진 (기획서 3·5·6절) ----------
      // 열려 있는 동안 전투는 멈춘다(U.hold). 확정 배치를 하나라도 바꾸면(강화·출진·조달) progress.js가 진행 중 일반 판을 버리고, 창을 닫을 때 새 배치로 새 판이 시작된다.
      var sheetKind = null, upSel = null, upLock = false, upTimer = 0, sorFloor = 1, dirty = false, pickRoom = null;
      function setCls(z, cls) { board.querySelectorAll('.zc[data-z="' + z + '"]').forEach(function (c) { c.classList.add(cls); }); }
      function marks() {   // 판에 표시: 강화 창 = 고른 방 / 출진 창 = 대기실 전부(점선) + 방금 만진 부대의 방
        board.querySelectorAll('.zc.sel, .zc.pv').forEach(function (c) { c.classList.remove('sel', 'pv'); });
        if (sheetKind === 'up' && upSel) setCls(upSel, 'sel');
        if (sheetKind === 'sortie') {
          Object.keys(RUN.site.zones).forEach(function (z) { var f = Z.FAC[RUN.site.zones[z]]; if (f && f.kind === 'den' && Z.floorOf(z) === sorFloor) setCls(z, 'pv'); });
          if (pickRoom) setCls(pickRoom, 'sel');
        }
      }
      function closeSheet() {
        if (!sheetKind) return;
        sheetKind = null; upSel = null; pickRoom = null;
        sheetEl.hidden = true; sheetEl.innerHTML = ''; el.classList.remove('upopen');
        if (dirty) { api.rerender(); return; }   // 배치가 바뀌었으면 진행 중이던 판은 버려졌다: 새 배치로 새 판
        U.hold = false; marks();
      }
      function markChanged() {   // 창에서 확정 배치를 바꿨다
        if (!dirty) { dirty = true; U.dead = true; U.hold = true; layer.style.display = 'none'; fxLayer.style.display = 'none'; }
        board.innerHTML = plainBoard(V.floor);
        api.hudRefresh(hudEl);
        marks();
      }
      function openSheet(kind) {
        if (boss) { api.toast('보스전 중에는 바꿀 수 없어요'); buzz('warn'); return; }
        sheetKind = kind; U.hold = true; el.classList.add('upopen');
        drawSheet();
      }
      function drawSheet() {
        if (!sheetKind) return;
        sheetEl.hidden = false;
        sheetEl.innerHTML = sheetKind === 'up' ? upHtml() : sortieHtml();
        marks();
        if (api.tutPlace) api.tutPlace();
      }
      // ----- 시설 강화 창: 값은 P.upgradeInfo 만 읽고, [강화] = P.upgradeFacility 한 번. [닫기]·바깥 누르기는 아무 함수도 안 부름 -----
      function upRow(label, html) { return '<div class="uprow"><span class="uplab">' + label + '</span><span class="upval">' + html + '</span></div>'; }
      function upUnitsText(inf) {
        var us = inf.units || [], names = us.slice(0, 3).map(function (u) { return esc(api.uname(u)) + (u.kind === 'guard' ? '' : ' ' + u.count + '명'); }).join(', ');
        return names + (us.length > 3 ? ' 외 ' + (us.length - 3) : '');
      }
      function upHtml() {
        var inf = P.upgradeInfo(upSel), off = !inf.ok || upLock, top = !inf.effectNext, h = '<div class="upbody">';
        h += '<div class="uphead"><b>' + esc(inf.name) + ' · ' + esc(inf.facName) + '</b><span class="chip keep">이번 현장만</span><span class="uplv">단계 ' + inf.level + '/' + inf.max + (inf.level > 1 ? ' (+' + (inf.level - 1) + ')' : '') + '</span></div>';
        h += upRow('효과', top ? esc(inf.effectNow ? inf.effectNow.text : '') + ' <b class="uptop">최고 단계</b>' : esc(inf.effectNow.text) + ' → <b>' + esc(inf.effectNext.text) + '</b>');
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
        if (!top) h += '<div class="upnote dim">누르면 바로 적용돼요 (진행 중인 일반 판은 새 판으로 바뀌어요) · 전투력은 예상이에요</div>';
        h += '</div><div class="upfoot"><span class="upwhy">' + (inf.ok || upLock ? '' : esc(inf.why)) + '</span>' +
          '<button class="upbtn" type="button" data-sheet-close>닫기</button>' +
          '<button class="upbtn main' + (off ? ' off' : '') + '" type="button" data-up-do aria-disabled="' + (off ? 'true' : 'false') + '">강화' + (inf.cost ? ' · 마석 ' + inf.cost : '') + '</button></div>';
        return h;
      }
      function doUp() {
        if (!upSel || upLock) return;
        var inf = P.upgradeInfo(upSel);
        if (!inf.ok) { api.toast(inf.why); buzz('warn'); drawSheet(); return; }
        upLock = true;   // 이 다음 눌림은 잠깐 막는다 (타이머가 풀어 줌)
        var r = P.upgradeFacility(upSel);
        if (r.ok) { buzz('good'); api.toast(r.msg); api.stageToast(r.stages); markChanged(); }
        else { api.toast(r.msg); buzz('warn'); }
        drawSheet();
        api.flashUp(sheetEl.querySelector('.uplv'));
        clearTimeout(upTimer);
        upTimer = setTimeout(function () { upLock = false; if (sheetKind === 'up') drawSheet(); }, UP_LOCK_MS);
      }

      // ----- 출진 창: 층 고르기 · 자동 편성 · 출진 칸 · 대기/다른 층 부대 · 부대 조달·보충 (군단 탭에서 옮겨 옴) -----
      // 규칙(API.md 7절): 한 부대는 한 층에만. 한도 = min(층 한도, 그 층 대기실 자리 합). 친위대도 한 칸. 손으로 바꾸면 자동 편성이 꺼진다. 안 되는 일은 이유를 토스트로.
      function unitRowHtml(u, fi) {
        var where = u.floor ? u.floor + '층 출진 중' : '대기';
        var why = fi.cap === 0 ? '대기실 없음' : u.resting ? '쉬는 중' : fi.units.length >= fi.cap && u.floor !== fi.n ? '한도 참' : '';
        var rf = u.kind === 'squad' ? P.refillInfo(u.id) : null, full = rf && u.count >= u.cap;
        return '<div class="card urow' + (u.kind === 'guard' ? ' guard' : '') + '"><div class="sinfo"><div class="utop"><b>' + esc(api.uname(u)) + '</b>' + (u.kind === 'guard' ? '<span class="chip accent">친위대</span>' : '') + '</div>' +
          '<div class="utags"><span class="chip">' + esc(u.tribeName) + '</span>' + (u.kind === 'guard' ? '' : '<span class="chip">' + u.count + '/' + u.cap + '명</span>') +
          '<span class="chip">Lv ' + u.lv + '</span><span class="chip' + (u.floor ? ' ok' : '') + '">' + where + '</span></div><div class="nums">' + api.statLine(u) + '</div></div>' +
          '<div class="ubtns"><button class="btn small' + (why ? ' poor' : ' primary') + '" type="button" data-in="' + u.id + '"' + (why ? ' aria-disabled="true" data-why="' + esc(why) + '"' : '') + '>' + fi.n + '층 출진</button>' +
          (rf && !full ? '<button class="btn small' + (rf.canAfford ? '' : ' poor') + '" type="button" data-refill="' + u.id + '"' + (rf.canAfford ? '' : ' aria-disabled="true" data-why="' + esc(rf.why) + '"') + '>1명 보충 · 마석 ' + rf.cost + '</button>' : '') + '</div></div>';
      }
      function sortieHtml() {
        var fis = P.floorsInfo(), fi = fis[sorFloor - 1] || fis[0], h = '<div class="upbody">';
        if (!fi) return '<div class="upbody"><div class="card dim">진행 중인 의뢰가 없어요</div></div>';
        h += '<div class="uphead"><b>출진 · 지하 ' + fi.n + '층</b><span class="chip keep">이번 현장만</span><span class="uplv">' + fi.units.length + '/' + fi.cap + '</span></div>';
        if (fis.length > 1) h += '<div class="seg floortabs">' + fis.map(function (f) {
          return '<button type="button" data-fl="' + f.n + '"' + (f.n === fi.n ? ' class="on"' : '') + '>' + (f.open ? '' : '🔒 ') + f.n + '층</button>';
        }).join('') + '</div>';
        h += '<div class="toggle"><span><b>자동 편성</b><small class="dim">빈 칸이 생기면 쉬지 않는 부대를 전투력 순으로 채워요. 손으로 바꾸면 꺼져요.</small></span>' +
          '<button class="sw' + (RUN.site.auto ? ' on' : '') + '" type="button" data-auto aria-label="자동 편성" aria-pressed="' + (RUN.site.auto ? 'true' : 'false') + '"></button></div>';
        if (!fi.open) return h + '<div class="card lockq"><h3>🔒 지하 ' + fi.n + '층</h3><div class="small-text dim">' + lockWhy(fi.n) + '</div></div></div><div class="upfoot"><button class="upbtn main" type="button" data-sheet-close>닫기</button></div>';
        var cells = '';
        for (var i = 0; i < fi.cap; i++) {
          var u = fi.units[i];
          cells += u ? '<button class="card sslot filled' + (u.kind === 'guard' ? ' guard' : '') + '" type="button" data-out="' + u.id + '"><b>' + esc(api.uname(u)) + '</b>' +
            '<small>' + (u.kind === 'guard' ? '친위대' : u.count + '명') + ' · Lv ' + u.lv + '</small><small>' + (u.placed ? esc(api.zoneName(u.placed)) + '에 서요' : '자리 대기') + '</small>' +
            '<small class="out">눌러서 빼기</small></button>' : '<div class="card sslot empty"><small>빈 칸</small><small>아래에서 골라요</small></div>';
        }
        h += '<div class="stat"><span><b>출진 칸</b> <small class="dim">(한도 ' + fi.cap + ' = 층 한도 ' + fi.capMax + ' · 대기실 자리 ' + fi.slots + ')</small></span><b>⚔ ' + fmtN(fi.power) + '</b></div>' +
          (fi.cap ? '<div class="sslots">' + cells + '</div>' : '<div class="small-text dim">이 층에는 몬스터 대기실이 없어서 출진 칸이 0이에요. [건설]에서 대기실을 지으면 칸이 생겨요.</div>');
        var all = P.squads().concat(P.guards()).filter(function (x) { return x.floor !== fi.n && (x.kind === 'guard' || x.count > 0); });
        all.sort(function (a, b) { return (a.resting ? 1 : 0) - (b.resting ? 1 : 0) || (a.kind === 'guard' ? 1 : 0) - (b.kind === 'guard' ? 1 : 0); });
        h += '<div class="bt-sub">대기 · 다른 층 부대 (' + all.length + ')</div>' + (all.length ? all.map(function (x) { return unitRowHtml(x, fi); }).join('') : '<div class="small-text dim">출진시킬 부대가 더 없어요. 아래에서 조달해요.</div>');
        // 이 층에 선 부대도 보충할 수 있게 (정원 미만만)
        var inFloor = fi.units.filter(function (x) { var r = x.kind === 'squad' ? P.refillInfo(x.id) : null; return r && x.count < x.cap; });
        if (inFloor.length) h += '<div class="bt-sub">출진 중 부대 보충</div>' + inFloor.map(function (x) {
          var r = P.refillInfo(x.id);
          return '<div class="stat"><span>' + esc(api.uname(x)) + ' ' + x.count + '/' + x.cap + '명</span><button class="btn small' + (r.canAfford ? '' : ' poor') + '" type="button" data-refill="' + x.id + '"' + (r.canAfford ? '' : ' aria-disabled="true" data-why="' + esc(r.why) + '"') + '>1명 보충 · 마석 ' + r.cost + '</button></div>';
        }).join('');
        h += '<div class="bt-sub">새 부대 조달 (마석 · 이번 현장만)</div><div class="row2">' + (P.TRIBES || []).map(function (t) {
          var pc = P.procureInfo(t.id);
          return pc ? '<button class="btn small' + (pc.canAfford ? ' primary' : ' poor') + '" type="button" data-procure="' + t.id + '"' + (pc.canAfford ? '' : ' aria-disabled="true" data-why="' + esc(pc.why) + '"') + '>' + esc(t.name) + ' 조달 · 마석 ' + pc.cost + '</button>' : '';
        }).join('') + '</div>';
        h += '<div class="small-text dim">부대 하나는 한 층에만 설 수 있어요. 친위대도 한 칸을 차지해요. 마석은 위 상단 바에서 남은 양을 볼 수 있어요.</div>';
        return h + '</div><div class="upfoot"><span class="upwhy"></span><button class="upbtn main" type="button" data-sheet-close>닫기</button></div>';
      }
      function sresult(r, id) {
        api.toast(r.msg || (r.ok ? '완료' : '할 수 없어요'));
        if (r.ok) {
          buzz('tap'); api.stageToast(r.stages);
          markChanged();
          var u = id ? P.unitById(id) : null;
          pickRoom = u && u.placed ? u.placed : null;
        } else buzz('warn');
        drawSheet();
      }
      sheetEl.addEventListener('click', function (e) {
        var q = function (a) { return e.target.closest ? e.target.closest('[' + a + ']') : null; }, b;
        if (q('data-sheet-close')) { buzz('tap'); closeSheet(); return; }
        if (sheetKind === 'up') {
          if (q('data-up-do')) {
            if (q('data-up-do').getAttribute('aria-disabled') === 'true') { buzz('warn'); return; }
            doUp();
          }
          return;
        }
        if (sheetKind !== 'sortie') return;
        if ((b = q('data-fl'))) { sorFloor = +b.getAttribute('data-fl'); buzz('tap'); drawSheet(); return; }
        if ((b = q('data-auto'))) { sresult(P.setAutoDeploy(!RUN.site.auto)); return; }
        if ((b = q('data-in'))) {
          if (b.getAttribute('aria-disabled') === 'true') { api.toast(b.getAttribute('data-why') || '지금은 할 수 없어요'); buzz('warn'); return; }
          sresult(P.sortieUnit(b.getAttribute('data-in'), sorFloor), b.getAttribute('data-in')); return;
        }
        if ((b = q('data-out'))) { sresult(P.withdrawUnit(b.getAttribute('data-out'))); return; }
        if ((b = q('data-refill'))) {
          if (b.getAttribute('aria-disabled') === 'true') { api.toast(b.getAttribute('data-why') || '지금은 할 수 없어요'); buzz('warn'); return; }
          sresult(P.refillSquad(b.getAttribute('data-refill')), b.getAttribute('data-refill')); return;
        }
        if ((b = q('data-procure'))) {
          if (b.getAttribute('aria-disabled') === 'true') { api.toast(b.getAttribute('data-why') || '지금은 할 수 없어요'); buzz('warn'); return; }
          var r = P.procureSquad(b.getAttribute('data-procure'));
          sresult(r, r.unit ? r.unit.id : null);
        }
      });
      // 판의 지은 시설(함정·대기실)을 누르면 강화 창 (운영 상태만). 그 밖의 방은 이름 한 줄
      board.addEventListener('click', function (e) {
        var c = e.target.closest ? e.target.closest('.zc[data-z]') : null;
        if (!c) return;
        var z = c.getAttribute('data-z'), f = Z.FAC[RUN.site.zones[z]];
        if (cd.open) { cdBoardClick(z); return; }   // 카드 대상 고르기
        if (boss) { api.toast(api.zoneName(z) + ': 보스전 중에는 바꿀 수 없어요'); buzz('tap'); return; }
        if (sheetKind === 'sortie') { buzz('tap'); api.toast(api.zoneName(z) + (f ? ' — ' + f.name : '')); return; }
        var ui = f ? P.upgradeInfo(z) : null;
        if (ui && ui.code !== 'target' && ui.code !== 'locked') { buzz('tap'); sheetKind = 'up'; upSel = z; U.hold = true; el.classList.add('upopen'); drawSheet(); return; }
        if (sheetKind === 'up') closeSheet();
        if (f) { api.toast(api.zoneName(z) + ' — ' + f.name); buzz('tap'); }
      });
      // 바깥 누르기 = 강화 창 닫기 (판·창 안은 빼고). 출진 창은 [닫기]로만
      el.addEventListener('click', function (e) {
        if (sheetKind !== 'up' || !e.target.closest) return;
        var path = e.composedPath ? e.composedPath() : [];   // 눌린 뒤 창·판이 다시 그려져 target 이 떨어져 나갔어도 경로는 남아 있다
        if (path.indexOf(sheetEl) >= 0 || path.indexOf(board) >= 0) return;
        closeSheet();
      });

      // ---------- 버튼: 배속 · 일시정지 (판 모서리) · 성장판 칸(건설 모드) · 부대 모집(출진 창) · 카드 칸 · 보스 도전 ----------
      function drawSpeed() {
        var sp = BD.SPEEDS[U.speedIdx];
        speedBtn.textContent = '×' + sp; speedBtn.classList.toggle('on', sp > 1);
      }
      function drawDock() {
        pauseBtn.innerHTML = U.paused ? ic('play', '', 14, true) : ic('pause', '', 14);
        pauseBtn.setAttribute('aria-label', U.paused ? '계속' : '일시정지');
        pauseBtn.disabled = U.phase === 'result';
        speedBtn.disabled = U.phase === 'result';
      }
      speedBtn.addEventListener('click', function () {
        U.speedIdx = (U.speedIdx + 1) % BD.SPEEDS.length;
        U.fastUsed = BD.SPEEDS[U.speedIdx] > 1;   // 위기 카드 방식에서는 배속이 카드 수에 영향을 주지 않는다 (저장 칸만 유지)
        P.setBattleSpeed(U.speedIdx, U.fastUsed);
        drawSpeed();
        buzz('tap');
      });
      pauseBtn.addEventListener('click', function () { if (U.phase !== 'fight') return; U.paused = !U.paused; flowSave(); drawDock(); buzz('tap'); });
      el.addEventListener('click', function (e) {
        var q = function (a) { return e.target.closest ? e.target.closest('[' + a + ']') : null; }, b;
        if ((b = q('data-gcell'))) {   // 성장판 칸 = 건설 모드 (그 시설이 골라진 채. 문 칸 = 문 옮기기). 떠나면서 저장(멈춤). 확정하면 이 일반 판은 버리고 새 배치로 다음 판, 취소하면 이어서
          buzz('tap'); api.setPreset(b.getAttribute('data-gcell')); api.go('build', true); return;
        }
        if (q('data-fsortie')) { buzz('tap'); openSheet('sortie'); return; }
        if ((b = q('data-card'))) { slotClick(b.getAttribute('data-card')); return; }
        if (q('data-cd-skip')) { cdSkip(); return; }
        if (q('data-cd-cancel')) { cdCancel(); return; }
        if (q('data-cd-go')) {
          var inf = SIM.pickInfo(S), c = inf && cdCand(inf, cd.pre);
          if (!c) return;
          if (c.target === 'room') cdSelect(c.id); else cdUse(c.id);
          return;
        }
        if ((b = q('data-cd-use'))) {
          var pi = SIM.pickInfo(S);
          if (b.getAttribute('aria-disabled') === 'true' || !pi || !pi.sel || !cd.room) { api.toast('먼저 판에서 방을 골라요'); buzz('warn'); return; }
          cdUse(pi.sel, cd.room);
        }
      });
      if (bossBtn) bossBtn.addEventListener('click', function () {
        if (bossBtn.getAttribute('aria-disabled') === 'true') { api.toast((bi0 && bi0.why) || '지금은 도전할 수 없어요'); buzz('warn'); return; }
        var r = P.challengeBoss();
        if (!r.ok) { api.toast(r.msg); buzz('warn'); return; }
        buzz('warn'); api.rerender();
      });

      // ---------- 전투 끝 ----------
      function finish() {
        U.phase = 'result';
        var rep = api.finishBattle(SIM.result(S));
        if (!rep) { api.rerender(); return; }
        api.hudRefresh(hudEl);
        drawDock();
        if (rep.mode === 'boss') {   // 잠깐 마지막 장면을 보여 준 뒤 보스 결과로
          log(rep.boss.success ? '보스 격퇴!' : '보스 실패…', rep.boss.success ? 'good' : 'bad');
          buzz(rep.boss.success ? 'stamp' : 'warn');
          endTimer = setTimeout(function () { if (run.alive) api.rerender(); }, 900);
          return;
        }
        var line = repLine(rep);
        recent.push({ text: line, ok: rep.defended }); while (recent.length > 3) recent.shift();
        note(line);
        log('다음 일반 판까지 잠깐 쉬어요…', 'dim');
        scheduleNext(Math.max(0, FL.rest) * 1000);
      }
      function scheduleNext(ms) {   // 판 사이 쉼 뒤 다음 일반 판. 창이 열려 있으면 닫힐 때까지 기다림
        restTimer = setTimeout(function () {
          if (!run.alive || P.battlePlan()) return;
          if (sheetKind) { scheduleNext(800); return; }
          P.startBattle(); api.rerender();
        }, ms);
      }

      // ---------- 루프 ----------
      var last = performance.now();
      function frame(now) {
        if (!run.alive) return;
        run.raf = requestAnimationFrame(frame);
        var real = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
        if (U.hold || U.dead) return;   // 아래 창이 열려 있는 동안은 멈춤
        if (U.phase === 'fight' && S.pick) { if (!cd.open) openCardUi(); return; }   // 카드 선택 대기: 전투 완전 정지 (일시정지 중이어도, 새로고침 뒤에도 같은 창)
        if (U.phase === 'fight' && !U.paused) {
          // 카드 전용 화면이 떠 있는 동안 전투는 완전히 멈춘다 (고를 때까지 기다림). 층 알림(U.notice·S.pending)이 떠 있는 동안도 멈춤: 누르면 다음 층 시작
          if (U.card || U.notice || U.floorNotice) fitOverlay();
          else {
            // 배속에서도 계산이 건너뛰지 않게 작게 나눠 진행
            var dt = real * BD.SPEEDS[U.speedIdx], n = Math.ceil(dt / 0.05);
            for (var i = 0; i < n && !S.done; i++) {
              show(SIM.step(S, dt / n));
              if (U.queue.length || U.floorNotice || S.pick) break;   // 위기가 생기면 이번 프레임은 거기서 멈추고 바로 카드를 띄움 / 이 층이 끝나면 알림
            }
          }
          checkCards();
          checkFloorNotice();
          paint();
          if (S.pick && !cd.open) { openCardUi(); return; }   // 이번 프레임에 카드 기회가 생김
          if (S.done) finish();
          else if ((saveT += real) >= FL.saveEvery) { saveT = 0; flowSave(); }
        } else if (U.phase === 'fight') {
          checkFloorNotice();   // 일시정지·저장에서 이어진 중에도 층 알림은 띄움
        }
      }
      drawSpeed();
      drawDock();
      paint();
      drawCardNote();
      S.squads.forEach(function (q) { var d = sqEls[q.id]; if (d && !d.classList.contains('out')) d.hidden = false; });
      if (!boss) log('일반 ' + plan.no + '판: ' + plan.groups.map(function (g) { return g.grade + '급 ' + esc(g.name) + ' Lv ' + g.lv; }).join(' · ') + (resumed ? ' · 저장 지점부터 이어짐 (' + Math.floor(S.t) + '초)' : ''), 'dim');
      if (!resumed) tutStart('battle', boss ? '.bt-speed' : '[data-fboss]');   // 저장 지점에서 이어진 전투에는 안내 없음
      run.raf = requestAnimationFrame(frame);
    };
  };
})();
