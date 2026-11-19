// The kit reference for time as a dimension (topic science): space-time volumes, 3D scenes with
// motion, snapshots of a scene over time, the tesseract and the time colourbar. The science
// reference spreads these in.

const SCENE =
  "objects: [{ kind: 'box', at: [x, y, z] (its base centre), size: s | [sx, sy, sz] } | { kind: 'sphere', at (its centre), r } | { kind: 'points', at, n: 80, spread, seed }, each with color, path: [[x, y, z], …] or to: [x, y, z] with arc (a throw), ghosts: n, trail: true], cameras: [{ at, look, fov: 45, aspect: 4/3, size: 0.35, color: 'ink', label }], ground: true, extent: [1, 1], trails: true, azimuth: -58, elevation: 24, pointSize: 1.6"

export const DYNAMIC_REFERENCE = [
  {
    topic: 'science',
    name: 'spacetime',
    call: "fig.spacetime({ id, x, y, w: 300, h: 170, frames: 5, projection: 'oblique' | 'iso' | 'front', azimuth, elevation, aspect: 4/3, depth: 2.4, content: 'none' | 'grid', tracks: [{ points: [[u, v] per frame] | from: [u, v], to: [u, v], bend: 0.2, color, r: 3 }], highlight: k, labels: true | ['…'], axis: true, axisLabel: '$t$', opacity: 78, color: 'accent' }) → { id, x, y, width, height }",
    does: "A space-time volume: video frames stacked along t. The frames (x, y) stand one behind another along a t axis, the first in front, seen in an oblique, iso or front view (or azimuth, elevation), each a pale sheet so what lies behind shows through; tracks thread through them (an object's [u, v] in each frame, shares from the frame's bottom-left, or from → to bent by bend), a dot where each crosses a frame, coloured by time like flowPaths; the volume's long edges, a t axis under the frames, labels $t_1$… over them. highlight puts one frame in the accent (the frame the method renders). A frame narrower than 16 units on the page prints a warning (science-thin-frames)."
  },
  {
    topic: 'science',
    name: 'scene3d',
    call: `fig.scene3d({ id, x, y, w: 260, h: 180, t: 1, ${SCENE} }) → { id, x, y, width, height }`,
    does: 'A 3D scene: boxes, spheres, points, trails and cameras. Objects stand on a ground grid in one projection (azimuth, elevation), drawn back to front as editable shapes; one that moves along a path (or at → to with arc) is shown at time t with its trail so far coloured by time and ghosts faded copies behind it; cameras add frustums (NeRF and 3DGS figures: the input views, a novel view). The first object takes the accent, the rest gray.'
  },
  {
    topic: 'science',
    name: 'snapshots3d',
    call: `fig.snapshots3d({ id, x, y, w: 600, h: 170, times: [0, 0.5, 1] | steps: 3, gap: 16, labels: true | ['…'], axis: true, ${SCENE} }) → { id, x, y, width, height, panels }`,
    does: 'One 3D scene at several times, side by side. Every panel shares one camera and one scale (fitted to everything the objects reach over time), so a moving object visibly moves; trails grow with t; each panel is labelled $t = …$ right under the scene, over a time axis (axis: false drops it). panels gives each panel’s box and t.'
  },
  {
    topic: 'science',
    name: 'tesseract',
    call: 'fig.tesseract({ id, cx, cy, size: 140 | x, y, w, h, rotation: 0.35 | [xw, zw], distance: 3, azimuth: -32, elevation: 22, vertices: true, spin: false, color: accent }) → { id, x, y, width, height }',
    does: 'A 4D hypercube projected, with rotation. The 16 vertices are rotated in the x–w and z–w planes (radians) and seen in perspective from w, then projected like a 3D object: the cube nearer in w in ink, the farther one in the colour, the 8 edges between them gray; spin adds a curved arrow for the rotation. A schematic for 4D, space-time or higher-dimensional embeddings.'
  },
  {
    topic: 'science',
    name: 'timebar',
    call: "fig.timebar({ id, x, y, w: 96, h: 8 | (vertical) w: 8, h: 72, orientation: 'horizontal' | 'vertical', color: 'accent', labels: ['$t = 0$', '$t = 1$'] | false, name, segments: 24 }) → { id, x, y, width, height }",
    does: "A small colourbar for time (gray → accent). It uses the same colour rule as flowPaths, trajectories, spacetime tracks and scene trails, so one bar keys them all; end labels under it (vertical: beside it, t = 0 at the bottom) and an optional name ('time', 'step'). Put it beside the figure's time-coloured glyph instead of a legend."
  }
]
