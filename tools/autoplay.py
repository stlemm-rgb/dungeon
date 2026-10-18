"""자동 진행 측정: 많은 턴을 돌려 오류 수, 걸린 시간, 세이브 크기를 출력한다.

중간중간(기본 100턴마다) 저장 -> 불러오기를 끼워서 저장 왕복도 같이 확인한다.
실패 조건: 오류 1건 이상.
사용: python tools/autoplay.py [--turns 1000] [--seed 7]
"""
import sys

import tool_common as tc


def arg(name, default):
    if name in sys.argv:
        return int(sys.argv[sys.argv.index(name) + 1])
    return default


def main():
    tc.setup_output()
    turns = arg("--turns", 1000)
    seed = arg("--seed", 7)
    r = tc.run_harness({"mode": "autoplay", "seed": seed, "turns": turns, "every": 100})
    errors = r["errors"]
    print("[autoplay] 씨앗 %d, %d턴 -> 마지막 턴 %d" % (seed, turns, r["finalTurn"]))
    print("  오류: %d건" % len(errors))
    print("  걸린 시간: %.1f ms (한 턴 %.4f ms)" % (r["ms"], r["msPerTurn"]))
    print("  세이브 크기: %d글자 (state JSON %d글자), 저장 왕복 %d번"
          % (r["saveChars"], r["jsonChars"], r["roundTrips"]))
    if errors or r["finalTurn"] != r["startTurn"] + turns:
        for e in errors[:20]:
            print("  - " + e)
        print("[autoplay] 실패")
        return 1
    print("[autoplay] 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
