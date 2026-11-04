#!/usr/bin/env python3
"""Draw the duotone banner patterns as SVG files: halftone dots for the state banners (.bn.half) and diagonal hatch
lines for the neutral "wool" one (.bn.wool.hatch), both fading out toward the left.

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
# at .22, under a left-to-right fade (transparent 5%, .35 at 45%, solid at 100%). The fade is measured in px from the
# right edge, as a 460 dialog would draw it, so every header gets the same hatch at its right whatever its width.
HATCH_PEAK, HATCH_GAP, HATCH_STRIP = 0.22, 6.0, 8
HATCH_FADE = (437.0, 253.0)  # px from the right: 0 from the first, .35 at the second, 1 at the edge


def hatch_alpha(d):
    full, mid = HATCH_FADE[1], HATCH_FADE[0]
    if d <= full:
        return 1 - 0.65 * d / full
    if d <= mid:
        return 0.35 * (mid - d) / (mid - full)
    return 0.0


def draw_hatch(color):
    """The lines cut into 8px strips, each strip one path at its own opacity: no mask or gradient."""
    step = HATCH_GAP * math.sqrt(2)  # the lines' spacing along x for 6px between them
    paths = []
    for x0 in range(W - HATCH_STRIP, -HATCH_STRIP, -HATCH_STRIP):
        a = HATCH_PEAK * hatch_alpha(W - (x0 + HATCH_STRIP / 2))
        if a < 0.01:
            break
        segs, c = [], x0 + 0.0
        # Lines x + y = c crossing this strip: from (x0, c - x0) up to (x0 + strip, c - x0 - strip).
        k = math.floor(x0 / step)
        while k * step - x0 - HATCH_STRIP <= H:
            c = k * step
            if c - x0 >= 0:
                segs.append(f"M{x0} {c - x0:.2f}l{HATCH_STRIP} -{HATCH_STRIP}")
            k += 1
        paths.append(f'<path stroke-opacity="{a:.3f}" d="{"".join(segs)}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<g fill="none" stroke="{color}" stroke-width="1">{"".join(paths)}</g></svg>\n')


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
