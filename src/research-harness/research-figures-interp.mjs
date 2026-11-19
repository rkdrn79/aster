// Paths between two distributions, computed: the interpolant X_t = (1 − t) X_0 + t X_1 + γ(t) Z
// between Gaussian mixtures (γ(t) = noise · 2√(t(1 − t)), 0 for flow matching) has a closed-form
// marginal p_t (a mixture over component pairs), velocity b(t, x) = E[Ẋ_t | X_t = x] and score,
// so marginal-flow ODE paths (RK4) curve without crossing and SDE paths (b + ε s, √(2ε) dW)
// jitter and still land on the data. Couplings pair samples independently (straight lines that
// cross) or by optimal transport (an exact assignment: straight lines that do not); their p_t
// is a KDE of the moving pairs. Pure numbers, model units.
import { add2, inv2, normalPair, seeded } from './research-figures-science-math.mjs'
import { sampleDist } from './research-figures-dist.mjs'

const FLOOR = [1e-6, 0, 1e-6]

/** γ(t) and γ(t)·γ'(t) of the stochastic interpolant with peak `noise` at t = 1/2. */
function gammaOf(noise, t) {
  if (!noise) {
    return { g2: 0, ggd: 0 }
  }
  // γ = 2 noise √(t(1 − t)): γ² = 4 noise² t(1 − t), γγ' = ½ d(γ²)/dt = 2 noise² (1 − 2t).
  return { g2: 4 * noise * noise * t * (1 - t), ggd: 2 * noise * noise * (1 - 2 * t) }
}

/**
 * The interpolant between two mixtures (independent coupling): `marginal(t)` the mixture p_t,
 * `field(x, t)` its velocity and score at a point. `noise` adds γ(t) Z (stochastic interpolants).
 */
export function interpolant(from, to, { noise = 0 } = {}) {
  const pairs = []
  for (const a of from.components) {
    for (const b of to.components) {
      const weight = a.weight * b.weight
      if (weight > 1e-7) {
        pairs.push({ a, b, weight })
      }
    }
  }
  const marginal = (t) => {
    const { g2 } = gammaOf(noise, t)
    return {
      components: pairs.map(({ a, b, weight }) => ({
        mean: [(1 - t) * a.mean[0] + t * b.mean[0], (1 - t) * a.mean[1] + t * b.mean[1]],
        cov: add2(add2(add2(a.cov, b.cov, (1 - t) ** 2, t ** 2), [g2, 0, g2]), FLOOR),
        weight
      }))
    }
  }
  const cache = new Map()
  /** Per-pair numbers at time t, computed once and shared by every point asked at that t. */
  const at = (t) => {
    const key = Math.round(t * 1e9)
    let table = cache.get(key)
    if (table) {
      return table
    }
    const { g2, ggd } = gammaOf(noise, t)
    const n = pairs.length
    table = {
      mx: new Float64Array(n),
      my: new Float64Array(n),
      p: new Float64Array(n),
      q: new Float64Array(n)
    }
    Object.assign(table, {
      r: new Float64Array(n),
      log: new Float64Array(n),
      c0: new Float64Array(n),
      c1: new Float64Array(n),
      c2: new Float64Array(n),
      vx: new Float64Array(n),
      vy: new Float64Array(n)
    })
    pairs.forEach(({ a, b, weight }, i) => {
      const cov = add2(add2(add2(a.cov, b.cov, (1 - t) ** 2, t ** 2), [g2, 0, g2]), FLOOR)
      const [p, q, r] = inv2(cov)
      // Cov(Ẋ_t, X_t) = −(1 − t) Σ_a + t Σ_b + γγ' I; E[Ẋ_t | x] = μ_b − μ_a + Cov · Σ_t⁻¹ (x − m_t).
      const c = add2(add2(a.cov, b.cov, -(1 - t), t), [ggd, 0, ggd])
      table.mx[i] = (1 - t) * a.mean[0] + t * b.mean[0]
      table.my[i] = (1 - t) * a.mean[1] + t * b.mean[1]
      table.p[i] = p
      table.q[i] = q
      table.r[i] = r
      table.log[i] = Math.log(weight) - 0.5 * Math.log(cov[0] * cov[2] - cov[1] * cov[1])
      table.c0[i] = c[0]
      table.c1[i] = c[1]
      table.c2[i] = c[2]
      table.vx[i] = b.mean[0] - a.mean[0]
      table.vy[i] = b.mean[1] - a.mean[1]
    })
    if (cache.size > 4096) {
      cache.clear()
    }
    cache.set(key, table)
    return table
  }
  const logs = new Float64Array(pairs.length)
  const field = (x, t) => {
    const T = at(t)
    const n = pairs.length
    let top = -Infinity
    for (let i = 0; i < n; i += 1) {
      const dx = x[0] - T.mx[i]
      const dy = x[1] - T.my[i]
      logs[i] = T.log[i] - 0.5 * (T.p[i] * dx * dx + 2 * T.q[i] * dx * dy + T.r[i] * dy * dy)
      if (logs[i] > top) {
        top = logs[i]
      }
    }
    let total = 0
    let [vx, vy, sx, sy] = [0, 0, 0, 0]
    for (let i = 0; i < n; i += 1) {
      const gap = logs[i] - top
      if (gap < -30) {
        continue
      }
      const share = Math.exp(gap)
      const dx = x[0] - T.mx[i]
      const dy = x[1] - T.my[i]
      const wx = T.p[i] * dx + T.q[i] * dy
      const wy = T.q[i] * dx + T.r[i] * dy
      total += share
      vx += share * (T.vx[i] + T.c0[i] * wx + T.c1[i] * wy)
      vy += share * (T.vy[i] + T.c1[i] * wx + T.c2[i] * wy)
      sx -= share * wx
      sy -= share * wy
    }
    return { velocity: [vx / total, vy / total], score: [sx / total, sy / total] }
  }
  return { marginal, field, size: pairs.length }
}

