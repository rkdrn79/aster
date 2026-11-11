import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  appendVersion,
  parseProposals,
  predictionIsStale,
  proposalOutcome,
  replyAuthorAfterAccept,
  replyAuthorAfterHumanEdit,
  replyHash,
  withProposal
} from './research-rebuttal-records.mjs'
import { assembleAllReplies, rebuttalReadiness } from './research-rebuttal-assemble.mjs'
import { parseClusters, parsePoints } from './research-rebuttal-points.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')

function harness(project, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args, '--project', project, '--json'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, result: JSON.parse(stdout) }))
    child.stdin.end(input ?? '')
  })
}

async function withRebuttal(run) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-rebuttal-rec-')))
  try {
    await harness(project, ['rebuttal', 'new', '--name', 'ICLR 2027'])
    await harness(
      project,
      ['rebuttal', 'add-review', '--file', '-', '--rating', '4', '--confidence', '3'],
      'Weaknesses:\n- No comparison with DiffusionDet.\n- The loss ablation is missing.\n'
    )
    await harness(
      project,
      ['rebuttal', 'add-review', '--file', '-'],
      'DiffusionDet should be compared.\nWhat is tau?\n'
    )
    const points = [
      {
        id: 'R1-W1',
        kind: 'weakness',
        summary: 'No DiffusionDet',
        quote: 'No comparison with DiffusionDet.'
      },
      {
        id: 'R1-W2',
        kind: 'weakness',
        summary: 'Ablation',
        quote: 'The loss ablation is missing.'
      },
      {
        id: 'R2-W1',
        kind: 'weakness',
        summary: 'Compare',
        quote: 'DiffusionDet should be compared.'
      }
    ]
    await harness(project, ['rebuttal', 'points', 'set', '--file', '-'], JSON.stringify(points))
    await harness(
      project,
      ['rebuttal', 'clusters', 'set', '--file', '-'],
      JSON.stringify([
        { id: 'C1', title: 'DiffusionDet', points: ['R1-W1', 'R2-W1'], action: 'experiment' },
        { id: 'C2', title: 'Ablation', points: ['R1-W2'], action: 'text' }
      ])
    )
    await run(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const proposal = (fields) => ({
  id: 'X1',
  slot: 'C1',
  kind: 'replace',
  applied: false,
  base: 'old',
  text: 'new text',
  find: null,
  replace: null,
  turn: null,
  request: '',
  at: '',
  ...fields
})

test('an agent draft fills an empty reply, undoably', async () => {
  await withRebuttal(async (project) => {
    const drafted = await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-', '--turn', 't1'],
      'We added DiffusionDet.'
    )
    assert.equal(drafted.result.applied, true)
    assert.equal(drafted.result.cluster.response, 'We added DiffusionDet.')
    assert.equal(drafted.result.cluster.author, 'agent')
    assert.equal(drafted.result.cluster.status, 'drafting')
    const { result } = await harness(project, ['rebuttal', 'proposals', 'list'])
    assert.equal(result.proposals[0].applied, true)
    assert.equal(result.proposals[0].turn, 't1')
    const history = await harness(project, ['rebuttal', 'history', '--cluster', 'C1'])
    assert.equal(history.result.versions[0].what, 'Agent draft')
  })
})

async function askFirst(project) {
  const metaFile = path.join(project, '.aster/rebuttal/iclr-2027/rebuttal.json')
  const meta = JSON.parse(await readFile(metaFile, 'utf8'))
  await writeFile(metaFile, JSON.stringify({ ...meta, agentEdits: 'ask' }))
}

test('set to Ask first, an agent never replaces a reply that has text', async () => {
  await withRebuttal(async (project) => {
    await askFirst(project)
    const directory = path.join(project, '.aster/rebuttal/iclr-2027')
    const clustersFile = path.join(directory, 'clusters.json')
    const document = JSON.parse(await readFile(clustersFile, 'utf8'))
    document.clusters[0].response = 'My own careful words, typed by hand.'
    document.clusters[0].author = 'human'
    await writeFile(clustersFile, JSON.stringify(document))

    const attempt = await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-', '--request', 'Draft'],
      'Agent text.'
    )
    assert.equal(attempt.result.applied, false)
    assert.equal(attempt.result.pendingProposal, true)
    const after = JSON.parse(await readFile(clustersFile, 'utf8'))
    assert.equal(after.clusters[0].response, 'My own careful words, typed by hand.')
    assert.equal(after.clusters[0].author, 'human')
    const { result } = await harness(project, ['rebuttal', 'proposals', 'list'])
    assert.equal(result.proposals[0].base, 'My own careful words, typed by hand.')
    assert.equal(result.proposals[0].text, 'Agent text.')

    // The same text is no second proposal.
    const same = await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'],
      'My own careful words, typed by hand.'
    )
    assert.equal(same.result.unchanged, true)
  })
})

