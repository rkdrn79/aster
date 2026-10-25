import { useEffect, useState } from 'react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { readWritingFileDirectory } from './research-writing-file-tree'

const STORAGE_PREFIX = 'aster.research-writing-files-open.v1:'

/** The user's own Files toggle for this Experiment, or null before they have used it. */
export function readWritingFilesOpen(experimentId: string): boolean | null {
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}${experimentId}`)
    return value === 'true' ? true : value === 'false' ? false : null
  } catch {
    return null
  }
}

export function saveWritingFilesOpen(experimentId: string, open: boolean): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${experimentId}`, String(open))
  } catch {
    // Storage can be full or disabled; the choice then lasts for this session only.
  }
}

/**
 * Whether the manuscript folder holds more than its one TeX file, so the file tree has something
 * to pick from. Null while the folder is read. Why: a lone main.tex left a mostly empty column
 * beside an editor squeezed into the rest of the TeX pane.
 */
export function useWritingFilesWorthShowing(
  experiment: Pick<ExperimentRecord, 'hostId' | 'workspaceId' | 'workspacePath'>,
  root: string
): boolean | null {
  const { hostId, workspaceId, workspacePath } = experiment
  const key = JSON.stringify([hostId, workspaceId, workspacePath, root])
  const [result, setResult] = useState<{ key: string; worthShowing: boolean } | null>(null)
  useEffect(() => {
    let cancelled = false
    readWritingFileDirectory({ hostId, workspaceId, workspacePath }, root, root)
      .then((entries) => {
        if (!cancelled) {
          setResult({ key, worthShowing: entries.length > 1 })
        }
      })
      .catch(() => {
        // Show the tree, which reports the read failure and offers a retry.
        if (!cancelled) {
          setResult({ key, worthShowing: true })
        }
      })
    return () => {
      cancelled = true
    }
  }, [key, hostId, workspaceId, workspacePath, root])
  return result?.key === key ? result.worthShowing : null
}
