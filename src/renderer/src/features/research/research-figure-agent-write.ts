import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { noteFigurePersonEdits, figureCowork } from './research-figure-cowork-store'
import { describeFigureChange, type FigureMergeConflict } from './research-figure-merge'
import { keepFigurePersonEdits, writeFigureKeptReport } from './research-figure-person-edits'
import type { FigureTarget } from './research-figures-export'
import { projectFileSignature } from './research-project-files'

/**
 * True while the person is in the middle of something on the canvas (dragging, resizing, drawing,
 * typing a label): the agent's write waits for the next look so it never cuts that off.
 */
export function figureCanvasBusy(api: Pick<ExcalidrawImperativeAPI, 'getAppState'>): boolean {
  const state = api.getAppState()
  return Boolean(
    state.editingTextElement ||
    state.newElement ||
    state.resizingElement ||
    state.multiElement ||
    state.selectedElementsAreBeingDragged ||
    state.isResizing ||
    state.isRotating ||
    state.cursorButton === 'down'
  )
}

/** A file the canvas is about to take, with the person's hand edits put back where it lost them. */
export async function takeFigureFile(
  target: FigureTarget,
  scenePath: string,
  file: { text: string; signature: string; stale: boolean }
): Promise<{ text: string; signature: string; stale: boolean }> {
  const kept = await keepFigurePersonEdits(target, file.text).catch(() => null)
  if (!kept?.changed) {
    return file
  }
  const { signature } = await projectFileSignature(target.owner, scenePath)
  return { text: kept.text, signature, stale: true }
}

/** The agent wrote what the person was changing too: theirs is kept, and the agent is told. */
export async function noteFigureConflicts(
  target: FigureTarget,
  conflicts: readonly FigureMergeConflict[]
): Promise<void> {
  const items = conflicts.map((conflict) => ({
    id: conflict.id,
    label: conflict.label,
    prop: 'canvas',
    agent: describeFigureChange(conflict.base, conflict.agent),
    person: describeFigureChange(conflict.base, conflict.mine)
  }))
  const current = figureCowork(target).edits
  noteFigurePersonEdits(target, {
    count: current?.count ?? 0,
    lines: current?.lines ?? [],
    overrode: items.map(
      (item) => `'${item.label}': the agent ${item.agent}, you ${item.person}; yours kept`
    )
  })
  await writeFigureKeptReport(target, items)
}
