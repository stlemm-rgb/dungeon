# D1 데모 핵심 로직 API (1차 + 2차 2026-10-23, 3차 문 토큰 2026-10-24 → 13절, 시설 강화 2026-10-25 → 14절, 흐름 시험 2026-10-28 → 15절)

> **흐름 시험이 켜져 있으면(`BATTLE_DATA.FLOW.on`, 기본 켬) 15절이 1~14절의 주 단위 규칙(다음 주·납품 기준 가치/전투력·마석 보급·다음 주 쉼·경험치)보다 우선한다.**

화면 파일(shell.js·build.js·battle.js·stage.js)이 부르는 공개 함수 목록. 값은 **이 함수들로만** 바꾼다 (RUN을 화면에서 직접 고치지 않는다).
숫자·글 표는 `battle_data.js`의 `DEMO` 아래(의뢰·납품 기준·부족·회사 레벨·고정 구역·끈 기능·판). 검사는 `tools/test_d1_core.py`, 옛 저장은 `tools/test_oldsaves.py`.

- 저장: 키 `dunguen_d1_run`, 형식 **v7** (13절). 옛 **v6은 회사 기록만 이어 받음**(B안), 그 밖의 버전은 새 게임. C1 키(`dunguen_c1_run`)는 건드리지 않는다.
- **판 모양은 13절이 1~12절보다 우선**한다 (구역 id `R1`·`CD`·`LB` 같은 옛 판 이야기는 이제 칸 좌표 방 id로 읽을 것).
- 공통 돌려주는 값: 바꾸는 함수는 `{ ok, msg }` (+ `stages`: 이번에 새로 오른 납품 기준 단계 번호 목록, 토스트용).

## 1. RUN 모양 요약 (`PROGRESS.RUN`, 읽기만)

| 칸 | 뜻 |
| --- | --- |
| `v` `seed` `week` | 저장 형식 6 · 게임 무작위 씨앗 · 지금 주 |
| `gold` | **회사 금** (영구. 전투 수입·납품 보수가 여기로. 데모에서는 쓰는 곳 없음) |
| `gems` | 신석 (부족 신석 강화) |
| `company` `{ lv, exp }` | **회사 레벨** (전투 +1 · 납품 기준 단계 +1 · 납품 보수 `reward.companyExp`) |
| `phase` | `choose` 의뢰 고르기 · `play` 진행 중 · `settle` 납품 직후 정산 |
| `quest` | 진행 중 의뢰 `{ id, key, name, client, attr, floors, budget, reward{gold,gems,companyExp}, board, fixed, stages[5]{value,power,floor2?,opens?}, stage, stageWeeks, startWeek, tutorial }` |
| `offers` | 후보 의뢰 목록 (위와 같은 모양) |
| `report` | settle 때 납품 보고 (deliver 돌려주는 값) |
| `site` | 지금 현장 `{ board, zones, fixed, units, squads, nextSquadNo, budget, budgetStart, spent, builds, value, power, floorsOpen }` |
| `site.budget` | **마석** 남은 것 (건설·부대 조달 전용) |
| `site.fixed` | 고정 구역 `{ 구역 id: 'frozen_dock' }` (zones에는 `'fz_frozen_dock'` 시설로 들어 있음) |
| `site.units` | 대기실 출진 `{ 구역 id: [부대·친위대 id] }` (칸당 1자리) |
| `site.squads` | 현장 부대 `[{ id:'s1', tribe:'stone'|'ember', count, lv, exp, free }]` (납품 때 의뢰인에게 인계) |
| `guards` | 친위대 `[{ id:'g1', tribe, name, intro, lv, exp, from }]` (이름 있는 개체, 다음 현장 동행, 최대 2) |
| `tribes` | 부족 신석 강화 단계 `{ stone: 1 }` |
| `contracts` | 부족 사용권 (데모: 두 부족 다) |
| `works` | 작품집 `[{ no, key, name, client, attr, value, power, week }]` |
| `stats` | `{ battles, delivers }` (해금 판단) |
| `doneQuests` | 끝낸 데모 의뢰 key |
| `plan` `battling` `bsave` `lastBattle` `prefs` `tutorial` `history` | C1과 같음 |
| `workshop` `chores` `idle` `lastSeen` `surgeWeek` `adWeek` | 끈 기능의 칸 (값만 남음) |

## 2. 공개 함수 (`window.PROGRESS`)

### 의뢰·납품
| 함수 | 돌려주는 값 | 언제 |
| --- | --- | --- |
| `offerQuests()` | 후보 의뢰 배열 (데모 고정 순서, 회사 레벨 조건). 다 끝냈으면 `[]` | choose·settle 화면 |
| `lockedQuest()` | 회사 레벨 때문에 아직 못 받는 다음 의뢰 `{ key, name, floors, minCompanyLv }` 또는 null | 🔒 안내 |
| `pickQuest(q 또는 id, promoteIds?)` | true/false. settle에서 `promoteIds` = 친위대로 데려갈 **현장 부대 id** 목록 (그 부대 대장이 친위대가 되어 레벨 이어받음) | 의뢰 카드 누름 |
| `questProgress()` | 진행표 `{ stage, total, complete, canDeliver, why, cur{value,power,floor2}, next{stage,value,power,floor2,opens}|null, floors, floorsOpen, floorLock{floor,atStage}|null, line, budget, budgetStart }`. play 아니면 null | 현장 위 진행표 (늘) |
| `checkQuest()` | 지금 납품 가능? (`questProgress().canDeliver`) | 납품 버튼 켜기 |
| `questBlockers()` | 막는 이유 글 배열 (0~1개) | 버튼 아래 안내 |
| `deliver()` | 납품 보고 또는 null. **자동 납품 없음** — 진행표가 "의뢰 완료"일 때 버튼에서만 부른다 | 납품 버튼 |
| `questUpdate()` | 새로 오른 단계 번호 배열 (보통 안 불러도 됨: 건설·조달·배치·전투 반영 때 자동) | — |

deliver 보고: `{ quest, gold, gems, companyExp, goldBefore, gemsBefore, companyBefore{lv,exp,need}, companyAfter, weeks, value, power, stage, builds, board, budgetLeft, budgetStart, handover[부대 보기], work, worksEffectNew, carry[글], lost[글] }`

### 현장: 가치·전투력·마석·건설
| 함수 | 돌려주는 값 | 언제 |
| --- | --- | --- |
| `siteSummary()` | `{ value, trap, den, lure, fixed, monsters, power, budget }` (value = 시설 점수만) | 요약 줄 |
| `siteValue()` / `sitePower()` | 던전 가치 / 던전 전투력(B안, 친위대 제외) | |
| `powerInfo()` | `{ total, parts:[{ z, kind:'trap'|'den', score, w, power }] }` 구역별 전투력 조각 (w = 통과 비율) | 전투력 자세히 |
| `powerOf(zones, units)` | 아무 배치의 전투력 (미리보기) | |
| `budgetLeft()` | 남은 마석 | |
| `previewBuild(z, k)` | `{ ok, why, cost, baseCost, discount, counts, budgetAfter, valueNow, valueAfter, powerNow, powerAfter, back, zones, units, from, fixed? }` | 건설 시트 |
| `buildZone(z, k)` | `{ ok, msg, stages }` 마석에서 차감 (회사 금 안 씀, 모자라면 거절) | 짓기 |
| `buildCost(k, z)` | 비용 | |
| `forecast(zones?, units?)` | 문 위 숫자 `{ at, flow }` (C1과 같음) | |

### 부대·친위대
| 함수 | 돌려주는 값 | 언제 |
| --- | --- | --- |
| `TRIBES` | 부족 표 (battle_data.js) `{ id, name, role, look, talk, feature, attr, guardName, guardIntro, base, grow }` | 군단 화면 |
| `STATS` | 능력치 항목 표 `[{ key:'hp'|'atk'|'def', label }]` | |
| `squads()` / `guards()` | 부대 보기 배열 (아래) | 군단·출진 |
| `unitById(id)` (= `monById`) | 부대 보기 `{ id, kind:'squad'|'guard', tribe, tribeName, name, count, cap, lv, exp, need, hp, atk, def, free, placed }` (hp·atk·def는 1명 값) | |
| `idleUnits()` | 대기실에 안 든 부대·친위대 보기 | 배치 목록 |
| `statOf(id, key)` / `statParts(id, key)` | 능력치 값 / 조각 `{ base, level, upgrade, equip, enchant }` (장비·인챈트는 0 자리) | 자세히 |
| `procureInfo(tribe)` / `procureSquad(tribe)` | 새 부대 조달 (마석). info `{ tribe, name, count, cap, lv, cost, canAfford, why }` | |
| `refillInfo(id)` / `refillSquad(id)` | 1명 보충 (마석, 정원까지) | |
| `placeUnit(z, id)` / `removeUnit(z, index)` | 대기실 출진·빼기 (공짜). 2차부터 층별 출진의 호환 함수 (아래 7절) | |
| `tribeInfo(tribe)` / `upgradeTribe(tribe)` | 부족 신석 강화 (데모 1회). info `{ id, name, lv, max, contracted, effect, next, cost{gems}|null, canAfford, why }` | 군단 |
| `levelNeed(lv)` · `monGrade(lv)` | 레벨업 경험치 · 등급 글자 | |

