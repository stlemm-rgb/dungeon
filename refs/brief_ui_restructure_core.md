# 지시서: UI 개편 — 로직 몫 (마석 경제, core-dev)

> 2026-10-29 총괄. 근거: `docs/specs/ui_restructure.md`(확정), `refs/debate_ds_restructure_2026-10-28.md` 최종 수렴 "경제" 줄, `prototype/d1_demo/API.md` 15절.
> 같은 때 `frontend`가 화면을 고친다. 파일이 겹치지 않게 아래 파일만 고친다.

## 고칠 파일 (이것만)
`prototype/d1_demo/battle_data.js` · `prototype/d1_demo/progress.js` · `prototype/d1_demo/battle_sim.js`(꼭 필요할 때만) · `prototype/d1_demo/API.md`(새 16절) · `tools/test_d1_core.py`
화면 파일(shell.js·battle.js·build.js·lines.js·css·html)과 `tools/test_d1_flow.py`·`d1_drive.js`·`shots.py`는 frontend 몫이라 건드리지 않는다.

## 할 일
1. **마석 경제 모양**(흐름 시험 켜진 때): 마석 = 의뢰 시작 마석 + 단계마다 한도 있는 보급 + 보스 단계 첫 성공 보상. 주마다 +30 무한 보급·다음 주 쉼은 없음(이미 꺼져 있으면 확인만). 이미 있는 `budget(단계)`·`FLOW.bossReward`를 쓰면 되면 새 칸을 만들지 않는다.
2. **임시 숫자 맞추기 — 목표는 "문 퍼즐이 할 일이 있게"**. 지금 마석 200이면 1~4단계 보스가 함정만으로 막혀 문을 옮길 이유가 없다(사용자 소감 "특별한 점을 못 느낌"의 유력한 원인). 시작 마석·단계 보급·보스 첫 성공 보상·(필요하면) `BATTLE_DATA.BOSSES` 힘을 조정해서 아래가 되게:
   - 1단계 보스: 문을 안 옮겨도 보물방 앞에 대기실/함정을 놓는 정도로 막힌다 (첫 성공 경험).
   - 3~5단계 중 적어도 한 단계: **그 시점 마석으로 문을 안 옮기는 어떤 배치로도 못 막고, 문을 옮기면 막힌다.**
   - 5단계까지 문 옮기기를 쓰는 언덕 오르기 정책이 20시드 중 대부분 납품한다(막힘 없음).
   - 측정 방식은 자유(예: 시설만 언덕 오르기 vs 시설+문 이동 언덕 오르기, 단계별 성공 여부). 결과 표와 방식은 `battle_data.js` 주석에 남긴다(측정 스크립트는 스크래치 폴더라 다른 PC엔 없음). 숫자는 **임시**이며 밸런스는 나중이다.
3. 흐름 시험 끈 경로(`FLOW.on = false`, 옛 주 단위)는 망가뜨리지 않는다(검사 1~15절 그대로 통과).
4. `API.md` 16절: 경제 규칙·숫자·측정 표 요약. `test_d1_core.py`: 새 경제 검사(시작 마석·단계 보급 한 번만·첫 성공 보상 한 번만·재도전·새로고침 중복 없음).

## 끝 기준
- `py tools/check_all.py`에서 test_d1_core·test_lines D1·door_lab selftest 통과. (shots D1은 이 PC에서 이모지 글꼴 차이로 원래 실패, test_d1_flow·shots는 숫자 문구가 바뀌어 실패할 수 있음 → 실패 이유가 마석 숫자뿐인지만 보고. 기준 사진 `--update` 금지)
- 워크트리 브랜치에 커밋. 보고: 고른 숫자, 측정 표, 3~5단계 중 "문이 필요한 단계", frontend가 알아야 할 바뀐 함수/값.
