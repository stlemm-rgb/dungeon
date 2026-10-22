# 데모 범위 점검 (새로 만들 것 vs 고쳐 쓸 것)

> Codex 하청 결과 (2026-10-23, 읽기 전용, 총괄 검수). 데모 구현(core-dev + frontend) 때 작업 나누기 기준. 결정은 GAME_PLAN '데모 구현 방침 (2026-10-23)'.

**C1의 건설·전투·카드·정산 코드는 살릴 수 있습니다. 다만 ‘세로 층·층별 출진·현장 부대’는 새 구조가 필요합니다.** 화면만 바꾸는 작업으로 끝나지는 않습니다.

[GAME_STRUCTURE.md](/C:/Project/dungeon/docs/GAME_STRUCTURE.md) 3·6절을 목표로 삼고, 충돌하는 [GAME_RULES.md](/C:/Project/dungeon/docs/GAME_RULES.md)는 이전 규칙으로 판단했습니다. 파일 수정·커밋 없이 정적으로 점검했으며, 실행 검증은 하지 않았습니다.

추천은 **그림을 완성하기 전에 첫 의뢰 → 납품 → 두 번째 현장 첫 전투를 임시 화면으로 먼저 연결하는 것**입니다. 이 흐름이 연결돼야 성장과 인계가 실제로 재미를 만드는지 확인할 수 있습니다.

**표 1: 데모 기능별 판정**

파일명은 `prototype/c1_shell/` 기준입니다. 크기는 로직·화면·저장 연결까지 포함한 상대 크기입니다. ‘새로 만들어야 함’도 기존 계산이나 화면 조각은 활용할 수 있습니다.

