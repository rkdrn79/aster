import { realpath } from 'node:fs/promises'
import { HarnessError } from './research-harness-error.mjs'
import { resolveRunReference } from './research-run-manifest.mjs'
import { annotateRun, noteText, storedNotes, updateSummary } from './research-run-summary.mjs'

/**
 * A note typed into Aster's Run inspector. Why the empty env: Aster itself may have been
 * started from an agent's terminal, yet the person typing in its UI is the user.
 */
export async function addUserRunNote(projectPath, { run, text }) {
  const result = await annotateRun(projectPath, { run, text, by: 'user' }, { env: {} })
  return { ref: result.ref, notes: result.notes }
}

/** Rewrites one of the user's own notes, found by its timestamp; agent notes stay untouched. */
async function changeUserNote(projectPath, { run: reference, at }, change) {
  const project = await realpath(projectPath)
  const run = await resolveRunReference(project, reference)
  const summary = await updateSummary(run, (current) => {
    const notes = storedNotes(current?.notes)
    const index = notes.findIndex((note) => note.at === at && note.by === 'user')
    if (!current || index === -1) {
      throw new HarnessError('not_found', `${run.ref} has no note of yours from ${at}`)
    }
    return { ...current, notes: change(notes, index) }
  })
  return { ref: run.ref, notes: summary.notes }
}

export async function editUserRunNote(projectPath, input) {
  const text = noteText(input.text)
  return changeUserNote(projectPath, input, (notes, index) =>
    notes.map((note, position) => (position === index ? { ...note, text } : note))
  )
}

export async function deleteUserRunNote(projectPath, input) {
  return changeUserNote(projectPath, input, (notes, index) =>
    notes.filter((_, position) => position !== index)
  )
}