### 회사·작품집·해금
| 함수 | 돌려주는 값 |
| --- | --- |
| `company()` | `{ lv, exp, need }` |
| `worksInfo()` | `{ list, effect{ id, label, text, active } }` (작품 1개부터 현장 부대 경험치 +10%) |
| `unlocks()` | `{ corps(첫 전투 뒤), guards(첫 납품 뒤), works, floor2(2층 열림), secondQuest }` |

### 전투
| 함수 | 돌려주는 값 | 언제 |
| --- | --- | --- |
| `planInfo()` · `isSurgeWeek()` · `surgeIn()` | C1과 같음 (대량 출현은 데모에서 꺼져 늘 false / null) | 예고 |
| `startBattle()` | `{ ok, plan, msgs }` — **언제든 가능** (건설 0·마석 0이어도) | 다음 주 |
| `battleInput(plan?)` | `BSIM.create`에 그대로 넘길 `{ plan, zones, units, unitById }` | 전투 화면 |
| `battlePlan()` · `battleSave()` · `saveBattle(cp)` · `setBattleSpeed(i, fastUsed)` · `setCardCount(n)` · `setBattle(b)` | C1과 같음 | |
| `applyBattle(res)` | 결과 보고 `{ …C1 칸, repair:0, expGains[{id,name,exp,lvBefore,lvAfter}], stages, companyBefore, companyAfter, progress(questProgress), hint }` | 전투 끝 |
| `cardRule()` | `{ mode:'crisis', maxPerBattle:2, crisisProgress }` 이벤트 카드 B안 데이터 (위기 감지는 2차) | |

### 튜토리얼·저장
`tutorial()` · `tutorialSeen(id)` · `skipTutorial()`(안내만 끔) · `tutorialPath()`(튜토리얼 중 첫 현장에서 강조할 칸 = 침입자 모두가 지나는 큰길 중 지을 수 있는 칸, 12절) · `save()` · `load()` · `reset()` · `setClock(fn)`

### 데모에서 꺼진 것 (부르면 늘 거절·0, 지급 없음)
`watchAd()` · `gachaInfo()`(`{ off:true, left:0 }`) · `gachaPull()` · `chores()`(`off:true`, 진행 안 오름) · `claimChore()` · `choresClaimable()`(0) · `idleInfo()`(`off:true`) · `claimIdle()` · `WORKSHOPS`(ready false) · `workshopInfo()` · `upgradeWorkshop()`. 끄는 표 = `BATTLE_DATA.DEMO_OFF`, `PROGRESS.OFF`.

## 3. ZONES·BSIM 바뀐 점

- `ZONES.summary(zones, units, unitById?)`: value에 몬스터가 **안 들어감**. `fixed` 수 추가.
- `ZONES.facFor(z)`: 데모 시설만 (방 = 빈 구역·함정 복도·몬스터 대기실·미끼, 입구 = 분기·**대기**(12절), 야외 = 숲).
- `ZONES.slotsOf(k, z)`: 대기실 칸당 1자리 (부대 하나).
- 새: `ZONES.fixedFac(id)` · `isFixedFac(k)` · `passRatios(zones, units, n?)` · `trapScore(z, boost?)` · `defaultZones(fixed?)`. 고정 구역 시설은 `FAC['fz_frozen_dock']` (kind `fixed`).
- `BSIM.create(o)`: `o.unitById`(또는 옛 `monById`)로 부대를 받아 **인원 수만큼** 싸우는 개체를 만든다. `S.dens[z][i] = { id, n, name, hp, max, atk, def, guard, lost }`.
- `BSIM.step` 사건 추가: `{ type:'chill', id, z, x, y }` (얼어붙은 하역장에 들어선 분대, `q.chill` > 0인 동안 느려짐).
- `BSIM.result(S)`에 `deployed`(출진 부대 id) · `fought`(실제로 싸운 부대 id) 추가.

## 4. 없어진 것 (C1에서 이름이 바뀌거나 사라짐)

| 옛 이름 | 대신 |
| --- | --- |
| `grantLeft()` · `SITE_GRANT` (첫 건설 공사비) | `budgetLeft()` (마석) |
| `placeMonster(z, id)` · `removeMonster(z, i)` | `placeUnit` · `removeUnit` |
| `idleMonsters()` | `idleUnits()` |
| `recruitInfo(name)` · `recruit(name)` (회사 금 모집) | `procureInfo/procureSquad(tribe)` · `refillInfo/refillSquad(id)` (마석) |
| `setGuards(ids)` | `pickQuest(q, promoteIds)` |
| `toContract()` | 없음 (settle 화면에서 바로 pickQuest) |
| `goalNow` · `goalText` · `GOAL_TYPES` (전투 목표) | `questProgress()` (납품 기준 단계) |
| `demandStatus()` (건설 요구 6종) | 없음 (고정 구역으로 대체) |
| `MAIN_GRADES` · `NORMAL_TO_MAIN` (메인 의뢰·등급) | 없음 (데모 고정 의뢰) |
| `TRIBE_GRADES` · 옛 `TRIBES`(9부족, 이름 키) | `TRIBES`(2부족, `id` 키). `tribeInfo/upgradeTribe` 인자도 부족 **id** |
| `RUN.fame` (명성) | `RUN.company` (회사 레벨) |
| `RUN.monsters` (개체) | `RUN.site.squads` (부대) + `RUN.guards` (친위대) |
| 자동 납품 (`checkQuest` 참이면 shell이 deliver) | 진행표 "의뢰 완료" → 납품 버튼에서만 `deliver()` |
| "금 쓴 건설 없으면 다음 주 막힘" | 없음 (언제든 다음 주) |
| 판 3종 무작위·입구 방향(대기·굽은길)·덫 숲 | 없음 (의뢰마다 정해진 판: 첫 의뢰 외길·두 번째 세 갈래. 입구는 분기·대기, 굽은길 없음 — 12절) |
| 수리비 (`rep.repair`) | 늘 0 |
| 납품 판매 대금 (`rep.sale` = 가치 절반) | 없음 |

---

# 2차 추가 (2026-10-23)

1차 함수의 이름·인자·돌려주는 모양은 그대로다 (필드만 늘어남). 아래는 새로 생긴 것과 뜻이 바뀐 것.

## 5. RUN에 늘어난 칸 (저장 v6 그대로, 빠지면 `ensureStateReady`가 채움)

| 칸 | 뜻 |
| --- | --- |
| `phase` | `demoEnd` 추가 (데모 의뢰를 다 납품하고 정산을 닫은 뒤) |
| `site.floors` · `site.floorsOpen` | 의뢰 층 수 · 열린 층 수 |
| `site.deploy` | **층별 출진** `{ '1': [부대·친위대 id], '2': [...] }` (정본. 층마다 한도) |
| `site.units` | 대기실 배치 `{ 구역: [id] }` — 이제 `deploy`에서 계산된 **읽기 전용** 결과 (예전 화면 호환으로 계속 채워짐) |
| `site.pins` | 예전 `placeUnit`으로 고른 대기실 `{ id: 구역 }` |
| `site.auto` | 기본 자동 편성 (처음 켬, 손으로 출진을 바꾸면 꺼짐) |
| `site.rest` | 쉬는 부대 `{ id: 쉬는 주 번호 }` (그 주 전투에 안 나감) |
| `site.budgetAdded` | 단계 보상·마석 보급으로 늘어난 마석 합 |
| `quest.noDeath` | 이 의뢰는 부대 사망 없음 (첫 의뢰) |
| `quest.stages[i].budget` | 그 단계를 채우면 마석 추가 (2층 의뢰 3단계 = 2층 건설용) |
| `seed` | 주소 `?seed=숫자`가 있으면 새 게임(저장 없음·reset) 씨앗으로 씀 (재현 검사용) |

1차 저장(층별 출진 칸 없음)은 불러올 때 `site.units`의 배치를 `deploy`로 옮긴다.

## 6. 세로 층 (zones.js)

