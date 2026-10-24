"""화면 검사: D1 데모(prototype/d1_demo)와 옛 루트 게임(index.html)의 스크린샷을 기준 이미지와 비교하고, 가로 넘침·콘솔 오류를 잰다.

묶음
  --d1   D1 데모 6장 (회사·현장·건설 모드·전투 12초·결과표 390x844 + 회사 1280x800). 기준 이미지 tools/shots/d1/.
         tools/d1_drive.js(node + Chrome CDP)로 찍는다. node가 없으면 건너뜀(통과).
  --old  옛 루트 게임 4장 (tools/harness.html 틀 모드). 기준 이미지 tools/shots/*.png. 옛 기준은 갱신하지 않는다(보관 예정).
  (둘 다 안 주면 둘 다)
실패 조건
  - 가로 넘침 (문서 폭이 창 폭보다 큼) 또는 화면이 안 그려짐 / 콘솔 오류·예외 (D1)
  - 기준 이미지와 다른 점이 DIFF_LIMIT(비율)보다 많음
화면을 일부러 바꿨으면 tools/shots/out/의 새 이미지를 눈으로 확인한 뒤 --update로 기준을 바꾼다 (예: py tools/shots.py --d1 --update).
사용: python tools/shots.py [--d1|--old] [--update]
"""
import json
import os
import shutil
import struct
import subprocess
import sys
import zlib

import tool_common as tc

SHOT_DIR = os.path.join(tc.TOOLS, "shots")
OUT_DIR = os.path.join(SHOT_DIR, "out")
D1_DIR = os.path.join(SHOT_DIR, "d1")          # D1 기준 이미지
D1_OUT = os.path.join(OUT_DIR, "d1")
DIFF_LIMIT = 0.0005     # 다른 점이 0.05%를 넘으면 실패 (같은 PC에서 3번 찍어 잰 흔들림은 0.000%, 버튼 하나 없애면 0.54%)
CHANNEL_TOLERANCE = 24  # 글꼴 가장자리 흐림 정도의 차이는 같다고 봄
# 헤드리스 Chrome이 가끔 창 맨 아래 몇 줄(약 7px)을 그리기 전에 찍어 흰 줄이 생긴다(매번 다른 장이 0.1~0.4% 실패하던 원인).
# 창을 이만큼 더 크게 찍고 위쪽 폭 x 높이만 잘라 비교한다.
EXTRA_H = 120

CASES = [
    # 이름, 폭, 높이, 게임 주소 옵션
    ("main_390", 390, 844, "seed=1"),
    ("main_1280", 1280, 800, "seed=1"),
    ("confirm_390", 390, 844, "seed=1&show=confirm"),
    ("nostorage_390", 390, 844, "seed=1&nostorage=1"),
]


