// aster_plot.py, 3D surfaces, clouds, manifolds and spheres. Python kept as a string: orcad ships the harness as one bundled
// .mjs file, so a .py beside it would not reach a GPU server. Joined by research-figures-plot-lib.
export const PLOT_PY_SPACE = String.raw`
# ---------------------------------------------------------------- 3D

def clean3d(ax, view=(20, 50), aspect=(1, 1, 0.5), ticks=False, labels=None, zoom=1.3,
            fit=False):
    """A quiet 3D axes: no panes, no grid, transparent axis lines, no ticks (or a few),
    box aspect [1, 1, 0.5], seen from (elev 20, azim 50). labels=("x", "y", "z") names the axes:
    without ticks along the box's front edges, kept on the page. fit=True zooms the box to fill
    the cell when saved."""
    ax._aster_fit = fit or getattr(ax, "_aster_fit", False)
    for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
        try:
            axis.set_pane_color((1, 1, 1, 0))
        except AttributeError:
            axis.pane.set_facecolor((1, 1, 1, 0))
        axis.pane.set_edgecolor((1, 1, 1, 0))
        axis.line.set_color((1, 1, 1, 0))
        if not ticks:
            axis.set_ticklabels([])
            try:
                axis._axinfo["tick"]["inward_factor"] = 0
                axis._axinfo["tick"]["outward_factor"] = 0
            except Exception:
                pass
    ax.grid(False)
    if not ticks:
        ax.set_xticks([])
        ax.set_yticks([])
        ax.set_zticks([])
    else:
        for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
            axis.set_major_locator(matplotlib.ticker.MaxNLocator(3))
            axis.line.set_color(style().mid)
    ax.view_init(*view)
    ax._aster_aspect, ax._aster_zoom = tuple(aspect), zoom
    try:
        ax.set_box_aspect(aspect, zoom=zoom)
    except TypeError:
        ax.set_box_aspect(aspect)
    except AttributeError:
        pass
    ax.set_facecolor((1, 1, 1, 0))
    try:
        ax.computed_zorder = False
    except Exception:
        pass
    if labels and not ticks:
        ax._aster_names3d = tuple(labels)
        _place3d(ax)
    elif labels:
        for setter, text in zip((ax.set_xlabel, ax.set_ylabel, ax.set_zlabel), labels):
            if text:
                setter(text, labelpad=0)
    return ax


def _view_dir(ax):
    elev, azim = math.radians(ax.elev), math.radians(ax.azim)
    return np.array([math.cos(elev) * math.cos(azim), math.cos(elev) * math.sin(azim),
                     math.sin(elev)])


def _shade(Z, cm, X=None, Y=None):
    from matplotlib.colors import LightSource
    light = LightSource(azdeg=315, altdeg=50)
    span = float(np.ptp(Z)) or 1.0
    dx = float(np.ptp(X)) / max(1, Z.shape[1] - 1) if X is not None else 1.0
    return light.shade(Z, cmap=cm, vert_exag=0.35 * dx * Z.shape[1] / span, blend_mode="soft",
                       vmin=float(Z.min()), vmax=float(Z.max()))


def surface(ax, X, Y, Z, cmap_="surface", path=None, f=None, floor=False, levels=10, shade=True,
            wire=5, path_color=None, alpha=1.0, end_marker=True, paths=None, ours=None,
            styles=None, hidden="dashed", contours=0):
    """A loss landscape or any z = f(x, y) on a regular grid: softly lit faces (light grays,
    low darker, so paths in the accent stand out; cmap_="soft" tints them), contours= level
    lines on the surface, faint ones on the floor (floor=True), and paths on it: path (one) or
    paths (a dict name -> (N, 2) with f, or (N, 3); a list for unnamed ones), ours (a name) in
    the accent and the rest gray with dashes, styles a dict name -> path3d options. A path's
    stretches the surface hides are dashed (hidden="dashed"), faint or omitted, recomputed when
    the view changes; ap.view3d(ax) picks a view that shows them. The faces are rasterized
    (vector faces leave seams in PDF viewers); the check notes it."""
    cm = cmap(cmap_) if isinstance(cmap_, str) else cmap_
    span = float(np.ptp(Z)) or 1.0
    base = float(Z.min()) - 0.25 * span
    if floor:
        ax.contour(X, Y, Z, zdir="z", offset=base, levels=levels, colors=[style().mid],
                   linewidths=0.35, zorder=0)
    if shade:
        faces = _shade(Z, cm, X, Y)
        faces[..., 3] = alpha
    else:
        faces = cm((Z - Z.min()) / span)
    surf = ax.plot_surface(X, Y, Z, facecolors=faces, rstride=1, cstride=1, linewidth=0,
                           antialiased=True, shade=False, zorder=1, rasterized=True)
    if wire:
        surface_lines(ax, X, Y, Z, wire=wire, color="#ffffff", lw=0.3, alpha=0.7)
    if contours:
        surface_lines(ax, X, Y, Z, contours=contours)
    named = paths if isinstance(paths, dict) else dict(
        ("_path%d" % i, p_) for i, p_ in enumerate(paths or []))
    if path is not None:
        named = dict(named, _path=path)
    names = list(named)
    ours = ours if ours in names else (names[-1] if len(names) == 1 or path is not None else None)
    others = [n for n in names if n != ours]
    for k, name in enumerate(others + ([ours] if ours else [])):
        xyz = np.asarray(named[name], dtype=float)
        if xyz.shape[1] == 2:
            xyz = np.column_stack([xyz, f(xyz[:, 0], xyz[:, 1])])
        xyz = np.column_stack([xyz[:, :2], xyz[:, 2] + 0.015 * span])
        is_ours = name == ours
        look = dict(color=path_color or style().accent["ink"] if is_ours else
                    style().grays(len(others))[k % max(1, len(others))],
                    lw=1.4 if is_ours else 1.0, ls="-" if is_ours else _DASHES3D[k % len(_DASHES3D)],
                    label=None if name.startswith("_") else name, end=end_marker or not is_ours)
        look.update((styles or {}).get(name, {}))
        if floor:
            ax.plot(xyz[:, 0], xyz[:, 1], np.full(len(xyz), base), color=look["color"], lw=0.6,
                    ls=(0, (2, 1.5)), zorder=3, alpha=0.8)
        path3d(ax, xyz, X, Y, Z, hidden=hidden, zorder=5 + k, **look)
    ax.set_zlim(base if floor else float(Z.min()), float(Z.max()))
    ax._aster_fit = True
    return surf


def cloud(ax, xyz, values=None, color=None, cmap_="seq", s=2.0, depth=True, alpha=0.9,
          label=None, equal=True):
    """A 3D point cloud, coloured by values along a perceptual map or in one colour; nearer
    points stay darker (depth cue)."""
    xyz = np.asarray(xyz, dtype=float)
    kw = dict(s=s, lw=0, depthshade=depth, alpha=alpha, label=label)
    if equal:
        equal3d(ax, xyz[:, 0], xyz[:, 1], xyz[:, 2])
    if values is not None:
        cm = _truncated(cmap(cmap_), 0.3, 1.0) if isinstance(cmap_, str) else cmap_
        return ax.scatter(xyz[:, 0], xyz[:, 1], xyz[:, 2], c=values, cmap=cm, **kw)
    return ax.scatter(xyz[:, 0], xyz[:, 1], xyz[:, 2], color=color or style().accent["solid"], **kw)


def swiss_roll_surface(ax, n=(60, 14), cmap_="soft", points=None, values=None, edge=True):
    """The Swiss roll as a lit sheet coloured along the roll, optionally with samples on it."""
    t = np.linspace(1.5 * np.pi, 4.5 * np.pi, n[0])
    h = np.linspace(0, 21, n[1])
    T, H = np.meshgrid(t, h)
    X, Y, Z = T * np.cos(T) / 10, H / 10, T * np.sin(T) / 10
    cm = cmap(cmap_) if isinstance(cmap_, str) else cmap_
    faces = cm((T - t.min()) / np.ptp(t) * 0.6 + 0.3)
    light = np.clip(0.88 + 0.12 * np.cos(T + 0.6), 0, 1)[..., None]
    faces[..., :3] = faces[..., :3] * light + (1 - light) * 0.3
    surf = ax.plot_surface(X, Y, Z, facecolors=faces, rstride=1, cstride=1, linewidth=0,
                           antialiased=True, shade=False, zorder=1, rasterized=True)
    if edge:
        for row in (0, -1):
            ax.plot(X[row], Y[row], Z[row], color=style().line, lw=0.5, zorder=2)
    if points is not None:
        cloud(ax, points, values=values, s=1.5, depth=False)
    equal3d(ax, X, Y, Z)
    return surf


def equal3d(ax, X, Y, Z, zoom=1.3):
    """Equal data aspect for a shape that must not look squashed (a roll, a sphere)."""
    spans = [float(np.ptp(v)) or 1.0 for v in (X, Y, Z)]
    try:
        ax.set_box_aspect(spans, zoom=zoom)
    except TypeError:
        ax.set_box_aspect(spans)
    return ax


def geodesic(p, q, n=64):
    """Points on the great circle from p to q (unit sphere, spherical interpolation)."""
    p = np.asarray(p, dtype=float) / np.linalg.norm(p)
    q = np.asarray(q, dtype=float) / np.linalg.norm(q)
    omega = math.acos(float(np.clip(np.dot(p, q), -1, 1)))
    if omega < 1e-9:
        return np.repeat(p[None], n, 0)
    t = np.linspace(0, 1, n)[:, None]
    return (np.sin((1 - t) * omega) * p + np.sin(t * omega) * q) / math.sin(omega)


def sphere(ax, color=None, geodesics=(), points=None, n=64, grid=6, light=(-0.35, -0.55, 0.75),
           geodesic_colors=None, lw=1.2, labels=None):
    """A lit unit sphere (Lambert shading done by hand), faint meridians, and great-circle
    paths: their near side solid, the far side dashed. geodesics: [(p, q), ...]."""
    u, v = np.meshgrid(np.linspace(0, 2 * np.pi, n), np.linspace(0, np.pi, n // 2))
    X, Y, Z = np.cos(u) * np.sin(v), np.sin(u) * np.sin(v), np.cos(v)
    lvec = np.asarray(light, dtype=float)
    lvec /= np.linalg.norm(lvec)
    lam = np.clip(X * lvec[0] + Y * lvec[1] + Z * lvec[2], 0, 1)
    base = _hex_rgb(color or style().block)
    shade_ = (0.8 + 0.2 * lam)[..., None]
    rgb = np.clip(base * shade_ + 0.06 * lam[..., None] ** 8, 0, 1)
    faces = np.concatenate([rgb, np.ones(rgb.shape[:2] + (1,))], -1)
    surf = ax.plot_surface(X, Y, Z, facecolors=faces, rstride=1, cstride=1, linewidth=0,
                           antialiased=True, shade=False, zorder=1, rasterized=True)
    eye = _view_dir(ax)
    if grid:
        for k in range(grid):
            a = np.pi * k / grid
            ring = np.stack([np.cos(a) * np.sin(np.linspace(0, 2 * np.pi, 120)),
                             np.sin(a) * np.sin(np.linspace(0, 2 * np.pi, 120)),
                             np.cos(np.linspace(0, 2 * np.pi, 120))], 1)
            _sphere_line(ax, ring, eye, style().mid, 0.35, 2)
        equator = np.stack([np.cos(np.linspace(0, 2 * np.pi, 120)),
                            np.sin(np.linspace(0, 2 * np.pi, 120)), np.zeros(120)], 1)
        _sphere_line(ax, equator, eye, style().mid, 0.35, 2)
    colors = geodesic_colors or [style().accent["solid"]] + style().grays(len(geodesics))
    for (p_, q_), col in zip(geodesics, colors):
        arc = geodesic(p_, q_) * 1.004
        _sphere_line(ax, arc, eye, col, lw, 4)
        for end, fill in ((arc[0], "white"), (arc[-1], col)):
            if np.dot(end, eye) > 0:
                ax.scatter(*end, s=12, color=fill, edgecolors=col if fill == "white" else "white",
                           linewidths=0.6, depthshade=False, zorder=6)
    if points is not None:
        pts = np.asarray(points, dtype=float)
        front = pts @ eye > 0
        ax.scatter(*pts[front].T, s=4, color=style().ink, lw=0, depthshade=False, zorder=5)
    ax.set_xlim(-1, 1)
    ax.set_ylim(-1, 1)
    ax.set_zlim(-1, 1)
    try:
        ax.set_box_aspect((1, 1, 1), zoom=1.25)
    except Exception:
        pass
    return surf


def _sphere_line(ax, xyz, eye, col, lw, zorder):
    front = xyz @ eye > -0.02
    for mask, ls, a_ in ((front, "-", 1.0), (~front, (0, (1.5, 1.5)), 0.45)):
        if not mask.any():
            continue
        runs = np.split(np.arange(len(xyz)), np.where(np.diff(mask.astype(int)) != 0)[0] + 1)
        for run in runs:
            if mask[run[0]] and len(run) > 1:
                ax.plot(*xyz[run].T, color=col, lw=lw if ls == "-" else lw * 0.7, ls=ls,
                        alpha=a_, zorder=zorder if ls == "-" else 0, solid_capstyle="round")
`
