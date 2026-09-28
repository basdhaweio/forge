#!/usr/bin/env python
"""Render the Forge app icons (a glowing kettlebell) as PNGs with nothing but the standard library.

Usage: python tools/make_icons.py      -> icons/icon-192.png, icon-512.png, icon-maskable-512.png
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
BG = (13, 14, 17)
GLOW = (74, 32, 8)
ORANGE = (255, 106, 0)
GOLD = (255, 176, 32)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def inside_bell(x, y):
    """Kettlebell silhouette in a 512 box: round body with a flat base, and an arched handle whose hole shows above it."""
    body = (x - 256) ** 2 + (y - 322) ** 2 <= 128 ** 2 and y <= 432
    d = math.hypot(x - 256, y - 196)
    handle = d <= 100 and y <= 262
    hole = d < 58 and not body
    return (body or handle) and not hole


def shade(x, y, size, maskable):
    s = 512 / size
    X, Y = x * s, y * s
    if maskable:  # keep the art inside the maskable safe zone
        X, Y = 256 + (X - 256) / 0.74, 288 + (Y - 256) / 0.74
    else:
        r = 112  # rounded-square corners
        cx = min(max(x * s, r), 512 - r)
        cy = min(max(y * s, r), 512 - r)
        if (x * s - cx) ** 2 + (y * s - cy) ** 2 > r * r:
            return None
    t = max(0.0, 1 - math.hypot(x * s - 380, y * s - 110) / 470)
    col = mix(BG, GLOW, t ** 1.6)
    if inside_bell(X, Y):
        g = min(1, max(0, (X - 120 + (430 - Y)) / 560))
        col = mix(ORANGE, GOLD, g)
        if (X - 206) ** 2 + (Y - 288) ** 2 <= 24 ** 2:  # soft highlight
            col = mix(col, (255, 236, 200), 0.3)
    return col


def render(size, maskable=False, ss=3):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0.0, 0.0, 0.0]
            cov = 0
            for sy in range(ss):
                for sx in range(ss):
                    c = shade(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss, size, maskable)
                    if c is not None:
                        cov += 1
                        for i in range(3):
                            acc[i] += c[i]
            if cov:
                row += bytes(int(acc[i] / cov) for i in range(3)) + bytes([int(255 * cov / (ss * ss))])
            else:
                row += b"\x00\x00\x00\x00"
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, size, mask in (("icon-192.png", 192, False), ("icon-512.png", 512, False), ("icon-maskable-512.png", 512, True)):
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(render(size, mask, ss=3 if size <= 192 else 2))
        print("wrote", name)