| 기능 | 판정 | 관련 파일·함수 | 크기 | 메모 |
| --- | --- | --- | --- | --- |
| 고정 첫 의뢰·약 3주 전투 | 고쳐 쓸 수 있음 | [progress.js](/C:/Project/dungeon/prototype/c1_shell/progress.js): `TUTORIAL_QUEST`, `makeTutorialQuest()`, `offerQuests()`, `skipTutorial()` | 중간 | 고정 첫 의뢰는 있지만 현재 목표는 방어 2회. 데모용 주차별 전투·2층 열림을 정해야 함. 안내를 건너뛰어도 고정 데모 내용은 유지하도록 변경. |
| 의뢰 예산·회사 금 분리 | 고쳐 쓸 수 있음 | `progress.js`: `freshSite()`, `previewBuild()`, `buildZone()`, `recruit()`, `applyBattle()`, `deliver()` | 큼 | `site.grant`는 첫 건설 전용이며 부족분을 회사 금으로 냄. 건설·인원 조달을 예산으로 통일하고 회사 금 자동 지출 제거. 수리비·전투 수입의 처리도 함께 정리. |
| 시설 3종·추천 건설 | 고쳐 쓸 수 있음 | [zones.js](/C:/Project/dungeon/prototype/c1_shell/zones.js): `FAC`, `costOf()`; `progress.js`: `previewBuild()`, `buildZone()`; [build.js](/C:/Project/dungeon/prototype/c1_shell/build.js): `SCREEN_PLUGINS.build` | 중간 | 함정·대기실·미끼 등 기존 시설에서 3종을 고를 수 있음. 추천 배치와 적용 동작은 새로 필요. 예산 부족 시 회사 금을 쓰면 안 됨. |
| 세로 지하 1층 → 작은 2층 | 새로 만들어야 함 | `progress.js`: `freshSite()`; `zones.js`: `BOARD_DATA`, `useBoard()`, `routeOf()`; `build.js`: `boardHtml()`; [shell.js](/C:/Project/dungeon/prototype/c1_shell/shell.js): `SCREENS.dungeon`; [battle_sim.js](/C:/Project/dungeon/prototype/c1_shell/battle_sim.js): `create()` | 큼 | 현재는 판 하나뿐. 화면의 ‘2층 잠김’ 버튼에는 실제 층 상태가 없음. 층별 시설·경로·계단 연결·열림 상태가 필요. |
| 층별 출진·층별 한도·기본 자동 편성 | 새로 만들어야 함 | `progress.js`: `placeMonster()`, `removeMonster()`, `usedIds()`; `zones.js`: `slotsOf()`; `battle_sim.js`: `create()` | 큼 | 지금은 대기실마다 개별 몬스터를 넣음. 층에 부대·친위대를 출진시키는 방식으로 교체. 중복 출진 방지와 친위대의 자리 차감도 필요. |
| 몬스터는 대기실 칸만 배회·함정 칸에는 함정만 | 고쳐 쓸 수 있음 | `battle_sim.js`: `create()`, `livingMon()`, `fightDens()`; [battle.js](/C:/Project/dungeon/prototype/c1_shell/battle.js): 몬스터 생성 부분, `paint()`; `zones.js`: `CELLS`, `FAC` | 중간 | 대기실에만 몬스터를 만드는 제한은 있음. 현재 도트는 구역 중심에 고정. 대기실 내부 칸만 고르는 배회와 층별 출진 연결을 추가. |
| 아군 퇴각·기본 퇴각 기준·다음 주까지 쉼 | 새로 만들어야 함 | `battle_sim.js`: `fightDens()`, `step()`, `snapshot()`, `restore()`; `progress.js`: `applyBattle()`; `battle.js`: `show()`, `paint()` | 큼 | 지금 `retreated`는 **침입자 퇴각**임. 아군의 퇴각 상태·출진 제외·휴식 해제 시점은 없음. |
| 현장 부대의 인원·숙련도·사망 규칙 | 새로 만들어야 함 | `progress.js`: `freshRun()`, `addMonster()`, `pickQuest()`, `applyBattle()`; `battle_sim.js`: `create()`, `fightDens()` | 큼 | 현재 몬스터 한 개체가 레벨·능력치를 가짐. 인원 사망과 부대 숙련도를 분리해야 함. 첫 의뢰 사망 없음, 친위대 불사, 전멸 뒤 무료 보충도 추가. |
| 출진·참여 단위 경험치 | 고쳐 쓸 수 있음 | `progress.js`: `applyBattle()`, `addExp()`, `levelNeed()`; `battle_sim.js`: `result()` | 중간 | 지금은 대기실 배치자에게 처치 경험치를 나누고, 배치자가 없으면 전원 지급. 참여 기록으로 바꾸고 미출진자 지급 제거. |
| 경험치 책·훈련 교본·대상 선택·친위대 교관 효과 | 새로 만들어야 함 | `progress.js`: `applyBattle()`, `addExp()`; `shell.js`: `SCREENS.units`; `battle.js`: `finish()` | 큼 | 레벨업 계산만 재사용 가능. 보상 재고·부대/친위대 선택·소비·훈련 효율 계산·성장 전후 표시가 필요. 참여 경험치와 책 보상의 중복 지급 기준도 정해야 함. |
| 주목표 1 + 부목표 1 이내·현장 부대 레벨 목표 | 고쳐 쓸 수 있음 | `progress.js`: `GOAL_TYPES`, `makeQuest()`, `goalNow()`, `checkQuest()`, `questBlockers()` | 중간 | 현재 일반 2개·메인 3개를 무작위 생성. 부대 레벨 목표는 없음. 친위대 레벨이 목표에 포함되지 않게 분리. |
| 현장 상단 ‘다음 주’·의뢰 진행표·남은 예산 고정 | 고쳐 쓸 수 있음 | `shell.js`: `startWeek()`, `goalsHtml()`, `SCREENS.dungeon`, `drawTabs()`; `build.js`: `drawSummary()`; [shell.css](/C:/Project/dungeon/prototype/c1_shell/shell.css) | 중간 | 진행표 조각은 있음. 다음 주 버튼을 하단 가운데에서 현장 위로 이동하고 진행표를 고정. 유료 건설을 해야 진행되는 제한은 제거. |
| ‘의뢰 완료’ 표시 → 직접 납품 | 고쳐 쓸 수 있음 | `progress.js`: `checkQuest()`, `deliver()`; `shell.js`: `autoDeliver()`, `render()`, `startWeek()`, `API.backHome`; `build.js`: `api.autoDeliver()` 호출부 | 중간 | 목표 판정과 정산은 활용 가능. 현재 여러 곳에서 자동 납품하므로 모두 완료 표시 갱신으로 변경하고, 납품 버튼에서만 정산 실행. |
| 회사 레벨·새 부대의 기본 시작 레벨 | 새로 만들어야 함 | `progress.js`: `freshRun()`, `deliver()`, `addMonster()`, `pickQuest()`; `shell.js`: `SCREENS.home`, `deliverScreen()` | 중간 | 현재는 `fame`만 있음. 단순 이름 변경으로 끝내지 말고 회사 성장과 부대 시작 레벨 계산을 추가. 기존 적 강함 계산의 명성 참조도 확인. |
| 속성별 완공 화면·성공 연출 | 새로 만들어야 함 | `shell.js`: `deliverScreen()`; [battle_data.js](/C:/Project/dungeon/prototype/c1_shell/battle_data.js): `ATTRS`; `shell.css`; 신규 그림 자산 | 중간 | 지금은 도장과 정산표뿐. 속성별 완공 그림과 표시 연결이 필요. 현재 속성은 물리·마법·에테르로, 문서 예시의 물리·얼음·불과 일치하지 않음. |
| 하단 탭 5개·취소선·🔒·경험에 따른 열림 | 고쳐 쓸 수 있음 | `shell.js`: `TABS`, `drawTabs()`, `guardScreen()`, `SCREENS.home`, `SCREENS.units`; [stage.js](/C:/Project/dungeon/prototype/c1_shell/stage.js): `roomSvg()`, `ACTORS`; `shell.css` | 큼 | 회사·군단·현장·마계·내 집으로 재구성. 군단은 첫 전투 뒤, 친위대·작품집은 첫 납품 뒤 해금. 마계·내 집 등 미구현은 취소선과 ‘준비 중’. 회사 입구 배치도 변경 필요. |
| 친위대 지정·다음 현장 인계·실제 수치 정산 | 고쳐 쓸 수 있음 | `progress.js`: `setGuards()`, `pickQuest()`, `deliver()`; `shell.js`: `deliverScreen()`, `SCREENS.units` | 큼 | 선택한 개체의 레벨 유지 기능은 있음. 현재는 비친위대도 같은 개체로 남고 레벨만 초기화됨. 현장 부대 인계와 다음 현장 새 조달로 변경하고, 친위대 층별 출진·불사 연결. |
| 작품집 기록 1개 + 영구 효과 1개 | 새로 만들어야 함 | `progress.js`: `deliver()`, `RUN.history`, `pickQuest()`; `shell.js`: `SCREENS.records`, `deliverScreen()` | 중간 | 납품 이력은 있지만 이름·종류·주차만 저장하며 최대 30건. 속성·완공 모습·효과를 가진 작품 기록과 다음 현장 효과 적용이 필요. |
| 바꿀 수 없는 고정 구역 1개 | 고쳐 쓸 수 있음 | `progress.js`: `freshSite()`, `previewBuild()`; `zones.js`: `tutorialZones()`; `build.js`: `zoneWhy()`, `drawSheet()` | 중간 | 첫 부지 입구를 못 바꾸는 처리는 있음. 이를 의뢰별 고정 구역 데이터와 건설 차단으로 일반화. 화면만 막지 말고 로직에서도 거부. |
| 부족 2종·보석 강화 1회 | 고쳐 쓸 수 있음 | `progress.js`: `TRIBES`, `START_CONTRACTS`, `tribeInfo()`, `upgradeTribe()`, `addMonster()`; `shell.js`: `SCREENS.units` | 중간 | 부족 강화 계산과 영구 저장은 이미 있음. 데모 노출을 2종으로 줄이고 첫 전투 뒤 강화 가능하게 구성. 새 부대 조달 때도 강화 효과가 적용되도록 연결. |
| 카드 4방향 밀기·누르기 | 그대로 쓸 수 있음 | `battle.js`: `spawnCard()`, `attachDrag()`, `resolveCard()`; `shell.css`: 카드 화면 스타일 | 작음 | 입력과 선택 연출은 재사용 가능. 새 전투 상태에 효과를 전달하는 연결만 점검. |
| 카드 6~8장·주당 제한·카드/이벤트 등급 | 고쳐 쓸 수 있음 | `battle_data.js`: `EVENT_CARDS`, `CARD_AT`; `progress.js`: `makePlan()`, `setCardCount()`; `battle.js`: `checkCards()`, `spawnCard()`, `UI_KEYS` | 중간 | 이벤트 카드는 이미 6종. 현재 상한은 1배속 최대 4장, 배속 때만 설정 적용. 카드 종류 수와 주당 등장 수를 구분하고, 모든 배속·재접속에 같은 제한 적용. 등급 데이터·연출은 추가. |
| 자동 전술 기본 켬·카드 자동 넘기기 별도 설정 | 고쳐 쓸 수 있음 | `battle_sim.js`: `step()`, `fightDens()`; `progress.js`: `freshPrefs()`; `battle.js`: `frame()`, `resolveCard()`; `shell.js`: `SCREENS.settings` | 중간 | 자동 전투 계산은 있음. 자동 편성·퇴각 기준과 연결하고, 카드 자동 선택은 별도 설정으로 새로 추가. 기본값은 꺼짐. |
| 두 번째 현장 첫 전투·남은 효과 강조 | 고쳐 쓸 수 있음 | `progress.js`: `offerQuests()`, `pickQuest()`, `ensurePlan()`, `startBattle()`; `shell.js`: `deliverScreen()`, `guardScreen()`; `battle.js` | 중간 | 새 부지로 넘어가는 순환은 있음. 무작위 후보 대신 짧은 두 번째 의뢰를 제공하고, 친위대·부족 강화·작품집 효과가 실제 전투에 남았음을 한 번 보여 줘야 함. |

