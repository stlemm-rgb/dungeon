/* D1 건설 화면 = 건설 모드 (5차: 문 토큰 판). 5x7 칸 판 + 통로(파이프) + 문 끌기 + 시설 끌어 놓기. 부대 출진은 shell.js의 출진 화면
 *
 * 구조 (shell.js의 SCREEN_PLUGINS 방식, battle.js와 같음)
 *  - 규칙은 zones.js(판·시설·문·길), 상태와 바꾸는 함수는 progress.js (API.md 13절: previewLayout·commitLayout·doorInfo·exploreRoutes). 여기는 보여 주고 누름만 받는다.
 *  - 판 그리기: 5x7 칸(ZONES.grid(n).cells, 여러 칸 방 = 고정 구역은 한 덩어리). 겹침 순서 = 칸 배경 -> 통로(SVG 파이프: 문이 있는 벽을 가로질러 두 방 가운데를 잇는 굵은 관) -> 방 글 -> 문 표시.
 *    평소 화면(현장 탭)과 전투 화면에도 파이프는 보인다. 문 표시(손잡이)는 건설 모드에서만, ?debug 에서는 분대 색 경로 선과 문 통과 수.
 *  - 흐름 (시설): 아래 시설 띠(함정·대기실·미끼)에서 시설을 끌어 빈 구역에 놓는다 (눌러 고른 뒤 칸을 눌러도 됨). 놓은 것은 "미확정"(점선·반투명·× 빼기, 여러 곳 가능).
 *  - 흐름 (문): 노란 문 표시를 끌어 문 없는 안쪽 벽(점선 칸)에 놓는다 (문을 누른 뒤 빈 벽을 눌러도 됨). 끄는 동안 P.previewLayout 으로 검사:
 *    거절이면 이유(why) 토스트 + 끊긴 방(isolated) 빗금, 문은 원래 자리로. 옮긴 문은 미확정(점선·반투명).
 *  - UI 개편 (2026-10-29): 현장 탭의 건설 상태. 위 = 공통 상단 바(api.hud) + 판을 크게 + 아래 시설 띠·합계·[취소][건설 확정 · 마석 N]. 확정·취소 모두 현장(운영 또는 보스 결과)으로 돌아간다.
 *    미확정이 있는데 탭·설정을 누르면 [확정하고 이동][버리고 이동][계속 수정]을 묻는다 (api.setGuard). 브라우저 뒤로 가기는 미확정을 버린다.
 *  - 아래 한 줄 합계 (미확정 시설 n곳 · 문 n개 옮김 · 마석 a → b · 가치 · 전투력). [건설 확정] = P.commitLayout 으로 문 + 시설 한 번에 확정 (문은 무료) / [취소] = 미확정 버리고 나감 (비용 없음).
 *    놓이는 곳(판정점) = 손·커서 끝 그대로 (위로 띄우지 않음). 끄는 그림은 그 자리에 작게 붙고, 대신 놓일 칸·벽을 판에서 크고 밝게 강조하며 놓을 곳·거절 이유는 아래 합계 줄에 쓴다 (손가락에 안 가림). 이미 지은 구역 위에 놓기(교체)는 데모에서 막음(토스트).
 *  - 시설 강화 표시: 강화된 함정·대기실 방 글에 단계(+1·+2, P.upgradeLevel)와 함정은 실제 피해. 합계 줄에 previewLayout 의 upLost·refund 가 있으면 "강화 사라짐 N곳 · 환급 +N" (데모에서는 지은 구역을 못 바꿔 거의 안 뜸). 강화 창은 shell.js 현장 화면이 맡고, 건설 모드에서 시설을 눌러도 창은 안 뜬다.
 *  - 층: 지하 단면 전체를 세로로 이어 그린다 (층이 늘면 단면만 스크롤). 잠긴 층은 어둡게 + 🔒 + 열림 조건.
 *  - 돈: 건설·부대 조달은 마석(회사 금 아님). 쓴 마석은 돌려받지 못한다. 마석 0이어도 다음 주는 진행된다.
 *  - 고정 구역(의뢰가 정함, 예: 얼어붙은 하역장)은 🔒로 보이고 못 짓고 못 바꾼다 (바깥 벽의 문은 옮길 수 있음).
 *  - 판 그리기(boardHtml)·의뢰 카드 조각(siteHtml·fixedHtml)은 shell.js·battle.js가 같이 쓴다 (window.ZONEVIEW).
 *  - 튜토리얼(첫 건설 전): 'zones' 단계 말풍선 + 추천 칸(P.tutorialPath, 보물방 바로 앞 방들) + 대기실 띠를 반짝이게 한다 (api.tutStart·api.tutZones). 첫 칸을 놓으면 'place'([건설] 반짝), 확정하면 'tohome'([홈] 반짝).
 *  - 곡선·시간은 shell.css의 var(--dur-*)/var(--ease-*) (MOTION에서 깔림)만. 색은 shell.css 맨 위 변수만.
 */
