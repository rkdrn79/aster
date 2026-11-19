// aster_plot.py, 4D: a 4th channel, 3D over time, slices and projections. Python kept as a string: orcad ships the harness as one bundled
// .mjs file, so a .py beside it would not reach a GPU server. Joined by research-figures-plot-lib.
export const PLOT_PY_HYPER = String.raw`
# ---------------------------------------------------------------- 4D: a 4th channel, time, slices, projections

def colorbar(mappable, ax, label=None, ticks=3, where="right", shrink=0.7, fmt=None):
    """A compact colour bar for print: thin, 3 ticks, 7 pt, no frame; where="right" or
    "bottom". ax may be one axes or a list (one bar shared by a grid)."""
    from matplotlib.ticker import MaxNLocator
    fig = (ax[0] if isinstance(ax, (list, tuple)) else ax).figure
    horizontal = where == "bottom"
    bar = fig.colorbar(mappable, ax=ax, orientation="horizontal" if horizontal else "vertical",
                       shrink=shrink, aspect=22 if horizontal else 16, pad=0.02, fraction=0.05)
    if getattr(bar, "solids", None) is not None:
        bar.solids.set_alpha(1.0)
    bar.ax._aster_colorbar = True
    bar.outline.set_linewidth(0.4)
    bar.outline.set_edgecolor(style().line)
    axis = bar.ax.xaxis if horizontal else bar.ax.yaxis
    axis.set_major_locator(MaxNLocator(ticks))
    if fmt:
        bar.formatter = matplotlib.ticker.FormatStrFormatter(fmt)
        bar.update_ticks()
    bar.ax.tick_params(labelsize=STYLE_DATA["fonts"]["small"], length=1.8, width=0.5)
    if label:
        bar.set_label(label, fontsize=STYLE_DATA["fonts"]["small"], labelpad=2)
    return bar


def _norm(values, vmin=None, vmax=None):
    values = np.asarray(values, dtype=float)
    lo = np.nanmin(values) if vmin is None else vmin
    hi = np.nanmax(values) if vmax is None else vmax
    return mcolors.Normalize(lo, hi if hi > lo else lo + 1)


def cloud4d(ax, xyz, values, size_by=None, sizes=(2, 16), cmap_="viridis", label=None,
            size_label=None, bar=True, alpha=0.9, vmin=None, vmax=None):
    """A 3D point cloud whose colour is a 4th variable (a perceptual map and a compact colour
    bar); size_by adds a 5th as marker area (sizes in pt², a two-entry size key)."""
    xyz = np.asarray(xyz, dtype=float)
    cm = cmap(cmap_) if isinstance(cmap_, str) else cmap_
    norm = _norm(values, vmin, vmax)
    area = sizes[0]
    if size_by is not None:
        s = np.asarray(size_by, dtype=float)
        area = sizes[0] + (sizes[1] - sizes[0]) * (s - s.min()) / ((s.max() - s.min()) or 1)
    sc = ax.scatter(xyz[:, 0], xyz[:, 1], xyz[:, 2], c=values, cmap=cm, norm=norm, s=area, lw=0,
                    alpha=alpha, depthshade=False)
    equal3d(ax, xyz[:, 0], xyz[:, 1], xyz[:, 2])
    if bar:
        colorbar(sc, ax, label=label)
    if size_by is not None and size_label:
        s = np.asarray(size_by, dtype=float)
        keys = [Line2D([], [], ls="none", marker="o", ms=math.sqrt(a), color=style().mid,
                       label="%s %.2g" % (size_label, v))
                for a, v in ((sizes[0], s.min()), (sizes[1], s.max()))]
        ax.legend(handles=keys, loc="upper left", frameon=False, handletextpad=0.2,
                  borderaxespad=0.0)
    return sc


def surface4d(ax, X, Y, Z, C, cmap_="viridis", label=None, bar=True, wire=6, vmin=None,
              vmax=None):
    """A surface z = f(x, y) coloured by a 4th field C(x, y) (an uncertainty, a gradient norm),
    softly lit so its shape still reads, with a compact colour bar for C."""
    cm = cmap(cmap_) if isinstance(cmap_, str) else cmap_
    norm = _norm(C, vmin, vmax)
    faces = cm(norm(np.asarray(C, dtype=float)))
    from matplotlib.colors import LightSource
    shade_ = LightSource(azdeg=315, altdeg=50).hillshade(np.asarray(Z, dtype=float),
                                                         vert_exag=0.4)
    faces[..., :3] = faces[..., :3] * (0.75 + 0.25 * shade_[..., None])
    surf = ax.plot_surface(X, Y, Z, facecolors=faces, rstride=1, cstride=1, linewidth=0,
                           antialiased=True, shade=False, rasterized=True, zorder=1)
    if wire:
        ax.plot_wireframe(X, Y, Z, rstride=wire, cstride=wire, color="#ffffff", lw=0.25,
                          alpha=0.6, zorder=2)
    if bar:
        mappable = matplotlib.cm.ScalarMappable(norm=norm, cmap=cm)
        mappable.set_array([])
        colorbar(mappable, ax, label=label)
    return surf


def snapshots3d(axes, frames, times, values=None, cmap_="seq", s=2.2, view=None, label="t",
                color=None, fmt="%g", box=True):
    """Small multiples along t: one 3D cell per frame (each (n, 3)), one view angle and one set
    of axis limits for all, titled t = ... . values (per frame) colour the points."""
    allp = np.concatenate([np.asarray(f, dtype=float) for f in frames])
    lo, hi = np.percentile(allp, 1, axis=0), np.percentile(allp, 99, axis=0)
    pad = 0.05 * (hi - lo)
    cm = _truncated(cmap(cmap_), 0.3, 1.0) if isinstance(cmap_, str) else cmap_
    norm = _norm(np.concatenate(values)) if values is not None else None
    for k, (ax, f, t) in enumerate(zip(axes, frames, times)):
        f = np.asarray(f, dtype=float)
        # Why: 3D axes do not clip, and a stray point outside the shared box reads as data.
        inside = np.all((f >= lo - pad) & (f <= hi + pad), axis=1)
        f = f[inside]
        if values is not None:
            ax.scatter(f[:, 0], f[:, 1], f[:, 2], c=np.asarray(values[k])[inside], cmap=cm,
                       norm=norm, s=s, lw=0, depthshade=False)
        else:
            ax.scatter(f[:, 0], f[:, 1], f[:, 2], color=color or style().accent["solid"], s=s,
                       lw=0, depthshade=False)
        ax.set_xlim(lo[0] - pad[0], hi[0] + pad[0])
        ax.set_ylim(lo[1] - pad[1], hi[1] + pad[1])
        ax.set_zlim(lo[2] - pad[2], hi[2] + pad[2])
        if view is not None:
            ax.view_init(*view)
        try:
            ax.set_box_aspect(tuple(hi - lo + 2 * pad), zoom=1.25)
        except TypeError:
            ax.set_box_aspect(tuple(hi - lo + 2 * pad))
        if box:
            _box3d(ax, lo - pad, hi + pad)
        ax.set_title(("$%s=" + fmt + "$") % (label, t), loc="center",
                     fontsize=STYLE_DATA["fonts"]["label"], pad=0)
        ax.title._aster_label = True
    return axes


def _box3d(ax, lo, hi):
    """The limits as a light wire box, so snapshots read as one space."""
    corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1])
                        for z in (lo[2], hi[2])])
    for i in range(8):
        for j in range(i + 1, 8):
            if np.sum(corners[i] != corners[j]) == 1:
                ax.plot(*zip(corners[i], corners[j]), color=style().strong, lw=0.4, zorder=0)


def trajectories3d(ax, paths_, times=None, cmap_="viridis", lw=0.8, label="t", bar=True,
                   ends=True, alpha=0.9):
    """3D trajectories (array (n, T, 3)) coloured by time along a perceptual map, with a time
    colour bar; start (open) and end (filled) dots."""
    from mpl_toolkits.mplot3d.art3d import Line3DCollection
    paths_ = np.asarray(paths_, dtype=float)
    if paths_.ndim == 2:
        paths_ = paths_[None]
    T = paths_.shape[1]
    times = np.linspace(0, 1, T) if times is None else np.asarray(times, dtype=float)
    cm = cmap(cmap_) if isinstance(cmap_, str) else cmap_
    norm = mcolors.Normalize(times[0], times[-1])
    seg = np.concatenate([np.stack([p_[:-1], p_[1:]], 1) for p_ in paths_])
    coll = Line3DCollection(seg, cmap=cm, norm=norm, linewidths=lw, alpha=alpha)
    coll.set_array(np.tile(0.5 * (times[:-1] + times[1:]), len(paths_)))
    ax.add_collection3d(coll)
    flat = paths_.reshape(-1, 3)
    ax.set_xlim(flat[:, 0].min(), flat[:, 0].max())
    ax.set_ylim(flat[:, 1].min(), flat[:, 1].max())
    ax.set_zlim(flat[:, 2].min(), flat[:, 2].max())
    equal3d(ax, flat[:, 0], flat[:, 1], flat[:, 2])
    if ends:
        ax.scatter(*paths_[:, 0].T, s=6, color="white", edgecolors=style().ink, linewidths=0.4,
                   depthshade=False, zorder=5)
        ax.scatter(*paths_[:, -1].T, s=7, color=cm(1.0), edgecolors="white", linewidths=0.3,
                   depthshade=False, zorder=5)
    if bar:
        colorbar(coll, ax, label="$%s$" % label if len(label) == 1 else label)
    return coll


def trails(ax, positions, length=10, color=None, lw=1.1, size=7, fade=(0.08, 0.85), head=True):
    """Motion trails: points at their last position with a fading history of the previous
    length frames behind them. positions (T, n, 2) on a 2D axes or (T, n, 3) on a 3D one."""
    positions = np.asarray(positions, dtype=float)
    color = color or style().accent["solid"]
    T, n, d = positions.shape
    start = max(0, T - 1 - length)
    hist = positions[start:]
    alphas = np.linspace(fade[0], fade[1], len(hist) - 1)
    rgba = np.tile(np.array([mcolors.to_rgba(color, a_) for a_ in alphas]), (n, 1))
    widths = np.tile(np.linspace(lw * 0.3, lw, len(hist) - 1), n)
    seg = np.concatenate([np.stack([hist[:-1, i], hist[1:, i]], 1) for i in range(n)])
    if d == 3:
        from mpl_toolkits.mplot3d.art3d import Line3DCollection
        coll = Line3DCollection(seg, colors=rgba, linewidths=widths, capstyle="round")
        ax.add_collection3d(coll)
        if head:
            ax.scatter(*positions[-1].T, s=size, color=color, edgecolors="white", linewidths=0.3,
                       depthshade=False, zorder=5)
    else:
        coll = LineCollection(seg, colors=rgba, linewidths=widths, capstyle="round", zorder=2)
        ax.add_collection(coll)
        ax.update_datalim(hist.reshape(-1, 2))
        ax.autoscale_view()
        if head:
            ax.scatter(positions[-1, :, 0], positions[-1, :, 1], s=size, color=color,
                       edgecolors="white", linewidths=0.3, zorder=3)
    return coll


def slices(axes, field, rows, cols, row_label="z", col_label="t", cmap_="viridis", label=None,
           extent=None, fmt="%g", bar=True):
    """A grid of 2D slices through a 3D or 4D field: field[r][c] is the image for row value
    rows[r] (a z-slice) and column value cols[c] (a time). One colour scale for all, one
    compact colour bar, rows and columns named on the outer cells only. axes: the grid's axes
    in row-major order."""
    field = np.asarray(field, dtype=float)
    cm = cmap(cmap_) if isinstance(cmap_, str) else cmap_
    norm = _norm(field)
    axes = list(axes)
    image = None
    for r in range(len(rows)):
        for c in range(len(cols)):
            ax = axes[r * len(cols) + c]
            image = ax.imshow(field[r, c], cmap=cm, norm=norm, origin="lower", extent=extent,
                              interpolation="bilinear", aspect="equal")
            ax.set_xticks([])
            ax.set_yticks([])
            for side in ax.spines.values():
                side.set_visible(True)
                side.set_linewidth(0.4)
                side.set_color(style().strong)
            if r == 0:
                ax.set_title(("$%s=" + fmt + "$") % (col_label, cols[c]), loc="center",
                             fontsize=STYLE_DATA["fonts"]["small"], pad=2)
                ax.title._aster_label = True
            if c == 0:
                ax.set_ylabel(("$%s=" + fmt + "$") % (row_label, rows[r]),
                              fontsize=STYLE_DATA["fonts"]["small"], labelpad=2)
    if bar and image is not None:
        colorbar(image, axes, label=label, shrink=0.8)
    return image


def project(X, dims=2):
    """PCA of the rows of X (centred): (coordinates (n, dims), explained variance ratios)."""
    X = np.asarray(X, dtype=float)
    Xc = X - X.mean(0)
    _, svals, vt = np.linalg.svd(Xc, full_matrices=False)
    ratio = svals ** 2 / max(float((svals ** 2).sum()), 1e-12)
    return Xc @ vt[:dims].T, ratio[:dims]


def embedding(ax, X, labels=None, values=None, names=None, ours=None, cmap_="viridis",
              label=None, s=3.0, alpha=0.75, axis_names=True):
    """A 2D embedding: X already 2D (t-SNE, UMAP) or projected here by PCA. Colour by a class
    label (gray classes, ours in the accent, else distinct hues) or by a value such as time
    (perceptual map and colour bar). Axis names say what the axes are (PC1 (41%))."""
    X = np.asarray(X, dtype=float)
    ratio = None
    if X.shape[1] > 2:
        X, ratio = project(X, 2)
    out = None
    if values is not None:
        cm = cmap(cmap_) if isinstance(cmap_, str) else cmap_
        out = ax.scatter(X[:, 0], X[:, 1], c=values, cmap=cm, s=s, lw=0, alpha=alpha)
        colorbar(out, ax, label=label)
    else:
        labels = np.zeros(len(X), dtype=int) if labels is None else np.asarray(labels)
        keys = list(dict.fromkeys(labels.tolist()))
        if isinstance(ours, str) and names:
            ours = names.index(ours)
        colors = series(len(keys), ours=ours, hues=ours is None)
        for i, key in enumerate(keys):
            sel = labels == key
            out = ax.scatter(X[sel, 0], X[sel, 1], s=s, lw=0, alpha=alpha, color=colors[i],
                             label=(names[i] if names else str(key)), zorder=3 if i == ours else 2)
    ax.set_xticks([])
    ax.set_yticks([])
    if axis_names:
        if ratio is not None:
            ax.set_xlabel("PC1 (%.0f%%)" % (100 * ratio[0]))
            ax.set_ylabel("PC2 (%.0f%%)" % (100 * ratio[1]))
        elif axis_names is True:
            ax.set_xlabel("dim 1")
            ax.set_ylabel("dim 2")
    return out


def _compact(value):
    a = abs(value)
    if a and (a < 0.01 or a >= 1e5):
        mantissa, exponent = ("%.0e" % value).split("e")
        return "%se%d" % (mantissa, int(exponent))
    return "%.3g" % value


def parallel(ax, data, names, groups=None, values=None, ours=None, group_names=None,
             cmap_="viridis", label=None, alpha=0.45, lw=0.6, log=(), fmt=None):
    """Parallel coordinates: one vertical axis per dimension (each scaled to its own range, the
    range printed at its ends; log lists dimensions on a log scale), one line per row, coloured
    by group (ours in the accent and drawn last) or by a value (perceptual map, colour bar,
    the best drawn on top)."""
    raw = np.asarray(data, dtype=float)
    data = raw.copy()
    for name in log:
        j = list(names).index(name)
        data[:, j] = np.log10(data[:, j])
    k = data.shape[1]
    lo, hi = data.min(0), data.max(0)
    scaled = (data - lo) / np.where(hi - lo == 0, 1, hi - lo)
    xs = np.arange(k)
    if values is not None:
        cm = cmap(cmap_) if isinstance(cmap_, str) else cmap_
        norm = _norm(values)
        order = np.argsort(values)
        segs = [np.stack([xs, scaled[i]], 1) for i in order]
        coll = LineCollection(segs, cmap=cm, norm=norm, linewidths=lw, alpha=alpha + 0.2)
        coll.set_array(np.asarray(values, dtype=float)[order])
        ax.add_collection(coll)
        colorbar(coll, ax, label=label)
    else:
        groups = np.zeros(len(data), dtype=int) if groups is None else np.asarray(groups)
        keys = list(dict.fromkeys(groups.tolist()))
        colors = series(len(keys), ours=ours)
        order = [i for i in range(len(keys)) if i != ours] + ([ours] if ours is not None else [])
        for i in order:
            sel = groups == keys[i]
            is_ours = i == ours
            segs = [np.stack([xs, row], 1) for row in scaled[sel]]
            ax.add_collection(LineCollection(segs, colors=colors[i], linewidths=lw * (1.4 if is_ours else 1),
                                             alpha=0.9 if is_ours else alpha, zorder=3 if is_ours else 2))
            ax.plot([], [], color=colors[i], lw=1.2,
                    label=group_names[i] if group_names else str(keys[i]))
    show = (lambda v: fmt % v) if fmt else _compact
    for x in xs:
        ax.axvline(x, color=style().line, lw=0.6, zorder=1)
        top, bottom = raw[:, x].max(), raw[:, x].min()
        ax.annotate(show(top), xy=(x, 1), xytext=(0, 2), textcoords="offset points",
                    ha="center", va="bottom", fontsize=STYLE_DATA["fonts"]["small"],
                    color=style().muted_text)
        ax.annotate(show(bottom), xy=(x, 0), xytext=(0, -2), textcoords="offset points",
                    ha="center", va="top", fontsize=STYLE_DATA["fonts"]["small"],
                    color=style().muted_text)
    title = ax.get_title("left")
    if title:
        ax.set_title(title, loc="left", pad=4 + STYLE_DATA["fonts"]["small"] * 1.4)
    ax.set_xlim(-0.15, k - 0.85)
    ax.set_ylim(-0.02, 1.02)
    ax.set_xticks(xs)
    ax.set_xticklabels(names)
    ax.tick_params(axis="x", length=0, pad=11)
    ax.set_yticks([])
    for side in ("left", "bottom"):
        ax.spines[side].set_visible(False)
    return ax
`
