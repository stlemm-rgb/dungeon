# PROGRESS — 작업 일지

> 작업 하나에 번호 붙인 한 문단: 무엇을 · 왜 · 어느 파일 · 어떻게 확인했나.
> 버전이 끝나면 옛 기록은 docs/로 옮긴다.

1. 작업 환경 세팅. Claude·Codex 공동 작업용 규칙(AGENTS.md, CLAUDE.md)과 인계 문서(HANDOFF.md), 절차서(RUNBOOK.md)를 만들고 git 저장소를 시작함.

2. 에이전트 프로필 추가. 총괄(메인 Claude)이 일을 나눠 맡길 수 있게 `.claude/agents/core-dev.md`(Opus 5.5 medium, 워크트리에서 핵심 로직), `.claude/agents/frontend.md`(Sonnet, 워크트리에서 화면 작업)와 `.claude/agents/codex-review.md`(Codex 읽기 전용 리뷰 + 검증)를 만들고, CLAUDE.md에 배정 표를, .gitignore에 워크트리 폴더를 추가함.

3. 청사진 1장 뼈대 ①~⑨. 게임 내용을 만들기 전에 공통 틀을 깔기 위해 `core-dev`가 워크트리에서 혼자 구현함(사용자가 C안 선택). 데이터·코드 분리(`data/`), state 하나와 값 통로(`js/core_state.js`), 압축 저장과 예전 세이브 보완(`js/core_save.js`), 무작위 두 종류(`js/core_rng.js`, `js/fx.js`), 색 변수와 공통 부품(`css/style.css`, `js/ui_*.js`), 검사 도구 8개(`tools/`, `check_all.py`)와 `docs/CODE_RULES.md`. Node.js가 없어 Python 표준 라이브러리 + Chrome 헤드리스로 검사함. 총괄이 워크트리와 main 양쪽에서 `py tools/check_all.py` 8개 통과를 확인한 뒤 main에 합침. ⑩ 배포는 사용자 결정으로 나중에.

4. 게임 컨셉 논의와 기획 문서. 사용자 메모(마왕 의뢰로 던전을 지어 파는 게임)를 바탕으로 게임 단위, 설계 구멍, 기술 주의점, 2단계 최소 범위를 표로 정리하고 선택지로 결정함. 결정 사항(1회차 = 던전 1개, 장 = 마왕 1명 5회차, 인간 현장 소장 설정, 은발 츤데레 첫 마왕, 자동 전투 + 카드, 내 기록 랭킹, 무한 모드 등)과 열린 질문을 `docs/GAME_PLAN.md`에 적음. 회사 PC에서 이어갈 수 있도록 HANDOFF.md를 덮어쓰고 RUNBOOK.md에 새 PC 준비 절차를 추가함.

5. 진행 방향 변경과 회사 PC 준비. 이전 게임(C:\Project\Game)의 HANDOFF·PROGRESS·git 안내를 검토해 회사 PC 첫 준비(git 설정·로그인)와 git 문제 대처표를 RUNBOOK.md에, 사용자 작업 방식을 HANDOFF.md에 옮김. 사용자 결정: 이전 시행착오를 따라가지 말고 1인 인디 개발 방식을 따르기로 함. 그래서 설정을 더 다듬기 전에 칸 단위 / 방 단위 플레이 시안(`prototype/`, 네모와 글자, 마왕 요구 1개 + 침입자 1종)으로 퍼즐 재미부터 확인하기로 하고 HANDOFF "다음에 할 일"과 docs/GAME_PLAN.md를 고침. 커밋은 AI가 하기로 확인함(검사 통과 후, 한 줄 보고).
