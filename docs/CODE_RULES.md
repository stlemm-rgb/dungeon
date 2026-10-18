# 코드 규칙

> 처음 보는 사람(사람이든 AI든)이 이것만 읽고 따라 할 수 있게 쓴 규칙입니다.
> 규칙 대부분은 `python tools/check_all.py`가 자동으로 검사합니다. 검사가 실패하면 커밋하지 않습니다.

## 1. 폴더

| 폴더 | 들어가는 것 | 금지 |
| --- | --- | --- |
| `data/` | 글·숫자·확률 (값만) | 함수, 계산 |
| `js/` | 계산과 화면 코드 | 화면 글·밸런스 숫자를 코드 안에 직접 쓰기 |
| `css/style.css` | 화면 모양 전부 | 맨 위 `:root` 밖에서 색을 직접 쓰기 |
| `tools/` | 검사 도구 (파이썬 표준 라이브러리 + 헤드리스 Chrome/Edge) | pip 패키지, Node.js |
| `index.html` | 게임 첫 화면 | `<script type="module">`, 외부 주소(CDN), `style=` 속성 |

- 주제 하나에 파일 하나. 작은 파일을 마구 만들지 않습니다. 파일 목록과 함수 목록은 `FILEMAP.md`(자동 생성)에서 봅니다.
- 새 파일 맨 위에는 **한 줄 설명 주석**을 씁니다. 없으면 `tools/filemap.py`가 실패합니다.
- ES 모듈(`import`/`export`)을 쓰지 않습니다. `index.html`의 일반 `<script>` 태그로 불러옵니다 (file:// 더블클릭과 GitHub Pages 둘 다 되게).
- `confirm()`/`alert()`/`prompt()` 금지 (웹에서 막힘). 확인 창은 `ui_askConfirm`.

## 2. 이름 앞글자 표

전역 함수 이름은 파일 앞글자로 시작합니다. 다른 파일과 같은 이름이면 앞의 것이 덮어써져 화면이 깨지므로, `tools/test_names.py`가 겹침과 앞글자를 검사합니다.

**표의 원본은 `tools/name_rules.json` 한 곳입니다.** 아래는 지금 내용을 옮겨 적은 것입니다 (FILEMAP.md에도 파일마다 앞글자가 나옵니다).

| 파일 | 앞글자 | 하는 일 |
| --- | --- | --- |
| `data/data_config.js` | (값만, 대문자_밑줄) | 버전 `GAME_VERSION`, `SAVE_VERSION`, `SAVE_KEY`, 규칙 숫자 `GAME_CONFIG` |
| `data/data_text.js` | (값만, 대문자_밑줄) | 화면 글 `TEXT` |
| `js/core_state.js` | `state_` | 전역 `state`와 값을 바꾸는 통로 함수 |
| `js/core_rng.js` | `rng_` | 게임 결과용 무작위 |
| `js/core_turn.js` | `turn_` | 한 턴 흐름 순서 |
| `js/core_save.js` | `save_` | 저장 칸 목록, 압축, 저장·불러오기, 예전 세이브 보완 |
| `js/fx.js` | `fx` | 연출용 무작위 `fxRandom` |
| `js/ui_parts.js` | `ui_` | 공통 화면 부품 |
| `js/ui_main.js` | `ui_` | 첫 화면 그리기와 버튼 처리 |
| `tools/harness.js` | `harness_` | 검사용 실행기 |

- 전역 변수도 앞글자(또는 대문자 앞글자, 예: `SAVE_FIELDS`)로 시작합니다. 예외는 `state` 하나.
- **새 JS 파일을 만들 때:** ① `tools/name_rules.json`에 한 줄 추가 ② `index.html`에 `<script>` 추가 ③ 화면 파일(`ui_`)이 아니면 `tools/harness.html`에도 추가. 빠지면 `test_names.py`가 알려 줍니다.

## 3. 게임 상태와 값 통로

- 모든 진행 상황은 전역 `state` 하나에 있습니다. 화면은 `state`를 **읽어서 그리기만** 합니다.
- `state`를 바꾸는 코드(`state.xxx = ...`, `state.xxx++`, `state.list.push(...)` 등)는 **`js/core_state.js` 안에서만** 씁니다. 다른 파일에서 쓰면 `tools/test_rules.py`가 실패합니다.
- 다른 파일은 통로 함수를 부릅니다: `state_addTurn`, `state_setLastRoll`, `state_takeRngPos`, `state_startNew`, `state_replace`.
- 새 값이 생기면 통로 함수를 **하나** 만듭니다. 예: 골드 → `state_addGold(n, 이유)`. 골드를 바꾸는 곳은 모두 이 함수를 부릅니다. 통로가 하나여야 나중에 "골드가 늘 때 업적 체크" 같은 규칙을 한 곳에만 넣으면 됩니다.
- 화면에만 필요한 잠깐짜리 값(알림 글, 열린 탭)은 `state`에 넣지 않고 `ui_` 변수에 둡니다. 저장되지 않습니다.
- 한 턴에 일어나는 일의 순서는 `turn_next` 한 곳에만 적습니다.

## 4. 저장 칸 추가하는 법

저장은 "새 게임 기본값(`state_newGame`) 위에 저장된 값을 덮는" 방식입니다. 세이브 글자는 `DG<세이브버전>:<압축 글자>`입니다.

**칸을 하나 추가할 때 (예: `gold`):**
1. `js/core_state.js`의 `state_newGame`에 기본값 추가: `gold: 0,`
2. `js/core_save.js`의 `SAVE_FIELDS`에 `"gold"` 추가
3. 통로 함수 `state_addGold` 추가
4. `python tools/check_all.py` — `test_oldsaves.py`가 ①과 ②가 맞는지 확인하고, 예전 세이브(gold 없음)를 불러오면 기본값 0이 들어가는지 확인합니다.

이 경우는 `SAVE_VERSION`을 올릴 필요가 없습니다 (빠진 칸은 자동으로 기본값).

**칸의 뜻이 바뀔 때 (예: `money`를 `gold`로 이름 변경, 숫자 단위 변경):**
1. 바꾸기 **전에** 지금 버전 세이브를 하나 남깁니다:
   `python tools/test_oldsaves.py --make v1_before_gold '{"v":1,"game":"0.1.0","data":{...}}'`
2. `data/data_config.js`의 `SAVE_VERSION`을 1 올립니다.
3. `save_ensureStateReady`의 "버전별 옮기기" 자리에 옮기는 코드를 넣습니다: `if (fromVersion < 2) { src.gold = src.money; }`
4. `python tools/check_all.py`

- 예전 세이브 보완은 **`save_ensureStateReady` 한 곳에서만** 합니다. 다른 곳에서 "없으면 기본값" 코드를 쓰지 않습니다.
- `tools/oldsaves/`의 파일은 한 번 만들면 고치지 않습니다 (예전 플레이어의 세이브를 대신합니다).
- 저장 공간(localStorage)이 막힌 환경이면 화면에 안내 띠가 뜹니다 (조용히 실패하지 않음). 확인: 주소 뒤에 `?nostorage=1`.

## 5. 무작위 사용 규칙

| 쓰는 곳 | 함수 | 파일 |
| --- | --- | --- |
| 게임 결과 (전투, 보상, 이벤트, 상대 선택) | `rng_game()`, `rng_int(min, max)`, `rng_pick(list)` | `js/core_rng.js` |
| 연출 (흔들림, 반짝임, 꾸밈) | `fxRandom()`, `fxPick(list)` | `js/fx.js` |

- 게임용 무작위는 씨앗(`state.rngSeed`)과 위치(`state.rngPos`)가 저장되므로, 불러온 뒤에도 같은 결과가 나옵니다. `tools/golden.py`가 "같은 씨앗 → 같은 결과"와 "중간에 저장/불러오기를 해도 같은 결과"를 확인합니다.
- 연출이 게임용 무작위를 쓰면, 애니메이션을 켜고 끄는 것만으로 게임 결과가 달라집니다. 그래서 섞지 않습니다.
- `Math.random`은 `js/fx.js` 안에서만 쓸 수 있습니다. `core_`·`data_` 파일에서 `fx` 함수를 부르는 것도 금지. 둘 다 `tools/test_rules.py`가 검사합니다.
- 주소 뒤에 `?seed=숫자`를 붙이면 (저장이 없을 때) 그 씨앗으로 새 게임을 시작합니다.

## 6. 색과 화면 부품

- 색은 `css/style.css` 맨 위 `:root`의 변수(`--bg`, `--accent` 등)에만 씁니다. 나머지 CSS는 `var(--이름)`만. 디자인을 바꿀 때는 `:root`만 고칩니다.
- 공통 부품(`js/ui_parts.js`): `ui_pageHeader`(페이지 머리 + 버전), `ui_card`, `ui_table`(표), `ui_empty`(빈 칸 안내), `ui_notice`(알림 띠), `ui_button`, `ui_askConfirm`(확인 창). 새 화면은 이 부품을 조립합니다.
- 화면 글은 `data/data_text.js`의 `TEXT`에서 가져오고, `{이름}` 자리는 `ui_fmt`로 채웁니다.
- 휴대폰 폭 390px부터 맞춥니다. `tools/shots.py`가 390px·1280px에서 가로 넘침을 재고 기준 이미지와 비교합니다.

## 7. 검사 도구

| 명령 | 하는 일 |
| --- | --- |
| `python tools/check_all.py` | 아래 전부. 하나라도 실패하면 종료 코드 1 |
| `python tools/filemap.py` | `FILEMAP.md` 다시 만들기 |
| `python tools/test_names.py` | 전역 이름 겹침, 앞글자, 불러오기 목록 |
| `python tools/test_rules.py` | state 직접 변경, Math.random, confirm/alert, :root 밖 색, 모듈·외부 주소 |
| `python tools/golden.py [--update]` | 정해진 씨앗으로 200턴 → 정답지(`tools/golden/`)와 비교 |
| `python tools/test_oldsaves.py` | 예전 세이브(`tools/oldsaves/`) 불러오기 + 저장 칸 목록·압축 자체 검사 |
| `python tools/autoplay.py [--turns N]` | 많은 턴 자동 진행: 오류 수, 시간, 세이브 크기 |
| `python tools/test_flow.py` | 진짜 화면에서 다음 턴 → 자동 저장 → 새로고침 → 불러오기 → 새 게임 |
| `python tools/shots.py [--update]` | 스크린샷 비교(`tools/shots/`) + 가로 넘침 |

- JS는 Chrome 또는 Edge를 헤드리스로 띄워 `tools/harness.html`에서 돌립니다 (Node.js 불필요). 브라우저 위치가 다르면 환경 변수 `GAME_BROWSER`에 경로를 넣습니다.
- 게임 규칙을 일부러 바꿔서 정답지가 달라졌다면, 결과가 맞는지 확인한 뒤 `golden.py --update`로 갱신하고 PROGRESS에 이유를 적습니다.
- 화면을 일부러 바꿨다면 `tools/shots/out/`의 새 이미지를 눈으로 보고 `shots.py --update`. `GAME_VERSION`을 올려도 화면의 버전 글자가 바뀌므로 갱신이 필요합니다.
- 기준 이미지는 글꼴 때문에 PC마다 조금 다를 수 있습니다. 다른 PC에서 처음 돌리면 `--update`로 그 PC 기준을 만듭니다.
