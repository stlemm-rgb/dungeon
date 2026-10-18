"""예전 세이브 검사: tools/oldsaves/*.txt를 불러와 save_ensureStateReady 뒤 오류가 없는지.

함께 검사: state_newGame 칸 == SAVE_FIELDS, 압축 왕복, 망가진 세이브는 ok:false로 처리 (selfcheck).
oldsaves 파일은 한 번 만들면 고치지 않는다 (예전 사람들의 세이브를 대신하는 것이라서).
새 세이브 버전을 내기 전에는 지금 버전 세이브를 하나 남긴다:
  python tools/test_oldsaves.py --make 이름 '{"v":1,"game":"0.1.0","data":{...}}'
사용: python tools/test_oldsaves.py
"""
import json
import os
import sys

import tool_common as tc

OLD_DIR = os.path.join(tc.TOOLS, "oldsaves")


def make(name, payload_json):
    payload = json.loads(payload_json)
    path = os.path.join(OLD_DIR, name + ".txt")
    if os.path.exists(path):
        print("이미 있음 (예전 세이브는 덮어쓰지 않음): " + path)
        return 1
    data = tc.run_harness({"mode": "pack", "v": payload.get("v", 1)},
                          hash_text=json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    os.makedirs(OLD_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(data["save"] + "\n")
    print("만듦: tools/oldsaves/%s.txt (%d글자)" % (name, len(data["save"])))
    return 0


def main():
    tc.setup_output()
    if len(sys.argv) >= 4 and sys.argv[1] == "--make":
        return make(sys.argv[2], sys.argv[3])

    problems = []
    sc = tc.run_harness({"mode": "selfcheck"})
    problems += ["selfcheck: " + p for p in sc["problems"] + sc.get("errors", [])]

    files = sorted(f for f in os.listdir(OLD_DIR) if f.endswith(".txt")) if os.path.isdir(OLD_DIR) else []
    if not files:
        problems.append("tools/oldsaves/에 예전 세이브가 하나도 없음")
    lines = []
    for name in files:
        with open(os.path.join(OLD_DIR, name), encoding="utf-8") as f:
            raw = f.read().strip()
        r = tc.run_harness({"mode": "oldsave"}, hash_text=raw)
        if not r["ok"]:
            problems.append("%s: 불러오기 실패: %s" % (name, r["error"]))
            continue
        for p in r["problems"] + r.get("errors", []):
            problems.append("%s: %s" % (name, p))
        lines.append("  %s: v%d, 보완 %d건%s, 불러온 뒤 5턴 진행 -> 턴 %d"
                     % (name, r["version"], len(r["fixes"]),
                        (" (" + "; ".join(r["fixes"]) + ")") if r["fixes"] else "", r["turnAfter"]))
    if problems:
        print("[test_oldsaves] 실패 %d건" % len(problems))
        for p in problems:
            print("  - " + p)
        return 1
    print("[test_oldsaves] 통과: 예전 세이브 %d개, 저장 칸 목록 일치, 압축 왕복 OK (압축률 %.1f%%)"
          % (len(files), sc["compressRatio"] * 100))
    print("  주사위 60000번 눈별 횟수: %s (기대 10000, 허용 +-300)" % sc["rollCounts"])
    for line in lines:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
