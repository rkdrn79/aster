// aster_plot.py, toy maths for generation figures: seeded data, Gaussian mixtures, interpolants
// between mixtures, couplings and optimal transport, and ODE/SDE integrators. Python kept as a
// string: orcad ships the harness as one bundled .mjs file, so a .py beside it would not reach a
// GPU server. Joined by research-figures-plot-lib; the class toy is finished in -toy-opt.
export const PLOT_PY_TOY = String.raw`
# ---------------------------------------------------------------- toy maths (seeded, exact)

def _logsumexp(a, axis):
    top = np.max(a, axis=axis, keepdims=True)
    top = np.where(np.isfinite(top), top, 0.0)
    return (top + np.log(np.sum(np.exp(a - top), axis=axis, keepdims=True))).squeeze(axis)


def _rows(x):
    """(points of shape (n, d), whether x was 1D values)."""
    x = np.asarray(x, dtype=float)
    return (x[:, None], True) if x.ndim == 1 else (x, False)


class Mix(object):
    """An isotropic Gaussian mixture: means (k, d) or (k,) in 1D, std one value or one per
    component, weights (sum to 1), labels (a class per component, for guidance and class
    couplings). ap.toy.mix(...) makes one."""

    def __init__(self, means, std=0.15, weights=None, labels=None):
        m = np.asarray(means, dtype=float)
        self.means = m[:, None] if m.ndim == 1 else np.atleast_2d(m)
        k = len(self.means)
        self.std = np.broadcast_to(np.asarray(std, dtype=float), (k,)).copy()
        w = np.ones(k) if weights is None else np.asarray(weights, dtype=float)
        self.weights = w / w.sum()
        self.labels = None if labels is None else list(labels)

    @property
    def dim(self):
        return self.means.shape[1]

    def given(self, label):
        """The mixture of the components with this class label."""
        keep = [i for i, name in enumerate(self.labels or []) if name == label]
        if not keep:
            raise ValueError("no component has label %r" % (label,))
        return Mix(self.means[keep], self.std[keep], self.weights[keep], [label] * len(keep))

    def sample(self, n=600, seed=0, labels=False):
        """n samples (n, d) (1D mixtures: (n,)); labels=True also returns each sample's
        component index."""
        r = toy.rng(seed)
        idx = r.choice(len(self.means), n, p=self.weights)
        x = self.means[idx] + self.std[idx, None] * r.standard_normal((n, self.dim))
        x = x[:, 0] if self.dim == 1 else x
        return (x, idx) if labels else x

    def pdf(self, x):
        return toy.bridge_density(x, 1.0, toy.point(self.dim), self)

    def score(self, x):
        return toy.bridge_score(x, 1.0, toy.point(self.dim), self)


def _schedule(kind):
    """(a, b, da, db) for x_t = a(t) x0 + b(t) x1."""
    if callable(kind):
        return kind()
    if kind == "trig":
        h = np.pi / 2
        return (lambda t: np.cos(h * t), lambda t: np.sin(h * t),
                lambda t: -h * np.sin(h * t), lambda t: h * np.cos(h * t))
    if kind == "vp":
        # Why: the VP diffusion path written source (noise) to target (data), as in flow matching.
        def alpha(t):
            s = 1 - np.asarray(t, dtype=float)
            return np.exp(-0.25 * s * s * 19.9 - 0.5 * s * 0.1)

        def dalpha(t):
            s = 1 - np.asarray(t, dtype=float)
            return alpha(t) * (0.5 * s * 19.9 + 0.05)
        return (lambda t: np.sqrt(np.clip(1 - alpha(t) ** 2, 0, 1)), alpha,
                lambda t: -alpha(t) * dalpha(t) / np.sqrt(np.clip(1 - alpha(t) ** 2, 1e-12, 1)),
                dalpha)
    if kind != "linear":
        raise ValueError("schedule takes linear, trig, vp or a function returning (a, b, da, db)")
    return (lambda t: 1 - t, lambda t: t + 0 * t, lambda t: -1 + 0 * t, lambda t: 1 + 0 * t)


def _gamma2(gamma):
    """(gamma(t)^2, its derivative): gamma is 0, a number c (gamma = c sqrt(t (1 - t)), the
    stochastic-interpolant bridge) or a function returning both."""
    if callable(gamma):
        return gamma
    c2 = float(gamma) ** 2
    return (lambda t: c2 * t * (1 - t), lambda t: c2 * (1 - 2 * t))


def _coupling(src, dst, coupling):
    if coupling is None or coupling == "independent":
        return np.outer(src.weights, dst.weights)
    if coupling == "class":
        if len(src.means) != len(dst.means):
            raise ValueError("coupling='class' pairs component i with i: same number of components")
        return np.diag(src.weights)
    P = np.asarray(coupling, dtype=float)
    return P / P.sum()


class _ToyData(object):
    @staticmethod
    def rng(seed=0):
        """numpy's Generator for a seed: every toy helper is deterministic."""
        return np.random.default_rng(seed)

    @staticmethod
    def ring(k=8, radius=2.0, std=0.18, n=600, seed=0):
        """n samples from k Gaussians on a ring; returns (samples, means, std)."""
        r = toy.rng(seed)
        angles = np.linspace(0, 2 * np.pi, k, endpoint=False) + np.pi / k
        means = radius * np.stack([np.cos(angles), np.sin(angles)], 1)
        idx = r.integers(0, k, n)
        return means[idx] + std * r.standard_normal((n, 2)), means, std

    @staticmethod
    def moons(n=600, noise=0.07, seed=0):
        r = toy.rng(seed)
        t = r.uniform(0, np.pi, n)
        upper = r.random(n) < 0.5
        x = np.where(upper, np.cos(t), 1 - np.cos(t))
        y = np.where(upper, np.sin(t), 0.5 - np.sin(t))
        return np.stack([x - 0.5, y - 0.25], 1) * 1.6 + noise * r.standard_normal((n, 2))

    @staticmethod
    def checkerboard(n=800, seed=0):
        r = toy.rng(seed)
        x = r.uniform(-2, 2, n)
        y = r.uniform(-2, 2, n)
        keep = (np.floor(x) + np.floor(y)) % 2 == 0
        return np.stack([x[keep], y[keep]], 1)

    @staticmethod
    def swiss_roll(n=1200, noise=0.05, seed=0):
        """(xyz, t): points on a Swiss roll and their position along it."""
        r = toy.rng(seed)
        t = 1.5 * np.pi * (1 + 2 * r.random(n))
        h = 21 * r.random(n)
        xyz = np.stack([t * np.cos(t), h, t * np.sin(t)], 1) + noise * r.standard_normal((n, 3))
        return xyz / 10.0, t

    @staticmethod
    def mix(means, std=0.15, weights=None, labels=None):
        """A Gaussian mixture (Mix): .sample(n, seed), .pdf(x), .score(x), .given(label)."""
        return Mix(means, std, weights, labels)

    @staticmethod
    def point(dim=2, std=1.0):
        """N(0, std^2 I) as a one-component Mix: the noise end of a flow."""
        return Mix(np.zeros((1, dim)), std)


class _ToyFlow(object):
    @staticmethod
    def integrate(v, x0, times, method="rk4"):
        """Integrates dx/dt = v(x, t) over times (increasing or decreasing) with rk4, heun or
        euler; returns the path, shape (n, T, d) for x0 (n, d), (T, d) for one point."""
        x = np.array(x0, dtype=float)
        out = [x.copy()]
        for t0, t1 in zip(times[:-1], times[1:]):
            h = t1 - t0
            if method == "euler":
                x = x + h * v(x, t0)
            elif method == "heun":
                k1 = v(x, t0)
                x = x + 0.5 * h * (k1 + v(x + h * k1, t1))
            else:
                k1 = v(x, t0)
                k2 = v(x + 0.5 * h * k1, t0 + 0.5 * h)
                k3 = v(x + 0.5 * h * k2, t0 + 0.5 * h)
                x = x + h / 6 * (k1 + 2 * k2 + 2 * k3 + v(x + h * k3, t1))
            out.append(x.copy())
        return np.stack(out, axis=max(0, x.ndim - 1))

    @staticmethod
    def euler_maruyama(drift, diffusion, x0, times, seed=0):
        """dx = drift(x, t) dt + diffusion(t) dW by Euler–Maruyama over times (decreasing times
        integrate backwards, the noise scaled by sqrt|dt|); returns the path like integrate."""
        r = toy.rng(seed)
        x = np.array(x0, dtype=float)
        out = [x.copy()]
        for t0, t1 in zip(times[:-1], times[1:]):
            h = t1 - t0
            g = diffusion(t0) if callable(diffusion) else diffusion
            x = x + h * drift(x, t0) + np.asarray(g) * np.sqrt(abs(h)) * r.standard_normal(x.shape)
            out.append(x.copy())
        return np.stack(out, axis=max(0, x.ndim - 1))

    @staticmethod
    def interpolant(x0, x1, t, schedule="linear", gamma=0.0, z=None, seed=0):
        """x_t = a(t) x0 + b(t) x1 + gamma(t) z for given pairs: schedule linear (straight),
        trig (curved, a = cos, b = sin) or vp; gamma > 0 adds the bridge noise c sqrt(t(1-t)) z
        (stochastic interpolants). t one value, or an array: then (n, T, d) paths."""
        a, b, _, _ = _schedule(schedule)
        g2, _ = _gamma2(gamma)
        x0, x1 = np.asarray(x0, dtype=float), np.asarray(x1, dtype=float)
        noisy = callable(gamma) or float(gamma) != 0.0
        if z is None and noisy:
            z = toy.rng(seed).standard_normal(np.broadcast(x0, x1).shape)
        ts = np.atleast_1d(np.asarray(t, dtype=float))
        frames = [a(s) * x0 + b(s) * x1 + (0 if z is None else np.sqrt(max(g2(s), 0)) * z)
                  for s in ts]
        if np.ndim(t) == 0:
            return frames[0]
        return np.stack(frames, axis=max(0, x0.ndim - 1))

    @staticmethod
    def _bridge(x, t, src, dst, schedule, gamma, coupling):
        a, b, da, db = _schedule(schedule)
        g2, dg2 = _gamma2(gamma)
        P = _coupling(src, dst, coupling)
        at, bt, dat, dbt = (float(f(t)) for f in (a, b, da, db))
        mu = at * src.means[:, None, :] + bt * dst.means[None, :, :]
        V = at * at * src.std[:, None] ** 2 + bt * bt * dst.std[None, :] ** 2 + g2(t)
        V = np.maximum(V, 1e-12)
        C = at * dat * src.std[:, None] ** 2 + bt * dbt * dst.std[None, :] ** 2 + 0.5 * dg2(t)
        drift = dat * src.means[:, None, :] + dbt * dst.means[None, :, :]
        keep = P > 0
        mu, V, C, drift, w = mu[keep], V[keep], C[keep], drift[keep], P[keep]
        diff = x[:, None, :] - mu[None]
        d = x.shape[1]
        logp = -0.5 * (diff ** 2).sum(-1) / V - 0.5 * d * np.log(2 * np.pi * V) + np.log(w)
        return mu, V, C, drift, diff, logp

    @staticmethod
    def bridge_velocity(x, t, src, dst, schedule="linear", gamma=0.0, coupling=None):
        """The exact velocity E[dx_t/dt | x_t = x] between two Mix (src at t=0, dst at t=1) for
        an interpolant (schedule, gamma) and a coupling of their components: independent
        (I-CFM), "class" (component i to i) or a matrix. Its ODE carries src to dst."""
        x, flat = _rows(x)
        _, V, C, drift, diff, logp = toy._bridge(x, t, src, dst, schedule, gamma, coupling)
        post = np.exp(logp - logp.max(1, keepdims=True))
        post /= post.sum(1, keepdims=True)
        out = (post[..., None] * (drift[None] + (C / V)[None, :, None] * diff)).sum(1)
        return out[:, 0] if flat else out

    @staticmethod
    def bridge_score(x, t, src, dst, schedule="linear", gamma=0.0, coupling=None):
        """grad log p_t(x) along the same interpolant."""
        x, flat = _rows(x)
        _, V, _, _, diff, logp = toy._bridge(x, t, src, dst, schedule, gamma, coupling)
        post = np.exp(logp - logp.max(1, keepdims=True))
        post /= post.sum(1, keepdims=True)
        out = (post[..., None] * (-diff / V[None, :, None])).sum(1)
        return out[:, 0] if flat else out

    @staticmethod
    def bridge_density(x, t, src, dst, schedule="linear", gamma=0.0, coupling=None):
        """p_t(x) along the same interpolant (x (n, d), or (n,) in 1D)."""
        x, _ = _rows(x)
        logp = toy._bridge(x, t, src, dst, schedule, gamma, coupling)[-1]
        return np.exp(_logsumexp(logp, 1))

    @staticmethod
    def gmm_velocity(x, t, means, std, weights=None):
        """The exact flow-matching velocity E[x1 - x0 | x_t] for x_t = (1-t) x0 + t x1, x0 ~ N(0, I),
        x1 from an isotropic Gaussian mixture."""
        dst = Mix(means, std, weights)
        return toy.bridge_velocity(x, t, toy.point(dst.dim), dst)

    @staticmethod
    def gmm_score(x, t, means, std, weights=None):
        dst = Mix(means, std, weights)
        return toy.bridge_score(x, t, toy.point(dst.dim), dst)

    @staticmethod
    def gmm_density(x, t, means, std, weights=None):
        """p_t(x) along the same path (x of shape (n, d))."""
        dst = Mix(means, std, weights)
        return toy.bridge_density(x, t, toy.point(dst.dim), dst)

    @staticmethod
    def flow(means, std=0.15, weights=None, n=60, steps=80, kind="ode", eps=0.6, seed=0, x0=None,
             source=None, schedule="linear", gamma=0.0, coupling=None):
        """Sample paths from a source (t=0; N(0, I) by default, or source=ap.toy.mix(...) for
        mixture-to-mixture) to an isotropic Gaussian mixture (t=1): kind ode (the exact
        probability-flow paths, curved), straight (the same endpoints joined by lines, as after
        rectification) or sde (the same marginals with noise, eps sets how much). schedule, gamma
        and coupling as in bridge_velocity. Returns (paths of shape (n, steps+1, d), times)."""
        dst = means if isinstance(means, Mix) else Mix(means, std, weights)
        src = source if isinstance(source, Mix) else toy.point(dst.dim)
        r = toy.rng(seed)
        if x0 is not None:
            x = np.array(x0, dtype=float)
        elif source is None:
            x = r.standard_normal((n, dst.dim))
        else:
            x = src.sample(n, seed=seed + 7919)
            x = x[:, None] if x.ndim == 1 else x
        times = np.linspace(0, 1, steps + 1)
        args = (src, dst, schedule, gamma, coupling)
        if kind == "sde":
            e = lambda t: eps * 4 * t * (1 - t) + 1e-3 * (1 - t)  # noqa: E731
            out = [x.copy()]
            for i in range(steps):
                t, dt = times[i], times[i + 1] - times[i]
                v = toy.bridge_velocity(x, t, *args) + e(t) * toy.bridge_score(x, t, *args)
                x = x + v * dt + np.sqrt(2 * e(t) * dt) * r.standard_normal(x.shape)
                out.append(x.copy())
            paths_ = np.stack(out, 1)
        else:
            paths_ = toy.integrate(lambda y, t: toy.bridge_velocity(y, t, *args), x, times,
                                   method="heun" if steps >= 40 else "rk4")
        if kind == "straight":
            paths_ = paths_[:, :1] + (paths_[:, -1:] - paths_[:, :1]) * times[None, :, None]
        return paths_, times

    # ------------------------------------------------------------ couplings and OT

    @staticmethod
    def cost(x, y):
        """Squared Euclidean costs |x_i - y_j|^2 (n, m)."""
        x, _ = _rows(x)
        y, _ = _rows(y)
        return np.maximum((x * x).sum(1)[:, None] + (y * y).sum(1)[None] - 2 * x @ y.T, 0.0)

    @staticmethod
    def assignment(C):
        """The exact optimal assignment for a square cost matrix: perm with row i matched to
        column perm[i] (scipy when present, else the Hungarian method; fine up to n ~ 1000)."""
        C = np.asarray(C, dtype=float)
        try:
            from scipy.optimize import linear_sum_assignment
            rows, cols = linear_sum_assignment(C)
            out = np.empty(len(rows), int)
            out[rows] = cols
            return out
        except Exception:
            return _hungarian(C)

    @staticmethod
    def sinkhorn(C, a=None, b=None, eps=None, iters=2000, tol=1e-9):
        """The entropic OT plan (n, m) by log-domain Sinkhorn: marginals a, b (uniform by
        default), eps the entropy weight in cost units (default 5% of the median cost; smaller
        is closer to exact OT and slower)."""
        C = np.asarray(C, dtype=float)
        n, m = C.shape
        a = np.ones(n) / n if a is None else np.asarray(a, dtype=float) / np.sum(a)
        b = np.ones(m) / m if b is None else np.asarray(b, dtype=float) / np.sum(b)
        eps = float(eps) if eps else 0.05 * (float(np.median(C)) or float(C.mean()) or 1.0)
        f, g = np.zeros(n), np.zeros(m)
        la, lb = np.log(a), np.log(b)
        for i in range(iters):
            f = eps * (la - _logsumexp((g[None] - C) / eps, 1))
            g = eps * (lb - _logsumexp((f[:, None] - C) / eps, 0))
            if i % 25 == 0:
                rows = np.exp(_logsumexp((f[:, None] + g[None] - C) / eps, 1))
                if np.abs(rows - a).sum() < tol:
                    break
        return np.exp((f[:, None] + g[None] - C) / eps)

    @staticmethod
    def couple(x0, x1, kind="ot", batch=None, eps=None, seed=0):
        """Pairs samples of two sets: returns (x0, x1) reordered so pair i is (x0[i], x1[i]).
        kind independent (a seeded shuffle, as I-CFM), ot (exact assignment, equal sizes),
        minibatch (exact OT inside shuffled batches of batch, as OT-CFM) or sinkhorn (each x0
        draws its partner from the entropic plan)."""
        x0, x1 = np.asarray(x0, dtype=float), np.asarray(x1, dtype=float)
        r = toy.rng(seed)
        if kind == "independent":
            return x0, x1[r.permutation(len(x1))[: len(x0)]]
        if kind == "sinkhorn":
            P = toy.sinkhorn(toy.cost(x0, x1), eps=eps)
            P = P / P.sum(1, keepdims=True)
            pick = (P.cumsum(1) < r.random((len(x0), 1))).sum(1)
            return x0, x1[np.minimum(pick, len(x1) - 1)]
        if len(x0) != len(x1):
            raise ValueError("ot and minibatch couplings pair sets of the same size")
        if kind == "ot":
            return x0, x1[toy.assignment(toy.cost(x0, x1))]
        if kind != "minibatch":
            raise ValueError("couple takes independent, ot, minibatch or sinkhorn")
        size = int(batch or 64)
        i0, i1 = r.permutation(len(x0)), r.permutation(len(x1))
        a, b = [], []
        for s in range(0, len(x0), size):
            p, q = x0[i0[s:s + size]], x1[i1[s:s + size]]
            a.append(p)
            b.append(q[toy.assignment(toy.cost(p, q))])
        return np.concatenate(a), np.concatenate(b)

    @staticmethod
    def pair_velocity(x, t, x0, x1, sigma=0.1, schedule="linear"):
        """The velocity a conditional flow-matching model learns from pairs (x0[k], x1[k]) with
        paths N(a x0 + b x1, sigma^2): E[a' x0 + b' x1 | x_t = x], exact on these samples."""
        a, b, da, db = _schedule(schedule)
        x, flat = _rows(x)
        p0, _ = _rows(x0)
        p1, _ = _rows(x1)
        mu = float(a(t)) * p0 + float(b(t)) * p1
        target = float(da(t)) * p0 + float(db(t)) * p1
        out = np.zeros_like(x)
        step = max(1, 2000000 // max(1, len(mu)))
        for s in range(0, len(x), step):
            part = x[s:s + step]
            logw = -toy.cost(part, mu) / (2 * sigma * sigma)
            w = np.exp(logw - logw.max(1, keepdims=True))
            out[s:s + len(part)] = (w @ target) / w.sum(1, keepdims=True)
        return out[:, 0] if flat else out

    @staticmethod
    def pair_flow(x, x0, x1, sigma=0.1, steps=60, schedule="linear", method="heun"):
        """Paths of fresh points x under pair_velocity from t=0 to 1: (paths (n, T, d), times)."""
        times = np.linspace(0, 1, steps + 1)
        v = lambda y, t: toy.pair_velocity(y, t, x0, x1, sigma, schedule)  # noqa: E731
        return toy.integrate(v, _rows(x)[0], times, method=method), times


def _hungarian(C):
    """Exact minimum-cost assignment of a square matrix (Kuhn–Munkres with potentials)."""
    n = C.shape[0]
    u, v = np.zeros(n + 1), np.zeros(n + 1)
    p, way = np.zeros(n + 1, int), np.zeros(n + 1, int)
    for i in range(1, n + 1):
        p[0], j0 = i, 0
        minv = np.full(n + 1, np.inf)
        used = np.zeros(n + 1, bool)
        while True:
            used[j0] = True
            i0 = p[j0]
            free = ~used[1:]
            cur = C[i0 - 1] - u[i0] - v[1:]
            better = free & (cur < minv[1:])
            minv[1:][better] = cur[better]
            way[1:][better] = j0
            cand = np.where(free, minv[1:], np.inf)
            j1 = int(np.argmin(cand)) + 1
            delta = cand[j1 - 1]
            seen = np.flatnonzero(used)
            u[p[seen]] += delta
            v[seen] -= delta
            minv[1:][free] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while j0:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
    out = np.zeros(n, int)
    out[p[1:] - 1] = np.arange(n)
    return out
`
