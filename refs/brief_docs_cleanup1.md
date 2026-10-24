# 지시서: 문서 정리 1회 (Codex 하청, 2026-10-24)

## 고칠 파일 (이것만)
`refs/README.md`, `prototype/index.html`, `RUNBOOK.md`. 다른 파일은 고치지 않는다. 커밋하지 않는다.

## 1. refs/README.md — 빠진 파일 넣기
- `refs/` 폴더의 모든 파일(README 제외)이 표에 한 줄씩 있게. 지금 빠진 것(진단 `refs/codex_structure_diag_2026-10-24.md` ③ 표 참고: brief_* 대부분, debate_doors, codex_* 4개, ref_ui_layout 등)과 그 뒤 새로 생긴 것(`brief_d1_doors_core.md`, `brief_d1_doors_ui.md`, `brief_d1_checks.md`, `brief_d1_ui_polish1.md`, `brief_docs_terms.md`, `brief_lines_home.md`, `brief_door_lab_4.md`, `codex_d1doors_opinion_2026-10-24.md`, `codex_structure_diag_2026-10-24.md`, 이 지시서 `brief_docs_cleanup1.md`)도.
- 표에 없는데 폴더에 없는 파일(`cdp_helper.js` 등, 지워짐)은 줄을 지운다.
- 표 형식 그대로: `| 파일 | 종류 | 내용 |`. 종류는 지시서 · 토론 · 검수 기록(Codex 의견·리뷰) · 참고 게임 · UI 참고 · 초안 창고 · 플레이 기록 중 하나. 내용은 그 파일 첫 몇 줄을 읽고 한 줄로. 지시서는 끝난 일이면 "(끝)"을 붙인다(PROGRESS.md에서 확인).
- 같은 종류끼리 모아 정렬.

## 2. prototype/index.html — 실험 설명
- 17줄 문 실험 링크 설명 "3×4 방, 문 12개…"를 지금 상태로: 판 3×4 / 5×7 고르기(5×7 = D1 한 층 크기, 34방·문 36개), 만나는 순간 승패, 시드 100개 측정. 짧게.
- D1 데모 링크 설명이 있으면 지금 상태(5×7 판·문 끌기·탐험 이동·첫 의뢰 → 데모 끝)로. 옛 시안 링크들은 그대로 둔다.

## 3. RUNBOOK.md — "실행" 절
- 39줄 "게임: `index.html`을 더블클릭…"은 루트 **옛 게임** 안내다. 맨 앞에 **D1 데모**: `prototype/d1_demo/index.html` 더블클릭, 주소 옵션 `?seed=숫자`·`?debug`(경로 선) 줄을 넣고, 옛 줄은 "옛 게임(보관 예정)"으로 표시해 아래로.
- **폰으로 해 보기** 한 줄 추가: 저장소에서 `py -m http.server 8000 --bind 0.0.0.0` → 같은 와이파이 폰에서 `http://<PC IP>:8000/prototype/d1_demo/index.html`, Windows 방화벽에서 Python 허용이 필요할 수 있음.
- 검사 절(이미 고쳐져 있음)은 건드리지 않는다.

## 끝 기준
- 위 3개 파일 밖 변경 없음. 파일은 UTF-8(BOM 없이).
- 보고(`-o`): 한국어 표 — 파일 | 바꾼 것 요약. 그 아래 README에서 종류를 정하기 애매했던 파일 목록.
