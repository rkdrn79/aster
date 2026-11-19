// fig.panel in the paper look: no card. A sub-figure ("(a) Output: Color + Density") is set apart
// by whitespace, its title centred above what it holds and "(a)" centred below; a group without a
// letter (Latent Space, Conditioning) may keep a thin square outline, its title in the text face.
// Fills only when asked (`tint: true` or outline 'tint'): a pastel region reads as a slide.
import { figureElement } from './research-figures-model.mjs'
import { labelLines, makeLines, measureLines } from './research-figures-type.mjs'
import { oneOf } from './research-figures-options.mjs'

const LETTER = /^\s*(\([a-z0-9]{1,3}\))\s*/i
// Why: "(a) 5D Input:" reads as a slide heading; a paper's panel title has no colon.
const plain = (text) => text.replace(/:[ \t]*(?=\n|$)/g, '')

/** "(a) Output:\nColor" → { letter: '(a)', title: 'Output\nColor' }; runs keep their tail. */
export function splitPanelTitle(title) {
  const runs = [title ?? []].flat()
  const head = runs[0]
  if (typeof head !== 'string') {
    return { letter: null, title: runs.length ? runs : null }
  }
  const match = LETTER.exec(head)
  const first = plain(match ? head.slice(match[0].length) : head)
  const rest = [first, ...runs.slice(1)].filter((run) => run !== '')
  return { letter: match ? match[1] : null, title: rest.length ? rest : null }
}

/** The edge a paper panel draws: none for a sub-figure, a thin square line for a group. */
function paperEdge(style, outline, sub) {
  const name =
    outline === true
      ? sub
        ? 'none'
        : 'hairline'
      : outline === false || outline === undefined || outline === null
        ? 'none'
        : oneOf('panel outline', outline, ['solid', 'hairline', 'dashed', 'tint', 'none'])
  const line = {
    solid: { strokeColor: style.mid, strokeWidth: 1.5, strokeStyle: 'solid' },
    hairline: { strokeColor: style.mid, strokeWidth: 1, strokeStyle: 'solid' },
    dashed: { strokeColor: style.muted, strokeWidth: 1.5, strokeStyle: 'dashed' }
  }[name] ?? { strokeColor: 'transparent', strokeWidth: 1, strokeStyle: 'solid' }
  return { name, ...line }
}

export function paperPanel(core, spec) {
  const style = core.styled({}).style
  const pad = spec.pad ?? style.panelPad
  const captionSize = spec.captionSize ?? style.textSize
  const split = splitPanelTitle(spec.title)
  const caption = spec.caption === false ? null : (spec.caption ?? split.letter)
  const sub = Boolean(caption)
  // Why smaller for a group: its name labels a region inside a figure, not a sub-figure.
  const titleSize = spec.size ?? (sub ? style.titleSize : style.textSize)
  const linesOf = (text, size) => (text ? labelLines(text, size, undefined, style) : [])
  const titleLines = linesOf(split.title, titleSize)
  const captionLines = linesOf(caption, captionSize)
  const measured = (lines, size) => (lines.length ? measureLines(lines, size, style) : null)
  const titleBox = measured(titleLines, titleSize)
  const captionBox = measured(captionLines, captionSize)
  const position =
    oneOf('titlePosition', spec.titlePosition, [
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
      'top'
    ]) ?? 'top'
  const atTop = position.startsWith('top')
  const around = spec.around?.length ? spec.around.map((id) => core.bounds(id)) : null
  const inner = around ?? [
    { x: spec.x, y: spec.y, right: spec.x + spec.w, bottom: spec.y + spec.h }
  ]
  const margin = around ? pad : 0
  const row = (box) => (box ? box.height + pad * 0.4 : 0)
  const above = around && spec.titleRow !== false ? (atTop ? row(titleBox) : 0) : 0
  const below = around ? (atTop ? 0 : row(titleBox)) + row(captionBox) : 0
  const x = Math.min(...inner.map((box) => box.x)) - margin
  const right = Math.max(...inner.map((box) => box.right)) + margin
  const top = Math.min(...inner.map((box) => box.y)) - margin - above
  const low = Math.max(...inner.map((box) => box.bottom)) + margin + below
  const group = `${spec.id}-panel`
  const edge = paperEdge(style, spec.outline, sub)
  const tinted = spec.tint === true || edge.name === 'tint'
  const rect = figureElement('rectangle', {
    id: spec.id,
    x,
    y: top,
    width: right - x,
    height: low - top,
    strokeColor: edge.strokeColor,
    strokeStyle: edge.strokeStyle,
    strokeWidth: edge.strokeWidth,
    backgroundColor: tinted ? core.paint(spec.color ?? 'panel') : 'transparent',
    // Why square: a rounded frame round a group is what reads as a card.
    roundness: null,
    boundElements: [],
    groupIds: [group],
    frameId: spec.frame ?? null,
    customData: { asterPanel: true, asterOutline: edge.name, asterPaper: sub ? 'sub' : 'group' }
  })
  const draw = (id, lines, size, where) =>
    makeLines(core.styled({ id, size, frame: spec.frame, group, ...where }), lines).elements
  const centre = (x + right) / 2
  const inset = pad * 0.4
  const titleAt = !titleBox
    ? null
    : {
        ...(position.endsWith('left')
          ? { x: x + pad * 0.8 }
          : position.endsWith('right')
            ? { x: right - pad * 0.8 - titleBox.width }
            : { cx: centre }),
        y: atTop ? top + inset : low - inset - titleBox.height - row(captionBox)
      }
  const title = titleAt ? draw(`${spec.id}-title`, titleLines, titleSize, titleAt) : []
  const captionElements = captionBox
    ? draw(`${spec.id}-caption`, captionLines, captionSize, {
        cx: centre,
        y: low - inset - captionBox.height
      })
    : []
  const words = [...title, ...captionElements]
  for (const element of words) {
    element.groupIds = [group]
  }
  core.claim(spec.id, [rect, ...words])
  core.insert([rect], core.underBox(rect))
  core.insert(words)
  return rect
}
