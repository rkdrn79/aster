// aster_plot.py, significance marks on results: stars and p-values in brackets between bars, as
// papers mark them. Python kept as a string: orcad ships the harness as one bundled .mjs file, so
// a .py beside it would not reach a GPU server. Joined by research-figures-plot-lib.
export const PLOT_PY_STATS = String.raw`
# ---------------------------------------------------------------- significance

# Why these: * p < 0.05, ** p < 0.01, *** p < 0.001 is the convention most journals and APA use;
# GraphPad Prism adds **** for p < 0.0001 (SIG_LEVELS_FINE). The caption names the test and the
# thresholds, and corrects for multiple comparisons; exact p-values (fmt="p") are preferred when
# there is room.
SIG_LEVELS = ((0.001, "***"), (0.01, "**"), (0.05, "*"))
SIG_LEVELS_FINE = ((0.0001, "****"),) + SIG_LEVELS


def stars(p, levels=SIG_LEVELS, ns="n.s."):
    """The star mark for a p-value: *** p < 0.001, ** p < 0.01, * p < 0.05, else ns ("n.s.").
    levels=ap.SIG_LEVELS_FINE adds **** for p < 0.0001."""
    for cut, mark in levels:
        if p < cut:
            return mark
    return ns


def p_text(p, digits=3):
    """p as papers print it: "p < 0.001" below 0.001, else "p = 0.012"."""
    floor = 10 ** -digits
    return "$p < %s$" % ("%g" % floor) if p < floor else "$p = %.*f$" % (digits, p)


def significance(ax, pairs, fmt="stars", levels=SIG_LEVELS, ns=True, size=None, color=None):
    """Significance marks over ap.bars: pairs is a list of (group, a, b, p), or (a, b, p) with
    one group; a and b are method names or indices, b None marks bar a alone (against a
    reference named in the caption). p is a number, shown per fmt: "stars", "p" (p = 0.012)
    or "both", or a string shown as is; ns=False leaves out the non-significant ones.
    Brackets clear the bars, their error bars and value labels, stack without overlapping, and
    the y limit grows to hold them."""
    info = getattr(ax, "_aster_bars", None)
    if info is None:
        raise ValueError("significance marks bars drawn by ap.bars; call it after ap.bars")
    methods, pos, tops = info["methods"], info["pos"], info["tops"]
    index = lambda v: methods.index(v) if isinstance(v, str) else v  # noqa: E731
    items = []
    for entry in pairs:
        group, a, b, p = entry if len(entry) == 4 else (0,) + tuple(entry)
        a, b = index(a), (None if b is None else index(b))
        if isinstance(p, str):
            text = p
        else:
            mark = stars(p, levels, "n.s.")
            if mark == "n.s." and not ns:
                continue
            text = {"p": p_text(p), "both": "%s %s" % (mark, p_text(p))}.get(fmt, mark)
        lo, hi = (a, a) if b is None else (min(a, b), max(a, b))
        items.append((pos[lo][group], pos[hi][group], tops[lo:hi + 1, group].max(), text,
                      b is None))
    items.sort(key=lambda it: it[1] - it[0])
    fig = ax.figure
    label_pt = 0.0
    if info["labels"]:
        label_pt = 9.0 if not info["rotate"] else 4.5 * max(len(t.get_text()) for t in ax.texts)
    placed = []
    for _ in range(3):
        fig.canvas.draw()
        y0, y1 = ax.get_ylim()
        s = (y1 - y0) / max(1.0, ax.get_window_extent().height * 72.0 / fig.dpi)
        placed = []
        for x1, x2, top, text, alone in items:
            base = top + (label_pt + 2.5) * s
            for px1, px2, ptop in [(q[0], q[1], q[3]) for q in placed]:
                if px1 <= x2 + 1e-9 and x1 <= px2 + 1e-9:
                    base = max(base, ptop + 1.5 * s)
            y = base + (0 if alone else 2.0 * s)
            placed.append((x1, x2, y, y + 9.0 * s, text, alone, s))
        need = max(q[3] for q in placed) if placed else y1
        if need <= y1 + 1e-9:
            break
        ax.set_ylim(y0, need + 1.0 * s)
    ink = color or style().ink
    for x1, x2, y, _top, text, alone, s in placed:
        if not alone:
            ax.plot([x1, x1, x2, x2], [y - 2.0 * s, y, y, y - 2.0 * s], color=ink, lw=0.6,
                    clip_on=False, zorder=5, solid_joinstyle="miter")
        ax.text((x1 + x2) / 2, y + 0.4 * s, text, ha="center", va="bottom", color=ink,
                fontsize=size or STYLE_DATA["fonts"]["small"], zorder=6)
    return placed
`
