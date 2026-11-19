// aster_plot.py's own tests, run with the Python figures plot run would use; skipped cleanly when
// this computer has no Python with numpy and matplotlib.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { asterPlotSource } from './research-figures-plot-lib.mjs'
import { figureStyle } from './research-figures-style.mjs'
import { createPythonFinder } from './research-python-finder.mjs'

const python = await createPythonFinder({ modules: ['numpy', 'matplotlib'] })()
const skip = python ? false : 'no Python with numpy and matplotlib'

const TESTS = String.raw`
import json, os, sys, unittest
import numpy as np
import aster_plot as ap
import matplotlib.pyplot as plt

EXPECTED = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def fresh(*args, **kw):
    plt.close("all")
    return ap.panels(*args, **kw)


def codes(report):
    return set(item["code"] for level in ("errors", "warnings", "notes") for item in report[level])


class Style(unittest.TestCase):
    def test_presets_accents_and_hex(self):
        ap.use("graphite", accent="#cc3366")
        self.assertEqual(ap.style().accent["solid"], EXPECTED["hex"]["solid"])
        self.assertEqual(ap.style().accent["fill"], EXPECTED["hex"]["fill"])
        ap.use("slate", accent="teal")
        self.assertEqual(ap.color("ours"), EXPECTED["slateTeal"])
        ap.use("neutral")
        self.assertEqual(ap.style().preset, "graphite")
        ap.use("print-mono", accent="teal")
        self.assertEqual(ap.style().accent["solid"], EXPECTED["mono"])
        with self.assertRaises(ValueError):
            ap.use("nope")
        with self.assertRaises(ValueError):
            ap.use("graphite", accent="nope")
        ap.use()
        self.assertEqual(ap.style().preset, "graphite")

    def test_paper_look_sets_words_and_math_in_the_latex_face(self):
        ap.use("vision", look="paper")
        rc = ap.matplotlib.rcParams
        self.assertEqual(rc["font.family"], ["serif"])
        self.assertIn("cmr10", rc["font.serif"])
        self.assertEqual(rc["mathtext.fontset"], "cm")
        ap.use("paper", serif="times")
        self.assertEqual(rc["mathtext.fontset"], "stix")
        self.assertEqual(rc["font.serif"][0], "TeX Gyre Termes")
        ap.use()
        self.assertEqual(rc["font.family"], ["serif"], "the paper look is the default")
        ap.use("vision", look="preset")
        self.assertEqual(rc["font.family"], ["sans-serif"])

    def test_rc_is_print_ready(self):
        ap.use()
        rc = ap.matplotlib.rcParams
        self.assertEqual(rc["pdf.fonttype"], 42)
        self.assertEqual(rc["svg.fonttype"], "none")
        self.assertEqual(rc["font.size"], 8)
        self.assertEqual(rc["xtick.labelsize"], 7)
        self.assertFalse(rc["axes.spines.top"])
        self.assertFalse(rc["legend.frameon"])
        self.assertEqual(rc["mathtext.fontset"], "cm")
        ap.use(math="sans", font="Helvetica")
        self.assertEqual(rc["mathtext.fontset"], "dejavusans")
        self.assertEqual(rc["font.sans-serif"][0], "Helvetica")
        ap.use()

    def test_roles_series_ramp_cmaps(self):
        ap.use()
        s = ap.style()
        self.assertEqual(ap.color("ours-fill"), s.accent["fill"])
        self.assertEqual(ap.color("ours", "ink"), s.accent["ink"])
        self.assertEqual(ap.color("good"), s.good["solid"])
        self.assertEqual(ap.color("bad-fill"), s.bad["fill"])
        self.assertEqual(ap.color("muted"), s.muted)
        self.assertEqual(ap.color("teal-ink"), EXPECTED["tealInk"])
        self.assertEqual(ap.color("#123456"), "#123456")
        self.assertEqual(ap.series(3, ours=1)[1], s.accent["solid"])
        self.assertNotIn(s.accent["solid"], ap.series(3, ours=None))
        hues = ap.series(3, ours=0, hues=True)
        self.assertEqual(len(set(hues)), 3)
        steps = ap.ramp(4)
        self.assertEqual(steps[-1], s.accent["solid"])
        self.assertGreater(ap.luminance(steps[0]), ap.luminance(steps[-1]))
        for kind in ("seq", "soft", "div", "gray", "light", "surface", "viridis"):
            self.assertEqual(len(ap.cmap(kind)(np.linspace(0, 1, 3))), 3)
        self.assertEqual(ap.alpha_mix("#000000", 0.5), "#808080")
        self.assertEqual(ap.alpha("#ff0000", 0.5), (1.0, 0.0, 0.0, 0.5))

    def test_page_sizes(self):
        self.assertEqual(ap.page_size("single"), (3.25, 2.0))
        self.assertEqual(ap.page_size("double", 2.4), (6.75, 2.4))
        self.assertEqual(ap.page_size("onehalf"), (5, 2.2))
        self.assertEqual(ap.page_size("double", venue="cvpr")[0], 6.875)
        self.assertEqual(ap.page_size("single", venue="neurips")[0], 5.5)
        self.assertEqual(ap.page_size((4, 3)), (4.0, 3.0))
        with self.assertRaises(ValueError):
            ap.page_size("huge")
        with self.assertRaises(ValueError):
            ap.page_size("single", venue="nope")


class Layout(unittest.TestCase):
    def test_mosaic_spans_kinds_and_labels(self):
        p = fresh("ab;cc", size="double", height=2.4, kinds={"b": "polar"},
                  titles={"a": "Left"}, width_ratios=[2, 1])
        self.assertEqual(p.order, ["a", "b", "c"])
        self.assertEqual(p.meta["c"]["span"], [1, 1, 0, 1])
        self.assertEqual(p["a"].get_title("left"), "(a) Left")
        self.assertEqual(p["c"].get_title("left"), "(c)")
        self.assertEqual(p["b"].name, "polar")
        self.assertEqual(tuple(p.fig.get_size_inches()), (6.75, 2.4))
        self.assertEqual(len(list(p)), 3)
        with self.assertRaises(ValueError):
            fresh("ab;ba")
        with self.assertRaises(ValueError):
            fresh("ab;c")

    def test_grid_tuple_label_styles_and_bottom_labels(self):
        p = fresh((2, 2), labels="a")
        self.assertEqual([p[k].get_title("left") for k in "abcd"], ["a", "b", "c", "d"])
        p = fresh("ab", labels="(A)")
        self.assertEqual(p["b"].get_title("left"), "(B)")
        p = fresh("ab", labels=["i", "ii"])
        self.assertEqual(p["b"].get_title("left"), "ii")
        p = fresh("a")
        self.assertEqual(p["a"].get_title("left"), "")
        p = fresh("ab", label_loc="bottom", titles={"a": "ODE"})
        p["a"].plot([0, 1], [0, 1])
        p["a"].set_xlabel("x")
        ap._place_subcaptions(p)
        note = [t for t in p["a"].texts if getattr(t, "_aster_subcaption", False)][0]
        self.assertEqual(note.get_text(), "(a) ODE")
        self.assertLess(note.xyann[1], -10)

    def test_shared_axes_hide_inner_ticks(self):
        p = fresh("ab;cd", sharex="col", sharey="row")
        for ax in p:
            ax.plot([0, 1], [0, 1])
        p.fig.canvas.draw()
        self.assertIs(p["b"].get_shared_y_axes().joined(p["a"], p["b"]), True)
        self.assertFalse(any(t.get_visible() for t in p["b"].get_yticklabels()))
        self.assertFalse(any(t.get_visible() for t in p["a"].get_xticklabels()))
        self.assertTrue(any(t.get_visible() for t in p["c"].get_xticklabels()))
        p = fresh("abc", sharey=["ab"])
        self.assertTrue(p["b"].get_shared_y_axes().joined(p["a"], p["b"]))
        self.assertFalse(p["c"].get_shared_y_axes().joined(p["a"], p["c"]))
        p = fresh("ab", sharex=True)
        self.assertTrue(p["b"].get_shared_x_axes().joined(p["a"], p["b"]))

    def test_mixed_3d_joint_legend_cells_and_insets(self):
        p = fresh("abc", size="double", kinds={"a": "3d", "b": "joint", "c": "legend"},
                  view=(30, 10))
        self.assertEqual(p["a"].name, "3d")
        self.assertEqual((p["a"].elev, p["a"].azim), (30, 10))
        self.assertIsInstance(p["b"], ap.Joint)
        main, top, right = p["b"]
        self.assertTrue(top.get_shared_x_axes().joined(main, top))
        self.assertEqual(top.get_title("left"), "(b)")
        self.assertFalse(p["c"].axison)
        p["b"].main.plot([0, 1], [0, 1], label="Ours")
        leg = p.legend()
        self.assertIs(leg.axes, p["c"])
        p = fresh("ab", legend="bottom")
        self.assertEqual(p.meta["@"]["kind"], "legend")
        p["a"].plot([0, 1], [0, 1], label="Ours")
        p["b"].plot([0, 1], [1, 0], label="Ours")
        self.assertEqual(len(p.legend().get_texts()), 1)
        p = fresh("ab", legend="right")
        self.assertEqual(p.meta["@"]["span"][2], 2)
        p = fresh("a")
        p["a"].plot([0, 10], [0, 10])
        ins = p.inset("a", xlim=(0, 1), ylim=(0, 1))
        self.assertEqual(ins.get_xlim(), (0.0, 1.0))
        self.assertIn(ins, p.insets)
        p = fresh("ab", labels=None)
        p["a"].plot([0], [0], label="x")
        self.assertIs(p.legend().figure, p.fig)

    def test_figure_legends_lines_notes_handles(self):
        p, ax = ap.figure(size="single", height=1.8)
        self.assertEqual(tuple(p.fig.get_size_inches()), (3.25, 1.8))
        a = ax.plot([0, 1], [0, 1], label="Base")[0]
        ax.plot([0, 1], [0, 0.5], label="Ours")
        ax.set_title("x", loc="left")
        leg = ap.legend(ax, where="above")
        self.assertEqual(leg._ncols if hasattr(leg, "_ncols") else leg._ncol, 2)
        self.assertGreater(ax.title.get_position()[1], 0)
        self.assertEqual(ap.legend(ax, where="right").get_bbox_to_anchor() is not None, True)
        self.assertEqual(ap.legend(ax, loc="lower right")._loc, 4)
        notes = ap.label_lines(ax)
        self.assertEqual([n.get_text() for n in notes].count("Ours"), 1)
        self.assertEqual(ap.label_lines(ax, [a], ["B"], x=0.5)[0].get_text(), "B")
        n = ap.note(ax, "here", (0.5, 0.5))
        self.assertIsNotNone(n.arrow_patch)
        self.assertIsNone(ap.note(ax, "plain", (0.5, 0.5), arrow=False).arrow_patch)
        self.assertEqual(ap.handle("x", kind="patch", hatch="//").get_hatch(), "//")
        self.assertEqual(ap.handle("x", kind="marker").get_marker(), "o")
        self.assertEqual(ap.handle("x").get_label(), "x")
        self.assertEqual(len(ap.collect_handles(p.fig)), 2)
        ap.no_ticks(ax)
        self.assertEqual(list(ax.get_xticks()), [])


class Save(unittest.TestCase):
    def test_files_manifest_and_previews(self):
        os.environ["ASTER_PLOT_CACHE"] = os.path.join(OUT, "cache")
        p = fresh("ab", size="double", height=1.8, titles={"a": "Loss"}, legend="bottom")
        p["a"].plot([0, 1], [1, 0], label="Ours", color=ap.color("ours"))
        p["a"].set_xlabel("step")
        p["a"].set_ylabel("loss")
        p["b"].plot([0, 1], [0, 1])
        p.legend()
        m = p.save(slug="demo", out=OUT, quiet=True)
        for key in ("pdf", "svg", "embed", "png"):
            self.assertTrue(os.path.isfile(os.path.join(OUT, m["files"][key])), key)
            self.assertEqual(len(m["sha256"][key]), 64)
        self.assertEqual(m["kind"], "aster-plot")
        self.assertEqual(m["size"], {"widthIn": 6.75, "heightIn": 1.8})
        self.assertEqual(m["style"]["preset"], "graphite")
        self.assertEqual([x["id"] for x in m["panels"]], ["a", "b", "@"])
        a = m["panels"][0]
        self.assertEqual((a["label"], a["title"], a["kind"]), ("(a)", "Loss", "2d"))
        self.assertEqual(a["xlim"], list(p["a"].get_xlim()))
        self.assertEqual((a["xscale"], a["yscale"]), ("linear", "linear"))
        self.assertNotIn("xlim", m["panels"][2])
        self.assertFalse(m["panel"])
        self.assertTrue(0 < a["box"]["x"] < 1 and a["box"]["w"] > 1)
        self.assertTrue(os.path.isfile(m["previews"]["print"]))
        self.assertNotIn("cvd", m["previews"])
        with open(os.path.join(OUT, "demo.plot.json")) as handle:
            self.assertEqual(json.load(handle)["slug"], "demo")
        svg = open(os.path.join(OUT, "demo.svg")).read()
        self.assertIn("<text", svg)
        self.assertNotIn("<text", open(os.path.join(OUT, "demo.embed.svg")).read())
        self.assertIn('width="486pt"', svg)
        again = p.save(slug="demo", out=OUT, quiet=True)
        self.assertEqual(again["sha256"]["svg"], m["sha256"]["svg"])
        del os.environ["ASTER_PLOT_CACHE"]

    def test_lint_png_and_wrapping_a_plain_figure(self):
        os.environ["ASTER_PLOT_CACHE"] = os.path.join(OUT, "cache")
        plt.close("all")
        fig, ax = plt.subplots(figsize=(3.25, 2))
        ax.plot([0, 1], [0, 1])
        ax.set_xlabel("x", fontsize=4)
        m = ap.save(fig, slug="plain", out=OUT, quiet=True)
        self.assertIn("tiny-text", [f["code"] for f in m["findings"]["errors"]])
        self.assertTrue(os.path.isfile(m["previews"]["lint"]))
        self.assertEqual(m["panels"][0]["id"], "a")
        del os.environ["ASTER_PLOT_CACHE"]

    def test_here_resolves_beside_the_script(self):
        self.assertTrue(os.path.isabs(ap.here("x.jsonl")))
        self.assertEqual(ap.here({"a": ["/abs"]}), {"a": ["/abs"]})


class Checks(unittest.TestCase):
    def test_a_clean_figure_passes(self):
        p, ax = ap.figure()
        ax.plot([0, 1, 2], [0, 1, 4], color=ap.color("ours"))
        ax.set_xlabel("step")
        ax.set_ylabel("loss")
        report = ap.check(p)
        self.assertEqual(report["errors"], [])
        self.assertEqual(report["warnings"], [])

    def test_each_finding(self):
        p = fresh("abc", size=(5.1, 2.9))
        a, b, c = p["a"], p["b"], p["c"]
        a.plot(np.arange(10), np.arange(10), color="#1f77b4", label="one")
        a.plot(np.arange(10), np.arange(10)[::-1], color="#ff7f0e", label="two")
        a.legend(loc="center", frameon=False)
        a.set_xticks(np.arange(0, 10, 0.5))
        a.set_title("Centre title", loc="center")
        a.text(5, 5, "tiny", fontsize=5)
        a.text(5, 5, "small", fontsize=6.5)
        a.set_ylabel("time")
        cm = plt.get_cmap("jet")
        b.imshow(np.random.rand(4, 4), cmap=cm)
        b.set_xlabel("x")
        b.set_ylabel("y")
        for i, col in enumerate(["#d62728", "#2ca02c", "#9467bd", "#17becf", "#bcbd22", "#e377c2"]):
            c.plot([0, 1], [i, i + 1], color=col)
        report = ap.check(p)
        found = codes(report)
        for code in ("library-colours", "legend-covers-data", "crowded-ticks", "title",
                     "tiny-text", "small-text", "missing-unit", "rainbow-colormap", "raster",
                     "too-many-hues", "missing-label", "page-width", "text-overlap"):
            self.assertIn(code, found, code)

    def test_accent_3d_and_page(self):
        p = fresh("ab", size="double", height=3.2, kinds={"b": "3d"})
        a = p["a"]
        for k in range(3):
            a.plot([0, 1], [k, k + 1], color=ap.color("ours"), label="m%d" % k)
        a.set_xlabel("x")
        a.set_ylabel("y")
        b = p["b"]
        b.xaxis.set_pane_color((0.9, 0.9, 0.9, 1)) if hasattr(b.xaxis, "set_pane_color") else None
        b.grid(True)
        b.set_xticks(np.arange(8))
        b.set_xticklabels([str(v) for v in range(8)])
        found = codes(ap.check(p))
        for code in ("accent-overused", "3d-panes", "3d-grid", "3d-ticks", "tall-page"):
            self.assertIn(code, found, code)
        ramp = fresh("a")
        for k, col in enumerate(ap.ramp(3)):
            ramp["a"].plot([0, 1], [k, k], color=col, label=str(k))
        self.assertNotIn("accent-overused", codes(ap.check(ramp)))

    def test_a_plot_for_a_diagram_cell_needs_no_column_width(self):
        p, ax = ap.figure(size=(2.1, 1.4), panel=True)
        ax.plot([1, 10], [1, 100])
        ax.set_yscale("log")
        ax.set_xlabel("x")
        ax.set_ylabel("y")
        self.assertNotIn("page-width", codes(ap.check(p)))
        m = p.save(slug="cell", out=OUT, quiet=True)
        self.assertTrue(m["panel"])
        self.assertEqual(m["panels"][0]["yscale"], "log")
        q, bx = ap.figure(size=(2.1, 1.4))
        bx.plot([0, 1], [0, 1])
        self.assertIn("page-width", codes(ap.check(q)))

    def test_off_page_and_empty_panel(self):
        p = fresh("ab")
        p["a"].text(-0.5, 0.5, "far outside the page", transform=p["a"].transAxes).set_in_layout(False)
        found = codes(ap.check(p))
        self.assertIn("off-page", found)
        self.assertIn("empty-panel", found)


class Genres(unittest.TestCase):
    def test_toy_flow_is_exact(self):
        data, means, std = ap.toy.ring(k=4, radius=2, std=0.1, n=50)
        self.assertEqual(data.shape, (50, 2))
        ode, t = ap.toy.flow(means, std, n=200, steps=60, kind="ode")
        ends = ode[:, -1]
        nearest = np.min(np.linalg.norm(ends[:, None] - means[None], axis=-1), 1)
        self.assertLess(np.median(nearest), 0.25)
        straight, _ = ap.toy.flow(means, std, n=5, kind="straight")
        mid = straight[:, 40]
        self.assertTrue(np.allclose(mid, 0.5 * (straight[:, 0] + straight[:, -1]), atol=1e-6))
        sde, _ = ap.toy.flow(means, std, n=5, kind="sde", eps=0.5)
        self.assertEqual(sde.shape, (5, 81, 2))
        x = np.linspace(-6, 6, 2001)[:, None]
        p = ap.toy.gmm_density(x, 0.5, np.array([[-1.0], [1.0]]), 0.3)
        self.assertAlmostEqual(float(p.sum() * (x[1, 0] - x[0, 0])), 1.0, places=3)
        v = ap.toy.gmm_velocity(np.zeros((1, 2)), 1.0, means, std)
        self.assertTrue(np.allclose(v, 0))
        self.assertEqual(ap.toy.moons(n=20).shape, (20, 2))
        self.assertEqual(ap.toy.checkerboard(n=100).shape[1], 2)
        self.assertEqual(ap.toy.swiss_roll(n=30)[0].shape, (30, 3))
        f = ap.toy.landscape()
        run = ap.toy.descend(f, (-0.45, 1.75), lr=0.16, momentum=0.4, steps=40)
        self.assertLess(f(*run[-1]), f(*run[0]))
        for kind in ("rosenbrock", "saddle"):
            self.assertTrue(np.isfinite(ap.toy.landscape(kind)(0.5, 0.5)))

    def test_paths_fields_and_teasers_draw(self):
        p = fresh("abcdef", size="double")
        xy = np.cumsum(np.ones((20, 2)), 0)
        ap.path(p["a"], xy, arrows=2, label="ours")
        ap.path(p["a"], xy, cmap_="seq")
        many, t = ap.toy.flow(np.array([[2.0, 0], [-2, 0]]), 0.2, n=10, steps=20)
        ap.paths(p["b"], many, label="ode")
        f = ap.toy.landscape()
        ap.landscape(p["c"], f)
        v = lambda X, Y: (-Y, X)
        ap.field(p["d"], v, by_magnitude=True)
        ap.field(p["d"], v, kind="stream")
        one, t1 = ap.toy.flow(np.array([[-1.0], [1.0]]), 0.3, n=10, steps=30)
        ap.sampling_1d(p["e"], one[..., 0], t1,
                       density=lambda y, s: ap.toy.gmm_density(y[:, None], s, np.array([[-1.0], [1.0]]), 0.3))
        ap.flow_strip(p["f"], many, t, snapshots=(0, 0.5, 1), n_paths=5)
        self.assertGreater(len(p["b"].collections), 2)
        self.assertEqual([x.get_text() for x in p["e"].get_xticklabels()][0], "$t=0$\nnoise")
        self.assertEqual(ap.check(p)["errors"], [])

    def test_distributions_draw(self):
        r = np.random.default_rng(0)
        d = {"A": r.normal(0, 1, 200), "B": r.normal(1, 1, 200)}
        p = fresh("abcdefgh", size="double", height=2.6,
                  kinds={"h": "joint"})
        ap.densities(p["a"], d, ours=1, rug=True, means=True)
        ap.hist(p["b"], d, kind="bar")
        ap.hist(p["b"], d)
        ap.violin(p["c"], d, ours=1, points=True)
        ap.box(p["d"], d, ours=0)
        ap.ecdf(p["e"], d)
        ap.ridgeline(p["f"], d, gradient=False, ours=1)
        xy = r.normal(0, 1, (300, 2))
        X, Y, Z = ap.density(p["g"], xy, points=50, label="data")
        self.assertEqual(Z.shape, (120, 120))
        ap.mixture(p["g"], [[0, 0], [1, 1]], covs=[0.1, 0.2], weights=[0.7, 0.3])
        ap.joint(p["h"], xy[:, 0], xy[:, 1], groups=(xy[:, 0] > 0).astype(int),
                 labels=["a", "b"], marginal="hist")
        self.assertEqual(p["c"].get_xticklabels()[1].get_color(), ap.color("ours-ink"))
        levels = ap.hdr_levels(Z, (0.5, 0.95))
        self.assertLess(levels[0], levels[1])
        self.assertAlmostEqual(float(ap.kde1d(r.normal(0, 1, 500), np.linspace(-8, 8, 801)).sum() * 0.02), 1.0, places=2)

    def test_3d_draws(self):
        p = fresh("abc", size="double", kinds={"a": "3d", "b": "3d", "c": "3d"})
        X, Y = np.meshgrid(np.linspace(-1, 1, 20), np.linspace(-1, 1, 20))
        f = lambda x, y: x ** 2 + y ** 2
        s = ap.surface(p["a"], X, Y, f(X, Y), path=np.array([[1, 1], [0, 0]]), f=f, floor=True)
        self.assertTrue(s.get_rasterized())
        xyz, t = ap.toy.swiss_roll(n=100)
        ap.cloud(p["b"], xyz, values=t)
        ap.cloud(p["b"], xyz, equal=False)
        ap.swiss_roll_surface(p["b"], points=xyz, values=t)
        ap.sphere(p["c"], geodesics=[((1, 0, 0), (0, 1, 0)), ((0, 0, 1), (-1, 0, -0.2))],
                  points=np.array([[0, 0, 1.0]]))
        arc = ap.geodesic((1, 0, 0), (0, 1, 0), n=5)
        self.assertTrue(np.allclose(np.linalg.norm(arc, axis=1), 1))
        self.assertTrue(np.allclose(ap.geodesic((1, 0, 0), (1, 0, 0), n=3), [[1, 0, 0]] * 3))
        ap.clean3d(p["a"], ticks=True, labels=("x", "y", "z"))
        self.assertEqual(p["a"].get_xlabel(), "x")
        report = ap.check(p)
        self.assertIn("raster", codes(report))
        # Why not empty: a z label beside a 3D panel at the page edge is a real off-page finding.
        self.assertEqual([e["code"] for e in report["errors"] if e["code"] != "off-page"], [])

    def test_results_draw(self):
        p = fresh("abcde", size="double", kinds={"d": "polar"})
        bars = ap.bars(p["a"], {"A": [1, 2], "B": [2, 3]}, groups=["x", "y"],
                       errors={"A": [0.1, 0.1], "B": [0.2, 0.2]}, ours="B", best="max")
        self.assertEqual(bars[1].patches[0].get_facecolor()[:3],
                         ap.mcolors.to_rgb(ap.color("ours")))
        self.assertEqual(bars[0].patches[0].get_hatch(), "////")
        ap.bars(p["a"], [[1, 2, 3]], hatches=False, labels=False, ylim=(0, 5))
        x = np.arange(10)
        lines = ap.curves(p["b"], x, {"A": np.ones((3, 10)), "B": np.zeros((3, 10))},
                          ours="B", band="sem", smooth=3, markers=True)
        self.assertEqual(lines["B"].get_color(), ap.color("ours"))
        ap.curves(p["b"], x, {"A": np.ones(10)}, band="minmax")
        ap.heat_table(p["c"], [[1, 2], [3, 4]], ["r1", "r2"], ["c1", "c2"], best="min",
                      highlight_row=0)
        bold = [t for t in p["c"].texts if t.get_fontweight() == "bold"]
        self.assertEqual(sorted(t.get_text() for t in bold), ["1.0", "2.0"])
        ap.heat_table(p["c"], [[1, 2]], ["r"], ["a", "b"], axis=1, best=None, vmin=0, vmax=4)
        ap.radar(p["d"], ["a", "b", "c"], {"A": [1, 2, 3], "B": [2, 2, 2]}, ours="B")
        self.assertEqual(p["d"].get_xlim(), (0.0, 2 * np.pi))
        ap.dots(p["e"], ["full", "no x"], [2.0, 1.0], errors=[0.1, 0.2], ours=0, ref=1.5,
                fmt="{:.1f}", xlabel="score")
        self.assertEqual(p["e"].get_yticklabels()[0].get_color(), ap.color("ours-ink"))

    def test_4d_helpers_draw(self):
        r = np.random.default_rng(0)
        p = fresh("abcd", size="double", height=2.4, kinds={"a": "3d", "b": "3d", "c": "3d"})
        xyz = r.normal(0, 1, (80, 3))
        sc = ap.cloud4d(p["a"], xyz, xyz[:, 0], size_by=xyz[:, 1], label="score",
                        size_label="n")
        self.assertEqual(len(sc.get_sizes()), 80)
        X, Y = np.meshgrid(np.linspace(-1, 1, 12), np.linspace(-1, 1, 10))
        self.assertTrue(ap.surface4d(p["b"], X, Y, X * Y, X ** 2, label="C").get_rasterized())
        paths = np.cumsum(r.normal(0, 0.1, (2, 30, 3)), 1)
        coll = ap.trajectories3d(p["c"], paths, label="t")
        self.assertEqual(len(coll.get_array()), 2 * 29)
        positions = np.cumsum(r.normal(0, 0.1, (20, 5, 2)), 0)
        trail = ap.trails(p["d"], positions, length=6)
        self.assertEqual(len(trail.get_segments()), 5 * 6)
        p["d"].set_xlabel("x")
        p["d"].set_ylabel("y")
        bars = [ax for ax in p.fig.axes if getattr(ax, "_aster_colorbar", False)]
        self.assertEqual(len(bars), 3)
        self.assertEqual(bars[0].yaxis.label.get_fontsize(), 7)
        report = ap.check(p)
        self.assertEqual([e["code"] for e in report["errors"] if e["code"] != "off-page"], [])
        q = fresh("abc", size="double", kinds=dict((k, "3d") for k in "abc"), labels=None)
        frames = [r.normal(0, 1, (40, 3)) * (1 + k) for k in range(3)]
        ap.snapshots3d(list(q), frames, [0, 0.5, 1], values=[f[:, 0] for f in frames], view=(10, 20))
        self.assertEqual(q["a"].get_xlim(), q["c"].get_xlim())
        self.assertEqual((q["b"].elev, q["b"].azim), (10, 20))
        self.assertEqual(q["b"].get_title("center"), "$t=0.5$")
        self.assertNotIn("title", codes(ap.check(q)))
        g = fresh((2, 3), labels=None)
        field = r.random((2, 3, 8, 8))
        image = ap.slices(list(g), field, [0, 1], [0, 0.5, 1], label="density")
        self.assertEqual(image.norm.vmax, float(field.max()))
        self.assertEqual(g["a"].get_ylabel(), "$z=0$")
        self.assertEqual(g["c"].get_title("center"), "$t=1$")
        self.assertEqual(g["e"].get_title("center"), "")
        bare = fresh((1, 1), labels=None)
        ap.slices(list(bare), field[:1, :1], [0], [0])
        self.assertIn("missing-label", codes(ap.check(bare)))

    def test_projections_and_parallel_coordinates(self):
        r = np.random.default_rng(1)
        X = np.c_[r.normal(0, 3, 200), r.normal(0, 1, 200), r.normal(0, 0.1, (200, 8))]
        coords, ratio = ap.project(X, 2)
        self.assertEqual(coords.shape, (200, 2))
        self.assertGreater(ratio[0], ratio[1])
        p = fresh("abcd", size="double")
        ap.embedding(p["a"], X, labels=np.arange(200) % 3, names=["x", "y", "z"])
        self.assertTrue(p["a"].get_xlabel().startswith("PC1 ("))
        ap.embedding(p["b"], coords, values=np.arange(200), label="step")
        self.assertEqual(p["b"].get_xlabel(), "dim 1")
        ap.embedding(p["c"], coords, labels=np.arange(200) % 2, names=["base", "ours"], ours="ours")
        self.assertEqual(ap.mcolors.to_hex(p["c"].collections[1].get_facecolor()[0]), ap.color("ours"))
        data = np.c_[10 ** r.uniform(-4, -2, 30), r.integers(1, 9, 30)]
        ap.parallel(p["d"], data, ["lr", "depth"], groups=np.arange(30) % 2, ours=1,
                    group_names=["a", "b"], log=["lr"])
        texts = [t.get_text() for t in p["d"].texts]
        self.assertTrue(any(t.startswith("1e-4") or t.endswith("e-4") or "e-" in t for t in texts))
        self.assertEqual(ap._compact(0.000123), "1e-4")
        self.assertEqual(ap._compact(12.5), "12.5")
        q = fresh("a")
        ap.parallel(q["a"], data, ["lr", "depth"], values=data[:, 1], label="depth")

    def test_class_colours_stay_apart(self):
        ap.use()
        for n in (2, 3, 4, 5):
            colours = ap.series(n, ours=None, hues=True)
            self.assertEqual(colours[0], ap.color("ours"))
            for i in range(n):
                for j in range(i + 1, n):
                    a, b = colours[i], colours[j]
                    self.assertGreater(np.linalg.norm(ap.oklab(a) - ap.oklab(b)), 0.045, (n, i, j))
        self.assertNotIn(ap.color("ours"), ap.series(3, ours=0, hues=True)[1:])

    def test_runs_from_metrics_files(self):
        paths = []
        for seed in range(2):
            name = os.path.join(OUT, "m%d.jsonl" % seed)
            with open(name, "w") as handle:
                for step in range(5):
                    handle.write(json.dumps({"step": step * 10, "split": "val",
                                             "metrics": {"loss": 1.0 / (step + 1) + seed}}) + "\n")
                    handle.write(json.dumps({"step": step * 10, "split": "train",
                                             "metrics": {"loss": 9}}) + "\n")
                handle.write("not json\n")
            paths.append(name)
        steps, values = ap.read_metrics(paths[0], "loss", split="val")
        self.assertEqual(list(steps), [0, 10, 20, 30, 40])
        self.assertEqual(values[0], 1.0)
        flat = os.path.join(OUT, "flat.jsonl")
        with open(flat, "w") as handle:
            handle.write('{"acc": 0.5}\n{"acc": 0.7}\n')
        self.assertEqual(list(ap.read_metrics(flat, "acc")[0]), [0, 1])
        x, runs = ap.load_runs({"ours": paths}, "loss", split="val", n=5)
        self.assertEqual(runs["ours"].shape, (2, 5))
        with self.assertRaises(ValueError):
            ap.load_runs({"ours": paths}, "missing")


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0], "-v"], exit=True)
`

test('aster_plot.py passes its own tests', { skip, timeout: 300_000 }, async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'aster-plot-py-'))
  try {
    await writeFile(path.join(folder, 'aster_plot.py'), asterPlotSource())
    await writeFile(path.join(folder, 'test_aster_plot.py'), TESTS)
    const hex = figureStyle('graphite', '#cc3366').accents[0]
    await writeFile(
      path.join(folder, 'expected.json'),
      JSON.stringify({
        hex: { solid: hex.solid, fill: hex.fill },
        slateTeal: figureStyle('slate', 'teal').accents[0].solid,
        mono: figureStyle('print-mono').accents[0].solid,
        tealInk: figureStyle('graphite', 'teal').accents[0].ink
      })
    )
    const out = path.join(folder, 'out')
    const result = spawnSync(
      python,
      [path.join(folder, 'test_aster_plot.py'), path.join(folder, 'expected.json'), out],
      {
        cwd: folder,
        encoding: 'utf8',
        env: { ...process.env, MPLBACKEND: 'Agg', PYTHONDONTWRITEBYTECODE: '1' }
      }
    )
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
