"""C1 시안 핵심 규칙 검사: 납품 -> 새 의뢰 후보 -> pickQuest(친위대) -> 레벨 초기화·공사비 첫 건설·약탈 한도·저장.

화면 없이 prototype/c1_shell의 battle_data.js·zones.js·progress.js·battle_sim.js를 node로 직접 불러 확인한다.
node가 없으면 건너뛴다(통과). 사용: python tools/test_c1_core.py
"""
import os
import shutil
import subprocess
import sys
import tempfile

import tool_common as tc

JS = r"""
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = process.argv[2];
const store = {};
const problems = [];
function ok(c, msg) { if (!c) problems.push(msg); }
function boot() {
  const sb = { console, Math, JSON, Date, Object, Array, String, Number };
  sb.window = sb;
  sb.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  vm.createContext(sb);
  ['battle_data.js', 'zones.js', 'progress.js', 'battle_sim.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sb, { filename: f }));
  return sb;
}
let W = boot(), P = W.PROGRESS, R = P.RUN;
P.reset();
// 첫 시작: 후보 모양·첫 의뢰인
let offers = P.offerQuests();
ok(offers.length >= 2, '첫 후보가 2장 이상');
offers.forEach(q => {
  ok(q.client && q.client.name === '은발 마왕' && q.client.kind === '마왕', '첫 의뢰인은 은발 마왕: ' + JSON.stringify(q.client));
  ok(q.attr && ['phys', 'magic', 'ether'].includes(q.attr.id) && q.attr.label && q.attr.effect && q.attr.counter, '속성 모양: ' + JSON.stringify(q.attr));
  ok(q.reward && typeof q.reward.gems === 'number' && q.reward.gems > 0 && typeof q.reward.gold === 'number' && typeof q.reward.fame === 'number', '보상 모양');
});
ok(P.pickQuest(offers[0]) === true && R.phase === 'play', 'choose에서 pickQuest');
ok(R.plan && R.plan.attr === R.quest.attr.id, '계획에 속성 반영');
// 첫 건설 공사비
ok(P.grantLeft() === P.SITE_GRANT && P.grantLeft() > 0, '새 부지 공사비 ' + P.grantLeft());
ok(P.startBattle().ok === false, '안 지으면 다음 주 막힘');
let gold0 = R.gold, pv = P.previewBuild('CB', 'trap');
ok(pv.ok && pv.fromGrant === pv.cost && pv.fromGold === 0, '공사비로 다 냄: ' + JSON.stringify([pv.cost, pv.fromGrant, pv.fromGold]));
ok(P.buildZone('CB', 'trap').ok && R.gold === gold0 && R.site.builds === 1 && P.grantLeft() === P.SITE_GRANT - pv.cost, '공사비 건설: 금 그대로, 횟수 1');
let pv2 = P.previewBuild('CC', 'trap');
ok(pv2.fromGrant === Math.min(P.grantLeft(), pv2.cost) && pv2.fromGold === pv2.cost - pv2.fromGrant, '공사비 + 금 나눔');
P.buildZone('CC', 'trap'); P.buildZone('CD', 'trap'); P.buildZone('LB', 'den');
ok(P.grantLeft() === 0 && R.gold < gold0, '공사비 다 쓰면 금');
// 전투 한 판 (속성 fx 포함)
let st = P.startBattle(); ok(st.ok, '전투 시작');
let S = W.BSIM.create({ plan: R.plan, zones: R.site.zones, units: R.site.units, monById: P.monById });
let a = W.BSIM.attrById(R.plan.attr);
const cfx = W.BSIM.cardById(R.plan.card).fx;
Object.keys(a.fx).forEach(k => ok(Math.abs(S.fx[k] - Math.min(k === 'trap' ? 0.95 : 9, a.fx[k] + (cfx[k] || 0))) < 1e-9, '속성 fx 들어감 ' + k));
for (let i = 0; i < 2000 && !S.done; i++) { W.BSIM.step(S, 0.1); if (i === 50) { const S2 = W.BSIM.restore({ plan: R.plan, zones: R.site.zones, units: R.site.units, monById: P.monById }, W.BSIM.snapshot(S)); ok(S2 && JSON.stringify(S2.fx) === JSON.stringify(S.fx), '복원해도 fx 같음'); } }
ok(S.done, '전투 끝남');
let res = W.BSIM.result(S);
// 약탈 한도: 이번 전투 금 안에서만 (약탈 요청을 크게 부풀려 확인)
res.loot = 99999; res.damage = 0;
let gBefore = R.gold, rep = P.applyBattle(res);
ok(rep.loot === rep.gold && R.gold === gBefore, '약탈 한도 = 이번 전투 금: loot ' + rep.loot + ' gold ' + rep.gold + ' ' + gBefore + '->' + R.gold);
// 납품: 목표 채우고 레벨 올려 두기
R.quest.goals.forEach(g => { R.quest.prog[g.type] = g.target; });
R.monsters[0].lv = 12; R.monsters[0].hp = 999; R.monsters[0].exp = 3;
R.monsters[1].lv = 11; R.monsters[1].hp = 888; R.monsters[1].exp = 5;
R.monsters[2].lv = 10;
let gems0 = R.gems, grantLeftBefore = P.grantLeft();
let d = P.deliver();
ok(d && R.phase === 'settle', '납품 -> settle');
ok(typeof d.gems === 'number' && d.gems > 0, 'rep.gems');
ok(R.gems === gems0 + d.gems, '보석 지급');
ok(Array.isArray(d.carry) && d.carry.length && d.carry.every(s => typeof s === 'string'), 'carry 문자열 배열');
ok(Array.isArray(d.lost) && d.lost.length && d.lost.every(s => typeof s === 'string'), 'lost 문자열 배열');
let off2 = P.offerQuests();
ok(R.offers && R.offers.length >= 2 && off2 === R.offers, '납품하면 후보가 바로 있음');
ok(P.toContract() === true && R.phase === 'settle', 'toContract는 무해');
// 저장·불러오기 (settle 상태)
W = boot(); P = W.PROGRESS; ok(P.load() === true, 'settle 저장 불러오기'); R = P.RUN;
off2 = P.offerQuests();
let q2 = off2[off2.length - 1];
ok(P.pickQuest(q2, [0, 2, 0, 99]) === true, 'settle에서 pickQuest');
ok(JSON.stringify(R.guards) === '[0,2]', '친위대 정리(중복·없는 id 빼고) ' + JSON.stringify(R.guards));
ok(R.monsters[0].lv === 12 && R.monsters[0].hp === 999 && R.monsters[0].exp === 3, '친위대 레벨 유지');
ok(R.monsters[2].lv === 10, '친위대 2 레벨 유지');
const b1 = R.monsters[1].base;
ok(R.monsters[1].lv === b1.lv && R.monsters[1].hp === b1.hp && R.monsters[1].exp === 0, '친위대 아닌 몬스터 초기화');
ok(R.report === null && R.offers === null && R.phase === 'play' && R.quest.id === q2.id, '정리');
ok(P.grantLeft() === P.SITE_GRANT && R.site.builds === 0, '새 부지 새 공사비 (전 부지 남은 ' + grantLeftBefore + ' 버림)');
ok(R.plan.attr === q2.attr.id, '새 부지 계획 속성');
// 옛 저장(v4)은 버림
store['dunguen_c1_run'] = JSON.stringify(Object.assign({}, JSON.parse(store['dunguen_c1_run']), { v: 4 }));
W = boot(); ok(W.PROGRESS.load() === false, '옛 저장 버림');
console.log(JSON.stringify({ problems, sample: { carry: d.carry, lost: d.lost, gems: d.gems, client: q2.client, attr: q2.attr } }));
"""


def main():
    tc.setup_output()
    node = shutil.which("node")
    if not node:
        print("[test_c1_core] node 없음: 건너뜀")
        return 0
    tmp = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8")
    try:
        tmp.write(JS)
        tmp.close()
        proc = subprocess.run([node, tmp.name, os.path.join(tc.ROOT, "prototype", "c1_shell")], capture_output=True)
    finally:
        os.unlink(tmp.name)
    out = proc.stdout.decode("utf-8", "replace").strip()
    err = proc.stderr.decode("utf-8", "replace").strip()
    if proc.returncode != 0 or not out:
        print("[test_c1_core] 실패: node 오류\n" + err)
        return 1
    import json
    r = json.loads(out.splitlines()[-1])
    if r["problems"]:
        print("[test_c1_core] 실패 %d건" % len(r["problems"]))
        for p in r["problems"]:
            print("  - " + p)
        return 1
    print("[test_c1_core] 통과: 납품 -> 후보 -> 친위대 인계 -> 공사비 첫 건설 -> 약탈 한도 -> 저장")
    print("  " + json.dumps(r["sample"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
