# RUNBOOK — 절차서

> 빌드·실행·배포 명령. 같은 실수를 두 번 하면 여기에 적는다.

## 새 PC 준비 (회사 PC 등)
0. 그 PC에서 처음 한 번만 (이미 했으면 건너뜀). Git이 없으면 https://git-scm.com/download/win 에서 기본값으로 설치하고, PowerShell을 새로 열어:
   ```powershell
   git config --global user.name "stlemm"
   git config --global user.email "stlemm@gmail.com"
   git config --global core.autocrlf true
   ```
   처음 push할 때 GitHub 로그인 창이 뜨면 로그인 (한 번만)
1. 집 PC와 **같은 경로**로 받기: `git clone https://github.com/stlemm-rgb/dungeon.git C:\Project\dungeon`
2. 필요한 것: Python 3 (`py --version`), Chrome, **Node.js 22 이상** (`node --version`, D1 검사용). pip 설치는 필요 없음
   - Node가 없으면 D1 검사(핵심 규칙·대사·한 바퀴·D1 사진·문 실험실)가 "건너뜀"으로 통과해 버린다 → D1 작업 PC에는 꼭 설치
3. `py tools/check_all.py` 실행 → 15개 통과 확인 (약 40초)
   - `shots`만 실패하면 글꼴 차이일 수 있음. `tools/shots/out/`(D1은 `tools/shots/out/d1/`) 이미지를 눈으로 확인한 뒤 `py tools/shots.py --d1 --update` (옛 게임 기준은 갱신하지 않음)
4. HANDOFF.md부터 읽고 이어서 작업
5. PC를 옮길 때는 끝낸 PC에서 커밋·push, 새 PC에서 `git pull` 먼저. 한 번에 한 PC에서만

## 커밋 순서 (매번)
```bash
git pull                      # 원격 연결 후
git log --oneline -3          # 다른 쪽이 커밋했는지 확인
git add 파일1 파일2           # 이름으로만
git commit -m "무엇을 했나"
git push                      # 원격 연결 후
```

## git 문제가 생기면
| 증상 | 뜻 | 할 일 |
| --- | --- | --- |
| push가 `rejected` | 다른 PC에서 먼저 올린 게 있음 | `git pull` 후 다시 `git push` |
| pull 때 `Your local changes ... would be overwritten` | 이 PC에 커밋 안 한 변경이 있음 | 살리려면 커밋한 뒤 `git pull`. 버려도 되는지는 AI에게 먼저 물어보기 |
| `CONFLICT` (충돌) | 두 PC에서 같은 파일을 따로 고침 | **더 진행하지 말고** 화면을 AI에게 보여 주기 |
| 게임 세이브가 다른 PC에 없음 | 세이브는 브라우저에 저장돼서 git으로 안 옮겨짐 | 정상. (세이브 내보내기 기능은 나중에) |

