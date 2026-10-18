"""화면 흐름 검사: 진짜 index.html에서 '다음 턴' -> 자동 저장 -> 새로고침 -> 불러오기 -> 새 게임 확인 창.

브라우저를 매번 새 프로필로 열기 때문에 내 브라우저의 저장과 섞이지 않는다.
사용: python tools/test_flow.py
"""
import sys

import tool_common as tc


def main():
    tc.setup_output()
    r = tc.run_harness({"mode": "flow"})
    problems = r["problems"] + r["errors"]
    if problems:
        print("[test_flow] 실패 %d건" % len(problems))
        for p in problems:
            print("  - " + p)
        for s in r["steps"]:
            print("    " + s)
        return 1
    print("[test_flow] 통과: 다음 턴 -> 자동 저장 -> 새로고침 뒤 불러오기 -> 새 게임 확인 창")
    for s in r["steps"]:
        print("  " + s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
