# 기획 문서끼리 다른 말

> Codex 하청 결과 (2026-10-23, 읽기 전용, 총괄 검수). 바뀜 표시·용어 통일은 10번 하청(문서 정리)에서 반영 예정. 빈칸 일부는 GAME_PLAN 2026-10-23 절에서 결정됨.

최신 기준은 **GAME_STRUCTURE.md(2026-10-22)**로 잡았습니다. 파일 수정·커밋은 하지 않았습니다. 아이디어 창고의 제안은 확정 규칙과 충돌하는 경우에도 **‘미채택 표시 필요’**로 구분했습니다.

**표 1. 바뀐 결정 표시 필요**

| # | 파일:줄 | 옛 내용 | 새 내용(근거 파일:줄) | 제안 |
|---|---|---|---|---|
| 1 | [GAME_RULES:1](C:/Project/dungeon/docs/GAME_RULES.md:1), [GAME_RULES:3](C:/Project/dungeon/docs/GAME_RULES.md:3) | ‘본 게임 기준’, React 구현의 기준 문서라고 안내 | C1 규칙이며 데모 구현 때 갱신 필요([HANDOFF:65](C:/Project/dungeon/HANDOFF.md:65)) | 맨 위에 **‘C1 당시 규칙. 최신 확정본은 GAME_STRUCTURE’** 표시 |
| 2 | [GAME_PLAN:116](C:/Project/dungeon/docs/GAME_PLAN.md:116), [GAME_PLAN:119](C:/Project/dungeon/docs/GAME_PLAN.md:119) | 홈·던전·다음 주·부대·상점. 다음 주는 중앙 탭 | 회사·군단·현장·마계·내 집. 다음 주는 현장 위쪽([GAME_STRUCTURE:10](C:/Project/dungeon/docs/GAME_STRUCTURE.md:10), [14](C:/Project/dungeon/docs/GAME_STRUCTURE.md:14)) | 이 절 전체에 ‘10-22 변경’ 표시 |
| 3 | [GAME_PLAN:109](C:/Project/dungeon/docs/GAME_PLAN.md:109) | 의뢰 진행도를 홈의 퀘스트 버튼·팝업으로 확인 | 현장에 의뢰 진행표 고정([GAME_STRUCTURE:10](C:/Project/dungeon/docs/GAME_STRUCTURE.md:10)) | 의뢰 진행 UI가 바뀌었다고 표시 |
| 4 | [GAME_PLAN:96](C:/Project/dungeon/docs/GAME_PLAN.md:96), [176](C:/Project/dungeon/docs/GAME_PLAN.md:176), [GAME_RULES:23](C:/Project/dungeon/docs/GAME_RULES.md:23) | 건설에 금 사용. 새 부지에 첫 건설 공사비 지급 | 건설·부대 조달은 의뢰 예산, 회사 금은 영구 성장([GAME_STRUCTURE:57](C:/Project/dungeon/docs/GAME_STRUCTURE.md:57), [GAME_PLAN:274](C:/Project/dungeon/docs/GAME_PLAN.md:274)) | ‘플레이어 금 건설·첫 공사비는 대체됨’ 표시. 첫 건설 강제 규칙도 함께 정리 |
| 5 | [GAME_RULES:24](C:/Project/dungeon/docs/GAME_RULES.md:24), [25](C:/Project/dungeon/docs/GAME_RULES.md:25) | 대기실에 몬스터를 넣고 빼며, 시설 변경 시 대기로 복귀 | 대기실별 배치 대신 층별 출진([GAME_STRUCTURE:59](C:/Project/dungeon/docs/GAME_STRUCTURE.md:59)) | 대기실 배치 규칙은 C1 전용이라고 표시 |
| 6 | [GAME_RULES:18](C:/Project/dungeon/docs/GAME_RULES.md:18) | 대기실에 들어간 몬스터만 경험치. 없으면 부대 전체 | 출진·참여 단위 경험치, 전투 뒤 책·교본으로 선택 성장([GAME_STRUCTURE:60](C:/Project/dungeon/docs/GAME_STRUCTURE.md:60), [61](C:/Project/dungeon/docs/GAME_STRUCTURE.md:61)) | 기존 경험치 대상 규칙에 변경 표시 |
| 7 | [GAME_RULES:28](C:/Project/dungeon/docs/GAME_RULES.md:28) | 일반 의뢰 목표 2개, 메인 3개 | 주목표 1개 + 부목표 최대 1개([GAME_STRUCTURE:62](C:/Project/dungeon/docs/GAME_STRUCTURE.md:62)) | 메인 의뢰 3개 규칙이 폐기됐다고 표시 |
| 8 | [GAME_PLAN:129](C:/Project/dungeon/docs/GAME_PLAN.md:129), [178](C:/Project/dungeon/docs/GAME_PLAN.md:178) | 납품 버튼 없이 자동 납품. 정산·새 의뢰를 한 화면에서 | 목표 달성 뒤 고정 진행표에서 납품, 속성별 완공 화면 제공([GAME_STRUCTURE:10](C:/Project/dungeon/docs/GAME_STRUCTURE.md:10), [15](C:/Project/dungeon/docs/GAME_STRUCTURE.md:15)) | 자동 납품과 화면 합치기를 옛 방식으로 표시 |
| 9 | [GAME_PLAN:251](C:/Project/dungeon/docs/GAME_PLAN.md:251), [347](C:/Project/dungeon/docs/GAME_PLAN.md:347) | 건설 요구 6종을 가볍게 유지하는 후보, 설계도 저장 제안 | 둘 다 폐기하고 의뢰별 고정 구역으로 대체([GAME_PLAN:260](C:/Project/dungeon/docs/GAME_PLAN.md:260)) | 해당 후보 옆에 ‘폐기·고정 구역으로 대체’ 표시 |
| 10 | [GAME_PLAN:252](C:/Project/dungeon/docs/GAME_PLAN.md:252) | 부지 판 3종을 유지하는 후보 | 세로 지하 층, 판 3종은 층 안 구역 배치 몇 가지로 변경([GAME_STRUCTURE:66](C:/Project/dungeon/docs/GAME_STRUCTURE.md:66)) | 독립된 판 3종을 유지하는 것으로 읽히지 않게 표시 |
| 11 | [GAME_PLAN:353](C:/Project/dungeon/docs/GAME_PLAN.md:353) | 최소 구현에서 카드·여러 층을 제외 | 첫 데모에 카드 6~8장과 작은 2층 포함([GAME_STRUCTURE:29](C:/Project/dungeon/docs/GAME_STRUCTURE.md:29), [31](C:/Project/dungeon/docs/GAME_STRUCTURE.md:31)) | 최소 범위 표 전체에 ‘이전 계획’ 표시 |
| 12 | [GAME_RULES:20](C:/Project/dungeon/docs/GAME_RULES.md:20), [GAME_PLAN:230](C:/Project/dungeon/docs/GAME_PLAN.md:230) | 방치 보상 상한 8시간 | 출시 범위는 12시간([GAME_STRUCTURE:39](C:/Project/dungeon/docs/GAME_STRUCTURE.md:39)) | 8시간은 옛 임시값이라고 표시 |
| 13 | [GAME_RULES:35](C:/Project/dungeon/docs/GAME_RULES.md:35), [GAME_PLAN:254](C:/Project/dungeon/docs/GAME_PLAN.md:254) | 자동 대응 기본값 재검토 중 | 자동 전술 기본 켬, 카드 자동 넘기기는 별도·기본 꺼짐([GAME_STRUCTURE:68](C:/Project/dungeon/docs/GAME_STRUCTURE.md:68)) | 재검토가 끝났다고 표시하고 두 자동 기능 구분 |
| 14 | [CONTENT_IDEAS:44](C:/Project/dungeon/docs/CONTENT_IDEAS.md:44) | 새 부족을 친위대 레벨에 맞추는 레벨 공유 | 레벨 공유 없음. 회사 레벨에 따른 시작 레벨 적용([GAME_STRUCTURE:64](C:/Project/dungeon/docs/GAME_STRUCTURE.md:64)) | ‘미채택’ 표시 |
| 15 | [CONTENT_IDEAS:101](C:/Project/dungeon/docs/CONTENT_IDEAS.md:101), [105](C:/Project/dungeon/docs/CONTENT_IDEAS.md:105), [111](C:/Project/dungeon/docs/CONTENT_IDEAS.md:111) | 주 시작 운명 카드 선택, 서두르기 기능 | 운명 카드 없음·주 종류 자동, 건설 즉시라 서두르기 없음([GAME_STRUCTURE:67](C:/Project/dungeon/docs/GAME_STRUCTURE.md:67), [70](C:/Project/dungeon/docs/GAME_STRUCTURE.md:70)) | 각각 ‘미채택’ 표시 |

