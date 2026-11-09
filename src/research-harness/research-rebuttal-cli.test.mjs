import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

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

async function withProject(run) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-rebuttal-')))
  try {
    await run(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const R1 = 'Weaknesses:\n- No comparison with DiffusionDet.\n- The loss ablation is missing.\n'
const R2 = 'DiffusionDet should be compared.\nWhat is tau?\n'

test('a rebuttal goes from pasted reviews to assembled replies through the CLI', async () => {
  await withProject(async (project) => {
    const created = await harness(project, [
      'rebuttal',
      'new',
      '--name',
      'ICLR 2027',
      '--reply-limit',
      '500'
    ])
    assert.equal(created.result.path, '.aster/rebuttal/iclr-2027')
    assert.equal(
      (await harness(project, ['rebuttal', 'add-review', '--file', '-'], R1)).result.reviewer.id,
      'R1'
    )
    const second = await harness(
      project,
      ['rebuttal', 'add-review', '--file', '-', '--label', 'Reviewer Xy12'],
      R2
    )
    assert.equal(second.result.reviewer.id, 'R2')
    assert.equal(await readFile(path.join(project, second.result.path), 'utf8'), R2)

    const points = [
      {
        id: 'R1-W1',
        kind: 'weakness',
        type: 'experiment-request',
        quote: 'No comparison with DiffusionDet.'
      },
      { id: 'R1-W2', kind: 'weakness', type: 'soundness', quote: 'The loss ablation is missing.' },
      {
        id: 'R2-W1',
        kind: 'weakness',
        type: 'experiment-request',
        quote: 'DiffusionDet should be compared.'
      },
      { id: 'R2-Q1', kind: 'question', type: 'clarity', quote: 'What is tau?' }
    ]
    const set = await harness(
      project,
      ['rebuttal', 'points', 'set', '--file', '-'],
      JSON.stringify({ points })
    )
    assert.equal(set.code, 0)
    assert.deepEqual(
      set.result.points.map((point) => [point.id, point.start]),
      [
        ['R1-W1', 14],
        ['R1-W2', 49],
        ['R2-W1', 0],
        ['R2-Q1', 33]
      ]
    )
    const clusters = [
      {
        id: 'C1',
        title: 'DiffusionDet baseline',
        points: ['R1-W1', 'R2-W1'],
        action: 'experiment'
      },
      { id: 'C2', title: 'Loss ablation', points: ['R1-W2'], action: 'experiment' }
    ]
    const grouped = await harness(
      project,
      ['rebuttal', 'clusters', 'set', '--file', '-'],
      JSON.stringify(clusters)
    )
    assert.deepEqual(grouped.result.unclustered, ['R2-Q1'])
    const drafted = await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'],
      'We added it: 45.1 AP.\n'
    )
    assert.equal(drafted.result.cluster.status, 'drafting')
    assert.equal(drafted.result.cluster.response, 'We added it: 45.1 AP.')
    await harness(project, [
      'rebuttal',
      'promises',
      'add',
      '--text',
      'Add it to Table 2',
      '--cluster',
      'C1'
    ])

    const assembled = await harness(project, ['rebuttal', 'assemble'])
    assert.equal(assembled.code, 0)
    const reply = assembled.result.outputs.find((output) => output.reviewer === 'R2')
    assert.equal(reply.path, '.aster/rebuttal/iclr-2027/responses/reviewer-R2.md')
    const text = await readFile(path.join(project, reply.path), 'utf8')
    assert.equal(
      text,
      '**A1 (W1): DiffusionDet baseline**\nPlease see our response to R1 (A1).\n\n**A2 (Q1)**\n[No response yet: R2-Q1]\n'
    )
    assert.equal(reply.chars, text.length - 1)
    assert.ok(assembled.result.outputs.some((output) => output.path.endsWith('rebuttal.tex')))
    assert.deepEqual(assembled.result.readiness.undrafted, ['C2'])

    const long = await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C2', '--file', '-'],
      'x'.repeat(600)
    )
    assert.equal(long.code, 0)
    const over = await harness(project, ['rebuttal', 'assemble', '--format', 'reviewer'])
    assert.equal(over.code, 1)
    assert.equal(over.result.outputs.find((output) => output.reviewer === 'R1').over, true)
  })
})

test('replacing points drops removed ones from clusters, and bad input is refused', async () => {
  await withProject(async (project) => {
    await harness(project, ['rebuttal', 'new', '--name', 'NeurIPS'])
    await harness(project, ['rebuttal', 'add-review', '--file', '-'], R1)
    const both = [
      { id: 'R1-W1', kind: 'weakness', quote: 'No comparison with DiffusionDet.' },
      { id: 'R1-W2', kind: 'weakness', quote: 'The loss ablation is missing.' }
    ]
    await harness(project, ['rebuttal', 'points', 'set', '--file', '-'], JSON.stringify(both))
    await harness(
      project,
      ['rebuttal', 'clusters', 'set', '--file', '-'],
      JSON.stringify([{ id: 'C1', title: 'All', points: ['R1-W1', 'R1-W2'], action: 'text' }])
    )
    const narrowed = await harness(
      project,
      ['rebuttal', 'points', 'set', '--reviewer', 'R1', '--file', '-'],
      JSON.stringify([both[0]])
    )
    assert.deepEqual(narrowed.result.droppedFromClusters, ['R1-W2'])
    assert.deepEqual(
      (await harness(project, ['rebuttal', 'clusters', 'list'])).result.clusters[0].points,
      ['R1-W1']
    )

    const missing = await harness(
      project,
      ['rebuttal', 'points', 'set', '--file', '-'],
      JSON.stringify([{ id: 'R1-W1', kind: 'weakness', quote: 'nowhere' }])
    )
    assert.equal(missing.code, 1)
    assert.equal(missing.result.error.code, 'invalid_argument')
    const malformed = await harness(project, ['rebuttal', 'clusters', 'set', '--file', '-'], '{')
    assert.equal(malformed.result.error.code, 'invalid_json')
    const changed = await harness(
      project,
      ['rebuttal', 'add-review', '--reviewer', 'R1', '--file', '-'],
      'A different review.'
    )
    assert.equal(changed.result.error.code, 'conflict')
    await writeFile(path.join(project, 'r1.md'), 'A different review.')
    const forced = await harness(project, [
      'rebuttal',
      'add-review',
      '--reviewer',
      'R1',
      '--file',
      path.join(project, 'r1.md'),
      '--force'
    ])
    assert.deepEqual(forced.result.droppedPoints, ['R1-W1'])
    assert.deepEqual(forced.result.removedClusters, ['C1'])
  })
})

test('--rebuttal is needed once a project has two rebuttals', async () => {
  await withProject(async (project) => {
    await harness(project, ['rebuttal', 'new', '--name', 'Round 1'])
    assert.equal((await harness(project, ['rebuttal', 'show'])).result.rebuttal.slug, 'round-1')
    await harness(project, ['rebuttal', 'new', '--name', 'Round 2'])
    const ambiguous = await harness(project, ['rebuttal', 'show'])
    assert.equal(ambiguous.result.error.code, 'usage')
    assert.match(ambiguous.result.error.message, /round-1, round-2/)
    assert.equal((await harness(project, ['rebuttal', 'list'])).result.rebuttals.length, 2)
    const duplicate = await harness(project, ['rebuttal', 'new', '--name', 'Round 1'])
    assert.equal(duplicate.result.error.code, 'already_exists')
  })
})