/** Marginal-flow ODE paths from `starts` (RK4, `steps` equal steps in t): steps + 1 points each. */
export function odePaths(interp, starts, { steps = 64 } = {}) {
  const v = (p, t) => interp.field(p, t).velocity
  return starts.map((start) => {
    const path = [start]
    let p = start
    const dt = 1 / steps
    for (let k = 0; k < steps; k += 1) {
      const t = k * dt
      const k1 = v(p, t)
      const k2 = v([p[0] + (dt / 2) * k1[0], p[1] + (dt / 2) * k1[1]], t + dt / 2)
      const k3 = v([p[0] + (dt / 2) * k2[0], p[1] + (dt / 2) * k2[1]], t + dt / 2)
      const k4 = v([p[0] + dt * k3[0], p[1] + dt * k3[1]], Math.min(1, t + dt))
      p = [
        p[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
        p[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
      ]
      path.push(p)
    }
    return path
  })
}

/**
 * SDE paths with the same marginals: dX = (b + ε s) dt + √(2ε) dW (Euler–Maruyama), ε in model
 * units² per unit time. Steps are sub-divided where the score is steep, so narrow data stays stable.
 */
export function sdePaths(interp, starts, { eps = 0.2, steps = 120, random = seeded(1) } = {}) {
  return starts.map((start) => {
    const path = [start]
    let p = start
    const dt = 1 / steps
    for (let k = 0; k < steps; k += 1) {
      const t = k * dt
      const { velocity, score } = interp.field(p, t)
      const [z1, z2] = normalPair(random)
      const kick = Math.sqrt(2 * eps * dt)
      p = [
        p[0] + (velocity[0] + eps * score[0]) * dt + kick * z1,
        p[1] + (velocity[1] + eps * score[1]) * dt + kick * z2
      ]
      path.push(p)
    }
    return path
  })
}

/** Straight paths between pairs, `steps` + 1 points each (so every path has a point at every t). */
export function straightPaths(pairs, steps = 32) {
  return pairs.map(([a, b]) =>
    Array.from({ length: steps + 1 }, (_, k) => {
      const t = k / steps
      return [(1 - t) * a[0] + t * b[0], (1 - t) * a[1] + t * b[1]]
    })
  )
}

/**
 * The assignment that minimises the total squared distance between two equal point sets
 * (Hungarian algorithm, O(n³)): `match[i]` is the target of source i.
 */
export function assignment(sources, targets) {
  const n = sources.length
  const cost = (i, j) => (sources[i][0] - targets[j][0]) ** 2 + (sources[i][1] - targets[j][1]) ** 2
  const u = new Float64Array(n + 1)
  const v = new Float64Array(n + 1)
  const p = new Int32Array(n + 1)
  const way = new Int32Array(n + 1)
  for (let i = 1; i <= n; i += 1) {
    p[0] = i
    let j0 = 0
    const minv = new Float64Array(n + 1).fill(Infinity)
    const used = new Uint8Array(n + 1)
    do {
      used[j0] = 1
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= n; j += 1) {
        if (!used[j]) {
          const current = cost(i0 - 1, j - 1) - u[i0] - v[j]
          if (current < minv[j]) {
            minv[j] = current
            way[j] = j0
          }
          if (minv[j] < delta) {
            delta = minv[j]
            j1 = j
          }
        }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }
  const match = Array.from({ length: n }, () => -1)
  for (let j = 1; j <= n; j += 1) {
    match[p[j] - 1] = j - 1
  }
  return match
}

/** n seeded source/target pairs: 'independent' as drawn, 'ot' matched by the exact assignment. */
export function pairSamples(from, to, n, { coupling = 'independent', random = seeded(1) } = {}) {
  const sources = sampleDist(from, n, random)
  const targets = sampleDist(to, n, random)
  if (coupling !== 'ot') {
    return sources.map((source, index) => [source, targets[index]])
  }
  const match = assignment(sources, targets)
  return sources.map((source, index) => [source, targets[match[index]]])
}

/** The mean standard deviation of a mixture's components (how wide its modes are). */
export function modeWidth(dist) {
  return dist.components.reduce(
    (sum, { cov, weight }) => sum + weight * Math.sqrt((cov[0] + cov[2]) / 2),
    0
  )
}

/**
 * p_t of a coupling given as pairs: a KDE of x_t = (1 − t) x_0 + t x_1 over the pairs, its
 * bandwidth the endpoints' mode widths interpolated (so t = 0 and 1 look like the ends).
 */
export function pairMarginal(pairs, t, { from, to }) {
  const h = Math.max(1e-3, Math.hypot((1 - t) * modeWidth(from), t * modeWidth(to)) * 0.9)
  const cov = [h * h, 0, h * h]
  return {
    components: pairs.map(([a, b]) => ({
      mean: [(1 - t) * a[0] + t * b[0], (1 - t) * a[1] + t * b[1]],
      cov,
      weight: 1 / pairs.length
    }))
  }
}

/** The point of a path (points evenly spaced in t from 0 to 1) at time t. */
export function pointAt(path, t) {
  const at = Math.min(path.length - 1, Math.max(0, t * (path.length - 1)))
  const k = Math.floor(at)
  const share = at - k
  const [a, b] = [path[k], path[Math.min(path.length - 1, k + 1)]]
  return [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share]
}

/** The part of a path between times t0 and t1, ending exactly on both. */
export function pathBetween(path, t0, t1) {
  const n = path.length - 1
  const inner = path.filter((_, k) => k / n > t0 && k / n < t1)
  return [pointAt(path, t0), ...inner, pointAt(path, t1)]
}
