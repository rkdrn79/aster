// aster_plot.py, the check for what a reader cannot see: text and curves drawn under a filled
// area or under another line. Python kept as a string: orcad ships the harness as one bundled
// .mjs file, so a .py beside it would not reach a GPU server. Joined by research-figures-plot-lib.
export const PLOT_PY_HIDDEN = String.raw`
# ---------------------------------------------------------------- hidden text and curves

def _draw_rank(ax):
    """Each child's place in the draw order (zorder, then insertion), as matplotlib draws."""
    children = ax.get_children()
    return dict((id(a), (a.get_zorder(), i)) for i, a in enumerate(children))


def _opaque_fills(ax, ranks, least=0.5):
    """(rank, display path) of each filled area at least this opaque."""
    from matplotlib.collections import PathCollection
    out = []
    for patch in ax.patches:
        if not patch.get_visible() or patch.get_fill() is False:
            continue
        if patch.get_facecolor()[3] >= least:
            path_ = patch.get_transform().transform_path(patch.get_path())
            out.append((ranks.get(id(patch), (patch.get_zorder(), 0)), path_))
    for coll in ax.collections:
        if (not coll.get_visible() or isinstance(coll, (LineCollection, PathCollection))
                or len(coll.get_offsets()) > 1):
            continue
        faces = coll.get_facecolor()
        if not len(faces):
            continue
        trans = coll.get_transform()
        for i, path_ in enumerate(coll.get_paths()[:400]):
            if faces[i % len(faces)][3] >= least and len(path_.vertices) > 2:
                out.append((ranks.get(id(coll), (coll.get_zorder(), 0)), trans.transform_path(path_)))
    return out


def _covered(points, fills, rank, reach=0.0):
    """Per point, whether a fill drawn after rank contains it and everything within reach (px)
    of it: a line along a fill's edge is not under it."""
    hit = np.zeros(len(points), bool)
    if not len(points):
        return hit
    probes = [(0.0, 0.0)] + ([(reach, 0.0), (-reach, 0.0), (0.0, reach), (0.0, -reach)]
                             if reach else [])
    for fill_rank, path_ in fills:
        if fill_rank > rank:
            inside = np.ones(len(points), bool)
            for dx, dy in probes:
                inside &= path_.contains_points(points + np.array([dx, dy]))
            hit |= inside
    return hit


def _line_points(line, cap=400):
    xy = np.asarray(line.get_xydata(), dtype=float)
    if len(xy) < 2:
        return np.zeros((0, 2))
    px = line.get_transform().transform(xy)
    px = px[np.all(np.isfinite(px), 1)]
    if len(px) < 2:
        return px
    steps = np.linspace(0, 1, 4)[:-1]
    seg = px[:-1, None, :] + (px[1:, None, :] - px[:-1, None, :]) * steps[None, :, None]
    dense = np.vstack([seg.reshape(-1, 2), px[-1:]])
    return dense[:: max(1, len(dense) // cap)]


def _near(points, other, reach):
    """Per point, whether it lies within reach (px) of the polyline other."""
    if len(other) < 2 or not len(points):
        return np.zeros(len(points), bool)
    other = other[:: max(1, len(other) // 400)]
    a, b = other[:-1], other[1:]
    ab = b - a
    t = ((points[:, None, :] - a[None]) * ab[None]).sum(-1) / np.maximum((ab * ab).sum(-1), 1e-9)
    t = np.clip(t, 0, 1)
    closest = a[None] + t[..., None] * ab[None]
    return (np.sqrt(((points[:, None, :] - closest) ** 2).sum(-1)).min(1)) <= reach


def _shown_lines(ax):
    out = []
    for line in ax.get_lines():
        if (line.get_visible() and line.get_linewidth() > 0 and line.get_linestyle() not in
                ("None", "none", "", " ") and len(line.get_xdata()) > 1):
            out.append(line)
    return out


def _check_hidden(report, p, owners, renderer):
    for ax in p.fig.axes:
        if getattr(ax, "name", "") == "3d" or not ax.get_visible():
            continue
        key = owners.get(ax)
        ranks = _draw_rank(ax)
        fills = _opaque_fills(ax, ranks)
        texts = [t for t in ax.texts if t.get_visible() and t.get_text().strip()]
        for axis in (ax.xaxis, ax.yaxis):
            if ax.axison and axis.get_visible():
                rank = ranks.get(id(axis), (axis.get_zorder(), 0))
                texts.extend((t, rank) for t in _tick_labels(axis))
        for item in texts:
            t, rank = item if isinstance(item, tuple) else (item, ranks.get(id(item), (item.get_zorder(), 0)))
            box = _bbox(t, renderer)
            if box is None or not fills:
                continue
            gx, gy = np.meshgrid(np.linspace(box.x0, box.x1, 5)[1:-1], np.linspace(box.y0, box.y1, 4)[1:-1])
            hit = _covered(np.stack([gx.ravel(), gy.ravel()], 1), fills, rank)
            if hit.mean() >= 0.5:
                report.add("warnings", "hidden-text", "%r is drawn under a filled area; draw it "
                           "on top (zorder=...) or the fill lower" % t.get_text().strip()[:24],
                           key, box.extents)
        lines_ = _shown_lines(ax)
        drawn = [(line, _line_points(line)) for line in lines_]
        px = p.fig.dpi / 72.0
        for line, pts in drawn:
            if len(pts) < 2:
                continue
            name = line.get_label() if not line.get_label().startswith("_") else "a curve"
            rank = ranks.get(id(line), (line.get_zorder(), 0))
            hidden = _covered(pts, fills, rank, max(1.5, line.get_linewidth() * px))
            box = [float(v) for v in (*pts.min(0), *pts.max(0))]
            if hidden.mean() >= 0.6:
                report.add("warnings", "hidden-curve", "%s is %d%% under a filled area; draw it on "
                           "top (zorder=...) or the fill lighter" % (name, round(100 * hidden.mean())),
                           key, box)
                continue
            for other, other_pts in drawn:
                if other is line or ranks.get(id(other), (other.get_zorder(), 0)) <= rank:
                    continue
                solid = other.get_linestyle() in ("-", "solid") and (other.get_alpha() or 1) > 0.8
                reach = (other.get_linewidth() - line.get_linewidth()) / 2 * px + 0.4 * px
                if solid and reach > 0 and _near(pts, other_pts, reach).mean() >= 0.9:
                    report.add("warnings", "hidden-curve", "%s lies under %s along its length; "
                               "offset one, or draw the thinner one on top" % (
                                   name, other.get_label() if not other.get_label().startswith("_")
                                   else "another curve"), key, box)
                    break
`