- 현장 배치 = 1층 판 + 아래층 작은 판. **2층 구역 id는 층 번호가 붙는다**: `'2E'`(2층 입구)·`'2L'`·`'2R'`·`'2H'`(합류점)·`'2DL'`·`'2DR'`·`'2B'`(보물방). 1층 id(TL·CB·B ...)와 절대 안 섞임.
- 2층이 잠겨 있으면 보물방 = 1층 `B`. **열리면 1층 `B` = 계단**(`NAMES.B` = "계단 (2층으로)"), 침입자는 1층 → B → `2E` → … → `2B`(보물방).
- 잠긴 층 구역도 `site.zones`에 처음부터 있다 (빈 구역). 짓기·출진은 거절.
- `ZONES.MAP`·`flowPairs()`는 **예전 화면 호환으로 1층만**. 층별 그리기는 아래 함수.

| 함수 (`window.ZONES`) | 돌려주는 값 |
| --- | --- |
| `useSite(board, floors, open)` | 배치 끼우기 (progress.js가 부름. 화면은 부르지 말 것) |
| `floorInfo(n)` | `{ n, board, name, desc, open, entry, bottom, stairs(맨 아래가 계단인가), ids[구역], rows, rowOff, MAP }` |
| `floorMap(n)` | n층 칸 배열 (그 층 구역 id) |
| `stackMap()` | 모든 층을 위아래로 쌓은 칸 배열 (층 사이 1줄은 `null`). 좌표가 `anchorOf`·`doorOf`와 같음 → **세로 단면·전투 화면용** |
| `floorOf(z)` · `floorOpen(n)` · `isStairs(z)` · `goal()` | 구역의 층 · 층 열림 · 계단인가 · 지금 보물방 구역 (`'B'` 또는 `'2B'`) |
| `densOf(zones, n)` · `denSlots(zones, n)` | n층 대기실 구역 목록 · 자리 합 |
| `flowPairs(n 또는 'all')` | n층 문 / 열린 층 전부(계단 `['B','2E']` 포함, 계단은 `sharedEdge`가 null) |
| `FLOORS` · `OPEN` · `GOAL` | 층 수 · 열린 층 수 · 보물방 (끼울 때 붙는 값) |

- 전투 좌표: 2층은 1층 아래 한 줄 띄우고 이어진다 (y = 8.5 …). `doorOf('B','2E')` = 두 구역 가운데 (계단). **지금 battle.js는 `Z.MAP`(1층)만 그려서 2층이 열린 전투에서는 분대가 판 아래로 나간다 → 3차에서 `stackMap()`으로 그릴 것.**
- `FAC.boss.st`·`FAC.den.st` 글을 지금 규칙으로 고침 (대기실 = 칸당 부대 1자리).

## 7. 층별 출진 (progress.js)

규칙: 부대·친위대를 **층에** 출진시킨다. 층 한도 = `min(BATTLE_DATA.FLOOR_CAP[층], 그 층 대기실 자리 합)` → **대기실이 없는 층은 한도 0**. 친위대도 한 칸. 한 부대는 한 층에만.
출진한 부대는 그 층 대기실들에 나눠 선다: `placeUnit`으로 고른 곳(pins)이 먼저, 나머지는 한 부대씩 **실제 전투력(부대 배치를 넣은 통과 비율)이 가장 커지는 대기실**로. 전투력이 같으면(친위대는 전투력에 안 셈) 빈 판 통과 비율이 큰 곳 → 덜 찬 곳 → 길 순서. 그래서 몬스터가 보여 침입자가 피하는 대기실로 나눠 서서 전투력이 줄지 않는다(같은 입력 = 같은 결과). **기본 자동 편성**(`site.auto`, 처음 켬): 빈 칸이 생기면(대기실 짓기·조달·쉼 해제) 쉬지 않는 부대를 전투력 큰 순으로 채움(부대 먼저, 친위대는 남는 칸). 출진을 손으로 바꾸면 꺼짐.

| 함수 | 돌려주는 값 | 언제 |
| --- | --- | --- |
| `floorInfo(n)` | `{ n, open, cap(지금 한도), capMax(데이터 한도), slots(대기실 자리), dens[구역], units[부대 보기], fighting(이번 주 싸울 수), lockAt(열리는 단계, 열렸으면 0), power(그 층 전투력) }` | 층 칸 |
| `floorsInfo()` | 위 배열 (1층부터) | 세로 단면 |
| `floorPower(n)` | n층 전투력 (그 층 입구 기준 통과 비율) | 진행표 "2층 전투력" |
| `sortieUnit(id, floor)` | `{ ok, msg, stages }` 층에 출진 (다른 층이면 옮김). 거절: 잠긴 층 · 대기실 없음 · 한도 참 · 쉬는 중 · 이미 그 층 | 출진 버튼 |
| `withdrawUnit(id)` | `{ ok, msg, stages }` 출진 해제 | |
| `setAutoDeploy(on)` | `{ ok, msg, stages }` 자동 편성 켜기·끄기 (켜면 바로 채움) | |
| `isResting(id)` | 이번 주 쉬는가 | |
| `battleNotes()` | 다음 주 알림 글 배열 (싸울 부대 없음·쉬는 부대) — `startBattle().msgs`와 같음 | |
| `placeUnit(z, id)` · `removeUnit(z, i)` | **호환 유지**: placeUnit = 그 대기실 층에 출진 + 그 대기실 고름, removeUnit = 그 자리 부대 출진 해제. 둘 다 자동 편성 끔 | 3차에 화면이 바뀔 때까지 |

- 부대 보기(`unitById`·`squads`·`guards`·`idleUnits`)에 `floor`(출진한 층, 0 = 대기) · `resting` · `restWeek` 추가. `placed` = 서 있는 대기실.
- `idleUnits()` = 출진 안 한 부대 (쉬는 부대도 `resting: true`로 보임).
- `previewBuild(z, k)`: `floor` 추가, 잠긴 층이면 `{ ok:false, locked:true, floor }`. `units`는 지은 뒤 편성(한도가 줄면 `back`명 대기로, 자동 편성이면 채운 모습). 건설비 = 시설 비용 × `FLOOR_BUILD_MUL[층]`.
- `powerInfo()`: `parts[].floor` · `floors{ 층: 전투력 }` 추가. 전투력은 열린 층만, **쉬는 부대도 셈**(인계 편성이라서, 자리 그대로).
- `questProgress()`: `budgetAdded` 추가. `cur.floor2` = 실제 2층 전투력.
- `battleInput()`: `units`에서 **쉬는 부대를 뺌**, `goal`(보물방 구역) 추가.
- `startBattle().msgs`: 막지 않는 알림 (싸울 부대 없음 · 쉬는 부대). 옛 "건설에 금을 써야" 류 문구 없음.

## 8. 퇴각·쓰러짐·사망

- 전투 중: 부대(친위대) 전체 체력이 `RETREAT.hpRatio`(0.25) 아래면 그 대기실에서 빠짐 → BSIM 사건 `{ type:'mretreat', z, id, big, down, guard }`, 그 개체들 `S.dens[z][i].out = true` (화면은 out이면 빼거나 흐리게). `livingMon`은 out을 뺌.
- 큰 피해 = 퇴각하는 순간 최근 `burstWindow`초 피해가 부대 전체 체력의 `bigShare` 이상.
- `BSIM.result`: `monRetreat: [{ id, big, down, guard }]` · `monDown: { id: 쓰러진 인원 }` · `crises` 추가.
- `applyBattle` 보고에 추가:

| 칸 | 모양 |
| --- | --- |
| `retreats` | `[{ id, name, kind:'squad'|'guard', big, down, died, wiped, refill }]` |
| `casualties` | `{ down:[{ id, name, n }](체력 0이 됐던 인원, 사망 아니면 회복), retreated:[{ id, name, kind, big }](다음 주 쉼), died:[{ id, name, n, wiped, refill }](실제 사망) }` |
| `deaths` · `noDeath` | 사망 수 · 이 의뢰는 사망 없음이었나 |
| `restMsgs` | 결과표용 한 줄 글 배열 ("돌등껍질족 부대 퇴각 -> 다음 주 쉼 · 1명 사망") |
| `crises` | 이번 전투 위기(카드) 수 |
| `budgetGain` · `budgetAfter` | 의뢰인 마석 보급 (`WEEKLY_BUDGET`) · 지원 뒤 남은 마석 |

- 규칙: 퇴각 → 다음 주 전투 쉼(자리 그대로) → 그다음 주 저절로 복귀. **큰 피해로 퇴각했을 때만** 쓰러진 인원마다 `deathChance`로 사망. **첫 의뢰(noDeath) 사망 없음. 친위대 불사**(퇴각만). 숙련도·레벨은 안 줄어듦. 인원 0(전멸) → 다음 주 기본 인원(`MON_SQUAD.start`) 무료 보충.

