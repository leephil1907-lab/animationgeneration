#!/usr/bin/env python3
"""
Deterministic frame renderer for the mock ComfyUI worker.

Produces a real, playable video so the MOTIONA pipeline can be verified end to
end: queue -> poll -> history -> output proxy -> gallery preview.

Deterministic on `seed`, which is the point — the same seed yields the same
motion, letting the storyboard's seed-locking (character consistency across
shots) be observed rather than merely asserted.

Encoder preference:
  1. static ffmpeg from imageio-ffmpeg, if installed  -> .mp4
  2. PIL animated GIF fallback                        -> .gif
"""

import argparse
import math
import os
import random
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw


def find_ffmpeg():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def palette(seed):
    """Two-hue gradient derived from the seed, so shots differ but stay stable."""
    rng = random.Random(seed)
    hue_a = rng.randrange(0, 360)
    hue_b = (hue_a + 40 + rng.randrange(0, 120)) % 360
    return hue_a, hue_b


def hsv_to_rgb(h, s, v):
    h = (h % 360) / 60.0
    i = int(h)
    f = h - i
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    r, g, b = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i % 6]
    return int(r * 255), int(g * 255), int(b * 255)


def render_frame(index, total, width, height, seed):
    hue_a, hue_b = palette(seed)
    rng = random.Random(seed * 7919 + index)
    progress = index / max(1, total - 1)

    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img)

    # Vertical gradient, hue drifting slowly over the shot.
    for y in range(height):
        t = y / max(1, height - 1)
        hue = hue_a + (hue_b - hue_a) * t + progress * 18
        draw.line([(0, y), (width, y)], fill=hsv_to_rgb(hue, 0.55, 0.30 + 0.18 * (1 - t)))

    # A subject that travels across frame — the "character" stand-in.
    cx = int(width * (0.12 + 0.76 * progress))
    cy = int(height * (0.5 + 0.18 * math.sin(progress * math.pi * 2)))
    radius = int(min(width, height) * 0.13)

    glow = hsv_to_rgb(hue_b + progress * 30, 0.75, 0.95)
    for step in range(5, 0, -1):
        r = radius + step * max(2, radius // 5)
        alpha = 0.10 * step
        shade = tuple(int(c * alpha + 0) for c in glow)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=shade)
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=glow)

    # Parallax specks so motion reads as animation, not a slideshow.
    for _ in range(28):
        sx = rng.randrange(width)
        sy = rng.randrange(height)
        drift = int((sx - progress * width * 0.35) % width)
        size = rng.choice([1, 1, 2])
        draw.ellipse([drift, sy, drift + size, sy + size], fill=hsv_to_rgb(hue_a, 0.2, 0.85))

    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=576)
    ap.add_argument("--frames", type=int, default=32)
    ap.add_argument("--fps", type=int, default=16)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    frames = max(2, min(args.frames, 240))
    width = max(64, min(args.width, 1536))
    height = max(64, min(args.height, 1536))

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        paths = []
        for i in range(frames):
            frame = render_frame(i, frames, width, height, args.seed)
            path = os.path.join(tmp, f"frame_{i:05d}.png")
            frame.save(path)
            paths.append(path)

        ffmpeg = find_ffmpeg()
        wants_video = args.out.lower().endswith((".mp4", ".webm", ".mov"))
        if not ffmpeg and wants_video:
            # No encoder available: degrade to an animated GIF rather than
            # handing PIL a container it cannot write (which used to KeyError).
            print("no ffmpeg available; encoding animated GIF instead", file=sys.stderr)
            args.out = os.path.splitext(args.out)[0] + ".gif"
            wants_video = False

        if ffmpeg and wants_video:
            cmd = [
                ffmpeg, "-y", "-loglevel", "error",
                "-framerate", str(args.fps),
                "-i", os.path.join(tmp, "frame_%05d.png"),
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-preset", "ultrafast", "-crf", "28",
                "-movflags", "+faststart",
                args.out,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                print(args.out)
                return 0
            print(f"ffmpeg failed ({result.stderr.strip()[:200]}); falling back to GIF", file=sys.stderr)
            args.out = os.path.splitext(args.out)[0] + ".gif"

        images = [Image.open(p).convert("RGB") for p in paths]
        images[0].save(
            args.out,
            save_all=True,
            append_images=images[1:],
            duration=int(1000 / max(1, args.fps)),
            loop=0,
            optimize=False,
        )

    print(args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
