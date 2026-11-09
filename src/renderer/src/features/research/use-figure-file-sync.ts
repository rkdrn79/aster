import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { hashElementsVersion } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { figureFilePaths } from '../../../../research-harness/research-figures-model.mjs'
import {
  decideExternalChange,
  parseFigureText,
  type FigureFileState
} from './research-figure-document'
import { diffFigureElements, figureDiffCount } from './research-figure-diff'
import { snapshotFigure } from './research-figure-history'
import type { FigureMergeConflict } from './research-figure-merge'
import {
  applyFigureScene,
  applyMergeChoices,
  changedOnCanvas,
  foldIntoOneStep,
  mergeDiskIntoCanvas,
  type FigureCaptureMode
} from './research-figure-sync-merge'
import {
  figureAgentWriting,
  figureTurnBeforeText,
  noteFigureAgentWrite
} from './research-figure-turn'
import { figureSceneText, writeFigureExports, type FigureTarget } from './research-figures-export'
import { figureTextsDiffer, loadFigureFile } from './research-figure-file-load'
import {
  ProjectWriteConflict,
  projectFileSignature,
  readProjectText,
  writeProjectText
} from './research-project-files'

const POLL_MS = 2000
const AUTOSAVE_MS = 1500
// Why: a "my edit" version on every autosave would push the agent's versions out of History.
const MY_EDIT_EVERY_MS = 5 * 60 * 1000

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Puts a file's scene on the canvas; text an agent wrote gets Excalidraw's measured size. */
export function applyFigureText(
  api: ExcalidrawImperativeAPI,
  text: string,
  capture: FigureCaptureMode = 'immediately'
): void {
  applyFigureScene(api, JSON.parse(text), capture)
}

export type FigureSync = ReturnType<typeof useFigureFileSync>

/**
 * Keeps one figure file and its canvas in step: loads it, autosaves with a check that nobody wrote
 * in between, follows an agent's writes, and merges them with unsaved edits element by element.
 */
