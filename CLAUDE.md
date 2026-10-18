@AGENTS.md

# Claude 전용

## Codex에게 점검 맡기기
사용자가 "코덱스한테 점검 맡겨"라고 하면 Bash로 아래를 실행한다. `-s read-only`라 Codex는 파일을 못 고친다.

```bash
BIN=$(ls -d ~/.vscode/extensions/openai.chatgpt-*/bin/windows-x86_64/codex.exe | sort -V | tail -1)
"$BIN" exec -s read-only "이번에 바뀐 코드(git diff) 점검해 줘. 버그·빠진 처리 위주로, 번호 매겨서."
```

- Codex 지적은 자주 틀린다. 하나씩 코드를 직접 확인해서 맞는 것/틀린 것을 나눠 표로 보고한다.
- 고치는 건 사용자가 "1번이랑 3번 고쳐"처럼 고른 것만.
