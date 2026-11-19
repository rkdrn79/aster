// aster_plot.py, bars, curves, heat tables, radar and dot plots. Python kept as a string: orcad ships the harness as one bundled
// .mjs file, so a .py beside it would not reach a GPU server. Joined by research-figures-plot-lib.
export const PLOT_PY_RESULTS = String.raw`
# ---------------------------------------------------------------- results

HATCHES = ["", "////", "\\\\\\\\", "....", "xxxx", "----", "++++"]


def _hatch_list(hatches, methods, oursset):
    """One hatch per method: True (every baseline its own), False, a list, or a dict."""
    if isinstance(hatches, dict):
        return [hatches.get(name) or None for name in methods]
    if isinstance(hatches, (list, tuple)):
        return [h or None for h in hatches] + [None] * (len(methods) - len(hatches))
    out, k = [], 0
    for i in range(len(methods)):
        if i in oursset or not hatches:
            out.append(None)
        else:
            out.append(HATCHES[(k % (len(HATCHES) - 1)) + 1])
            k += 1
    return out


def bars(ax, values, groups=None, methods=None, errors=None, ours=None, colors=None,
         hatches=True, labels=True, fmt="{:.1f}", width=0.8, label_size=None, ylim=None,
         best=None, rotate=None, stars=None, hatch_lw=None):
    """Grouped bars: values (methods × groups) or a dict method -> list over groups. Ours (an
    index or name, or a list for two variants: the accent, then its lighter shade) in the
    accent, baselines gray, black edges, error bars and value labels above (rotate=None turns
    them only when they would not fit, False never). hatches: True (each baseline its own),
    False, a list per method or a dict name -> hatch ("" for none), hatch_lw their line width.
    best="max"/"min" underlines each group's best. stars: significance brackets, a list of
    (group, method_a, method_b, p) as in ap.significance."""
    if isinstance(values, dict):
        methods = methods or list(values.keys())
        values = [values[m] for m in methods]
        if isinstance(errors, dict):
            errors = [errors[m] for m in methods]
    values = np.atleast_2d(np.asarray(values, dtype=float))
    errors = None if errors is None else np.atleast_2d(np.asarray(errors, dtype=float))
    m, g = values.shape
    methods = methods or ["_m%d" % i for i in range(m)]
    groups = groups if groups is not None else [""] * g
    picks = ours if isinstance(ours, (list, tuple)) else [ours]
    picks = [methods.index(o) if isinstance(o, str) else o for o in picks]
    if picks == [None]:
        picks = [m - 1] if m > 1 else []
    oursset = set(picks)
    given = colors is not None
    shades = [style().accent["solid"], style().accent["strong"], style().accent["ink"]]
    colors = list(colors) if given else [None] * m
    grays = ["#ffffff", style().block, style().strong, style().mid, "#ffffff", style().block]
    hatch_of = _hatch_list(hatches, methods, oursset)
    if hatch_lw:
        matplotlib.rcParams["hatch.linewidth"] = hatch_lw
    step = width / m
    x = np.arange(g)
    out, k = [], 0
    rotate_ = _bar_rotation(ax, values, fmt, step, label_size) if rotate is None else rotate
    for i in range(m):
        is_ours = i in oursset
        if given:
            face = colors[i]
        elif is_ours:
            face = shades[picks.index(i) % len(shades)]
        else:
            face = grays[k % len(grays)] if hatches is not False else style().grays(m)[k]
        if not is_ours:
            k += 1
        pos = x - width / 2 + step * (i + 0.5)
        cont = ax.bar(pos, values[i], step * 0.92, color=face, edgecolor=style().ink, lw=0.5,
                      hatch=hatch_of[i], label=methods[i], zorder=2,
                      yerr=None if errors is None else errors[i],
                      error_kw=dict(ecolor=style().ink, elinewidth=0.6, capsize=1.2, capthick=0.6))
        out.append(cont)
        if labels:
            tops = values[i] + (0 if errors is None else errors[i])
            for xp, top, v in zip(pos, tops, values[i]):
                ax.annotate(fmt.format(v), xy=(xp, top), xytext=(0, 1.2), textcoords="offset points",
                            ha="center", va="bottom", rotation=90 if rotate_ else 0,
                            fontsize=label_size or STYLE_DATA["fonts"]["small"],
                            color=style().accent["ink"] if is_ours else style().ink)
    if best in ("max", "min"):
        pick = values.argmax(0) if best == "max" else values.argmin(0)
        for j, i in enumerate(pick):
            pos = j - width / 2 + step * (i + 0.5)
            ax.plot([pos - step * 0.4, pos + step * 0.4], [0, 0], color=style().accent["ink"],
                    lw=1.6, solid_capstyle="butt", clip_on=False, zorder=4)
    ax.set_xticks(x)
    ax.set_xticklabels(groups)
    ax.tick_params(axis="x", length=0)
    ax.set_xlim(-0.55, g - 0.45)
    tops = values + (0 if errors is None else errors)
    top = np.nanmax(tops)
    if ylim:
        ax.set_ylim(*ylim)
    else:
        ax.set_ylim(0, top * ((1.28 if rotate_ else 1.16) if labels else 1.05))
    ax._aster_bars = dict(pos=np.array([x - width / 2 + step * (i + 0.5) for i in range(m)]),
                          tops=tops, methods=list(methods), labels=bool(labels), rotate=rotate_)
    if stars:
        significance(ax, stars)
    return out


def _bar_rotation(ax, values, fmt, step, size):
    """Whether value labels need turning: the widest is wider than a bar at print size."""
    fig = ax.figure
    pos = ax.get_position()
    width_pt = pos.width * fig.get_size_inches()[0] * 72 / max(1, values.shape[1])
    longest = max(len(fmt.format(v)) for v in values.ravel())
    return longest * 0.56 * (size or STYLE_DATA["fonts"]["small"]) > step * 0.92 * width_pt * 1.15


def curves(ax, x, runs, ours=None, colors=None, band="std", lw=1.2, markers=False, smooth=0,
           every=None, styles=None):
    """Mean ± spread curves: runs is a dict method -> array (seeds, len(x)) (or one curve).
    band std, sem, minmax or None; ours in the accent, drawn last and a bit heavier."""
    names = list(runs.keys())
    ours = names.index(ours) if isinstance(ours, str) else (len(names) - 1 if ours is None else ours)
    colors = colors or series(len(names), ours=ours)
    dashes = styles or ["-", (0, (4, 1.5)), (0, (1.2, 1.2)), (0, (5, 1.5, 1.2, 1.5)), "-", "-"]
    marks = ["o", "s", "^", "D", "v", "P"]
    order = [i for i in range(len(names)) if i != ours] + [ours]
    x = np.asarray(x, dtype=float)
    out = {}
    k = 0
    for i in order:
        data = np.atleast_2d(np.asarray(runs[names[i]], dtype=float))
        if smooth:
            kernel = np.ones(smooth) / smooth
            data = np.array([np.convolve(np.pad(r, (smooth // 2, smooth - 1 - smooth // 2),
                                                mode="edge"), kernel, mode="valid") for r in data])
        mean = data.mean(0)
        is_ours = i == ours
        ls = "-" if is_ours else dashes[k % len(dashes)]
        if band and len(data) > 1:
            if band == "minmax":
                lo, hi = data.min(0), data.max(0)
            else:
                spread = data.std(0, ddof=1)
                if band == "sem":
                    spread = spread / np.sqrt(len(data))
                lo, hi = mean - spread, mean + spread
            ax.fill_between(x, lo, hi, color=alpha_mix(colors[i], 0.22 if is_ours else 0.16), lw=0,
                            zorder=1 + is_ours)
        line, = ax.plot(x, mean, color=colors[i], lw=lw * (1.15 if is_ours else 0.9), ls=ls,
                        label=names[i], zorder=3 + is_ours,
                        marker=marks[k % len(marks)] if markers and not is_ours else (
                            "o" if markers else None),
                        markevery=every, ms=3, mec="white", mew=0.4)
        if band and len(data) > 1:
            line._aster_fill = alpha_mix(colors[i], 0.22 if is_ours else 0.16)
        out[names[i]] = line
        if not is_ours:
            k += 1
    ax.set_xlim(x[0], x[-1])
    return out


def heat_table(ax, M, rows, cols, fmt="{:.1f}", best="max", axis=0, cmap_="seq", vmin=None,
               vmax=None, highlight_row=None, size=None):
    """A table of numbers as a heat map: tinted cells (shaded per column, or per row with
    axis=1, darker is better), values printed, the best in bold, ours (highlight_row) named in
    the accent's ink."""
    M = np.asarray(M, dtype=float)
    cm = cmap(cmap_) if isinstance(cmap_, str) else cmap_
    if vmin is None and vmax is None and best in ("max", "min"):
        lo = np.nanmin(M, axis=axis, keepdims=True)
        hi = np.nanmax(M, axis=axis, keepdims=True)
    else:
        lo = np.nanmin(M) if vmin is None else vmin
        hi = np.nanmax(M) if vmax is None else vmax
    norm = (M - lo) / np.where(hi - lo == 0, 1, hi - lo)
    if best == "min":
        norm = 1 - norm
    tones = cm(0.08 + 0.62 * norm)
    from matplotlib.patches import Rectangle
    for r in range(M.shape[0]):
        for c in range(M.shape[1]):
            ax.add_patch(Rectangle((c - 0.5, r - 0.5), 1, 1, facecolor=tones[r, c],
                                   edgecolor="white", lw=0.8))
    picks = set()
    if best in ("max", "min"):
        arg = np.nanargmax if best == "max" else np.nanargmin
        if axis == 0:
            picks = set((int(arg(M[:, c])), c) for c in range(M.shape[1]))
        else:
            picks = set((r, int(arg(M[r]))) for r in range(M.shape[0]))
    for r in range(M.shape[0]):
        for c in range(M.shape[1]):
            if np.isnan(M[r, c]):
                continue
            ink = "#ffffff" if luminance(mcolors.to_hex(tones[r, c])) < 0.3 else style().ink
            ax.text(c, r, fmt.format(M[r, c]), ha="center", va="center", color=ink,
                    fontsize=size or STYLE_DATA["fonts"]["small"],
                    fontweight="bold" if (r, c) in picks else "normal")
    ax.set_xlim(-0.5, M.shape[1] - 0.5)
    ax.set_ylim(M.shape[0] - 0.5, -0.5)
    ax.set_xticks(range(M.shape[1]))
    ax.set_xticklabels(cols)
    ax.set_yticks(range(M.shape[0]))
    ax.set_yticklabels(rows)
    ax.xaxis.tick_top()
    ax.tick_params(length=0, pad=2)
    title = ax.get_title("left")
    if title:
        ax.set_title(title, loc="left", pad=8)
    for side in ax.spines.values():
        side.set_visible(False)
    if highlight_row is not None:
        ax.get_yticklabels()[highlight_row].set_color(style().accent["ink"])
    return ax


def radar(ax, categories, values, ours=None, colors=None, fill=True, rmax=None, rings=3,
          lw=1.1, ring_labels=True, fmt="{:g}", reference=None, styles=None):
    """A radar chart in a polar panel (kinds={"a": "polar"}): values dict method -> scores per
    category, ours in the accent and filled (its legend entry a line over the fill), the rest
    gray outlines with dashes (and markers past four). ring_labels prints the ring values at the
    clearest angle, over the fills; reference adds dict name -> scores in thin ink (a human or
    chance level)."""
    names = list(values.keys())
    ours = names.index(ours) if isinstance(ours, str) else (len(names) - 1 if ours is None else ours)
    colors = colors or series(len(names), ours=ours)
    k = len(categories)
    angles = np.linspace(0, 2 * np.pi, k, endpoint=False)
    closed = np.r_[angles, angles[:1]]
    every = list(values.values()) + list((reference or {}).values())
    rmax = rmax or max(max(v) for v in every) * 1.05
    ax.set_theta_direction(-1)
    ax.set_theta_offset(np.pi / 2)
    ax.set_ylim(0, rmax)
    ax.set_xticks(angles)
    ax.set_xticklabels(categories)
    for label, angle in zip(ax.get_xticklabels(), angles):
        side = math.sin(angle)
        label.set_horizontalalignment("left" if side > 0.2 else "right" if side < -0.2 else "center")
    radii = _nice_rings(rmax, rings)
    ax.set_yticks(radii)
    ax.set_yticklabels([])
    ax.grid(True, color=style().strong, lw=0.4)
    ax.spines["polar"].set_visible(False)
    ax.tick_params(axis="x", pad=1)
    order = [i for i in range(len(names)) if i != ours] + [ours]
    dashes = styles or ["-", (0, (4, 1.5)), (0, (1.2, 1.2)), (0, (5, 1.5, 1.2, 1.5)),
                        (0, (2.5, 1.2)), (0, (6, 2))]
    marks = [None, None, None, None, "s", "^", "D", "v"]
    k_ = 0
    crossings = []
    for i in order:
        v = np.asarray(values[names[i]], dtype=float)
        r = np.r_[v, v[:1]]
        is_ours = i == ours
        if fill and is_ours:
            ax.fill(closed, r, color=alpha_mix(colors[i], 0.25), lw=0, zorder=2)
        line, = ax.plot(closed, r, color=colors[i], lw=lw * (1.15 if is_ours else 0.85),
                        ls="-" if is_ours else dashes[k_ % len(dashes)], label=names[i],
                        zorder=3 + is_ours, marker="o" if is_ours else marks[k_ % len(marks)],
                        ms=2.2, mec="white", mew=0.3)
        if fill and is_ours:
            line._aster_fill = alpha_mix(colors[i], 0.25)
        crossings.append(r)
        if not is_ours:
            k_ += 1
    for name, v in (reference or {}).items():
        r = np.r_[np.asarray(v, dtype=float), v[:1]]
        ax.plot(closed, r, color=style().ink, lw=0.7, ls=(0, (3, 1.5)), label=name, zorder=4)
        crossings.append(r)
    ax.set_xlim(0, 2 * np.pi)
    if ring_labels:
        _ring_labels(ax, angles, crossings, radii, fmt)
    return ax


def _nice_rings(rmax, rings):
    """Round ring values: the widest round step that still gives rings of them under rmax."""
    mag = 10 ** math.floor(math.log10(rmax / rings))
    steps = sorted((s * m for s in (1, 2, 2.5, 5) for m in (mag / 10, mag, mag * 10)), reverse=True)
    step = next((s for s in steps if math.floor(rmax * 1.001 / s) >= rings), steps[-1])
    return [step * (i + 1) for i in range(rings)]


def _ring_labels(ax, angles, crossings, radii, fmt):
    """Ring values along the angle between two categories where the series lines pass farthest
    from them, drawn over the fills with a white halo."""
    from matplotlib import patheffects
    mids = angles + np.pi / len(angles)
    best, where = None, mids[0]
    for j, mid in enumerate(mids):
        cross = [(r[j] + r[j + 1]) / 2 * math.cos(np.pi / len(angles)) for r in crossings]
        gap = min(abs(c - q) for c in cross for q in radii) if cross else 1.0
        if best is None or gap > best:
            best, where = gap, mid
    for q in radii:
        ax.text(where, q, fmt.format(q), fontsize=STYLE_DATA["fonts"]["small"],
                color=style().muted_text, ha="center", va="center", zorder=8,
                path_effects=[patheffects.withStroke(linewidth=2, foreground="white")])


def dots(ax, labels, values, errors=None, ours=None, ref=None, fmt=None, xlabel=None):
    """A dot-and-whisker chart (ablations, effect sizes): one row per label, the reference
    value as a thin vertical line."""
    values = np.asarray(values, dtype=float)
    y = np.arange(len(values))[::-1]
    for i, (yv, v) in enumerate(zip(y, values)):
        is_ours = i == ours
        col = style().accent["solid"] if is_ours else style().line
        if errors is not None:
            ax.plot([v - errors[i], v + errors[i]], [yv, yv], color=col, lw=0.9, zorder=2)
        ax.plot(v, yv, "o", ms=3.6 if is_ours else 3.0, color=col, mec="white", mew=0.4, zorder=3)
        if fmt:
            ax.annotate(fmt.format(v), xy=(v + (errors[i] if errors is not None else 0), yv),
                        xytext=(3, 0), textcoords="offset points", va="center",
                        fontsize=STYLE_DATA["fonts"]["small"], color=col)
    if ref is not None:
        ax.axvline(ref, color=style().mid, lw=0.6, zorder=1)
    ax.set_yticks(y)
    ax.set_yticklabels(labels)
    ax.tick_params(axis="y", length=0)
    ax.spines["left"].set_visible(False)
    if ours is not None:
        ax.get_yticklabels()[ours].set_color(style().accent["ink"])
    if xlabel:
        ax.set_xlabel(xlabel)
    ax.set_ylim(-0.6, len(values) - 0.4)
    return ax


# ---------------------------------------------------------------- reading Runs

def read_metrics(path, metric, split=None, step="step"):
    """(steps, values) of one metric from a Run's metrics.jsonl ({"step", "split", "metrics"}
    lines, as Aster records them) or any JSON-lines file with flat keys."""
    steps, values = [], []
    with open(path) as handle_:
        for index, line in enumerate(handle_):
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if split is not None and row.get("split") != split:
                continue
            found = row.get("metrics", row)
            value = found.get(metric) if isinstance(found, dict) else None
            if isinstance(value, (int, float)):
                steps.append(row.get(step, index))
                values.append(float(value))
    return np.asarray(steps, dtype=float), np.asarray(values, dtype=float)


def load_runs(groups, metric, split=None, step="step", n=200):
    """Several seeds per method on one step grid: groups is a dict name -> [metrics.jsonl, ...];
    returns (x, {name: array (seeds, n)}) ready for curves()."""
    read = dict((name, [read_metrics(p_, metric, split, step) for p_ in paths_])
                for name, paths_ in groups.items())
    found = [s for runs_ in read.values() for s, v in runs_ if len(s)]
    if not found:
        raise ValueError("no %r values in %s" % (metric, ", ".join(
            p_ for paths_ in groups.values() for p_ in paths_)))
    lo = max(float(s.min()) for s in found)
    hi = min(float(s.max()) for s in found)
    x = np.linspace(lo, hi, n)
    return x, dict((name, np.array([np.interp(x, s, v) for s, v in runs_ if len(s)]))
                   for name, runs_ in read.items())
`
