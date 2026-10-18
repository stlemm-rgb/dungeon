"""정답지 검사: 정해진 씨앗으로 N턴 자동 진행한 state 요약이 tools/golden/*.json과 같은지.

같은 씨앗 -> 같은 결과가 깨지면 실패. 중간에 저장/불러오기를 끼워도 결과가 같아야 한다.
게임 규칙을 일부러 바꿨다면 결과를 확인한 뒤 --update로 정답지를 새로 쓰고 PROGRESS에 적는다.
사용: python tools/golden.py [--update]
"""
import json
import os
import sys

import tool_common as tc

GOLDEN_DIR = os.path.join(tc.TOOLS, "golden")
SEEDS = [1, 42, 20261018]
TURNS = 200


def diff(expect, got, path=""):
    out = []
    if isinstance(expect, dict) and isinstance(got, dict):
        for k in sorted(set(expect) | set(got)):
            if k not in got:
                out.append("%s.%s 없어짐" % (path, k))
            elif k not in expect:
                out.append("%s.%s 새로 생김 = %r" % (path, k, got[k]))
            else:
                out += diff(expect[k], got[k], path + "." + k)
    elif expect != got:
        out.append("%s: 정답 %r / 지금 %r" % (path or "값", expect, got))
    return out


def main():
    tc.setup_output()
    update = "--update" in sys.argv
    data = tc.run_harness({"mode": "golden", "seeds": ",".join(map(str, SEEDS)), "turns": TURNS})
    problems = list(data.get("errors", []))
    os.makedirs(GOLDEN_DIR, exist_ok=True)
    for case in data["cases"]:
        name = "seed_%d.json" % case["seed"]
        path = os.path.join(GOLDEN_DIR, name)
        if not case.pop("resumeMatches"):
            problems.append("%s: 중간 저장/불러오기 뒤 결과가 달라짐 (씨앗·위치 저장 확인)" % name)
        if update:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                json.dump(case, f, ensure_ascii=False, indent=2, sort_keys=True)
                f.write("\n")
            print("  정답지 갱신: tools/golden/%s (턴 %d, stateHash %s)" % (name, case["turn"], case["stateHash"]))
            continue
        if not os.path.exists(path):
            problems.append("%s: 정답지 없음. 처음이면 python tools/golden.py --update" % name)
            continue
        with open(path, encoding="utf-8") as f:
            expect = json.load(f)
        d = diff(expect, case)
        if d:
            problems.append("%s: 정답지와 다름\n      " % name + "\n      ".join(d[:15]))
    if problems:
        print("[golden] 실패 %d건" % len(problems))
        for p in problems:
            print("  - " + p)
        return 1
    print("[golden] 통과: 씨앗 %s x %d턴, 정답지 일치, 중간 저장/불러오기 뒤에도 같음%s"
          % (SEEDS, TURNS, " (정답지 갱신함)" if update else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
