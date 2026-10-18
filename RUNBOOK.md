# RUNBOOK — 절차서

> 빌드·실행·배포 명령. 같은 실수를 두 번 하면 여기에 적는다.

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
(아직 없음)
