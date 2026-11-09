import { describe, expect, it } from 'vitest'
import { isOrthogonal } from './research-figure-orthogonal-route'
import { settleFigure } from './research-figure-settle'
import {
  baselineSettled,
  commitSettled,
  createSettleMemory,
  rebaselineSettled,
  type SettleElement
} from './research-figure-settle-state'

type Mutable = { -readonly [K in keyof SettleElement]: SettleElement[K] }

function el(props: Partial<Mutable> & { id: string; type: string }): Mutable {
  return { x: 0, y: 0, width: 10, height: 10, version: 1, groupIds: [], customData: {}, ...props }
}

/** Two kit boxes, a badge and the straight connector between them. */
function figure(): Mutable[] {
  return [
    el({ id: 'figure-page', type: 'frame', width: 468, height: 288 }),
    el({ id: 'ctx', type: 'rectangle', x: 120, y: 30, width: 96, height: 72 }),
    el({ id: 'ctx-trainable', type: 'image', x: 205, y: 23, width: 18, height: 18 }),
    el({ id: 'pred', type: 'rectangle', x: 262, y: 30, width: 96, height: 72 }),
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
    })
  ]
}

const absolute = (arrow: Mutable): [number, number][] =>
  (arrow.points ?? []).map(([x, y]) => [arrow.x + x, arrow.y + y])

function byId(scene: readonly Mutable[], id: string): Mutable {
  const found = scene.find((element) => element.id === id)
  if (!found) {
    throw new Error(`no ${id}`)
  }
  return found
}

describe('rebaselineSettled', () => {
  it('settles what an undo brings back after a replacement took it away', () => {
    const scene = figure()
    const memory = createSettleMemory()
    baselineSettled(memory, scene)
    // Undo turn: the canvas is replaced by the page alone.
    const page = scene.filter((element) => element.id === 'figure-page')
    rebaselineSettled(memory, page)
    commitSettled(memory, page)
    expect(settleFigure(page, memory).size).toBe(0)
    // ⌘Z brings the drawing back; Excalidraw re-binds the connector's end off the axis.
    const back = scene.map((element) =>
      element.id === 'a-ctx-pred'
        ? {
            ...element,
            version: 3,
            x: 218.9,
            y: 69.9,
            points: [
              [0, 0],
              [19.1, -3.9],
              [39.9, -3.9]
            ] satisfies [number, number][]
          }
        : { ...element, version: 3 }
    )
    const updates = settleFigure(back, memory)
    const arrow = { ...byId(back, 'a-ctx-pred'), ...updates.get('a-ctx-pred') }
    expect(isOrthogonal(absolute(arrow))).toBe(true)
    // The boxes and the badge come back where they were.
    for (const id of ['ctx', 'pred', 'ctx-trainable']) {
      expect(updates.has(id)).toBe(false)
    }
  })

  it('takes an agent replacement as written', () => {
    const scene = figure()
    const memory = createSettleMemory()
    baselineSettled(memory, scene)
    const agent = scene.map((element) =>
      element.id === 'pred' ? { ...element, y: 60, version: 2 } : element
    )
    rebaselineSettled(memory, agent)
    expect(settleFigure(agent, memory).size).toBe(0)
  })
})