**표 2. 모순**

아래는 모두 10월 22일 문서 안에서, 또는 같은 날짜의 결정 사이에서 발견됩니다.

| # | 위치 A | 위치 B | 무엇이 다른가 |
|---|---|---|---|
| 1 | [GAME_STRUCTURE:10](C:/Project/dungeon/docs/GAME_STRUCTURE.md:10)·[11](C:/Project/dungeon/docs/GAME_STRUCTURE.md:11), [GAME_PLAN:264](C:/Project/dungeon/docs/GAME_PLAN.md:264) | [GAME_STRUCTURE:14](C:/Project/dungeon/docs/GAME_STRUCTURE.md:14) | 표 번호·요약은 **회사→현장→군단**, 명시된 사용자 순서는 **회사→군단→현장**. 표의 ②·③과 요약 순서를 맞춰야 함 |
| 2 | [GAME_PLAN:275](C:/Project/dungeon/docs/GAME_PLAN.md:275) | [GAME_STRUCTURE:60](C:/Project/dungeon/docs/GAME_STRUCTURE.md:60) | 앞은 ‘친위대를 배치하면 부대 레벨이 오르지 않는다’. 최신 규칙은 **함께 출진·참여한 부대는 성장하되, 친위대가 출진 칸을 차지**하는 구조. ‘친위대만 출진하면’으로 좁혀야 맞음 |

