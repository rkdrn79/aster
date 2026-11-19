import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { cutConsequences, planCellsView, tierTotals } from './research-plan-view.mjs'

const cli = path.join(import.meta.dirname, 'cli.mjs')
const fixture = path.join(import.meta.dirname, 'test-fixtures', 'plans', 'exemplar-ts-aug.json')
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
  CLAUDE_CODE_SESSION_ID: 'claude-session-9',
  ORCA_AGENT_SESSION_ID: 'session-9',
  ORCA_PANE_KEY: 'tab-1:00000000-0000-4000-8000-000000000009'
}

function harness(project, args, { env = {}, input = null } = {}) {
  const child = spawn(process.execPath, [cli, ...args, '--project', project, '--json'], {
    cwd: project,
    env: { ...process.env, ...noAgent, ...env },
    stdio: [input === null ? 'ignore' : 'pipe', 'pipe', 'pipe']
  })
  if (input !== null) {
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input))
  }
  let stdout = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  return new Promise((resolve) => {
    child.on('close', (code) =>
      resolve({ code, body: JSON.parse(stdout.trim().split('\n').at(-1)) })
    )
  })
}

async function ok(project, args, options) {
  const result = await harness(project, args, options)
  assert.equal(result.body.ok, true, JSON.stringify(result.body))
  return result.body
}

async function refused(project, args, code, options) {
  const result = await harness(project, args, options)
  assert.equal(result.code, 1)
  assert.equal(result.body.error.code, code, JSON.stringify(result.body))
  return result.body.error
}

async function exemplar(mutate = () => {}) {
  const plan = JSON.parse(await readFile(fixture, 'utf8'))
  mutate(plan)
  return plan
}

