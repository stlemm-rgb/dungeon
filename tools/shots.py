"""화면 검사: 390px·1280px 스크린샷을 tools/shots/ 기준 이미지와 비교하고, 가로 넘침을 잰다.

실패 조건
  - 가로 넘침 (게임 화면의 scrollWidth가 틀 폭보다 큼) 또는 화면이 안 그려짐
  - 기준 이미지와 다른 점이 DIFF_LIMIT(비율)보다 많음
화면을 일부러 바꿨으면 tools/shots/out/의 새 이미지를 눈으로 확인한 뒤 --update로 기준을 바꾼다.
(버전 번호가 화면에 보이므로 GAME_VERSION을 올리면 기준도 갱신해야 한다.)
사용: python tools/shots.py [--update]
"""
import os
import shutil
import struct
import sys
import zlib

import tool_common as tc

SHOT_DIR = os.path.join(tc.TOOLS, "shots")
OUT_DIR = os.path.join(SHOT_DIR, "out")
DIFF_LIMIT = 0.0005     # 다른 점이 0.05%를 넘으면 실패 (같은 PC에서 3번 찍어 잰 흔들림은 0.000%, 버튼 하나 없애면 0.54%)
CHANNEL_TOLERANCE = 24  # 글꼴 가장자리 흐림 정도의 차이는 같다고 봄

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


def main():
    tc.setup_output()
    update = "--update" in sys.argv
    os.makedirs(OUT_DIR, exist_ok=True)
    problems, lines = [], []
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
        tc.screenshot(frame_query, out_png, (w, h))
        base_png = os.path.join(SHOT_DIR, name + ".png")
        if update or not os.path.exists(base_png):
            shutil.copyfile(out_png, base_png)
            lines.append("  %s: 기준 이미지 %s (넘침 없음, 버전 %s)" % (name, "갱신" if update else "새로 만듦", info.get("version")))
            continue
        ratio, why = compare(base_png, out_png)
        if ratio > DIFF_LIMIT:
            problems.append("%s: 기준 이미지와 %.2f%% 다름 %s (tools/shots/out/%s.png 확인, 맞으면 --update)"
                            % (name, ratio * 100, why, name))
        else:
            lines.append("  %s: 다른 점 %.3f%%, 넘침 없음 (scrollWidth %s / 폭 %s)"
                         % (name, ratio * 100, info["scrollWidth"], info["innerWidth"]))
    if problems:
        print("[shots] 실패 %d건" % len(problems))
        for p in problems:
            print("  - " + p)
        for line in lines:
            print(line)
        return 1
    print("[shots] 통과: %d장" % len(CASES))
    for line in lines:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
