/* D1 건설 화면 = 건설 모드 (4차): 층별 구역 판 + 아래 시설 띠에서 끌어서 빈 구역에 올려놓기. 부대 출진은 shell.js의 출진 화면
 *
 * 구조 (shell.js의 SCREEN_PLUGINS 방식, battle.js와 같음)
 *  - 규칙은 zones.js(판·시설·이동), 상태와 바꾸는 함수는 progress.js (API.md: previewBuild·buildZone·powerInfo·floorInfo). 여기는 보여 주고 누름만 받는다.
 *  - 흐름: 시설 띠(함정·대기실·미끼, 입구 대기)에서 시설을 끌어 빈 구역에 놓는다 (눌러 고른 뒤 칸을 눌러도 됨). 놓을 수 있는 칸만 끄는 동안 밝게.
 *    놓은 것은 "미확정"(점선·반투명·× 빼기, 여러 곳 가능). 아래 한 줄 합계(미확정 n곳 · 마석 a → b · 가치 · 전투력 · 대기실이면 부대 +1).
 *    [건설] = 미확정을 차례로 P.buildZone 으로 확정 + 완공 표시(이펙트 자리만) / [끝내기] = 미확정 버리고 나감. 탭을 옮겨도 버림.
 *    끄는 그림은 터치에서는 손가락보다 위(LIFT)에 띄운다 (손가락에 안 가림). 이미 지은 구역 위에 놓기(교체)는 데모에서 막음(토스트).
 *  - 층: 지하 단면 전체를 세로로 이어 그린다 (층이 늘면 단면만 스크롤). 잠긴 층은 어둡게 + 🔒 + 열림 조건. 층이 열리면 1층 맨 아래는 계단, 보물방은 2층 맨 아래.
 *  - 돈: 건설·부대 조달은 마석(회사 금 아님). 쓴 마석은 돌려받지 못한다. 마석 0이어도 다음 주는 진행된다.
 *  - 가치 = 지어 둔 시설 점수, 전투력 = 함정 점수 + 인계할 부대 점수를 침입자가 그 층 입구 기준으로 지나는 비율로 곱한 것 (API.md). 구역마다 전투력(powerInfo)을 판 위에 작게 보여 준다 (⚔).
 *  - 고정 구역(의뢰가 정함, 예: 얼어붙은 하역장)은 🔒로 보이고 못 짓고 못 바꾼다.
 *  - 문 위 숫자 = 침입자 20명이 오면 그 길로 지나갈 인원 (zones.js forecast).
 *  - 판 그리기(boardHtml)·의뢰 카드 조각(siteHtml·fixedHtml)은 shell.js·battle.js가 같이 쓴다 (window.ZONEVIEW).
 *    boardHtml({ floor: n }) = n층 한 장, boardHtml({ stack: true, rows }) = 열린 층을 위아래로 쌓은 판 (전투 화면, 층 사이 한 줄 = 계단)
 *  - 튜토리얼(첫 건설 전): 'zones' 단계 말풍선 + 추천 칸 하나(P.tutorialPath 첫 칸) + 대기실 띠를 반짝이게 한다 (api.tutStart·api.tutZones). 첫 칸을 놓으면 'place'([건설] 반짝), 확정하면 'tohome'([홈] 반짝).
 *  - 곡선·시간은 shell.css의 var(--dur-*)/var(--ease-*) (MOTION에서 깔림)만.
 */
