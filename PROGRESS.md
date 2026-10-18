# PROGRESS — 작업 일지

> 작업 하나에 번호 붙인 한 문단: 무엇을 · 왜 · 어느 파일 · 어떻게 확인했나.
> 버전이 끝나면 옛 기록은 docs/로 옮긴다.

1. 작업 환경 세팅. Claude·Codex 공동 작업용 규칙(AGENTS.md, CLAUDE.md)과 인계 문서(HANDOFF.md), 절차서(RUNBOOK.md)를 만들고 git 저장소를 시작함.

2. 에이전트 프로필 추가. 총괄(메인 Claude)이 일을 나눠 맡길 수 있게 `.claude/agents/core-dev.md`(Opus 5.5 medium, 워크트리에서 핵심 로직), `.claude/agents/frontend.md`(Sonnet, 워크트리에서 화면 작업)와 `.claude/agents/codex-review.md`(Codex 읽기 전용 리뷰 + 검증)를 만들고, CLAUDE.md에 배정 표를, .gitignore에 워크트리 폴더를 추가함.