def read_png(path):
    """PNG를 (폭, 높이, 한 점 바이트 수, 픽셀 bytes)로 읽는다. 8비트 RGB/RGBA만."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("PNG가 아님: " + path)
    pos, idat = 8, []
    width = height = bpp = 0
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or color not in (2, 6) or interlace:
                raise ValueError("지원하지 않는 PNG 형식: " + path)
            bpp = 3 if color == 2 else 4
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
        pos += 12 + length
    raw = zlib.decompress(b"".join(idat))
    stride = width * bpp
    out = bytearray(height * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(height):
        ftype = raw[p]
        line = bytearray(raw[p + 1:p + 1 + stride])
        p += 1 + stride
        if ftype == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif ftype == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif ftype == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
        elif ftype == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return width, height, bpp, bytes(out)


def write_png(path, width, height, bpp, pixels):
    """8비트 RGB/RGBA 픽셀을 PNG로 쓴다 (필터 없음)."""
    stride = width * bpp
    raw = b"".join(b"\x00" + pixels[y * stride:(y + 1) * stride] for y in range(height))

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2 if bpp == 3 else 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def crop_top(src, dst, width, height):
    """src의 왼쪽 위 width x height만 잘라 dst로 쓴다."""
    w, h, bpp, px = read_png(src)
    if w < width or h < height:
        raise RuntimeError("스크린샷이 너무 작음 %dx%d (필요 %dx%d)" % (w, h, width, height))
    rows = b"".join(px[y * w * bpp:(y * w + width) * bpp] for y in range(height))
    write_png(dst, width, height, bpp, rows)


def compare(base_path, new_path):
    """다른 점 비율 (0~1). 크기가 다르면 1."""
    w1, h1, b1, px1 = read_png(base_path)
    w2, h2, b2, px2 = read_png(new_path)
    if (w1, h1) != (w2, h2):
        return 1.0, "크기 다름 %dx%d -> %dx%d" % (w1, h1, w2, h2)
    differ = 0
    for i in range(w1 * h1):
        o1, o2 = i * b1, i * b2
        if (abs(px1[o1] - px2[o2]) > CHANNEL_TOLERANCE or abs(px1[o1 + 1] - px2[o2 + 1]) > CHANNEL_TOLERANCE
                or abs(px1[o1 + 2] - px2[o2 + 2]) > CHANNEL_TOLERANCE):
            differ += 1
    return differ / float(w1 * h1), ""


def check_base(name, out_png, base_dir, rel_out, update, problems, lines, note):
    """out_png를 base_dir의 기준 이미지와 비교 (없거나 --update면 기준으로 복사)."""
    base_png = os.path.join(base_dir, name + ".png")
    if update or not os.path.exists(base_png):
        os.makedirs(base_dir, exist_ok=True)
        shutil.copyfile(out_png, base_png)
        lines.append("  %s: 기준 이미지 %s (%s)" % (name, "갱신" if update else "새로 만듦", note))
        return
    ratio, why = compare(base_png, out_png)
    if ratio > DIFF_LIMIT:
        problems.append("%s: 기준 이미지와 %.2f%% 다름 %s (%s 확인, 맞으면 --update)" % (name, ratio * 100, why, rel_out))
    else:
        lines.append("  %s: 다른 점 %.3f%%, %s" % (name, ratio * 100, note))


def old_shots(update, problems, lines):
    """옛 루트 게임 (index.html) 4장."""
    for name, w, h, opts in CASES:
        src = "../index.html?" + opts
        frame_query = {"mode": "frame", "w": w, "h": h, "src": src}
        info = tc.run_harness(frame_query)
        for e in info.get("errors", []):
            problems.append("%s: %s" % (name, e))
        if not info.get("rendered"):
            problems.append("%s: 화면이 그려지지 않음 (스크립트 오류?)" % name)
        if info.get("overflowX"):
            problems.append("%s: 가로 넘침 scrollWidth %s > 폭 %s (넘친 요소: %s)"
                            % (name, info["scrollWidth"], info["innerWidth"], ", ".join(info["wideElements"])))
        out_png = os.path.join(OUT_DIR, name + ".png")
        raw_png = os.path.join(OUT_DIR, name + "_raw.png")
        tc.screenshot(frame_query, raw_png, (w, h + EXTRA_H))
        crop_top(raw_png, out_png, w, h)
        os.remove(raw_png)
        check_base(name, out_png, SHOT_DIR, "tools/shots/out/%s.png" % name, update, problems, lines,
                   "넘침 없음 (scrollWidth %s / 폭 %s, 버전 %s)" % (info["scrollWidth"], info["innerWidth"], info.get("version")))
    return len(CASES)


def d1_shots(update, problems, lines):
    """D1 데모 화면 (tools/d1_drive.js shots). node가 없으면 None."""
    os.makedirs(D1_OUT, exist_ok=True)
    r = tc.run_node_tool(["tools/d1_drive.js", "shots", D1_OUT], timeout=180)
    if r is None:
        return None
    if r.get("fatal"):
        problems.append("D1 사진 찍기 실패: " + r["fatal"].splitlines()[0])
        return 0
    for c in r["cases"]:
        name = c["name"]
        for p in c.get("problems", []):
            problems.append("%s: %s" % (name, p))
        for e in c.get("logs", []):
            problems.append("%s: 콘솔 오류 %s" % (name, e))
        if c.get("overflow"):
            problems.append("%s: 가로 넘침 scrollWidth %s > 폭 %s (넘친 요소: %s)"
                            % (name, c["scrollWidth"], c["innerWidth"], ", ".join(c.get("wide", []))))
        check_base(name, c["file"], D1_DIR, "tools/shots/out/d1/%s.png" % name, update, problems, lines,
                   "넘침 없음 (scrollWidth %s / 폭 %s)" % (c["scrollWidth"], c["innerWidth"]))
    return len(r["cases"])


def main():
    tc.setup_output()
    update = "--update" in sys.argv
    want_d1 = "--d1" in sys.argv or "--old" not in sys.argv
    want_old = "--old" in sys.argv or "--d1" not in sys.argv
    os.makedirs(OUT_DIR, exist_ok=True)
    problems, lines, done = [], [], []
    if want_d1:
        n = d1_shots(update, problems, lines)
        done.append("D1 %s" % ("건너뜀(node 없음)" if n is None else "%d장" % n))
    if want_old:
        done.append("옛 게임 %d장" % old_shots(update, problems, lines))
    if problems:
        print("[shots] 실패 %d건 (%s)" % (len(problems), ", ".join(done)))
        for p in problems:
            print("  - " + p)
        for line in lines:
            print(line)
        return 1
    print("[shots] 통과: " + ", ".join(done))
    for line in lines:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
