// Round 12 of the plot layer: toy maths, legends that fit, the hidden-content check and fixed
// false positives, occlusion-aware 3D paths, significance marks, small embedded SVGs, layouts that
// never collapse, and kit names that always resolve. The Python part is skipped cleanly when this
// computer has no Python with numpy and matplotlib.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { resolveKitQuery } from './research-figures-kit-resolve.mjs'
import { KIT_TOPICS } from './research-figures-kit-index.mjs'
import { PLOT_API_INDEX } from './research-figures-plot-api.mjs'
import { asterPlotSource } from './research-figures-plot-lib.mjs'
import { PLOT_KINDS, customSize } from './research-figures-plot.mjs'
import { TEMPLATES } from './research-figures-templates.mjs'
import { createPythonFinder } from './research-python-finder.mjs'

const python = await createPythonFinder({ modules: ['numpy', 'matplotlib'] })()
const skip = python ? false : 'no Python with numpy and matplotlib'

const TESTS = String.raw`
import itertools, os, sys, unittest, xml.dom.minidom
import numpy as np
import aster_plot as ap
import matplotlib.pyplot as plt

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


def codes(report, level=None):
    levels = [level] if level else ("errors", "warnings", "notes")
    return [item["code"] for lv in levels for item in report[lv]]


class Toy(unittest.TestCase):
    def test_exact_gradients(self):
        for name in ("rosenbrock", "beale", "himmelblau", "booth", "rastrigin", "quadratic",
                     "saddle", "sharp-flat", "two-basins"):
            f = ap.toy.fn(name)
            p = np.array([0.37, -0.61])
            e = 1e-6
            fd = [(f(*(p + e * d)) - f(*(p - e * d))) / (2 * e) for d in np.eye(2)]
            np.testing.assert_allclose(f.grad(p), fd, rtol=1e-4, atol=1e-4, err_msg=name)
            self.assertEqual(f.hess(p).shape, (2, 2))

    def test_optimisers_behave(self):
        f = ap.toy.fn("sharp-flat")
        sophia = ap.toy.optimize(f, (0.3, 0.0), "sophia", lr=1.0, steps=10)
        np.testing.assert_allclose(sophia[-1], [1, 4], atol=1e-3)
        newton = ap.toy.optimize(f, (0.3, 0.0), "diag-newton", lr=1.0, steps=10)
        np.testing.assert_allclose(newton[-1], [0, 4], atol=1e-3)  # the saddle
        gd = ap.toy.optimize(f, (0.3, 0.0), "gd", lr=0.025, steps=10)
        self.assertLess(gd[-1][1], 2.0)
        for method in ("momentum", "nesterov", "rmsprop", "adam", "sign", "signum", "lion",
                       "newton"):
            run = ap.toy.optimize("quadratic", (-1.8, 0.8), method, lr=0.05, steps=30)
            self.assertEqual(run.shape, (31, 2))
            self.assertLess(np.linalg.norm(run[-1]), np.linalg.norm(run[0]), method)
        a = ap.toy.optimize("rosenbrock", None, "adam", lr=0.02, steps=40, noise=0.3, seed=4)
        b = ap.toy.optimize("rosenbrock", None, "adam", lr=0.02, steps=40, noise=0.3, seed=4)
        np.testing.assert_array_equal(a, b)
        masked = ap.toy.optimize("quadratic", (-1.8, 0.8), "momentum", lr=0.05, steps=5,
                                 cautious=True)
        self.assertEqual(masked.shape, (6, 2))
        old = ap.toy.descend(ap.toy.landscape("two-basins"), (-0.45, 1.75), lr=0.16,
                             momentum=0.4, steps=45)
        self.assertLess(np.linalg.norm(old[-1] - [1.07, 0.61]), 0.1)

    def test_assignment_matches_brute_force(self):
        r = ap.toy.rng(3)
        x, y = r.standard_normal((6, 2)), r.standard_normal((6, 2))
        C = ap.toy.cost(x, y)
        perm = ap.toy.assignment(C)
        best = min(itertools.permutations(range(6)), key=lambda q: C[range(6), q].sum())
        self.assertAlmostEqual(C[range(6), perm].sum(), C[range(6), best].sum())
        self.assertEqual(sorted(ap._hungarian(C)), list(range(6)))
        self.assertAlmostEqual(C[range(6), ap._hungarian(C)].sum(), C[range(6), best].sum())

    def test_sinkhorn_and_couplings(self):
        r = ap.toy.rng(1)
        x, y = r.standard_normal((40, 2)), r.standard_normal((30, 2)) + 2
        P = ap.toy.sinkhorn(ap.toy.cost(x, y))
        np.testing.assert_allclose(P.sum(1), 1 / 40, rtol=1e-3)
        np.testing.assert_allclose(P.sum(0), 1 / 30, rtol=1e-3)
        a, b = ap.toy.moons(64, seed=1), ap.toy.ring(4, 3, 0.2, 64, seed=2)[0]
        for kind in ("independent", "ot", "minibatch", "sinkhorn"):
            p0, p1 = ap.toy.couple(a, b, kind, batch=16)
            self.assertEqual(p1.shape, (64, 2))
        ind = ap.toy.couple(a, b, "independent")[1]
        ot = ap.toy.couple(a, b, "ot")[1]
        self.assertLess(((a - ot) ** 2).sum(), ((a - ind) ** 2).sum())
        paths, times = ap.toy.pair_flow(a[:5], a, ot, sigma=0.2, steps=20)
        self.assertEqual(paths.shape, (5, 21, 2))

    def test_mixture_flows_reach_their_target(self):
        src = ap.toy.mix([[-2, 0], [2, 0]], 0.2)
        dst = ap.toy.mix([[0, -2], [0, 2]], 0.2)
        for coupling in (None, "class"):
            paths, times = ap.toy.flow(dst, source=src, n=200, steps=60, coupling=coupling)
            end = paths[:, -1]
            self.assertLess(np.abs(np.abs(end[:, 1]) - 2).mean(), 0.3)
            self.assertLess(np.abs(end[:, 0]).mean(), 0.35)
        x = np.array([[0.3, -0.2], [1.0, 0.5]])
        for t in (0.2, 0.7):
            for sched in ("linear", "trig"):
                v = ap.toy.bridge_velocity(x, t, src, dst, schedule=sched, gamma=0.5)
                self.assertEqual(v.shape, (2, 2))
        dens = ap.toy.bridge_density(np.linspace(-6, 6, 4001), 0.5, ap.toy.mix([-2, 2], 0.3),
                                     ap.toy.mix([0], 0.5))
        self.assertAlmostEqual(dens.sum() * 12 / 4000, 1.0, places=3)
        z = ap.toy.interpolant(np.zeros((3, 2)), np.ones((3, 2)), np.linspace(0, 1, 5), gamma=1.0)
        self.assertEqual(z.shape, (3, 5, 2))
        np.testing.assert_allclose(z[:, -1], 1.0)

    def test_samplers_and_guidance(self):
        data = ap.toy.mix([-2, 2], 0.3, labels=["a", "b"])
        for sampler in ("ode", "sde", "ddim", "ddpm"):
            for process in ("vp", "ve"):
                paths, times = ap.toy.sample(data, sampler, process, n=300, steps=50)
                self.assertEqual(paths.shape, (300, 51))
                self.assertLess(abs(np.abs(paths[:, -1]).mean() - 2), 0.3, (sampler, process))
                self.assertGreater(times[0], times[-1])
        guided, _ = ap.toy.sample(data, "ode", n=200, label="a", guidance=2.0)
        self.assertLess(guided[:, -1].max(), 0)
        self.assertLess(guided[:, -1].std(), 0.3)
        f = ap.toy.integrate(lambda x, t: -x, np.array([1.0]), np.linspace(0, 1, 11))
        self.assertAlmostEqual(f[-1][0], np.exp(-1), places=5)


class Legends(unittest.TestCase):
    def test_cell_fits_and_bands_show_fills(self):
        plt.close("all")
        p = ap.panels("ab", size="double", height=2.0, sharex=True, legend="bottom")
        x = np.linspace(0, 1, 30)
        for ax in p:
            ap.curves(ax, x, dict(("m%d" % k, np.sin(x + k)[None] + 0.05 * ap.toy.rng(k)
                                   .standard_normal((3, 30))) for k in range(9)), ours="m8")
        leg = p.legend()
        p.fig.canvas.draw()
        cell = p["@"].get_window_extent().height
        need = leg.get_window_extent().height
        self.assertLess(abs(cell - need - 4 * p.fig.dpi / 72), 1.0 * p.fig.dpi / 72)
        self.assertLessEqual(leg.get_window_extent().width, p.fig.bbox.width)
        self.assertTrue(any(isinstance(h, tuple) for h in ap.collect_handles(p.fig)))
        self.assertTrue(p["b"].get_xticklabels()[0].get_visible())

    def test_top_legend_and_clear_corner(self):
        plt.close("all")
        p = ap.panels("ab", size="single", height=1.8)
        for ax in p:
            ax.plot([0, 1], [0, 1], label="ours")
            ax.plot([0, 1], [1, 0], label="baseline")
        leg = p.legend()
        p.fig.canvas.draw()
        top = max(ax.get_tightbbox().y1 for ax in p)
        self.assertGreaterEqual(leg.get_window_extent().y0, top - 1)
        plt.close("all")
        p, ax = ap.figure(size="single", height=1.8)
        x = np.linspace(0, 1, 50)
        ax.plot(x, 1 - x ** 0.3, label="loss")
        ax.plot(x, 0.9 - x ** 0.25, label="baseline")
        ax.set_xlabel("step")
        ax.set_ylabel("loss")
        ap.legend(ax)
        self.assertNotIn("legend-covers-data", codes(ap.check(p)))
        h = ap.handle("ours", kind="patch", color="#336699", alpha=0.3)
        self.assertEqual(ap.mcolors.to_hex(h.get_edgecolor()), "#336699")
        self.assertEqual(len(ap.handle("band", kind="band")), 2)


class Checks(unittest.TestCase):
    def test_no_false_positives(self):
        plt.close("all")
        p = ap.panels("a", size=(3.25, 2.4), kinds={"a": "3d"})
        f = ap.toy.fn("sharp-flat")
        X, Y, Z = f.grid(30)
        ap.surface(p["a"], X, Y, Z)
        p["a"].text(1, 4, float(f(1, 4)), "minimum")
        self.assertNotIn("off-page", codes(ap.check(p)))
        plt.close("all")
        p, ax = ap.figure(size="single", height=1.8)
        ax.loglog([1e6, 1e9], [2, 1])
        ax.set_xlim(1.2e6, 1e9)
        ax.set_xlabel("parameters")
        ax.set_ylabel("loss (nats)")
        self.assertEqual(codes(ap.check(p), "errors"), [])
        self.assertNotIn("missing-unit", codes(ap.check(p)))
        plt.close("all")
        p = ap.panels("ab", size="single", height=1.6, sharey=True)
        for ax in p:
            ax.plot([0, 1], [0, 1])
        p["a"].set_ylabel("loss")
        p.xlabel("step")
        self.assertNotIn("missing-label", codes(ap.check(p)))

    def test_hidden_text_and_curves(self):
        plt.close("all")
        p = ap.panels("a", size="single", height=2.2, kinds={"a": "polar"})
        ap.radar(p["a"], list("ABCDE"), {"b": [40, 50, 60, 55, 45], "o": [80, 85, 90, 88, 86]},
                 ring_labels=False)
        p["a"].set_yticklabels(["%g" % v for v in p["a"].get_yticks()])
        self.assertIn("hidden-text", codes(ap.check(p)))
        plt.close("all")
        p = ap.panels("a", size="single", height=2.2, kinds={"a": "polar"})
        ap.radar(p["a"], list("ABCDE"), {"b": [40, 50, 60, 55, 45], "o": [80, 85, 90, 88, 86]})
        self.assertNotIn("hidden-text", codes(ap.check(p)))
        plt.close("all")
        p, ax = ap.figure(size="single", height=1.6)
        x = np.linspace(0, 1, 40)
        ax.plot(x, x * x, lw=0.8, ls=":", label="Adam")
        ax.plot(x, x * x, lw=2.4, label="SignGD", color="#999999")
        ax.fill_between(x, 0.2, 0.5, color="#dddddd", zorder=5)
        ax.plot(x, 0.3 + 0 * x, lw=1, label="flat", zorder=2)
        found = [i["message"] for i in ap.check(p)["warnings"] if i["code"] == "hidden-curve"]
        self.assertTrue(any("Adam" in m for m in found))
        self.assertTrue(any("flat" in m for m in found))


class Space(unittest.TestCase):
    def test_paths_know_what_the_surface_hides(self):
        plt.close("all")
        p = ap.panels("a", size=(3.25, 2.5), kinds={"a": "3d"}, labels=None)
        ax = p["a"]
        X, Y = np.meshgrid(np.linspace(-2, 2, 50), np.linspace(-2, 2, 50))
        Z = 3 * np.exp(-(X ** 2) * 4)
        ap.clean3d(ax, view=(10, 0), labels=("x", "y", "z"))
        behind = np.column_stack([np.full(20, -1.8), np.linspace(-1.5, 1.5, 20), np.full(20, 0.05)])
        front = np.column_stack([np.full(20, 1.8), np.linspace(-1.5, 1.5, 20), np.full(20, 0.05)])
        self.assertTrue(ap.hidden3d(ax, behind, X, Y, Z).all())
        self.assertFalse(ap.hidden3d(ax, front, X, Y, Z).any())
        f = lambda x, y: 3 * np.exp(-(x ** 2) * 4)  # noqa: E731
        ap.surface(ax, X, Y, Z, f=f, paths={"far": behind[:, :2], "ours": front[:, :2]},
                   ours="ours", contours=6)
        labels = [h.get_label() for h in ap.collect_handles(p.fig)]
        self.assertEqual(sorted(labels), ["far", "ours"])
        elev, azim = ap.view3d(ax)
        self.assertIn(elev, (18, 26, 34, 42, 52))
        ap.label3d(ax, (1.8, 0, 0), "start")
        m = p.save(out=OUT, slug="space", quiet=True)
        self.assertEqual(m["findings"]["errors"], [])
        self.assertTrue(any(r["what"] == "3D surface faces" for r in m["raster"]))


class Results(unittest.TestCase):
    def test_stars_and_brackets(self):
        self.assertEqual([ap.stars(p) for p in (0.0005, 0.005, 0.03, 0.2)],
                         ["***", "**", "*", "n.s."])
        self.assertEqual(ap.stars(0.00005, ap.SIG_LEVELS_FINE), "****")
        self.assertEqual(ap.p_text(0.0123), "$p = 0.012$")
        self.assertEqual(ap.p_text(0.0001), "$p < 0.001$")
        plt.close("all")
        p, ax = ap.figure(size="single", height=2.0)
        vals = {"A": [5.0, 4.0], "B": [5.6, 4.2], "C": [6.0, 4.4]}
        ap.bars(ax, vals, groups=["x", "y"], ours=["B", "C"], hatches={"A": "////"},
                stars=[(0, "A", "B", 0.003), (0, "A", "C", 0.0004), (1, "A", "C", 0.3),
                       (1, "B", None, 0.04)])
        ax.set_ylabel("score")
        marks = [t.get_text() for t in ax.texts if t.get_text() in ("**", "***", "n.s.", "*")]
        self.assertEqual(sorted(marks), ["*", "**", "***", "n.s."])
        tops = [t.get_position()[1] for t in ax.texts if t.get_text() in ("**", "***")]
        self.assertGreater(min(tops), 6.0)
        self.assertLess(max(tops) + 0.1, ax.get_ylim()[1] + 1e-9)
        self.assertEqual(codes(ap.check(p), "errors"), [])
        hatches = [c.patches[0].get_hatch() for c in ax.containers]
        self.assertEqual(hatches, ["////", None, None])


class Files(unittest.TestCase):
    def test_embed_is_small_and_layout_never_collapses(self):
        plt.close("all")
        p = ap.panels("ab", size="single", height=1.6)
        x = ap.toy.rng(0).standard_normal((6000, 2))
        p["a"].scatter(*x.T, s=1, lw=0)
        paths, _ = ap.toy.flow(ap.toy.ring(8, 2, 0.15, 10)[1], 0.15, n=120, steps=80)
        segs = [s for path_ in paths for s in ap._segments(path_)]
        p["b"].add_collection(ap.LineCollection(segs, colors=[(0.2, 0.4, 0.8, a) for a in
                                                              np.tile(np.linspace(0.1, 0.7, 80), 120)]))
        p["b"].autoscale_view()
        for ax in p:
            ap.no_ticks(ax)
        p["a"].set_title("seven", fontsize=7)
        m = p.save(out=OUT, slug="dense", quiet=True)
        self.assertEqual(m["text"]["minPt"], 7.0)
        embed = os.path.join(OUT, "dense.embed.svg")
        xml.dom.minidom.parse(embed)
        self.assertLess(os.path.getsize(embed), 600000)
        self.assertTrue(any(r["panel"] == "a" for r in m["raster"]))
        self.assertIn("raster", [n["code"] for n in m["findings"]["notes"]])
        plt.close("all")
        p = ap.panels("abc", size=(1.2, 0.5), panel=True, labels=None)
        for ax in p:
            ax.plot([1, 10, 100], [1, 0.1, 0.01])
            ax.set_xlabel("rank")
        m = p.save(out=OUT, slug="tiny", quiet=True)
        self.assertTrue(all(q["box"]["w"] > 0.05 for q in m["panels"]))
        plt.close("all")
        p = ap.panels("ab", size=(1.5, 0.6), panel=True, labels=None)
        p.place("a", (4, 4, 90, 70))
        m = p.save(out=OUT, slug="placed", quiet=True)
        box = m["panels"][0]["box"]
        self.assertAlmostEqual(box["x"] * 144, 4, places=1)
        self.assertAlmostEqual(box["w"] * 144, 90, places=1)


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0], "-v"], exit=True)
`