## 9. 카드 위기 (B안)

- BSIM 사건 `{ type:'crisis', kind:'surge'|'treasure'|'boss', n(이번 전투 몇 번째), left(남은 장 수), id(분대, 없으면 -1), x, y }` → **이 사건이 오면 이벤트 카드를 띄운다** (진행도 15·30·45·60% 카드 대신).
- 전투 한 번에 최대 `cardRule().maxPerBattle`(2). 횟수는 전투 상태 `S.crisis`에 있어 저장 지점 복원·배속(dt)과 상관없이 같다. `BSIM.crisisLeft(S)` = 남은 장 수.
- 종류: surge = 대량 출현 주의 첫 분대 진입 또는 던전 안 분대 `massSquads`(3)개 이상 · treasure = 분대가 보물방 바로 앞 구역에 들어서거나 진행도 `crisisProgress`(85)% 이상 (분대마다 한 번) · boss = `plan.boss` 주 (데모엔 없음).
- `cardRule()` = `{ mode, maxPerBattle, crisisProgress, kinds[{ id, label, text }] }`.
- `setCardCount`·`prefs.cards`(배속 때 카드 수)는 옛 방식 칸으로 남아 있음 (위기 방식에서는 안 써도 됨).

## 10. 튜토리얼·데모 끝

- `deliver()`는 이제 **튜토리얼을 끄지 않는다** (정산 화면의 'deliver' 안내가 떠야 함). 끄는 때: settle에서 `pickQuest`로 다음 의뢰를 고를 때 · `leaveSettle()` · `skipTutorial()`.
- deliver 보고에 `demoEnd: true`면 다음 의뢰가 없다.
- `demoState()` → `{ end, phase, canLeave, msg }`. `leaveSettle()` → `{ ok, msg, phase }`: settle + 의뢰가 다 끝났을 때 phase를 `'demoEnd'`로. demoEnd에서는 `startBattle`·건설·출진이 거절되고 `offerQuests()`는 `[]`. 새로 하려면 `reset()`.
- `unlocks().demoEnd` 추가.

## 11. 새 숫자 (battle_data.js, 모두 임시, 측정 근거는 파일 주석)

| 이름 | 값 | 뜻 |
| --- | --- | --- |
| `FLOOR_CAP` | `{1:3, 2:2}` | 층 출진 한도 |
| `FLOOR_BUILD_MUL` | `{1:1, 2:1.2}` | 층 건설비 배율 |
| `RETREAT` | `hpRatio 0.25 · burstWindow 4 · bigShare 0.4 · deathChance 0.35` | 퇴각·큰 피해·사망 |
| `WEEKLY_BUDGET` | ~~10~~ → **30** (12절) | 의뢰인 마석 보급 (막힘 방지) |
| `CARD_RULE` | `maxPerBattle 2 · crisisProgress 85 · massSquads 3 · kinds` | 카드 위기 |
| `TRIBES[].grow` | hp·atk 0.5 (← 0.2) | 레벨 성장 |
| `EXP` | deploy 8 · fight 8 (← 4·12) | 출진·참여 경험치 |
| q1 `stages` | 가치 30/55/80/105/130 · 전투력 50/75/100/130/160 | 첫 의뢰 3주 안팎 |
| q2 `stages` | 3단계 `budget:150` · 4단계 가치 190·전투력 200·2층 50 · 5단계 230·250·2층 90 | |

---

# 12. 사용자 플레이 소감 뒤 (2026-10-23)

화면 이름: 의뢰 예산 = **마석**, 주간 지원금 = **마석 보급**, 보석 = **신석** (코드 변수 `budget`·`gems`는 그대로). 저장은 **v6 그대로** (칸 하나 늘어남, 아래).

| 바뀐 것 | 내용 |
| --- | --- |
| 첫 의뢰 판 | q1 = **외길(`line`)**. 큰길 `R1`~`R5`는 침입자 모두가 지남. 고정 구역 얼어붙은 하역장 = `R3`(큰길 가운데). 마석 260 → **110** (외길은 같은 마석으로 전투력이 커서, 근거 battle_data.js QUESTS 주석). 갈림길(세 갈래)은 q2부터 |
| 튜토리얼 강조 | `tutorialPath()` = **모두 지나는 칸**(`ZONES.mustPass()`) 중 지을 수 있는 방 (고정 구역 뺌). q1이면 `['R1','R2','R4','R5']`. 반드시 지나는 칸이 없는 판(옛 저장의 세 갈래 첫 현장)이면 통과 비율이 가장 높은 칸들 (빈 배열 안 됨). 튜토리얼이 아니면 null (예전과 같음) |
| 입구 대기 | 입구 시설 `wait`(대기, 마석 10, 전원 가운데 길로) 다시 지을 수 있음 (`DEMO_FACILITIES.entry = ['split','wait']`). 굽은길은 여전히 없음. q2 정산 안내에 한 줄 (lines.js `deliver`) |
| 마석 보급 | `WEEKLY_BUDGET` 10 → **30** (큰길 시설 하나 = 3칸 × 10). 새 함수 `P.weeklyBudget()` → 숫자 (다음 주 마석 +N). `questProgress().weeklyBudget`도 같은 값 |
| 대기실 부대 | 몬스터 대기실을 지으면 **기본 부대 +1** (`MON_SQUAD_FREE`와 같은 부족·인원, `free: true`, 시작 레벨 = 조달과 같음). 자동 편성이 켜져 있으면 바로 출진 칸에 들어감. 마석 조달은 다른 부족·추가 부대용으로 그대로 |
| q2 마석 | 200 → **150** (2층 대기실 부대가 2층 전투력 조건을 바로 채워 q2가 전투 1번에 끝나서. 근거 battle_data.js) |
| 무한 생성 막기 | 한 현장에서 받는 수 ≤ **동시에 있었던 대기실 수의 최고치** × `DEN_GIFT`(1). 철거 → 재건, 다른 칸으로 옮겨 짓기로는 안 생김. 마석 0이면 대기실을 못 지어 안 생김 |

### 함수·칸

| 이름 | 모양 |
| --- | --- |
| `P.weeklyBudget()` | 마석 보급 값 (지금 30) |
| `previewBuild(z, k)` | 추가: `gift`(지으면 받을 부대 수, 0·1) · `giftTribe` · `giftCount` · `giftText`("기본 부대 +1 (돌등껍질족 3명, 무료)", 없으면 `''`). `powerAfter`·`units`는 **받을 부대까지 넣은** 편성 (units에 아직 없는 새 부대 id가 들어 있을 수 있음 → `unitById`가 null) |
| `buildZone(z, k)` | 추가: `gift`(받은 수) · `units`(받은 부대 보기 배열). `msg` 끝에 " · 기본 부대 +1 (…)" |
| `questProgress()` | 추가: `weeklyBudget` |
| `ZONES.mustPass()` | 지금 배치에서 입구 → 보물방 길을 막으면 못 가는 구역 (판 모양만, 길 순서). 외길 = `R1`~`R5`, 세 갈래 = `[]` |
| `RUN.site.denGifts` | 이 현장에서 대기실로 받은 부대 수. **옛 v6 저장**(칸 없음)은 불러올 때 지금 대기실 수 × `DEN_GIFT`로 채움 (소급 지급 없음, 다음 새 대기실부터 받음). 옛 저장의 q1 현장은 세 갈래 판 그대로 진행 |

### 화면 쪽에 넘길 일 (로직은 끝, 화면 파일은 안 고침)
- 건설 미리보기(build.js `zpreview`)에 `p.giftText`가 있으면 한 줄 보여 주기 (지금은 전투력 증가로만 보이고, 완공 토스트에는 나옴).
- 현장 위/결과표에 "다음 주 마석 +`P.weeklyBudget()`".
- build.js `zoneWhy`의 입구 글 "데모에서는 분기로 고정이에요" → 대기도 지을 수 있음으로.

---

# 13. 문 토큰 판 + 탐험 이동 + 조우 즉시 승패 (3차, 2026-10-24)

근거 `docs/DESIGN_D1_DOORS.md` (12절 사용자 확정 우선). 이번 단계는 **q1(1층)만** 새 판. **q2는 데이터에 `hidden: true`로 꺼 둠** → q1 납품 뒤 정산을 닫으면 데모 끝.

## 13-1. 판 (zones.js, 데이터 = `BATTLE_DATA.GRID_BOARDS`·`GRID`)

