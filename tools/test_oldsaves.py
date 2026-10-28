"""예전 세이브 검사: tools/oldsaves/*.txt를 불러와 save_ensureStateReady 뒤 오류가 없는지.

함께 검사: state_newGame 칸 == SAVE_FIELDS, 압축 왕복, 망가진 세이브는 ok:false로 처리 (selfcheck).
oldsaves 파일은 한 번 만들면 고치지 않는다 (예전 사람들의 세이브를 대신하는 것이라서).
새 세이브 버전을 내기 전에는 지금 버전 세이브를 하나 남긴다:
  python tools/test_oldsaves.py --make 이름 '{"v":1,"game":"0.1.0","data":{...}}'
D1 데모(prototype/d1_demo)의 옛 저장은 tools/oldsaves/d1/*.json (localStorage에 들어 있던 그대로).
  v6 -> v7 B안(회사 기록만 이어 받고 진행 중 의뢰는 새 판으로 처음부터)을 node로 검사한다. node가 없으면 이 부분만 건너뜀.
사용: python tools/test_oldsaves.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

import tool_common as tc

OLD_DIR = os.path.join(tc.TOOLS, "oldsaves")
D1_DIR = os.path.join(OLD_DIR, "d1")

# 파일 이름별 기대: phase = 바꾼 뒤 phase, quest = 이어 가는 의뢰 key (없으면 None)
D1_EXPECT = {
    "v6_play_q1_battling.json": {"phase": "play", "quest": "q1"},
    "v6_settle_after_q1.json": {"phase": "settle", "quest": None},
    "v6_play_q2_guard.json": {"phase": "demoEnd", "quest": None},
}

D1_JS = r"""
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = process.argv[2], FILE = process.argv[3], EXP = JSON.parse(process.argv[4]);
const KEY = 'dunguen_d1_run', store = {}, problems = [];
function ok(c, msg) { if (!c) problems.push(msg); }
const raw = fs.readFileSync(FILE, 'utf8'), old = JSON.parse(raw);
store[KEY] = JSON.stringify(old);
const sb = { console, Math, JSON, Date, Object, Array, String, Number };
sb.window = sb;
sb.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
vm.createContext(sb);
['battle_data.js', 'zones.js', 'progress.js', 'battle_sim.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sb, { filename: f }));
const P = sb.PROGRESS, R = P.RUN, BD = sb.BATTLE_DATA, Z = sb.ZONES;
ok(old.v === 6, '예시 저장이 v6이 아님');
ok(R.v === 7 && JSON.parse(store[KEY]).v === 7, '불러온 뒤 v7로 저장');
['gold', 'gems', 'week'].concat(EXP.quest ? [] : ['seed']).forEach(k => ok(R[k] === old[k], k + ' 그대로: ' + old[k] + ' -> ' + R[k]));   // (의뢰를 이어 가면 새 주 계획이 씨앗을 씀)
ok(JSON.stringify(R.company) === JSON.stringify(old.company), '회사 레벨 그대로');
ok(JSON.stringify(R.guards) === JSON.stringify(old.guards || []), '친위대 그대로');
ok(JSON.stringify(R.works) === JSON.stringify(old.works || []) && JSON.stringify(R.doneQuests) === JSON.stringify(old.doneQuests || []), '작품집·끝낸 의뢰 그대로');
ok(JSON.stringify(R.tribes) === JSON.stringify(old.tribes || {}), '부족 강화 그대로');
ok(R.phase === EXP.phase, 'phase ' + old.phase + ' -> ' + R.phase + ' (기대 ' + EXP.phase + ')');
ok(!R.battling && !R.bsave, '전투 중 저장은 버림');
ok(Array.isArray(R.site.boards) && R.site.boards[0] === 'g1' && !('board' in R.site) && Z.validateDoors(R.site.doors[1], 1).ok, '현장은 새 판 g1 + 처음 문');
const note = P.takeNotice();
ok(typeof note === 'string' && note.length > 0 && P.takeNotice() === '', '바꿈 안내 한 번: ' + note);
const fixes = [];
if (EXP.quest) {
  const q = R.quest, d = BD.QUESTS.filter(x => x.key === EXP.quest)[0];
  ok(q && q.key === EXP.quest && q.stage === 0 && q.startWeek === R.week && q.board === 'g1', '같은 의뢰를 새 판으로 처음부터: ' + JSON.stringify(q && [q.key, q.stage, q.startWeek, q.board]));
  ok(P.budgetLeft() === d.budget && R.site.squads.length === 1 && R.site.squads[0].free && R.site.denGifts === 0, '마석 처음 값·무료 기본 부대만');
  ok(R.quest.id === old.quest.id, '의뢰 번호 유지');
  ok(P.startBattle().ok, '바꾼 뒤 전투 시작');
  const S = sb.BSIM.create(P.battleInput());
  for (let i = 0; i < 6000 && !S.done; i++) sb.BSIM.step(S, 0.1);
  const rep = P.applyBattle(sb.BSIM.result(S));
  // 흐름 시험(BATTLE_DATA.FLOW.on, prototype/d1_demo/API.md 15절)이면 주가 안 늘고 일반 1판이 끝남
  const flowOn = !!(BD.FLOW && BD.FLOW.on);
  ok(S.done && rep && (flowOn ? rep.mode === 'normal' && R.flow.no === 1 && R.week === old.week : R.week === old.week + 1), flowOn ? '바꾼 뒤 일반 1판 진행' : '바꾼 뒤 한 주 진행');
  fixes.push('의뢰 ' + q.key + ' 새 판으로 처음부터');
} else {
  ok(!R.quest, '진행 중 의뢰 없음');
  if (R.phase === 'settle') { ok(P.demoState().canLeave && P.leaveSettle().ok && R.phase === 'demoEnd', '정산 -> 데모 끝 (q2 숨김)'); fixes.push('정산 유지 -> 데모 끝'); }
  if (EXP.phase === 'demoEnd') { ok(!P.startBattle().ok && P.offerQuests().length === 0, '데모 끝: 다음 주·의뢰 없음'); fixes.push('숨긴 의뢰 ' + old.quest.key + ' -> 데모 끝'); }
}
// 한 번 더 불러와도 같은 v7
const keep = store[KEY];
P.load();
ok(P.RUN.v === 7 && P.RUN.gold === JSON.parse(keep).gold, 'v7로 다시 불러오기');
console.log(JSON.stringify({ problems, fixes }));
"""


def d1_oldsaves():
    """D1 옛 저장(v6) 바꾸기 검사. 돌려주는 값 (문제 목록, 결과 줄 목록)"""
    problems, lines = [], []
    files = sorted(f for f in os.listdir(D1_DIR) if f.endswith(".json")) if os.path.isdir(D1_DIR) else []
    if not files:
        return ["tools/oldsaves/d1/에 D1 옛 저장이 하나도 없음"], lines
    node = shutil.which("node")
    if not node:
        return [], ["  D1 옛 저장 %d개: node 없음, 건너뜀" % len(files)]
    tmp = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8")
    try:
        tmp.write(D1_JS)
        tmp.close()
        for name in files:
            exp = D1_EXPECT.get(name)
            if not exp:
                problems.append("d1/%s: 기대값(D1_EXPECT)이 없음" % name)
                continue
            proc = subprocess.run([node, tmp.name, os.path.join(tc.ROOT, "prototype", "d1_demo"), os.path.join(D1_DIR, name), json.dumps(exp)],
                                  capture_output=True)
            out = proc.stdout.decode("utf-8", "replace").strip()
            if proc.returncode != 0 or not out:
                problems.append("d1/%s: node 오류 %s" % (name, proc.stderr.decode("utf-8", "replace").strip()[-400:]))
                continue
            r = json.loads(out.splitlines()[-1])
            problems += ["d1/%s: %s" % (name, p) for p in r["problems"]]
            lines.append("  d1/%s: v6 -> v7 (%s)" % (name, "; ".join(r["fixes"]) or "회사 기록만"))
    finally:
        os.unlink(tmp.name)
    return problems, lines


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
    d1p, d1l = d1_oldsaves()
    problems += d1p
    lines += d1l
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
