// The kit reference for concept schematics (topic schematic, its own page): curved arrows and
// self-loops, rotated ellipses, 2D curve manifolds, and a teaser grid sized for print.

const LABEL =
  "label (TeX) | labelText, labelSide: 'below' | 'above' | 'left' | 'right', labelSize, labelColor"

export const SCHEMATIC_REFERENCE = [
  {
    topic: 'schematic',
    name: 'curve',
    call: "fig.curve({ id, from, to, shape: 'arc' | 's', bend: 'arc' | units, heads: 'end' | 'both' | 'none', role, color, strokeWidth, dashed, label, labelText, labelSize, labelGap: 4, labelOffset }) → element",
    does: "A curved arrow for a schematic: a smooth arc or an S. For what moves along a curve (a transport map, an update that swings round, a transition between two states, two opposite arcs between the same pair: give each the same bend and they bulge apart). Not for connectors between boxes, which stay horizontal and vertical (fig.arrow). from, to: ids (bound, like arrow's) or [x, y]; bend: units to the left of travel (negative: right; 'arc' a quarter of the length); shape 's' bulges both ways and lands level. The label sits off the bulge (beside the middle for an S)."
  },
  {
    topic: 'schematic',
    name: 'loop',
    call: "fig.loop({ id, on: nodeId, side: 'top' | 'right' | 'bottom' | 'left' | degrees, size: 26, spread: 60, gap: 3, heads, role, color, strokeWidth, label, labelText, labelSize, labelGap: 4 }) → element",
    does: 'A self-loop on a node: a state that stays, a recurrent edge, a self-transition with its probability. It leaves the node’s outline at side − spread / 2 and re-enters at side + spread / 2 (degrees; side as a number: 0 right, 90 up), size units out, its head on the node; both ends bound to it. The label sits past the loop’s far side. For a state graph (an HMM, a Markov chain): fig.node or box for the states, curve for the transitions (opposite pairs bend apart), loop for each self-transition.'
  },
  {
    topic: 'schematic',
    name: 'ellipse',
    call: "fig.ellipse({ id, cx, cy, rx: 24, ry, angle: 0, cov: [[sxx, sxy], [sxy, syy]], sigmas: [1, 2], levels: 1, color: 'accent', fill: true, stroke, strokeWidth, dashed, opacity, centre: false, label }) → { id, x, y, width, height, rx, ry, angle }",
    does: 'A rotated ellipse: a covariance, a Gaussian splat, a density blob. rx, ry (units) turned angle degrees counter-clockwise, or cov (scene units², y down) drawn as rings at sigmas (1σ and 2σ); levels nests filled rings pale → strong (a blob with a core); fill: false draws outlines (ink or the colour); opacity lets overlapping blobs show through. Returns the axes it drew. Binds: the id.',
    options: [['label', '', LABEL]]
  },
  {
    topic: 'schematic',
    name: 'curveManifold',
    call: "fig.curveManifold({ id, x, y, w: 200, h: 100, curve: 'arc' | 's' | 'wave' | 'line' | [[u, v], …], shells: [12], on: 0, off: 0, r: 2.5, seed: 1, tangent: share | { at, length }, projections: [{ off: k } | { from: [x, y] }], color: 'accent', strokeWidth: 1.5, shellDashed, label }) → { id, x, y, width, height, point(s), normal(s), offset(s, d), offPoints }",
    does: 'A data manifold drawn as a curve in the plane, with points on and off it. The curve (a preset, or [u, v] shares of the box smoothed) in the colour’s ink; shells are offset bands around it (units, nested pale → strong: the noisy neighbourhoods M_t around M); on puts dots on the curve, off seeded gray dots beyond the innermost band; tangent draws the dashed tangent line at a share; projections drop an off dot (or a point) onto the curve, dashed, with a dot at the foot. point(s), normal(s) and offset(s, d) (s a share of its length, d units off it, positive to the left of travel) place labels and step arrows (curve or arrow with allowDiagonal). The 3D sheet is manifold.',
    options: [['label', '', LABEL]]
  },
  {
    topic: 'schematic',
    name: 'teaserGrid',
    call: "fig.teaserGrid({ id, panels: ['(a) Data', …] | n, rows: 1, x, y, w, h, gap: 12, pad: 8, captions: 'below' | 'none', outline: true, color: 'none', minPt: 8 }) → { panels: [{ id, x, y, w, h, body, slots(n | [weights]) }], sizes: { label, math, caption, note, dot, path, hero } }",
    does: "Equal panels for a generation teaser, sized to the page for print. A row (or rows) of panels filling the page inside 12-unit margins, each with the quiet outline and its caption below; sizes gives the type, dot and stroke sizes (units) that print at minPt or more on this page (labels 8 pt, math 9 pt so its scripts stay near 6.3 pt, dots r 2.5, the highlighted path 2.5), scaled up when the page prints shrunk. body is a panel's drawing area; slots(3) splits it into source, p_t and target boxes for density2d. Warns when a panel's drawing is narrower than 1.1 in at print and says how many fit a row; then use rows: 2, fewer panels or a wider page."
  }
]