**표 3. 용어 통일**

서로 다른 개념은 한 이름으로 합치지 않고 구분하는 것을 추천합니다.

| 개념 | 지금 쓰이는 이름들 | 추천 이름 |
|---|---|---|
| 주요 거점 화면 | 홈·회사 ([PLAN:116](C:/Project/dungeon/docs/GAME_PLAN.md:116), [STRUCTURE:9](C:/Project/dungeon/docs/GAME_STRUCTURE.md:9)) | 탭 이름은 **회사**. 옛 홈 중 건설·출진 기능은 **현장**으로 구분 |
| 전투 인력 | 군단·부족·부대·몬스터 ([STRUCTURE:11](C:/Project/dungeon/docs/GAME_STRUCTURE.md:11), [58](C:/Project/dungeon/docs/GAME_STRUCTURE.md:58)) | 전체 조직·탭은 **군단**, 종족별 영구 성장은 **부족**, 현장에 조달한 전투 단위는 **부대** |
| 공사 대상·장소 | 던전·현장·부지·판 ([HANDOFF:73](C:/Project/dungeon/HANDOFF.md:73), [STRUCTURE:66](C:/Project/dungeon/docs/GAME_STRUCTURE.md:66)) | 작업 화면은 **현장**, 납품 작품은 **던전**, 새 땅은 **부지**, 화면 구조는 **층·구역** |
| 돈 | 금·플레이어 금·회사 금·공사비·의뢰 예산 ([PLAN:176](C:/Project/dungeon/docs/GAME_PLAN.md:176), [274](C:/Project/dungeon/docs/GAME_PLAN.md:274)) | 영구 재화는 **회사 금**, 현장 전용 자금은 **의뢰 예산**. ‘금’만 쓰지 않기 |
| 대표 성장 수치 | 명성·회사 등급·회사 레벨 ([PLAN:202](C:/Project/dungeon/docs/GAME_PLAN.md:202), [CONTENT:126](C:/Project/dungeon/docs/CONTENT_IDEAS.md:126), [STRUCTURE:69](C:/Project/dungeon/docs/GAME_STRUCTURE.md:69)) | 대표 수치는 **회사 레벨**. 별도 평판·명성을 유지한다면 역할을 따로 정의 |
| 시간 단위 | 턴·하루·주·다음 ([PLAN:17](C:/Project/dungeon/docs/GAME_PLAN.md:17), [312](C:/Project/dungeon/docs/GAME_PLAN.md:312), [STRUCTURE:10](C:/Project/dungeon/docs/GAME_STRUCTURE.md:10)) | 진행 단위는 **주**, 버튼은 **다음 주** |
| 몬스터 시설 | 대기실·몬스터 대기실·몬스터 숙소 ([PLAN:244](C:/Project/dungeon/docs/GAME_PLAN.md:244)) | 전투 시설은 **몬스터 대기실**, 생활 시설은 **몬스터 숙소** |
| 납품 때 이동 | 현장 부대 인계·친위대 인계 ([STRUCTURE:30](C:/Project/dungeon/docs/GAME_STRUCTURE.md:30), [58](C:/Project/dungeon/docs/GAME_STRUCTURE.md:58)) | 현장 부대는 **의뢰인에게 인계**, 친위대는 **다음 현장 동행**으로 방향까지 쓰기 |

