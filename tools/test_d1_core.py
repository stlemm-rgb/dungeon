"""D1 데모 핵심 규칙 검사 (prototype/d1_demo): 문 토큰 판·탐험·조우 즉시 승패, 마석/회사 금, 가치/전투력, 납품 단계, 층, 저장 v7.

자세히: 판 데이터(g1 5×7·고정 구역·문 토큰 수·처음 배치 유효·옮길 수 있는 문 여러 개), 탐험 규칙(미끼·습관·맵핑·같은 시드 = 같은 길),
미리보기 경로 = 실제 전투 경로, 문 옮기기 미리보기·확정(tokens·target·disconnected·limit·budget·locked), 조사·가 본 방 빠르게·함정 같은 분대 2회,
조우 즉시 승패(힘 비교 ±20%·진 쪽 퇴각·이긴 쪽 피해 상한·2초 멈춤·침입자 절반 퇴각·시간 초과 = 방어 성공·사망 없음), 결과 요약 한 줄,
의뢰 예산·회사 금 분리, 던전 가치/전투력(B안), 납품 기준 5단계·수동 납품·q1 뒤 데모 끝(q2 숨김), 층(시험용 2층 의뢰: 층별 차례 전투),
층별 출진·퇴각·쉼, 카드 위기 최대 2장(배속·복원 같음), 대기실 기본 부대, 끈 기능, 저장 v7·깨진 문 보완, ?seed=,
시설 강화(단계·비용·거절·실제 전투 피해·체력·전투력 일치·문만 옮기면 유지·교체 환급 1번·무료 부대 중복 없음·저장·전투 이어하기·옛 v7·납품 인계).
1~15절은 예전 주 단위 규칙이라 BATTLE_DATA.FLOW.on을 끄고 불러온다. 16절 = 흐름 시험(켬): 일반 판 번호·씨앗, 금만 받음, 판 중 건설 = 그 판 버림,
보스 도전·고정 시드·결정론·보스 중 잠김·새로고침 이어하기·실패(잃는 것 없음)·문 고쳐 성공·첫 성공 보상 한 번·납품·흐름 칸 없는 옛 v7.
17절 = 마석 경제(켬): 시작 마석·일반 판/실패/재도전 0·단계 보급 + 첫 성공 보상 한 번·새로고침/중간 저장 이어하기 중복 없음·받은 단계 다시 안 줌·5단계 합계.
옛 v6 저장 바꾸기(B안)는 tools/test_oldsaves.py가 tools/oldsaves/d1/로 검사한다.

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
// 흐름 시험(BATTLE_DATA.FLOW.on): 1~14절은 예전 주 단위 규칙을 검사하므로 끄고 불러옴, 16절에서 켬
let FLOW_ON = false;
function boot(search) {
  const sb = { console, Math, JSON, Date: FakeDate, Object, Array, String, Number };
  if (search) sb.location = { search };
  sb.window = sb;
  sb.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  vm.createContext(sb);
  ['battle_data.js', 'zones.js', 'progress.js', 'battle_sim.js'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sb, { filename: f });
    if (f === 'battle_data.js' && sb.BATTLE_DATA.FLOW) sb.BATTLE_DATA.FLOW.on = FLOW_ON;
  });
  return sb;
}
function runSim(W, inp, dt, onEv) {
  const S = W.BSIM.create(inp);
  for (let i = 0; i < 6000 && !S.done; i++) { const ev = W.BSIM.step(S, dt || 0.1); if (onEv) onEv(ev, S); if (S.pending) W.BSIM.nextFloor(S); }
  return S;
}
function runBattle(W, P) {
  ok(P.startBattle().ok, '전투 시작');
  const S = runSim(W, P.battleInput());
  ok(S.done, '전투 끝남');
  return P.applyBattle(W.BSIM.result(S));
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sample = {};
store[C1KEY] = '{"v":5,"keep":true}';   // C1 저장은 건드리지 않아야 함
let W = boot(), P = W.PROGRESS, R = P.RUN, BD = W.BATTLE_DATA, Z = W.ZONES;
function fresh() { W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES; P.reset(); }
function startQ1() { fresh(); P.pickQuest(P.offerQuests()[0]); }
// 시험용 2층 의뢰: 숨긴 q2를 켜고 두 층 모두 g1 판으로 (층 규칙 검사용, 데모 데이터는 그대로)
function enableQ2(bd) { bd.QUESTS[1].hidden = false; bd.QUESTS[1].boards = ['g1', 'g1']; }
P.reset();
ok(R.v === 7 && P.VERSION === 7 && P.SAVE_KEY === KEY, '저장 v7·키 ' + P.SAVE_KEY);

// ===================== 1) 판 데이터 g1 =====================
startQ1();
const LIMIT = BD.GRID.passLimit;
{
  const g = Z.grid(1), rooms = Object.keys(g.rooms);
  ok(g.cols === 5 && g.rows === 7 && g.cells.length === 7 && g.cells[0].length === 5, '판 5×7');
  ok(g.cells[0][2] === 'E' && g.cells[6][2] === 'B' && g.entry === 'E' && g.goal === 'B', '입구 C1 -> 방 E, 보물방 C7 -> 방 B');
  ok(same(g.rooms.FZ1, ['B4', 'C4', 'D4']) && g.cells[3][1] === 'FZ1' && g.cells[3][3] === 'FZ1', '고정 구역 FZ1 = B4·C4·D4');
  ok(rooms.length === 33 && g.rooms.B3 && same(g.rooms.B3, ['B3']), '방 33개, 1칸 방 id = 칸 id');
  const ed = Z.edges(1), ids = ed.map(e => e.id);
  ok(ids.indexOf('B4-C4') < 0 && ids.indexOf('C4-D4') < 0 && ids.indexOf('B3-B4') >= 0 && ids.indexOf('A4-B4') >= 0, '고정 구역 안쪽 벽은 벽 조각 아님');
  ok(ed.length === 5 * 6 + 4 * 7 - 2, '벽 조각 수 = 이웃 칸 쌍 - 안쪽 2: ' + ed.length);
  const e = ed.filter(x => x.id === 'C2-C3')[0], e2 = ed.filter(x => x.id === 'B3-C3')[0];
  ok(e && !e.vertical && e.x === 2.5 && e.y === 2 && e.ra === 'C2' && e2 && e2.vertical && e2.x === 2 && e2.y === 2.5, '벽 조각 좌표·방향: ' + JSON.stringify([e, e2]));
  ok(same(Z.doorPoint('C2-C3'), { x: 2.5, y: 2 }) && same(Z.roomCenter('FZ1'), { x: 2.5, y: 3.5 }) && same(Z.roomCenter('B3'), { x: 1.5, y: 2.5 }), 'doorPoint·roomCenter');
  const di = P.doorInfo(1);
  ok(di && di.count === rooms.length + 2 && di.doors.length === di.count && di.limit === LIMIT && di.canEdit, '문 토큰 = 방 수 + 2 (' + di.count + '), doorInfo: ' + JSON.stringify([di.count, di.limit, di.canEdit]));
  ok(same(R.site.doors, { 1: BD.GRID_BOARDS.g1.doors }) && same(R.site.boards, ['g1']) && R.site.fixed.FZ1 === 'frozen_dock' && R.site.zones.FZ1 === 'fz_frozen_dock', '현장 = g1 처음 문·고정 구역');
  ok(Z.validateDoors(R.site.doors[1], 1).ok, '처음 문 배치: 모든 방이 입구와 이어짐');
  const inf = Z.passInfo(R.site.zones);
  ok(inf.n === 12 && inf.maxPass <= LIMIT, '처음 배치 미리보기 경로 12개 최대 문 통과 ' + inf.maxPass + ' <= 한도 ' + LIMIT);
  sample.firstPasses = inf.passes;
  // 가능한 문 이동 여러 개 (문 하나를 다른 빈 벽으로)
  const doors = R.site.doors[1]; let valid = 0, tried = 0;
  doors.forEach(from => ids.forEach(to => {
    if (doors.indexOf(to) >= 0) return;
    tried++;
    const ch = { doors: { 1: doors.map(d => d === from ? to : d) } };
    if (P.previewLayout(ch).ok) valid++;
  }));
  ok(valid >= 20, '처음 배치에서 확정 가능한 문 하나 옮기기 ' + valid + '/' + tried);
  sample.validMoves = valid + '/' + tried;
  ok(R.quest.board === 'g1' && same(R.quest.boards, ['g1']) && R.quest.fixed.FZ1 === 'frozen_dock', '의뢰에 판 id·고정 구역');
  ok(Z.boardInfo('g1').MAP[6][2] === 'B' && Z.boardInfo('g1').NAMES.FZ1 === '얼어붙은 하역장', 'boardInfo (의뢰 카드 미리보기)');
  ok(Z.NAMES.B3 === '왼쪽 3' && Z.NAMES.C4 === undefined && Z.NAMES.E === '입구', '방 이름: ' + Z.NAMES.B3);
  // 옛 화면 호환: MAP = 1층 방 id, flowPairs = 문으로 이어진 방 쌍, sharedEdge = 문의 두 칸
  ok(Z.MAP[3][2] === 'FZ1' && Z.flowPairs().length === 35 && same(Z.sharedEdge('C2', 'C3'), [[1, 2], [2, 2]]), '옛 화면 호환 MAP·flowPairs·sharedEdge');
}

// ===================== 2) 탐험 규칙 =====================
{
  const zones = R.site.zones, doors = R.site.doors[1];
  // 같은 입력 = 같은 길, 길은 열린 문으로만 이어짐, 보물방에서 끝
  for (let s = 0; s < 30; s++) for (let h = 0; h < 3; h++) {
    const r = Z.exploreRoute(doors, zones, h, s), r2 = Z.exploreRoute(doors.slice().reverse(), zones, h, s);
    ok(same(r, r2), '같은 배치(문 순서 무관) + 같은 시드 = 같은 길 s' + s + ' h' + h);
    ok(r.reached && r.rooms[0] === 'E' && r.rooms[r.rooms.length - 1] === 'B', '보물방에서 끝 s' + s);
    let prev = 'E', seen = { E: true };
    r.steps.forEach(st => {
      const ed = Z.edges(1).filter(x => x.id === st.edge)[0];
      ok(st.from === prev && ed && doors.indexOf(st.edge) >= 0 && ((ed.ra === st.from && ed.rb === st.to) || (ed.rb === st.from && ed.ra === st.to)), '걸음은 열린 문으로 이웃 방: ' + JSON.stringify(st));
      ok(!st.backtrack || seen[st.to], '되돌아가는 걸음은 가 본 방으로만 (맵핑)');
      ok(st.backtrack || !seen[st.to], '새 걸음은 안 가 본 방으로');
      seen[st.to] = true; prev = st.to;
    });
  }
  // 습관: 입구에서 첫 걸음 (왼쪽 B1 · 오른쪽 D1 · 아래 C2) 60% 안팎
  const first = [{}, {}, {}];
  for (let s = 0; s < 400; s++) for (let h = 0; h < 3; h++) { const t = Z.exploreRoute(doors, zones, h, s).steps[0].to; first[h][t] = (first[h][t] || 0) + 1; }
  ok(first[0].B1 / 400 > 0.5 && first[0].B1 / 400 < 0.7 && first[1].D1 / 400 > 0.5 && first[1].D1 / 400 < 0.7 && first[2].C2 / 400 > 0.5 && first[2].C2 / 400 < 0.7, '분대 습관 60%: ' + JSON.stringify(first));
  // 미끼: 안 가 본 이웃 중 미끼 방이 있으면 습관보다 먼저
  const z2 = Object.assign({}, zones, { D1: 'lure' });
  ok([0, 1, 2].every(h => [1, 2, 3, 4, 5].every(s => Z.exploreRoute(doors, z2, h, s).steps[0].to === 'D1')), '미끼 방 우선 (모든 습관)');
  // 대기실(몬스터 든)을 보여서 피하지 않음: 대기실이 있어도 길이 같음 (부대 정보는 길에 안 씀)
  const z3 = Object.assign({}, zones, { B1: 'den', D1: 'den', C2: 'den' });
  ok([0, 1, 2].every(h => same(Z.exploreRoute(doors, z3, h, 9), Z.exploreRoute(doors, zones, h, 9))), '대기실을 피하지 않음 (9-1)');
}

// ===================== 3) 미리보기 경로 = 실제 전투 경로 =====================
{
  R.site.budget = 999;
  ok(P.buildZone('C2', 'trap').ok && P.buildZone('A3', 'den').ok && P.buildZone('E2', 'lure').ok, '시설 몇 개');
  P.startBattle();
  const pre = P.exploreRoutes(), inp = P.battleInput();
  ok(same(inp.doors, R.site.doors), 'battleInput.doors');
  const visits = {};
  const S = runSim(W, inp, 0.1, (ev, S) => S.squads.forEach(q => { const v = visits[q.id] = visits[q.id] || ['E']; if (q.zone !== 'Y' && q.zone !== v[v.length - 1]) v.push(q.zone); }));
  ok(pre.length === S.squads.length && S.squads.every((q, i) => same(q.route.steps, pre[i].steps) && same(q.route.rooms, pre[i].rooms)), '같은 배치 + 같은 시드: 미리보기 경로 = 전투 분대 경로');
  ok(S.squads.every(q => { const v = visits[q.id] || ['E']; return same(v, q.route.rooms.slice(0, v.length)); }), '전투에서 실제로 들어간 방 순서 = 경로 앞부분: ' + JSON.stringify(visits));
  const res = W.BSIM.result(S);
  ok(res.squadResults.every((s, i) => s.passes === Math.max(0, visits[i].length - 1)), '분대 문 통과 수 = 지난 문 수');
  R.battling = false; R.bsave = null;
}

// ===================== 4) 문 옮기기 미리보기·확정 =====================
startQ1();
{
  const d0 = R.site.doors[1].slice(), b0 = P.budgetLeft();
  let p = P.previewLayout({ doors: { 1: d0.slice(1) } });
  ok(!p.ok && p.code === 'tokens', '문 수가 다르면 tokens: ' + p.why);
  p = P.previewLayout({ doors: { 1: d0.slice(1).concat([d0[2]]) } });
  ok(!p.ok && p.code === 'target', '겹친 문 target: ' + p.why);
  p = P.previewLayout({ doors: { 1: d0.slice(1).concat(['B4-C4']) } });
  ok(!p.ok && p.code === 'target' && p.why.indexOf('안쪽 벽') >= 0, '없는 벽(고정 구역 안쪽) target: ' + p.why);
  // 곁방 B2의 하나뿐인 문 B2-C2를 다른 곳으로 -> B2가 끊김
  p = P.previewLayout({ doors: { 1: d0.map(x => x === 'B2-C2' ? 'B1-B2' : x) } });
  ok(p.ok, '곁방 문을 위로 옮기면 이어짐: ' + p.why);
  p = P.previewLayout({ doors: { 1: d0.map(x => x === 'B2-C2' ? 'C3-D3' : x) } });
  ok(!p.ok && p.code === 'disconnected' && same(p.isolated, ['B2']) && p.why.indexOf('왼쪽 2') >= 0, '끊긴 방 disconnected: ' + JSON.stringify([p.why, p.isolated]));
  // 한도: 처음에서 문 하나를 옮겨 미리보기 경로가 한도를 넘는 배치
  let over = null;
  for (const from of d0) { for (const to of Z.edges(1).map(e => e.id)) { if (d0.indexOf(to) >= 0) continue; const q = P.previewLayout({ doors: { 1: d0.map(x => x === from ? to : x) } }); if (q.code === 'limit') { over = q; break; } } if (over) break; }
  ok(over && Math.max.apply(null, over.passes) > LIMIT && /분대 \d 문 통과 \d+회: 최대 \d+회를 넘습니다/.test(over.why), '문 통과 한도를 넘으면 limit (확정 불가): ' + (over && over.why));
  ok(over && !P.commitLayout({ doors: over.doors }).ok && same(R.site.doors[1], d0), '한도 넘는 배치는 commit 거절');
  // 마석
  R.site.budget = 5;
  p = P.previewLayout({ builds: { B3: 'trap' } });
  ok(!p.ok && p.code === 'budget', '마석 모자람 budget');
  R.site.budget = b0;
  ok(P.previewLayout({ builds: { FZ1: 'trap' } }).code === 'locked', '고정 구역 locked');
  ok(P.previewLayout({ builds: { B3: 'wait' } }).code === 'target', '못 짓는 시설 target');
  // 문 + 시설 한 번에: 미리보기 전투력 = 확정 뒤 전투력, 문 옮기기는 무료
  const nd = d0.map(x => x === 'A7-B7' ? 'B6-B7' : x);
  const ch = { doors: { 1: nd }, builds: { C6: 'trap', D7: 'den', E6: 'trap' } };
  p = P.previewLayout(ch);
  ok(p.ok && p.cost === 30 && p.gift === 1 && p.budgetAfter === b0 - 30 && p.changed.doors && p.changed.builds.length === 3, '문 + 시설 미리보기: ' + JSON.stringify([p.ok, p.why, p.cost, p.gift]));
  const c = P.commitLayout(ch);
  ok(c.ok && same(R.site.doors[1], nd) && same(W.ZONES.DOORS.slice().sort(), nd.slice().sort()) && R.site.zones.C6 === 'trap' && R.site.zones.D7 === 'den' && P.budgetLeft() === b0 - 30 && c.gift === 1 && R.site.builds === 3,
    '[건설] 한 번에 문 + 시설 확정: ' + c.msg);
  ok(P.sitePower() === p.powerAfter && P.siteValue() === p.valueAfter, '미리보기 전투력·가치 = 확정 뒤: ' + p.powerAfter + '/' + P.sitePower());
  ok(c.msg.indexOf('문 배치 확정') >= 0 && c.msg.indexOf('시설 3곳') >= 0, '확정 메시지: ' + c.msg);
  ok(!P.commitLayout({}).ok, '바뀐 것 없으면 거절');
  // 경로가 새 문을 따름
  const r = P.exploreRoutes(5);
  ok(r.every(x => x.steps.every(s => nd.indexOf(s.edge) >= 0)), '확정 뒤 경로는 새 문만 지남');
  // 전투 중에는 locked
  P.startBattle();
  ok(P.previewLayout({ doors: { 1: d0 } }).code === 'locked' && !P.doorInfo(1).canEdit && !P.commitLayout({ doors: { 1: d0 } }).ok, '전투 중 문 옮기기 잠김');
  R.battling = false; R.bsave = null;
  // 호환: previewBuild/buildZone = previewLayout/commitLayout 시설 하나
  const pb = P.previewBuild('B3', 'trap'), pl = P.previewLayout({ builds: { B3: 'trap' } });
  ok(pb.ok && pb.cost === pl.cost && pb.powerAfter === pl.powerAfter && pb.baseCost === 10 && pb.counts && pb.from === 'empty' && pb.floor === 1, '호환 previewBuild');
  ok(P.previewBuild('C6', 'trap').why === '이미 이 시설이에요', '이미 같은 시설');
  // 함정 점수는 경로마다 min(들어간 횟수, 2)의 평균 (막다른 방 왕복이 보임)
  const inf = Z.passInfo(R.site.zones), part = P.powerInfo().parts.filter(x => x.z === 'C6')[0];
  ok(part && Math.abs(part.w - Math.round(inf.trap.C6 * 1000) / 1000) < 0.002 && inf.trap.C6 >= inf.ratio.C6 - 1e-9 && inf.trap.C6 <= 2 * inf.ratio.C6 + 1e-9, '함정 w = 평균 min(들어간 횟수,2): ' + JSON.stringify([part, inf.trap.C6, inf.ratio.C6]));
  const dpart = P.powerInfo().parts.filter(x => x.kind === 'den')[0];
  ok(dpart && Math.abs(dpart.w - Math.round(inf.ratio[dpart.z] * 1000) / 1000) < 0.002, '대기실 w = 통과 비율');
}

// ===================== 5) 전투: 조사·빠르게·함정 2회 =====================
startQ1();
{
  P.startBattle();
  const inp = P.battleInput(), insp = {};
  let fastSeen = false, fastBad = 0;
  const S = runSim(W, inp, 0.05, (ev, S) => {
    ev.forEach(e => { if (e.type === 'inspect') { const k = e.id + ':' + e.z; insp[k] = (insp[k] || 0) + 1; } });
    S.squads.forEach(q => { if (q.state === 'move' && q.fast) { fastSeen = true; } });
  });
  ok(Object.keys(insp).length > 4 && Object.values(insp).every(n => n === 1), '처음 들어간 방마다 조사 한 번: ' + JSON.stringify(insp));
  ok(S.squads.every(q => q.route.rooms.slice(0, 1).every(z => insp[q.id + ':' + z] === 1 || q.state === 'wait')), '입구에서도 조사');
  ok(fastSeen, '가 본 방으로 갈 때 빠르게 (fast)');
  // 같은 함정은 같은 분대가 2번 들어갈 때까지만: 세 번 넘게 들어가는 방을 찾아 함정을 둠 (발동 확률 0으로 살려 둠)
  R.battling = false; R.bsave = null;
  let pick = null;
  for (let s = 1; s < 300 && !pick; s++) for (let h = 0; h < 2 && !pick; h++) {
    const rt = Z.exploreRoute(R.site.doors[1], R.site.zones, h, s), cnt = {};
    rt.steps.forEach(st => { cnt[st.to] = (cnt[st.to] || 0) + 1; });
    const z = Object.keys(cnt).filter(z => cnt[z] >= 3 && Z.zoneType(z) === 'room' && !R.site.fixed[z] && rt.steps.length <= 22)[0];
    if (z) pick = { s, h, z, n: cnt[z] };
  }
  ok(!!pick, '세 번 넘게 들어가는 방 찾기');
  if (pick) {
    R.site.zones[pick.z] = 'trap';
    P.startBattle();
    const plan = JSON.parse(JSON.stringify(R.plan)); plan.seed = pick.s;
    const T0 = BD.TRAP_CHANCE; BD.TRAP_CHANCE = -1;   // 늘 빗나감 (분대가 살아서 끝까지 감)
    let rolls = 0, bad = 0;
    const S2 = runSim(W, P.battleInput(plan), 0.05, (ev, S) => ev.forEach(e => {
      if ((e.type === 'trapMiss' || e.type === 'trap') && e.z === pick.z) { const q = S.squads.filter(q => q.zone === pick.z && Math.abs(q.x - e.x) < 1e-6 && Math.abs(q.y - e.y) < 1e-6)[0]; if (q && q.id === pick.h) { rolls++; if (q.trapIn[pick.z] > 2) bad++; } }
    }));
    BD.TRAP_CHANCE = T0;
    const q = S2.squads[pick.h];
    ok(q.trapIn[pick.z] >= 3 && rolls > 0 && bad === 0, '함정 ' + pick.z + ': ' + q.trapIn[pick.z] + '번 들어가도 3번째부터 안 굴림 (굴림 ' + rolls + ', 잘못 ' + bad + ')');
    R.battling = false; R.bsave = null; R.site.zones[pick.z] = 'empty';
  }
}

// ===================== 6) 조우 즉시 승패 =====================
function denSim(W, P, R, monHp, monAtk, seed, extra) {
  P.startBattle();
  const plan = JSON.parse(JSON.stringify(R.plan)); if (seed !== undefined) plan.seed = seed;
  const inp = P.battleInput(plan);
  const S = W.BSIM.create(inp);
  Object.keys(S.dens).forEach(z => S.dens[z].forEach(m => { m.hp = m.max = monHp; m.atk = monAtk; m.def = 0; }));
  Object.keys(S.mu).forEach(id => { S.mu[id].max = monHp * S.dens[S.mu[id].z].filter(m => m.id === id).length; });
  const log = [];
  for (let i = 0; i < 6000 && !S.done; i++) {
    const before = S.squads.map(q => [q.x, q.y, q.state]);
    const ev = W.BSIM.step(S, 0.05);
    ev.forEach(e => log.push(Object.assign({ T: S.t, before }, e)));
    if (extra) extra(S, ev);
  }
  R.battling = false; R.bsave = null;
  return { S, log };
}
startQ1();
{
  R.site.budget = 999;
  // 모든 길목(보물방 앞 3곳)에 대기실 -> 보물방에 가려면 반드시 조우
  ['B7', 'C6', 'D7'].forEach(z => ok(P.buildZone(z, 'den').ok, '대기실 ' + z));
  ok(Object.keys(R.site.units).length === 3, '부대 3개 출진: ' + JSON.stringify(R.site.units));
  // a) 몬스터가 훨씬 셈 -> 늘 몬스터 승: 침입자 분대 2초 뒤 퇴각(격퇴), 몬스터 피해는 상한 안
  let a = denSim(W, P, R, 5000, 50, 11);
  const cl = a.log.filter(e => e.type === 'clash');
  ok(cl.length >= 1 && cl.every(e => e.win), '센 몬스터 = 몬스터 승: ' + cl.length);
  cl.forEach(e => {
    const rt = a.log.filter(x => x.type === 'iretreat' && x.id === e.id)[0];
    ok(rt && rt.cause === 'den' && (Math.abs(rt.T - e.T - (BD.CLASH.encounter + BD.CLASH.outcome)) < 0.051 || rt.T >= BD.TIME_LIMIT - 1e-6), '격퇴는 조우 뒤 2초 (말풍선 1초 + 1초): ' + (rt && (rt.T - e.T)));
  });
  ok(a.S.reached === 0 && W.BSIM.result(a.S).denRepels === cl.length, '격퇴 수 = 몬스터 승 수');
  ok(Object.values(a.S.dens).every(l => l.every(m => m.hp >= 5000 * (1 - BD.CLASH.damageCap) ** 2 - 1e-6)), '이긴 쪽 피해 상한 (한 번에 체력의 ' + BD.CLASH.damageCap + ' 이하)');
  // 2초 동안 그 분대만 멈춤: 조우 중인 분대 위치는 그대로, 다른 분대는 움직일 수 있음
  {
    let still = true;
    const S0 = denSim(W, P, R, 5000, 50, 11, (S) => S.squads.forEach(q => { if (q.state === 'fight' && q.clash && q.clash.t > 0.06) { if (q._px !== undefined && (q._px !== q.x || q._py !== q.y)) still = false; q._px = q.x; q._py = q.y; } else { q._px = undefined; } }));
    ok(still, '조우 중인 분대는 멈춤');
  }
  // b) 몬스터가 훨씬 약함 -> 몬스터 패: 그 대기실 부대 퇴각(사망 없음), 침입자는 피해를 입고 계속
  let b = denSim(W, P, R, 1, 0.01, 11);
  const cb = b.log.filter(e => e.type === 'clash');
  ok(cb.length >= 1 && cb.every(e => !e.win), '약한 몬스터 = 몬스터 패');
  const mr = b.log.filter(e => e.type === 'mretreat');
  ok(mr.length >= 1 && mr.every(e => e.big === false) && W.BSIM.result(b.S).monRetreat.every(m => !m.big), '진 몬스터 부대 퇴각, 큰 피해·사망 판정 없음');
  ok(b.S.squads.some(q => q.state === 'reached'), '이긴 침입자는 계속 탐험해 보물방까지');
  // c) 힘이 같으면 반반 (±20% 무작위)
  let wins = 0, n = 0;
  for (let s = 1; s <= 120; s++) {
    P.startBattle();
    const plan = JSON.parse(JSON.stringify(R.plan)); plan.seed = s;
    const S = W.BSIM.create(P.battleInput(plan));
    let first = null;
    for (let i = 0; i < 3000 && !S.done && !first; i++) {
      // 조우 직전 몬스터 힘을 침입자 힘과 같게 맞춤
      S.squads.forEach(q => {
        if (q.state !== 'move') return;
        const t = q.wps[q.wp];
        if (!t || !t.anchor || !S.dens[t.z]) return;
        const al = q.mem.filter(m => m.alive); let hp = 0, atk = 0; al.forEach(m => { hp += m.hp; atk += m.atk; });
        const ip = hp / ((1 - (S.fx.def || 0)) * (1 + S.mod.weak)) * (atk / al.length) * (1 + (S.fx.atk || 0));
        const amb = W.ZONES.FAC[S.zones[q.zone]] && W.ZONES.FAC[S.zones[q.zone]].kind === 'trap' ? BD.AMBUSH : 1;
        const ms = S.dens[t.z].filter(m => !m.out && m.hp > 0);
        ms.forEach(m => { m.def = 0; m.atk = 1; m.hp = ip / ms.length / amb; m.max = m.hp; });
      });
      W.BSIM.step(S, 0.05).forEach(e => { if (e.type === 'clash' && !first) first = e; });
    }
    R.battling = false; R.bsave = null;
    if (first) { n++; if (first.win) wins++; }
  }
  ok(n > 80 && wins / n > 0.35 && wins / n < 0.65, '힘이 같으면 승패 반반: ' + wins + '/' + n);
  sample.evenClash = wins + '/' + n;
  // d) 침입자 체력 절반 아래면 퇴각 (함정만으로도)
  startQ1(); R.site.budget = 999;
  ['B1', 'D1', 'C2', 'A1', 'E1', 'C3'].forEach(z => P.buildZone(z, 'trap'));
  let trapRet = 0, badHp = 0;
  for (let s = 1; s <= 15; s++) {
    P.startBattle();
    const plan = JSON.parse(JSON.stringify(R.plan)); plan.seed = s;
    runSim(W, P.battleInput(plan), 0.05, (ev, S) => {
      ev.forEach(e => { if (e.type === 'iretreat' && e.cause === 'trap') trapRet++; });
      S.squads.forEach(q => { if (q.state === 'move') { let h = 0; q.mem.forEach(m => { if (m.alive) h += m.hp; }); if (h < q.maxHp * BD.CLASH.invaderRetreat - 1e-6) badHp++; } });
    });
    R.battling = false; R.bsave = null;
  }
  ok(trapRet > 0 && badHp === 0, '함정으로 체력 절반 아래 -> 퇴각 (' + trapRet + '번), 절반 아래로 계속 걷는 분대 없음 (' + badHp + ')');
  // e) 시간 초과 = 방어 성공, 결과 요약 한 줄
  startQ1();
  P.startBattle();
  const S = runSim(W, P.battleInput());
  const res = W.BSIM.result(S);
  const rp = P.applyBattle(res);
  ok(typeof rp.summary === 'string' && rp.summary === BD.SUMMARY_TEXT.replace('{trap}', res.trapRetreats).replace('{den}', res.denRepels) && /함정으로 \d+분대 퇴각, 대기실에서 \d+분대 격퇴/.test(rp.summary), '결과 요약 한 줄: ' + rp.summary);
  sample.summary = rp.summary;
  P.startBattle();
  const tr = P.applyBattle({ gold: 0, gems: 0, loot: 0, reached: 0, retreated: 2, timeout: true, kills: 0, total: 20, squads: 2, deployed: [], fought: [], monRetreat: [] });
  ok(tr.defended === true && tr.timeout === true, '시간 초과(보물방 도달 0) = 방어 성공');
}

// ===================== 7) 저장 지점 복원 = 끊김 없는 전투, 배속 =====================
startQ1();
{
  R.site.budget = 999; ['C2', 'B1', 'D1'].forEach(z => P.buildZone(z, 'trap')); P.buildZone('C6', 'den');
  P.startBattle();
  const inp = P.battleInput();
  const A = runSim(W, inp, 0.1);
  const B = W.BSIM.create(inp);
  for (let i = 0; i < 150 && !B.done; i++) W.BSIM.step(B, 0.1);
  const sn = JSON.parse(JSON.stringify(W.BSIM.snapshot(B)));
  ok(!('doors' in sn) && sn.squads[0].route && sn.tally, '저장 지점: 문 참조는 빼고 경로·집계는 넣음');
  const B2 = W.BSIM.restore(P.battleInput(), sn);
  for (let i = 0; i < 6000 && !B2.done; i++) W.BSIM.step(B2, 0.1);
  ok(same(W.BSIM.result(A), W.BSIM.result(B2)), '중간 저장 -> 복원 -> 끝까지 = 끊김 없는 전투와 같은 결과');
  R.battling = false; R.bsave = null;
}

// ===================== 8) 의뢰 예산 vs 회사 금, 시설, 가치/전투력 =====================
startQ1();
{
  const q1 = R.quest;
  ok(P.budgetLeft() === q1.budget && q1.budget > 0 && R.site.squads.length === 1 && R.site.squads[0].free, '의뢰 예산·무료 기본 부대');
  R.gold = 5000; R.site.budget = 200;   // 조달까지 해 보려고 넉넉히 (시작 마석은 17절)
  const g0 = R.gold, b0 = P.budgetLeft();
  ok(P.startBattle().ok, '건설 없이도 다음 주 진행 가능'); R.battling = false; R.bsave = null;
  const pv = P.previewBuild('C2', 'trap');
  ok(pv.ok && pv.cost === 10 && pv.budgetAfter === b0 - 10, '1칸 방 함정 = 마석 10');
  ok(P.buildZone('C2', 'trap').ok && R.gold === g0 && P.budgetLeft() === b0 - 10, '건설은 마석만');
  const pr0 = P.procureInfo('ember');
  ok(P.procureSquad('ember').ok && R.gold === g0 && P.budgetLeft() === b0 - 10 - pr0.cost, '부대 조달은 마석만');
  R.site.budget = 5;
  const r = P.buildZone('B3', 'trap');
  ok(!r.ok && r.msg.indexOf('마석') >= 0 && R.gold === g0, '마석 부족 거절 (회사 금으로 안 냄): ' + r.msg);
  R.site.budget = 0; ok(P.startBattle().ok, '마석 0이어도 다음 주'); R.battling = false; R.bsave = null;
  R.site.budget = 999;
  ok(same(Z.facFor('B3').sort(), ['den', 'empty', 'lure', 'trap']) && same(Z.facFor('E'), ['split']), '방 시설 3종 + 빈 방, 입구는 대기·굽은길 없음: ' + Z.facFor('E'));
  ok(!P.previewBuild('E', 'wait').ok && !P.buildZone('Y', 'thorn').ok, '입구 대기·덫 숲 거부');
  ok(!P.buildZone('FZ1', 'trap').ok && R.site.zones.FZ1 === 'fz_frozen_dock', '고정 구역 건설 거부');
  const free = R.site.squads[0], v0 = P.siteValue();
  ok(P.floorInfo(1).cap === 0 && !P.unitById(free.id).floor, '대기실이 없으면 출진 한도 0');
  ok(P.buildZone('B1', 'den').ok && P.siteValue() === v0 + 5, '대기실 가치 5');
  ok(R.site.units.B1 && R.site.units.B1.length === 1 && R.site.deploy[1].length === 1, '자동 편성: 1칸 대기실 = 부대 1자리: ' + JSON.stringify(R.site.units));
  const pi = P.powerInfo(); let sum = 0; pi.parts.forEach(x => sum += x.score * x.w);
  ok(Math.abs(pi.total - Math.floor(sum + 1e-6)) <= 1, '전투력 = Σ 점수 × w: ' + pi.total + ' / ' + sum);
  // 친위대는 전투력·가치 제외: 출진을 모두 빼고 친위대만 대기실에
  R.guards.push({ id: 'g9', tribe: 'ember', name: '꼬리불', lv: 5, exp: 0 });
  P.setAutoDeploy(false);
  R.site.deploy[1].slice().forEach(id => P.withdrawUnit(id));
  const pC = P.sitePower(), vC = P.siteValue();
  ok(P.placeUnit('B1', 'g9').ok && P.sitePower() === pC && P.siteValue() === vC && R.site.units.B1[0] === 'g9', '친위대는 전투력·가치에 안 들어감');
  R.guards = []; P.setAutoDeploy(true);
}

// ===================== 9) 납품 단계·수동 납품·q1 뒤 데모 끝 =====================
startQ1();
{
  const q1 = R.quest;
  ok(!P.questProgress().complete && P.deliver() === null, '5단계 전 납품 안 됨');
  R.site.budget = 999;
  ['B7', 'C6', 'D7'].forEach(z => P.buildZone(z, 'den'));
  ['C2', 'C3', 'C5', 'B1', 'D1', 'A1', 'E1', 'A2', 'E2', 'A3', 'E3', 'B5'].forEach(z => P.buildZone(z, 'trap'));
  R.site.squads.forEach(s => { s.lv = 8; });
  P.questUpdate();
  const qp = P.questProgress();
  ok(qp.complete && qp.stage === 5 && qp.canDeliver && q1.stageWeeks.length === 5, '5단계 = 의뢰 완료: ' + qp.line);
  ok(R.phase === 'play', '자동 납품 없음');
  const rep1 = runBattle(W, P);
  ok(rep1 && R.phase === 'play', '전투 뒤에도 자동 납품 없음');
  const d = P.deliver();
  ok(d && R.phase === 'settle' && d.board === 'g1' && same(d.boards, ['g1']) && d.demoEnd === true, '납품 -> settle, 다음 의뢰 없음 (q2 숨김) -> 데모 끝 신호');
  ok(P.offerQuests().length === 0 && !P.lockedQuest() && P.demoState().canLeave && !P.unlocks().secondQuest, '숨긴 q2는 후보·잠김 안내에도 없음');
  ok(R.works.length === 1 && P.company().lv >= 2, '작품집·회사 레벨');
  const lv = P.leaveSettle();
  ok(lv.ok && R.phase === 'demoEnd' && !P.startBattle().ok, '정산 닫으면 demoEnd');
  W = boot(); P = W.PROGRESS; ok(P.load() === true && P.RUN.phase === 'demoEnd', 'demoEnd 저장 유지');
}

// ===================== 10) 층 (시험용 2층 의뢰: 두 층 g1) =====================
function freshQ2() {
  fresh(); enableQ2(BD);
  P.pickQuest(P.offerQuests()[0]);
  R.site.budget = 999;
  ['B7', 'C6', 'D7'].forEach(z => P.buildZone(z, 'den'));
  ['C2', 'C3', 'C5', 'B1', 'D1', 'A1', 'E1', 'A2', 'E2', 'A3', 'E3', 'B5'].forEach(z => P.buildZone(z, 'trap'));
  R.site.squads.forEach(s => { s.lv = 8; }); P.questUpdate();
  const d = P.deliver();
  if (!d) { problems.push('q1 납품 실패: ' + P.questProgress().line); console.log(JSON.stringify({ problems, sample })); process.exit(0); }
  ok(d && !d.demoEnd && R.offers.length === 1 && R.offers[0].key === 'q2', 'q2를 켜면 다음 의뢰');
  const pid = R.site.squads[0].id, plv = R.site.squads[0].lv;
  ok(P.pickQuest(R.offers[0], [pid]) && R.quest.key === 'q2' && R.guards.length === 1 && R.guards[0].lv === plv && R.tutorial.on === false, '2층 의뢰 받기·친위대 인계·튜토리얼 끝');
}
freshQ2();
{
  const f1 = Z.floorInfo(1), f2 = Z.floorInfo(2);
  ok(R.site.floors === 2 && R.site.floorsOpen === 1 && same(R.site.boards, ['g1', 'g1']) && !f2.open, '2층 의뢰: 두 층, 2층 잠김');
  ok(f2.ids.every(z => /^2/.test(z)) && f1.ids.every(z => !/^2/.test(z)) && f2.ids.indexOf('2E') >= 0 && f2.ids.indexOf('2FZ1') >= 0, '층별 방 id 안 섞임');
  ok(R.site.doors[2].length === 35 && R.site.doors[2].every(id => /^2[A-E]\d-2[A-E]\d$/.test(id)) && R.site.fixed['2FZ1'] === 'frozen_dock', '2층 문 id·고정 구역');
  ok(Z.grid(2).rowOff === 8 && same(Z.roomCenter('2E'), { x: 2.5, y: 8.5 }), '2층 좌표는 1층 아래 한 줄 띄움');
  ok(Z.goal() === 'B' && P.exploreRoutes(3).every(r => r.rooms[r.rooms.length - 1] === 'B' && r.steps.every(s => s.floor === 1)), '잠겨 있으면 보물방 = 1층 B');
  ok(!P.previewBuild('2C2', 'trap').ok && P.previewBuild('2C2', 'trap').locked, '잠긴 2층 못 지음');
  ok(P.previewLayout({ doors: { 2: R.site.doors[2].map(x => x === '2B2-2C2' ? '2B1-2B2' : x) } }).code === 'locked' && !P.doorInfo(2).canEdit, '잠긴 2층 문 못 옮김');
  // 3단계 -> 2층 열림
  ['C2', 'C3', 'C5', 'B1', 'D1', 'A1', 'E1', 'A2', 'E2', 'A3', 'E3', 'B5', 'D5'].forEach(z => P.buildZone(z, 'trap')); ['B7', 'C6', 'D7'].forEach(z => P.buildZone(z, 'den'));
  R.site.squads.forEach(s => { s.lv = 10; }); R.guards[0].lv = 10; P.questUpdate();
  if (R.site.floorsOpen !== 2) { problems.push('2층이 안 열림: ' + P.questProgress().line); console.log(JSON.stringify({ problems, sample })); process.exit(0); }
  ok(R.quest.stage >= 3 && R.site.floorsOpen === 2 && Z.goal() === '2B' && Z.isStairs('B') && Z.NAMES.B.indexOf('계단') === 0, '3단계 -> 2층 열림, 1층 B = 계단: ' + P.questProgress().line);
  const rts = P.exploreRoutes(4);
  ok(rts.every(r => r.rooms[r.rooms.length - 1] === '2B' && r.steps.filter(s => s.stairs).length === 1 && r.steps.some(s => s.floor === 2)), '경로: 1층 -> 계단 -> 2층 -> 2B');
  ok(rts.every(r => { const k = r.steps.findIndex(s => s.stairs); return r.steps[k].from === 'B' && r.steps[k].to === '2E' && r.steps.slice(k + 1).every(s => s.floor === 2); }), '계단 뒤는 2층만 (2층은 다시 처음부터 탐험)');
  const w = Z.passRatios(R.site.zones, {});
  ok(Math.abs(w['2E'] - 1) < 1e-9 && Math.abs(w.E - 1) < 1e-9, '통과 비율은 층 입구 기준');
  const c2 = P.previewBuild('2C2', 'trap');
  ok(c2.ok && c2.cost === Math.round(10 * BD.FLOOR_BUILD_MUL[2]) && c2.floor === 2, '2층 건설비 배율: ' + c2.cost);
  ok(P.previewLayout({ doors: { 2: R.site.doors[2].map(x => x === '2B2-2C2' ? '2B1-2B2' : x) } }).ok, '열린 2층 문 옮기기');
  // 층별 출진
  const sq = R.site.squads[0], g = R.guards[0];
  P.setAutoDeploy(false); [sq.id, g.id].forEach(id => { if (P.unitById(id).floor) P.withdrawUnit(id); });
  ok(!P.sortieUnit(sq.id, 2).ok, '2층에 대기실이 없으면 출진 못 함');
  ok(P.buildZone('2C6', 'den').ok && P.buildZone('2B7', 'den').ok, '2층 대기실 2개');
  ok(P.floorInfo(2).cap === Math.min(BD.FLOOR_CAP[2], 2), '2층 한도');
  ok(P.sortieUnit(sq.id, 2).ok && P.unitById(sq.id).floor === 2, '2층 출진');
  ok(!P.sortieUnit(sq.id, 2).ok, '같은 층 중복 출진 거절');
  ok(P.sortieUnit(g.id, 2).ok && R.site.deploy[2].length === 2, '친위대도 칸 차지');
  R.site.budget += 100; P.procureSquad('stone'); const s3 = R.site.squads[R.site.squads.length - 1];
  const r2 = P.sortieUnit(s3.id, 2);
  ok(!r2.ok && r2.msg.indexOf('한도') >= 0, '2층 한도 넘으면 거절: ' + r2.msg);
  const f2p = P.powerInfo().floors[2] || 0;
  ok(P.floorPower(2) === f2p && P.questProgress().cur.floor2 === f2p && f2p > 0, '2층 전투력 (친위대 제외): ' + f2p);
  // 층별 차례 전투: 1층이 끝나면 floorEnd -> nextFloor로 2층
  P.startBattle();
  const plan = JSON.parse(JSON.stringify(R.plan)); plan.groups.forEach(gp => { gp.lv = 1; }); plan.power = 0.3;
  const inp = P.battleInput(plan);
  ok(inp.goal === '2B', '전투 goal = 2B');
  const BDc = BD.TRAP_CHANCE; BD.TRAP_CHANCE = -1;
  Object.keys(inp.units).forEach(z => { delete inp.units[z]; });   // 대기실 없이 (모두 계단까지 오게)
  const S = W.BSIM.create(inp);
  let fe = null, during2 = false, beforeNext = null;
  for (let i = 0; i < 6000 && !S.done; i++) {
    const ev = W.BSIM.step(S, 0.1);
    ev.forEach(e => { if (e.type === 'floorEnd') fe = e; });
    if (S.pending) {
      ok(S.squads.every(q => q.state !== 'move'), '1층이 끝날 때 1층에서 걷는 분대 없음');
      const t0 = S.t; W.BSIM.step(S, 0.1); ok(S.t === t0, '알림 동안(pending) 전투 멈춤');
      beforeNext = S.squads.filter(q => q.state === 'stairs').length;
      W.BSIM.nextFloor(S); during2 = true;
      ok(S.floor === 2 && S.floorT === 0 && W.BSIM.timeLeft(S) === BD.GRID.nextFloorTime, '2층 전투 시간 ' + BD.GRID.nextFloorTime + '초');
    }
    if (during2) S.squads.forEach(q => { if (q.state === 'move') ok(W.ZONES.floorOf(q.zone) === 2 || q.zone === 'B', '2층 전투 중에는 2층에서만'); });
  }
  BD.TRAP_CHANCE = BDc;
  ok(fe && fe.n === 1 && fe.next === 2 && beforeNext > 0 && during2 && S.done, '층별 차례 전투: floorEnd -> nextFloor: ' + JSON.stringify(fe));
  P.applyBattle(W.BSIM.result(S));
}

// ===================== 11) 퇴각·쉼·사망 규칙 (progress) =====================
function fakeRes(extra) { return Object.assign({ gold: 0, gems: 0, loot: 0, reached: 0, kills: 0, total: 0, squads: 2, deployed: [], fought: [], monRetreat: [] }, extra || {}); }
startQ1();
{
  R.site.budget = 999; P.buildZone('C6', 'den'); P.buildZone('B7', 'den');
  const s = R.site.squads[0];
  s.count = 6; s.lv = 3;
  P.startBattle();
  let rep = P.applyBattle(fakeRes({ deployed: [s.id], monRetreat: [{ id: s.id, big: true, down: 6 }] }));
  ok(s.count === 6 && rep.deaths === 0 && rep.retreats.length === 1 && rep.noDeath, '첫 의뢰: 퇴각해도 사망 없음');
  ok(P.isResting(s.id) && R.site.rest[s.id] === R.week, '퇴각 -> 다음 주 쉼');
  ok(!P.battleInput().units[P.unitById(s.id).placed] || P.battleInput().units[P.unitById(s.id).placed].indexOf(s.id) < 0, '쉬는 부대는 전투 입력에서 빠짐');
  ok(P.startBattle().msgs.some(m => m.indexOf('쉬는') >= 0), '알림: 쉬는 부대');
  rep = P.applyBattle(fakeRes());
  ok(!P.isResting(s.id), '그다음 주 복귀');
  // 참여 경험치
  P.startBattle();
  const e0 = s.exp + 1000 * s.lv;
  const rp = P.applyBattle(fakeRes({ deployed: [s.id], fought: [s.id] }));
  ok(rp.expGains.filter(x => x.id === s.id)[0].exp === BD.EXP.deploy + BD.EXP.fight, '싸움 = 출진 + 참여 경험치');
}
// 실제 전투 퇴각 -> 쉼 (몬스터 패)
startQ1();
{
  R.site.budget = 999; ['B7', 'C6', 'D7'].forEach(z => P.buildZone(z, 'den'));
  const b = denSim(W, P, R, 1, 0.01, 11);
  const res = W.BSIM.result(b.S);
  P.startBattle();
  const rp = P.applyBattle(res);
  ok(res.monRetreat.length >= 1 && rp.retreats.length === res.monRetreat.length && res.monRetreat.every(m => P.isResting(m.id)) && rp.deaths === 0, '실제 전투 몬스터 퇴각 -> 쉼, 사망 없음');
}

// ===================== 12) 카드 위기: 최대 2장, 배속·복원 같음 =====================
startQ1();
{
  const rule = P.cardRule();
  ok(rule.mode === 'crisis' && rule.maxPerBattle === 2 && rule.kinds.length === 3, '카드 규칙');
  R.seed = 20261025; R.plan = null; P.startBattle();   // 씨앗 고정 (예전엔 Date.now 씨앗이라 가끔 위기 0번으로 실패)
  function runCount(dt, plan, cut) {
    const S = W.BSIM.create(P.battleInput(plan)); const list = [];
    for (let i = 0; i < 12000 && !S.done; i++) {
      if (cut && i === cut) { const sn = W.BSIM.snapshot(S); const S2 = W.BSIM.restore(P.battleInput(plan), sn); Object.keys(S).forEach(k => delete S[k]); Object.assign(S, S2); }
      W.BSIM.step(S, dt).forEach(e => { if (e.type === 'crisis') list.push(e.kind); });
    }
    return { list, S };
  }
  const a = runCount(0.1, R.plan), b = runCount(0.05, R.plan), c = runCount(0.1, R.plan, 150);
  ok(a.list.length >= 1 && a.list.length <= 2 && a.list.every(k => k === 'treasure'), '빈 던전: 보물방 근접 위기: ' + a.list);
  ok(same(a.list, c.list) && b.list.length === a.list.length, '배속(dt)·중간 저장 복원에도 같은 수: ' + [a.list.length, b.list.length, c.list.length]);
  const sp = JSON.parse(JSON.stringify(R.plan)); sp.surge = true; sp.boss = true;
  sp.groups = sp.groups.concat(sp.groups).map(gp => Object.assign({}, gp, { count: 30 }));
  const d = runCount(0.1, sp);
  ok(d.list.length === 2 && d.list[0] === 'surge' && d.list[1] === 'boss', '대량 출현·보스도 합쳐 최대 2장: ' + d.list);
  // 위기 '보물방 근접' = 보물방과 문으로 이어진 방 (문을 옮기면 바뀜)
  ok(same(a.S.front.slice().sort(), ['B7', 'C6', 'D7']), 'front = 보물방 앞 방: ' + a.S.front);
  R.battling = false; R.bsave = null;
  // 얼어붙은 하역장: 가운데 길로 지나간 분대는 느려짐
  let chill = 0;
  for (let s = 1; s <= 12 && !chill; s++) { P.startBattle(); const pl = JSON.parse(JSON.stringify(R.plan)); pl.seed = s; runSim(W, P.battleInput(pl), 0.1, ev => ev.forEach(e => { if (e.type === 'chill' && e.z === 'FZ1') chill++; })); R.battling = false; R.bsave = null; }
  ok(chill > 0, '얼어붙은 하역장 chill 사건');
}

// ===================== 13) 튜토리얼 강조 =====================
startQ1();
{
  const tp = P.tutorialPath();
  ok(same(Z.mustPass(), []) && same(tp.slice().sort(), ['B7', 'C6', 'D7']), '처음 g1: 반드시 지나는 방 없음 -> 강조 = 보물방 앞 방 (모두 이 중 한 곳을 지남): ' + tp);
  sample.tutorialPath = tp;
  // 입구에서 옆길로 가는 문 둘을 옮기면 (가운데 길로만 들어감) 반드시 지나는 방이 생김
  const d0 = R.site.doors[1];
  const nd = d0.map(x => x === 'B1-C1' ? 'B1-B2' : x === 'C1-D1' ? 'D1-D2' : x);
  const c = P.commitLayout({ doors: { 1: nd } });
  ok(c.ok, '입구 옆 문 옮기기: ' + c.msg);
  const mp = Z.mustPass();
  ok(same(mp, ['C2']) && same(P.tutorialPath(), ['C2']), '반드시 지나는 방 = 강조: ' + mp + ' / ' + P.tutorialPath());
  const w = Z.passRatios(R.site.zones, {});
  ok(mp.every(z => Math.abs(w[z] - 1) < 1e-9), '반드시 지나는 방은 통과 비율 1');
}

// ===================== 14) 마석 보급·대기실 기본 부대 =====================
startQ1();
{
  ok(P.weeklyBudget() === BD.WEEKLY_BUDGET && P.questProgress().weeklyBudget === BD.WEEKLY_BUDGET, '마석 보급 값');
  R.site.budget = 0; P.startBattle();
  const rp = P.applyBattle(fakeRes());
  ok(rp.budgetGain === BD.WEEKLY_BUDGET && P.budgetLeft() === BD.WEEKLY_BUDGET, '전투 뒤 마석 +' + BD.WEEKLY_BUDGET);
  const st = R.site, n0 = st.squads.length;
  const pv = P.previewBuild('C6', 'den');
  ok(pv.ok && pv.gift === 1 && /부대 \+1/.test(pv.giftText), '미리보기에 부대 +1');
  let r = P.buildZone('C6', 'den');
  ok(r.ok && r.gift === 1 && st.squads.length === n0 + 1 && st.denGifts === 1, '대기실 -> 기본 부대 +1');
  ok(P.sitePower() === pv.powerAfter, '미리보기 전투력 = 지은 뒤');
  st.budget = 9999;
  for (let k = 0; k < 3; k++) { P.buildZone('C6', 'empty'); r = P.buildZone('C6', 'den'); ok(r.ok && !r.gift && st.squads.length === n0 + 1, '재건 ' + k + ': 부대 그대로'); }
  r = P.buildZone('B7', 'den');
  ok(r.ok && r.gift === 1 && st.denGifts === 2, '대기실 2개째 -> +1');
  P.save(); W = boot(); P = W.PROGRESS; R = P.RUN;
  ok(P.load() && R.site.denGifts === 2, 'denGifts 저장 유지');
}

// ===================== 15) 끈 기능·저장 v7 =====================
startQ1();
{
  const gg = R.gold, ge = R.gems;
  ok(!P.gachaPull().ok && !P.watchAd().ok && !P.isSurgeWeek() && !P.claimChore('daily', 'd_battle').ok && !P.claimIdle().ok && !P.upgradeWorkshop('build').ok, '끈 기능 거절');
  ok(R.gold === gg && R.gems === ge, '끈 기능 지급 없음');
  R.site.budget = 999; P.buildZone('C2', 'trap');
  const nd = R.site.doors[1].map(x => x === 'B2-C2' ? 'B1-B2' : x);
  ok(P.commitLayout({ doors: { 1: nd } }).ok, '문 옮김');
  const before = JSON.stringify({ g: R.gold, c: R.company, q: R.quest.key, st: R.quest.stage, sq: R.site.squads, z: R.site.zones, u: R.site.units, b: R.site.budget, d: R.site.doors, bd: R.site.boards });
  W = boot(); P = W.PROGRESS; R = P.RUN; Z = W.ZONES;
  ok(P.load() === true && R.v === 7, 'v7 불러오기');
  const after = JSON.stringify({ g: R.gold, c: R.company, q: R.quest.key, st: R.quest.stage, sq: R.site.squads, z: R.site.zones, u: R.site.units, b: R.site.budget, d: R.site.doors, bd: R.site.boards });
  ok(before === after, '저장 전후 같음 (문 배치 포함)');
  ok(same(Z.DOORS.slice().sort(), nd.slice().sort()), '불러오면 저장된 문으로 판을 끼움');
  ok(P.startBattle().ok, '전투 4'); W = boot(); P = W.PROGRESS; ok(P.load() === true && P.RUN.battling && P.RUN.bsave, '전투 중 저장 유지'); R = P.RUN;
  // 깨진 문: 끊긴 배치·개수 틀림·없는 판 -> 처음 문 / 첫 판
  const sv = JSON.parse(store[KEY]);
  sv.site.doors = { 1: sv.site.doors[1].map(x => x === 'B1-B2' ? 'C3-D3' : x) }; sv.site.boards = ['nope'];
  store[KEY] = JSON.stringify(sv);
  W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA;
  ok(P.load() === true && same(R.site.boards, ['g1']) && same(R.site.doors[1], BD.GRID_BOARDS.g1.doors), '깨진 문·판 -> 처음 문·첫 판: ' + JSON.stringify(R.site.doors[1].length));
  const sv2 = JSON.parse(store[KEY]); delete sv2.site.doors; sv2.site.board = 'line'; delete sv2.site.boards; store[KEY] = JSON.stringify(sv2);
  W = boot(); P = W.PROGRESS; R = P.RUN;
  ok(P.load() === true && same(R.site.doors[1], BD.GRID_BOARDS.g1.doors) && !('board' in R.site), '문 칸 없음 -> 처음 문, 옛 board 칸 지움');
  // 옛 버전(v5)은 새 게임, C1 키는 그대로
  store[KEY] = JSON.stringify(Object.assign({}, JSON.parse(store[KEY]), { v: 5 }));
  W = boot(); P = W.PROGRESS;
  ok(P.load() === false && P.RUN.phase === 'choose' && P.RUN.v === 7, 'v5 저장은 새 게임');
  ok(store[C1KEY] === '{"v":5,"keep":true}', 'C1 저장 키 그대로');
}
// ?seed= 주소 옵션
{
  const keep = store[KEY]; delete store[KEY];
  const W2 = boot('?seed=12345');
  ok(W2.PROGRESS.RUN.seed === 12345, '?seed= 주소 옵션 = 새 게임 씨앗: ' + W2.PROGRESS.RUN.seed);
  store[KEY] = keep;
}

// ===================== 14) 시설 강화 (docs/specs/facility_upgrade.md 7절) =====================
function snapUp() { return JSON.stringify({ b: R.site.budget, s: R.site.spent, u: R.site.ups, z: R.site.zones, d: R.site.doors, q: R.site.squads.length, g: R.site.denGifts, st: R.quest.stage }); }
startQ1(); R.seed = 20261025; R.plan = null;   // 씨앗 고정 (전투 결과가 매번 같게)
{
  // 데이터: 단계 표 (기본 포함 3단계, 10 -> 20), q1 시작 마석 = 데이터 값 (마석 경제는 17절)
  const T = BD.FAC_UP;
  ok(T.trap.levels.length === 3 && T.den.levels.length === 3 && same(T.trap.levels.map(l => l.cost), [0, 10, 20]) && same(T.den.levels.map(l => l.cost), [0, 10, 20]), '강화 3단계·비용 10/20');
  ok(same(T.trap.levels.map(l => 6 + l.dmgAdd), [6, 7, 8]) && same(T.den.levels.map(l => l.hpMul), [1, 1.05, 1.1]), '효과 피해 6·7·8 · 체력 ×1·1.05·1.10');
  ok(BD.QUESTS[0].budget > 0 && P.budgetLeft() === BD.QUESTS[0].budget, 'q1 시작 마석 = 데이터 값 ' + BD.QUESTS[0].budget);
  ok(R.site.ups && Object.keys(R.site.ups).length === 0 && P.upgradeLevel('C6') === 1, '새 현장 = 강화 없음');
  R.site.budget = 999;
  ok(P.buildZone('C6', 'trap').ok && P.buildZone('B7', 'den').ok && P.buildZone('D7', 'trap').ok && P.buildZone('A2', 'lure').ok, '시설 짓기');
  // 미리보기 = 아무것도 안 바꿈, 값
  const s0 = snapUp(), v0 = P.siteValue(), b0 = P.budgetLeft();
  const i1 = P.upgradeInfo('C6');
  ok(snapUp() === s0, 'upgradeInfo는 상태를 안 바꿈 (닫기 = 무변경)');
  ok(i1.ok && i1.level === 1 && i1.max === 3 && i1.cost === 10 && i1.effectNow.dmg === 6 && i1.effectNext.dmg === 7 && i1.budgetAfter === b0 - 10 && i1.valueNow === v0 && i1.kind === 'trap' && i1.pass > 0,
    '함정 강화 미리보기: ' + JSON.stringify([i1.ok, i1.why, i1.level, i1.cost, i1.effectNow, i1.effectNext, i1.pass]));
  // 강화 -> 미리보기와 같은 결과, 가치 그대로
  const r1 = P.upgradeFacility('C6');
  ok(r1.ok && r1.level === 2 && P.budgetLeft() === b0 - 10 && same(R.site.ups.C6, { k: 'trap', lv: 2, paid: 10 }) && P.siteValue() === v0 && P.sitePower() === i1.powerAfter,
    '함정 강화 1번: ' + JSON.stringify([r1, R.site.ups.C6, P.sitePower(), i1.powerAfter]));
  // 연속 누르기: 누른 만큼만 (한 번에 한 단계), 최고 단계에서 멈춤, 마석은 실제 단계 비용만
  const r2 = P.upgradeFacility('C6'), r3 = P.upgradeFacility('C6'), r4 = P.upgradeFacility('C6');
  ok(r2.ok && r2.level === 3 && !r3.ok && r3.code === 'max' && !r4.ok && P.budgetLeft() === b0 - 30 && R.site.ups.C6.paid === 30 && R.site.ups.C6.lv === 3, '연속 강화: 3단계에서 멈춤, 마석 30만: ' + JSON.stringify([r2.level, r3.code, P.budgetLeft()]));
  const im = P.upgradeInfo('C6');
  ok(!im.ok && im.code === 'max' && im.effectNext === null && im.effectNow.dmg === 8 && im.cost === 0, '최고 단계 정보');
  // 전투력: 함정 점수 × 8/6, 가치 보너스 없음
  const pc = P.powerInfo().parts.filter(x => x.z === 'C6')[0];
  ok(pc && pc.lv === 3 && Math.abs(pc.score - Math.round(Z.trapScore('C6', 0) * 8 / 6 * 10) / 10) < 0.11, '전투력 함정 점수 × 강화 피해: ' + JSON.stringify(pc));
  // 거절: 입구·보물방·고정 구역·빈 방·미끼·없는 방·마석 부족·미확정·전투 중
  const rej = { E: P.upgradeInfo('E'), B: P.upgradeInfo('B'), FZ1: P.upgradeInfo('FZ1'), C2: P.upgradeInfo('C2'), A2: P.upgradeInfo('A2'), X9: P.upgradeInfo('X9') };
  ok(Object.keys(rej).every(k => !rej[k].ok), '못 하는 방 모두 거절: ' + JSON.stringify(Object.keys(rej).map(k => [k, rej[k].code, rej[k].why])));
  ok(rej.FZ1.code === 'locked' && rej.E.code === 'target' && rej.B.code === 'target' && rej.C2.code === 'target' && rej.A2.code === 'target', '거절 이유 코드');
  const s1 = snapUp();
  ok(!P.upgradeFacility('E').ok && !P.upgradeFacility('A2').ok && !P.upgradeFacility('C2').ok && snapUp() === s1, '거절은 상태 안 바꿈');
  const bs = R.site.budget; R.site.budget = 5; const ib = P.upgradeInfo('D7');
  ok(!ib.ok && ib.code === 'budget' && /5 모자람/.test(ib.why) && ib.powerAfter >= ib.powerNow && !P.upgradeFacility('D7').ok && R.site.budget === 5, '마석 부족: ' + ib.why);
  R.site.budget = bs;
  const ip = P.upgradeInfo('D7', { builds: { D7: 'den' } });
  ok(!ip.ok && ip.code === 'pending' && !P.upgradeFacility('D7', { builds: { D7: 'den' } }).ok && P.upgradeInfo('D7', { builds: { D7: 'trap' } }).ok, '미확정 시설 거절 (같은 시설이면 됨)');
  R.battling = true;
  ok(P.upgradeInfo('D7').code === 'locked' && !P.upgradeFacility('D7').ok, '전투 중 거절');
  R.battling = false; P.setBattle(true);
  ok(!P.upgradeFacility('D7').ok, '전투 화면 중 거절'); P.setBattle(false);
  ok(snapUp() === s1, '거절 뒤 그대로');
  // 대기실 강화: 그 방 부대 전투 체력 ×1.05 (전투 시작 때만), 영구 능력치 안 바뀜
  const sq = R.site.units.B7 && R.site.units.B7[0], hp0 = P.unitById(sq).hp;
  const id1 = P.upgradeInfo('B7');
  ok(sq && id1.ok && id1.effectNext.hpMul === 1.05 && id1.units.length === 1 && !id1.noEffect && id1.powerGain > 0, '대기실 강화 미리보기: ' + JSON.stringify([id1.why, id1.effectNext, id1.powerGain]));
  ok(P.upgradeFacility('B7').ok && P.unitById(sq).hp === hp0 && P.sitePower() === id1.powerAfter, '대기실 강화: 영구 체력 그대로, 전투력 = 미리보기');
  const inp = P.battleInput();
  ok(inp.up.trap.C6 === 2 && inp.up.den.B7 === 1.05 && !('D7' in inp.up.trap), '전투 입력에 강화: ' + JSON.stringify(inp.up));
  ok(P.startBattle().ok);
  const S = W.BSIM.create(P.battleInput(R.plan));
  ok(S.dens.B7.every(m => Math.abs(m.max - hp0 * 1.05) < 1e-9) && Math.abs(S.mu[sq].max - hp0 * 1.05 * S.dens.B7.length) < 1e-6, '전투 체력 = 체력 × 1.05');
  const dmgs = {};
  for (let i = 0; i < 6000 && !S.done; i++) {
    W.BSIM.step(S, 0.1).forEach(e => { if (e.type === 'trap') (dmgs[e.z] = dmgs[e.z] || []).push(e.dmg); });
    if (i === 40) {   // 전투 중 저장 -> 복원: 대기실 체력을 다시 곱하지 않음
      const sn = W.BSIM.snapshot(S), S2 = W.BSIM.restore(P.battleInput(R.plan), sn);
      ok(S2 && same(S2.up, S.up) && S2.dens.B7.every((m, j) => m.max === S.dens.B7[j].max), '복원해도 강화 한 번만');
      const sn2 = JSON.parse(JSON.stringify(sn)); delete sn2.up;
      const S3 = W.BSIM.restore(P.battleInput(R.plan), sn2);
      ok(S3 && S3.up.trap.C6 === 2 && S3.dens.B7.every((m, j) => m.max === S.dens.B7[j].max), '강화 칸 없는 옛 저장 지점 복원');
    }
  }
  for (let sd = 1; sd <= 40 && !(dmgs.C6 && dmgs.D7); sd++) {   // 여러 시드로 두 함정을 모두 밟게 (카드 안 씀 = 피해 배율 1)
    const pl = JSON.parse(JSON.stringify(R.plan)); pl.seed = sd * 101;
    runSim(W, P.battleInput(pl), 0.1, ev => ev.forEach(e => { if (e.type === 'trap') (dmgs[e.z] = dmgs[e.z] || []).push(e.dmg); }));
  }
  ok(dmgs.C6 && dmgs.D7 && dmgs.C6.every(d => d === 8) && dmgs.D7.every(d => d === 6), '실제 전투 함정 피해 C6(3단계) 8 · D7(기본) 6: ' + JSON.stringify(dmgs));
  sample.upTrapHits = { C6: (dmgs.C6 || []).length, D7: (dmgs.D7 || []).length };
  R.battling = false; R.bsave = null;
  // 문만 옮기면 강화 그대로
  const u0 = JSON.stringify(R.site.ups), nd = R.site.doors[1].map(x => x === 'B2-C2' ? 'B1-B2' : x);
  ok(P.commitLayout({ doors: { 1: nd } }).ok && JSON.stringify(R.site.ups) === u0 && P.upgradeLevel('C6') === 3, '문만 옮기면 강화 유지');
  // 교체 미리보기: 사라질 강화·환급 표시, 상태 안 바꿈 (취소 = 무변경)
  const s2 = snapUp(), b2 = P.budgetLeft();
  const pv = P.previewLayout({ builds: { C6: 'den' } });
  ok(pv.ok && pv.refund === 30 && pv.upLost.length === 1 && pv.upLost[0].z === 'C6' && pv.upLost[0].level === 3 && pv.budgetAfter === b2 - 10 + 30 && !pv.ups.C6 && snapUp() === s2,
    '교체 미리보기: ' + JSON.stringify([pv.ok, pv.refund, pv.upLost, pv.budgetAfter]));
  // 환급으로 낼 수 있는 교체 (마석 0 + 환급 30 >= 10)
  R.site.budget = 0;
  const pv0 = P.previewLayout({ builds: { C6: 'den' } });
  ok(pv0.ok && pv0.budgetAfter === 20, '환급 마석으로 교체비 냄: ' + JSON.stringify([pv0.why, pv0.budgetAfter]));
  R.site.budget = b2;
  // 교체 확정: 강화 지우고 실제 낸 강화 마석만 한 번 환급
  const sp = R.site.spent, gifts0 = R.site.denGifts, n0 = R.site.squads.length;
  const c1 = P.commitLayout({ builds: { C6: 'den' } });
  ok(c1.ok && c1.refund === 30 && P.budgetLeft() === b2 - 10 + 30 && !R.site.ups.C6 && P.upgradeLevel('C6') === 1 && R.site.spent === sp + 10 - 30 && /환급/.test(c1.msg), '교체 확정 환급: ' + JSON.stringify([c1.msg, P.budgetLeft()]));
  ok(c1.gift === 1 && R.site.denGifts === gifts0 + 1 && R.site.squads.length === n0 + 1, '대기실이 늘면 기본 부대 1번 (원래 규칙)');
  // 다시 짓기·철거: 두 번째 환급 없음, 무료 부대 더 안 생김
  const b3 = P.budgetLeft();
  ok(P.commitLayout({ builds: { C6: 'trap' } }).ok && P.budgetLeft() === b3 - 10 && P.upgradeLevel('C6') === 1, '다시 지어도 기본 단계, 환급 없음');
  ok(P.upgradeFacility('B7').ok && R.site.ups.B7.paid === 30, '대기실 3단계');
  const b4 = P.budgetLeft(), n4 = R.site.squads.length, g4 = R.site.denGifts;
  const c2 = P.commitLayout({ builds: { B7: 'empty' } });
  ok(c2.ok && c2.refund === 30 && P.budgetLeft() === b4 + 30 && !R.site.ups.B7, '철거 환급 30');
  const c3 = P.commitLayout({ builds: { B7: 'den' } });
  ok(c3.ok && c3.gift === 0 && R.site.squads.length === n4 && R.site.denGifts === g4 && c3.refund === 0 && P.budgetLeft() === b4 + 30 - 10, '철거 -> 재건: 무료 부대·환급 중복 없음');
  // 납품 단계: 강화로 전투력이 오르면 단계도 다시 계산 (afterChange)
  ok(P.upgradeFacility('B7').ok && P.upgradeFacility('D7').ok, '강화 2곳');
  const q0 = R.quest.stage; P.questUpdate(); ok(R.quest.stage === q0, '강화 뒤 단계는 이미 반영됨');
  // 저장: 새로고침 뒤 그대로, 효과 중복 없음
  P.save(); const keepUp = JSON.stringify(R.site.ups), keepPow = P.sitePower();
  W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
  ok(P.load() && JSON.stringify(R.site.ups) === keepUp && P.sitePower() === keepPow, '저장 -> 불러오기: 강화·전투력 그대로');
  // 전투 중 저장 이어하기: 저장 지점의 대기실 체력이 그대로 (다시 안 곱함)
  P.startBattle();
  const SB = W.BSIM.create(P.battleInput(R.plan)); for (let i = 0; i < 30; i++) W.BSIM.step(SB, 0.1);
  const maxB = SB.dens.B7 ? SB.dens.B7.map(m => m.max) : [];
  ok(P.saveBattle({ snap: W.BSIM.snapshot(SB), ui: null }), '전투 저장');
  W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
  ok(P.load() && R.battling && R.bsave.snap, '전투 중 불러오기');
  const SR = W.BSIM.restore(P.battleInput(R.plan), R.bsave.snap);
  ok(SR && same(SR.dens.B7 ? SR.dens.B7.map(m => m.max) : [], maxB) && maxB.length > 0, '전투 이어하기: 대기실 체력 중복 없음 ' + JSON.stringify(maxB));
  R.battling = false; R.bsave = null; P.save();
  // 강화 칸 없는 옛 v7 저장 = 기본 단계, 현장 진행 보존
  const sv = JSON.parse(store[KEY]); delete sv.site.ups; store[KEY] = JSON.stringify(sv);
  W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
  ok(P.load() && R.v === 7 && same(R.site.ups, {}) && P.upgradeLevel('B7') === 1 && same(R.site.zones, sv.site.zones) && R.site.budget === sv.site.budget && R.quest.key === 'q1', '강화 칸 없는 v7 저장 -> 기본 단계, 진행 보존');
  // 깨진 강화 칸: 시설이 다름·빈 방·고정 구역·단계 밖 -> 지우거나 맞춤
  const sv2 = JSON.parse(store[KEY]);
  sv2.site.ups = { C2: { k: 'trap', lv: 3, paid: 30 }, FZ1: { k: 'fz_frozen_dock', lv: 2, paid: 10 }, D7: { k: 'trap', lv: 9, paid: -5 }, B7: { k: 'trap', lv: 2, paid: 10 }, E: 'x' };
  store[KEY] = JSON.stringify(sv2);
  W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
  ok(P.load() && same(Object.keys(R.site.ups), ['D7']) && R.site.ups.D7.lv === 3 && R.site.ups.D7.paid === 0, '깨진 강화 칸 보완: ' + JSON.stringify(R.site.ups));
}
// 납품: 강화는 현장과 함께 인계, 다음 현장·친위대에 안 남음 (시험용 2층 의뢰로 다음 현장 확인)
fresh(); enableQ2(BD);
P.pickQuest(P.offerQuests()[0]);
{
  R.site.budget = 999;
  ['B7', 'C6', 'D7'].forEach(z => P.buildZone(z, 'den'));
  ['C2', 'C3', 'C5', 'B1', 'D1', 'A1', 'E1', 'A2', 'E2', 'A3', 'E3', 'B5'].forEach(z => P.buildZone(z, 'trap'));
  ['B7', 'B7', 'C2', 'C2'].forEach(z => P.upgradeFacility(z));
  R.site.squads.forEach(s => { s.lv = 8; }); P.questUpdate();
  const pid = R.site.units.B7 && R.site.units.B7[0];
  const d = P.deliver();
  ok(d && d.upgrades === 2 && d.lost.some(x => /시설 강화 2곳/.test(x)), '납품 보고: 강화 2곳 인계 ' + JSON.stringify(d && d.lost));
  ok(d && P.pickQuest(R.offers[0], [pid]) && R.quest.key === 'q2' && same(R.site.ups, {}) && R.guards.length === 1, '다음 현장 = 강화 없음');
  const gd = R.guards[0], gv = P.unitById(gd.id), gp = P.statParts(gd.id, 'hp');
  ok(gv.hp === Math.round(gp.base + gp.level + gp.upgrade) && !('ups' in gd), '친위대 체력에 강화 보너스 없음');
  const ib = P.battleInput();
  ok(same(ib.up, { trap: {}, den: {} }), '다음 현장 전투 입력에 강화 없음');
  ok(P.upgradeInfo('2C2').code === 'locked', '잠긴 층 거절: ' + P.upgradeInfo('2C2').why);
}

// ===================== 16) 흐름 시험 (refs/brief_flow_test.md, API.md 15절): 일반 판 자동 반복 + 보스 도전 =====================
FLOW_ON = true;
{
  startQ1();
  ok(BD.FLOW.on && P.flowInfo().on && R.v === 7 && R.flow && R.flow.no === 0 && !R.tutorial.on, '흐름 시험 켬: 저장 v7 + flow 칸, 튜토리얼 끔');
  ok(P.weeklyBudget() === 0 && P.questUpdate().length === 0 && P.questProgress().line.indexOf('보스 검증 0/5') === 0, '마석 보급 없음·가치/전투력 단계 없음: ' + P.questProgress().line);
  ok(!R.plan && !P.planInfo(), '전투 전에는 계획 없음');
  // 일반 판: 번호 1, 2 ... 같은 바탕 씨앗 + 번호 = 같은 판
  const s1 = P.startBattle(), p1 = JSON.stringify(R.plan);
  ok(s1.ok && R.battling && R.plan.mode === 'normal' && R.plan.no === 1 && R.flow.mode === 'normal', '일반 1판 시작');
  const budget0 = R.site.budget, week0 = R.week, lv0 = JSON.stringify(R.site.squads.map(s => [s.lv, s.exp])), co0 = JSON.stringify(R.company), gold0 = R.gold;
  const S1 = runSim(W, P.battleInput()), rp = P.applyBattle(W.BSIM.result(S1));
  ok(rp && rp.mode === 'normal' && !R.battling && !R.plan && R.flow.no === 1, '일반 판 결과 반영 -> 전투 끝');
  ok(R.site.budget === budget0 && R.week === week0 && JSON.stringify(R.site.squads.map(s => [s.lv, s.exp])) === lv0 && JSON.stringify(R.company) === co0, '일반 판: 마석·주·경험치·회사 레벨 그대로');
  ok(R.gold === gold0 + rp.gold - rp.loot && Object.keys(R.site.rest).length === 0 && R.quest.stage === 0 && R.stats.battles === 1, '일반 판: 금만, 쉼 없음, 단계 그대로');
  P.startBattle();
  ok(R.plan.no === 2 && JSON.stringify(R.plan) !== p1, '일반 2판 = 다른 판');
  sample.flowNormal = { gold: rp.gold, reached: rp.reached, summary: rp.summary };
  // 같은 바탕 씨앗(같은 ?seed) = 같은 1판
  {
    const Wa = boot('?seed=99'), Wb = boot('?seed=99');
    [Wa, Wb].forEach(w => { w.PROGRESS.reset(); w.PROGRESS.pickQuest(w.PROGRESS.offerQuests()[0]); w.PROGRESS.startBattle(); });
    ok(JSON.stringify(Wa.PROGRESS.RUN.plan) === JSON.stringify(Wb.PROGRESS.RUN.plan), '같은 씨앗 + 같은 번호 = 같은 일반 판');
  }
  // 일반 판 중 배치 변경: 바로 확정되고 그 판은 버림 (다음 판부터 새 배치)
  ok(P.doorInfo(1).canEdit && P.previewLayout({ builds: { C6: 'den' } }).ok, '일반 판 중에도 건설 가능');
  const cl = P.commitLayout({ builds: { C6: 'den' } });
  ok(cl.ok && !R.battling && !R.plan && R.flow.mode === '', '일반 판 중 [건설] 확정 -> 그 판은 버림: ' + cl.msg);
  // 보스 도전: 일반 판 중이면 끊고 바로 보스
  P.startBattle();
  const bi = P.bossInfo();
  ok(bi && bi.stage === 1 && bi.total === 5 && bi.canChallenge && bi.name === BD.BOSSES.q1[0].name, '보스 정보 1단계: ' + JSON.stringify(bi && [bi.stage, bi.name, bi.squads]));
  const cb = P.challengeBoss();
  ok(cb.ok && R.battling && R.plan.mode === 'boss' && R.plan.stage === 1 && R.plan.seed === BD.BOSSES.q1[0].seed && R.flow.mode === 'boss' && R.flow.tries === 1, '보스 1단계 시작 (일반 판 끊음)');
  ok(P.startBattle().plan === R.plan && P.commitLayout({ builds: { C5: 'trap' } }).code === 'locked' && !P.doorInfo(1).canEdit && P.upgradeInfo('C6').code === 'locked', '보스 중: 일반 판 없음·배치 못 바꿈');
  ok(P.questProgress().why.indexOf('보스') >= 0 || !P.questProgress().complete, '보스 중 납품 불가');
  // 같은 배치 = 같은 결과 (결정론)
  const inB = P.battleInput(), rA = W.BSIM.result(runSim(W, inB)), rB = W.BSIM.result(runSim(W, P.battleInput()));
  ok(same(rA, rB), '같은 단계 보스 두 번 = 같은 결과');
  // 저장 지점 이어하기 (보스 중 새로고침)
  {
    const S = W.BSIM.create(P.battleInput());
    for (let i = 0; i < 100; i++) W.BSIM.step(S, 0.1);
    P.saveBattle({ snap: W.BSIM.snapshot(S), ui: { paused: true } });
    W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
    ok(P.load() && R.battling && R.flow.mode === 'boss' && R.plan.mode === 'boss' && R.bsave.snap && R.bsave.ui.paused === true, '보스 중 새로고침 -> 보스 판·멈춤 상태 이어짐');
    const S2 = W.BSIM.restore(P.battleInput(), R.bsave.snap);
    for (let i = 0; i < 6000 && !S2.done; i++) W.BSIM.step(S2, 0.1);
    ok(same(W.BSIM.result(S2).reached, rA.reached), '이어한 보스 판도 같은 결과');
  }
  // 대충 지은 판(대기실 하나) = 보스 1단계 실패, 잃는 것 없음
  const b0 = R.site.budget, gold1 = R.gold;
  const fail = P.applyBattle(rA);
  ok(rA.reached > 0 && fail && fail.mode === 'boss' && fail.boss && !fail.boss.success && R.quest.stage === 0 && R.site.budget === b0 && R.flow.cleared.length === 0, '대기실 하나 = 보스 1단계 실패, 단계·마석 그대로');
  ok(R.flow.show && R.flow.show.rows.length === rA.squads && R.flow.show.rows.some(r => r.state === 'reached' && r.rooms > 0 && r.lastName) && typeof R.flow.show.trapDmg === 'number' && Object.keys(R.flow.show.causes).length >= 0, '실패 결과: 분대마다 도달·지난 방·함정 피해·퇴각 원인');
  ok(P.applyBattle(rA) === null && R.gold === gold1 + fail.gold - fail.loot, '결과는 한 번만 반영');
  sample.bossFail = { reached: rA.reached, squads: rA.squads, time: Math.round(rA.time) };
  // 새로고침해도 결과 창 남음, 보상 중복 없음
  W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
  ok(P.load() && !R.battling && R.flow.show && !R.flow.show.success && R.quest.stage === 0 && R.site.budget === b0, '결과 직후 새로고침: 결과 창 그대로, 바뀐 것 없음');
  // [배치 고치기]: 입구 오른쪽 문 C1-D1 -> B6-C6 (오른쪽 길이 막히고 모두 가운데 대기실로) -> [다시 도전] 성공
  const dl = R.site.doors[1].map(d => d === 'C1-D1' ? 'B6-C6' : d), fx = P.commitLayout({ doors: { 1: dl } });
  ok(fx.ok, '문 바꾸기 확정: ' + fx.msg);
  ok(R.flow.show, '배치를 고쳐도 결과 창은 남음 (돌아와서 [다시 도전])');
  ok(P.challengeBoss().ok && R.flow.tries === 2 && !R.flow.show && R.plan.seed === BD.BOSSES.q1[0].seed, '다시 도전 = 같은 보스·같은 시드');
  const rW = W.BSIM.result(runSim(W, P.battleInput())), win = P.applyBattle(rW);
  ok(rW.reached === 0 && win.boss.success && R.quest.stage === 1 && win.stages[0] === 1, '문을 고친 배치 = 보스 1단계 성공 -> 단계 1');
  const gain1 = (BD.QUESTS[0].stages[0].budget | 0) + BD.FLOW.bossReward;
  ok(R.site.budget === b0 + gain1 && win.boss.reward === BD.FLOW.bossReward && win.boss.supply === (BD.QUESTS[0].stages[0].budget | 0) && win.budgetGain === gain1 && same(R.flow.cleared, [1]),
    '첫 성공 마석 +' + gain1 + ' (보급 + 첫 성공 보상): ' + JSON.stringify([win.boss.supply, win.boss.reward, win.budgetGain]));
  sample.bossWin = { time: Math.round(rW.time), den: rW.denRepels, trap: rW.trapRetreats, timeouts: rW.timeouts };
  W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
  ok(P.load() && R.quest.stage === 1 && R.site.budget === b0 + gain1 && R.flow.show.success, '성공 직후 새로고침: 보상 한 번만');
  ok(P.bossInfo().stage === 2 && P.questProgress().line.indexOf('보스 검증 1/5') === 0, '다음 보스 = 2단계');
  // 마지막 단계 성공 -> 납품 (가치·전투력과 상관없이). 일반 판 중이면 끊고 납품
  R.quest.stage = 4; P.save();
  P.challengeBoss(); const pb = R.plan;
  ok(pb.stage === 5 && pb.seed === BD.BOSSES.q1[4].seed, '5단계 보스');
  // 시험: 결과만 성공으로 꾸며 넣음 (보스 판정 = 보물방 도달 0)
  const r5 = W.BSIM.result(runSim(W, P.battleInput())); r5.reached = 0;
  const w5 = P.applyBattle(r5);
  ok(w5.boss.success && w5.boss.complete && R.quest.stage === 5 && P.questProgress().complete && P.checkQuest(), '마지막 보스 성공 -> 납품 가능: ' + P.questProgress().line);
  P.startBattle();
  ok(R.battling && P.checkQuest(), '일반 판 중에도 납품 가능');
  const dv = P.deliver();
  ok(dv && R.phase === 'settle' && !R.battling && !R.plan && dv.demoEnd, '납품 -> 정산 (일반 판은 버림) -> 데모 끝 신호');
  // 흐름 칸 없는 옛 v7 저장: 단계는 0부터, 진행 중 전투 버림
  startQ1();
  R.quest.stage = 3; P.startBattle(); delete R.flow; P.save();
  W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES;
  ok(P.load() && R.flow && R.flow.no === 0 && R.quest.stage === 0 && !R.battling && !R.plan, '흐름 칸 없는 옛 v7 저장 -> 단계 0, 전투 버림');
}

// ===================== 17) 마석 경제 (refs/brief_ui_restructure_core.md, API.md 16절): 시작 마석 + 단계 보급 + 보스 첫 성공 =====================
{
  const reload = () => { W = boot(); P = W.PROGRESS; R = P.RUN; BD = W.BATTLE_DATA; Z = W.ZONES; ok(P.load(), '새로고침'); };
  // 보스 판 하나를 끝까지 돌려 결과를 넣는다 (win이면 결과만 성공으로 꾸밈: 판정 = 보물방 도달 0)
  const bossRun = win => { const c = P.challengeBoss(); ok(c.ok, '보스 도전: ' + c.msg); const r = W.BSIM.result(runSim(W, P.battleInput())); if (win) r.reached = 0; return { r, rep: P.applyBattle(r) }; };
  startQ1();
  const Q = BD.QUESTS[0], RW = BD.FLOW.bossReward, sup = i => Q.stages[i].budget | 0;
  ok(P.budgetLeft() === Q.budget && R.site.budgetStart === Q.budget && R.site.budgetAdded === 0 && P.questProgress().budgetStart === Q.budget, '시작 마석 = 의뢰 budget ' + Q.budget);
  ok(P.weeklyBudget() === 0 && P.questProgress().weeklyBudget === 0, '주마다 보급 없음');
  // 데이터 모양: 보급은 단계마다 정수, 합계가 유한
  ok(Q.stages.every(s => (s.budget | 0) >= 0) && RW >= 0 && BD.BOSSES.q1.length === Q.stages.length, '단계 보급·첫 성공 보상 숫자');
  const bi = P.bossInfo();
  ok(bi.supply === sup(0) && bi.reward === RW && bi.gain === sup(0) + RW, 'bossInfo 이기면 받을 마석: ' + JSON.stringify([bi.supply, bi.reward, bi.gain]));
  // 일반 판 여러 번 = 마석 그대로
  for (let i = 0; i < 2; i++) { P.startBattle(); P.applyBattle(W.BSIM.result(runSim(W, P.battleInput()))); }
  ok(P.budgetLeft() === Q.budget && R.flow.no === 2, '일반 판 2번: 마석 그대로');
  // 실패 두 번 = 마석 그대로, 단계 그대로
  bossRun(false); P.closeBossResult();
  const f2 = bossRun(false);
  ok(!f2.rep.boss.success && f2.rep.budgetGain === 0 && P.budgetLeft() === Q.budget && R.quest.stage === 0 && R.flow.cleared.length === 0 && R.flow.tries === 2, '실패·재도전: 마석 0');
  // 성공: 보급 + 첫 성공 보상 한 번
  const w1 = bossRun(true);
  ok(w1.rep.boss.success && w1.rep.budgetGain === sup(0) + RW && w1.rep.boss.supply === sup(0) && w1.rep.boss.reward === RW && P.budgetLeft() === Q.budget + sup(0) + RW && same(R.flow.cleared, [1]),
    '1단계 성공: 마석 +' + (sup(0) + RW));
  ok(P.applyBattle(w1.r) === null && P.budgetLeft() === Q.budget + sup(0) + RW, '같은 결과 다시 넣어도 그대로');
  reload();
  ok(R.quest.stage === 1 && P.budgetLeft() === Q.budget + sup(0) + RW && R.flow.show && R.flow.show.supply === sup(0), '성공 뒤 새로고침: 한 번만');
  // 진행 중 보스를 저장하고 새로고침 -> 이어서 끝내도 한 번만
  P.challengeBoss();
  { const S = W.BSIM.create(P.battleInput()); for (let i = 0; i < 50; i++) W.BSIM.step(S, 0.1); P.saveBattle({ snap: W.BSIM.snapshot(S), ui: {} }); }
  reload();
  { const S = W.BSIM.restore(P.battleInput(), R.bsave.snap); for (let i = 0; i < 6000 && !S.done; i++) W.BSIM.step(S, 0.1); const r = W.BSIM.result(S); r.reached = 0; P.applyBattle(r); }
  const after2 = Q.budget + sup(0) + RW + sup(1) + RW;
  ok(R.quest.stage === 2 && P.budgetLeft() === after2 && same(R.flow.cleared, [1, 2]), '2단계 (중간 저장 이어하기) 성공: 마석 ' + P.budgetLeft() + ' = ' + after2);
  reload();
  ok(P.budgetLeft() === after2, '2단계 성공 뒤 새로고침 그대로');
  // 이미 받은 단계 번호가 cleared에 있으면 (깨진·옛 저장) 단계는 오르지만 마석은 다시 안 줌
  R.flow.cleared.push(3); P.save();
  ok(P.bossInfo().gain === 0, '받은 단계는 gain 0');
  const w3 = bossRun(true);
  ok(w3.rep.boss.success && R.quest.stage === 3 && w3.rep.budgetGain === 0 && P.budgetLeft() === after2, '이미 받은 단계: 마석 그대로');
  // 끝까지: 4·5단계 성공 -> 합계 = 시작 + 받은 단계들의 (보급 + 보상)
  bossRun(true); bossRun(true);
  const total = Q.budget + [0, 1, 3, 4].reduce((a, i) => a + sup(i) + RW, 0);
  ok(R.quest.stage === 5 && P.budgetLeft() === total && R.site.budgetAdded === total - Q.budget && P.bossInfo().gain === 0 && P.bossInfo().done, '5단계까지 마석 합계 ' + total);
  sample.economy = { start: Q.budget, supply: Q.stages.map(s => s.budget | 0), reward: RW, power: BD.BOSSES.q1.map(b => b.power) };
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
        for p in r["problems"][:60]:
            print("  - " + p)
        return 1
    print("[test_d1_core] 통과: 판 g1·탐험 규칙 -> 미리보기 경로 = 전투 경로 -> 문 옮기기(tokens·target·disconnected·limit·budget·locked) -> 조사·빠르게·함정 2회 -> 조우 즉시 승패 -> 복원 -> 마석/회사 금·가치/전투력 -> 납품·데모 끝 -> 층별 차례 전투 -> 퇴각·쉼 -> 카드 위기 -> 튜토리얼 강조 -> 대기실 부대 -> 저장 v7·?seed= -> 시설 강화 -> 흐름 시험(일반 판 반복·보스 도전)")
    print("  " + json.dumps(r["sample"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
