# Codex 진단: 프로젝트 구조 (gpt-6-astra medium, 2026-10-24, 읽기 전용)

**현재 데모와 검사 체계가 어긋나 있습니다.** D1 핵심 로직 검사는 있지만, 화면·대사·자동 진행 검사는 대부분 옛 게임을 봅니다. `git grep`과 코드 읽기로 진단했으며 **파일 수정·검사 실행은 하지 않았습니다.**

**① prototype·루트 코드**

| 대상 | 지금 상태 | 근거(파일:줄) | 추천(남김·보관 폴더로·지움·고침) |
|---|---|---|---|
| `prototype/d1_demo/` | 현재 데모. 자체 코드 사용, 공통 모션만 외부 의존 | `prototype/d1_demo/index.html:16` | 남김 |
| `prototype/door_lab/` | 현재 실험. 3×4·5×7 지원, 자체 코드 사용 | `prototype/door_lab/index.html:8`, `:19` | 남김 |
| `a_grid/`, `b_room/` | 옛 비교 시안. 목록·서로 간 링크가 남음 | `prototype/index.html:26`, `prototype/a_grid/index.html:41`, `prototype/b_room/index.html:32` | 보관 폴더로 |
| `a2_grid/`, `a3_grid/`, `a4_cave/` | 옛 조작 실험. 목록에 연결됨 | `prototype/index.html:23`, `:24`, `:25` | 보관 폴더로 |
| `a5_zones/`, `a6_nest/`, `a7_nest16/` | 옛 구역 실험. 기획 이력·목록에서 참조. C1의 A7 언급은 복사 출처 | `docs/GAME_PLAN.md:342`, `prototype/index.html:20`, `prototype/c1_shell/zones.js:1` | 보관 폴더로 |
| `c1_shell/` | 이전 시안이지만 전용 로직·대사 검사가 계속 읽음 | `prototype/index.html:18`, `tools/test_c1_core.py:735`, `tools/test_lines.py:118` | 검사 분리 후 보관 폴더로 |
| `common/` | `motion.js`는 D1 사용. `proto.css`는 시안 목록·옛 시안, `rules.js`·`ui.js`는 옛 시안용 | `prototype/d1_demo/index.html:16`, `prototype/index.html:7`, `prototype/a_grid/index.html:19` | 모션 남김, 나머지는 사용처와 함께 보관 |
| `prototype/index.html` | 현재·옛 시안이 섞인 입구. 실험 설명은 아직 3×4만 | `prototype/index.html:16`, `:17`, `:18` | 고침 |
| 루트 `js/`, `data/` | D1의 실행 의존성 아님. 옛 루트 게임·검사 실행기가 사용 | `index.html:15`, `tools/harness.html:22` | 검사 분리 후 보관 폴더로 |
| 루트 `css/`, `index.html` | 옛 게임 화면. 실행 안내·화면 검사에서는 여전히 현역 | `index.html:8`, `RUNBOOK.md:38`, `tools/shots.py:130` | 옛 화면 보관, 진입점 고침 |

**② tools 검사**

