// aster_plot.py, trajectories, fields and generation teasers. Python kept as a string: orcad ships the harness as one bundled
// .mjs file, so a .py beside it would not reach a GPU server. Joined by research-figures-plot-lib.
export const PLOT_PY_PATHS = String.raw`
# ---------------------------------------------------------------- trajectories

def _segments(xy):
    xy = np.asarray(xy, dtype=float)
    return np.stack([xy[:-1], xy[1:]], 1)


def _runs(xy, values, k=12):
    """A path cut into at most k polylines, each with the mean of its segments' values (alphas
    or colours): what a fading path draws, at a fraction of the SVG size of one per segment."""
    xy = np.asarray(xy, dtype=float)
    n = len(xy) - 1
    if n < 1:
        return [], []
    edges = np.unique(np.linspace(0, n, min(k, n) + 1).round().astype(int))
    values = np.asarray(values, dtype=float)
    lines_, picked = [], []
    for i0, i1 in zip(edges[:-1], edges[1:]):
        lines_.append(xy[i0:i1 + 1])
        picked.append(values[i0:i1].mean(0))
    return lines_, picked


def blend(c0, c1, t):
    """The colour a fraction t of the way from c0 to c1 (t one value or an array: then a list),
    mixed in linear light: a time colour from gray noise (t=0) to the accent (t=1)."""
    a, b = _lin(_hex_rgb(c0)), _lin(_hex_rgb(c1))
    ts = np.atleast_1d(np.asarray(t, dtype=float))
    out = [mcolors.to_hex(_gamma(a + (b - a) * float(np.clip(s, 0, 1)))) for s in ts]
    return out[0] if np.ndim(t) == 0 else out


def band(ax, t, mean, sd, k=2.0, color=None, ramp=None, alpha=0.22, lw=0.8, line=True,
         label=None, zorder=2, chunks=24):
    """A 1D Gaussian path over t (a conditional p_t(x | z)): the mean line and the band mean ±
    k sd, its width following sd(t), see-through (alpha) so overlapping bands darken. ramp=(c0,
    c1) colours it from c0 at the start to c1 at the end (gray noise to the accent); else one
    colour. The legend shows a line over a fill."""
    from matplotlib.collections import PolyCollection
    t = np.asarray(t, dtype=float)
    mean = np.broadcast_to(np.asarray(mean, dtype=float), t.shape)
    sd = np.broadcast_to(np.asarray(sd, dtype=float), t.shape)
    color = color or style().accent["solid"]
    lo, hi = mean - k * sd, mean + k * sd
    tone = np.linspace(0, 1, len(t))
    pieces = min(chunks, len(t) - 1) if ramp else 1
    edges = np.unique(np.linspace(0, len(t) - 1, pieces + 1).round().astype(int))
    polys, cols = [], []
    for i0, i1 in zip(edges[:-1], edges[1:] + 1):
        polys.append(np.concatenate([np.stack([t[i0:i1], lo[i0:i1]], 1),
                                     np.stack([t[i0:i1], hi[i0:i1]], 1)[::-1]]))
        base = blend(ramp[0], ramp[1], float(tone[i0:i1].mean())) if ramp else color
        cols.append(mcolors.to_rgba(base, alpha))
    # Why see-through: overlapping bands darken where paths share mass, as the density does.
    fill = PolyCollection(polys, facecolors=cols, edgecolors="none", linewidths=0, zorder=zorder)
    ax.add_collection(fill)
    ax.update_datalim(np.concatenate(polys))
    ax.autoscale_view()
    if line:
        runs_, values = _runs(np.stack([t, mean], 1), tone[1:], chunks)
        cols = [blend(ramp[0], ramp[1], float(v)) if ramp else color for v in values]
        mid = LineCollection(runs_, colors=cols, linewidths=lw, zorder=zorder + 0.5,
                             capstyle="round")
        ax.add_collection(mid)
    end = ramp[1] if ramp else color
    if label:
        proxy, = ax.plot([], [], color=end, lw=lw, label=label)
        proxy._aster_fill = alpha_mix(end, alpha)
    return fill


def path(ax, xy, color=None, t=None, cmap_=None, fade=(0.4, 1.0), lw=1.2, arrows=0,
         start=True, end=True, label=None, zorder=3):
    """One trajectory: faded from start to end in one colour, or coloured by t with cmap_.
    arrows: n small heads along it; start (open circle) and end (filled) markers."""
    xy = np.asarray(xy, dtype=float)
    color = color or style().accent["solid"]
    seg = _segments(xy)
    if cmap_ is not None:
        tt = np.linspace(0, 1, len(seg)) if t is None else np.asarray(t, dtype=float)[:-1]
        pieces, picked = _runs(xy, tt, 48)
        coll = LineCollection(pieces, cmap=cmap_ if not isinstance(cmap_, str) else cmap(cmap_),
                              linewidths=lw, zorder=zorder, capstyle="round", joinstyle="round")
        coll.set_array(np.asarray(picked))
    else:
        alphas = np.linspace(fade[0], fade[1], len(seg)) if fade else np.ones(len(seg))
        pieces, picked = _runs(xy, alphas, 24)
        coll = LineCollection(pieces, colors=[alpha_mix(color, a_) for a_ in picked],
                              linewidths=lw, zorder=zorder, capstyle="round", joinstyle="round")
    ax.add_collection(coll)
    ax.update_datalim(xy)
    ax.autoscale_view()
    end_colour = color if cmap_ is None else coll.cmap(1.0)
    if arrows:
        for frac in np.linspace(0, 1, arrows + 2)[1:-1]:
            i = int(frac * (len(xy) - 2))
            ax.annotate("", xy=xy[i + 1], xytext=xy[i], arrowprops=dict(
                arrowstyle="-|>", color=end_colour, lw=0, mutation_scale=6), zorder=zorder + 1)
    if start:
        ax.plot(*xy[0], marker="o", ms=3.2, mfc="white", mec=style().line, mew=0.6,
                zorder=zorder + 1, ls="none")
    if end:
        ax.plot(*xy[-1], marker="o", ms=3.4, color=end_colour, mec="white", mew=0.4,
                zorder=zorder + 1, ls="none")
    if label:
        ax.plot([], [], color=end_colour, lw=lw, label=label)
    return coll


def paths(ax, many, color=None, lw=0.6, fade=(0.12, 0.7), ends=True, label=None, zorder=2,
          end_size=4.0, start_color=None):
    """Many sample paths (array (n, T, 2)), thin and fading toward their end, with small dots
    where they start (gray) and end (in colour)."""
    many = np.asarray(many, dtype=float)
    color = color or style().accent["solid"]
    T = many.shape[1]
    alphas = np.linspace(fade[0], fade[1], T - 1) if fade else np.ones(T - 1) * 0.6
    seg, rgba = [], []
    for p_ in many:
        pieces, picked = _runs(p_, alphas, 10)
        seg.extend(pieces)
        rgba.extend(mcolors.to_rgba(color, a_) for a_ in picked)
    coll = LineCollection(seg, colors=rgba, linewidths=lw, zorder=zorder, capstyle="round",
                          joinstyle="round")
    ax.add_collection(coll)
    ax.update_datalim(many.reshape(-1, 2))
    ax.autoscale_view()
    if ends:
        ax.scatter(many[:, 0, 0], many[:, 0, 1], s=end_size * 0.7, color=start_color or style().mid,
                   lw=0, zorder=zorder + 1)
        ax.scatter(many[:, -1, 0], many[:, -1, 1], s=end_size, color=color, lw=0,
                   zorder=zorder + 1)
    if label:
        ax.plot([], [], color=color, lw=1.0, label=label)
    return coll


def landscape(ax, f, xlim=(-2.5, 2.5), ylim=(-2, 2), n=160, levels=12, filled=True,
              cmap_="light", lines=True, alpha=1.0):
    """A 2D loss landscape as light filled contours (gray by default, so paths in colour stand
    out; low is dark) with thin level lines."""
    X, Y = np.meshgrid(np.linspace(*xlim, n), np.linspace(*ylim, n))
    Z = f(X, Y)
    cm = cmap(cmap_) if isinstance(cmap_, str) else cmap_
    if filled:
        ax.contourf(X, Y, Z, levels=levels, cmap=cm.reversed(), alpha=alpha, zorder=0,
                    antialiased=True)
    if lines:
        ax.contour(X, Y, Z, levels=levels, colors=[style().mid], linewidths=0.35, zorder=1)
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.set_aspect("equal", adjustable="box")
    return X, Y, Z


def field(ax, f, xlim=(-2, 2), ylim=(-2, 2), n=15, kind="quiver", color=None, by_magnitude=False,
          density=0.9, lw=0.6, t=None):
    """A vector field f(x, y) -> (u, v): quiver arrows of equal length (direction only, the
    magnitude in tone when by_magnitude) or streamlines (kind="stream")."""
    X, Y = np.meshgrid(np.linspace(*xlim, n if kind == "quiver" else 60),
                       np.linspace(*ylim, n if kind == "quiver" else 60))
    U, V = f(X, Y) if t is None else f(X, Y, t)
    mag = np.hypot(U, V)
    color = color or style().line
    if kind == "stream":
        kw = dict(color=mag if by_magnitude else color, linewidth=lw, density=density,
                  arrowsize=0.5, arrowstyle="-|>")
        if by_magnitude:
            kw["cmap"] = _truncated(cmap("seq"), 0.35, 1.0)
        out = ax.streamplot(X, Y, U, V, **kw)
    else:
        scale = np.where(mag > 0, mag, 1)
        args = (X, Y, U / scale, V / scale) + ((mag,) if by_magnitude else ())
        out = ax.quiver(*args, color=None if by_magnitude else color,
                        cmap=_truncated(cmap("seq"), 0.35, 1.0) if by_magnitude else None,
                        angles="xy",
                        pivot="mid", scale_units="xy",
                        scale=1.6 / ((xlim[1] - xlim[0]) / n), width=0.004, headwidth=3.5,
                        headlength=3.5, headaxislength=3.2)
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.set_aspect("equal", adjustable="box")
    return out


def _truncated(cm, lo, hi):
    return mcolors.LinearSegmentedColormap.from_list(cm.name + "-cut", cm(np.linspace(lo, hi, 128)))


# ---------------------------------------------------------------- generation teasers

def sampling_1d(ax, paths_, times, density=None, snapshots=(0.0, 1.0), color=None, lw=0.5,
                width=0.12, ends=("noise", "data"), fill=True, alpha=(0.18, 0.55)):
    """The score-SDE teaser: 1D samples moving along t (x axis) with the density drawn as a
    profile at each snapshot time. paths_ (n, T) values over times; density(y, t) -> p."""
    paths_ = np.asarray(paths_, dtype=float)
    times = np.asarray(times, dtype=float)
    color = color or style().accent["solid"]
    lo, hi = np.percentile(paths_, [0.5, 99.5])
    pad = 0.12 * (hi - lo)
    ys = np.linspace(lo - pad, hi + pad, 300)
    fades = np.linspace(alpha[0], alpha[1], len(times) - 1)
    pieces, colours = [], []
    for p_ in paths_:
        runs_, picked = _runs(np.stack([times, p_], 1), fades, 10)
        pieces.extend(runs_)
        colours.extend(mcolors.to_rgba(color, a_) for a_ in picked)
    ax.add_collection(LineCollection(pieces, colors=colours, linewidths=lw, zorder=2,
                                     joinstyle="round"))
    span = times[-1] - times[0]
    if density is not None:
        for s in snapshots:
            dens = np.asarray(density(ys, s), dtype=float)
            dens = dens / dens.max() * width * span
            first, last = s <= times[0] + 1e-9, s >= times[-1] - 1e-9
            edge = s - dens if last else s + dens if first else s - dens / 2
            tone = style().block if first else style().accent["fill"]
            ink = style().line if first else style().accent["ink"]
            if fill:
                ax.fill_betweenx(ys, s, edge, color=tone, lw=0, zorder=1, alpha=0.9)
            ax.plot(edge, ys, color=ink, lw=0.8, zorder=3)
            ax.axvline(s, color=style().mid, lw=0.5, zorder=0)
    ax.set_xlim(times[0] - 0.01 * span, times[-1] + 0.01 * span)
    ax.set_ylim(ys[0], ys[-1])
    ax.set_yticks([])
    ax.spines["left"].set_visible(False)
    ax.spines["bottom"].set_visible(False)
    ticks = list(snapshots)
    names = ["$t=%g$" % s for s in ticks]
    if ends:
        for k, s in enumerate(ticks):
            if abs(s - times[0]) < 1e-9 and ends[0]:
                names[k] += "\n" + ends[0]
            elif abs(s - times[-1]) < 1e-9 and ends[1]:
                names[k] += "\n" + ends[1]
    ax.set_xticks(ticks)
    ax.set_xticklabels(names)
    ax.tick_params(axis="x", length=0)
    return ax


def flow_strip(ax, paths_, times, snapshots=(0, 0.25, 0.5, 0.75, 1), color=None, n_paths=30,
               gap=0.35, points=500, lw=0.5, frame=True, labels=True, ends=("noise", "data"),
               masses=(0.5, 0.85), seed=0, exact=None):
    """Noise to data in one panel: the samples at a few times as tiles in a row (density
    contours and dots, gray at t=0 turning into the accent at t=1), joined by the paths of
    n_paths samples. paths_ (n, T, 2) over times. exact(xy, t) -> p draws each tile's
    contours from the exact density (ap.toy.bridge_density) instead of a KDE of the samples, so
    an ODE and an SDE strip show the same marginals."""
    paths_ = np.asarray(paths_, dtype=float)
    times = np.asarray(times, dtype=float)
    color = color or style().accent["solid"]
    R = float(np.percentile(np.abs(paths_), 99.5)) * 1.12
    W = 2 * R
    centres = np.arange(len(snapshots)) * W * (1 + gap)
    offset = lambda t: np.interp(t, snapshots, centres)  # noqa: E731
    pick = toy.rng(seed).choice(len(paths_), min(n_paths, len(paths_)), replace=False)
    fades = np.linspace(0.12, 0.5, len(times) - 1)
    seg, colours = [], []
    for p_ in paths_[pick]:
        runs_, picked = _runs(np.stack([p_[:, 0] + offset(times), p_[:, 1]], 1), fades, 12)
        seg.extend(runs_)
        colours.extend(mcolors.to_rgba(color, a_) for a_ in picked)
    ax.add_collection(LineCollection(seg, colors=colours, linewidths=lw, zorder=3,
                                     capstyle="round", joinstyle="round"))
    from matplotlib.patches import Rectangle
    last = max(snapshots[-1], 1e-9)
    for k, s in enumerate(snapshots):
        i = int(np.argmin(np.abs(times - s)))
        pts = paths_[:, i]
        tone = alpha_mix(color, s / last, over=style().muted)
        c = centres[k]
        if frame:
            ax.add_patch(Rectangle((c - R, -R), W, W, facecolor="white", edgecolor=style().strong,
                                   lw=0.5, zorder=0))
        if exact is not None:
            GX, GY = np.meshgrid(np.linspace(-R, R, 90), np.linspace(-R, R, 90))
            grid = (GX, GY, np.asarray(exact(np.stack([GX.ravel(), GY.ravel()], 1), s),
                                       dtype=float).reshape(GX.shape))
        else:
            grid = kde2d(pts, xlim=(-R, R), ylim=(-R, R), n=90)
        density(ax, grid=(grid[0] + c, grid[1], grid[2]), color=tone, masses=masses,
                lw=0.5, tones=(0.12, 0.3))
        show = pts[toy.rng(seed + k).choice(len(pts), min(points, len(pts)), replace=False)]
        show = show[(np.abs(show) < R * 0.98).all(1)]
        ax.scatter(show[:, 0] + c, show[:, 1], s=0.8, color=tone, lw=0, zorder=4, alpha=0.8)
        if labels:
            word = ends[0] if k == 0 and ends else ends[1] if k == len(snapshots) - 1 and ends else ""
            ax.text(c, -R * 1.06, "$t=%g$" % s + (" " + word if word else ""), ha="center",
                    va="top", fontsize=STYLE_DATA["fonts"]["small"], color=style().ink)
    ax.set_xlim(centres[0] - R * 1.02, centres[-1] + R * 1.02)
    ax.set_ylim(-R * 1.3, R * 1.02)
    ax.set_aspect("equal", adjustable="box")
    no_ticks(ax)
    return ax
`
