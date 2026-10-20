/* C1 홈 대기 화면 무대: 비스듬히 내려다보는(아이소메트릭) 방의 표(캐릭터·가구·벽 소품)와 그림(SVG 글자) 만들기.
 *
 * - 이 파일은 데이터 표와 좌표 계산, SVG 글자 만들기만 한다. 화면에 붙이고 걷게 하는 일은 shell.js 홈 화면.
 * - 색은 하나도 쓰지 않는다. 모든 칠은 class 이름만 붙이고, 실제 색은 shell.css 맨 위 변수(--wood-t, --room-wall-l …)가 정한다.
 * - 방 좌표 = 칸 좌표(gx, gy). 뒤쪽 모서리가 (0,0), 앞쪽 모서리가 (6,6).
 *     gx 가 클수록 오른쪽 아래로, gy 가 클수록 왼쪽 아래로 온다. 왼쪽 벽은 gx=0, 오른쪽 벽은 gy=0.
 * - 나중에 도트 그림으로 바꿀 때: ACTORS 표 한 줄(w·h 와 그림 파일)과 FURNITURE·WALL_PROPS 표를 고치면 된다.
 */
(function () {
  'use strict';

  var W = 360, H = 400;          // 무대 좌표 크기 (화면에서는 가로 폭에 맞춰 늘어남)
  var TW = 26, TH = 13;          // 바닥 칸 하나의 반폭·반높이 (2:1 마름모)
  var N = 6;                     // 바닥은 6x6칸
  var OX = 180, OY = 170;        // 뒤쪽 모서리의 화면 위치
  var WALL = 104;                // 벽 높이
  var SLAB = 10;                 // 바닥 두께

  // 칸 좌표 + 높이 -> 무대 좌표
  function iso(gx, gy, z) { return [OX + (gx - gy) * TW, OY + (gx + gy) * TH - (z || 0)]; }
  function feet(gx, gy) { var p = iso(gx, gy, 0); return { x: p[0], y: p[1] }; }
  // 무대 좌표(바닥 위) -> 칸 좌표
  function grid(x, y) { var a = (x - OX) / TW, b = (y - OY) / TH; return [(b + a) / 2, (b - a) / 2]; }

  // 캐릭터 자리. at = 처음 서는 곳, spots = 가끔 걸어가는 곳 (가구와 겹치지 않게 골라 둔 칸). w·h = 도트 그림 크기 (무대 좌표)
  // 몬스터는 홈에 두지 않는다 (기획 결정).
  var ACTORS = [
    { id: 'demon', name: '은발 마왕', tag: '마왕', w: 34, h: 54, at: [1.2, 3.3], boss: true,
      spots: [[1.2, 3.3], [1.8, 1.7], [2.0, 4.2], [1.5, 2.6]],
      lines: ['흥, 이번엔 제대로 지어 와.', '늦으면 보수 깎는다. 알겠어?', '...기대 같은 건 안 하니까.'] },
    { id: 'boss', name: '소장', tag: '소장', w: 30, h: 48, at: [2.6, 2.4],
      spots: [[2.6, 2.4], [4.2, 2.8], [2.4, 4.6], [3.9, 4.6]],
      lines: ['오늘도 안전 제일입니다.', '도면은 머릿속에 다 있죠.', '납기만 맞추면 됩니다.'] },
    { id: 'secretary', name: '비서', tag: '비서', w: 30, h: 48, at: [4.4, 2.0],
      spots: [[4.4, 2.0], [3.6, 2.6], [5.2, 1.9], [2.8, 1.7]],
      lines: ['이번 주 침입자 정보는 정리해 뒀어요.', '결재 서류가 쌓였습니다, 소장님.', '마왕님 기분을 살피는 것도 업무예요.'] },
    { id: 'captain1', name: '부대장 1', tag: '부대1', w: 30, h: 48, at: [1.6, 5.0],
      spots: [[1.6, 5.0], [1.2, 4.2], [2.0, 4.9], [4.0, 5.0]],
      lines: ['명령만 내리십시오.', '침입자는 제가 막죠.', '오늘 훈련은 끝났습니다.'] },
    { id: 'captain2', name: '부대장 2', tag: '부대2', w: 30, h: 48, at: [5.0, 4.0],
      spots: [[5.0, 4.0], [4.4, 4.6], [5.2, 4.8], [3.8, 4.6]],
      lines: ['방패는 언제든 준비돼 있습니다.', '문 앞은 맡겨 주십시오.', '...배가 고픈데요.'] }
  ];

  // 바닥 가구. 상자 모양: x0~x1, y0~y1 (칸), h = 높이, z0 = 띄운 높이(위에 올린 물건), m = 재질 (shell.css 의 .m-재질)
  var RUG = { x0: 2.0, x1: 4.4, y0: 2.6, y1: 4.6, inset: 0.25 };
  var FURNITURE = [
    // 소장 책상과 서류, 안전모, 스탠드
    { x0: 2.4, x1: 4.4, y0: 0.2, y1: 1.2, h: 24, m: 'wood' },
    { x0: 2.55, x1: 3.15, y0: 0.4, y1: 1.0, z0: 24, h: 3, m: 'paper' },
    { x0: 3.25, x1: 3.65, y0: 0.5, y1: 0.9, z0: 24, h: 7, m: 'hazard' },
    { x0: 3.9, x1: 4.15, y0: 0.45, y1: 0.7, z0: 24, h: 16, m: 'metal' },
    // 책상 의자
    { x0: 3.1, x1: 3.7, y0: 1.4, y1: 2.0, h: 12, m: 'cloth' },
    { x0: 3.1, x1: 3.7, y0: 1.9, y1: 2.05, z0: 12, h: 22, m: 'cloth' },
    // 마왕 옥좌 (등받이, 앉는 곳, 팔걸이 둘)
    { x0: 0.2, x1: 0.45, y0: 1.0, y1: 2.0, h: 54, m: 'dark' },
    { x0: 0.45, x1: 1.25, y0: 1.0, y1: 2.0, h: 16, m: 'dark' },
    { x0: 0.45, x1: 1.25, y0: 1.0, y1: 1.15, z0: 16, h: 9, m: 'metal' },
    { x0: 0.45, x1: 1.25, y0: 1.85, y1: 2.0, z0: 16, h: 9, m: 'metal' },
    // 가운데 낮은 탁자와 현장 지도
    { x0: 2.9, x1: 3.7, y0: 3.2, y1: 4.0, h: 14, m: 'wood' },
    { x0: 3.0, x1: 3.6, y0: 3.3, y1: 3.9, z0: 14, h: 1.5, m: 'paper' },
    // 자재 더미
    { x0: 4.8, x1: 5.6, y0: 2.4, y1: 3.1, h: 22, m: 'crate' },
    { x0: 4.9, x1: 5.5, y0: 3.1, y1: 3.7, h: 14, m: 'stone' },
    { x0: 5.0, x1: 5.5, y0: 2.5, y1: 3.0, z0: 22, h: 12, m: 'stone' },
    // 서류 캐비닛
    { x0: 0.2, x1: 0.9, y0: 4.9, y1: 5.8, h: 44, m: 'metal' },
    { x0: 0.25, x1: 0.9, y0: 4.95, y1: 5.75, z0: 44, h: 3, m: 'paper' },
    // 대기용 긴 의자 (등받이, 앉는 곳)
    { x0: 2.1, x1: 3.6, y0: 5.2, y1: 5.4, h: 30, m: 'cloth' },
    { x0: 2.1, x1: 3.6, y0: 5.4, y1: 5.9, h: 14, m: 'cloth' },
    // 문 앞 경고 고깔
    { x0: 5.0, x1: 5.35, y0: 1.2, y1: 1.55, h: 12, m: 'hazard' }
  ];

  // 벽 소품. side: 'L' 왼쪽 벽(u = gy), 'R' 오른쪽 벽(u = gx). u0~u1 = 벽을 따라 가는 칸 수, v0~v1 = 바닥에서 높이
  var WALL_PROPS = [
    { kind: 'window',    side: 'L', u0: 0.6, u1: 1.9, v0: 52, v1: 98 },
    { kind: 'window',    side: 'L', u0: 5.0, u1: 5.8, v0: 52, v1: 98 },
    { kind: 'fireplace', side: 'L', u0: 3.3, u1: 4.8, v0: 0,  v1: 62 },
    { kind: 'board',     side: 'R', u0: 0.6, u1: 2.3, v0: 46, v1: 92 },
    { kind: 'sign',      side: 'R', u0: 2.7, u1: 4.1, v0: 58, v1: 88, text: '안전 제일' },
    { kind: 'door',      side: 'R', u0: 4.5, u1: 5.6, v0: 0,  v1: 76 }
  ];

  // ---------- SVG 글자 만들기 ----------
  function f1(n) { return Math.round(n * 10) / 10; }
  function pts(list) { return list.map(function (p) { return f1(p[0]) + ',' + f1(p[1]); }).join(' '); }
  function poly(cls, list) { return '<polygon class="' + cls + '" points="' + pts(list) + '"/>'; }
  // 벽 위의 점: (u, v) -> 무대 좌표
  function wp(side, u, v) { return side === 'L' ? [OX - u * TW, OY + u * TH - v] : [OX + u * TW, OY + u * TH - v]; }
  function wquad(side, cls, u0, u1, v0, v1) { return poly(cls, [wp(side, u0, v0), wp(side, u1, v0), wp(side, u1, v1), wp(side, u0, v1)]); }
  function wline(side, cls, u0, v0, u1, v1) { var a = wp(side, u0, v0), b = wp(side, u1, v1); return '<line class="' + cls + '" x1="' + f1(a[0]) + '" y1="' + f1(a[1]) + '" x2="' + f1(b[0]) + '" y2="' + f1(b[1]) + '"/>'; }

  function floorSvg() {
    var s = '';
    s += poly('slab-l', [iso(0, N, 0), iso(N, N, 0), iso(N, N, -SLAB), iso(0, N, -SLAB)]);
    s += poly('slab-r', [iso(N, 0, 0), iso(N, N, 0), iso(N, N, -SLAB), iso(N, 0, -SLAB)]);
    for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
      s += poly('ft ' + ((i + j) % 2 ? 'b' : 'a'), [iso(i, j), iso(i + 1, j), iso(i + 1, j + 1), iso(i, j + 1)]);
    }
    return s;
  }
  function wallsSvg() {
    var s = '';
    // 왼쪽 벽(gx=0), 오른쪽 벽(gy=0): 벽면, 아랫단 걸레받이, 윗단 장식
    s += wquad('L', 'wall-l', 0, N, 0, WALL) + wquad('R', 'wall-r', 0, N, 0, WALL);
    s += wquad('L', 'base', 0, N, 0, 8) + wquad('R', 'base', 0, N, 0, 8);
    s += wquad('L', 'trim', 0, N, WALL - 6, WALL) + wquad('R', 'trim', 0, N, WALL - 6, WALL);
    // 벽돌 줄 (가로)
    [30, 56, 82].forEach(function (v) { s += wline('L', 'brick', 0, v, N, v) + wline('R', 'brick', 0, v, N, v); });
    // 뒤쪽 모서리 기둥
    s += '<line class="post" x1="' + OX + '" y1="' + OY + '" x2="' + OX + '" y2="' + (OY - WALL) + '"/>';
    return s;
  }
  function propSvg(p) {
    var s = '', sd = p.side, g;
    if (p.kind === 'window') {
      var m = (p.u0 + p.u1) / 2, vm = (p.v0 + p.v1) / 2;
      s += wquad(sd, 'frame', p.u0, p.u1, p.v0, p.v1);
      s += wquad(sd, 'glass', p.u0 + 0.08, p.u1 - 0.08, p.v0 + 4, p.v1 - 4);
      s += wquad(sd, 'glass-lo', p.u0 + 0.08, p.u1 - 0.08, p.v0 + 4, vm - 4);
      s += poly('moon', [wp(sd, p.u0 + 0.16, vm + 7), wp(sd, p.u0 + 0.34, vm + 7), wp(sd, p.u0 + 0.34, vm + 19), wp(sd, p.u0 + 0.16, vm + 19)]);
      s += wline(sd, 'mullion', m, p.v0 + 4, m, p.v1 - 4) + wline(sd, 'mullion', p.u0 + 0.08, vm, p.u1 - 0.08, vm);
      s += wquad(sd, 'sill', p.u0 - 0.1, p.u1 + 0.1, p.v0 - 4, p.v0);
    } else if (p.kind === 'fireplace') {
      var um = (p.u0 + p.u1) / 2;
      s += wquad(sd, 'hearth', p.u0, p.u1, p.v0, p.v1);
      s += wquad(sd, 'mantel', p.u0 - 0.12, p.u1 + 0.12, p.v1, p.v1 + 6);
      s += wquad(sd, 'firebox', p.u0 + 0.25, p.u1 - 0.25, 0, 40);
      // 불꽃 셋 (깜빡임은 css)
      s += '<g class="flame">' + poly('fire a', [wp(sd, um - 0.3, 0), wp(sd, um + 0.3, 0), wp(sd, um + 0.12, 26), wp(sd, um, 20), wp(sd, um - 0.14, 30)]) +
        poly('fire b', [wp(sd, um - 0.16, 0), wp(sd, um + 0.18, 0), wp(sd, um + 0.02, 15)]) + '</g>';
    } else if (p.kind === 'board') {
      s += wquad(sd, 'board', p.u0, p.u1, p.v0, p.v1);
      s += wquad(sd, 'paper', p.u0 + 0.1, p.u1 - 0.1, p.v0 + 5, p.v1 - 5);
      [0.3, 0.55, 0.8].forEach(function (k) {
        var v = p.v0 + 5 + (p.v1 - p.v0 - 10) * k;
        s += wline(sd, 'ink', p.u0 + 0.22, v, p.u0 + 0.22 + (p.u1 - p.u0 - 0.44) * (k === 0.55 ? 0.6 : 1), v);
      });
      s += wline(sd, 'ink', p.u0 + 0.22, p.v0 + 9, p.u1 - 0.3, p.v1 - 9);
    } else if (p.kind === 'sign') {
      s += wquad(sd, 'plate', p.u0, p.u1, p.v0, p.v1);
      s += '<polygon class="hzband" points="' + pts([wp(sd, p.u0, p.v1 - 9), wp(sd, p.u1, p.v1 - 9), wp(sd, p.u1, p.v1), wp(sd, p.u0, p.v1)]) + '"/>';
      g = wp(sd, p.u0 + 0.12, p.v0 + 8);
      s += '<text class="signtext" transform="matrix(1 .5 0 1 ' + f1(g[0]) + ' ' + f1(g[1]) + ')" textLength="' + f1((p.u1 - p.u0 - 0.24) * TW) + '" lengthAdjust="spacingAndGlyphs">' + p.text + '</text>';
    } else if (p.kind === 'door') {
      s += wquad(sd, 'doorframe', p.u0 - 0.08, p.u1 + 0.08, 0, p.v1 + 5);
      s += wquad(sd, 'door', p.u0, p.u1, 0, p.v1);
      s += wline(sd, 'plank', (p.u0 + p.u1) / 2, 0, (p.u0 + p.u1) / 2, p.v1);
      s += wquad(sd, 'doorplate', p.u0 + 0.2, p.u1 - 0.2, p.v1 - 22, p.v1 - 8);
      g = wp(sd, p.u1 - 0.22, 36);
      s += '<ellipse class="knob" cx="' + f1(g[0]) + '" cy="' + f1(g[1]) + '" rx="2.2" ry="2.8"/>';
    }
    return s;
  }
  function boxSvg(b) {
    var z0 = b.z0 || 0, z1 = z0 + b.h;
    return '<g class="m-' + b.m + '">' +
      poly('fl', [iso(b.x0, b.y1, z0), iso(b.x1, b.y1, z0), iso(b.x1, b.y1, z1), iso(b.x0, b.y1, z1)]) +
      poly('fr', [iso(b.x1, b.y0, z0), iso(b.x1, b.y1, z0), iso(b.x1, b.y1, z1), iso(b.x1, b.y0, z1)]) +
      poly('t', [iso(b.x0, b.y0, z1), iso(b.x1, b.y0, z1), iso(b.x1, b.y1, z1), iso(b.x0, b.y1, z1)]) + '</g>';
  }
  function rugSvg() {
    var r = RUG, k = r.inset;
    return poly('rug-a', [iso(r.x0, r.y0), iso(r.x1, r.y0), iso(r.x1, r.y1), iso(r.x0, r.y1)]) +
      poly('rug-b', [iso(r.x0 + k, r.y0 + k), iso(r.x1 - k, r.y0 + k), iso(r.x1 - k, r.y1 - k), iso(r.x0 + k, r.y1 - k)]);
  }

  // 방 전체 SVG. 뒤에서 앞으로 겹쳐 그린다 (바닥 -> 벽 -> 벽 소품 -> 러그 -> 가구)
  function roomSvg() {
    var s = '<svg class="room" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">';
    s += '<defs><pattern id="hz" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">' +
      '<rect class="hz-a" x="0" y="0" width="4" height="8"/><rect class="hz-b" x="4" y="0" width="4" height="8"/></pattern></defs>';
    s += floorSvg() + wallsSvg();
    WALL_PROPS.forEach(function (p) { s += propSvg(p); });
    s += rugSvg();
    FURNITURE.map(function (b, i) { return { b: b, i: i, d: (b.x0 + b.x1 + b.y0 + b.y1) / 2 + (b.z0 || 0) * 0.001 }; })
      .sort(function (a, c) { return a.d - c.d || a.i - c.i; })
      .forEach(function (e) { s += boxSvg(e.b); });
    return s + '</svg>';
  }

  // 걸어갈 곳 고르기: 지금 칸에서 가깝지 않고, 다른 사람이 서 있거나 가는 곳과 겹치지 않는 칸 중에서 무작위(rnd = fxRandom)
  function pickSpot(actor, now, taken, rnd) {
    var ok = actor.spots.filter(function (sp) {
      if (Math.abs(sp[0] - now[0]) + Math.abs(sp[1] - now[1]) < 0.6) return false;
      var a = feet(sp[0], sp[1]); // 화면에서 겹치지 않을 만큼 떨어진 곳만 (가로 34 이상 또는 세로 44 이상)
      return taken.every(function (t) { var b = feet(t[0], t[1]); return Math.abs(a.x - b.x) >= 34 || Math.abs(a.y - b.y) >= 44; });
    });
    return ok.length ? ok[Math.floor(rnd() * ok.length)] : null;
  }

  window.STAGE = {
    W: W, H: H, ACTORS: ACTORS, FURNITURE: FURNITURE, WALL_PROPS: WALL_PROPS,
    iso: iso, feet: feet, grid: grid, roomSvg: roomSvg, pickSpot: pickSpot
  };
})();
