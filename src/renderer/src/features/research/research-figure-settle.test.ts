import { describe, expect, it } from 'vitest'
import { isOrthogonal } from './research-figure-orthogonal-route'
import { settleFigure } from './research-figure-settle'
import {
  baselineSettled,
  commitSettled,
  createSettleMemory,
  type SettleElement,
  type SettleMemory
} from './research-figure-settle-state'

type Mutable = { -readonly [K in keyof SettleElement]: SettleElement[K] }

function el(props: Partial<Mutable> & { id: string; type: string }): Mutable {
  return { x: 0, y: 0, width: 10, height: 10, version: 1, groupIds: [], customData: {}, ...props }
}

/** The kit's method figure: two boxes with labels, a badge each, and bound connectors. */
function figure(): Mutable[] {
  return [
    el({ id: 'figure-page', type: 'frame', width: 468, height: 288 }),
    el({ id: 'img', type: 'image', x: 16, y: 110, width: 64, height: 56 }),
    el({
      id: 'a-img-ctx',
      type: 'arrow',
      x: 48,
      y: 106,
      width: 68,
      height: 32,
      points: [
        [0, 0],
        [0, -32],
        [48, -32],
        [68, -32]
      ],
      startBinding: { elementId: 'img', gap: 4 },
      endBinding: { elementId: 'ctx', gap: 4 }
    }),
    el({
      id: 'ctx',
      type: 'rectangle',
      x: 120,
      y: 30,
      width: 96,
      height: 88,
      groupIds: ['ctx-shape']
    }),
    el({
      id: 'ctx-label-0-0',
      type: 'text',
      x: 142.2,
      y: 42.5,
      width: 51.6,
      height: 20,
      fontSize: 16,
      text: 'context',
      groupIds: ['ctx-label-group', 'ctx-shape']
    }),
    el({
      id: 'ctx-label-1-0',
      type: 'text',
      x: 139.1,
      y: 62.5,
      width: 57.8,
      height: 20,
      fontSize: 16,
      text: 'encoder',
      groupIds: ['ctx-label-group', 'ctx-shape']
    }),
    el({ id: 'ctx-trainable', type: 'image', x: 205, y: 23, width: 18, height: 18 }),
    el({
      id: 'pred',
      type: 'rectangle',
      x: 262,
      y: 30,
      width: 96,
      height: 72,
      groupIds: ['pred-shape']
    }),
    el({
      id: 'pred-label-0-0',
      type: 'text',
      x: 278.9,
      y: 56,
      width: 62.2,
      height: 20,
      fontSize: 16,
      text: 'predictor',
      groupIds: ['pred-label-group', 'pred-shape']
    }),
    el({
      id: 'a-ctx-pred',
      type: 'arrow',
      x: 220,
      y: 66,
      width: 38,
      height: 0,
      points: [
        [0, 0],
        [18, 0],
        [38, 0]
      ],
      startBinding: { elementId: 'ctx', gap: 4 },
      endBinding: { elementId: 'pred', gap: 4 }
    }),
    el({
      id: 'a-ctx-pred-label-0',
      type: 'image',
      x: 224.5,
      y: 51.6,
      width: 15,
      height: 9.4,
      groupIds: ['a-ctx-pred-label-group']
    }),
    el({ id: 'tgt', type: 'rectangle', x: 120, y: 190, width: 96, height: 88 }),
    el({ id: 'tgt-frozen', type: 'image', x: 205, y: 183, width: 18, height: 18 }),
    el({
      id: 'a-ema',
      type: 'arrow',
      x: 168,
      y: 122,
      width: 0,
      height: 64,
      points: [
        [0, 0],
        [0, 48],
        [0, 64]
      ],
      startBinding: { elementId: 'ctx', gap: 4 },
      endBinding: { elementId: 'tgt', gap: 4 }
    }),
    el({
      id: 'a-ema-label-0',
      type: 'text',
      x: 172.8,
      y: 138,
      width: 30.3,
      height: 17.5,
      fontSize: 14,
      text: 'EMA',
      groupIds: ['a-ema-label-group']
    })
  ]
}

/** Applies updates the way the canvas does: a new version per changed element. */
function apply(elements: Mutable[], updates: Map<string, Partial<Mutable>>): Mutable[] {
  return elements.map((element) => {
    const update = updates.get(element.id)
    return update ? { ...element, ...update, version: element.version + 1 } : element
  })
}

