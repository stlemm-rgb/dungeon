"""전체 검사 한 번에: D1 데모(지금 만드는 것) 묶음 + 옛 게임(루트 index.html·C1 시안) 묶음.

D1 묶음   : D1 핵심 규칙 · D1 대사 · 문 실험실 자체 검사 · D1 한 바퀴(화면) · D1 화면 사진
옛 게임 묶음: 파일 지도 · 이름 · 규칙 · 정답지 · 예전 세이브(루트+D1 v6) · 자동 진행 · 화면 흐름 · C1 핵심 규칙 · C1 대사 · 옛 화면 사진
(옛 게임 묶음은 보관 폴더로 옮기기 전까지 계속 돌린다. 파일 지도·이름·규칙은 지금 루트 js/·tools/만 본다.)
하나라도 실패하면 종료 코드 1. 커밋 전에 꼭 돌린다. node가 없으면 node 검사는 건너뜀(통과)으로 나온다.
사용: python tools/check_all.py
"""
import os
import shutil
import subprocess
import sys
import time

import tool_common as tc

PY = "py"      # 표시용 종류
NODE = "node"

# (묶음, 이름, 종류, 실행할 것)
STEPS = [
    ("D1", "test_d1_core", PY, ["test_d1_core.py"]),
    ("D1", "test_lines D1", PY, ["test_lines.py"]),
    ("D1", "door_lab selftest", NODE, ["prototype/door_lab/selftest.js"]),
    ("D1", "test_d1_flow", PY, ["test_d1_flow.py"]),
    ("D1", "shots D1", PY, ["shots.py", "--d1"]),
    ("옛 게임", "filemap", PY, ["filemap.py"]),
    ("옛 게임", "test_names", PY, ["test_names.py"]),
    ("옛 게임", "test_rules", PY, ["test_rules.py"]),
    ("옛 게임", "golden", PY, ["golden.py"]),
    ("옛 게임", "test_oldsaves", PY, ["test_oldsaves.py"]),
    ("옛 게임", "autoplay", PY, ["autoplay.py"]),
    ("옛 게임", "test_flow", PY, ["test_flow.py"]),
    ("옛 게임", "test_c1_core", PY, ["test_c1_core.py"]),
    ("옛 게임", "test_lines C1", PY, ["test_lines.py", "--c1"]),
    ("옛 게임", "shots 옛", PY, ["shots.py", "--old"]),
]


# 오래 걸리는데 화면 사진과 상관없는 검사는 맨 처음에 따로 띄워 두고 차례가 오면 결과만 받는다 (전체 시간 약 20초 줄임)
BACKGROUND = ("test_d1_flow",)


def start_step(kind, args, env):
    """검사 하나를 띄운다. (Popen 또는 None=건너뜀, 시작 시각)"""
    if kind == NODE:
        node = shutil.which("node")
        if not node:
            return None, time.time()
        cmd = [node, os.path.join(tc.ROOT, args[0])] + args[1:]
    else:
        cmd = [sys.executable, os.path.join(tc.TOOLS, args[0])] + args[1:]
    proc = subprocess.Popen(cmd, cwd=tc.ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return proc, time.time()


def finish_step(kind, args, started):
    """(성공?, 출력, 걸린 초). node 단계는 node가 없으면 건너뜀(성공)."""
    proc, t0 = started
    if proc is None:
        return True, "[%s] node 없음: 건너뜀" % args[0], 0.0
    data, _ = proc.communicate()
    out = data.decode("utf-8", "replace").rstrip()
    if kind == NODE:   # node 자체 검사는 출력이 길어서 마지막 몇 줄만
        tail = [line for line in out.splitlines() if line.strip()][-3:]
        out = "[%s] 종료 코드 %d\n  " % (args[0], proc.returncode) + "\n  ".join(tail)
    return proc.returncode == 0, out, time.time() - t0


def main():
    tc.setup_output()
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    results = []
    t_all = time.time()
    early = {name: start_step(kind, args, env) for grp, name, kind, args in STEPS if name in BACKGROUND}
    done = {}
    # 나머지를 차례로 돌리고, 따로 띄운 검사는 맨 끝에 받는다 (출력은 끝나는 차례로, 맨 아래 표는 묶음 차례로)
    order = [s for s in STEPS if s[1] not in BACKGROUND] + [s for s in STEPS if s[1] in BACKGROUND]
    for grp, name, kind, args in order:
        started = early.get(name) or start_step(kind, args, env)
        ok, out, sec = finish_step(kind, args, started)
        print("")
        print("---------- [%s] %s ----------" % (grp, name))
        print(out)
        done[name] = (ok, sec)
    for grp, name, kind, args in STEPS:
        results.append((grp, name) + done[name])
    print("")
    print("=" * 52)
    group = None
    for grp, name, ok, sec in results:
        if grp != group:
            group = grp
            print(" [%s]" % grp)
        print("  %-20s %s  (%.1fs)" % (name, "통과" if ok else "실패", sec))
    failed = ["%s/%s" % (g, n) for g, n, ok, _ in results if not ok]
    print("=" * 52)
    if failed:
        print("check_all 실패: " + ", ".join(failed))
        return 1
    print("check_all 통과 (%d개, %.1fs)" % (len(results), time.time() - t_all))
    return 0


if __name__ == "__main__":
    sys.exit(main())
