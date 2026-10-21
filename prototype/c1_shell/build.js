/* C1 건설 화면: 구역 판 (시안 A7의 판을 C1 안으로) + 구역 시트 (몬스터 배치, 시설 고르기 -> 미리보기 -> 짓기)
 *
 * 구조 (shell.js의 SCREEN_PLUGINS 방식, battle.js와 같음)
 *  - 규칙은 zones.js(판·시설·이동), 상태와 바꾸는 함수는 progress.js(buildZone·placeMonster·removeMonster). 여기는 보여 주고 누름만 받는다.
 *  - 흐름: 구역 누르기 -> 시트가 열림 -> 시설 고르기(미리보기: 금·가치·침입자 수 변화, 판에 흐리게 미리 보임) -> 짓기.
 *    몬스터 대기실이면 시트 위쪽에서 몬스터를 넣고 뺀다 (공짜).
 *  - 문 위 숫자 = 침입자 12명이 오면 그 길로 지나갈 인원 (zones.js forecast).
 *  - 쓴 금은 돌려받지 못한다. 시트와 미리보기에 그렇게 적는다.
 *  - 첫 건설 공사비(P.grantLeft() > 0)가 남아 있으면 위에 안내 줄을 띄우고, 미리보기·짓기 버튼에 "공사비 N + 금 M"(previewBuild의 fromGrant · fromGold)로 보여 준다.
 *  - 판 그리기(boardHtml)는 던전 탭이 읽기 전용으로 같이 쓴다 (window.ZONEVIEW).
 *  - 튜토리얼(첫 건설 전): 'zones' 단계 말풍선 + 첫 부지의 필수 길(P.tutorialPath, 입구·보물방 빼고)을 반짝이게 한다 (api.tutStart·api.tutZones). 처음 짓는 순간 단계가 끝난다.
 *  - 곡선·시간은 shell.css의 var(--dur-*)/var(--ease-*) (MOTION에서 깔림)만.
 */
