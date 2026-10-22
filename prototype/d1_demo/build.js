/* D1 건설 화면: 구역 판 + 구역 시트 (시설 고르기 -> 미리보기 -> 짓기, 대기실에 부대 넣고 빼기)
 *
 * 구조 (shell.js의 SCREEN_PLUGINS 방식, battle.js와 같음)
 *  - 규칙은 zones.js(판·시설·이동), 상태와 바꾸는 함수는 progress.js (API.md: previewBuild·buildZone·placeUnit·removeUnit·idleUnits·powerInfo). 여기는 보여 주고 누름만 받는다.
 *  - 흐름: 구역 누르기 -> 시트가 열림 -> 시설 고르기(미리보기: 의뢰 예산·가치·전투력 전후, 판에 흐리게 미리 보임) -> 짓기.
 *    몬스터 대기실이면 시트 위쪽에서 부대(친위대 포함)를 넣고 뺀다 (공짜. 칸당 한 자리).
 *  - 돈: 건설·부대 조달은 의뢰 예산(회사 금 아님). 모자라면 "예산 N 모자람". 쓴 예산은 돌려받지 못한다. 예산 0이어도 다음 주는 진행된다.
 *  - 가치 = 지어 둔 시설 점수, 전투력 = 함정 점수 + 인계할 부대 점수를 침입자가 지나는 비율로 곱한 것 (API.md). 구역마다 전투력(powerInfo)을 판 위에 작게 보여 준다 (⚔).
 *  - 고정 구역(의뢰가 정함, 예: 얼어붙은 하역장)은 🔒로 보이고 못 짓고 못 바꾼다.
 *  - 문 위 숫자 = 침입자 20명이 오면 그 길로 지나갈 인원 (zones.js forecast).
 *  - 판 그리기(boardHtml)·의뢰 카드 조각(siteHtml·fixedHtml)은 shell.js·battle.js가 같이 쓴다 (window.ZONEVIEW).
 *  - 튜토리얼(첫 건설 전): 'zones' 단계 말풍선 + 첫 부지의 필수 길(P.tutorialPath, 입구·보물방 빼고)을 반짝이게 한다 (api.tutStart·api.tutZones). 처음 짓는 순간 단계가 끝난다.
 *  - 곡선·시간은 shell.css의 var(--dur-*)/var(--ease-*) (MOTION에서 깔림)만.
 */
