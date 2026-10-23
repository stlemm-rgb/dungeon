# D1 데모 핵심 로직 API (1차 + 2차, 2026-10-23)

화면 파일(shell.js·build.js·battle.js·stage.js)이 부르는 공개 함수 목록. 값은 **이 함수들로만** 바꾼다 (RUN을 화면에서 직접 고치지 않는다).
숫자·글 표는 `battle_data.js`의 `DEMO` 아래(의뢰·납품 기준·부족·회사 레벨·고정 구역·끈 기능). 검사는 `tools/test_d1_core.py`.

- 저장: 키 `dunguen_d1_run`, 형식 **v6**. 버전이 다르면 새 게임(변환 없음). C1 키(`dunguen_c1_run`)는 건드리지 않는다.
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
`tutorial()` · `tutorialSeen(id)` · `skipTutorial()`(안내만 끔) · `tutorialPath()`(튜토리얼 중 첫 현장의 길) · `save()` · `load()` · `reset()` · `setClock(fn)`

### 데모에서 꺼진 것 (부르면 늘 거절·0, 지급 없음)
`watchAd()` · `gachaInfo()`(`{ off:true, left:0 }`) · `gachaPull()` · `chores()`(`off:true`, 진행 안 오름) · `claimChore()` · `choresClaimable()`(0) · `idleInfo()`(`off:true`) · `claimIdle()` · `WORKSHOPS`(ready false) · `workshopInfo()` · `upgradeWorkshop()`. 끄는 표 = `BATTLE_DATA.DEMO_OFF`, `PROGRESS.OFF`.

## 3. ZONES·BSIM 바뀐 점

- `ZONES.summary(zones, units, unitById?)`: value에 몬스터가 **안 들어감**. `fixed` 수 추가.
- `ZONES.facFor(z)`: 데모 시설만 (방 = 빈 구역·함정 복도·몬스터 대기실·미끼, 입구 = 분기, 야외 = 숲).
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
| 판 3종 무작위·입구 방향(대기·굽은길)·덫 숲 | 없음 (fork3 한 판, 입구 분기 고정) |
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
출진한 부대는 그 층 대기실들에 나눠 선다(침입자가 많이 오는 대기실부터, 덜 찬 곳으로). **기본 자동 편성**(`site.auto`, 처음 켬): 빈 칸이 생기면(대기실 짓기·조달·쉼 해제) 쉬지 않는 부대를 전투력 큰 순으로 채움(부대 먼저, 친위대는 남는 칸). 출진을 손으로 바꾸면 꺼짐.

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
| `WEEKLY_BUDGET` | 10 | 의뢰인 마석 보급 (막힘 방지) |
| `CARD_RULE` | `maxPerBattle 2 · crisisProgress 85 · massSquads 3 · kinds` | 카드 위기 |
| `TRIBES[].grow` | hp·atk 0.5 (← 0.2) | 레벨 성장 |
| `EXP` | deploy 8 · fight 8 (← 4·12) | 출진·참여 경험치 |
| q1 `stages` | 가치 30/55/80/105/130 · 전투력 50/75/100/130/160 | 첫 의뢰 3주 안팎 |
| q2 `stages` | 3단계 `budget:150` · 4단계 가치 190·전투력 200·2층 50 · 5단계 230·250·2층 90 | |
