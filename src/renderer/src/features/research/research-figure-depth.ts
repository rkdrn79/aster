import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

/** The selection state Enter and Shift+Enter move between, as Excalidraw's app state holds it. */
export type DepthSelection = {
  editingGroupId: string | null
  selectedElementIds: Record<string, true>
  selectedGroupIds: Record<string, true>
}

/** The group or element one level inside `editing` (the outermost one at the top level). */
function levelKey(element: ExcalidrawElement, editing: string | null): string {
  if (!editing) {
    return element.groupIds.at(-1) ?? element.id
  }
  const index = element.groupIds.indexOf(editing)
  return index > 0 ? element.groupIds[index - 1] : element.id
}

const membersOf = (elements: readonly ExcalidrawElement[], group: string) =>
  elements.filter((element) => !element.isDeleted && element.groupIds.includes(group))

/**
 * Enter on one selected group goes into it and selects what it holds (Figma's Enter): a box
 * group's box and its label become the selection, one click away from either.
 */
export function enterGroup(
  selected: readonly ExcalidrawElement[],
  elements: readonly ExcalidrawElement[],
  editing: string | null
): DepthSelection | null {
  const keys = new Set(selected.map((element) => levelKey(element, editing)))
  const [group] = keys
  if (keys.size !== 1 || selected.some((element) => element.id === group)) {
    return null
  }
  const members = membersOf(elements, group)
  if (!members.length) {
    return null
  }
  const inner = new Set(members.map((member) => levelKey(member, group)))
  return {
    editingGroupId: group,
    selectedElementIds: Object.fromEntries(members.map((member) => [member.id, true] as const)),
    selectedGroupIds: Object.fromEntries(
      [...inner]
        .filter((key) => members.some((member) => member.groupIds.includes(key)))
        .map((key) => [key, true] as const)
    )
  }
}

/** Shift+Enter leaves the group being edited and selects it whole (Figma's Shift+Enter). */
export function exitGroup(
  elements: readonly ExcalidrawElement[],
  editing: string | null
): DepthSelection | null {
  if (!editing) {
    return null
  }
  const members = membersOf(elements, editing)
  if (!members.length) {
    return null
  }
  const [first] = members
  const parent = first.groupIds[first.groupIds.indexOf(editing) + 1] ?? null
  return {
    editingGroupId: parent,
    selectedElementIds: Object.fromEntries(members.map((member) => [member.id, true] as const)),
    selectedGroupIds: { [editing]: true }
  }
}