test('clusters set can regroup but cannot rewrite or smuggle reply text', async () => {
  await withRebuttal(async (project) => {
    const clustersFile = path.join(project, '.aster/rebuttal/iclr-2027/clusters.json')
    const document = JSON.parse(await readFile(clustersFile, 'utf8'))
    document.clusters[0].response = 'Typed by hand.'
    document.clusters[0].author = 'human'
    await writeFile(clustersFile, JSON.stringify(document))
    await harness(
      project,
      ['rebuttal', 'clusters', 'set', '--file', '-'],
      JSON.stringify([
        {
          id: 'C1',
          title: 'Renamed',
          points: ['R1-W1', 'R2-W1'],
          action: 'text',
          response: 'Agent smuggled text',
          author: 'agent'
        },
        { id: 'C2', title: 'Ablation', points: ['R1-W2'], action: 'text' }
      ])
    )
    const after = JSON.parse(await readFile(clustersFile, 'utf8'))
    assert.equal(after.clusters[0].title, 'Renamed')
    assert.equal(after.clusters[0].response, 'Typed by hand.')
    assert.equal(after.clusters[0].author, 'human')
  })
})

test('agent commands cannot remove a cluster or points that carry a written reply', async () => {
  await withRebuttal(async (project) => {
    const clustersFile = path.join(project, '.aster/rebuttal/iclr-2027/clusters.json')
    const document = JSON.parse(await readFile(clustersFile, 'utf8'))
    document.clusters[0].response = 'Typed by hand.'
    await writeFile(clustersFile, JSON.stringify(document))
    const dropped = await harness(
      project,
      ['rebuttal', 'clusters', 'set', '--file', '-'],
      JSON.stringify([{ id: 'C2', title: 'Ablation', points: ['R1-W2'], action: 'text' }])
    )
    assert.notEqual(dropped.code, 0)
    const points = await harness(project, ['rebuttal', 'points', 'list'])
    const withoutC1 = points.result.points
      .filter((point) => !['R1-W1', 'R2-W1'].includes(point.id))
      .map(({ cluster: _cluster, ...point }) => point)
    const removed = await harness(
      project,
      ['rebuttal', 'points', 'set', '--file', '-'],
      JSON.stringify(withoutC1)
    )
    assert.notEqual(removed.code, 0)
    const after = JSON.parse(await readFile(clustersFile, 'utf8'))
    assert.equal(after.clusters[0].response, 'Typed by hand.')
  })
})

test('only the person marks a reply Ready', async () => {
  await withRebuttal(async (project) => {
    const { code, result } = await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--status', 'done', '--file', '-'],
      'x'
    )
    assert.notEqual(code, 0)
    assert.match(result.error.message, /Ready/)
  })
})

test('set to Ask first, revise proposes a passage and refuses text that moved', async () => {
  await withRebuttal(async (project) => {
    await askFirst(project)
    await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'],
      'We added it. The AP is 45.'
    )
    const revised = await harness(
      project,
      ['rebuttal', 'response', 'revise', '--cluster', 'C1', '--file', '-', '--request', 'Shorter'],
      JSON.stringify({ find: 'We added it.', replace: 'Added.' })
    )
    assert.equal(revised.result.pendingProposal, true)
    const { result } = await harness(project, ['rebuttal', 'proposals', 'list'])
    const record = result.proposals.find((entry) => entry.slot === 'C1')
    assert.equal(record.kind, 'passage')
    assert.equal(record.text, 'Added. The AP is 45.')
    const missing = await harness(
      project,
      ['rebuttal', 'response', 'revise', '--cluster', 'C1', '--file', '-'],
      JSON.stringify({ find: 'Not there', replace: 'x' })
    )
    assert.notEqual(missing.code, 0)
  })
})