**표 2: 없애거나 숨길 C1 기능**

‘숨김’은 데모에서 실행되지 않게 하는 뜻입니다. 필요한 미래 기능은 새 입구 위치에 취소선으로 표시합니다.

| 기능 | 파일 | 이유 |
| --- | --- | --- |
| 목표 달성 즉시 자동 납품 | `shell.js`, `build.js` | ‘의뢰 완료’ 확인 후 직접 납품하는 흐름과 충돌. 기존 자동 호출 제거 필요. |
| 유료 건설 전에는 다음 주 진행 금지 | `progress.js`: `startBattle()` | 언제든 다음 주 진행·예산 소진 뒤 무료 기본 부대 진행과 충돌. |
| 공사비 부족분을 회사 금으로 결제·회사 금으로 현장 모집 | `progress.js`, `build.js`, `shell.js` | 회사 금과 의뢰 예산의 경계가 무너짐. |
| 대기실별 개체 넣기·빼기 화면 | `build.js`, `progress.js` | 층별 출진으로 교체. 내부 보조 계산은 필요하면 활용. |
| 판 3종 무작위 선택·입구 방향 변경·갈림길 설계 | `zones.js`, `progress.js`, `build.js` | 데모는 세로 층과 고정 경로부터. 기존 판 선택 규칙은 노출하지 않음. |
| 건설 요구 6종 | `progress.js`: `DEMAND_DEFS`, `demandStatus()`; `build.js`, `shell.js` | 고정 구역으로 대체. 납품 조건에서도 제거해야 함. |
| 일반 3회 → 메인·등급 상승·무작위 다수 의뢰 | `progress.js`, `shell.js` | 고정 첫 의뢰와 짧은 두 번째 의뢰의 시간·난이도를 흐트러뜨림. |
| 미출진자까지 경험치 지급·친위대 외 개체 전원 유지 | `progress.js`: `applyBattle()`, `pickQuest()` | 참여 성장·현장 부대 인계 규칙과 충돌. |
| 배속에 따라 달라지는 카드 제한·안 맞는 방향별 효과 | `battle.js`, `battle_data.js` | 주당 제한을 일관되게 적용해야 함. ‘← 시설’인데 몬스터 공격이 오르는 등의 효과도 정리. |
| 광고 뽑기·광고 대량 출현·일일/주간 과제·방치 보상 | `progress.js`, `shell.js` | 10분 데모의 성장·재화 흐름에 다른 수입 경로가 끼어듦. 화면뿐 아니라 지급도 막아야 함. |
| 공방 강화·부대장 가짜 스킬·가짜 상품·도감 자리 | `shell.js`, `progress.js`, `stage.js` | 이번 범위 밖. 필요한 입구 이름만 남기고 취소선 처리. |
| 기존 ‘명성’ 중심 표시·가치 절반 판매 보너스 | `progress.js`, `shell.js` | 회사 레벨 중심으로 정리. 기존 판매 보너스를 그대로 두지 말고 데모 정산 규칙에 맞춤. 절약 보너스를 넣으면 상한 필요. |
| 이전 흐름을 설명하는 대사 | [lines.js](/C:/Project/dungeon/prototype/c1_shell/lines.js), `shell.js`의 튜토리얼 대상 지정 | 가운데 다음 주·첫 건설만 지원·자동 납품 등 안내가 달라짐. 사용자 편집 파일이므로 대사 변경 담당도 한 명으로 고정. |

