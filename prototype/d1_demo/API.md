# D1 데모 핵심 로직 API (1차, 2026-10-23)

화면 파일(shell.js·build.js·battle.js·stage.js)이 부르는 공개 함수 목록. 값은 **이 함수들로만** 바꾼다 (RUN을 화면에서 직접 고치지 않는다).
숫자·글 표는 `battle_data.js`의 `DEMO` 아래(의뢰·납품 기준·부족·회사 레벨·고정 구역·끈 기능). 검사는 `tools/test_d1_core.py`.

- 저장: 키 `dunguen_d1_run`, 형식 **v6**. 버전이 다르면 새 게임(변환 없음). C1 키(`dunguen_c1_run`)는 건드리지 않는다.
- 공통 돌려주는 값: 바꾸는 함수는 `{ ok, msg }` (+ `stages`: 이번에 새로 오른 납품 기준 단계 번호 목록, 토스트용).

## 1. RUN 모양 요약 (`PROGRESS.RUN`, 읽기만)

| 칸 | 뜻 |
| --- | --- |
| `v` `seed` `week` | 저장 형식 6 · 게임 무작위 씨앗 · 지금 주 |
| `gold` | **회사 금** (영구. 전투 수입·납품 보수가 여기로. 데모에서는 쓰는 곳 없음) |
| `gems` | 보석 (부족 보석 강화) |
| `company` `{ lv, exp }` | **회사 레벨** (전투 +1 · 납품 기준 단계 +1 · 납품 보수 `reward.companyExp`) |
| `phase` | `choose` 의뢰 고르기 · `play` 진행 중 · `settle` 납품 직후 정산 |
| `quest` | 진행 중 의뢰 `{ id, key, name, client, attr, floors, budget, reward{gold,gems,companyExp}, board, fixed, stages[5]{value,power,floor2?,opens?}, stage, stageWeeks, startWeek, tutorial }` |
| `offers` | 후보 의뢰 목록 (위와 같은 모양) |
| `report` | settle 때 납품 보고 (deliver 돌려주는 값) |
| `site` | 지금 현장 `{ board, zones, fixed, units, squads, nextSquadNo, budget, budgetStart, spent, builds, value, power, floorsOpen }` |
| `site.budget` | **의뢰 예산** 남은 것 (건설·부대 조달 전용) |
| `site.fixed` | 고정 구역 `{ 구역 id: 'frozen_dock' }` (zones에는 `'fz_frozen_dock'` 시설로 들어 있음) |
| `site.units` | 대기실 출진 `{ 구역 id: [부대·친위대 id] }` (칸당 1자리) |
| `site.squads` | 현장 부대 `[{ id:'s1', tribe:'stone'|'ember', count, lv, exp, free }]` (납품 때 의뢰인에게 인계) |
| `guards` | 친위대 `[{ id:'g1', tribe, name, intro, lv, exp, from }]` (이름 있는 개체, 다음 현장 동행, 최대 2) |
| `tribes` | 부족 보석 강화 단계 `{ stone: 1 }` |
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

### 현장: 가치·전투력·예산·건설
| 함수 | 돌려주는 값 | 언제 |
| --- | --- | --- |
| `siteSummary()` | `{ value, trap, den, lure, fixed, monsters, power, budget }` (value = 시설 점수만) | 요약 줄 |
| `siteValue()` / `sitePower()` | 던전 가치 / 던전 전투력(B안, 친위대 제외) | |
| `powerInfo()` | `{ total, parts:[{ z, kind:'trap'|'den', score, w, power }] }` 구역별 전투력 조각 (w = 통과 비율) | 전투력 자세히 |
| `powerOf(zones, units)` | 아무 배치의 전투력 (미리보기) | |
| `budgetLeft()` | 남은 의뢰 예산 | |
| `previewBuild(z, k)` | `{ ok, why, cost, baseCost, discount, counts, budgetAfter, valueNow, valueAfter, powerNow, powerAfter, back, zones, units, from, fixed? }` | 건설 시트 |
| `buildZone(z, k)` | `{ ok, msg, stages }` 예산에서 차감 (회사 금 안 씀, 모자라면 거절) | 짓기 |
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
| `procureInfo(tribe)` / `procureSquad(tribe)` | 새 부대 조달 (의뢰 예산). info `{ tribe, name, count, cap, lv, cost, canAfford, why }` | |
| `refillInfo(id)` / `refillSquad(id)` | 1명 보충 (의뢰 예산, 정원까지) | |
| `placeUnit(z, id)` / `removeUnit(z, index)` | 대기실 출진·빼기 (공짜) | (층별 출진은 2차) |
| `tribeInfo(tribe)` / `upgradeTribe(tribe)` | 부족 보석 강화 (데모 1회). info `{ id, name, lv, max, contracted, effect, next, cost{gems}|null, canAfford, why }` | 군단 |
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
| `startBattle()` | `{ ok, plan, msgs }` — **언제든 가능** (건설 0·예산 0이어도) | 다음 주 |
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
| `grantLeft()` · `SITE_GRANT` (첫 건설 공사비) | `budgetLeft()` (의뢰 예산) |
| `placeMonster(z, id)` · `removeMonster(z, i)` | `placeUnit` · `removeUnit` |
| `idleMonsters()` | `idleUnits()` |
| `recruitInfo(name)` · `recruit(name)` (회사 금 모집) | `procureInfo/procureSquad(tribe)` · `refillInfo/refillSquad(id)` (의뢰 예산) |
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