**표 4. 데모 전에 정해야 할 빈칸**

최종 밸런스 수치가 아니라, 데모가 어떻게 작동할지 정하는 빈칸입니다.

| # | 빈칸 | 왜 필요한가 |
|---|---|---|
| 1 | **첫 의뢰와 짧은 두 번째 의뢰의 실제 목표·보상**. 범위만 있음([STRUCTURE:31](C:/Project/dungeon/docs/GAME_STRUCTURE.md:31), [62](C:/Project/dungeon/docs/GAME_STRUCTURE.md:62)) | 첫 납품 조건과 두 번째 현장 진입을 구현해야 함 |
| 2 | **시설 3종·부족 2종·고정 구역 1개의 이름과 효과**([STRUCTURE:31](C:/Project/dungeon/docs/GAME_STRUCTURE.md:31)) | 개수는 확정됐지만 실제 데모 콘텐츠 목록이 없음 |
| 3 | **카드 6~8장의 내용과 최종 등장·정지 방식**([STRUCTURE:31](C:/Project/dungeon/docs/GAME_STRUCTURE.md:31), [HANDOFF:14](C:/Project/dungeon/HANDOFF.md:14)) | 카드·관전 시험이 아직 승인·선택 전이므로 확정 규칙처럼 구현하면 안 됨 |
| 4 | **전투 수입이 회사 금과 의뢰 예산 중 어디로 들어가는지**, 예산 추가 공급 방식([STRUCTURE:57](C:/Project/dungeon/docs/GAME_STRUCTURE.md:57), [RULES:17](C:/Project/dungeon/docs/GAME_RULES.md:17)) | 지출 구분만 확정돼 있어 현장 자금 흐름을 완성할 수 없음 |
| 5 | **참여 경험치와 책·교본의 관계**, 책과 교본이 같은 자원인지 별개인지([STRUCTURE:60](C:/Project/dungeon/docs/GAME_STRUCTURE.md:60), [61](C:/Project/dungeon/docs/GAME_STRUCTURE.md:61)) | 자동 성장과 선택 레벨업을 어떻게 함께 적용할지 필요 |
| 6 | **작은 2층이 열리는 구체 조건**([STRUCTURE:29](C:/Project/dungeon/docs/GAME_STRUCTURE.md:29), [48](C:/Project/dungeon/docs/GAME_STRUCTURE.md:48)) | ‘4~7분·첫 의뢰 끝 무렵’은 목표 시간이며 게임이 검사할 조건은 아님 |
| 7 | **회사 레벨을 올리는 방법과 첫 납품의 상승 처리**([STRUCTURE:30](C:/Project/dungeon/docs/GAME_STRUCTURE.md:30), [69](C:/Project/dungeon/docs/GAME_STRUCTURE.md:69)) | 대표 성장 수치를 첫 납품에서 실제로 보여 줘야 함 |
| 8 | **작품집 효과 1개의 실제 내용**([STRUCTURE:31](C:/Project/dungeon/docs/GAME_STRUCTURE.md:31), [71](C:/Project/dungeon/docs/GAME_STRUCTURE.md:71)) | 다음 현장에서 남은 효과를 강조하려면 적용할 효과가 정해져야 함 |
| 9 | **데모에 사용할 던전 속성과 완공 그림 범위**([PLAN:177](C:/Project/dungeon/docs/GAME_PLAN.md:177), [STRUCTURE:15](C:/Project/dungeon/docs/GAME_STRUCTURE.md:15)) | 옛 첫 버전은 피해 종류 1개만 적용하지만 최신 완공 화면은 얼음·불 같은 환경 속성까지 예시로 사용함 |

1인 개발 기준으로는 **첫 의뢰·보상·작품집 효과를 한 묶음으로 먼저 확정**하는 것을 추천합니다. 이 묶음이 정해져야 첫 납품과 다음 현장의 성장 체감을 끝까지 검증할 수 있습니다.