| 것 | 규칙 | 예 |
| --- | --- | --- |
| 칸 id | 층 번호(1층 생략) + 열 `A`~`E` + 행 `1`~`7` | `C4`, 2층 `2C4` |
| 방 id | 입구 칸 = `E`(`2E`), 보물방 칸 = `B`(`2B`), 여러 칸 방 = 데이터 이름, 나머지 = 칸 id | `FZ1` = `B4`·`C4`·`D4` (얼어붙은 하역장) |
| 벽 조각 id | 이웃한 두 칸 id를 위→아래·왼→오른 순서로 `-` | `C2-C3`, `B3-C3`, `2C2-2C3` |
| 문 | 벽 조각 하나에 열린 통로 (양방향). **같은 방 안쪽 벽(`B4-C4`)은 벽 조각이 아님** | |
| 계단 | 위층 `B` → 아래층 입구 (문 토큰 아님, 층이 열렸을 때) | |
| 좌표 | 칸 단위: x = 열 + 0.5, y = 행 + 0.5 (+ 층 줄 오프셋). 2층은 1층 아래 한 줄 띄움 (`rowOff` 8) | `roomCenter('FZ1')` = {2.5, 3.5} |

q1 판 `g1` (33방, 문 35개 = 방 수 + 2): 입구에서 **왼쪽 끝 길(A열)·가운데 길(C열, 하역장 지남)·오른쪽 끝 길(E열)**이 셋 다 보물방 옆으로 모임 + 곁방 8개 + 지름길 1개(`A4-B4`). 반드시 지나는 방은 없음.

| 함수 (`window.ZONES`) | 돌려주는 값 |
| --- | --- |
| `grid(n)` | `{ n, cols:5, rows:7, rowOff, cells[행][열] = 방 id, rooms{ 방 id: [칸 id] }, entry, goal(그 층 맨 아래), stairs, open, board }` |
| `edges(n)` | `[{ id, a, b(칸), ra, rb(방), x, y(벽 가운데 전투 좌표), vertical(벽이 세로 = 가로 이웃) }]` |
| `doorPoint(edgeId)` · `roomCenter(방 id)` · `entryPoint(n)` | 문 가운데 · 방 가운데 · 층 입구 위쪽 (야외/계단에서 들어오는 곳) |
| `initialDoors(n?)` · `doorCount(n)` · `doors()` · `DOORS` | 판의 처음 문 (`{ 층: [...] }` 또는 n층 목록) · 토큰 수 · 지금 문 `{ 층: [...] }` · 지금 문 배열 |
| `validateDoors(list, n)` | `{ ok, code('tokens'·'target'·'disconnected'), why, isolated[방] }` |
| `exploreRoute(doors, zones, squad, seed)` | `{ squad, habit(squad % 3: 0 왼쪽·1 오른쪽·2 아래), rooms[방], steps[{ from, to, edge, backtrack, floor, stairs? }], reached, passes{ 층: 문 통과 수 } }` |
| `passInfo(zones, doors?)` | 미리보기 경로 12개(고정 시드 `GRID.previewSeeds` × 습관 3)로 센 `{ n, ratio{방}, trap{방: 평균 min(들어간 횟수,2)}, passes[습관별 최대], maxPass, worst, flow{'a>b'} }` |
| `passRatios(zones, units?, doors?)` · `forecast(zones, units, n, doors?)` · `mustPass(doors?)` · `bossFront(doors?)` | 위 경로로 계산 (부대는 길에 영향 없음, 대기실 "보여서 피함" 없음) |
| `boardFixed(boards)` · `boardInfo(id)` | 판의 고정 구역 · 의뢰 카드 미리보기 (`MAP`, `NAMES`, `doors`) |
| 옛 이름 (호환) | `MAP`(1층 방 id 칸 배열) · `NAMES`(“가운데 4”, “얼어붙은 하역장”) · `CELLS` · `ALL` · `ORDER` · `EXITS`(문으로 이어진 이웃) · `flowPairs(n)`(문 = 방 쌍) · `sharedEdge(a, b)`(그 문의 두 칸) · `anchorOf` = `roomCenter` · `doorOf(a, b)` |
| 없어짐 | `routeOf` · `chooseExits` · `tutorialZones` · 옛 판 `fork3`·`line`·`fork2x`·`mini2` (`BOARDS`는 이제 `g1`만) |

## 13-2. 문 옮기기·미리보기 (progress.js)

| 함수 | 돌려주는 값 | 언제 |
| --- | --- | --- |
| `doorInfo(n)` | `{ n, doors[벽 조각 id], count(토큰 수), limit(문 통과 한도 30), canEdit, why }` | 건설 모드 |
| `previewLayout(change)` | change = `{ doors:{ 층:[벽 조각 id 전부] }, builds:{ 방: 시설 } }` (미확정 전부). → `{ ok, why, code, cost, budgetAfter, valueNow, valueAfter, powerNow, powerAfter, gift, giftTribe, giftCount, giftText, units, back, zones, doors, isolated[방], floor, passes[습관별 한 층 최대 문 통과], limit, paid, changed{doors, builds[방]} }` | 끄는 동안·놓을 때 |
| `commitLayout(change)` | `{ ok, msg, code, stages, gift, units }` — [건설] 한 번에 문 + 시설 확정. **문 옮기기는 무료** | [건설] |
| `exploreRoutes(seed?)` | `[{ squad, habit, rooms, steps, reached, passes }]` (seed 없으면 이번 주 계획 시드, 분대 수 = 계획 분대 수) — **같은 시드면 실제 전투 경로와 같음** | `?debug` 경로 선 |
| `previewBuild(z, k)` · `buildZone(z, k)` | **호환 유지** (= 시설 하나짜리 previewLayout/commitLayout + 옛 칸 `baseCost`·`discount`·`counts`·`from`·`floor`) | 옮기는 동안 |
| `takeNotice()` | 한 번 보여 줄 안내 글 (옛 v6 저장을 바꿨을 때), 읽으면 지움. 없으면 `''` | 시작 화면 토스트 |

`code`와 거절 글:

| code | 언제 | why 예 |
| --- | --- | --- |
| `locked` | 전투 중·의뢰 없음·잠긴 층·고정 구역 | "전투 중에는 바꿀 수 없어요", "2층은 아직 잠겨 있어요", "고정 구역이라 바꿀 수 없어요" |
| `target` | 없는 벽·겹친 문·못 짓는 시설 | "문이 없는 다른 안쪽 벽에 놓아 주세요", "지을 수 없는 시설" |
| `tokens` | 층 문 수가 판의 토큰 수와 다름 | "안쪽 벽에 문 35개를 유지해야 해요" |
| `disconnected` | 입구와 끊긴 방 (`isolated`) | "(왼쪽 2) 방이 다른 방과 끊겨요" |
| `budget` | 시설 비용 > 남은 마석 | "마석 5 모자람" |
| `limit` | 미리보기 경로 12개 중 한 층 문 통과가 한도(`GRID.passLimit` 30)를 넘음 → **확정 불가** | "분대 1 문 통과 51회: 최대 30회를 넘습니다" |

- 순서: locked → target → tokens/disconnected → budget → limit. 문이 깨진 배치면 `powerAfter = powerNow`.
- 시설을 바꿔도 미끼 위치가 바뀌면 길이 바뀌므로 `limit`에 걸릴 수 있다.
- 전투력(B안): 대기실 = 부대 점수 × 통과 비율, **함정 = 함정 점수 × 경로마다 min(들어간 횟수, 2)의 평균** (`powerInfo().parts[].w`가 곱한 값).
- `tutorialPath()`: 반드시 지나는 방(`mustPass`, 고정 구역 뺌)이 있으면 그것, **없으면 보물방과 문으로 이어진 방들**(처음 g1 = `C6`·`B7`·`D7`, 침입자는 이 중 한 곳을 꼭 지남).
- 입구 시설은 `split`(이름 "입구")만. 대기·굽은길 없음.

## 13-3. 전투 (battle_sim.js)

