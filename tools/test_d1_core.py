"""D1 데모 핵심 규칙 검사 (prototype/d1_demo): 예산·회사 금 분리, 가치/전투력 분리, 납품 기준 5단계·수동 납품, 2층 의뢰, 끈 기능, 저장 v6.

자세히: 의뢰 예산·회사 금 분리, 던전 가치/전투력 분리(친위대 제외·통과 비율),
납품 기준 5단계와 수동 납품, 두 번째 의뢰 = 2층 의뢰, 부대·친위대·능력치 표·참여 경험치·작품집 효과, 고정 구역 거부,
데모에서 끈 기능(광고 뽑기·광고/예고 대량 출현·업무·방치 보상·공방)의 지급 없음, 저장·불러오기 v6 (옛 버전은 새 게임, C1 키 그대로).

화면 없이 battle_data.js·zones.js·progress.js·battle_sim.js를 node로 직접 불러 확인한다 (test_c1_core.py와 같은 방식).
node가 없으면 건너뛴다(통과). 사용: python tools/test_d1_core.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

import tool_common as tc

JS = r"""
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = process.argv[2];
const KEY = 'dunguen_d1_run', C1KEY = 'dunguen_c1_run';
const store = {};
const problems = [];
function ok(c, msg) { if (!c) problems.push(msg); }
let FAKE_NOW = null;
class FakeDate extends Date { static now() { return FAKE_NOW !== null ? FAKE_NOW : super.now(); } }
function boot() {
  const sb = { console, Math, JSON, Date: FakeDate, Object, Array, String, Number };
  sb.window = sb;
  sb.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  vm.createContext(sb);
  ['battle_data.js', 'zones.js', 'progress.js', 'battle_sim.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sb, { filename: f }));
  return sb;
}
function runBattle(W, P) {
  ok(P.startBattle().ok, '전투 시작');
  const S = W.BSIM.create(P.battleInput());
  for (let i = 0; i < 4000 && !S.done; i++) W.BSIM.step(S, 0.1);
  ok(S.done, '전투 끝남');
  return P.applyBattle(W.BSIM.result(S));
}
const sample = {};
store[C1KEY] = '{"v":5,"keep":true}';   // C1 저장은 건드리지 않아야 함
let W = boot(), P = W.PROGRESS, R = P.RUN, BD = W.BATTLE_DATA, Z = W.ZONES;
P.reset();
ok(R.v === 6 && P.VERSION === 6 && P.SAVE_KEY === KEY, '저장 v6·키 ' + P.SAVE_KEY);

// ---------- 5) 의뢰: 첫 의뢰 = 1층 의뢰(은발 마왕) 하나 ----------
let offers = P.offerQuests();
ok(offers.length === 1 && offers[0].key === 'q1' && offers[0].floors === 1 && offers[0].client.name === '은발 마왕', '첫 후보 = 1층 의뢰 하나: ' + JSON.stringify(offers.map(o => [o.key, o.floors, o.client])));
ok(offers[0].stages.length === 5, '납품 기준 5단계');
ok(P.lockedQuest() && P.lockedQuest().floors === 2 && P.lockedQuest().minCompanyLv > R.company.lv, '회사 레벨 낮으면 2층 의뢰는 잠김');
ok(P.pickQuest(offers[0]) === true && R.phase === 'play', '의뢰 받기');
const q1 = R.quest;

// ---------- 2) 의뢰 예산 vs 회사 금 ----------
ok(P.budgetLeft() === q1.budget && q1.budget > 0, '의뢰 예산 지급 ' + P.budgetLeft());
ok(R.site.squads.length === 1 && R.site.squads[0].free, '무료 기본 부대');
R.gold = 5000;
let g0 = R.gold, b0 = P.budgetLeft();
ok(P.startBattle().ok, '건설 없이도 다음 주 진행 가능');
R.battling = false; R.bsave = null;   // (위 확인용 시작은 되돌림)
let pv = P.previewBuild('CD', 'trap');
ok(pv.ok && pv.cost > 0 && pv.budgetAfter === b0 - pv.cost, '미리보기 = 예산에서');
ok(P.buildZone('CD', 'trap').ok && R.gold === g0 && P.budgetLeft() === b0 - pv.cost, '건설은 예산만, 회사 금 그대로');
const pr0 = P.procureInfo('ember');
ok(P.procureSquad('ember').ok && R.gold === g0 && P.budgetLeft() === b0 - pv.cost - pr0.cost, '부대 조달은 예산만');
const sEmber = R.site.squads[1];
ok(sEmber.count === BD.MON_SQUAD.start && sEmber.tribe === 'ember', '새 부대 인원');
const rf = P.refillInfo(sEmber.id);
ok(P.refillSquad(sEmber.id).ok && sEmber.count === BD.MON_SQUAD.start + 1 && R.gold === g0, '보충은 예산만');
// 예산 바닥: 회사 금이 많아도 거절
R.site.budget = 5;
let r = P.buildZone('LB', 'trap');
ok(!r.ok && r.msg.indexOf('예산') >= 0 && R.gold === g0 && P.budgetLeft() === 5, '예산 부족이면 거절 (회사 금으로 안 냄): ' + r.msg);
ok(!P.procureSquad('stone').ok && R.gold === g0, '예산 부족 조달 거절');
R.site.budget = 0;
ok(P.startBattle().ok, '예산 0이어도 다음 주 진행');
R.battling = false; R.bsave = null;
R.site.budget = b0 - pv.cost - pr0.cost - rf.cost;

// ---------- 10) 시설 3종·입구 고정·고정 구역 ----------
ok(JSON.stringify(Z.facFor('LB').sort()) === JSON.stringify(['den', 'empty', 'lure', 'trap']), '방 시설 = 빈 구역 + 3종: ' + Z.facFor('LB'));
ok(JSON.stringify(Z.facFor('E')) === '["split"]', '입구는 분기만');
ok(!P.previewBuild('E', 'wait').ok && !P.buildZone('Y', 'thorn').ok, '입구 방향·덫 숲 거부');
const fz = Object.keys(R.site.fixed)[0];
ok(fz && R.site.zones[fz] === Z.fixedFac(R.site.fixed[fz]) && Z.FAC[R.site.zones[fz]].name === '얼어붙은 하역장', '고정 구역 얼어붙은 하역장 ' + fz);
r = P.buildZone(fz, 'trap');
ok(!r.ok && R.site.zones[fz] === Z.fixedFac('frozen_dock') && r.msg.indexOf('고정') >= 0, '고정 구역 건설 거부: ' + r.msg);
ok(!P.previewBuild(fz, 'empty').ok, '고정 구역 비우기도 거부');

// ---------- 3) 던전 가치 / 전투력 분리 ----------
const free = R.site.squads[0];
let v0 = P.siteValue(), p0 = P.sitePower();
ok(P.buildZone('LD', 'den').ok, '대기실 짓기');
let v1 = P.siteValue();
ok(v1 === v0 + Z.valueOf('den', 'LD'), '가치 = 시설 점수: ' + v0 + '->' + v1);
// 대기실 LD로 침입자가 오게: 미끼로 끌기 전에는 통과 비율이 낮을 수 있음. 일단 배치
ok(P.placeUnit('LD', free.id).ok, '부대 출진');
ok(P.siteValue() === v1, '부대를 넣어도 가치 그대로 (몬스터 제외)');
const pi = P.powerInfo(), part = pi.parts.filter(x => x.z === 'LD')[0];
const W_LD = Z.passRatios(R.site.zones, R.site.units)['LD'] || 0;
const U = free.count * (P.statOf(free.id, 'hp') / BD.POWER.hpDiv + P.statOf(free.id, 'atk'));
ok(part && Math.abs(part.score - Math.round(U * 10) / 10) < 0.11 && Math.abs(part.w - W_LD) < 0.002, 'B안 부대 점수 U·w: ' + JSON.stringify(part) + ' U=' + U + ' w=' + W_LD);
const trapPart = pi.parts.filter(x => x.z === 'CD')[0];
ok(trapPart && Math.abs(trapPart.score - Math.round(Z.trapScore('CD') * 10) / 10) < 0.11, '함정 점수 T');
let sum = 0; pi.parts.forEach(x => sum += x.score * x.w);
ok(pi.total === Math.floor(sum + 1e-6) || Math.abs(pi.total - Math.floor(sum)) <= 1, '전투력 = Σ 점수 × 통과 비율: ' + pi.total + ' / ' + sum);
// 침입자가 안 지나가는 곳(통과 비율 0)의 부대는 전투력 0: 빈 판 대기실 하나만
{
  const zones = Object.assign({}, R.site.zones); Object.keys(zones).forEach(z => { if (Z.zoneType(z) === 'room' && !R.site.fixed[z]) zones[z] = 'empty'; });
  zones.LB = 'lure'; zones.RD = 'den';   // 왼쪽으로 끌면 오른쪽 3은 아무도 안 감? (RB에서도 CB로) -> 비율 확인만
  const w = Z.passRatios(zones, { RD: [free.id] });
  ok(P.powerOf(zones, { RD: [free.id] }) === Math.floor((w.RD || 0) * U + 1e-6), '부대 전투력 = U × w(RD=' + (w.RD || 0) + ')');
  zones.CB = 'lure'; zones.LB = 'empty'; // 미끼 가운데: 모두 가운데로 -> 옆길 0
  const w2 = Z.passRatios(zones, { RD: [free.id] });
  ok(!w2.RD && P.powerOf(zones, { RD: [free.id] }) === 0, '안 지나가는 곳 부대는 0: ' + JSON.stringify(w2));
}
// 친위대는 전투력·가치 제외 (가짜 친위대를 넣고 배치)
R.guards.push({ id: 'g9', tribe: 'ember', name: '꼬리불', lv: 5, exp: 0 });
ok(P.buildZone('LB', 'den').ok, '대기실 2');
let pBefore = P.sitePower(), vBefore = P.siteValue();
ok(P.placeUnit('LB', 'g9').ok, '친위대 출진');
ok(P.sitePower() === pBefore && P.siteValue() === vBefore, '친위대는 전투력·가치에 안 들어감: ' + pBefore + '->' + P.sitePower());
ok(P.unitById('g9').hp === Math.round((70 * 3) * (1 + 0.2 * 4)) && P.unitById('g9').kind === 'guard', '친위대 능력치 = 부족 × 배수 × 레벨: ' + P.unitById('g9').hp);
P.removeUnit('LB', 0); R.guards = [];

// ---------- 6·7) 능력치 표·부족 강화 ----------
const parts = P.statParts(free.id, 'hp');
ok(parts && ['base', 'level', 'upgrade', 'equip', 'enchant'].every(k => typeof parts[k] === 'number') && parts.equip === 0 && parts.enchant === 0, '능력치 조각 자리: ' + JSON.stringify(parts));
ok(BD.STATS.map(s => s.key).join() === 'hp,atk,def', '능력치 항목 표');
const hpBefore = P.statOf(free.id, 'hp');
R.gems = 3;
ok(P.upgradeTribe('stone').ok && R.gems === 0 && P.statOf(free.id, 'hp') === hpBefore + Math.round(120 * 0.1), '부족 보석 강화 -> 체력 +: ' + hpBefore + '->' + P.statOf(free.id, 'hp'));
R.gems = 99;
ok(!P.upgradeTribe('stone').ok && R.gems === 99, '데모는 강화 ' + BD.TRIBE_UP.max + '회까지');
R.gems = 0;

// ---------- 4) 납품 기준 단계·수동 납품 ----------
ok(!P.questProgress().complete && P.deliver() === null && R.phase === 'play', '5단계 전에는 납품 안 됨');
ok(P.questBlockers().length === 1, '막는 이유 한 줄');
// 단계는 순서대로 오름: 1단계 기준을 채우게 함정
let st0 = q1.stage;
['TL', 'TR', 'RB', 'LC', 'RC', 'RD', 'LE', 'RE', 'CB'].forEach(z => { R.site.budget = 999; P.buildZone(z, 'trap'); });
const qp = P.questProgress();
ok(qp.stage > st0 && qp.stage <= 5 && q1.stageWeeks.length === qp.stage, '건설로 단계 오름: ' + qp.line);
ok(typeof qp.line === 'string' && qp.line.indexOf('가치') >= 0 && qp.line.indexOf('전투력') >= 0, '진행표 한 줄: ' + qp.line);
sample.line = qp.line;
// 전투 결과 반영: 자동 납품 없음, 회사 금으로, 참여 경험치
const compB = P.company().exp + P.company().lv * 1000;
const lvB = free.lv;
const rep1 = runBattle(W, P);
ok(R.phase === 'play' && R.report === null, '전투 뒤 자동 납품 없음');
ok(rep1.goldAfter === rep1.goldBefore + rep1.gold - rep1.loot && rep1.repair === 0, '전투 수입은 회사 금으로');
ok(P.budgetLeft() === R.site.budget, '전투가 예산은 안 건드림');
ok(rep1.expGains.some(g => g.id === free.id && g.exp >= BD.EXP.deploy), '출진 부대 경험치: ' + JSON.stringify(rep1.expGains));
ok(!rep1.expGains.some(g => g.id === sEmber.id), '출진 안 한 부대는 경험치 없음');
ok(P.company().exp + P.company().lv * 1000 > compB, '전투로 회사 경험치');
// 참여 경험치: 싸운 부대 = deploy + fight
{
  const fake = { gold: 10, gems: 0, loot: 0, reached: 0, kills: 0, total: 0, squads: 0, deployed: [free.id, sEmber.id], fought: [free.id] };
  P.placeUnit('LB', sEmber.id);
  ok(P.startBattle().ok, '전투 2');
  const e0 = free.exp + 1000 * free.lv, e1 = sEmber.exp;
  const rp = P.applyBattle(fake);
  const gF = rp.expGains.filter(g => g.id === free.id)[0], gE = rp.expGains.filter(g => g.id === sEmber.id)[0];
  ok(gF.exp === BD.EXP.deploy + BD.EXP.fight && gE.exp === BD.EXP.deploy, '싸움 = 출진 + 참여: ' + JSON.stringify(rp.expGains));
}
// 5단계 채우기 (부대 레벨 올려서)
R.site.squads.forEach(s => { s.lv = 12; s.count = BD.MON_SQUAD.cap; });
R.site.budget = 999;
// 미끼(오른쪽 위)로 모두 오른쪽 1 대기실로 몰아 그 부대를 만나게 한다
P.buildZone('TR', 'lure'); P.buildZone('RB', 'den');
P.removeUnit('LD', 0); ok(P.placeUnit('RB', free.id).ok, '오른쪽 1 출진');
ok((Z.passRatios(R.site.zones, R.site.units).RB || 0) > 0.99, '미끼로 몰면 통과 비율 1');
const upd = P.questUpdate();
const qp5 = P.questProgress();
ok(qp5.complete && qp5.stage === 5 && qp5.canDeliver && qp5.line.indexOf('의뢰 완료') === 0, '5단계 = 의뢰 완료: ' + qp5.line);
ok(R.phase === 'play', '완료돼도 자동 납품 없음 (deliver를 불러야)');
// 완료 뒤 값이 떨어지면 납품 다시 막힘 (납품 직전 재확인)
const keepUnits = JSON.parse(JSON.stringify(R.site.units));
R.site.units = {};
ok(!P.questProgress().canDeliver && P.deliver() === null && P.questProgress().complete, '완료 뒤 전투력이 떨어지면 납품 막힘');
R.site.units = keepUnits;
// 납품
R.gems = 0;
const goldPre = R.gold, compPre = P.company();
const d = P.deliver();
if (!d) { problems.push('납품 실패: ' + JSON.stringify(P.questProgress())); console.log(JSON.stringify({ problems, sample })); process.exit(0); }
ok(R.phase === 'settle' && R.quest === null, '납품 -> settle');
ok(R.gold === goldPre + q1.reward.gold && R.gems === q1.reward.gems, '납품 보수 = 회사 금·보석');
ok(d.companyAfter.lv >= 2 && P.company().lv >= 2, '첫 납품 뒤 회사 레벨 2 이상: ' + JSON.stringify([compPre, d.companyAfter]));
ok(R.works.length === 1 && d.work && d.worksEffectNew === true && P.worksInfo().effect.active, '작품집 기록 1 + 효과 켜짐');
ok(Array.isArray(d.handover) && d.handover.length >= 2 && d.carry.every(s => typeof s === 'string') && d.lost.every(s => typeof s === 'string'), '인계 정보');
sample.carry = d.carry; sample.lost = d.lost;

// ---------- 5) 두 번째 의뢰 = 2층 의뢰 ----------
offers = P.offerQuests();
ok(offers.length === 1 && offers[0].key === 'q2' && offers[0].floors === 2, '두 번째 의뢰 = 2층 의뢰: ' + JSON.stringify(offers.map(o => [o.key, o.floors])));
const opensAt = offers[0].stages.findIndex(s => s.opens === 2);
ok(opensAt === 2, '2층은 3단계에 열림');
ok(offers[0].stages[3].floor2 > 0 && offers[0].stages[4].floor2 > 0, '4·5단계에 2층 전투력 조건');
// 저장·불러오기 (settle)
W = boot(); P = W.PROGRESS; ok(P.load() === true && P.RUN.phase === 'settle' && P.RUN.offers.length === 1, 'settle 저장 불러오기'); R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
// 친위대 인계: 불씨도마뱀 부대 하나를 친위대로
const promoteId = R.site.squads.filter(s => s.tribe === 'ember')[0].id, promoteLv = R.site.squads.filter(s => s.tribe === 'ember')[0].lv;
ok(P.pickQuest(R.offers[0], [promoteId, 'nope']) === true && R.phase === 'play' && R.quest.key === 'q2', '2층 의뢰 받기');
ok(R.guards.length === 1 && R.guards[0].name === '꼬리불' && R.guards[0].lv === promoteLv, '친위대 = 이름 있는 개체, 레벨 유지: ' + JSON.stringify(R.guards));
ok(R.site.squads.length === 1 && R.site.squads[0].free && R.site.squads[0].lv === BD.SQUAD_START_LV[R.company.lv - 1], '현장 부대는 새로 (인계됨)');
ok(P.budgetLeft() === R.quest.budget && R.site.floorsOpen === 1, '새 예산·2층 아직 잠김');
const qq = P.questProgress();
ok(qq.floorLock && qq.floorLock.floor === 2 && qq.floorLock.atStage === 3, '진행표 2층 잠김 안내: ' + JSON.stringify(qq.floorLock));
ok(R.tribes.stone === 1, '부족 강화 남음');
// 작품집 효과: 현장 부대 경험치 +10%, 친위대는 아님
R.site.budget = 999; P.buildZone('LD', 'den'); P.buildZone('RD', 'den');
P.placeUnit('LD', R.site.squads[0].id); P.placeUnit('RD', R.guards[0].id);
ok(P.startBattle().ok, '2층 의뢰 전투');
const rw = P.applyBattle({ gold: 0, gems: 0, loot: 0, reached: 0, kills: 0, total: 0, squads: 0, deployed: [R.site.squads[0].id, R.guards[0].id], fought: [R.site.squads[0].id, R.guards[0].id] });
const base = BD.EXP.deploy + BD.EXP.fight;
ok(rw.expGains.filter(g => g.id === R.site.squads[0].id)[0].exp === Math.round(base * 1.1) && rw.expGains.filter(g => g.id === R.guards[0].id)[0].exp === base, '작품집 A: 현장 부대만 +10%: ' + JSON.stringify(rw.expGains));
// 2층 의뢰 3단계 -> 2층 열림 (데이터), 4단계는 2층 전투력 필요라 1차에서는 못 채움
R.site.squads[0].lv = 30; R.site.squads[0].count = BD.MON_SQUAD.cap;
['TL', 'LB', 'LC', 'RC', 'CD', 'LE', 'RE', 'CC'].forEach(z => P.buildZone(z, 'trap'));
P.buildZone('TR', 'lure'); P.buildZone('RB', 'den'); P.removeUnit('LD', 0); P.placeUnit('RB', R.site.squads[0].id);
P.questUpdate();
ok(R.quest.stage === 3 && R.site.floorsOpen === 2 && P.unlocks().floor2, '3단계 달성 -> 2층 열림, 4단계는 2층 전투력 없이 못 감: ' + P.questProgress().line);

// ---------- 8) 고정 구역 효과: 지나간 분대가 느려짐 ----------
{
  const zones = Object.assign({}, R.site.zones);
  const S = W.BSIM.create({ plan: R.plan, zones: zones, units: {}, unitById: P.unitById });
  let chilled = false, evChill = false;
  for (let i = 0; i < 4000 && !S.done; i++) { const ev = W.BSIM.step(S, 0.1); if (ev.some(e => e.type === 'chill')) evChill = true; if (S.squads.some(q => q.chill > 0)) chilled = true; }
  ok(evChill && chilled, '얼어붙은 하역장: chill 사건과 느려짐');
  const snap = W.BSIM.snapshot(S); ok(snap.fought && typeof snap.fought === 'object', '저장 지점에 fought');
}

// ---------- 10) 끈 기능: 지급 없음 ----------
{
  const gg = R.gold, ge = R.gems, nSq = R.site.squads.length, nG = R.guards.length;
  ok(!P.gachaPull().ok && P.gachaInfo().left === 0, '광고 뽑기 꺼짐');
  ok(!P.watchAd().ok && !P.isSurgeWeek() && R.adWeek !== R.week, '광고 대량 출현 꺼짐');
  R.week = 50; ok(!P.isSurgeWeek(), '예고 대량 출현 꺼짐'); R.week = R.plan ? R.plan.week : R.week;
  R.chores.daily.tasks.forEach(t => { t.prog = 999; });
  ok(!P.claimChore('daily', 'd_battle').ok && P.choresClaimable() === 0, '업무 보상 꺼짐');
  R.idle.gold = 500;
  ok(!P.claimIdle().ok && P.idleInfo().gold === 0, '방치 보상 꺼짐');
  R.idle.gold = 0;
  ok(!P.upgradeWorkshop('build').ok && P.buildCost('trap', 'LB') === Z.costOf('trap', 'LB'), '공방 꺼짐 (할인 없음)');
  ok(R.gold === gg && R.gems === ge && R.site.squads.length === nSq && R.guards.length === nG, '끈 기능으로 금·보석·부대가 안 늘어남');
  // 업무 진행도 안 오름
  R.chores.daily.tasks.forEach(t => { t.prog = 0; });
  ok(P.startBattle().ok, '전투 3');
  P.applyBattle({ gold: 0, gems: 0, loot: 0, reached: 0, kills: 0, total: 0, squads: 0, deployed: [], fought: [] });
  ok(R.chores.daily.tasks.every(t => t.prog === 0), '업무 진행 안 오름');
  // 방치: 5시간 뒤 불러와도 안 쌓임
  P.save();
  FAKE_NOW = Date.now() + 5 * 3600 * 1000;
  W = boot(); P = W.PROGRESS; R = P.RUN;
  ok(P.load() === true && R.idle.gold === 0 && R.idle.minutes === 0, '방치 보상 안 쌓임');
  FAKE_NOW = null;
}

// ---------- 9) 저장·불러오기 v6 ----------
{
  const before = JSON.stringify({ g: R.gold, c: R.company, q: R.quest.key, st: R.quest.stage, sq: R.site.squads, gd: R.guards, w: R.works, z: R.site.zones, u: R.site.units, b: R.site.budget });
  W = boot(); P = W.PROGRESS; R = P.RUN;
  ok(P.load() === true, 'v6 불러오기');
  const after = JSON.stringify({ g: R.gold, c: R.company, q: R.quest.key, st: R.quest.stage, sq: R.site.squads, gd: R.guards, w: R.works, z: R.site.zones, u: R.site.units, b: R.site.budget });
  ok(before === after, '저장 전후 같음');
  // 전투 중 저장 -> 불러와도 전투 중
  ok(P.startBattle().ok, '전투 4'); W = boot(); P = W.PROGRESS; ok(P.load() === true && P.RUN.battling && P.RUN.bsave, '전투 중 저장 유지'); R = P.RUN;
  // 깨진 칸 보완
  const sv = JSON.parse(store[KEY]); delete sv.stats; delete sv.works; sv.site.units = { LD: ['s999', sv.site.squads[0].id, sv.site.squads[0].id] }; sv.guards = 'x';
  store[KEY] = JSON.stringify(sv);
  W = boot(); P = W.PROGRESS; R = P.RUN;
  ok(P.load() === true && R.stats.battles === 0 && Array.isArray(R.works) && Array.isArray(R.guards) && JSON.stringify(R.site.units.LD) === JSON.stringify([sv.site.squads[0].id]), '빠진·깨진 칸 채움: ' + JSON.stringify(R.site.units));
  // 옛 버전(v5)은 새 게임, C1 키는 그대로
  store[KEY] = JSON.stringify(Object.assign({}, JSON.parse(store[KEY]), { v: 5 }));
  W = boot(); P = W.PROGRESS;
  ok(P.load() === false && P.RUN.phase === 'choose' && P.RUN.v === 6, 'v5 저장은 새 게임 (변환 없음)');
  ok(store[C1KEY] === '{"v":5,"keep":true}', 'C1 저장 키 그대로');
}
console.log(JSON.stringify({ problems, sample }));
"""


def main():
    tc.setup_output()
    node = shutil.which("node")
    if not node:
        print("[test_d1_core] node 없음: 건너뜀")
        return 0
    tmp = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8")
    try:
        tmp.write(JS)
        tmp.close()
        proc = subprocess.run([node, tmp.name, os.path.join(tc.ROOT, "prototype", "d1_demo")], capture_output=True)
    finally:
        os.unlink(tmp.name)
    out = proc.stdout.decode("utf-8", "replace").strip()
    err = proc.stderr.decode("utf-8", "replace").strip()
    if proc.returncode != 0 or not out:
        print("[test_d1_core] 실패: node 오류\n" + err)
        return 1
    r = json.loads(out.splitlines()[-1])
    if r["problems"]:
        print("[test_d1_core] 실패 %d건" % len(r["problems"]))
        for p in r["problems"]:
            print("  - " + p)
        return 1
    print("[test_d1_core] 통과: 의뢰 예산/회사 금 -> 가치/전투력(B안·친위대 제외) -> 능력치 표·부족 강화 -> 납품 기준 5단계·수동 납품 -> 2층 의뢰·친위대 인계·작품집 -> 고정 구역 -> 끈 기능 지급 없음 -> 저장 v6")
    print("  " + json.dumps(r["sample"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
