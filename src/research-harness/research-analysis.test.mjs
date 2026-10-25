import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const noAgent = {
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
  GEMINI_CLI: '',
  AI_AGENT: ''
}
const claudeInPane = {
  CLAUDECODE: '1',
  CLAUDE_CODE_SESSION_ID: 'claude-session-3',
  ORCA_PANE_KEY: 'tab-1:00000000-0000-4000-8000-000000000003'
}
const folder = '.aster/experiments/main/analysis'

function harness(project, args, env = {}) {
  const child = spawn(process.execPath, [cli, ...args, '--project', project, '--json'], {
    cwd: project,
    env: { ...process.env, ...noAgent, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  return new Promise((resolve) => {
    child.on('close', (code) =>
      resolve({ code, body: JSON.parse(stdout.trim().split('\n').at(-1)) })
    )
  })
}

async function ok(project, args, env) {
  const result = await harness(project, args, env)
  assert.equal(result.body.ok, true, JSON.stringify(result.body))
  return result.body
}

async function refused(project, args, code, env) {
  const result = await harness(project, args, env)
  assert.equal(result.code, 1)
  assert.equal(result.body.error.code, code, JSON.stringify(result.body))
}

async function withProject(task) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-analysis-')))
  try {
    await ok(project, ['init'])
    await ok(project, ['experiment', '--name', 'Main'])
    await ok(project, ['new-run', '--experiment', 'main', '--name', 'base', '--id', 'base'])
    await ok(project, ['new-run', '--experiment', 'main', '--name', 'lr', '--id', 'lr-1e-4'])
    await mkdir(path.join(project, folder), { recursive: true })
    await task(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

async function projectFile(project, relative, content = 'x') {
  await writeFile(path.join(project, relative), content)
  return relative
}

function addAnalysis(file, ...extra) {
  return [
    'analysis',
    'add',
    '--experiment',
    'main',
    '--title',
    `About ${path.basename(file)}`,
    '--file',
    file,
    '--summary',
    'lr 1e-4 beats the baseline by 0.03 val acc',
    ...extra
  ]
}

test('analyses record a file and its takeaway, take the kind from the extension, and supersede', async () => {
  await withProject(async (project) => {
    const figure = await projectFile(project, `${folder}/curves.png`)
    const added = await ok(
      project,
      addAnalysis(path.join(project, figure), '--run', 'base', '--run', 'main/lr-1e-4'),
      claudeInPane
    )
    assert.equal(added.analysis.id, 'analysis-1')
    assert.equal(added.analysis.kind, 'figure')
    assert.equal(added.analysis.file, figure)
    assert.deepEqual(added.analysis.runs, ['main/base', 'main/lr-1e-4'])
    assert.equal(added.analysis.by, 'agent')
    assert.equal(added.analysis.agent.providerSessionId, 'claude-session-3')
    assert.equal(added.analysis.supersededBy, null)

    const kinds = [
      [await projectFile(project, `${folder}/table.csv`), []],
      [await projectFile(project, `${folder}/rows.TSV`), []],
      [await projectFile(project, `${folder}/stats.json`), ['--kind', 'note']],
      [await projectFile(project, 'notes.md'), []]
    ]
    for (const [file, extra] of kinds) {
      await ok(project, addAnalysis(file, ...extra))
    }
    const replacement = await ok(project, addAnalysis(figure, '--supersedes', 'analysis-1'))
    assert.equal(replacement.analysis.supersedes, 'analysis-1')
    await refused(project, addAnalysis(figure, '--supersedes', 'analysis-1'), 'already_superseded')

    const listed = await ok(project, ['analysis', 'list', '--experiment', 'main'])
    assert.deepEqual(
      listed.items.map((item) => [item.id, item.kind, item.by, item.supersededBy]),
      [
        ['analysis-6', 'figure', 'user', null],
        ['analysis-5', 'note', 'user', null],
        ['analysis-4', 'note', 'user', null],
        ['analysis-3', 'table', 'user', null],
        ['analysis-2', 'table', 'user', null],
        ['analysis-1', 'figure', 'agent', 'analysis-6']
      ]
    )

    await ok(project, [...addAnalysis('notes.md').slice(0, -1), 'x'.repeat(2000)])
    const { experiments } = await ok(project, ['context', '--experiment', 'main'])
    const [context] = experiments
    assert.deepEqual(
      context.analyses.map((item) => item.id),
      ['analysis-7', 'analysis-6', 'analysis-5', 'analysis-4', 'analysis-3']
    )
    assert.equal(context.analysesOmitted, 1)
    assert.equal(context.analyses[0].summary.length, 400)
    assert.equal(context.analyses[1].title, 'About curves.png')
  })
})

test('analysis add refuses files, kinds, Runs, and authors the project does not back', async () => {
  await withProject(async (project) => {
    const outside = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-outside-')))
    try {
      await writeFile(path.join(outside, 'leak.png'), 'x')
      await symlink(path.join(outside, 'leak.png'), path.join(project, folder, 'link.png'))
      await refused(project, addAnalysis(path.join(outside, 'leak.png')), 'invalid_argument')
      await refused(project, addAnalysis(`${folder}/link.png`), 'invalid_argument')
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
    await refused(project, addAnalysis('../leak.png'), 'invalid_argument')
    await refused(project, addAnalysis(`${folder}/missing.png`), 'not_found')
    await refused(project, addAnalysis(folder), 'invalid_argument')

    const report = await projectFile(project, `${folder}/report.pdf`)
    const table = await projectFile(project, `${folder}/table.csv`)
    const figure = await projectFile(project, `${folder}/curves.png`)
    await refused(project, addAnalysis(report), 'invalid_argument')
    await refused(project, addAnalysis(table, '--kind', 'figure'), 'invalid_argument')
    await refused(project, addAnalysis(figure, '--kind', 'table'), 'invalid_argument')
    await refused(project, addAnalysis(table, '--kind', 'chart'), 'invalid_argument')

    await refused(project, addAnalysis(figure, '--run', 'main/missing'), 'run_not_found')
    await refused(project, addAnalysis(figure, '--supersedes', 'analysis-9'), 'not_found')
    await refused(project, addAnalysis(figure, '--supersedes', 'finding-1'), 'invalid_argument')
    await refused(project, addAnalysis(figure, '--by', 'user'), 'forbidden', claudeInPane)
    await refused(project, addAnalysis(figure, '--by', 'robot'), 'invalid_argument')
    await refused(
      project,
      [
        'analysis',
        'add',
        '--experiment',
        'main',
        '--title',
        'T',
        '--file',
        figure,
        '--summary',
        ' '
      ],
      'invalid_argument'
    )
    await refused(
      project,
      [...addAnalysis(figure).slice(0, 5), 't'.repeat(201), ...addAnalysis(figure).slice(6)],
      'invalid_argument'
    )
    await refused(
      project,
      [
        'analysis',
        'add',
        ...addAnalysis(figure).slice(2, 3),
        'nope',
        ...addAnalysis(figure).slice(4)
      ],
      'experiment_not_found'
    )

    const listed = await ok(project, ['analysis', 'list', '--experiment', 'main'])
    assert.deepEqual(listed.items, [])
  })
})
