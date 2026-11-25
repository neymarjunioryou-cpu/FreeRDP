#!/usr/bin/env python3
"""Generate the launcher icons for the PS5-style shell (no external assets).

Draws an original, generic gamepad silhouette -- no Sony/PlayStation logos,
trademarks or artwork are used.  Requires Pillow.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "app" / "res"
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
S = 4  # supersampling factor


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def make(size: int) -> Image.Image:
    n = size * S
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # background: deep space blue with a soft radial glow
    for i in range(n):
        t = i / n
        d.line([(0, i), (n, i)], fill=(7 + int(9 * (1 - t)), 16 + int(18 * (1 - t)), 40 + int(30 * (1 - t)), 255))
    glow = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([n * 0.05, n * 0.02, n * 0.95, n * 0.75], fill=(46, 120, 255, 105))
    glow = glow.filter(ImageFilter.GaussianBlur(n * 0.13))
    img = Image.alpha_composite(img, glow)
    d = ImageDraw.Draw(img)

    u = n / 100.0
    white = (238, 244, 255, 255)
    dim = (150, 175, 225, 255)
    accent = (72, 156, 255, 255)

    # controller body: two grips joined by a wide bar
    rounded(d, (14 * u, 34 * u, 86 * u, 72 * u), 17 * u, white)
    rounded(d, (10 * u, 50 * u, 34 * u, 86 * u), 12 * u, white)
    rounded(d, (66 * u, 50 * u, 90 * u, 86 * u), 12 * u, white)
    # inner cut-outs give it the DualSense-ish silhouette
    rounded(d, (18 * u, 40 * u, 82 * u, 66 * u), 13 * u, (10, 22, 55, 255))

    # analog sticks
    for cx in (32, 68):
        cy = 52
        d.ellipse([cx * u - 9 * u, cy * u - 9 * u, cx * u + 9 * u, cy * u + 9 * u], fill=dim)
        d.ellipse([cx * u - 6.5 * u, cy * u - 6.5 * u, cx * u + 6.5 * u, cy * u + 6.5 * u], fill=(20, 34, 70, 255))

    # d-pad
    d.rounded_rectangle([24 * u, 38 * u, 40 * u, 42 * u], radius=1.4 * u, fill=white)
    d.rounded_rectangle([30 * u, 32 * u, 34 * u, 48 * u], radius=1.4 * u, fill=white)

    # face buttons
    for dx, dy in ((0, -6), (6, 0), (0, 6), (-6, 0)):
        cx, cy = 68 + dx, 40 + dy
        d.ellipse([cx * u - 2.6 * u, cy * u - 2.6 * u, cx * u + 2.6 * u, cy * u + 2.6 * u], fill=accent)

    # light bar / touchpad hint
    d.rounded_rectangle([43 * u, 33 * u, 57 * u, 37 * u], radius=2 * u, fill=accent)
    d.rounded_rectangle([44 * u, 60 * u, 56 * u, 63 * u], radius=1.5 * u, fill=dim)

    return img.resize((size, size), Image.LANCZOS).convert("RGBA")


def main() -> None:
    for name, size in DENSITIES.items():
        folder = OUT / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        make(size).save(folder / "ic_launcher.png")
        print("wrote", folder / "ic_launcher.png")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        OUT = Path(sys.argv[1])
    main()
