#!/usr/bin/env python3
"""Generate the app icons: a 13x13 range grid rendered from the BTN RFI chart.

Pure stdlib (zlib + struct) so the build needs no image dependency.
Run from the repo root:  python3 scripts/make-icons.py
"""
import json
import os
import struct
import zlib

RANKS = list("AKQJT98765432")
BG = (0x0B, 0x0F, 0x14)
RAISE = (0xC8, 0x3A, 0x4B)
MIX = (0x7A, 0x3B, 0x52)
FOLD = (0x2C, 0x4A, 0x6B)
CHART = "data/ranges/6max_100bb_rfi_btn.json"


def hand_at(row: int, col: int) -> str:
    if row == col:
        return RANKS[row] * 2
    if row < col:
        return RANKS[row] + RANKS[col] + "s"
    return RANKS[col] + RANKS[row] + "o"


def cell_colors():
    with open(CHART, encoding="utf-8") as f:
        ranges = json.load(f)["ranges"]
    grid = []
    for r in range(13):
        line = []
        for c in range(13):
            freq = ranges[hand_at(r, c)].get("raise", 0.0)
            line.append(RAISE if freq >= 0.85 else MIX if freq >= 0.15 else FOLD)
        grid.append(line)
    return grid


def render(size: int, grid) -> bytes:
    margin = max(1, round(size * 0.09))
    inner = size - margin * 2
    gap = max(0, round(size / 96))
    cell = (inner - gap * 12) / 13
    px = [[BG] * size for _ in range(size)]
    for r in range(13):
        for c in range(13):
            x0 = margin + round(c * (cell + gap))
            y0 = margin + round(r * (cell + gap))
            x1 = min(size, x0 + max(1, round(cell)))
            y1 = min(size, y0 + max(1, round(cell)))
            color = grid[r][c]
            for y in range(y0, y1):
                row = px[y]
                for x in range(x0, x1):
                    row[x] = color
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("3B", *p) for p in row) for row in px
    )
    return png(size, raw)


def png(size: int, raw: bytes) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def ico(png_bytes: bytes, size: int) -> bytes:
    return (
        struct.pack("<HHH", 0, 1, 1)
        + struct.pack(
            "<BBBBHHII", size, size, 0, 0, 1, 32, len(png_bytes), 6 + 16
        )
        + png_bytes
    )


def main() -> None:
    grid = cell_colors()
    os.makedirs("public", exist_ok=True)
    for name, size in (
        ("public/pwa-192x192.png", 192),
        ("public/pwa-512x512.png", 512),
        ("public/apple-touch-icon.png", 180),
    ):
        with open(name, "wb") as f:
            f.write(render(size, grid))
        print(f"wrote {name} ({size}x{size})")
    small = render(32, grid)
    with open("public/favicon.ico", "wb") as f:
        f.write(ico(small, 32))
    print("wrote public/favicon.ico (32x32)")


if __name__ == "__main__":
    main()
