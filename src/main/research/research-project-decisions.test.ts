import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { decideProposal } from '../../research-harness/research-proposals.mjs'
import type { ResearchProjectRoot } from './research-project-files'
import {
  decideResearchProjectProposal,
  listResearchProjectPlans,
  listResearchProjectProposals,
  stateResearchProjectPlanBudget
} from './research-project-decisions'

const CLI = join(import.meta.dirname, '..', '..', 'research-harness', 'cli.mjs')

let parent: string
let project: string
let root: ResearchProjectRoot

function harness(args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args, '--project', project], {
    cwd: project,
    stdio: 'pipe',
    // Why: an agent's env would make the harness refuse the person's commands.
    env: { PATH: process.env.PATH ?? '' }
  }).toString()
}

function propose(experiment: string, title: string): void {
  harness([
    'proposal',
    'add',
    '--experiment',
    experiment,
    '--title',
    title,
    '--rationale',
    'One more seed shows the noise.',
    '--command',
    'node train.mjs --seed 2'
  ])
}

async function ledgerLines(experiment: string): Promise<Record<string, unknown>[]> {
  const text = await readFile(
    join(project, '.aster', 'experiments', experiment, 'proposals.jsonl'),
    'utf8'
  )
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
}

// Why: the harness refuses the person's plan commands inside an agent's env, as on a real host.
const AGENT_ENV = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'AI_AGENT',
  'GEMINI_CLI',
  'CODEX_THREAD_ID'
]

beforeAll(async () => {
  for (const name of AGENT_ENV) {
    vi.stubEnv(name, '')
  }
  parent = await realpath(await mkdtemp(join(tmpdir(), 'aster-research-decisions-')))
  project = join(parent, 'project')
  await mkdir(project)
  harness(['init'])
  harness(['experiment', '--name', 'Seeds'])
  harness(['experiment', '--name', 'Ranks'])
  propose('seeds', 'Rerun seed 2')
  propose('ranks', 'Rank 64 again')
  propose('ranks', 'Rank 8 too')
  root = { path: project, authorize: (path) => realpath(path).catch(() => path) }
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await rm(parent, { recursive: true, force: true })
})

describe('host proposal decisions', () => {
  it('lists pending proposals across every catalog Experiment', async () => {
    const result = await listResearchProjectProposals(root, { state: 'pending' })
    expect(result.unreadable).toEqual([])
    expect(result.proposals.map((entry) => `${entry.experiment}/${entry.id}`)).toEqual([
      'seeds/proposal-1',
      'ranks/proposal-1',
      'ranks/proposal-2'
    ])
  })

  it('writes the same decision entry the desktop’s harness call writes', async () => {
    const decided = await decideResearchProjectProposal(root, {
      experiment: 'ranks',
      id: 'proposal-1',
      decision: 'rejected',
      note: 'Not before rank 16 has two seeds.'
    })
    expect(decided).toMatchObject({ state: 'rejected', decision: { by: 'user' } })
    // The desktop IPC calls this same harness function with the same input.
    await decideProposal(project, {
      experiment: 'ranks',
      id: 'proposal-2',
      decision: 'rejected',
      note: 'Not before rank 16 has two seeds.',
      by: 'user'
    })
    const [, , first, second] = await ledgerLines('ranks')
    const shape = ({ id: _id, at: _at, target: _target, ...rest }: Record<string, unknown>) => rest
    expect(first).toMatchObject({ type: 'decision', target: 'proposal-1', by: 'user' })
    expect(shape(first)).toEqual(shape(second))
  })

  it('refuses a second decision on the same proposal', async () => {
    await expect(
      decideResearchProjectProposal(root, {
        experiment: 'ranks',
        id: 'proposal-1',
        decision: 'approved',
        note: null
      })
    ).rejects.toThrow(/already rejected/)
  })

  it('refuses an Experiment folder linked out of the workspace', async () => {
    const outside = join(parent, 'outside')
    await mkdir(outside)
    await symlink(outside, join(project, '.aster', 'experiments', 'linked'))
    const guarded: ResearchProjectRoot = {
      path: project,
      authorize: async (path) => {
        const real = await realpath(path).catch(() => path)
        if (!real.startsWith(project)) {
          throw new Error('Path is outside the allowed roots.')
        }
        return real
      }
    }
    await expect(
      decideResearchProjectProposal(guarded, {
        experiment: 'linked',
        id: 'proposal-1',
        decision: 'approved',
        note: null
      })
    ).rejects.toThrow(/outside/)
  })
})

describe('host plan decisions', () => {
  it('lists plans and records the person’s compute as `by: user`', async () => {
    harness(['plan', 'new', '--title', 'Rank study', '--id', 'rank-study'])
    const list = await listResearchProjectPlans(root)
    expect(list.plans.map((plan) => plan.id)).toEqual(['rank-study'])
    const budget = await stateResearchProjectPlanBudget(root, 'rank-study', { gpuHours: 12 })
    expect(budget.id).toBe('rank-study')
    const decisions = await readFile(
      join(project, '.aster', 'plans', 'rank-study', 'decisions.jsonl'),
      'utf8'
    )
    expect(decisions).toMatch(/"type":"budget"/)
    expect(decisions).toMatch(/"by":"user"/)
  })
})
