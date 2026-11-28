import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { figureCanvasBusy, takeFigureFile } from './research-figure-agent-write'
import { noteFigureAgentChange } from './research-figure-cowork-store'
import { decideExternalChange, type FigureFileState } from './research-figure-document'
import { figureTextsDiffer } from './research-figure-file-load'
import {
  applyFigureText,
  changedOnCanvas,
  foldIntoOneStep,
  mergeDiskIntoCanvas
} from './research-figure-sync-merge'
import {
  figureAgentWriting,
  figureTurnBeforeText,
  noteFigureAgentWrite
} from './research-figure-turn'
import type { FigureTarget } from './research-figures-export'
import { projectFileSignature, readProjectText } from './research-project-files'
import { useFigureMergeReview } from './use-figure-merge-review'
import type { useFigurePersonEditTracking } from './use-figure-person-edits'

const POLL_MS = 2000

/** The editor state the agent's writes act on (see useFigureFileSync). */
export type FigureFollowCore = {
  target: FigureTarget
  scenePath: string
  initialText: string | null
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>
  baseRef: React.RefObject<FigureFileState | null>
  seenRef: React.RefObject<string | null>
  dirtyRef: React.RefObject<boolean>
  touchedRef: React.RefObject<boolean>
  busyRef: React.RefObject<boolean>
  externalRef: React.RefObject<(api: ExcalidrawImperativeAPI) => void>
  markClean: (api: ExcalidrawImperativeAPI) => void
  markDirty: () => void
  exportNow: () => Promise<void>
  setInvalid: (issues: string[] | null) => void
  person: ReturnType<typeof useFigurePersonEditTracking>
}

/**
 * Follows the agent's writes to the open figure: takes them when the person has nothing unsaved,
 * merges them element by element otherwise (the person's side wins an overlap), puts the person's
 * hand edits back first, and waits while a drag or a label is in progress.
 */
export function useFigureAgentFollow(core: FigureFollowCore) {
  const { target, scenePath, initialText, apiRef, baseRef, seenRef, dirtyRef } = core
  const { touchedRef, busyRef, externalRef, markClean, markDirty, exportNow, setInvalid } = core
  const { person } = core
  // The canvas just before the agent's first write of a turn, to fold the turn into one undo step.
  const foldRef = useRef<readonly ExcalidrawElement[] | null>(null)
  // What the agent last wrote in this turn (or the figure before it), which its next write builds on.
  const agentBaseRef = useRef<string | null>(null)
  const reviews = useFigureMergeReview(
    target,
    apiRef,
    useCallback(() => {
      touchedRef.current = true
      markDirty()
    }, [touchedRef, markDirty])
  )

  const takeDisk = useCallback(
    (state: FigureFileState, fromAgent: boolean) => {
      const api = apiRef.current
      if (!api) {
        return
      }
      const previous = api.getSceneElementsIncludingDeleted()
      if (fromAgent && !foldRef.current) {
        foldRef.current = previous
      }
      // Why never during a turn: the turn becomes one undo step when it ends (foldAgentTurn).
      applyFigureText(api, state.text, fromAgent ? 'never' : 'immediately')
      baseRef.current = state
      markClean(api)
      const changed = changedOnCanvas(previous, api)
      if (fromAgent) {
        noteFigureAgentWrite(changed)
      }
      noteFigureAgentChange(target, changed.length)
      externalRef.current(api)
      void exportNow()
    },
    [target, apiRef, baseRef, externalRef, markClean, exportNow]
  )

  /**
   * The agent wrote while the canvas had edits it had not seen: keep both; an overlap keeps the
   * person's side. `from` is the version both started from (default: the file as this page had it).
   */
  const mergeDisk = useCallback(
    (state: FigureFileState, from?: string) => {
      const api = apiRef.current
      const base = baseRef.current
      if (!api || !base) {
        return
      }
      const previous = api.getSceneElementsIncludingDeleted()
      // Why before the merge: it replaces the canvas, and what was the person's must stay theirs.
      const mine = person.keepMine(api)
      const { conflicts, fromAgent } = mergeDiskIntoCanvas(api, from ?? base.text, state.text)
      person.noteMine(mine)
      baseRef.current = state
      foldRef.current = null
      const changed = changedOnCanvas(previous, api)
      noteFigureAgentWrite(changed)
      noteFigureAgentChange(target, changed.length)
      touchedRef.current = true
      if (conflicts.length) {
        reviews.offerReview(conflicts)
      } else {
        toast.success("Merged the agent's changes with yours.", {
          description: `${fromAgent} from the agent; none of them touched what you changed.`
        })
      }
      markDirty()
      externalRef.current(api)
    },
    [target, apiRef, baseRef, touchedRef, externalRef, markDirty, person, reviews]
  )

  const check = useCallback(
    async (fromAgent = false) => {
      const base = baseRef.current
      // Why wait on a drag or a label being typed: taking the file now would cut it off.
      if (!base || !apiRef.current || busyRef.current || figureCanvasBusy(apiRef.current)) {
        return
      }
      const seen = await projectFileSignature(target.owner, scenePath)
      if (seen.signature === base.signature || seen.signature === seenRef.current) {
        return
      }
      seenRef.current = seen.signature
      // Why first: the agent's write may have dropped the person's hand edits; they are put back.
      const { text: disk, signature } = await takeFigureFile(target, scenePath, {
        text: await readProjectText(target.owner, scenePath),
        signature: seen.signature,
        stale: false
      })
      seenRef.current = signature
      const change = decideExternalChange({ base: base.text, disk, dirty: dirtyRef.current })
      if (change.kind === 'invalid') {
        setInvalid(change.issues)
        return
      }
      setInvalid(null)
      const agentTurn = fromAgent || figureAgentWriting(target)
      // Why: an edit saved during the turn is not in the file the agent read, so its write must
      // be merged from what the agent last saw, never just taken.
      const agentBase = agentTurn ? (agentBaseRef.current ?? figureTurnBeforeText(target)) : null
      if (agentTurn) {
        agentBaseRef.current = disk
      }
      if (change.kind === 'unchanged') {
        baseRef.current = { text: base.text, signature }
      } else if (
        agentBase !== null &&
        change.kind === 'reload' &&
        figureTextsDiffer(agentBase, base.text)
      ) {
        mergeDisk({ text: disk, signature }, agentBase)
      } else if (change.kind === 'reload') {
        takeDisk({ text: disk, signature }, agentTurn)
      } else {
        mergeDisk({ text: disk, signature }, agentBase ?? undefined)
      }
    },
    [
      target,
      scenePath,
      apiRef,
      baseRef,
      seenRef,
      dirtyRef,
      busyRef,
      setInvalid,
      takeDisk,
      mergeDisk
    ]
  )

  useEffect(() => {
    if (initialText === null) {
      return
    }
    const tick = (): void => void check().catch(() => undefined)
    const timer = window.setInterval(tick, POLL_MS)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', tick)
    }
  }, [initialText, check])

  /** Makes the agent's whole turn one ⌘Z step; false when the person edited during it. */
  const foldAgentTurn = useCallback((): boolean => {
    const api = apiRef.current
    const before = foldRef.current
    foldRef.current = null
    agentBaseRef.current = null
    if (!api || !before || dirtyRef.current) {
      return false
    }
    foldIntoOneStep(api, before)
    markClean(api)
    return true
  }, [apiRef, dirtyRef, markClean])

  return { mergeDisk, check, foldAgentTurn, reviews }
}
