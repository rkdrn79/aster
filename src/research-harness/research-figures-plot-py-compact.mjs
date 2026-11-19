// aster_plot.py, small files and layouts that never collapse: dense line collections joined
// into polylines, dense layers rasterized in the embedded SVG only (and flagged), the embedded
// SVG's numbers rounded; a layout of our own when constrained layout collapses (tiny cells of a
// diagram), and axes placed at exact rectangles. Python kept as a string: orcad ships the harness
// as one bundled .mjs file. Joined by research-figures-plot-lib.
export const PLOT_PY_COMPACT = String.raw`
# ---------------------------------------------------------------- layout that never collapses

def _no_engine(fig):
    try:
        fig.set_layout_engine("none")
    except Exception:  # pragma: no cover, matplotlib < 3.6
        fig.set_constrained_layout(False)


def place(p, key, rect, units="scene"):
    """Puts panel key at an exact rectangle (x, y, w, h) from the page's top-left, y down, in
    scene units (144 per inch, as the diagram measures) or inches (units="in"); the layout
    engine stops, so every other panel keeps where it is."""
    fig = p.fig
    _no_engine(fig)
    scale = 144.0 if units == "scene" else 1.0
    W, H = fig.get_size_inches()
    x, y, w, h = (float(v) / scale for v in rect)
    _main(p.axes[key]).set_position([x / W, 1 - (y + h) / H, w / W, h / H])
    p.placed = True


def _guard_layout(p):
    """Draws once; when constrained layout collapsed the axes (cells too small for their
    labels, as in a diagram's tiny cell), lays the grid out by hand: margins from what each
    panel's labels need, and no panel thinner than a tenth of the page."""
    import warnings
    fig = p.fig
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        fig.canvas.draw()
    collapsed = any("collapsed" in str(w.message) for w in caught)
    collapsed = collapsed or any(
        ax.get_position().width < 0.02 or ax.get_position().height < 0.02
        for ax in fig.axes if ax.get_visible() and getattr(ax, "_colorbar", None) is None)
    if not collapsed or getattr(p, "placed", False) or getattr(p, "grid", None) is None:
        return False
    _no_engine(fig)
    _hand_layout(p)
    p.layout_note = "the cells were too small for constrained layout; laid out by hand"
    return True


def _hand_layout(p, pad_pt=2.0):
    fig, grid = p.fig, p.grid
    W, H = fig.get_size_inches()
    rows, cols = grid.get_geometry()
    pad = pad_pt / 72.0
    for _ in range(3):
        fig.canvas.draw()
        r = fig.canvas.get_renderer()
        dpi = fig.dpi
        L = R = B = T = gap_w = gap_h = 0.0
        for key in p.order:
            ax = _main(p.axes[key])
            if not ax.get_visible():
                continue
            r0, r1, c0, c1 = p.meta[key]["span"]
            tb, fb = ax.get_tightbbox(r), ax.get_window_extent(r)
            if tb is None:
                continue
            left, right = (fb.x0 - tb.x0) / dpi, (tb.x1 - fb.x1) / dpi
            low, high = (fb.y0 - tb.y0) / dpi, (tb.y1 - fb.y1) / dpi
            L, gap_w = (max(L, left), gap_w) if c0 == 0 else (L, max(gap_w, left))
            R, gap_w = (max(R, right), gap_w) if c1 == cols - 1 else (R, max(gap_w, right))
            T, gap_h = (max(T, high), gap_h) if r0 == 0 else (T, max(gap_h, high))
            B, gap_h = (max(B, low), gap_h) if r1 == rows - 1 else (B, max(gap_h, low))
        left = min(0.4, (L + pad) / W)
        right = max(left + 0.1 * cols, 1 - (R + pad) / W)
        bottom = min(0.4, (B + pad) / H)
        top = max(bottom + 0.1 * rows, 1 - (T + pad) / H)
        cell_w = max(0.05, ((right - left) * W - (cols - 1) * (gap_w + pad)) / cols)
        cell_h = max(0.05, ((top - bottom) * H - (rows - 1) * (gap_h + pad)) / rows)
        grid.update(left=left, right=min(right, 1.0), bottom=bottom, top=min(top, 1.0),
                    wspace=(gap_w + pad) / cell_w, hspace=(gap_h + pad) / cell_h)
        for key in p.order:
            ax = _main(p.axes[key])
            r0, r1, c0, c1 = p.meta[key]["span"]
            ax.set_position(grid[r0:r1 + 1, c0:c1 + 1].get_position(fig))


# ---------------------------------------------------------------- smaller vector files

def _join_segments(coll, levels=8):
    """A line collection of many short segments (one per step, each its own colour) becomes
    few polylines: colours rounded to levels steps, touching segments of one colour joined."""
    segs = coll.get_segments()
    if len(segs) <= 1200 or coll.get_array() is not None:
        return False
    widths = np.atleast_1d(coll.get_linewidths())
    if len(widths) > 1 and np.ptp(widths) > 0:
        return False
    cols = np.asarray(coll.get_colors(), dtype=float)
    if len(cols) == 0:
        return False
    cols = np.round(np.resize(cols, (len(segs), 4)) * levels) / levels
    lines_, picked, current, colour = [], [], None, None
    for seg, c in zip(segs, cols):
        seg = np.asarray(seg, dtype=float)
        if current is not None and np.array_equal(c, colour) and len(seg) and np.allclose(
                current[-1], seg[0]):
            current.extend(seg[1:])
            continue
        if current is not None:
            lines_.append(np.array(current))
            picked.append(colour)
        current, colour = list(seg), c
    if current is not None:
        lines_.append(np.array(current))
        picked.append(colour)
    coll.set_segments(lines_)
    coll.set_color(picked)
    return True


def _dense_layers(fig, marks=1500, shapes=4000):
    """Collections with more than marks points (a scatter) or shapes paths (contour bands,
    thousands of lines): the embedded SVG draws them as a 200 dpi image."""
    out = []
    for ax in fig.axes:
        for coll in ax.collections:
            if coll.get_rasterized() or not coll.get_visible():
                continue
            points, paths_ = len(coll.get_offsets()), len(coll.get_paths())
            if points > marks or paths_ > shapes:
                out.append((ax, coll, max(points, paths_)))
    return out


def _short(text, digits):
    value = round(float(text), digits)
    out = ("%.*f" % (digits, value)).rstrip("0").rstrip(".")
    return "0" if out in ("-0", "") else out


def _sig(text, digits=5):
    value = float(text)
    return _short(text, 2) if abs(value) >= 1 else ("%.*g" % (digits, value))


def compact_svg(path_):
    """Rewrites an SVG smaller with the same look: path coordinates and positions to 0.01 pt,
    no metadata, no indentation."""
    with open(path_) as handle_:
        text = handle_.read()
    num = re.compile(r"-?\d+\.\d+")
    text = re.sub(r"<metadata>.*?</metadata>\s*", "", text, flags=re.S)

    def path_data(m):
        d = re.sub(r"\s+", " ", m.group(1)).strip()
        d = num.sub(lambda n: _short(n.group(0), 2), d)
        d = re.sub(r" ?([MLCQZzHVA]) ?", r"\1", d)
        return ' d="%s"' % d
    text = re.sub(r' d="([^"]*)"', path_data, text)
    text = re.sub(r' (x|y|width|height|x1|x2|y1|y2|cx|cy|r)="(-?\d+\.\d+)"',
                  lambda m: ' %s="%s"' % (m.group(1), _short(m.group(2), 2)), text)
    text = re.sub(r' transform="([^"]*)"',
                  lambda m: ' transform="%s"' % num.sub(lambda n: _sig(n.group(0)), m.group(1)), text)
    text = re.sub(r' style="([^"]*)"',
                  lambda m: ' style="%s"' % num.sub(lambda n: _short(n.group(0), 3), m.group(1)), text)
    text = re.sub(r">\s+<", "><", text)
    text = _style_classes(text)
    with open(path_, "w") as handle_:
        handle_.write(text)


def _style_classes(text):
    """Style attributes used three times or more become classes in the SVG's own style sheet
    (the file is embedded as an image, so its classes stay its own)."""
    from collections import Counter
    counts = Counter(re.findall(r' style="([^"]*)"', text))
    common = [style_ for style_, n in counts.most_common() if n >= 3 and len(style_) > 12]
    if not common:
        return text
    names = dict((style_, "s%d" % i) for i, style_ in enumerate(common))
    text = re.sub(r' style="([^"]*)"', lambda m: ' class="%s"' % names[m.group(1)]
                  if m.group(1) in names else m.group(0), text)
    rules = "".join(".%s{%s}" % (name, style_) for style_, name in names.items())
    if "</style>" in text:
        return text.replace("</style>", rules + "</style>", 1)
    return re.sub(r"(<svg[^>]*>)", r'\1<defs><style type="text/css">%s</style></defs>' % rules,
                  text, count=1)


def _save_embed(p, path_, owners):
    """The SVG a diagram embeds: text as outlines, dense layers rasterized, numbers rounded.
    Returns what was rasterized, for the manifest and the report."""
    fig = p.fig
    flagged = []
    dense = _dense_layers(fig)
    for ax, coll, count in dense:
        coll.set_rasterized(True)
        flagged.append({"panel": owners.get(ax), "what": "%d marks or shapes" % count, "dpi": 200})
    try:
        with matplotlib.rc_context({"svg.fonttype": "path"}):
            fig.savefig(path_, format="svg", transparent=True, metadata={"Date": None}, dpi=200)
    finally:
        for _ax, coll, _count in dense:
            coll.set_rasterized(False)
    compact_svg(path_)
    for ax in fig.axes:
        if getattr(ax, "name", "") == "3d" and any(c.get_rasterized() for c in ax.collections):
            flagged.append({"panel": owners.get(ax), "what": "3D surface faces", "dpi": 200})
    return flagged
`
