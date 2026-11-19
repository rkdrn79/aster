import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { listCodeFolders } from './research-writing-context.mjs'
import { parseBibitems, parseBibtex } from './research-writing-bib.mjs'
import { parseSkeletonText, setWritingSkeleton } from './research-writing-skeleton.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const outsideAgent = {
  ORCA_AGENT_SESSION_ID: '',
  ORCA_TERMINAL_HANDLE: '',
  ORCA_PANE_KEY: '',
  ORCA_AGENT_PANE: '',
  CLAUDECODE: '',
  CLAUDE_CODE_ENTRYPOINT: '',
  CLAUDE_CODE_SESSION_ID: '',
  CODEX_THREAD_ID: '',
  CODEX_SANDBOX: '',
  CODEX_SANDBOX_NETWORK_DISABLED: '',
  CODEX_MANAGED_BY_NPM: '',
  CODEX_MANAGED_BY_BUN: '',
  AI_AGENT: ''
}

function runCli(args, { cwd, env = {}, input = null }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env: { ...process.env, ...outsideAgent, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(input ?? '')
  })
}

async function runJson(args, options) {
  const result = await runCli([...args, '--json'], options)
  return { ...result, body: JSON.parse(result.stdout.trim().split('\n').at(-1)) }
}

const MANUSCRIPT = [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\begin{abstract}',
  'We show that caches with attention sinks keep perplexity flat on long inputs.',
  '\\end{abstract}',
  '\\section{Introduction}',
  'Language models fail on long streams because the cache grows without bound~\\cite{vaswani2017}.',
  '',
  'However, window attention collapses once the first tokens leave the cache, as earlier systems found.',
  '',
  'We observe that models dump attention on the first tokens, and we call them attention sinks here.',
  '\\section{Method}',
  'We keep the first four tokens next to a rolling window of recent tokens in the cache.',
  '\\bibliography{refs}',
  '\\end{document}'
].join('\n')

