import { describe, expect, it } from 'vitest'
import {
  facingSide,
  moveRun,
  routeRebound,
  runsOf,
  segmentHandles,
  tidyPath
} from './research-figure-connector-edit'
import { isOrthogonal, type Point } from './research-figure-orthogonal-route'
import { settleFigure } from './research-figure-settle'
import {
  baselineSettled,
  createSettleMemory,
  type SettleElement
} from './research-figure-settle-state'

/** The kit's connector from the photo up and over to "patchify", with its collinear head stub. */
const elbow: Point[] = [
  [68, 124],
  [68, 58],
  [146, 58],
  [166, 58]
]

describe('connector segment handles', () => {
  it('reads runs with the head stub merged, and puts a handle on each long run', () => {
    expect(runsOf(elbow)).toEqual([
      { axis: 'v', from: 0, to: 1 },
      { axis: 'h', from: 1, to: 3 }
    ])
    expect(segmentHandles(elbow).map((handle) => [handle.run, handle.axis, handle.mid])).toEqual([
      [0, 'v', [68, 91]],
      [1, 'h', [117, 58]]
    ])
    expect(
      runsOf([
        [0, 0],
        [10, 10]
      ])
    ).toBeNull()
  })

  it('moves a middle run across itself, its neighbours stretching', () => {
    const z: Point[] = [
      [0, 0],
      [50, 0],
      [50, 40],
      [100, 40]
    ]
    expect(moveRun(z, 1, 70)).toEqual([
      [0, 0],
      [70, 0],
      [70, 40],
      [100, 40]
    ])
  })

  it('keeps a stub and adds a jog when the run ends on a shape', () => {
    const moved = moveRun(elbow, 1, 40)
    expect(moved).toEqual([
      [68, 124],
      [68, 40],
      [154, 40],
      [154, 58],
      [166, 58]
    ])
    expect(isOrthogonal(moved)).toBe(true)
    const straight = moveRun(
      [
        [0, 0],
        [120, 0]
      ],
      0,
      30
    )
    expect(straight).toEqual([
      [0, 0],
      [12, 0],
      [12, 30],
      [108, 30],
      [108, 0],
      [120, 0]
    ])
  })

  it('tidies repeated and collinear points, and picks the side facing the other end', () => {
    expect(
      tidyPath([
        [0, 0],
        [0, 0],
        [10, 0],
        [20, 0],
        [20, 5]
      ])
    ).toEqual([
      [0, 0],
      [20, 0],
      [20, 5]
    ])
    const box = { x: 100, y: 100, width: 100, height: 40 }
    expect(facingSide(box, [0, 120])).toBe('left')
    expect(facingSide(box, [150, 0])).toBe('top')
    expect(facingSide(box, [400, 140])).toBe('right')
    expect(facingSide(box, [400, 300])).toBe('bottom')
  })
})

describe('re-gluing a connector dropped on another shape', () => {
  it('enters the new shape from the side facing the other end, at right angles', () => {
    const before: Point[] = [
      [496, 242],
      [536, 242],
      [556, 242]
    ]
    // The head dragged onto "linear probe" (760..872, 222..262): one diagonal-free straight line.
    const now: Point[] = [
      [496, 242],
      [816, 242]
    ]
    const tgt = { box: { x: 380, y: 214, width: 112, height: 88 }, round: false, changed: false }
    const head = { box: { x: 760, y: 222, width: 112, height: 40 }, round: false, changed: true }
    const path = routeRebound(before, now, tgt, head, 4)
    expect(path?.[0]).toEqual([496, 242])
    expect(path?.at(-1)).toEqual([756, 242])
    expect(path && isOrthogonal(path)).toBe(true)
    const above = { box: { x: 560, y: 40, width: 104, height: 64 }, round: false, changed: true }
    const up = routeRebound(before, now, tgt, above, 4)
    expect(up?.at(-1)?.[1]).toBe(108)
    expect(up && isOrthogonal(up)).toBe(true)
  })
})

describe('settling a reconnected connector', () => {
  type Mutable = { -readonly [K in keyof SettleElement]: SettleElement[K] }
  const box = (id: string, x: number, y: number): Mutable => ({
    id,
    type: 'rectangle',
    x,
    y,
    width: 104,
    height: 40,
    version: 1,
    groupIds: [],
    customData: {}
  })
  const scene = (): Mutable[] => [
    box('tgt', 380, 222),
    box('tok', 560, 222),
    box('head', 760, 120),
    {
      id: 'a',
      type: 'arrow',
      x: 488,
      y: 242,
      width: 68,
      height: 0,
      version: 1,
      groupIds: [],
      customData: {},
      points: [
        [0, 0],
        [68, 0]
      ],
      startBinding: { elementId: 'tgt', gap: 4 },
      endBinding: { elementId: 'tok', gap: 4 }
    }
  ]

  it('routes the arrow again at right angles once its end is glued to another box', () => {
    const elements = scene()
    const memory = createSettleMemory()
    baselineSettled(memory, elements)
    const arrow = elements[3]
    Object.assign(arrow, {
      version: 2,
      width: 320,
      height: 100,
      points: [
        [0, 0],
        [320, -100]
      ],
      endBinding: { elementId: 'head', gap: 4 }
    })
    const update = settleFigure(elements, memory, { selected: new Set(['a']) }).get('a')
    const path = (update?.points ?? []).map(
      ([px, py]) => [(update?.x ?? 0) + px, (update?.y ?? 0) + py] as const
    )
    expect(isOrthogonal(path)).toBe(true)
    expect(path[0]).toEqual([488, 242])
    expect(path.at(-1)).toEqual([756, 140])
  })

  it('waits while the end is still being dragged', () => {
    const elements = scene()
    const memory = createSettleMemory()
    baselineSettled(memory, elements)
    Object.assign(elements[3], { version: 2, endBinding: { elementId: 'head', gap: 4 } })
    expect(
      settleFigure(elements, memory, { gesture: true, selected: new Set(['a']) }).has('a')
    ).toBe(false)
  })
})
