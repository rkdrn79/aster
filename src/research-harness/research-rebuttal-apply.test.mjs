import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { parseRebuttalMeta } from './research-rebuttal-model.mjs'

// Agent edits land in the reply by default; written text is always kept as a version first.

const cli = path.join(import.meta.dirname, 'cli.mjs')
const directory = '.aster/rebuttal/iclr-2027'

function harness(project, args, input, { json = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cli, ...args, '--project', project, ...(json ? ['--json'] : [])],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    )
    let stdout = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, result: json ? JSON.parse(stdout) : stdout }))
    child.stdin.end(input ?? '')
  })
}

async function withRebuttal(run) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-rebuttal-apply-')))
  try {
    await harness(project, ['rebuttal', 'new', '--name', 'ICLR 2027'])
    await harness(
      project,
      ['rebuttal', 'add-review', '--file', '-'],
      'No DiffusionDet comparison.\n'
    )
    await harness(
      project,
      ['rebuttal', 'points', 'set', '--file', '-'],
      JSON.stringify([
        { id: 'R1-W1', kind: 'weakness', summary: 'Baseline', quote: 'No DiffusionDet comparison.' }
      ])
    )
    await harness(
      project,
      ['rebuttal', 'clusters', 'set', '--file', '-'],
      JSON.stringify([{ id: 'C1', title: 'Baseline', points: ['R1-W1'], action: 'experiment' }])
    )
    await run(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

async function editFile(project, name, change) {
  const file = path.join(project, directory, name)
  await writeFile(file, JSON.stringify(change(JSON.parse(await readFile(file, 'utf8')))))
}

async function typeByHand(project, text) {
  await editFile(project, 'clusters.json', (document) => {
    document.clusters[0].response = text
    document.clusters[0].author = 'human'
    return document
  })
}

const reply = async (project) =>
  JSON.parse(await readFile(path.join(project, directory, 'clusters.json'), 'utf8')).clusters[0]
const proposals = async (project) =>
  (await harness(project, ['rebuttal', 'proposals', 'list'])).result.proposals
const versions = async (project) =>
  (await harness(project, ['rebuttal', 'history', '--cluster', 'C1'])).result.versions

test('a new rebuttal applies agent edits directly; older files read as Apply directly', () => {
  const meta = parseRebuttalMeta({ schemaVersion: 1, slug: 'x', name: 'X' })
  assert.equal(meta.agentEdits, 'apply')
  assert.equal(parseRebuttalMeta({ ...meta, agentEdits: 'ask' }).agentEdits, 'ask')
  assert.throws(() => parseRebuttalMeta({ ...meta, agentEdits: 'sometimes' }), /agentEdits/)
})

test('an agent edit lands in a reply that has text, after keeping that text as a version', async () => {
  await withRebuttal(async (project) => {
    await typeByHand(project, 'My own careful words.')
    const edited = await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-', '--turn', 't1'],
      'Agent words with numbers.'
    )
    assert.equal(edited.result.applied, true)
    assert.equal(edited.result.edited, true)
    const after = await reply(project)
    assert.equal(after.response, 'Agent words with numbers.')
    assert.equal(after.author, 'both')
    const [record] = await proposals(project)
    assert.equal(record.applied, true)
    assert.equal(record.base, 'My own careful words.')
    assert.equal(record.turn, 't1')
    const kept = await versions(project)
    assert.deepEqual(
      kept.map((version) => [version.by, version.what, version.text]),
      [
        ['human', 'Before the agent edit', 'My own careful words.'],
        ['agent', 'Agent edit', 'Agent words with numbers.']
      ]
    )
  })
})

test('a second unreviewed edit keeps the first base, so one undo returns to the person text', async () => {
  await withRebuttal(async (project) => {
    await typeByHand(project, 'Mine.')
    await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'],
      'One.'
    )
    await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'],
      'Two.'
    )
    const all = await proposals(project)
    assert.equal(all.length, 1)
    assert.equal(all[0].base, 'Mine.')
    assert.equal(all[0].text, 'Two.')
    assert.ok((await versions(project)).some((version) => version.text === 'One.'))
  })
})

test('a revised passage applies directly and records what it replaced', async () => {
  await withRebuttal(async (project) => {
    await typeByHand(project, 'We added it. The AP is 45.')
    const revised = await harness(
      project,
      ['rebuttal', 'response', 'revise', '--cluster', 'C1', '--file', '-', '--request', 'Shorter'],
      JSON.stringify({ find: 'We added it.', replace: 'Added.' })
    )
    assert.equal(revised.result.applied, true)
    assert.equal((await reply(project)).response, 'Added. The AP is 45.')
    const [record] = await proposals(project)
    assert.equal(record.kind, 'passage')
    assert.equal(record.base, 'We added it. The AP is 45.')
    assert.equal((await versions(project)).at(-1).what, 'Agent edit: Shorter')
  })
})

test('the CLI tells the agent its edit applied and can be undone, or that it waits', async () => {
  await withRebuttal(async (project) => {
    await typeByHand(project, 'Mine.')
    const applied = await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'],
      'Theirs.',
      { json: false }
    )
    assert.match(applied.result, /^Edited C1 \(X1\).*undo/s)
    await editFile(project, 'rebuttal.json', (meta) => ({ ...meta, agentEdits: 'ask' }))
    const held = await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'],
      'Third.',
      { json: false }
    )
    assert.match(held.result, /^Proposed X2 for C1: this rebuttal is set to Ask first/)
    assert.equal((await reply(project)).response, 'Theirs.')
  })
})