**표 3: 작업 나누기**

**핵심 담당은 `progress.js·zones.js·battle_sim.js·battle_data.js`, 화면 담당은 `shell.js·build.js·battle.js·shell.css·stage.js·index.html·lines.js`를 끝까지 맡는 방식**을 추천합니다. `build.js`와 `battle.js`도 화면 담당 파일입니다. 필요한 규칙은 핵심 담당이 공개 함수로 제공하고, 화면 담당이 핵심 상태를 직접 고치지 않게 합니다.

| 순서 | 핵심 로직 담당 파일 | 화면 담당 파일 | 끝 기준 |
| --- | --- | --- | --- |
| 0. 상태·함수 약속 | `progress.js`, `zones.js`, `battle_sim.js`의 새 데이터 모양과 입출력 정의 | `shell.js`, `build.js`, `battle.js`의 호출 목록 정리 | 예산·층·출진·훈련·납품 상태를 같은 뜻으로 사용. 친위대와 현장 부대 구분, 층/구역 식별 방식 확정. |
| 1. 데모 기반 | `progress.js`, `battle_data.js`, `zones.js`: v6·고정 의뢰·예산·시설 3종·고정 구역·부족 2종 | `shell.js`, `build.js`, `shell.css`, `stage.js`: 탭 5개·입구·해금 표시·추천 건설·진행표 | 의뢰 수락 → 예산 건설 → 기본 부대 준비 가능. 회사 금을 쓰지 않고, 예산 0에서도 진행 가능. |
| 2. 두 층과 전투 | `zones.js`, `progress.js`, `battle_sim.js`, `battle_data.js`: 층 경로·출진 한도·퇴각·첫 의뢰 사망 면제 | `build.js`, `battle.js`, `shell.css`: 세로 단면·층별 편성·대기실 배회·퇴각 표시 | 1층 전투 → 작은 2층 해금 → 두 층 전투 완료. 친위대 포함 중복 출진·한도 초과 불가. |
| 3. 성장과 카드 | `progress.js`, `battle_sim.js`, `battle_data.js`: 참여 경험치·책/교본·교관 효과·보석 강화·카드 제한 | `shell.js`, `battle.js`, `shell.css`: 보상·훈련 대상 선택·성장 전후·카드 등급·설정 | 첫 전투 뒤 군단 해금. 성장과 강화가 전투에 반영되고 재접속해도 보상·카드 횟수가 유지됨. |
| 4. 납품과 다음 현장 | `progress.js`: 완료 판정·정산·회사 레벨·친위대·작품집 효과·두 번째 의뢰 | `shell.js`, `build.js`, `battle.js`, `shell.css`: 자동 납품 제거·완공 화면·실제 인계 수치·효과 강조 | 완료 표시 → 직접 납품 → 기록 1개·효과 1개 → 친위대 인계 → 두 번째 현장 첫 전투까지 연결. |
| 5. 확인과 안내 정리 | `tools/test_c1_core.py`, `docs/GAME_RULES.md`: 새 규칙 검사·문서 정리 | `lines.js`, `tools/test_lines.py`, C1 화면 검사, `HANDOFF.md`, `PROGRESS.md` | 첫 납품 7~8분, 두 번째 첫 전투 10분 안팎. 예산 소진·퇴각·훈련·납품 전후 재접속 확인. 설명 없이 진행 가능한지 실제 플레이 확인. |