| 바뀐 것 | 내용 |
| --- | --- |
| 입력 | `battleInput()`에 `doors`(`{ 층: [...] }`) 추가. `BSIM.create(o)`·`restore(o, snap)`가 `o.doors`로 길을 계산 |
| 길 | 분대 `i` = `ZONES.exploreRoute(doors, zones, i, plan.seed)` (`q.route`). 지나갈 점 = 문 가운데 + 방 가운데. 되돌아가는 걸음 포함 |
| 조사 | 처음 들어간 방 가운데에서 `GRID.inspect`(0.6)초 멈춤. 사건 `{ type:'inspect', id, z, x, y }` (화면 `?`). 상태는 `'move'` 그대로 |
| 빠르게 | 다음 방을 이미 가 봤거나 지금 방이 빈 대기실이면 이동 × 1.5 (`q.fast`) |
| 함정 | 같은 분대가 그 함정 방에 3번째부터 들어가면 굴리지 않음 (`q.trapIn[방]`) |
| 조우 | 산 몬스터가 있는 대기실 가운데에 닿는 순간 승패. 사건 `{ type:'clash', id, z, win(몬스터 승), x, y, t }` → **그 분대만 2초**(`CLASH.encounter` 1초 ⚔ + `outcome` 1초 ✔/💨) `state 'fight'`, `q.clash = { z, win, t(지난 초), ip, mp }`. 다른 분대는 계속 움직임 |
| 승패 | 힘 = (산 쪽 체력 합 ÷ 받는 피해 배율) × 평균 공격 (+카드), 양쪽 ±20% 무작위. 몬스터 승 = 2초 뒤 침입자 분대 퇴각(격퇴). 몬스터 패 = 그 대기실 부대 모두 바로 퇴각(`mretreat`, 다음 주 쉼), 침입자는 피해 뒤 계속 |
| 이긴 쪽 피해 | 지금 체력 × min(0.4, 0.5 × 진 쪽 힘 ÷ 이긴 쪽 힘) |
| 침입자 퇴각 | 분대 체력 합이 처음의 절반 아래면 퇴각. 사건 `{ type:'iretreat', id, cause:'trap'|'den'|'clash'|'card'|'timeout', x, y }` (분대 `state 'retreat'`) |
| 사망 | 없음 (`mretreat.big`·`monRetreat[].big` 늘 false) |
| 시간 초과 | 남은 분대 퇴각 = **방어 성공** (보물방 도달만 실패). 조우에서 이미 진 분대는 격퇴로 셈 |
| 층별 차례 (구조만) | 분대는 계단(위층 B)에 닿으면 `state 'stairs'`, 사건 `stairs`. 그 층 분대가 모두 끝나면 사건 `{ type:'floorEnd', n, next, waiting }` → `S.pending` 동안 `step`은 아무것도 안 함 → 화면이 알림 뒤 **`BSIM.nextFloor(S)`** → 사건 `floorStart`, 다음 층 시간 `GRID.nextFloorTime`(30초). `BSIM.timeLeft(S)` = 이번 층 남은 초. (q1은 1층이라 안 생김) |
| 위기 treasure | 보물방과 문으로 이어진 방에 들어설 때 (`S.front`, 문을 옮기면 바뀜) |
| 결과 | `result(S)`에 `trapRetreats`(함정으로 퇴각·전멸한 분대) · `denRepels`(대기실에서 격퇴) · `clashRetreats` · `timeouts` · `clashes` · `squadResults[{ id, habit, state, cause, passes, time }]` |
| 결과표 | `applyBattle()` 보고에 `summary` = "함정으로 N분대 퇴각, 대기실에서 N분대 격퇴" (`BATTLE_DATA.SUMMARY_TEXT`) · `trapRetreats` · `denRepels` · `clashes` |
| 이동 속도 | `MOVE_SPEED` 0.32 → **0.5** (1칸 2초) |
| 없어짐 | 공방 주고받기(`fightDens`), 매 틱 `clash {z}`·`fight` 사건 (대신 위 `clash` 한 번) |

## 13-4. 저장 v7

| 칸 | 모양 | 뜻 |
| --- | --- | --- |
| `v` | `7` | |
| `site.boards` | `['g1']` | 층별 판 id (`site.board`는 없앰) |
| `site.doors` | `{ '1': ['B1-C1', ...] }` | **확정된** 문. 불러올 때 층마다 개수·벽·이어짐을 검사해 깨졌으면 그 층만 판의 처음 문으로 |
| `quest.boards` · `quest.board` | `['g1']` · `'g1'` | 의뢰의 층별 판 (board = 1층, 옛 화면 호환) |
| `quest.fixed` | `{ FZ1: 'frozen_dock' }` | 판 데이터에서 옴 |
| `notice` | 글 | 한 번 보여 줄 안내 (`takeNotice`) |
| `bsave.snap` | 전투 상태 | 문은 넣지 않음 (복원 때 `battleInput().doors`로 같은 길을 다시 계산, 전투 중에는 문을 못 바꿈) |

옛 **v6 → v7 (B안)**: 회사 금·신석·회사 레벨·친위대·작품집·부족 강화·끝낸 의뢰·튜토리얼·설정은 그대로. `play`였으면 **같은 의뢰를 새 판으로 처음부터**(단계 0, 마석 처음 값, 무료 기본 부대만, 시작 주 = 지금 주). 전투 중 저장·이번 주 계획은 버림. 그 의뢰가 숨겨졌으면(q2) 남은 데모 의뢰가 있으면 `choose`, 없으면 `demoEnd`. `settle`은 그대로(새 빈 현장 + 옛 부대 목록). 예시 저장 = `tools/oldsaves/d1/*.json`.

## 13-5. 화면(frontend)에 넘길 일

- build.js: 문 끌기(빈 벽 = `edges(n)` 중 문이 없는 것) → 끄는 동안 `previewLayout({ doors })`로 거절 글(`why`)·끊긴 방(`isolated`) 표시, 미확정 문·시설을 모아 [건설] = `commitLayout`. 파이프 = `edges`의 `ra`·`rb` 가운데 → `x,y` → 가운데.
- battle.js·stage.js: 5×7 격자(`grid(1).cells`, 여러 칸 방 `rooms`), 문은 `doors()`, 분대는 `q.x·q.y` 그대로(되돌아가는 걸음도 같은 점). 사건 `inspect`(`?`), `clash`(⚔ 1초 → `win`이면 ✔, 아니면 💨 1초), `iretreat`(침입자 퇴각), `stairs`·`floorEnd`·`floorStart`(2층 단계용).
- 결과표: `rep.summary` 한 줄. 옛 v6 저장을 바꾼 뒤 첫 화면에 `P.takeNotice()` 토스트.
- 튜토리얼 글(lines.js `zones`): 강조 칸이 이제 "보물방 바로 앞 방들(침입자는 이 중 한 곳을 꼭 지나요)"이다. "반드시 지나는 길"이라는 글은 고쳐야 함.
- 입구 시설 시트: 대기·굽은길 없음 (`facFor('E')` = `['split']`).

## 14. 시설 강화 (2026-10-25, 근거 `docs/specs/facility_upgrade.md`)

함정 = 피해, 몬스터 대기실 = 그 방에 출진한 부대·친위대의 **전투 체력**. 기본 포함 3단계, 마석만 씀(시간 안 흐름). 숫자 표 = `BATTLE_DATA.FAC_UP` (단계 줄을 더하면 단계 수가 늘어남).

| 시설 | 1단계(기본) | 2단계 | 3단계 | 올리는 비용 |
| --- | --- | --- | --- | --- |
| 함정 (`trap`) | 피해 6 | 7 | 8 | 10 → 20 (누적 30) |
| 대기실 (`den`) | 체력 ×1.00 | ×1.05 | ×1.10 | 10 → 20 |

### 14-1. 함수

| 함수 | 돌려주는 값 |
| --- | --- |
| `upgradeInfo(방, change?)` | 강화 창용 미리보기, **아무것도 안 바꿈**(닫기 = 무변경). `{ ok, why, code, z, name(방 이름), fac, facName, kind('trap'·'den'), level(1~), max, cost(다음 단계 비용, 최고면 0), effectNow{ text, dmg 또는 hpMul }, effectNext(최고면 null), paid(이 방에 지금까지 낸 강화 마석), budget, budgetAfter, powerNow, powerAfter(정수, 납품 기준과 같은 값), powerGain(소수 1자리 증가량: 정수로 +0이어도 조금 오르는 걸 보일 때), valueNow(강화로 안 바뀜), pass(통과 비율 0~1, 낮으면 "문 배치부터 바꿔 보세요"), units[출진 부대 보기](대기실), noEffect(빈 대기실 = 전투 효과 없음) }`. `change` = 화면의 미확정 배치 `{ builds }` (그 방이 미확정이면 `code 'pending'`) |
| `upgradeFacility(방, change?)` | `{ ok, msg, code, level(올린 뒤), cost, stages }`. 한 번 = 한 단계, 마석 차감 → 편성·납품 단계·침입자 예고 다시 계산 → 저장 |
| `upgradeLevel(방)` | 판에 단계 표시용 숫자 (1 = 기본) |
| `powerInfo().parts[].lv` | 전투력 조각에 그 시설 단계 |

