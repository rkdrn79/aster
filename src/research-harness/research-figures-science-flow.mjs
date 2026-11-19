// How samples travel between two distributions, computed rather than drawn by hand: the linear
// interpolation x_t = (1 − t) x_0 + t x_1 between two Gaussian mixtures has a closed-form marginal
// (a mixture over component pairs), velocity E[x_1 − x_0 | x_t] and score, so ODE paths curve
// and never cross, SDE paths jitter and still land on the data, and snapshots show p_t exactly.
import {
  add2,
  det2,
  inv2,
  mul2,
  normalPair,
  responsibilities,
  sampleMixture
} from './research-figures-science-math.mjs'

/** The mixture p_t of x_t = (1 − t) x_0 + t x_1 with x_0 ∼ from and x_1 ∼ to drawn independently. */
export function marginalAt(from, to, t) {
  const components = []
  for (const a of from.components) {
    for (const b of to.components) {
      components.push({
        mean: [(1 - t) * a.mean[0] + t * b.mean[0], (1 - t) * a.mean[1] + t * b.mean[1]],
        // Why a floor: at t = 0 or 1 a point mass would have no density to draw.
        cov: add2(add2(a.cov, b.cov, (1 - t) ** 2, t ** 2), [1e-6, 0, 1e-6]),
        weight: a.weight * b.weight,
        pair: [a, b]
      })
    }
  }
  return { components }
}

/** The marginal velocity and score of the interpolation at (x, t). */
export function flowField(from, to) {
  return (point, t) => {
    const { components } = marginalAt(from, to, t)
    const shares = responsibilities(components, point)
    const velocity = [0, 0]
    const score = [0, 0]
    components.forEach((component, index) => {
      const [a, b] = component.pair
      const share = shares[index]
      const whitened = mul2(inv2(component.cov), [
        point[0] - component.mean[0],
        point[1] - component.mean[1]
      ])
      // Cov(x_1 − x_0, x_t) = t Σ_b − (1 − t) Σ_a, so E[x_1 − x_0 | x_t] adds it times Σ_t⁻¹ (x − m_t).
      const [cx, cy] = mul2(add2(b.cov, a.cov, t, -(1 - t)), whitened)
      velocity[0] += share * (b.mean[0] - a.mean[0] + cx)
      velocity[1] += share * (b.mean[1] - a.mean[1] + cy)
      score[0] -= share * whitened[0]
      score[1] -= share * whitened[1]
    })
    return { velocity, score }
  }
}

/**
 * Paths from `starts` (drawn from `from`) to `to`: `ode` follows the marginal velocity (RK4),
 * `sde` adds noise with the matching score drift (Euler–Maruyama, the noise fading to zero at
 * the data), so both end on `to`. Each path has steps + 1 points.
 */
