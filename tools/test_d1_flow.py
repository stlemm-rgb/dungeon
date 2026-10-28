"""D1 한 바퀴 검사: 헤드리스 Chrome으로 prototype/d1_demo를 실제로 눌러 처음부터 데모 끝까지 진행한다 (tools/d1_drive.js flow).

UI 개편(2026-10-29, docs/specs/ui_restructure.md 확정본, refs/brief_ui_restructure_ui.md) 순서:
      ?seed=7 새 게임 -> 회사 의뢰 게시판(탭 3개, 군단 잠김, 전투력 —) -> 카드 수락 -> 현장 운영 (일반 1판 자동 시작, 새로고침해도 같은 판) -> 배속 ×5 -> 일반 판이 저절로 3판째까지
      (카드·결과표 없음, 경험치·주·단계 그대로, `최근:` 줄) -> 회사 탭 (일반 판 멈춤, 회사에 [납품] 없음) -> 군단 탭 (부족 2열 카드·신석 강화·친위대 잠김) -> 현장 탭 (이어 감) ->
      [건설] 대기실 끌기(미확정) -> 탭 누르면 묻는 창 -> [계속 수정] -> [취소] (비용 0, 같은 일반 판) -> [건설] -> [건설 확정] (현장 복귀, 새 일반 판) -> [출진] 창 열고 닫기 ->
      [보스 도전] 1단계 (보스 중엔 탭 이동 막힘) -> 실패 결과(분대별 펼침) -> 새로고침·탭 왕복 뒤에도 결과 유지 -> [다시 도전] 같은 결과 (결정론) ->
      [배치 고치기] 문 C1-D1을 B6-C6로 마우스로 끌기 -> [건설 확정] -> 결과로 복귀 -> [다시 도전] 성공 (단계 1, 첫 성공 마석, 새로고침해도 보상 한 번) -> [일반 침입 재개] ->
      (API로 빨리 감기: 대기실 3 + 함정 9 + 문 하나, 보스 2~5단계 실제 전투) -> 회사엔 안내만 -> 현장 5/5 결과의 큰 [납품] -> 회사 정산(새로고침 복원) -> [정산 마치기] -> 데모 끝(회사) -> 군단·작품집.
각 화면에서 가로 넘침 0, 주요 버튼이 탭 막대에 안 가림도 잰다. 마석 숫자는 하드코딩하지 않고 API에서 읽어 비교한다.
실패 조건: 단계 하나라도 어긋남, 콘솔 오류·예외가 하나라도 있음. node가 없으면 건너뜀(통과). 약 75초.
사용: python tools/test_d1_flow.py
"""
import sys

import tool_common as tc


def main():
    tc.setup_output()
    r = tc.run_node_tool(["tools/d1_drive.js", "flow"], timeout=240)
    if r is None:
        print("[test_d1_flow] node 없음: 건너뜀")
        return 0
    if r.get("fatal"):
        print("[test_d1_flow] 실패: 실행기 오류\n  " + r["fatal"].replace("\n", "\n  "))
        return 1
    problems = list(r.get("problems", [])) + ["콘솔 오류: " + e for e in r.get("logs", [])]
    if problems:
        print("[test_d1_flow] 실패 %d건" % len(problems))
        for p in problems:
            print("  - " + p)
        for s in r.get("steps", []):
            print("    (지난 단계) " + s)
        return 1
    print("[test_d1_flow] 통과: %d단계, 콘솔 오류 0" % len(r["steps"]))
    for s in r["steps"]:
        print("  " + s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
