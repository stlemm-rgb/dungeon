"""C1 시안 핵심 규칙 검사: 납품 -> 새 의뢰 후보 -> pickQuest(친위대) -> 레벨 초기화·공사비 첫 건설·약탈 한도·저장·공방·부족 강화.
공방 = 건설 할인·연구실 함정 피해·제작 공방 거부, 몬스터 부족 보석 강화 = 인계 뒤에도 남음.
일일·주간 퀘스트 = 날·주 바뀜 초기화·진행 훅·받기, 방치 보상 = 10분 미만 없음·시간 비례·8시간 상한·공방 단계 반영 (시계는 가짜 Date.now·setClock).
튜토리얼 = 새 게임 on·후보 1장(방어 2)·첫 부지 입구 고정·한 길·함정 발동·seen 저장·skip·첫 납품 뒤 off·옛 저장 off.
부지 모양 3종 = 판마다 입구->보스 길 이어짐·문 맞닿음·forecast 합·useBoard로 Z.MAP 바뀜·부지 바뀔 때·불러올 때 판 유지·옛 저장 fork3.
건설 요구 = 종류마다 ok/미달·목표 다 채워도 요구 미달이면 납품 안 됨(questBlockers)·맞추면 납품·튜토리얼 요구 없음·옛 저장 null.
몬스터 모집·광고 뽑기 = 계약 부족만 모집·비용 차감·증가·상한·부족 강화가 새 몬스터에·전투 중 거부·하루 3회·날 바뀌면 초기화·새 부족 계약·상한이면 금·확률 합 100·같은 시드 같은 결과·대기실·전투·인계·옛 저장.
(앞쪽 흐름 시험은 pin()으로 의뢰를 fork3 판·요구 없음으로 고정해 예전 구역 id를 그대로 쓴다)

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
function noDisarm(RR) { if (RR.plan && RR.plan.card === 'disarm') RR.plan.card = 'paladin'; }
function boot() {
  const sb = { console, Math, JSON, Date: FakeDate, Object, Array, String, Number };
  sb.window = sb;
  sb.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  vm.createContext(sb);
  ['battle_data.js', 'zones.js', 'progress.js', 'battle_sim.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sb, { filename: f }));
  return sb;
}
// 앞쪽 흐름 시험용: 의뢰를 fork3 판·요구 없음으로 고정 (판·요구 시험은 맨 뒤 따로)
function pin(q) { q.board = 'fork3'; q.demand = null; return q; }
let W = boot(), P = W.PROGRESS, R = P.RUN;
P.reset();
P.skipTutorial();   // 아래는 일반 흐름 시험 (튜토리얼은 맨 뒤 따로)
// 첫 시작: 후보 모양·첫 의뢰인
let offers = P.offerQuests();
ok(offers.length >= 2, '첫 후보가 2장 이상');
offers.forEach(q => {
  ok(q.client && q.client.name === '은발 마왕' && q.client.kind === '마왕', '첫 의뢰인은 은발 마왕: ' + JSON.stringify(q.client));
  ok(q.attr && ['phys', 'magic', 'ether'].includes(q.attr.id) && q.attr.label && q.attr.effect && q.attr.counter, '속성 모양: ' + JSON.stringify(q.attr));
  ok(q.reward && typeof q.reward.gems === 'number' && q.reward.gems > 0 && typeof q.reward.gold === 'number' && typeof q.reward.fame === 'number', '보상 모양');
});
ok(P.pickQuest(pin(offers[0])) === true && R.phase === 'play', 'choose에서 pickQuest');
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
let gBefore = R.gold, qgBefore = R.quest.prog.gold, rep = P.applyBattle(res);
ok(rep.loot === rep.gold && R.gold === gBefore, '약탈 한도 = 이번 전투 금: loot ' + rep.loot + ' gold ' + rep.gold + ' ' + gBefore + '->' + R.gold);
ok(R.quest.prog.gold === qgBefore, '금 목표 = 약탈 뒤 금: ' + qgBefore + '->' + R.quest.prog.gold);
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
ok(P.pickQuest(pin(q2), [0, 2, 0, 99]) === true, 'settle에서 pickQuest');
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
  PP.pickQuest(pin(PP.offerQuests()[0]));
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
  PP.pickQuest(pin(PP.offerQuests()[0]));
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
  noDisarm(RR);   // 무작위로 '함정 해체꾼'(발동 -90%)이 걸리면 함정 검사가 가끔 실패하므로 고정
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
  ok(P2.pickQuest(pin(P2.offerQuests()[0]), []) === true, '인계 pickQuest');
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
  PP.pickQuest(pin(PP.offerQuests()[0]));
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
  PP.pickQuest(pin(PP.offerQuests()[0]));
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
// ---------- 튜토리얼 첫 부지 ----------
let tutSample = null;
{
  let WW = boot(), PP = WW.PROGRESS, RR = PP.RUN; PP.reset();
  const Z = WW.ZONES;
  let tu = PP.tutorial();
  ok(tu.on === true && JSON.stringify(tu.seen) === '{}' && RR.tutorial.on === true, '새 게임은 튜토리얼 on');
  tu.seen.x = true; ok(!RR.tutorial.seen.x, 'tutorial()은 사본');
  ok(PP.tutorialPath() === null, '의뢰 받기 전엔 길 null');
  const of = PP.offerQuests();
  ok(of.length === 1, '튜토리얼 후보 1장: ' + of.length);
  const tq = of[0];
  ok(tq.client.name === '은발 마왕' && tq.kind === 'normal' && tq.attr.id === 'phys' && tq.name === '첫 납품: 연습용 동굴', '튜토리얼 의뢰 모양: ' + JSON.stringify([tq.client, tq.kind, tq.attr.id, tq.name]));
  ok(tq.goals.length === 1 && tq.goals[0].type === 'defends' && tq.goals[0].target === 2, '목표 = 보물방 방어 2회');
  ok(tq.reward.gold > 0 && tq.reward.gems > 0 && tq.reward.fame > 0, '보상');
  ok(PP.pickQuest(tq) === true && RR.site.tutorial === true && RR.site.zones.E === 'wait', '튜토리얼 부지: 입구 대기');
  const pe = PP.previewBuild('E', 'split');
  ok(!pe.ok && !PP.buildZone('E', 'left').ok && RR.site.zones.E === 'wait', '첫 부지 입구 고정: ' + pe.why);
  // 길 하나: 미끼·몬스터 대기실을 옆에 지어도 전원 같은 길
  const path = PP.tutorialPath();
  ok(JSON.stringify(path) === '["E","CB","CC","CD","B"]', '튜토리얼 길: ' + JSON.stringify(path));
  ok(PP.buildZone('CB', 'trap').ok, '길 위 함정 하나');
  RR.gold = 99999; PP.buildZone('LB', 'lure'); PP.buildZone('TL', 'lure');
  const fc = PP.forecast();
  ok(fc.at.CB === Z.PREVIEW_INVADERS && fc.at.B === Z.PREVIEW_INVADERS && !fc.at.TL && !fc.at.TR && !fc.at.LB, '미리보기: 전원 가운데 ' + JSON.stringify(fc.at));
  RR.site.zones.LB = 'empty'; RR.site.zones.TL = 'empty';
  // seen 저장
  ok(PP.tutorialSeen('build_trap') === true && PP.tutorialSeen('') === false, 'tutorialSeen');
  // 전투: 함정이 실제로 발동, 모든 분대가 CB를 지남
  ok(PP.startBattle().ok, '튜토리얼 전투 시작');
  noDisarm(RR);   // 무작위로 '함정 해체꾼'(발동 -90%)이 걸리면 함정 검사가 가끔 실패하므로 고정
  const o = { plan: RR.plan, zones: RR.site.zones, units: RR.site.units, monById: PP.monById };
  let SS = WW.BSIM.create(o), traps = 0;
  for (let i = 0; i < 3000 && !SS.done; i++) WW.BSIM.step(SS, 0.1).forEach(e => { if (e.type === 'trap' && e.z === 'CB') traps++; });
  ok(traps > 0, '함정 하나로 발동: ' + traps);
  const ro = WW.ZONES.routeOf(RR.site.zones, RR.site.units, {}), ro2 = WW.ZONES.routeOf(RR.site.zones, RR.site.units, { E: 1, CB: 1 });
  ok(ro.join() === ro2.join() && ro.indexOf('CB') >= 0, '분대 차례가 달라도 같은 길');
  PP.applyBattle(WW.BSIM.result(SS));
  // 새로고침해도 유지
  WW = boot(); PP = WW.PROGRESS; RR = PP.RUN;
  ok(PP.load() === true && PP.tutorial().seen.build_trap === true && PP.tutorial().on === true && RR.site.tutorial === true, 'seen·on 저장');
  ok(JSON.stringify(PP.tutorialPath()) === '["E","CB","CC","CD","B"]', '불러와도 길');
  // 첫 납품 -> off, 두 번째 부지는 원래 판·후보 여러 장
  RR.quest.prog.defends = 2;
  const dd = PP.deliver();
  ok(dd && PP.tutorial().on === false && PP.tutorialPath() === null, '첫 납품 뒤 off');
  ok(RR.offers.length >= 2 && RR.offers.every(q => !q.tutorial), '두 번째 후보 여러 장: ' + RR.offers.length);
  ok(PP.pickQuest(pin(RR.offers[0]), []) === true && RR.site.tutorial === false && RR.site.zones.E === 'split', '두 번째 부지는 원래 판');
  RR.gold = 99999;
  ok(PP.buildZone('E', 'left').ok && PP.tutorialPath() === null, '두 번째 부지 입구 바꿀 수 있음');
  ok(PP.forecast(Object.assign({}, RR.site.zones, { E: 'split' })).at.TL > 0, '두 번째 부지는 갈림길');
  tutSample = { quest: { name: tq.name, goals: tq.goals, reward: tq.reward }, path: path };
  // skip: 고르기 전 끄면 일반 후보
  WW = boot(); PP = WW.PROGRESS; RR = PP.RUN; PP.reset();
  ok(PP.offerQuests().length === 1, 'skip 전 1장');
  PP.skipTutorial();
  ok(PP.tutorial().on === false && PP.offerQuests().length >= 2 && RR.offers.every(q => !q.tutorial), 'skip 뒤 일반 후보');
  WW = boot(); ok(WW.PROGRESS.load() === true && WW.PROGRESS.tutorial().on === false, 'skip 저장');
  // 옛 저장(tutorial 칸 없음)은 off, 부지도 보통
  { const sv = JSON.parse(store['dunguen_c1_run']); delete sv.tutorial; delete sv.site.tutorial; store['dunguen_c1_run'] = JSON.stringify(sv); }
  WW = boot(); PP = WW.PROGRESS;
  ok(PP.load() === true && PP.tutorial().on === false && JSON.stringify(PP.RUN.tutorial.seen) === '{}' && PP.RUN.site.tutorial === false, '옛 저장은 튜토리얼 off');
}

// ---------- 부지 모양 3종 ----------
let boardSample = null, demandSample = null;
{
  const WW = boot(), Z = WW.ZONES;
  ok(Array.isArray(Z.BOARDS) && Z.BOARDS.map(b => b.id).join() === 'fork3,line,fork2x' && Z.BOARDS.every(b => b.name && b.desc), 'BOARDS 모양');
  ok(Z.boardId() === 'fork3' && Z.MAP[1][2] === 'CB', '처음 판 fork3');
  boardSample = {};
  Z.BOARDS.forEach(b => {
    const id = b.id, info = Z.boardInfo(id);
    ok(info.id === id && info.name === b.name && info.MAP.length === 7 && info.MAP.every(r => r.length === 5) && info.NAMES.E === '입구', 'boardInfo ' + id);
    ok(info.MAP[0][2] === 'E' && info.MAP[6][2] === 'B', id + ': 입구 맨 위 가운데, 보스 맨 아래 가운데');
    ok(Z.useBoard(id) === id && Z.boardId() === id && Z.MAP === info.MAP && Z.NAMES === info.NAMES && Z.EXITS === info.EXITS, 'useBoard 뒤 Z.MAP 등 바뀜 ' + id);
    boardSample[id] = info.MAP.map(r => r.map(k => (k + '   ').slice(0, 3)).join(' '));
    // 구역 크기 (Y·E·B 빼고 2~4칸), 이름
    Object.keys(Z.CELLS).forEach(z => { if (z !== 'E' && z !== 'B') ok(Z.sizeOf(z) >= (id === 'fork3' ? 1 : 2) && Z.sizeOf(z) <= 4 && Z.NAMES[z], id + ' 구역 크기·이름 ' + z + ' ' + Z.sizeOf(z)); });
    // 길: 모든 문이 맞닿고, 모든 구역이 입구에서 닿고 보스로 이어짐 (순환 없음)
    Z.flowPairs().forEach(pr => ok(pr[1] === 'B' || Z.sharedEdge(pr[0], pr[1]) ? Z.sharedEdge(pr[0], pr[1]) : false, id + ' 문 맞닿음 ' + pr.join('>')));
    const seen = { E: 1 }, st = ['E'];
    while (st.length) { const z = st.pop(); (Z.EXITS[z] || []).forEach(n => { if (!seen[n]) { seen[n] = 1; st.push(n); } }); }
    ok(Object.keys(Z.CELLS).every(z => seen[z]), id + ' 모든 구역에 길이 닿음: ' + Object.keys(Z.CELLS).filter(z => !seen[z]).join(','));
    ok(Object.keys(Z.CELLS).every(z => z === 'B' || (Z.EXITS[z] && Z.EXITS[z].length)), id + ' 막다른 구역 없음');
    // forecast: 합 = 침입 인원 (기본 배치·미끼·대기실 몬스터·입구 시설마다)
    const units = {};
    const cases = [Z.defaultZones()];
    const rooms = Object.keys(Z.CELLS).filter(z => Z.zoneType(z) === 'room');
    rooms.forEach((z, i) => { const L = Z.defaultZones(); L[z] = i % 2 ? 'lure' : 'trap'; cases.push(L); });
    Z.facFor('E').forEach(k => { const L = Z.defaultZones(); L.E = k; cases.push(L); });
    cases.forEach(L => {
      const fc = Z.forecast(L, units, 20);
      ok(fc.at.B === 20, id + ' forecast 보스 도착 합 = 20: ' + fc.at.B + ' ' + JSON.stringify(L));
      const inB = Object.keys(fc.flow).filter(k => k.endsWith('>B')).reduce((a, k) => a + fc.flow[k], 0);
      ok(inB === 20, id + ' 보스 문 합 20');
      const r0 = Z.routeOf(L, units, {}); ok(r0[0] === 'E' && r0[r0.length - 1] === 'B', id + ' routeOf E..B');
    });
    // 몬스터 대기실을 피함 (다른 길이 있으면) / 입구 시설은 그 판 출구만
    ok(Z.facFor('E').every(k => !Z.FAC[k].turn || Z.ENTRY[Z.FAC[k].turn]), id + ' 입구 시설은 있는 출구만');
  });
  ok(Z.useBoard('nope') === 'fork3' && Z.boardId() === 'fork3', '없는 판은 fork3');
  Z.useBoard('fork2x');
  ok(Z.facFor('E').indexOf('wait') < 0 && Z.facFor('E').indexOf('left') >= 0, 'fork2x 입구: 대기 없음, 굽은길 있음');
  ok(JSON.stringify(Z.routeOf(Object.assign(Z.defaultZones(), { E: 'right' }), {}, {}).slice(0, 2)) === '["E","UR"]', 'fork2x 굽은길 → = UR');
  Z.useBoard('line');
  ok(Z.routeOf(Object.assign(Z.defaultZones(), { E: 'wait' }), {}, {})[1] === 'R1', 'line 대기 = R1');
  ok(JSON.stringify(Z.bossFront()) === '["R5"]', 'line 보스 앞 = R5');
  Z.useBoard('fork3');
  ok(Z.ORDER.length === 14 && Z.ORDER[0] === 'E', 'fork3 계산 순서');
}
// 부지가 바뀔 때·불러올 때 판 유지, 의뢰 후보에 판·요구
{
  let WW = boot(), PP = WW.PROGRESS, RR = PP.RUN; PP.reset(); PP.skipTutorial();
  ok(RR.site.board === 'fork3', '새 게임 부지 fork3');
  const seenB = {}, seenMain = {};
  for (let t = 0; t < 40; t++) {
    RR.offers = null; const of = PP.offerQuests();
    of.forEach(q => { ok(WW.ZONES.hasBoard(q.board) && q.demand && q.demand.id && q.demand.label && q.demand.text, '후보 판·요구 모양 ' + JSON.stringify([q.board, q.demand])); seenB[q.board] = 1; });
  }
  ok(Object.keys(seenB).length === 3, '일반 후보 판 3종 다 나옴: ' + Object.keys(seenB));
  RR.questsDone = 3;
  for (let t = 0; t < 30; t++) { RR.offers = null; const m = PP.offerQuests().filter(q => q.kind === 'main')[0]; seenMain[m.board] = 1; }
  ok(!seenMain.line && Object.keys(seenMain).length >= 1, '메인 의뢰는 어려운 판만: ' + Object.keys(seenMain));
  RR.questsDone = 0;
  // line 판 의뢰 받기 -> 지금 판 line
  RR.offers = null; const q = PP.offerQuests()[0]; q.board = 'line'; q.demand = null;
  ok(PP.pickQuest(q) === true && RR.site.board === 'line' && WW.ZONES.boardId() === 'line' && RR.site.zones.R3 === 'empty' && !('CB' in RR.site.zones), '받으면 line 부지');
  ok(PP.buildZone('R3', 'trap').ok && !PP.previewBuild('CB', 'trap').ok, 'line 구역에 짓기, 없는 구역은 거부');
  const fc = PP.forecast(); ok(fc.at.R3 === 20 && fc.at.B === 20, 'line 큰길 전원: ' + JSON.stringify(fc.at));
  // 불러오기: 판 유지 (다른 sandbox는 fork3로 시작)
  WW = boot(); PP = WW.PROGRESS; RR = PP.RUN;
  ok(PP.load() === true && RR.site.board === 'line' && WW.ZONES.boardId() === 'line' && WW.ZONES.MAP[3][2] === 'R3', '불러와도 line 판');
  ok(PP.siteSummary().trap === 1 && PP.siteValue() === 30, '불러온 판으로 가치 계산 ' + PP.siteValue());
  // 전투도 그 판 길
  ok(PP.startBattle().ok, 'line 전투 시작');
  const S = WW.BSIM.create({ plan: RR.plan, zones: RR.site.zones, units: RR.site.units, monById: PP.monById });
  ok(S.squads.every(s => s.route.indexOf('R3') >= 0), 'line 전 분대가 큰길 R3');
  for (let i = 0; i < 3000 && !S.done; i++) WW.BSIM.step(S, 0.1);
  PP.applyBattle(WW.BSIM.result(S));
  // 납품 -> 다음 의뢰 fork2x: 부지 바뀌면 판 바뀜
  RR.quest.goals.forEach(g => { RR.quest.prog[g.type] = g.target; });
  ok(PP.deliver() !== null && RR.phase === 'settle' && RR.site.board === 'line', '납품 화면에서는 아직 옛 부지');
  const q2 = RR.offers[0]; q2.board = 'fork2x';
  ok(PP.pickQuest(q2, []) === true && RR.site.board === 'fork2x' && WW.ZONES.boardId() === 'fork2x' && RR.site.zones.HUB === 'empty', '새 부지 fork2x');
  // 옛 저장 (site.board·demand·board 없음) -> fork3·null
  const sv = JSON.parse(store['dunguen_c1_run']);
  sv.site.zones = (boot().ZONES.defaultZones()); delete sv.site.board; delete sv.quest.board; delete sv.quest.demand;
  store['dunguen_c1_run'] = JSON.stringify(sv);
  WW = boot(); PP = WW.PROGRESS; RR = PP.RUN;
  ok(PP.load() === true && RR.site.board === 'fork3' && WW.ZONES.boardId() === 'fork3' && RR.quest.board === 'fork3' && RR.quest.demand === null && PP.demandStatus() === null, '옛 저장: fork3·요구 null');
  ok(PP.buildZone('CB', 'trap').ok, '옛 저장 부지에 짓기');
  // 옛 저장의 후보(settle)에도 demand 없음 -> null
  RR.quest.goals.forEach(g => { RR.quest.prog[g.type] = g.target; }); PP.deliver();
  const sv2 = JSON.parse(store['dunguen_c1_run']); sv2.offers.forEach(o => { delete o.demand; delete o.board; }); store['dunguen_c1_run'] = JSON.stringify(sv2);
  WW = boot(); PP = WW.PROGRESS; RR = PP.RUN;
  ok(PP.load() === true && RR.offers.every(o => o.demand === null && o.board === 'fork3'), '옛 후보: 판 fork3·요구 null');
}
// ---------- 건설 요구 ----------
{
  const WW = boot(), PP = WW.PROGRESS, RR = PP.RUN; PP.reset(); PP.skipTutorial();
  const q = PP.offerQuests()[0]; q.board = 'fork3';
  PP.pickQuest(q);
  RR.gold = 99999;
  const fresh = () => { RR.site.zones = WW.ZONES.defaultZones(); RR.site.units = {}; };
  const st = () => PP.demandStatus();
  const set = d => { RR.quest.demand = d; };
  ok(Object.keys(RR.quest.demand).length >= 3, '받은 의뢰 요구 있음');
  // trap
  fresh(); set({ id: 'trap', label: 'x', text: 't', need: 2 });
  ok(st().ok === false && st().now === 0 && st().need === 2, 'trap 미달');
  PP.buildZone('CB', 'trap'); PP.buildZone('LC', 'trap');
  ok(st().ok === true && st().now === 2, 'trap ok');
  // den: 대기실 1 + 몬스터 2
  fresh(); set({ id: 'den', label: 'x', text: 't', need: 1, need2: 2 });
  ok(!st().ok, 'den 미달');
  PP.buildZone('LC', 'den'); PP.placeMonster('LC', 0);
  ok(!st().ok && st().now === 1 && st().need === 2 && st().dens === 1, 'den 몬스터 1마리면 미달');
  PP.placeMonster('LC', 1);
  ok(st().ok, 'den ok');
  // lure
  fresh(); set({ id: 'lure', label: 'x', text: 't', need: 1 });
  ok(!st().ok, 'lure 미달'); PP.buildZone('TL', 'lure'); ok(st().ok && st().now === 1, 'lure ok');
  // front: 보스 앞(CD·LE·RE) 빈 구역
  fresh(); set({ id: 'front', label: 'x', text: 't' });
  ok(st().ok && st().need === 3, 'front 처음엔 ok');
  PP.buildZone('CD', 'trap');
  ok(!st().ok && st().now === 2 && st().note.indexOf('가운데 3') >= 0, 'front 미달: ' + st().note);
  // value
  fresh(); set({ id: 'value', label: 'x', text: 't', need: 50 });
  ok(!st().ok && st().now === 0, 'value 미달'); PP.buildZone('CC', 'trap'); PP.buildZone('LC', 'trap');
  ok(st().ok && st().now === 60, 'value ok ' + st().now);
  // thorn
  fresh(); set({ id: 'thorn', label: 'x', text: 't' });
  ok(!st().ok, 'thorn 미달'); PP.buildZone('Y', 'thorn'); ok(st().ok, 'thorn ok');
  // 납품 조건: 목표 다 채워도 요구 미달이면 안 됨
  fresh(); RR.quest.demand = PP.RUN.quest.demand = { id: 'trap', label: '함정 위주', text: '함정 복도를 3곳 이상 지어 주세요', need: 3 };
  ok(PP.questBlockers().length === RR.quest.goals.length + 1, '목표·요구 모두 막음: ' + JSON.stringify(PP.questBlockers()));
  RR.quest.goals.forEach(g => { RR.quest.prog[g.type] = g.target; });
  const bl = PP.questBlockers();
  ok(PP.checkQuest() === false && PP.deliver() === null && RR.phase === 'play', '요구 미달이면 납품 안 됨');
  ok(bl.length === 1 && bl[0].indexOf('요구') === 0 && bl[0].indexOf('0/3') >= 0, '요구 미달 글: ' + JSON.stringify(bl));
  PP.buildZone('CB', 'trap'); PP.buildZone('CC', 'trap'); PP.buildZone('CD', 'trap');
  ok(PP.checkQuest() === true && PP.questBlockers().length === 0, '요구 맞추면 막는 것 없음');
  const dd = PP.deliver();
  ok(dd && dd.demand && dd.demand.ok === true && RR.phase === 'settle', '요구 맞추면 납품');
  demandSample = { status: dd.demand, blocked: bl };
  // 의뢰인 표: 리치는 trap·lure만, 드래곤은 value·den·front
  const kinds = {};
  for (let t = 0; t < 200; t++) { RR.offers = null; PP.offerQuests().forEach(o => { (kinds[o.client.name] = kinds[o.client.name] || {})[o.demand.id] = 1; }); }
  ok(Object.keys(kinds['뼈 골짜기 리치'] || {}).sort().join() === 'lure,trap', '리치 요구: ' + JSON.stringify(kinds['뼈 골짜기 리치']));
  ok(Object.keys(kinds['붉은 비늘 드래곤'] || {}).every(k => ['value', 'den', 'front'].includes(k)), '드래곤 요구');
  ok(PP.demandStatus() === null && JSON.stringify(PP.questBlockers()) === '[]', '의뢰 없으면 null·[]');
}
// 튜토리얼 의뢰: fork3·요구 없음
{
  const WW = boot(), PP = WW.PROGRESS, RR = PP.RUN; PP.reset();
  const tq = PP.offerQuests()[0];
  ok(tq.tutorial && tq.board === 'fork3' && tq.demand === null, '튜토리얼 의뢰 fork3·요구 없음');
  WW.ZONES.useBoard('line');
  PP.pickQuest(tq);
  ok(RR.site.board === 'fork3' && WW.ZONES.boardId() === 'fork3' && RR.site.zones.E === 'wait' && PP.demandStatus() === null, '튜토리얼 부지 fork3 입구 대기');
}
// ---------- 몬스터 모집(금) · 광고 보고 뽑기 ----------
let recruitSample = null, gachaSample = null;
{
  const T0 = new Date(2026, 9, 21, 12, 0).getTime();
  FAKE_NOW = T0;
  let WW = boot(), PP = WW.PROGRESS, RR = PP.RUN; PP.reset(); PP.skipTutorial();
  let T = T0; PP.setClock(() => T);
  const G = PP.TRIBE_GRADES, gi = g => G.indexOf(g);
  ok(G.join() === 'F,E,D,C,B,A,S,SS,SSR', '등급 목록');
  ok(PP.TRIBES.length === 9 && PP.TRIBES.every(t => t.name && G.includes(t.grade) && t.lv > 0 && t.hp > 0 && t.atk > 0 && t.desc), 'TRIBES 모양');
  const start = PP.TRIBES.slice(0, 6), extra = PP.TRIBES.slice(6);
  ok(JSON.stringify(RR.contracts) === JSON.stringify(start.map(t => t.name)), '처음 계약 6부족: ' + JSON.stringify(RR.contracts));
  ok(extra.map(t => t.name).sort().join() === ['가고일', '미믹', '임프'].sort().join(), '새 부족 3');
  ok(Math.min(...extra.map(t => gi(t.grade))) > Math.max(...start.map(t => gi(t.grade))), '새 부족이 더 높은 등급');
  ok(RR.monsters.length === 6 && RR.monsters.every((m, i) => m.name === start[i].name && m.hp === start[i].hp), '처음 몬스터 = 처음 6부족');
  PP.pickQuest(pin(PP.offerQuests()[0]));
  // 계약 안 한 부족은 모집 불가
  RR.gold = 100000;
  let ri = PP.recruitInfo('미믹');
  ok(ri && ri.contracted === false && ri.canAfford === false && ri.why && ri.count === 0 && ri.max === 6, '미계약 정보: ' + JSON.stringify(ri));
  let r = PP.recruit('미믹');
  ok(!r.ok && r.monster === null && RR.gold === 100000 && RR.monsters.length === 6, '미계약 모집 거부');
  ok(PP.recruitInfo('없는몬스터') === null && !PP.recruit('없는몬스터').ok, '없는 부족');
  ok(!PP.upgradeTribe('미믹').ok && !RR.tribes['미믹'] && PP.tribeInfo('미믹').canAfford === false, '미계약 부족 강화 거부');
  // 비용 차감·증가, id, 상한
  ri = PP.recruitInfo('슬라임');
  ok(ri.contracted && ri.count === 1 && ri.canAfford && ri.why === '' && ri.cost.gold > 0, '슬라임 정보: ' + JSON.stringify(ri));
  const costs = [];
  for (let i = 0; i < 5; i++) {
    const c = PP.recruitInfo('슬라임').cost.gold, g0 = RR.gold; costs.push(c);
    r = PP.recruit('슬라임');
    ok(r.ok && RR.gold === g0 - c && r.monster && r.monster.id === 6 + i && r.monster.name === '슬라임', '모집 ' + (i + 1) + ': ' + JSON.stringify(r));
  }
  ok(costs.every((c, i) => i === 0 || c > costs[i - 1]), '비용 증가: ' + costs);
  ri = PP.recruitInfo('슬라임');
  ok(ri.count === 6 && !ri.canAfford && ri.why, '상한 정보');
  let g1 = RR.gold; r = PP.recruit('슬라임');
  ok(!r.ok && RR.gold === g1 && RR.monsters.filter(m => m.name === '슬라임').length === 6, '상한 거부');
  RR.gold = 10; ri = PP.recruitInfo('고블린');
  ok(!ri.canAfford && ri.why.indexOf('모자람') >= 0 && !PP.recruit('고블린').ok, '금 모자람');
  RR.gold = 100000;
  // 부족 보석 강화가 새 몬스터에도
  RR.gems = 100;
  PP.upgradeTribe('고블린'); PP.upgradeTribe('고블린');
  const gob = PP.recruit('고블린').monster;
  ok(gob.base.hp === 90 + 9 * 2 && gob.hp === gob.base.hp && gob.atk === 14 + 1 * 2 && gob.base.atk === gob.atk && gob.lv === 3 && gob.exp === 0, '강화가 새 몬스터에: ' + JSON.stringify(gob));
  recruitSample = { info: PP.recruitInfo('고블린'), slimeCosts: costs };
  // 새 몬스터를 대기실에 배치 -> 전투 -> 전투 중 모집·뽑기 거부
  PP.buildZone('CB', 'trap'); PP.buildZone('LB', 'den');
  ok(PP.idleMonsters().some(m => m.id === gob.id), '새 몬스터는 대기 중');
  ok(PP.placeMonster('LB', gob.id).ok && RR.site.units.LB.includes(gob.id), '새 몬스터 배치');
  ok(PP.startBattle().ok, '모집 전투 시작');
  const n0 = RR.monsters.length, gu = RR.gacha.used;
  ok(!PP.recruit('고블린').ok && !PP.recruitInfo('고블린').canAfford && RR.monsters.length === n0, '전투 중 모집 거부');
  ok(!PP.gachaPull().ok && RR.gacha.used === gu, '전투 중 뽑기 거부');
  const o = { plan: RR.plan, zones: RR.site.zones, units: RR.site.units, monById: PP.monById };
  let SS = WW.BSIM.create(o);
  ok(SS.dens.LB && SS.dens.LB.some(u => u.hp === gob.hp && u.atk === gob.atk), '전투에 새 몬스터');
  for (let i = 0; i < 3000 && !SS.done; i++) WW.BSIM.step(SS, 0.1);
  PP.applyBattle(WW.BSIM.result(SS));
  ok(RR.battling === false, '전투 끝');
  // 인계: 레벨업분만 사라지고 강화분 남음
  gob.lv = 9; gob.hp += 300; gob.atk += 5; gob.exp = 2;
  // 뽑기: 하루 3회
  let gin = PP.gachaInfo();
  ok(gin.left === 3 && gin.perDay === 3 && gin.pool.length === 9 && gin.pool.filter(p => p.contracted).length === 6, '뽑기 정보: ' + JSON.stringify([gin.left, gin.pool.length]));
  const sumPct = gin.rates.reduce((a, x) => a + Math.round(x.pct * 10), 0);
  ok(sumPct === 1000, '확률 합 100: ' + JSON.stringify(gin.rates));
  ok(gin.rates.every(x => x.pct > 0 && PP.TRIBES.some(t => t.grade === x.grade)), '부족 있는 등급만');
  ok(gin.rates.map(x => gi(x.grade)).every((v, i, a) => i === 0 || v > a[i - 1]), '확률 표 등급 순');
  for (let i = 0; i < 3; i++) {
    const n1 = RR.monsters.length; r = PP.gachaPull();
    ok(r.ok && r.result && PP.TRIBES.some(t => t.name === r.result.name && t.grade === r.result.grade), '뽑기 ' + (i + 1) + ': ' + JSON.stringify(r));
    ok(r.result.monster ? RR.monsters.length === n1 + 1 && r.result.monster.name === r.result.name : r.result.refund && r.result.refund.gold > 0, '뽑기 결과 반영');
  }
  ok(PP.gachaInfo().left === 0 && !PP.gachaPull().ok, '4번째 거부');
  T += 12 * 3600000;   // 다음 날 0시
  ok(PP.gachaInfo().left === 3 && RR.gacha.key === '2026-10-22', '날 바뀌면 초기화');
  // 같은 시드 = 같은 결과 (저장 뒤 두 번 불러와 같은 뽑기)
  PP.save();
  const snap = store['dunguen_c1_run'], outs = [];
  for (let k = 0; k < 2; k++) {
    store['dunguen_c1_run'] = snap; FAKE_NOW = T;
    const W2 = boot(), P2 = W2.PROGRESS; P2.setClock(() => T);
    outs.push(JSON.stringify([P2.gachaPull().result, P2.gachaPull().result, P2.RUN.seed]));
  }
  ok(outs[0] === outs[1], '같은 시드 같은 결과: ' + outs.join(' | '));
  store['dunguen_c1_run'] = snap;
  WW = boot(); PP = WW.PROGRESS; RR = PP.RUN; PP.setClock(() => T);
  // 새 부족 계약: 날마다 뽑아 새 부족이 나올 때까지
  let newRes = null, refundRes = null, grades = {};
  for (let k = 0; k < 400 && !newRes; k++) {
    RR.gacha.used = 0;
    const before = RR.contracts.slice(), n1 = RR.monsters.length;
    r = PP.gachaPull(); grades[r.result.grade] = (grades[r.result.grade] || 0) + 1;
    if (r.result.isNewContract) {
      newRes = r.result;
      ok(before.indexOf(r.result.name) < 0 && RR.contracts.includes(r.result.name) && RR.contracts.length === before.length + 1, '새 부족 계약');
      ok(r.result.monster && RR.monsters.length === n1 + 1 && r.result.monster.name === r.result.name && r.result.monster.id === Math.max(...RR.monsters.map(m => m.id)), '계약 + 1마리');
      ok(PP.recruitInfo(r.result.name).contracted && PP.recruitInfo(r.result.name).count === 1, '계약 뒤 모집 가능');
    } else ok(!r.result.isNewContract && before.includes(r.result.name), '이미 계약한 부족');
  }
  ok(newRes, '새 부족 계약이 나옴: ' + JSON.stringify(grades));
  // 상한이면 대체 보상: 모든 부족 계약 + 6마리
  RR.contracts = PP.TRIBES.map(t => t.name); RR.gold = 1e9;
  PP.TRIBES.forEach(t => { while (PP.recruit(t.name).ok); });
  ok(PP.TRIBES.every(t => PP.recruitInfo(t.name).count === 6), '전 부족 6마리');
  for (let k = 0; k < 5; k++) {
    RR.gacha.used = 0; const g0 = RR.gold, n1 = RR.monsters.length;
    r = PP.gachaPull();
    ok(r.ok && r.result.monster === null && r.result.refund && r.result.refund.gold > 0 && RR.gold === g0 + r.result.refund.gold && RR.monsters.length === n1 && !r.result.isNewContract, '상한이면 금: ' + JSON.stringify(r.result));
    refundRes = r;
  }
  gachaSample = { rates: gin.rates, newContract: newRes && { name: newRes.name, grade: newRes.grade }, refund: refundRes.msg, counts: grades };
  // 납품 -> 인계: 새 몬스터(친위대 아님) 레벨 초기화, 강화분 남음, carry에 계약 수
  RR.quest.goals.forEach(g => { RR.quest.prog[g.type] = g.target; }); RR.quest.demand = null;
  const dd = PP.deliver();
  ok(dd && dd.carry.some(s => s.indexOf('계약한 몬스터 부족 9') >= 0), 'carry 계약 수: ' + JSON.stringify(dd.carry));
  ok(PP.pickQuest(pin(RR.offers[0]), []) === true, '인계');
  const g2 = PP.monById(gob.id);
  ok(g2.lv === 3 && g2.exp === 0 && g2.hp === 108 && g2.atk === 16, '새 몬스터 인계 초기화(강화분 남음): ' + JSON.stringify(g2));
  ok(RR.contracts.length === 9, '계약은 인계 뒤에도');
  // 옛 저장: contracts·gacha 없음 -> 처음 6부족(+ 가진 몬스터의 부족)·오늘 0회. 깨진 값도
  const sv = JSON.parse(store['dunguen_c1_run']); delete sv.contracts; delete sv.gacha;
  sv.monsters = sv.monsters.filter(m => !['임프', '가고일', '미믹'].includes(m.name));
  store['dunguen_c1_run'] = JSON.stringify(sv);
  WW = boot(); PP = WW.PROGRESS;
  ok(PP.load() === true && JSON.stringify(PP.RUN.contracts) === JSON.stringify(start.map(t => t.name)) && PP.RUN.gacha.used === 0 && typeof PP.RUN.gacha.key === 'string' && PP.gachaInfo().left === 3, '옛 저장 contracts·gacha 기본값');
  ok(!PP.recruitInfo('미믹').contracted, '옛 저장 미믹 미계약');
  const sv2 = JSON.parse(store['dunguen_c1_run']); sv2.contracts = ['슬라임', '없는것', '슬라임']; sv2.gacha = { key: sv2.gacha.key, used: 99 };
  sv2.monsters.push({ id: 999, name: '임프', lv: 5, exp: 0, hp: 110, atk: 24, base: { lv: 5, hp: 110, atk: 24 } });
  store['dunguen_c1_run'] = JSON.stringify(sv2);
  WW = boot(); PP = WW.PROGRESS;
  ok(PP.load() === true && PP.RUN.contracts.filter(n => n === '슬라임').length === 1 && !PP.RUN.contracts.includes('없는것') && PP.RUN.contracts.includes('임프') && PP.RUN.gacha.used === 3, '깨진 contracts·gacha 고침: ' + JSON.stringify([PP.RUN.contracts, PP.RUN.gacha]));
  FAKE_NOW = null;
}
console.log(JSON.stringify({ problems, sample: { recruit: recruitSample, gacha: gachaSample, boards: boardSample, demand: demandSample, tutorial: tutSample, carry: d.carry, lost: d.lost, gems: d.gems, client: q2.client, attr: q2.attr, carryWs: wsSample, chore: choreSample, idle: idleSample } }));
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
    print("[test_c1_core] 통과: 납품 -> 후보 -> 친위대 인계 -> 공사비 첫 건설 -> 약탈 한도 -> 저장 -> 공방·부족 강화 -> 일일·주간 퀘스트 -> 방치 보상 -> 튜토리얼 첫 부지 -> 부지 모양 3종 -> 건설 요구 -> 몬스터 모집·광고 뽑기")
    print("  " + json.dumps(r["sample"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