export function integratePaths(
  from,
  to,
  starts,
  { kind = 'ode', steps = 48, noise = 1, random } = {}
) {
  const field = flowField(from, to)
  // Why a scale: the noise is a share of the source's spread, so it reads the same at any size.
  const spread = Math.sqrt(
    Math.max(...from.components.map((component) => Math.sqrt(det2(component.cov))))
  )
  return starts.map((start) => {
    const path = [start]
    let point = start
    const dt = 1 / steps
    for (let step = 0; step < steps; step += 1) {
      const t = step * dt
      if (kind === 'ode') {
        const k1 = field(point, t).velocity
        const k2 = field(
          [point[0] + (dt / 2) * k1[0], point[1] + (dt / 2) * k1[1]],
          t + dt / 2
        ).velocity
        const k3 = field(
          [point[0] + (dt / 2) * k2[0], point[1] + (dt / 2) * k2[1]],
          t + dt / 2
        ).velocity
        const k4 = field(
          [point[0] + dt * k3[0], point[1] + dt * k3[1]],
          Math.min(1, t + dt)
        ).velocity
        point = [
          point[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
          point[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
        ]
      } else {
        const { velocity, score } = field(point, t)
        const g = noise * spread * 0.9 * Math.sqrt(Math.max(0, 1 - t - dt))
        const [z1, z2] = normalPair(random)
        point = [
          point[0] + (velocity[0] + 0.5 * g * g * score[0]) * dt + g * Math.sqrt(dt) * z1,
          point[1] + (velocity[1] + 0.5 * g * g * score[1]) * dt + g * Math.sqrt(dt) * z2
        ]
      }
      path.push(point)
    }
    return path
  })
}

/**
 * Samples from the core of a mixture: within `reach` standard deviations of their component
 * (drawn again past it), so a few paths do not start or end far outside the drawn rings.
 */
export function sampleCore(mixture, n, random, reach = 2) {
  const points = []
  for (let tries = 0; points.length < n && tries < 50; tries += 1) {
    for (const point of sampleMixture(mixture, n, random)) {
      const near = mixture.components.some((component) => {
        const [dx, dy] = [point[0] - component.mean[0], point[1] - component.mean[1]]
        const [p, q, r] = inv2(component.cov)
        return p * dx * dx + 2 * q * dx * dy + r * dy * dy <= reach * reach
      })
      if (near && points.length < n) {
        points.push(point)
      }
    }
  }
  return points
}

/**
 * Pairs of a source and a target sample: `ot` matches them by rank across the direction of
 * travel, so straight paths do not cross (rectified flow, optimal transport); `random` pairs them
 * independently, so straight paths cross (the conditional paths of flow matching).
 */
export function couple(from, to, n, { coupling = 'ot', random }) {
  const sources = sampleCore(from, n, random)
  const targets = sampleCore(to, n, random)
  if (coupling === 'random') {
    return sources.map((source, index) => [source, targets[index]])
  }
  const mean = (points) =>
    points.reduce((sum, [x, y]) => [sum[0] + x / points.length, sum[1] + y / points.length], [0, 0])
  const [ax, ay] = mean(sources)
  const [bx, by] = mean(targets)
  const length = Math.hypot(bx - ax, by - ay) || 1
  const across = [-(by - ay) / length, (bx - ax) / length]
  const rank = (points) =>
    points.toSorted(
      (p, q) => p[0] * across[0] + p[1] * across[1] - (q[0] * across[0] + q[1] * across[1])
    )
  const sortedTargets = rank(targets)
  return rank(sources).map((source, index) => [source, sortedTargets[index]])
}

// One dimension: values along a vertical axis, time along x.

/** A 1D mixture `{ modes: [m, …], widths, weights }` (values in −3…3 like a standard normal). */
export function mixture1d(spec = {}) {
  const modes = spec.modes ?? [0]
  const widths = spec.widths ?? modes.map(() => (modes.length > 1 ? 0.35 : 1))
  const weights = spec.weights ?? modes.map(() => 1)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  return modes.map((mean, index) => ({
    mean,
    sd: [widths].flat()[index] ?? widths[0],
    weight: weights[index] / total
  }))
}

export const density1d = (mixture, value) =>
  mixture.reduce(
    (sum, c) =>
      sum +
      (c.weight * Math.exp(-0.5 * ((value - c.mean) / c.sd) ** 2)) /
        (c.sd * Math.sqrt(2 * Math.PI)),
    0
  )

export function sample1d(mixture, n, random) {
  return Array.from({ length: n }, () => {
    let pick = random()
    const c = mixture.find((item) => (pick -= item.weight) < 0) ?? mixture.at(-1)
    return c.mean + c.sd * normalPair(random)[0]
  })
}

/** n values at the middle of n equal shares of a 1D mixture's mass (from a large seeded sample). */
export function quantiles1d(mixture, n, random) {
  const pool = sample1d(mixture, 4000, random).toSorted((a, b) => a - b)
  return Array.from(
    { length: n },
    (_, k) => pool[Math.min(pool.length - 1, Math.floor(((k + 0.5) / n) * pool.length))]
  )
}

/** Value paths over t from `from` to `to` (1D): straight (ranked pairs), ode or sde. */
export function paths1d(from, to, n, { kind = 'ode', steps = 60, noise = 1, random } = {}) {
  // Why quantiles: evenly spread starts fan out over the whole prior, as a reader expects.
  const starts = quantiles1d(from, n, random)
  if (kind === 'straight') {
    const ends = quantiles1d(to, n, random)
    return starts.map((start, index) =>
      Array.from({ length: steps + 1 }, (_, k) => start + ((ends[index] - start) * k) / steps)
    )
  }
  const lift = (mixture) => ({
    components: mixture.map((c) => ({
      mean: [c.mean, 0],
      cov: [c.sd * c.sd, 0, 1],
      weight: c.weight
    }))
  })
  const paths = integratePaths(
    lift(from),
    lift(to),
    starts.map((value) => [value, 0]),
    { kind, steps, noise, random }
  )
  // Why only x: the second axis is a unit Gaussian on both sides, carried along unchanged.
  return paths.map((path) => path.map(([value]) => value))
}
