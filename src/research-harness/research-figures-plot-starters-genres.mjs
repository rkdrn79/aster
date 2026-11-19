// Plot starters, trajectories, teasers, fields and distributions: what
// `figures plot new --kind <kind>` writes. Each is a finished demo on toy data, so the agent starts
// from a page-true, checked figure and swaps in the project's data.
export const PLOT_STARTERS_GENRES = {
  trajectories: {
    label: 'Flow paths: ODE (curved), straight (rectified) and SDE, three panels',
    text: String.raw`"""Flow paths from noise to data: curved ODE paths, straight (rectified) paths, SDE paths."""
import numpy as np
import aster_plot as ap

# Toy data: an 8-mode ring and its exact flows. Swap in your model's sampled paths, (n, steps + 1, 2).
_, means, std = ap.toy.ring(k=8, radius=2.2, std=0.16, n=10, seed=1)
x0 = ap.toy.rng(2).standard_normal((56, 2))
ode, t = ap.toy.flow(means, std, x0=x0, kind="ode")
straight, _ = ap.toy.flow(means, std, x0=x0, kind="straight")
sde, _ = ap.toy.flow(means, std, x0=x0, kind="sde", eps=0.2, steps=160, seed=3)
X, Y = np.meshgrid(np.linspace(-3.3, 3.3, 200), np.linspace(-3.3, 3.3, 200))
Z = ap.toy.gmm_density(np.stack([X.ravel(), Y.ravel()], 1), 1.0, means, std).reshape(X.shape)

p = ap.panels("abc", size="double", height=2.15, sharex=True, sharey=True,
              titles={"a": "ODE (probability flow)", "b": "Straight (rectified)", "c": "SDE"})
for key, paths in (("a", ode), ("b", straight), ("c", sde)):
    ax = p[key]
    ap.density(ax, grid=(X, Y, Z), color=ap.color("muted"), masses=(0.6, 0.95), lines=False,
               tones=(0.12, 0.28))
    ap.paths(ax, paths, lw=0.55)
    ax.set_xlim(-3.3, 3.3)
    ax.set_ylim(-3.3, 3.3)
    ax.set_aspect("equal")
    ap.no_ticks(ax)
ap.note(p["a"], "noise", xy=tuple(x0[5]), xytext=(-14, -16))
ap.note(p["a"], "data", xy=tuple(ode[5, -1]), xytext=(10, 12))
p.save()
`
  },
  teaser: {
    label: 'Generation teaser: noise to data, snapshots along t joined by sample paths',
    text: String.raw`"""Generation teaser: samples move from noise (t = 0) to data (t = 1) along their paths."""
import numpy as np
import aster_plot as ap

data, means, std = ap.toy.ring(k=8, radius=2.0, std=0.14, n=900, seed=0)
paths, t = ap.toy.flow(means, std, n=900, kind="ode", steps=60, seed=4)

p = ap.panels("a", size="double", height=1.45, labels=None)
ap.flow_strip(p["a"], paths, t, snapshots=(0, 0.25, 0.5, 0.75, 1), n_paths=40)
p.save()
`
  },
  sampling: {
    label: 'Score-SDE teaser in 1D: sample paths over t with density profiles',
    text: String.raw`"""Score-SDE style teaser in 1D: paths from a Gaussian (left) to a two-mode data density."""
import numpy as np
import aster_plot as ap

means = np.array([[-1.6], [1.3]])
weights = np.array([0.4, 0.6])
ode, t = ap.toy.flow(means, 0.3, weights=weights, n=40, kind="ode", steps=100, seed=1)
sde, _ = ap.toy.flow(means, 0.3, weights=weights, n=28, kind="sde", eps=1.0, steps=200, seed=1)
dens = lambda y, s: ap.toy.gmm_density(y[:, None], s, means, 0.3, weights)

p = ap.panels("ab", size="single", height=1.75, sharey=True, titles={"a": "ODE", "b": "SDE"})
ap.sampling_1d(p["a"], ode[..., 0], t, density=dens, snapshots=(0, 0.5, 1))
ap.sampling_1d(p["b"], sde[..., 0], np.linspace(0, 1, sde.shape[1]), density=dens,
               snapshots=(0, 0.5, 1))
p.save()
`
  },
  landscape: {
    label: 'Optimisation paths on a 2D loss landscape',
    text: String.raw`"""Optimisation paths on a 2D loss landscape: SGD, heavy-ball momentum, and ours."""
import numpy as np
import aster_plot as ap

# Toy landscape and optimisers (exact gradients; ap.toy.fn has rosenbrock, beale, himmelblau,
# quadratic, saddle, sharp-flat too); replace with your logged trajectories, shape (steps, 2).
f = ap.toy.fn("two-basins")
start = (-0.45, 1.75)
runs = {
    "SGD": ap.toy.optimize(f, start, "sgd", lr=0.2, steps=45, noise=0.9, seed=1),
    "Momentum": ap.toy.optimize(f, start, "momentum", lr=0.07, momentum=0.9, steps=45),
    "Ours": ap.toy.optimize(f, start, "momentum", lr=0.16, momentum=0.4, steps=45),
}
p, ax = ap.figure(size="single", height=2.25)
ap.landscape(ax, f, xlim=(-2.6, 2.6), ylim=(-1.9, 2.0))
colors = ap.series(3, ours=2)
for (name, xy), col in zip(runs.items(), colors):
    ap.path(ax, xy, color=col, lw=1.4 if name == "Ours" else 0.8, label=name, start=False,
            fade=(0.35, 1.0))
ax.plot(*start, marker="o", ms=3.6, mfc="white", mec=ap.color("ink"), mew=0.7, zorder=6)
ap.note(ax, "start", xy=start, xytext=(-6, 2), arrow=False)
ax.set_xlabel("$\\theta_1$")
ax.set_ylabel("$\\theta_2$")
ap.legend(ax, where="above")
p.save()
`
  },
  field: {
    label: 'Vector field: arrows and streamlines',
    text: String.raw`"""The learned velocity field at two times: arrows (direction) and streamlines (speed)."""
import numpy as np
import aster_plot as ap

_, means, std = ap.toy.ring(k=4, radius=1.8, std=0.2, n=10)
def v(X, Y, t):
    xy = np.stack([X.ravel(), Y.ravel()], 1)
    out = ap.toy.gmm_velocity(xy, t, means, std)
    return out[:, 0].reshape(X.shape), out[:, 1].reshape(X.shape)

p = ap.panels("ab", size="single", height=1.75, sharey=True,
              titles={"a": "$v_\\theta(x, 0.2)$", "b": "$v_\\theta(x, 0.8)$"})
ap.field(p["a"], v, xlim=(-2.6, 2.6), ylim=(-2.6, 2.6), n=13, t=0.2)
ap.field(p["b"], v, xlim=(-2.6, 2.6), ylim=(-2.6, 2.6), kind="stream", by_magnitude=True, t=0.8)
for ax in p:
    ax.scatter(*means.T, marker="+", s=14, color=ap.color("ours-ink"), lw=0.8, zorder=5)
    ax.set_xticks([-2, 0, 2])
    ax.set_yticks([-2, 0, 2])
    ax.set_xlabel("$x_1$")
p["a"].set_ylabel("$x_2$")
p.save()
`
  },
  density: {
    label: '2D densities: highest-density contours, a mixture, a joint plot with marginals',
    text: String.raw`"""2D densities: highest-density contours of two models, a fitted mixture, a joint plot."""
import numpy as np
import aster_plot as ap

r = ap.toy.rng(0)
data = ap.toy.moons(n=1200, noise=0.08, seed=0)
ours = ap.toy.moons(n=1200, noise=0.11, seed=1)
base = data[:, :] * 0.8 + 0.25 * r.standard_normal(data.shape)
means = np.array([[-0.9, 0.3], [0.0, -0.2], [0.9, -0.1], [-0.2, 0.7]])
covs = [np.array([[0.12, 0.05], [0.05, 0.05]]), np.array([[0.05, -0.02], [-0.02, 0.06]]),
        np.array([[0.1, -0.05], [-0.05, 0.06]]), np.array([[0.06, 0.0], [0.0, 0.03]])]

p = ap.panels("abc", size="double", height=2.2, kinds={"c": "joint"}, width_ratios=[1, 1, 1.1], sharey=["ab"],
              titles={"a": "Samples vs. data", "b": "Mixture fit", "c": "Joint and marginals"})
ap.density(p["a"], data, color=ap.color("muted"), lines=False, tones=(0.12, 0.3), label="Data", bw=0.12)
ap.density(p["a"], ours, filled=False, label="Ours", bw=0.12, masses=(0.5, 0.9))
ap.density(p["a"], base, color=ap.color("ink"), filled=False, masses=(0.8,), lw=0.6,
           label="Baseline (80%)", bw=0.12)
ap.legend(p["a"], where="above", ncol=3, handlelength=1.0, columnspacing=0.6)
ap.mixture(p["b"], means, covs, weights=[0.35, 0.25, 0.25, 0.15])
p["b"].scatter(*data[::4].T, s=1.0, color=ap.color("mid"), lw=0, zorder=0)
group = (r.random(800) < 0.5).astype(int)
x = np.where(group, r.normal(0.8, 0.5, 800), r.normal(-0.6, 0.35, 800))
y = 0.6 * x + np.where(group, r.normal(0.3, 0.4, 800), r.normal(-0.2, 0.3, 800))
ap.joint(p["c"], x, y, groups=group, labels=["Baseline", "Ours"],
         colors=[ap.color("baseline"), ap.color("ours")])
for key in "ab":
    p[key].set_xlim(-2.4, 2.4)
    p[key].set_ylim(-1.4, 1.6)
    p[key].set_aspect("equal")
    p[key].set_xlabel("$z_1$")
p["a"].set_ylabel("$z_2$")
p["c"].main.set_xlabel("feature norm")
p["c"].main.set_ylabel("log-likelihood")
p.save()
`
  },
  distributions: {
    label: '1D distributions: density, histogram, violin, box, ECDF, ridgeline',
    text: String.raw`"""1D distributions six ways, one panel each: density, histogram, violin, box, ECDF, ridgeline."""
import numpy as np
import aster_plot as ap

r = ap.toy.rng(3)
scores = {
    "Base": r.normal(0.0, 1.0, 600),
    "+aug": r.normal(0.6, 0.9, 600),
    "Ours": np.r_[r.normal(1.4, 0.55, 420), r.normal(0.4, 0.4, 180)],
}
p = ap.panels("abc;def", size="double", height=2.75,
              titles={"a": "Density", "b": "Histogram", "c": "Violin", "d": "Box",
                      "e": "ECDF", "f": "Ridgeline over training"})
ap.densities(p["a"], scores, ours=2, means=True)
ap.hist(p["b"], scores, ours=2, bins=28)
ap.violin(p["c"], scores, ours=2)
ap.box(p["d"], scores, ours=2)
ap.ecdf(p["e"], scores, ours=2)
steps = {"%dk" % k: r.normal(1.6 * k / 40, 0.9 - 0.012 * k, 500) for k in (0, 10, 20, 30, 40)}
ap.ridgeline(p["f"], steps, overlap=0.5)
for key in "abe":
    p[key].set_xlabel("score")
p["a"].set_ylabel("density")
p["b"].set_ylabel("density")
p["c"].set_ylabel("score")
p["d"].set_ylabel("score")
p["e"].set_ylabel("fraction $\\leq$ score")
p["f"].set_xlabel("logit of the true class")
ap.legend(p["a"], loc="upper left")
p.save()
`
  }
}
