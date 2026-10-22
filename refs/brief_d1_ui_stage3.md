# 지시서: D1 화면 3차 (층·출진·퇴각·위기 카드·데모 끝)

> 2026-10-23 총괄이 `frontend`에 준 지시서. 사용량 한도로 중간에 멈춤 → 작업분은 원격 브랜치 `wip/d1-ui-stage3`(커밋 09cdc68, 미검증). 이어서 할 때 이 지시서 + 그 브랜치를 준다.

## 상황
- 계약서 `prototype/d1_demo/API.md` 5~11절 "2차 추가"를 끝까지 읽을 것. 검사 `tools/test_d1_core.py`.
- 층 그리기: `ZONES.floorInfo(n)`, `floorMap(n)`, `stackMap()`(층을 쌓은 칸 배열, 전투 좌표와 같음), `goal()`, `isStairs()`. 2층 구역 id `2E·2L·2R·2H·2DL·2DR·2B`, 2층이 열리면 1층 B = 계단, 보물방 = 2B.
- 출진: `P.floorInfo(n)`·`floorsInfo()`, `floorPower(n)`, `sortieUnit(id, 층)`, `withdrawUnit(id)`, `setAutoDeploy(on)`, `isResting(id)`. 부대 보기에 `floor·resting·restWeek`. 층 한도 1층 3·2층 2, 친위대도 한 칸, 자동 편성 기본 켬.
- 전투: 퇴각 사건 `mretreat`, `crisis` 사건으로만 카드(전투당 최대 2장, `BSIM.crisisLeft(S)`), 결과 `monRetreat·monDown`, 보고 `casualties{down,retreated,died}·retreats·restMsgs·deaths`.
- 정산·데모 끝: `demoState()`, `leaveSettle()` → phase `'demoEnd'`. `deliver()`는 튜토리얼을 끄지 않음(2차 임시 코드 정리).
- 의뢰인 주간 지원금(전투마다 예산 +10, 사용자 확인 대기) → 결과표 한 줄. `?seed=` 주소 옵션 있음.

## 맡는 파일
`prototype/d1_demo/` 의 shell.js, build.js, battle.js, shell.css, stage.js, index.html, lines.js. 로직 파일은 고치지 않는다.

## 할 일
1. 현장 탭 지하 단면: 1층·2층(열림/🔒 3단계) 세로로 쌓기, 층마다 출진 칸(한도, 친위대 칸), 층 전투력, 쉬는 부대 💤. [출진] 입구 → 실제 출진 화면(층 고르기, sortie/withdraw, 자동 편성 토글, 이유 토스트).
2. 건설 화면: 층 전환, floorMap(n), 계단·보물방 표시, 잠긴 층 🔒. 대기실 배치는 출진으로 옮기고 시트엔 안내 + 바로가기. ⚔ 전투력은 층별 통과 비율.
3. 전투 화면: stackMap()으로 층 쌓아 그리기(분대가 판 밖으로 안 나가게), 퇴각 연출, crisis 카드만(남은 수 표시), 진행도 카드 제거. 결과표: 퇴각·쓰러짐·사망 구분, 쉬는 부대, 주간 지원금.
4. 정산·데모 끝: demoEnd면 "데모는 여기까지"(다음 현장 예고 + 🔒 2층 + [처음부터]). 두 번째 현장 첫 전투 결과표에 "데모 끝까지 왔어요" 한 줄 + 계속 진행 가능.
5. 튜토리얼 임시 코드를 정식 API로, lines.js 대사 새 흐름에 맞게(임시 문구).

## 확인
- 헤드리스 Chrome(CDP), `?seed=` 고정: 새 게임 → 건설 → 출진 → 전투(위기 카드·퇴각) → 5단계 → 납품 → 2층 의뢰 → 첫 전투(🔒 2층) → 3단계 → 2층 열림 → 2층 건설·출진 → 2층 포함 전투. 첫 의뢰 주 수 기록, 콘솔 오류 0, 390px 넘침 0.
- `py tools/check_all.py` 종료 코드 0. 파일 이름으로 add, 커밋.
