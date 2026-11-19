// aster_plot.py, 2D and 1D distributions. Python kept as a string: orcad ships the harness as one bundled
// .mjs file, so a .py beside it would not reach a GPU server. Joined by research-figures-plot-lib.
export const PLOT_PY_DISTS = String.raw`
# ---------------------------------------------------------------- densities

def _scott(x):
    x = np.asarray(x, dtype=float)
    n, d = (len(x), 1) if x.ndim == 1 else x.shape
    return n ** (-1.0 / (d + 4))


def kde1d(samples, grid, bw=None):
    """A Gaussian KDE on grid (Scott's rule; scipy when present)."""
    samples = np.asarray(samples, dtype=float)
    grid = np.asarray(grid, dtype=float)
    try:
        from scipy.stats import gaussian_kde
        return gaussian_kde(samples, bw_method=bw)(grid)
    except Exception:
        h = (bw if isinstance(bw, (int, float)) else _scott(samples)) * samples.std(ddof=1)
        h = h or 1.0
        out = np.zeros_like(grid)
        for chunk in np.array_split(samples, max(1, len(samples) // 2000)):
            out += np.exp(-0.5 * ((grid[:, None] - chunk[None]) / h) ** 2).sum(1)
        return out / (len(samples) * h * np.sqrt(2 * np.pi))


def kde2d(xy, xlim=None, ylim=None, n=120, bw=None, pad=0.15):
    """(X, Y, Z): a 2D Gaussian KDE of points on an n × n grid."""
    xy = np.asarray(xy, dtype=float)
    lo, hi = xy.min(0), xy.max(0)
    span = hi - lo
    xlim = xlim or (lo[0] - pad * span[0], hi[0] + pad * span[0])
    ylim = ylim or (lo[1] - pad * span[1], hi[1] + pad * span[1])
    X, Y = np.meshgrid(np.linspace(*xlim, n), np.linspace(*ylim, n))
    grid = np.stack([X.ravel(), Y.ravel()], 1)
    try:
        from scipy.stats import gaussian_kde
        Z = gaussian_kde(xy.T, bw_method=bw)(grid.T)
    except Exception:
        factor = bw if isinstance(bw, (int, float)) else _scott(xy)
        cov = np.cov(xy.T) * factor ** 2
        inv = np.linalg.inv(cov)
        norm = 1.0 / (2 * np.pi * np.sqrt(np.linalg.det(cov)) * len(xy))
        Z = np.zeros(len(grid))
        for chunk in np.array_split(xy, max(1, len(xy) // 500)):
            d = grid[:, None, :] - chunk[None]
            Z += np.exp(-0.5 * np.einsum("gni,ij,gnj->gn", d, inv, d)).sum(1)
        Z *= norm
    return X, Y, Z.reshape(X.shape)


def hdr_levels(Z, masses=(0.5, 0.8, 0.95)):
    """Density thresholds whose regions hold masses of the probability (highest density)."""
    flat = np.sort(np.asarray(Z, dtype=float).ravel())[::-1]
    cum = np.cumsum(flat)
    cum /= cum[-1]
    return sorted(float(flat[min(np.searchsorted(cum, m), len(flat) - 1)]) for m in masses)


def density(ax, xy=None, grid=None, color=None, masses=(0.5, 0.8, 0.95), filled=True,
            lines=True, points=0, label=None, lw=0.7, n=120, xlim=None, ylim=None, seed=0,
            tones=(0.14, 0.42), bw=None):
    """2D density as highest-density contours (the regions holding 50/80/95% of the mass),
    light fills darker inward, a thin outline per level; points overlays that many samples.
    Give samples xy, or a precomputed grid=(X, Y, Z)."""
    color = color or style().accent["solid"]
    X, Y, Z = grid if grid is not None else kde2d(xy, xlim, ylim, n=n, bw=bw)
    levels = hdr_levels(Z, masses)
    top = float(Z.max()) * 1.001
    if filled:
        fills = [alpha_mix(color, a_) for a_ in np.linspace(tones[1], tones[0], len(levels))[::-1]]
        ax.contourf(X, Y, Z, levels=levels + [top], colors=fills, zorder=1)
    if lines:
        inks = [alpha_mix(color, a_) for a_ in np.linspace(1.0, 0.45, len(levels))[::-1]]
        ax.contour(X, Y, Z, levels=levels, colors=inks, linewidths=lw, zorder=2)
    if points and xy is not None:
        xy = np.asarray(xy)
        pick = toy.rng(seed).choice(len(xy), min(points, len(xy)), replace=False)
        ax.scatter(xy[pick, 0], xy[pick, 1], s=1.2, color=style().ink, alpha=0.5, lw=0, zorder=3)
    if label:
        ax.fill_between([], [], [], facecolor=alpha_mix(color, 0.3), edgecolor=color, lw=0.6,
                        label=label)
    return X, Y, Z


def mixture(ax, means, covs=None, weights=None, color=None, stds=(1, 2), centres=True,
            fill=True):
    """A Gaussian mixture as covariance ellipses at 1 and 2 std, line weight by weight."""
    from matplotlib.patches import Ellipse
    means = np.atleast_2d(means)
    k = len(means)
    covs = [np.eye(2) * 0.1] * k if covs is None else (
        [np.eye(2) * c for c in covs] if np.ndim(covs) == 1 else list(covs))
    weights = np.ones(k) / k if weights is None else np.asarray(weights, dtype=float)
    color = color or style().accent["solid"]
    for mu, cov, w in zip(means, covs, weights):
        vals, vecs = np.linalg.eigh(cov)
        angle = math.degrees(math.atan2(vecs[1, -1], vecs[0, -1]))
        for i, s in enumerate(sorted(stds, reverse=True)):
            e = Ellipse(mu, 2 * s * np.sqrt(vals[-1]), 2 * s * np.sqrt(vals[0]), angle=angle,
                        facecolor=alpha_mix(color, (0.08 + 0.14 * i) * (0.5 + 0.5 * w / weights.max()))
                        if fill else "none",
                        edgecolor=color, lw=0.5 if i == 0 else 0.8,
                        zorder=1 + i)
            ax.add_patch(e)
        if centres:
            ax.plot(*mu, marker="+", color=style().ink, ms=4, mew=0.7, zorder=4)
    ax.update_datalim(means)
    ax.autoscale_view()
    return ax


def joint(j, x, y, groups=None, colors=None, labels=None, kind="density", marginal="kde",
          masses=(0.5, 0.8, 0.95), points=0, bins=30):
    """A joint plot in a Joint (panels kinds={"a": "joint"}): densities (or scatter) in the
    main axes, 1D densities (or histograms) on the top and right."""
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    groups = np.zeros(len(x), dtype=int) if groups is None else np.asarray(groups)
    keys = list(dict.fromkeys(groups.tolist()))
    colors = colors or series(len(keys), ours=0, hues=len(keys) > 1)
    for key, col, i in zip(keys, colors, range(len(keys))):
        sel = groups == key
        xy = np.stack([x[sel], y[sel]], 1)
        name = labels[i] if labels else None
        if kind == "scatter":
            j.main.scatter(xy[:, 0], xy[:, 1], s=2.5, color=col, lw=0, alpha=0.7, label=name)
        else:
            density(j.main, xy, color=col, masses=masses, points=points)
            if name:
                j.main.plot([], [], color=col, lw=1.2, label=name)
        for values, ax, vertical in ((x[sel], j.top, False), (y[sel], j.right, True)):
            grid = np.linspace(values.min() - values.std(), values.max() + values.std(), 200)
            if marginal == "hist":
                ax.hist(values, bins=bins, orientation="horizontal" if vertical else "vertical",
                        color=alpha_mix(col, 0.35), edgecolor=col, lw=0.4, histtype="stepfilled")
                continue
            dens = kde1d(values, grid)
            if vertical:
                ax.fill_betweenx(grid, 0, dens, color=alpha_mix(col, 0.25), lw=0)
                ax.plot(dens, grid, color=col, lw=0.8)
            else:
                ax.fill_between(grid, 0, dens, color=alpha_mix(col, 0.25), lw=0)
                ax.plot(grid, dens, color=col, lw=0.8)
    j.top.set_ylim(bottom=0)
    j.right.set_xlim(left=0)
    return j


# ---------------------------------------------------------------- 1D distributions

def _as_list(data):
    if isinstance(data, dict):
        return list(data.keys()), [np.asarray(v, dtype=float) for v in data.values()]
    if isinstance(data, np.ndarray) and data.ndim == 1:
        return [None], [data.astype(float)]
    return [None] * len(data), [np.asarray(v, dtype=float) for v in data]


def densities(ax, data, ours=0, colors=None, fill=True, bw=None, rug=False, grid=None,
              lw=1.1, means=False):
    """1D densities (dict name -> samples): ours in the accent, the rest gray, light fills."""
    names, values = _as_list(data)
    colors = colors or series(len(values), ours=ours)
    allv = np.concatenate(values)
    grid = grid if grid is not None else np.linspace(allv.min() - allv.std() * 0.5,
                                                    allv.max() + allv.std() * 0.5, 400)
    for i, (name, v, col) in enumerate(zip(names, values, colors)):
        dens = kde1d(v, grid, bw)
        if fill:
            ax.fill_between(grid, 0, dens, color=alpha_mix(col, 0.2 if i == ours else 0.12), lw=0,
                            zorder=1 + (i == ours))
        ax.plot(grid, dens, color=col, lw=lw if i == ours else lw * 0.85, label=name,
                zorder=3 + (i == ours))
        if means:
            ax.axvline(v.mean(), color=col, lw=0.6, ls=(0, (2, 1.5)), zorder=2)
        if rug:
            ax.plot(v, np.full_like(v, -0.02 * dens.max()), "|", color=col, ms=3, mew=0.4,
                    alpha=0.6, clip_on=False)
    ax.set_ylim(bottom=0)
    ax.set_xlim(grid[0], grid[-1])
    return ax


def hist(ax, data, bins=30, ours=0, colors=None, density_=True, kind="step"):
    """Histograms with shared bins: outlined steps (kind="step") or light filled bars."""
    names, values = _as_list(data)
    colors = colors or series(len(values), ours=ours)
    edges = np.histogram_bin_edges(np.concatenate(values), bins=bins)
    for i, (name, v, col) in enumerate(zip(names, values, colors)):
        if kind == "step":
            ax.hist(v, bins=edges, density=density_, histtype="stepfilled",
                    color=alpha_mix(col, 0.18), lw=0, zorder=1)
            ax.hist(v, bins=edges, density=density_, histtype="step", color=col,
                    lw=0.9 if i == ours else 0.7, label=name, zorder=2)
        else:
            ax.hist(v, bins=edges, density=density_, color=alpha_mix(col, 0.55), edgecolor="white",
                    lw=0.3, label=name)
    ax.set_ylim(bottom=0)
    return ax


def violin(ax, data, ours=None, colors=None, quartiles=True, points=False, width=0.75, seed=0):
    """Violins (dict name -> samples) with the median and quartiles inside."""
    names, values = _as_list(data)
    colors = colors or series(len(values), ours=ours)
    parts = ax.violinplot(values, positions=range(len(values)), widths=width,
                          showextrema=False, showmedians=False)
    for body, col in zip(parts["bodies"], colors):
        body.set_facecolor(alpha_mix(col, 0.35))
        body.set_edgecolor(col)
        body.set_linewidth(0.6)
        body.set_alpha(1)
    for i, (v, col) in enumerate(zip(values, colors)):
        q1, med, q3 = np.percentile(v, [25, 50, 75])
        if quartiles:
            ax.plot([i, i], [q1, q3], color=style().ink, lw=1.6, solid_capstyle="butt", zorder=3)
            ax.plot(i, med, marker="o", ms=2.6, mfc="white", mec=style().ink, mew=0.6, zorder=4)
        if points:
            jitter = toy.rng(seed + i).uniform(-0.08, 0.08, len(v))
            ax.scatter(i + jitter, v, s=1.0, color=col, lw=0, alpha=0.5, zorder=2)
    _category_ticks(ax, names, ours)
    return parts


def box(ax, data, ours=None, colors=None, points=True, width=0.5, seed=0):
    """Box plots (median, quartiles, 1.5 IQR whiskers) with the raw points jittered beside."""
    names, values = _as_list(data)
    colors = colors or series(len(values), ours=ours)
    out = ax.boxplot(values, positions=range(len(values)), widths=width, patch_artist=True,
                     showfliers=not points, medianprops=dict(color=style().ink, lw=1.0),
                     whiskerprops=dict(color=style().line, lw=0.6),
                     capprops=dict(color=style().line, lw=0.6),
                     flierprops=dict(marker="o", ms=2, mfc="none", mec=style().muted, mew=0.5))
    for patch, col in zip(out["boxes"], colors):
        patch.set_facecolor(alpha_mix(col, 0.3))
        patch.set_edgecolor(col)
        patch.set_linewidth(0.7)
    if points:
        for i, (v, col) in enumerate(zip(values, colors)):
            jitter = toy.rng(seed + i).uniform(-0.06, 0.06, len(v))
            ax.scatter(i + width * 0.5 + 0.12 + jitter, v, s=0.8, color=col, lw=0, alpha=0.35)
    _category_ticks(ax, names, ours)
    return out


def _category_ticks(ax, names, ours):
    if names and names[0] is not None:
        ax.set_xticks(range(len(names)))
        ax.set_xticklabels(names)
        if ours is not None and ours < len(names):
            ax.get_xticklabels()[ours].set_color(style().accent["ink"])
    ax.tick_params(axis="x", length=0)
    ax.set_xlim(-0.6, len(names) - 0.4)


def ecdf(ax, data, ours=0, colors=None, lw=1.1):
    """Empirical CDFs as steps (dict name -> samples)."""
    names, values = _as_list(data)
    colors = colors or series(len(values), ours=ours)
    for i, (name, v, col) in enumerate(zip(names, values, colors)):
        xs = np.sort(v)
        ys = np.arange(1, len(xs) + 1) / len(xs)
        ax.step(np.r_[xs[0], xs], np.r_[0, ys], where="post", color=col,
                lw=lw if i == ours else lw * 0.8, label=name, zorder=3 if i == ours else 2)
    ax.set_ylim(0, 1.02)
    ax.set_yticks([0, 0.5, 1])
    return ax


def ridgeline(ax, data, overlap=0.55, colors=None, ours=None, fill=True, grid=None, lw=0.7,
              label_x=None, bw=None, gradient=True):
    """Stacked densities (dict label -> samples), first at the top, each overlapping the next;
    labels at the left. gradient ramps the accent from light to dark down the stack."""
    names, values = _as_list(data)
    k = len(values)
    if colors is None:
        colors = ramp(k, light=0.35) if gradient else series(k, ours=ours)
    allv = np.concatenate(values)
    grid = grid if grid is not None else np.linspace(np.percentile(allv, 0.5) - allv.std() * 0.3,
                                                    np.percentile(allv, 99.5) + allv.std() * 0.3, 300)
    dens = [kde1d(v, grid, bw) for v in values]
    peak = max(d.max() for d in dens)
    step = 1.0 - overlap
    for i, (name, d, col) in enumerate(zip(names, dens, colors)):
        base = (k - 1 - i) * step
        y = base + d / peak
        if fill:
            ax.fill_between(grid, base, y, color=alpha_mix(col, 0.55 if gradient else 0.3),
                            lw=0, zorder=2 * i + 1)
        ax.plot(grid, y, color=style().ink if gradient else col, lw=lw, zorder=2 * i + 2)
        ax.plot([grid[0], grid[-1]], [base, base], color=style().mid, lw=0.4, zorder=2 * i + 1)
        if name is not None:
            ax.annotate(str(name), xy=(label_x if label_x is not None else grid[0], base),
                        xytext=(-3, 1.5), textcoords="offset points", ha="right", va="bottom",
                        fontsize=STYLE_DATA["fonts"]["small"], color=style().ink,
                        annotation_clip=False)
    ax.set_yticks([])
    ax.spines["left"].set_visible(False)
    ax.set_xlim(grid[0], grid[-1])
    ax.set_ylim(-0.02, (k - 1) * step + 1.02)
    return ax
`
