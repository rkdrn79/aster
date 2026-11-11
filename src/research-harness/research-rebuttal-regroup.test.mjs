import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { planRegroup, regroupPhrases, suppliedReplies } from './research-rebuttal-regroup.mjs'
import {
  changedSinceRegroup,
  regroupRecord,
  stateAfterPlan,
  stateBeforeRegroup,
  stateWithArchivedRestored
} from './research-rebuttal-regroup-records.mjs'

const point = (id) => ({
  id,
  reviewer: id.slice(0, 2),
  summary: id,
  quote: `${id} quote`,
  round: 1
})
const cluster = (id, points, response = '', extra = {}) => ({
  id,
  title: `Group ${id}`,
  points,
  action: 'clarify',
  status: response ? 'drafting' : 'todo',
  plan: '',
  experiment: null,
  manuscript: null,
  response,
  author: response ? 'human' : null,
  general: false,
  ...extra
})

function state() {
  return {
    points: ['R1-W1', 'R1-W2', 'R2-W1', 'R2-W2'].map(point),
    clusters: [
      cluster('C1', ['R1-W1'], 'We added the baseline.'),
      cluster('C2', ['R2-W1'], 'The baseline is in Table 2.', { author: 'agent' }),
      cluster('C3', ['R1-W2', 'R2-W2'], 'Both ablations are in the appendix.'),
      cluster('C4', [])
    ].filter((entry) => entry.points.length),
    promises: [{ id: 'P1', text: 'Add the row', clusters: ['C2'], done: false }],
    paperChanges: [{ id: 'E1', cluster: 'C2', file: 'paper/main.tex', status: 'pending' }],
    predictions: [{ id: 'R2-N1', trigger: { cluster: 'C2', point: null, quote: null } }],
    proposals: [{ id: 'X1', slot: 'C2', applied: false, text: 'A waiting suggestion.' }],
    translations: [
      { key: 'reply:C1', language: 'ko', hash: 'h', text: '기준선을 추가했습니다.', at: '' }
    ],
    regroups: [],
    archive: []
  }
}

const groups = (entries) =>
  entries.map(([id, points]) => ({ id, title: `Group ${id}`, points, action: 'clarify' }))
const byId = (clusters, id) => clusters.find((entry) => entry.id === id)

test('merging joins the replies in order and keeps each earlier reply as a version', () => {
  const before = state()
  const plan = planRegroup(before, {
    clusters: groups([
      ['C1', ['R1-W1', 'R2-W1']],
      ['C3', ['R1-W2', 'R2-W2']]
    ])
  })
  const merged = byId(plan.clusters, 'C1')
  assert.equal(merged.response, 'We added the baseline.\n\nThe baseline is in Table 2.')
  assert.equal(merged.author, 'both')
  assert.deepEqual(regroupPhrases(plan.summary), ['merged C2 into C1 (replies joined)'])
  assert.deepEqual(
    plan.versions.map((version) => [version.slot, version.what, version.text]),
    [
      ['C1', 'Before the regroup', 'We added the baseline.'],
      ['C1', "C2's reply before it moved into C1", 'The baseline is in Table 2.'],
      ['C1', 'Joined replies of C1, C2', merged.response],
      ['C2', 'Suggestion set aside by a regroup', 'A waiting suggestion.']
    ]
  )
  // Links follow the surviving group.
  assert.deepEqual(plan.promises[0].clusters, ['C1'])
  assert.equal(plan.paperChanges[0].cluster, 'C1')
  assert.equal(plan.predictions[0].trigger.cluster, 'C1')
  assert.deepEqual(plan.proposals, [])
  assert.equal(plan.touchesWritten, true)
})

test('a merged reply the agent sends is used, and the replies it replaces are kept', () => {
  const input = groups([
    ['C1', ['R1-W1', 'R2-W1']],
    ['C3', ['R1-W2', 'R2-W2']]
  ])
  input[0].response = 'One answer for both: the baseline is in Table 2.'
  const plan = planRegroup(state(), { clusters: input, supplied: suppliedReplies(input) })
  assert.equal(
    byId(plan.clusters, 'C1').response,
    'One answer for both: the baseline is in Table 2.'
  )
  assert.ok(plan.versions.some((version) => version.text === 'The baseline is in Table 2.'))
  assert.deepEqual(regroupPhrases(plan.summary), ['merged C2 into C1'])
})

