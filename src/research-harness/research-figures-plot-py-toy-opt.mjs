// aster_plot.py, toy maths for optimisation and diffusion figures: 2D test functions with exact
// gradients, optimisers, forward diffusions and their samplers (VP/VE SDE, probability-flow ODE,
// DDIM, classifier-free guidance). Python kept as a string: orcad ships the harness as one bundled
// .mjs file. Joined by research-figures-plot-lib after -toy, whose classes it finishes into toy.
export const PLOT_PY_TOY_OPT = String.raw`
class TestFn(object):
    """A 2D test function: call it as f(x, y) (vectorised), grad(p) and hess(p) exact at a
    point, minima, and xlim / ylim that show it. ap.toy.fn(name) makes one."""

    def __init__(self, name, f, grad, hess=None, minima=(), xlim=(-2, 2), ylim=(-2, 2),
                 start=None):
        self.name, self.f, self._grad, self._hess = name, f, grad, hess
        self.minima = [np.asarray(m, dtype=float) for m in minima]
        self.xlim, self.ylim = tuple(xlim), tuple(ylim)
        self.start = None if start is None else np.asarray(start, dtype=float)

    def __call__(self, x, y):
        return self.f(x, y)

    def grad(self, p):
        p = np.asarray(p, dtype=float)
        return np.asarray(self._grad(p[0], p[1]), dtype=float)

    def hess(self, p):
        """The 2 × 2 Hessian (exact when known, else central differences of the exact gradient)."""
        p = np.asarray(p, dtype=float)
        if self._hess is not None:
            return np.asarray(self._hess(p[0], p[1]), dtype=float)
        e = 1e-5
        cols = [(self.grad(p + e * d) - self.grad(p - e * d)) / (2 * e) for d in np.eye(2)]
        H = np.stack(cols, 1)
        return 0.5 * (H + H.T)

    def grid(self, n=120, xlim=None, ylim=None):
        """(X, Y, Z) on an n × n grid over the limits, for ap.landscape or ap.surface."""
        X, Y = np.meshgrid(np.linspace(*(xlim or self.xlim), n), np.linspace(*(ylim or self.ylim), n))
        return X, Y, self.f(X, Y)

    def lift(self, path_):
        """(N, 2) points to (N, 3) on the surface z = f(x, y)."""
        path_ = np.asarray(path_, dtype=float)
        return np.column_stack([path_, self.f(path_[:, 0], path_[:, 1])])


def _two_basins():
    def parts(x, y):
        e1 = np.exp(-((x - 1.2) ** 2 + (y - 0.6) ** 2))
        e2 = np.exp(-((x + 1.3) ** 2 + (y + 0.9) ** 2) / 0.6)
        return e1, e2
    f = lambda x, y: (0.12 * (x ** 2 + y ** 2) - 1.1 * parts(x, y)[0] - 0.7 * parts(x, y)[1]  # noqa: E731
                      + 0.25 * np.sin(1.4 * x) * np.cos(1.1 * y))

    def g(x, y):
        e1, e2 = parts(x, y)
        return [0.24 * x + 2.2 * (x - 1.2) * e1 + 0.7 * 2 * (x + 1.3) / 0.6 * e2
                + 0.35 * np.cos(1.4 * x) * np.cos(1.1 * y),
                0.24 * y + 2.2 * (y - 0.6) * e1 + 0.7 * 2 * (y + 0.9) / 0.6 * e2
                - 0.275 * np.sin(1.4 * x) * np.sin(1.1 * y)]
    return TestFn("two-basins", f, g, xlim=(-2.5, 2.5), ylim=(-2, 2), start=(-0.45, 1.75),
                  minima=[(1.06, 0.53)])


def _test_fn(name, b=100.0, kappa=10.0, angle=0.0):
    if name == "rosenbrock":
        return TestFn(name, lambda x, y: (1 - x) ** 2 + b * (y - x * x) ** 2,
                      lambda x, y: [-2 * (1 - x) - 4 * b * x * (y - x * x), 2 * b * (y - x * x)],
                      lambda x, y: [[2 - 4 * b * y + 12 * b * x * x, -4 * b * x], [-4 * b * x, 2 * b]],
                      [(1, 1)], (-2, 2), (-1, 3), (-1.5, 2.5))
    if name == "beale":
        r = lambda x, y: (1.5 - x + x * y, 2.25 - x + x * y * y, 2.625 - x + x * y ** 3)  # noqa: E731
        return TestFn(name, lambda x, y: sum(v * v for v in r(x, y)),
                      lambda x, y: [2 * (r(x, y)[0] * (y - 1) + r(x, y)[1] * (y * y - 1)
                                         + r(x, y)[2] * (y ** 3 - 1)),
                                    2 * (r(x, y)[0] * x + r(x, y)[1] * 2 * x * y
                                         + r(x, y)[2] * 3 * x * y * y)],
                      None, [(3, 0.5)], (-4.5, 4.5), (-4.5, 4.5), (1, 1.5))
    if name == "himmelblau":
        return TestFn(name, lambda x, y: (x * x + y - 11) ** 2 + (x + y * y - 7) ** 2,
                      lambda x, y: [4 * x * (x * x + y - 11) + 2 * (x + y * y - 7),
                                    2 * (x * x + y - 11) + 4 * y * (x + y * y - 7)],
                      None, [(3, 2), (-2.805118, 3.131312), (-3.77931, -3.283186),
                             (3.584428, -1.848126)], (-5, 5), (-5, 5), (0, 0))
    if name == "booth":
        return TestFn(name, lambda x, y: (x + 2 * y - 7) ** 2 + (2 * x + y - 5) ** 2,
                      lambda x, y: [10 * x + 8 * y - 34, 8 * x + 10 * y - 38],
                      lambda x, y: [[10, 8], [8, 10]], [(1, 3)], (-10, 10), (-10, 10), (-8, -6))
    if name == "rastrigin":
        w = 2 * np.pi
        return TestFn(name, lambda x, y: 20 + x * x + y * y - 10 * (np.cos(w * x) + np.cos(w * y)),
                      lambda x, y: [2 * x + 10 * w * np.sin(w * x), 2 * y + 10 * w * np.sin(w * y)],
                      lambda x, y: [[2 + 10 * w * w * np.cos(w * x), 0],
                                    [0, 2 + 10 * w * w * np.cos(w * y)]],
                      [(0, 0)], (-5.12, 5.12), (-5.12, 5.12), (3.2, -2.7))
    if name == "quadratic":
        c, s = np.cos(angle), np.sin(angle)
        R = np.array([[c, -s], [s, c]])
        A = R @ np.diag([1.0, float(kappa)]) @ R.T
        return TestFn(name, lambda x, y: 0.5 * (A[0, 0] * x * x + 2 * A[0, 1] * x * y + A[1, 1] * y * y),
                      lambda x, y: [A[0, 0] * x + A[0, 1] * y, A[0, 1] * x + A[1, 1] * y],
                      lambda x, y: A, [(0, 0)], (-2, 2), (-1, 1), (-1.8, 0.8))
    if name == "saddle":
        return TestFn(name, lambda x, y: 0.5 * x * x - 0.5 * y * y + 0.1 * x ** 4 + 0.1 * y ** 4,
                      lambda x, y: [x + 0.4 * x ** 3, -y + 0.4 * y ** 3],
                      lambda x, y: [[1 + 1.2 * x * x, 0], [0, -1 + 1.2 * y * y]],
                      [(0, 1.5811), (0, -1.5811)], (-2.5, 2.5), (-2.5, 2.5), (-2, 0.05))
    if name == "sharp-flat":
        # Sophia's toy loss: L1(x) = 8 (x-1)^2 (1.3 x^2 + 2 x + 1) is sharp, L2(y) = (y-4)^2 / 2 flat.
        return TestFn(name, lambda x, y: 8 * (x - 1) ** 2 * (1.3 * x * x + 2 * x + 1) + 0.5 * (y - 4) ** 2,
                      lambda x, y: [8 * (x - 1) * x * (5.2 * x + 3.4), y - 4],
                      lambda x, y: [[8 * (15.6 * x * x - 3.6 * x - 3.4), 0], [0, 1]],
                      [(1, 4)], (-0.6, 1.4), (-0.5, 5), (0.3, 0))
    if name == "two-basins":
        return _two_basins()
    raise ValueError("toy.fn takes rosenbrock, beale, himmelblau, booth, rastrigin, quadratic, "
                     "saddle, sharp-flat or two-basins")


_OPT_BETAS = {"adam": (0.9, 0.999), "rmsprop": (0.9, 0.99), "lion": (0.9, 0.99),
              "signum": (0.9, 0.9), "sophia": (0.0, 0.0)}


class Process(object):
    """A forward diffusion x_t = alpha(t) x_0 + sigma(t) eps for t in [0, 1], t = 0 the data:
    vp (Song et al. 2021, beta linear from beta[0] to beta[1]) or ve (sigma geometric from
    sigma[0] to sigma[1], alpha = 1). drift f(x, t) and g2(t) give its SDE."""

    def __init__(self, kind="vp", beta=(0.1, 20.0), sigma=(0.01, 10.0)):
        if kind not in ("vp", "ve"):
            raise ValueError("process takes vp or ve")
        self.kind, self.b, self.s = kind, tuple(beta), tuple(sigma)

    def beta(self, t):
        return self.b[0] + t * (self.b[1] - self.b[0])

    def alpha(self, t):
        if self.kind == "ve":
            return 1.0 + 0 * t
        return np.exp(-0.25 * t * t * (self.b[1] - self.b[0]) - 0.5 * t * self.b[0])

    def sigma(self, t):
        if self.kind == "ve":
            return self.s[0] * (self.s[1] / self.s[0]) ** t
        return np.sqrt(np.maximum(1 - self.alpha(t) ** 2, 1e-12))

    def f(self, x, t):
        return 0 * x if self.kind == "ve" else -0.5 * self.beta(t) * x

    def g2(self, t):
        if self.kind == "ve":
            return 2 * self.sigma(t) ** 2 * np.log(self.s[1] / self.s[0])
        return self.beta(t)

    def marginal(self, data, t):
        """The data Mix diffused to time t (exact for a Gaussian mixture)."""
        a, s = float(self.alpha(t)), float(self.sigma(t))
        return Mix(a * data.means, np.sqrt(a * a * data.std ** 2 + s * s), data.weights,
                   data.labels)


class _ToyOpt(object):
    @staticmethod
    def fn(name="rosenbrock", **kw):
        """A 2D test function with exact gradients (TestFn): rosenbrock (b=100), beale,
        himmelblau, booth, rastrigin, quadratic (kappa, angle), saddle, sharp-flat (Sophia's
        sharp and flat directions), two-basins. Or fn(f=..., grad=..., hess=None) for your own."""
        if "f" in kw:
            return TestFn(kw.get("name", "custom"), kw["f"], kw["grad"], kw.get("hess"),
                          kw.get("minima", ()), kw.get("xlim", (-2, 2)), kw.get("ylim", (-2, 2)),
                          kw.get("start"))
        return _test_fn(name, **kw)

    @staticmethod
    def landscape(kind="two-basins"):
        """f(x, y) for an optimisation landscape: two-basins, rosenbrock (log-scaled, gentle) or
        saddle; a TestFn, so f.grad(p) is exact."""
        if kind == "rosenbrock":
            inner = _test_fn("rosenbrock", b=8.0)
            return TestFn("rosenbrock-log", lambda x, y: np.log1p(inner.f(x, y)),
                          lambda x, y: np.asarray(inner._grad(x, y)) / (1 + inner.f(x, y)),
                          minima=[(1, 1)], xlim=(-2, 2), ylim=(-1, 3))
        return _test_fn(kind)

    @staticmethod
    def optimize(fn, start=None, method="gd", lr=0.1, steps=50, momentum=0.9, betas=None,
                 eps=1e-8, rho=1.0, gamma=1.0, noise=0.0, cautious=False, weight_decay=0.0,
                 seed=0):
        """An optimiser's path (steps+1, 2) on fn (a TestFn, a name, or grad(p) -> (2,)) from
        start, with exact gradients (noise adds Gaussian gradient noise, as SGD). method: gd,
        momentum (heavy ball), nesterov, rmsprop, adam, sign (sign descent), signum, lion,
        newton (full Hessian: drawn to saddles), diag-newton (per coordinate), sophia (clipped
        diagonal Newton: lr * clip(m / max(gamma h, eps), rho); no EMA unless betas). cautious
        masks update entries whose sign disagrees with the gradient (C-Optim)."""
        fn = toy.fn(fn) if isinstance(fn, str) else fn
        grad = fn.grad if hasattr(fn, "grad") else fn
        x = np.array(start if start is not None else fn.start, dtype=float)
        b1, b2 = betas if betas is not None else _OPT_BETAS.get(method, (0.9, 0.999))
        r = toy.rng(seed)
        m, v, h = np.zeros_like(x), np.zeros_like(x), np.zeros_like(x)
        out = [x.copy()]
        for k in range(1, steps + 1):
            g = grad(x) + (noise * r.standard_normal(x.shape) if noise else 0)
            if method in ("gd", "sgd"):
                u = g
            elif method in ("momentum", "nesterov"):
                m = momentum * m + g
                u = g + momentum * m if method == "nesterov" else m
            elif method == "rmsprop":
                v = b2 * v + (1 - b2) * g * g
                u = g / (np.sqrt(v) + eps)
            elif method == "adam":
                m = b1 * m + (1 - b1) * g
                v = b2 * v + (1 - b2) * g * g
                u = (m / (1 - b1 ** k)) / (np.sqrt(v / (1 - b2 ** k)) + eps)
            elif method == "sign":
                u = np.sign(g)
            elif method == "signum":
                m = b1 * m + (1 - b1) * g
                u = np.sign(m)
            elif method == "lion":
                u = np.sign(b1 * m + (1 - b1) * g)
                m = b2 * m + (1 - b2) * g
            elif method in ("newton", "diag-newton", "sophia"):
                H = fn.hess(x)
                if method == "newton":
                    u = np.linalg.lstsq(H, g, rcond=None)[0]
                elif method == "diag-newton":
                    u = g / np.where(np.abs(np.diag(H)) > eps, np.diag(H), eps)
                else:
                    m = b1 * m + (1 - b1) * g
                    h = b2 * h + (1 - b2) * np.diag(H)
                    u = np.clip(m / np.maximum(gamma * h, eps), -rho, rho)
            else:
                raise ValueError("optimize takes gd, momentum, nesterov, rmsprop, adam, sign, "
                                 "signum, lion, newton, diag-newton or sophia")
            if cautious:
                mask = (u * g > 0).astype(float)
                u = u * mask / max(mask.mean(), 1e-3)
            x = x - lr * u - lr * weight_decay * x
            if not np.all(np.isfinite(x)) or np.abs(x).max() > 1e6:
                break
            out.append(x.copy())
        return np.array(out)

    @staticmethod
    def descend(f, start, lr=0.08, steps=60, momentum=0.0, noise=0.0, seed=0):
        """An optimisation path on f by gradient descent (optional heavy-ball momentum and
        gradient noise, as SGD); exact gradients for a TestFn, finite differences otherwise."""
        if not hasattr(f, "grad"):
            e = 1e-5
            f = TestFn("f", f, lambda x, y: [(f(x + e, y) - f(x - e, y)) / (2 * e),
                                             (f(x, y + e) - f(x, y - e)) / (2 * e)])
        return toy.optimize(f, start, "momentum" if momentum else "gd", lr=lr, steps=steps,
                            momentum=momentum, noise=noise, seed=seed)

    @staticmethod
    def process(kind="vp", beta=(0.1, 20.0), sigma=(0.01, 10.0)):
        """A forward diffusion (Process): vp or ve, with alpha(t), sigma(t), f, g2, marginal."""
        return Process(kind, beta, sigma)

    @staticmethod
    def diffusion_score(x, t, data, process="vp", label=None, guidance=0.0):
        """grad log p_t(x) of a data Mix diffused to t (exact). With label, the class-conditional
        score; guidance w > 0 is classifier-free guidance (Ho & Salimans 2022):
        (1 + w) score(x | label) - w score(x)."""
        proc = toy.process(process) if isinstance(process, str) else process
        marg = proc.marginal(data, t)
        if label is None:
            return marg.score(x)
        cond = marg.given(label).score(x)
        return cond if not guidance else cond + guidance * (cond - marg.score(x))

    @staticmethod
    def sample(data, sampler="ode", process="vp", steps=60, n=200, label=None, guidance=0.0,
               eta=0.0, t_min=1e-3, seed=0, x1=None):
        """Samples of a data Mix from noise by the exact score, t from 1 to t_min: sampler ode
        (the probability-flow ODE, Heun), sde (the reverse SDE, Euler–Maruyama), ddim (eta=0
        deterministic, eta=1 is ancestral DDPM) or ddpm; process vp or ve; label and guidance
        for classifier-free guidance. Returns (paths (n, steps+1, d), times), 1D data (n, T)."""
        proc = toy.process(process) if isinstance(process, str) else process
        times = np.linspace(1.0, t_min, steps + 1)
        x = proc.marginal(data, 1.0).sample(n, seed=seed) if x1 is None else np.asarray(x1, float)
        flat = data.dim == 1
        x = x.reshape(len(x), -1)
        score = lambda y, t: toy.diffusion_score(y, t, data, proc, label, guidance)  # noqa: E731
        if sampler == "ode":
            paths_ = toy.integrate(lambda y, t: proc.f(y, t) - 0.5 * proc.g2(t) * score(y, t), x,
                                   times, method="heun")
        elif sampler == "sde":
            paths_ = toy.euler_maruyama(lambda y, t: proc.f(y, t) - proc.g2(t) * score(y, t),
                                        lambda t: np.sqrt(proc.g2(t)), x, times, seed=seed + 1)
        elif sampler in ("ddim", "ddpm"):
            eta = 1.0 if sampler == "ddpm" else eta
            r = toy.rng(seed + 1)
            out = [x.copy()]
            for t, s in zip(times[:-1], times[1:]):
                at, st, as_, ss = (float(v) for v in (proc.alpha(t), proc.sigma(t),
                                                      proc.alpha(s), proc.sigma(s)))
                e_hat = -st * score(x, t)
                x0 = (x - st * e_hat) / at
                noise_ = eta * ss / st * np.sqrt(max(st * st - (at / as_) ** 2 * ss * ss, 0.0))
                x = (as_ * x0 + np.sqrt(max(ss * ss - noise_ ** 2, 0.0)) * e_hat
                     + noise_ * r.standard_normal(x.shape))
                out.append(x.copy())
            paths_ = np.stack(out, 1)
        else:
            raise ValueError("sample takes ode, sde, ddim or ddpm")
        return (paths_[..., 0] if flat else paths_), times


class toy(_ToyData, _ToyFlow, _ToyOpt):
    """Seeded, exact toy maths for teasers and demos (deterministic for a seed): data (ring,
    moons, mix), flows and interpolants between Gaussian mixtures, couplings and OT, ODE/SDE
    integrators, diffusion samplers with guidance, test functions and optimisers. Real figures
    plot the project's own data."""
    Mix = Mix
    TestFn = TestFn
    Process = Process
`
