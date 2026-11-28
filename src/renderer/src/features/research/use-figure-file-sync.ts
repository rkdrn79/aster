import { useCallback, useEffect, useRef, useState } from 'react'
import { hashElementsVersion } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { figureFilePaths } from '../../../../research-harness/research-figures-model.mjs'
import { parseFigureText, type FigureFileState } from './research-figure-document'
import { diffFigureElements, figureDiffCount } from './research-figure-diff'
import { snapshotFigure } from './research-figure-history'
import { figureSceneText, writeFigureExports, type FigureTarget } from './research-figures-export'
import { loadFigureFile } from './research-figure-file-load'
import { takeFigureFile } from './research-figure-agent-write'
import { useFigureAgentFollow } from './use-figure-agent-follow'
import { useFigurePersonEditTracking } from './use-figure-person-edits'
import {
  ProjectWriteConflict,
  projectFileSignature,
  readProjectText,
  writeProjectText
} from './research-project-files'

const AUTOSAVE_MS = 1500
// Why: a "my edit" version on every autosave would push the agent's versions out of History.
const MY_EDIT_EVERY_MS = 5 * 60 * 1000

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
  const myEditAtRef = useRef(0)
  const autosaveRef = useRef<number | undefined>(undefined)
  const saveRef = useRef<() => Promise<boolean>>(async () => false)
  const person = useFigurePersonEditTracking(target)
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
        if (!dirtyRef.current) {
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
    loadFigureFile(target)
      .then((file) => takeFigureFile(target, scenePath, file))
      .then(
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
  }, [target, scenePath])

  const attachApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api
      markClean(api)
      person.attach(api)
      if (staleRef.current) {
        staleRef.current = false
        // Why: an agent edited the file while no page was open, so its exports lag behind.
        window.setTimeout(() => void exportNow(), 300)
      }
    },
    [markClean, exportNow, person]
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

  const follow = useFigureAgentFollow({
    target,
    scenePath,
    initialText,
    apiRef,
    baseRef,
    seenRef,
    dirtyRef,
    touchedRef,
    busyRef,
    externalRef,
    markClean,
    markDirty,
    exportNow,
    setInvalid,
    person
  })
  const { mergeDisk, reviews } = follow

  const save = useCallback(async (): Promise<boolean> => {
    const api = apiRef.current
    const base = baseRef.current
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
      person.saved(api, base.text, text)
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
  }, [target, scenePath, markClean, mergeDisk, person])
  useEffect(() => {
    saveRef.current = save
  })

  return {
    scenePath,
    initialText,
    error,
    review: reviews.review,
    reviewOpen: reviews.reviewOpen,
    setReviewOpen: reviews.setReviewOpen,
    resolveReview: reviews.resolveReview,
    invalid,
    dirty,
    savedAt,
    busy,
    apiRef,
    attachApi,
    noteSceneChange,
    noteUserInput,
    save,
    check: follow.check,
    foldAgentTurn: follow.foldAgentTurn,
    exportNow
  }
}
