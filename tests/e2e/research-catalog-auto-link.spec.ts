import { execFileSync } from 'node:child_process'
import { appendFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('links a harness Run beneath its Experiment and respects Detach', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  test.setTimeout(120_000)
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  const workspacePath = await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    return Object.values(state.worktreesByRepo)
      .flat()
      .find((entry) => entry.id === state.activeWorktreeId)?.path
  })
  expect(workspacePath).toBeTruthy()
  if (!workspacePath) {
    return
  }
  registerPostElectronShutdownCleanup(async () => {
    // Why: the worker's test repo is shared, so this spec's catalog and template paper must not leak.
    await Promise.all([
      rm(path.join(workspacePath, '.aster'), { recursive: true, force: true }),
      rm(path.join(workspacePath, 'paper'), { recursive: true, force: true })
    ])
  })
  await orcaPage.evaluate(async () => {
    await window.__store!.getState().updateSettingsOrThrow({ researchUiEnabled: true })
  })
  const navigation = orcaPage.getByRole('navigation', { name: 'Research navigation' })
  await navigation.getByRole('button', { name: 'Create experiment' }).click()
  await navigation.getByRole('textbox', { name: 'Experiment name' }).fill('Auto tracked')
  await navigation.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(navigation.getByRole('button', { name: 'Auto tracked', exact: true })).toBeVisible()

  execFileSync(
    process.execPath,
    [
      path.join(process.cwd(), 'src/research-harness/cli.mjs'),
      'new-run',
      '--project',
      workspacePath,
      '--experiment',
      'auto-tracked',
      '--name',
      'Seed 42',
      '--id',
      'seed-42'
    ],
    { stdio: 'pipe' }
  )
  await appendFile(
    path.join(workspacePath, '.aster/experiments/auto-tracked/runs/seed-42/metrics.jsonl'),
    '{"schemaVersion":1,"runId":"seed-42","step":1,"metrics":{"loss":1.25}}\n'
  )
  // The sidebar entry opens the notebook; its Runs tab lists the Runs.
  await navigation.getByRole('button', { name: 'Auto tracked', exact: true }).click()
  const runs = orcaPage.getByRole('region', { name: 'Experiment', exact: true })
  await runs.getByRole('tab', { name: 'Runs' }).click()
  await expect(runs.getByRole('button', { name: 'Seed 42' })).toBeVisible({ timeout: 20_000 })
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-catalog-auto-linked-run.png') })

  await runs.getByRole('tab', { name: 'Notebook' }).click()
  const evidence = runs.getByRole('region', { name: 'Evidence check' })
  await evidence.getByRole('button', { name: 'Verify evidence' }).click()
  await expect(evidence.getByText('Needs review')).toBeVisible()
  await expect(evidence.getByText('Run auto-tracked/seed-42: unknown')).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-evidence-check.png') })
  await runs.getByRole('tab', { name: 'Runs' }).click()

  await runs.getByRole('button', { name: 'Seed 42' }).click()
  await runs.getByRole('button', { name: 'More run actions' }).click()
  await orcaPage.getByRole('menuitem', { name: 'Detach from experiment' }).click()
  await expect(runs.getByRole('button', { name: 'Seed 42' })).toHaveCount(0)
  await orcaPage.waitForTimeout(11_000)
  await expect(runs.getByRole('button', { name: 'Seed 42' })).toHaveCount(0)
})
