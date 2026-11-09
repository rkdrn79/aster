// A small library of ML diagram parts in the paper style, built with the drawing kit. Each part's
// main element has the id given (or a fresh one); arrows bind to that element.
import { PAPER_STYLE, figureElement } from './research-figures-model.mjs'
import { makeBox, makeText, shapePaint } from './research-figures-draw.mjs'
import {
  makeGrid,
  makeNode,
  makePhoto,
  makeRoundedEnd,
  makeStack,
  makeTrapezoid
} from './research-figures-shapes.mjs'

export const FIGURE_PARTS = [
  { id: 'process', name: 'Process box', label: 'Process', hue: 'block', bind: 'the box' },
  { id: 'encoder', name: 'Encoder block', label: 'Encoder', hue: 'block', bind: 'the box' },
  { id: 'decoder', name: 'Decoder block', label: 'Decoder', hue: 'block', bind: 'the box' },
  {
    id: 'attention',
    name: 'Attention',
    label: 'Multi-head\nattention',
    hue: 'strong',
    bind: 'the box'
  },
  { id: 'mlp', name: 'MLP / linear layer', label: 'MLP', hue: 'block', bind: 'the box' },
  { id: 'loss', name: 'Loss', label: 'Loss', hue: 'loss', bind: 'the box' },
  { id: 'concat', name: 'Concatenate', label: 'Concat', hue: 'block', bind: 'the box' },
  { id: 'add', name: 'Add (+)', label: '+', hue: 'block', bind: 'the circle' },
  {
    id: 'tensor',
    name: 'Tensor / feature-map stack',
    label: 'Features',
    hue: 'block',
    bind: 'the invisible outline (the part id), never a card'
  },
  {
    id: 'dataset',
    name: 'Dataset',
    label: 'Dataset',
    hue: 'block',
    bind: 'the body rectangle (the part id)'
  },
  {
    id: 'memory',
    name: 'Memory bank',
    label: 'Memory',
    hue: 'block',
    bind: 'the outer rectangle (the part id)'
  },
  {
    id: 'trapezoid',
    name: 'Trapezoid (VAE encoder/decoder); --side is the narrow side',
    label: 'VAE Encoder',
    hue: 'block',
    bind: 'the invisible box (the part id)'
  },
  {
    id: 'rounded',
    name: 'Block with one rounded end; --side is the rounded side',
    label: 'encoder',
    hue: 'block',
    bind: 'the invisible box (the part id)'
  },
  { id: 'grid', name: 'Token grid (--rows, --cols)', label: '', hue: 'block', bind: 'the outline' },
  { id: 'stack', name: 'Stack of cards', label: '', hue: 'block', bind: 'the invisible outline' },
  {
    id: 'node',
    name: 'Circle node: --symbol plus (⊕), times (⊗) or dot',
    label: '',
    hue: 'block',
    bind: 'the circle'
  },
  {
    id: 'photo',
    name: 'Photo or video frame placeholder',
    label: '',
    hue: 'block',
    bind: 'the box'
  },
  { id: 'arrow', name: 'Arrow', label: '', hue: 'block', bind: '' },
  { id: 'elbow-arrow', name: 'Elbow arrow', label: '', hue: 'block', bind: '' }
]

function plain(type, props, options, random) {
  return figureElement(
    type,
    { frameId: options.frame, groupIds: options.groupIds, ...props },
    random
  )
}

function caption(options, cx, y, random) {
  return options.label
    ? makeText(
        {
          id: `${options.id}-caption`,
          text: options.label,
          cx,
          y,
          frame: options.frame,
          groupIds: options.groupIds
        },
        random
      )
    : []
}

function stack(part, options, random) {
  const { x, y, id } = options
  const scale = options.scale ?? 1
  const w = Math.round(48 * scale)
  const h = Math.round(64 * scale)
  const step = Math.max(4, Math.round(8 * scale))
  const hue = shapePaint({ color: options.color ?? part.hue, style: options.style })
  const outline = plain(
    'rectangle',
    {
      id,
      x,
      y,
      width: w + step * 2,
      height: h + step * 2,
      strokeColor: 'transparent',
      backgroundColor: 'transparent',
      boundElements: []
    },
    options,
    random
  )
  const cards = [2, 1, 0].map((offset, index) =>
    plain(
      'rectangle',
      {
        id: `${id}-card${index + 1}`,
        x: x + step * offset,
        y: y + step * (2 - offset),
        width: w,
        height: h,
        strokeColor: '#ffffff',
        backgroundColor: hue.fill,
        strokeWidth: 1.5
      },
      options,
      random
    )
  )
  return [outline, ...cards, ...caption(options, x + w / 2 + step, y + h + step * 2 + 4, random)]
}

function dataset(part, options, random) {
  const { x, y, id } = options
  const [body, label] = makeBox(
    {
      id,
      label: options.label,
      x,
      y: y + 10,
      w: options.width ?? 96,
      h: options.height ?? 64,
      color: options.color ?? part.hue,
      style: options.style,
      rounded: false,
      frame: options.frame,
      groupIds: options.groupIds
    },
    random
  )
  const rim = (suffix, top) =>
    plain(
      'ellipse',
      {
        id: `${id}-${suffix}`,
        x,
        y: top,
        width: body.width,
        height: 20,
        strokeColor: body.strokeColor,
        backgroundColor: body.backgroundColor
      },
      options,
      random
    )
  return [rim('bottom', body.y + body.height - 10), body, ...(label ? [label] : []), rim('top', y)]
}

