"""D1 데모 핵심 규칙 검사 (prototype/d1_demo): 예산·회사 금 분리, 가치/전투력 분리, 납품 기준 5단계·수동 납품, 2층 의뢰, 끈 기능, 저장 v6.

자세히: 의뢰 예산·회사 금 분리, 던전 가치/전투력 분리(친위대 제외·통과 비율),
납품 기준 5단계와 수동 납품, 두 번째 의뢰 = 2층 의뢰, 부대·친위대·능력치 표·참여 경험치·작품집 효과, 고정 구역 거부,
데모에서 끈 기능(광고 뽑기·광고/예고 대량 출현·업무·방치 보상·공방)의 지급 없음, 저장·불러오기 v6 (옛 버전은 새 게임, C1 키 그대로).
2차: 세로 층(2층 열림·층별 구역 id 분리·계단·2층 건설비), 층별 출진(자동 편성·한도·중복 금지·친위대 칸), 2층 전투력 조건,
퇴각·쉼·해제, 첫 의뢰 사망 없음·이후 사망 확률·숙련도 유지·전멸 보충·친위대 불사, 쓰러짐/퇴각/사망 목록,
카드 위기 최대 2장(배속·복원 같음), 튜토리얼은 정산 뒤 꺼짐, 데모 끝(demoEnd), ?seed= 주소 옵션.

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
// 아래 1~10번 일반 규칙 검사는 세 갈래(fork3) 판 구역 id(CD·LB·TR ...)로 짜여 있다. 실제 첫 의뢰 판(외길)은 맨 아래 11번에서 따로 검사
function forkQ1(bd) { bd.QUESTS[0].board = 'fork3'; bd.QUESTS[0].fixed = { CC: 'frozen_dock' }; bd.QUESTS[0].budget = 260; }   // (옛 첫 의뢰 값)
forkQ1(BD);
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
ok(!r.ok && r.msg.indexOf('마석') >= 0 && R.gold === g0 && P.budgetLeft() === 5, '예산 부족이면 거절 (회사 금으로 안 냄): ' + r.msg);
ok(!P.procureSquad('stone').ok && R.gold === g0, '예산 부족 조달 거절');
R.site.budget = 0;
ok(P.startBattle().ok, '예산 0이어도 다음 주 진행');
R.battling = false; R.bsave = null;
R.site.budget = b0 - pv.cost - pr0.cost - rf.cost;

// ---------- 10) 시설 3종·입구 고정·고정 구역 ----------
ok(JSON.stringify(Z.facFor('LB').sort()) === JSON.stringify(['den', 'empty', 'lure', 'trap']), '방 시설 = 빈 구역 + 3종: ' + Z.facFor('LB'));
ok(JSON.stringify(Z.facFor('E')) === '["split","wait"]', '입구는 분기·대기만 (소감 뒤 대기 다시 엶): ' + Z.facFor('E'));
ok(!P.previewBuild('E', 'left').ok && !P.previewBuild('E', 'right').ok && !P.buildZone('Y', 'thorn').ok, '입구 굽은길·덫 숲 거부');
{
  const pw = P.previewBuild('E', 'wait');
  ok(pw.ok && pw.cost === Z.FAC.wait.cost && Z.forecast(pw.zones, {}, 20).at.CB === 20 && !Z.forecast(pw.zones, {}, 20).at.TL, '입구 대기 = 전원 가운데 길: ' + JSON.stringify(Z.forecast(pw.zones, {}, 20).at));
}
const fz = Object.keys(R.site.fixed)[0];
ok(fz && R.site.zones[fz] === Z.fixedFac(R.site.fixed[fz]) && Z.FAC[R.site.zones[fz]].name === '얼어붙은 하역장', '고정 구역 얼어붙은 하역장 ' + fz);
r = P.buildZone(fz, 'trap');
ok(!r.ok && R.site.zones[fz] === Z.fixedFac('frozen_dock') && r.msg.indexOf('고정') >= 0, '고정 구역 건설 거부: ' + r.msg);
ok(!P.previewBuild(fz, 'empty').ok, '고정 구역 비우기도 거부');

// ---------- 3) 던전 가치 / 전투력 분리 ----------
const free = R.site.squads[0];
let v0 = P.siteValue(), p0 = P.sitePower();
ok(R.site.auto === true && P.floorInfo(1).cap === 0 && !P.unitById(free.id).floor, '대기실이 없으면 출진 한도 0 (기본 부대 대기)');
ok(P.buildZone('LD', 'den').ok, '대기실 짓기');
let v1 = P.siteValue();
ok(v1 === v0 + Z.valueOf('den', 'LD'), '가치 = 시설 점수: ' + v0 + '->' + v1);
// 기본 자동 편성: 대기실이 생기면 아무것도 안 해도 기본 부대가 출진 (LD 2칸 = 2자리 -> 부대 둘 다)
ok(P.unitById(free.id).floor === 1 && P.unitById(free.id).placed === 'LD' && R.site.deploy[1].length === 2, '자동 편성: 기본 부대 출진 ' + JSON.stringify(R.site.deploy));
ok(P.setAutoDeploy(false).ok && R.site.auto === false, '자동 편성 끄기');
R.site.deploy[1].slice().forEach(id => P.withdrawUnit(id));
ok(R.site.deploy[1].length === 0 && !Object.keys(R.site.units).length, '출진 해제');
// 대기실 LD로 침입자가 오게: 미끼로 끌기 전에는 통과 비율이 낮을 수 있음. 일단 배치 (예전 placeUnit 호환)
ok(P.placeUnit('LD', free.id).ok && P.unitById(free.id).floor === 1, '부대 출진');
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
ok(P.unitById('g9').hp === Math.round((70 * 3) * (1 + BD.TRIBES[1].grow.hp * 4)) && P.unitById('g9').kind === 'guard', '친위대 능력치 = 부족 × 배수 × 레벨: ' + P.unitById('g9').hp);
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
P.removeUnit('LD', 0); r = P.placeUnit('RB', free.id); ok(r.ok, '오른쪽 1 출진: ' + r.msg + JSON.stringify(R.site.deploy) + JSON.stringify(R.site.units));
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
P.buildZone('TR', 'lure'); P.buildZone('RB', 'den');
ok(R.site.units.RB && R.site.units.RB[0] === R.site.squads[0].id, '자동 편성: 침입자가 다 지나는 RB 대기실에 센 부대부터: ' + JSON.stringify(R.site.units));
P.setAutoDeploy(false);   // (아래 깨진 칸 보완 검사는 자동 편성이 꺼진 상태 기준)
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
  const sv = JSON.parse(store[KEY]); delete sv.stats; delete sv.works; sv.guards = 'x';
  const sid = sv.site.squads[0].id;
  sv.site.deploy = { 1: ['s999', sid, sid], 2: [sid] }; sv.site.rest = 'x'; delete sv.site.pins;
  store[KEY] = JSON.stringify(sv);
  W = boot(); P = W.PROGRESS; R = P.RUN;
  ok(P.load() === true && R.stats.battles === 0 && Array.isArray(R.works) && Array.isArray(R.guards) &&
     JSON.stringify(R.site.deploy[1]) === JSON.stringify([sid]) && R.site.deploy[2].length === 0 && typeof R.site.rest === 'object',
     '빠진·깨진 칸 채움 (없는 부대·중복 출진 버림): ' + JSON.stringify(R.site.deploy));
  // 1차 저장(층별 출진 칸 없음): 대기실 배치(units)에서 출진으로 옮김
  const sv1 = JSON.parse(store[KEY]); delete sv1.site.deploy; delete sv1.site.floors; delete sv1.site.auto;
  const denZ = Object.keys(sv1.site.zones).filter(z => sv1.site.zones[z] === 'den')[0];
  sv1.site.units = {}; sv1.site.units[denZ] = [sid];
  store[KEY] = JSON.stringify(sv1);
  W = boot(); P = W.PROGRESS; R = P.RUN;
  ok(P.load() === true && R.site.deploy[1].indexOf(sid) >= 0 && R.site.floors === 2 && R.site.auto === true, '1차 저장의 대기실 배치 -> 층 출진: ' + JSON.stringify(R.site.deploy));
  // 옛 버전(v5)은 새 게임, C1 키는 그대로
  store[KEY] = JSON.stringify(Object.assign({}, JSON.parse(store[KEY]), { v: 5 }));
  W = boot(); P = W.PROGRESS;
  ok(P.load() === false && P.RUN.phase === 'choose' && P.RUN.v === 6, 'v5 저장은 새 게임 (변환 없음)');
  ok(store[C1KEY] === '{"v":5,"keep":true}', 'C1 저장 키 그대로');
}
// ===================== 2차: 층·층별 출진·퇴각·사망·카드 위기·데모 끝 =====================
// 새 게임을 q2(2층 의뢰)까지 빠르게: q1을 5단계로 채워 납품 -> 친위대 1 -> q2
function freshTo(stageQ) {
  W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
  forkQ1(BD); P.reset(); P.pickQuest(P.offerQuests()[0]);
  if (stageQ === 1) return;
  R.site.budget = 999; P.buildZone('TR', 'lure'); P.buildZone('RB', 'den'); ['CB', 'CD', 'RC', 'RD', 'TL', 'LB', 'LC', 'LD'].forEach(z => P.buildZone(z, 'trap'));
  R.site.squads[0].lv = 20; P.questUpdate();
  ok(P.questProgress().complete, '빠른 q1 완료: ' + P.questProgress().line);
  const rp = P.deliver();
  ok(rp && R.tutorial.on === true && R.phase === 'settle', '납품해도 튜토리얼은 정산 화면까지 켜져 있음 (정산 안내)');
  ok(P.pickQuest(R.offers[0], [R.site.squads[0].id]) && R.tutorial.on === false, '새 의뢰를 고르면 튜토리얼 끝');
}
// ---------- 1) 세로 층: 2층 의뢰는 처음부터 2층 구역이 있고 잠김, id 분리 ----------
freshTo(2);
{
  const f2 = Z.floorInfo(2), f1 = Z.floorInfo(1);
  ok(R.site.floors === 2 && R.site.floorsOpen === 1 && f2 && !f2.open && f1.open, '2층 의뢰 = 층 2개, 2층 잠김');
  ok(f2.ids.every(z => /^2/.test(z)) && f1.ids.every(z => !/^2/.test(z)) && f2.ids.every(z => f1.ids.indexOf(z) < 0), '층별 구역 id 안 섞임: ' + f2.ids.join(','));
  ok(f2.ids.every(z => z in R.site.zones) && R.site.zones['2E'] === 'split' && R.site.zones['2B'] === 'boss', '2층 구역도 저장 칸에 있음');
  ok(Z.goal() === 'B' && Z.routeOf(R.site.zones, {}, {}).slice(-1)[0] === 'B', '잠겨 있으면 보물방 = 1층 B');
  const pv = P.previewBuild('2H', 'trap');
  ok(!pv.ok && pv.locked && !P.buildZone('2H', 'trap').ok, '잠긴 2층은 못 지음: ' + pv.why);
  ok(!P.sortieUnit(R.site.squads[0].id, 2).ok, '잠긴 2층에는 출진 못 함');
  ok(P.questProgress().floorLock && P.questProgress().floorLock.atStage === 3, '진행표 🔒 2층 (3단계)');
  ok(P.floorInfo(2).lockAt === 3 && !P.floorInfo(2).open, 'floorInfo 잠김 단계');
  // 3단계 채우기 -> 2층 열림 + 추가 예산 + 계단 연결
  R.site.budget = 300; const b0 = R.site.budget;
  ['CB', 'CD', 'RC', 'RD', 'TL', 'LB', 'LC'].forEach(z => P.buildZone(z, 'trap')); P.buildZone('TR', 'lure'); P.buildZone('RB', 'den');
  R.site.squads[0].lv = 6; R.guards[0].lv = 6; P.questUpdate();
  const add = BD.QUESTS[1].stages[2].budget || 0;
  ok(R.quest.stage >= 3 && R.site.floorsOpen === 2 && Z.floorInfo(2).open && Z.floorInfo(1).stairs, '3단계 -> 2층 열림: ' + P.questProgress().line);
  ok(R.site.budgetAdded >= add && add > 0, '2층 열림 추가 예산 ' + add);
  ok(Z.goal() === '2B' && Z.isStairs('B') && Z.NAMES.B.indexOf('계단') === 0, '열리면 1층 B = 계단, 보물방 = 2층 2B');
  const route = Z.routeOf(R.site.zones, {}, {});
  ok(route.indexOf('B') >= 0 && route.indexOf('2E') === route.indexOf('B') + 1 && route[route.length - 1] === '2B', '길: 1층 -> 계단 -> 2층 -> 보물방: ' + route.join('>'));
  const w = Z.passRatios(R.site.zones, {});
  ok(Math.abs(w['2E'] - 1) < 1e-9 && Math.abs(w['2H'] - 1) < 1e-9 && Math.abs(w['2L'] - 0.5) < 1e-9, '2층 통과 비율은 2층 입구 기준');
  // 2층 건설비 = 층 배율
  const c2 = P.previewBuild('2H', 'trap');
  ok(c2.ok && c2.cost === Math.round(Z.costOf('trap', '2H') * BD.FLOOR_BUILD_MUL[2]) && c2.floor === 2, '2층 건설비 배율: ' + c2.cost);
  // 대기실 하나 더 지어도 잘 서 있던 부대가 침입자가 덜 오는 새 대기실로 옮겨 가지 않음 (예전: 덜 찬 곳으로 나눠 서서 previewBuild 전투력 -26 등)
  {
    const inRB = R.site.units.RB.slice();
    ['CC', 'LD', 'LE', 'RE', '2L', '2DL'].forEach(z => {
      const p = P.previewBuild(z, 'den');
      ok(p.ok && inRB.every(id => (p.units.RB || []).indexOf(id) >= 0) && p.powerAfter >= p.powerNow,
        '대기실 추가 ' + z + ': RB 부대 그대로, 전투력 안 줄어듦 ' + p.powerNow + ' -> ' + p.powerAfter + ' ' + JSON.stringify(p.units));
    });
  }
  // ---------- 2) 층별 출진: 한도·중복 금지·친위대 칸 ----------
  const sq = R.site.squads[0], g = R.guards[0];
  P.setAutoDeploy(false);
  [sq.id, g.id].forEach(id => { if (P.unitById(id).floor) P.withdrawUnit(id); });
  ok(!P.sortieUnit(sq.id, 2).ok, '2층에 대기실이 없으면 출진 못 함');
  ok(P.buildZone('2H', 'den').ok, '2층 대기실 (4칸)');
  ok(P.floorInfo(2).cap === Math.min(BD.FLOOR_CAP[2], 4), '2층 한도 = min(데이터, 대기실 자리): ' + P.floorInfo(2).cap);
  ok(P.sortieUnit(sq.id, 2).ok && P.unitById(sq.id).floor === 2 && P.unitById(sq.id).placed === '2H', '2층 출진 -> 2층 대기실에 섬');
  ok(!P.sortieUnit(sq.id, 2).ok, '같은 층 중복 출진 거절');
  let r2 = P.sortieUnit(sq.id, 1);
  ok(r2.ok && P.unitById(sq.id).floor === 1 && R.site.deploy[2].indexOf(sq.id) < 0, '다른 층으로 옮기면 한 곳에만: ' + JSON.stringify(R.site.deploy));
  P.sortieUnit(sq.id, 2);
  ok(P.sortieUnit(g.id, 2).ok && R.site.deploy[2].length === 2, '친위대도 출진 칸 차지');
  R.site.budget += 100; ok(P.procureSquad('stone').ok, '부대 조달');
  const s3 = R.site.squads[R.site.squads.length - 1];
  r2 = P.sortieUnit(s3.id, 2);
  ok(!r2.ok && r2.msg.indexOf('한도') >= 0, '2층 한도(' + BD.FLOOR_CAP[2] + ') 넘으면 거절: ' + r2.msg);
  ok(!P.idleUnits().some(u => u.id === sq.id || u.id === g.id) && P.idleUnits().some(u => u.id === s3.id), '대기 목록 = 출진 안 한 부대');
  // 2층 전투력: 친위대 제외, 2층 입구 기준
  const pi = P.powerInfo(), f2p = pi.floors[2] || 0;
  const U = sq.count * (P.statOf(sq.id, 'hp') / BD.POWER.hpDiv + P.statOf(sq.id, 'atk'));
  const w2 = Z.passRatios(R.site.zones, R.site.units)['2H'];
  ok(Math.abs(f2p - Math.floor(U * w2 + 1e-6)) <= 1 && P.floorPower(2) === f2p && P.questProgress().cur.floor2 === f2p, '2층 전투력 = 부대 U × w (친위대 제외): ' + f2p + ' / ' + U * w2);
  // 2층 전투력 조건(4·5단계): 2층에서 부대를 빼면 4단계 못 감
  const st4 = BD.QUESTS[1].stages[3];
  P.withdrawUnit(sq.id);
  ok(P.floorPower(2) < st4.floor2 || P.floorPower(2) === 0, '2층 부대 빼면 2층 전투력 0');
  R.site.budget = 999; ['2L', '2R'].forEach(z => P.buildZone(z, 'trap')); ['LB', 'LC', 'LD', 'TL', 'LE', 'RE'].forEach(z => P.buildZone(z, 'trap'));
  sq.lv = 30; s3.lv = 30; P.sortieUnit(s3.id, 1);
  R.quest.stage = 3; R.quest.stageWeeks = R.quest.stageWeeks.slice(0, 3); P.questUpdate();
  const qp = P.questProgress();
  ok(qp.cur.power >= st4.power && qp.cur.value >= st4.value && qp.cur.floor2 < st4.floor2 && R.quest.stage === 3, '1층 전투력·가치가 넘쳐도 2층 전투력 조건 때문에 4단계 안 됨: ' + qp.line);
  P.sortieUnit(sq.id, 2); P.questUpdate();
  ok(R.quest.stage === 5 && P.questProgress().complete, '2층에 부대를 두면 4·5단계 (의뢰 완료): ' + P.questProgress().line);
  // 전투: 2층까지 가는 분대, 보물방 2B
  ok(P.startBattle().ok, '2층 전투');
  const inp = P.battleInput();
  ok(inp.goal === '2B', '전투 입력 goal = 2B');
  const S = W.BSIM.create(inp);
  let reach2 = false, ev2 = false;
  for (let i = 0; i < 4000 && !S.done; i++) W.BSIM.step(S, 0.1).forEach(e => { if (e.type === 'fight' && e.z === '2H') ev2 = true; });
  ok(S.squads.every(q => q.route[q.route.length - 1] === '2B'), '분대 길 끝 = 2B');
  const res = W.BSIM.result(S);
  ok(res.deployed.indexOf(sq.id) >= 0, '2층 부대도 전투에 나감');
  P.applyBattle(res);
}
// 대기실 추가 (미끼 없음): RB에 몰아 선 부대가 빈 판 비율이 같아 보이는 TR 대기실로 나눠 서지 않음 (예전: 67 -> 37. 몬스터가 보이면 침입자가 피함)
freshTo(2);
{
  R.site.budget = 999; ['CB', 'CD', 'RC', 'RD', 'TL', 'LB', 'LC'].forEach(z => P.buildZone(z, 'trap')); P.buildZone('RB', 'den');
  ['TR', 'CC', 'LD', 'LE', 'RE'].forEach(z => {
    const p = P.previewBuild(z, 'den');
    ok(p.ok && p.powerAfter >= p.powerNow, '미끼 없음 대기실 추가 ' + z + ': 전투력 안 줄어듦 ' + p.powerNow + ' -> ' + p.powerAfter + ' ' + JSON.stringify(p.units));
  });
  const pa = P.previewBuild('TR', 'den'), pb = P.previewBuild('TR', 'den');
  ok(JSON.stringify(pa.units) === JSON.stringify(pb.units) && pa.powerAfter === pb.powerAfter, '편성은 결정적 (같은 입력 = 같은 결과)');
}
// ---------- 4) 퇴각·쉼·해제·사망 ----------
// 가짜 전투 결과로 규칙만 확인 (전투 계산 쪽 퇴각은 아래 BSIM 검사)
function fakeRes(extra) { return Object.assign({ gold: 0, gems: 0, loot: 0, reached: 0, kills: 0, total: 0, squads: 2, deployed: [], fought: [], monRetreat: [] }, extra || {}); }
freshTo(1);
{
  R.site.budget = 999; P.buildZone('CD', 'den'); P.buildZone('RB', 'den');
  const s = R.site.squads[0];
  ok(R.quest.noDeath === true, '첫 의뢰 = 사망 없음 표시');
  s.count = 6; s.lv = 3; s.exp = 2;
  ok(P.startBattle().ok, '전투');
  let rep = P.applyBattle(fakeRes({ deployed: [s.id], monRetreat: [{ id: s.id, big: true, down: 6 }], monDown: {} }));
  ok(s.count === 6 && rep.deaths === 0 && rep.retreats.length === 1 && rep.noDeath, '첫 의뢰: 큰 피해로 퇴각해도 사망 없음');
  ok(s.lv === 3 || s.lv > 3, '숙련도·레벨 안 줄어듦');
  ok(P.isResting(s.id) && P.unitById(s.id).resting && R.site.rest[s.id] === R.week, '퇴각 -> 이번 주 쉼 (week ' + R.week + ')');
  ok(rep.casualties && rep.casualties.retreated.length === 1 && rep.casualties.down.length === 1 && rep.casualties.down[0].n === 6 && rep.casualties.died.length === 0, '결과: 쓰러짐·퇴각·사망 구분: ' + JSON.stringify(rep.casualties));
  ok(P.unitById(s.id).floor === 1 && !P.battleInput().units[P.unitById(s.id).placed], '쉬는 부대는 자리 그대로, 전투 입력에서 빠짐');
  ok(P.sitePower() > 0, '쉬는 부대도 인계 편성이라 전투력에 셈');
  ok(P.startBattle().msgs.some(m => m.indexOf('쉬는') >= 0), '다음 주 알림: 쉬는 부대');
  rep = P.applyBattle(fakeRes({ deployed: [] }));
  ok(!rep.expGains.some(g => g.id === s.id), '쉬는 주에는 경험치 없음');
  ok(!P.isResting(s.id) && !(s.id in R.site.rest), '그다음 주 저절로 복귀');
}
freshTo(2);
{
  R.site.budget = 999; P.buildZone('CD', 'den'); P.buildZone('RB', 'den');
  const s = R.site.squads[0], g = R.guards[0];
  ok(R.quest.noDeath === true, '두 번째 의뢰도 사망 없음 (데모)');
  R.quest.noDeath = false;  // 출시판용 사망 규칙은 계속 검사
  // 사망 확률: 큰 피해 퇴각만, 여러 판 굴려 비율 확인
  let died = 0, n = 0;
  for (let k = 0; k < 40; k++) {
    s.count = 6; s.lv = 4; s.exp = 0;
    P.startBattle();
    const rp = P.applyBattle(fakeRes({ deployed: [s.id], monRetreat: [{ id: s.id, big: true, down: 2 }] }));
    died += rp.deaths; n += 2;
    ok(s.lv >= 4, '사망해도 숙련도 유지');
    if (rp.deaths) ok(rp.casualties.died[0].n === rp.deaths && s.count === 6 - rp.deaths, '사망 = 인원 감소');
  }
  const rate = died / n;
  ok(rate > BD.RETREAT.deathChance * 0.4 && rate < BD.RETREAT.deathChance * 1.7, '쓰러진 인원 사망 비율 ~' + BD.RETREAT.deathChance + ': ' + rate.toFixed(2));
  s.count = 6; P.startBattle();
  let rp = P.applyBattle(fakeRes({ deployed: [s.id], monRetreat: [{ id: s.id, big: false, down: 4 }] }));
  ok(rp.deaths === 0 && s.count === 6, '큰 피해가 아니면 퇴각해도 사망 없음');
  // 전멸 -> 다음 주 기본 인원 무료 보충, 레벨 유지
  const R0 = BD.RETREAT.deathChance; BD.RETREAT.deathChance = 1;
  s.count = 2; s.lv = 7; P.startBattle();
  rp = P.applyBattle(fakeRes({ deployed: [s.id], monRetreat: [{ id: s.id, big: true, down: 2 }] }));
  ok(rp.deaths === 2 && rp.retreats[0].wiped && s.count === BD.MON_SQUAD.start && s.lv === 7 && rp.retreats[0].refill === BD.MON_SQUAD.start, '전멸 -> 기본 ' + BD.MON_SQUAD.start + '명 무료 보충, 레벨 유지: ' + JSON.stringify(rp.retreats));
  // 친위대 불사
  P.startBattle();
  rp = P.applyBattle(fakeRes({ deployed: [g.id], monRetreat: [{ id: g.id, big: true, down: 1 }] }));
  ok(rp.deaths === 0 && R.guards.length === 1 && P.isResting(g.id) && rp.retreats[0].kind === 'guard', '친위대는 쓰러져도 퇴각만 (불사)');
  BD.RETREAT.deathChance = R0;
}
// 전투 계산 쪽 퇴각: 약한 부대 하나가 강한 침입자를 막으면 퇴각 사건 + 결과 monRetreat
freshTo(1);
{
  R.site.budget = 999; P.buildZone('TR', 'lure'); P.buildZone('RB', 'den');
  ok(P.unitById(R.site.squads[0].id).placed === 'RB', '미끼 뒤 대기실에 자동 출진');
  P.startBattle();
  const plan = JSON.parse(JSON.stringify(R.plan)); plan.groups.forEach(gp => { gp.lv = 60; }); plan.power = 1;
  const inp = P.battleInput(plan); const S = W.BSIM.create(inp);
  let ret = null;
  for (let i = 0; i < 4000 && !S.done; i++) W.BSIM.step(S, 0.1).forEach(e => { if (e.type === 'mretreat') ret = e; });
  const res = W.BSIM.result(S);
  // RB 대기실(2칸)에는 기본 부대 + 대기실을 지어 받은 부대가 같이 선다 -> 둘 다 퇴각할 수 있음
  const inRB = R.site.units.RB || [];
  ok(ret && inRB.indexOf(ret.id) >= 0 && res.monRetreat.length >= 1 && res.monRetreat.length === new Set(res.monRetreat.map(m => m.id)).size &&
     res.monRetreat.every(m => inRB.indexOf(m.id) >= 0) && res.monRetreat.some(m => m.id === ret.id), '전투 중 퇴각 사건·결과: ' + JSON.stringify([ret, res.monRetreat]));
  ok(S.dens.RB.every(m => m.out), '퇴각한 부대는 그 뒤 싸우지 않음 (out)');
  const snap = W.BSIM.snapshot(S); ok(snap.mu && snap.crisis, '저장 지점에 퇴각·위기 상태');
  const rp = P.applyBattle(res);
  ok(rp.retreats.length === res.monRetreat.length && res.monRetreat.every(m => P.isResting(m.id)), '실제 전투 퇴각 -> 쉼');
}
// ---------- 5) 카드 위기: 최대 2장, 배속·재접속 같음 ----------
freshTo(1);
{
  const rule = P.cardRule();
  ok(rule.mode === 'crisis' && rule.maxPerBattle === 2 && rule.kinds.length === 3, '카드 규칙: ' + JSON.stringify(rule));
  P.startBattle();
  function runCount(dt, plan, cut) {
    const S = W.BSIM.create(P.battleInput(plan)); const list = [];
    for (let i = 0; i < 8000 && !S.done; i++) {
      if (cut && i === cut) { const sn = W.BSIM.snapshot(S); const S2 = W.BSIM.restore(P.battleInput(plan), sn); Object.keys(S).forEach(k => delete S[k]); Object.assign(S, S2); }
      W.BSIM.step(S, dt).forEach(e => { if (e.type === 'crisis') list.push(e.kind); });
    }
    return { list, S };
  }
  // 빈 던전: 분대 둘이 보물방 앞까지 -> 위기 2장 (분대마다 한 번)
  let a = runCount(0.1, R.plan);
  ok(a.list.length === 2 && a.list.every(k => k === 'treasure') && W.BSIM.crisisLeft(a.S) === 0, '보물방 근접 위기 2장: ' + a.list);
  let b = runCount(0.5, R.plan);
  let c = runCount(0.1, R.plan, 150);
  ok(b.list.length === a.list.length && c.list.length === a.list.length, '배속(dt)·중간 저장 복원에도 같은 수: ' + [a.list.length, b.list.length, c.list.length]);
  // 대량 출현 주: 분대 많아도 최대 2장
  const sp = JSON.parse(JSON.stringify(R.plan)); sp.surge = true; sp.boss = true;
  sp.groups = sp.groups.concat(sp.groups).map(gp => Object.assign({}, gp, { count: 30 }));
  const d = runCount(0.1, sp);
  ok(d.list.length === 2 && d.list[0] === 'surge' && d.list[1] === 'boss', '대량 출현·보스도 합쳐 최대 2장: ' + d.list);
  P.applyBattle(W.BSIM.result(a.S));
}
// ---------- 데모 끝 ----------
freshTo(2);
{
  R.site.budget = 999; P.buildZone('TR', 'lure'); P.buildZone('RB', 'den');
  R.site.squads[0].lv = 30; R.guards[0].lv = 30; R.site.squads[0].count = 6;
  ['CB', 'CD', 'RC', 'RD', 'TL', 'LB', 'LC', 'LD'].forEach(z => P.buildZone(z, 'trap')); P.questUpdate();
  ok(P.buildZone('2H', 'den').ok, '2층 열린 뒤 2층 대기실');
  ['2L', '2R', '2DL', '2DR'].forEach(z => P.buildZone(z, 'trap'));
  P.procureSquad('stone'); const s2 = R.site.squads[R.site.squads.length - 1]; s2.lv = 30; s2.count = 6;
  P.setAutoDeploy(false); [s2.id, R.site.squads[0].id, R.guards[0].id].forEach(id => P.withdrawUnit(id));
  P.sortieUnit(R.site.squads[0].id, 1); const so = P.sortieUnit(s2.id, 2); P.questUpdate();
  ok(so.ok, '2층 출진: ' + so.msg + JSON.stringify(R.site.deploy) + JSON.stringify(P.floorInfo(2)));
  ok(P.questProgress().complete, 'q2 완료: ' + P.questProgress().line);
  const rp = P.deliver();
  ok(rp && rp.demoEnd === true && R.phase === 'settle' && P.demoState().end && P.demoState().canLeave, '두 번째 납품 -> 데모 끝 신호: ' + JSON.stringify(P.demoState()));
  ok(P.offerQuests().length === 0, '다음 의뢰 없음');
  const lv = P.leaveSettle();
  ok(lv.ok && R.phase === 'demoEnd' && P.unlocks().demoEnd && !P.startBattle().ok && P.offerQuests().length === 0, '정산을 닫으면 demoEnd (다음 주 없음)');
  W = boot(); P = W.PROGRESS; ok(P.load() === true && P.RUN.phase === 'demoEnd', 'demoEnd 저장 유지');
}
// ---------- ?seed= 주소 옵션 ----------
{
  const W2 = (function () {
    const sb = { console, Math, JSON, Date: FakeDate, Object, Array, String, Number, location: { search: '?seed=12345' } };
    sb.window = sb; const st = {};
    sb.localStorage = { getItem: k => (k in st ? st[k] : null), setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } };
    vm.createContext(sb);
    ['battle_data.js', 'zones.js', 'progress.js', 'battle_sim.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sb, { filename: f }));
    return sb;
  })();
  ok(W2.PROGRESS.RUN.seed === 12345, '?seed= 주소 옵션 = 새 게임 씨앗: ' + W2.PROGRESS.RUN.seed);
}
// ===================== 11) 사용자 플레이 소감 뒤 (2026-10-23): 외길 첫 판·튜토리얼 강조·마석 보급·대기실 부대 =====================
W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
P.reset(); P.pickQuest(P.offerQuests()[0]);
{
  // 첫 의뢰 = 외길, 갈림길은 두 번째 의뢰부터
  ok(R.quest.key === 'q1' && R.site.board === 'line' && BD.QUESTS[1].board === 'fork3', '첫 의뢰 = 외길 판, 두 번째 = 세 갈래: ' + R.site.board);
  const must = Z.mustPass();
  ok(JSON.stringify(must) === JSON.stringify(['R1', 'R2', 'R3', 'R4', 'R5']), '외길에서 반드시 지나는 구역 = 큰길 R1~R5: ' + must);
  const fz = Object.keys(R.site.fixed)[0];
  ok(fz && must.indexOf(fz) >= 0 && R.site.zones[fz] === Z.fixedFac('frozen_dock'), '고정 구역(얼어붙은 하역장)이 큰길 위: ' + fz);
  const tp = P.tutorialPath();
  ok(Array.isArray(tp) && tp.length >= 3 && tp.indexOf(fz) < 0 && tp.every(z => must.indexOf(z) >= 0 && Z.zoneType(z) === 'room'), '튜토리얼 강조 = 모두 지나는 큰길 중 지을 수 있는 칸: ' + tp);
  sample.tutorialPath = tp;
  // 강조 칸은 어떤 시설 배치에서도 침입자 전원이 지난다 (길 계산 + 실제 전투 분대 길)
  const layouts = [{}, { NL1: 'lure' }, { NR2: 'lure', R2: 'den' }, { NL3: 'den', NR3: 'lure', R4: 'trap' }, { NL1: 'den', NR1: 'den', R1: 'lure' }];
  layouts.forEach((lay, i) => {
    const zones = Object.assign({}, R.site.zones, lay), units = {};
    Object.keys(lay).forEach(z => { if (lay[z] === 'den') units[z] = [R.site.squads[0].id]; });
    const w = Z.passRatios(zones, units);
    ok(tp.concat([fz]).every(z => Math.abs((w[z] || 0) - 1) < 1e-9), '배치 ' + i + ': 강조 칸 통과 비율 1: ' + JSON.stringify(w));
    const turn = {};
    for (let k = 0; k < 6; k++) { const r = Z.routeOf(zones, units, turn); ok(tp.every(z => r.indexOf(z) >= 0), '배치 ' + i + ' 분대 ' + k + ' 길에 강조 칸 전부: ' + r.join('>')); }
  });
  {
    R.site.budget = 999; P.buildZone('NL1', 'lure');
    P.startBattle();
    const S = W.BSIM.create(P.battleInput());
    ok(S.squads.length >= 2 && S.squads.every(q => tp.every(z => q.route.indexOf(z) >= 0)), '실제 전투: 모든 분대 길에 강조 칸: ' + S.squads.map(q => q.route.join('>')).join(' / '));
    R.battling = false; R.bsave = null;
  }
  // 세 갈래 판(두 번째 의뢰)에는 반드시 지나는 방이 없다 -> 그래서 첫 의뢰에서 뺌
  Z.useSite('fork3', 1, 1);
  ok(Z.mustPass().filter(z => Z.zoneType(z) === 'room').length === 0, '세 갈래 판은 모두 지나는 방이 없음');
  Z.useSite(R.site.board, R.site.floors, R.site.floorsOpen);
}
// 마석 보급: 매주 큰길 시설 하나 값
W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
P.reset(); P.pickQuest(P.offerQuests()[0]);
{
  ok(P.weeklyBudget() === BD.WEEKLY_BUDGET && BD.WEEKLY_BUDGET === 30 && P.questProgress().weeklyBudget === 30, '마석 보급 값 API: ' + P.weeklyBudget());
  const cheap = Math.min.apply(null, P.tutorialPath().map(z => Math.min(P.buildCost('trap', z), P.buildCost('den', z))));
  ok(P.weeklyBudget() >= cheap, '보급 한 번으로 큰길 시설 하나: ' + P.weeklyBudget() + ' >= ' + cheap);
  R.site.budget = 0;
  P.startBattle();
  const rp = P.applyBattle({ gold: 0, gems: 0, loot: 0, reached: 0, kills: 0, total: 0, squads: 0, deployed: [], fought: [] });
  ok(rp.budgetGain === 30 && rp.budgetAfter === 30 && P.budgetLeft() === 30 && R.site.budgetAdded === 30, '전투 뒤 마석 +30: ' + JSON.stringify([rp.budgetGain, rp.budgetAfter]));
  const pv = P.previewBuild('R1', 'trap');
  ok(pv.ok, '마석 0에서 보급만으로 큰길 함정 가능: ' + pv.why);
}
// 대기실을 지으면 기본 부대 +1 (자동 편성), 철거·재건으로는 안 늘어남
W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
P.reset(); P.pickQuest(P.offerQuests()[0]);
{
  const st = R.site, n0 = st.squads.length, fr = BD.MON_SQUAD_FREE;
  ok(n0 === 1 && st.denGifts === 0, '처음: 무료 기본 부대 1, 받은 대기실 부대 0');
  const pv = P.previewBuild('R2', 'den');
  ok(pv.ok && pv.gift === 1 && pv.giftTribe === fr.tribe && pv.giftCount === fr.count && /부대 \+1/.test(pv.giftText), '미리보기에 부대 +1: ' + JSON.stringify([pv.gift, pv.giftText]));
  const b0 = P.budgetLeft();
  let r = P.buildZone('R2', 'den');
  ok(r.ok && r.gift === 1 && r.msg.indexOf('부대 +1') >= 0 && r.units.length === 1, '완공 메시지에 부대 +1: ' + r.msg);
  const g = st.squads[st.squads.length - 1];
  ok(st.squads.length === n0 + 1 && g.tribe === fr.tribe && g.count === fr.count && g.free && g.lv === BD.SQUAD_START_LV[0] && st.denGifts === 1, '받은 부대 = 기본 부족·인원·무료: ' + JSON.stringify(g));
  ok(P.budgetLeft() === b0 - pv.cost, '부대는 공짜 (마석은 대기실 값만)');
  ok(st.auto && st.deploy[1].indexOf(g.id) >= 0 && st.deploy[1].indexOf(st.squads[0].id) >= 0 && (st.units.R2 || []).length === 2, '자동 편성: 기본 부대 + 새 부대 둘 다 출진: ' + JSON.stringify(st.deploy));
  ok(P.sitePower() === pv.powerAfter, '미리보기 전투력 = 지은 뒤 전투력 (새 부대 포함): ' + pv.powerAfter + ' / ' + P.sitePower());
  // 철거·재건 반복: 부대가 안 늘어남
  st.budget = 9999;
  for (let k = 0; k < 5; k++) {
    ok(P.buildZone('R2', 'empty').ok, '철거 ' + k);
    const p2 = P.previewBuild('R2', 'den');
    r = P.buildZone('R2', 'den');
    ok(r.ok && !r.gift && p2.gift === 0 && st.squads.length === n0 + 1, '재건 ' + k + ': 부대 그대로 ' + st.squads.length);
  }
  // 다른 칸으로 옮겨 짓기 (철거 뒤 다른 칸): 안 늘어남
  P.buildZone('R2', 'empty'); r = P.buildZone('NL2', 'den');
  ok(r.ok && !r.gift && st.squads.length === n0 + 1, '옮겨 짓기로는 부대 안 늘어남');
  // 대기실이 동시에 둘이 되면 하나 더
  r = P.buildZone('R4', 'den');
  ok(r.ok && r.gift === 1 && st.squads.length === n0 + 2 && st.denGifts === 2, '대기실 2개째 -> 부대 +1');
  ok(st.denGifts <= Z.summary(st.zones, {}, null).den * BD.DEN_GIFT, '받은 수 <= 대기실 수 최고치');
  // 마석 0: 대기실을 못 지으니 부대도 안 생김
  st.budget = 0;
  r = P.buildZone('NR2', 'den');
  ok(!r.ok && st.squads.length === n0 + 2 && st.denGifts === 2, '마석 0이면 대기실도 부대도 없음: ' + r.msg);
  // 저장·불러오기: denGifts 유지
  P.save(); W = boot(); P = W.PROGRESS; R = P.RUN;
  ok(P.load() && R.site.denGifts === 2 && R.site.squads.length === n0 + 2, 'denGifts 저장 유지');
  // 옛 v6 저장 (denGifts 칸 없음): 이미 있는 대기실 수만큼 받은 것으로 침 (소급 지급 없음)
  const sv = JSON.parse(store[KEY]); delete sv.site.denGifts; store[KEY] = JSON.stringify(sv);
  W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA;
  const dens = W.ZONES.summary(R.site.zones, {}, null).den;
  ok(P.load() && R.v === 6 && R.site.denGifts === dens && R.site.squads.length === n0 + 2, '옛 v6 저장: denGifts = 지금 대기실 수 (' + dens + '), 부대 소급 없음');
  R.site.budget = 999;
  ok(P.buildZone('NL2', 'empty').ok && !P.buildZone('NL2', 'den').gift, '옛 저장: 있던 대기실 재건은 부대 없음');
  ok(P.buildZone('NR3', 'den').gift === 1, '옛 저장: 새 대기실(동시 수 최고치 넘음)은 부대 +1');
}
// 옛 v6 저장의 세 갈래 첫 현장: 반드시 지나는 방이 없어도 튜토리얼 강조가 빈 배열이 아님 (가장 많이 지나는 칸)
W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
forkQ1(BD); P.reset(); P.pickQuest(P.offerQuests()[0]);
{
  P.save(); W = boot(); P = W.PROGRESS; R = P.RUN; Z = W.ZONES;   // 데이터는 외길이지만 저장된 현장은 세 갈래
  ok(P.load() && R.site.board === 'fork3', '옛 저장 세 갈래 첫 현장 유지');
  const tp = P.tutorialPath();
  ok(Array.isArray(tp) && tp.length > 0 && tp.every(z => Z.zoneType(z) === 'room' && !R.site.fixed[z]), '세 갈래 옛 저장: 강조 칸 있음 ' + tp);
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
    print("[test_d1_core] 통과: 의뢰 예산/회사 금 -> 가치/전투력(B안·친위대 제외) -> 능력치 표·부족 강화 -> 납품 기준 5단계·수동 납품 -> 2층 의뢰·친위대 인계·작품집 -> 고정 구역 -> 끈 기능 지급 없음 -> 저장 v6 -> 2차: 층·층별 출진·2층 전투력·퇴각·사망·카드 위기·데모 끝·?seed=")
    print("  " + json.dumps(r["sample"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
