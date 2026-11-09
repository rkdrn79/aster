// The kit's API reference, printed by `figures kit [topic|name]`: every function with its
// options, defaults, return value and what arrows bind to. A test keeps it complete.
import { GENRE_REFERENCE } from './research-figures-kit-reference-genres.mjs'

const COLOR =
  "block | strong | mid (a gray that shows on white) | panel | white | accent | accent-strong | accent-ink | secondary | loss | good | bad | ink | line | muted | red | none | '#hex' (figures kit colors)"

export const KIT_REFERENCE = [
  {
    topic: 'figure',
    name: 'openFigure',
    call: "openFigure(new URL('../method.excalidraw', import.meta.url)) → fig",
    does: 'Opens a scene (a path, or a URL beside the script). Adding an id that exists replaces it; an id used twice in one run throws.'
  },
  {
    topic: 'figure',
    name: 'style',
    call: "fig.style('graphite' | 'slate' | 'outline' | 'blue-amber' | 'sage-butter' | 'tonal' | 'print-mono' | 'illustrative' | 'categorical', { accent, panels })",
    does: 'The colour preset, kept on the page (`figures kit colors` shows each with its hex values and rules; old neutral is graphite). accent: a swatch (blue, teal, green, amber, clay, slate, violet) or any #hex, turned into tint, strong, ink and solid by the colour study’s rule. illustrative (overviews and teasers) draws in Nunito with panel tints (panels: rose, teal, sand, sky, sage, lilac): colour names panel-1, panel-2, panel-1-ink. Labels are 16 units (8 pt) and small text 14 (7 pt) on every page; the lint flags text under 14 units (7 pt) on a single-column page.'
  },
  {
    topic: 'figure',
    name: 'palette',
    call: 'fig.palette() → { style, accent, block, strong, mid, panel, white, ink, line, muted, outline, accents: [{ name, role, fill, strong, ink, solid }], panels: [{ name: panel-1, swatch, fill, strong, ink }], loss, good, bad }',
    does: "The current style’s colours as hex, for glyphs you colour yourself. Prefer role names (`color: 'accent-strong'`, 'panel-1', 'panel-1-ink', 'panel-1-strong'; a panel swatch such as 'rose' works on any page; good and bad are the right/wrong tints every preset has)."
  },
  {
    topic: 'figure',
    name: 'reset',
    call: 'fig.reset()',
    does: 'Clears all but the page and its areas: start a full redraw with it.'
  },
  {
    topic: 'figure',
    name: 'setPage',
    call: 'await fig.setPage({ widthIn, heightIn, reference, matchReference })',
    does: 'Resizes the page (single column 3.25 in = 468 units wide, double 6.75 in = 972); the height follows the content.'
  },
  {
    topic: 'figure',
    name: 'save',
    call: 'await fig.save({ dryRun }) → { errors, warnings, notes, bounds? }',
    does: 'Writes the scene and returns the lint; dryRun: true writes nothing and also returns every item’s bounds. notes are what you cannot settle alone (a page Aster or the person sized that the drawing leaves sparse: keep it, and suggest a size once in your reply). Without a note, do not ask about or suggest a page size.'
  },
  {
    topic: 'figure',
    name: 'bounds',
    call: 'fig.bounds(id, { own }) → { x, y, width, height, right, bottom }',
    does: 'Measures everything drawn under an id: a box with its badges, a glyph with its labels, a loss with its rings and links. own: true measures only the element with that id (the loss node); fig.get(id) returns that element.'
  },
  {
    topic: 'figure',
    name: 'measure',
    call: "fig.measure('box' | 'text' | 'math' | 'loss' | 'tokens' | 'attention' | 'features' | 'distribution' | 'matrix' | 'grid' | 'card' | 'bubble' | 'nn' | 'callout' | 'arrowLabel', spec) → { x, y, width, height }",
    does: "How big an item comes out (text by its ink), without drawing it: size boxes and gaps before placing them. card, bubble, nn (with its label) and callout take the spec you would draw them with; arrowLabel takes an arrow's label | labelText and labelSize. save({ dryRun: true }) lints without writing and adds bounds: every item’s box by id."
  },
  {
    topic: 'figure',
    name: 'get',
    call: 'fig.get(id) → element',
    does: 'The element with that id; throws when there is none.'
  },
  {
    topic: 'figure',
    name: 'allow',
    call: 'fig.allow(rule, ids | { x, y, w, h } | undefined)',
    does: "Marks a finding as intended, so `figures check` stops reporting it: fig.allow('empty-box', ['W']) for those items (a d×d square that carries meaning), fig.allow('uneven-spacing', ['gap-col']) for a gap left on purpose, fig.allow('empty-region', { x, y, w, h }) for a stretch left empty on purpose (unused experts), fig.allow('tall-figure') for the whole figure. Rules: empty-box, empty-region, empty-space, uneven-spacing, page-fill, tall-figure, small-thumbnail, long-dash, text-size, prose (example text drawn as data outside a card or bubble), legend (small swatches beside words that are not a key), flat-background (one tint behind the figure that does mean something). intentional: true on a box allows empty-box, uneven-spacing and empty-region for it. fig.reset() clears the figure-wide ones, so a script states them again. Use it only for a choice you would defend in the reply, never to silence a finding you could fix."
  },
  {
    topic: 'figure',
    name: 'remove',
    call: 'fig.remove(...ids)',
    does: 'Deletes items with their labels; arrows bound to them lose the binding.'
  },
  {
    topic: 'figure',
    name: 'order',
    call: "fig.order('back' | 'front', ...ids)",
    does: 'Moves items (all their elements) to the back or the front.'
  },
  {
    topic: 'figure',
    name: 'area',
    call: 'fig.area(id) → { frame, children(), neighbours(margin), clear() }',
    does: 'A Generate-in-area frame and what is in and around it.'
  },
  {
    topic: 'figure',
    name: 'areas',
    call: 'fig.areas()',
    does: 'The area frames with their requests.'
  },
  {
    topic: 'figure',
    name: 'reference',
    call: 'await fig.reference() → { path, width, height, unitsPerPixel }',
    does: 'A recreation’s reference image and its scale.'
  },
  {
    topic: 'shapes',
    name: 'box',
    call: 'fig.box(spec) → element',
    does: 'A block with its label. Binds: the id.',
    options: [
      ['id', '', 'required'],
      ['x, y | cx, cy', '0', 'top-left, or the centre'],
      [
        'w, h',
        'fit the label + room',
        'given sizes only grow to what the label needs; exact: true keeps them'
      ],
      [
        'label',
        "''",
        "text ('\\n' breaks lines), words with $math$ ('predictor $P_\\\\phi$'), or runs: ['predictor ', { text, size }, '\\n', { tex: 'P_\\\\phi' }] (runs never wrap)"
      ],
      [
        'math, inline',
        '',
        "a TeX line under the label: 'E_\\\\theta' (two lines, 64 tall); inline: true puts it after the label on one line"
      ],
      [
        'math',
        '',
        "a TeX line under the label: 'E_\\\\theta' (two lines; inline: true, or runs such as label: ['encoder ', { tex: 'E_\\\\theta' }], keep it on the label's line)"
      ],
      ['size', 'page text size', 'label size'],
      ['color', 'block', COLOR],
      ['fill, stroke', 'from color', "a colour name or '#hex'; stroke 'transparent' is fill-only"],
      [
        'labelColor, labelAlign, labelValign, labelOffset',
        '',
        'label placement, for plain, runs and math labels alike: left/right, top/bottom, [dx, dy]'
      ],
      ['shape', 'rectangle', 'rectangle | ellipse | diamond'],
      [
        'bar',
        'false',
        'a shared-model bar spanning its inputs, wide or tall (an encoder bar beside a column); the empty-box lint lets it be'
      ],
      [
        'intentional',
        'false',
        'a shape whose size means something (a d × d weight): empty-box, uneven-spacing and empty-region let it be'
      ],
      ['rounded', 'style radius', 'a radius, or false for square'],
      ['dashed, dotted, strokeWidth', '', 'outline style'],
      ['frame', 'null', 'an area frame id']
    ]
  },
  {
    topic: 'shapes',
    name: 'text',
    call: 'fig.text(spec) → element (or { elements, x, y, width, height, right, bottom } with runs or math)',
    does: 'Free text. The result has its measured width and height: lay out what follows with them.',
    options: [
      ['text', '', "the words ('\\n' breaks lines); runs instead for math or several sizes"],
      ['x, y', '0', 'top-left; align says what x is (left, center, right)'],
      ['cx, cy', '', 'centre instead'],
      ['baseline', '', 'puts the first baseline there (TEXT_BASELINE × size below the top)'],
      ['size', 'page text size', ''],
      ['color', 'ink', COLOR],
      ['lineHeight', '1.25', ''],
      [
        'runs',
        '',
        "several sizes or math on one line: ['a ', { tex: 'x_t' }]; text with $math$ ('score $r_t$') draws as runs too, and a character the font lacks (⋮) is typeset; x, y | cx, cy | baseline place them, measure('text', { runs }) sizes them"
      ]
    ]
  },
  {
    topic: 'shapes',
    name: 'math',
    call: 'fig.math({ id, tex, x, y | cx, cy | baseline, align, size, scriptSize, color }) → { elements, width, height, x, baseline }',
    does: 'TeX typeset by MathJax as vector SVG: serif italic symbols, real scripts, \\frac, \\mathcal, \\hat (a text fallback without it). Explicit math is always TeX, here, in $…$ (also inside a runs item { text, size }) and in { tex }: O(TL) never prints as words; only \\text{…} does. Elements are <id>-0…; arrows bind to the id. Brace scripts: s^{(i)}.'
  },
  {
    topic: 'shapes',
    name: 'polyline',
    call: 'fig.polyline({ id, points, closed, fill, color, stroke, strokeWidth, dashed, opacity })',
    does: "An open line, or a polygon (closed), filled in its colour unless fill: 'none'; opacity 0–100 lets a photo show through. For a region on a photo use image({ mask }). Arrows cannot bind to lines."
  },
  {
    topic: 'shapes',
    name: 'dot',
    call: 'fig.dot({ id, cx, cy, r: 3, color, stroke })',
    does: 'A filled dot (a junction, a time step). Binds: the id.'
  },
  {
    topic: 'shapes',
    name: 'trapezoid',
    call: "fig.trapezoid({ id, x, y, w, h, narrow | side: 'top', ratio: 0.6, corners, label, math, color })",
    does: "A VAE-style trapezoid: narrow (side is the same option) names its short side, top | bottom | left | right (an encoder narrowing to the right: narrow: 'right'); ratio is the short side's length over the long side's. corners: four absolute points, clockwise, for a lopsided one. label and math work as in box (runs with { tex } for one line, never wrapped) and sit in an invisible box of its bounds, which arrows bind to (the id). Keep labels in its wide part."
  },
  {
    topic: 'shapes',
    name: 'rounded',
    call: "fig.rounded({ id, x, y, w, h, side: 'top', radius, label, color })",
    does: 'A block with one rounded end. Binds: the id.'
  },
  {
    topic: 'shapes',
    name: 'grid',
    call: "fig.grid({ id, x, y, rows, cols, cell: 16 | [w, h], gap, fills, omit, cellStroke, cellStrokes, rules: true | 'vertical', outline, color, label, labelSide })",
    does: "A grid of cells <id>-r<i>c<j>; fills[row][col] take colours (null or 'none' leaves the cell out); omit: (row, col) => true or [[row, col]] leaves cells out too (a causal triangle: omit: (r, c) => c > r), with no outline round the gap unless outline is set; cellStroke: every cell’s border, cellStrokes: (row, col) => colour or [[colour]] one cell’s; white cells part in gray. outline: true (or a colour) shows the border in every style, false hides it. label: TeX below it. Binds: the outline (the id)."
  },
  {
    topic: 'shapes',
    name: 'stack',
    call: 'fig.stack({ id, x, y, w: 48, h: 64, count: 3, offset: 6, label, color, stroke })',
    does: 'Cards stacked up and to the right, all inside w × h (the whole stack, offsets included). White or pale cards get gray edges so they show on white and on a tint; tinted ones keep white seams. Binds: the invisible outline.'
  },
  {
    topic: 'shapes',
    name: 'node',
    call: "fig.node({ id, cx, cy, r: 9, symbol: 'plus' | 'times' | 'dot' })",
    does: '⊕, ⊗ or ⊙ drawn with lines. Binds: the circle.'
  },
  {
    topic: 'shapes',
    name: 'part',
    call: 'fig.part(name, { id, x, y, w, h, label, color })',
    does: 'A library part (`figures parts`). Binds: the id.'
  },
  {
    topic: 'shapes',
    name: 'chevron',
    call: "fig.chevron(arrowId, { length: 8, width: 8, at: 'end' | 'start' })",
    does: 'An open head on an existing arrow.'
  },
  {
    topic: 'shapes',
    name: 'stopGrad',
    call: "fig.stopGrad(arrowId, { at, size: 14, spacing: 5, angle: 60, direction, label: 'sg' })",
    does: "Two slashes across an arrow with an 'sg' label beside them (label: false hides it). Without at, the first spot along the arrow clear of its label and heads."
  },
  {
    topic: 'arrows',
    name: 'arrow',
    call: 'fig.arrow(spec) → element',
    does: 'An arrow bound at both ends, under the shapes it joins (but above a panel or card it ends in, so its head shows), drawn only with horizontal and vertical runs: straight through the span two ends share (ends within 8 units snap straight), else one sharp elbow (two at most) that keeps clear of other boxes.',
    options: [
      [
        'from, to',
        '',
        "ids (a box, a glyph, a math id), [ids] (a group: the arrow meets an invisible box around them, see group), [x, y], or { on: lineId, at | x | y } (exactly one) to start on another line with a junction dot: at is a fraction 0–1 of the line as drawn ('mid'; 'auto' slides the dot level with the target so the branch is straight); x or y picks the one run crossing that coordinate (it throws when the line crosses it twice, runs along it or misses it, naming the span it covers). A point on a head moves to the head's base. The dot takes the line's colour and stays where you put it."
      ],
      [
        'route',
        'picked',
        "prefer 'straight' | 'hv' (leave horizontally, turn once) | 'vh'; anything else throws"
      ],
      [
        'role',
        'data',
        "data (gray 1 pt: ordinary flow) | main (dark 1.25 pt: the paper's contribution path, chosen on purpose; in DiT that is the conditioning) | side (gray 0.75 pt) | aux (gray dashed: EMA, stop-grad) | loss (a loss's link: ink like data, dashed: true for dashed; the loss() kit draws these)"
      ],
      ['via', '', 'corner points only, never the ends'],
      ['points', '', 'an absolute path, still bound; a slanted step gets a corner'],
      [
        'allowDiagonal',
        'false',
        'true draws a straight slanted line (only when the slant means something)'
      ],
      [
        'gap, fromAt, toAt, fromSide, toSide',
        '4, 0.5, facing',
        'gap: distance from the outline. fromAt / toAt: where an end meets its box, still bound (a tall encoder left at one row): a fraction 0–1 along the side (top to bottom, left to right) or { y } / { x } on it; fromSide / toSide: left | right | top | bottom (default: the side facing the other end)'
      ],
      [
        'head, heads, headSize',
        'triangle, end, by role',
        'triangle | arrow | chevron | bar | dot | circle | none; heads: end | both | none'
      ],
      [
        'color, strokeWidth, dashed, dotted',
        'from role',
        'dashed links need 40+ units or they print solid'
      ],
      [
        'label',
        '',
        "TeX beside the longest run, clear of the heads. A label that reads as words prints in the figure font: every token a word (softmax, Encoder, KL, ViT-L/16, top-k) or a number, three letters or more; anything else is TeX (x_t, sg, BAx, Wx, O(TL), T-L). 'score $r_t$' mixes words and math (runs ['score ', { tex: 'r_t' }] too); $…$ and { tex } are always TeX; a top-level \\text{…} prints as words"
      ],
      ['labelText', '', 'plain text label, printed exactly as written'],
      [
        'labelSegment, labelSide, labelSize, labelColor, labelOffset',
        'longest, above/right, small text',
        "labelSegment: index of the straight run (0 = first; an elbow has two); 'below' | 'left'; [dx, dy]"
      ],
      ['layer', 'under', "'top' keeps it above the shapes"],
      ['junction', 'true', 'false hides the dot of a { on } end']
    ]
  },
  {
    topic: 'arrows',
    name: 'skip',
    call: "fig.skip({ id, from: arrowId | { on, at | x | y }, to: nodeId, side: 'left' | 'right' | 'above' | 'below', gap: 24, role: 'side', label })",
    does: 'A skip (residual) connection: leaves the main path at a junction dot (an arrow id: its middle), runs around every block in between on one side, and enters the ⊕ from that side.'
  },
  {
    topic: 'arrows',
    name: 'fork',
    call: 'fig.fork({ id, from, to: [ids | { id, role, label, labelSide, dashed }], split: number | { x } | { y }, label, role, roles, labels, labelSides }) → { trunk, dot, branches }',
    does: "One source to several targets: a trunk (label: its label) to one junction dot, then an orthogonal branch to each target. The main axis is the one every target lies beyond the source on (targets in a row below: down, even when they sit further sideways); the dot sits half way across the gap between source and targets, on the grid (split: its coordinate along that axis in scene units; split: { y: 160 } also forces the axis). role styles the trunk and every branch; roles: ['main', 'side'] (or a { id, role } target) gives each branch its own, labels its own label, beside its last run on the side away from the trunk (labelSides: ['left', 'right'] or a target's labelSide moves it). The dot takes the trunk's colour."
  },
  {
    topic: 'arrows',
    name: 'merge',
    call: 'fig.merge({ id, from: [ids | { id, role, label }], to, split: number | { x } | { y }, role, roles, labels, label }) → { trunk, dot, branches }',
    does: 'Several sources into one target: a branch from each to one junction dot half way across the gap, then one arrow into the target (label). The main axis is the one every source lies beyond the target on; split: the dot’s coordinate along it in scene units ({ x } or { y } forces the axis).'
  },
  {
    topic: 'arrows',
    name: 'lanes',
    call: "fig.lanes({ id, between: [a, b], gap: 12, labels: ['q', 'p_\\\\theta'], labelSides: ['above', 'below'], roles, colors: ['accent-ink', 'muted'], arrows: [{ dashed, color, role, … }, …], role }) → [arrow, arrow]",
    does: 'Two opposite arrows between the same two items in parallel lanes gap apart (a diffusion step: q one way, p_θ back): <id>-1 from a to b above (or left of) <id>-2 from b back to a, each label on its outer side (labelSides moves them). colors, roles and arrows style each lane on its own (arrows: any arrow options per lane). The two must share a row or a column; a small end (fig.ellipsis, a dot) only has to sit within the other’s row.'
  },
  {
    topic: 'arrows',
    name: 'zoom',
    call: "fig.zoom({ id, from: boxId, to: panelId, color: 'muted', dashed: true, strokeWidth: 1 })",
    does: 'A zoom from a box to the panel that shows it in detail: two thin lines from the box corners facing the panel to the panel corners (<id>-1, <id>-2), behind both. The panel sits beside the box (right, left, below or above).'
  },
  {
    topic: 'glyphs',
    name: 'tokens',
    call: 'fig.tokens(spec) → { cells: [{ id, x, y, w, h }], width, height }',
    does: 'A row of tokens. Binds: the strip (the id) or a token (<id>-<n>).',
    options: [
      [
        'items',
        '',
        "'word' | '<BOI>' | '' (a plain cell) | 'score $r_t$' | { text, tex, image, view, patch, of, noise, intensity, tint, w, h, color, stroke, dashed, labelColor }; noise without image draws a noise patch (with image, noise 0–1 lays noise over the photo at that strength, gray or in tint/color; a plain photo with tint/color gets a wash, <id>-<n>-tint; noise: 0.4 or intensity: 0.4 makes it fainter); patch: [r, c] + of: a patches() spec shows that grid’s cell (the same crop); colours by role name (block, accent, strong, white, loss…) or '#hex'"
      ],
      ['x, y', '0', 'top-left'],
      ['h', '2 × size', 'row height; an item with its own h is centred in the row'],
      ['size', 'page small size', ''],
      ['gap', '4', 'between tokens'],
      ['boxed', 'true', 'false writes bare words'],
      ['color', 'block (white in outline)', COLOR],
      ['groups', '', "[{ from, to, color: 'accent' | 'loss' }] rings a range"],
      [
        'cx, align',
        '',
        "cx centres the strip; align: 'center' | 'right' makes x its middle or right end"
      ],
      ['direction', 'row', "'column' stacks the tokens downward"],
      [
        'columnsOf, positions',
        '',
        'columnsOf: another strip’s id: each token sits under that strip’s and is at least as wide (empty cells too; cx is ignored), and one too wide for its column throws; positions: the x of each token (the strip and its name start at the first one unless x is given)'
      ],
      ['caption', '', 'on an image or grid item: TeX under the cell (x_1, t = 3)'],
      [
        'grid items',
        '',
        '{ grid: { rows: 2, cols: 2, fills }, color, w, caption } draws a small grid as one token (a frame’s latents beside action tokens: mixed grid and token strips); w splits into its columns; caption: TeX under it (z_1)'
      ],
      [
        'stroke',
        '',
        'outline colour; image items get an edge box (Excalidraw draws none on images)'
      ],
      [
        'label, labelSide, labelColor',
        'left, ink',
        'the strip’s name, left of it (words, $math$ or runs); labelSide below | above | right puts it there (TeX, unless it is words); labelColor: a colour name (muted for a quiet name)'
      ]
    ]
  },
  {
    topic: 'glyphs',
    name: 'distribution',
    call: "fig.distribution({ id, x, y, w: 64, h: 40, values, bins: 6, seed, highlight: index | [indices], highlightColor, sharp, color: 'accent', labels, labelsSize, label, labelSide }) → { values }",
    does: "A probability distribution as bars on a baseline (a softmax, a router’s gates, a teacher’s target): values on any scale, normalised; highlight marks a bar (or several) in the colour’s ink, or in highlightColor ('accent-solid' to match the accent); sharp: true sharpens it (low temperature). Without values it draws a peaked sample. Bars are <id>-b0, <id>-b1…: an arrow may end on one bar. labels: a name under each bar ('cat', 'x $y$' or { tex }), <id>-l<n>. A gray color (block, muted) stays visible on a panel. Binds: the id."
  },
  {
    topic: 'glyphs',
    name: 'matrix',
    call: "fig.matrix({ id, x, y, rows: 4, cols: 4, cell: fits | 24 | [w, h], cells: (i, j) => tex | [[tex]], fills: (i, j) => color | [[color]], diagonal: color, rowLabels, colLabels, ellipsis: true | 'row' | 'col' | { row, col }, size: 14, cellSize, label, labelSide }) → { width, height }",
    does: 'A matrix with a TeX entry per cell (cells): a CLIP similarity matrix (diagonal: a colour that means matched, cells: (i, j) => `I_${i+1}\\cdot T_${j+1}`), logits, an attention map with numbers. cell: one side or [w, h] (wider than tall for long entries); without it cells fit their entries at the small text size (14; cellSize changes it; an entry too wide for a given cell shrinks, not below 10). ellipsis: a band of ⋮ / ⋯ (⋱ where they cross, ⋮ ⋯ in the labels) before that row or column, the last by default: 1, 2, …, N. label: the matrix’s name in TeX below it (labelSide above | left | right). The accent on the diagonal only when it marks nothing else (trained modules too say two things: hue-meaning). Cells are <id>-r<i>c<j>; highlight() rings one. Binds: the id.'
  },
  {
    topic: 'glyphs',
    name: 'image',
    call: "await fig.image({ id, x, y, w: 64, h: 64, kind | src, seed, t, noise, tint, view, patch: [r, c], of: patchesSpec, mask: 'head' | [[x, y], …] | [{ name | points, color }], maskColor: accent, maskOpacity: 55, prompt: { points, negative, box: [x, y, w, h], color: ink }, predicted, label, labelSide, labelSize, labelColor })",
    does: 'A thumbnail: a CC0 photo (kind cat | dog | bird | street | landscape | beach | kitchen | robot | car | food | flower | building; t pans across it, noise 0–1 lays gray noise over it, intensity 0–1 how strong that noise is, view: { x, y, w, h } as 0–1 of the photo, then trimmed around its centre to the image’s shape (one crop rule for image, token images, patches and frames); a large or zoomed photo embeds a sharper copy itself), generated noise | gradient (tint: a role name or a hex colour tints the noise; drawn at two pixels a unit with fine grain, so it shows no grid at any zoom), or src: a project image (prefer real ones). patch + of: the crop of one cell of a patches() grid drawn with that spec, so cut-out patches match it (token items take patch + of too). tint colours a photo’s noise, or casts a plain photo in that colour; predicted: true casts the photo in the accent (or tint), clearly coloured with the photo still visible. Cells and photos under 12 units (24 px at print) print a kit warning. mask: segmentation regions over a photo or src, drawn through its crop (clipped to what shows) as a fill at maskOpacity under an outline (<id>-mask<n>, <id>-mask<n>-edge): built in cat head, bird bird | branch, dog dog, flower butterfly | blossom, food cake1–cake4, car lamp; or polygons as 0–1 of the photo (or its pixels). prompt: SAM-style prompts on the photo in the same coordinates: points as dots with a white rim (<id>-point<n>; negative ones red), a box as an outline (<id>-box). label: TeX below it (labelSide above | left | right). `figures kit image` lists what each photo shows. Binds: the id.'
  },
  {
    topic: 'glyphs',
    name: 'photo',
    call: 'await fig.photo({ id, x, y, w, h, crop | src | kind })',
    does: 'crop: cut from the reference (recreations); otherwise like image().'
  },
  {
    topic: 'glyphs',
    name: 'frames',
    call: 'fig.frames(spec) → { width, height }',
    does: 'Video frames along a time axis. Binds: the invisible outline (the id); each frame is <id>-f<n>, each tick label <id>-t<n>.',
    options: [
      [
        'x, y, w, h',
        '0, 0, 56, 42',
        'x, y: the top-left of the whole stack (with the default offset the front frame <id>-f0 sits (count − 1) × 8 lower; its top is bounds(<id>-f0).y); w, h: one frame'
      ],
      ['count', '4', ''],
      ['kind, seed, noise', 'landscape', 'as for image'],
      [
        'views',
        'a pan',
        'a view per frame ({ x, y, w, h } as 0–1 of the photo); by default the view pans across the photo so the frames differ'
      ],
      ['layout', 'stack', "'row' puts frames side by side gap apart (default 6)"],
      ['offset', '[10, -8]', 'the step between stacked frames'],
      ['positions', '', 'x of each frame (a row aligned with token columns)'],
      [
        'mask',
        '',
        "{ masked: 0.5 | 'block' | [[row, col]], rows: 4, cols: 4 }: the same patches greyed in every frame (tubes)"
      ],
      [
        'axis, size, ticks, axisLabel',
        'true, small size, t_0…',
        'the time axis, run past its last tick so its head clears it; ticks: (index) => tex or a list (t_1…, 1, 2, …, T); axisLabel: a name at its end (time, t)'
      ],
      [
        'label, labelSide',
        'below',
        'the video’s name (x, y: context and target) in TeX; labelSide left puts it before the stack'
      ]
    ]
  },
  {
    topic: 'glyphs',
    name: 'patches',
    call: "fig.patches({ id, x, y, w, h, rows: 4, cols: 4, kind, seed, masked: 0.5 | 'block' | [[r, c]], maskColor, outline, predicted, label, labelSide })",
    does: 'A picture (or plain cells) cut into patches, masked ones greyed; predicted: true casts it in the accent (tint), and with masked patches it is a reconstruction: the masked patches are filled in under the cast, the rest plain (no holes); image({ patch: [r, c], of: <this spec> }) and token items { patch, of } cut one cell out with the same crop. The outline (the id) is on top: compared() and highlight() ring it.'
  },
  {
    topic: 'glyphs',
    name: 'features',
    call: 'fig.features({ id, x, y, rows: 4, cols: 6, cell: 12, color: line, seed, label, labelSide })',
    does: 'An N × D grid of shades (features, latents); label: TeX below it (labelSide above | left | right). Binds: the outline.'
  },
  {
    topic: 'glyphs',
    name: 'attention',
    call: "fig.attention({ id, x, y, cell: 12, groups: [{ label, tex, n, full, block }], labels, mask: 'causal' | 'full' | 'block-causal' | 'window' | 'sink' | (row, col) => bool, window: 3, sinks: 1, fills: (row, col, allowed) => color | [[color]], title, color: line })",
    does: 'An attention mask: filled where attention is allowed: causal (the default), full (causal: false too), block-causal (each position sees its whole block and every earlier one: interleaved frames and actions; neighbouring groups with the same block name form one block, else each group is one), window (the last window positions: sliding-window attention), sink (the first sinks positions plus the window: StreamingLLM) or your own function; a full group attends to itself both ways in any mask. fills colours cells itself (undefined keeps the mask’s colour): evicted, recomputed or current tokens. Group label on both axes (TeX when it reads as math, t_0; tex always TeX), lifted only when it would run into its neighbour; labels: per-position names; title: a name above it all. Cells are <id>-r<i>c<j>.'
  },
  {
    topic: 'glyphs',
    name: 'frozen',
    call: "fig.frozen(id, { size: 18, variant: 'line' | 'emoji', color, corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left', at: [x, y] })",
    does: "A snowflake in the line gray (six arms, a branch pair on each, on a white disc; color recolours it) on the top-right corner of a frozen module (a trapezoid: its top-right vertex; corner picks another, so a narrow-top trapezoid can carry it on its wide bottom corner; at: [x, y] places it anywhere); drawn to read at 8 pt. variant: 'emoji' gives ❄️, which judges read as generated. Badges only when the figure mixes trained and frozen parts; then mark both kinds. EMA copies and stage-1-frozen modules get none."
  },
  {
    topic: 'glyphs',
    name: 'trainable',
    call: "fig.trainable(id, { size: 18, variant: 'line' | 'emoji', color, corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left', at: [x, y] })",
    does: 'A solid flame in the accent with a white inner tongue (color recolours it) on the top-right corner of a trained module; drawn to read at 8 pt, where an outlined flame reads as a swirl. Without a snowflake beside it, the lint calls it noise (badge-noise).'
  },
  {
    topic: 'glyphs',
    name: 'icon',
    call: "fig.icon(name, { id, x, y | cx, cy, size: 18, variant: 'line' | 'emoji', color, fill })",
    does: 'An icon for an actor, a modality or a tool (`figures kit icons`); use sparingly. Vector in exports.'
  },
  {
    topic: 'illustrate',
    name: 'nn',
    call: "fig.nn({ id, x, y, w: 150, h: 90, layers: [3, 4, 4, 3], label, labelSide: 'above', size: 16, faded: true, highlight: [layer, node], color: accent, pill }) → { id, nodes }",
    does: 'A neural network as faded nodes and edges with its name above it ("reward model", "LM policy"): what an overview draws instead of a box. labelSide above (default) | center | below; size is the label size (16, 8 pt, as every label). highlight tints one node (an output); a centred label sits on a white pill with the network faded under it (pill: false drops the pill); prefer above or below, off the texture. A gray color (block, muted), a panel colour (panel-1, panel-1-ink) or any accent works. Binds: the id, the network with its name above or below, so an arrow from that side ends on the name instead of detouring (nn() returns the network’s own box).'
  },
  {
    topic: 'illustrate',
    name: 'cycle',
    call: "fig.cycle({ id, between: [a, b], labels: { top, bottom } | { left, right }, title, titleColor: 'accent-ink', titleSize: 16, size: 16, color, role, strokeWidth: 2, curve: 'arc' })",
    does: 'Two curved arrows looping between modules (side by side: over and under; stacked: left and right), heads at opposite ends, a phrase beside each ("label rewards", "sample completions"); size is the phrases’ size. The top arrow runs toward between[1], whichever side it is on, and both arcs bulge outward, never crossing; curve: the bend in units (a magnitude), arc a quarter of the length. title names the loop inside it ("RL"), the arcs parting to clear it (a warning when it is wider than the gap).'
  },
  {
    topic: 'illustrate',
    name: 'callout',
    call: "fig.callout({ id, text, color: 'accent-ink', under | over | at: id, gap: 6, x, y | cx, cy, size })",
    does: "The paper's key phrase in colour on the flow (\"maximum likelihood\"), under or over an arrow or item: accent-ink or a panel's ink (panel-2-ink); 'red' only when the person asks (the RL step of a teaser). gap: the units between the item and the phrase. Text takes \\n line breaks."
  },
  {
    topic: 'illustrate',
    name: 'bubble',
    call: "fig.bubble({ id, x, y, w: 60, h: 46, text | lines: 3, size, label: 'y_w', labelSize, color: ink, fill: white, strokeWidth: 1.5, tail: 'left' | 'right' | 'none', tailSize: 12 })",
    does: "A speech bubble: a prompt or a completion. text (words, $math$ or runs; the bubble fits it when w and h are left out, and wraps it to a given w; an h too short grows with a printed warning) writes its content; otherwise lines draws placeholder text lines, fewer and thinner when the bubble is short (lines: 0 draws none); label: TeX after the end of the last line, the text kept clear of it (or centred on the right). measure('bubble', spec) sizes one first. The tail hangs tailSize units below the body: bounds(id) include it, bounds(id, { own: true }) is the body alone, so line up bodies with own bounds. Put \\succ between a preferred and a rejected one, and icon('trophy') on the winner. Binds: the id."
  },
  {
    topic: 'loss',
    name: 'loss',
    call: 'fig.loss({ id, form, name | symbol | formula | label, tone, boxed, links, link, predictions, targets, compare, inputs, group, join, side, distance, note, noteSide, x, y | cx, cy, w, h, size, pad: 6, outline, route, routes, nudge }) → element',
    does: "The objective, shown the way the figure needs it, in ink with no frame. form: name (a plain label: name: 'L1 loss' | 'cross-entropy', or runs ['match ', { tex: 'z' }]) | symbol (short TeX: symbol: '\\mathcal{L}_{DPO}', the default) | formula (the whole equation, only when it is the point: formula: '...' or [line, line]; \\frac prints as \\dfrac, \\tfrac stays small; a line under a fraction starts below it) | compare (no node: a two-headed link between prediction and target with a small label, or link: 'bracket' joining them on their outer side; returns the link) | none (the caption carries it; predictions and targets are still marked; returns them). An old label of a whole equation draws a formula, a short one a symbol. tone: ink (default) | accent | red, only when the person asks or two losses need telling apart (then the figure's own hues). boxed: true adds a thin gray frame. links: solid (default, ordinary arrows) | dashed. predictions and targets (an id or a list) are separate tensors, each framed on its own in the tone's line colour (images get a ring that leaves their label out, pad units out but never past half the gap to a neighbour), meeting only at the loss; compare adds entries; inputs link without a frame (two models' outputs for a preference loss, a reward); group: 'rings' rings each target (teacher forcing), and each prediction too when they lie apart with a side free for it, and joins each strip on one side in one link: a bus 12 units out (join: below | above | left | right, or { predictions, targets }; by default the side facing the node that no arrow end or label crowds), and one trunk leaving the bus at the point nearest the node's centre (clamped to the strip), so it runs straight when the node is in line. Without x or cx the node goes where its links are shortest and cross least: right between prediction and target when there is room for two short links (20 units each, 40 dashed), else beside them all or beside one of them (distance, 32; 48 dashed), never on another item, a closed outline, a panel that holds none of the sets, or off the page, snapped onto a neighbour's edge or centre line a few units off (side: between | right | left | below | above puts that side first; cy or y fixes its row). It stays local (near each set), every link takes at most two bends and crosses no solid arrow; when no spot keeps that, loss() throws, naming the problem and a cx, cy to try. Links that would meet the node at one point enter it apart, never as one trunk. note: a small muted line ('frozen in stage 1') on the side no link enters, on the page and clear of other items (noteSide to choose). Dashed links shorter than 40 nudge an automatic node out, on the page (nudge: false keeps it); a spot the script gave never moves. route: straight | hv | vh for every link, routes: ['hv', 'vh'] one per link (kept as given); otherwise a link that would cross a solid arrow takes the other elbow when that one is clear."
  },
  {
    topic: 'loss',
    name: 'compared',
    call: 'fig.compared(ids, { group, id, tone })',
    does: 'Marks tensors a loss compares (their outlines in ink; images get a ring), or with group: true one box around them (returned, to link once). tone: accent | red colours them.'
  },
  {
    topic: 'loss',
    name: 'highlight',
    call: 'fig.highlight(ids, { cell: [row, col], id, tone })',
    does: 'Rings the same cell of grids, features or patches (what is aligned patch by patch), in ink unless tone: accent | red; for a token strip, cell: n rings its n-th token.'
  },
  {
    topic: 'layout',
    name: 'panel',
    call: "fig.panel({ id, around: [ids] | x, y, w, h, title, titlePosition: 'top-left', pad: 10, size, color: panel, outline, same: panelId })",
    does: 'A titled background, always behind what it holds ("DiT block ×N"); title takes runs with { tex }; titlePosition: top-left | top-right | bottom-left | bottom-right; size: the title size (the style’s title size). With around, the title row is added above what it holds, so leave room over it. same: another panel’s id: both take the same top and bottom, so methods compared side by side line up (DPO beside RLHF).'
  },
  {
    topic: 'layout',
    name: 'template',
    call: 'fig.template(name, { id, x, y, ... }) → { ids, in, out }',
    does: 'A module template: transformer, moe, lora, qformer, clip, vq, diffusion, unet, kvcache, dit, rl, agent, rag, preference. `figures kit templates` lists them; `figures kit <name>` gives its options.'
  },
  {
    topic: 'figure',
    name: 'savePart',
    call: "await fig.savePart(name, ids, { scope: 'project' | 'user' })",
    does: 'Saves items as a reusable part (`figures kit library`); fig.part(name, { id, x, y }) places it with fresh ids.'
  },
  {
    topic: 'layout',
    name: 'move',
    call: 'fig.move(id, dx, dy)',
    does: 'Shifts everything drawn under an id, or a part drawn inside another item (a frame’s y-t3, a glyph’s <id>-label); throws when nothing is there. Lay out before drawing arrows.'
  },
  {
    topic: 'layout',
    name: 'row',
    call: 'fig.row(ids, { x, cy, gap: 16 })',
    does: 'Places items left to right, centred on one line.'
  },
  {
    topic: 'layout',
    name: 'column',
    call: 'fig.column(ids, { y, cx, gap: 16 })',
    does: 'Places items top to bottom, centred on one line.'
  },
  {
    topic: 'layout',
    name: 'align',
    call: "fig.align(ids, 'left' | 'right' | 'cx' | 'top' | 'bottom' | 'cy', to)",
    does: 'Lines items up on an edge of the first (or at to).'
  },
  {
    topic: 'layout',
    name: 'distribute',
    call: "fig.distribute(ids, 'x' | 'y')",
    does: 'Spaces items evenly between the first and the last.'
  },
  ...GENRE_REFERENCE
]