(function () {
  'use strict';

  var Z = window.ZONES, P = window.PROGRESS, RUN = P.RUN, BD = window.BATTLE_DATA;
  // 판은 부지마다 다르다 (core 가 ZONES.useSite 로 바꿔 끼움). 판 값(MAP·NAMES·...)은 모듈 변수에 담지 말고 그릴 때마다 Z 에서 읽는다.
  function curZ() { Z = window.ZONES || Z; return Z; }
  function cols() { return Z.MAP[0].length; }
  // 칸 가로/세로 비율: 1층 판 전체 모양이 5x7 판(비율 1.25)과 비슷하게 유지되도록 칸 수에 맞춰 잡는다. 아래층은 1층과 같은 칸 모양
  function cellRatio(nc, nr) { return Math.round(25 * nr / (28 * nc) * 1000) / 1000; }

  function isStairs(z) { return !!(Z.isStairs && Z.isStairs(z)); }
  function cellKind(z, k) { return Z.zoneType(z) === 'boss' ? (isStairs(z) ? 'stairs' : 'boss') : (Z.FAC[k] || Z.FAC.empty).kind; }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function money(n) { return Number(n).toLocaleString('en-US'); }
  function fmtN(n) { return String(Math.round(Number(n) * 10) / 10); }
  function sign(n) { return (n >= 0 ? '+' : '') + fmtN(n); }

  // 구역 첫 칸에 쓸 글: 구역 이름 / 시설 / 한 줄 정보 / (있으면) 구역 전투력 ⚔ / (미확정이면) 미확정 글 + × 빼기
  function labelHtml(z, k, units, pp, pend) {
    var f = Z.FAC[k] || Z.FAC.empty, us = units[z] || [], h;
    if (Z.zoneType(z) === 'boss') {   // 층 맨 아래: 계단(아래층이 열렸을 때) 또는 보물방
      return isStairs(z) ? '<div class="fn">계단 ▼</div><div class="zi">' + (Z.floorOf(z) + 1) + '층으로</div>' : '<div class="fn">💰 보물방</div><div class="zi">지킬 곳</div>';
    }
    h = '<div class="zn">' + (Z.NAMES[z] || z) + '</div>';
    if (f.kind === 'fixed') h += '<div class="fn">🔒 ' + f.short + '</div><div class="zi">고정 구역</div>';
    else {
      h += '<div class="fn">' + f.short + '</div>';
      if (f.kind === 'den') {
        var sl = Z.slotsOf(k, z);
        h += '<div class="zi' + (us.length ? '' : ' warn') + '">' + us.length + '/' + sl + '</div>';
      } else if (f.kind === 'trap') h += '<div class="zi">피해 ' + Z.trapDmgOf(z) + '</div>';
    }
    if (pp && pp[z] && pp[z].power > 0) h += '<div class="zp">⚔ ' + fmtN(pp[z].power) + '</div>';
    if (pend && pend[z]) h += '<div class="ptag">미확정</div><button class="pendx" type="button" data-unpend="' + z + '" aria-label="' + (Z.NAMES[z] || z) + ' 빼기">×</button>';
    return h;
  }

  // 판 전체 HTML. o = { zones, units, flow(없으면 문 숫자 안 보임), sel(눌린 구역), pv(미리보기 중인 구역), pp(구역별 전투력 { 구역: { power } }),
  //   pend(미확정으로 놓은 구역 { 구역: 시설 }: 점선·반투명·"미확정"·× 빼기, 건설 모드), noYard(야외·계단 띠 안 그림, 현장 단면용),
  //   floor(n층 한 장, 기본 1), stack(true면 열린 층을 위아래로 쌓음) · rows(쌓을 때 줄 수, 없으면 전부), locked · lockText(잠긴 층: 어둡게 + 🔒 글) }
  function boardHtml(o) {
    curZ();
    var zones = o.zones, units = o.units || {}, flow = o.flow || null, seen = {}, nc = cols(), fn = o.floor || 1;
    var map, off = 0, pairs, fi = Z.floorInfo ? Z.floorInfo(fn) : null;
    if (o.stack && Z.stackMap) { var st = Z.stackMap(); map = o.rows ? st.slice(0, o.rows) : st; pairs = Z.flowPairs('all'); }
    else if (fi) { map = fi.MAP; off = fi.rowOff; pairs = Z.flowPairs(fn); }
    else { map = Z.MAP; pairs = Z.flowPairs(); }
    function zcls(z) { return (o.sel === z ? ' sel' : '') + (o.pv === z ? ' pv' : '') + (o.pend && o.pend[z] ? ' pend' : ''); }
    var h = '';
    if (!o.noYard) {
      if (o.stack || fn === 1) h = '<div class="zyard' + zcls('Y') + '" data-z="Y">야외 · 집결지 — <b>' + (Z.FAC[zones.Y] || Z.FAC.forest).name + '</b></div>';
      else h = '<div class="zyard stair">▲ ' + (fn - 1) + '층 계단에서 내려와요</div>';
    }
    var ratio = (o.stack || fn > 1) ? 1.25 : cellRatio(nc, map.length);
    h += '<div class="zwrap' + (o.locked ? ' locked' : '') + (o.noYard ? ' flat' : '') + '"><div class="zgrid" style="grid-template-columns:repeat(' + nc + ',minmax(0,1fr));--za:' + ratio + '">';
    for (var r = 0; r < map.length; r++) for (var c = 0; c < nc; c++) {
      var z = map[r][c];
      if (z === null || z === undefined) { h += '<div class="zc gap">' + (c === (nc >> 1) ? '▼ 계단' : '') + '</div>'; continue; }
      var k = zones[z] || 'empty', first = !seen[z];
      seen[z] = true;
      var edge = [[-1, 0, 'top'], [1, 0, 'bottom'], [0, -1, 'left'], [0, 1, 'right']].map(function (d) {
        var nb = map[r + d[0]] && map[r + d[0]][c + d[1]];
        return nb === z ? 'border-' + d[2] + '-color:transparent;' : '';
      }).join('');
      h += '<div class="zc k-' + cellKind(z, k) + zcls(z) + '" data-z="' + z + '" style="' + edge + '">' + (first ? labelHtml(z, k, units, o.pp, o.pend) : '') + '</div>';
    }
    h += '</div><div class="zdoors">';
    pairs.forEach(function (p) {
      var e = Z.sharedEdge(p[0], p[1]); if (!e) return;
      var x = ((e[0][1] + e[1][1]) / 2 + 0.5) / nc * 100, y = ((e[0][0] + e[1][0]) / 2 + 0.5 - off) / map.length * 100, hz = e[0][1] === e[1][1];
      var n = flow ? flow[p[0] + '>' + p[1]] || 0 : null;
      h += '<div class="zdoor ' + (hz ? 'h' : 'v') + (n === 0 ? ' unused' : '') + '" style="left:' + x + '%;top:' + y + '%">' + (n ? '<b>' + n + '</b>' : '') + '</div>';
    });
    h += '</div>';
    if (o.locked) h += '<div class="zlock"><b>🔒</b><span>' + esc(o.lockText || '아직 잠겨 있어요') + '</span></div>';
    return h + '</div>';
  }

  // ---------- 의뢰 카드·팝업 조각: 판 미리보기 · 고정 구역 ----------
  function boardOf(id) {
    curZ();
    if (!id || typeof Z.boardInfo !== 'function') return null;
    try { var b = Z.boardInfo(id); return b && Array.isArray(b.MAP) && b.MAP.length && Array.isArray(b.MAP[0]) ? b : null; } catch (e) { return null; }
  }
  // 판 모양 작은 미리보기: 구역마다 칸 색 (이웃한 구역은 다른 색), 입구 '입'·보스방(보물방) '보'. 구역 사이에만 선을 긋는다. 2층 구역 id('2E'·'2B')도 입구·보물방으로 본다
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
  // 고정 구역 목록 (의뢰 q.fixed = { 구역 id: 고정 구역 id }): "고정 | 가운데 2 — 얼어붙은 하역장 / 효과"
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
  window.ZONEVIEW = { boardHtml: boardHtml, cols: cols, boardOf: boardOf, siteHtml: siteHtml, fixedHtml: fixedHtml, miniHtml: miniHtml, floorMiniHtml: floorMiniHtml };

  // 구역 설명 한 줄 (시설을 안 든 채 구역을 누르면 토스트). 입구는 분기·대기 둘 다 지을 수 있다 (데모 DEMO_FACILITIES.entry)
  function zoneInfo(z) {
    var t = Z.zoneType(z), k = RUN.site.zones[z], f = Z.FAC[k] || {};
    var what = t === 'entry' ? '모든 침입자가 지나는 첫 관문이에요. 대기(전원 가운데 길로)를 지을 수 있어요'
      : t === 'boss' ? (isStairs(z) ? '위아래 층을 잇는 계단이에요' : '침입자가 여기까지 오면 약탈해요')
      : f.kind === 'fixed' ? '고정 구역이라 못 바꿔요'
      : k === 'empty' ? '빈 구역이에요. 시설을 끌어다 놓으세요' : f.name + ' — 이미 지었어요';
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
  // 흐름: 아래 시설 띠에서 시설을 끌어 빈 구역에 놓는다 (눌러서 고른 뒤 칸을 눌러도 된다) -> 놓은 것은 "미확정"(점선·반투명·× 빼기, 여러 곳 가능)
  //  -> 아래 한 줄 합계 -> [건설]을 누르면 미확정을 차례로 P.buildZone 으로 확정 (+ 완공 표시) / [끝내기]는 미확정을 버리고 나감.
  //  탭을 옮기거나 화면을 나가도 미확정은 버려진다 (이 화면 안에만 있는 값이라 저절로).
  // 값은 P.previewBuild / P.buildZone 으로만 읽고 바꾼다. 여러 곳 합계용 API가 없어 곳마다 previewBuild 의 증가분을 더한다
  //  (가치는 정확히 더해짐, 전투력은 근사: 서로 길을 바꾸는 미끼·대기실이 함께 놓이면 실제와 조금 다를 수 있다).
  var TOOL_LABEL = { trap: '함정', den: '대기실', lure: '미끼', wait: '입구 대기' };
  var TOOL_ORDER = ['trap', 'den', 'lure'];   // 입구 대기는 띠에서 뺌 (사용자 10-23)
  function josa(w) { var c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c >= 0 && c % 28 !== 0 ? '은' : '는'; }   // 받침 있으면 은, 없으면 는
  var LIFT = 64;   // 손가락(터치)보다 이만큼 위에 끄는 그림을 띄운다 (마우스는 0)

  window.SCREEN_PLUGINS = window.SCREEN_PLUGINS || {};
  window.SCREEN_PLUGINS.build = function (api) {
    return function (el) {
      curZ();
      var q = RUN.quest;
      var pend = {};        // 미확정 { 구역: { k: 시설, p: previewBuild 결과 } }
      var order = [];       // 놓은 순서 (확정도 이 순서대로)
      var armed = null;     // 눌러서 고른 시설 (칸을 누르면 놓음)
      var drag = null;      // 끌기 중 { k, pid, sx, sy, x, y, lift, started, ghost, hot, node, raf }
      var timers = [];
      el.classList.add('fixed', 'buildmode');

      var hdrBox = api.div('fhdr');
      var shaft = api.div('shaft');
      var scroll = api.div('fscroll');
      scroll.appendChild(shaft);
      var toolsBox = api.div('tools');
      var sumBox = api.div('bsumline');
      var endBtn = document.createElement('button');
      endBtn.className = 'bbtn'; endBtn.type = 'button'; endBtn.textContent = '끝내기'; endBtn.setAttribute('data-end', '');
      var okBtn = document.createElement('button');
      okBtn.className = 'bbtn main'; okBtn.type = 'button'; okBtn.textContent = '건설'; okBtn.setAttribute('data-confirm', '');
      var btns = api.div('bbtns');
      btns.appendChild(endBtn); btns.appendChild(okBtn);
      var dock = api.div('bdock');
      dock.appendChild(toolsBox); dock.appendChild(sumBox); dock.appendChild(btns);
      el.appendChild(hdrBox); el.appendChild(scroll); el.appendChild(dock);

      // ----- 놓을 수 있나 -----
      var moving = null;    // 미확정 시설을 다시 끄는 중이면 그 원래 구역 (값 계산에서 빼고 본다)
      function spentOthers(z) { var s = 0; order.forEach(function (o) { if (o !== z && o !== moving) s += pend[o].p.cost; }); return s; }
      function pendSpent() { return spentOthers(null); }
      function lockTextOf(n) {
        var fi = P.floorInfo(n);
        return '지하 ' + n + '층: ' + (fi && fi.lockAt ? '납품 기준 ' + fi.lockAt + '단계 달성 시 열림' : '이 의뢰에서는 열리지 않아요');
      }
      // z 구역에 시설 k를 놓을 수 있나. light = true면 previewBuild 를 안 부르고 비용만 본다 (끄는 동안 밝게 할 칸 고르기용)
      function canPlace(z, k, light) {
        var t = Z.zoneType(z), n = Z.floorOf(z), cur = RUN.site.zones[z], f = Z.FAC[k];
        if (z === 'Y' || t === 'yard') return { ok: false, why: '야외에는 데모에서 지을 수 있는 시설이 없어요' };
        if (!Z.floorOpen(n)) return { ok: false, why: '🔒 ' + lockTextOf(n) };
        if (RUN.site.fixed && RUN.site.fixed[z]) return { ok: false, why: '고정 구역이라 바꿀 수 없어요' };
        if (t === 'boss') return { ok: false, why: isStairs(z) ? '계단: 위아래 층을 이어요. 여기는 지을 수 없어요' : '보물방: 시설을 지을 수 없어요' };
        if (!pend[z] && (t === 'entry' ? cur !== 'split' : cur !== 'empty')) return { ok: false, why: '이미 지은 구역이에요. 데모에서는 바꾸거나 허물 수 없어요' };
        if (Z.facFor(z).indexOf(k) < 0) return { ok: false, why: t === 'entry' ? '입구에는 대기만 지을 수 있어요' : f && f.for === 'entry' ? TOOL_LABEL[k] + josa(TOOL_LABEL[k]) + ' 1층 입구 칸에만 지을 수 있어요' : TOOL_LABEL[k] + josa(TOOL_LABEL[k]) + ' 이 칸에 지을 수 없어요' };
        var p = null, cost;
        if (light) cost = P.buildCost(k, z);
        else {
          p = P.previewBuild(z, k);
          if (!p.ok && (p.cost === undefined || !/^마석/.test(p.why || ''))) return { ok: false, why: p.why || '지금은 지을 수 없어요' };
          cost = p.cost;
        }
        var need = spentOthers(z) + cost;
        if (need > P.budgetLeft()) return { ok: false, why: '마석이 모자라요 (필요 ' + need + ', 남은 ' + P.budgetLeft() + ')' };
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
        morphHtml(hdrBox, api.siteHeader(q).replace('</b><span class="fmas">', '</b><span class="chip accent">건설 모드</span><span class="fmas">'));
      }
      function drawBoard() {
        var zs = zonesNow(), pm = {}, pp = {}, flow = P.forecast(zs, RUN.site.units).flow;
        order.forEach(function (z) { pm[z] = pend[z].k; });
        P.powerInfo().parts.forEach(function (p) { pp[p.z] = p; });
        morphHtml(shaft, api.shaftHtml(function (n, locked, text) {
          return boardHtml({ zones: zs, units: RUN.site.units, flow: flow, pp: pp, pend: pm, floor: n, noYard: true, locked: locked, lockText: text });
        }));
        api.bindShaft(shaft);
        api.tutZones().forEach(function (z) {
          shaft.querySelectorAll('.zc[data-z="' + z + '"]').forEach(function (c) { c.classList.add('tut-hl'); });
        });
        if (armed) markDrops(armed);
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
      function totals() {
        var t = { n: order.length, cost: 0, dv: 0, dp: 0, gift: 0 };
        order.forEach(function (z) { var p = pend[z].p; t.cost += p.cost; t.dv += p.valueAfter - p.valueNow; t.dp += p.powerAfter - p.powerNow; t.gift += p.gift || 0; });
        return t;
      }
      function drawSum() {
        var t = totals(), left = P.budgetLeft(), h;
        if (!t.n) {
          h = armed ? '<b>' + TOOL_LABEL[armed] + '</b>을(를) 골랐어요 · 놓을 빈 구역을 누르세요 (마석 ' + money(left) + ')' : '시설을 끌어서 빈 구역에 놓으세요 (마석 ' + money(left) + ')';
        } else {
          h = '미확정 ' + t.n + '곳 · 마석 <b class="mas">' + money(left) + ' → ' + money(left - t.cost) + '</b> · 가치 ' + sign(t.dv) + ' · 전투력 ' + sign(t.dp) + (t.gift ? ' · 부대 +' + t.gift : '');
        }
        morphHtml(sumBox, '<div>' + h + '</div>');
        okBtn.setAttribute('aria-disabled', t.n ? 'false' : 'true');
        okBtn.classList.toggle('off', !t.n);
      }
      function redraw() { drawHeader(); drawBoard(); drawTools(); drawSum(); }

      // ----- 놓기·빼기·확정 -----
      function place(z, k) {
        var r = canPlace(z, k, false);
        if (!r.ok) { api.toast(r.why); api.buzz('warn'); return false; }
        if (!pend[z]) order.push(z);
        pend[z] = { k: k, p: r.p };
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
        if (!place(to, keep.k)) { pend[from] = keep; order.splice(idx, 0, from); redraw(); }
      }
      function unplace(z) {
        if (!pend[z]) return;
        delete pend[z]; order.splice(order.indexOf(z), 1);
        api.buzz('tap'); redraw();
      }
      // 완공 표시 (이펙트 자리만: 꾸밈은 폴리싱 때). 그 구역 칸이 잠깐 반짝인다
      function buildFx(zs) {
        zs.forEach(function (z) { shaft.querySelectorAll('.zc[data-z="' + z + '"]').forEach(function (c) { c.classList.add('built'); }); });
        timers.push(setTimeout(function () { shaft.querySelectorAll('.zc.built').forEach(function (c) { c.classList.remove('built'); }); }, 1100));
      }
      function confirmBuild() {
        if (!order.length) { api.toast('먼저 시설을 빈 구역에 놓아 주세요'); api.buzz('warn'); return; }
        var made = [], cost = 0, gifts = 0, stages = [], failed = '';
        order.slice().forEach(function (z) {
          if (failed) return;
          var d = pend[z], r = P.buildZone(z, d.k);
          if (!r.ok) { failed = r.msg; return; }
          made.push(z); cost += d.p.cost; gifts += r.gift || 0; stages = stages.concat(r.stages || []);
          delete pend[z]; order.splice(order.indexOf(z), 1);
        });
        if (made.length) {
          api.buzz('good');
          api.toast(made.length + '곳 완공 (마석 -' + cost + ')' + (gifts ? ' · 기본 부대 +' + gifts : ''));
          api.stageToast(stages.filter(function (n, i) { return stages.indexOf(n) === i; }));
          var pr = P.questProgress();
          if (pr && pr.complete) api.toast('의뢰 완료! 홈의 진행 띠에서 [납품하기]를 누르세요');
        }
        if (failed) { api.toast(failed); api.buzz('warn'); }
        armed = null;
        redraw();
        buildFx(made);
        if (made.length) { api.tutDone('place'); if (RUN.site.builds > 0) api.tutStart('tohome', { target: '#tabs [data-go="company"]' }); }
      }
      okBtn.addEventListener('click', confirmBuild);
      endBtn.addEventListener('click', function () {
        if (order.length) api.toast('미확정 ' + order.length + '곳은 버렸어요');
        api.buzz('tap'); api.go('field', false);
      });

      // ----- 놓을 수 있는 칸 밝히기 -----
      function dropMap(k) {
        var m = {};
        Z.ALL.forEach(function (z) { if (z !== 'Y' && !m.hasOwnProperty(z)) m[z] = canPlace(z, k, true).ok; });
        return m;
      }
      var marks = null;   // { 구역: 놓을 수 있나 } 끄는 동안·시설을 골라 둔 동안만
      function markDrops(k) {
        marks = dropMap(k);
        shaft.classList.add('droping');
        shaft.querySelectorAll('.zc[data-z]').forEach(function (c) { c.classList.toggle('drop', !!marks[c.getAttribute('data-z')]); });
      }
      function clearMarks() {
        marks = null;
        shaft.classList.remove('droping');
        shaft.querySelectorAll('.zc.drop, .zc.hot').forEach(function (c) { c.classList.remove('drop', 'hot'); });
      }
      function setHot(z) {
        if (drag.hot === z) return;
        if (drag.hot) shaft.querySelectorAll('.zc[data-z="' + drag.hot + '"]').forEach(function (c) { c.classList.remove('hot'); });
        drag.hot = z;
        var okHere = !!(z && marks && marks[z]);
        if (okHere) shaft.querySelectorAll('.zc[data-z="' + z + '"]').forEach(function (c) { c.classList.add('hot'); });
        drag.ghost.classList.toggle('bad', !!z && !okHere);
        drag.ghost.querySelector('small').textContent = okHere ? (Z.NAMES[z] || z) + ' · 마석 ' + P.buildCost(drag.k, z) : '';
      }

      // ----- 끌기 (터치·마우스 모두 포인터 이벤트) -----
      function cellAt(x, y) {
        var e = document.elementFromPoint(x, y), c = e && e.closest ? e.closest('.zc[data-z]') : null;
        return c && shaft.contains(c) ? c.getAttribute('data-z') : null;
      }
      function ghostMove() {
        drag.ghost.style.left = drag.x + 'px';
        drag.ghost.style.top = (drag.y - drag.lift) + 'px';
        setHot(cellAt(drag.x, drag.y - drag.lift));
      }
      function tick() {   // 판 위·아래 끝에 가까우면 단면을 스크롤 (층이 많을 때)
        if (!drag || !drag.started) return;
        var r = scroll.getBoundingClientRect(), ty = drag.y - drag.lift;
        // 그림이 판 가운데쯤에 한 번 들어온 뒤에만, 위·아래 끝에 닿으면 스크롤 (시설 띠에서 막 끌어 올릴 때 저절로 밀리지 않게)
        if (ty > r.top + 36 && ty < r.bottom - 36) drag.inside = true;
        else if (drag.inside && ty >= r.top && ty < r.top + 36) scroll.scrollTop -= 10;
        else if (drag.inside && ty <= r.bottom && ty > r.bottom - 36) scroll.scrollTop += 10;
        ghostMove();
        drag.raf = requestAnimationFrame(tick);
      }
      function startDrag() {
        drag.started = true;
        armed = null;
        toolsBox.querySelectorAll('.tool.on').forEach(function (c) { c.classList.remove('on'); });
        drag.node.classList.add('lifted');
        var g = api.div('dragghost k-' + Z.FAC[drag.k].kind, '<b>' + TOOL_LABEL[drag.k] + '</b><small></small>');
        document.body.appendChild(g);
        drag.ghost = g;
        markDrops(drag.k);
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
        var z = d.started ? cellAt(d.x, d.y - d.lift) : null;
        endDrag(); drag = null;
        if (d.from && !d.started) return;   // 미확정 칸을 그냥 누름 = 아래 click 이 안내
        if (!d.started) {   // 그냥 누름 = 시설 고르기 / 고른 것 풀기 (이어서 칸을 누르면 놓음)
          armed = armed === d.k ? null : d.k;
          api.buzz('tap');
          drawTools(); drawSum();
          if (armed) markDrops(armed); else clearMarks();
          return;
        }
        if (d.from) { if (z && z !== d.from) movePend(d.from, z); else drawSum(); return; }
        if (z) place(z, d.k);
        else drawSum();
      }
      function onCancel(e) {
        if (!drag || e.pointerId !== drag.pid) return;
        endDrag(); drag = null; drawSum();
      }
      toolsBox.addEventListener('pointerdown', function (e) {
        var t = e.target.closest ? e.target.closest('[data-tool]') : null;
        if (!t || drag) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        drag = { k: t.getAttribute('data-tool'), pid: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY,
          lift: e.pointerType === 'mouse' ? 0 : LIFT, started: false, ghost: null, hot: null, node: t, raf: 0 };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
      });

      // 미확정 칸을 잡아 다른 칸으로 다시 끌기 (그냥 누르면 아래 click 이 안내)
      shaft.addEventListener('pointerdown', function (e) {
        if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (e.target.closest && e.target.closest('[data-unpend]')) return;
        var c = e.target.closest ? e.target.closest('.zc.pend[data-z]') : null;
        if (!c) return;
        var z = c.getAttribute('data-z');
        if (!pend[z]) return;
        moving = z;
        drag = { k: pend[z].k, from: z, pid: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY,
          lift: e.pointerType === 'mouse' ? 0 : LIFT, started: false, ghost: null, hot: null, node: c, raf: 0 };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
      });

      // ----- 판 누르기: × 빼기 / 고른 시설 놓기 / 안내 -----
      shaft.addEventListener('click', function (e) {
        var x = e.target.closest ? e.target.closest('[data-unpend]') : null;
        if (x) { unplace(x.getAttribute('data-unpend')); return; }
        var lk = e.target.closest ? e.target.closest('.zlock') : null;
        if (lk) { api.toast('🔒 ' + (lk.querySelector('span') || lk).textContent); api.buzz('warn'); return; }
        var c = e.target.closest ? e.target.closest('.zc[data-z]') : null;
        if (!c) return;
        var z = c.getAttribute('data-z');
        if (armed) { place(z, armed); return; }
        api.toast(pend[z] ? (Z.NAMES[z] || z) + ': 미확정이에요. 끌어서 옮기거나 × 로 뺄 수 있어요' : zoneInfo(z)); api.buzz('tap');
      });

      api.onLeave(function () {
        if (drag) { endDrag(); drag = null; }
        timers.forEach(clearTimeout);
      });

      if (q && RUN.site.builds === 0) api.tutStart('zones', { keep: true });   // 첫 건설 전 안내 (추천 칸 강조는 drawBoard 가 api.tutZones 로, 대기실 띠는 drawTools 가)
      redraw();
    };
  };
})();
