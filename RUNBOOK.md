# RUNBOOK — 절차서

> 빌드·실행·배포 명령. 같은 실수를 두 번 하면 여기에 적는다.

## 새 PC 준비 (회사 PC 등)
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

## 실행
- 게임: `index.html`을 더블클릭 (file://로 열림, 설치·빌드 없음). 주소 옵션: `?seed=숫자`(저장 없을 때 새 게임 씨앗), `?nostorage=1`(저장 막힘 흉내)
- 전체 검사 (커밋 전 필수): `python tools/check_all.py` — 하나라도 실패하면 커밋하지 않는다
  - Python 표준 라이브러리 + Chrome 또는 Edge만 필요 (Node.js·pip 불필요). 브라우저 경로가 다르면 `GAME_BROWSER` 환경 변수
  - Git Bash에서 `python`이 Microsoft Store 바로가기로 잡혀 아무것도 안 나오면 `py tools/check_all.py`
- 정답지·기준 이미지 갱신 (일부러 바꿨을 때만): `python tools/golden.py --update`, `python tools/shots.py --update`
- 코드 규칙: `docs/CODE_RULES.md`, 파일 지도: `FILEMAP.md` (자동 생성)

## 배포
(GitHub Pages/Actions 설정 후 적기)

## 겪은 실수
- Git Bash에서 `python`이 Microsoft Store 바로가기로 잡혀 아무 출력 없이 끝남 → `py`로 실행
- 이 PC의 Edge는 헤드리스 실행에서 아무것도 출력하지 않음 → 검사는 Chrome을 먼저 씀
