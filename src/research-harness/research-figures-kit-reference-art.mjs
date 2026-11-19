// The kit reference for generated art in a hybrid figure (research-figures-kit-art): `figures art`
// makes a textless illustration per part, fig.art places it and anchors the vector over it.

export const ART_REFERENCE = [
  {
    topic: 'art',
    name: 'art',
    call: "fig.art({ id, part: 'camera' | src, x, y, w | h, anchors: { lens: [u, v], … } }) → { id, box: { x, y, w, h, right, bottom }, anchors, at(name | [u, v]) → [x, y], quad(...names), label(anchor, { id, text, side: 'right' | 'left' | 'above' | 'below', gap: 6, size, color, leader }), grid({ id, corners: ['tl', 'tr', 'br', 'bl'], rows, cols, color, strokeWidth, outline: true, dashed, veil }) }",
    does: "Generated art in a hybrid figure: places the keyed, textless illustration `figures art` made for this figure (part: <figure folder>/art/<slug>/<part>.png; src: any project PNG) whole, at its shape (w or h; both: it fits inside). anchors are points you read off <part>.grid.png as shares [u, v] of the art from its top-left (the red tenths: 1 = 0.1 … 9 = 0.9): a camera's lens, the top of a box; tl, tr, br, bl are found from the art's pixels (the drawn region's extreme corners: an oblique photo plane's corners), your own names win. at() turns one into a page point for an arrow's end (fig.arrow({ from: cam.at('lens'), to: 'unet' })) or a label; label() sets words or $math$ beside an anchor (leader: true draws a hairline when gap is 12 or more); grid() draws exact grid lines inside four anchors (the found corners by default: an oblique photo plane's windows and patches) as vector over the picture; veil: 30–50 lays a white veil under the lines so they read over a busy photo. Every word, symbol and count stays vector: never letters inside the art. A label on the art's clear (keyed) part is fine; on its drawn part it is label-over-image. Binds: the id."
  },
  {
    topic: 'art',
    name: 'quadGrid',
    call: "fig.quadGrid({ id, corners: [[x, y] × 4: tl, tr, br, bl], rows, cols, color: line | '#hex', strokeWidth: 1, outline: true, dashed, veil: 0 }) → { point(u, v), cell(r, c) }",
    does: 'Grid lines inside any four page points (rows × cols cells, the outline too unless outline: false): an oblique plane drawn by hand or in generated art, with exact counts. Lines are <id>-r<i> and <id>-c<j>; cell(r, c) is a cell centre for a dot or a label.'
  }
]
