# FILEMAP — 파일 지도

> 자동 생성 파일. 직접 고치지 말고 `python tools/filemap.py` (check_all이 같이 실행).
> 설명은 각 파일 첫 주석 줄에서 가져온다. 이름 앞글자 표 원본: `tools/name_rules.json`.

## (맨 위)

- `index.html` — 게임 첫 화면. file://로 더블클릭해도 돌아가게 일반 script 태그만 쓴다 (ES 모듈·외부 라이브러리 금지)

## data/

- `data/data_config.js` — 게임 상수: 버전, 저장 키, 처음 값 같은 숫자 모음 (계산 코드는 js/에)
- `data/data_text.js` — 화면에 나오는 글 모음 (다른 AI에게 글만 따로 맡길 수 있게 코드와 분리)

## js/

- `js/core_rng.js` — 게임 결과용 무작위: 씨앗 고정 가능, 씨앗과 위치가 state에 저장돼 불러온 뒤에도 같은 결과 · 앞글자 `rng_`
  - `rng_valueAt`, `rng_game`, `rng_int`, `rng_pick`
- `js/core_save.js` — 저장·불러오기: 저장 칸 목록(SAVE_FIELDS), 압축(save_lzPack), 예전 세이브 보완(save_ensureStateReady) · 앞글자 `save_`
  - `save_lzWidth`, `save_lzPack`, `save_lzUnpack`, `save_serialize`, `save_ensureStateReady`, `save_deserialize`, `save_setBlockedForTest`, `save_storageAvailable`, `save_write`, `save_read`, `save_delete`
- `js/core_state.js` — 게임 상태 한 곳: 전역 state와, state를 바꾸는 유일한 통로 함수들 · 앞글자 `state_`
  - `state_newGame`, `state_startNew`, `state_replace`, `state_addTurn`, `state_takeRngPos`, `state_setLastRoll`
- `js/core_turn.js` — 턴 흐름: '다음 턴' 한 번에 일어나는 일의 순서 · 앞글자 `turn_`
  - `turn_next`, `turn_runMany`
- `js/fx.js` — 연출용 무작위: 화면 효과 전용. 게임 결과에는 절대 쓰지 않는다 · 앞글자 `fx`
  - `fxRandom`, `fxPick`, `fxNewSeed`
- `js/ui_main.js` — 첫 화면: 시작(불러오기 또는 새 게임), 그리기, 버튼 처리, 자동 저장 · 앞글자 `ui_`
  - `ui_param`, `ui_setStatus`, `ui_init`, `ui_saveNow`, `ui_render`, `ui_onNextTurn`, `ui_onReload`, `ui_onNewGame`
- `js/ui_parts.js` — 공통 화면 부품: 페이지 머리, 표, 빈 칸 안내, 알림 띠, 버튼, 확인 창 · 앞글자 `ui_`
  - `ui_fmt`, `ui_el`, `ui_button`, `ui_pageHeader`, `ui_card`, `ui_table`, `ui_empty`, `ui_notice`, `ui_askConfirm`

## css/

- `css/style.css` — 화면 모양 전체. 색은 맨 위 :root 변수에만 둔다

## tools/

- `tools/autoplay.py` — 자동 진행 측정: 많은 턴을 돌려 오류 수, 걸린 시간, 세이브 크기를 출력한다.
  - `arg`, `main`
- `tools/cdp.js` — 헤드리스 Chrome CDP 도우미 (Node 22+ 내장 WebSocket·fetch): 열기·JS 실행·누르기·마우스/터치 끌기·스크린샷·콘솔 오류 모으기. refs/cdp_helper.js를 검사 도구용으로 옮긴 것 · 앞글자 `cdp_`
  - `cdp_findBrowser`, `cdp_sleep`, `cdp_launch`
- `tools/check_all.py` — 전체 검사 한 번에: D1 데모(지금 만드는 것) 묶음 + 옛 게임(루트 index.html·C1 시안) 묶음.
  - `start_step`, `finish_step`, `main`
- `tools/d1_drive.js` — D1 데모(prototype/d1_demo) 화면을 헤드리스 Chrome으로 움직이는 검사 실행기: 화면 사진 찍기(shots) · 한 바퀴 진행(flow). shots.py·test_d1_flow.py가 부른다 · 앞글자 `d1drive_`
  - `d1drive_page`, `d1drive_go`, `d1drive_setup`, `d1drive_shots`, `d1drive_flow`, `d1drive_main`, `d1drive_out`
