import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { replyHash } from './research-rebuttal-records.mjs'
import {
  parseTranslations,
  translationFor,
  translationSources,
  withTranslations
} from './research-rebuttal-translations.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const directory = '.aster/rebuttal/iclr-2027'

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
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-rebuttal-tr-')))
  try {
    await harness(project, ['rebuttal', 'new', '--name', 'ICLR 2027'])
    await harness(
      project,
      ['rebuttal', 'add-review', '--file', '-'],
      'No DiffusionDet comparison.\nWhat is tau?\n'
    )
    await harness(
      project,
      ['rebuttal', 'points', 'set', '--file', '-'],
      JSON.stringify([
        {
          id: 'R1-W1',
          kind: 'weakness',
          summary: 'Baseline',
          quote: 'No DiffusionDet comparison.'
        },
        { id: 'R1-Q1', kind: 'question', summary: 'Tau', quote: 'What is tau?' }
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

const translate = (project, items, extra = []) =>
  harness(
    project,
    ['rebuttal', 'translate', 'set', '--language', 'ko', '--file', '-', ...extra],
    JSON.stringify({ items })
  )
const todo = async (project) =>
  (await harness(project, ['rebuttal', 'translate', 'list', '--language', 'ko', '--todo'])).result

test('the items to translate are the concerns, replies and reviews that have text', () => {
  const sources = translationSources({
    meta: {
      reviewers: [{ id: 'R1', opening: '' }],
      general: { intro: 'Thanks.', closing: '' }
    },
    points: [
      { id: 'R1-W1', summary: 'Baseline', quote: 'No comparison.' },
      { id: 'R1-Q1', summary: 'Tau', quote: 'What is tau?' }
    ],
    clusters: [{ id: 'C1', title: 'Baseline', points: ['R1-W1'], response: '' }],
    reviews: { R1: 'No comparison. What is tau?' },
    followUps: [{ reviewer: 'R1', round: 2, text: 'Still no comparison.' }]
  })
  assert.deepEqual(
    [...sources.keys()],
    [
      'review:R1',
      'review:R1-round-2',
      'title:C1',
      'quote:R1-W1',
      'summary:R1-Q1',
      'quote:R1-Q1',
      'reply:general:intro'
    ]
  )
})

test('a translation follows its source text: outdated after an edit, current again after undo', () => {
  const now = '2026-11-11T00:00:00.000Z'
  let translations = withTranslations(
    [],
    [{ key: 'reply:C1', hash: replyHash('First.'), text: '첫째.' }],
    { language: 'ko', now }
  )
  translations = withTranslations(
    translations,
    [{ key: 'reply:C1', hash: replyHash('Second.'), text: '둘째.' }],
    { language: 'ko', now }
  )
  assert.deepEqual(translationFor(translations, 'reply:C1', 'ko', 'Second.'), {
    text: '둘째.',
    outdated: false,
    at: now
  })
  assert.equal(translationFor(translations, 'reply:C1', 'ko', 'Third.').outdated, true)
  assert.equal(translationFor(translations, 'reply:C1', 'ko', 'Third.').text, '둘째.')
  assert.equal(translationFor(translations, 'reply:C1', 'ko', 'First.').text, '첫째.')
  assert.equal(translationFor(translations, 'reply:C1', 'ja', 'First.'), null)
  assert.throws(() =>
    parseTranslations([{ key: 'reply:Z9', language: 'ko', hash: 'x', text: 'y' }])
  )
})

test('only the latest few translations of an item are kept', () => {
  let translations = []
  for (let index = 0; index < 6; index += 1) {
    translations = withTranslations(
      translations,
      [{ key: 'reply:C1', hash: `h${index}`, text: `t${index}` }],
      { language: 'ko', now: '' }
    )
  }
  assert.deepEqual(
    translations.map((entry) => entry.text),
    ['t3', 't4', 't5']
  )
})

test('translate set stores translations; an edit marks them outdated, not gone', async () => {
  await withRebuttal(async (project) => {
    assert.equal((await todo(project)).counts.missing, 5)
    const saved = await translate(project, [
      { key: 'quote:R1-W1', text: 'DiffusionDet 비교가 없습니다.' },
      { key: 'title:C1', text: '기준선' },
      { key: 'review:R1', text: 'DiffusionDet 비교가 없습니다.\ntau는 무엇인가요?' },
      { key: 'summary:R1-Q1', text: '타우' },
      { key: 'quote:R1-Q1', text: 'tau는 무엇인가요?' }
    ])
    assert.equal(saved.code, 0)
    assert.equal((await todo(project)).items.length, 0)

    await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'],
      'We added DiffusionDet.'
    )
    assert.deepEqual(
      (await todo(project)).items.map((item) => [item.key, item.status]),
      [['reply:C1', 'missing']]
    )
    await translate(project, [{ key: 'reply:C1', text: 'DiffusionDet을 추가했습니다.' }])
    await harness(
      project,
      ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'],
      'We added DiffusionDet and Sparse R-CNN.'
    )
    const after = await todo(project)
    assert.deepEqual(
      after.items.map((item) => [item.key, item.status, item.source]),
      [['reply:C1', 'outdated', 'We added DiffusionDet and Sparse R-CNN.']]
    )
    const stored = JSON.parse(
      await readFile(path.join(project, directory, 'translations.json'), 'utf8')
    )
    assert.equal(stored.translations.length, 6)
  })
})

test('a waiting proposal can be translated, and unknown or empty items are refused', async () => {
  await withRebuttal(async (project) => {
    const metaFile = path.join(project, directory, 'rebuttal.json')
    const meta = JSON.parse(await readFile(metaFile, 'utf8'))
    await writeFile(metaFile, JSON.stringify({ ...meta, agentEdits: 'ask' }))
    await harness(project, ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'], 'A.')
    await harness(project, ['rebuttal', 'response', 'set', '--cluster', 'C1', '--file', '-'], 'B.')
    const held = await translate(project, [{ key: 'reply:C1', text: '비.', proposal: 'X2' }])
    assert.equal(held.code, 0)
    // The reply still says A., so the translation of B. is outdated until it is accepted.
    const reply = (await todo(project)).items.find((item) => item.key === 'reply:C1')
    assert.equal(reply.status, 'outdated')

    const wrong = await translate(project, [{ key: 'reply:C1', text: 'x', proposal: 'X9' }])
    assert.notEqual(wrong.code, 0)
    const empty = await translate(project, [{ key: 'reply:C1', text: '  ' }])
    assert.match(empty.result.error.message, /empty/)
    const unknown = await translate(project, [{ key: 'reply:C7', text: 'x' }])
    assert.match(unknown.result.error.message, /no text to translate/)
    const badLanguage = await harness(project, [
      'rebuttal',
      'translate',
      'list',
      '--language',
      'Korean'
    ])
    assert.notEqual(badLanguage.code, 0)
  })
})