test('a split keeps the reply with the group that keeps the ID, or with the first part', () => {
  const kept = planRegroup(state(), {
    clusters: groups([
      ['C1', ['R1-W1']],
      ['C2', ['R2-W1']],
      ['C3', ['R1-W2']],
      ['C5', ['R2-W2']]
    ])
  })
  assert.equal(byId(kept.clusters, 'C3').response, 'Both ablations are in the appendix.')
  assert.equal(byId(kept.clusters, 'C5').response, '')
  assert.deepEqual(regroupPhrases(kept.summary), ['split C3 into C3 and C5'])
  const renamed = planRegroup(state(), {
    clusters: groups([
      ['C1', ['R1-W1']],
      ['C2', ['R2-W1']],
      ['C6', ['R1-W2']],
      ['C7', ['R2-W2']]
    ])
  })
  assert.equal(byId(renamed.clusters, 'C6').response, 'Both ablations are in the appendix.')
  assert.equal(byId(renamed.clusters, 'C6').status, 'drafting')
  assert.equal(byId(renamed.clusters, 'C7').response, '')
})

test('a group with a reply and nowhere to go is archived, then restored in one step', () => {
  const before = state()
  const plan = planRegroup(before, {
    clusters: groups([
      ['C1', ['R1-W1']],
      ['C3', ['R1-W2', 'R2-W2']]
    ])
  })
  assert.deepEqual(plan.summary.removed, ['C2'])
  assert.equal(plan.archive[0].cluster.response, 'The baseline is in Table 2.')
  assert.deepEqual(
    plan.archive[0].paperChanges.map((change) => change.id),
    ['E1']
  )
  assert.equal(plan.predictions[0].trigger.cluster, null)
  const after = stateAfterPlan(before, plan, null)
  assert.equal(after.archive[0].id, 'A1')
  const restored = stateWithArchivedRestored(after, 'A1')
  assert.equal(byId(restored.clusters, 'C2').response, 'The baseline is in Table 2.')
  assert.equal(restored.paperChanges.find((change) => change.id === 'E1').cluster, 'C2')
  assert.deepEqual(restored.archive, [])
})

test('Undo restores the exact groups, points, links and translations, unless edited since', () => {
  const before = state()
  const plan = planRegroup(before, {
    clusters: groups([
      ['C1', ['R1-W1', 'R2-W1']],
      ['C3', ['R1-W2', 'R2-W2']]
    ])
  })
  const record = regroupRecord(before, plan, {
    id: 'G1',
    at: 'now',
    applied: true,
    change: { clusters: [] }
  })
  const after = stateAfterPlan(before, plan, record)
  assert.deepEqual(changedSinceRegroup(after, record), [])
  const undone = stateBeforeRegroup({ ...after, translations: [] }, record)
  assert.deepEqual(undone.clusters, before.clusters)
  assert.deepEqual(undone.promises, before.promises)
  assert.deepEqual(undone.paperChanges, before.paperChanges)
  assert.deepEqual(undone.predictions, before.predictions)
  assert.deepEqual(undone.proposals, before.proposals)
  assert.deepEqual(
    undone.translations.map((entry) => entry.text),
    ['기준선을 추가했습니다.']
  )
  assert.deepEqual(undone.regroups, [])
  const edited = {
    ...after,
    clusters: after.clusters.map((entry) =>
      entry.id === 'C1' ? { ...entry, response: `${entry.response} Edited.` } : entry
    )
  }
  assert.deepEqual(changedSinceRegroup(edited, record), ['C1'])
})

test('dropping points empties a written group into the archive, and Undo brings the points back', () => {
  const before = state()
  const points = before.points.filter((entry) => entry.id !== 'R2-W1')
  const plan = planRegroup(before, { points })
  assert.deepEqual(plan.summary.removed, ['C2'])
  assert.deepEqual(
    plan.archive[0].points.map((entry) => entry.id),
    ['R2-W1']
  )
  const record = regroupRecord(before, plan, { id: 'G1', at: '', applied: true, change: {} })
  const undone = stateBeforeRegroup(stateAfterPlan(before, plan, record), record)
  assert.deepEqual(undone.points, before.points)
  assert.deepEqual(undone.clusters, before.clusters)
  assert.deepEqual(undone.archive, [])
})

test('regrouping only empty groups is a plain change, not a regroup', () => {
  const before = state()
  before.clusters = before.clusters.map((entry) => ({ ...entry, response: '', author: null }))
  const plan = planRegroup(before, { clusters: groups([['C1', ['R1-W1', 'R2-W1']]]) })
  assert.equal(plan.touchesWritten, false)
})

