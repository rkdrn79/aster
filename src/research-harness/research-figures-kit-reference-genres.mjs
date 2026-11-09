// The kit reference for the genre pieces (pipelines, teasers, example grids), split from
// research-figures-kit-reference.mjs to keep files short; KIT_REFERENCE appends these.
import { GROUP_REFERENCE } from './research-figures-kit-reference-groups.mjs'
import { LINK_REFERENCE } from './research-figures-kit-reference-links.mjs'

export const GENRE_REFERENCE = [
  {
    topic: 'genres',
    name: 'pipeline',
    call: 'await fig.pipeline({ id, x, y, w, h, gap: 32, stageWidth, stages: [{ title, icon, note, count, thumbs, thumbSize, snippet, chips, w, color, step }], labels, numbered, final, loop: { from, to, label, role } }) → { ids, boxes, widths, width, height, warnings }',
    does: "A data pipeline, left to right: stage cards (an icon and a title, a small note for the stage's rule such as 'fastText en ≥ 0.65', thumbs: photo kinds or { src, mark } shown at the stage, or a snippet of text) joined by arrows (labels: one word each, the rule belongs in the note). Each count (5.8e9, '2.1B') prints at the bottom with a bar on a log scale, so the shrinking shows; the last stage is the dataset, in the accent (final: false keeps it white). numbered: true puts 1, 2, 3 in the title rows; loop draws a data-engine loop under the row (from the last stage back to to, labelled). Counts are optional: without them a card ends under its content. Widths: a stage's own w is kept, the rest share w evenly, and a stage that needs more (a long title, four thumbnails, a wide chip) gets it first; stageWidth makes them all one width. Notes wrap to the card (\\n breaks them); chips: ['motion', 'quality', …] lists a stage's sub-steps or filters as small pills that wrap in rows; thumbSize sizes its photos (default: as wide as fits, at most 48, growing into a row that is taller than the card needs). A title too long for its card prints at 14 (7 pt) or on two lines in every card, and the call prints a warning naming it: give that stage w or shorten it. Stage ids: <id>-s<n> (or each stage's id); chips <stage>-chip<row>-<n>."
  },
  {
    topic: 'genres',
    name: 'stage',
    call: 'await fig.stage({ id, x, y, w: 132, h, title, icon, note, count, share, thumbs, thumbSize, snippet, chips, step, color: white }) → { x, y, width, height, warnings }',
    does: 'One pipeline stage card on its own (pipeline draws a row of them): share (0–1) is the count bar’s length; notes wrap, chips list sub-steps, the card is as tall as its content (an h that leaves 48 or more units empty prints a warning, and so does a title that had to shrink). Icons for stages: filter, dedup, inspect, language, tag, layers, archive, shard (figures kit icons). Binds: the id (the card).'
  },
  {
    topic: 'genres',
    name: 'funnel',
    call: "fig.funnel({ id, x, y, w: 360, h: 96, stages: [{ label, count }], scale: 'log' | 'linear', barWidth: 14, color: accent }) → { bars }",
    does: 'A filtering funnel: one bar per stage, its height the count’s share (log scale by default), pale bands joining neighbours, the count above and the name below; the last bar (what remains) in the accent. Binds: the id (the first bar).'
  },
  {
    topic: 'genres',
    name: 'card',
    call: "fig.card({ id, x, y, w: 200, h, pad: 4–8, text, role: 'Q:' | 'Instruction:' | 'Model output', roleInline, roleColor: accent, prefixes: { 'Thought:': 'accent', 'Act:': 'teal' }, highlights: [{ text: 'Paris', color: 'accent' | 'good' | 'bad' | 'teal' | 'rose' | … }], mark: 'check' | 'cross', size: 14, lineHeight: 1.3, color: white | good | bad, intentional }) → { width, height, lines, warnings }",
    does: 'A text example on a card: text wrapped to w (\\n breaks a line); a short role ("Q:") or a field label ending in a colon ("Instruction:") leads the first line, a longer one ("Model output") heads the card, in the accent’s ink (roleInline: true | false decides). h is kept: the padding shrinks (to 2) so one line fits a 28-unit card; text that still does not fit grows the card and prints a warning. A card h far taller than its text prints a warning (intentional: true when it lines up with taller cards). pad is the inner margin (5 % of w, 4 to 8). prefixes colour the word(s) that open a line (a trajectory’s Thought: / Act: / Obs:); lineHeight spaces the lines. Every occurrence of a highlighted phrase gets a tint behind the words (one colour per meaning: right and wrong, or prompt and answer; a panel swatch such as rose works on any page; a dark colour such as red is lightened until ink text on it reads); mark puts a check or a cross in the top-right corner, beside the first line only. measure(\'card\', spec) sizes one before drawing. Binds: the id. A card with mark: check or cross tints its highlights good (green) or bad (red) by default; color: good | bad tints the whole card.'
  },
  {
    topic: 'genres',
    name: 'examples',
    call: "await fig.examples({ id, x, y, w: 96, h: 72, gap: 8, columns: ['Input', 'Baseline', 'Ours'], rows: [[cell, …]], rowLabels, highlightColumn, arrows }) → { ids, width, height }",
    does: "Qualitative examples in a grid: column headers over rows of cells, each a photo ('cat', { kind, noise }, { src }), a text card ({ text, role, highlights }) or plain text, any of them with mark: 'check' | 'cross'. highlightColumn prints that header in the accent (ours); arrows: true joins the input column to the first output. Cell ids <id>-r<r>c<c>."
  },
  {
    topic: 'genres',
    name: 'mark',
    call: "fig.mark({ id, kind: 'check' | 'cross', cx, cy | on: id, size: 16, color, circle, disc })",
    does: 'A check (good, green) or a cross (bad, red) drawn as lines, never emoji: right and wrong outputs, failure cases, a removed part. on: id sits it on that item’s top-right corner on a white disc; color: ink for a figure without hue.'
  },
  {
    topic: 'genres',
    name: 'chart',
    call: "fig.chart({ id, x, y, w: 132, h: 88, kind: 'bar' | 'line' | 'scatter', values | series: [{ values, label, color, dashed }], labels, highlight: index | 'last', yLabel, min, max, format, valueLabels, axis }) → { plot }",
    does: 'A mini chart that makes the point in a teaser: bars (the highlighted one, ours, in the accent; the rest gray; values on top), lines (the highlighted series in the accent, labelled at its end, no legend) or dots, with a baseline and a left rule only. labels go under the bars or points, yLabel above the plot (the metric). Bars are <id>-b<n>.'
  },
  {
    topic: 'genres',
    name: 'brace',
    call: "fig.brace({ id, around: [ids] | x, y, w, h, side: 'bottom' | 'top' | 'left' | 'right', label, labelColor, color: line, size: 14, shape: 'curly' | 'square', gap: 4, depth: 7 })",
    does: 'A brace along one side of items with a label at its tip (runs mix text and math): what a span of tokens, frames or stages has in common ("×N", "same input"). color draws the brace, labelColor the label (accent-ink for ours).'
  },
  {
    topic: 'genres',
    name: 'step',
    call: 'fig.step({ id, n, cx, cy, size: 22, color: accent, solid })',
    does: 'A numbered step: a digit in a ring (solid: a filled disc with a white digit), for the steps of a procedure or the stages of a pipeline. Binds: the id.'
  },
  {
    topic: 'genres',
    name: 'subcaption',
    call: "fig.subcaption({ id, under: id, label: '(a)', text, gap: 6, cx, w | x, y, cx, size, color })",
    does: 'A sub-caption under a panel or items: "(a) prior work: one global caption", centred (cx moves it), at the small size, wrapped to the width of what it is under (w: another width; a word too wide prints a warning); text takes runs; color: accent-ink for ours.'
  },
  ...LINK_REFERENCE,
  ...GROUP_REFERENCE
]
