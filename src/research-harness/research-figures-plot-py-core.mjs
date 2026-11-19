// aster_plot.py, style, colours and page sizes. Python kept as a string: orcad ships the harness as one bundled
// .mjs file, so a .py beside it would not reach a GPU server. Joined by research-figures-plot-lib.
export const PLOT_PY_CORE = String.raw`"""aster_plot: Aster's helper for paper plots (numpy + matplotlib; scipy optional).

Plots made with it share the diagrams' style (presets, accent, good/bad, the canvas font), come out
at true page size (3.25 in single column, 6.75 in double), in vector PDF and SVG with a PNG
preview, and are checked when saved. A script beside this file:

    import aster_plot as ap
    p = ap.panels("ab", size="double", height=1.8, titles={"a": "ODE", "b": "SDE"})
    ap.paths(p["a"], ode_paths)
    p.save()  # <figures>/<slug>.pdf, .svg, .embed.svg, .png and <slug>.plot.json
"""
import colorsys
import datetime
import hashlib
import json
import math
import os
import re
import sys

import numpy as np
import matplotlib

if not os.environ.get("MPLBACKEND"):
    matplotlib.use("Agg")
import logging  # noqa: E402

for _quiet in ("fontTools", "matplotlib.font_manager"):
    logging.getLogger(_quiet).setLevel(logging.ERROR)
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import colors as mcolors  # noqa: E402
from matplotlib.collections import LineCollection  # noqa: E402
from matplotlib.gridspec import GridSpec  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402

try:
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401,E402
except Exception:  # pragma: no cover
    Axes3D = None

STYLE_DATA = json.loads(r"""__ASTER_STYLE_JSON__""")
VERSION = STYLE_DATA.get("lib", "dev")
PT = 1 / 72.0
_LETTERS = "abcdefghijklmnopqrstuvwxyz"


# ---------------------------------------------------------------- colour maths (OKLab, WCAG)

def _hex_rgb(value):
    rgb = mcolors.to_rgb(value)
    return np.array(rgb, dtype=float)


def _lin(c):
    c = np.asarray(c, dtype=float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _gamma(c):
    c = np.clip(np.asarray(c, dtype=float), 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def oklab(value):
    """OKLab (L, a, b) of a colour (any matplotlib colour)."""
    r, g, b = _lin(_hex_rgb(value))
    l_ = np.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m_ = np.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s_ = np.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return np.array([
        0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    ])


def oklch(value):
    L, a, b = oklab(value)
    C = math.hypot(a, b)
    return L, C, (math.degrees(math.atan2(b, a)) + 360) % 360 if C > 1e-6 else 0.0


def _oklch_linear(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    return np.array([
        4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    ])


def oklch_hex(L, C, h):
    """A hex colour for OKLCH, brought into sRGB by lowering chroma (as the canvas does)."""
    rgb = _oklch_linear(L, C, h)
    if np.any(rgb < -1e-4) or np.any(rgb > 1 + 1e-4):
        low, high = 0.0, C
        for _ in range(24):
            mid = (low + high) / 2
            test = _oklch_linear(L, mid, h)
            if np.all(test >= -1e-4) and np.all(test <= 1 + 1e-4):
                low = mid
            else:
                high = mid
        rgb = _oklch_linear(L, low, h)
    return mcolors.to_hex(_gamma(np.clip(rgb, 0, 1)))


def luminance(value):
    r, g, b = _lin(_hex_rgb(value))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(first, second):
    a, b = sorted([luminance(first), luminance(second)], reverse=True)
    return (a + 0.05) / (b + 0.05)


def _around(anchors, hue):
    h = hue % 360
    points = list(anchors) + [[anchors[0][0] + 360, anchors[0][1]]]
    lifted = h + 360 if h < anchors[0][0] else h
    for (h0, v0), (h1, v1) in zip(points, points[1:]):
        if h0 <= lifted <= h1:
            return v0 + (v1 - v0) * (lifted - h0) / (h1 - h0)
    return anchors[0][1]


def derive_accent(pick):
    """The canvas's accent rule for any #hex: tint, strong, ink (shade) and solid."""
    _, C0, h = oklch(pick)
    rules = STYLE_DATA["accentRule"]
    scale = min(1.0, C0 / 0.1)
    tint_l = _around(rules["tintL"], h)
    tint_c = _around(rules["tintC"], h) * scale
    tint = oklch_hex(tint_l, tint_c, h)
    strong = oklch_hex(tint_l - 0.15, min(2 * tint_c, 0.11), h)
    shade_h = h - 15 if 75 <= h <= 125 else h
    shade_l, shade = 0.56, oklch_hex(0.56, 0.13 * scale, shade_h)
    while (contrast(shade, "#ffffff") < 4.5 or contrast(shade, tint) < 4.5) and shade_l > 0.2:
        shade_l -= 0.005
        shade = oklch_hex(shade_l, 0.13 * scale, shade_h)
    solid_l, solid = 0.6, oklch_hex(0.6, 0.15 * scale, shade_h)
    while contrast(solid, "#ffffff") < 3 and solid_l > 0.3:
        solid_l -= 0.01
        solid = oklch_hex(solid_l, 0.15 * scale, shade_h)
    return {"name": pick, "fill": tint, "strong": strong, "ink": shade, "solid": solid}


# ---------------------------------------------------------------- the style

class Style(object):
    """A preset and its accent, as on the canvas. ap.style() is the one in use."""

    def __init__(self, preset=None, accent=None):
        presets = STYLE_DATA["presets"]
        preset = STYLE_DATA["aliases"].get(preset, preset) or STYLE_DATA["defaultPreset"]
        if preset not in presets:
            raise ValueError("Unknown style %r; styles: %s" % (preset, ", ".join(presets)))
        data = presets[preset]
        self.preset = preset
        for key in ("ink", "line", "muted", "mutedText", "block", "strong", "mid", "panel"):
            setattr(self, key.replace("Text", "_text"), data[key])
        accents = [dict(item) for item in data["accents"]]
        named = STYLE_DATA["accentAliases"].get(accent, accent)
        self.world = data.get("world")
        self.roles = data.get("roles") or {}
        if accent and not data.get("mono"):
            if self.world and named in self.world["withAccents"]:
                # Why every accent: in a world a pick moves a near hue aside.
                accents = [dict(item) for item in self.world["withAccents"][named]]
            elif named in data["withAccent"]:
                accents[0] = dict(accents[0], **data["withAccent"][named])
            elif re.match(r"^#[0-9a-fA-F]{6}$", str(accent)):
                accents[0] = dict(accents[0], **derive_accent(accent))
                if self.world:
                    accents[0].update(light=accents[0]["fill"], dark=accents[0]["strong"],
                                      stroke=accents[0]["ink"])
            else:
                raise ValueError("Unknown accent %r; accents: %s or #rrggbb"
                                 % (accent, ", ".join(STYLE_DATA["swatches"])))
        self.accent_name = named if accent else data.get("accentName")
        self.accents = accents
        self.accent = accents[0]
        self.good = STYLE_DATA["semantic"]["good"]
        self.bad = STYLE_DATA["semantic"]["bad"]

    def grays(self, n):
        """n baseline grays, dark to light, all readable as lines on white."""
        ramp = ["#4a4a4a", "#8c8c8c", "#6b6b6b", "#adadad", "#5a5a5a", "#9c9c9c"]
        return [ramp[i % len(ramp)] for i in range(n)]

    def world_series(self):
        """A world's series: ours (a), then the given (d), the machinery (c) and outputs (b)."""
        named = {a["name"]: a for a in self.accents}
        return [self.accent["solid"]] + [named[k]["solid"] for k in ("d", "c", "b") if k in named]

    def hues(self, n, with_accent=False):
        """n hues for other methods (apart from the accent's hue) or, with_accent, for classes
        with no "ours" (the accent first); picked one by one to stay far apart. A world gives its
        own hues first, ours then the given baseline (d)."""
        _, _, h0 = oklch(self.accent["solid"])
        seed = []
        if self.world:
            seed = self.world_series()
            seed = seed if with_accent else seed[1:]
            if len(seed) >= n:
                return seed[:n]
        options = [self.accent["solid"]] if with_accent else []
        # Why the inks too: the swatches share one lightness, so four or more hues need a dark one.
        for part in ("solid", "ink"):
            for name in STYLE_DATA["swatchOrder"]:
                swatch = STYLE_DATA["swatches"][name]
                _, C, h = oklch(swatch[part])
                gap = min(abs(h - h0), 360 - abs(h - h0))
                if gap > 40 and C > 0.05 and swatch[part] not in options:
                    options.append(swatch[part])
        if not options and not seed:
            return self.grays(n)

        def score(c, chosen):
            near = min(_distance(c, o) for o in chosen)
            same = any(min(abs(oklch(c)[2] - oklch(o)[2]), 360 - abs(oklch(c)[2] - oklch(o)[2]))
                       < 25 for o in chosen)
            return near * (0.4 if same else 1.0)

        picked = list(seed) or [options[0]]
        anchors = [self.accent["solid"]]
        options = [c for c in options if c not in picked]
        while len(picked) < n and options:
            rest = [c for c in options if c not in picked]
            if not rest:
                break
            picked.append(max(rest, key=lambda c: score(c, picked + anchors)))
        return [picked[i % len(picked)] for i in range(n)]


def _distance(a, b):
    """OKLab distance between two colours."""
    return float(np.linalg.norm(oklab(a) - oklab(b)))


_STATE = {"style": None}


def style():
    """The style in use (graphite with its own accent until use() picks one)."""
    if _STATE["style"] is None:
        use()
    return _STATE["style"]


SANS = ["Liberation Sans", "Arial", "Helvetica", "Nimbus Sans", "Nimbus Sans L", "DejaVu Sans"]
# The paper look's faces as matplotlib finds them: its own cmr10 (Computer Modern) and STIX (Times).
SERIF = {
    "cm": ["Latin Modern Roman", "CMU Serif", "cmr10", "DejaVu Serif"],
    "times": ["TeX Gyre Termes", "Times New Roman", "Times", "STIXGeneral", "DejaVu Serif"],
}


def use(preset=None, accent=None, math="cm", font=None, look=None, serif="cm"):
    """Picks the preset and accent (as fig.style(preset, { accent }) on the canvas) and sets
    matplotlib's defaults for print: 8 pt labels, 7 pt ticks and legends, thin spines.
    Like the diagrams, plots take the paper look by default: words and math in the paper's LaTeX
    face, serif "cm" (Computer Modern) or "times"; look="preset" (or a sans font=, or the
    illustrative preset) keeps the preset's sans."""
    if preset == "paper":
        preset, look = None, "paper"
    chosen = Style(preset, accent)
    _STATE["style"] = chosen
    fonts = STYLE_DATA["fonts"]
    if look is None:
        look = "preset" if font or chosen.preset == "illustrative" else "paper"
    paper = look == "paper"
    face = "times" if serif == "times" else "cm"
    _STATE["look"] = "paper" if paper else "preset"
    _STATE["serif"] = face if paper else None
    rc = {
        "font.family": "serif" if paper else "sans-serif",
        "font.serif": SERIF[face],
        "font.sans-serif": ([font] if font else []) + SANS,
        "axes.formatter.use_mathtext": paper,
        "font.size": fonts["label"],
        "axes.labelsize": fonts["label"],
        "axes.titlesize": fonts["label"],
        "xtick.labelsize": fonts["small"],
        "ytick.labelsize": fonts["small"],
        "legend.fontsize": fonts["small"],
        "legend.title_fontsize": fonts["small"],
        "figure.titlesize": fonts["label"],
        "mathtext.fontset": ("stix" if face == "times" else "cm") if paper else ("cm" if math == "cm" else "dejavusans"),
        "mathtext.default": "it",
        "text.color": chosen.ink,
        "axes.labelcolor": chosen.ink,
        "axes.edgecolor": chosen.line,
        "axes.linewidth": 0.6,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": False,
        "axes.titlepad": 3.0,
        "axes.labelpad": 2.0,
        "axes.titlelocation": "left",
        "axes.prop_cycle": matplotlib.cycler(color=[chosen.accent["solid"]] + chosen.grays(4)),
        "axes.facecolor": "none",
        "xtick.color": chosen.line,
        "ytick.color": chosen.line,
        "xtick.labelcolor": chosen.ink,
        "ytick.labelcolor": chosen.ink,
        "xtick.major.size": 2.5,
        "ytick.major.size": 2.5,
        "xtick.minor.size": 1.5,
        "ytick.minor.size": 1.5,
        "xtick.major.width": 0.6,
        "ytick.major.width": 0.6,
        "xtick.major.pad": 1.8,
        "ytick.major.pad": 1.8,
        "lines.linewidth": 1.2,
        "lines.markersize": 3.5,
        "lines.markeredgewidth": 0.6,
        "patch.linewidth": 0.6,
        "hatch.linewidth": 0.5,
        "hatch.color": chosen.line,
        "errorbar.capsize": 1.5,
        "legend.frameon": False,
        "legend.handlelength": 1.6,
        "legend.handleheight": 0.6,
        "legend.handletextpad": 0.4,
        "legend.borderaxespad": 0.3,
        "legend.borderpad": 0.2,
        "legend.columnspacing": 1.0,
        "legend.labelspacing": 0.3,
        "figure.facecolor": "white",
        "savefig.facecolor": "none",
        "savefig.transparent": False,
        "image.cmap": "viridis",
        "pdf.fonttype": 42,
        "ps.fonttype": 42,
        "svg.fonttype": "none",
        "svg.hashsalt": "aster",
        "path.simplify": True,
        "contour.negative_linestyle": "solid",
        "contour.linewidth": 0.5,
        "savefig.dpi": 300,
    }
    for key, value in rc.items():
        if key in matplotlib.rcParams:
            matplotlib.rcParams[key] = value
    return chosen


def color(role="ours", part="solid"):
    """A colour by role: ours (the accent), ours-fill, ours-ink, baseline, good, bad, ink, line,
    muted, block, strong, mid, panel; a role by meaning (input, output, data, model, frozen, or
    the component hues a-d: their own hues in a world, grays and the accent in a quiet preset);
    or an accent swatch name ('teal', 'clay-ink')."""
    s = style()
    head, _, tail = str(role).partition("-")
    part = tail or part
    target = s.roles.get(head) if head not in ("ours", "accent") else None
    if target is not None:
        key = {"tint": "fill"}.get(part, part)
        named = next((a for a in s.accents if a["name"] == target), None)
        if named is not None:
            return named.get(key) or named["solid"]
        return {"ink": s.ink, "solid": s.mid, "stroke": s.mid, "strong": s.strong,
                "light": s.panel}.get(key, getattr(s, target))
    if head in ("ours", "accent"):
        return s.accent[{"solid": "solid", "fill": "fill", "strong": "strong", "ink": "ink",
                         "tint": "fill"}.get(part, "solid")]
    if head in ("good", "bad"):
        return getattr(s, head)[{"tint": "fill"}.get(part, part)]
    if head in ("baseline", "gray"):
        return s.grays(1)[0]
    if role in ("ink", "line", "muted", "block", "strong", "mid", "panel"):
        return getattr(s, role)
    if head in STYLE_DATA["swatches"]:
        swatch = STYLE_DATA["swatches"][head]
        return swatch[{"tint": "fill"}.get(part, part)]
    return mcolors.to_hex(role)


def series(n, ours=0, hues=False):
    """Colours for n methods: the accent for ours (an index, or None), grays for the rest, or
    other hues (hues=True) when the methods are not baselines."""
    s = style()
    if hues and ours is None:
        return s.hues(n, with_accent=True)
    others = s.hues(n) if hues else s.grays(n)
    out, k = [], 0
    for i in range(n):
        if ours is not None and i == ours:
            out.append(s.accent["solid"])
        else:
            out.append(others[k])
            k += 1
    return out


def ramp(n, base=None, light=0.3):
    """n steps of one hue from light to full (ablations: the full model darkest)."""
    base = base or style().accent["solid"]
    rgb = _hex_rgb(base)
    return [mcolors.to_hex(1 - (1 - rgb) * (light + (1 - light) * i / max(1, n - 1)))
            for i in range(n)]


def cmap(kind="seq", base=None, name=None):
    """Perceptual colour maps from the style: seq (white → accent → its ink), div (bad ink →
    white → accent ink), gray; in a world, seq and div run through its own hues (div from the
    input's d to ours), world falls through all of them and surface lights one hue; or a
    matplotlib perceptual one ('viridis', 'cividis', 'magma')."""
    s = style()
    if kind in ("viridis", "cividis", "magma", "inferno", "plasma", "Greys", "Blues"):
        return plt.get_cmap(kind)
    if s.world and base is None and kind in ("seq", "div", "world", "surface"):
        # Why from the accents: a picked accent recolours a world's maps too.
        a, d = s.accent, next(x for x in s.accents if x["name"] == "d")
        stops = {"seq": [s.panel, a["light"], a["fill"], a["strong"], a["solid"], a["ink"]],
                 "div": [d["ink"], d["strong"], d["fill"], s.panel, a["fill"], a["strong"], a["ink"]],
                 "world": s.world["maps"]["world"],
                 "surface": [d["strong"], d["dark"], d["fill"], d["light"]]}[kind]
        return mcolors.LinearSegmentedColormap.from_list(name or "aster-" + kind, stops, N=256)
    if kind == "div":
        stops = [s.bad["ink"], s.bad["fill"], "#f7f7f7", s.accent["fill"], s.accent["ink"]]
    elif kind == "gray":
        stops = ["#fafafa", s.block, s.mid, "#5a5a5a", s.ink]
    elif kind == "light":
        stops = ["#fcfcfc", s.panel, s.block, s.strong]
    elif kind == "surface":
        stops = ["#8f8f8f", s.mid, s.strong, s.block, s.panel]
    else:
        acc = s.accent if base is None else derive_accent(mcolors.to_hex(base))
        stops = ["#ffffff", acc["fill"], acc["strong"], acc["solid"], acc["ink"]]
        if kind == "soft":
            stops = ["#fbfbfb", acc["fill"], acc["strong"], acc["solid"]]
    return mcolors.LinearSegmentedColormap.from_list(name or "aster-" + kind, stops, N=256)


def alpha(value, a):
    rgb = mcolors.to_rgb(value)
    return (rgb[0], rgb[1], rgb[2], a)


# ---------------------------------------------------------------- page sizes

def page_size(size="single", height=None, venue=None):
    """(width, height) in inches: single, double, onehalf or (w, h); venue picks its widths."""
    if isinstance(size, (tuple, list)):
        return float(size[0]), float(size[1])
    sizes = STYLE_DATA["sizes"]
    if size not in sizes:
        raise ValueError("size takes single, onehalf, double or (w, h) in inches")
    width = sizes[size]["widthIn"]
    if venue:
        venues = STYLE_DATA["venues"]
        if venue not in venues:
            raise ValueError("Unknown venue %r; venues: %s" % (venue, ", ".join(venues)))
        width = venues[venue].get(size) or venues[venue]["double"]
    return width, float(height if height is not None else sizes[size]["heightIn"])
`
