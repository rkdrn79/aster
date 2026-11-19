import { describe, expect, it } from 'vitest'
import { enterGroup, exitGroup } from './research-figure-depth'
import { pick, scene } from './research-figure-edit-fixture'

describe('Enter and Shift+Enter through groups', () => {
  it('goes into a selected group and out again', () => {
    const elements = scene()
    const box = pick(elements, 'ctx', 'ctx-label-0-0', 'ctx-label-1-0', 'ctx-label-2-0')
    const inside = enterGroup(box, elements, null)
    expect(inside).toMatchObject({
      editingGroupId: 'ctx-shape',
      selectedGroupIds: { 'ctx-label-group': true }
    })
    expect(Object.keys(inside?.selectedElementIds ?? {}).length).toBe(4)
    const label = pick(elements, 'ctx-label-0-0', 'ctx-label-1-0', 'ctx-label-2-0')
    expect(enterGroup(label, elements, 'ctx-shape')).toMatchObject({
      editingGroupId: 'ctx-label-group',
      selectedGroupIds: {}
    })
    expect(exitGroup(elements, 'ctx-label-group')).toMatchObject({
      editingGroupId: 'ctx-shape',
      selectedGroupIds: { 'ctx-label-group': true }
    })
    expect(exitGroup(elements, 'ctx-shape')).toMatchObject({
      editingGroupId: null,
      selectedGroupIds: { 'ctx-shape': true }
    })
  })

  it('leaves a lone element or two groups to Excalidraw', () => {
    const elements = scene()
    expect(enterGroup(pick(elements, 'patch'), elements, null)).toBeNull()
    expect(enterGroup(pick(elements, 'ctx', 'panel'), elements, null)).toBeNull()
    expect(exitGroup(elements, null)).toBeNull()
  })
})
