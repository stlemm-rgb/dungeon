/* D1 데모 숫자·글 표 (한곳에 모음. 계산 없음, 모두 임시 숫자). 전투 숫자 + 데모 규칙(의뢰·납품 기준·부족·회사 레벨·고정 구역·끈 기능)
 *
 * 기준: docs/GAME_PLAN.md "플레이 흐름 (2026-10-21)" + 2026-10-22·23 절, docs/GAME_STRUCTURE.md 3·6절. 아래 DEMO 이후가 D1에서 새로 생긴 표
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
  CARD_SLOW: 0.3,            // (안 씀) 예전: 카드가 떠 있는 동안 전투 속도. 지금은 카드 전용 화면이 뜨면 전투가 완전히 멈춘다
  CARD_LIFE: 6,              // (안 씀) 예전: 안 고르면 사라짐. 지금은 고를 때까지 기다린다
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
                                         // 약탈 한도 = 이번 전투에서 번 금 (사용자 10-21. 보물방은 미끼라 원래 가진 금은 안 잃음. progress.js applyBattle)
  REPAIR_PER_HP: 0.5,                    // 몬스터가 잃은 체력 1당 수리 금

  // 전투 크기: 무리 등급 목록과 무리 하나의 분대 수 [최소, 최대]
  NORMAL: { grades: ['D', 'C'], squads: [1, 1] },
  SURGE: { grades: ['D', 'C', 'B', 'A', 'S'], squads: [1, 2] },
  SURGE_FIRST: 4, SURGE_GAP: [3, 4],     // 첫 대량 출현 주, 다음까지 간격(주)

  // 침입자 강함은 던전 가치(= 던전 레벨)에 맞춘다. 새 부지는 인지도가 낮아 약한 적이 온다 (사용자 10-21)
  //  D1: 아래 "가치"는 위협 점수 = 던전 가치 + 던전 전투력 (가치가 시설만 세게 바뀌어서. progress.js threatOf)
  //  던전 레벨 = 위협 점수 ÷ VALUE_PER_DLV (내림)
  //  무리 평균 레벨 = BASE_LV + 던전 레벨 + (회사 레벨 - 1) ÷ CLV_PER_LV (내림) + 등급 lvAdd + 0~2   (D1: 명성 대신 회사 레벨)
  //  힘 배율(체력·공격) = POWER_MIN + (1 - POWER_MIN) × min(1, 위협 점수 ÷ POWER_FULL_VALUE)
  //  주 시작에 계획을 만들고, 건설로 가치가 바뀌면 홈 알림이 따라 바뀐다. "다음 주"를 누르는 순간(전투 시작) 확정
  //  근거(측정, 일반 침입 60판): 가운데 함정 3곳(가치 50) 방어율 L5 ×1 = 82%, 대량 출현은 L3 ×0.6 = 80% · L9 ×1 = 52% · L20 ×1 = 20%
  BASE_LV: 3,
  VALUE_PER_DLV: 40,                     // 가치 40마다 던전 레벨 +1 (다 지은 판 ~480 = 12)
  CLV_PER_LV: 2,                         // 회사 레벨 2마다 침입자 레벨 +1 (D1: 옛 명성 FAME_PER_LV 대신)
  POWER_MIN: 0.6, POWER_FULL_VALUE: 200, // 가치 0이면 힘 ×0.6, 가치 200 이상이면 ×1

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
  SECRETARY_ART: 'secretary', // 침입자 카드 그림 키 (카드 전용 화면 그림 자리의 data-art. 실제 그림 파일은 나중에 외부에서 들어옴)

  // 던전 속성 (의뢰마다 1개, 첫 버전은 "주된 피해 종류"만. GAME_PLAN "새 의뢰를 받는 주", 토론 C6). 모두 임시
  // fx는 침입자 카드 fx와 같은 모양: 그 부지의 모든 전투에서 침입자 카드 효과에 더해진다 (battle_sim.js)
  // counter = 내 대응 수단. 우리 함정·몬스터에는 아직 피해 종류가 없어서 정직하게 "아직 없음"
  ATTRS: [
    { id: 'phys', label: '물리', effect: '침입자가 두꺼운 갑옷을 입고 옴: 받는 피해 -10%', fx: { def: 0.10 },
      counter: '아직 없음 (연구실에서 해금 예정)' },
    { id: 'magic', label: '마법', effect: '침입자 중 마법사가 함정을 감지: 함정 발동 확률 -20%', fx: { trap: 0.20 },
      counter: '아직 없음 (연구실에서 해금 예정)' },
    { id: 'ether', label: '에테르', effect: '침입자가 에테르로 몸이 가벼움: 이동 +15%', fx: { speed: 0.15 },
      counter: '아직 없음 (연구실에서 해금 예정)' }
  ],

  // 이벤트 카드: 4방향마다 효과가 다르다. 대부분 전투 끝까지 지속, 일회성(once)은 극단적인 것만
  // kind: trapDmg(함정 피해 +v) · trapRate(함정 발동 확률 +v) · monAtk(몬스터 공격 +v) · slow(침입자 이동 -v) · weak(침입자 받는 피해 +v)
  //       revive(once: 쓰러진 몬스터 모두 일으키고 체력 회복) · quake(once: 모든 침입자 체력 -v) · guard(once: 보물방 1회 무적, 처음 닿는 분대 퇴각)
  //       freeze(once: 모든 침입자 v초 멈춤)
  // 표시용: art = 그림 키(카드 전용 화면 그림 자리의 data-art), artName = 그림 자리에 보이는 이름, desc = 설명 2줄
  EVENT_CARDS: [
    { id: 'e1', art: 'trap_mechanic', artName: '함정 정비공', desc: '잔뜩 긴장한 정비공이 도구함을 들고 달려왔다.', title: '함정 정비공이 도착했다',
      up: { text: '함정 피해 +50%', kind: 'trapDmg', v: 0.5 }, down: { text: '함정 발동 +30%', kind: 'trapRate', v: 0.3 },
      left: { text: '몬스터 공격 +25%', kind: 'monAtk', v: 0.25 }, right: { text: '침입자 이동 -20%', kind: 'slow', v: 0.2 } },
    { id: 'e2', art: 'excited_monsters', artName: '흥분한 몬스터', desc: '던전 깊은 곳에서 포효가 울린다. 몬스터들의 눈이 번뜩인다.', title: '몬스터들이 흥분했다',
      up: { text: '몬스터 공격 +50%', kind: 'monAtk', v: 0.5 }, down: { text: '쓰러진 몬스터 부활 (1회)', kind: 'revive', once: true },
      left: { text: '함정 피해 +30%', kind: 'trapDmg', v: 0.3 }, right: { text: '침입자 받는 피해 +15%', kind: 'weak', v: 0.15 } },
    { id: 'e3', art: 'ceiling_crack', artName: '갈라진 천장', desc: '쿵, 하고 먼지가 떨어진다. 천장이 오래 버티진 못할 것 같다.', title: '천장에 금이 갔다',
      up: { text: '천장 붕괴: 전원 체력 -40% (1회)', kind: 'quake', v: 0.4, once: true }, down: { text: '침입자 이동 -30%', kind: 'slow', v: 0.3 },
      left: { text: '함정 발동 +40%', kind: 'trapRate', v: 0.4 }, right: { text: '몬스터 공격 +30%', kind: 'monAtk', v: 0.3 } },
    { id: 'e4', art: 'treasure_commotion', artName: '보물방 앞', desc: '보물방 문 앞에서 수상한 소리가 난다. 서둘러 손을 써야 한다.', title: '보물방 앞이 소란하다',
      up: { text: '보물방 1회 무적', kind: 'guard', once: true }, down: { text: '침입자 받는 피해 +25%', kind: 'weak', v: 0.25 },
      left: { text: '함정 피해 +40%', kind: 'trapDmg', v: 0.4 }, right: { text: '침입자 이동 -25%', kind: 'slow', v: 0.25 } },
    { id: 'e5', art: 'poison_fog', artName: '독안개', desc: '복도에 보랏빛 안개가 퍼진다. 숨을 쉬기 어려워 보인다.', title: '독안개가 피어오른다',
      up: { text: '침입자 받는 피해 +30%', kind: 'weak', v: 0.3 }, down: { text: '함정 피해 +60%', kind: 'trapDmg', v: 0.6 },
      left: { text: '침입자 6초 멈춤 (1회)', kind: 'freeze', v: 6, once: true }, right: { text: '몬스터 공격 +40%', kind: 'monAtk', v: 0.4 } },
    { id: 'e6', art: 'squad_leader', artName: '부대장', desc: '부대장이 직접 나서서 몬스터들의 자리를 잡아 준다.', title: '부대장이 지휘를 맡았다',
      up: { text: '몬스터 공격 +60%', kind: 'monAtk', v: 0.6 }, down: { text: '함정 발동 +50%', kind: 'trapRate', v: 0.5 },
      left: { text: '침입자 이동 -35%', kind: 'slow', v: 0.35 }, right: { text: '쓰러진 몬스터 부활 (1회)', kind: 'revive', once: true } }
  ],
  DIRS: ['up', 'down', 'left', 'right'],
  DIR_MARK: { up: '↑', down: '↓', left: '←', right: '→' },
  DIR_LABEL: { up: '지휘', down: '보호', left: '시설', right: '부대' }, // 카드 전용 화면 가장자리 글의 분야 이름 (분야 고정, 토론 결과). 효과 내용은 카드 데이터 그대로

  // 결과표 "이번 수입으로 할 수 있는 강화" (가짜 문구 포함)
  GEM_UPGRADE: { name: '몬스터 강화', cost: 5 }, // 신석 5개당 (아직 준비 중)

  // ===================== DEMO (D1에서 새로 생긴 표. 쓰는 곳: progress.js·zones.js·battle_sim.js) =====================

  START: { gold: 0, gems: 0 },  // 새 게임 회사 금·신석 (회사 금은 영구 재화. 건설·조달은 마석)

  // 데모에서 끈 기능 (true = 꺼짐). 화면만 숨기지 않고 지급 경로까지 막는다 (progress.js). 코드는 남아 있다
  //  gacha 광고 뽑기 · adSurge 광고 보고 대량 출현 · surge 예고된 대량 출현 · chores 일일/주간 업무 · idle 방치 보상 · workshop 공방 강화
  DEMO_OFF: { gacha: true, adSurge: true, surge: true, chores: true, idle: true, workshop: true },

  // 데모 시설: 방(room)에 지을 수 있는 시설 id (zones.js FAC). 입구는 분기(split, 갈림길)로 고정, 야외는 숲만
  //  입구 '대기'(wait, 전원 가운데 길로)는 사용자 플레이 소감(2026-10-23) 뒤 다시 엶: 갈림길 판(두 번째 의뢰)에서 "입구에 대기 -> 전원 가운데" 대응 수단
  DEMO_FACILITIES: { room: ['empty', 'trap', 'den', 'lure'], entry: ['split', 'wait'], yard: ['forest'] },
  DEN_SLOTS_PER_CELL: 1,       // 몬스터 대기실 칸 하나에 부대(또는 친위대) 하나
  // 몬스터 대기실을 지으면 기본 부대(MON_SQUAD_FREE와 같은 부족·인원, 무료)가 같이 들어옴 (사용자 플레이 소감 2026-10-23: 대기실 수에 비해 부대가 너무 적음).
  //  한 현장에서 받은 부대 수 <= 동시에 있었던 대기실 수의 최고치 (철거·재건·옮겨 짓기로는 더 안 생김. progress.js site.denGifts). 0이면 끔
  DEN_GIFT: 1,

  // 고정 구역 (의뢰마다 정해짐, 바꿀 수 없음). refs/draft_fixed_zones.md. zones.js가 FAC에 'fz_' + id 시설로 넣는다
  //  slow = 지나간 침입자 이동 감소 비율, span = 이 구역 포함 몇 구역 동안 (2 = 이 구역 + 다음 구역을 벗어날 때까지)
  FIXED_ZONES: {
    frozen_dock: { name: '얼어붙은 하역장', short: '하역장', look: '얼음 속 수레 옆에 \'제설 별도\' 팻말.', attr: '얼음',
      st: '지나간 침입자는 다음 구역을 벗어날 때까지 느려진다', slow: 0.4, span: 2, value: 0 }
  },

  // 몬스터 부족 (refs/draft_tribes.md 데모 2종). 능력치는 항목 표: base = 1명 처음 값, grow = 레벨 1당 base에 곱해 더하는 비율
  //  hp 체력 · atk 초당 공격 · def 받는 피해 감소 비율(0~DEF_MAX). 계산은 progress.js statOf 한곳
  //  grow 근거(측정): 레벨당 체력 0.12·공격 0.08이면 레벨 1 -> 4에서 최적 전투력이 141 -> 149로 거의 안 바뀌어 성장이 납품 기준에 안 보임 -> 둘 다 0.2
  //   2차(2026-10-23): 0.2로는 처음 하는 사람 배치(무료 기본 부대 하나)가 5단계에 부대 레벨 11이 필요해 첫 납품 10주 (frontend 실측). 원인 = 1차 측정은
  //   부대 조달·보충까지 하는 최적 배치 기준이었음. 부대 하나의 레벨이 납품 기준을 움직이게 0.5 (레벨당 그 부대 점수 +50%)
  STATS: [
    { key: 'hp', label: '체력' },
    { key: 'atk', label: '초당 공격' },
    { key: 'def', label: '방어(피해 감소)' }
  ],
  DEF_MAX: 0.8,
  TRIBES: [
    { id: 'stone', name: '돌등껍질족', role: '버팀', look: '짧은 팔다리에 네모난 돌껍질을 멘 회색 거북',
      talk: '“급하면 어제 오셨어야죠.”', feature: '단단한 껍질로 정면 공격을 버티며 침입자를 붙잡아 둔다.', attr: '물리·바위',
      guardName: '버팀돌', guardIntro: '검수관이 벽으로 착각해 두드려도 “근무 중입니다”만 반복하는 대장.',
      base: { hp: 120, atk: 5, def: 0.25 }, grow: { hp: 0.5, atk: 0.5, def: 0 } },
    { id: 'ember', name: '불씨도마뱀족', role: '공격', look: '붉은 몸에 노란 꼬리불이 붙은 짧은 도마뱀',
      talk: '“예열 끝! 뭐 태워요?”', feature: '불을 뿜어 맞은 침입자에게 화상을 남긴다.', attr: '마법·불',
      guardName: '꼬리불', guardIntro: '의뢰인의 “따뜻한 분위기”를 문자 그대로 받아들여 소장이 따라다니는 대장.',
      base: { hp: 70, atk: 11, def: 0 }, grow: { hp: 0.5, atk: 0.5, def: 0 } }
  ],
  // 부대 (같은 부족 몇 명 묶음). 조달은 마석으로만 (회사 금 안 씀)
  //  newCost = 새 부대(START명) 조달비 · memberCost = 1명 보충비 · cap = 정원 · FREE = 새 현장마다 무료 기본 부대
  MON_SQUAD: { start: 3, cap: 6, newCost: { stone: 40, ember: 50 }, memberCost: { stone: 12, ember: 15 } },
  MON_SQUAD_FREE: { tribe: 'stone', count: 3 },
  // 새 부대 시작 레벨 = 회사 레벨 칸의 값 (회사 레벨 1 = [0]. 표를 넘으면 마지막 값). 의뢰 기준보다 낮게
  SQUAD_START_LV: [1, 1, 2, 2, 3],
  // 친위대 (이름 있는 개체 1명). 능력치 = 그 부족 1명 값 × MUL (같은 레벨 기준). 최대 MAX명. 납품 때 부대 하나를 골라 대장을 친위대로
  GUARD: { max: 2, mul: { hp: 3, atk: 3, def: 1 } },
  // 경험치 = 출진·참여 단위 (막타 계산 없음). deploy = 대기실에 출진만 해도 · fight = 그 대기실이 실제로 싸웠으면 더
  //  근거(측정, 20시드 실제 전투): 출진 2·싸움 6이면 보통 배치가 5단계까지 평균 8.1주 -> 4·12로 최적 배치 2주 · 보통 배치 평균 4.5주 ("전투 3주 안팎")
  //   2차: 함정이 먼저 다 잡으면 대기실이 못 싸워 4만 받아 성장이 멈춤 -> 출진만 해도 크게(8), 싸우면 +8. 아래 QUESTS 측정 참고
  EXP: { deploy: 8, fight: 8 },
  // 부족 신석 강화 (영구): 단계마다 1명 base의 체력·공격 × PER (반올림, 최소 1)을 더함. 비용 = COSTS[단계] 신석. 데모는 MAX단계까지
  TRIBE_UP: { per: 0.10, costs: [3, 6, 10], max: 1 },

  // 작품집 효과 (확정 A, 2026-10-23): 작품이 needWorks개 이상이면 현장 부대 훈련(참여) 경험치 +squadExp. 작품 수만큼 쌓지 않음
  WORKS_EFFECT: { id: 'train', label: '훈련 노하우', text: '현장 부대 훈련 경험치 +10%', needWorks: 1, squadExp: 0.10 },

  // 회사 레벨 (대표 성장 수치). NEED[i] = 레벨 i+1 -> i+2에 필요한 경험치. 표를 넘으면 마지막 값
  //  얻는 곳: battle 전투 한 번 · stage 납품 기준 한 단계 · deliver 납품 (의뢰 reward.companyExp가 있으면 그것)
  COMPANY: { need: [12, 30, 50, 80], gain: { battle: 1, stage: 1 } },

  // 던전 전투력 B안 (refs/draft_battle_data_2026-10-23.md 2절): 부대 점수 U·함정 점수 T × 통과 비율 w
  //  U = 인원 × (1인 체력 ÷ hpDiv + 1인 초당 공격) · T = 1회 피해 × 발동 확률 × 대상 수 × 발동 횟수 ÷ 10, 발동 횟수 = 1 + 내림(stay ÷ TRAP_EVERY)
  //  w = 침입자 flowN명을 길 계산(forecast)으로 보냈을 때 그 구역에 오는 비율. 친위대·부대장·카드는 안 셈
  //  근거(측정 2026-10-23, 1층 마석 260, 언덕 오르기 최적 배치): 초안 값(hpDiv 20·대상 10)은 레벨 1 부대 + 함정만으로 가치 55·전투력 216이 나와
  //  1~3단계를 바로 넘고 부대 성장이 필요 없었음 -> 대상 5·hpDiv 10: 레벨 1 최적 = 3단계(가치 185·전투력 137), 5단계는 부대 레벨 4(최적 198)부터
  POWER: { hpDiv: 10, trapTargets: 5, trapStay: 3, flowN: 600 },

  // 이벤트 카드 규칙 (B안: 위기 때만, 전투 한 번(= 한 주)에 최대 maxPerBattle장, 사용자 2026-10-23). 위기 감지는 battle_sim.js (사건 'crisis')
  //  kinds = 위기 종류 (각 분대·각 종류는 한 번만):
  //   surge 대량 출현 = 예고·광고 대량 출현 주의 첫 분대 진입, 또는 던전 안 분대가 massSquads개 이상 (데모 평소 전투는 분대 2개라 거의 없음)
  //   treasure 보물방 근접 = 분대가 보물방 바로 앞 구역에 들어서거나 그 분대 진행도가 crisisProgress% 이상 (분대마다 한 번)
  //   boss 보스 = 보스 주(plan.boss)의 첫 분대 진입 (데모에는 보스 주 없음, 자리만)
  CARD_RULE: { mode: 'crisis', maxPerBattle: 2, crisisProgress: 85, massSquads: 3,
    kinds: [
      { id: 'surge', label: '대량 출현', text: '침입자가 한꺼번에 몰려와요!' },
      { id: 'treasure', label: '보물방 근접', text: '침입자가 보물방 앞까지 왔어요!' },
      { id: 'boss', label: '보스', text: '강한 적이 나타났어요!' }
    ] },

  // ===================== 2차: 세로 층·층별 출진·퇴각·사망 =====================
  // 의뢰인 마석 보급: 전투가 끝날 때마다 마석 +이만큼 (임시, 사용자 확인 필요).
  //  근거(측정 2026-10-23): 마석을 부대 조달에 다 쓰면 가치 기준(시설로만 오름)을 영영 못 채우는 막힘이 언덕 오르기 플레이 20판 중 20판에서 나옴.
  //  10이면 함정 1칸(가치 +10)씩은 늘 지을 수 있어 막힘이 풀림
  //  3차 뒤(사용자 플레이 소감 2026-10-23): 10이면 시설(큰길 3칸 = 30)을 못 지어 몇 주 동안 "다음 주"만 누름 -> 매주 큰길 시설 하나 = 30 (측정은 아래 QUESTS 주석)
  WEEKLY_BUDGET: 30,
  // 층별 출진 한도 (부대·친위대 하나 = 한 칸). 실제 한도 = min(이 값, 그 층 몬스터 대기실 자리 합). 표에 없는 층은 1층 값
  FLOOR_CAP: { 1: 3, 2: 2 },
  // 층별 건설비 배율 (깊은 층이 비쌈). 표에 없는 층은 1
  FLOOR_BUILD_MUL: { 1: 1, 2: 1.2 },
  // 아군 퇴각·사망 (모두 임시, 측정 근거는 아래)
  //  hpRatio = 부대(친위대) 전체 체력 비율이 이 아래로 떨어지면 그 대기실에서 퇴각 -> 다음 주 전투 쉼 (자리는 그대로, 그다음 주 저절로 복귀)
  //  큰 피해 = 퇴각하는 순간 최근 burstWindow초 동안 받은 피해가 부대 전체 체력의 bigShare 이상 ("퇴각 기준 아래로 한 번에")
  //  큰 피해로 퇴각했을 때만 쓰러진(체력 0) 인원마다 deathChance로 사망. 첫 의뢰(QUESTS noDeath)는 사망 없음. 친위대는 불사(퇴각만)
  //  측정(위 QUESTS 정책): 0.35면 fe(부대 하나) 첫 의뢰가 쉬는 주 때문에 4.1주 -> 0.25로 2.85주. 퇴각은 fe 0.37번/전투, 2층 의뢰 0.02번/전투.
  //  큰 피해 퇴각은 측정한 모든 정책에서 0번 (함정이 먼저 깎아 몰아치는 피해가 안 나옴) -> 데모 흐름에서 사망은 사실상 안 나옴. 대량 출현이 켜지면 다시 볼 것
  RETREAT: { hpRatio: 0.25, burstWindow: 4, bigShare: 0.4, deathChance: 0.35 },

  // 데모 의뢰 (무작위 의뢰·메인/등급 상승은 데모에서 끔). 순서대로, minCompanyLv 이상이면 후보에 나온다
  //  floors = 의뢰 층 수 · budget = 마석(건설·부대 조달 전용) · fixed = 고정 구역 { 구역 id: FIXED_ZONES id }
  //  stages = 납품 기준 5단계 (refs/draft_battle_data 3절 예시에서 2차 측정으로 낮춤, 임시): value 가치 · power 전투력(전 층 합) ·
  //           floor2 = 그중 2층 전투력 이상 · opens = 이 단계를 채우면 열리는 층. reward.companyExp = 납품 때 회사 경험치
  //  마석 근거(측정, 최적 배치·레벨 1): 1층 의뢰 260 = 바로 3단계까지(4단계 전투력 137/145), 240이면 5단계에 부대 레벨 5 필요(느림).
  //   2층 의뢰 320이면 레벨 1로 바로 3단계(2층 열림)라 데모 끝 장면의 "🔒 2층"이 안 보임 -> 200 = 바로 2단계까지.
  //  noDeath = 이 의뢰에서는 부대 사망 없음 (데모는 두 의뢰 모두 사망 없음, 사용자 2026-10-23. 사망 규칙은 출시판용으로 남김). budget(단계) = 그 단계를 채우면 마석 추가 (2층 건설용)
  //  ---- 2차 측정 (2026-10-23, node로 실제 전투 계산, 카드는 위기 때 방향 무작위, 정책별 12~20시드) ----
  //  정책: fe = frontend가 실제로 눌러 본 보통 배치(함정 8 + 미끼 1 + 대기실 1, 무료 기본 부대만, 조달·보충 없음) ·
  //        greedy = 언덕 오르기(마석이 되는 한 5단계까지 모자란 비율을 가장 줄이는 건설·조달·보충·출진) · greedy30 = 그중 30%는 두 번째 선택 ·
  //        rand = 무작위 건설(함정 60·대기실 25·미끼 15%)
  //  1층 의뢰 5단계 가치 180·전투력 180(옛 값, 성장 0.2·경험치 4/12): fe 11.7주(16판 중 10판은 12주 안에 못 끝냄) = frontend 실측 10주와 같음
  //   -> 성장 0.5 · 경험치 8/8 · 퇴각 기준 0.25 · 아래 기준: fe 2.85주 · greedy 3주 · greedy30 2.2주 · rand 20판 중 16판 12주 안에 못 끝냄
  //      (rand는 침입자가 안 지나가는 곳에 대기실을 지어 전투력이 0에 가까움 -> 화면의 추천 건설로 풀 문제)
  //   가치 5단계 160 -> 130: 가치는 시설로만 오르는데 마석을 부대 조달에 쓰면 가치를 영영 못 채우는 막힘이 greedy 20판 중 20판 (아래 WEEKLY_BUDGET도 같이)
  //   방어율(보물방에 못 닿은 분대 비율): fe 85% · greedy 98% · rand 61% (목표 70~85%는 처음 하는 사람 배치 기준으로 맞음. 침입자 강함은 그대로 둠:
  //   침입자 체력 ×2.4·공격 ×2로 올리면 fe 퇴각이 늘어 쉬는 주 때문에 첫 납품이 4주 넘게 늘어남)
  //  2층 의뢰 (q1을 fe로 납품 뒤, 2층 열리면 2층 합류점 대기실 + 함정 + 부대 하나 2층으로): 첫 전투 때 3단계 미만 16/16 (🔒 2층 보임),
  //   3단계(2층 열림)까지 평균 2.1주, 완료 6.1주. 4·5단계 가치 210·280은 마석 200 + 추가 150(2층 ×1.2)으로 못 닿아 190·230으로 낮춤
  //  ---- 3차 뒤 사용자 플레이 소감 (2026-10-23): q1 판 fork3 -> line(외길), 고정 구역 CC -> R3(큰길 가운데, 모두 지나며 다음 큰길 R4까지 느려짐),
  //   마석 보급 10 -> 30, 대기실을 지으면 기본 부대 +1 (DEN_GIFT). 단계 기준은 그대로 ----
  //   외길은 큰길(3칸, 통과 비율 1)에 지은 시설이 전부 걸려 같은 마석으로 전투력이 크게 나옴 -> 마석 260 그대로면 모든 정책이 첫 전투 전에 5단계(1주, 너무 빠름)
  //   측정(node 실제 전투, 20시드, 카드는 위기 때 방향 무작위. "주" = 납품하는 주, 전투 수 = 주 - 1):
  //    정책 fe = 튜토리얼 강조 칸 순서대로(R1 함정 · R2 대기실 · R4·R5 함정 · 곁방 함정, 조달 없음) · feden = 대기실 먼저(R1 대기실 · R2·R4 함정 · R5 대기실 · 곁방) ·
  //    greedy·greedy30·rand = 위와 같은 정책(외길 판 기준)
  //    마석 90: fe 3 · feden 4 · greedy 4 · rand 6.9(18/20) | 100: fe 3 · feden 4 · greedy 3 · rand 7.3(18/20) | 110: fe 3 · feden 4 · greedy 3 · greedy30 3 · rand 6.8(18/20)
  //    120: fe 2 · feden 3 · greedy 3 · rand 6.5(16/20) | 150: fe 1 (첫 전투 전 완료, 너무 빠름) · 나머지 2
  //   -> 110 (큰길 시설 3개 + 20, 안내를 따르는 정책 모두 3~4주째 납품, 전투 2~3번). 방어율은 fe·greedy 100% (외길이라 함정이 다 걸림, 침입자 강함은 그대로 둠)
  //   q2 (마석 200 그대로면): 2층이 열린 뒤 2층 대기실을 지으면 부대가 같이 와서 2층 전투력 조건이 바로 참 -> greedy 2주째 납품(전투 1번, 예전 측정 6.1주).
  //    마석 150: greedy 3주 · greedy30 2.8주, 첫 전투 때 단계 1~2 (🔒 2층 보임 유지). 120: greedy 4 · greedy30 5 -> 150 (임시, 사용자 플레이로 다시 볼 것)
  QUESTS: [
    { key: 'q1', name: '작은 돌 성채', client: { name: '은발 마왕', kind: '마왕' }, attr: 'phys', floors: 1, minCompanyLv: 1, noDeath: true,
      board: 'line', fixed: { R3: 'frozen_dock' }, budget: 110,
      reward: { gold: 600, gems: 6, companyExp: 10 },
      stages: [{ value: 30, power: 50 }, { value: 55, power: 75 }, { value: 80, power: 100 }, { value: 105, power: 130 }, { value: 130, power: 160 }] },
    { key: 'q2', name: '지하 보물고', client: { name: '은발 마왕', kind: '마왕' }, attr: 'phys', floors: 2, minCompanyLv: 2, noDeath: true,
      board: 'fork3', fixed: { CB: 'frozen_dock' }, budget: 150,
      reward: { gold: 900, gems: 8, companyExp: 15 },
      stages: [{ value: 60, power: 70 }, { value: 100, power: 110 }, { value: 140, power: 150, opens: 2, budget: 150 },
        { value: 190, power: 200, floor2: 50 }, { value: 230, power: 250, floor2: 90 }] }
  ]
};