test(
  'aster_plot round 12: toy maths, legends, checks, 3D, results, files',
  {
    skip,
    timeout: 300_000
  },
  async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), 'aster-plot-r12-'))
    try {
      await writeFile(path.join(folder, 'aster_plot.py'), asterPlotSource())
      await writeFile(path.join(folder, 'test_r12.py'), TESTS)
      const result = spawnSync(
        python,
        [path.join(folder, 'test_r12.py'), path.join(folder, 'out')],
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
  }
)

test('every kit topic, template, plot kind and aster_plot helper resolves; lists mix them', () => {
  for (const name of [...KIT_TOPICS, ...Object.keys(TEMPLATES), ...Object.keys(PLOT_KINDS)]) {
    assert.ok(resolveKitQuery(name).length > 0, name)
  }
  assert.match(resolveKitQuery('radar'), /radar\(ax, categories/)
  assert.match(resolveKitQuery('line,colors,dit'), /line is polyline[\s\S]*fig\.template\('dit'/)
  assert.match(resolveKitQuery('sinkhorn,radar', { plot: true }), /ap\.toy\.sinkhorn[\s\S]*radar/)
  assert.match(resolveKitQuery('results', { plot: true }), /^Results and Runs:/)
  assert.throws(() => resolveKitQuery('raadar'), /did you mean radar\?/)
  assert.throws(() => resolveKitQuery('dit', { plot: true }), /aster_plot helper/)
})

test('the plot kit index names every new helper with its options', () => {
  for (const name of [
    'ap.toy.sinkhorn(',
    'ap.toy.assignment(',
    'ap.toy.couple(',
    'ap.toy.sample(',
    'ap.toy.optimize(',
    'ap.toy.bridge_velocity(',
    'ap.toy.integrate(',
    'ap.toy.euler_maruyama(',
    'band(',
    'path3d(',
    'view3d(',
    'label3d(',
    'significance(',
    'p.place(',
    'p.xlabel('
  ]) {
    assert.ok(PLOT_API_INDEX.includes(`  ${name}`), name)
  }
})

test('--size takes units; scene units make a diagram cell', () => {
  assert.deepEqual(customSize('3.25x2'), { width: 3.25, height: 2, cell: false })
  assert.deepEqual(customSize('312x216u'), { width: 2.1667, height: 1.5, cell: true })
  assert.deepEqual(customSize('234x144pt'), { width: 3.25, height: 2, cell: false })
  assert.deepEqual(customSize('8.255x5.08cm'), { width: 3.25, height: 2, cell: false })
  assert.equal(customSize('huge'), null)
})
