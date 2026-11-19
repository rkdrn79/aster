// aster_plot.py, the checks figures plot check reports. Python kept as a string: orcad ships the harness as one bundled
// .mjs file, so a .py beside it would not reach a GPU server. Joined by research-figures-plot-lib.
export const PLOT_PY_CHECK = String.raw`
# ---------------------------------------------------------------- checks (figures plot check)

from matplotlib.text import Text  # noqa: E402
from matplotlib.cm import ScalarMappable  # noqa: E402
from matplotlib.image import AxesImage  # noqa: E402

RAINBOWS = {"jet", "rainbow", "hsv", "gist_rainbow", "nipy_spectral", "gist_ncar", "turbo",
            "spectral", "gist_rainbow_r", "jet_r", "rainbow_r", "turbo_r", "hsv_r"}
LIBRARY_COLOURS = {"#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2",
                   "#17becf", "#bcbd22", "#0000ff", "#ff0000", "#008000"}
UNIT_WORDS = re.compile(r"\b(time|latency|memory|throughput|speed|duration|wall[- ]?clock|flops|"
                        r"params|parameters|bandwidth|energy|power|runtime)\b", re.I)


UNIT_HINTS = {"memory": "GB", "throughput": "tokens/s", "speed": "it/s", "flops": "PF",
              "params": "M", "parameters": "M", "bandwidth": "GB/s", "energy": "J", "power": "W"}




class _Report(object):
    def __init__(self, fig):
        self.fig = fig
        self.items = {"errors": [], "warnings": [], "notes": []}

    def add(self, level, code, message, id=None, box=None):
        for item in self.items[level]:
            if item["code"] == code and item["id"] == id and item["message"] == message:
                return
        entry = {"code": code, "id": id, "message": message}
        if box is not None:
            entry["box"] = [float(v) for v in box]
        self.items[level].append(entry)


def _bbox(artist, renderer):
    try:
        box = artist.get_window_extent(renderer)
    except Exception:
        return None
    if not np.all(np.isfinite([box.x0, box.y0, box.x1, box.y1])) or box.width <= 0:
        return None
    return box


def _owners(p):
    owners = {}
    for key in p.order:
        ax = p.axes[key]
        for part in (ax if isinstance(ax, Joint) else [ax]):
            owners[part] = key
    for ax in p.insets:
        owners[ax] = owners.get(getattr(ax, "_parent_axes", None), None)
    for ax in p.fig.axes:
        if ax not in owners:
            parent = getattr(ax, "axes", None)
            owners[ax] = owners.get(parent)
    return owners


def _in_view(axis, label):
    """Whether a tick label's tick lies inside the view, compared on the axis's own scale (a
    log axis in log units)."""
    pairs = list(zip(axis.get_major_ticks(), axis.get_majorticklocs()))
    pairs += list(zip(axis.get_minor_ticks(), axis.get_minorticklocs()))
    for tick, loc in pairs:
        if label is tick.label1 or label is tick.label2:
            lo, hi = sorted(axis.get_view_interval())
            with np.errstate(all="ignore"):
                lo, hi, at = axis.get_transform().transform(
                    np.array([[lo], [hi], [loc]], dtype=float)).ravel()
            if not np.isfinite(at):
                return False
            lo, hi = sorted((lo, hi))
            span = (hi - lo) or 1.0
            return lo - 1e-6 * span <= at <= hi + 1e-6 * span
    return True


def _text_box(t, renderer):
    """A text's box on the page; a 3D axes' text (ax.text(x, y, z)) is projected first."""
    try:
        from mpl_toolkits.mplot3d import art3d, proj3d
    except Exception:  # pragma: no cover
        return _bbox(t, renderer)
    if isinstance(t, art3d.Text3D) and getattr(t, "axes", None) is not None:
        x, y, z = t._x, t._y, getattr(t, "_z", 0)
        project = getattr(proj3d, "proj_transform", None) or proj3d._proj_transform
        u, v, _ = project(np.atleast_1d(x), np.atleast_1d(y), np.atleast_1d(z), t.axes.get_proj())
        old = (t._x, t._y)
        t._x, t._y = float(np.ravel(u)[0]), float(np.ravel(v)[0])
        try:
            return _bbox(t, renderer)
        finally:
            t._x, t._y = old
    return _bbox(t, renderer)


def _label_shared(p, ax, key, name):
    """Whether a panel's missing axis label is given once for it: a shared label (p.xlabel,
    supxlabel) or the neighbour on its left (y) or below it (x) on a shared or like scale."""
    info = p.meta.get(key, {}) if key else {}
    if info.get("shared_" + name):
        return True
    span = info.get("span")
    if not span:
        return False
    mine = (ax.get_ylim() if name == "y" else ax.get_xlim())
    for other in p.order:
        meta = p.meta[other]
        if other == key or meta["kind"] not in ("2d", "joint"):
            continue
        oax = _main(p.axes[other])
        if not (oax.yaxis if name == "y" else oax.xaxis).get_label().get_text().strip():
            continue
        o = meta["span"]
        if name == "y" and not (o[0] <= span[1] and span[0] <= o[1] and o[2] < span[2]):
            continue
        if name == "x" and not (o[2] <= span[3] and span[2] <= o[3] and o[1] > span[1]):
            continue
        theirs = oax.get_ylim() if name == "y" else oax.get_xlim()
        lo, hi = max(min(mine), min(theirs)), min(max(mine), max(theirs))
        union = max(max(mine), max(theirs)) - min(min(mine), min(theirs)) or 1.0
        if (hi - lo) / union >= 0.5:
            return True
    return False


def _tick_labels(axis):
    out = []
    for label in axis.get_ticklabels():
        if label.get_visible() and label.get_text().strip() and _in_view(axis, label):
            out.append(label)
    return out


def _texts(fig, renderer):
    found = []
    tick_owner = {}
    for ax in fig.axes:
        if getattr(ax, "name", "") == "3d":
            continue
        for axis in (ax.xaxis, ax.yaxis):
            for label in axis.get_ticklabels(which="both"):
                tick_owner[id(label)] = (axis, label)
    hidden = set()
    for ax in fig.axes:
        if getattr(ax, "name", "") == "3d":
            for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
                hidden.update(id(t) for t in axis.get_ticklabels(which="both"))
        elif not ax.axison:
            for axis in (ax.xaxis, ax.yaxis):
                hidden.update(id(t) for t in axis.get_ticklabels(which="both"))
                hidden.add(id(axis.get_label()))
    for t in fig.findobj(Text):
        if not t.get_visible() or not t.get_text().strip() or t.get_alpha() == 0 or id(t) in hidden:
            continue
        owner = tick_owner.get(id(t))
        if owner and not _in_view(owner[0], t):
            continue
        box = _text_box(t, renderer)
        if box is not None:
            found.append((t, box, owner[0] if owner else None))
    return found


def _numeric(text):
    cleaned = re.sub(r"[$%×x−\\{}^]|mathdefault|times|10", "", text.replace("−", "-"))
    try:
        float(cleaned or "0")
        return True
    except ValueError:
        return False


def _series(ax):
    """(colour, style key, label) per labelled series of an axes."""
    out = []
    for line in ax.get_lines():
        if not line.get_label().startswith("_") and len(line.get_xdata()) > 0:
            out.append((mcolors.to_hex(line.get_color()),
                        (str(line.get_linestyle()), str(line.get_marker()), None), line.get_label()))
    for container in getattr(ax, "containers", []):
        patches = getattr(container, "patches", None)
        if patches:
            face = patches[0].get_facecolor()
            out.append((mcolors.to_hex(face), ("bar", None, patches[0].get_hatch()),
                        container.get_label()))
    for coll in ax.collections:
        label = coll.get_label()
        if label and not label.startswith("_") and coll.get_array() is None:
            colours = coll.get_facecolor()
            if len(colours):
                out.append((mcolors.to_hex(colours[0]), ("coll", None, None), label))
    return out


def _data_colours(ax):
    out = []
    for line in ax.get_lines():
        out.append(line.get_color())
    for patch in ax.patches:
        if patch.get_facecolor()[3] > 0.05:
            out.append(patch.get_facecolor())
    for coll in ax.collections:
        if coll.get_array() is None:
            for value in list(coll.get_facecolor())[:3] + list(coll.get_edgecolor())[:3]:
                if len(value) == 4 and value[3] > 0.05:
                    out.append(value)
    return [mcolors.to_hex(value) for value in out]


def _hue_clusters(colours):
    hues = []
    for value in set(colours):
        L, C, h = oklch(value)
        if C >= 0.045 and 0.25 < L < 0.97:
            hues.append(h)
    clusters = []
    for h in sorted(hues):
        for cluster in clusters:
            if min(abs(h - cluster[0]), 360 - abs(h - cluster[0])) < 24:
                break
        else:
            clusters.append([h])
    return clusters


def _data_points(ax):
    """Display points of the data in an axes, densified along lines."""
    points = []
    for line in ax.get_lines():
        xy = np.asarray(line.get_xydata(), dtype=float)
        if len(xy) and line.get_visible():
            px = line.get_transform().transform(xy)
            if len(px) > 1:
                steps = np.linspace(0, 1, 6)[:-1]
                seg = px[:-1, None, :] + (px[1:, None, :] - px[:-1, None, :]) * steps[None, :, None]
                px = np.vstack([seg.reshape(-1, 2), px[-1:]])
            points.append(px)
    for coll in ax.collections:
        try:
            offsets = coll.get_offsets()
            if len(offsets) and coll.get_visible():
                points.append(coll.get_offset_transform().transform(offsets))
            for path in coll.get_paths()[:400]:
                verts = path.vertices
                if len(verts):
                    points.append(coll.get_transform().transform(verts[:: max(1, len(verts) // 200)]))
        except Exception:
            continue
    for patch in ax.patches:
        try:
            box = patch.get_window_extent()
            points.append(np.array([[box.x0, box.y0], [box.x1, box.y1], [box.x0, box.y1],
                                    [box.x1, box.y0], [(box.x0 + box.x1) / 2, box.y1]]))
        except Exception:
            continue
    return np.vstack(points) if points else np.zeros((0, 2))


def check(target=None):
    """What a reviewer would flag at print size, as the diagram lint reports it:
    {"errors": [...], "warnings": [...], "notes": [...]}, each {code, id, message, box}."""
    p = _wrap(target)
    fig = p.fig
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    report = _Report(fig)
    owners = _owners(p)
    px_pt = 72.0 / fig.dpi
    page = fig.bbox
    texts = _texts(fig, renderer)
    holders = {}
    for ax in fig.axes:
        for t in ax.findobj(Text):
            holders.setdefault(id(t), ax)
    _check_text(report, texts, owners, px_pt, page, holders)
    for ax in fig.axes:
        key = owners.get(ax)
        kind = p.meta.get(key, {}).get("kind", "2d") if key else "2d"
        if not ax.get_visible():
            continue
        if getattr(ax, "name", "") == "3d":
            _check_3d(report, ax, key)
            if any(c.get_rasterized() for c in ax.collections):
                report.add("notes", "raster", "the 3D faces are rasterized at %g dpi inside the "
                           "vector PDF (lines and text stay vector)"
                           % matplotlib.rcParams["savefig.dpi"], key)
            continue
        if not ax.axison or kind in ("legend", "off") or getattr(ax, "name", "") == "polar":
            continue
        _check_axes(report, ax, key, p, renderer, px_pt)
    _check_hidden(report, p, owners, renderer)
    _check_colours(report, p, owners)
    if not getattr(p, "for_panel", False):
        _check_page(report, fig)
    else:
        _check_fonts(report)
    return report.items


def _check_text(report, texts, owners, px_pt, page, holders):
    for t, box, _axis in texts:
        size = t.get_fontsize()
        key = owners.get(holders.get(id(t)))
        words = t.get_text().strip()[:24]
        if size < 6:
            report.add("errors", "tiny-text", "%r is %.1f pt at print; 7–9 pt reads in a paper"
                       % (words, size), key, box.extents)
        elif size < 6.95:
            report.add("warnings", "small-text", "%r is %.1f pt; use 7 pt or more" % (words, size),
                       key, box.extents)
        if (box.x0 < page.x0 - 1 / px_pt or box.x1 > page.x1 + 1 / px_pt
                or box.y0 < page.y0 - 1 / px_pt or box.y1 > page.y1 + 1 / px_pt):
            # Why the sizes: an axis label wider than a narrow cell is the usual cause.
            over = max(page.x0 - box.x0, box.x1 - page.x1, page.y0 - box.y0, box.y1 - page.y1)
            report.add("errors", "off-page", "%r runs %.0f pt off the page (it is %.2f in wide on a "
                       "%.2f in page); shorten it, break it onto two lines with \\n, or give its "
                       "panel more room (a wider cell, fewer columns)"
                       % (words, over * px_pt, box.width * px_pt / 72, page.width * px_pt / 72),
                       key, box.extents)
    for i in range(len(texts)):
        ti, bi, ai = texts[i]
        for j in range(i + 1, len(texts)):
            tj, bj, aj = texts[j]
            if ai is not None and ai is aj:
                continue
            w = min(bi.x1, bj.x1) - max(bi.x0, bj.x0)
            h = min(bi.y1, bj.y1) - max(bi.y0, bj.y0)
            if w * px_pt > 0.8 and h * px_pt > 0.8:
                key = owners.get(holders.get(id(ti))) or owners.get(holders.get(id(tj)))
                union = [min(bi.x0, bj.x0), min(bi.y0, bj.y0), max(bi.x1, bj.x1), max(bi.y1, bj.y1)]
                report.add("warnings", "text-overlap", "%r overlaps %r"
                           % (ti.get_text().strip()[:20], tj.get_text().strip()[:20]), key, union)


def _check_axes(report, ax, key, p, renderer, px_pt):
    if getattr(ax, "_aster_colorbar", False) or getattr(ax, "_colorbar", None) is not None:
        bar_label = ax.get_ylabel() or ax.get_xlabel()
        if not bar_label.strip():
            report.add("warnings", "missing-label", "a colour bar has no label: say what the "
                       "colour means (colorbar(..., label=...))", key)
        return
    is_inset = ax in p.insets
    has_data = bool(ax.get_lines() or ax.collections or ax.patches or ax.images)
    if not has_data and not ax.texts:
        report.add("warnings", "empty-panel", "the panel has no data", key,
                   ax.get_window_extent(renderer).extents)
    for axis, name in ((ax.xaxis, "x"), (ax.yaxis, "y")):
        labels = _tick_labels(axis)
        label = axis.get_label().get_text().strip()
        numeric = labels and sum(_numeric(t.get_text()) for t in labels) >= len(labels) / 2
        sup = getattr(p.fig, "_sup%slabel" % name, None)
        if (numeric and not label and not is_inset and not (sup and sup.get_text())
                and not _label_shared(p, ax, key, name)):
            report.add("warnings", "missing-label", "the %s axis has numbers but no label" % name,
                       key, ax.get_window_extent(renderer).extents)
        word = UNIT_WORDS.search(label) if label else None
        counted = word and word.group(1).lower() in ("params", "parameters", "flops")
        if word and not re.search(r"[(\[]|\b(s|ms|h|min|GB|MB|%)\b", label) and not (
                counted and axis.get_scale() == "log"):
            unit = UNIT_HINTS.get(word.group(1).lower(), "s")
            report.add("warnings", "missing-unit", "%r needs its unit, e.g. %r"
                       % (label, "%s (%s)" % (label, unit)), key)
        _check_ticks(report, axis, labels, name, key, px_pt)
    legend_ = ax.get_legend()
    if legend_ is not None and legend_.get_visible():
        box = legend_.get_window_extent(renderer)
        pts = _data_points(ax)
        if len(pts):
            inside = ((pts[:, 0] > box.x0) & (pts[:, 0] < box.x1)
                      & (pts[:, 1] > box.y0) & (pts[:, 1] < box.y1))
            if inside.sum() >= 1:
                report.add("warnings", "legend-covers-data", "the legend sits on the data; "
                           "move it (loc=...), use a legend cell, or label the lines directly",
                           key, box.extents)
    info = p.meta.get(key, {}) if key else {}
    expected = " ".join(part for part in (info.get("label"), info.get("title")) if part)
    for loc in ("left", "center", "right"):
        title = ax.get_title(loc).strip()
        marked = getattr(ax.title, "_aster_label", False) and loc == "center"
        if title and title != expected and not is_inset and not marked:
            report.add("notes", "title", "%r is a title above the plot; papers put it in the "
                       "caption (panels(titles=...) keeps a short panel title)" % title[:30], key)
    if ax.images:
        report.add("notes", "raster", "raster images sit in the vector PDF (imshow); keep them "
                   "for photos, heat maps and slices")
    for artist in ax.collections:
        if artist.get_rasterized():
            dpi = matplotlib.rcParams["savefig.dpi"]
            level = "warnings" if isinstance(dpi, (int, float)) and dpi < 300 else "notes"
            report.add(level, "raster", "a rasterized layer in the vector PDF (at %s dpi)" % dpi,
                       key)
            break


def _check_ticks(report, axis, labels, name, key, px_pt):
    if len(labels) < 2:
        return
    boxes = sorted([label.get_window_extent() for label in labels],
                   key=lambda b: b.x0 if name == "x" else b.y0)
    for a, b in zip(boxes, boxes[1:]):
        gap = (b.x0 - a.x1) if name == "x" else (b.y0 - a.y1)
        if gap * px_pt < 1.5:
            report.add("warnings", "crowded-ticks", "%s tick labels touch; use fewer ticks "
                       "(ax.locator_params(axis=%r, nbins=4))" % (name, name), key,
                       [min(a.x0, b.x0), min(a.y0, b.y0), max(a.x1, b.x1), max(a.y1, b.y1)])
            return
    ax = axis.axes
    length = ax.get_window_extent().width if name == "x" else ax.get_window_extent().height
    inches = length * px_pt / 72
    if len(labels) > 3 + inches * 2.6:
        report.add("warnings", "crowded-ticks", "%d %s ticks on a %.1f in axis; 3–6 read best"
                   % (len(labels), name, inches), key)


def _check_3d(report, ax, key):
    for axis in (ax.xaxis, ax.yaxis, ax.zaxis):
        pane = getattr(axis, "pane", None)
        if pane is not None and pane.get_visible() and pane.get_facecolor()[3] > 0.02:
            report.add("warnings", "3d-panes", "gray 3D panes are on; ap.clean3d(ax) hides them",
                       key)
            break
    if getattr(ax, "_draw_grid", False):
        report.add("warnings", "3d-grid", "the 3D grid is on; ap.clean3d(ax) turns it off", key)
    for axis, name in ((ax.xaxis, "x"), (ax.yaxis, "y"), (ax.zaxis, "z")):
        shown = [t for t in axis.get_ticklabels() if t.get_visible() and t.get_text().strip()]
        if len(shown) > 5:
            report.add("warnings", "3d-ticks", "%d %s tick labels in 3D are unreadable at print; "
                       "keep 3 or none" % (len(shown), name), key)


def _check_colours(report, p, owners):
    accent = style().accent["solid"]
    _, _, accent_h = oklch(accent)
    every = []
    for ax in p.fig.axes:
        key = owners.get(ax)
        colours = _data_colours(ax)
        every.extend(colours)
        library = sorted(set(c for c in colours if c.lower() in LIBRARY_COLOURS))
        if library:
            report.add("warnings", "library-colours", "matplotlib's default colours (%s); use "
                       "ap.color('ours'), ap.series() or ap.cmap()" % ", ".join(library), key)
        series_ = _series(ax)
        tinted = []
        for colour, _style, _label in series_:
            L, C, h = oklch(colour)
            if C > 0.04 and min(abs(h - accent_h), 360 - abs(h - accent_h)) < 20:
                tinted.append(L)
        ramp_ = len(tinted) > 1 and min(np.diff(sorted(tinted))) > 0.06
        if len(series_) >= 3 and len(tinted) >= 2 and not ramp_:
            report.add("warnings", "accent-overused", "%d series share the accent; it marks ours "
                       "only (others in grays or ap.series(n, hues=True))" % len(tinted), key)
    for coll in p.fig.findobj(lambda a: isinstance(a, ScalarMappable)):
        cm = getattr(coll, "cmap", None)
        name = getattr(cm, "name", "")
        if name and name.lower() in RAINBOWS:
            key = owners.get(getattr(coll, "axes", None))
            report.add("warnings", "rainbow-colormap", "%s is not perceptual; use ap.cmap('seq'), "
                       "'viridis' or 'cividis'" % name, key)
    clusters = _hue_clusters(every)
    if len(clusters) > 4:
        report.add("warnings", "too-many-hues", "%d hues in one figure; keep the accent, grays "
                   "and at most three other hues" % len(clusters))


def _check_page(report, fig):
    width, height = fig.get_size_inches()
    known = set()
    for size in STYLE_DATA["sizes"].values():
        known.add(round(size["widthIn"], 3))
    for venue in STYLE_DATA["venues"].values():
        for key in ("single", "double"):
            if venue.get(key):
                known.add(round(venue[key], 3))
    if all(abs(width - value) > 0.02 for value in known):
        report.add("notes", "page-width", "%.2f in wide is no column width (3.25 single, 6.75 "
                   "double); text sizes hold only when the plot prints at this width" % width)
    if width > 3.5 and height > STYLE_DATA["doubleMaxHeightIn"] + 0.005:
        report.add("warnings", "tall-page", "%.2f in tall for a full-width figure; keep it under "
                   "%.1f in" % (height, STYLE_DATA["doubleMaxHeightIn"]))
    _check_fonts(report)


def _check_fonts(report):
    try:
        from matplotlib import font_manager
        found = font_manager.findfont(font_manager.FontProperties(
            family=matplotlib.rcParams["font.sans-serif"]), fallback_to_default=True)
        if "DejaVu" in os.path.basename(found) and \
                matplotlib.rcParams["font.sans-serif"][0] != "DejaVu Sans":
            report.add("notes", "font", "Liberation Sans and Arial are missing here, so text is "
                       "DejaVu Sans (wider than the canvas font); install fonts-liberation")
    except Exception:
        pass
`
