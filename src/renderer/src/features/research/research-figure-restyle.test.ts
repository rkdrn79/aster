import { describe, expect, it } from 'vitest'
import { LOSS_RED } from '../../../../research-harness/research-figures-palette.mjs'
import { figurePage, PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import {
  figureStyle,
  styleColor,
  type FigureStyle
} from '../../../../research-harness/research-figures-style.mjs'
import {
  inkedImages,
  pageWithStyle,
  restylePlan,
  restyleSvg,
  type RestyleElement
} from './research-figure-restyle'

type Spec = Partial<RestyleElement> & { id: string; type: string }
const element = (spec: Spec): RestyleElement => ({
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  strokeWidth: 2,
  ...spec
})
/** A box the way the kit paints `color` in `style`. */
const box = (id: string, style: FigureStyle, color: string, extra: Partial<Spec> = {}) => {
  const paint = styleColor(style, color)
  return element({
    id,
    type: 'rectangle',
    backgroundColor: paint.fill,
    strokeColor: paint.stroke,
    strokeWidth: style.outlineWidth ?? 2,
    roundness: { type: 3, value: style.radius },
    ...extra
  })
}
const text = (id: string, color: string, extra: Partial<Spec> = {}) =>
  element({ id, type: 'text', strokeColor: color, ...extra })
const arrow = (id: string, color: string, extra: Partial<Spec> = {}) =>
  element({ id, type: 'arrow', strokeColor: color, backgroundColor: color, ...extra })

const graphite = figureStyle('graphite')

function methodScene(style: FigureStyle): RestyleElement[] {
  return [
    element({ id: PAGE_FRAME_ID, type: 'frame', strokeColor: '#bbb' }),
    box('ctx', style, 'accent'),
    text('ctx-label', style.ink, { containerId: 'ctx' }),
    element({ id: 'ctx-trainable', type: 'image', strokeColor: 'transparent' }),
    box('tgt', style, 'strong'),
    element({ id: 'tgt-frozen', type: 'image', strokeColor: 'transparent' }),
    box('head', style, 'block'),
    box('group', style, 'panel'),
    arrow('a-data', style.line),
    arrow('a-main', style.ink, { customData: { asterLine: 'main' } }),
    arrow('a-aux', style.muted, { customData: { asterLine: 'aux' } }),
    box('mine', style, 'block', { backgroundColor: '#ff00ff', strokeColor: '#00aa00' }),
    text('note', '#7b2ff7')
  ]
}

describe('restylePlan', () => {
  it('recolours kit boxes, labels and arrows by role and keeps colours no role names', () => {
    const slate = figureStyle('slate')
    const plan = restylePlan(methodScene(graphite), graphite, slate, PAGE_FRAME_ID)
    expect(plan.patches.get('ctx')).toMatchObject({ backgroundColor: slate.accents[0].fill })
    expect(plan.patches.get('tgt')).toMatchObject({ backgroundColor: slate.strong })
    expect(plan.patches.get('head')).toMatchObject({ backgroundColor: slate.block })
    expect(plan.patches.get('group')).toMatchObject({ backgroundColor: slate.panel })
    expect(plan.patches.get('ctx-label')).toEqual({ strokeColor: slate.ink })
    expect(plan.patches.get('a-data')).toEqual({
      strokeColor: slate.line,
      backgroundColor: slate.line
    })
    expect(plan.patches.get('a-main')?.strokeColor).toBe(slate.ink)
    expect(plan.patches.get('a-aux')?.strokeColor).toBe(slate.muted)
    expect(plan.patches.get('ctx')?.roundness).toEqual({ type: 3, value: slate.radius })
    // A hex the person picked, the page and the badges' pictures stay as they are.
    expect(plan.patches.has('mine')).toBe(false)
    expect(plan.patches.has('note')).toBe(false)
    expect(plan.patches.has(PAGE_FRAME_ID)).toBe(false)
    expect(plan.patches.has('ctx-trainable')).toBe(false)
    expect(plan.kept).toBe(2)
  })

  it('changes nothing when the style stays the same', () => {
    const plan = restylePlan(methodScene(graphite), graphite, graphite, PAGE_FRAME_ID)
    expect(plan.patches.size).toBe(0)
  })

  it('gives boxes the outline preset’s ink outline and width, and takes them away again', () => {
    const outline = figureStyle('outline')
    const there = restylePlan(methodScene(graphite), graphite, outline, PAGE_FRAME_ID)
    expect(there.patches.get('head')).toEqual({
      backgroundColor: outline.block,
      strokeColor: outline.boxStroke,
      strokeWidth: outline.outlineWidth,
      roundness: { type: 3, value: outline.radius }
    })
    // Panels never get an outline.
    expect(there.patches.get('group')?.strokeColor).toBeUndefined()

    const back = restylePlan(methodScene(outline), outline, graphite, PAGE_FRAME_ID)
    expect(back.patches.get('head')).toMatchObject({
      backgroundColor: graphite.block,
      strokeColor: 'transparent',
      strokeWidth: 2
    })
    // In outline ink, line and outline are one hex: the line role decides.
    expect(back.patches.get('a-main')?.strokeColor).toBe(graphite.ink)
    expect(back.patches.get('a-data')?.strokeColor).toBe(graphite.line)
    expect(back.patches.get('ctx-label')?.strokeColor).toBe(graphite.ink)
  })

  it('keeps each accent’s place across presets, and folds extra accents into gray', () => {
    const blueAmber = figureStyle('blue-amber')
    const sage = figureStyle('sage-butter')
    const scene = [box('ours', blueAmber, 'accent'), box('given', blueAmber, 'secondary')]
    const toSage = restylePlan(scene, blueAmber, sage)
    expect(toSage.patches.get('ours')?.backgroundColor).toBe(sage.accents[0].fill)
    expect(toSage.patches.get('given')?.backgroundColor).toBe(sage.accents[1].fill)
    const toGraphite = restylePlan(scene, blueAmber, graphite)
    expect(toGraphite.patches.get('given')?.backgroundColor).toBe(graphite.strong)
  })

  it('reads the trained and frozen badges as roles where a box’s colours are ambiguous', () => {
    const outline = figureStyle('outline')
    // In outline, block and white are both white with an ink outline.
    const scene = [
      box('enc', outline, 'block'),
      element({ id: 'enc-frozen', type: 'image', strokeColor: 'transparent' })
    ]
    const plan = restylePlan(scene, outline, graphite)
    expect(plan.patches.get('enc')?.backgroundColor).toBe(graphite.block)
    const strongish = [box('enc', graphite, 'strong'), scene[1]]
    expect(restylePlan(strongish, graphite, outline).patches.get('enc')?.backgroundColor).toBe(
      outline.strong
    )
  })

  it('moves a tonal figure’s tinted blocks back to gray', () => {
    const tonal = figureStyle('tonal')
    const scene = [box('a', tonal, 'block'), box('b', tonal, 'highlight')]
    const plan = restylePlan(scene, tonal, graphite)
    expect(plan.patches.get('a')?.backgroundColor).toBe(graphite.block)
    expect(plan.patches.get('b')?.backgroundColor).toBe(styleColor(graphite, 'highlight').fill)
  })

  it('keeps a red loss red unless the new accent sits too near red', () => {
    // As the kit draws `loss({ compare, tone: 'red' })`: rings on the compared boxes, which keep
    // their fills, a frameless node, its symbol and its links.
    const ringed = { strokeColor: LOSS_RED, strokeWidth: 1.5 }
    const scene = [
      box('pred', graphite, 'accent', { ...ringed, customData: { asterRole: 'compared' } }),
      box('head', graphite, 'block', { ...ringed, customData: { asterRole: 'compared' } }),
      element({
        id: 'loss',
        type: 'rectangle',
        strokeColor: 'transparent',
        customData: { asterRole: 'loss', asterLossTone: 'red' }
      }),
      text('loss-label', LOSS_RED, { containerId: 'loss' }),
      arrow('loss-in1', LOSS_RED, {
        backgroundColor: 'transparent',
        customData: { asterRole: 'loss-link', asterKit: 'loss' }
      }),
      element({
        id: 'loss-label-0',
        type: 'image',
        strokeColor: 'transparent',
        customData: { asterMath: '\\mathcal{L}', asterKit: 'loss' }
      })
    ]
    const teal = figureStyle('graphite', 'teal')
    const kept = restylePlan(scene, graphite, teal)
    expect(kept.patches.get('pred')).toEqual({ backgroundColor: teal.accents[0].fill })
    expect(kept.patches.get('head')).toBeUndefined()
    expect([...kept.patches.keys()]).toEqual(['pred'])
    // The red parts keep their colour by role, so none counts as a colour of its own.
    expect(kept.kept).toBe(0)
    expect(inkedImages(scene, teal).get('loss-label-0')).toEqual({ icon: null, lossInk: null })

    const clay = figureStyle('graphite', 'clay')
    expect(clay.loss.clash).toBe(true)
    const plan = restylePlan(scene, graphite, clay)
    expect(plan.patches.get('pred')).toEqual({
      backgroundColor: clay.accents[0].fill,
      strokeColor: clay.loss.ring
    })
    expect(plan.patches.get('head')).toEqual({ strokeColor: clay.loss.ring })
    expect(plan.patches.get('loss-label')?.strokeColor).toBe(clay.ink)
    expect(plan.patches.get('loss-in1')?.strokeColor).toBe(clay.loss.link)
    expect(plan.patches.has('loss')).toBe(false)
    const symbol = inkedImages(scene, clay).get('loss-label-0')
    expect(symbol).toEqual({ icon: null, lossInk: clay.loss.text })
    expect(restyleSvg(`<path fill="${LOSS_RED}"/>`, graphite, clay, null, symbol?.lossInk)).toBe(
      `<path fill="${clay.loss.text}"/>`
    )
  })

  it('restyles an ink loss like any ink and leaves its white node white', () => {
    const scene = [box('loss', graphite, 'loss', { customData: { asterRole: 'loss' } })]
    const slate = figureStyle('slate')
    expect(restylePlan(scene, graphite, slate).patches.get('loss')).toEqual({
      strokeColor: slate.loss.stroke
    })
  })
})

describe('restyleSvg', () => {
  it('inks badges and icons in the new style by what they are', () => {
    const slate = figureStyle('slate')
    const flame = `<svg><path fill="${graphite.accents[0].ink}" stroke="#ffffff"/></svg>`
    expect(restyleSvg(flame, graphite, slate, 'fire')).toBe(
      `<svg><path fill="${slate.accents[0].ink}" stroke="#ffffff"/></svg>`
    )
    const flake = `<svg><path stroke="${graphite.line.toUpperCase()}"/></svg>`
    expect(restyleSvg(flake, graphite, slate, 'snowflake')).toBe(
      `<svg><path stroke="${slate.line}"/></svg>`
    )
    const photo = '<svg><rect fill="#7aa6c2"/></svg>'
    expect(restyleSvg(photo, graphite, slate)).toBe(photo)
  })
})

describe('pageWithStyle', () => {
  it('records the style as the person’s choice', () => {
    const page = pageWithStyle(
      { widthIn: 3.25, heightIn: 2, style: 'graphite', agentStyle: 'graphite', accent: 'blue' },
      figureStyle('slate', 'teal')
    )
    expect(page).toEqual({ widthIn: 3.25, heightIn: 2, style: 'slate', accent: 'teal' })
    const frame = { id: PAGE_FRAME_ID, type: 'frame', x: 0, y: 0, width: 468, height: 288 }
    expect(figurePage([{ ...frame, customData: { asterPage: page } }])?.styleBy).toBe('person')
  })
})