export function useFigureFileSync(
  target: FigureTarget,
  onExternalChange: (api: ExcalidrawImperativeAPI) => void
) {
  const scenePath = figureFilePaths(target.folder, target.slug).scene
  const [initialText, setInitialText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<FigureMergeConflict[] | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [invalid, setInvalid] = useState<string[] | null>(null)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [busy, setBusy] = useState<'saving' | 'exporting' | null>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const baseRef = useRef<FigureFileState | null>(null)
  const seenRef = useRef<string | null>(null)
  const staleRef = useRef(false)
  const dirtyRef = useRef(false)
  const touchedRef = useRef(false)
  const versionRef = useRef<number | null>(null)
  const busyRef = useRef(false)
  const reviewRef = useRef<FigureMergeConflict[] | null>(null)
  // The canvas just before the agent's first write of a turn, to fold the turn into one undo step.
  const foldRef = useRef<readonly ExcalidrawElement[] | null>(null)
  // What the agent last wrote in this turn (or the figure before it), which its next write builds on.
  const agentBaseRef = useRef<string | null>(null)
  const myEditAtRef = useRef(0)
  const autosaveRef = useRef<number | undefined>(undefined)
  const saveRef = useRef<() => Promise<boolean>>(async () => false)
  const externalRef = useRef(onExternalChange)
  useEffect(() => {
    externalRef.current = onExternalChange
  })
  useEffect(() => () => window.clearTimeout(autosaveRef.current), [])

  const markClean = useCallback((api: ExcalidrawImperativeAPI) => {
    versionRef.current = hashElementsVersion(api.getSceneElementsIncludingDeleted())
    touchedRef.current = false
    dirtyRef.current = false
    setDirty(false)
  }, [])

  const markDirty = useCallback(() => {
    dirtyRef.current = true
    setDirty(true)
    const arm = (): void => {
      window.clearTimeout(autosaveRef.current)
      autosaveRef.current = window.setTimeout(() => {
        if (!dirtyRef.current || reviewRef.current) {
          return
        }
        // Why re-arm: a save already running would refuse this one and leave the edit unsaved.
        if (busyRef.current) {
          arm()
        } else {
          void saveRef.current()
        }
      }, AUTOSAVE_MS)
    }
    arm()
  }, [])

  const exportNow = useCallback(async (): Promise<void> => {
    const api = apiRef.current
    const base = baseRef.current
    if (!api || !base) {
      return
    }
    setBusy((current) => current ?? 'exporting')
    try {
      await writeFigureExports(api, target, base.text)
      setError(null)
    } catch (cause) {
      setError(`Exports were not written. ${errorText(cause)}`)
    } finally {
      setBusy((current) => (current === 'exporting' ? null : current))
    }
  }, [target])

  useEffect(() => {
    let live = true
    loadFigureFile(target).then(
      ({ text, signature, stale }) => {
        if (live) {
          staleRef.current = stale
          baseRef.current = { text, signature }
          seenRef.current = signature
          setInitialText(text)
        }
      },
      (cause: unknown) => live && setError(errorText(cause))
    )
    return () => {
      live = false
    }
  }, [target])

  const attachApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api
      markClean(api)
      if (staleRef.current) {
        staleRef.current = false
        // Why: an agent edited the file while no page was open, so its exports lag behind.
        window.setTimeout(() => void exportNow(), 300)
      }
    },
    [markClean, exportNow]
  )

  /** Excalidraw re-measures text after fonts load; only edits that follow input make it dirty. */
  const noteSceneChange = useCallback(
    (version: number) => {
      if (versionRef.current === null || version === versionRef.current) {
        return
      }
      versionRef.current = version
      if (touchedRef.current) {
        markDirty()
      }
    },
    [markDirty]
  )

  const noteUserInput = useCallback(() => {
    touchedRef.current = true
  }, [])

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
      if (fromAgent) {
        noteFigureAgentWrite(changedOnCanvas(previous, api))
      }
      externalRef.current(api)
      void exportNow()
    },
    [markClean, exportNow]
  )

  /**
   * The agent wrote while the canvas had edits it had not seen: keep both, ask only about overlaps.
   * `from` is the version both started from (default: the file as this page last had it).
   */
  const mergeDisk = useCallback(
    (state: FigureFileState, from?: string) => {
      const api = apiRef.current
      const base = baseRef.current
      if (!api || !base) {
        return
      }
      const previous = api.getSceneElementsIncludingDeleted()
      const { conflicts, fromAgent } = mergeDiskIntoCanvas(api, from ?? base.text, state.text)
      baseRef.current = state
      foldRef.current = null
      noteFigureAgentWrite(changedOnCanvas(previous, api))
      touchedRef.current = true
      if (conflicts.length) {
        reviewRef.current = conflicts
        setReview(conflicts)
      } else {
        toast.success("Merged the agent's changes with yours.", {
          description: `${fromAgent} from the agent; none of them touched what you changed.`
        })
      }
      markDirty()
      externalRef.current(api)
    },
    [markDirty]
  )

  const save = useCallback(async (): Promise<boolean> => {
    const api = apiRef.current
    const base = baseRef.current
    if (reviewRef.current) {
      // Why: saving now would drop the agent's side of the overlaps without anyone deciding.
      setReviewOpen(true)
      return false
    }
    if (!api || !base || busyRef.current) {
      return false
    }
    window.clearTimeout(autosaveRef.current)
    busyRef.current = true
    setBusy('saving')
    try {
      const text = figureSceneText(api)
      const unchanged =
        text === base.text ||
        figureDiffCount(
          diffFigureElements(parseFigureText(base.text).elements, api.getSceneElements())
        ) === 0
      if (unchanged) {
        markClean(api)
        return true
      }
      await writeProjectText(target.owner, scenePath, text, base.text)
      const { signature } = await projectFileSignature(target.owner, scenePath)
      baseRef.current = { text, signature }
      seenRef.current = signature
      markClean(api)
      setSavedAt(Date.now())
      if (Date.now() - myEditAtRef.current >= MY_EDIT_EVERY_MS) {
        myEditAtRef.current = Date.now()
        void snapshotFigure(target, {
          kind: 'my-edit',
          what: 'Saved my edits',
          text,
          compareTo: base.text
        })
      }
      await writeFigureExports(api, target, text)
      setError(null)
      return true
    } catch (cause) {
      if (cause instanceof ProjectWriteConflict) {
        const disk = await readProjectText(target.owner, scenePath)
        const { signature } = await projectFileSignature(target.owner, scenePath)
        seenRef.current = signature
        const issues = parseFigureText(disk).issues
        if (issues.length) {
          setInvalid(issues)
        } else {
          mergeDisk({ text: disk, signature })
        }
      } else {
        setError(`Not saved. ${errorText(cause)}`)
      }
      return false
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [target, scenePath, markClean, mergeDisk])
  useEffect(() => {
    saveRef.current = save
  })

  const check = useCallback(
    async (fromAgent = false) => {
      const base = baseRef.current
      if (!base || !apiRef.current || busyRef.current) {
        return
      }
      const { signature } = await projectFileSignature(target.owner, scenePath)
      if (signature === base.signature || signature === seenRef.current) {
        return
      }
      seenRef.current = signature
      const disk = await readProjectText(target.owner, scenePath)
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
    [target, scenePath, takeDisk, mergeDisk]
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
  }, [markClean])

  const resolveReview = useCallback(
    (choices: Readonly<Record<string, 'mine' | 'agent'>>) => {
      const api = apiRef.current
      const conflicts = reviewRef.current
      if (!api || !conflicts) {
        return
      }
      applyMergeChoices(api, conflicts, choices)
      reviewRef.current = null
      setReview(null)
      setReviewOpen(false)
      touchedRef.current = true
      markDirty()
    },
    [markDirty]
  )

  return {
    scenePath,
    initialText,
    error,
    review,
    reviewOpen,
    setReviewOpen,
    resolveReview,
    invalid,
    dirty,
    savedAt,
    busy,
    apiRef,
    attachApi,
    noteSceneChange,
    noteUserInput,
    save,
    check,
    foldAgentTurn,
    exportNow
  }
}