| 대상 | 지금 상태 | 근거(파일:줄) | 추천(남김·보관 폴더로·지움·고침) |
|---|---|---|---|
| `check_all.py` | 11단계 혼합 실행. door_lab 자체 검사는 빠짐 | `tools/check_all.py:13` | 고침: 현재용·옛것용 분리 |
| `test_d1_core.py` | **D1** 문·탐험·전투·경제·납품·층·저장 검사. 화면은 검사 안 함 | `tools/test_d1_core.py:1`, `:10` | 남김 |
| `test_oldsaves.py` | **루트+D1**. 루트 저장 왕복·보완, D1 v6→v7 이관 검사 | `tools/test_oldsaves.py:41`, `:98`, `:133` | 고침: 대상 분리 |
| `test_c1_core.py` | **C1만** 납품·건설·전투·성장·저장 등 검사 | `tools/test_c1_core.py:735` | 보관 폴더로 |
| `test_lines.py` | **C1만** 대사 문법·단계 ID·빈 대사·홈 인물 이름 검사. D1 대사 누락 | `tools/test_lines.py:17`, `:53`, `:118` | 고침: D1 대상으로 |
| `shots.py` | **루트만** 390/1280 화면, 확인창·저장 불가 상태 등 4장 비교·가로 넘침 검사 | `tools/shots.py:26`, `:130`, `:137` | 고침: D1 화면 기준 추가 |
| `golden.py` | **루트만** 시드 3개×200턴 결과·중간 저장 복원 일치 검사 | `tools/golden.py:14`, `:36`, `:42`; `tools/harness.html:22` | 옛 기준 보관, D1 검사 추가 |
| `autoplay.py` | **루트만** 기본 1,000턴, 100턴마다 저장 왕복·오류·시간·크기 측정 | `tools/autoplay.py:20`, `tools/harness.js:175` | 고침: D1 진행 측정 추가 |
| `test_flow.py` | **루트만** 다음 턴 3회→저장→새로고침→새 게임 확인·취소 | `tools/test_flow.py:13`, `tools/harness.js:271`, `:302` | 고침: D1 한 바퀴 검사 |
| `test_names.py`, `name_rules.json` | 루트 코드·검사 JS 이름 충돌·접두사·로딩 누락 검사. prototype 제외 | `tools/test_names.py:23`, `:56`; `tools/tool_common.py:237` | 고침: 적용 범위 명시 |
| `test_rules.py` | 루트 상태 변경·난수·금지 함수·CSS 색·모듈 규칙 검사. D1 제외 | `tools/test_rules.py:41`, `:67`, `:84` | 고침: D1 규칙 별도 정의 |
| `filemap.py` | 루트 코드·tools만 지도 생성. prototype 누락, 실행하면 파일을 씀 | `tools/filemap.py:13`, `:81` | 고침: 현재 폴더 포함 |
| `harness.html/js`, `tool_common.py` | 옛 루트 검사 실행기와 공용 브라우저 도우미 | `tools/harness.html:22`, `tools/tool_common.py:89` | 공용 기능 남김, 옛 실행기 분리 |
| `door_lab/selftest.js` *(tools 밖)* | 실험 로직 직접 검사. 전체 검사와 별도 실행 | `prototype/door_lab/selftest.js:3`, `tools/check_all.py:13` | 남김·전체 검사에 연결 |

**③ refs — README 제외 48개 중 33개 등재, 15개 누락**

| 대상 | 지금 상태 | 근거(파일:줄) | 추천(남김·보관 폴더로·지움·고침) |
|---|---|---|---|
| 지시서 10개: `brief_*` 9개 + `debate_prompt_template` | README에는 stage3·토론 틀만 있음. 나머지 지시서 8개 누락 | `refs/README.md:8`, `:34`; `refs/brief_d1_doors_core.md:1`, `refs/brief_lines_home.md:1` | 고침: 전체 등재·완료 여부 표시 |
| 토론 4개: `debate_*`에서 template 제외 | doors 토론만 누락 | `refs/README.md:29`, `:35`; `refs/debate_doors_2026-10-23.md:1` | 남김·목록 고침 |
| Codex 의견 5개: `codex_*` | demo_scope만 ‘검수 기록’으로 등재. 나머지 4개 누락 | `refs/README.md:10`; `refs/codex_build_mode_2026-10-23.md:1`, `refs/codex_d1doors_opinion_2026-10-24.md:1` | 남김·분류 고침 |
| 참고 게임 14개: `ref_*` 중 UI 제외 | 모두 등재. Keeper의 ‘반면교사’는 참고 게임의 하위 분류로 적절 | `refs/README.md:19`, `:28`, `:30` | 남김 |
| UI 참고 1개: `ref_ui_layout_*` | 게임 조사와 다른 화면 참고 자료. 목록 누락 | `refs/ref_ui_layout_2026-10-23.md:1` | 남김·별도 분류 |
| 초안 7개: `draft_*` | 모두 등재. 결정 전 후보라는 성격도 일치 | `refs/README.md:9`, `:13`; `refs/draft_battle_data_2026-10-23.md:3` | 남김 |
| 리뷰 6개: `review_*` 5개 + `playtest_A4_1` | 모두 등재. A4 시험은 이미 과거 자료라고 명시 | `refs/README.md:11`, `:37`, `:40` | 남김: 과거 기록 표시 유지 |
| `cdp_helper.js` | 문서가 아니라 실제 화면 점검 도구. 목록 누락 | `refs/cdp_helper.js:1`, `HANDOFF.md:77` | 고침: tools로 옮기고 참조 수정 |