`code`: `locked`(전투 중·의뢰 없음·잠긴 층·고정 구역) · `target`(없는 방·입구·보물방·빈 방·미끼·강화 없는 시설) · `pending`(미확정) · `max`(최고 단계) · `budget`(마석 부족, 이때도 `effectNext`·`powerAfter`는 채워 줌) · `''`.
거절 순서: 전투 중 → 없는 방 → 잠긴 층 → 고정 구역 → 입구·보물방 → 미확정 → 빈 방·미끼 → 최고 단계 → 마석.

### 14-2. 교체·철거 (previewLayout·commitLayout에 늘어난 값)

| 값 | 뜻 |
| --- | --- |
| `previewLayout().upLost` | `[{ z, name, fac, level, paid }]` 이번 배치로 **사라질 강화** (그 방의 시설이 바뀜) |
| `previewLayout().refund` | 돌려받을 강화 마석 합 (= 실제 낸 `paid`). **`budgetAfter`에 이미 더해져 있음**, 마석 검사도 `건설비 <= 남은 마석 + 환급` |
| `previewLayout().ups` | 바뀐 뒤 강화 모양 (읽기용) |
| `commitLayout()` | `refund`·`upLost` 같이 돌려줌, `msg` 끝에 "강화 N곳 사라짐, 강화 마석 +N 환급" |

- 문만 옮기면 강화 유지. 미확정 배치 취소(부르지 않음)는 무변경. 환급은 확정 때 한 번(강화 칸을 지워서 두 번 안 됨). 건설비 환불 없음은 그대로.
- 환급·재건으로 무료 기본 부대가 더 생기지 않음 (`site.denGifts` 규칙 그대로).
- 납품: 보고 `rep.upgrades`(강화된 시설 수), `rep.lost`에 "시설 강화 N곳 (현장과 함께 인계)". 새 현장 = 강화 없음, 친위대 능력치에 보너스 없음.

### 14-3. 전투 (battle_sim.js)

- `battleInput().up = { trap: { 방: 칸당 더할 피해 }, den: { 방: 체력 배율 } }` (기본 단계는 빠짐). `BSIM.create`가 `S.up`에 담음.
- 함정 1회 피해 = (칸당 6 + 강화) × 칸 수 × 카드 배율 (사건 `trap.dmg`에 보임). 대기실 = 전투 복사본 체력·최대 체력 × 배율 (create 때 한 번). `statOf`·`unitView`의 영구 체력은 안 바뀜.
- `snapshot`에 `up`이 들어가고, `restore`는 저장된 체력을 그대로 써서 **중복 없음**. `up` 없는 옛 저장 지점은 지금 입력으로 채움(함정만 영향, 대기실 체력은 저장 값).
- 전투력(`powerParts`): 함정 점수 × (강화 피해 ÷ 기본 피해), 대기실 부대 점수 = 인원 × (체력 × 배율 ÷ hpDiv + 공격). 시설 가치(`siteValue`)에는 안 더함.

### 14-4. 저장 (v7 그대로)

| 칸 | 모양 | 뜻 |
| --- | --- | --- |
| `site.ups` | `{ C6: { k: 'trap', lv: 3, paid: 30 } }` | 기본 단계는 칸 없음. `k`가 지금 시설과 다르면 효과 없음 |

- 칸 없는 v7 저장 = 모두 기본 단계 (버전 안 올림: 칸이 늘기만 해서 옛 저장도 그대로 읽힘). 깨진 칸(시설 다름·빈 방·고정 구역·입구)은 지우고, 단계는 1~최대로, `paid`는 0 이상 정수로 맞춤.

### 14-5. 화면(frontend)에 넘길 일

- [현장] 기본 화면(건설 모드 아님)에서 함정·대기실을 누르면 아래쪽 상세 창: `upgradeInfo(방)` → 효과 전후·비용·남을 마석·전투력 전후(`powerGain`도), [강화] = `upgradeFacility(방)`, [닫기] = 아무것도 안 부름. 거절이면 `why`를 버튼 옆에.
- 대기실은 `units`(출진 부대)와 "이 방에서만 적용", `noEffect`면 "출진 부대가 없어 효과 없음". `pass`가 낮으면 "문 배치부터 바꿔 보세요".
- 건설 미리보기: `upLost`·`refund`가 있으면 "사라질 강화 · 환급 +N" 표시. 판의 방 단계 표시는 `upgradeLevel(방)`.
- 첫 현장 시작 마석이 **200**(시험값)이라 마석 숫자가 보이는 화면 글·사진이 바뀔 수 있음.

## 15. 흐름 시험 (2026-10-28, 지시서 `refs/brief_flow_test.md`, 근거 `refs/debate_ds_restructure_2026-10-28.md` "최종 수렴" 1~6)

주 단위 [다음 주] 대신 **일반 판이 한 판씩 자동으로 이어지고**, 플레이어가 **[보스 도전]**으로 보스 분대를 보물방 앞에서 막으면 의뢰 단계가 오른다. 손맛 시험이라 작게 만들었고, `BATTLE_DATA.FLOW.on = false`면 1~14절 규칙·화면이 그대로 돌아온다 (검사 `test_d1_core` 1~15절은 끄고, 16절은 켜고 본다).

### 15-1. 규칙

| 것 | 흐름 시험 |
| --- | --- |
| 일반 판 | `startBattle()` = 다음 일반 판. 전투 번호 `RUN.flow.no` +1, 계획 = 예전 `NORMAL`(D·C 1분대씩) 그대로, **씨앗 = `mixSeed(RUN.flow.base, no)`** (게임 무작위 `RUN.seed`를 안 씀 → 같은 번호 = 같은 판). 강함은 예전처럼 위협 점수(`fitPlan`) |
| 일반 판 보상 | 회사 금·신석만 (약탈 빼고). **경험치·회사 경험치·마석 보급(+30)·다음 주 쉼 없음**, `RUN.week` 안 늘어남. 부대는 다음 판에 회복 (판마다 새 전투 복사본) |
| 판 사이 건설 | 일반 판 중에도 `canEdit()` = 통과 (전투 화면에 있을 때만 막힘). 배치를 바꾸면(`afterChange`: 건설·문·강화·출진·조달·부족 강화) **진행 중 일반 판은 버리고**(`dropNormal`, 보상 없음) 다음 판부터 새 배치. 지시서 2번의 "버리고 새 판" 쪽 |
| 보스 | `challengeBoss()` = 진행 중 일반 판은 끊고 바로 보스 판. 표 = `BATTLE_DATA.BOSSES[의뢰 key][단계]` (무리·등급·분대 수·레벨·짐꾼·침입자 카드·힘 배율·**고정 시드**). 위협 점수·회사 레벨과 상관없음 → **같은 단계 재도전 = 같은 침입, 같은 배치면 같은 결과** |
| 보스 중 | 일반 판 없음, 배치·강화 못 바꿈(`locked` "보스전 중에는 바꿀 수 없어요"), 화면은 전투 화면에 묶임, 카드 없음 |
| 보스 판정 | **성공 = 보물방 도달 0** (격퇴·퇴각·시간 초과 모두 성공). 성공 → `quest.stage +1` (층 열림은 예전과 같음) + 그 단계 **의뢰인 보급 + 첫 성공 마석** 한 번 (16절). 실패 = 잃는 것 없음 |
| 단계·납품 | 가치·전투력으로 단계가 오르는 규칙은 끔 (`questUpdate()`는 늘 `[]`). 진행 줄 = "보스 검증 n/5 · 다음 보스: 이름". 5단계 성공 → `checkQuest()` 참 (가치·전투력 재확인 없음). 납품은 `deliver()` 그대로 (진행 중 일반 판은 버림) |
| 튜토리얼 | 새 게임 `tutorial.on = false`, 화면 `tutOn()`도 거짓 (새 흐름과 안 맞는 말풍선) |

### 15-2. 함수 (`window.PROGRESS`)

| 함수 | 돌려주는 값 |
| --- | --- |
| `flowInfo()` | `{ on, no(일반 판 번호), mode(''·'normal'·'boss'), battling, show(닫지 않은 보스 결과 또는 null), boss(bossInfo), rest(판 사이 실제 초), saveEvery }` |
| `bossInfo()` | `{ stage(도전할 단계 1~), total, name, squads, groups[{ name, grade, squads, lv }], tries(이 의뢰 도전 수), reward, supply, gain(16절), done(모두 통과), canChallenge, why }` · 진행 중 의뢰 없으면 null |
| `challengeBoss()` | `{ ok, msg, plan, msgs }` (보스 판 시작. 이미 보스 중이면 그 판) |
| `closeBossResult()` | 보스 결과 창 닫기 (`flow.show = null`) |
| `stopBattle()` | 진행 중 일반 판 버리기 (보스는 안 됨) |
| `startBattle()` | 흐름 시험: 다음 일반 판 (보스 결과 창도 닫음) |
| `applyBattle(res)` | 흐름 시험: `{ mode, no, gold, gems, loot, reached, squads, defended, summary, trapRetreats, denRepels, stages, budgetGain, budgetAfter, boss, progress }`. 보스면 `boss` = 아래 보스 결과 |
| `questProgress()` | 늘어난 칸 `flow`, `boss`(bossInfo). `line`·`why`가 보스 검증 글 |

