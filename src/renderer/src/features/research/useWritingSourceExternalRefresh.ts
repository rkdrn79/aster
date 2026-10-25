import { useEffect } from 'react'
import { notifyEditorExternalFileChange } from '@/components/editor/editor-autosave'
import { useAppStore } from '@/store'
import { getDiskBaselineSignature } from '../../../../shared/disk-baseline-signature'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import {
  readManuscriptSource,
  statManuscriptSource,
  type ManuscriptFile
} from './research-writing-source'

const WRITING_SOURCE_CHECK_MS = 3_000

/** Recovers a selected manuscript tab when a native watcher misses an agent's disk write. */
export function useWritingSourceExternalRefresh(
  experiment: ExperimentRecord,
  file: ManuscriptFile | null,
  fileId: string | null,
  visible: boolean
): void {
  useEffect(() => {
    if (!visible || !file || !fileId) {
      return
    }
    let disposed = false
    let checking = false
    let checkedDiskVersion: string | null = null

    const check = async (): Promise<void> => {
      if (checking) {
        return
      }
      const tab = useAppStore
        .getState()
        .openFiles.find(
          (candidate) =>
            candidate.id === fileId &&
            candidate.filePath === file.absolutePath &&
            candidate.worktreeId === experiment.workspaceId
        )
      if (!tab?.lastKnownDiskSignature) {
        return
      }
      checking = true
      try {
        const stat = await statManuscriptSource(experiment, file)
        const diskVersion = `${stat.size}:${stat.mtime}:${stat.ctime ?? ''}`
        if (disposed || checkedDiskVersion === diskVersion) {
          return
        }
        const source = await readManuscriptSource(experiment, file)
        if (disposed) {
          return
        }
        const current = useAppStore
          .getState()
          .openFiles.find((candidate) => candidate.id === fileId)
        if (
          current?.filePath !== file.absolutePath ||
          current.worktreeId !== experiment.workspaceId ||
          !current.lastKnownDiskSignature
        ) {
          return
        }
        checkedDiskVersion = `${source.size}:${source.mtime}:${stat.ctime ?? ''}`
        if (getDiskBaselineSignature(source.text) !== current.lastKnownDiskSignature) {
          notifyEditorExternalFileChange({
            worktreeId: experiment.workspaceId,
            worktreePath: experiment.workspacePath,
            relativePath: file.relativePath,
            runtimeEnvironmentId: current.runtimeEnvironmentId ?? null
          })
        }
      } catch {
        // A transient write or disconnected host is retried; the editor keeps its current buffer.
      } finally {
        checking = false
      }
    }

    void check()
    const timer = window.setInterval(() => void check(), WRITING_SOURCE_CHECK_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [experiment, file, fileId, visible])
}