작업을 시작할 때 [index.html](/C:/Project/dungeon/prototype/c1_shell/index.html)의 스크립트 연결도 화면 담당만 수정하면 됩니다. 두 사람이 같은 파일을 번갈아 고치는 방식보다, 위 소유권을 유지하고 함수 약속을 바꾸는 편이 안전합니다.

**저장 형식은 v5에서 v6으로 바꾸는 것이 맞습니다.** 현재 `site.zones·site.units`는 판 하나와 구역별 개체 배치를 전제로 하므로 기본값 몇 개를 추가하는 수준으로는 부족합니다.

v6에는 의뢰 예산, 층별 시설·출진·휴식 상태, 부대 인원과 숙련도, 친위대, 책·교본, 회사 레벨, 해금 이력, 작품집과 효과가 필요합니다. `plan·bsave`에도 층·참여자·퇴각·카드 진행 상태를 반영해야 합니다. 훈련과 납품 보상이 재접속으로 중복 지급되지 않도록 저장도 함께 묶어야 합니다.

데모는 **별도 저장 키로 새로 시작하고 v5 원본을 보존하는 방식**을 추천합니다. 현재 `load()`는 버전이 다르면 새 게임으로 처리하므로, 같은 키에서 버전만 올리면 이후 저장 때 기존 기록을 덮어쓸 수 있습니다. 기존 금·개체를 새 예산·부대로 자동 변환하는 작업은 데모 범위에서 빼도 됩니다.

위험한 점은 세 가지입니다.

1. **층을 화면에만 추가하는 것:** `ZONES.useBoard()`는 전역 판 하나를 바꿉니다. 두 층의 같은 구역 이름이 섞이지 않도록 전투·미리보기·저장을 함께 바꿔야 합니다.
2. **숨긴 C1 규칙이 계속 실행되는 것:** 자동 납품, 회사 금 차감, 미출진 경험치, 방치 보상은 화면을 가려도 남습니다. 호출부와 지급 로직까지 확인해야 합니다.
3. **기존 검사 통과를 데모 완성으로 보는 것:** 현재 검사는 유료 건설 제한·공사비 부족분 금 결제 등 옛 규칙을 확인합니다. 새 규칙 검사와 실제 10분 플레이가 모두 필요합니다.