test('a passage proposal applies around later human edits; a replacement warns', () => {
  const passage = proposal({
    kind: 'passage',
    base: 'First sentence. Second sentence.',
    text: 'First sentence. Revised.',
    find: 'Second sentence.',
    replace: 'Revised.'
  })
  assert.deepEqual(proposalOutcome('First sentence. Second sentence.', passage), {
    mode: 'clean',
    text: 'First sentence. Revised.'
  })
  // The person kept typing before the passage: the revision still lands.
  assert.deepEqual(proposalOutcome('Edited first. Second sentence.', passage), {
    mode: 'clean',
    text: 'Edited first. Revised.'
  })
  assert.equal(proposalOutcome('Rewrote everything.', passage).mode, 'conflict')
  assert.equal(proposalOutcome('Second sentence. Second sentence.', passage).mode, 'conflict')
  const whole = proposal({ base: 'old', text: 'agent new' })
  assert.equal(proposalOutcome('old', whole).mode, 'clean')
  assert.equal(proposalOutcome('edited since', whole).mode, 'overwrites')
  assert.equal(proposalOutcome('agent new', whole).mode, 'clean')
})

test('a newer proposal replaces the pending one for that reply and keeps the old text', () => {
  const start = parseProposals([proposal({ slot: 'C1', text: 'one' })])
  const next = withProposal(start, {
    slot: 'C1',
    applied: false,
    base: 'old',
    text: 'two',
    at: 'now'
  })
  assert.equal(next.proposals.length, 1)
  assert.equal(next.proposals[0].id, 'X2')
  assert.equal(next.proposals[0].text, 'two')
  assert.equal(next.superseded[0].text, 'one')
})

test('authorship follows who actually changed the text', () => {
  assert.equal(replyAuthorAfterHumanEdit(null, '', 'hello'), 'human')
  assert.equal(replyAuthorAfterHumanEdit('human', 'a', 'ab'), 'human')
  assert.equal(replyAuthorAfterHumanEdit('agent', 'a', 'ab'), 'both')
  assert.equal(replyAuthorAfterHumanEdit('both', 'a', ''), null)
  assert.equal(replyAuthorAfterAccept('human'), 'both')
  assert.equal(replyAuthorAfterAccept(null), 'agent')
})

test('versions keep the latest forty and skip a repeat', () => {
  let versions = []
  versions = appendVersion(versions, { at: 'a', by: 'human', what: 'x', text: 'same' })
  versions = appendVersion(versions, { at: 'b', by: 'human', what: 'y', text: 'same' })
  assert.equal(versions.length, 1)
  for (let index = 0; index < 50; index += 1) {
    versions = appendVersion(versions, { at: 'c', by: 'agent', what: 'z', text: `t${index}` })
  }
  assert.equal(versions.length, 40)
  assert.equal(versions.at(-1).text, 't49')
})

test('a follow-up becomes a round with points quoted from it and its own reply', async () => {
  await withRebuttal(async (project) => {
    const added = await harness(
      project,
      ['rebuttal', 'followup', 'add', '--reviewer', 'R1', '--file', '-'],
      'Thanks. Please also report the variance across seeds.'
    )
    assert.equal(added.result.followUp.round, 2)
    const points = await harness(project, ['rebuttal', 'points', 'list'])
    const merged = [
      ...points.result.points.map(({ cluster: _cluster, ...point }) => point),
      {
        id: 'R1-Q1',
        kind: 'question',
        summary: 'Variance across seeds',
        quote: 'report the variance across seeds',
        round: 2
      }
    ]
    const saved = await harness(
      project,
      ['rebuttal', 'points', 'set', '--file', '-'],
      JSON.stringify(merged)
    )
    assert.equal(saved.code, 0)
    const assembled = await harness(project, ['rebuttal', 'assemble', '--format', 'reviewer'])
    const names = assembled.result.outputs.map((output) => path.basename(output.path))
    assert.deepEqual(names, ['reviewer-R1.md', 'reviewer-R2.md', 'reviewer-R1-round-2.md'])
    const bad = [
      ...merged.slice(0, 3),
      { id: 'R1-Q2', kind: 'question', quote: 'not in the follow-up', round: 2 }
    ]
    const rejected = await harness(
      project,
      ['rebuttal', 'points', 'set', '--file', '-'],
      JSON.stringify(bad)
    )
    assert.notEqual(rejected.code, 0)
  })
})