## 실행
- 게임: `index.html`을 더블클릭 (file://로 열림, 설치·빌드 없음). 주소 옵션: `?seed=숫자`(저장 없을 때 새 게임 씨앗), `?nostorage=1`(저장 막힘 흉내)
- 전체 검사 (커밋 전 필수): `py tools/check_all.py` — 하나라도 실패하면 커밋하지 않는다. 약 40초. 두 묶음으로 나와 끝에 표로 보인다
  | 묶음 | 검사 | 무엇을 보나 |
  | --- | --- | --- |
  | **D1** (지금 데모) | `test_d1_core.py` | D1 규칙(문·탐험·전투·경제·납품·층·저장 v7)을 화면 없이 node로 |
  | | `test_lines.py` | `prototype/d1_demo/lines.js` 대사: 열리나(백틱·`${` 깨짐), 튜토리얼 id 12개 = 화면 코드가 부르는 id, 홈 5명 잡담, 칭호·준비 중·열림 조건 글 |
  | | `node prototype/door_lab/selftest.js` | 문 실험실 자체 검사 32개 |
  | | `test_d1_flow.py` | 헤드리스 Chrome으로 진짜 눌러 한 바퀴: 새 게임 → 의뢰 → 건설 모드에서 **문 끌기 + 대기실 끌기 → [건설]** → 다음 주 → 전투(×5) → 결과표 요약 → 새로고침 뒤 이어짐 → (API로 빨리 감기) 납품 → 데모 끝. 콘솔 오류 0. 약 25초라 맨 처음에 따로 띄워 둠 |
  | | `shots.py --d1` | D1 사진 6장(회사·현장·건설 모드·전투 12초·결과표 390×844 + 회사 1280×800)을 `tools/shots/d1/` 기준과 비교, 가로 넘침 0, 콘솔 오류 0 |
  | **옛 게임** (루트 index.html·C1 시안, 보관 전까지) | `filemap` `test_names` `test_rules` `golden` `test_oldsaves` `autoplay` `test_flow` `test_c1_core` `test_lines.py --c1` `shots.py --old` | 루트 게임·C1 시안. `test_oldsaves`는 D1 v6→v7 이관도 봄. 옛 기준 이미지·정답지는 갱신하지 않는다 |
  - D1 화면 도구: `tools/cdp.js`(Chrome 원격 조종: 열기·누르기·마우스/터치 끌기·사진·콘솔 오류) + `tools/d1_drive.js`(D1 사진·한 바퀴 실행기). 하나만 돌릴 때: `py tools/test_d1_flow.py`, `py tools/shots.py --d1`
  - D1 사진이 흔들리지 않게: `?seed=1`, 튜토리얼 끔(대사를 고쳐도 사진이 안 바뀜), 설정 "움직임 줄이기", 연출 무작위 고정, 전투 장면은 페이지 안에서 12초까지 계산해 저장 지점으로 넣고 새로고침
  - 화면을 일부러 바꿨으면: `tools/shots/out/d1/`을 눈으로 보고 `py tools/shots.py --d1 --update`
  - **AI가 커밋할 때 주의**: `check_all.py | tail -1 && git commit` 처럼 파이프로 자르면 실패해도 종료 코드가 0이 되어 커밋이 진행된다 (2026-10-19 실제로 한 번 일어남). 출력은 파일로 받고 `check_all.py > log; [ $? -eq 0 ] && git commit ...` 처럼 **종료 코드로 판단**한다
  - `shots.py`가 가끔 0.1~0.4% 차이로 실패하던 원인 = 헤드리스 Chrome이 창 맨 아래 약 7px을 그리기 전에 찍어 흰 줄이 생김. 2026-10-22 고침: 창을 120px 더 크게 찍고 위쪽만 잘라 비교(20번 연속 통과). 그래도 실패하면 진짜 화면 변화로 보고 `tools/shots/out/` 이미지를 확인
  - Python 표준 라이브러리 + Chrome(또는 Edge) + Node.js 22 이상 (pip 불필요). 브라우저 경로가 다르면 `GAME_BROWSER` 환경 변수
  - Git Bash에서 `python`이 Microsoft Store 바로가기로 잡혀 아무것도 안 나오면 `py tools/check_all.py`
- 기준 이미지 갱신 (일부러 바꿨을 때만): D1 = `py tools/shots.py --d1 --update`. 옛 게임 정답지·기준(`golden.py --update`, `shots.py --old --update`)은 보관 예정이라 건드리지 않는다
- 코드 규칙: `docs/CODE_RULES.md`, 파일 지도: `FILEMAP.md` (자동 생성)
- **화면 직접 확인은 ego 브라우저, 자동 검사는 Chrome 헤드리스** (2026-10-21 결정). ego는 집 PC에만 설치(`C:\Users\JUNG\.local\share\ego\active_version_dir`, 설치 전에 연 터미널·VS Code는 PATH에 없으니 경로를 붙이거나 재시작). 회사 PC·Codex에는 없으므로 `check_all`은 계속 Chrome. Codex는 기본 샌드박스에서 ego에 연결 못 함(전체 권한 필요) → Codex는 읽기 전용 검수만

## 배포
(GitHub Pages/Actions 설정 후 적기)

## 겪은 실수
- Git Bash에서 `python`이 Microsoft Store 바로가기로 잡혀 아무 출력 없이 끝남 → `py`로 실행
- 이 PC의 Edge는 헤드리스 실행에서 아무것도 출력하지 않음 → 검사는 Chrome을 먼저 씀