(function () {
  'use strict';

  var Z = window.ZONES, P = window.PROGRESS, RUN = P.RUN, BD = window.BATTLE_DATA;
  // 판은 부지마다 다르다 (core 가 ZONES.useBoard 로 바꿔 끼움). 판 값(MAP·NAMES·...)은 모듈 변수에 담지 말고 그릴 때마다 Z 에서 읽는다.
  function curZ() { Z = window.ZONES || Z; return Z; }
  function cols() { return Z.MAP[0].length; }
  // 칸 가로/세로 비율: 판 전체 모양이 5x7 판(비율 1.25)과 비슷하게 유지되도록 칸 수에 맞춰 잡는다 (큰 판이 화면 밖으로 길어지지 않게)
  function cellRatio(nc, nr) { return Math.round(25 * nr / (28 * nc) * 1000) / 1000; }

  function cellKind(z, k) { return z === 'B' ? 'boss' : (Z.FAC[k] || Z.FAC.empty).kind; }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function money(n) { return Number(n).toLocaleString('en-US'); }
  function fmtN(n) { return String(Math.round(Number(n) * 10) / 10); }
  function sign(n) { return (n >= 0 ? '+' : '') + fmtN(n); }

  // 구역 첫 칸에 쓸 글: 구역 이름 / 시설 / 한 줄 정보 / (있으면) 구역 전투력 ⚔
  function labelHtml(z, k, units, pp) {
    var f = Z.FAC[k] || Z.FAC.empty, us = units[z] || [], h = '<div class="zn">' + (Z.NAMES[z] || z) + '</div>';
    if (f.kind === 'fixed') h += '<div class="fn">🔒 ' + f.short + '</div><div class="zi">고정 구역</div>';
    else {
      h += '<div class="fn">' + f.short + '</div>';
      if (f.kind === 'den') {
        var sl = Z.slotsOf(k, z);
        h += '<div class="zi' + (us.length ? '' : ' warn') + '">' + us.length + '/' + sl + '</div>';
      } else if (f.kind === 'trap') h += '<div class="zi">피해 ' + Z.trapDmgOf(z) + '</div>';
    }
    if (pp && pp[z] && pp[z].power > 0) h += '<div class="zp">⚔ ' + fmtN(pp[z].power) + '</div>';
    return h;
  }

  // 판 전체 HTML. o = { zones, units, flow(없으면 문 숫자 안 보임), sel(눌린 구역), pv(미리보기 중인 구역), pp(구역별 전투력 { 구역: { power } }) }
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
      h += '<div class="zc k-' + cellKind(z, k) + zcls(z) + '" data-z="' + z + '" style="' + edge + '">' + (first ? labelHtml(z, k, units, o.pp) : '') + '</div>';
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

  // ---------- 의뢰 카드·팝업 조각: 판 미리보기 · 고정 구역 ----------
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
  window.ZONEVIEW = { boardHtml: boardHtml, cols: cols, boardOf: boardOf, siteHtml: siteHtml, fixedHtml: fixedHtml };

  function zoneWhy(z) {
    var t = Z.zoneType(z);
    return (t === 'yard' ? '침입자가 들어오기 전에 지나는 곳.' : t === 'entry' ? '모든 침입자가 지나는 첫 관문. 데모에서는 분기로 고정이에요 (갈림길 규칙대로 나뉘어요).'
      : t === 'boss' ? '' : Z.CENTER.indexOf(z) >= 0 ? '큰길: 침입자가 모두 모이는 길. 피할 수 없어요.'
      : Z.EXITS[z] && Z.EXITS[z].length > 1 ? '갈림길: 지나간 침입자가 여러 길로 나뉘어요.' : '옆길.') +
      (t === 'room' ? ' 큰 구역일수록 함정이 세고 부대 자리가 많아요.' : '');
  }
  // 시설 설명: zones.js 의 대기실 글이 옛 규칙(칸당 2자리)이라 화면에서 임시로 덮는다 (core-dev 요청 목록)
  function facText(k) {
    var f = Z.FAC[k];
    return f.kind === 'den' ? '칸당 부대 한 자리. 부대가 보이면 침입자가 다른 길이 있으면 피함. 바로 앞이 함정이면 기습 ×1.5' : f.st;
  }

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

      el.appendChild(api.head('건설', 'field'));
      var sumBox = api.div('bsum');
      var questBox = api.div('');
      var noteBox = api.div('');      // 의뢰 예산을 다 썼을 때 안내
      var boardBox = api.div('zboard');
      var sheetBox = api.div('');
      el.appendChild(sumBox);
      el.appendChild(questBox);
      el.appendChild(noteBox);
      el.appendChild(boardBox);
      el.appendChild(api.div('dim small-text zhint', '구역을 눌러 시설을 고르세요. ⚔는 그 구역의 전투력(함정·부대 점수 × 침입자가 지나는 비율)이라, 미끼로 길을 모으면 그 길의 ⚔가 커져요. 문 위 숫자는 침입자 ' + Z.PREVIEW_INVADERS + '명이 오면 그 길로 지나갈 인원이에요. 쓴 의뢰 예산은 돌려받지 못해요. 부대 넣고 빼기는 공짜예요.'));
      el.appendChild(sheetBox);

      function ppMap() {
        var m = {}; P.powerInfo().parts.forEach(function (p) { m[p.z] = p; });
        return m;
      }

      function drawSummary() {
        var s = P.siteSummary(), q = RUN.quest, pr = P.questProgress();
        morphHtml(sumBox, '<div>의뢰 예산<b>' + money(s.budget) + '</b></div><div>던전 가치<b>' + s.value + '</b></div><div>전투력<b>' + s.power + '</b></div>');
        morphHtml(questBox, q && pr ? '<div class="card quest"><div class="qhead"><span class="chip accent">' + api.questTag(q) + '</span><b>' + esc(q.name) + '</b></div>' +
          '<div class="small-text">' + esc(pr.line) + '</div>' + (pr.complete && !pr.canDeliver ? '<div class="blocker">' + esc(pr.why) + '</div>' : '') +
          (pr.complete && pr.canDeliver ? '<div class="small-text ready">의뢰 완료! 현장에서 [납품하기]를 누르세요</div>' : '') + '</div>' : '');
        morphHtml(noteBox, s.budget <= 0 ? '<div class="grantbar"><b>의뢰 예산을 다 썼어요</b><span>지은 시설과 부대로 [다음 주]를 눌러 진행할 수 있어요. 부대를 대기실에 넣으면 전투력이 올라요</span></div>' : '');
      }

      function preview() { return sel && pick ? P.previewBuild(sel, pick) : null; }

      function drawBoard() {
        var p = preview();
        var zones = p && p.zones ? p.zones : RUN.site.zones, units = p && p.units ? p.units : RUN.site.units;
        morphHtml(boardBox, boardHtml({ zones: zones, units: units, flow: P.forecast(zones, units).flow, sel: sel, pv: p && p.zones ? sel : null, pp: ppMap() }));
        api.tutZones().forEach(function (z) {
          boardBox.querySelectorAll('.zc[data-z="' + z + '"]').forEach(function (c) { c.classList.add('tut-hl'); });
        });
      }

      // 대기 중인 부대 고르기 칸. open = 아직 자리가 있나
      function idleHtml(open) {
        var idle = P.idleUnits();
        var h = '<div class="lbl">대기 중인 부대 — 눌러서 이 대기실에 넣어요 (친위대도 한 자리를 차지해요)</div>';
        if (!idle.length) return h + '<div class="why">대기 중인 부대가 없어요. 군단 탭에서 조달하거나(의뢰 예산) 다른 대기실에서 빼세요.</div>';
        return h + '<div class="zslots">' + idle.map(function (u) {
          return '<button data-in="' + u.id + '"' + (open ? '' : ' disabled') + '><b>' + esc(u.name) + '</b><small>' + (u.kind === 'guard' ? '친위대' : u.count + '명') + ' · Lv ' + u.lv +
            '</small><small>체' + fmtN(u.hp) + ' 공' + fmtN(u.atk) + '</small></button>';
        }).join('') + '</div>';
      }

      function drawSheet() {
        if (!sel) { sheetBox.innerHTML = ''; return; }
        var z = sel, k = RUN.site.zones[z], f = Z.FAC[k], t = Z.zoneType(z);
        var now = P.forecast().at[z] || 0, pp = ppMap()[z];
        var h = '<h3>' + Z.NAMES[z] + ' — ' + f.name + (t === 'room' ? ' (' + Z.sizeOf(z) + '칸)' : '') + '</h3>';
        if (f.kind === 'fixed') {
          var fd = (BD.FIXED_ZONES || {})[f.fixedId] || {};
          h += '<div class="why"><b>고정 구역</b> — 의뢰가 정해 둔 곳이라 짓거나 바꿀 수 없어요.</div>' +
            '<div class="why">' + esc(fd.look || '') + '</div><div class="why"><b>효과</b> ' + esc(f.st) + '</div>' +
            '<div class="why">침입자 ' + Z.PREVIEW_INVADERS + '명이 오면 이 구역에 <b>' + now + '명</b>이 와요.</div>' +
            '<div class="zfoot"><div class="zact"><button class="btn" data-close>닫기</button></div></div>';
          var sh0 = sheetBox.firstChild && sheetBox.firstChild.firstChild;
          if (!sh0) { sheetBox.innerHTML = ''; sheetBox.appendChild(api.div('zsheetbg', '<div class="zsheet">' + h + '</div>')); } else morphHtml(sh0, h);
          return;
        }
        h += '<div class="why">' + zoneWhy(z) + '</div>';
        if (t !== 'yard') h += '<div class="why">침입자 ' + Z.PREVIEW_INVADERS + '명이 오면 이 구역에 <b>' + now + '명</b>이 와요.' +
          (pp ? ' · 이 구역 전투력 <b>' + fmtN(pp.power) + '</b> (점수 ' + fmtN(pp.score) + ' × 통과 ' + Math.round(pp.w * 100) + '%)' : '') + '</div>';
        if (f.kind === 'den') {
          var us = RUN.site.units[z] || [], sl = Z.slotsOf(k, z);
          h += '<div class="lbl">출진 부대 (' + us.length + '/' + sl + ') — 자리를 누르면 빼요</div><div class="zslots">';
          for (var i = 0; i < sl; i++) {
            var m = us[i] !== undefined ? P.unitById(us[i]) : null;
            h += m ? '<button data-out="' + i + '"><b>' + esc(m.name) + '</b><small>' + (m.kind === 'guard' ? '친위대' : m.count + '명') + ' · Lv ' + m.lv + ' · 빼기</small></button>' : '<button class="emptyslot" disabled>빈 자리</button>';
          }
          h += '</div>' + idleHtml(us.length < sl);
        }
        h += '<div class="lbl">' + (f.kind === 'den' ? '시설 바꾸기' : '시설 고르기') + '</div><div class="zopts">';
        var left = P.budgetLeft(), opts = Z.facFor(z);
        if (!opts.length) h += '<div class="why">여기는 지을 수 있는 시설이 없어요.</div>';
        opts.forEach(function (fk) {
          var ff = Z.FAC[fk], base = Z.costOf(fk, z), cv = P.buildCost(fk, z), vv = Z.valueOf(fk, z), cur = fk === k, poor = !cur && cv > left;
          var costTxt = cv < base ? '예산 <s>' + base + '</s> ' + cv : '예산 ' + cv;
          h += '<button data-pick="' + fk + '" class="' + (cur ? 'cur' : '') + (pick === fk ? ' on' : '') + (poor ? ' poor' : '') + '"' + (cur ? ' disabled' : '') + '>' +
            '<b>' + ff.name + (cur ? ' (지금)' : '') + '</b><small>' + facText(fk) + (ff.kind === 'den' ? ' (' + Z.sizeOf(z) + '칸, 자리 ' + Z.slotsOf(fk, z) + ')' : ff.kind === 'trap' ? ' (피해 ' + Z.trapDmgOf(z) + ')' : '') + '</small>' +
            '<small>' + costTxt + (vv ? ' · 가치 +' + vv : '') + (poor ? ' · <span class="lack">예산 ' + (cv - left) + ' 모자람</span>' : '') + '</small></button>';
        });
        h += '</div>';
        var p = preview();
        h += '<div class="zfoot">';
        if (p && p.zones) {
          var pf = Z.FAC[pick], after = P.forecast(p.zones, p.units).at[z] || 0, dv = p.valueAfter - p.valueNow, dp = p.powerAfter - p.powerNow;
          h += '<div class="zpreview"><b>미리보기: ' + pf.name + '</b>' +
            (p.budgetAfter < 0 ? '<div>의뢰 예산 ' + money(left) + ' (비용 ' + p.cost + ')</div>' : '<div>의뢰 예산 ' + money(left) + ' → <b>' + money(p.budgetAfter) + '</b> (-' + p.cost + ')</div>') +
            (p.discount > 0 ? '<div class="discount">할인 -' + money(p.discount) + '</div>' : '') +
            '<div>던전 가치 ' + p.valueNow + ' → <b>' + p.valueAfter + '</b> (' + sign(dv) + ')</div>' +
            '<div>전투력 ' + p.powerNow + ' → <b>' + p.powerAfter + '</b> (' + sign(dp) + ')</div>' +
            (t !== 'yard' ? '<div>이 구역에 오는 침입자 ' + now + '명 → <b>' + after + '명</b></div>' : '') +
            (p.back ? '<div class="lack">든 부대 ' + p.back + '개는 대기로 돌아가요</div>' : '') +
            (p.why ? '<div class="lack">' + esc(p.why) + '</div>' : '<div class="dim">지은 뒤에는 의뢰 예산을 돌려받지 못해요</div>') + '</div>';
        } else if (p && p.why) h += '<div class="zpreview"><div class="lack">' + esc(p.why) + '</div></div>';
        h += '<div class="zact"><button class="btn" data-close>닫기</button><button class="btn primary" data-build' + (p && p.ok ? '' : ' disabled') + '>' +
          (p ? (p.ok ? '짓기 (예산 ' + p.cost + ')' : '짓기') : '시설을 고르세요') + '</button></div></div>';
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
          r = b.hasAttribute('data-in') ? P.placeUnit(sel, b.getAttribute('data-in')) : P.removeUnit(sel, +b.getAttribute('data-out'));
          if (!r.ok) { api.toast(r.msg); api.buzz('warn'); return; }
          api.buzz('tap');
          api.stageToast(r.stages);
          redraw();
          return;
        }
        if (b.hasAttribute('data-build')) {
          r = P.buildZone(sel, pick);
          api.toast(r.msg);
          if (!r.ok) { api.buzz('warn'); redraw(); return; }
          api.buzz('good');
          api.stageToast(r.stages);
          api.tutDone('zones'); // 첫 건설을 했으면 안내 끝
          if (Z.FAC[pick].kind !== 'den') sel = null; // 대기실을 지었으면 시트를 열어 둬서 바로 부대를 넣게
          pick = null;
          redraw();
        }
      });

      if (RUN.quest && RUN.site.builds === 0) api.tutStart('zones', { keep: true }); // 첫 건설 전 안내 (강조는 redraw 가 api.tutZones 로)
      redraw();
    };
  };
})();
