"""대사 파일 검사: D1 데모 prototype/d1_demo/lines.js (기본) 또는 옛 C1 prototype/c1_shell/lines.js (--c1) 가 열리는지, 튜토리얼 단계마다 대사가 있는지, 줄마다 말한 사람과 글이 있는지, 홈 잡담 이름이 맞는지를 확인한다.

D1은 더해서: 화면 코드(shell.js·build.js·battle.js)가 부르는 튜토리얼 id 와 아래 목록이 같은지, 직급 칭호(ranks)·준비 중(soon)·열림 조건(lock) 글이 비지 않았는지.
틀린 곳은 "몇 번째 줄 / 어떤 id" 로 쉬운 한국어로 알려 준다. 백틱(`)·${ 를 글 안에 써서 파일이 깨지면 그 줄 근처를 알려 준다. node가 없으면 건너뛴다(통과).
사용: python tools/test_lines.py [--c1]
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

import tool_common as tc

# 대상별: 대사 파일 폴더 · 튜토리얼 단계 id · 그 id 를 부르는 화면 코드 · 더 볼 것(칭호·준비 중·열림 조건)
TARGETS = {
    "d1": {
        "dir": "prototype/d1_demo",
        "steps": ["welcome", "tofield", "build", "zones", "place", "tohome", "nextweek", "battle", "card", "result", "complete", "deliver"],
        "code": ["shell.js", "build.js", "battle.js"],
        "extra": True,
    },
    "c1": {
        "dir": "prototype/c1_shell",
        "steps": ["welcome", "build", "zones", "nextweek", "battle", "card", "result", "deliver"],
        "code": [],
        "extra": False,
    },
}
TARGET = TARGETS["d1"]   # 지금 검사하는 대상 (main 에서 정함)
LONG_TEXT = 120  # 이보다 길면 말풍선이 길어진다는 안내만 함 (실패는 아님)

JS = r"""
const fs = require('fs'), vm = require('vm'), path = require('path');
const file = process.argv[2];
const out = { loadError: null, tutorial: null, home: null };
const sb = { console };
sb.window = sb;
vm.createContext(sb);
try {
  vm.runInContext(fs.readFileSync(file, 'utf8'), sb, { filename: 'lines.js' });
} catch (e) {
  const m = /lines\.js:(\d+)/.exec(String(e.stack || ''));
  out.loadError = { name: e.name || 'Error', message: String(e.message || e), line: m ? Number(m[1]) : null };
}
if (!out.loadError) {
  const L = sb.window.LINES;
  if (L && typeof L === 'object') {
    out.hasLines = true;
    if (Array.isArray(L.tutorial)) {
      out.tutorial = L.tutorial.map(l => (l && typeof l === 'object')
        ? { id: l.id, who: l.who, text: l.text, idType: typeof l.id, whoType: typeof l.who, textType: typeof l.text } : null);
    }
    if (L.home && typeof L.home === 'object' && !Array.isArray(L.home)) {
      out.home = {};
      Object.keys(L.home).forEach(k => { out.home[k] = Array.isArray(L.home[k]) ? L.home[k].map(t => (typeof t === 'string' ? t : null)) : null; });
    }
    out.ranks = Array.isArray(L.ranks) ? L.ranks.map(r => (r && typeof r === 'object')
      ? { title: typeof r.title === 'string' ? r.title : null, desc: typeof r.desc === 'string' ? r.desc : null } : null) : null;
    ['soon', 'lock'].forEach(g => {
      if (L[g] && typeof L[g] === 'object' && !Array.isArray(L[g])) { out[g] = {}; Object.keys(L[g]).forEach(k => { out[g][k] = typeof L[g][k] === 'string' ? L[g][k] : null; }); }
      else out[g] = null;
    });
  }
}
console.log(JSON.stringify(out));
"""


def actor_names():
    """stage.js 의 캐릭터 이름들 (홈 잡담 이름이 맞는지 보려고)."""
    src = tc.read(TARGET["dir"] + "/stage.js")
    block = src.split("var ACTORS = [", 1)[-1].split("];", 1)[0]
    return re.findall(r"name:\s*'([^']+)'", block)


def code_step_ids():
    """화면 코드가 부르는 튜토리얼 id 들 (tutStart('id') · tutActive('id') · tutDone('id'))."""
    found = set()
    for f in TARGET["code"]:
        found.update(re.findall(r"\btut(?:Start|Active|Done)\(\s*'([a-z]+)'", tc.read(TARGET["dir"] + "/" + f)))
    return found


def check_extra(r):
    """D1: 코드가 부르는 튜토리얼 id = 목록, 직급 칭호·준비 중·열림 조건 글."""
    steps = TARGET["steps"]
    p = []
    used = code_step_ids()
    for sid in sorted(used - set(steps)):
        p.append("화면 코드가 튜토리얼 id '%s' 를 부르는데 검사 목록(tools/test_lines.py TARGETS)에 없어요. 새 단계면 목록에 더하세요." % sid)
    for sid in [x for x in steps if x not in used]:
        p.append("튜토리얼 id '%s' 를 부르는 화면 코드가 없어요 (검사 목록에서 빼거나 코드를 확인하세요)." % sid)
    ranks = r.get("ranks")
    if ranks is None:
        p.append("LINES 안에 ranks: [ ... ] (직급 칭호) 목록이 없어요.")
    else:
        for i, x in enumerate(ranks, 1):
            if x is None or not (x["title"] or "").strip() or not (x["desc"] or "").strip():
                p.append("ranks 의 %d번째 칭호: { title: `칭호`, desc: `설명` } 모양이 아니거나 글이 비어 있어요." % i)
    for g, what in (("soon", "준비 중 문구"), ("lock", "열림 조건")):
        d = r.get(g)
        if d is None:
            p.append("LINES 안에 %s: { ... } (%s) 가 없어요." % (g, what))
            continue
        for k, v in d.items():
            if v is None or not v.strip():
                p.append("%s 의 '%s' (%s) 글이 비어 있거나 글이 아니에요." % (g, k, what))
    return p


def check(r):
    steps = TARGET["steps"]
    p = []
    if r.get("loadError"):
        e = r["loadError"]
        where = "%d번째 줄 근처" % e["line"] if e["line"] else "어느 줄인지는 모르겠지만"
        p.append("lines.js 를 읽다가 멈췄어요 (%s): %s - %s" % (where, e["name"], e["message"]))
        p.append("  힌트: 글 안에 백틱(`)이나 ${ 를 썼거나, 대사 끝의 백틱·쉼표를 지우지 않았는지 보세요. 직전에 고친 곳이 범인이에요.")
        return p
    if not r.get("hasLines"):
        return ["lines.js 안에 window.LINES = { ... } 가 없어요. 파일 맨 위쪽의 window.LINES 줄을 지우지 마세요."]
    tut = r.get("tutorial")
    if tut is None:
        p.append("LINES 안에 tutorial: [ ... ] 목록이 없어요.")
        tut = []
    count = {}
    for i, l in enumerate(tut, 1):
        label = "tutorial 목록의 %d번째 줄" % i
        if l is None:
            p.append("%s: { id: ..., who: ..., text: ... } 모양이 아니에요." % label)
            continue
        if l["idType"] != "string" or not l["id"].strip():
            p.append("%s: id 가 없어요 (예: id: 'welcome')." % label)
            continue
        label += " (id: %s)" % l["id"]
        if l["id"] not in steps:
            p.append("%s: '%s' 라는 id 는 쓰이지 않아요. 글자가 틀렸는지 보세요. 쓸 수 있는 id: %s" % (label, l["id"], ", ".join(steps)))
        if l["whoType"] != "string" or not l["who"].strip():
            p.append("%s: who(말하는 사람)가 비어 있어요. 예: who: '은발 마왕'" % label)
        if l["textType"] != "string" or not l["text"].strip():
            p.append("%s: text(대사)가 비어 있어요. 백틱(`) 사이에 글을 쓰세요." % label)
        else:
            count[l["id"]] = count.get(l["id"], 0) + 1
            if "${" in l["text"]:
                p.append("%s: 글 안에 ${ 가 있어요. 대사가 이상하게 나올 수 있으니 지워 주세요." % label)
            if len(l["text"]) > LONG_TEXT:
                print("  알림: %s 는 %d자라서 말풍선이 길어요 (%d자 안쪽을 추천)" % (label, len(l["text"]), LONG_TEXT))
    for sid in steps:
        if not count.get(sid):
            p.append("튜토리얼 id '%s' 의 대사가 하나도 없어요. 다른 줄을 복사해서 id 를 '%s' 로 하고 글을 쓰세요." % (sid, sid))
    home = r.get("home")
    if home is None:
        p.append("LINES 안에 home: { ... } 가 없어요.")
    else:
        names = actor_names()
        for name, arr in home.items():
            if name not in names:
                p.append("home 의 이름 '%s' 은(는) 홈에 없는 캐릭터예요. 이름을 바꾸지 마세요. 있는 이름: %s" % (name, ", ".join(names)))
            elif arr is None:
                p.append("home 의 '%s': [ `대사`, `대사` ] 모양이 아니에요." % name)
            else:
                for j, t in enumerate(arr, 1):
                    if t is None or not t.strip():
                        p.append("home 의 '%s' %d번째 대사가 비어 있거나 글이 아니에요." % (name, j))
        if TARGET["extra"]:
            for name in names:
                if name not in home:
                    p.append("홈 캐릭터 '%s' 의 잡담(home)이 없어요. 다른 이름 줄을 복사해서 이름을 '%s' 로 하세요." % (name, name))
    if TARGET["extra"]:
        p += check_extra(r)
    return p


def main():
    global TARGET
    tc.setup_output()
    key = "c1" if "--c1" in sys.argv else "d1"
    TARGET = TARGETS[key]
    tag = "[test_lines %s]" % key.upper()
    rel = TARGET["dir"] + "/lines.js"
    node = shutil.which("node")
    if not node:
        print(tag + " node 없음: 건너뜀")
        return 0
    path = os.path.join(tc.ROOT, rel)
    if not os.path.exists(path):
        print("%s 실패: %s 파일이 없어요" % (tag, rel))
        return 1
    tmp = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8")
    try:
        tmp.write(JS)
        tmp.close()
        proc = subprocess.run([node, tmp.name, path], capture_output=True)
    finally:
        os.unlink(tmp.name)
    out = proc.stdout.decode("utf-8", "replace").strip()
    if proc.returncode != 0 or not out:
        print(tag + " 실패: node 오류\n" + proc.stderr.decode("utf-8", "replace").strip())
        return 1
    r = json.loads(out.splitlines()[-1])
    problems = check(r)
    if problems:
        print("%s 실패 %d건 (%s 를 고쳐 주세요)" % (tag, len(problems), rel))
        for m in problems:
            print("  - " + m)
        return 1
    extra = ""
    if TARGET["extra"]:
        extra = " · 칭호 %d개 · 준비 중 %d개 · 열림 조건 %d개" % (len(r["ranks"]), len(r["soon"]), len(r["lock"]))
    print("%s 통과 (%s): 튜토리얼 단계 %d개 · 대사 %d줄 · 홈 잡담 %d명%s"
          % (tag, rel, len(TARGET["steps"]), len(r["tutorial"]), len(r["home"]), extra))
    return 0


if __name__ == "__main__":
    sys.exit(main())
