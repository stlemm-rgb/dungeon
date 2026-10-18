"""파일 지도 만들기: FILEMAP.md에 파일마다 한 줄 설명과 그 안의 함수 목록을 적는다.

설명은 파일 첫 주석 줄(JS·CSS `//`·`/* */`, HTML `<!-- -->`, 파이썬 docstring 첫 줄)에서 가져온다.
첫 줄 설명이 없는 파일이 있으면 실패한다 (새 파일을 만들면 맨 위에 한 줄 설명을 쓸 것).
사용: python tools/filemap.py
"""
import os
import re
import sys

import tool_common as tc

SCAN = [
    ("", (".html",)),
    ("data", (".js",)),
    ("js", (".js",)),
    ("css", (".css",)),
    ("tools", (".py", ".js", ".html", ".json")),
]


def describe(rel):
    src = tc.read(rel)
    if rel.endswith(".py"):
        m = re.match(r'\s*(?:"""|\'\'\')\s*(.+)', src)
    elif rel.endswith(".html"):
        m = re.search(r"<!--\s*(.+?)\s*-->", src)
    elif rel.endswith(".json"):
        m = re.search(r'"_설명"\s*:\s*"([^"]+)"', src)
    else:
        m = re.match(r"\s*(?://\s*(.+)|/\*\s*(.+))", src)
    if not m:
        return ""
    text = next(g for g in m.groups() if g)
    return text.strip().rstrip("*/").strip()


def functions(rel):
    path = os.path.join(tc.ROOT, rel)
    if rel.endswith(".js"):
        return [name for kind, name, _ in tc.js_globals(path) if kind == "function"]
    if rel.endswith(".py"):
        return tc.py_functions(path)
    return []


def main():
    tc.setup_output()
    prefixes = {k: v.get("prefixes", []) for k, v in tc.load_name_rules()["files"].items()}
    lines = [
        "# FILEMAP — 파일 지도",
        "",
        "> 자동 생성 파일. 직접 고치지 말고 `python tools/filemap.py` (check_all이 같이 실행).",
        "> 설명은 각 파일 첫 주석 줄에서 가져온다. 이름 앞글자 표 원본: `tools/name_rules.json`.",
        "",
    ]
    missing = []
    count = 0
    for folder, exts in SCAN:
        base = os.path.join(tc.ROOT, folder)
        if not os.path.isdir(base):
            continue
        names = sorted(n for n in os.listdir(base) if n.endswith(exts) and os.path.isfile(os.path.join(base, n)))
        if not names:
            continue
        lines.append("## " + (folder + "/" if folder else "(맨 위)"))
        lines.append("")
        for name in names:
            rel = (folder + "/" if folder else "") + name
            desc = describe(rel)
            if not desc:
                missing.append(rel)
            pre = prefixes.get(rel)
            pre_txt = (" · 앞글자 `" + "`, `".join(pre) + "`") if pre else ""
            lines.append("- `%s` — %s%s" % (rel, desc or "(설명 없음)", pre_txt))
            funcs = functions(rel)
            if funcs:
                lines.append("  - " + ", ".join("`%s`" % f for f in funcs))
            count += 1
        lines.append("")
    with open(os.path.join(tc.ROOT, "FILEMAP.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines).rstrip() + "\n")
    if missing:
        print("[filemap] 실패: 첫 줄 설명이 없는 파일 " + ", ".join(missing))
        return 1
    print("[filemap] 통과: FILEMAP.md 다시 만듦 (파일 %d개)" % count)
    return 0


if __name__ == "__main__":
    sys.exit(main())
