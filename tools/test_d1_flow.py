"""D1 한 바퀴 검사: 헤드리스 Chrome으로 prototype/d1_demo를 실제로 눌러 처음부터 데모 끝까지 진행한다 (tools/d1_drive.js flow).

순서: ?seed=7 새 게임 -> 의뢰 카드 -> 현장 -> 건설 모드 -> 문 하나 마우스로 끌어 옮기기 + 대기실 끌어 놓기 -> [건설] 확정 ->
      [홈] -> [다음 주 ▶] -> (전투 화면에서 새로고침해도 전투 화면) -> 배속 ×5 -> 전투 시작 -> 카드·알림은 눌러 넘김 -> 결과표(요약 한 줄) ->
      [홈으로] -> 새로고침 뒤 같은 진행 -> (API로 빨리 감기: 매주 시설 짓기 + 전투 계산, 20주 안에 의뢰 완료) -> [납품하기] -> [정산 마치기] -> 데모 끝 화면.
실패 조건: 단계 하나라도 어긋남, 콘솔 오류·예외가 하나라도 있음. node가 없으면 건너뜀(통과). 약 30초.
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
