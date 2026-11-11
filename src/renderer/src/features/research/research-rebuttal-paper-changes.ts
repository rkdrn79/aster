import { promisesDocument } from '../../../../research-harness/research-rebuttal-model.mjs'
import { parsePromises } from '../../../../research-harness/research-rebuttal-points.mjs'
import {
  locatePaperChange,
  paperChangesDocument,
  type RebuttalPaperChange
} from '../../../../research-harness/research-rebuttal-records.mjs'
import { useAppStore } from '@/store'
import { isEditorModelDirty } from '@/components/editor/editor-save-disk-precondition'
import {
  readRebuttalText,
  rebuttalAbsolutePath,
  writeRebuttalText,
  type RebuttalOwner
} from './research-rebuttal-files'
import { withFreshSnapshot, writeJson } from './research-rebuttal-mutations'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

// Manuscript changes an agent proposed for a concern. They wait for the person: applying one
// edits the paper file, which keeps no version here to undo to.

/** Why applying to the manuscript must wait, if the file is open with unsaved edits. */
function manuscriptEditBlocker(owner: RebuttalOwner, relativePath: string): string | null {
  const state = useAppStore.getState()
  const filePath = rebuttalAbsolutePath(owner, relativePath)
  const dirty = state.openFiles.some(
    (file) =>
      file.worktreeId === owner.workspaceId &&
      file.filePath === filePath &&
      isEditorModelDirty(state, file)
  )
  return dirty ? `Save ${relativePath} in Writing before applying this change.` : null
}

function writePaperChanges(
  snapshot: RebuttalSnapshot,
  changes: RebuttalPaperChange[]
): Promise<void> {
  return writeJson(
    snapshot,
    'paper-changes.json',
    snapshot.texts.paperChanges,
    paperChangesDocument(changes)
  )
}

type PaperChangeFailure = { id: string; reason: string }

/**
 * Applies tracked changes to the manuscript in one go: each file is read once, changed in order,
 * and written once, and the applied changes and their promises are marked together. Returns the
 * changes that could not be applied, with why.
 */
export async function approveRebuttalPaperChanges(
  owner: RebuttalOwner,
  ids: readonly string[]
): Promise<PaperChangeFailure[]> {
  let failed: PaperChangeFailure[] = []
  await withFreshSnapshot(owner, async (snapshot) => {
    failed = []
    const chosen = snapshot.paperChanges.filter(
      (entry) => ids.includes(entry.id) && entry.status === 'pending'
    )
    const files = new Map<string, { original: string; text: string }>()
    const applied = new Set<string>()
    for (const change of chosen) {
      const blocker = manuscriptEditBlocker(owner, change.file)
      if (blocker) {
        failed.push({ id: change.id, reason: blocker })
        continue
      }
      let file = files.get(change.file)
      if (!file) {
        const original = await readRebuttalText(owner, change.file)
        file = { original, text: original }
        files.set(change.file, file)
      }
      const located = locatePaperChange(file.text, change.find)
      if (located.error !== undefined) {
        failed.push({ id: change.id, reason: `Not applied: ${located.error}` })
        continue
      }
      file.text = `${file.text.slice(0, located.start)}${change.replace}${file.text.slice(located.end)}`
      applied.add(change.id)
    }
    if (!applied.size) {
      return
    }
    for (const [path, file] of files) {
      if (file.text !== file.original) {
        await writeRebuttalText(owner, path, file.text, file.original)
      }
    }
    const decidedAt = new Date().toISOString()
    await writePaperChanges(
      snapshot,
      snapshot.paperChanges.map((entry) =>
        applied.has(entry.id) ? { ...entry, status: 'applied' as const, decidedAt } : entry
      )
    )
    const kept = new Set(
      chosen.flatMap((change) => (applied.has(change.id) && change.promise ? [change.promise] : []))
    )
    if (kept.size) {
      const promises = parsePromises(
        snapshot.bundle.promises.map((promise) =>
          kept.has(promise.id) ? { ...promise, done: true } : promise
        ),
        { clusterIds: snapshot.bundle.clusters.map((cluster) => cluster.id) }
      )
      await writeJson(
        snapshot,
        'promises.json',
        snapshot.texts.promises,
        promisesDocument(promises)
      )
    }
  })
  return failed
}

/** Applies one tracked change to the manuscript and marks its promise done. */
export async function approveRebuttalPaperChange(owner: RebuttalOwner, id: string): Promise<void> {
  const [failure] = await approveRebuttalPaperChanges(owner, [id])
  if (failure) {
    throw new Error(failure.reason)
  }
}

export async function rejectRebuttalPaperChange(owner: RebuttalOwner, id: string): Promise<void> {
  await withFreshSnapshot(owner, async (snapshot) => {
    await writePaperChanges(
      snapshot,
      snapshot.paperChanges.map((entry) =>
        entry.id === id
          ? { ...entry, status: 'rejected' as const, decidedAt: new Date().toISOString() }
          : entry
      )
    )
  })
}