async function withProject(task) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-writing-cli-')))
  try {
    await mkdir(path.join(root, '.aster'), { recursive: true })
    await mkdir(path.join(root, 'paper'), { recursive: true })
    await writeFile(
      path.join(root, '.aster', 'project.json'),
      JSON.stringify({
        schemaVersion: 2,
        manuscript: { source: 'paper/main.tex', pdf: 'paper/main.pdf' },
        references: { bibliography: 'paper/refs.bib' }
      })
    )
    await writeFile(path.join(root, 'paper', 'main.tex'), MANUSCRIPT)
    await writeFile(
      path.join(root, 'paper', 'refs.bib'),
      '@inproceedings{vaswani2017,\n  title = {Attention Is All You Need},\n  year = 2017\n}\n@string{x = "y"}\n'
    )
    await task(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const SKELETON = [
  '# Intro skeleton',
  '',
  'GAP:      LLMs cannot stream: perplexity explodes past the training length (Fig. 1).',
  'WHY-NOT:  Window attention bounds memory but collapses once the first tokens are evicted.',
  'INSIGHT:  Models dump attention on the first tokens regardless of meaning.',
  'APPROACH: Keep the KV of 4 initial tokens plus a rolling window.',
  'TERM:     attention sink',
  '',
  '## Paragraph plan',
  '1. context: streaming applications'
].join('\n')

test('writing skeleton: set from stdin is a draft; the agent cannot confirm it; the person can', async () => {
  await withProject(async (root) => {
    const set = await runJson(['writing', 'skeleton', 'set', '--section', 'intro', '--file', '-'], {
      cwd: root,
      input: SKELETON
    })
    assert.equal(set.code, 0, set.stderr)
    assert.equal(set.body.skeleton.status, 'draft')
    assert.deepEqual(set.body.skeleton.missing, ['EVIDENCE'])
    assert.deepEqual(
      set.body.skeleton.lines.map((line) => line.key),
      ['GAP', 'WHY-NOT', 'INSIGHT', 'APPROACH', 'EVIDENCE', 'TERM']
    )
    assert.equal(set.body.skeleton.notes, '## Paragraph plan\n1. context: streaming applications')
    const incomplete = await runJson(['writing', 'skeleton', 'confirm', '--section', 'intro'], {
      cwd: root
    })
    assert.equal(incomplete.body.error.code, 'incomplete')
    await runJson(['writing', 'skeleton', 'set', '--section', 'intro', '--file', '-'], {
      cwd: root,
      input: 'EVIDENCE: Stable perplexity to 4M tokens (claim c3).'
    })
    const agent = await runJson(['writing', 'skeleton', 'confirm', '--section', 'intro'], {
      cwd: root,
      env: { CLAUDECODE: '1' }
    })
    assert.equal(agent.code, 1)
    assert.equal(agent.body.error.code, 'forbidden')
    const person = await runJson(['writing', 'skeleton', 'confirm', '--section', 'intro'], {
      cwd: root
    })
    assert.equal(person.body.skeleton.status, 'confirmed')
    assert.equal(person.body.skeleton.confirmedBy, 'user')
    const text = await readFile(path.join(root, '.aster', 'writing', 'intro.skeleton.md'), 'utf8')
    assert.match(text, /^---\nsection: intro\nstatus: confirmed\n/)
    assert.match(
      text,
      /\nINSIGHT: Models dump attention on the first tokens regardless of meaning\.\n/
    )
    const shown = await runCli(['writing', 'skeleton', 'get', '--section', 'intro'], { cwd: root })
    assert.match(shown.stdout, /^\.aster\/writing\/intro\.skeleton\.md · intro · confirmed/)
  })
})

test('writing skeleton: a changed line makes a confirmed skeleton a draft again', async () => {
  await withProject(async (root) => {
    await setWritingSkeleton(root, 'method', {
      lines: { GAP: 'g', 'WHY-NOT': 'w', INSIGHT: 'i', APPROACH: 'a', EVIDENCE: 'e' },
      by: 'user'
    })
    await runJson(['writing', 'skeleton', 'confirm', '--section', 'method'], { cwd: root })
    const file = path.join(root, '.aster', 'writing', 'method.skeleton.md')
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace('INSIGHT: i', 'INSIGHT: changed by hand')
    )
    const read = await runJson(['writing', 'skeleton', 'get', '--section', 'method'], { cwd: root })
    assert.equal(read.body.skeleton.status, 'draft')
    assert.equal(read.body.skeleton.confirmedAt, null)
    const unknown = await runJson(['writing', 'skeleton', 'get', '--section', 'discussion'], {
      cwd: root
    })
    assert.equal(unknown.body.error.code, 'invalid_argument')
  })
})

test('parseSkeletonText reads bullets, bold keys and continuation lines', () => {
  const parsed = parseSkeletonText('- **GAP:** one\n  two\nWHY-NOT: three\n\nfree notes')
  assert.deepEqual(parsed.lines, { GAP: 'one two', 'WHY-NOT': 'three' })
  assert.equal(parsed.notes, 'free notes')
})

test('writing check: JSON in the figures-check shape, exit 1 on errors, text with fixes', async () => {
  await withProject(async (root) => {
    const clean = await runJson(['writing', 'check'], { cwd: root })
    assert.equal(clean.code, 0, clean.stdout)
    assert.deepEqual(
      clean.body.sections.map((section) => section.role),
      ['abstract', 'intro', 'method']
    )
    assert.deepEqual(Object.keys(clean.body.sections[1]).sort(), [
      'endLine',
      'errors',
      'file',
      'line',
      'notes',
      'profile',
      'role',
      'score',
      'title',
      'warnings'
    ])
    assert.deepEqual(clean.body.bibliography, { files: ['paper/refs.bib'], keys: 1 })
    await writeFile(
      path.join(root, 'paper', 'main.tex'),
      MANUSCRIPT.replace('\\cite{vaswani2017}', '\\cite{madeup2024}')
    )
    const broken = await runCli(['writing', 'check', '--section', 'intro'], { cwd: root })
    assert.equal(broken.code, 1)
    assert.match(
      broken.stdout,
      /ERROR WC-CITE-KEY paper\/main\.tex:7 "madeup2024": \\cite\{madeup2024\} is not in the bibliography \(paper\/refs\.bib\)\. Fix: /
    )
  })
})

test('writing outline: paragraph roles, topic sentences and signals', async () => {
  await withProject(async (root) => {
    const { body } = await runJson(['writing', 'outline', '--section', 'intro'], { cwd: root })
    const paragraphs = body.sections[0].paragraphs
    assert.deepEqual(
      paragraphs.map((paragraph) => paragraph.role),
      ['context', 'prior-limits', 'insight']
    )
    assert.equal(paragraphs[0].cites, 1)
    assert.match(paragraphs[2].topic, /^We observe that models dump attention/)
    assert.equal(paragraphs[1].line, 9)
  })
})

test('writing bib: keys and titles from .bib, .bbl and thebibliography', async () => {
  await withProject(async (root) => {
    await writeFile(
      path.join(root, 'paper', 'main.bbl'),
      '\\begin{thebibliography}{1}\n\\bibitem[Xiao et~al.(2023)]{xiao2023}\nG. Xiao.\n\\newblock Efficient streaming language models with attention sinks.\n\\newblock arXiv, 2023.\n\\end{thebibliography}\n'
    )
    const { body } = await runJson(['writing', 'bib'], { cwd: root })
    assert.deepEqual(body.files, ['paper/refs.bib', 'paper/main.bbl'])
    assert.deepEqual(
      body.entries.map((entry) => [entry.key, entry.title, entry.year]),
      [
        ['vaswani2017', 'Attention Is All You Need', '2017'],
        ['xiao2023', 'Efficient streaming language models with attention sinks', '2023']
      ]
    )
  })
  assert.deepEqual(
    parseBibtex('@article{a, title="Quoted {T}itle", year={2020}}').map((entry) => entry.title),
    ['Quoted Title']
  )
  assert.deepEqual(
    parseBibitems('\\bibitem{solo}\nA. B.\n\\newblock Solo paper.').map((entry) => entry.key),
    ['solo']
  )
})

test('writing context: core candidates, engineering detail and flags of the code', async () => {
  await withProject(async (root) => {
    await mkdir(path.join(root, 'src', 'lib'), { recursive: true })
    await writeFile(
      path.join(root, 'src', 'lib', 'prune.py'),
      [
        'import torch',
        'class WrappedGPT:',
        '    def add_batch(self, inp):',
        '        self.scaler_row += torch.norm(inp, p=2, dim=1) ** 2',
        'def prune_wanda(model, sparsity):',
        '    metric = torch.abs(W) * torch.sqrt(scaler_row)',
        '    sort_res = torch.sort(metric, dim=-1)',
        '    return metric',
        'def save_checkpoint(model, path):',
        '    torch.save(model, path)'
      ].join('\n')
    )
    await writeFile(
      path.join(root, 'src', 'main.py'),
      "parser.add_argument('--sparsity_ratio', type=float, default=0.5)\nparser.add_argument('--seed', type=int, default=0)\n"
    )
    const { body } = await runJson(['writing', 'context', '--code', 'src'], { cwd: root })
    assert.deepEqual(body.files, ['src/lib/prune.py', 'src/main.py'])
    assert.ok(body.candidates.some((symbol) => symbol.name === 'prune_wanda'))
    assert.deepEqual(
      body.omit.map((entry) => entry.name),
      ['save_checkpoint']
    )
    assert.deepEqual(
      body.flags.map((entry) => entry.flag),
      ['--sparsity_ratio (default 0.5)', '--seed (default 0)']
    )
    const outside = await runJson(['writing', 'context', '--code', '../etc'], { cwd: root })
    assert.equal(outside.body.error.code, 'invalid_argument')
    const { folders } = await listCodeFolders(root)
    assert.deepEqual(
      folders.map((folder) => folder.path),
      ['src']
    )
  })
})

test('writing alone prints the group usage', async () => {
  const result = await runCli(['writing'], { cwd: os.tmpdir() })
  assert.match(result.stdout, /writing check \[--file TEX\] \[--section S\]/)
  assert.match(result.stdout, /writing skeleton get\|set\|confirm/)
})
