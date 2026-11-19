// The kit reference for groups and legends added in round 10, split from
// research-figures-kit-reference.mjs to keep files short; GENRE_REFERENCE appends these.

export const GROUP_REFERENCE = [
  {
    topic: 'layout',
    name: 'group',
    call: 'fig.group({ id, ids, pad: 4 } | { id, x, y, w, h }) → element',
    does: "An invisible container: a box with bounds that draws nothing, around items or at a place. Arrows bind to it (arrow({ to: 'group-id' }) meets its edge), bounds() and align() see it. Use it instead of box({ color: 'none' }) for a group of tokens, cards or bubbles an arrow points at; arrow({ to: [ids] }) makes one for you (<arrow id>-to). Binds: the id."
  },
  {
    topic: 'layout',
    name: 'legend',
    call: "fig.legend({ id, x, y, items: [{ label, color, role, swatch: 'box' | 'dot' | 'line' | 'arrow' | 'icon' | 'switch' | 'node', symbol, dashed, dotted, icon }], direction: 'row' | 'column', gap, size, maxWidth, asked }) → { x, y, width, height, right, bottom, items }",
    does: "A small legend for 3–4 colour roles, arrow kinds or glyphs (ours vs. frozen, data vs. gradient, Latent Diffusion's skip, switch and concat): a swatch and a label per item, in a row (gap 16) or a column (gap 6), small text in ink. role: 'cond' | 'grad' | 'skip' | 'feedback' | … (or that name as color) draws a short arrow in that role's colour, weight and dash; swatch 'switch' a small switch; symbol: 'concat' | 'plus' | 'minus' | 'times' a small operator node; dashed/dotted a line sample; icon an icon. Returns its bounds, so place it in a free corner or under the figure; the lint does not flag it. Ids: <id>-s<n> (swatch), <id>-t<n> (label). A row wraps onto more rows at maxWidth (default: to the page's right margin). asked: true marks a legend the person asked for: small-page then never suggests dropping it. A label mixes words and math like any label ('pose $(R_i, T_i)$'), typeset."
  }
]