test('a reviewer context exposes the review, replies and score but changes nothing', async () => {
  await withRebuttal(async (project) => {
    await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'],
      'We added it.'
    )
    const { result } = await harness(project, ['rebuttal', 'reviewer-context', '--reviewer', 'R1'])
    assert.equal(result.reviewer.rating, '4')
    assert.equal(result.reviewer.confidence, '3')
    assert.match(result.review, /loss ablation/)
    assert.equal(result.replies.find((reply) => reply.cluster === 'C1').reply, 'We added it.')
    assert.ok(
      Array.isArray(result.otherThreads),
      'the other reviewers are visible, as in a discussion'
    )
    assert.ok(result.otherThreads.every((thread) => thread.reviewer !== 'R1'))
    assert.equal(result.outlook, null)
    assert.ok(Array.isArray(result.general.answers), 'the general response is visible too')
  })
})

test('predictions stay structured, decided ones stay on record, and edits mark them stale', async () => {
  await withRebuttal(async (project) => {
    await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'],
      'We added it.'
    )
    const input = {
      predictions: [
        {
          concern: 'Comparing at one epoch budget only',
          why: 'R1 asked for the closest prior work; one budget is thin.',
          likelihood: 'high',
          trigger: { cluster: 'C1', point: 'R1-W1', quote: 'We added it.' },
          preempt: 'Report the 36-epoch row too.'
        }
      ],
      outlook: { direction: 'same', note: 'Likely unchanged until the comparison is in.' }
    }
    const saved = await harness(
      project,
      ['rebuttal', 'predictions', 'set', '--reviewer', 'R1', '--file', '-'],
      JSON.stringify(input)
    )
    assert.equal(saved.result.predictions[0].id, 'R1-N1')
    assert.equal(saved.result.outlook.direction, 'same', 'saving shows the outlook it stored')
    const listed = await harness(project, ['rebuttal', 'predictions', 'list', '--reviewer', 'R1'])
    assert.equal(listed.result.predictions[0].stale, false)
    assert.equal(listed.result.outlooks[0].direction, 'same')

    const file = path.join(project, '.aster/rebuttal/iclr-2027/clusters.json')
    const document = JSON.parse(await readFile(file, 'utf8'))
    document.clusters[0].response = 'We added it and reran with three seeds.'
    await writeFile(file, JSON.stringify(document))
    const stale = await harness(project, ['rebuttal', 'predictions', 'list', '--reviewer', 'R1'])
    assert.equal(stale.result.predictions[0].stale, true)

    // A new batch replaces open predictions but never touches ones the person decided.
    const predictionsFile = path.join(project, '.aster/rebuttal/iclr-2027/predictions.json')
    const predicted = JSON.parse(await readFile(predictionsFile, 'utf8'))
    predicted.predictions[0].status = 'dismissed'
    await writeFile(predictionsFile, JSON.stringify(predicted))
    await harness(
      project,
      ['rebuttal', 'predictions', 'set', '--reviewer', 'R1', '--file', '-'],
      JSON.stringify([{ concern: 'Second', why: 'w', likelihood: 'low', preempt: 'p' }])
    )
    const next = await harness(project, ['rebuttal', 'predictions', 'list', '--reviewer', 'R1'])
    assert.deepEqual(
      next.result.predictions.map((p) => [p.id, p.status]),
      [
        ['R1-N1', 'dismissed'],
        ['R1-N2', 'open']
      ]
    )
    const invalid = await harness(
      project,
      ['rebuttal', 'predictions', 'set', '--reviewer', 'R1', '--file', '-'],
      JSON.stringify([{ concern: 'x', why: 'y', likelihood: 'very high', preempt: 'p' }])
    )
    assert.notEqual(invalid.code, 0)
  })
})