// -- Through the CLI -----------------------------------------------------------------------------

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
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-regroup-')))
  try {
    await harness(project, ['rebuttal', 'new', '--name', 'ICLR 2027'])
    await harness(
      project,
      ['rebuttal', 'add-review', '--file', '-'],
      'No baseline.\nNo ablation.\n'
    )
    await harness(project, ['rebuttal', 'add-review', '--file', '-'], 'Baseline missing.\n')
    await harness(
      project,
      ['rebuttal', 'points', 'set', '--file', '-'],
      JSON.stringify([
        { id: 'R1-W1', kind: 'weakness', summary: 'Baseline', quote: 'No baseline.' },
        { id: 'R1-W2', kind: 'weakness', summary: 'Ablation', quote: 'No ablation.' },
        { id: 'R2-W1', kind: 'weakness', summary: 'Baseline', quote: 'Baseline missing.' }
      ])
    )
    await harness(
      project,
      ['rebuttal', 'clusters', 'set', '--file', '-'],
      JSON.stringify(
        groups([
          ['C1', ['R1-W1']],
          ['C2', ['R2-W1']],
          ['C3', ['R1-W2']]
        ])
      )
    )
    for (const [id, text] of [
      ['C1', 'We added the baseline.'],
      ['C2', 'Table 2 has it.']
    ]) {
      await harness(project, ['rebuttal', 'response', 'set', '--cluster', id, '--file', '-'], text)
    }
    await run(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const readJson = async (project, name) =>
  JSON.parse(await readFile(path.join(project, directory, name), 'utf8'))

test('clusters set merges groups with written replies and records one undoable regroup', async () => {
  await withRebuttal(async (project) => {
    await harness(
      project,
      ['rebuttal', 'translate', 'set', '--language', 'ko', '--file', '-'],
      JSON.stringify({ items: [{ key: 'reply:C1', text: '기준선을 추가했습니다.' }] })
    )
    const merged = await harness(
      project,
      ['rebuttal', 'clusters', 'set', '--file', '-', '--request', 'Merge duplicates'],
      JSON.stringify(
        groups([
          ['C1', ['R1-W1', 'R2-W1']],
          ['C3', ['R1-W2']]
        ])
      ),
      { json: false }
    )
    assert.match(
      merged.result,
      /^Regrouped \(G1\): merged C2 into C1 \(replies joined\)\. No written text was lost/
    )
    const { clusters } = await readJson(project, 'clusters.json')
    assert.equal(clusters[0].response, 'We added the baseline.\n\nTable 2 has it.')
    const { regroups } = await readJson(project, 'regroups.json')
    assert.equal(regroups[0].request, 'Merge duplicates')
    assert.equal(regroups[0].applied, true)
    const history = await harness(project, ['rebuttal', 'history', '--cluster', 'C1'])
    assert.ok(history.result.versions.some((version) => version.text === 'Table 2 has it.'))
    const todo = await harness(project, [
      'rebuttal',
      'translate',
      'list',
      '--language',
      'ko',
      '--todo'
    ])
    assert.equal(todo.result.items.find((item) => item.key === 'reply:C1').status, 'outdated')
  })
})

test('points set may drop a written group: its reply goes to the archive', async () => {
  await withRebuttal(async (project) => {
    const dropped = await harness(
      project,
      ['rebuttal', 'points', 'set', '--reviewer', 'R2', '--file', '-'],
      JSON.stringify([])
    )
    assert.deepEqual(dropped.result.removedClusters, ['C2'])
    assert.deepEqual(dropped.result.regroup.summary.removed, ['C2'])
    const { archive } = await readJson(project, 'regroups.json')
    assert.equal(archive[0].cluster.response, 'Table 2 has it.')
    assert.equal(archive[0].points[0].id, 'R2-W1')
  })
})

test('a replaced review drops stale points even when set to Ask first', async () => {
  await withRebuttal(async (project) => {
    const metaFile = path.join(project, directory, 'rebuttal.json')
    const meta = JSON.parse(await readFile(metaFile, 'utf8'))
    await writeFile(metaFile, JSON.stringify({ ...meta, agentEdits: 'ask' }))
    const replaced = await harness(
      project,
      ['rebuttal', 'add-review', '--reviewer', 'R2', '--force', '--file', '-'],
      'Something else entirely.\n'
    )
    assert.equal(replaced.code, 0)
    const { archive } = await readJson(project, 'regroups.json')
    assert.equal(archive[0].cluster.id, 'C2')
  })
})
