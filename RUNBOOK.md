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
2. 필요한 것: Python 3 (`py --version`), Chrome. Node.js·pip 설치는 필요 없음
3. `py tools/check_all.py` 실행 → 8개 통과 확인
   - `shots.py`만 실패하면 글꼴 차이일 수 있음. `index.html`을 직접 열어 화면을 확인한 뒤 `py tools/shots.py --update`
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
- 전체 검사 (커밋 전 필수): `python tools/check_all.py` — 하나라도 실패하면 커밋하지 않는다
  - **AI가 커밋할 때 주의**: `check_all.py | tail -1 && git commit` 처럼 파이프로 자르면 실패해도 종료 코드가 0이 되어 커밋이 진행된다 (2026-10-19 실제로 한 번 일어남). 출력은 파일로 받고 `check_all.py > log; [ $? -eq 0 ] && git commit ...` 처럼 **종료 코드로 판단**한다
  - `shots.py`가 한 번 실패했다가 다시 돌리면 통과한 적이 있음 (헤드리스 Chrome 일시 문제로 보임). 실패하면 한 번 더 돌려 보고, 또 실패하면 원인을 찾는다
  - Python 표준 라이브러리 + Chrome 또는 Edge만 필요 (Node.js·pip 불필요). 브라우저 경로가 다르면 `GAME_BROWSER` 환경 변수
  - Git Bash에서 `python`이 Microsoft Store 바로가기로 잡혀 아무것도 안 나오면 `py tools/check_all.py`
- 정답지·기준 이미지 갱신 (일부러 바꿨을 때만): `python tools/golden.py --update`, `python tools/shots.py --update`
- 코드 규칙: `docs/CODE_RULES.md`, 파일 지도: `FILEMAP.md` (자동 생성)
- **화면 직접 확인은 ego 브라우저, 자동 검사는 Chrome 헤드리스** (2026-10-21 결정). ego는 집 PC에만 설치(`C:\Users\JUNG\.local\share\ego\active_version_dir`, 설치 전에 연 터미널·VS Code는 PATH에 없으니 경로를 붙이거나 재시작). 회사 PC·Codex에는 없으므로 `check_all`은 계속 Chrome. Codex는 기본 샌드박스에서 ego에 연결 못 함(전체 권한 필요) → Codex는 읽기 전용 검수만

## 배포
(GitHub Pages/Actions 설정 후 적기)

## 겪은 실수
- Git Bash에서 `python`이 Microsoft Store 바로가기로 잡혀 아무 출력 없이 끝남 → `py`로 실행
- 이 PC의 Edge는 헤드리스 실행에서 아무것도 출력하지 않음 → 검사는 Chrome을 먼저 씀
