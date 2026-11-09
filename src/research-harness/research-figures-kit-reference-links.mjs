// The kit reference for connections added in round 10, split from research-figures-kit-reference.mjs
// to keep files short; GENRE_REFERENCE appends these.

export const LINK_REFERENCE = [
  {
    topic: 'arrows',
    name: 'ellipsis',
    call: "fig.ellipsis({ id, cx, cy | x, y, axis: 'x' | 'y', size: 24, depth: 24, r: 1.25, color: ink })",
    does: "An ellipsis that arrows and lanes bind to: ⋯ (axis 'y': ⋮) as three dots inside an invisible box size long and depth deep, which carries the id, so it has real bounds (math('\\\\cdots') is only a couple of units tall). Use it for “x_T … x_t” in a diffusion row or “…” between tokens. Binds: the id."
  }
]
