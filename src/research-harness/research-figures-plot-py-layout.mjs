// aster_plot.py, panels, labels, legends and insets. Python kept as a string: orcad ships the harness as one bundled
// .mjs file, so a .py beside it would not reach a GPU server. Joined by research-figures-plot-lib.
export const PLOT_PY_LAYOUT = String.raw`
# ---------------------------------------------------------------- panels

class Joint(object):
    """A joint plot's three axes: main, the top and right marginals."""

    def __init__(self, main, top, right):
        self.main, self.top, self.right = main, top, right

    def __iter__(self):
        return iter((self.main, self.top, self.right))


def _parse_layout(layout):
    if isinstance(layout, tuple) and len(layout) == 2 and all(isinstance(v, int) for v in layout):
        rows, cols = layout
        letters = iter(_LETTERS)
        return ["".join(next(letters) for _ in range(cols)) for _ in range(rows)]
    if isinstance(layout, str):
        rows = [row.replace(" ", "") for row in re.split(r"[;\n]", layout) if row.strip()]
    else:
        rows = ["".join(row) for row in layout]
    if not rows or len(set(len(row) for row in rows)) != 1:
        raise ValueError("layout rows must have the same number of cells: %r" % (layout,))
    return rows


def _spans(rows):
    spans, order = {}, []
    for r, row in enumerate(rows):
        for c, key in enumerate(row):
            if key == ".":
                continue
            if key not in spans:
                spans[key] = [r, r, c, c]
                order.append(key)
            span = spans[key]
            span[0], span[1] = min(span[0], r), max(span[1], r)
            span[2], span[3] = min(span[2], c), max(span[3], c)
    for key, (r0, r1, c0, c1) in spans.items():
        cells = [rows[r][c] for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]
        if any(cell != key for cell in cells):
            raise ValueError("panel %r is not a rectangle in the layout" % key)
    return spans, order


def _label_text(fmt, index):
    letter = _LETTERS[index]
    if fmt in (None, False, ""):
        return None
    if isinstance(fmt, (list, tuple)):
        return fmt[index] if index < len(fmt) else None
    return fmt.replace("a", letter).replace("A", letter.upper()) if fmt in (
        "(a)", "a", "A", "(A)", "a)", "a.", "A.") else fmt % letter


def _groups(value, order, rows, spans):
    if value in (None, False):
        return []
    if value in (True, "all"):
        return [list(order)]
    if value in ("row", "col"):
        out = {}
        for key in order:
            r0, _, c0, _ = spans[key]
            out.setdefault(r0 if value == "row" else c0, []).append(key)
        return list(out.values())
    return [list(group) for group in value]


def _layout_engine(fig):
    try:
        fig.set_layout_engine("constrained")
        fig.get_layout_engine().set(w_pad=2 * PT, h_pad=2 * PT, wspace=0.03, hspace=0.04)
    except AttributeError:  # matplotlib < 3.6
        fig.set_constrained_layout(True)
        fig.set_constrained_layout_pads(w_pad=2 * PT, h_pad=2 * PT, wspace=0.03, hspace=0.04)


def panels(layout="a", size="single", height=None, venue=None, width_ratios=None,
           height_ratios=None, kinds=None, sharex=None, sharey=None, labels="auto",
           titles=None, label_loc="top", legend=None, style=None, accent=None, slug=None,
           view=(20, 50), math="cm", panel=False):
    """A page-true figure of panels on one GridSpec.

    layout: "abc", "ab;cc" (c spans the second row), ["ab", "cd"], or (rows, cols); "." is empty.
    kinds: {"c": "3d" | "polar" | "legend" | "joint" | "off"}; 2d by default.
    sharex / sharey: True, "row", "col", or groups such as ["ab", "cd"].
    labels: "(a)" (default with two or more panels), "a", "A", None, or a list of strings.
    titles: {"a": "ODE"} prints "(a) ODE". label_loc: "top" (left, above) or "bottom" (centred
    under the panel, a subcaption). legend: "bottom", "top" or "right" adds a legend cell spanning
    the figure; p.legend() fills it and sizes it to fit. panel=True: the plot is made for a cell of a diagram (fig.plot),
    so its size need not be a column width.
    """
    if style is not None or accent is not None or _STATE["style"] is None:
        use(style, accent, math=math)
    width, page_h = page_size(size, height, venue)
    # Why: a plot made for a diagram's cell is rendered at that cell's size (fig.plot writes it).
    cell = os.environ.get("ASTER_PLOT_CELL") if panel else None
    if cell:
        width, page_h = (float(v) for v in cell.split("x"))
    rows = _parse_layout(layout)
    kinds = dict(kinds or {})
    n_rows, n_cols = len(rows), len(rows[0])
    wr = list(width_ratios or [1] * n_cols)
    hr = list(height_ratios or [1] * n_rows)
    if legend in ("bottom", "top"):
        rows = rows + ["@" * n_cols] if legend == "bottom" else ["@" * n_cols] + rows
        cell = sum(hr) * 0.2 / max(0.5, page_h - 0.2)
        hr = hr + [cell] if legend == "bottom" else [cell] + hr
        kinds["@"] = "legend"
    elif legend == "right":
        rows = [row + "@" for row in rows]
        wr.append(sum(wr) * 0.9 / max(0.5, width - 0.9))
        kinds["@"] = "legend"
    spans, order = _spans(rows)
    fig = plt.figure(figsize=(width, page_h))
    _layout_engine(fig)
    grid = GridSpec(len(rows), len(rows[0]), figure=fig, width_ratios=wr, height_ratios=hr)
    content_keys = [key for key in order if kinds.get(key, "2d") not in ("legend", "off")]
    share_x = _groups(sharex, content_keys, rows, spans)
    share_y = _groups(sharey, content_keys, rows, spans)
    axes, meta, made = {}, {}, {}
    for key in order:
        r0, r1, c0, c1 = spans[key]
        cell = grid[r0:r1 + 1, c0:c1 + 1]
        kind = kinds.get(key, "2d")
        kw = {}
        for groups, name in ((share_x, "sharex"), (share_y, "sharey")):
            for group in groups:
                if key in group and group[0] != key and group[0] in made:
                    kw[name] = made[group[0]]
        if kind == "joint":
            sub = cell.subgridspec(2, 2, width_ratios=[4, 1], height_ratios=[1, 4],
                                   wspace=0.02, hspace=0.02)
            main = fig.add_subplot(sub[1, 0], **kw)
            top = fig.add_subplot(sub[0, 0], sharex=main)
            right = fig.add_subplot(sub[1, 1], sharey=main)
            for ax in (top, right):
                ax.tick_params(labelbottom=False, labelleft=False, bottom=False, left=False)
                for side in ("left", "bottom"):
                    ax.spines[side].set_visible(False)
            top.spines["bottom"].set_visible(True)
            right.spines["left"].set_visible(True)
            axes[key], made[key] = Joint(main, top, right), main
        elif kind == "3d":
            ax = fig.add_subplot(cell, projection="3d")
            clean3d(ax, view=view)
            axes[key] = made[key] = ax
        elif kind == "polar":
            ax = fig.add_subplot(cell, projection="polar")
            axes[key] = made[key] = ax
        else:
            ax = fig.add_subplot(cell, **kw)
            if kind in ("legend", "off"):
                ax.axis("off")
            else:
                _quiet_ticks(ax)
            axes[key] = made[key] = ax
        meta[key] = {"kind": kind, "span": spans[key]}
    _hide_shared(axes, share_x, share_y, spans)
    content = [key for key in order if meta[key]["kind"] not in ("legend",)]
    if labels == "auto":
        labels = "(a)" if len(content) > 1 else None
    titles = dict(titles or {})
    for index, key in enumerate(content):
        text = _label_text(labels, index)
        meta[key]["label"] = text
        meta[key]["title"] = titles.get(key)
        _place_label(axes[key], text, titles.get(key), label_loc, meta[key]["kind"])
    p = Panels(fig, axes, order, meta, slug)
    p.label_loc = label_loc
    p.for_panel = panel
    p.grid, p.ratios = grid, {"h": hr, "w": wr}
    p.legend_side = legend if legend in ("bottom", "top", "right") else None
    return p


def _quiet_ticks(ax):
    """At most five round ticks per axis: more crowd a printed panel."""
    from matplotlib.ticker import MaxNLocator
    for axis in (ax.xaxis, ax.yaxis):
        axis.set_major_locator(MaxNLocator(nbins=5, steps=[1, 2, 5, 10]))


def _hide_shared(axes, share_x, share_y, spans):
    for group in share_y:
        rows = {}
        for key in group:
            rows.setdefault(spans[key][0], []).append(key)
        for keys in rows.values():
            for key in sorted(keys, key=lambda k: spans[k][2])[1:]:
                _main(axes[key]).tick_params(labelleft=False)
    for group in share_x:
        cols = {}
        for key in group:
            cols.setdefault(spans[key][2], []).append(key)
        for keys in cols.values():
            for key in sorted(keys, key=lambda k: -spans[k][1])[1:]:
                _main(axes[key]).tick_params(labelbottom=False)


def _main(ax):
    return ax.main if isinstance(ax, Joint) else ax


def _place_label(ax, label, title, where, kind):
    text = " ".join(part for part in (label, title) if part)
    if not text:
        return
    target = ax.top if isinstance(ax, Joint) else ax
    if where == "bottom":
        note = target.annotate(text, xy=(0.5, 0), xycoords="axes fraction", xytext=(0, -24),
                               textcoords="offset points", ha="center", va="top",
                               fontsize=STYLE_DATA["fonts"]["label"], color=style().ink,
                               annotation_clip=False)
        note._aster_subcaption = True
        return
    target.set_title(text, loc="left", fontsize=STYLE_DATA["fonts"]["label"],
                     color=style().ink, pad=3)
    if kind == "3d":
        target.title.set_y(0.98)


class Panels(object):
    """The figure and its panels: p["a"] is panel a's axes (a Joint for joint panels)."""

    def __init__(self, fig, axes, order, meta, slug=None):
        self.fig, self.axes, self.order, self.meta, self.slug = fig, axes, order, meta, slug
        self.label_loc = "top"
        self.insets = []
        self.for_panel = False
        self.placed = False

    def __getitem__(self, key):
        return self.axes[key]

    def __iter__(self):
        return iter(self.axes[key] for key in self.order if self.meta[key]["kind"] != "legend")

    def legend(self, handles=None, where=None, ncol=None, order=None, **kw):
        """A frameless legend for the figure: in the legend cell (panels(legend=...)), sized to
        fit, columns chosen to fit the width; else above the panels (where="top", the default)
        or below them ("bottom"), with room made for it. Handles default to every labelled
        artist once (a line over a fill for bands); order lists labels to put first."""
        handles = handles if handles is not None else collect_handles(self.fig)
        handles = _ordered(handles, order)
        cells = [key for key in self.order if self.meta[key]["kind"] == "legend"]
        where = where or (cells[0] if cells else "top")
        if where in self.axes:
            return _cell_legend(self, where, handles, ncol, kw)
        return _figure_legend(self.fig, handles, where, ncol, kw)

    def xlabel(self, text, keys=None, **kw):
        """One x label centred under several panels (keys, default all in the bottom row):
        the shared label instead of one per panel."""
        return _shared_label(self, "x", text, keys, kw)

    def ylabel(self, text, keys=None, **kw):
        """One y label centred beside several panels (keys, default all in the left column)."""
        return _shared_label(self, "y", text, keys, kw)

    def inset(self, key, bounds=(0.58, 0.55, 0.38, 0.4), xlim=None, ylim=None, mark=True):
        """An inset axes inside panel key (bounds in axes fraction). With xlim and ylim it
        zooms: the region is boxed in the parent and joined to the inset."""
        parent = _main(self.axes[key]) if isinstance(key, str) else key
        ax = parent.inset_axes(list(bounds))
        ax.tick_params(labelsize=STYLE_DATA["fonts"]["small"], length=1.5)
        ax.locator_params(nbins=3)
        for side in ("top", "right"):
            ax.spines[side].set_visible(True)
            ax.spines[side].set_linewidth(0.5)
        if xlim is not None:
            ax.set_xlim(*xlim)
        if ylim is not None:
            ax.set_ylim(*ylim)
        if mark and xlim is not None and ylim is not None:
            try:
                parent.indicate_inset_zoom(ax, edgecolor=style().muted, alpha=0.9, linewidth=0.5)
            except Exception:
                pass
        self.insets.append(ax)
        return ax

    def place(self, key, rect, units="scene"):
        """Puts panel key at an exact rectangle (x, y, w, h) from the top-left (see ap.place)."""
        return place(self, key, rect, units)

    def save(self, slug=None, out=None, quiet=False):
        """Checks the figure and writes its PDF, SVGs, PNG and manifest (see ap.save)."""
        return save(self, slug=slug, out=out, quiet=quiet)


def figure(size="single", height=None, venue=None, style=None, accent=None, slug=None,
           kind="2d", math="cm", panel=False):
    """One panel: returns (p, ax). panel=True for a plot made to sit in a diagram's cell."""
    p = panels("a", size=size, height=height, venue=venue, style=style, accent=accent,
               slug=slug, kinds={"a": kind}, labels=None, math=math, panel=panel)
    return p, p["a"]


# ---------------------------------------------------------------- legends and labels

def handle(label, color=None, kind="line", hatch=None, ls="-", marker=None, lw=1.2, alpha=1.0,
           edge=None, hollow=False):
    """A legend entry drawn by hand: kind line, patch (a fill edged in its own colour, or
    edge=), band (a line over its light fill), or marker; hollow=True for open markers."""
    from matplotlib.legend_handler import HandlerTuple  # noqa: F401
    color = color or style().accent["solid"]
    if kind == "patch":
        face = alpha_mix(color, alpha)
        rim = edge or (style().ink if hatch else color)
        return Patch(facecolor=face, edgecolor=rim, hatch=hatch, linewidth=0.6, label=label)
    if kind == "band":
        line = Line2D([], [], color=color, ls=ls, lw=lw, label=label)
        line._aster_fill = alpha_mix(color, 0.22 if alpha == 1.0 else alpha)
        return _with_fill(line)
    if kind == "marker":
        return Line2D([], [], ls="none", marker=marker or "o", color=color, label=label,
                      markersize=4, markeredgewidth=0.8 if hollow else 0,
                      markerfacecolor="none" if hollow else color, markeredgecolor=color)
    return Line2D([], [], color=color, ls=ls, lw=lw, marker=marker, label=label, markersize=3.5,
                  markerfacecolor="white" if hollow else color, markeredgecolor=color)


def _with_fill(h):
    """A line with a light fill behind it (curves with bands, the filled radar series)."""
    patch = Patch(facecolor=h._aster_fill, edgecolor="none", label=h.get_label())
    out = (patch, h)
    return _LegendPair(out, h.get_label())


class _LegendPair(tuple):
    """(fill, line) drawn on top of each other in a legend, keeping its label."""

    def __new__(cls, items, label):
        made = tuple.__new__(cls, items)
        made._label = label
        return made

    def get_label(self):
        return self._label


def _ordered(handles, order):
    if not order:
        return list(handles)
    named = dict((_label_of(h), h) for h in handles)
    first = [named[name] for name in order if name in named]
    return first + [h for h in handles if _label_of(h) not in order]


def _label_of(h):
    return h.get_label() if hasattr(h, "get_label") else ""


def alpha_mix(value, a, over="#ffffff"):
    """value at opacity a over white, as an opaque colour (prints the same everywhere)."""
    rgb, base = _hex_rgb(value), _hex_rgb(over)
    return mcolors.to_hex(base + (rgb - base) * a)


def collect_handles(fig_or_ax):
    """Every labelled artist once, by label; a line drawn over a fill (curves with bands, the
    filled radar series, ap.band) comes back as a line over its fill."""
    axes = fig_or_ax.axes if hasattr(fig_or_ax, "get_axes") and not hasattr(
        fig_or_ax, "get_legend_handles_labels") else [fig_or_ax]
    seen, out = set(), []
    for ax in axes:
        found, labels = ax.get_legend_handles_labels()
        for h, label in zip(found, labels):
            if label and not label.startswith("_") and label not in seen:
                seen.add(label)
                out.append(_with_fill(h) if getattr(h, "_aster_fill", None) else h)
    return out


def label_lines(ax, lines=None, texts=None, x=None, gap=7.5, pad=3):
    """Labels at the right end of each line instead of a legend, spread so none overlap (gap in
    pt). texts default to the lines' labels."""
    lines = [line for line in (lines or ax.get_lines()) if not line.get_label().startswith("_")]
    texts = texts or [line.get_label() for line in lines]
    ends = []
    for line, text in zip(lines, texts):
        xs, ys = (np.asarray(v, dtype=float) for v in line.get_data())
        if x is not None:
            yv = float(np.interp(x, xs, ys))
            xv = x
        else:
            xv, yv = xs[-1], ys[-1]
        ends.append([xv, yv, text, line.get_color()])
    to_px = ax.transData.transform
    dpi = ax.figure.dpi
    pts = [to_px((e[0], e[1]))[1] / dpi * 72 for e in ends]
    order = np.argsort(pts)
    placed = []
    for i in order:
        y = pts[i] if not placed else max(pts[i], placed[-1] + gap)
        placed.append(y)
    shift = max(0.0, (placed[-1] - max(pts)) / 2) if placed else 0.0
    out = []
    for i, y in zip(order, placed):
        xv, yv, text, col = ends[i]
        offset = (y - shift) - pts[i]
        out.append(ax.annotate(text, xy=(xv, yv), xytext=(pad, offset), textcoords="offset points",
                               va="center", ha="left", color=col if col else style().ink,
                               fontsize=STYLE_DATA["fonts"]["small"], annotation_clip=False))
    return out


def note(ax, text, xy, xytext=(12, 10), arrow=True, color=None):
    """A short 7 pt note pointing at xy with a thin arrow (offset in pt)."""
    color = color or style().ink
    props = dict(arrowstyle="-|>", lw=0.6, color=style().line, shrinkA=1, shrinkB=2,
                 mutation_scale=5) if arrow else None
    return ax.annotate(text, xy=xy, xytext=xytext, textcoords="offset points",
                       fontsize=STYLE_DATA["fonts"]["small"], color=color, arrowprops=props,
                       ha="left" if xytext[0] >= 0 else "right", va="center")


def no_ticks(ax, keep_frame=False):
    """A schematic panel: no ticks; the frame kept as thin muted lines when asked."""
    ax.set_xticks([])
    ax.set_yticks([])
    for side in ax.spines.values():
        side.set_visible(keep_frame)
        side.set_color(style().muted)
        side.set_linewidth(0.5)
    return ax
`
