"""이름 검사: 전역 이름 겹침, 파일 앞글자 규칙, 불러오기 목록 빠짐.

실패 조건
  (a) 전역 함수·변수 이름이 두 파일 이상(또는 한 파일에 두 번) 나오면 실패
  (b) 함수 이름이 그 파일의 앞글자(tools/name_rules.json)로 시작하지 않으면 실패
  (c) JS 파일이 앞글자 표에 없거나, index.html / tools/harness.html에서 불러오지 않으면 실패
사용: python tools/test_names.py
"""
import os
import re
import sys

import tool_common as tc


def check():
    rules = tc.load_name_rules()
    table = rules["files"]
    allow = set(rules.get("allowGlobals", []))
    problems = []
    seen = {}

    files = tc.game_js_files()
    for rel in files:
        if rel not in table:
            problems.append("%s: 앞글자 표(tools/name_rules.json)에 없는 파일" % rel)
    for rel in table:
        if not os.path.exists(os.path.join(tc.ROOT, rel)):
            problems.append("%s: 앞글자 표에 있는데 파일이 없음" % rel)

    for rel in files:
        rule = table.get(rel, {"prefixes": []})
        prefixes = rule.get("prefixes", [])
        data_only = rule.get("dataOnly", False)
        for kind, name, line in tc.js_globals(os.path.join(tc.ROOT, rel)):
            where = "%s:%d" % (rel, line)
            if name in seen:
                problems.append("%s: 전역 이름 '%s'이 겹침 (먼저 %s)" % (where, name, seen[name]))
            else:
                seen[name] = where
            if data_only:
                if kind in ("function", "class"):
                    problems.append("%s: data/ 파일에 함수 '%s' (계산은 js/로)" % (where, name))
                elif not re.fullmatch(r"[A-Z][A-Z0-9_]*", name):
                    problems.append("%s: data/ 전역 이름 '%s'은 대문자_밑줄로" % (where, name))
                continue
            if kind in ("function", "class"):
                if not any(name.startswith(p) for p in prefixes):
                    problems.append("%s: 함수 '%s'이 앞글자 %s로 시작하지 않음" % (where, name, prefixes))
            else:
                ok = name in allow or any(name.startswith(p) or name.startswith(p.upper()) for p in prefixes)
                if not ok:
                    problems.append("%s: 전역 변수 '%s'이 앞글자 %s로 시작하지 않음" % (where, name, prefixes))

    # 불러오기 목록
    index_src = tc.read("index.html")
    harness_src = tc.read("tools/harness.html")
    index_scripts = re.findall(r'<script[^>]*\ssrc="([^"]+)"', index_src)
    harness_scripts = [os.path.normpath(os.path.join("tools", s)).replace("\\", "/")
                       for s in re.findall(r'<script[^>]*\ssrc="([^"]+)"', harness_src)]
    for rel in files:
        if rel.startswith("tools/"):
            continue
        if rel not in index_scripts:
            problems.append("index.html이 %s를 불러오지 않음" % rel)
        is_ui = os.path.basename(rel).startswith("ui_")
        if not is_ui and rel not in harness_scripts:
            problems.append("tools/harness.html이 %s를 불러오지 않음" % rel)
        if is_ui and rel in harness_scripts:
            problems.append("tools/harness.html은 화면 파일 %s를 불러오면 안 됨" % rel)
    if len(set(index_scripts)) != len(index_scripts):
        problems.append("index.html이 같은 파일을 두 번 불러옴")
    return problems, len(seen)


def main():
    tc.setup_output()
    problems, count = check()
    if problems:
        print("[test_names] 실패 %d건" % len(problems))
        for p in problems:
            print("  - " + p)
        return 1
    print("[test_names] 통과: 전역 이름 %d개, 겹침 0, 앞글자 위반 0" % count)
    return 0


if __name__ == "__main__":
    sys.exit(main())
