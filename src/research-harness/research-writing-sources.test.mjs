import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { checkWriting } from './research-writing-check.mjs'

// Numbers without claims: the manuscript and the project's data are sources too (the Writing
// guide's order), and a \todo for a number that exists there is flagged with where to look.

async function check(files, options = { file: 'paper/main.tex' }) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-writing-sources-')))
  try {
    for (const [name, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true })
      await writeFile(path.join(root, name), text)
    }
    const result = await checkWriting(root, options)
    return result.sections.flatMap((section) =>
      ['errors', 'warnings', 'notes'].flatMap((level) =>
        section[level].map((finding) => ({ ...finding, level, role: section.role }))
      )
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const LEDGER = {
  '.aster/claims.json': JSON.stringify({ schemaVersion: 1, claims: [] })
}

const TABLE = [
  '\\begin{table}',
  '\\caption{Object discovery with LOST: corloc on VOC 2007.}\\label{tab:lost}',
  '\\begin{tabular}{lc}',
  'DINOv2 & 35.3 \\\\',
  'DINOv2 with registers & 55.4 \\\\',
  '\\end{tabular}',
  '\\end{table}'
].join('\n')

const paper = (
  abstract,
  experiments = 'Table~\\ref{tab:lost} lists corloc for both models on the same split of the data.'
) =>
  [
    '\\documentclass{article}',
    '\\begin{document}',
    '\\begin{abstract}',
    abstract,
    '\\end{abstract}',
    '\\section{Introduction}',
    'Vision transformers leave artifacts in their feature maps that hurt dense prediction on every backbone we study.',
    '\\section{Experiments}',
    experiments,
    TABLE,
    '\\end{document}',
    ''
  ].join('\n')

const numberFindings = (findings) =>
  findings
    .filter((finding) => finding.code === 'WC-NUMBER' && finding.span)
    .map((finding) => [finding.role, finding.level, finding.span])

test('WC-NUMBER: a number the manuscript states is a note, and a % source: comment clears it', async () => {
  const sourced = paper('With registers, LOST reaches 55.4 corloc on VOC 2007 instead of 35.3.')
  assert.deepEqual(numberFindings(await check({ 'paper/main.tex': sourced, ...LEDGER })), [
    ['abstract', 'notes', '55.4'],
    ['abstract', 'notes', '35.3']
  ])
  const note = (await check({ 'paper/main.tex': sourced, ...LEDGER })).find(
    (finding) => finding.code === 'WC-NUMBER'
  )
  assert.match(note.message, /Table tab:lost \(paper\/main\.tex:\d+\)/)
  const marked = paper(
    '% source: tab:lost\nWith registers, LOST reaches 55.4 corloc on VOC 2007 instead of 35.3.'
  )
  assert.deepEqual(numberFindings(await check({ 'paper/main.tex': marked, ...LEDGER })), [])
  const invented = paper('With registers, LOST reaches 61.2 corloc on VOC 2007.')
  assert.deepEqual(numberFindings(await check({ 'paper/main.tex': invented, ...LEDGER })), [
    ['abstract', 'errors', '61.2']
  ])
})

test('WC-NUMBER: a project data file is a source; a percentage matches its fraction', async () => {
  const text = paper('The watermark detects 98.4\\% of 200-token samples at a z-threshold of four.')
  const data = { 'data/results.csv': 'setting,sensitivity\nmultinomial,0.984\n' }
  const findings = await check({ 'paper/main.tex': text, ...LEDGER, ...data })
  assert.deepEqual(numberFindings(findings), [['abstract', 'notes', '98.4\\%']])
  assert.match(
    findings.find((finding) => finding.code === 'WC-NUMBER').message,
    /data\/results\.csv/
  )
})

test('WC-TODO-SOURCE: a \\todo for numbers the manuscript or data holds says where they are', async () => {
  const withTable = paper(
    'Registers remove the artifacts. \\todo{evidence: headline DINOv2 LOST corloc on VOC 2007, once the Runs are recorded as claims}'
  )
  const found = (await check({ 'paper/main.tex': withTable })).filter(
    (finding) => finding.code === 'WC-TODO-SOURCE'
  )
  assert.equal(found.length, 1)
  assert.equal(found[0].level, 'warnings')
  assert.equal(found[0].role, 'abstract')
  assert.match(found[0].message, /Table tab:lost .*dinov2, lost, corloc, voc/)

  const notes = paper(
    'Registers remove the artifacts. \\todo{evidence: ADE20k segmentation mIoU with and without registers}',
    'We probe the features with a linear head on the frozen backbone of each model.'
  )
  const data = {
    'data/results.md': '# Linear probes\n\n| model | ADE20k mIoU |\n| DINOv2 | 46.6 |\n'
  }
  const fromData = (await check({ 'paper/main.tex': notes, ...data })).find(
    (finding) => finding.code === 'WC-TODO-SOURCE'
  )
  assert.match(
    fromData.message,
    /data\/results\.md:3, on ade20k, segmentation|data\/results\.md:3, on ade20k, miou/
  )

  const nowhere = paper(
    'Registers remove the artifacts. \\todo{evidence: wall-clock training cost of the registers}'
  )
  assert.deepEqual(
    (await check({ 'paper/main.tex': nowhere })).filter(
      (finding) => finding.code === 'WC-TODO-SOURCE'
    ),
    []
  )
  const question = paper(
    'Registers remove the artifacts. \\todo{ask the authors why four registers}'
  )
  assert.deepEqual(
    (await check({ 'paper/main.tex': question })).filter(
      (finding) => finding.code === 'WC-TODO-SOURCE'
    ),
    []
  )
})

test('WF-ABSTRACT-REF and WS-METHOD-RESULT: the abstract stands alone; the method leaves results to the experiments', async () => {
  const referenced = paper('With registers, LOST improves on VOC 2007 (Table~\\ref{tab:lost}).')
  assert.ok(
    (await check({ 'paper/main.tex': referenced })).some(
      (finding) => finding.code === 'WF-ABSTRACT-REF' && finding.level === 'warnings'
    )
  )
  const method = (sentence) =>
    [
      '\\documentclass{article}',
      '\\begin{document}',
      '\\section{Introduction}',
      'Vision transformers leave artifacts in their feature maps that hurt dense prediction on every backbone.',
      '\\section{Registers}',
      `We append four learnable tokens to the input sequence and discard them at the output of the model. ${sentence}`,
      '\\section{Experiments}',
      'Table~\\ref{tab:lost} lists corloc for both models on the same split of the data.',
      TABLE,
      '\\end{document}',
      ''
    ].join('\n')
  const codes = async (sentence) =>
    (await check({ 'paper/main.tex': method(sentence) })).map((finding) => finding.code)
  assert.ok(
    (await codes('Removing them degrades corloc by 20 points (Table~\\ref{tab:lost}).')).includes(
      'WS-METHOD-RESULT'
    )
  )
  assert.ok(
    (await codes('In our experiments four tokens were enough for every model.')).includes(
      'WS-METHOD-RESULT'
    )
  )
  assert.ok(
    !(
      await codes('We compare against the model without registers in Table~\\ref{tab:lost}.')
    ).includes('WS-METHOD-RESULT')
  )
})
