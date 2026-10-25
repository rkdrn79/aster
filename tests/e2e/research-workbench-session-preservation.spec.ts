import { rm } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { ensureTerminalVisible, waitForSessionReady, waitForActiveWorktree } from './helpers/store'
import { waitForActivePanePtyId, waitForActiveTerminalManager } from './helpers/terminal'

test('Research views preserve the existing workspace PTY and allow returning to Orca', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  test.setTimeout(120_000)
  await waitForSessionReady(orcaPage)
  const workspaceId = await waitForActiveWorktree(orcaPage)
  // Why: the Research layout seeds no shell, so the PTY under test is opened on purpose.
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage, 30_000)
  const ptyId = await waitForActivePanePtyId(orcaPage)
  const workspacePath = await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    return Object.values(state.worktreesByRepo)
      .flat()
      .find((entry) => entry.id === state.activeWorktreeId)?.path
  })
  expect(workspacePath).toBeTruthy()
  if (workspacePath) {
    registerPostElectronShutdownCleanup(async () => {
      // Why: the worker's test repo is shared, so the .aster/ records this spec creates must not leak.
      await rm(path.join(workspacePath, '.aster'), { recursive: true, force: true })
    })
  }

  await orcaPage.getByRole('radio', { name: 'Research' }).click()
  const navigation = orcaPage.getByRole('navigation', { name: 'Research navigation' })
  await expect(navigation).toBeVisible()
  await expect(orcaPage.getByRole('heading', { name: 'Workbench', exact: true })).toBeVisible()
  await expect(orcaPage.getByRole('region', { name: 'Conversations' })).toBeVisible()
  expect(
    await orcaPage.evaluate(async () => (await window.api.settings.get()).experimentalNativeChat)
  ).toBe(true)
  await expect(navigation.getByRole('button', { name: 'Create experiment' })).toBeVisible()
  await orcaPage.setViewportSize({ width: 1280, height: 800 })
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-workbench-1280.png') })
  await orcaPage.evaluate(async () => {
    await window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' })
  })
  await expect(orcaPage.locator('html')).toHaveClass(/dark/)
  await orcaPage.setViewportSize({ width: 1440, height: 900 })
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-workbench-dark-1440.png') })
  await orcaPage.setViewportSize({ width: 900, height: 700 })
  expect(
    await orcaPage
      .locator('[data-research-workbench] h1')
      .evaluate((heading) => heading.scrollWidth <= heading.clientWidth)
  ).toBe(true)
  const titleBox = await orcaPage.locator('[data-research-workbench] h1').boundingBox()
  const actionsBox = await orcaPage
    .locator('[data-research-workbench] [data-research-page-actions]')
    .boundingBox()
  expect(titleBox && actionsBox).toBeTruthy()
  if (titleBox && actionsBox) {
    expect(
      titleBox.x + titleBox.width <= actionsBox.x || titleBox.y + titleBox.height <= actionsBox.y
    ).toBe(true)
  }
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-workbench-narrow-900.png') })
  await orcaPage.setViewportSize({ width: 1280, height: 800 })
  await expect(orcaPage.locator('[data-terminal-workbench-container]')).toHaveAttribute(
    'aria-hidden',
    'false'
  )
  expect(await waitForActivePanePtyId(orcaPage)).toBe(ptyId)
  // Why: Runs and Compare are page tabs in the selected experiment's header.
  await navigation.getByRole('button', { name: 'Create experiment' }).click()
  await navigation.getByRole('textbox', { name: 'Experiment name' }).fill('Preservation check')
  await navigation.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(
    navigation.getByRole('button', { name: 'Preservation check', exact: true })
  ).toBeVisible()
  await navigation.getByRole('button', { name: 'Preservation check', exact: true }).click()
  const experimentPages = orcaPage.getByRole('tablist', { name: 'Experiment pages' })
  await experimentPages.getByRole('tab', { name: 'Runs' }).click()
  await expect(orcaPage.getByRole('tabpanel', { name: 'Runs' })).toBeVisible()
  await expect(orcaPage.locator('[data-terminal-workbench-container]')).toHaveAttribute(
    'aria-hidden',
    'true'
  )
  await experimentPages.getByRole('tab', { name: 'Compare' }).click()
  await expect(orcaPage.getByRole('tabpanel', { name: 'Compare' })).toBeVisible()
  await navigation.getByRole('button', { name: 'Workbench' }).click()
  await expect(orcaPage.locator('[data-research-workbench]')).toBeVisible()
  await expect(orcaPage.locator('[data-terminal-workbench-container]')).toHaveAttribute(
    'aria-hidden',
    'false'
  )
  expect(await waitForActivePanePtyId(orcaPage)).toBe(ptyId)
  expect(await orcaPage.evaluate(() => window.__store!.getState().activeWorktreeId)).toBe(
    workspaceId
  )

  await orcaPage.evaluate(async () => {
    await window.__store!.getState().updateSettingsOrThrow({ researchUiEnabled: false })
  })
  await expect(navigation).toHaveCount(0)
  await expect(orcaPage.locator('[data-terminal-workbench-container]')).toHaveAttribute(
    'aria-hidden',
    'false'
  )
  expect(await waitForActivePanePtyId(orcaPage)).toBe(ptyId)
})

test('Aster logo opens the research home and keeps the workspace available', async ({
  orcaPage
}, testInfo) => {
  test.setTimeout(120_000)
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await orcaPage.getByRole('radio', { name: 'Research' }).click()
  await expect(orcaPage.locator('[data-terminal-workbench-container]')).toHaveAttribute(
    'aria-hidden',
    'false'
  )
  expect(
    await orcaPage.evaluate(async () => (await window.api.settings.get()).experimentalNativeChat)
  ).toBe(true)

  await orcaPage.getByRole('button', { name: 'Aster home' }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Home' })).toBeVisible()
  await expect(orcaPage.getByRole('region', { name: 'Projects' })).toBeVisible()
  await expect(orcaPage.getByRole('region', { name: 'Deadlines' })).toBeVisible()
  await expect(orcaPage.getByRole('region', { name: 'Compute' })).toBeVisible()
  const compute = orcaPage.getByRole('region', { name: 'Compute' })
  await expect(compute.getByText('No remote compute linked yet.')).toBeVisible()
  await expect(compute.getByRole('button', { name: 'Link compute' })).toBeVisible()
  await orcaPage.setViewportSize({ width: 1280, height: 800 })
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-home-1280.png') })
  await orcaPage.setViewportSize({ width: 900, height: 700 })
  await expect(orcaPage.getByRole('region', { name: 'Deadlines' })).toBeInViewport()
  await expect(orcaPage.getByRole('region', { name: 'Compute' })).toBeInViewport()
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-home-900.png') })
  await orcaPage.getByRole('region', { name: 'Projects' }).getByRole('button').first().click()
  await expect(orcaPage.getByRole('region', { name: 'Conversations' })).toBeVisible()

  await orcaPage.reload()
  await waitForSessionReady(orcaPage)
  await expect(orcaPage.getByRole('navigation', { name: 'Aster home' })).toBeVisible()
  await orcaPage.getByRole('region', { name: 'Projects' }).getByRole('button').first().click()
  await expect(orcaPage.getByRole('region', { name: 'Conversations' })).toBeVisible()
  await expect(orcaPage.locator('[data-terminal-workbench-container]')).toHaveAttribute(
    'aria-hidden',
    'false'
  )
  expect(
    await orcaPage.evaluate(async () => (await window.api.settings.get()).experimentalNativeChat)
  ).toBe(true)
})