async function withPlan(task, mutate) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-plans-')))
  try {
    await ok(project, ['init'])
    await ok(project, ['plan', 'new', '--title', 'TS aug', '--file', '-'], {
      env: claudeInPane,
      input: await exemplar(mutate)
    })
    await task(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

test('plan new, set and show keep a revision and a readable plan.md', async () => {
  await withPlan(async (project) => {
    const shown = await ok(project, ['plan', 'show'])
    assert.equal(shown.id, 'ts-aug')
    assert.equal(shown.revision, 1)
    assert.equal(shown.status, 'draft')
    assert.equal(shown.plan.agent.provider, 'claude-code')
    assert.match(shown.markdown, /## Run order/u)
    const markdown = await readFile(path.join(project, '.aster/plans/ts-aug/plan.md'), 'utf8')
    assert.match(markdown, /\| must \| 15 \|/u)
    const merged = await ok(project, ['plan', 'set', '--merge', '--file', '-'], {
      input: { stoppingRules: ['Stop when the budget is spent'] }
    })
    assert.equal(merged.revision, 2)
    assert.deepEqual(merged.plan.stoppingRules, ['Stop when the budget is spent'])
    assert.equal(merged.plan.claims.length, 4)
    const listed = await ok(project, ['plan', 'list'])
    assert.deepEqual(
      listed.plans.map((plan) => [plan.id, plan.revision]),
      [['ts-aug', 2]]
    )
  })
})

test('plan set refuses typos, dangling references and decisions that are the person’s', async () => {
  await withPlan(async (project) => {
    const typo = await refused(project, ['plan', 'set', '--merge', '--file', '-'], 'invalid_plan', {
      input: { stopingRules: [] }
    })
    assert.match(typo.message, /stopingRules: is not a plan field/u)
    const dangling = await refused(project, ['plan', 'set', '--file', '-'], 'invalid_plan', {
      input: await exemplar((plan) => (plan.matrix[0].compareTo = ['S9.nowhere']))
    })
    assert.match(dangling.message, /refers to unknown cell "S9.nowhere"/u)
    await refused(project, ['plan', 'set', '--file', '-'], 'not_allowed', {
      env: claudeInPane,
      input: await exemplar((plan) => (plan.claims[0].status = 'supported'))
    })
    await ok(project, ['plan', 'budget', '--gpu-hours', '500', '--by', 'user'])
    const changed = await refused(project, ['plan', 'set', '--file', '-'], 'not_allowed', {
      env: claudeInPane,
      input: await exemplar((plan) => (plan.scope.compute.gpuHours = 900))
    })
    assert.match(changed.message, /ask them/u)
    await refused(
      project,
      ['plan', 'budget', '--gpu-hours', '900', '--by', 'user'],
      'not_allowed',
      {
        env: claudeInPane
      }
    )
  })
})

test('plan check exits 1 on a fail and reports findings like check', async () => {
  await withPlan(
    async (project) => {
      const result = await harness(project, ['plan', 'check'])
      assert.equal(result.code, 1)
      assert.equal(result.body.summary.fail, 1)
      const [finding] = result.body.findings
      assert.equal(finding.id, 'rule:plan.budget-assumed:ts-aug/scope')
      assert.deepEqual(finding.evidence, [
        { kind: 'plan', plan: 'ts-aug', revision: 1, path: '/scope/compute' }
      ])
      await refused(project, ['plan', 'submit'], 'plan_blocked')
    },
    (plan) => (plan.scope.compute.source = 'assumed')
  )
})

test('plan submit asks Aster to keep each closest prior paper in the Library, once', async () => {
  await withPlan(
    async (project) => {
      const submitted = await ok(project, ['plan', 'submit'], { env: claudeInPane })
      assert.deepEqual(
        submitted.library.requested.map((entry) => entry.arxiv ?? entry.doi),
        ['2303.11911', '2106.10466', '2402.10434']
      )
      const requests = (
        await readFile(path.join(project, '.aster/local/library-requests.jsonl'), 'utf8')
      )
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      assert.equal(requests.length, 3)
      assert.equal(requests[0].arxivId, '2303.11911')
      assert.equal(requests[0].source, 'plan')
      assert.match(requests[0].note, /^closest prior method for C1: Learned per-instance views/u)
      assert.match(requests[1].note, /^closest prior method for C1, C2, C4$/u)
      assert.equal(requests[0].agent.provider, 'claude-code')
      const again = await ok(project, ['plan', 'submit'])
      assert.deepEqual(again.library.requested, [])
    },
    (plan) => {
      plan.baselineSearch.closest[0].claim = 'C1'
      plan.baselineSearch.closest[1].arxiv = '2106.10466v3'
    }
  )
})

test('the pre-mortem brief grounds each reviewer in the Library and the request rates', async () => {
  await withPlan(async (project) => {
    await writeFile(
      path.join(project, 'paper/references.bib'),
      '@article{yue2022ts2vec,\n  title={{TS2Vec}: Towards Universal Representation of Time Series},\n  year={2022}\n}\n@inproceedings{luo2023infots,\n  title = "Time Series Contrastive Learning with Information-Aware Augmentations",\n  year = {2023},\n}\n'
    )
    const all = await ok(project, ['plan', 'premortem', 'brief'])
    assert.deepEqual(
      all.briefs.map((brief) => brief.reviewer),
      ['R1', 'R2', 'R3']
    )
    assert.equal(all.library.entries, 2)
    const [r2] = (await ok(project, ['plan', 'premortem', 'brief', '--reviewer', 'R2'])).briefs
    assert.match(r2.prompt, /You are simulating R2, the breadth and practicality reviewer/u)
    assert.match(r2.prompt, /\[yue2022ts2vec\] TS2Vec: Towards Universal Representation/u)
    assert.match(r2.prompt, /- \* missing-dataset \(70%\)/u)
    assert.match(r2.prompt, /- missing-baseline \(74%\)/u)
    assert.match(r2.prompt, /You are not a real reviewer/u)
    assert.match(r2.prompt, /Never invent results/u)
  })
})

test('pre-mortem requests are recorded per reviewer and resolved into the plan', async () => {
  await withPlan(
    async (project) => {
      const recorded = await ok(project, ['plan', 'premortem', 'record', '--file', '-'], {
        input: {
          reviewer: 'R2',
          requests: [
            { category: 'missing-dataset', request: 'Add Traffic', likelihood: 'high' },
            { category: 'cost', request: 'Report memory per epoch', likelihood: 'medium' }
          ]
        }
      })
      assert.deepEqual(recorded.added, ['PM1', 'PM2'])
      const again = await ok(project, ['plan', 'premortem', 'record', '--file', '-'], {
        input: { reviewer: 'R2', requests: [{ category: 'cost', request: 'Report FLOPs' }] }
      })
      assert.deepEqual(again.added, ['PM3'])
      assert.deepEqual(
        again.plan.premortem.requests.map((request) => request.id),
        ['PM3']
      )
      await refused(project, ['plan', 'premortem', 'resolve', '--file', '-'], 'invalid_argument', {
        input: { resolutions: [{ id: 'PM3', as: 'out-of-scope' }] }
      })
      const resolved = await ok(project, ['plan', 'premortem', 'resolve', '--file', '-'], {
        input: { resolutions: [{ id: 'PM3', as: 'out-of-scope', reason: 'FLOPs are fixed' }] }
      })
      assert.equal(resolved.plan.premortem.requests[0].resolution.as, 'out-of-scope')
      assert.ok(
        resolved.plan.scope.outOfScope.some(
          (entry) => entry.from === 'PM3' && entry.reason === 'FLOPs are fixed'
        )
      )
    },
    (plan) => delete plan.premortem
  )
})

async function approvable(project) {
  await ok(project, ['plan', 'premortem', 'resolve', '--file', '-'], {
    input: {
      resolutions: [
        {
          id: 'PM5',
          as: 'ask',
          items: ['S4.cost'],
          reason: 'Weather adds 18 GPU-h',
          costGpuHours: 18
        }
      ]
    }
  })
  return (await ok(project, ['plan', 'show'])).revision
}

test('only the person approves: cuts need reasons, asks need decisions, the budget must fit', async () => {
  await withPlan(
    async (project) => {
      let revision = await approvable(project)
      const approve = (extra, options) => [
        'plan',
        'approve',
        '--revision',
        String(revision),
        '--by',
        'user',
        ...extra,
        ...(options ?? [])
      ]
      await refused(project, approve([]), 'not_allowed', { env: claudeInPane })
      await refused(project, ['plan', 'approve', '--revision', '1', '--by', 'user'], 'stale_plan')
      await refused(project, approve(['--decide', 'PM5=include']), 'budget_unknown')
      await ok(project, ['plan', 'budget', '--gpu-hours', '335', '--by', 'user'])
      revision += 1
      await refused(project, approve([]), 'decision_missing')
      await refused(project, approve(['--decide', 'PM5=include']), 'over_budget')
      await refused(project, approve(['--decide', 'PM5=out-of-scope']), 'invalid_argument')
      const approved = await ok(
        project,
        approve([
          '--decide',
          'PM5=include',
          '--cut',
          'S3.sens-beta-M=sensitivity is cheap to add in the rebuttal',
          '--cut',
          'S4.masks=mask analysis is secondary'
        ])
      )
      assert.equal(approved.status, 'approved')
      assert.deepEqual(
        approved.proposals.map((item) => item.cell),
        ['S0.reproduce-B1', 'S0.reproduce-B2', 'S0.overfit-ours']
      )
      assert.deepEqual(
        approved.approval.consequences.requests.map((item) => item.id),
        ['PM3']
      )
      const listed = await ok(project, ['proposal', 'list', '--experiment', 'ts-aug-forecasting'])
      const [first] = listed.proposals
      assert.equal(first.state, 'pending')
      assert.equal(first.needsCode, true)
      assert.equal(first.agent.provider, 'claude-code')
      assert.deepEqual(first.plan, { id: 'ts-aug', revision, cell: 'S0.reproduce-B1' })
      const brief = await ok(project, ['brief', 'show', '--experiment', 'ts-aug-forecasting'])
      assert.equal(brief.brief.minSeeds, 5)
      assert.equal(brief.brief.primaryMetric.name, 'mse')
      const shown = await ok(project, ['plan', 'show'])
      assert.ok(
        shown.plan.scope.outOfScope.some(
          (entry) => entry.by === 'user' && entry.cell === 'S4.masks'
        )
      )
      const staged = await ok(project, ['plan', 'propose-stage', '--stage', 'S1', '--by', 'user'])
      assert.deepEqual(
        staged.proposals.map((item) => item.cell),
        ['S1.pilot-ours', 'S1.saturation-B1']
      )
      const twice = await ok(project, ['plan', 'propose-stage', '--stage', 'S1', '--by', 'user'])
      assert.deepEqual(twice.proposals, [])
      const overview = await ok(project, ['plan', 'overview'])
      assert.deepEqual(overview.cut.sort(), ['S3.sens-beta-M', 'S4.masks'])
      assert.equal(
        overview.cells.find((cell) => cell.cell === 'S1.pilot-ours').proposed.proposal,
        'proposal-3'
      )
      await ok(project, ['plan', 'set', '--merge', '--file', '-'], { input: { risks: [] } })
      await refused(
        project,
        ['plan', 'propose-stage', '--stage', 'S2', '--by', 'user'],
        'not_approved'
      )
    },
    (plan) => (plan.scope.compute = { source: 'unknown', hardware: '8x A100 40GB' })
  )
})

test('cutting cells shows which claims and likely reviewer demands lose their evidence', async () => {
  const plan = await exemplar()
  const promoted = planCellsView(plan).find((cell) => cell.cell === 'S4.cost')
  assert.equal(promoted.tier, 'should')
  assert.equal(promoted.effectiveTier, 'must')
  assert.deepEqual(promoted.promotedBy, ['PM5'])
  const generality = new Set(['S4.tstcc', 'S4.cost'])
  const lost = cutConsequences(plan, generality)
  assert.deepEqual(
    lost.claims.map((claim) => claim.id),
    ['C2']
  )
  assert.deepEqual(
    lost.requests.map((request) => [request.id, request.likelyDemand]),
    [['PM5', true]]
  )
  const totals = tierTotals(plan, generality)
  assert.deepEqual(
    totals.tiers.map((tier) => tier.tier),
    ['must', 'should', 'could']
  )
  assert.ok(totals.tiers[2].cumulativeGpuHours === totals.totalGpuHours)
  assert.equal(totals.budget.stated, true)
  assert.deepEqual(cutConsequences(plan, new Set()), { claims: [], weakened: [], requests: [] })
})