test('stale predictions come from the reply, not the clock', () => {
  const bundle = {
    points: [{ id: 'R1-W1', reviewer: 'R1' }],
    clusters: [{ id: 'C1', points: ['R1-W1'], response: 'answer' }]
  }
  const prediction = {
    status: 'open',
    reviewer: 'R1',
    trigger: { cluster: 'C1', point: null, quote: null },
    basis: replyHash('answer')
  }
  assert.equal(predictionIsStale(bundle, prediction), false)
  assert.equal(
    predictionIsStale(
      { ...bundle, clusters: [{ ...bundle.clusters[0], response: 'answer, longer' }] },
      prediction
    ),
    true
  )
  // A reflow is not a change.
  assert.equal(
    predictionIsStale(
      { ...bundle, clusters: [{ ...bundle.clusters[0], response: 'answer ' }] },
      prediction
    ),
    false
  )
})

test('a paper change is validated against the manuscript and links a promise', async () => {
  await withRebuttal(async (project) => {
    await mkdir(path.join(project, 'paper'), { recursive: true })
    await writeFile(path.join(project, 'paper/main.tex'), 'Section 3.\nWe use a noise schedule.\n')
    const proposed = await harness(
      project,
      ['rebuttal', 'paper', 'propose', '--cluster', 'C2', '--file', '-'],
      JSON.stringify({
        file: 'paper/main.tex',
        find: 'We use a noise schedule.',
        replace: 'We use a cosine noise schedule (Eq. 2).',
        why: 'R2 said the schedule is undefined.',
        promise: 'Define the noise schedule in Section 3.'
      })
    )
    assert.equal(proposed.result.change.status, 'pending')
    assert.equal(proposed.result.change.promise, 'P1')
    const promises = await harness(project, ['rebuttal', 'promises', 'list'])
    assert.deepEqual(promises.result.promises[0].clusters, ['C2'])
    const missing = await harness(
      project,
      ['rebuttal', 'paper', 'propose', '--cluster', 'C2', '--file', '-'],
      JSON.stringify({ file: 'paper/main.tex', find: 'not in the file', replace: 'x', why: 'y' })
    )
    assert.notEqual(missing.code, 0)
  })
})

test('a prediction turned into a concern joins the reply as anticipated', () => {
  const reviewers = [
    {
      id: 'R1',
      label: '',
      rating: null,
      confidence: null,
      source: 'paste',
      noteId: null,
      opening: ''
    }
  ]
  const points = parsePoints(
    [
      { id: 'R1-W1', kind: 'weakness', quote: 'Baseline missing.' },
      {
        id: 'R1-W2',
        kind: 'weakness',
        origin: 'prediction',
        fromPrediction: 'R1-N1',
        summary: 'Runtime on real hardware',
        quote: ''
      }
    ],
    { reviewers, reviews: { R1: 'Baseline missing.' } }
  )
  assert.equal(points[1].origin, 'prediction')
  assert.deepEqual(
    points.map((point) => point.id),
    ['R1-W1', 'R1-W2'],
    "a predicted concern goes after the reviewer's own concerns"
  )
  const clusters = parseClusters(
    [
      { id: 'C1', title: 'Baseline', points: ['R1-W1'], action: 'clarify', response: 'Added.' },
      { id: 'C2', title: 'Runtime', points: ['R1-W2'], action: 'clarify', response: 'We timed it.' }
    ],
    { pointIds: ['R1-W1', 'R1-W2'] }
  )
  const bundle = {
    meta: {
      reviewers,
      general: { intro: '', closing: '' },
      limits: { replyChars: 5000, generalChars: 5000, pdfPages: 1 },
      assembly: { shared: 'reviewer' }
    },
    points,
    clusters,
    promises: []
  }
  const [reply] = assembleAllReplies(bundle)
  assert.match(reply.text, /A2 \(anticipated\): Runtime/)
  assert.equal(rebuttalReadiness(bundle).replies[0].round, 1)
})
