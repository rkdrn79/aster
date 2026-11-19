// A hand-drawn line style for perspective scenes, after the way Rough.js draws (MIT; the idea,
// not its code): each stroke drawn twice through points nudged off the true line by a seeded
// random amount, long spans bowed a little, the ends overshooting, joined as smooth curves.
// The same seed gives the same wobble, so a scene redraws identically.

const r1 = (value) => Math.round(value * 10) / 10

/** A small seeded random generator (mulberry32): the same seed, the same numbers. */
export function seeded(seed = 1) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth cubic curves through points (Catmull-Rom as Béziers), as path data. */
function curveThrough(pts) {
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`
  for (let index = 0; index < pts.length - 1; index += 1) {
    const [p0, p1, p2, p3] = [
      pts[Math.max(0, index - 1)],
      pts[index],
      pts[index + 1],
      pts[Math.min(pts.length - 1, index + 2)]
    ]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${[c1, c2, p2].map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' ')}`
  }
  return d
}

/**
 * Path data for a polyline (figure units) drawn by hand: `sketch` { roughness: 1, bowing: 1,
 * passes: 2, seed } (true for the defaults); `salt` varies the wobble between strokes.
 */
export function roughD(pts, sketch, salt = 0) {
  const options = sketch === true ? {} : sketch
  const random = seeded(((options.seed ?? 7) * 7919 + salt * 104729) >>> 0)
  const roughness = options.roughness ?? 1
  const bowing = options.bowing ?? 1
  const nudge = (amount) => (random() - 0.5) * 2 * amount
  let d = ''
  for (let pass = 0; pass < (options.passes ?? 2); pass += 1) {
    const k = pass === 0 ? 1 : 0.6
    const out = []
    pts.forEach((p, index) => {
      if (index > 0) {
        const a = pts[index - 1]
        const [dx, dy] = [p[0] - a[0], p[1] - a[1]]
        const span = Math.hypot(dx, dy)
        if (span > 12) {
          const share = 0.5 + nudge(0.1)
          const bow = nudge(bowing * roughness * span * 0.012 * k)
          out.push([a[0] + dx * share - (dy / span) * bow, a[1] + dy * share + (dx / span) * bow])
        }
      }
      out.push([p[0] + nudge(0.8 * roughness * k), p[1] + nudge(0.8 * roughness * k)])
    })
    if (out.length > 1) {
      const over = (from, to) => {
        const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
        const span = Math.hypot(dx, dy) || 1
        const extra = Math.min(2.5, span * 0.04) * random()
        return [to[0] + (dx / span) * extra, to[1] + (dy / span) * extra]
      }
      out[0] = over(out[1], out[0])
      out[out.length - 1] = over(out.at(-2), out.at(-1))
    }
    d += curveThrough(out)
  }
  return d
}