**④ 문서**

| 대상 | 지금 상태 | 근거(파일:줄) | 추천(남김·보관 폴더로·지움·고침) |
|---|---|---|---|
| `AGENTS.md`, `CLAUDE.md` | 공통 규칙·Claude 전용 역할로 분리됨 | `AGENTS.md:4`, `CLAUDE.md:1` | 남김 |
| `HANDOFF.md` | 5×7·D1 이식을 다음 일, 저장을 v6으로 안내. 실제는 5×7·v7 구현 | `HANDOFF.md:10`, `:48`; `prototype/door_lab/index.html:19`, `prototype/d1_demo/progress.js:36` | 고침: 최우선 |
| `RUNBOOK.md`, `docs/CODE_RULES.md` | 루트 실행·8검사·Node 불필요/금지 안내가 현재 검사와 충돌 | `RUNBOOK.md:14`, `:15`, `:38`; `docs/CODE_RULES.md:13`; `tools/test_d1_core.py:11` | 고침 |
| `FILEMAP.md` | 현재 핵심인 prototype 지도 누락 | `tools/filemap.py:13` | 고침: 생성기부터 |
| `PROGRESS.md`, `GAME_PLAN.md` | 작업 이력·결정 이력으로 역할 구분 가능. PLAN은 현재 규칙까지 섞여 탐색 어려움 | `PROGRESS.md:3`, `refs/brief_docs_terms.md:5`, `docs/GAME_PLAN.md:316` | 남김·PLAN의 이력 성격 명시 |
| `GAME_STRUCTURE.md`, `GAME_RULES.md` | STRUCTURE는 장기 구조·데모 범위 혼재. RULES는 명시적으로 C1용 | `docs/GAME_STRUCTURE.md:30`, `docs/GAME_RULES.md:3`; `tools/test_d1_core.py:410` | STRUCTURE 고침, RULES 보관 폴더로 |
| `DESIGN_DOORS.md`, `DESIGN_D1_DOORS.md` | 초기안·확정안·이식 계획 중첩. 앞부분의 최단 방향 이동·미구현 설명이 낡음 | `docs/DESIGN_DOORS.md:6`, `:90`; `docs/DESIGN_D1_DOORS.md:4`, `:238` | 고침: 현재 규칙과 설계 이력 분리 |
| `prototype/d1_demo/API.md` | 현재 구현 계약서. v7 선언과 아래 v6 표가 공존 | `prototype/d1_demo/API.md:6`, `:14` | 남김·낡은 표 고침 |
| `CONTENT_IDEAS.md`, `새_게임_청사진.md` | 각각 미래 콘텐츠 창고·개발 원칙. 현재 명세와 역할 다름 | `docs/CONTENT_IDEAS.md:3`, `새_게임_청사진.md:7` | 남김 |

**정리 순서 추천**
1. HANDOFF·RUNBOOK을 실제 D1 상태와 실행 경로에 맞춥니다.
2. D1 화면·대사·진행 검사를 확보하고, 옛 검사와 분리합니다.
3. 옛 시안·루트 게임을 의존 파일과 함께 보관하고 링크를 고칩니다.
4. 현재 규칙은 한곳에 모으고, refs 누락 15개와 FILEMAP을 갱신합니다.