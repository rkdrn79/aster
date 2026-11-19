import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { libraryRequestsPath, requestLibraryPaper } from './research-library-requests.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const quietAgent = {
  ORCA_AGENT_SESSION_ID: '',
  ORCA_TERMINAL_HANDLE: '',
  ORCA_PANE_KEY: '',
  ORCA_AGENT_PANE: '',
  CLAUDECODE: '',
  CLAUDE_CODE_ENTRYPOINT: '',
  CLAUDE_CODE_SESSION_ID: '',
  CODEX_THREAD_ID: '',
  CODEX_SANDBOX: '',
  AI_AGENT: ''
}

async function project() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aster-library-cli-'))
  execFileSync(process.execPath, [cli, 'init', '--project', root, '--json'], {
    env: { ...process.env, ...quietAgent }
  })
  return root
}

async function requests(root) {
  const text = await readFile(libraryRequestsPath(root), 'utf8')
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

test('library add records the paper and the asking agent for Aster', async () => {
  const root = await project()
  try {
    const result = spawnSync(
      process.execPath,
      [
        cli,
        'library',
        'add',
        '--arxiv',
        'https://arxiv.org/abs/1706.03762v7',
        '--why',
        'closest prior method',
        '--json'
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, ...quietAgent, ORCA_AGENT_SESSION_ID: 'session-1', CLAUDECODE: '1' }
      }
    )
    assert.equal(result.status, 0, result.stderr)
    const reply = JSON.parse(result.stdout)
    assert.equal(reply.path, '.aster/local/library-requests.jsonl')
    const [request] = await requests(root)
    assert.equal(request.v, 1)
    assert.match(request.id, /^lr-[0-9a-f]{12}$/)
    assert.equal(request.arxivId, '1706.03762v7')
    assert.equal(request.note, 'closest prior method')
    assert.equal(request.agent.provider, 'claude-code')
    assert.equal(request.agent.sessionId, 'session-1')
    const ignored = await readFile(path.join(root, '.aster/.gitignore'), 'utf8')
    assert.match(ignored, /^local\/$/m)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('library add refuses a paper it cannot name', async () => {
  const root = await project()
  try {
    for (const args of [
      [],
      ['--arxiv', 'nope'],
      ['--doi', 'not-a-doi'],
      ['--url', 'ftp://x'],
      ['--title', 'T', '--year', '20']
    ]) {
      const result = spawnSync(process.execPath, [cli, 'library', 'add', ...args, '--json'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, ...quietAgent }
      })
      assert.equal(result.status, 1, args.join(' '))
      assert.equal(JSON.parse(result.stdout).ok, false)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the requests file keeps only the newest 200 requests', async () => {
  const root = await project()
  try {
    await requestLibraryPaper(root, { doi: '10.1000/first' }, { env: {} })
    const target = libraryRequestsPath(root)
    const filler = Array.from({ length: 199 }, (_, index) =>
      JSON.stringify({
        v: 1,
        id: `lr-${index}`,
        createdAt: '2026-01-01T00:00:00.000Z',
        doi: `10.1000/${index}`
      })
    )
    await writeFile(target, `${(await readFile(target, 'utf8')).trim()}\n${filler.join('\n')}\n`)
    const { request } = await requestLibraryPaper(
      root,
      { title: 'Attention Is All You Need', authors: 'Vaswani et al.', year: '2017' },
      { env: {} }
    )
    const kept = await requests(root)
    assert.equal(kept.length, 200)
    assert.equal(kept[0].id, 'lr-0')
    assert.deepEqual(kept.at(-1), request)
    assert.equal(request.year, 2017)
    assert.equal(request.agent, undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
