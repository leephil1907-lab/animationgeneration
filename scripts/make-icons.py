#!/usr/bin/env python3
"""
Regenerate MOTIONA Studio raster icons from the same geometry as public/icon.svg.

SVG stays the source of truth for the browser; these PNGs exist for the web
manifest and Apple touch icon, which want raster sizes. Run after changing the
mark:

    python3 scripts/make-icons.py
"""

import math
import os

from PIL import Image, ImageDraw

SIZE = 512
RADIUS = 112
TOP = (0x24, 0x1B, 0x36)      # #241b36
BOTTOM = (0x0B, 0x0A, 0x10)   # #0b0a10
PURPLE = (139, 92, 246)       # #8b5cf6
PURPLE_LIGHT = (167, 139, 250)
PURPLE_DEEP = (124, 58, 237)

M_POLY = [
    (118, 356), (118, 156), (186, 156), (256, 274), (326, 156), (394, 156),
    (394, 356), (330, 356), (330, 257), (256, 378), (255, 378), (181, 257), (181, 356),
]
TRI_POLY = [(306, 156), (394, 156), (350, 232)]
RING_CENTER = (350, 190)
RING_RADIUS = 62
RING_WIDTH = 8
GLOW_CENTER = (0.68 * SIZE, 0.36 * SIZE)
GLOW_REACH = 0.62 * SIZE


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def build():
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    pixels = img.load()

    # vertical gradient + radial purple glow, per pixel
    for y in range(SIZE):
        t = y / (SIZE - 1)
        base = lerp(TOP, BOTTOM, t)
        for x in range(SIZE):
            dx = x - GLOW_CENTER[0]
            dy = y - GLOW_CENTER[1]
            dist = math.hypot(dx, dy)
            fall = max(0.0, 1.0 - dist / GLOW_REACH)
            alpha = 0.5 * fall * fall
            color = lerp(base, PURPLE, alpha)
            pixels[x, y] = (*color, 255)

    # rounded-rectangle mask
    mask = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=RADIUS, fill=255)
    img.putalpha(mask)

    draw = ImageDraw.Draw(img)

    # ring behind the play triangle
    draw.ellipse(
        [
            RING_CENTER[0] - RING_RADIUS, RING_CENTER[1] - RING_RADIUS,
            RING_CENTER[0] + RING_RADIUS, RING_CENTER[1] + RING_RADIUS,
        ],
        outline=(*PURPLE, 128),
        width=RING_WIDTH,
    )

    # M monogram
    draw.polygon(M_POLY, fill=(255, 255, 255, 255))

    # play triangle with a simple diagonal two-stop blend
    tri = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    tri_draw = ImageDraw.Draw(tri)
    tri_draw.polygon(TRI_POLY, fill=(255, 255, 255, 255))
    gradient = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    gp = gradient.load()
    for y in range(150, 240):
        for x in range(300, 400):
            t = ((x - 300) + (y - 150)) / 180.0
            gp[x, y] = (*lerp(PURPLE_LIGHT, PURPLE_DEEP, min(1.0, t)), 255)
    img.paste(gradient, (0, 0), tri.split()[3])

    return img


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, '..', 'public', 'icons')
    os.makedirs(out_dir, exist_ok=True)

    icon = build()
    targets = {'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180}
    for name, size in targets.items():
        path = os.path.join(out_dir, name)
        if size == 512:
            icon.save(path)
        else:
            icon.resize((size, size), Image.LANCZOS).save(path)
        print(f'wrote {path} ({size}x{size})')


if __name__ == '__main__':
    main()
