"""D1 한 바퀴 검사: 헤드리스 Chrome으로 prototype/d1_demo를 실제로 눌러 처음부터 데모 끝까지 진행한다 (tools/d1_drive.js flow).

흐름 시험(2026-10-28, refs/brief_flow_test.md, API.md 15절) 순서:
      ?seed=7 새 게임 -> 의뢰 카드 -> 현장(정비) -> [운영 ▶] 일반 판 자동 시작 (새로고침해도 같은 판) -> 배속 ×5 -> 일반 판이 저절로 3판째까지 (카드·결과표 없음,
      마석·경험치·주·단계 그대로) -> [건설] 대기실 C6 끌기 -> [건설] (일반 판 버림) -> 현장 탭 -> [보스 도전] 1단계 (보스 중엔 다른 화면 못 감) -> 실패 결과 창 ->
      새로고침 유지 -> [다시 도전] 같은 결과 (결정론) -> [배치 고치기] 문 C1-D1을 B6-C6로 마우스로 끌기 -> [건설] -> 돌아와 [다시 도전] 성공 (단계 1, 첫 성공 마석) ->
      새로고침해도 보상 한 번 -> [일반 침입 재개] -> [정비] -> (API로 빨리 감기: 대기실 3 + 함정 9 + 문 하나, 보스 2~5단계 실제 전투) -> [납품하기] -> [정산 마치기] -> 데모 끝 화면.
실패 조건: 단계 하나라도 어긋남, 콘솔 오류·예외가 하나라도 있음. node가 없으면 건너뜀(통과). 약 55초.
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
