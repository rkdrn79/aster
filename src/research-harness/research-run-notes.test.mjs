import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createExperiment, createRun, initializeResearchProject } from './research-project.mjs'
import { addUserRunNote, deleteUserRunNote, editUserRunNote } from './research-run-notes.mjs'
import { annotateRun } from './research-run-summary.mjs'

test('the user adds, edits and deletes their own Run notes; agent notes stay', async () => {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-notes-')))
  try {
    await initializeResearchProject(project)
    await createExperiment(project, 'Main')
    const run = await createRun(project, { experiment: 'main', name: 'r', id: 'r' })
    await annotateRun(
      project,
      { run: 'main/r', text: 'agent saw a spike' },
      { env: { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 's' } }
    )
    // An agent environment in Aster's own process must not turn the user's note into a refusal.
    const added = await addUserRunNote(project, { run: 'main/r', text: '  lr too high?  ' })
    assert.deepEqual(
      added.notes.map((note) => [note.by, note.text]),
      [
        ['agent', 'agent saw a spike'],
        ['user', 'lr too high?']
      ]
    )
    const mine = added.notes[1]
    const agents = added.notes[0]

    const edited = await editUserRunNote(project, { run: 'main/r', at: mine.at, text: 'lr 1e-3' })
    assert.equal(edited.notes[1].text, 'lr 1e-3')
    await assert.rejects(
      editUserRunNote(project, { run: 'main/r', at: agents.at, text: 'rewritten' }),
      /no note of yours/
    )
    await assert.rejects(editUserRunNote(project, { run: 'main/r', at: mine.at, text: ' ' }))

    await deleteUserRunNote(project, { run: 'main/r', at: mine.at })
    const stored = JSON.parse(await readFile(path.join(run.paths.run, 'summary.json'), 'utf8'))
    assert.deepEqual(
      stored.notes.map((note) => note.text),
      ['agent saw a spike']
    )
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})
