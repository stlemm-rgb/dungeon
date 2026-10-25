# 지시서: 시설 강화 구현 1단계 — 로직 (core-dev, 2026-10-25)

근거: **확정 기획서 `docs/specs/facility_upgrade.md`** (맨 위 확정 줄 = 8절 ①~⑥ 추천 A대로, 적은 점점 강해짐). 계약서 `prototype/d1_demo/API.md`.

## 맡는 파일
`prototype/d1_demo/` progress.js · battle_sim.js · battle_data.js · zones.js(필요할 때만) · API.md(새 절), `tools/test_d1_core.py` · `tools/test_oldsaves.py`(필요하면), PROGRESS.md. **화면 파일은 고치지 않는다**(frontend 몫).

## 할 것 (기획서 3·4·7절)
- 함정 = 피해, 대기실 = 그 방 부대·친위대의 전투 체력. 3단계(기본 포함), 비용 10 → 20 마석(임시, `battle_data.js` 한곳에). 전투 시작 때 적용, 영구 성장에 더하지 않음, 전투 중 저장 복원 때 중복 없음.
- 강화는 실제 전투와 예상 전투력(`powerParts` 등) 둘 다 반영. 시설 가치에는 보너스 없음. 바뀌면 납품 단계 다시 계산.
- 거절: 전투 중·미확정·잠긴 층·고정 구역·빈 방·미끼·입구·보물방·최고 단계·마석 부족.
- 문만 옮기면 강화 유지. 시설 교체·철거 확정 때 강화 지우고 **실제 낸 강화 마석만 1번** 환급(미확정 취소는 무변경). 환급·재건으로 무료 부대 중복 지급 없음.
- 납품하면 현장과 함께 인계(다음 현장·친위대에 안 남음).
- q1 시작 마석 110 → **200 시험**(기획서 ⑥). 측정: 첫 전투 전 납품되는지, 안내대로·욕심쟁이 정책의 납품 주. 결과를 battle_data.js 주석과 보고에.
- API (화면용): `upgradeInfo(방)` → `{ ok, why, level, max, cost, effectNow, effectNext, budgetAfter, powerNow, powerAfter }`, `upgradeFacility(방)` → `{ ok, msg }`. `previewLayout`·`commitLayout`에 교체 때 사라질 강화·환급액 표시용 값. 이름은 다르게 해도 되지만 API.md에 새 절로 적는다.
- 저장: 강화 칸 추가. 강화 칸 없는 v7 저장은 기본 단계로 읽음(버전 올림이 필요하면 판단해 보고).
- 검사(기획서 7절 규칙·연결·저장 검사)를 `test_d1_core.py`에.
- **카드 등급처럼 나중 확장(사용자 메모)**: 데이터는 단계 표로 두어 단계 수·효과를 쉽게 늘릴 수 있게.

## 끝 기준
- `py tools/check_all.py` 종료 코드 0 (15개). D1 기준 사진이 바뀌면 갱신하지 말고 보고.
- 워크트리 브랜치에 커밋, push 금지. 보고: 쉬운 한국어 표(바꾼 것 · 새 API · 측정표 · 남은 문제).
