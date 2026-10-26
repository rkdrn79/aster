import { useEffect, useRef, useState } from 'react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { useResearchRecords } from './research-records-store'
import { appendCompileLog } from './research-writing-compile-log'
import { saveProjectPdfPath } from './research-writing-project'
import { resolveManuscriptFile, type ManuscriptFile } from './research-writing-source'
import { authorityKey, parseHostAuthorityKey } from '../../../../shared/host-authority'
import { runtimeRpcTargetForAuthorityKey } from '@/runtime/runtime-client-target'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { ResearchLatexCompileResult } from '../../../../preload/api/research-latex-bridge'

const LOG_FLUSH_MS = 150

export type WritingCompile = {
  compiling: boolean
  startedAt: number | null
  log: string
  error: string | null
  /** False in a window whose preload cannot stop a build. */
  canCancel: boolean
  compile: () => Promise<void>
  cancel: () => void
}

/** Builds the main .tex with Tectonic, streaming its output into `log` while it runs. */
export function useWritingCompile({
  record,
  projectOnly,
  rootFile,
  dirtyTeXFiles,
  onBuilt
}: {
  record: ExperimentRecord
  /** A project without Experiments compiles its catalog manuscript by path. */
  projectOnly: boolean
  rootFile: ManuscriptFile
  dirtyTeXFiles: number
  onBuilt: (pdf: ManuscriptFile, builtAt: string) => void
}): WritingCompile {
  const [compiling, setCompiling] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [log, setLog] = useState('')
  const [error, setError] = useState<string | null>(null)
  const buildId = useRef<string | null>(null)
  const pending = useRef('')
  const flushTimer = useRef<number | null>(null)
  const api = window.api.researchLatex
  const authority = parseHostAuthorityKey(record.hostId)
  const remoteTarget =
    authority?.endpoint.kind === 'environment' && authority.at === 'local'
      ? runtimeRpcTargetForAuthorityKey(authorityKey(authority))
      : null

  useEffect(
    () => () => {
      if (flushTimer.current !== null) {
        window.clearTimeout(flushTimer.current)
      }
    },
    []
  )

  function flush(): void {
    flushTimer.current = null
    const text = pending.current
    pending.current = ''
    if (text) {
      setLog((current) => appendCompileLog(current, text))
    }
  }

  async function compile(): Promise<void> {
    if (compiling) {
      return
    }
    if (dirtyTeXFiles > 0) {
      setError('Save all open TeX edits before compiling. The PDF build uses files on disk.')
      return
    }
    if (record.hostId !== 'local' && !remoteTarget) {
      setError(
        'PDF builds are unavailable on this SSH route. Connect the project through an Aster server.'
      )
      return
    }
    const id = createBrowserUuid()
    buildId.current = id
    setCompiling(true)
    setStartedAt(Date.now())
    setError(null)
    setLog('')
    pending.current = ''
    // Why buffered: a first build prints a line per downloaded file; one render per line is wasteful.
    const unsubscribe = remoteTarget
      ? undefined
      : api.onOutput?.((output) => {
          if (output.buildId !== id) {
            return
          }
          pending.current += output.text
          flushTimer.current ??= window.setTimeout(flush, LOG_FLUSH_MS)
        })
    try {
      const storedExperiment = useResearchRecords
        .getState()
        .document?.experiments.find((entry) => entry.id === record.id)
      const result = remoteTarget
        ? await callRuntimeRpc<ResearchLatexCompileResult>(
            remoteTarget,
            'researchProject.latexCompile',
            { worktree: `id:${record.workspaceId}`, sourcePath: rootFile.relativePath },
            { timeoutMs: 16 * 60_000 }
          )
        : await api.compile(
            projectOnly || (storedExperiment && !storedExperiment.manuscript)
              ? {
                  workspacePath: record.workspacePath,
                  sourcePath: rootFile.relativePath,
                  buildId: id
                }
              : { experimentId: record.id, buildId: id }
          )
      unsubscribe?.()
      if (flushTimer.current !== null) {
        window.clearTimeout(flushTimer.current)
      }
      flush()
      // Why: an older preload does not stream, so the result's tail is the only log.
      setLog((current) => current || result.output)
      if (result.status === 'cancelled') {
        return
      }
      if (result.status !== 'ok') {
        setError(result.message)
        return
      }
      const file = resolveManuscriptFile(record, result.pdfPath, '.pdf')
      onBuilt(file, result.builtAt)
      if (projectOnly) {
        saveProjectPdfPath(record.id, rootFile.relativePath, file.relativePath)
      } else {
        await savePdfPath(record, rootFile.relativePath, file.relativePath).catch(
          (cause: unknown) =>
            setError(`PDF built, but its location was not saved. ${String(cause)}`)
        )
      }
    } catch (cause) {
      unsubscribe?.()
      setError(
        `PDF build could not start. ${String(cause)}${remoteTarget ? ' Check that the Aster server on this host supports PDF builds.' : ''}`
      )
    } finally {
      buildId.current = null
      setCompiling(false)
      setStartedAt(null)
    }
  }

  function cancel(): void {
    const id = buildId.current
    if (id && !remoteTarget && api.cancel) {
      void api.cancel({ buildId: id }).catch(() => undefined)
    }
  }

  return {
    compiling,
    startedAt,
    log,
    error,
    canCancel: !remoteTarget && Boolean(api.cancel),
    compile,
    cancel
  }
}

async function savePdfPath(
  record: ExperimentRecord,
  sourcePath: string,
  pdfPath: string
): Promise<void> {
  await useResearchRecords.getState().update((current) => ({
    ...current,
    experiments: current.experiments.map((entry) =>
      !entry.archived &&
      entry.workspaceId === record.workspaceId &&
      entry.hostId === record.hostId &&
      (!entry.manuscript || entry.manuscript.sourcePath === sourcePath)
        ? {
            ...entry,
            manuscript: { sourcePath, pdfPath },
            updatedAt: new Date().toISOString()
          }
        : entry
    )
  }))
}