- `tools/filemap.py` — 파일 지도 만들기: FILEMAP.md에 파일마다 한 줄 설명과 그 안의 함수 목록을 적는다.
  - `describe`, `functions`, `main`
- `tools/golden.py` — 정답지 검사: 정해진 씨앗으로 N턴 자동 진행한 state 요약이 tools/golden/*.json과 같은지.
  - `diff`, `main`
- `tools/harness.html` — 검사용 페이지. 파이썬 검사 도구가 Chrome/Edge 헤드리스로 열고, 결과를 #result에 적으면 읽어 간다
- `tools/harness.js` — 검사용 실행기: 주소의 ?mode=로 정답지·예전 세이브·자동 진행·화면 틀 검사를 돌리고 결과를 JSON으로 적는다 · 앞글자 `harness_`
  - `harness_finish`, `harness_param`, `harness_hash`, `harness_hash32`, `harness_stableJson`, `harness_runSeed`, `harness_modeGolden`, `harness_modeSelfcheck`, `harness_modeOldsave`, `harness_modeAutoplay`, `harness_modePack`, `harness_modeFrame`, `harness_modeFlow`, `harness_fmtTurn`, `harness_main`
- `tools/name_rules.json` — 이름 앞글자 표 (원본은 여기 한 곳). JS 파일을 새로 만들면 여기에 한 줄 추가한다. tools/test_names.py와 tools/filemap.py가 읽는다.
- `tools/shots.py` — 화면 검사: D1 데모(prototype/d1_demo)와 옛 루트 게임(index.html)의 스크린샷을 기준 이미지와 비교하고, 가로 넘침·콘솔 오류를 잰다.
  - `read_png`, `write_png`, `crop_top`, `compare`, `check_base`, `old_shots`, `d1_shots`, `main`
- `tools/test_c1_core.py` — C1 시안 핵심 규칙 검사: 납품 -> 새 의뢰 후보 -> pickQuest(친위대) -> 레벨 초기화·공사비 첫 건설·약탈 한도·저장·공방·부족 강화.
  - `main`
- `tools/test_d1_core.py` — D1 데모 핵심 규칙 검사 (prototype/d1_demo): 문 토큰 판·탐험·조우 즉시 승패, 마석/회사 금, 가치/전투력, 납품 단계, 층, 저장 v7.
  - `main`
- `tools/test_d1_flow.py` — D1 한 바퀴 검사: 헤드리스 Chrome으로 prototype/d1_demo를 실제로 눌러 처음부터 데모 끝까지 진행한다 (tools/d1_drive.js flow).
  - `main`
- `tools/test_flow.py` — 화면 흐름 검사: 진짜 index.html에서 '다음 턴' -> 자동 저장 -> 새로고침 -> 불러오기 -> 새 게임 확인 창.
  - `main`
- `tools/test_lines.py` — 대사 파일 검사: D1 데모 prototype/d1_demo/lines.js (기본) 또는 옛 C1 prototype/c1_shell/lines.js (--c1) 가 열리는지, 튜토리얼 단계마다 대사가 있는지, 줄마다 말한 사람과 글이 있는지, 홈 잡담 이름이 맞는지를 확인한다.
  - `actor_names`, `code_step_ids`, `check_extra`, `check`, `main`
- `tools/test_names.py` — 이름 검사: 전역 이름 겹침, 파일 앞글자 규칙, 불러오기 목록 빠짐.
  - `check`, `main`
- `tools/test_oldsaves.py` — 예전 세이브 검사: tools/oldsaves/*.txt를 불러와 save_ensureStateReady 뒤 오류가 없는지.
  - `d1_oldsaves`, `make`, `main`
- `tools/test_rules.py` — 코드 규칙 검사: 값 통로, 무작위 구분, 금지 함수, 색 변수, 모듈 금지.
  - `line_of`, `check_js`, `check_css`, `check_html`, `main`
- `tools/tool_common.py` — 검사 도구 공용 부품: 경로, 브라우저 찾기, 헤드리스 실행, JS 전역 이름 읽기.
  - `setup_output`, `find_browser`, `file_url`, `run_browser`, `run_harness`, `screenshot`, `run_node_tool`, `strip_js`, `_regex_can_start`, `js_globals`, `py_functions`, `load_name_rules`, `game_js_files`, `read`
