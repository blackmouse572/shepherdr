#!/usr/bin/env python3
"""Draw the duotone banner patterns (halftone dots that fade out toward the left) as SVG files.

Herdr mods can't mask or fade a pattern at runtime, so the fade is baked into each dot's opacity: no SVG mask or
gradient is used, only circles, so any SVG renderer draws it the same. The file is wider than any header and is pinned
to the header's right edge (lib/ui.js banner()), so a narrow header crops it instead of squashing the dots.

    python3 scripts/banners.py        # writes mods/tasks/banners/<state>.svg
"""
import math
import pathlib

W, H = 1000, 96          # px; the banner's image size (headers crop it from the left)
STEP, R = 7, 1.25        # dot grid and dot radius, as the design system's .bn.half
PEAK = 0.55              # strongest dot opacity, at the top right
# The fade: the design's radial mask, measured from the right edge in px (not as a share of the width), so every
# header gets the same ~360px of dots at its right whatever its width: an ellipse 440 x 150% of the height, centred
# 50px in from the right, on the top edge.
CX, CY, RX, RY = W - 50.0, 0.0, 440.0, 1.50 * H
STATES = {"attention": "#F5B544", "working": "#8FA8FF", "done": "#7DC28A", "neutral": "#ECEAE3"}


def alpha(d):
    """The design's mask stops: 1 at the centre, .55 at 35%, 0 at 72%."""
    if d <= 0.35:
        return 1 - (1 - 0.55) * d / 0.35
    if d <= 0.72:
        return 0.55 * (0.72 - d) / (0.72 - 0.35)
    return 0.0


def draw(color):
    dots = []
    for y in range(STEP // 2, H, STEP):
        for x in range(STEP // 2, W, STEP):
            a = PEAK * alpha(math.hypot((x - CX) / RX, (y - CY) / RY))
            if a >= 0.02:
                dots.append(f'<circle cx="{x}" cy="{y}" r="{R}" fill-opacity="{a:.2f}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<g fill="{color}">{"".join(dots)}</g></svg>\n')


if __name__ == "__main__":
    out = pathlib.Path(__file__).resolve().parent.parent / "mods" / "tasks" / "banners"
    out.mkdir(parents=True, exist_ok=True)
    for name, color in STATES.items():
        (out / f"{name}.svg").write_text(draw(color))
        print(out / f"{name}.svg")