보스 결과 (`applyBattle().boss` = `RUN.flow.show`): `{ stage, name, success, reached, squads, rows[{ id, grade, state('reached'·'retreat'·'dead'), cause, causeText, rooms(지난 방 수), last·lastName(끝난 방), trapDmg(함정에 잃은 체력), hpLeft(%) }], trapDmg(합), causes{ 원인 글: 분대 수 }, tries, reward, supply(16절), time, stageAfter, total, complete }`.

`battle_sim.js` `result()`에 늘어난 값: `trapDmg`, `squadResults[].grade·rooms·last·trapDmg·hpLeft` (함정이 실제로 깎은 체력을 분대마다 `q.trapDmg`에 쌓음, 옛 저장 지점엔 없어서 0).

### 15-3. 저장 (v7 그대로, 칸 하나 늘어남)

| 칸 | 모양 | 뜻 |
| --- | --- | --- |
| `flow` | `{ no, base, mode, tries, cleared[단계], show }` | 일반 판 번호·씨앗 바탕·진행 중 전투 종류·보스 도전 수·첫 성공 보상 받은 단계·닫지 않은 보스 결과 |
| `plan.mode`·`plan.no`·`plan.stage`·`plan.name` | | 진행 중 전투가 일반 몇 판인지 / 보스 몇 단계인지 |
| `bsave.ui.paused` | | 멈춘 채 저장했으면 새로고침 뒤에도 멈춤 |

- 진행 중 전투는 화면이 `FLOW.saveEvery`(2)초마다·다른 화면으로 갈 때 `saveBattle`로 저장 → 새로고침하면 그 지점부터 이어 감 (일반 판은 저장 전이면 같은 번호 판을 처음부터).
- 결과 반영(`applyBattle`)은 끝나는 순간 한 번, 바로 저장(`battling = false`) → 결과 직전·직후 새로고침해도 보상이 두 번 안 됨. 첫 성공 마석은 `cleared`로 한 번 더 막음.
- **버전을 안 올린 이유**: 칸이 늘기만 했고(빠지면 `fixFlow`가 채움) 옛 칸 뜻은 그대로. 다만 `flow` 칸이 없는 옛 v7 저장(주 단위 규칙으로 오른 단계)은 **의뢰 단계를 0으로, 진행 중 전투는 버림** (시험용 단순 처리, 회사 기록·현장 배치·마석은 그대로).

### 15-4. 화면 (임시, core-dev가 최소한으로)

- 현장 탭·회사의 가운데 [운영 ▶] = 전투 화면 = **현장 운영**: 들어오면 일반 판 바로 시작 (무리 등장·침입자 카드 창·위기 카드·결과표 없음), 끝나면 기록 줄 한 줄 + `FLOW.rest`초 뒤 다음 판 (`api.rerender`). 아래 막대 [배속] [건설] [보스 도전 n ▶] [⏸] [정비].
- 보스 판: 같은 화면, 가운데 = 일시정지. 끝나면 보스 결과 창: 분대마다 어디까지 갔나·함정 피해·퇴각 원인 + 실패 [배치 고치기](건설 모드, 창은 남음) [다시 도전] [일반 침입 재개] / 성공 [다음 보스 도전]·[홈에서 납품하기] [일반 침입 재개].
- 옛 현장 화면 = **정비**(시설 강화 창·출진·건설 + [운영 ▶]·[보스 도전]). 진행 띠·현장 위 줄 = "보스 검증 n/5 · 다음 보스". 일반 판 중엔 다른 탭으로 자유롭게(그 판은 멈춤), 보스 판 중에만 전투 화면에 묶임.
- UI 개편 때 다시 만들 것 (3탭·현장 4상태). 이 절의 함수는 그대로 쓰면 됨.

## 16. 마석 경제 (2026-10-29, 지시서 `refs/brief_ui_restructure_core.md`, 근거 `refs/debate_ds_restructure_2026-10-28.md` 최종 수렴 "경제" 줄)

흐름 시험(`FLOW.on`)의 마석 = **의뢰 시작 마석 + 단계 보스를 처음 이겼을 때 [의뢰인 보급 + 첫 성공 보상]**. 주마다 +30 무한 보급·다음 주 쉼은 없다. 새 저장 칸 없음(`flow.cleared`가 받은 단계를 기억). 숫자는 모두 **임시**(밸런스는 나중).

### 16-1. 규칙·숫자

| 것 | 어디 | 값 (q1) | 언제 |
| --- | --- | --- | --- |
| 시작 마석 | `QUESTS[].budget` | 50 (200에서 내림) | 의뢰 수락 때 |
| 의뢰인 보급 | `QUESTS[].stages[i].budget` | 10 · 10 · 10 · 10 · 0 | i+1단계 보스를 **처음** 이겼을 때 한 번 |
| 첫 성공 보상 | `FLOW.bossReward` | 10 (30에서 내림) | 같은 때 한 번 |
| 보스 힘 | `BOSSES.q1[].power` | 1 · 1.5 · 2 · 3 · 3 (1·1·1·1·1에서 올림, 구성·시드 그대로) | |
| 일반 판·실패·재도전 | | 마석 0 | |

- n단계 보스에 도전할 때 쓸 수 있는 마석 합: **50 · 70 · 90 · 110 · 130**.
- 한 번만: 보급과 보상은 `flow.cleared`에 단계 번호가 없을 때만 주고 바로 넣는다. 결과 반영(`applyBattle`)은 한 번이고 저장도 바로 하므로 새로고침·중간 저장 이어하기로 두 번 받지 않는다. `cleared`에 이미 있는 단계(깨진·옛 저장)는 단계만 오르고 마석은 0.
- 옛 주 단위 규칙(`FLOW.on = false`)에서는 `stages[i].budget`이 예전처럼 "그 단계를 채우면 추가 마석"으로 쓰인다(시작 마석 50도 같이 적용).

### 16-2. 화면이 읽을 값 (15절에 더한 것)

| 어디 | 값 |
| --- | --- |
| `bossInfo()` | `reward`(첫 성공 보상) · `supply`(그 단계 의뢰인 보급) · `gain`(이기면 받을 마석 = supply + reward, 이미 받은 단계면 0) |
| `applyBattle(res)` (보스 성공) | `budgetGain` = 보급 + 보상 (예전엔 보상만) · `boss.supply` · `boss.reward` (실패·받은 단계면 둘 다 0) |
| `questProgress()` | 그대로: `budget`(남은 마석) · `budgetStart`(시작) · `budgetAdded`(받은 보급 + 보상 합) · `weeklyBudget`(흐름 시험이면 0) |

### 16-3. 측정 요약 (자세한 표·방식은 `battle_data.js` BOSSES 주석 "2차")

| 측정 | 결과 |
| --- | --- |
| 문 그대로, 시설만 처음부터 최선 배치(언덕 오르기)로 막히는 최소 마석 | 1단계 20 · 2단계 40 · 3단계 60 · **4단계 150~160** · **5단계 260으로도 못 막음** |
| 그 단계 도전 때 마석 | 50 · 70 · 90 · **110** · **130** → 4·5단계는 문 없이 못 막음 |
| 사람 배치(보물방 앞 대기실 B7·C6·D7, 30) | 1단계 성공 (문 안 옮김). + 함정 4(70)면 2단계도 성공. 3단계부터 앞에 쌓기만 하면 실패 |
| 한 의뢰 통째로, 언덕 오르기 20시드 | **문 + 시설 19/20 납품** (1판은 5단계에서 마석 0으로 막힘) · 시설만 1/20 |

- **문이 필요한 단계 = 4·5단계.** 3단계는 시설을 잘 놓으면(미끼로 길 돌리기 등) 문 없이도 막힌다.
- **남은 문제(사용자 결정 필요):** 문을 2개쯤 옮겨 길을 길게 만들면 시설 없이도(마석 0) 4·5단계가 **시간 초과(60초)로** 막힌다(보스 힘과 상관없음). 문 퍼즐이 "길 늘리기"만으로 풀릴 수 있다 → 보스전 시간·문 통과 한도 규칙을 볼 때 같이 정할 것.
