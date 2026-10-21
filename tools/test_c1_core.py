"""C1 시안 핵심 규칙 검사: 납품 -> 새 의뢰 후보 -> pickQuest(친위대) -> 레벨 초기화·공사비 첫 건설·약탈 한도·저장·공방·부족 강화.
공방 = 건설 할인·연구실 함정 피해·제작 공방 거부, 몬스터 부족 보석 강화 = 인계 뒤에도 남음.
일일·주간 퀘스트 = 날·주 바뀜 초기화·진행 훅·받기, 방치 보상 = 10분 미만 없음·시간 비례·8시간 상한·공방 단계 반영 (시계는 가짜 Date.now·setClock).

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
let FAKE_NOW = null;   // 숫자면 progress.js가 부팅(load) 때 읽는 Date.now()를 이 값으로
class FakeDate extends Date { static now() { return FAKE_NOW !== null ? FAKE_NOW : super.now(); } }
function boot() {
  const sb = { console, Math, JSON, Date: FakeDate, Object, Array, String, Number };
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
// 같은 이름 의뢰 방지: 방금 끝낸 의뢰 이름이 후보에 없다 (여러 번 반복)
for (let t = 0; t < 30; t++) {
  const WW = boot(), PP = WW.PROGRESS, RR = PP.RUN; PP.reset();
  PP.pickQuest(PP.offerQuests()[0]);
  RR.quest.goals.forEach(g => { RR.quest.prog[g.type] = g.target; });
  const nm = RR.quest.name; PP.deliver();
  ok(RR.offers.every(o => o.name !== nm), '후보에 방금 끝낸 의뢰 이름 없음: ' + nm + ' / ' + RR.offers.map(o => o.name).join(','));
}
// 배속·카드 수 기억: 전투가 끝나도 남고, v5 저장(prefs 없음)은 기본값으로 채움
ok(R.prefs && R.prefs.speedIdx === 0 && R.prefs.cards === 1, '기본 설정 1배속·카드 1장: ' + JSON.stringify(R.prefs));
P.buildZone('CB', 'trap'); P.buildZone('CC', 'trap'); P.buildZone('CD', 'trap'); P.buildZone('LB', 'den');
R.gold = 99999; P.buildZone('CE', 'trap');
ok(P.startBattle().ok, '전투 시작 2');
P.setBattleSpeed(2, true); P.setCardCount(3);
ok(R.prefs.speedIdx === 2 && R.prefs.cards === 3 && R.bsave.fastUsed === true, '배속·카드 수 저장');
P.setCardCount(99); ok(R.prefs.cards === 4, '카드 수 상한 4');
P.setCardCount(2);
W = boot(); P = W.PROGRESS; ok(P.load() === true && P.RUN.prefs.speedIdx === 2 && P.RUN.prefs.cards === 2 && P.RUN.bsave.fastUsed === true, '새로고침 뒤에도 배속·카드 수·fastUsed');
R = P.RUN;
S = W.BSIM.create({ plan: R.plan, zones: R.site.zones, units: R.site.units, monById: P.monById });
for (let i = 0; i < 3000 && !S.done; i++) W.BSIM.step(S, 0.1);
P.applyBattle(W.BSIM.result(S));
ok(R.battling === false && R.prefs.speedIdx === 2 && R.prefs.cards === 2, '전투가 끝나도 설정 유지');
ok(P.startBattle().ok && R.bsave && R.bsave.fastUsed === false && R.prefs.speedIdx === 2, '다음 전투도 같은 배속에서 시작');
// 저장에서 prefs만 지워도(v5) 불러와짐
{ const sv = JSON.parse(store['dunguen_c1_run']); delete sv.prefs; store['dunguen_c1_run'] = JSON.stringify(sv); }
W = boot(); ok(W.PROGRESS.load() === true && W.PROGRESS.RUN.prefs.speedIdx === 0 && W.PROGRESS.RUN.prefs.cards === 1, 'prefs 없는 v5 저장은 기본값');
// 옛 저장(v4)은 버림
store['dunguen_c1_run'] = JSON.stringify(Object.assign({}, JSON.parse(store['dunguen_c1_run']), { v: 4 }));
W = boot(); ok(W.PROGRESS.load() === false, '옛 저장 버림');
// ---------- 공방·몬스터 부족 보석 강화 ----------
let wsSample = null;
{
  const WW = boot(), PP = WW.PROGRESS, RR = PP.RUN, Z = WW.ZONES; PP.reset();
  ok(JSON.stringify(RR.workshop) === '{"build":0,"lab":0,"craft":0}' && RR.tribes && !Object.keys(RR.tribes).length, '공방·부족 기본값');
  ok(PP.WORKSHOPS.length === 3 && PP.WORKSHOPS.every(w => w.id && w.name && w.desc && typeof w.ready === 'boolean' && w.maxLv > 0), 'WORKSHOPS 모양');
  ok(PP.WORKSHOPS.filter(w => w.id === 'craft')[0].ready === false, '제작 공방 준비 중');
  PP.pickQuest(PP.offerQuests()[0]);
  const pv0 = PP.previewBuild('CB', 'trap');
  ok(pv0.discount === 0 && pv0.baseCost === pv0.cost, '공방 0단계면 할인 없음');
  // 보석 부족·제작 공방 거부
  RR.gems = 2;
  ok(!PP.upgradeWorkshop('build').ok && RR.gems === 2 && RR.workshop.build === 0, '보석 모자라면 거부');
  ok(PP.workshopInfo('build').canAfford === false, 'canAfford false');
  RR.gems = 100;
  let r = PP.upgradeWorkshop('craft');
  ok(!r.ok && r.msg && RR.gems === 100 && RR.workshop.craft === 0, '제작 공방 거부');
  const ci = PP.workshopInfo('craft');
  ok(ci.ready === false && ci.cost === null && ci.next === null && ci.canAfford === false && ci.effect, '제작 공방 정보');
  const wi = PP.workshopInfo('build');
  ok(wi.lv === 0 && wi.maxLv === 3 && wi.cost.gems === 3 && wi.canAfford && wi.effect && wi.next, '건설 공방 정보: ' + JSON.stringify(wi));
  let spent = 0;
  for (let i = 0; i < 3; i++) { const c = PP.workshopInfo('build').cost.gems; spent += c; ok(PP.upgradeWorkshop('build').ok, '건설 공방 강화 ' + (i + 1)); }
  ok(RR.workshop.build === 3 && RR.gems === 100 - spent, '보석 차감 ' + spent);
  r = PP.upgradeWorkshop('build');
  ok(!r.ok && RR.gems === 100 - spent && RR.workshop.build === 3, '최대 단계 거부');
  ok(PP.workshopInfo('build').cost === null && PP.workshopInfo('build').next === null, '최대면 cost·next null');
  // 할인이 실제 건설비에 (공사비만으로)
  const pvA = PP.previewBuild('CB', 'trap'), disc = Math.round(pv0.baseCost * 0.3);
  ok(pvA.baseCost === pv0.baseCost && pvA.discount === disc && pvA.cost === pv0.baseCost - disc && pvA.fromGrant === pvA.cost, '할인 미리보기: ' + JSON.stringify([pvA.baseCost, pvA.discount, pvA.cost]));
  ok(PP.buildCost('trap', 'CB') === pvA.cost, 'buildCost = 할인된 비용');
  let gr = PP.grantLeft(), gd = RR.gold;
  ok(PP.buildZone('CB', 'trap').ok && PP.grantLeft() === gr - pvA.cost && RR.gold === gd, '할인된 비용을 공사비에서');
  // 공사비 + 금 나눠 내기
  RR.site.grant = 5;
  const pvB = PP.previewBuild('CC', 'trap');
  ok(pvB.fromGrant === 5 && pvB.fromGold === pvB.cost - 5 && pvB.cost < pvB.baseCost, '할인 비용을 공사비·금으로 나눔');
  gd = RR.gold;
  ok(PP.buildZone('CC', 'trap').ok && RR.gold === gd - pvB.fromGold && PP.grantLeft() === 0, '금도 할인된 만큼만');
  // 연구실: 함정 피해
  const g0 = RR.gems;
  ok(PP.upgradeWorkshop('lab').ok && PP.upgradeWorkshop('lab').ok && RR.workshop.lab === 2, '연구실 2단계');
  ok(RR.gems === g0 - 3 - 6, '연구실 보석 차감');
  ok(RR.plan.trapBoost === 0.3, '계획에 함정 피해 +30%: ' + RR.plan.trapBoost);
  // 부족 강화
  const slimes = RR.monsters.filter(m => m.name === '슬라임'), sl = slimes[0];
  const ti = PP.tribeInfo('슬라임');
  ok(ti && ti.lv === 0 && ti.cost.gems === 3 && ti.canAfford && ti.effect && ti.next, '부족 정보: ' + JSON.stringify(ti));
  ok(PP.tribeInfo('없는몬스터') === null && !PP.upgradeTribe('없는몬스터').ok, '없는 부족');
  const hp0 = sl.hp, atk0 = sl.atk, bhp0 = sl.base.hp, batk0 = sl.base.atk, gT = RR.gems;
  ok(PP.upgradeTribe('슬라임').ok && PP.upgradeTribe('슬라임').ok, '부족 강화 2번');
  ok(RR.tribes['슬라임'] === 2 && RR.gems === gT - 3 - 6, '부족 강화 보석 차감');
  ok(sl.base.hp === bhp0 + 24 && sl.base.atk === batk0 + 2 && sl.hp === hp0 + 24 && sl.atk === atk0 + 2, '부족 강화 능력치: ' + JSON.stringify([sl.base, sl.hp, sl.atk]));
  ok(RR.monsters.filter(m => m.name === '고블린').every(m => m.base.hp === 90), '다른 부족은 그대로');
  // 전투: 함정 피해에 반영, 전투 중 강화 막힘
  PP.buildZone('LB', 'den'); PP.placeMonster('LB', sl.id);
  ok(PP.startBattle().ok, '공방 전투 시작');
  ok(!PP.upgradeTribe('슬라임').ok && !PP.upgradeWorkshop('lab').ok && RR.tribes['슬라임'] === 2, '전투 중 강화 막힘');
  const o = { plan: RR.plan, zones: RR.site.zones, units: RR.site.units, monById: PP.monById };
  let SS = WW.BSIM.create(o), trapEv = null, restoredOk = true;
  ok(SS.dens.LB && SS.dens.LB[0].hp === sl.hp && SS.dens.LB[0].atk === sl.atk, '전투에 강화된 능력치');
  for (let i = 0; i < 2000 && !SS.done; i++) {
    const ev = WW.BSIM.step(SS, 0.1);
    ev.forEach(e => { if (e.type === 'trap' && !trapEv) trapEv = e; });
    if (i === 30) { const S2 = WW.BSIM.restore(o, WW.BSIM.snapshot(SS)); restoredOk = S2 && S2.plan.trapBoost === 0.3; }
  }
  ok(trapEv && trapEv.dmg === Math.round(Z.trapDmgOf(trapEv.z) * 1.3), '함정 피해 ×1.3: ' + JSON.stringify(trapEv));
  ok(restoredOk, '복원해도 함정 피해 증가 같음');
  PP.applyBattle(WW.BSIM.result(SS));
  // 레벨업분 넣고 납품 -> 친위대 없이 인계: 강화는 남고 레벨업분만 사라짐
  sl.lv = 9; sl.hp += 500; sl.atk += 7; sl.exp = 4;
  RR.quest.goals.forEach(g => { RR.quest.prog[g.type] = g.target; });
  const dd = PP.deliver();
  ok(dd.carry.some(s => s.indexOf('공방 단계') >= 0 && s.indexOf('건설 공방 3단계') >= 0 && s.indexOf('연구실 2단계') >= 0), 'carry 공방: ' + JSON.stringify(dd.carry));
  ok(dd.carry.some(s => s.indexOf('몬스터 보석 강화') >= 0 && s.indexOf('슬라임 +2') >= 0), 'carry 부족 강화');
  wsSample = dd.carry;
  // 저장에서 불러와 인계
  const W2 = boot(), P2 = W2.PROGRESS; ok(P2.load() === true, '공방 저장 불러오기');
  const R2 = P2.RUN;
  ok(R2.workshop.build === 3 && R2.workshop.lab === 2 && R2.tribes['슬라임'] === 2, '저장에 공방·부족');
  ok(P2.pickQuest(P2.offerQuests()[0], []) === true, '인계 pickQuest');
  const s2 = R2.monsters.filter(m => m.name === '슬라임')[0];
  ok(s2.lv === 4 && s2.exp === 0 && s2.hp === 120 + 24 && s2.atk === 8 + 2 && s2.base.hp === 144, '인계 뒤 레벨업분만 사라지고 강화 남음: ' + JSON.stringify([s2.lv, s2.hp, s2.atk]));
  ok(R2.workshop.build === 3 && R2.tribes['슬라임'] === 2 && R2.plan.trapBoost === 0.3, '새 부지에서도 공방·부족 강화 남음');
  ok(P2.previewBuild('CB', 'trap').discount > 0, '새 부지에서도 할인');
  // workshop·tribes 없는 v5 저장 복원
  const sv = JSON.parse(store['dunguen_c1_run']); delete sv.workshop; delete sv.tribes; store['dunguen_c1_run'] = JSON.stringify(sv);
  const W3 = boot(), P3 = W3.PROGRESS;
  ok(P3.load() === true && JSON.stringify(P3.RUN.workshop) === '{"build":0,"lab":0,"craft":0}' && JSON.stringify(P3.RUN.tribes) === '{}', 'workshop·tribes 없는 v5 저장은 기본값');
  ok(P3.RUN.plan && P3.RUN.plan.trapBoost === 0 && P3.workshopInfo('lab').lv === 0, '기본값이면 함정 증가 0');
}
// ---------- 일일·주간 퀘스트 ----------
let choreSample = null, idleSample = null;
{
  const T0 = new Date(2026, 9, 21, 23, 50).getTime();   // 수요일 23:50 (지역 시간)
  FAKE_NOW = T0;
  const WW = boot(), PP = WW.PROGRESS, RR = PP.RUN; PP.reset();
  let T = T0; PP.setClock(() => T);
  let c = PP.chores();
  ok(c.daily.key === '2026-10-21' && c.weekly.key === '2026-10-19', '키: ' + c.daily.key + ' / ' + c.weekly.key);
  ok(c.daily.resetIn === 10 * 60000, '일일 resetIn 10분: ' + c.daily.resetIn);
  ok(c.weekly.resetIn === (4 * 24 * 60 + 10) * 60000, '주간 resetIn: ' + c.weekly.resetIn);
  ok(c.daily.tasks.length === 3 && c.weekly.tasks.length === 3 && c.daily.tasks.concat(c.weekly.tasks).every(t =>
    typeof t.id === 'string' && t.label && t.need > 0 && t.prog === 0 && t.reward && t.reward.gems > 0 && t.done === false && t.claimed === false), '퀘스트 모양');
  ok(PP.choresClaimable() === 0, '처음엔 받을 것 0');
  const prog = (sc, id) => PP.chores()[sc].tasks.filter(t => t.id === id)[0];
  // 못 채운 것 받기 거부
  let r = PP.claimChore('daily', 'd_build');
  ok(!r.ok && r.gems === 0 && r.msg, '못 채움 거부');
  ok(!PP.claimChore('monthly', 'd_build').ok && !PP.claimChore('daily', 'nope').ok, '없는 범위·id 거부');
  // 건설 훅: 공사비만 쓴 건설도 셈, 같은 시설로 다시는 안 됨
  PP.pickQuest(PP.offerQuests()[0]);
  ok(PP.buildZone('CB', 'trap').ok && PP.buildZone('CC', 'trap').ok && PP.buildZone('CD', 'trap').ok, '건설 3번');
  ok(prog('daily', 'd_build').prog === 2 && prog('daily', 'd_build').done, '건설 진행 2/2 (상한)');
  ok(!PP.buildZone('CB', 'trap').ok && prog('daily', 'd_build').prog === 2, '실패한 건설은 안 셈');
  // 강화 훅: 공방
  RR.gems = 50;
  ok(PP.upgradeWorkshop('build').ok && prog('daily', 'd_upgrade').prog === 1, '공방 강화 진행');
  ok(!PP.upgradeWorkshop('craft').ok, '제작 공방 실패');
  // 받기 + 두 번 받기 거부, 보석은 RUN.gems에만
  const qg = RR.quest.prog.gems, g0 = RR.gems;
  r = PP.claimChore('daily', 'd_build');
  ok(r.ok && r.gems === 2 && RR.gems === g0 + 2, '받기: ' + JSON.stringify(r));
  ok(RR.quest.prog.gems === qg, '퀘스트 보석은 의뢰 목표에 안 섞임');
  ok(!PP.claimChore('daily', 'd_build').ok && RR.gems === g0 + 2, '두 번 받기 거부');
  ok(prog('daily', 'd_build').claimed === true && PP.choresClaimable() === 1, '받을 것 1 (강화)');
  // 전투 훅 (방어 여부 맞춰)
  PP.buildZone('LB', 'den');
  ok(PP.startBattle().ok, '퀘스트 전투 시작');
  const fake = { kills: 0, porterKills: 0, total: 10, squads: 1, gold: 10, gems: 0, exp: 0, reached: 0, retreated: 0, loot: 0, damage: 0 };
  PP.applyBattle(fake);
  ok(prog('daily', 'd_battle').prog === 1 && prog('weekly', 'w_battle').prog === 1 && prog('weekly', 'w_defend').prog === 1, '전투·방어 진행');
  PP.startBattle(); PP.applyBattle(Object.assign({}, fake, { reached: 2 }));
  ok(prog('daily', 'd_battle').prog === 2 && prog('weekly', 'w_defend').prog === 1, '뚫리면 방어 안 셈');
  // 납품 훅
  RR.quest.goals.forEach(g => { RR.quest.prog[g.type] = g.target; });
  PP.deliver();
  ok(prog('weekly', 'w_deliver').prog === 1, '납품 진행');
  // 부족 강화 훅 (settle에서도 강화 가능)
  ok(PP.upgradeTribe('슬라임').ok, '부족 강화');
  // 저장·불러오기에 남음
  { const W2 = boot(), P2 = W2.PROGRESS; P2.setClock(() => T); P2.load();
    const c2 = P2.chores(); ok(c2.daily.tasks.filter(t => t.id === 'd_build')[0].claimed === true && c2.weekly.tasks.filter(t => t.id === 'w_deliver')[0].prog === 1, '저장에 퀘스트 남음'); }
  // 날짜 바뀜: 일일만 초기화 (수 -> 목)
  T = T0 + 20 * 60000;
  c = PP.chores();
  ok(c.daily.key === '2026-10-22' && c.daily.tasks.every(t => t.prog === 0 && !t.claimed), '날 바뀌면 일일 초기화');
  ok(c.weekly.key === '2026-10-19' && c.weekly.tasks.filter(t => t.id === 'w_battle')[0].prog === 2, '같은 주면 주간 유지');
  // 주 바뀜: 다음 월요일 0시
  T = new Date(2026, 9, 26, 0, 0).getTime();
  c = PP.chores();
  ok(c.weekly.key === '2026-10-26' && c.weekly.tasks.every(t => t.prog === 0 && !t.claimed) && c.daily.key === '2026-10-26', '주 바뀌면 주간 초기화: ' + c.weekly.key);
  // 일요일 23:59는 아직 그 주
  T = new Date(2026, 10, 1, 23, 59).getTime();
  ok(PP.chores().weekly.key === '2026-10-26', '일요일은 같은 주');
  // 진행 훅도 날 바뀐 뒤에는 새 묶음에 쌓임
  T = new Date(2026, 10, 2, 9, 0).getTime();
  RR.gems = 50; PP.upgradeWorkshop('lab');
  c = PP.chores();
  ok(c.daily.key === '2026-11-02' && c.daily.tasks.filter(t => t.id === 'd_upgrade')[0].prog === 1, '바뀐 날 진행');
  choreSample = c.daily.tasks[2];
  // chores 칸 없는 옛 저장 + 깨진 칸
  const sv = JSON.parse(store['dunguen_c1_run']); delete sv.chores; delete sv.idle; delete sv.lastSeen; store['dunguen_c1_run'] = JSON.stringify(sv);
  FAKE_NOW = T;
  const W3 = boot(), P3 = W3.PROGRESS;
  ok(P3.RUN.chores && P3.RUN.chores.daily.key === '2026-11-02' && P3.RUN.chores.daily.tasks.length === 3, 'chores 없는 옛 저장은 기본값');
  ok(P3.idleInfo().gold === 0 && P3.RUN.idle.minutes === 0, 'lastSeen 없는 옛 저장은 방치 보상 없음');
  ok(typeof P3.RUN.lastSeen === 'number', '불러오면 lastSeen 생김');
  sv.chores = { daily: { key: '2026-11-02', tasks: [{ id: 'd_battle', prog: 99, claimed: true }, null] }, weekly: 5 };
  store['dunguen_c1_run'] = JSON.stringify(sv);
  const P4 = boot().PROGRESS, c4 = P4.chores();
  ok(c4.daily.tasks.length === 3 && c4.daily.tasks[0].prog === 3 && c4.daily.tasks[0].claimed && c4.daily.tasks[1].prog === 0 && c4.weekly.tasks.length === 3, '깨진 퀘스트 칸 고침');
}
// ---------- 방치 보상 ----------
{
  const H = 3600000, T0 = new Date(2026, 9, 21, 12, 0).getTime();
  FAKE_NOW = T0;
  let WW = boot(), PP = WW.PROGRESS; PP.reset();
  const rate0 = PP.idleInfo().rate;
  ok(rate0 === 30, '기본 시간당 30: ' + rate0);
  const reopen = ms => { FAKE_NOW = ms; WW = boot(); PP = WW.PROGRESS; return PP.idleInfo(); };
  let inf = reopen(T0 + 9 * 60000);
  ok(inf.gold === 0 && inf.minutes === 0, '9분은 없음: ' + JSON.stringify(inf));
  inf = reopen(T0 + 9 * 60000 + 2 * H);
  ok(inf.gold === 2 * rate0 && inf.minutes === 120 && !inf.capped && inf.maxHours === 8, '2시간 = 2×rate: ' + JSON.stringify(inf));
  // 같은 시각에 다시 켜도 두 번 안 쌓임
  inf = reopen(T0 + 9 * 60000 + 2 * H);
  ok(inf.gold === 2 * rate0, '다시 켜도 그대로');
  let gb = PP.RUN.gold, cl = PP.claimIdle();
  ok(cl.ok && cl.gold === 2 * rate0 && PP.RUN.gold === gb + cl.gold && PP.idleInfo().gold === 0 && PP.idleInfo().minutes === 0, '받기 후 0');
  ok(!PP.claimIdle().ok, '두 번 받기 거부');
  // 20시간 -> 8시간 상한
  let t = T0 + 9 * 60000 + 2 * H;
  inf = reopen(t + 20 * H);
  ok(inf.gold === 8 * rate0 && inf.minutes === 480 && inf.capped, '20시간 = 8시간 상한: ' + JSON.stringify(inf));
  // 안 받고 또 꺼 둬도 합쳐서 8시간 몫을 안 넘음
  t += 20 * H;
  inf = reopen(t + 3 * H);
  ok(inf.gold === 8 * rate0 && inf.minutes === 480, '쌓인 것과 합쳐도 상한');
  PP.claimIdle();
  // 일부 쌓인 뒤 더하기: 5시간 + 5시간 = 8시간
  t += 3 * H;
  reopen(t + 5 * H); t += 5 * H;
  inf = reopen(t + 5 * H); t += 5 * H;
  ok(inf.minutes === 480 && inf.gold === Math.round(rate0 * 5) + Math.round(rate0 * 3), '5+5시간 -> 8시간: ' + JSON.stringify(inf));
  PP.claimIdle();
  // 공방 단계 반영 (건설 3 + 연구실 2 = 5단계 -> 30 + 75)
  PP.RUN.workshop.build = 3; PP.RUN.workshop.lab = 2; PP.save();
  const rate5 = PP.idleInfo().rate;
  ok(rate5 === 30 + 5 * 15, '공방 단계 반영 rate: ' + rate5);
  inf = reopen(t + 2 * H); t += 2 * H;
  ok(inf.gold === 2 * rate5, '공방 단계 반영 금: ' + JSON.stringify(inf));
  PP.claimIdle();
  // 전투 중에 꺼도 금만 쌓이고 전투는 그대로
  PP.pickQuest(PP.offerQuests()[0]);
  PP.buildZone('CB', 'trap'); ok(PP.startBattle().ok, '방치 전투 시작');
  const wk = PP.RUN.week;
  inf = reopen(t + 3 * H); t += 3 * H;
  ok(PP.RUN.battling === true && PP.RUN.week === wk && inf.gold === 3 * rate5, '전투 중 방치: 금만 쌓임 ' + JSON.stringify(inf));
  // 시계가 거꾸로 가도 없음
  PP.claimIdle();
  inf = reopen(t - 5 * H);
  ok(inf.gold === 0, '시계 거꾸로면 없음');
  idleSample = PP.idleInfo();
  FAKE_NOW = null;
}
console.log(JSON.stringify({ problems, sample: { carry: d.carry, lost: d.lost, gems: d.gems, client: q2.client, attr: q2.attr, carryWs: wsSample, chore: choreSample, idle: idleSample } }));
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
    print("[test_c1_core] 통과: 납품 -> 후보 -> 친위대 인계 -> 공사비 첫 건설 -> 약탈 한도 -> 저장 -> 공방·부족 강화 -> 일일·주간 퀘스트 -> 방치 보상")
    print("  " + json.dumps(r["sample"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
