// 플레이 시안 공통 규칙. 칸 단위(A)와 방 단위(B)가 같은 숫자를 써서 공정하게 비교한다.
// 버려도 되는 코드. 본 게임 검사 규칙은 적용하지 않는다.
var PROTO = {
  budget: 150,
  demand: { text: '함정 비율 50% 초과 + 가치 100 이상', trapRatioOver: 0.5, minValue: 100 },
  invader: { name: '모험가', hp: 180, atk: 14 },
  ambush: 1.5, // 함정에 걸린 직후 싸우는 부대의 공격 배수
  items: {
    spike: { name: '가시 함정', short: '가시', kind: 'trap', cost: 10, value: 6, dmg: 8 },
    rock: { name: '낙석 함정', short: '낙석', kind: 'trap', cost: 20, value: 14, dmg: 20 },
    gob: { name: '고블린 부대', short: '고블린', kind: 'unit', cost: 15, value: 14, hp: 20, atk: 5 },
    skel: { name: '해골 부대', short: '해골', kind: 'unit', cost: 25, value: 24, hp: 30, atk: 8 },
    orc: { name: '오크 부대', short: '오크', kind: 'unit', cost: 40, value: 40, hp: 55, atk: 11 }
  },
  order: ['spike', 'rock', 'gob', 'skel', 'orc']
};

// 배치된 것들(id 목록)로 요구 충족 여부를 계산한다.
PROTO.summary = function (ids) {
  var s = { cost: 0, value: 0, traps: 0, count: ids.length };
  ids.forEach(function (id) {
    var it = PROTO.items[id];
    s.cost += it.cost;
    s.value += it.value;
    if (it.kind === 'trap') s.traps++;
  });
  s.ratio = s.count ? s.traps / s.count : 0;
  s.ratioOk = s.ratio > PROTO.demand.trapRatioOver;
  s.valueOk = s.value >= PROTO.demand.minValue;
  s.budgetOk = s.cost <= PROTO.budget;
  s.ok = s.ratioOk && s.valueOk && s.budgetOk;
  return s;
};

// steps: 침입자가 만나는 순서대로 [{at, id(없으면 빈 칸), ambush}]. at은 화면이 쓰는 위치.
// 돌려주는 frames는 화면이 한 장씩 보여 준다.
PROTO.simulate = function (steps) {
  var inv = PROTO.invader, hp = inv.hp, frames = [], lost = [];
  for (var i = 0; i < steps.length; i++) {
    var st = steps[i], it = st.id ? PROTO.items[st.id] : null, text = null;
    if (it && it.kind === 'trap') {
      hp -= it.dmg;
      text = it.name + '! ' + inv.name + ' -' + it.dmg;
    } else if (it) {
      var atk = st.ambush ? Math.round(it.atk * PROTO.ambush) : it.atk;
      var uhp = it.hp, before = hp;
      while (hp > 0 && uhp > 0) {
        hp -= atk;
        if (hp <= 0) break;
        uhp -= inv.atk;
      }
      text = it.name + (st.ambush ? ' 기습(공격 ' + atk + ')' : '') + ': ' + inv.name + ' -' + (before - Math.max(hp, 0)) +
        (uhp <= 0 ? ', 부대 전멸' : ', 부대 생존(체력 ' + uhp + ')');
      if (uhp <= 0) lost.push(st.id);
    }
    frames.push({ at: st.at, hp: Math.max(hp, 0), text: text, hit: !!it });
    if (hp <= 0) return { blocked: true, hp: 0, frames: frames, lost: lost };
  }
  return { blocked: false, hp: hp, frames: frames, lost: lost };
};