function settle(memory: SettleMemory, elements: Mutable[]): Mutable[] {
  const next = apply(elements, settleFigure(elements, memory))
  commitSettled(memory, next)
  // A second pass over its own result changes nothing.
  expect(settleFigure(next, memory).size).toBe(0)
  return next
}

function start(): { memory: SettleMemory; scene: Mutable[] } {
  const scene = figure()
  const memory = createSettleMemory()
  baselineSettled(memory, scene)
  return { memory, scene }
}

const byId = (scene: Mutable[], id: string): Mutable => {
  const found = scene.find((element) => element.id === id)
  if (!found) {
    throw new Error(`no ${id}`)
  }
  return found
}

function moveBy(scene: Mutable[], ids: string[], dx: number, dy: number): Mutable[] {
  return apply(
    scene,
    new Map(
      ids.map((id) => {
        const element = byId(scene, id)
        return [id, { x: element.x + dx, y: element.y + dy }]
      })
    )
  )
}

function absolute(arrow: Mutable): [number, number][] {
  return (arrow.points ?? []).map(([x, y]) => [arrow.x + x, arrow.y + y])
}

describe('settleFigure', () => {
  it('moves badges and arrow labels with their owners and re-routes bound arrows straight', () => {
    const { memory, scene } = start()
    // The person drags the box alone (its group): Excalidraw moves only the selection.
    const moved = moveBy(scene, ['ctx', 'ctx-label-0-0', 'ctx-label-1-0'], 40, 40)
    const next = settle(memory, moved)
    expect(byId(next, 'ctx-trainable')).toMatchObject({ x: 245, y: 63 })
    for (const id of ['a-img-ctx', 'a-ctx-pred', 'a-ema']) {
      expect(isOrthogonal(absolute(byId(next, id))), id).toBe(true)
    }
    const arrow = absolute(byId(next, 'a-ctx-pred'))
    expect(arrow[0][0]).toBe(260)
    expect(arrow.at(-1)?.[0]).toBe(258)
    // Labels are untouched: they moved with their box.
    expect(byId(next, 'ctx-label-0-0').x).toBeCloseTo(182.2)
  })

  it('keeps every connector axis-aligned and every follower attached through many drags', () => {
    let { memory, scene } = start()
    const shapes = ['img', 'ctx', 'pred', 'tgt']
    for (const [i, id] of [...shapes, ...shapes, ...shapes].entries()) {
      const dx = ((i * 37) % 81) - 40
      const dy = ((i * 53) % 81) - 40
      const group = scene.filter((item) => item.id === id || item.groupIds?.includes(`${id}-shape`))
      scene = settle(
        memory,
        moveBy(
          scene,
          group.map((item) => item.id),
          dx,
          dy
        )
      )
      for (const arrow of scene.filter((item) => item.type === 'arrow')) {
        expect(isOrthogonal(absolute(arrow)), `${arrow.id} after moving ${id}`).toBe(true)
      }
      const box = byId(scene, 'tgt')
      expect(byId(scene, 'tgt-frozen').x + 9).toBeCloseTo(box.x + box.width - 2)
      expect(byId(scene, 'tgt-frozen').y + 9).toBeCloseTo(box.y + 2)
    }
  })

  it('keeps kit labels at their point size when the box group is resized', () => {
    const { memory, scene } = start()
    // A group resize scales everything by 1.5 from the box's top-left corner.
    const scaled = apply(
      scene,
      new Map(
        ['ctx', 'ctx-label-0-0', 'ctx-label-1-0'].map((id) => {
          const item = byId(scene, id)
          return [
            id,
            {
              x: 120 + (item.x - 120) * 1.5,
              y: 30 + (item.y - 30) * 1.5,
              width: item.width * 1.5,
              height: item.height * 1.5,
              ...(item.fontSize ? { fontSize: item.fontSize * 1.5 } : {})
            }
          ]
        })
      )
    )
    const next = settle(memory, scaled)
    const box = byId(next, 'ctx')
    for (const id of ['ctx-label-0-0', 'ctx-label-1-0']) {
      const label = byId(next, id)
      expect(label.fontSize).toBe(16)
      expect(label.height).toBe(20)
      expect(label.x + label.width / 2).toBeCloseTo(box.x + box.width / 2, 0)
    }
    expect(byId(next, 'ctx-trainable')).toMatchObject({ width: 18, x: 120 + 144 - 2 - 9 })
  })

  it('widens a box around its centre when its edited label no longer fits', () => {
    const { memory, scene } = start()
    const typed = apply(
      scene,
      new Map([['pred-label-0-0', { text: 'predictor network', width: 122.7 }]])
    )
    const next = settle(memory, typed)
    const box = byId(next, 'pred')
    const label = byId(next, 'pred-label-0-0')
    expect(box.width).toBeGreaterThanOrEqual(122.7 + 16)
    expect(box.x + box.width / 2).toBeCloseTo(310)
    expect(label.x).toBeGreaterThanOrEqual(box.x)
    expect(label.x + label.width).toBeLessThanOrEqual(box.x + box.width)
    expect(label.x + label.width / 2).toBeCloseTo(310, 0)
    // The connector into the wider box re-routes to its new left side.
    expect(absolute(byId(next, 'a-ctx-pred')).at(-1)?.[0]).toBeCloseTo(box.x - 4)
  })

  it('accepts a follower moved with its owner, as a selection drag or an undo does', () => {
    const { memory, scene } = start()
    const moved = moveBy(scene, ['tgt', 'tgt-frozen'], 0, 20)
    const updates = settleFigure(moved, memory)
    expect(updates.has('tgt-frozen')).toBe(false)
  })

  it('remembers a badge the person placed elsewhere', () => {
    const { memory, scene } = start()
    let next = settle(memory, moveBy(scene, ['tgt-frozen'], -60, 0))
    next = settle(memory, moveBy(next, ['tgt'], 10, 0))
    expect(byId(next, 'tgt-frozen').x).toBe(205 - 60 + 10)
  })

  it('gets the exact path back when an undo returns the shapes (Excalidraw nudges its ends)', () => {
    const { memory, scene } = start()
    const original = byId(scene, 'a-ctx-pred')
    const dragged = settle(memory, moveBy(scene, ['pred', 'pred-label-0-0'], 30, 50))
    expect(absolute(byId(dragged, 'a-ctx-pred'))).not.toEqual(absolute(original))
    // The undo puts the box back; Excalidraw then re-binds the arrow from its focus, slanting it.
    const undone = apply(
      dragged,
      new Map<string, Partial<Mutable>>([
        ['pred', { x: 262, y: 30 }],
        ['pred-label-0-0', { x: 278.9, y: 56 }],
        [
          'a-ctx-pred',
          {
            x: 218.9,
            y: 69.9,
            points: [
              [0, 0],
              [19.1, -3.9],
              [39.1, -3.9]
            ]
          }
        ]
      ])
    )
    const next = settle(memory, undone)
    expect(byId(next, 'a-ctx-pred')).toMatchObject({ x: 220, y: 66, points: original.points })
  })

  it('keeps labels at their size on resize moves that leave the box as it was', () => {
    const { memory, scene } = start()
    // Excalidraw re-scales the selected label again although the box did not change this move.
    const scaled = apply(
      scene,
      new Map([['ctx-label-0-0', { fontSize: 20, width: 64.5, height: 25 }]])
    )
    const updates = settleFigure(scaled, memory, {
      resizing: true,
      selected: new Set(['ctx', 'ctx-label-0-0', 'ctx-label-1-0'])
    })
    expect(updates.get('ctx-label-0-0')).toMatchObject({ fontSize: 16, width: 51.6, height: 20 })
  })

  it('leaves an arrow the person is shaping alone', () => {
    const { memory, scene } = start()
    const bent = apply(
      scene,
      new Map<string, Partial<Mutable>>([
        [
          'a-ema',
          {
            points: [
              [0, 0],
              [30, 64]
            ]
          }
        ]
      ])
    )
    expect(settleFigure(bent, memory, { selected: new Set(['a-ema']) }).has('a-ema')).toBe(false)
  })

  it('removes a badge and an arrow label with their owner', () => {
    const { memory, scene } = start()
    const deleted = apply(
      scene,
      new Map([
        ['tgt', { isDeleted: true }],
        ['a-ema', { isDeleted: true }]
      ])
    )
    const updates = settleFigure(deleted, memory)
    expect(updates.get('tgt-frozen')).toEqual({ isDeleted: true })
    expect(updates.get('a-ema-label-0')).toEqual({ isDeleted: true })
  })
})