function memory(part, options, random) {
  const { x, y, id } = options
  const hue = shapePaint({ color: options.color ?? part.hue, style: options.style })
  const slots = 4
  const width = options.width ?? 112
  const slotWidth = (width - 8 - (slots - 1) * 4) / slots
  const outer = plain(
    'rectangle',
    {
      id,
      x,
      y,
      width,
      height: 40,
      strokeColor: hue.fill,
      backgroundColor: 'transparent',
      strokeWidth: 2,
      roundness: { type: 3, value: 4 },
      boundElements: []
    },
    options,
    random
  )
  const cells = Array.from({ length: slots }, (_, index) =>
    plain(
      'rectangle',
      {
        id: `${id}-slot${index + 1}`,
        x: x + 4 + index * (slotWidth + 4),
        y: y + 6,
        width: slotWidth,
        height: 28,
        strokeColor: 'transparent',
        backgroundColor: hue.fill
      },
      options,
      random
    )
  )
  return [outer, ...cells, ...caption(options, x + width / 2, y + 44, random)]
}

function arrowPart(part, options, random) {
  const elbow = part.id === 'elbow-arrow'
  const length = options.width ?? 120
  const points = elbow
    ? [
        [0, 0],
        [length / 2, 0],
        [length / 2, 48],
        [length, 48]
      ]
    : [
        [0, 0],
        [length, 0]
      ]
  return [
    figureElement(
      'arrow',
      {
        id: options.id,
        x: options.x,
        y: options.y,
        width: length,
        height: elbow ? 48 : 0,
        points,
        frameId: options.frame
      },
      random
    )
  ]
}

/**
 * Fresh elements for one part at (x, y). `id` names its main element (the arrow bind target);
 * the rest get `<id>-label`, `<id>-card1`…, so a rerun gives the same ids.
 */
export function buildFigurePart(name, options = {}, random = Math.random) {
  const part = FIGURE_PARTS.find((entry) => entry.id === name)
  if (!part) {
    throw new Error(
      `Unknown figure part "${name}". Parts: ${FIGURE_PARTS.map((entry) => entry.id).join(', ')}`
    )
  }
  const id = options.id ?? `${part.id}-${Math.floor(random() * 2 ** 31).toString(36)}`
  const resolved = {
    ...options,
    id,
    x: options.x ?? 0,
    y: options.y ?? 0,
    label: options.label ?? part.label,
    frame: options.frameId ?? null,
    groupIds: part.id.endsWith('arrow') ? [] : [`${id}-part`]
  }
  const shape = {
    id,
    x: resolved.x,
    y: resolved.y,
    w: options.width,
    h: options.height,
    label: part.label ? resolved.label : undefined,
    color: options.color ?? part.hue,
    style: options.style,
    frame: resolved.frame,
    groupIds: resolved.groupIds
  }
  switch (part.id) {
    case 'trapezoid':
      return makeTrapezoid(
        { ...shape, w: shape.w ?? 200, h: shape.h ?? 48, narrow: options.narrow ?? options.side },
        random
      )
    case 'rounded':
      return makeRoundedEnd(
        { ...shape, w: shape.w ?? 112, h: shape.h ?? 96, side: options.side },
        random
      )
    case 'grid':
      return makeGrid(
        {
          ...shape,
          rows: options.rows,
          cols: options.cols,
          cell: options.cell ?? (options.scale ? 16 * options.scale : 16),
          gap: options.gap,
          fills: options.fills,
          cellStroke: options.cellStroke,
          rules: options.rules,
          outline: options.outline,
          strokeWidth: options.strokeWidth
        },
        random
      )
    case 'stack':
      return makeStack({ ...shape, w: shape.w ?? 48, h: shape.h ?? 64 }, random)
    case 'node':
      return makeNode({ ...shape, symbol: options.symbol }, random)
    case 'photo':
      return makePhoto({ ...shape, w: shape.w ?? 64, h: shape.h ?? 64 }, random)
    case 'tensor':
      return stack(part, resolved, random)
    case 'dataset':
      return dataset(part, resolved, random)
    case 'memory':
      return memory(part, resolved, random)
    case 'arrow':
    case 'elbow-arrow':
      return arrowPart(part, resolved, random)
    default:
      return makeBox(
        {
          id,
          label: resolved.label,
          x: resolved.x,
          y: resolved.y,
          w: options.width,
          h: options.height,
          color: options.color ?? part.hue,
          shape: part.id === 'add' ? 'ellipse' : 'rectangle',
          style: options.style,
          size: PAPER_STYLE.fontSize,
          frame: resolved.frame,
          groupIds: resolved.groupIds
        },
        random
      )
  }
}

/** The parts as Excalidraw library items, for the editor's Library panel. */
export function figureLibraryItems(random = Math.random) {
  return FIGURE_PARTS.map((part) => ({
    id: `aster-${part.id}`,
    status: 'published',
    name: part.name,
    created: 1,
    elements: buildFigurePart(part.id, {}, random)
  }))
}
