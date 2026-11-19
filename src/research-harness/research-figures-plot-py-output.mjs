// aster_plot.py, saving the files and the manifest. Python kept as a string: orcad ships the harness as one bundled
// .mjs file, so a .py beside it would not reach a GPU server. Joined by research-figures-plot-lib.
export const PLOT_PY_OUTPUT = String.raw`
# ---------------------------------------------------------------- saving

def _script_path():
    main = sys.modules.get("__main__")
    path = getattr(main, "__file__", None) or (sys.argv[0] if sys.argv and sys.argv[0] else None)
    return os.path.abspath(path) if path and os.path.isfile(path) else None


def here(value):
    """Paths relative to the plot script's folder, made absolute (strings, lists and dicts)."""
    script = _script_path()
    base = os.path.dirname(script) if script else os.getcwd()
    if isinstance(value, dict):
        return dict((key, here(item)) for key, item in value.items())
    if isinstance(value, (list, tuple)):
        return [here(item) for item in value]
    return value if os.path.isabs(value) else os.path.normpath(os.path.join(base, value))


def _default_slug(script):
    if not script:
        return "plot"
    name = os.path.basename(script)
    for suffix in (".plot.py", ".py"):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return name


def _default_out(script):
    if os.environ.get("ASTER_PLOT_OUT"):
        return os.environ["ASTER_PLOT_OUT"]
    if not script:
        return os.getcwd()
    folder = os.path.dirname(script)
    return os.path.dirname(folder) if os.path.basename(folder) == "src" else folder


def _sha(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle_:
        for chunk in iter(lambda: handle_.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _wrap(target):
    if isinstance(target, Panels):
        return target
    fig = target if target is not None else plt.gcf()
    keys = list(_LETTERS[: len(fig.axes)])
    axes = dict(zip(keys, fig.axes))
    meta = {}
    for key, ax in axes.items():
        kind = "3d" if getattr(ax, "name", "") == "3d" else (
            "polar" if getattr(ax, "name", "") == "polar" else "2d")
        meta[key] = {"kind": kind, "label": None, "title": None, "span": [0, 0, 0, 0]}
    return Panels(fig, axes, keys, meta)


def _place_subcaptions(p):
    """Bottom labels sit 3 pt under everything else of their panel (two layout passes)."""
    fig = p.fig
    notes = [t for ax in fig.axes for t in ax.texts if getattr(t, "_aster_subcaption", False)]
    if not notes:
        return
    for _ in range(2):
        fig.canvas.draw()
        renderer = fig.canvas.get_renderer()
        for t in notes:
            ax = t.axes
            t.set_visible(False)
            box = ax.get_tightbbox(renderer)
            t.set_visible(True)
            frame = ax.get_window_extent(renderer)
            below = (frame.y0 - box.y0) / fig.dpi * 72 + 3
            t.xyann = (0, -below)


def _data_frame(ax, kind):
    """A 2D panel's data limits and scales, so a diagram can aim an arrow at a data point."""
    if kind not in ("2d", "joint", "inset"):
        return {}
    return {"xlim": [float(v) for v in ax.get_xlim()], "ylim": [float(v) for v in ax.get_ylim()],
            "xscale": ax.get_xscale(), "yscale": ax.get_yscale()}


def _panel_entries(p):
    fig = p.fig
    width, height = fig.get_size_inches()
    out = []

    def entry(id_, label, title, kind, ax):
        pos = ax.get_position()
        item = {"id": id_, "label": label, "title": title, "kind": kind,
                "box": {"x": round(pos.x0 * width, 3), "y": round((1 - pos.y1) * height, 3),
                        "w": round(pos.width * width, 3), "h": round(pos.height * height, 3)}}
        item.update(_data_frame(ax, kind))
        return item

    for key in p.order:
        info = p.meta[key]
        out.append(entry(key, info.get("label"), info.get("title"), info["kind"],
                         _main(p.axes[key])))
    for index, ax in enumerate(p.insets):
        out.append(entry("inset-%d" % (index + 1), None, None, "inset", ax))
    return out


def _text_sizes(fig):
    """The smallest and largest font size drawn, in pt at the plot's natural size: a diagram
    that embeds the plot scales them by its own scale to warn about small text."""
    fig.canvas.draw()
    sizes = [t.get_fontsize() for t, _box, _axis in _texts(fig, fig.canvas.get_renderer())]
    if not sizes:
        return {"minPt": None, "maxPt": None}
    return {"minPt": round(float(min(sizes)), 2), "maxPt": round(float(max(sizes)), 2)}


def _write_json(path, value):
    tmp = path + ".tmp"
    with open(tmp, "w") as handle_:
        json.dump(value, handle_, indent=2)
        handle_.write("\n")
    os.replace(tmp, path)


def save(target=None, slug=None, out=None, quiet=False):
    """Writes <out>/<slug>.pdf, .svg, .embed.svg, .png and <slug>.plot.json, checks the figure
    first, and returns the manifest. out defaults to the folder above src/; slug to the script's
    name without .plot.py."""
    p = _wrap(target)
    fig = p.fig
    script = _script_path()
    slug = slug or p.slug or _default_slug(script)
    out = os.path.abspath(out or _default_out(script))
    os.makedirs(out, exist_ok=True)
    _refresh3d(fig)
    for ax in fig.axes:
        for coll in ax.collections:
            if isinstance(coll, LineCollection) and getattr(ax, "name", "") != "3d":
                _join_segments(coll)
    _guard_layout(p)
    _place_subcaptions(p)
    _place_shared(p)
    fig.canvas.draw()
    report = check(p)
    if getattr(p, "layout_note", None):
        report["notes"].append({"code": "layout", "id": None, "message": p.layout_note})
    files = {"pdf": slug + ".pdf", "svg": slug + ".svg", "embed": slug + ".embed.svg",
             "png": slug + ".png"}
    paths = dict((key, os.path.join(out, name)) for key, name in files.items())
    fig.savefig(paths["pdf"], format="pdf", transparent=True,
                metadata={"Creator": "Aster aster_plot " + VERSION, "CreationDate": None})
    fig.savefig(paths["svg"], format="svg", transparent=True, metadata={"Date": None})
    raster = _save_embed(p, paths["embed"], _owners(p))
    for item in raster:
        if item["what"] != "3D surface faces":
            report["notes"].append({"code": "raster", "id": item["panel"], "message": (
                "a layer of %s is a 200 dpi image in the embedded SVG (the PDF keeps it "
                "vector); plot fewer when it should stay vector" % item["what"])})
    fig.savefig(paths["png"], format="png", dpi=STYLE_DATA["previewDpi"], facecolor="white")
    cache = os.environ.get("ASTER_PLOT_CACHE")
    previews = write_previews(p, report, os.path.join(cache, slug) if cache else None)
    width, height = fig.get_size_inches()
    s = style()
    manifest = {
        "kind": "aster-plot",
        "version": 1,
        "slug": slug,
        "script": os.path.relpath(script, out).replace(os.sep, "/") if script else None,
        "sourceSha256": _sha(script) if script else None,
        "lib": VERSION,
        "size": {"widthIn": round(float(width), 4), "heightIn": round(float(height), 4)},
        "style": {"preset": s.preset, "accent": s.accent_name, "look": _STATE.get("look"),
                  "serif": _STATE.get("serif")},
        "panel": bool(getattr(p, "for_panel", False)),
        "panels": _panel_entries(p),
        "text": _text_sizes(fig),
        "raster": raster,
        "files": files,
        "sha256": dict((key, _sha(path)) for key, path in paths.items()),
        "previews": previews,
        "renderedAt": datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "findings": dict((level, [dict((k, v) for k, v in item.items() if k != "box")
                                  for item in report[level]])
                         for level in ("errors", "warnings", "notes")),
    }
    _write_json(os.path.join(out, slug + ".plot.json"), manifest)
    if not quiet:
        counts = [len(report[level]) for level in ("errors", "warnings", "notes")]
        print("saved %s (%.2f x %.2f in): %d errors, %d warnings, %d notes"
              % (os.path.join(out, slug + ".pdf"), width, height, counts[0], counts[1], counts[2]))
        for level, word in (("errors", "ERROR"), ("warnings", "warning"), ("notes", "note")):
            for item in report[level]:
                print("  %s %s%s: %s" % (word, item["code"], " " + item["id"] if item.get("id")
                                         else "", item["message"]))
    return manifest


def write_previews(p, report, stem):
    """Print-size PNG (150 dpi) and the PNG with findings boxed in red."""
    if not stem:
        return None
    fig = p.fig
    os.makedirs(os.path.dirname(stem), exist_ok=True)
    out = {"print": stem + ".print.png"}
    fig.savefig(out["print"], format="png", dpi=150, facecolor="white")
    boxed = [item for level in ("errors", "warnings") for item in report[level] if item.get("box")]
    if boxed:
        from matplotlib.patches import Rectangle
        added = []
        inv = fig.transFigure.inverted()
        for item in boxed:
            x0, y0, x1, y1 = item["box"]
            (fx0, fy0), (fx1, fy1) = inv.transform([(x0 - 1, y0 - 1), (x1 + 1, y1 + 1)])
            rect = Rectangle((fx0, fy0), fx1 - fx0, fy1 - fy0, transform=fig.transFigure,
                             fill=False, edgecolor="#e5383b", linewidth=0.8,
                             linestyle="-" if item in report["errors"] else "--", zorder=1000)
            fig.patches.append(rect)
            label = fig.text(fx0, fy1, item["code"], color="#e5383b", fontsize=5,
                             transform=fig.transFigure, va="bottom", zorder=1001)
            added.append((rect, label))
        out["lint"] = stem + ".lint.png"
        fig.savefig(out["lint"], format="png", dpi=STYLE_DATA["previewDpi"], facecolor="white")
        for rect, label in added:
            fig.patches.remove(rect)
            label.remove()
    return out
`
