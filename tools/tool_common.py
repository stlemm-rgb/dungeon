"""검사 도구 공용 부품: 경로, 브라우저 찾기, 헤드리스 실행, JS 전역 이름 읽기.

규칙: 표준 라이브러리만 쓴다 (pip 설치 금지). Node.js 없이 Chrome/Edge 헤드리스로 JS를 돌린다.
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools")
NAME_RULES_PATH = os.path.join(TOOLS, "name_rules.json")

BROWSER_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


def setup_output():
    """콘솔/파이프 어디로 출력해도 한글이 터지지 않게."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def find_browser():
    """Chrome 또는 Edge 실행 파일 경로. 환경 변수 GAME_BROWSER가 있으면 그걸 쓴다."""
    env = os.environ.get("GAME_BROWSER")
    if env and os.path.exists(env):
        return env
    for path in BROWSER_CANDIDATES:
        if path and os.path.exists(path):
            return path
    for name in ("chrome", "msedge", "google-chrome", "chromium"):
        found = shutil.which(name)
        if found:
            return found
    raise RuntimeError("Chrome 또는 Edge를 찾지 못했습니다. GAME_BROWSER 환경 변수로 경로를 알려 주세요.")


def file_url(rel_path, query=None, hash_text=None):
    """저장소 안 파일의 file:/// 주소."""
    path = os.path.join(ROOT, rel_path).replace("\\", "/")
    url = "file:///" + urllib.parse.quote(path.lstrip("/"), safe="/:")
    if query:
        url += "?" + urllib.parse.urlencode(query)
    if hash_text is not None:
        url += "#" + urllib.parse.quote(hash_text, safe="")
    return url


def run_browser(url, extra_args, timeout=90):
    """헤드리스 브라우저를 매번 새 프로필로 실행한다 (사용자의 브라우저·저장과 섞이지 않게)."""
    browser = find_browser()
    profile = tempfile.mkdtemp(prefix="dungeon_headless_")
    args = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--hide-scrollbars",
        "--allow-file-access-from-files",
        "--user-data-dir=" + profile,
    ] + list(extra_args) + [url]
    try:
        proc = subprocess.run(args, capture_output=True, timeout=timeout)
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    return proc


def run_harness(query, hash_text=None, window=(1280, 900), timeout=90):
    """tools/harness.html을 열어 #result의 JSON을 돌려준다."""
    url = file_url("tools/harness.html", query, hash_text)
    proc = run_browser(url, ["--window-size=%d,%d" % window, "--virtual-time-budget=5000", "--dump-dom"], timeout)
    dom = proc.stdout.decode("utf-8", "replace")
    m = re.search(r'<pre id="result"[^>]*>(.*?)</pre>', dom, re.S)
    if not m:
        hint = ""
        if not dom.strip():
            hint = " - 브라우저가 아무것도 출력하지 않음. 이 PC의 Edge는 헤드리스 출력이 안 나왔으니 Chrome을 쓰세요 (GAME_BROWSER)"
        raise RuntimeError("harness 결과를 찾지 못함 (브라우저 %s, 종료 코드 %s)%s"
                           % (os.path.basename(find_browser()), proc.returncode, hint))
    text = html.unescape(m.group(1))
    if text.strip() == "RUNNING":
        raise RuntimeError("harness가 끝나지 않음 (스크립트 오류?)")
    data = json.loads(text)
    if data.get("fatal"):
        raise RuntimeError("harness 오류: " + data["fatal"])
    return data


def screenshot(query, out_path, window, timeout=90):
    """harness.html 틀 모드로 스크린샷을 찍는다."""
    url = file_url("tools/harness.html", query)
    if os.path.exists(out_path):
        os.remove(out_path)
    run_browser(url, ["--window-size=%d,%d" % window, "--virtual-time-budget=5000",
                      "--screenshot=" + out_path], timeout)
    if not os.path.exists(out_path):
        raise RuntimeError("스크린샷 파일이 생기지 않음: " + out_path)


# ---------- JS 소스 읽기 ----------

def strip_js(src):
    """주석과 글자(따옴표·템플릿) 내용을 지운 소스. 줄 수는 그대로 둔다."""
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if c == "/" and nxt == "/":
            while i < n and src[i] != "\n":
                i += 1
            continue
        if c == "/" and nxt == "*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(re.sub(r"[^\n]", " ", src[i:j]))
            i = j
            continue
        if c in "\"'`":
            q = c
            out.append(q)
            i += 1
            while i < n and src[i] != q:
                if src[i] == "\\":
                    i += 2
                    continue
                if q != "`" and src[i] == "\n":
                    break
                out.append("\n" if src[i] == "\n" else " ")
                i += 1
            out.append(q)
            i += 1
            continue
        if c == "/" and _regex_can_start(out):
            # 정규식 글자 /.../ 건너뛰기
            j = i + 1
            in_class = False
            while j < n and src[j] != "\n":
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == "[":
                    in_class = True
                elif src[j] == "]":
                    in_class = False
                elif src[j] == "/" and not in_class:
                    break
                j += 1
            out.append("/" + " " * (j - i - 1) + "/")
            i = j + 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


def _regex_can_start(out):
    k = len(out) - 1
    while k >= 0 and out[k] in " \t\r\n":
        k -= 1
    if k < 0:
        return True
    prev = out[k]
    if prev in "(,=:[!&|?{};+-*%<>~^":
        return True
    tail = "".join(out[max(0, k - 6):k + 1])
    return re.search(r"\b(return|typeof|case|in|of)$", tail) is not None


def js_globals(path):
    """파일 맨 바깥(괄호 깊이 0)에서 선언한 이름들. [(종류, 이름, 줄번호)]"""
    with open(path, encoding="utf-8") as f:
        src = strip_js(f.read())
    found = []
    depth = 0
    line = 1
    i, n = 0, len(src)
    decl = re.compile(r"(async\s+function\s*\*?|function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)")
    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
        elif c in "({[":
            depth += 1
        elif c in ")}]":
            depth -= 1
        elif depth == 0 and (i == 0 or not (src[i - 1].isalnum() or src[i - 1] in "_$.")):
            m = decl.match(src, i)
            if m:
                kind = m.group(1).split()[0] if "function" not in m.group(1) else "function"
                name = m.group(2)
                rest = src[m.end():m.end() + 80]
                if kind in ("const", "let", "var") and re.match(r"\s*=\s*(async\s+)?(function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)", rest):
                    kind = "function"
                found.append((kind, name, line))
                # 같은 줄 const a = 1, b = 2 처럼 쉼표로 이어진 이름은 다루지 않는다 (쓰지 말 것)
                i = m.end()
                continue
        i += 1
    return found


def py_functions(path):
    with open(path, encoding="utf-8") as f:
        return re.findall(r"^def\s+(\w+)\s*\(", f.read(), re.M)


def load_name_rules():
    with open(NAME_RULES_PATH, encoding="utf-8") as f:
        return json.load(f)


def game_js_files():
    """검사 대상 JS 파일 (저장소 기준 경로, / 구분)."""
    out = []
    for folder in ("data", "js", "tools"):
        base = os.path.join(ROOT, folder)
        if not os.path.isdir(base):
            continue
        for name in sorted(os.listdir(base)):
            if name.endswith(".js"):
                out.append(folder + "/" + name)
    return out


def read(rel_path):
    with open(os.path.join(ROOT, rel_path), encoding="utf-8") as f:
        return f.read()
