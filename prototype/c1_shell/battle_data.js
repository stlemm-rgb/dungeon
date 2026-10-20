/* C1 전투 숫자·글 표 (한곳에 모음. 계산 없음, 모두 임시 숫자, 균형 맞추지 않음)
 *
 * 기준: docs/GAME_PLAN.md "플레이 흐름 (2026-10-21 사용자, 최우선)"
 *  - 매주 전투. 평소 = 일반 침입자, 예고 주·광고 = 대량 출현
 *  - 무리(등급 D·C·B·A·S)가 낮은 등급부터 대기 장소(야외)에 등장 -> 가장 높은 무리의 침입자 카드(비서) -> 10명 = 1분대로 진입
 *  - 가장 앞선 분대의 진행도 15·30·45·60%에서 이벤트 카드 (위·아래·왼쪽·오른쪽)
 *  - 1분(게임 시간) 제한, 지나면 남은 적은 퇴각
 * 쓰는 곳: progress.js(전투 계획·결과 반영), battle_sim.js(전투 계산), battle.js(화면)
 */
window.BATTLE_DATA = {
  GRADES: ['D', 'C', 'B', 'A', 'S'],
  SQUAD: 10,                 // 분대 하나 = 10명
  TIME_LIMIT: 60,            // 게임 초. 지나면 남은 적은 퇴각
  SPEEDS: [1, 2, 3, 5],      // 배속. 1배가 아니면 그 전투 이벤트 카드는 1장만
  CARD_AT: [15, 30, 45, 60], // 진행도(%)
  CARD_SLOW: 0.3,            // 카드가 떠 있는 동안 전투 속도
  CARD_LIFE: 6,              // 실제 초. 안 고르면 사라짐
  APPEAR_GAP: 0.9,           // 실제 초: 무리 등장 간격
  SECRETARY_LIFE: 4,         // 실제 초: 침입자 카드가 저절로 닫히기까지 (눌러도 닫힘)
  SQUAD_GAP: 1.6,            // 게임 초: 분대 진입 간격
  MOVE_SPEED: 0.32,          // 칸/게임 초
  TRAP_CHANCE: 0.85,         // 함정 발동 확률 (게임용 무작위)
  TRAP_EVERY: 1.2,           // 게임 초: 함정 구역 안에 있는 동안 발동을 다시 굴리는 간격
  THORN_DMG: 8,              // 덫 숲: 들어오기 전 전원 피해
  AMBUSH: 1.5,               // 함정 바로 뒤 대기실: 몬스터 피해 배율
  LVL_GROW: 0.03,            // 레벨 1당 침입자 체력·공격 +3%

  // 등급별 한 명 능력치와 처치 보상 (gem은 소수, 전투가 끝날 때 합쳐서 내림)
  GRADE_STAT: {
    D: { lvAdd: 0, hp: 24, atk: 1.5, gold: 6,  gem: 0.10, exp: 1 },
    C: { lvAdd: 2, hp: 32, atk: 2.0, gold: 8,  gem: 0.15, exp: 1 },
    B: { lvAdd: 4, hp: 42, atk: 2.6, gold: 11, gem: 0.25, exp: 2 },
    A: { lvAdd: 6, hp: 55, atk: 3.3, gold: 15, gem: 0.40, exp: 3 },
    S: { lvAdd: 8, hp: 70, atk: 4.0, gold: 20, gem: 0.60, exp: 4 }
  },
  // 짐꾼: 약하고(체력 배율, 공격 없음) 들고 있는 금이 많다. 뚫리면 많이 약탈한다
  PORTER: { hpMul: 0.6, goldMul: 2 },
  PORTER_MIN: 1, PORTER_MAX: 6,          // 분대 10명 중 짐꾼 수 범위 (무리마다 하나)
  LOOT_BASE: 40, LOOT_PER_PORTER: 25,    // 보물방에 닿은 분대 하나가 약탈하는 금 = 기본 + 살아 있는 짐꾼 수 × 이것
  LOOT_CAP: 0.3,                         // 한 전투 약탈은 가진 금의 30%까지 (금은 크게 잃지 않게)
  REPAIR_PER_HP: 0.5,                    // 몬스터가 잃은 체력 1당 수리 금

  // 전투 크기: 무리 등급 목록과 무리 하나의 분대 수 [최소, 최대]
  NORMAL: { grades: ['D', 'C'], squads: [1, 1] },
  SURGE: { grades: ['D', 'C', 'B', 'A', 'S'], squads: [1, 2] },
  BASE_LV: 3,                            // 평균 레벨 = BASE_LV + 명성 + 주/4 + 등급 lvAdd + 0~2
  SURGE_FIRST: 4, SURGE_GAP: [3, 4],     // 첫 대량 출현 주, 다음까지 간격(주)

  // 무리 이름 (등급마다)
  GROUP_NAMES: {
    D: ['마을 약초 채집꾼', '떠돌이 사냥꾼 무리', '초보 모험가 무리', '동굴 탐험 동호회'],
    C: ['황금 곰팡이 모험단', '동방 순례자', '용병 길드 견습대', '은빛 여우 모험단'],
    B: ['북부 왕국 은방패 기사단', '사막 도적단', '왕립 마법 학회 조사단', '붉은 깃발 용병단'],
    A: ['서쪽 왕국 흑철 기사단', '전설의 보물 사냥꾼', '대신전 순찰대'],
    S: ['용사 파티', '성왕국 성기사단', '왕실 근위대']
  },

  // 침입자 카드: 가장 높은 등급 무리가 나타나면 비서가 알려 주고 효과가 확정된다 (전투 끝까지)
  // fx: atk(침입자 공격 +비율) · def(받는 피해 -비율) · trap(함정 발동 확률 -비율) · speed(이동 +비율)
  INVADER_CARDS: [
    { id: 'paladin', tag: '성기사단', text: '침입자 전체 공격 +10% · 방어 +20%', fx: { atk: 0.10, def: 0.20 } },
    { id: 'disarm', tag: '함정 해체꾼', text: '함정 발동 확률 -90%', fx: { trap: 0.90 } },
    { id: 'scout', tag: '날쌘 척후대', text: '침입자 이동 +30%', fx: { speed: 0.30 } },
    { id: 'berserk', tag: '광전사', text: '침입자 공격 +30% · 방어 -10%', fx: { atk: 0.30, def: -0.10 } },
    { id: 'armor', tag: '두꺼운 갑옷', text: '침입자 방어 +30% · 이동 -10%', fx: { def: 0.30, speed: -0.10 } }
  ],
  SECRETARY: '비서',

  // 이벤트 카드: 4방향마다 효과가 다르다. 대부분 전투 끝까지 지속, 일회성(once)은 극단적인 것만
  // kind: trapDmg(함정 피해 +v) · trapRate(함정 발동 확률 +v) · monAtk(몬스터 공격 +v) · slow(침입자 이동 -v) · weak(침입자 받는 피해 +v)
  //       revive(once: 쓰러진 몬스터 모두 일으키고 체력 회복) · quake(once: 모든 침입자 체력 -v) · guard(once: 보물방 1회 무적, 처음 닿는 분대 퇴각)
  //       freeze(once: 모든 침입자 v초 멈춤)
  EVENT_CARDS: [
    { id: 'e1', title: '함정 정비공이 도착했다',
      up: { text: '함정 피해 +50%', kind: 'trapDmg', v: 0.5 }, down: { text: '함정 발동 +30%', kind: 'trapRate', v: 0.3 },
      left: { text: '몬스터 공격 +25%', kind: 'monAtk', v: 0.25 }, right: { text: '침입자 이동 -20%', kind: 'slow', v: 0.2 } },
    { id: 'e2', title: '몬스터들이 흥분했다',
      up: { text: '몬스터 공격 +50%', kind: 'monAtk', v: 0.5 }, down: { text: '쓰러진 몬스터 부활 (1회)', kind: 'revive', once: true },
      left: { text: '함정 피해 +30%', kind: 'trapDmg', v: 0.3 }, right: { text: '침입자 받는 피해 +15%', kind: 'weak', v: 0.15 } },
    { id: 'e3', title: '천장에 금이 갔다',
      up: { text: '천장 붕괴: 전원 체력 -40% (1회)', kind: 'quake', v: 0.4, once: true }, down: { text: '침입자 이동 -30%', kind: 'slow', v: 0.3 },
      left: { text: '함정 발동 +40%', kind: 'trapRate', v: 0.4 }, right: { text: '몬스터 공격 +30%', kind: 'monAtk', v: 0.3 } },
    { id: 'e4', title: '보물방 앞이 소란하다',
      up: { text: '보물방 1회 무적', kind: 'guard', once: true }, down: { text: '침입자 받는 피해 +25%', kind: 'weak', v: 0.25 },
      left: { text: '함정 피해 +40%', kind: 'trapDmg', v: 0.4 }, right: { text: '침입자 이동 -25%', kind: 'slow', v: 0.25 } },
    { id: 'e5', title: '독안개가 피어오른다',
      up: { text: '침입자 받는 피해 +30%', kind: 'weak', v: 0.3 }, down: { text: '함정 피해 +60%', kind: 'trapDmg', v: 0.6 },
      left: { text: '침입자 6초 멈춤 (1회)', kind: 'freeze', v: 6, once: true }, right: { text: '몬스터 공격 +40%', kind: 'monAtk', v: 0.4 } },
    { id: 'e6', title: '부대장이 지휘를 맡았다',
      up: { text: '몬스터 공격 +60%', kind: 'monAtk', v: 0.6 }, down: { text: '함정 발동 +50%', kind: 'trapRate', v: 0.5 },
      left: { text: '침입자 이동 -35%', kind: 'slow', v: 0.35 }, right: { text: '쓰러진 몬스터 부활 (1회)', kind: 'revive', once: true } }
  ],
  DIRS: ['up', 'down', 'left', 'right'],
  DIR_MARK: { up: '↑', down: '↓', left: '←', right: '→' },

  // 결과표 "이번 수입으로 할 수 있는 강화" (가짜 문구 포함)
  GEM_UPGRADE: { name: '몬스터 강화', cost: 5 } // 보석 5개당 (아직 준비 중)
};