(function () {
  'use strict';

  var Z = window.ZONES, P = window.PROGRESS, RUN = P.RUN;
  // 판은 부지마다 다르다 (core 가 ZONES.useSite 로 바꿔 끼움). 판 값은 모듈 변수에 담지 말고 그릴 때마다 Z 에서 읽는다.
  function curZ() { Z = window.ZONES || Z; return Z; }
  var DEBUG = /[?&]debug\b/.test((window.location && window.location.search) || '');
  // 칸 가로/세로 비율 (한 칸이 가로로 약간 긴 모양. 7줄 판이 휴대폰 화면에 최대한 들어오게). 판 전체 비율 = 열 수 x 칸 비율 / 줄 수
  var CELL_RATIO = 1.45;

  function isStairs(z) { return !!(Z.isStairs && Z.isStairs(z)); }
  function cellKind(z, k) { return Z.zoneType(z) === 'boss' ? (isStairs(z) ? 'stairs' : 'boss') : (Z.FAC[k] || Z.FAC.empty).kind; }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function money(n) { return Number(n).toLocaleString('en-US'); }
  function fmtN(n) { return String(Math.round(Number(n) * 10) / 10); }
  function sign(n) { return (n >= 0 ? '+' : '') + fmtN(n); }
  function setOf(list) { var s = {}; (list || []).forEach(function (id) { s[id] = true; }); return s; }
  function copyDoors(d) { var o = {}; Object.keys(d || {}).forEach(function (n) { o[n] = (d[n] || []).slice(); }); return o; }
  function flatOf(d) { var out = []; Object.keys(d || {}).sort().forEach(function (n) { out = out.concat(d[n] || []); }); return out; }

  // 방 글: 방 이름 / 시설 / 한 줄 정보 / (있으면) 방 전투력 ⚔ / (미확정이면) 미확정 글 + × 빼기
  function labelHtml(z, k, units, pp, pend) {
    var f = Z.FAC[k] || Z.FAC.empty, us = units[z] || [], t = Z.zoneType(z), h;
    if (t === 'boss') {   // 층 맨 아래: 계단(아래층이 열렸을 때) 또는 보물방
      return isStairs(z) ? '<div class="fn">계단 ▼</div><div class="zi">' + (Z.floorOf(z) + 1) + '층으로</div>' : '<div class="fn">💰 보물방</div><div class="zi">지킬 곳</div>';
    }
    if (t === 'entry') return '<div class="fn">▼ ' + esc(Z.NAMES[z] || '입구') + '</div>';
    if (f.kind === 'fixed') return '<div class="fn">🔒 ' + esc(Z.NAMES[z] || f.short) + '</div><div class="zi">고정 구역</div>';
    h = '<div class="zn">' + esc(Z.NAMES[z] || z) + '</div>';
    if (k === 'empty') return h;   // 빈 방은 이름만 (통로 파이프와 글이 겹치지 않게)
    var lv = (f.kind === 'trap' || f.kind === 'den') && P.upgradeLevel ? P.upgradeLevel(z) : 1;   // 강화 단계 (1 = 기본, 표시 없음)
    h += '<div class="fn">' + esc(f.short) + (lv > 1 ? ' <b class="zup">+' + (lv - 1) + '</b>' : '') + '</div>';
    if (f.kind === 'den') {
      var sl = Z.slotsOf(k, z);
      h += '<div class="zi' + (us.length ? '' : ' warn') + '">' + us.length + '/' + sl + '</div>';
    } else if (f.kind === 'trap') {
      var dmg = Z.trapDmgOf(z), ui = lv > 1 ? P.upgradeInfo(z) : null;   // 강화된 함정은 실제 피해를 보인다
      if (ui && ui.effectNow && ui.effectNow.dmg) dmg = ui.effectNow.dmg;
      h += '<div class="zi">피해 ' + dmg + '</div>';
    }
    if (pp && pp[z] && pp[z].power > 0) h += '<div class="zp">⚔ ' + fmtN(pp[z].power) + '</div>';
    if (pend && pend[z]) h += '<div class="ptag">미확정</div><button class="pendx" type="button" data-unpend="' + z + '" aria-label="' + esc(Z.NAMES[z] || z) + ' 빼기">×</button>';
    return h;
  }

  // ---------- 통로(파이프)·문 표시·빈 벽 칸 (SVG 좌표 = 칸 단위 x 0~열, y = 층 줄 오프셋 + 0~줄) ----------
  // n층 통로: 문이 있는 벽마다 방 가운데 -> 벽 가운데 -> 방 가운데. 미확정으로 옮긴 문(pendSet)은 점선. routes(?debug)는 분대 색 선
  function pipesInner(n, list, pendSet, routes) {
    var edges = Z.edges(n), open = setOf(list), pend = pendSet || {}, rims = '', pipes = '', rt = '';
    edges.forEach(function (e) {
      if (!open[e.id]) return;
      var a = Z.roomCenter(e.ra), b = Z.roomCenter(e.rb), d = 'M' + a.x + ',' + a.y + 'L' + e.x + ',' + e.y + 'L' + b.x + ',' + b.y, c = pend[e.id] ? ' pend' : '';
      rims += '<path class="pipe-rim' + c + '" d="' + d + '"/>';
      pipes += '<path class="pipe' + c + '" d="' + d + '"/>';
    });
    if (routes) routes.forEach(function (r) {
      var shift = ((r.squad % 3) - 1) * 0.07;
      r.steps.forEach(function (s) {
        if (s.floor !== n || !s.edge) return;
        var a = Z.roomCenter(s.from), b = Z.roomCenter(s.to), m = Z.doorPoint(s.edge);
        if (!m) return;
        var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1, ox = -dy / len * shift, oy = dx / len * shift;
        rt += '<path class="route s' + ((r.squad % 3) + 1) + (s.backtrack ? ' back' : '') + '" d="M' + (a.x + ox) + ',' + (a.y + oy) + 'L' + (m.x + ox) + ',' + (m.y + oy) + 'L' + (b.x + ox) + ',' + (b.y + oy) + '"/>';
      });
    });
    return rims + pipes + rt;
  }
  // n층 문 표시. o = { pend(Set), grab(끌 수 있음), counts(?debug 통과 수), lift(끄는 중인 문 id), sel(눌러 고른 문 id) }
  function doorsInner(n, list, o) {
    o = o || {};
    var g = Z.grid(n), nc = g.cols, nr = g.rows, off = g.rowOff, open = setOf(list), pend = o.pend || {}, h = '';
    if (!o.grab && !o.counts) return '';
    Z.edges(n).forEach(function (e) {
      if (!open[e.id]) return;
      var cls = (e.vertical ? 'v' : 'h') + (o.grab ? ' grab' : '') + (pend[e.id] ? ' pend' : '') + (o.sel === e.id ? ' sel' : '') + (o.lift === e.id ? ' lifted' : '');
      var cnt = o.counts ? (o.counts[e.id] || 0) : null;
      h += '<i class="zdoor ' + cls + '" data-edge="' + e.id + '" data-floor="' + n + '" style="left:' + (e.x / nc * 100) + '%;top:' + ((e.y - off) / nr * 100) + '%"' +
        (o.grab ? ' role="button" tabindex="0" aria-label="문 ' + esc((Z.NAMES[e.ra] || e.ra) + ' ↔ ' + (Z.NAMES[e.rb] || e.rb)) + ' (끌어서 다른 벽으로)"' : '') + '>' + (cnt !== null ? '<b>' + cnt + '</b>' : '') + '</i>';
    });
    return h;
  }
  // 문을 놓을 수 있는 빈 벽 (문이 없는 안쪽 벽)
  function slotsInner(n, list) {
    var g = Z.grid(n), nc = g.cols, nr = g.rows, off = g.rowOff, open = setOf(list), h = '';
    Z.edges(n).forEach(function (e) {
      if (open[e.id]) return;
      h += '<i class="zslot ' + (e.vertical ? 'v' : 'h') + '" data-edge="' + e.id + '" data-floor="' + n + '" style="left:' + (e.x / nc * 100) + '%;top:' + ((e.y - off) / nr * 100) + '%"></i>';
    });
    return h;
  }

  // 판 한 층 HTML. o = { zones, units, floor(기본 1), doors({ 층: [벽 조각 id] }, 없으면 지금 문), pendDoors(미확정으로 옮긴 문 Set), grab(문을 끌 수 있음), selDoor, liftDoor,
  //   counts·routes(?debug), pp(방별 전투력 { 방: { power } }), pend(미확정 시설 { 방: 시설 }), iso(끊긴 방 Set), sel·pv(눌린·미리보기 방),
  //   noYard(야외·계단 띠 안 그림), locked · lockText(잠긴 층: 어둡게 + 🔒 글) }
  function boardHtml(o) {
    curZ();
    var fn = o.floor || 1, g = Z.grid(fn);
    if (!g) return '';
    var zones = o.zones, units = o.units || {}, nc = g.cols, nr = g.rows, off = g.rowOff, doorsBy = o.doors || Z.doors(), list = doorsBy[fn] || [];
    var h = '', pos = {}, done = {}, cells = '', labels = '';
    if (!o.noYard) {
      if (fn === 1) h = '<div class="zyard' + (o.sel === 'Y' ? ' sel' : '') + '" data-z="Y">야외 · 집결지 — <b>' + esc((Z.FAC[zones.Y] || Z.FAC.forest).name) + '</b></div>';
      else h = '<div class="zyard stair">▲ ' + (fn - 1) + '층 계단에서 내려와요</div>';
    }
    g.cells.forEach(function (row, r) { row.forEach(function (z, c) { (pos[z] = pos[z] || []).push([r, c]); }); });
    function zcls(z) { return (o.sel === z ? ' sel' : '') + (o.pv === z ? ' pv' : '') + (o.pend && o.pend[z] ? ' pend' : '') + (o.iso && o.iso[z] ? ' iso' : ''); }
    g.cells.forEach(function (row, r) {
      row.forEach(function (z, c) {
        if (done[z]) return;
        done[z] = true;
        var k = zones[z] || 'empty', kind = cellKind(z, k), rs = pos[z], r0 = 99, r1 = -1, c0 = 99, c1 = -1;
        rs.forEach(function (p) { r0 = Math.min(r0, p[0]); r1 = Math.max(r1, p[0]); c0 = Math.min(c0, p[1]); c1 = Math.max(c1, p[1]); });
        var rect = rs.length === (r1 - r0 + 1) * (c1 - c0 + 1);
        var blocks = rect ? [[r0, c0, r1 - r0 + 1, c1 - c0 + 1]] : rs.map(function (p) { return [p[0], p[1], 1, 1]; });
        blocks.forEach(function (b, i) {
          var area = 'grid-area:' + (b[0] + 1) + '/' + (b[1] + 1) + '/span ' + b[2] + '/span ' + b[3] + ';', edge = '';
          if (!rect) edge = [[-1, 0, 'top'], [1, 0, 'bottom'], [0, -1, 'left'], [0, 1, 'right']].map(function (d) {   // 모양이 네모가 아닌 방: 같은 방 칸 사이 벽은 지움
            var nb = g.cells[b[0] + d[0]] && g.cells[b[0] + d[0]][b[1] + d[1]];
            return nb === z ? 'border-' + d[2] + '-color:transparent;' : '';
          }).join('');
          cells += '<div class="zc k-' + kind + zcls(z) + '" data-z="' + z + '" style="' + area + edge + '"></div>';
          labels += '<div class="zl k-' + kind + zcls(z) + '" data-z="' + z + '" style="' + area + '">' + (i === 0 ? labelHtml(z, k, units, o.pp, o.pend) : '') + '</div>';
        });
      });
    });
    h += '<div class="zwrap' + (o.locked ? ' locked' : '') + (o.noYard ? ' flat' : '') + '" data-floor="' + fn + '" style="--zc:' + nc + ';--zr:' + nr + ';--gar:' + (nc * CELL_RATIO / nr) + '">' +
      '<div class="zgrid">' + cells + '</div>' +
      '<svg class="zpipes" viewBox="0 ' + off + ' ' + nc + ' ' + nr + '" preserveAspectRatio="none" aria-hidden="true" focusable="false">' + pipesInner(fn, list, o.pendDoors, o.routes) + '</svg>' +
      '<div class="zlabels">' + labels + '</div>' +
      '<div class="zslots" data-floor="' + fn + '"></div>' +
      '<div class="zdoors" data-floor="' + fn + '">' + (o.locked ? '' : doorsInner(fn, list, { pend: o.pendDoors, grab: o.grab, counts: o.counts, sel: o.selDoor, lift: o.liftDoor })) + '</div>';
    if (o.locked) h += '<div class="zlock"><b>🔒</b><span>' + esc(o.lockText || '아직 잠겨 있어요') + '</span></div>';
    return h + '</div>';
  }

  // ?debug: 분대 경로 선 + 문 통과 수. doorsBy·zones 를 주면 그 배치로, 없으면 지금 확정된 배치로 (같은 시드·같은 함수라 실제 전투 경로와 같음)
  function debugData(zones, doorsBy) {
    if (!DEBUG || !RUN.site) return null;
    curZ();
    var n = P.exploreRoutes().length, seed = RUN.plan ? RUN.plan.seed : 0, flat = flatOf(doorsBy || RUN.site.doors), zs = zones || RUN.site.zones, routes = [], counts = {};
    for (var i = 0; i < n; i++) {
      var r = Z.exploreRoute(flat, zs, i, seed);
      routes.push({ squad: i, habit: r.habit, steps: r.steps });
      r.steps.forEach(function (s) { if (s.edge) counts[s.edge] = (counts[s.edge] || 0) + 1; });
    }
    return { routes: routes, counts: counts };
  }

  // ---------- 의뢰 카드·팝업 조각: 판 미리보기 · 고정 구역 ----------
  function boardOf(id) {
    curZ();
    if (!id || typeof Z.boardInfo !== 'function') return null;
    try { var b = Z.boardInfo(id); return b && Array.isArray(b.MAP) && b.MAP.length && Array.isArray(b.MAP[0]) ? b : null; } catch (e) { return null; }
  }
  // 판 모양 작은 미리보기: 방마다 칸 색 (이웃한 방은 다른 색), 입구 '입'·보물방 '보'. 방 사이에만 선을 긋는다. 2층 방 id('2E'·'2B')도 입구·보물방으로 본다
  function isEntryId(k) { return /^\d?E$/.test(k); }
  function isBottomId(k) { return /^\d?B$/.test(k); }
  function miniHtml(info) {
    var M = info.MAP, nc = M[0].length, nbs = {}, keys = [], col = {};
    M.forEach(function (row, r) {
      row.forEach(function (k, c) {
        if (!nbs[k]) { nbs[k] = {}; keys.push(k); }
        [[r, c + 1], [r + 1, c]].forEach(function (p) {
          var o = M[p[0]] && M[p[0]][p[1]];
          if (o === undefined || o === k) return;
          if (!nbs[o]) { nbs[o] = {}; keys.push(o); }
          nbs[k][o] = 1; nbs[o][k] = 1;
        });
      });
    });
    keys.forEach(function (k) {
      var used = {}, i = 0;
      Object.keys(nbs[k]).forEach(function (o) { if (col[o] !== undefined) used[col[o]] = 1; });
      while (used[i]) i++;
      col[k] = i % 3;
    });
    var seen = {}, h = '<div class="mini" style="grid-template-columns:repeat(' + nc + ',minmax(0,1fr))" aria-hidden="true">';
    M.forEach(function (row, r) {
      row.forEach(function (k, c) {
        var up = M[r - 1] && M[r - 1][c], lf = row[c - 1];
        var bw = (up !== undefined && up !== k ? 1 : 0) + 'px 0 0 ' + (lf !== undefined && lf !== k ? 1 : 0) + 'px';
        var cls = isEntryId(k) ? 'me' : isBottomId(k) ? 'mb' : 'm' + col[k], mark = seen[k] ? '' : (isEntryId(k) ? '입' : isBottomId(k) ? '보' : '');
        seen[k] = true;
        h += '<i class="mc ' + cls + '" style="border-width:' + bw + '">' + mark + '</i>';
      });
    });
    return h + '</div>';
  }
  // 판 미리보기 + 판 이름 칩 + 한 줄 설명. 판 정보가 없으면 ''
  function siteHtml(boardId) {
    var info = boardOf(boardId);
    if (!info) return '';
    return '<div class="qsite">' + miniHtml(info) + '<div class="qsite-t"><span class="chip">' + esc(info.name || boardId) + '</span>' +
      (info.desc ? '<div class="small-text dim">' + esc(info.desc) + '</div>' : '') + '</div></div>';
  }
  // 지금 현장의 n층 작은 미리보기 (현장 단면의 잠긴 층 그림). 없으면 ''
  function floorMiniHtml(n) {
    curZ();
    var map = Z.floorMap ? Z.floorMap(n) : null;
    return map ? miniHtml({ MAP: map }) : '';
  }
  // 고정 구역 목록 (의뢰 q.fixed = { 방 id: 고정 구역 id }): "고정 | 얼어붙은 하역장 — 효과"
  function fixedHtml(q) {
    curZ();
    var ids = q && q.fixed ? Object.keys(q.fixed) : [];
    if (!ids.length) return '';
    var info = boardOf(q.board), names = info ? info.NAMES : {};
    return ids.map(function (z) {
      var f = Z.FAC[Z.fixedFac(q.fixed[z])] || {};
      return '<div class="demand fixed"><span class="chip req">고정</span><div class="dtxt"><b>' + esc(names[z] || z) + ' — ' + esc(f.name || q.fixed[z]) + '</b>' +
        '<small class="dim">바꿀 수 없어요. ' + esc(f.st || '') + '</small></div></div>';
    }).join('');
  }
  window.ZONEVIEW = { boardHtml: boardHtml, pipesInner: pipesInner, doorsInner: doorsInner, slotsInner: slotsInner, debugOn: DEBUG, debugData: debugData,
    boardOf: boardOf, siteHtml: siteHtml, fixedHtml: fixedHtml, miniHtml: miniHtml, floorMiniHtml: floorMiniHtml };

  // 방 설명 한 줄 (시설을 안 든 채 방을 누르면 토스트)
  function zoneInfo(z) {
    var t = Z.zoneType(z), k = RUN.site.zones[z], f = Z.FAC[k] || {};
    var what = t === 'entry' ? '침입자가 탐험을 시작하는 입구예요. 시설은 지을 수 없어요'
      : t === 'boss' ? (isStairs(z) ? '위아래 층을 잇는 계단이에요' : '침입자가 여기까지 오면 약탈해요')
      : f.kind === 'fixed' ? '고정 구역이라 못 바꿔요 (이 방 바깥 벽의 문은 옮길 수 있어요)'
      : k === 'empty' ? '빈 방이에요. 시설을 끌어다 놓으세요' : f.name + ' — 이미 지었어요';
    return (Z.NAMES[z] || z) + ': ' + what;
  }

  // 제자리 갱신: target 의 자식들을 src 의 자식들과 맞춘다. 같은 종류 요소는 그대로 두고 속성·글자만 바꿔서,
  // 버튼이 새로 생기지 않게 한다 (애니메이션·스크롤·누름 상태 유지).
  function syncKids(target, src) {
    var i, a, b;
    for (i = 0; i < src.childNodes.length; i++) {
      b = src.childNodes[i]; a = target.childNodes[i];
      if (!a) { target.appendChild(b.cloneNode(true)); continue; }
      if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { target.replaceChild(b.cloneNode(true), a); continue; }
      if (b.nodeType === 3) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; continue; }
      if (b.nodeType !== 1) continue;
      var n;
      for (n = a.attributes.length - 1; n >= 0; n--) if (!b.hasAttribute(a.attributes[n].name)) a.removeAttribute(a.attributes[n].name);
      for (n = 0; n < b.attributes.length; n++) if (a.getAttribute(b.attributes[n].name) !== b.attributes[n].value) a.setAttribute(b.attributes[n].name, b.attributes[n].value);
      syncKids(a, b);
    }
    while (target.childNodes.length > src.childNodes.length) target.removeChild(target.lastChild);
  }
  function morphHtml(target, html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    syncKids(target, tmp);
  }

  // ---------- 건설 모드 (현장 탭의 [건설]) ----------
  // 값은 P.previewLayout / P.commitLayout 으로만 읽고 바꾼다. 미확정 시설 + 미확정 문을 한꺼번에 미리보기 하므로 합계(마석·가치·전투력)는 근사가 아니라 실제 값이다.
  var TOOL_LABEL = { trap: '함정', den: '대기실', lure: '미끼' };
  var TOOL_ORDER = ['trap', 'den', 'lure'];
  function josa(w) { var c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c >= 0 && c % 28 !== 0 ? '은' : '는'; }   // 받침 있으면 은, 없으면 는

  window.SCREEN_PLUGINS = window.SCREEN_PLUGINS || {};
  window.SCREEN_PLUGINS.build = function (api) {
    return function (el) {
      curZ();
      var q = RUN.quest;
      var pend = {};        // 미확정 시설 { 방: { k: 시설 } }
      var order = [];       // 놓은 순서
      var orig = copyDoors(Z.doors());     // 확정된 문 { 층: [벽 조각 id] }
      var pdoors = copyDoors(orig);        // 미확정 문까지 넣은 문
      var cur = null;       // 미확정 전부의 P.previewLayout 결과 (미확정이 없으면 null)
      var armed = null;     // 눌러서 고른 시설 (칸을 누르면 놓음)
      var armedDoor = null; // 눌러서 고른 문 { edge, floor } (빈 벽을 누르면 옮김)
      var drag = null;      // 끌기 중 { kind: 'tool'|'pend'|'door', ... }
      var isoRooms = null;  // 거절된 문 옮기기에서 끊긴 방 { 방: true } (잠깐 빗금)
      var timers = [];
      el.classList.add('fixed', 'buildmode');

      var hudCtx = { tab: 'field', label: '건설', state: 'build', pending: false };   // 공통 상단 바 (shell.js hud). 미확정이 있으면 다음 목표가 "확정하거나 취소하세요"로 바뀜
      var hdrBox = api.hud(hudCtx);
      var shaft = api.div('shaft');
      var scroll = api.div('fscroll');
      scroll.appendChild(shaft);
      var doorBox = api.div('bdoorline');
      var toolsBox = api.div('tools');
      var sumBox = api.div('bsumline');
      var endBtn = document.createElement('button');
      endBtn.className = 'bbtn'; endBtn.type = 'button'; endBtn.textContent = '취소'; endBtn.setAttribute('data-end', '');
      var okBtn = document.createElement('button');
      okBtn.className = 'bbtn main'; okBtn.type = 'button'; okBtn.textContent = '건설 확정'; okBtn.setAttribute('data-confirm', '');
      var btns = api.div('bbtns');
      btns.appendChild(endBtn); btns.appendChild(okBtn);
      var dock = api.div('bdock');
      dock.appendChild(doorBox); dock.appendChild(toolsBox); dock.appendChild(sumBox); dock.appendChild(btns);
      el.appendChild(hdrBox); el.appendChild(scroll); el.appendChild(dock);

      // ----- 미확정 문·시설 계산 -----
      function movedSet(n, list) {
        var base = setOf(orig[n]), s = {};
        (list || pdoors[n] || []).forEach(function (id) { if (!base[id]) s[id] = true; });
        return s;
      }
      function movedTotal() { var t = 0; Object.keys(pdoors).forEach(function (n) { t += Object.keys(movedSet(n)).length; }); return t; }
      function changedDoors() {
        var o = {};
        Object.keys(pdoors).forEach(function (n) { if ((pdoors[n] || []).slice().sort().join() !== (orig[n] || []).slice().sort().join()) o[n] = pdoors[n].slice(); });
        return o;
      }
      function buildsMap(extra) {
        var m = {};
        order.forEach(function (z) { m[z] = pend[z].k; });
        if (extra) Object.keys(extra).forEach(function (z) { m[z] = extra[z]; });
        return m;
      }
      // 미확정 전부 (+ 더해 볼 시설·문) 의 미리보기. exD = { 층: [문 목록] } 로 그 층 문을 바꿔 봄
      function layout(exB, exD) {
        var d = changedDoors();
        if (exD) Object.keys(exD).forEach(function (n) { d[n] = exD[n]; });
        return P.previewLayout({ doors: d, builds: buildsMap(exB) });
      }
      function refreshCur() { cur = order.length || movedTotal() ? layout() : null; }
      function floorEditable(n) { var di = P.doorInfo(n); return !!(di && di.canEdit); }

      // ----- 놓을 수 있나 -----
      var moving = null;    // 미확정 시설을 다시 끄는 중이면 그 원래 방 (값 계산에서 빼고 본다)
      function spentOthers(z) { var s = 0; order.forEach(function (o) { if (o !== z && o !== moving) s += P.buildCost(pend[o].k, o); }); return s; }
      function pendSpent() { return spentOthers(null); }
      function lockTextOf(n) {
        var fi = P.floorInfo(n);
        return '지하 ' + n + '층: ' + (fi && fi.lockAt ? '보스 검증 ' + fi.lockAt + '단계 달성 시 열림' : '이 의뢰에서는 열리지 않아요');
      }
      // z 방에 시설 k를 놓을 수 있나. light = true면 미리보기를 안 부르고 비용만 본다 (끄는 동안 밝게 할 칸 고르기용)
      function canPlace(z, k, light) {
        var t = Z.zoneType(z), n = Z.floorOf(z), now = RUN.site.zones[z], f = Z.FAC[k];
        if (z === 'Y' || t === 'yard') return { ok: false, why: '야외에는 데모에서 지을 수 있는 시설이 없어요' };
        if (!Z.floorOpen(n)) return { ok: false, why: '🔒 ' + lockTextOf(n) };
        if (RUN.site.fixed && RUN.site.fixed[z]) return { ok: false, why: '고정 구역이라 바꿀 수 없어요' };
        if (t === 'boss') return { ok: false, why: isStairs(z) ? '계단: 위아래 층을 이어요. 여기는 지을 수 없어요' : '보물방: 시설을 지을 수 없어요' };
        if (t === 'entry') return { ok: false, why: '입구에는 지을 수 있는 시설이 없어요' };
        if (!pend[z] && now !== 'empty') return { ok: false, why: '이미 지은 구역이에요. 데모에서는 바꾸거나 허물 수 없어요' };
        if (Z.facFor(z).indexOf(k) < 0) return { ok: false, why: f && f.for === 'entry' ? TOOL_LABEL[k] + josa(TOOL_LABEL[k]) + ' 입구 칸에만 지을 수 있어요' : TOOL_LABEL[k] + josa(TOOL_LABEL[k]) + ' 이 칸에 지을 수 없어요' };
        var need = spentOthers(z) + P.buildCost(k, z);
        if (need > P.budgetLeft()) return { ok: false, why: '마석이 모자라요 (필요 ' + need + ', 남은 ' + P.budgetLeft() + ')' };
        if (light) return { ok: true };
        var ex = {}; ex[z] = k;
        var p = layout(ex);   // 미확정 문까지 넣은 실제 검사 (문 통과 한도·마석 등)
        if (!p.ok) return { ok: false, why: p.why || '지금은 지을 수 없어요' };
        return { ok: true, p: p };
      }

      // ----- 그리기 -----
      function zonesNow() {
        var zs = {};
        Object.keys(RUN.site.zones).forEach(function (z) { zs[z] = RUN.site.zones[z]; });
        order.forEach(function (z) { zs[z] = pend[z].k; });
        return zs;
      }
      function drawHeader() {
        hudCtx.pending = !!(order.length || movedTotal());
        api.hudRefresh(hdrBox);
      }
      function liftEdge() { return drag && drag.kind === 'door' && drag.started ? drag.edge : null; }
      function drawBoard() {
        var zs = zonesNow(), pm = {}, pp = {}, dbg = debugData(zs, pdoors);
        order.forEach(function (z) { pm[z] = pend[z].k; });
        P.powerInfo().parts.forEach(function (p) { pp[p.z] = p; });
        morphHtml(shaft, api.shaftHtml(function (n, locked, text) {
          return boardHtml({ zones: zs, units: RUN.site.units, doors: pdoors, pendDoors: movedSet(n), grab: !locked && floorEditable(n), selDoor: armedDoor ? armedDoor.edge : null,
            liftDoor: liftEdge(), counts: dbg && dbg.counts, routes: dbg && dbg.routes, iso: isoRooms, pp: pp, pend: pm, floor: n, noYard: true, locked: locked, lockText: text });
        }));
        api.bindShaft(shaft);
        api.tutZones().forEach(function (z) {
          shaft.querySelectorAll('.zc[data-z="' + z + '"]').forEach(function (c) { c.classList.add('tut-hl'); });
        });
        if (armed) markDrops(armed);
        if (armedDoor || (drag && drag.kind === 'door' && drag.started)) markDoorSlots(armedDoor ? armedDoor.floor : drag.floor);
      }
      function toolKeys() {
        return TOOL_ORDER.filter(function (k) {
          return Z.ALL.some(function (z) { return z !== 'Y' && Z.floorOpen(Z.floorOf(z)) && Z.facFor(z).indexOf(k) >= 0; });
        });
      }
      function drawTools() {
        var left = P.budgetLeft() - pendSpent();
        toolsBox.innerHTML = toolKeys().map(function (k) {
          var f = Z.FAC[k], per = f.perCell !== undefined ? f.perCell : f.cost, poor = per > left;
          return '<div class="tool k-' + f.kind + (armed === k ? ' on' : '') + (poor ? ' poor' : '') + (api.tutActive('zones') && k === 'den' ? ' tut-hl' : '') + '" data-tool="' + k + '" role="button" tabindex="0" aria-label="' +
            TOOL_LABEL[k] + ' (끌어서 빈 구역에 놓기)"><b>' + TOOL_LABEL[k] + '</b><small>마석 ' + (f.perCell !== undefined ? '칸당 ' : '') + per + '</small></div>';
        }).join('');
      }
      // 문 한 줄: 층마다 문 수 (P.doorInfo) · 분대 하나가 한 층에서 지나는 문 한도 · 지금 배치에서 가장 많이 지나는 수
      function drawDoorLine() {
        var parts = [], limit = 0, why = '', top = 0, i;
        for (i = 1; i <= RUN.site.floorsOpen; i++) {
          var di = P.doorInfo(i);
          if (!di) continue;
          parts.push((RUN.site.floorsOpen > 1 ? i + '층 ' : '') + '문 ' + di.count + '개'); limit = di.limit; if (!di.canEdit) why = di.why;
        }
        try { top = Z.passInfo(zonesNow(), flatOf(pdoors)).maxPass; } catch (e) { top = 0; }
        morphHtml(doorBox, '<div><b>🚪 ' + esc(parts.join(' · ')) + '</b> · 분대 문 통과 최대 <b class="' + (limit && top > limit ? 'bad' : '') + '">' + top + '/' + limit + '</b>회' + (why ? ' · ' + esc(why) : '') + '</div>');
      }
      function drawSum() {
        var left = P.budgetLeft(), h, nd = movedTotal();
        if (drag && drag.started && drag.note) {   // 끄는 동안: 손가락이 가리킨 곳 안내 · 거절 이유 (손가락에 안 가리는 아래 줄)
          morphHtml(sumBox, '<div class="note ' + (drag.note.bad ? 'bad' : drag.note.ok ? 'ok' : '') + '">' + esc(drag.note.text) + '</div>');
          sumBox.classList.add('note');
          return;
        }
        sumBox.classList.remove('note');
        if (!order.length && !nd) {
          h = armed ? '<b>' + TOOL_LABEL[armed] + '</b>을(를) 골랐어요 · 놓을 빈 구역을 누르세요 (마석 ' + money(left) + ')'
            : armedDoor ? '문을 골랐어요 · 옮길 빈 벽(점선)을 누르세요'
            : '시설은 빈 구역에, 노란 문은 다른 벽으로 끌어 놓으세요 (마석 ' + money(left) + ')';
        } else {
          var c = cur || { cost: 0, valueAfter: 0, valueNow: 0, powerAfter: 0, powerNow: 0, gift: 0 }, ps = [];
          if (order.length) ps.push('미확정 시설 ' + order.length + '곳');
          if (nd) ps.push('문 ' + nd + '개 옮김');
          if (order.length) ps.push('마석 <b class="mas">' + money(left) + ' → ' + money(left - c.cost) + '</b>');
          if (order.length) ps.push('가치 ' + sign(c.valueAfter - c.valueNow));
          ps.push('전투력 ' + sign(c.powerAfter - c.powerNow));
          if (c.gift) ps.push('부대 +' + c.gift);
          if (c.upLost && c.upLost.length) ps.push('강화 사라짐 <b>' + c.upLost.length + '곳</b>' + (c.refund ? ' · 환급 <b class="mas">+' + money(c.refund) + '</b>' : ''));   // 시설 교체·철거로 사라질 강화와 돌려받는 강화 마석
          h = ps.join(' · ');
        }
        morphHtml(sumBox, '<div>' + h + '</div>');
        var any = order.length || nd;
        okBtn.setAttribute('aria-disabled', any ? 'false' : 'true');
        okBtn.classList.toggle('off', !any);
        okBtn.textContent = '건설 확정' + (any && cur && cur.cost ? ' · 마석 ' + cur.cost : '');
      }
      function redraw() { drawHeader(); drawBoard(); drawTools(); drawDoorLine(); drawSum(); }

      // ----- 시설 놓기·빼기·확정 -----
      function place(z, k) {
        var r = canPlace(z, k, false);
        if (!r.ok) { api.toast(r.why); api.buzz('warn'); return false; }
        if (!pend[z]) order.push(z);
        pend[z] = { k: k };
        cur = r.p;
        api.buzz('tap');
        api.tutDone('zones');   // 첫 칸을 놓았으면 끌기 안내는 끝 -> [건설] 안내
        if (RUN.site.builds === 0) api.tutStart('place', { target: '#view [data-confirm]' });
        redraw();
        return true;
      }
      // 미확정 시설을 다른 칸으로 옮기기 (다시 끌기). 못 놓으면 원래 자리로 되돌린다
      function movePend(from, to) {
        if (!pend[from] || from === to) return;
        if (pend[to]) { api.toast('이미 미확정으로 놓은 칸이에요'); api.buzz('warn'); return; }
        var keep = pend[from], idx = order.indexOf(from);
        delete pend[from]; order.splice(idx, 1);
        if (!place(to, keep.k)) { pend[from] = keep; order.splice(idx, 0, from); refreshCur(); redraw(); }
      }
      function unplace(z) {
        if (!pend[z]) return;
        delete pend[z]; order.splice(order.indexOf(z), 1);
        refreshCur();
        api.buzz('tap'); redraw();
      }
      // 완공 표시 (이펙트 자리만: 꾸밈은 폴리싱 때). 그 구역 칸이 잠깐 반짝인다
      function buildFx(zs) {
        zs.forEach(function (z) { shaft.querySelectorAll('.zc[data-z="' + z + '"]').forEach(function (c) { c.classList.add('built'); }); });
        timers.push(setTimeout(function () { shaft.querySelectorAll('.zc.built').forEach(function (c) { c.classList.remove('built'); }); }, 1100));
      }
      // 확정 = P.commitLayout 한 번 (진행 중 일반 판은 progress.js가 버림 -> 현장에 돌아가면 새 배치로 새 판). 성공하면 true
      function commitNow() {
        if (!order.length && !movedTotal()) { api.toast('먼저 시설을 놓거나 문을 옮겨 주세요'); api.buzz('warn'); return false; }
        var made = order.slice(), r = P.commitLayout({ doors: changedDoors(), builds: buildsMap() });
        if (!r.ok) { api.toast(r.msg); api.buzz('warn'); return false; }
        pend = {}; order = []; armed = null; armedDoor = null; cur = null; isoRooms = null;
        orig = copyDoors(Z.doors()); pdoors = copyDoors(orig);
        api.buzz('good');
        api.toast(r.msg);
        api.stageToast((r.stages || []).filter(function (n, i, a) { return a.indexOf(n) === i; }));
        redraw();
        buildFx(made);
        if (made.length) { api.tutDone('place'); if (RUN.site.builds > 0) api.tutStart('tohome', { target: '#tabs [data-go="company"]' }); }
        return true;
      }
      // [건설 확정] / [취소] -> 원래 운영 또는 보스 결과로 복귀 (현장 탭이 상태를 보고 정함). 취소는 이번 수정만 버리고 비용을 쓰지 않는다
      okBtn.addEventListener('click', function () { if (commitNow()) api.go('field', false); });
      endBtn.addEventListener('click', function () {
        var nd = movedTotal();
        if (order.length || nd) api.toast('미확정을 버렸어요 (' + [order.length ? '시설 ' + order.length + '곳' : '', nd ? '문 ' + nd + '개' : ''].filter(Boolean).join(' · ') + ')');
        api.buzz('tap'); api.go('field', false);
      });
      // 미확정이 있는데 탭·설정으로 나가려 하면 확정·버리기·계속 수정을 먼저 묻는다 (shell.js가 누름마다 이 함수를 부름. 막았으면 true)
      var leaveAsk = null;
      api.setGuard(function (dest, proceed) {
        if (drag || !(order.length || movedTotal())) return false;
        if (leaveAsk) return true;
        var nd = movedTotal();
        leaveAsk = api.div('popbg', '<div class="pop" role="dialog" aria-label="미확정 배치"><h3 class="pophead">미확정 배치가 있어요</h3>' +
          '<div class="small-text dim">' + [order.length ? '시설 ' + order.length + '곳' : '', nd ? '문 ' + nd + '개 옮김' : ''].filter(Boolean).join(' · ') + '을 확정할까요?</div>' +
          '<button class="btn primary" type="button" data-pk="ok">건설 확정하고 이동</button><button class="btn" type="button" data-pk="drop">버리고 이동</button><button class="btn" type="button" data-pk="stay">계속 수정</button></div>');
        leaveAsk.addEventListener('click', function (e) {
          var t = e.target.closest ? e.target.closest('[data-pk]') : null;
          if (!t && e.target !== leaveAsk) return;
          var k = t ? t.getAttribute('data-pk') : 'stay';
          if (leaveAsk.parentNode) leaveAsk.parentNode.removeChild(leaveAsk);
          leaveAsk = null;
          if (k === 'ok') { if (commitNow()) proceed(); }
          else if (k === 'drop') proceed();
        });
        document.body.appendChild(leaveAsk);
        return true;
      });

      // ----- 문 옮기기 -----
      function flashIso(list) {
        if (!list || !list.length) return;
        isoRooms = setOf(list);
        drawBoard();
        timers.push(setTimeout(function () { isoRooms = null; drawBoard(); }, 1800));
      }
      // n층의 from 문을 to 벽으로. 검사에 걸리면 이유 토스트 + 끊긴 방 빗금, 문은 그대로
      function moveDoorTo(n, from, to) {
        var list = (pdoors[n] || []).map(function (id) { return id === from ? to : id; }), ex = {};
        ex[n] = list;
        var p = layout(null, ex);
        if (!p.ok) { api.toast(p.why || '그 벽에는 놓을 수 없어요'); api.buzz('warn'); armedDoor = null; refreshCur(); redraw(); flashIso(p.isolated); return false; }
        pdoors[n] = list; cur = p; armedDoor = null;
        api.buzz('tap');
        redraw();
        return true;
      }
      function markDoorSlots(n) {
        shaft.classList.add('doordrag');
        shaft.querySelectorAll('.zslots').forEach(function (s) { s.innerHTML = (+s.getAttribute('data-floor') === n) ? slotsInner(n, pdoors[n]) : ''; });
      }
      // n층 선·문 표시만 다시 그림 (끄는 동안 후보 배치를 미리 보여 줄 때. 판 전체를 다시 그리지 않음)
      function redrawLines(n, list, pendSet) {
        var wrap = shaft.querySelector('.zwrap[data-floor="' + n + '"]');
        if (!wrap) return;
        var dbg = debugData(zonesNow(), pdoors);
        wrap.querySelector('.zpipes').innerHTML = pipesInner(n, list, pendSet, dbg && dbg.routes);
        wrap.querySelector('.zdoors').innerHTML = doorsInner(n, list, { pend: pendSet, grab: true, counts: dbg && dbg.counts, sel: armedDoor ? armedDoor.edge : null, lift: liftEdge() });
      }
      // 점 (x, y) 가까이에 있는 빈 벽 칸. 반지름 = 칸 작은 쪽의 mul 배 (화면 픽셀)
      function slotAt(x, y, n, mul) {
        var wrap = shaft.querySelector('.zwrap[data-floor="' + n + '"]');
        if (!wrap) return null;
        var wr = wrap.getBoundingClientRect(), g = Z.grid(n), R = Math.min(wr.width / g.cols, wr.height / g.rows) * (mul || 0.55), best = null, bd = R;
        wrap.querySelectorAll('.zslot').forEach(function (s) {
          var r = s.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
          if (d < bd) { bd = d; best = s.getAttribute('data-edge'); }
        });
        return best;
      }
      function setHotEdge(id) {
        if (!drag || drag.hotEdge === id) return;
        shaft.querySelectorAll('.zslot.hot').forEach(function (s) { s.classList.remove('hot', 'bad'); });
        drag.hotEdge = id; drag.hotP = null;
        var n = drag.floor;
        if (!id) {
          drag.ghost.classList.remove('bad', 'v');
          setNote('문을 놓을 점선 벽으로 끌어 주세요', false, false);
          isoRooms = null;
          redrawLines(n, pdoors[n], movedSet(n));
          shaft.querySelectorAll('.zc.iso').forEach(function (c) { c.classList.remove('iso'); });
          return;
        }
        var list = (pdoors[n] || []).map(function (e) { return e === drag.edge ? id : e; }), ex = {};
        ex[n] = list;
        var p = layout(null, ex);
        drag.hotP = p;
        var slot = shaft.querySelector('.zslot[data-edge="' + id + '"]');
        if (slot) slot.classList.add('hot', p.ok ? 'ok' : 'bad');
        drag.ghost.classList.toggle('bad', !p.ok);
        drag.ghost.classList.toggle('v', !!(slot && slot.classList.contains('v')));
        setNote(p.ok ? '🚪 여기에 놓으면 문이 옮겨져요 (손을 떼면 놓임)' : (p.why || '여기에는 놓을 수 없어요'), p.ok, !p.ok);
        redrawLines(n, list, movedSet(n, list));
        shaft.querySelectorAll('.zc.iso').forEach(function (c) { c.classList.remove('iso'); });
        if (!p.ok && p.isolated) p.isolated.forEach(function (z) { shaft.querySelectorAll('.zc[data-z="' + z + '"]').forEach(function (c) { c.classList.add('iso'); }); });
      }

      // ----- 놓을 수 있는 칸 밝히기 (시설) -----
      function dropMap(k) {
        var m = {};
        Z.ALL.forEach(function (z) { if (z !== 'Y' && !m.hasOwnProperty(z)) m[z] = canPlace(z, k, true).ok; });
        return m;
      }
      var marks = null;   // { 방: 놓을 수 있나 } 끄는 동안·시설을 골라 둔 동안만
      function markDrops(k) {
        marks = dropMap(k);
        shaft.classList.add('droping');
        shaft.querySelectorAll('.zc[data-z]').forEach(function (c) { c.classList.toggle('drop', !!marks[c.getAttribute('data-z')]); });
      }
      function clearMarks() {
        marks = null;
        shaft.classList.remove('droping', 'doordrag');
        shaft.querySelectorAll('.zc.drop, .zc.hot').forEach(function (c) { c.classList.remove('drop', 'hot', 'bad'); });
        shaft.querySelectorAll('.zslots').forEach(function (s) { s.innerHTML = ''; });
      }
      function setHot(z) {
        if (drag.hot === z) return;
        if (drag.hot) shaft.querySelectorAll('.zc[data-z="' + drag.hot + '"]').forEach(function (c) { c.classList.remove('hot', 'bad'); });
        drag.hot = z;
        var okHere = !!(z && marks && marks[z]), why = '';
        if (okHere && drag.kind === 'tool') { var r = canPlace(z, drag.k, false); if (!r.ok) { okHere = false; why = r.why; } }   // 문 통과 한도 같은 전체 검사까지 (끌기 시작이 아닌 칸을 바꿀 때만)
        else if (z && !okHere) why = canPlace(z, drag.k, true).why || '여기에는 지을 수 없어요';
        if (z) shaft.querySelectorAll('.zc[data-z="' + z + '"]').forEach(function (c) { c.classList.add('hot'); c.classList.toggle('bad', !okHere); });
        drag.ghost.classList.toggle('bad', !!z && !okHere);
        setNote(!z ? '놓을 밝은 칸으로 끌어 주세요' : okHere ? TOOL_LABEL[drag.k] + ' → ' + (Z.NAMES[z] || z) + ' (마석 ' + P.buildCost(drag.k, z) + ') · 손을 떼면 놓임' : why, okHere, !!z && !okHere);
      }
      // 끄는 동안 합계 줄에 보일 안내 (손가락에 안 가리는 아래 도구 영역)
      function setNote(text, ok, bad) {
        if (!drag) return;
        drag.note = { text: text, ok: ok, bad: bad };
        drawSum();
      }

      // ----- 끌기 (터치·마우스 모두 포인터 이벤트) -----
      function cellAt(x, y) {
        var list = document.elementsFromPoint(x, y), i, c;
        for (i = 0; i < list.length; i++) { c = list[i].closest ? list[i].closest('.zc[data-z]') : null; if (c && shaft.contains(c)) return c.getAttribute('data-z'); }
        return null;
      }
      function ghostMove() {
        drag.ghost.style.left = drag.x + 'px';
        drag.ghost.style.top = drag.y + 'px';
        if (drag.kind === 'door') setHotEdge(slotAt(drag.x, drag.y, drag.floor, 0.62));   // 판정점 = 손·커서 끝
        else setHot(cellAt(drag.x, drag.y));
      }
      function tick() {   // 판 위·아래 끝에 가까우면 단면을 스크롤 (층이 많을 때)
        if (!drag || !drag.started) return;
        var r = scroll.getBoundingClientRect(), ty = drag.y;
        // 그림이 판 가운데쯤에 한 번 들어온 뒤에만, 위·아래 끝에 닿으면 스크롤 (시설 띠에서 막 끌어 올릴 때 저절로 밀리지 않게)
        if (ty > r.top + 36 && ty < r.bottom - 36) drag.inside = true;
        else if (drag.inside && ty >= r.top && ty < r.top + 36) scroll.scrollTop -= 10;
        else if (drag.inside && ty <= r.bottom && ty > r.bottom - 36) scroll.scrollTop += 10;
        ghostMove();
        drag.raf = requestAnimationFrame(tick);
      }
      function startDrag() {
        drag.started = true;
        sumBox.style.minHeight = sumBox.offsetHeight + 'px';   // 안내 글로 바뀌어도 아래 도구 영역·판 높이가 안 움직이게 (끝나면 풀림)
        drag.note = { text: drag.kind === 'door' ? '문을 놓을 점선 벽으로 끌어 주세요' : '놓을 밝은 칸으로 끌어 주세요', ok: false, bad: false };
        armed = null; armedDoor = null;
        toolsBox.querySelectorAll('.tool.on').forEach(function (c) { c.classList.remove('on'); });
        if (drag.node && drag.kind !== 'door') drag.node.classList.add('lifted');
        var g;
        if (drag.kind === 'door') {
          g = api.div('dragghost door', '');
          document.body.appendChild(g);
          drag.ghost = g;
          clearMarks();
          markDoorSlots(drag.floor);
          redrawLines(drag.floor, pdoors[drag.floor], movedSet(drag.floor));
        } else {
          g = api.div('dragghost k-' + Z.FAC[drag.k].kind, '<b>' + TOOL_LABEL[drag.k].charAt(0) + '</b>');   // 작은 아이콘 (이름 첫 글자)
          document.body.appendChild(g);
          drag.ghost = g;
          markDrops(drag.k);
        }
        drawSum();
        api.buzz('tap');
        drag.raf = requestAnimationFrame(tick);
      }
      function endDrag() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        if (drag && drag.raf) cancelAnimationFrame(drag.raf);
        if (drag && drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
        if (drag && drag.node) drag.node.classList.remove('lifted');
        sumBox.style.minHeight = '';
        moving = null;
        clearMarks();
      }
      function onMove(e) {
        if (!drag || e.pointerId !== drag.pid) return;
        drag.x = e.clientX; drag.y = e.clientY;
        if (!drag.started && Math.abs(drag.x - drag.sx) + Math.abs(drag.y - drag.sy) > 8) startDrag();
        if (drag.started) ghostMove();
      }
      function onUp(e) {
        if (!drag || e.pointerId !== drag.pid) return;
        var d = drag;
        d.x = e.clientX; d.y = e.clientY;
        if (d.kind === 'door') {
          var to = d.started ? slotAt(d.x, d.y, d.floor, 0.62) : null;
          endDrag(); drag = null;
          if (!d.started) {   // 그냥 누름 = 문 고르기 / 고른 것 풀기 (이어서 빈 벽을 누르면 옮김)
            armed = null;
            armedDoor = armedDoor && armedDoor.edge === d.edge ? null : { edge: d.edge, floor: d.floor };
            api.buzz('tap');
            drawBoard(); drawTools(); drawSum();
            if (!armedDoor) clearMarks();
            return;
          }
          if (to && to !== d.edge) moveDoorTo(d.floor, d.edge, to);
          else {
            if (!to) api.toast('문은 점선으로 보이는 빈 벽에 놓아 주세요');
            refreshCur(); redraw();
          }
          return;
        }
        var z = d.started ? cellAt(d.x, d.y) : null;
        endDrag(); drag = null;
        if (d.from && !d.started) return;   // 미확정 칸을 그냥 누름 = 아래 click 이 안내
        if (!d.started) {   // 그냥 누름 = 시설 고르기 / 고른 것 풀기 (이어서 칸을 누르면 놓음)
          armed = armed === d.k ? null : d.k; armedDoor = null;
          api.buzz('tap');
          drawBoard(); drawTools(); drawSum();
          if (armed) markDrops(armed); else clearMarks();
          return;
        }
        if (d.from) { if (z && z !== d.from) movePend(d.from, z); else drawSum(); return; }
        if (z) place(z, d.k);
        else drawSum();
      }
      function onCancel(e) {
        if (!drag || e.pointerId !== drag.pid) return;
        var wasDoor = drag.kind === 'door';
        endDrag(); drag = null;
        if (wasDoor) redraw(); else drawSum();
      }
      function listen() {
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
      }
      toolsBox.addEventListener('pointerdown', function (e) {
        var t = e.target.closest ? e.target.closest('[data-tool]') : null;
        if (!t || drag) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        drag = { kind: 'tool', k: t.getAttribute('data-tool'), pid: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY,
          started: false, ghost: null, hot: null, node: t, raf: 0 };
        listen();
      });

      // 판 위에서 시작하는 끌기: 문 표시 = 문 옮기기 / 미확정 칸 = 시설 다시 끌기 (그냥 누르면 아래 click 이 안내)
      shaft.addEventListener('pointerdown', function (e) {
        if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (e.target.closest && e.target.closest('[data-unpend]')) return;
        var dt = e.target.closest ? e.target.closest('.zdoor.grab') : null;
        if (dt) {
          drag = { kind: 'door', edge: dt.getAttribute('data-edge'), floor: +dt.getAttribute('data-floor'), pid: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY,
            started: false, ghost: null, hotEdge: null, hotP: null, node: null, raf: 0 };
          listen();
          return;
        }
        var c = e.target.closest ? e.target.closest('.zc.pend[data-z]') : null;
        if (!c) return;
        var z = c.getAttribute('data-z');
        if (!pend[z]) return;
        moving = z;
        drag = { kind: 'pend', k: pend[z].k, from: z, pid: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY,
          started: false, ghost: null, hot: null, node: c, raf: 0 };
        listen();
      });

      // ----- 판 누르기: × 빼기 / 고른 시설 놓기 / 고른 문 옮기기 / 안내 -----
      shaft.addEventListener('click', function (e) {
        var x = e.target.closest ? e.target.closest('[data-unpend]') : null;
        if (x) { unplace(x.getAttribute('data-unpend')); return; }
        if (e.target.closest && e.target.closest('.zdoor')) {   // 문 고르기는 pointerup 에서 이미 처리 (끌기와 같은 길)
          var dd = e.target.closest('.zdoor');
          if (dd.classList.contains('pend')) api.toast('옮긴 문이에요 (미확정). 다시 끌어서 옮길 수 있어요');
          return;
        }
        var lk = e.target.closest ? e.target.closest('.zlock') : null;
        if (lk) { api.toast('🔒 ' + (lk.querySelector('span') || lk).textContent); api.buzz('warn'); return; }
        if (armedDoor) {   // 누르기 -> 벽 누르기 (끌기 대신)
          var s = slotAt(e.clientX, e.clientY, armedDoor.floor, 0.75);
          if (s) moveDoorTo(armedDoor.floor, armedDoor.edge, s);
          else { api.toast('문을 놓을 빈 벽(점선)을 눌러 주세요'); api.buzz('warn'); }
          return;
        }
        var c = e.target.closest ? e.target.closest('.zc[data-z]') : null;
        if (!c) return;
        var z = c.getAttribute('data-z');
        if (armed) { place(z, armed); return; }
        api.toast(pend[z] ? (Z.NAMES[z] || z) + ': 미확정이에요. 끌어서 옮기거나 × 로 뺄 수 있어요' : zoneInfo(z)); api.buzz('tap');
      });
      shaft.addEventListener('keydown', function (e) {   // 문 표시에서 Enter·Space = 문 고르기 (그다음 빈 벽 칸을 눌러 옮김)
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var dt = e.target.closest ? e.target.closest('.zdoor.grab') : null;
        if (!dt) return;
        e.preventDefault();
        var id = dt.getAttribute('data-edge'), n = +dt.getAttribute('data-floor');
        armed = null;
        armedDoor = armedDoor && armedDoor.edge === id ? null : { edge: id, floor: n };
        drawBoard(); drawTools(); drawSum();
        if (!armedDoor) clearMarks();
      });

      api.onLeave(function () {
        if (leaveAsk && leaveAsk.parentNode) leaveAsk.parentNode.removeChild(leaveAsk);
        if (drag) { endDrag(); drag = null; }
        timers.forEach(clearTimeout);
      });

      if (q && RUN.site.builds === 0) api.tutStart('zones', { keep: true });   // 첫 건설 전 안내 (추천 칸 강조는 drawBoard 가 api.tutZones 로, 대기실 띠는 drawTools 가)
      redraw();
      // 튜토리얼 강조 칸이 화면 아래에 잘려 있으면 보이는 곳까지 단면을 내려 준다 (화면이 붙은 뒤에 재야 해서 한 프레임 뒤)
      requestAnimationFrame(function () {
        var low = 0, sr = scroll.getBoundingClientRect();
        shaft.querySelectorAll('.zc.tut-hl').forEach(function (c) { low = Math.max(low, c.getBoundingClientRect().bottom); });
        if (low > sr.bottom) scroll.scrollTop += low - sr.bottom + 14;
        if (api.tutPlace) api.tutPlace();   // 말풍선이 강조 칸·[건설]·도구를 가리면 위 자리로
      });
    };
  };
})();
