import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { checkWriting } from './research-writing-check.mjs'

// Rules from the writing bench, where the agent wrote inside the full manuscript: claims swept
// over the whole evaluation, padding past the slot's length, markdown, run-in labels and lists.
// The naive sentences are from runs/naive (Claude Opus 5.5 at effort xhigh).

async function check(text, section) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-writing-shape-')))
  try {
    await mkdir(path.join(root, 'paper'))
    await writeFile(path.join(root, 'paper', 'section.tex'), text)
    return await checkWriting(root, { file: 'paper/section.tex', section })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function findings(result) {
  return result.sections.flatMap((section) =>
    ['errors', 'warnings', 'notes'].flatMap((level) =>
      section[level].map((finding) => ({ ...finding, level }))
    )
  )
}

const levelsOf = (result, code) =>
  findings(result)
    .filter((finding) => finding.code === code)
    .map((finding) => finding.level)

const WORDS = ['cache', 'token', 'layer', 'model', 'score', 'input', 'value', 'query', 'block']
const filler = (count) => Array.from({ length: count }, (_, index) => WORDS[index % 9]).join(' ')

test('WC-SWEEP: a claim over every baseline and task without saying how many', async () => {
  const naive = await check(
    'ACT outperforms all baselines on every subtask of every task.',
    'intro'
  )
  assert.deepEqual(levelsOf(naive, 'WC-SWEEP'), ['warnings'])
  const counted = await check(
    'ACT outperforms all three baselines on 14 of the 16 subtasks we ran.',
    'intro'
  )
  assert.deepEqual(levelsOf(counted, 'WC-SWEEP'), [])
  const setup = await check(
    'We train all models for 2,000 epochs with the same schedule.',
    'experiments'
  )
  assert.deepEqual(levelsOf(setup, 'WC-SWEEP'), [])
  const tabled = await check(
    'Table~\\ref{tab:main} lists the results. ACT outperforms all baselines on every task.',
    'experiments'
  )
  assert.deepEqual(levelsOf(tabled, 'WC-SWEEP'), ['notes'])
})

test('WS-MARKDOWN: bold, inline code, bullets and headings from markdown are errors', async () => {
  const text = [
    '**Key idea.** We prune each row by the score of its weights.',
    '',
    'We call `prune_rows` on every layer of the model in turn.',
    '',
    '- We keep the weights with the highest score in each row.',
    '',
    '## Method overview of the pruning step'
  ].join('\n')
  assert.deepEqual(levelsOf(await check(text, 'method'), 'WS-MARKDOWN'), [
    'errors',
    'errors',
    'errors',
    'errors'
  ])
  const latex =
    "We prune each row by \\emph{the score} of its weights, ``as the paper says'', and keep the rest $- x$ unchanged."
  assert.deepEqual(levelsOf(await check(latex, 'method'), 'WS-MARKDOWN'), [])
})

test('WS-LABELS: run-in labels on most paragraphs warn in an introduction, are a note in a method, pass in related work', async () => {
  const labelled = ['Setup', 'Gap', 'Insight', 'Results']
    .map((label) => `\\textbf{${label}.} ${filler(20)} carries the paragraph to its end.`)
    .join('\n\n')
  assert.deepEqual(levelsOf(await check(labelled, 'intro'), 'WS-LABELS'), ['warnings'])
  assert.deepEqual(levelsOf(await check(labelled, 'method'), 'WS-LABELS'), ['notes'])
  assert.deepEqual(levelsOf(await check(labelled, 'related'), 'WS-LABELS'), [])
  const claims = [
    'The cache keeps perplexity flat on every input we tried',
    'The kernel is faster than the baseline at every length'
  ]
    .map((sentence) => `\\textbf{${sentence}.} ${filler(20)}.`)
    .join('\n\n')
  assert.deepEqual(levelsOf(await check(claims, 'intro'), 'WS-LABELS'), [])
})

test('WS-LENGTH: an abstract past the published size and method paragraphs that run long', async () => {
  assert.deepEqual(levelsOf(await check(`${filler(260)}.`, 'abstract'), 'WS-LENGTH'), ['warnings'])
  assert.deepEqual(levelsOf(await check(`${filler(200)}.`, 'abstract'), 'WS-LENGTH'), [])
  const long = Array.from({ length: 3 }, () => `${filler(130)}.`).join('\n\n')
  assert.deepEqual(levelsOf(await check(long, 'method'), 'WS-LENGTH'), ['warnings'])
  const usual = Array.from({ length: 3 }, () => `${filler(85)}.`).join('\n\n')
  assert.deepEqual(levelsOf(await check(usual, 'method'), 'WS-LENGTH'), [])
})

test('WS-LIST: lists in an abstract and full-sentence lists in results', async () => {
  const abstract =
    '\\begin{itemize}\n\\item We prune once after training with no weight update.\n\\end{itemize}'
  assert.deepEqual(levelsOf(await check(abstract, 'abstract'), 'WS-LIST'), ['warnings'])
  const results = `\\begin{itemize}\n${Array.from({ length: 4 }, (_, index) => `\\item Model ${index} improves accuracy on the benchmark by a clear margin.`).join('\n')}\n\\end{itemize}`
  assert.deepEqual(levelsOf(await check(results, 'experiments'), 'WS-LIST'), ['warnings'])
})
