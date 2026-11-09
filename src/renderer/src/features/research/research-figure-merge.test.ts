import { describe, expect, it } from 'vitest'
import type { FigureElement } from '../../../../research-harness/research-figures-model.mjs'
import { diffFigureElements, figureDiffText, figureElementLabel } from './research-figure-diff'
import { mergeFigureElements, resolveFigureConflicts } from './research-figure-merge'

function box(id: string, props: Partial<FigureElement> = {}): FigureElement {
  return { id, type: 'rectangle', x: 0, y: 0, width: 96, height: 40, version: 1, ...props }
}

describe('diffFigureElements', () => {
  it('counts added, changed and removed elements and ignores write noise', () => {
    const before = [box('a'), box('b'), box('c'), { ...box('t'), type: 'text', text: 'x' }]
    const after = [
      box('a', { version: 9, versionNonce: 4, updated: 77 }),
      box('b', { x: 40 }),
      box('d'),
      { ...box('t'), type: 'text', text: 'x', width: 120 }
    ]
    expect(diffFigureElements(before, after)).toEqual({
      added: ['d'],
      changed: ['b'],
      removed: ['c']
    })
    expect(figureDiffText(diffFigureElements(before, after))).toBe(
      '1 added · 1 changed · 1 removed'
    )
  })

  it('treats a deleted element as removed', () => {
    expect(diffFigureElements([box('a')], [box('a', { isDeleted: true })]).removed).toEqual(['a'])
  })
})

describe('figureElementLabel', () => {
  it('names a box after the label in its group', () => {
    const elements = [
      box('ctx', { groupIds: ['g-ctx'] }),
      { ...box('ctx-label-1'), type: 'text', text: 'encoder', y: 12, groupIds: ['g-ctx'] },
      { ...box('ctx-label-0'), type: 'text', text: 'context', y: 2, groupIds: ['g-ctx'] }
    ]
    expect(figureElementLabel(elements[0], elements)).toBe('context encoder')
  })
})

describe('mergeFigureElements', () => {
  const base = [box('a'), box('b'), box('c')]

  it('combines changes to different elements without conflicts', () => {
    const mine = [box('a', { x: 50 }), box('b'), box('c'), box('mine-new')]
    const agent = [box('a'), box('b', { strokeColor: '#c00' }), box('agent-new')]
    const result = mergeFigureElements({ base, mine, agent })
    expect(result.conflicts).toEqual([])
    const byId = Object.fromEntries(result.elements.map((element) => [element.id, element]))
    expect(byId.a.x).toBe(50)
    expect(byId.b.strokeColor).toBe('#c00')
    expect(byId.c).toBeUndefined()
    expect(Object.keys(byId).sort()).toEqual(['a', 'agent-new', 'b', 'mine-new'])
    expect(result.fromAgent).toBe(3)
    expect(result.fromMine).toBe(2)
  })

  it('combines different properties of one element and keeps both sides arrows bound', () => {
    const mine = [
      box('a', { x: 50, boundElements: [{ id: 'm', type: 'arrow' }] }),
      box('b'),
      box('c')
    ]
    const agent = [
      box('a', { strokeColor: '#c00', boundElements: [{ id: 'g', type: 'arrow' }] }),
      box('b'),
      box('c')
    ]
    const result = mergeFigureElements({ base, mine, agent })
    expect(result.conflicts).toEqual([])
    const a = result.elements.find((element) => element.id === 'a')
    expect(a?.x).toBe(50)
    expect(a?.strokeColor).toBe('#c00')
    expect(a?.boundElements?.map((entry) => entry.id).sort()).toEqual(['g', 'm'])
  })

  it('reports overlapping edits and keeps the human version until reviewed', () => {
    const mine = [box('a', { x: 50 }), box('b'), box('c', { y: 9 })]
    const agent = [box('a', { x: 80 }), box('b'), box('c', { isDeleted: true })]
    const result = mergeFigureElements({ base, mine, agent })
    expect(result.conflicts.map((conflict) => conflict.id)).toEqual(['a', 'c'])
    expect(result.elements.find((element) => element.id === 'a')?.x).toBe(50)
    const resolved = resolveFigureConflicts(result.elements, result.conflicts, {
      a: 'agent',
      c: 'agent'
    })
    expect(resolved.find((element) => element.id === 'a')?.x).toBe(80)
    expect(resolved.some((element) => element.id === 'c')).toBe(false)
  })

  it("takes a box's label along when the agent's version of the box wins", () => {
    const grouped = [
      box('p', { groupIds: ['g'] }),
      box('p-label', { type: 'text', text: 'p', groupIds: ['g'] })
    ]
    const mine = [
      box('p', { x: 40, groupIds: ['g'] }),
      box('p-label', { type: 'text', text: 'p', x: 40, groupIds: ['g'] })
    ]
    const agent = [box('p', { x: -30, groupIds: ['g'] }), grouped[1]]
    const result = mergeFigureElements({ base: grouped, mine, agent })
    expect(result.conflicts.map((conflict) => conflict.id)).toEqual(['p'])
    expect(result.conflicts[0].companions.map((companion) => companion.id)).toEqual(['p-label'])
    const theirs = resolveFigureConflicts(result.elements, result.conflicts, { p: 'agent' })
    expect(theirs.map((element) => element.x)).toEqual([-30, 0])
    const ours = resolveFigureConflicts(result.elements, result.conflicts, { p: 'mine' })
    expect(ours.map((element) => element.x)).toEqual([40, 40])
  })

  it('brings back an element the agent changed but the human deleted when the agent wins', () => {
    const mine = [box('a'), box('b')]
    const agent = [box('a'), box('b'), box('c', { x: 30 })]
    const result = mergeFigureElements({ base, mine, agent })
    expect(result.conflicts.map((conflict) => conflict.id)).toEqual(['c'])
    const resolved = resolveFigureConflicts(result.elements, result.conflicts, { c: 'agent' })
    expect(resolved.find((element) => element.id === 'c')?.x).toBe(30)
  })
})
