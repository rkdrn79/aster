import { spawnSync } from 'node:child_process'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { researchExperimentBriefResultSchema } from '../../src/shared/research/research-experiment-brief'
import { researchProposalListSchema } from '../../src/shared/research/research-proposals'
import {
  researchFindingListSchema,
  researchFindingSchema
} from '../../src/shared/research/research-quality-findings'
import { researchSampleRatingListSchema } from '../../src/shared/research/research-sample-ratings'
import { expect, test } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

const CLI = path.join(process.cwd(), 'src/research-harness/cli.mjs')
const SLUG = 'quality-check'

const okSchema = z.object({ ok: z.literal(true) })

/** Runs the harness CLI and checks its JSON result against the shared contract. */
function harness<T>(project: string, args: string[], schema: z.ZodType<T>): T {
  const result = spawnSync(process.execPath, [CLI, ...args, '--project', project, '--json'], {
    encoding: 'utf8'
  })
  return schema.parse(JSON.parse(result.stdout.trim().split('\n').pop() ?? '{}'))
}

test('Experiment notebook: plan, rule and agent findings, dismissal, proposal approval, A/B rating', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  test.setTimeout(240_000)
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  const project = await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    return Object.values(state.worktreesByRepo)
      .flat()
      .find((entry) => entry.id === state.activeWorktreeId)?.path
  })
  expect(project).toBeTruthy()
  if (!project) {
    return
  }
  registerPostElectronShutdownCleanup(async () => {
    // Why: the worker's test repo is shared, so the .aster/ records this spec creates must not leak.
    await rm(path.join(project, '.aster'), { recursive: true, force: true })
  })
  await orcaPage.evaluate(async () => {
    await window.__store!.getState().updateSettingsOrThrow({ researchUiEnabled: true })
  })
  const navigation = orcaPage.getByRole('navigation', { name: 'Research navigation' })
  await navigation.getByRole('button', { name: 'Create experiment' }).click()
  await navigation.getByRole('textbox', { name: 'Experiment name' }).fill('Quality check')
  await navigation.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(navigation.getByRole('button', { name: 'Quality check', exact: true })).toBeVisible()

  const newRunSchema = okSchema.extend({ paths: z.object({ run: z.string() }) })
  for (const [id, name, acc, outputs] of [
    ['base', 'Base', '0.80', ['four', 'Paris is in France.', 'blue']],
    ['cand', 'Cand', '0.83', ['4', 'Paris, France.', 'The sky is blue.']]
  ] as const) {
    const created = harness(
      project,
      ['new-run', '--experiment', SLUG, '--name', name, '--id', id, '--metric-def', 'acc:maximize'],
      newRunSchema
    )
    harness(
      project,
      ['run', 'log-metric', '--run', `${SLUG}/${id}`, '--step', '100', `acc=${acc}`],
      okSchema
    )
    await writeFile(
      path.join(created.paths.run, 'outputs.jsonl'),
      ['2+2?', 'Where is Paris?', 'Sky colour?']
        .map(
          (prompt, index) =>
            `${JSON.stringify({ sampleId: `s-${index + 1}`, prompt, output: outputs[index] })}\n`
        )
        .join('')
    )
    harness(
      project,
      ['run', 'finish', '--run', `${SLUG}/${id}`, '--status', 'succeeded', '--exit-code', '0'],
      okSchema
    )
  }
  harness(
    project,
    ['new-run', '--experiment', SLUG, '--name', 'Broken', '--id', 'broken'],
    okSchema
  )
  harness(
    project,
    [
      'run',
      'finish',
      '--run',
      `${SLUG}/broken`,
      '--status',
      'failed',
      '--exit-code',
      '1',
      '--note',
      'CUDA OOM'
    ],
    okSchema
  )

  // The sidebar entry opens the Experiment's notebook; the header's page tabs drill into its Runs.
  await navigation.getByRole('button', { name: 'Quality check', exact: true }).click()
  const workspace = orcaPage.getByRole('region', { name: 'Experiment', exact: true })
  const tabs = workspace.getByRole('tablist', { name: 'Experiment pages' })
  await tabs.getByRole('tab', { name: 'Runs' }).click()
  const runsTab = workspace.getByRole('tabpanel', { name: 'Runs', exact: true })
  for (const name of ['Base', 'Cand', 'Broken']) {
    await expect(runsTab.getByRole('button', { name: new RegExp(`^${name}\\b`) })).toBeVisible({
      timeout: 30_000
    })
  }

  // Plan: write it in the notebook, then confirm the harness reads the same values.
  await tabs.getByRole('tab', { name: 'Notebook' }).click()
  const plan = workspace.getByRole('region', { name: 'Plan' })
  await expect(plan.getByRole('button', { name: 'Design with the agent' })).toBeVisible({
    timeout: 20_000
  })
  await plan.getByRole('button', { name: 'Write plan' }).click()
  await plan.getByLabel('Question').fill('Does Cand beat Base on acc?')
  await plan.getByLabel('Primary metric').fill('acc')
  await plan.getByRole('combobox', { name: 'Baseline Run' }).click()
  await orcaPage.getByRole('option', { name: 'Base', exact: true }).click()
  await plan.getByRole('button', { name: 'Save plan' }).click()
  await expect(plan.getByText('Does Cand beat Base on acc?', { exact: true })).toBeVisible()
  const shown = harness(
    project,
    ['brief', 'show', '--experiment', SLUG],
    researchExperimentBriefResultSchema
  )
  expect(shown.brief?.baseline).toBe(`${SLUG}/base`)
  expect(shown.brief?.primaryMetric?.name).toBe('acc')

  // The failed Run and its rule finding are one Needs-you item.
  const attention = workspace.getByRole('region', { name: 'Needs you' })
  const failedRun = attention.getByRole('listitem').filter({ hasText: 'Broken failed' })
  await expect(failedRun.getByText(/^Exited with code 1\b/)).toBeVisible({
    timeout: 30_000
  })

  // An agent finding written through the CLI appears in the panel.
  const added = harness(
    project,
    [
      'quality',
      'add',
      '--experiment',
      SLUG,
      '--check',
      'eval.gain-suspicious',
      '--severity',
      'warn',
      '--text',
      'Gain over baseline is within single-seed noise',
      '--run',
      `${SLUG}/cand`,
      '--created-by',
      'agent',
      '--evidence',
      JSON.stringify({ kind: 'metric', run: `${SLUG}/cand`, metric: 'acc', split: null, step: 100 })
    ],
    okSchema.extend({ finding: researchFindingSchema })
  )
  const agentText = attention.getByText('Gain over baseline is within single-seed noise', {
    exact: true
  })
  await expect(agentText).toBeVisible({ timeout: 30_000 })

  // Dismiss it as the user; it stays dismissed across polling.
  const row = attention
    .getByRole('listitem')
    .filter({ hasText: 'Gain over baseline is within single-seed noise' })
  await row.getByRole('button', { name: 'Dismiss' }).click()
  const dialog = orcaPage.getByRole('dialog')
  await dialog.getByLabel('Note (optional)').fill('Seeds overlap; expected')
  await dialog.getByRole('button', { name: 'Dismiss' }).click()
  await expect(agentText).toHaveCount(0, { timeout: 15_000 })
  await orcaPage.waitForTimeout(11_000)
  await expect(agentText).toHaveCount(0)
  const dismissed = harness(
    project,
    ['quality', 'list', '--experiment', SLUG, '--status', 'dismissed'],
    researchFindingListSchema
  )
  expect(dismissed.findings.map((entry) => entry.id)).toContain(added.finding.id)

  // A pending proposal waits in Needs you; once approved it is a planned Run.
  const proposed = harness(
    project,
    [
      'proposal',
      'add',
      '--experiment',
      SLUG,
      '--title',
      'Rerun Cand with 3 seeds',
      '--rationale',
      `Single seed; see ${added.finding.id}`,
      '--command',
      `node ${CLI} run exec --experiment ${SLUG} --name "Cand seed 2" -- python train.py --seed 2`,
      '--run',
      `${SLUG}/cand`
    ],
    okSchema
  )
  expect(proposed.ok).toBe(true)
  const proposal = attention.getByRole('listitem').filter({ hasText: 'Rerun Cand with 3 seeds' })
  await expect(proposal).toBeVisible({ timeout: 30_000 })
  await proposal.getByRole('button', { name: 'Approve' }).click()
  await expect(proposal).toHaveCount(0, { timeout: 15_000 })
  await expect(
    plan.getByRole('listitem', { name: 'Planned run Rerun Cand with 3 seeds' })
  ).toContainText('Approved')
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-experiment-notebook.png') })
  const approved = harness(
    project,
    ['proposal', 'list', '--experiment', SLUG, '--state', 'approved'],
    researchProposalListSchema
  )
  expect(approved.proposals).toHaveLength(1)

  // The docked chat offers the agent's requests; nothing launches until one is clicked.
  const agentRequests = workspace.getByRole('group', { name: 'Ask the experiment agent' })
  for (const label of ['Design', 'Analyze', 'Explain failure']) {
    await expect(agentRequests.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  // A narrow pane folds the rest into one menu so the row never wraps.
  const moreRequests = agentRequests.getByRole('button', { name: 'More requests' })
  if (await moreRequests.isVisible()) {
    await moreRequests.click()
    for (const label of ['Next run', 'Full review']) {
      await expect(orcaPage.getByRole('menuitem', { name: label })).toBeVisible()
    }
    await orcaPage.keyboard.press('Escape')
  } else {
    for (const label of ['Next run', 'Full review']) {
      await expect(agentRequests.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
  }

  // The plan's baseline is always compared; checking Cand adds it to Compare and Outputs.
  await tabs.getByRole('tab', { name: 'Runs' }).click()
  await expect(runsTab.getByRole('checkbox', { name: 'Compare Base' })).toBeChecked()
  const candidate = runsTab.getByRole('checkbox', { name: 'Compare Cand' })
  await candidate.click()
  await expect(candidate).toBeChecked()
  await workspace.getByRole('button', { name: 'Compare selected (2)' }).click()
  const compareTab = workspace.getByRole('tabpanel', { name: 'Compare', exact: true })
  await expect(compareTab.getByRole('combobox', { name: 'Baseline' })).toContainText('Base')
  await expect(compareTab.getByRole('columnheader', { name: /Base · baseline/ })).toBeVisible({
    timeout: 30_000
  })

  // A/B rating on the Outputs tab: A is the baseline.
  await tabs.getByRole('tab', { name: 'Outputs' }).click()
  const outputs = workspace.getByRole('tabpanel', { name: 'Outputs', exact: true })
  const qualitative = outputs.getByRole('region', { name: 'Qualitative output comparison' })
  await expect(qualitative.getByText('four', { exact: true })).toBeVisible({ timeout: 30_000 })
  await qualitative.getByRole('button', { name: 'A/B' }).click()
  await qualitative.getByRole('button', { name: /B better/ }).click()
  await expect(qualitative.getByText(/small sample/i)).toBeVisible({ timeout: 15_000 })
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-experiment-quality-ab.png') })
  const rated = harness(
    project,
    ['rate', 'list', '--experiment', SLUG],
    researchSampleRatingListSchema
  )
  expect(rated.ratings).toHaveLength(1)
  expect(rated.ratings[0]).toMatchObject({
    by: 'user',
    mode: 'pairwise',
    run: `${SLUG}/base`,
    against: `${SLUG}/cand`,
    verdict: 'b'
  })
})
