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
 *  - 곡선·시간은 shell.css의 var(--dur-*)/var(--ease-*) (MOTION에서 깔림)만.
 */
(function () {
  'use strict';

  var Z = window.ZONES, P = window.PROGRESS, RUN = P.RUN;

  function cellKind(z, k) { return z === 'B' ? 'boss' : Z.FAC[k].kind; }

  // 구역 첫 칸에 쓸 글: 구역 이름 / 시설 / 한 줄 정보
  function labelHtml(z, k, units) {
    var f = Z.FAC[k], us = units[z] || [], h = '<div class="zn">' + Z.NAMES[z] + '</div><div class="fn">' + f.short + '</div>';
    if (f.kind === 'den') {
      var sl = Z.slotsOf(k, z);
      h += '<div class="zi' + (us.length ? '' : ' warn') + '">' + us.length + '/' + sl + '</div>';
    } else if (f.kind === 'trap') h += '<div class="zi">피해 ' + Z.trapDmgOf(z) + '</div>';
    return h;
  }

  // 판 전체 HTML. o = { zones, units, flow(없으면 문 숫자 안 보임), sel(눌린 구역), pv(미리보기 중인 구역) }
  function boardHtml(o) {
    var zones = o.zones, units = o.units || {}, flow = o.flow || null, seen = {};
    function zcls(z) { return (o.sel === z ? ' sel' : '') + (o.pv === z ? ' pv' : ''); }
    var h = '<div class="zyard' + zcls('Y') + '" data-z="Y">야외 · 집결지 — <b>' + Z.FAC[zones.Y].name + '</b></div>';
    h += '<div class="zwrap"><div class="zgrid">';
    for (var r = 0; r < Z.MAP.length; r++) for (var c = 0; c < 5; c++) {
      var z = Z.MAP[r][c], k = zones[z], first = !seen[z];
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
      var x = ((e[0][1] + e[1][1]) / 2 + 0.5) / 5 * 100, y = ((e[0][0] + e[1][0]) / 2 + 0.5) / Z.MAP.length * 100, hz = e[0][1] === e[1][1];
      var n = flow ? flow[p[0] + '>' + p[1]] || 0 : null;
      h += '<div class="zdoor ' + (hz ? 'h' : 'v') + (n === 0 ? ' unused' : '') + '" style="left:' + x + '%;top:' + y + '%">' + (n ? '<b>' + n + '</b>' : '') + '</div>';
    });
    return h + '</div></div>';
  }
  window.ZONEVIEW = { boardHtml: boardHtml };

  function zoneWhy(z) {
    var t = Z.zoneType(z);
    return (t === 'yard' ? '침입자가 들어오기 전에 지나는 곳.' : t === 'entry' ? '모든 침입자가 지나는 첫 관문. 어느 길로 보낼지 정해요.'
      : t === 'boss' ? '' : Z.CENTER.indexOf(z) >= 0 ? '가운데 길: 옆길에서 빠져나온 침입자가 모두 모이는 큰길. 피할 수 없어요.'
      : Z.EXITS[z] && Z.EXITS[z].length > 1 ? '갈림길: 지나간 침입자가 아래로 내려가거나 가운데로 빠져요.' : '옆길.') +
      (t === 'room' ? ' 큰 구역일수록 함정이 세고 몬스터 자리가 많아요.' : '');
  }
  function money(n) { return Number(n).toLocaleString('en-US'); }

  window.SCREEN_PLUGINS = window.SCREEN_PLUGINS || {};
  window.SCREEN_PLUGINS.build = function (api) {
    return function (el) {
      var sel = null;      // 시트가 열린 구역 (없으면 시트 닫힘)
      var pick = null;     // 시트에서 고른 시설 (아직 안 지음, 미리보기 중)

      el.appendChild(api.head('건설', 'home'));
      var sumBox = api.div('bsum');
      var questBox = api.div('');
      var grantBox = api.div('');     // 첫 건설 공사비 안내 (P.grantLeft가 없거나 0이면 비어 있음)
      var boardBox = api.div('zboard');
      var sheetBox = api.div('');
      el.appendChild(sumBox);
      el.appendChild(questBox);
      el.appendChild(grantBox);
      el.appendChild(boardBox);
      el.appendChild(api.div('dim small-text zhint', '구역을 눌러 시설을 고르세요. 문 위 숫자는 침입자 ' + Z.PREVIEW_INVADERS + '명이 오면 그 길로 지나갈 인원이에요. 쓴 금은 돌려받지 못해요. 몬스터 넣고 빼기는 공짜예요.'));
      el.appendChild(sheetBox);

      // 이 부지에 남은 첫 건설 공사비 (core 쪽 P.grantLeft. 아직 없으면 0으로 봄)
      function grantLeft() { return P.grantLeft ? (P.grantLeft() || 0) : 0; }

      function drawSummary() {
        var s = P.siteSummary(), gl = grantLeft();
        grantBox.innerHTML = '';
        if (gl > 0) grantBox.appendChild(api.div('grantbar', '<b>첫 건설 공사비 ' + money(gl) + '</b><span>이 부지에서만 써요. 안 쓰면 사라져요</span>'));
        sumBox.innerHTML = '<div>자금<b>' + money(RUN.gold) + '</b></div><div>던전 가치<b>' + s.value + '</b></div><div>건설 횟수<b>' + RUN.site.builds + '회</b></div>';
        questBox.innerHTML = '';
        if (RUN.quest) questBox.appendChild(api.div('card quest' + (RUN.quest.kind === 'main' ? ' main' : ''),
          '<div class="qhead"><span class="chip accent">' + api.questTag(RUN.quest) + '</span><b>' + RUN.quest.name + '</b></div>' + api.goalsHtml(RUN.quest, true)));
      }

      function preview() { return sel && pick ? P.previewBuild(sel, pick) : null; }

      function drawBoard() {
        var p = preview();
        var zones = p && p.zones ? p.zones : RUN.site.zones, units = p && p.units ? p.units : RUN.site.units;
        boardBox.innerHTML = boardHtml({ zones: zones, units: units, flow: P.forecast(zones, units).flow, sel: sel, pv: p && p.zones ? sel : null });
      }

      function drawSheet() {
        var keep = sheetBox.firstChild && sheetBox.firstChild.firstChild ? sheetBox.firstChild.firstChild.scrollTop : 0;
        sheetBox.innerHTML = '';
        if (!sel) return;
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
          var ff = Z.FAC[fk], cv = Z.costOf(fk, z), vv = Z.valueOf(fk, z), cur = fk === k, have = RUN.gold + grantLeft(), poor = !cur && cv > have;
          h += '<button data-pick="' + fk + '" class="' + (cur ? 'cur' : '') + (pick === fk ? ' on' : '') + (poor ? ' poor' : '') + '"' + (cur ? ' disabled' : '') + '>' +
            '<b>' + ff.name + (cur ? ' (지금)' : '') + '</b><small>' + ff.st + (ff.kind === 'den' ? ' (' + Z.sizeOf(z) + '칸, 자리 ' + Z.slotsOf(fk, z) + ')' : ff.kind === 'trap' ? ' (피해 ' + Z.trapDmgOf(z) + ')' : '') + '</small>' +
            '<small>금 ' + cv + (vv ? ' · 가치 ' + vv : '') + (poor ? ' · <span class="lack">금 ' + (cv - have) + ' 모자람</span>' : '') + '</small></button>';
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
            '<div>던전 가치 ' + p.valueNow + ' → <b>' + p.valueAfter + '</b> (' + (dv >= 0 ? '+' : '') + dv + ')</div>' +
            (t !== 'yard' ? '<div>이 구역에 오는 침입자 ' + now + '명 → <b>' + after + '명</b></div>' : '') +
            (p.back ? '<div class="lack">든 몬스터 ' + p.back + '마리는 대기로 돌아가요</div>' : '') +
            (p.why ? '<div class="lack">' + p.why + '</div>' : '<div class="dim">지은 뒤에는 금을 돌려받지 못해요</div>') + '</div>';
        }
        h += '<div class="zact"><button class="btn" data-close>닫기</button><button class="btn primary" data-build' + (p && p.ok ? '' : ' disabled') + '>' +
          (p ? (p.ok ? '짓기 (' + (p.fromGrant > 0 ? '공사비 ' + p.fromGrant + (p.fromGold > 0 ? ' + 금 ' + p.fromGold : '') : '금 ' + p.cost) + ')' : '짓기') : '시설을 고르세요') + '</button></div></div>';
        var bg = api.div('zsheetbg', '<div class="zsheet">' + h + '</div>');
        sheetBox.appendChild(bg);
        bg.firstChild.scrollTop = keep;
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
          if (Z.FAC[pick].kind !== 'den') sel = null; // 대기실을 지었으면 시트를 열어 둬서 바로 몬스터를 넣게
          pick = null;
          if (!api.autoDeliver()) redraw();
        }
      });

      redraw();
    };
  };
})();