(function () {
  'use strict';

  var Z = window.ZONES, P = window.PROGRESS, RUN = P.RUN;
  // 판은 부지마다 다르다 (core 가 ZONES.useBoard 로 바꿔 끼움). 판 값(MAP·NAMES·...)은 모듈 변수에 담지 말고 그릴 때마다 Z 에서 읽는다.
  function curZ() { Z = window.ZONES || Z; return Z; }
  function cols() { return Z.MAP[0].length; }
  // 칸 가로/세로 비율: 판 전체 모양이 5x7 판(비율 1.25)과 비슷하게 유지되도록 칸 수에 맞춰 잡는다 (큰 판이 화면 밖으로 길어지지 않게)
  function cellRatio(nc, nr) { return Math.round(25 * nr / (28 * nc) * 1000) / 1000; }

  function cellKind(z, k) { return z === 'B' ? 'boss' : (Z.FAC[k] || Z.FAC.empty).kind; }

  // 구역 첫 칸에 쓸 글: 구역 이름 / 시설 / 한 줄 정보
  function labelHtml(z, k, units) {
    var f = Z.FAC[k] || Z.FAC.empty, us = units[z] || [], h = '<div class="zn">' + (Z.NAMES[z] || z) + '</div><div class="fn">' + f.short + '</div>';
    if (f.kind === 'den') {
      var sl = Z.slotsOf(k, z);
      h += '<div class="zi' + (us.length ? '' : ' warn') + '">' + us.length + '/' + sl + '</div>';
    } else if (f.kind === 'trap') h += '<div class="zi">피해 ' + Z.trapDmgOf(z) + '</div>';
    return h;
  }

  // 판 전체 HTML. o = { zones, units, flow(없으면 문 숫자 안 보임), sel(눌린 구역), pv(미리보기 중인 구역) }
  function boardHtml(o) {
    curZ();
    var zones = o.zones, units = o.units || {}, flow = o.flow || null, seen = {}, nc = cols();
    function zcls(z) { return (o.sel === z ? ' sel' : '') + (o.pv === z ? ' pv' : ''); }
    var h = '<div class="zyard' + zcls('Y') + '" data-z="Y">야외 · 집결지 — <b>' + (Z.FAC[zones.Y] || Z.FAC.forest).name + '</b></div>';
    h += '<div class="zwrap"><div class="zgrid" style="grid-template-columns:repeat(' + nc + ',minmax(0,1fr));--za:' + cellRatio(nc, Z.MAP.length) + '">';
    for (var r = 0; r < Z.MAP.length; r++) for (var c = 0; c < nc; c++) {
      var z = Z.MAP[r][c], k = zones[z] || 'empty', first = !seen[z];
      seen[z] = true;
      var edge = [[-1, 0, 'top'], [1, 0, 'bottom'], [0, -1, 'left'], [0, 1, 'right']].map(function (d) {
        var nb = Z.MAP[r + d[0]] && Z.MAP[r + d[0]][c + d[1]];
        return nb === z ? 'border-' + d[2] + '-color:transparent;' : '';
      }).join('');
      h += '<div class="zc k-' + cellKind(z, k) + zcls(z) + '" data-z="' + z + '" style="' + edge + '">' + (first ? labelHtml(z, k, units) : '') + '</div>';
    }
    h += '</div><div class="zdoors">';
    Z.flowPairs().forEach(function (p) {
      var e = Z.sharedEdge(p[0], p[1]); if (!e) return;
      var x = ((e[0][1] + e[1][1]) / 2 + 0.5) / nc * 100, y = ((e[0][0] + e[1][0]) / 2 + 0.5) / Z.MAP.length * 100, hz = e[0][1] === e[1][1];
      var n = flow ? flow[p[0] + '>' + p[1]] || 0 : null;
      h += '<div class="zdoor ' + (hz ? 'h' : 'v') + (n === 0 ? ' unused' : '') + '" style="left:' + x + '%;top:' + y + '%">' + (n ? '<b>' + n + '</b>' : '') + '</div>';
    });
    return h + '</div></div>';
  }

  // ---------- 의뢰 카드·팝업 조각: 판 미리보기 · 건설 요구 · 막힘 안내 (core 계약이 아직 없으면 그 부분은 빈 글) ----------
  // 계약: ZONES.boardInfo(id) -> { id, name, desc, MAP, NAMES } · q.board · q.demand { id, label, text }
  //       P.demandStatus() -> { id, label, text, ok, now, need } | null · P.questBlockers() -> 문자열 배열
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function ui(key, fb) { var u = window.LINES && window.LINES.ui; return u && typeof u[key] === 'string' && u[key].trim() ? u[key] : fb; }
  function boardOf(id) {
    curZ();
    if (!id || typeof Z.boardInfo !== 'function') return null;
    try { var b = Z.boardInfo(id); return b && Array.isArray(b.MAP) && b.MAP.length && Array.isArray(b.MAP[0]) ? b : null; } catch (e) { return null; }
  }
  // 판 모양 작은 미리보기: 구역마다 칸 색 (이웃한 구역은 다른 색), 입구 '입'·보스방 '보'. 구역 사이에만 선을 긋는다
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
        var cls = k === 'E' ? 'me' : k === 'B' ? 'mb' : 'm' + col[k], mark = seen[k] ? '' : (k === 'E' ? '입' : k === 'B' ? '보' : '');
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
  // 건설 요구 한 줄. ds = { ok, now, need } (진행 중인 의뢰만. 없으면 요구 글만)
  function demandRowHtml(d, ds) {
    if (!d || !d.label) return '';
    var st = ds && typeof ds.ok === 'boolean' ? (ds.ok ? ' ok' : ' no') : '';
    var num = ds && typeof ds.need === 'number' && ds.need > 0 && typeof ds.now === 'number' ? '<b class="dnum">' + ds.now + '/' + ds.need + '</b>' : '';
    return '<div class="demand' + st + '"><span class="chip req">' + esc(ui('demandBadge', '요구')) + '</span>' +
      '<div class="dtxt"><b>' + (st ? '<span class="dmark">' + (ds.ok ? '✓' : '✗') + '</span> ' : '') + esc(d.label) + '</b>' +
      (d.text ? '<small class="dim">' + esc(d.text) + '</small>' : '') + '</div>' + num + '</div>';
  }
  // 지금 하고 있는 의뢰의 요구 (진행 포함)
  function demandNowHtml(q) {
    var ds = null;
    if (typeof P.demandStatus === 'function') { try { ds = P.demandStatus(); } catch (e) { ds = null; } }
    if (ds && ds.label) return demandRowHtml(ds, ds);
    return demandRowHtml(q && q.demand, null);
  }
  // 목표는 채웠는데 요구가 안 맞아 납품이 막힌 이유 한 줄 (없으면 '')
  function blockerHtml() {
    var q = RUN.quest, b;
    if (!q || typeof P.questBlockers !== 'function') return '';
    try {
      if (!(q.goals || []).every(function (g) { return P.goalNow(g) >= g.target; })) return '';
      b = P.questBlockers();
    } catch (e) { return ''; }
    b = Array.isArray(b) ? b.filter(function (t) { return typeof t === 'string' && t; }) : [];
    if (!b.length) return '';
    return '<div class="blocker">' + (/^요구/.test(b[0]) ? '' : '<b>' + esc(ui('blockerHead', '요구가 남았어요:')) + '</b> ') + b.map(esc).join(' · ') + '</div>';
  }
  window.ZONEVIEW = { boardHtml: boardHtml, cols: cols, boardOf: boardOf, siteHtml: siteHtml, demandRowHtml: demandRowHtml, demandNowHtml: demandNowHtml, blockerHtml: blockerHtml };

  function zoneWhy(z) {
    var t = Z.zoneType(z);
    return (t === 'yard' ? '침입자가 들어오기 전에 지나는 곳.' : t === 'entry' ? '모든 침입자가 지나는 첫 관문. 어느 길로 보낼지 정해요.'
      : t === 'boss' ? '' : Z.CENTER.indexOf(z) >= 0 ? '가운데 길: 옆길에서 빠져나온 침입자가 모두 모이는 큰길. 피할 수 없어요.'
      : Z.EXITS[z] && Z.EXITS[z].length > 1 ? '갈림길: 지나간 침입자가 아래로 내려가거나 가운데로 빠져요.' : '옆길.') +
      (t === 'room' ? ' 큰 구역일수록 함정이 세고 몬스터 자리가 많아요.' : '');
  }
  function money(n) { return Number(n).toLocaleString('en-US'); }

  // 제자리 갱신: target 의 자식들을 src 의 자식들과 맞춘다. 같은 종류 요소는 그대로 두고 속성·글자만 바꿔서,
  // 시트가 다시 튀어나오거나 버튼이 새로 생기지 않게 한다 (애니메이션·스크롤·누름 상태 유지).
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

  window.SCREEN_PLUGINS = window.SCREEN_PLUGINS || {};
  window.SCREEN_PLUGINS.build = function (api) {
    return function (el) {
      curZ();
      var sel = null;      // 시트가 열린 구역 (없으면 시트 닫힘)
      var pick = null;     // 시트에서 고른 시설 (아직 안 지음, 미리보기 중)

      el.appendChild(api.head('건설', 'home'));
      var sumBox = api.div('bsum');
      var questBox = api.div('');
      var blockBox = api.div('');     // 납품이 막힌 이유 (목표는 찼는데 요구가 안 맞을 때만)
      var grantBox = api.div('');     // 첫 건설 공사비 안내 (P.grantLeft가 없거나 0이면 비어 있음)
      var boardBox = api.div('zboard');
      var sheetBox = api.div('');
      el.appendChild(sumBox);
      el.appendChild(questBox);
      el.appendChild(blockBox);
      el.appendChild(grantBox);
      el.appendChild(boardBox);
      el.appendChild(api.div('dim small-text zhint', '구역을 눌러 시설을 고르세요. 문 위 숫자는 침입자 ' + Z.PREVIEW_INVADERS + '명이 오면 그 길로 지나갈 인원이에요. 쓴 금은 돌려받지 못해요. 몬스터 넣고 빼기는 공짜예요.'));
      el.appendChild(sheetBox);

      // 이 부지에 남은 첫 건설 공사비 (core 쪽 P.grantLeft. 아직 없으면 0으로 봄)
      function grantLeft() { return P.grantLeft ? (P.grantLeft() || 0) : 0; }

      function drawSummary() {
        var s = P.siteSummary(), gl = grantLeft();
        morphHtml(grantBox, gl > 0 ? '<div class="grantbar"><b>첫 건설 공사비 ' + money(gl) + '</b><span>이 부지에서만 써요. 안 쓰면 사라져요</span></div>' : '');
        morphHtml(sumBox, '<div>자금<b>' + money(RUN.gold) + '</b></div><div>던전 가치<b>' + s.value + '</b></div><div>건설 횟수<b>' + RUN.site.builds + '회</b></div>');
        morphHtml(questBox, RUN.quest ? '<div class="card quest' + (RUN.quest.kind === 'main' ? ' main' : '') + '"><div class="qhead"><span class="chip accent">' + api.questTag(RUN.quest) +
          '</span><b>' + RUN.quest.name + '</b></div>' + api.goalsHtml(RUN.quest, true) + demandNowHtml(RUN.quest) + '</div>' : '');
        morphHtml(blockBox, blockerHtml());
      }

      function preview() { return sel && pick ? P.previewBuild(sel, pick) : null; }

      function drawBoard() {
        var p = preview();
        var zones = p && p.zones ? p.zones : RUN.site.zones, units = p && p.units ? p.units : RUN.site.units;
        morphHtml(boardBox, boardHtml({ zones: zones, units: units, flow: P.forecast(zones, units).flow, sel: sel, pv: p && p.zones ? sel : null }));
        api.tutZones().forEach(function (z) {
          boardBox.querySelectorAll('.zc[data-z="' + z + '"]').forEach(function (c) { c.classList.add('tut-hl'); });
        });
      }

      function drawSheet() {
        if (!sel) { sheetBox.innerHTML = ''; return; }
        var z = sel, k = RUN.site.zones[z], f = Z.FAC[k], t = Z.zoneType(z);
        var now = P.forecast().at[z] || 0;
        var h = '<h3>' + Z.NAMES[z] + ' — ' + f.name + (t === 'room' ? ' (' + Z.sizeOf(z) + '칸)' : '') + '</h3>';
        h += '<div class="why">' + zoneWhy(z) + '</div>';
        if (t !== 'yard') h += '<div class="why">침입자 ' + Z.PREVIEW_INVADERS + '명이 오면 이 구역에 <b>' + now + '명</b>이 와요.</div>';
        if (f.kind === 'den') {
          var us = RUN.site.units[z] || [], sl = Z.slotsOf(k, z);
          h += '<div class="lbl">몬스터 배치 (' + us.length + '/' + sl + ') — 자리를 누르면 빼요</div><div class="zslots">';
          for (var i = 0; i < sl; i++) {
            var m = us[i] !== undefined ? P.monById(us[i]) : null;
            h += m ? '<button data-out="' + i + '"><b>' + m.name + '</b><small>Lv ' + m.lv + ' · 빼기</small></button>' : '<button class="emptyslot" disabled>빈 자리</button>';
          }
          h += '</div><div class="lbl">대기 중인 몬스터 — 누르면 넣어요</div><div class="zslots">';
          var idle = P.idleMonsters();
          idle.forEach(function (m) {
            h += '<button data-in="' + m.id + '"' + (us.length < sl ? '' : ' disabled') + '><b>' + m.name + '</b><small>Lv ' + m.lv + ' · 체' + m.hp + ' 공' + m.atk + '</small><small>가치 ' + Z.monValue(m) + '</small></button>';
          });
          h += '</div>';
          if (!idle.length) h += '<div class="why">대기 중인 몬스터가 없어요</div>';
        }
        h += '<div class="lbl">' + (f.kind === 'den' ? '시설 바꾸기' : '시설 고르기') + '</div><div class="zopts">';
        Z.facFor(z).forEach(function (fk) {
          var ff = Z.FAC[fk], base = Z.costOf(fk, z), cv = P.buildCost ? P.buildCost(fk, z) : base, vv = Z.valueOf(fk, z), cur = fk === k, have = RUN.gold + grantLeft(), poor = !cur && cv > have;
          var costTxt = cv < base ? '금 <s>' + base + '</s> ' + cv : '금 ' + cv; // 건설 공방 할인 중이면 원래 가격에 줄을 그어 함께 보여 줌
          h += '<button data-pick="' + fk + '" class="' + (cur ? 'cur' : '') + (pick === fk ? ' on' : '') + (poor ? ' poor' : '') + '"' + (cur ? ' disabled' : '') + '>' +
            '<b>' + ff.name + (cur ? ' (지금)' : '') + '</b><small>' + ff.st + (ff.kind === 'den' ? ' (' + Z.sizeOf(z) + '칸, 자리 ' + Z.slotsOf(fk, z) + ')' : ff.kind === 'trap' ? ' (피해 ' + Z.trapDmgOf(z) + ')' : '') + '</small>' +
            '<small>' + costTxt + (vv ? ' · 가치 ' + vv : '') + (poor ? ' · <span class="lack">금 ' + (cv - have) + ' 모자람</span>' : '') + '</small></button>';
        });
        h += '</div>';
        var p = preview();
        h += '<div class="zfoot">';
        if (p) {
          var pf = Z.FAC[pick], after = P.forecast(p.zones, p.units).at[z] || 0, dv = p.valueAfter - p.valueNow;
          h += '<div class="zpreview"><b>미리보기: ' + pf.name + '</b>' +
            (p.fromGrant > 0
              ? '<div>비용 ' + p.cost + ' = 공사비 <b>' + money(p.fromGrant) + '</b>' + (p.fromGold > 0 ? ' + 금 <b>' + money(p.fromGold) + '</b>' : '') + '</div>' +
                '<div>금 ' + money(RUN.gold) + ' → <b>' + money(RUN.gold - (p.fromGold || 0)) + '</b>' + ' · 공사비 ' + money(grantLeft()) + ' → <b>' + money(Math.max(0, grantLeft() - p.fromGrant)) + '</b></div>'
              : '<div>금 ' + money(RUN.gold) + ' → <b>' + money(p.goldAfter) + '</b> (-' + (p.fromGold != null ? p.fromGold : p.cost) + ')</div>') +
            (p.discount > 0 ? '<div class="discount">건설 공방 할인 -' + money(p.discount) + '</div>' : '') +
            '<div>던전 가치 ' + p.valueNow + ' → <b>' + p.valueAfter + '</b> (' + (dv >= 0 ? '+' : '') + dv + ')</div>' +
            (t !== 'yard' ? '<div>이 구역에 오는 침입자 ' + now + '명 → <b>' + after + '명</b></div>' : '') +
            (p.back ? '<div class="lack">든 몬스터 ' + p.back + '마리는 대기로 돌아가요</div>' : '') +
            (p.why ? '<div class="lack">' + p.why + '</div>' : '<div class="dim">지은 뒤에는 금을 돌려받지 못해요</div>') + '</div>';
        }
        h += '<div class="zact"><button class="btn" data-close>닫기</button><button class="btn primary" data-build' + (p && p.ok ? '' : ' disabled') + '>' +
          (p ? (p.ok ? '짓기 (' + (p.fromGrant > 0 ? '공사비 ' + p.fromGrant + (p.fromGold > 0 ? ' + 금 ' + p.fromGold : '') : '금 ' + p.cost) + ')' : '짓기') : '시설을 고르세요') + '</button></div></div>';
        // 시트는 처음 열 때만 만든다 (등장 애니메이션도 그때만). 이미 열려 있으면 안의 바뀐 부분만 제자리에서 고친다.
        var sheet = sheetBox.firstChild && sheetBox.firstChild.firstChild;
        if (!sheet) {
          sheetBox.innerHTML = '';
          sheetBox.appendChild(api.div('zsheetbg', '<div class="zsheet">' + h + '</div>'));
        } else morphHtml(sheet, h);
      }

      function redraw() { drawSummary(); drawBoard(); drawSheet(); }

      // 판을 누르면 시트를 연다 (보스·보물방은 아직 시설이 없음)
      boardBox.addEventListener('click', function (e) {
        var c = e.target.closest ? e.target.closest('[data-z]') : null;
        if (!c) return;
        var z = c.getAttribute('data-z');
        if (z === 'B') { api.toast('보스·보물방: 나중에 친위대가 들어가요'); api.buzz('tap'); return; }
        sel = z; pick = null; api.buzz('tap'); redraw();
      });
      // 시트 안 누름
      sheetBox.addEventListener('click', function (e) {
        if (e.target.classList && e.target.classList.contains('zsheetbg')) { sel = null; pick = null; redraw(); return; }
        var b = e.target.closest ? e.target.closest('button') : null;
        if (!b || b.disabled) return;
        var r;
        if (b.hasAttribute('data-close')) { sel = null; pick = null; api.buzz('tap'); redraw(); return; }
        if (b.hasAttribute('data-pick')) { var fk = b.getAttribute('data-pick'); pick = pick === fk ? null : fk; api.buzz('tap'); redraw(); return; }
        if (b.hasAttribute('data-in') || b.hasAttribute('data-out')) {
          r = b.hasAttribute('data-in') ? P.placeMonster(sel, +b.getAttribute('data-in')) : P.removeMonster(sel, +b.getAttribute('data-out'));
          if (!r.ok) { api.toast(r.msg); api.buzz('warn'); return; }
          api.buzz('tap');
          if (!api.autoDeliver()) redraw();
          return;
        }
        if (b.hasAttribute('data-build')) {
          r = P.buildZone(sel, pick);
          api.toast(r.msg);
          if (!r.ok) { api.buzz('warn'); redraw(); return; }
          api.buzz('good');
          api.tutDone('zones'); // 첫 건설을 했으면 안내 끝
          if (Z.FAC[pick].kind !== 'den') sel = null; // 대기실을 지었으면 시트를 열어 둬서 바로 몬스터를 넣게
          pick = null;
          if (!api.autoDeliver()) redraw();
        }
      });

      if (RUN.quest && RUN.site.builds === 0) api.tutStart('zones', { keep: true }); // 첫 건설 전 안내 (강조는 redraw 가 api.tutZones 로)
      redraw();
    };
  };
})();
