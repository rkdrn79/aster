// aster_plot.py, paths on a 3D surface that know what the surface hides, labels and marks in 3D,
// the view that shows the paths best, and 3D labels kept on the page. Python kept as a string:
// orcad ships the harness as one bundled .mjs file. Joined by research-figures-plot-lib.
export const PLOT_PY_VIEW3D = String.raw`
# ---------------------------------------------------------------- paths on 3D surfaces

def _proj(M, xyz):
    xyz = np.asarray(xyz, dtype=float).reshape(-1, 3)
    h = np.column_stack([xyz, np.ones(len(xyz))]) @ M.T
    return h[:, :3] / h[:, 3:4]


def _unproj(Minv, uvw):
    uvw = np.asarray(uvw, dtype=float).reshape(-1, 3)
    h = np.column_stack([uvw, np.ones(len(uvw))]) @ Minv.T
    return h[:, :3] / h[:, 3:4]


class _Height(object):
    """A surface z = f(x, y) on a regular grid, looked up by bilinear interpolation."""

    def __init__(self, X, Y, Z):
        self.x = np.asarray(X, dtype=float)[0]
        self.y = np.asarray(Y, dtype=float)[:, 0]
        self.Z = np.asarray(Z, dtype=float)

    def __call__(self, x, y):
        fx = np.interp(x, self.x, np.arange(len(self.x)), left=np.nan, right=np.nan)
        fy = np.interp(y, self.y, np.arange(len(self.y)), left=np.nan, right=np.nan)
        ok = np.isfinite(fx) & np.isfinite(fy)
        out = np.full(np.shape(x), np.nan)
        i0 = np.clip(np.floor(fx[ok]).astype(int), 0, len(self.x) - 2)
        j0 = np.clip(np.floor(fy[ok]).astype(int), 0, len(self.y) - 2)
        tx, ty = fx[ok] - i0, fy[ok] - j0
        Z = self.Z
        out[ok] = ((1 - tx) * (1 - ty) * Z[j0, i0] + tx * (1 - ty) * Z[j0, i0 + 1]
                   + (1 - tx) * ty * Z[j0 + 1, i0] + tx * ty * Z[j0 + 1, i0 + 1])
        return out

    def border(self, n=24):
        """Points along the surface's edge, for its outline on the page."""
        ix = np.linspace(0, len(self.x) - 1, n).astype(int)
        iy = np.linspace(0, len(self.y) - 1, n).astype(int)
        rows = [(i, 0) for i in ix] + [(len(self.x) - 1, j) for j in iy] + \
            [(i, len(self.y) - 1) for i in ix[::-1]] + [(0, j) for j in iy[::-1]]
        return np.array([[self.x[i], self.y[j], self.Z[j, i]] for i, j in rows])

    def corners(self):
        zs = (np.nanmin(self.Z), np.nanmax(self.Z))
        return np.array([[x, y, z] for x in (self.x[0], self.x[-1]) for y in (self.y[0], self.y[-1])
                         for z in zs])


def hidden3d(ax, xyz, X, Y, Z, samples=48):
    """Per point of xyz (N, 3), whether the surface z = Z(X, Y) (a regular grid) hides it from
    the current view: the ray from the point toward the eye passes through the surface."""
    xyz = np.asarray(xyz, dtype=float)
    height = X if isinstance(X, _Height) else _Height(X, Y, Z)
    M = ax.get_proj()
    Minv = np.linalg.inv(M)
    uvw = _proj(M, xyz)
    near = _proj(M, height.corners())[:, 2].min() - 0.05
    steps = np.linspace(0.02, 1.0, samples)
    w = uvw[:, 2:3] + (near - uvw[:, 2:3]) * steps[None]
    rays = np.stack([np.repeat(uvw[:, :1], samples, 1), np.repeat(uvw[:, 1:2], samples, 1), w], -1)
    pts = _unproj(Minv, rays.reshape(-1, 3)).reshape(len(xyz), samples, 3)
    ground = height(pts[..., 0], pts[..., 1])
    tol = 1e-3 * float(np.nanmax(height.Z) - np.nanmin(height.Z) or 1.0)
    side0 = np.sign(xyz[:, 2] - height(xyz[:, 0], xyz[:, 1]) + tol)
    side0 = np.where(np.isfinite(side0) & (side0 != 0), side0, 1.0)
    below = (pts[..., 2] - ground) * side0[:, None] < 0
    return np.any(below & np.isfinite(ground), 1)


def _runs_of(mask):
    edges = np.flatnonzero(np.diff(mask.astype(int))) + 1
    return np.split(np.arange(len(mask)), edges)


_DASHES3D = ["-", (0, (4, 1.5)), (0, (1.2, 1.2)), (0, (5, 1.5, 1.2, 1.5)), (0, (2.5, 1.2))]


def _level_lines(X, Y, Z, levels):
    """2D level lines of Z: a list of (N, 2) arrays per level."""
    values = (np.linspace(np.nanmin(Z), np.nanmax(Z), levels + 2)[1:-1]
              if np.ndim(levels) == 0 else np.asarray(levels, dtype=float))
    try:
        import contourpy
        gen = contourpy.contour_generator(X, Y, Z)
        return [(v, [np.asarray(seg) for seg in gen.lines(v)]) for v in values]
    except Exception:  # pragma: no cover, matplotlib < 3.6
        from matplotlib.figure import Figure
        cs = Figure().add_subplot().contour(X, Y, Z, levels=values)
        return list(zip(values, cs.allsegs))


def surface_lines(ax, X, Y, Z, contours=0, wire=0, color=None, lw=0.35, alpha=0.8):
    """Level lines (contours) and a wire grid (every wire-th row and column) drawn on the
    surface, the parts behind it left out (they follow the view, like path3d)."""
    color = color or style().mid
    pieces = []
    if contours:
        for v, segs in _level_lines(X, Y, Z, contours):
            pieces.extend(np.column_stack([seg, np.full(len(seg), v)]) for seg in segs
                          if len(seg) > 1)
    if wire:
        for j in range(0, X.shape[0], wire):
            pieces.append(np.column_stack([X[j], Y[j], Z[j]]))
        for i in range(0, X.shape[1], wire):
            pieces.append(np.column_stack([X[:, i], Y[:, i], Z[:, i]]))
    span = float(np.nanmax(Z) - np.nanmin(Z)) or 1.0
    for piece in pieces:
        piece = piece[:: max(1, len(piece) // 160)]
        lifted = np.column_stack([piece[:, :2], piece[:, 2] + 0.004 * span])
        spec = path3d(ax, lifted, X, Y, Z, color=color, lw=lw, hidden="omit", start=False,
                      end=False, zorder=2, halo=False)
        spec["guide"], spec["alpha"] = True, alpha
        _draw_path3d(ax, spec)


def path3d(ax, xyz, X=None, Y=None, Z=None, color=None, lw=1.3, ls="-", marker=None, ms=2.6,
           label=None, hidden="dashed", start=True, end=True, zorder=5, halo=True):
    """A path in 3D (N, 3) drawn with the surface (X, Y, Z) in mind: the stretches the surface
    hides are dashed and faint (hidden="dashed"), faint ("faint") or left out ("omit"), the
    rest drawn over it with a thin white halo. It is redrawn when the view changes (ap.view3d,
    ap.save)."""
    spec = dict(xyz=np.asarray(xyz, dtype=float), surface=None if X is None else _Height(X, Y, Z),
                color=color or style().accent["solid"], lw=lw, ls=ls, marker=marker, ms=ms,
                label=label, hidden=hidden, start=start, end=end, zorder=zorder, halo=halo,
                artists=[])
    if not hasattr(ax, "_aster_paths3d"):
        ax._aster_paths3d = []
    ax._aster_paths3d.append(spec)
    _draw_path3d(ax, spec)
    return spec


def _draw_path3d(ax, spec):
    from matplotlib import patheffects
    for artist in spec["artists"]:
        artist.remove()
    spec["artists"] = []
    xyz, col = spec["xyz"], spec["color"]
    hide = (hidden3d(ax, xyz, spec["surface"], None, None) if spec["surface"] is not None
            else np.zeros(len(xyz), bool))
    spec["visible"] = 1 - hide.mean() if len(hide) else 1.0
    halo = [patheffects.withStroke(linewidth=spec["lw"] + 0.9, foreground="white")] \
        if spec["halo"] else None
    add = spec["artists"].append
    for run in _runs_of(hide):
        idx = np.r_[run, run[-1] + 1] if run[-1] + 1 < len(xyz) else run
        if len(idx) < 2:
            continue
        seg = xyz[idx]
        if hide[run[0]]:
            if spec["hidden"] == "omit":
                continue
            dashed = spec["hidden"] == "dashed"
            line, = ax.plot(*seg.T, color=col, lw=spec["lw"] * (0.7 if dashed else 1.0),
                            ls=(0, (1.6, 1.4)) if dashed else spec["ls"], alpha=0.45,
                            zorder=spec["zorder"] - 0.5, solid_capstyle="round")
        else:
            line, = ax.plot(*seg.T, color=col, lw=spec["lw"], ls=spec["ls"], zorder=spec["zorder"],
                            marker=spec["marker"], ms=spec["ms"], mec="white", mew=0.3,
                            alpha=spec.get("alpha", 1.0), solid_capstyle="round",
                            dash_capstyle="round", path_effects=halo)
        add(line)
    if spec.get("guide"):
        return
    ends = [(0, "white", style().ink, spec["start"]), (-1, col, "white", spec["end"])]
    for i, face, edge, on in ends:
        if on and len(xyz):
            add(ax.scatter(*xyz[i], s=12 if i == 0 else 14, color=face, edgecolors=edge,
                           linewidths=0.6, depthshade=False, zorder=spec["zorder"] + 1,
                           alpha=0.45 if hide[i] else 1.0))
    proxy, = ax.plot([], [], color=col, lw=spec["lw"], ls=spec["ls"], marker=spec["marker"],
                     ms=spec["ms"], mec="white", mew=0.3, label=spec["label"] or "_nolegend_")
    add(proxy)


def label3d(ax, xyz, text, offset=(0, 6), ha="center", va=None, size=None, color=None,
            marker=None, ms=6, face=None):
    """A 7 pt label at a 3D point, offset in pt on the page (it follows the view), optionally
    with a marker there ("*" for an optimum, "o" for a start)."""
    xyz = np.asarray(xyz, dtype=float)
    color = color or style().ink
    if marker:
        ax.scatter(*xyz, s=ms * ms, marker=marker, color=face or style().accent["solid"],
                   edgecolors=style().ink, linewidths=0.5, depthshade=False, zorder=20)
    u, v, _ = _proj(ax.get_proj(), xyz)[0]
    va = va or ("bottom" if offset[1] > 0 else "top" if offset[1] < 0 else "center")
    note_ = ax.annotate(text, (u, v), xytext=offset, textcoords="offset points", ha=ha, va=va,
                        fontsize=size or STYLE_DATA["fonts"]["small"], color=color, zorder=30,
                        annotation_clip=False)
    note_._aster_xyz = xyz
    return note_


def _refresh3d(fig):
    """Redraws 3D paths and labels for the view the axes has now, fills the cell with the box
    when asked (ap.surface, ap.view3d, clean3d(fit=True)), and keeps 3D axis labels on the page
    (smaller label pads, then a smaller box)."""
    for ax in fig.axes:
        if getattr(ax, "name", "") != "3d":
            continue
        for spec in getattr(ax, "_aster_paths3d", []):
            _draw_path3d(ax, spec)
        _place3d(ax)
        if getattr(ax, "_aster_fit", False):
            fit3d(ax)
        _labels_on_page(fig, ax)


def _place3d(ax):
    """Moves label3d notes to their points and the axis names to the box's front edges."""
    M = ax.get_proj()
    for t in ax.texts:
        if getattr(t, "_aster_xyz", None) is not None:
            u, v, _ = _proj(M, t._aster_xyz)[0]
            t.xy = (u, v)
    names = getattr(ax, "_aster_names3d", None)
    for t in getattr(ax, "_aster_name_texts", []):
        t.remove()
    ax._aster_name_texts = []
    if not names:
        return
    (x0, x1), (y0, y1), (z0, z1) = ax.get_xlim3d(), ax.get_ylim3d(), ax.get_zlim3d()
    edges = {0: [((x0, y, z0), (x1, y, z0)) for y in (y0, y1)],
             1: [((x, y0, z0), (x, y1, z0)) for x in (x0, x1)],
             2: [((x, y, z0), (x, y, z1)) for x in (x0, x1) for y in (y0, y1)]}
    height = next((s_["surface"] for s_ in getattr(ax, "_aster_paths3d", [])
                   if s_["surface"] is not None), None)
    if height is not None:
        # Why: on a surface the names sit along its own front edges, not the box's floor.
        xs, ys = np.linspace(x0, x1, 9), np.linspace(y0, y1, 9)
        edges[0] = [np.column_stack([xs, np.full(9, y), height(xs, np.full(9, y))]) for y in (y0, y1)]
        edges[1] = [np.column_stack([np.full(9, x), ys, height(np.full(9, x), ys)]) for x in (x0, x1)]
    to_px = ax.transData.transform
    for i, text in enumerate(list(names)[:3]):
        if not text:
            continue
        flat = [_proj(M, np.nan_to_num(np.array(edge, dtype=float)))[:, :2] for edge in edges[i]]
        flat = [(e[0], e[-1], e[len(e) // 2]) for e in flat]
        if i == 2:
            a, b, _mid = min(flat, key=lambda e: to_px(np.array(e[:2])).mean(0)[0])
            note_ = ax.annotate(text, ((a + b) / 2), xytext=(-4, 0),
                                textcoords="offset points", ha="right", va="center",
                                rotation=90, fontsize=STYLE_DATA["fonts"]["label"],
                                color=style().ink, annotation_clip=False)
        else:
            a, b, mid = min(flat, key=lambda e: to_px(np.array(e)).mean(0)[1])
            pa, pb = to_px(np.array([a, b]))
            angle = math.degrees(math.atan2(pb[1] - pa[1], pb[0] - pa[0]))
            angle = (angle + 90) % 180 - 90
            note_ = ax.annotate(text, mid, xytext=(0, -3),
                                textcoords="offset points", ha="center", va="top",
                                rotation=angle if abs(angle) < 35 else 0,
                                rotation_mode="anchor", fontsize=STYLE_DATA["fonts"]["label"],
                                color=style().ink, annotation_clip=False)
        ax._aster_name_texts.append(note_)


def _extent3d(ax):
    """Points that bound what the axes shows: its surfaces' grid (sampled) and its paths, else
    the box corners."""
    specs = getattr(ax, "_aster_paths3d", [])
    height = next((s_["surface"] for s_ in specs if s_["surface"] is not None), None)
    if height is None:
        (x0, x1), (y0, y1), (z0, z1) = ax.get_xlim3d(), ax.get_ylim3d(), ax.get_zlim3d()
        return np.array([[x, y, z] for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)])
    xs = height.x[:: max(1, len(height.x) // 24)]
    ys = height.y[:: max(1, len(height.y) // 24)]
    GX, GY = np.meshgrid(xs, ys)
    grid = np.column_stack([GX.ravel(), GY.ravel(), height(GX.ravel(), GY.ravel())])
    return np.vstack([grid] + [s_["xyz"] for s_ in specs if not s_.get("guide")])


def fit3d(ax, margin=0.03):
    """Zooms a 3D axes so its box and its axis names fill the cell (matplotlib leaves wide
    margins around a 3D box)."""
    fig = ax.figure
    aspect = getattr(ax, "_aster_aspect", (1, 1, 0.5))
    zoom = getattr(ax, "_aster_zoom", 1.3)
    for _ in range(4):
        fig.canvas.draw()
        r = fig.canvas.get_renderer()
        _place3d(ax)
        pts = ax.transData.transform(_proj(ax.get_proj(), _extent3d(ax))[:, :2])
        for t in list(getattr(ax, "_aster_name_texts", [])) + [
                t for t in ax.texts if getattr(t, "_aster_xyz", None) is not None]:
            b = t.get_window_extent(r)
            pts = np.vstack([pts, [[b.x0, b.y0], [b.x1, b.y1]]])
        # Why the original position: a 3D axes shrinks its own box to a square, but draws past it.
        cell = ax.get_position(original=True).transformed(fig.transFigure)
        active = ax.bbox
        cx, cy = (active.x0 + active.x1) / 2, (active.y0 + active.y1) / 2
        half_w = max(np.abs(pts[:, 0] - cx).max(), 1.0)
        half_h = max(np.abs(pts[:, 1] - cy).max(), 1.0)
        scale = min(cell.width * (0.5 - margin) / half_w, cell.height * (0.5 - margin) / half_h)
        if abs(scale - 1) < 0.02:
            break
        zoom = max(0.5, min(3.0, zoom * scale))
        try:
            ax.set_box_aspect(aspect, zoom=zoom)
        except TypeError:
            return
        ax._aster_zoom = zoom
    _place3d(ax)


def _labels_on_page(fig, ax):
    axes3 = [a for a in (ax.xaxis, ax.yaxis, ax.zaxis) if a.label.get_text().strip()]
    if not axes3:
        return
    page = fig.bbox

    def off():
        fig.canvas.draw()
        r = fig.canvas.get_renderer()
        out = []
        for a in axes3:
            b = a.label.get_window_extent(r)
            if b.x0 < page.x0 or b.x1 > page.x1 or b.y0 < page.y0 or b.y1 > page.y1:
                out.append(a)
        return out
    bad = off()
    for pad in (-6, -2, 2):
        if not bad:
            return
        for a in bad:
            a.labelpad = pad
        bad = off()
    zoom = getattr(ax, "_aster_zoom", 1.3)
    aspect = getattr(ax, "_aster_aspect", (1, 1, 0.5))
    while bad and zoom > 0.75:
        zoom -= 0.06
        try:
            ax.set_box_aspect(aspect, zoom=zoom)
        except TypeError:
            break
        ax._aster_zoom = zoom
        bad = off()


def view3d(ax, X=None, Y=None, Z=None, paths=None, elevs=(18, 26, 34, 42, 52),
           azims=tuple(range(0, 360, 15)), apply=True):
    """Picks the view (elev, azim) that shows the paths best: little of each hidden behind
    the surface (the last, ours, above all), long on the page rather than foreshortened, apart
    from each other, the surface not edge-on. paths default to the axes' ap.surface / ap.path3d paths. Returns it."""
    specs = [s_ for s_ in getattr(ax, "_aster_paths3d", []) if not s_.get("guide")]
    if paths is None:
        paths = [s["xyz"] for s in specs]
        height = next((s["surface"] for s in specs if s["surface"] is not None), None)
    else:
        paths = [np.asarray(p_, dtype=float) for p_ in paths]
        height = _Height(X, Y, Z) if X is not None else None
    if not paths:
        raise ValueError("view3d needs paths: draw them with ap.surface(paths=...) first")
    start = (ax.elev, ax.azim)
    best, chosen = None, start
    for elev in elevs:
        for azim in azims:
            ax.view_init(elev, azim)
            score = _view_score(ax, paths, height)
            if best is None or score > best:
                best, chosen = score, (elev, azim)
    ax.view_init(*(chosen if apply else start))
    if apply:
        ax._aster_fit = True
        _refresh3d(ax.figure)
    return chosen


def _view_score(ax, paths, height):
    M = ax.get_proj()
    shown, flat = [], []
    for p_ in paths:
        hide = hidden3d(ax, p_, height, None, None, samples=24) if height is not None else \
            np.zeros(len(p_), bool)
        shown.append(1 - hide.mean())
        flat.append(_proj(M, p_)[:, :2])
    frame = _proj(M, height.corners())[:, :2] if height is not None else np.vstack(flat)
    size = float(np.ptp(frame, 0).max()) or 1.0
    length = np.mean([np.linalg.norm(np.diff(f, axis=0), axis=1).sum() for f in flat]) / size
    every = np.vstack(flat)
    spread = float(np.prod(np.ptp(every, 0))) / (size * size)
    clutter, pairs = 0.0, 0
    reach = 0.025 * size
    for i in range(len(flat)):
        for j in range(i + 1, len(flat)):
            a, b = flat[i], flat[j]
            far = np.linalg.norm(a - a[0], axis=1) > 3 * reach
            if far.any():
                d = np.sqrt(((a[far][:, None] - b[None]) ** 2).sum(-1)).min(1)
                clutter += float((d < reach).mean())
                pairs += 1
    clutter = clutter / pairs if pairs else 0.0
    # Why the outline too: a long valley seen corner-on leaves a thin diagonal sliver with empty
    # corners; the surface should fill its box, as wide as the panel, its paths running across.
    edge = _proj(M, height.border())[:, :2] if height is not None else every
    wide, tall = np.ptp(edge, 0)
    fill = _hull_area(edge) / (wide * tall) if wide * tall > 0 else 0.0
    pos = ax.get_position()
    fw, fh = ax.figure.get_size_inches()
    target = (pos.width * fw) / (pos.height * fh) if pos.height * fh > 0 else 1.3
    ratio = wide / tall if tall > 0 else target
    aspect = min(ratio, target) / max(ratio, target)
    centred = every - every.mean(0)
    main = np.linalg.eigh(centred.T @ centred)[1][:, -1]
    # Why the last path counts twice: ap.surface draws ours last, and ours must stay whole.
    return (1.6 * np.mean(shown) + 0.6 * min(shown) + 0.8 * shown[-1] + 0.6 * min(length, 1.5)
            + 0.3 * min(spread, 1.0) - 1.4 * clutter - 0.004 * abs(ax.elev - 30)
            - 0.35 * math.cos(math.radians(2 * ax.azim)) ** 2
            + 0.9 * fill + 0.7 * aspect + 0.4 * abs(main[0]))


def _hull_area(points):
    """The area of the convex hull of 2D points (monotone chain)."""
    pts = sorted(set(map(tuple, np.round(points, 9))))
    if len(pts) < 3:
        return 0.0
    def half(seq):
        out = []
        for p_ in seq:
            while len(out) >= 2 and ((out[-1][0] - out[-2][0]) * (p_[1] - out[-2][1])
                                     - (out[-1][1] - out[-2][1]) * (p_[0] - out[-2][0])) <= 0:
                out.pop()
            out.append(p_)
        return out
    hull = half(pts)[:-1] + half(pts[::-1])[:-1]
    xs, ys = np.array(hull).T
    return 0.5 * abs(float(np.dot(xs, np.roll(ys, 1)) - np.dot(ys, np.roll(xs, 1))))
`
