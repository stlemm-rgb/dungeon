// 시안 공통 화면: 요구 카드, 고르기 막대, 버튼, 기록, 결과. 판(board)은 각 시안이 그린다.
// cfg: { title, other:{href,label}, rule, placed() -> id 목록, steps() -> simulate용 steps,
//        render(boardEl, invaderAt), clear() }
var UI = {
  tool: 'spike', // 고른 것 (id 또는 'erase')
  running: false,

  init: function (cfg) {
    UI.cfg = cfg;
    document.title = cfg.title;
    document.body.innerHTML =
      '<header><h1>' + cfg.title + '</h1><a href="' + cfg.other.href + '">' + cfg.other.label + ' →</a></header>' +
      '<section class="card" id="demand"></section>' +
      '<div class="palette" id="palette"></div>' +
      '<p class="rule">' + cfg.rule + '</p>' +
      '<div id="board"></div>' +
      '<div class="buttons"><button id="go" class="primary">침입 시작</button><button id="clear">전부 지우기</button></div>' +
      '<ol class="log" id="log"></ol>' +
      '<div class="result hidden" id="result"></div>';
    UI.board = document.getElementById('board');
    UI.buildPalette();
    document.getElementById('go').onclick = UI.invade;
    document.getElementById('clear').onclick = function () { if (!UI.running) { cfg.clear(); UI.refresh(); } };
    UI.refresh();
  },

  buildPalette: function () {
    var el = document.getElementById('palette'), html = '';
    PROTO.order.forEach(function (id) {
      var it = PROTO.items[id];
      var stat = it.kind === 'trap' ? '피해 ' + it.dmg : '체력 ' + it.hp + ' 공격 ' + it.atk;
      html += '<button data-id="' + id + '" class="' + it.kind + '"><b>' + it.short + '</b>' +
        '<span>금 ' + it.cost + ' · 가치 ' + it.value + '</span><span>' + stat + '</span></button>';
    });
    html += '<button data-id="erase" class="erase"><b>지우기</b><span>놓은 것 빼기</span></button>';
    el.innerHTML = html;
    el.onclick = function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      UI.tool = b.getAttribute('data-id');
      UI.markPalette();
    };
    UI.markPalette();
  },

  markPalette: function () {
    document.querySelectorAll('#palette button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-id') === UI.tool);
    });
  },

  // 판 칸을 눌렀을 때 각 시안이 부른다. 현재 값(id 또는 null)을 받아 새 값을 돌려준다.
  apply: function (current) {
    if (UI.running) return current;
    if (UI.tool === 'erase') return null;
    if (current === UI.tool) return null; // 같은 걸 다시 누르면 빼기
    var ids = UI.cfg.placed(), cost = PROTO.summary(ids).cost - (current ? PROTO.items[current].cost : 0);
    if (cost + PROTO.items[UI.tool].cost > PROTO.budget) { UI.flash('금화가 모자라요'); return current; }
    return UI.tool;
  },

  refresh: function (invaderAt) {
    var s = PROTO.summary(UI.cfg.placed()), d = PROTO.demand;
    function row(ok, label, val) { return '<li class="' + (ok ? 'ok' : 'no') + '">' + (ok ? '✔' : '✘') + ' ' + label + ' <b>' + val + '</b></li>'; }
    document.getElementById('demand').innerHTML =
      '<div class="who">마왕의 요구</div><div class="want">' + d.text + '</div><ul>' +
      row(s.ratioOk, '함정 비율', Math.round(s.ratio * 100) + '% (' + s.traps + '/' + s.count + ')') +
      row(s.valueOk, '던전 가치', s.value + ' / ' + d.minValue) +
      row(s.budgetOk, '금화', s.cost + ' / ' + PROTO.budget) + '</ul>' +
      '<div class="enemy">침입자: ' + PROTO.invader.name + ' 체력 ' + PROTO.invader.hp + ' · 공격 ' + PROTO.invader.atk + '</div>';
    UI.cfg.render(UI.board, invaderAt);
  },

  flash: function (msg) {
    var r = document.getElementById('result');
    r.className = 'result toast';
    r.textContent = msg;
    clearTimeout(UI.flashTimer);
    UI.flashTimer = setTimeout(function () { r.className = 'result hidden'; }, 1200);
  },

  invade: function () {
    if (UI.running) return;
    var res = PROTO.simulate(UI.cfg.steps()), log = document.getElementById('log'), i = 0;
    UI.running = true;
    document.body.classList.add('running');
    log.innerHTML = '<li>' + PROTO.invader.name + '가 입구로 들어왔다. (체력 ' + PROTO.invader.hp + ')</li>';
    function next() {
      if (i >= res.frames.length) return UI.finish(res);
      var f = res.frames[i++];
      UI.refresh(f.at);
      if (f.text) {
        log.insertAdjacentHTML('beforeend', '<li>' + f.text + ' → 남은 체력 ' + f.hp + '</li>');
        log.lastChild.scrollIntoView({ block: 'nearest' });
      }
      setTimeout(next, f.hit ? 600 : 140);
    }
    next();
  },

  finish: function (res) {
    var s = PROTO.summary(UI.cfg.placed()), r = document.getElementById('result');
    var deliver = s.ok && res.blocked;
    var why = !s.ok ? '요구를 못 맞췄어요' : !res.blocked ? '모험가가 보물방까지 뚫었어요' : '요구 충족 + 방어 성공';
    r.className = 'result ' + (deliver ? 'win' : 'lose');
    r.innerHTML = '<h2>' + (res.blocked ? '막았다!' : '뚫렸다…') + '</h2>' +
      '<p>남은 모험가 체력 <b>' + res.hp + '</b> · 잃은 부대 <b>' + res.lost.length + '</b></p>' +
      '<p>던전 가치 <b>' + s.value + '</b> · 함정 비율 <b>' + Math.round(s.ratio * 100) + '%</b></p>' +
      '<p class="verdict">' + (deliver ? '납품 가능!' : '납품 불가') + ' — ' + why + '</p>' +
      '<button id="again" class="primary">다시 배치</button>';
    document.getElementById('again').onclick = function () {
      r.className = 'result hidden';
      UI.running = false;
      document.body.classList.remove('running');
      UI.refresh();
    };
  }
};
