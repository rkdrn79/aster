// aster_plot.py, legends that fit their content and never sit on the data, and shared axis
// labels. Python kept as a string: orcad ships the harness as one bundled .mjs file, so a .py
// beside it would not reach a GPU server. Joined by research-figures-plot-lib.
export const PLOT_PY_LEGEND = String.raw`
# ---------------------------------------------------------------- legends

def _renderer(fig):
    try:
        return fig.canvas.get_renderer()
    except AttributeError:  # pragma: no cover
        fig.canvas.draw()
        return fig.canvas.get_renderer()


def _fit_ncol(make, count, width_px, ncol, renderer):
    """A legend from make(columns) with as many columns as fit width_px, rows balanced (5
    entries in two rows: 3 + 2); ncol given wins."""
    if ncol:
        leg = make(ncol)
        leg._aster_cols = ncol
        return leg
    n = max(1, count)
    for cols in range(n, 0, -1):
        rows = -(-n // cols)
        balanced = -(-n // rows)
        if balanced != cols:
            continue
        leg = make(cols)
        if leg.get_window_extent(renderer).width <= width_px or cols == 1:
            leg._aster_cols = cols
            return leg
        leg.remove()
    return make(1)


def _cell_legend(p, key, handles, ncol, kw):
    ax, fig = p.axes[key], p.fig
    fig.canvas.draw()
    r = _renderer(fig)
    side = getattr(p, "legend_side", None)
    r0, r1, c0, c1 = p.meta[key]["span"]
    wide = side in ("bottom", "top") or (side is None and (c1 - c0 + 1) > (r1 - r0 + 1) * 2)
    width = fig.bbox.width - 6 if wide else ax.get_window_extent(r).width

    def make(cols):
        return ax.legend(handles=handles, loc="center", ncol=cols, frameon=False, **kw)
    leg = _fit_ncol(make, len(handles), width, ncol or (None if wide else 1), r)
    if side:
        _size_cell(p, key, leg, side)
    return leg


def _size_cell(p, key, leg, side):
    """Makes the legend cell as tall (or, at the right, as wide) as its legend plus 2 pt."""
    fig, ax = p.fig, p.axes[key]
    across = side == "right"
    ratios = list(p.ratios["w" if across else "h"])
    index = 0 if side == "top" else len(ratios) - 1
    pad = 4 * fig.dpi / 72.0
    for _ in range(5):
        fig.canvas.draw()
        r = _renderer(fig)
        box, cell = leg.get_window_extent(r), ax.get_window_extent(r)
        need = (box.width if across else box.height) + pad
        have = cell.width if across else cell.height
        if have > 0 and abs(need - have) < 0.3 * fig.dpi / 72.0:
            break
        ratios[index] *= need / max(have, 1.0)
        if across:
            p.grid.set_width_ratios(ratios)
        else:
            p.grid.set_height_ratios(ratios)
    p.ratios["w" if across else "h"] = ratios


_OUTSIDE = {"top": "outside upper center", "bottom": "outside lower center",
            "right": "outside right center", "left": "outside left center"}


def _figure_legend(fig, handles, where, ncol, kw):
    """A figure legend outside the panels; the layout makes room for it."""
    fig.canvas.draw()
    r = _renderer(fig)
    loc = _OUTSIDE.get(where, where)

    def make(cols):
        try:
            return fig.legend(handles=handles, loc=loc, ncol=cols, frameon=False, **kw)
        except ValueError:  # matplotlib < 3.7 has no "outside" (no room is made)
            anchor = (0.5, 1.0) if where != "bottom" else (0.5, 0.0)
            return fig.legend(handles=handles, loc="upper center" if where != "bottom" else
                              "lower center", bbox_to_anchor=anchor, ncol=cols, frameon=False, **kw)
    side = where in ("right", "left")
    return _fit_ncol(make, len(handles), fig.bbox.width * 0.98, ncol or (1 if side else None), r)


def legend(ax, handles=None, loc="best", ncol=None, where=None, order=None, **kw):
    """A frameless legend for one panel: where="above" (over the plot, columns fitted to its
    width, the title moved up), "right" (beside it), or inside: loc="best" takes a corner that
    covers no data, else goes above. order lists labels to put first."""
    found = _ordered(handles if handles is not None else collect_handles(ax), order)
    fig = ax.figure
    if where in ("above", "top"):
        fig.canvas.draw()
        r = _renderer(fig)

        def make(cols):
            return ax.legend(handles=found, loc="lower left", bbox_to_anchor=(0, 1.0), ncol=cols,
                             frameon=False, borderaxespad=0.2, **kw)
        out = _fit_ncol(make, len(found), ax.get_window_extent(r).width * 1.02, ncol, r)
        title = ax.get_title("left")
        if title:
            rows = -(-len(found) // out._aster_cols)
            ax.set_title(title, loc="left", pad=4 + rows * STYLE_DATA["fonts"]["small"] * 1.45)
        return out
    if where == "right":
        return ax.legend(handles=found, loc="center left", bbox_to_anchor=(1.02, 0.5),
                         ncol=ncol or 1, frameon=False, **kw)
    if loc != "best":
        return ax.legend(handles=found, loc=loc, ncol=ncol or 1, frameon=False, **kw)
    fig.canvas.draw()
    r = _renderer(fig)
    pts = _data_points(ax)
    for place in ("upper right", "upper left", "lower right", "lower left", "center right",
                  "center left", "upper center", "lower center"):
        leg = ax.legend(handles=found, loc=place, ncol=ncol or 1, frameon=False, **kw)
        box = leg.get_window_extent(r)
        grow = 2 * fig.dpi / 72.0
        inside = ((pts[:, 0] > box.x0 - grow) & (pts[:, 0] < box.x1 + grow)
                  & (pts[:, 1] > box.y0 - grow) & (pts[:, 1] < box.y1 + grow)) if len(pts) else []
        if not np.any(inside):
            return leg
        leg.remove()
    return legend(ax, found, ncol=ncol, where="above", **kw)


# ---------------------------------------------------------------- shared axis labels

def _shared_label(p, which, text, keys, kw):
    content = [k for k in p.order if p.meta[k]["kind"] not in ("legend", "off")]
    if keys is None:
        edge = (max if which == "x" else min)(p.meta[k]["span"][1 if which == "x" else 2]
                                              for k in content)
        keys = [k for k in content if p.meta[k]["span"][1 if which == "x" else 2] == edge]
    keys = list(keys)
    for key in keys:
        p.meta[key]["shared_" + which] = text
    size = kw.pop("fontsize", STYLE_DATA["fonts"]["label"])
    if sorted(keys) == sorted(content) and not p.insets:
        setter = p.fig.supxlabel if which == "x" else p.fig.supylabel
        return setter(text, fontsize=size, color=style().ink, **kw)
    axes_ = [_main(p.axes[k]) for k in keys]

    def frame(renderer):
        from matplotlib.transforms import Bbox
        return Bbox.union([a.get_window_extent(renderer) for a in axes_])
    note = axes_[0].annotate(text, xy=(0.5, 0) if which == "x" else (0, 0.5), xycoords=frame,
                             xytext=(0, -12) if which == "x" else (-18, 0),
                             textcoords="offset points", ha="center" if which == "x" else "right",
                             va="top" if which == "x" else "center",
                             rotation=0 if which == "x" else 90, fontsize=size,
                             color=style().ink, annotation_clip=False, **kw)
    note._aster_shared = (which, axes_)
    # Why: in the layout the label would widen one panel; a blank axis label keeps its row.
    note.set_in_layout(False)
    for a in axes_:
        if not (a.get_xlabel() if which == "x" else a.get_ylabel()).strip():
            (a.set_xlabel if which == "x" else a.set_ylabel)(" ", fontsize=size)
    return note


def _place_shared(p):
    """Shared labels sit 2 pt outside the tick labels of every panel they name."""
    fig = p.fig
    notes = [t for ax in fig.axes for t in ax.texts if getattr(t, "_aster_shared", None)]
    if not notes:
        return
    for _ in range(2):
        fig.canvas.draw()
        r = _renderer(fig)
        for t in notes:
            which, axes_ = t._aster_shared
            t.set_visible(False)
            gap = 0.0
            for a in axes_:
                label = a.xaxis.label if which == "x" else a.yaxis.label
                blank = not label.get_text().strip()
                label.set_visible(not blank)
                box, frame = a.get_tightbbox(r), a.get_window_extent(r)
                label.set_visible(True)
                gap = max(gap, (frame.y0 - box.y0) if which == "x" else (frame.x0 - box.x0))
            t.set_visible(True)
            off = gap / fig.dpi * 72 + 2
            t.xyann = (0, -off) if which == "x" else (-off, 0)
`
