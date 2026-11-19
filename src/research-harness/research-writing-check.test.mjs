import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { checkWriting, writingScore } from './research-writing-check.mjs'
import {
  EXEMPLAR_INTRO,
  EXEMPLAR_METHOD,
  NAIVE_INTRO_CLAUDE,
  NAIVE_INTRO_CODEX,
  NAIVE_METHOD_CLAUDE,
  NAIVE_METHOD_CODEX
} from './research-writing-fixtures.mjs'

/** A project holding `files`; returns its path. */
async function project(files) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-writing-check-')))
  for (const [name, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true })
    await writeFile(path.join(root, name), text)
  }
  return root
}

async function check(text, section, extra = {}) {
  const root = await project({ 'paper/section.tex': text, ...extra })
  try {
    return await checkWriting(root, { file: 'paper/section.tex', section })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function findings(result, level = null) {
  return result.sections.flatMap((section) =>
    (level ? [level] : ['errors', 'warnings', 'notes']).flatMap((key) =>
      section[key].map((finding) => ({ ...finding, level: key }))
    )
  )
}

const codes = (result, level) => new Set(findings(result, level).map((finding) => finding.code))
const ENVIRONMENT = new Set(['WC-NUMBER', 'WC-BIB-MISSING', 'WF-UNREFERENCED'])

function styleWarningsPer1k(result) {
  const words = result.sections.reduce((sum, section) => sum + section.profile.words, 0)
  const count = findings(result, 'warnings').filter(
    (finding) => !ENVIRONMENT.has(finding.code)
  ).length
  return (1000 * count) / words
}

const document = (body, preamble = '') =>
  `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`
const words = (count, word = 'tokens') =>
  Array.from({ length: count }, (_, index) => `${word}${index % 7}`).join(' ')

test('the naive Codex introduction trips the outside-world rules; the SmoothQuant one does not', async () => {
  const naive = codes(await check(NAIVE_INTRO_CODEX, 'intro'), 'warnings')
  const exemplar = codes(await check(EXEMPLAR_INTRO, 'intro'), 'warnings')
  for (const code of ['WC-CITE-DENSITY', 'WF-NO-REFS', 'WP-RESTATE', 'WS-MONOTONE']) {
    assert.ok(naive.has(code), `${code} fires on the naive intro`)
    assert.ok(!exemplar.has(code), `${code} stays quiet on the exemplar intro`)
  }
  assert.equal(exemplar.size, 0)
})

test('the naive Claude introduction: restated contributions, template phrases, universal claims', async () => {
  const naive = codes(await check(NAIVE_INTRO_CLAUDE, 'intro'), 'warnings')
  for (const code of [
    'WP-CONTRIB-RECAP',
    'WL-TEMPLATE',
    'WH-UNIVERSAL',
    'WL-VAGUE',
    'WF-NO-REFS',
    'WN-UNDEFINED'
  ]) {
    assert.ok(naive.has(code), `${code} fires`)
  }
})

test('naive methods read as code tours; the LoRA problem statement does not', async () => {
  const codex = codes(await check(NAIVE_METHOD_CODEX, 'method'), 'warnings')
  const claude = codes(await check(NAIVE_METHOD_CLAUDE, 'method'), 'warnings')
  const exemplar = await check(EXEMPLAR_METHOD, 'method')
  for (const code of ['WK-NARRATION', 'WK-DETAIL', 'WK-TEXTTT']) {
    assert.ok(codex.has(code), `${code} fires on the Codex method`)
  }
  for (const code of ['WK-OPTIONS', 'WK-DETAIL', 'WK-NARRATION']) {
    assert.ok(claude.has(code), `${code} fires on the Claude method`)
  }
  // LoRA's own lapse: P_Φ is defined, the lower-case p in its Eq. 2 is not.
  assert.deepEqual(
    findings(exemplar, 'warnings').map((finding) => `${finding.code} ${finding.span}`),
    ['WN-UNDEFINED p']
  )
})

test('style warnings per 1,000 words separate every naive draft from its exemplar', async () => {
  const introExemplar = styleWarningsPer1k(await check(EXEMPLAR_INTRO, 'intro'))
  const methodExemplar = styleWarningsPer1k(await check(EXEMPLAR_METHOD, 'method'))
  for (const draft of [NAIVE_INTRO_CODEX, NAIVE_INTRO_CLAUDE]) {
    assert.ok(styleWarningsPer1k(await check(draft, 'intro')) > introExemplar + 5)
  }
  for (const draft of [NAIVE_METHOD_CODEX, NAIVE_METHOD_CLAUDE]) {
    assert.ok(styleWarningsPer1k(await check(draft, 'method')) > methodExemplar + 5)
  }
})

test('WN-UNDEFINED: a symbol first used without a definition; a "Let ... denote" defines it', async () => {
  const bad = await check(
    'We minimise the loss $L = \\lambda \\|W\\|^2 + R$ on every layer of the network.',
    'method'
  )
  assert.deepEqual(
    findings(bad)
      .filter((finding) => finding.code === 'WN-UNDEFINED')
      .map((finding) => finding.span)
      .sort(),
    ['R', 'W', 'lambda']
  )
  const good = await check(
    'Let $W$ denote the weights, $R$ the regulariser and $\\lambda$ the decay rate of the model. We minimise $L = \\lambda \\|W\\|^2 + R$.',
    'method'
  )
  assert.ok(!codes(good).has('WN-UNDEFINED'))
})

test('WK-CODE: identifiers, framework calls and file names in prose, but not names like vLLM', async () => {
  const bad = await check(
    'We call compute_scores on each layer, read self.cache and multiply with torch.matmul as in prune.py.',
    'method'
  )
  assert.deepEqual(
    findings(bad)
      .filter((finding) => finding.code === 'WK-CODE')
      .map((finding) => finding.span)
      .sort(),
    ['compute_scores', 'prune.py', 'self.cache', 'torch.matmul']
  )
  const good = await check(
    'We score each layer and multiply the cached keys with the query, as vLLM and fastText do in their servers.',
    'method'
  )
  assert.ok(!codes(good).has('WK-CODE'))
})

test('WK-OPTIONS, WK-DETAIL: code switches and engineering detail in the method', async () => {
  const result = await check(
    'We additionally support a length-normalised score. Sequences are left-padded with zeros and the ignore index is set by default to the padding value of the tokenizer.',
    'method'
  )
  assert.ok(codes(result).has('WK-OPTIONS'))
  assert.deepEqual(
    findings(result)
      .filter((finding) => finding.code === 'WK-DETAIL')
      .map((finding) => finding.span),
    ['left-padded']
  )
})

test('WP-WE and WP-PASSIVE: impersonal method prose; "we" in the present tense passes', async () => {
  const passive = Array.from(
    { length: 12 },
    (_, index) =>
      `The score of layer ${index} is computed from the cached activations and is stored for the next step.`
  ).join(' ')
  const result = codes(await check(passive, 'method'), 'warnings')
  assert.ok(result.has('WP-WE'))
  assert.ok(result.has('WP-PASSIVE'))
  const active = Array.from(
    { length: 12 },
    (_, index) =>
      `We compute the score of layer ${index} from the cached activations because it predicts the error.`
  ).join(' ')
  const clean = codes(await check(active, 'method'), 'warnings')
  assert.ok(!clean.has('WP-WE') && !clean.has('WP-PASSIVE'))
})

test('WP-RESTATE: a closing sentence that repeats the topic sentence', async () => {
  const bad = await check(
    'The cache keeps the first four tokens and a rolling window of recent tokens. It evicts the middle of the context when the window is full. The model attends to every token kept in the cache. This design ensures that the cache keeps the first tokens and a rolling window.',
    'method'
  )
  assert.ok(codes(bad).has('WP-RESTATE'))
  const good = await check(
    'The cache keeps the first four tokens and a rolling window of recent tokens. It evicts the middle of the context when the window is full. The model attends to every token kept in the cache. Perplexity stays at 5.4 up to 4 million tokens (Figure~\\ref{fig:ppl}).',
    'method'
  )
  assert.ok(!codes(good).has('WP-RESTATE'))
})

test('WH-DENSITY, WH-STACK, WH-UNIVERSAL: hedges in the right place', async () => {
  const flat = await check(`${words(210, 'claim')}.`, 'intro')
  assert.ok(codes(flat, 'notes').has('WH-DENSITY'))
  const stacked = await check(
    'This gap may potentially explain the drop in accuracy on long inputs.',
    'intro'
  )
  assert.ok(codes(stacked, 'notes').has('WH-STACK'))
  const universal = await check('Our cache always keeps the model stable on long inputs.', 'intro')
  assert.ok(codes(universal, 'warnings').has('WH-UNIVERSAL'))
  const proven = await check(
    'The update always decreases the bound (Theorem~\\ref{thm:descent}).',
    'intro'
  )
  assert.ok(!codes(proven).has('WH-UNIVERSAL'))
})

test('WC-SUPERLATIVE and WC-AGGREGATE: claims need a scope, a number or a pointer', async () => {
  assert.ok(
    codes(
      await check(
        'Our method achieves state-of-the-art results and clearly helps the model.',
        'intro'
      )
    ).has('WC-SUPERLATIVE')
  )
  assert.ok(
    !codes(
      await check(
        'Our method reaches state-of-the-art accuracy on ImageNet among methods trained without extra data.',
        'intro'
      )
    ).has('WC-SUPERLATIVE')
  )
  assert.ok(
    codes(
      await check('The kernel runs up to three times faster at long sequence lengths.', 'intro')
    ).has('WC-AGGREGATE')
  )
  assert.ok(
    !codes(
      await check(
        'The kernel runs up to three times faster than FlashAttention at long sequence lengths.',
        'intro'
      )
    ).has('WC-AGGREGATE')
  )
})

test('WC-CITE-PARAGRAPH and WC-ABSTRACT-CITE: who needs a citation and who must not have one', async () => {
  assert.ok(
    codes(
      await check(
        'Existing methods quantize weights only and keep activations in full precision on every layer.',
        'intro'
      )
    ).has('WC-CITE-PARAGRAPH')
  )
  assert.ok(
    !codes(
      await check(
        'Existing methods~\\cite{zeroquant} quantize weights only and keep activations in full precision.',
        'intro'
      )
    ).has('WC-CITE-PARAGRAPH')
  )
  assert.ok(
    codes(
      await check(
        'We show that attention sinks explain the collapse of window attention~\\cite{xiao2023}.',
        'abstract'
      )
    ).has('WC-ABSTRACT-CITE')
  )
})

test('WC-CITE-KEY, WC-CITE-TODO and WC-BIB-MISSING against the project bibliography', async () => {
  const bib = {
    'paper/refs.bib': '@article{known2020,\n  title = {A {Known} Paper},\n  year = {2020}\n}\n'
  }
  const text =
    'Prior quantizers~\\cite{known2020,invented2023} and pruning~\\cite{TODO:wanda-style pruning} lose accuracy at scale.\n\\bibliography{refs}'
  const result = findings(await check(text, 'intro', bib))
  assert.deepEqual(
    result
      .filter((finding) => finding.code === 'WC-CITE-KEY')
      .map((finding) => [finding.level, finding.span]),
    [['errors', 'invented2023']]
  )
  assert.deepEqual(
    result.filter((finding) => finding.code === 'WC-CITE-TODO').map((finding) => finding.span),
    ['TODO:wanda-style pruning']
  )
  const bbl = {
    'paper/section.bbl':
      '\\begin{thebibliography}{1}\n\\bibitem[Known(2020)]{known2020}\nA. Author.\n\\newblock A known paper.\n\\end{thebibliography}\n'
  }
  assert.ok(
    !codes(
      await check(
        'Prior work~\\cite{known2020} loses accuracy at scale on large models.',
        'intro',
        bbl
      )
    ).has('WC-CITE-KEY')
  )
  assert.ok(
    codes(
      await check('Prior work~\\cite{known2020} loses accuracy at scale on large models.', 'intro'),
      'notes'
    ).has('WC-BIB-MISSING')
  )
})

test('WC-NUMBER: result numbers need a claim; a claim that states the value backs it', async () => {
  const text = 'Our method reaches 87.3\\% accuracy and runs 2.4 times faster on the benchmark.'
  const loose = findings(await check(text, 'intro')).filter(
    (finding) => finding.code === 'WC-NUMBER'
  )
  assert.deepEqual(
    loose.map((finding) => [finding.level, finding.span]),
    [
      ['warnings', '87.3\\%'],
      ['warnings', '2.4']
    ]
  )
  const ledger = {
    '.aster/claims.json': JSON.stringify({
      schemaVersion: 1,
      claims: [{ id: 'c1', text: 'acc', evidence: [{ value: 0.873, role: 'stated' }] }]
    })
  }
  const backed = findings(await check(text, 'intro', ledger)).filter(
    (finding) => finding.code === 'WC-NUMBER'
  )
  assert.deepEqual(
    backed.map((finding) => [finding.level, finding.span]),
    [['errors', '2.4']]
  )
})

test('WF rules: unreferenced floats, missing labels and Figure/Table mix-ups in a whole paper', async () => {
  const body = [
    '\\section{Introduction}',
    'Window attention collapses once the first tokens leave the cache, as Table~\\ref{fig:collapse} and Figure~\\ref{fig:missing} show for every model.',
    '\\begin{figure}\\caption{Collapse.}\\label{fig:collapse}\\end{figure}',
    '\\begin{table}\\caption{Unused.}\\label{tab:unused}\\end{table}',
    'Pruning takes seconds (Table~\\ref{tab:speed}).',
    '\\begin{figure}\\begin{minipage}{0.5\\linewidth}\\captionof{table}{Speed.}\\label{tab:speed}\\end{minipage}\\end{figure}'
  ].join('\n')
  const root = await project({ 'paper/main.tex': document(body) })
  try {
    const result = findings(await checkWriting(root, { file: 'paper/main.tex' }), 'errors')
    assert.deepEqual(result.map((finding) => `${finding.code} ${finding.span}`).sort(), [
      'WF-REF-KIND Table~\\ref{fig:collapse}',
      'WF-REF-UNDEFINED fig:missing',
      'WF-UNREFERENCED tab:unused'
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rhythm and shape: long sentences, monotone paragraphs, long paragraphs, one-sentence paragraphs, lists', async () => {
  assert.ok(codes(await check(`${words(70)}.`, 'method'), 'notes').has('WS-SENT-LONG'))
  const monotone = Array.from(
    { length: 6 },
    (_, index) => `The model reads token ${index} and writes one more value to the cache.`
  ).join(' ')
  assert.ok(codes(await check(monotone, 'intro'), 'warnings').has('WS-MONOTONE'))
  assert.ok(codes(await check(`${words(240)}.`, 'intro'), 'warnings').has('WS-PARA-LONG'))
  const single = [
    'The first claim of this paper is about attention sinks in every model we tested.',
    'The second claim of this paper is about rolling caches that keep the recent tokens.',
    'The third claim of this paper is about perplexity on inputs of four million tokens.'
  ].join('\n\n')
  assert.ok(codes(await check(single, 'intro'), 'warnings').has('WS-PARA-SHORT'))
  const list = `\\begin{itemize}\n${Array.from({ length: 6 }, (_, index) => `\\item Contribution number ${index} of this paper about caches.`).join('\n')}\n\\end{itemize}`
  assert.ok(codes(await check(list, 'intro'), 'warnings').has('WS-LIST'))
})

test('lexical guards: tier-A words (an error from three), boosters, self-praise, templates, signposts, connectives, vague words', async () => {
  const tierA = findings(
    await check(
      'We delve into the realm of caches. This pivotal design is seamless for every model in the landscape.',
      'intro'
    )
  )
  assert.ok(
    tierA
      .filter((finding) => finding.code === 'WL-TIERA')
      .every((finding) => finding.level === 'errors')
  )
  assert.ok(
    codes(
      await check('The gain is dramatically larger for long inputs in practice.', 'intro'),
      'notes'
    ).has('WL-BOOSTER')
  )
  assert.ok(
    codes(
      await check('Our simple yet effective method removes the outliers in every layer.', 'intro')
    ).has('WL-SELFPRAISE')
  )
  assert.ok(
    !codes(
      await check(
        'Our simple method adds 20 lines of code and no extra parameters to the trainer.',
        'intro'
      )
    ).has('WL-SELFPRAISE')
  )
  assert.ok(
    codes(
      await check('In this paper, we propose a novel cache for streaming language models.', 'intro')
    ).has('WL-TEMPLATE')
  )
  assert.ok(
    codes(
      await check(
        'In this section, we describe the cache and its eviction rule in detail.',
        'intro'
      ),
      'warnings'
    ).has('WL-SIGNPOST')
  )
  const chain =
    'The cache stores keys. Furthermore, it stores values for every head. Moreover, it keeps positions for the rotary embedding.'
  assert.ok(codes(await check(chain, 'method')).has('WL-CONNECTIVE'))
  const vague = Array.from(
    { length: 8 },
    () => 'Several models and various tasks show the effect of the cache on quality.'
  ).join(' ')
  assert.ok(codes(await check(`${vague}\n\n${words(120, 'filler')}.`, 'intro')).has('WL-VAGUE'))
  assert.ok(
    codes(
      await check(
        'Accuracy improves significantly, from 71.2 to 74.9 on the benchmark.',
        'experiments'
      ),
      'notes'
    ).has('WL-SIGNIFICANT')
  )
})

test('WP-TOPIC and WP-TENSE notes', async () => {
  const topic =
    'The cache keeps the first four tokens of the stream next to a rolling window.\n\nFor example, the model attends to token zero in every head of every layer.'
  assert.ok(codes(await check(topic, 'method'), 'notes').has('WP-TOPIC'))
  const past = Array.from(
    { length: 6 },
    () =>
      'We trained the model on the corpus. We evaluated it on two tasks. We compared it with the baseline. We measured memory on one GPU. We found a large gap between them on every input length.'
  ).join(' ')
  assert.ok(codes(await check(past, 'method'), 'notes').has('WP-TENSE'))
})

test('waivers: a reason silences one rule in its paragraph; no reason is itself a warning', async () => {
  const text =
    '% writing-check: allow WC-NUMBER the batch size is configuration\nWe train with a learning rate of 0.001 for every model in this paper.\n\n% writing-check: allow WC-NUMBER\nWe keep 0.5 of the cache for every model in this study.'
  const result = findings(await check(text, 'method'))
  assert.deepEqual(
    result.filter((finding) => finding.code === 'WC-NUMBER').map((finding) => finding.span),
    ['0.5']
  )
  assert.deepEqual(
    result.filter((finding) => finding.code === 'WX-WAIVER').map((finding) => finding.line),
    [4]
  )
})

test('sections: titles name roles, the method is found by position, an override wins, --section picks', async () => {
  const body = [
    '\\section{Introduction}',
    `Streaming models fail on long inputs, and we explain why in this paper about caches. ${words(20)}.`,
    '\\section{Wanda: Pruning by Weights and Activations}',
    `We prune each output row by the product of weight magnitude and input norm. ${words(20)}.`,
    '\\section{Our Findings} % aster:section=experiments',
    `Perplexity stays flat to four million tokens for every model we tested here. ${words(20)}.`
  ].join('\n')
  const root = await project({ 'paper/main.tex': document(body) })
  try {
    const all = await checkWriting(root, { file: 'paper/main.tex' })
    assert.deepEqual(
      all.sections.map((section) => section.role),
      ['intro', 'method', 'experiments']
    )
    const method = await checkWriting(root, { file: 'paper/main.tex', section: 'method' })
    assert.deepEqual(
      method.sections.map((section) => section.title),
      ['Wanda: Pruning by Weights and Activations']
    )
    await assert.rejects(
      checkWriting(root, { file: 'paper/main.tex', section: 'related' }),
      /No related section/
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('\\input files keep their own line numbers, and a checked include reports only its findings', async () => {
  const main = document(
    '\\section{Introduction}\nThe introduction states the gap with a citation~\\cite{a} and a figure.\n\\input{sections/method}'
  )
  const method =
    '\\section{Method}\nWe first read the cache.\nWe then call compute_scores on every layer of the model.\n'
  const root = await project({
    'paper/main.tex': main,
    'paper/sections/method.tex': method,
    '.aster/project.json': JSON.stringify({
      schemaVersion: 2,
      manuscript: { source: 'paper/main.tex' }
    })
  })
  try {
    const result = await checkWriting(root, { file: 'paper/sections/method.tex' })
    const code = findings(result).find((finding) => finding.code === 'WK-CODE')
    assert.deepEqual([code.file, code.line, code.column], ['paper/sections/method.tex', 3, 14])
    assert.ok(findings(result).every((finding) => finding.file === 'paper/sections/method.tex'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('score: 100 minus 15 per error, 4 per warning, 1 per note', () => {
  assert.equal(writingScore({ errors: 1, warnings: 2, notes: 3 }), 74)
  assert.equal(writingScore({ errors: 9, warnings: 0, notes: 0 }), 0)
})
