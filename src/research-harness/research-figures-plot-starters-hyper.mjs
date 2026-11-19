// Plot starters, 4D (a 4th channel, time, slices, projections): what
// `figures plot new --kind <kind>` writes. Each is a finished demo on toy data, so the agent starts
// from a page-true, checked figure and swaps in the project's data.
export const PLOT_STARTERS_HYPER = {
  fourd: {
    label:
      '3D with a 4th variable: a point cloud and a surface coloured by it, compact colour bars',
    text: String.raw`"""3D with a 4th variable: points coloured (and sized) by it, and a surface coloured by it."""
import numpy as np
import aster_plot as ap

# Toy data: latents on a Swiss roll coloured by a per-sample score; a loss surface coloured by
# its gradient norm. Swap in your own (n, 3) points and values, or X, Y, Z and a field C.
xyz, t = ap.toy.swiss_roll(n=900, noise=0.05, seed=0)
score = np.sin(t / 2.2) + 0.15 * ap.toy.rng(1).standard_normal(len(t))
f = ap.toy.landscape("two-basins")
X, Y = np.meshgrid(np.linspace(-2.6, 2.6, 60), np.linspace(-2.2, 2.2, 50))
Z = f(X, Y)
gy, gx = np.gradient(Z, Y[:, 0], X[0])

p = ap.panels("ab", size="double", height=2.3, kinds={"a": "3d", "b": "3d"},
              titles={"a": "Latents, coloured by score", "b": "Loss, coloured by gradient norm"})
p["a"].view_init(10, -78)
ap.cloud4d(p["a"], xyz, score, label="score")
ap.surface4d(p["b"], X, Y, Z, np.hypot(gx, gy), label=r"$\Vert\nabla L\Vert$")
p.save()
`
  },
  snapshots3d: {
    label: '3D snapshots along t: one view and one set of limits, t = … on each',
    text: String.raw`"""3D snapshots along t: a cloud unrolling from noise into a manifold, one view for all."""
import numpy as np
import aster_plot as ap

# Toy data: samples moving from a Gaussian (t = 0) to a Swiss roll (t = 1) on straight paths.
roll, pos = ap.toy.swiss_roll(n=700, noise=0.03, seed=0)
noise = ap.toy.rng(1).standard_normal(roll.shape) * roll.std(0)
times = [0.0, 0.33, 0.67, 1.0]
frames = [(1 - s) * noise + s * roll for s in times]

p = ap.panels("abcd", size="double", height=1.75, labels=None,
              kinds=dict((k, "3d") for k in "abcd"))
ap.snapshots3d([p[k] for k in "abcd"], frames, times, values=[pos] * 4, view=(12, -76))
p.save()
`
  },
  trajectories3d: {
    label: '3D trajectories coloured by time with a time colour bar, and motion trails',
    text: String.raw`"""3D trajectories coloured by time, and motion trails: points with their fading recent past."""
import numpy as np
import aster_plot as ap

def lorenz(x0, steps=1400, dt=0.008):
    out = [np.array(x0, dtype=float)]
    for _ in range(steps):
        x, y, z = out[-1]
        out.append(out[-1] + dt * np.array([10 * (y - x), x * (28 - z) - y, x * y - 8 / 3 * z]))
    return np.array(out)

# Toy data: three Lorenz trajectories; particles swirling in a vortex. Swap in your own
# trajectories (n, T, 3) and positions over time (T, n, 2).
paths = np.stack([lorenz((1 + k * 0.5, 1, 20), steps=1000) for k in range(2)]) / 10
times = np.linspace(0, 1, paths.shape[1])
r = ap.toy.rng(0)
start = r.uniform(-1, 1, (60, 2))
steps = [start]
for _ in range(40):
    x = steps[-1]
    v = np.stack([-x[:, 1], x[:, 0]], 1) * (1.4 - np.hypot(*x.T))[:, None] + 0.02 * r.standard_normal(x.shape)
    steps.append(x + 0.06 * v)
positions = np.array(steps)

p = ap.panels("ab", size="double", height=2.3, kinds={"a": "3d"}, width_ratios=[1.3, 1],
              titles={"a": "Trajectories, coloured by time", "b": "Motion trails (last 12 steps)"})
p["a"].view_init(16, -48)
ap.trajectories3d(p["a"], paths, times, label="t")
ap.trails(p["b"], positions, length=12)
p["b"].set_aspect("equal")
p["b"].set_xlabel("$x_1$")
p["b"].set_ylabel("$x_2$")
p.save()
`
  },
  slices: {
    label: 'A grid of 2D slices through a 4D field: z-slices × t on one colour scale',
    text: String.raw`"""Slices through a 4D field: z-slices (rows) × time (columns) on one colour scale."""
import numpy as np
import aster_plot as ap

# Toy data: a blob drifting and spreading in a 3D volume over time, sampled on a 48 x 48 grid.
x = np.linspace(-1, 1, 48)
X, Y = np.meshgrid(x, x)
zs = [-0.4, 0.0, 0.4]
ts = [0.0, 0.33, 0.67, 1.0]
def density(z, t):
    cx, cy, cz, w = -0.4 + 0.8 * t, 0.3 - 0.5 * t, 0.2 * t, 0.25 + 0.2 * t
    return np.exp(-((X - cx) ** 2 + (Y - cy) ** 2 + (z - cz) ** 2) / (2 * w * w)) / w
field = np.array([[density(z, t) for t in ts] for z in zs])

p = ap.panels((3, 4), size="single", height=2.25, labels=None)
ap.slices(list(p), field, zs, ts, row_label="z", col_label="t", label="density",
          extent=(-1, 1, -1, 1))
p.save()
`
  },
  embedding: {
    label: 'High-dimensional data: a projection by class and by time, parallel coordinates',
    text: String.raw`"""High-dimensional data: a projection coloured by class, one coloured by time, and
parallel coordinates of hyperparameter runs."""
import numpy as np
import aster_plot as ap

# Toy data: 64-d features of four classes; a latent drifting over training; 60 runs of five
# hyperparameters with their accuracy. Swap in your own features (n, d) and labels.
r = ap.toy.rng(0)
centres = r.normal(0, 1, (4, 64)) * 2.2
labels = r.integers(0, 4, 800)
feats = centres[labels] + r.normal(0, 1, (800, 64))
steps = np.linspace(0, 1, 400)
drift = np.stack([np.cos(3 * steps), np.sin(3 * steps)], 1) * (1 + 2 * steps[:, None])
latent = np.concatenate([drift, r.normal(0, 0.15, (400, 30))], 1) + r.normal(0, 0.2, (400, 32))
runs = np.column_stack([10 ** r.uniform(-4, -2, 60), r.choice([64, 128, 256, 512], 60),
                        r.uniform(0, 0.3, 60), r.integers(2, 13, 60), r.uniform(0.9, 0.999, 60)])
acc = 80 - 3 * np.abs(np.log10(runs[:, 0]) + 3) - 20 * np.abs(runs[:, 2] - 0.1) + r.normal(0, 1, 60)

p = ap.panels("abc", size="double", height=2.15, width_ratios=[1, 1.15, 1.6],
              titles={"a": "Features by class", "b": "Latent over training", "c": "Runs"})
ap.embedding(p["a"], feats, labels=labels, names=["cat", "dog", "car", "ship"])
ap.legend(p["a"], where="above", ncol=4, handletextpad=0.05, markerscale=2, columnspacing=0.6)
ap.embedding(p["b"], latent, values=steps * 100, label="step (k)")
ap.parallel(p["c"], runs, ["lr", "batch", "dropout", "layers", "$\\beta_2$"], values=acc,
            label="accuracy (%)", log=["lr"])
p.save()
`
  }
}
