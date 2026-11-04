#!/usr/bin/env python3
"""Draw the duotone banner patterns as SVG files: halftone dots for the state banners (.bn.half) and diagonal hatch
lines for the neutral "wool" one (.bn.wool.hatch), both fading out toward the left (the hatch's fade is lib/ui.js's).

Herdr mods can't mask or fade a pattern at runtime, so the fade is baked into each dot's opacity: no SVG mask or
gradient is used, only circles, so any SVG renderer draws it the same. The file is wider than any header and is pinned
to the header's right edge (lib/ui.js banner()), so a narrow header crops it instead of squashing the dots.

    python3 scripts/banners.py        # writes mods/tasks/banners/<state>.svg (dots) and hatch.svg (neutral)
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
STATES = {"attention": "#F5B544", "working": "#8FA8FF", "done": "#7DC28A"}
WOOL = "#ECEAE3"  # the neutral banner's hatch (text-primary)


def alpha(d):
    """The design's mask stops: 1 at the centre, .55 at 35%, 0 at 72%."""
    if d <= 0.35:
        return 1 - (1 - 0.55) * d / 0.35
    if d <= 0.72:
        return 0.55 * (0.72 - d) / (0.72 - 0.35)
    return 0.0


# The hatch (.bn.hatch): 1px "/" lines 6px apart (repeating-linear-gradient(-45deg, fg 0 1px, transparent 1px 6px)),
# at .22. Drawn evenly, with no fade: its left-to-right fade (transparent 5%, .35 at 45%, solid at 100%) is a share of
# the header's width, so lib/ui.js paints it over the hatch at run time as a gradient of the banner's own wash.
# Wider than any header (HATCH_W), pinned to the right edge like the dots.
HATCH_PEAK, HATCH_GAP, HATCH_W = 0.22, 6.0, 2400


def draw_hatch(color):
    step = HATCH_GAP * math.sqrt(2)  # the lines' spacing along x for 6px between them
    segs, k = [], 0
    # Lines x + y = c, from the top edge (c, 0) down-left to (c - H, H).
    while k * step < HATCH_W + H:
        segs.append(f"M{k * step:.2f} 0l-{H} {H}")
        k += 1
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{HATCH_W}" height="{H}" viewBox="0 0 {HATCH_W} {H}">'
            f'<path fill="none" stroke="{color}" stroke-width="1" stroke-opacity="{HATCH_PEAK}" d="{"".join(segs)}"/></svg>\n')


def draw(color, peak=PEAK):
    dots = []
    for y in range(STEP // 2, H, STEP):
        for x in range(STEP // 2, W, STEP):
            a = peak * alpha(math.hypot((x - CX) / RX, (y - CY) / RY))
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
    (out / "hatch.svg").write_text(draw_hatch(WOOL))
    print(out / "hatch.svg")
