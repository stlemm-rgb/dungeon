"""코드 규칙 검사: 값 통로, 무작위 구분, 금지 함수, 색 변수, 모듈 금지.

실패 조건
  1. js/core_state.js 밖에서 state를 직접 바꿈 (state.x = , state.x++, state.list.push(...), delete state.x 등)
  2. js/fx.js 밖에서 Math.random 사용 / 게임 계산 파일(core_, data_)에서 fx 함수 사용
  3. confirm() / alert() / prompt() 사용 (웹에서 막힘. ui_askConfirm 쓰기)
  4. css/style.css에서 맨 위 :root 밖에 #색·rgb()·hsl()·색 이름 / index.html에 style= 속성
  5. ES 모듈(import/export, type="module")이나 외부 주소(http) 불러오기
사용: python tools/test_rules.py
"""
import os
import re
import sys

import tool_common as tc

STATE_OWNER = "js/core_state.js"
FX_OWNER = "js/fx.js"

ASSIGN_RE = re.compile(
    r"\bstate(?:\s*\.\s*[A-Za-z_$][\w$]*|\s*\[[^\]]*\])+\s*(?:[-+*/%&|^]|\*\*|<<|>>>?|&&|\|\||\?\?)?=(?!=)"
)
INCDEC_RE = re.compile(r"(?:\+\+|--)\s*state\s*[.\[]|\bstate(?:\s*\.\s*[A-Za-z_$][\w$]*|\s*\[[^\]]*\])+\s*(?:\+\+|--)")
REBIND_RE = re.compile(r"(?<![\w$.])state\s*=(?!=)")
MUTATE_RE = re.compile(
    r"\bstate(?:\s*\.\s*[A-Za-z_$][\w$]*|\s*\[[^\]]*\])+\s*\.\s*(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin|set|add|delete|clear)\s*\("
)
OTHER_MUT_RE = re.compile(r"\bdelete\s+state\b|Object\.(assign|defineProperty|defineProperties|setPrototypeOf)\s*\(\s*state\b")
FORBIDDEN_CALL_RE = re.compile(r"(?<![\w$.])(?:window\s*\.\s*)?(alert|confirm|prompt)\s*\(")
COLOR_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(")
NAMED_COLORS = ("white", "black", "red", "green", "blue", "yellow", "orange", "purple", "gray", "grey",
                "pink", "brown", "cyan", "magenta", "silver", "gold", "navy", "teal", "maroon", "olive", "lime")
NAMED_COLOR_RE = re.compile(r":\s*[^;{}]*\b(" + "|".join(NAMED_COLORS) + r")\b", re.I)


def line_of(src, pos):
    return src.count("\n", 0, pos) + 1


def check_js(problems):
    for rel in tc.game_js_files():
        src = tc.strip_js(tc.read(rel))
        base = os.path.basename(rel)
        if rel != STATE_OWNER:
            for rx, what in ((ASSIGN_RE, "state 직접 대입"), (INCDEC_RE, "state 직접 ++/--"),
                             (REBIND_RE, "state 통째로 바꾸기"), (MUTATE_RE, "state 안 배열/객체 직접 바꾸기"),
                             (OTHER_MUT_RE, "state 직접 바꾸기")):
                for m in rx.finditer(src):
                    problems.append("%s:%d: %s (state_ 통로 함수를 쓰세요): %s"
                                    % (rel, line_of(src, m.start()), what, m.group(0).strip()))
        if rel != FX_OWNER:
            for m in re.finditer(r"\bMath\s*\.\s*random\b", src):
                problems.append("%s:%d: Math.random은 js/fx.js에서만 (게임 결과는 rng_game, 연출은 fxRandom)"
                                % (rel, line_of(src, m.start())))
        if base.startswith("core_") or rel.startswith("data/"):
            for m in re.finditer(r"(?<![\w$.])fx[A-Z]\w*", src):
                problems.append("%s:%d: 게임 계산 파일에서 연출용 %s 사용 (rng_ 함수를 쓰세요)"
                                % (rel, line_of(src, m.start()), m.group(0)))
        for m in FORBIDDEN_CALL_RE.finditer(src):
            problems.append("%s:%d: %s() 금지 (웹에서 막힘, ui_askConfirm 사용)"
                            % (rel, line_of(src, m.start()), m.group(1)))
        for m in re.finditer(r"^\s*(import|export)\b", src, re.M):
            problems.append("%s:%d: ES 모듈 %s 금지 (file://에서 안 돌아감)" % (rel, line_of(src, m.start()), m.group(1)))


def check_css(problems):
    rel = "css/style.css"
    src = tc.read(rel)
    clean = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), src, flags=re.S)
    root = re.search(r":root\s*\{[^}]*\}", clean)
    if not root:
        problems.append("%s: 맨 위에 :root { 색 변수 } 블록이 없음" % rel)
        return
    if clean[:root.start()].strip():
        problems.append("%s: :root 블록이 맨 위에 있지 않음" % rel)
    body = clean[:root.start()] + re.sub(r"[^\n]", " ", clean[root.start():root.end()]) + clean[root.end():]
    for m in COLOR_RE.finditer(body):
        problems.append("%s:%d: :root 밖에 색을 직접 씀 '%s' (var(--이름) 사용)" % (rel, line_of(body, m.start()), m.group(0)))
    for m in NAMED_COLOR_RE.finditer(body):
        problems.append("%s:%d: :root 밖에 색 이름 '%s' (var(--이름) 사용)" % (rel, line_of(body, m.start()), m.group(1)))


def check_html(problems):
    for rel in ("index.html", "tools/harness.html"):
        src = tc.read(rel)
        if re.search(r'type\s*=\s*"module"', src):
            problems.append("%s: type=\"module\" 금지" % rel)
        for m in re.finditer(r'(?:src|href)\s*=\s*"(https?:)?//', src):
            problems.append("%s:%d: 외부 주소 불러오기 금지 (CDN·외부 라이브러리 금지)" % (rel, line_of(src, m.start())))
    src = tc.read("index.html")
    for m in re.finditer(r"\sstyle\s*=", src):
        problems.append("index.html:%d: style= 속성 금지 (css/style.css에 클래스로)" % line_of(src, m.start()))
    if re.search(r"<style", src):
        problems.append("index.html: <style> 금지 (css/style.css에)")


def main():
    tc.setup_output()
    problems = []
    check_js(problems)
    check_css(problems)
    check_html(problems)
    if problems:
        print("[test_rules] 실패 %d건" % len(problems))
        for p in problems:
            print("  - " + p)
        return 1
    print("[test_rules] 통과: state 직접 변경 0, Math.random 위반 0, confirm/alert 0, :root 밖 색 0, 모듈·외부 주소 0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
