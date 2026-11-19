// Plot starters, 3D and results: what
// `figures plot new --kind <kind>` writes. Each is a finished demo on toy data, so the agent starts
// from a page-true, checked figure and swaps in the project's data.
export const PLOT_STARTERS_RESULTS = {
  surface: {
    label: '3D loss surface with optimiser paths, beside its top view',
    text: String.raw`"""A 3D loss landscape with three optimisers' paths, and the same paths on its contour map."""
import numpy as np
import aster_plot as ap

# Toy landscape and optimisers (exact gradients); replace with your logged trajectories (steps, 2).
f = ap.toy.fn("two-basins")
start = (-0.45, 1.75)
runs = {
    "SGD": ap.toy.optimize(f, start, "sgd", lr=0.2, steps=45, noise=0.9, seed=1),
    "Adam": ap.toy.optimize(f, start, "adam", lr=0.12, steps=45),
    "Ours": ap.toy.optimize(f, start, "momentum", lr=0.16, momentum=0.4, steps=45),
}
X, Y, Z = f.grid(70, xlim=(-2.6, 2.6), ylim=(-2.2, 2.2))
p = ap.panels("ab", size="double", height=2.3, kinds={"a": "3d"}, width_ratios=[1.35, 1],
              titles={"a": "Loss surface", "b": "Top view"})
ap.clean3d(p["a"], labels=("$\\theta_1$", "$\\theta_2$", None))
# Paths behind a ridge are dashed; view3d picks the view that hides the least of them.
ap.surface(p["a"], X, Y, Z, paths=runs, f=f, ours="Ours", contours=10, wire=0)
ap.view3d(p["a"])
ap.label3d(p["a"], f.lift([start])[0], "start", offset=(0, 5))
ap.landscape(p["b"], f, xlim=(-2.6, 2.6), ylim=(-2.2, 2.2))
for (name, xy), col in zip(runs.items(), ap.series(3, ours=2)):
    ap.path(p["b"], xy, color=col, lw=1.3 if name == "Ours" else 0.8, start=False)
p["b"].set_xlabel("$\\theta_1$")
p["b"].set_ylabel("$\\theta_2$")
p.legend(where="bottom")
p.save()
`
  },
  manifold: {
    label: '3D point cloud, a manifold sheet, a sphere with geodesics',
    text: String.raw`"""Point clouds and manifolds: a Swiss roll as samples and as a sheet, a sphere with geodesics."""
import numpy as np
import aster_plot as ap

xyz, t = ap.toy.swiss_roll(n=1500, noise=0.04, seed=0)
p = ap.panels("abc", size="double", height=2.2, kinds={"a": "3d", "b": "3d", "c": "3d"},
              titles={"a": "Samples", "b": "Learned manifold", "c": "Geodesics on $S^2$"},
              view=(10, -78))
ap.cloud(p["a"], xyz, values=t, s=1.4)
ap.swiss_roll_surface(p["b"])
p["c"].view_init(22, 35)
ap.sphere(p["c"], geodesics=[((1, 0.2, 0.5), (-0.2, 1, 0.3)), ((0.9, -0.5, -0.2), (0.1, 0.6, 0.85))],
          geodesic_colors=[ap.color("ours"), ap.color("baseline")])
p.save()
`
  },
  bars: {
    label: 'Grouped bars with hatches, error bars and value labels',
    text: String.raw`"""Grouped bars with hatched baselines, error bars and value labels; ours in the accent."""
import numpy as np
import aster_plot as ap

methods = ["DDPM", "Flow matching", "Ours"]
groups = ["CIFAR-10", "ImageNet 64", "LSUN"]
fid = {"DDPM": [3.2, 7.4, 6.1], "Flow matching": [2.9, 6.8, 5.6], "Ours": [2.3, 5.1, 4.4]}
err = {"DDPM": [0.2, 0.3, 0.3], "Flow matching": [0.15, 0.3, 0.25], "Ours": [0.1, 0.2, 0.2]}
p, ax = ap.figure(size="single", height=1.9)
# stars: (group, method, method, p-value) from your test; the caption names the test.
ap.bars(ax, fid, groups=groups, errors=err, ours="Ours", best="min",
        stars=[(1, "Flow matching", "Ours", 0.002), (2, "Flow matching", "Ours", 0.03)])
ax.set_ylabel("FID (lower is better)")
ap.legend(ax, where="above")
p.save()
`
  },
  curves: {
    label: 'Mean ± std curves with an inset zoom',
    text: String.raw`"""Training curves: mean ± std over 5 seeds, with an inset zoom on the last steps."""
import numpy as np
import aster_plot as ap

r = ap.toy.rng(0)
steps = np.linspace(0, 100, 120)
def run(rate, floor, noise):
    return np.array([floor + (1 - floor) * np.exp(-steps / rate) + noise * r.standard_normal(len(steps)).cumsum() / 40
                     for _ in range(5)])
runs = {"Adam": run(30, 0.32, 0.18), "Lion": run(24, 0.28, 0.2), "Ours": run(16, 0.2, 0.14)}
p, ax = ap.figure(size="single", height=1.9)
ap.curves(ax, steps, runs, ours="Ours", smooth=5)
ax.set_xlabel("training step (k)")
ax.set_ylabel("validation loss")
ax.set_ylim(0.1, 1.05)
ins = p.inset(ax, bounds=(0.5, 0.42, 0.46, 0.5), xlim=(80, 100), ylim=(0.17, 0.42))
ap.curves(ins, steps, runs, ours="Ours", smooth=5)
ins.set_xlim(80, 100)
ins.set_ylim(0.17, 0.42)
ins.set_xticks([80, 100])
ins.set_yticks([0.2, 0.4])
ap.legend(ax, where="above")
p.save()
`
  },
  heat: {
    label: 'Results table as a heat map, best per column in bold',
    text: String.raw`"""A results table as a heat map: the best per column in bold, ours named in the accent."""
import numpy as np
import aster_plot as ap

rows = ["ViT-B", "DeiT-B", "Swin-B", "ConvNeXt-B", "Ours-B"]
cols = ["IN-1k", "IN-V2", "IN-R", "IN-A", "IN-Sk"]
M = np.array([[81.8, 70.9, 41.2, 24.0, 29.1], [81.8, 71.5, 44.9, 27.8, 32.0],
              [83.5, 72.8, 46.6, 35.8, 32.4], [83.8, 73.4, 49.1, 36.7, 33.8],
              [84.6, 74.6, 53.0, 41.5, 37.2]])
p, ax = ap.figure(size="single", height=1.55)
ap.heat_table(ax, M, rows, cols, best="max", highlight_row=4)
p.save()
`
  },
  radar: {
    label: 'Radar chart over benchmarks',
    text: String.raw`"""A radar chart over six benchmarks: ours filled in the accent, baselines as gray outlines."""
import numpy as np
import aster_plot as ap

cats = ["MMLU", "GSM8K", "HumanEval", "ARC", "HellaSwag", "TruthfulQA"]
scores = {"Llama-2 7B": [46, 15, 13, 53, 78, 39], "Mistral 7B": [62, 40, 30, 60, 81, 42],
          "Ours 7B": [66, 58, 41, 63, 82, 51]}
p, ax = ap.figure(size="single", height=2.3, kind="polar")
ap.radar(ax, cats, scores, ours="Ours 7B", rmax=90)
ap.legend(ax, where="right")
p.save()
`
  },
  results: {
    label: 'Several results plots in one panel with one shared legend',
    text: String.raw`"""Many plots in one panel: curves, bars, an ablation and a heat table, one legend for all."""
import numpy as np
import aster_plot as ap

r = ap.toy.rng(1)
x = np.arange(0, 51)
def run(rate, top):
    return np.array([top * (1 - np.exp(-x / rate)) + r.normal(0, 0.6, len(x)).cumsum() / 15 for _ in range(4)])
runs = {"PPO": run(14, 62), "DPO": run(11, 68), "Ours": run(8, 75)}
p = ap.panels("abcd", size="double", height=1.75, width_ratios=[1.25, 1, 1, 1.05], legend="bottom",
              titles={"a": "Win rate", "b": "Sample cost", "c": "Ablation", "d": "Per task"})
ap.curves(p["a"], x, runs, ours="Ours")
p["a"].set_xlabel("training step (k)")
p["a"].set_ylabel("win rate (%)")
ap.bars(p["b"], {"PPO": [12.4], "DPO": [5.1], "Ours": [3.2]}, groups=[""], ours="Ours",
        fmt="{:.1f}", labels=True)
p["b"].set_xticks([])
p["b"].set_ylabel("GPU hours (k)")
ap.dots(p["c"], ["full", "no reward", "no KL", "no warm-up"], [75.1, 66.0, 70.2, 72.9],
        errors=[0.8, 1.1, 0.9, 1.0], ours=0, ref=68.0, xlabel="win rate (%)")
ap.heat_table(p["d"], np.array([[61, 58, 70], [66, 63, 72], [74, 71, 79]]), ["PPO", "DPO", "Ours"],
              ["chat", "code", "math"], fmt="{:.0f}", highlight_row=2)
p.legend()
p.save()
`
  },
  runs: {
    label: "Curves from the project's Runs (metrics.jsonl), mean ± std over seeds",
    text: String.raw`"""Curves from the project's Runs: mean ± std over seeds. Edit RUNS and METRIC."""
import aster_plot as ap

# Each method's Runs, one metrics.jsonl per seed, relative to this file (node H/cli.mjs run show
# lists them): <record root>/experiments/<experiment>/runs/<run id>/metrics.jsonl.
RUNS = {
    "Baseline": ["../../experiments/baseline/runs/RUN-ID-1/metrics.jsonl"],
    "Ours": ["../../experiments/ours/runs/RUN-ID-2/metrics.jsonl"],
}
METRIC, SPLIT = "loss", "val"

x, runs = ap.load_runs(ap.here(RUNS), METRIC, split=SPLIT)
p, ax = ap.figure(size="single", height=1.9)
ap.curves(ax, x / 1000, runs, ours="Ours")
ax.set_xlabel("training step (k)")
ax.set_ylabel("validation loss")
ap.legend(ax, where="above")
p.save()
`
  },
  blank: {
    label: 'One empty panel in the paper style',
    text: String.raw`"""One panel to start from: ap's helpers (figures plot kit) or plain matplotlib on ax."""
import numpy as np
import aster_plot as ap

p, ax = ap.figure(size="single", height=1.9)
x = np.linspace(0, 1, 50)
ax.plot(x, x, color=ap.color("baseline"), ls=(0, (4, 1.5)), label="Baseline")
ax.plot(x, x ** 0.5, color=ap.color("ours"), label="Ours")
ax.set_xlabel("budget (fraction)")
ax.set_ylabel("accuracy")
ap.legend(ax, where="above")
p.save()
`
  }
}
