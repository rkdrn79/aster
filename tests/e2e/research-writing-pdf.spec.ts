import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

const tectonicCache = path.join(os.homedir(), 'Library/Caches/TectonicProject.Tectonic')
test.skip(
  process.platform !== 'darwin' || !existsSync(tectonicCache),
  'Requires a macOS Tectonic package cache; cold download is tracked separately.'
)

test('Writing switches TeX files and compiles the main source into a real PDF reader', async ({
  orcaPage,
  electronApp,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  test.setTimeout(180_000)
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  // Keep the UI/PDF pipeline test deterministic while retaining a disposable
  // profile: only TeX package resources are copied, never Aster user data.
  const isolatedHome = await electronApp.evaluate(({ app }) => app.getPath('home'))
  await cp(tectonicCache, path.join(isolatedHome, 'Library/Caches/TectonicProject.Tectonic'), {
    recursive: true
  })
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
  const paperDir = path.join(workspacePath, 'paper-aster-e2e')
  await mkdir(paperDir, { recursive: true })
  await writeFile(
    path.join(paperDir, 'main.tex'),
    '\\documentclass{article}\n\\begin{document}\n\\input{section}\n\\end{document}\n'
  )
  await writeFile(path.join(paperDir, 'section.tex'), 'Aster manuscript PDF build.\n')
  let experimentId: string | null = null
  registerPostElectronShutdownCleanup(async () => {
    await rm(paperDir, { recursive: true, force: true })
    // Why: the worker's test repo is shared, so the research/ layout this spec creates must not leak.
    await rm(path.join(workspacePath, 'research'), { recursive: true, force: true })
    if (experimentId) {
      await rm(path.join(workspacePath, '.aster', 'latex-build', experimentId), {
        recursive: true,
        force: true
      })
    }
  })

  await orcaPage.setViewportSize({ width: 1440, height: 900 })
  await orcaPage.evaluate(async () => {
    await window.__store!.getState().updateSettingsOrThrow({ researchUiEnabled: true })
  })
  const navigation = orcaPage.getByRole('navigation', { name: 'Research navigation' })
  await navigation.getByRole('button', { name: 'Experiments', exact: true }).click()
  await navigation.getByRole('button', { name: 'Create experiment' }).click()
  await orcaPage.getByRole('textbox', { name: 'Experiment name' }).fill('Writing PDF test')
  await orcaPage.getByRole('button', { name: 'Create', exact: true }).click()
  experimentId =
    (await orcaPage.evaluate(() => window.api.researchRecords.read())).experiments[0]?.id ?? null
  await navigation.getByRole('button', { name: 'Writing', exact: true }).click()
  const writing = orcaPage.getByRole('region', { name: 'Research writing' })
  await writing.getByRole('button', { name: 'Manuscript options' }).click()
  await orcaPage.getByRole('menuitem', { name: 'Main TeX file…' }).click()
  await writing
    .getByRole('textbox', { name: 'Main TeX file path' })
    .fill('paper-aster-e2e/main.tex')
  await writing.getByRole('button', { name: 'Set main file' }).click()
  await expect(writing.getByRole('button', { name: 'Download PDF' })).toBeDisabled()
  const fileTree = writing.getByRole('navigation', { name: 'TeX file tree' })
  await expect(fileTree.getByRole('button', { name: 'main.tex' })).toBeVisible()
  await expect(fileTree.getByRole('button', { name: 'section.tex' })).toBeVisible()
  await fileTree.getByRole('button', { name: 'section.tex' }).click()
  await expect(writing.locator('button.editor-header-path')).toHaveAttribute(
    'title',
    path.join(paperDir, 'section.tex')
  )
  await writing.getByRole('button', { name: 'Compile PDF' }).click()
  await expect(writing.getByRole('button', { name: 'Compile PDF' })).toBeEnabled({
    timeout: 130_000
  })
  if (await writing.getByRole('button', { name: 'View log' }).isVisible()) {
    await writing.getByRole('button', { name: 'View log' }).click()
    throw new Error(await orcaPage.getByRole('dialog', { name: 'Build log' }).innerText())
  }
  await expect(writing.locator('.pdfViewer .page').first()).toBeVisible({ timeout: 60_000 })
  await expect(writing.getByText('No compiled PDF yet')).toHaveCount(0)
  const downloadedPdfPath = testInfo.outputPath('downloaded-main.pdf')
  await electronApp.evaluate(({ dialog }, destinationPath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: destinationPath })
  }, downloadedPdfPath)
  await writing.getByRole('button', { name: 'Download PDF' }).click()
  await expect(orcaPage.getByText('Saved downloaded-main.pdf')).toBeVisible()
  expect((await readFile(downloadedPdfPath)).subarray(0, 5).toString()).toBe('%PDF-')
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-writing-pdf-1440.png') })
})
