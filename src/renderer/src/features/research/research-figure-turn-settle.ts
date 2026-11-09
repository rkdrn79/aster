import { figureFilePaths } from '../../../../research-harness/research-figures-model.mjs'
import { parseFigureText } from './research-figure-document'
import { diffFigureElements, figureDiffCount, type FigureElementDiff } from './research-figure-diff'
import { snapshotFigure } from './research-figure-history'
import {
  sameFigureTarget,
  setFigureTurnDiff,
  useFigureTurn,
  type FigureTurn
} from './research-figure-turn'
import type { FigureTarget } from './research-figures-export'
import { readProjectText } from './research-project-files'

/** The open editor's way to end a turn: catch up with the file, fold undo, return its scene. */
export type FigureTurnSettler = (turn: FigureTurn) => Promise<string | null>

let editor: { target: FigureTarget; settle: FigureTurnSettler } | null = null

export function registerFigureTurnSettler(
  target: FigureTarget,
  settle: FigureTurnSettler
): () => void {
  const entry = { target, settle }
  editor = entry
  return () => {
    if (editor === entry) {
      editor = null
    }
  }
}

const EMPTY: FigureElementDiff = { added: [], changed: [], removed: [] }

/**
 * Ends a turn: what it changed (for the turn bar), and its "agent result" version in History when
 * it changed the figure. Uses the open canvas when it shows the figure, the file otherwise.
 */
export async function settleFigureTurn(turn: FigureTurn): Promise<void> {
  const { target } = turn
  if (!target) {
    setFigureTurnDiff(turn.id, EMPTY)
    return
  }
  const open = editor && sameFigureTarget(editor.target, target) ? editor : null
  const after = open
    ? await open.settle(turn).catch(() => null)
    : await readProjectText(target.owner, figureFilePaths(target.folder, target.slug).scene).catch(
        () => null
      )
  if (after === null || !turn.beforeText) {
    setFigureTurnDiff(turn.id, EMPTY)
    return
  }
  const diff = diffFigureElements(
    parseFigureText(turn.beforeText).elements,
    parseFigureText(after).elements
  )
  setFigureTurnDiff(turn.id, diff)
  if (figureDiffCount(diff)) {
    await snapshotFigure(target, {
      kind: 'agent-result',
      what: turn.request,
      text: after,
      compareTo: turn.beforeText
    })
  }
}

/** Settles each tracked turn once, when it stops being active. */
export function watchFigureTurnEnds(): () => void {
  return useFigureTurn.subscribe((state, previous) => {
    const turn = state.turn
    const before = previous.turn
    const ended =
      turn !== null &&
      (turn.phase === 'done' || turn.phase === 'stopped') &&
      (before?.id !== turn.id || (before.phase !== 'done' && before.phase !== 'stopped'))
    if (ended) {
      void settleFigureTurn(turn)
    }
  })
}
