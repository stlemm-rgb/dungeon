"""전체 검사 한 번에: 파일 지도, 이름, 규칙, 정답지, 예전 세이브, 자동 진행, 화면 흐름, C1 핵심 규칙, 화면 비교.

하나라도 실패하면 종료 코드 1. 커밋 전에 꼭 돌린다.
사용: python tools/check_all.py
"""
import os
import subprocess
import sys
import time

import tool_common as tc

STEPS = [
    "filemap.py",
    "test_names.py",
    "test_rules.py",
    "golden.py",
    "test_oldsaves.py",
    "autoplay.py",
    "test_flow.py",
    "test_c1_core.py",
    "shots.py",
]


def main():
    tc.setup_output()
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    results = []
    t_all = time.time()
    for step in STEPS:
        t0 = time.time()
        proc = subprocess.run([sys.executable, os.path.join(tc.TOOLS, step)], cwd=tc.ROOT, env=env,
                              capture_output=True)
        out = (proc.stdout + proc.stderr).decode("utf-8", "replace").rstrip()
        print(out)
        results.append((step, proc.returncode == 0, time.time() - t0))
    print("")
    print("=" * 48)
    for step, ok, sec in results:
        print("  %-18s %s  (%.1fs)" % (step, "통과" if ok else "실패", sec))
    failed = [s for s, ok, _ in results if not ok]
    print("=" * 48)
    if failed:
        print("check_all 실패: " + ", ".join(failed))
        return 1
    print("check_all 통과 (%d개, %.1fs)" % (len(results), time.time() - t_all))
    return 0


if __name__ == "__main__":
    sys.exit(main())
