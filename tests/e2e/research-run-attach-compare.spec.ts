import { appendFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('attaches real local results, compares observations, and persists research metadata', async ({
  orcaPage,
  electronApp,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  // Why longer on Windows: each action takes ~2s on the hosted Windows runner, shown or hidden.
  test.setTimeout(process.platform === 'win32' ? 300_000 : 120_000)
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
  const first = path.join(workspacePath, 'research-baseline.jsonl')
  const baselineLog = path.join(workspacePath, 'research-baseline.log')
  const second = path.join(workspacePath, 'research-candidate.csv')
  const baselineManifest = path.join(workspacePath, 'research-baseline-run.json')
  const candidateManifest = path.join(workspacePath, 'research-candidate-run.json')
  const wrongManifest = path.join(workspacePath, 'research-wrong-run.json')
  const baselineOutputs = path.join(workspacePath, 'research-baseline-outputs.jsonl')
  const candidateOutputs = path.join(workspacePath, 'research-candidate-outputs.jsonl')
  const outputImage = path.join(workspacePath, 'research-output.png')
  const baselineEvents = `${Array.from(
    { length: 5_000 },
    (_, index) => `{"schemaVersion":1,"runId":"baseline","step":${index + 1},"metrics":{"loss":0}}`
  ).join('\n')}\n`
  const candidateEvents = 'epoch,loss,note\n1,0.5,first\n2,0.4,second\n'
  expect(Buffer.byteLength(baselineEvents)).toBeGreaterThan(256 * 1024)
  await writeFile(first, baselineEvents)
  await writeFile(baselineLog, `${'x'.repeat(11 * 1024 * 1024)}\nTAIL_MARKER\n`)
  await writeFile(second, candidateEvents)
  await writeFile(
    baselineOutputs,
    `${JSON.stringify({ sampleId: 'sample-1', prompt: 'Describe this image', output: 'A small square', imagePath: 'research-output.png' })}\n`
  )
  await writeFile(
    candidateOutputs,
    `${JSON.stringify({ sampleId: 'sample-1', prompt: 'Describe this image', output: 'A blue pixel' })}\n`
  )
  await writeFile(
    outputImage,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
      'base64'
    )
  )
  await writeFile(wrongManifest, '{"schemaVersion":1,"externalRunId":"other"}')
  await writeFile(
    baselineManifest,
    JSON.stringify({
      schemaVersion: 1,
      externalRunId: 'baseline',
      execution: {
        state: 'succeeded',
        reportedBy: 'manifest',
        observedAt: '2026-10-22T10:00:00Z'
      },
      code: { commit: 'a'.repeat(40), dirty: false, capturePhase: 'at_launch' },
      metrics: {
        definitions: { loss: { unit: 'scalar', aggregation: 'last', direction: 'minimize' } }
      },
      evaluation: {
        datasetId: 'eval',
        datasetRevision: 'v1',
        split: 'validation',
        evaluatorRevision: 'e1'
      }
    })
  )
  await writeFile(
    candidateManifest,
    JSON.stringify({
      schemaVersion: 1,
      code: { commit: 'b'.repeat(40), dirty: false, capturePhase: 'at_attach' },
      metrics: {
        definitions: { loss: { unit: 'fraction', aggregation: 'last', direction: 'minimize' } }
      },
      evaluation: {
        datasetId: 'eval',
        datasetRevision: 'v1',
        split: 'validation',
        evaluatorRevision: 'e1'
      }
    })
  )
  registerPostElectronShutdownCleanup(async () => {
    await Promise.all(
      [
        first,
        baselineLog,
        second,
        baselineManifest,
        candidateManifest,
        wrongManifest,
        baselineOutputs,
        candidateOutputs,
        outputImage
      ].map((file) => rm(file, { force: true }))
    )
    // Why: the worker's test repo is shared, so the .aster/ records this spec creates must not leak.
    await rm(path.join(workspacePath, '.aster'), { recursive: true, force: true })
  })
  await orcaPage.evaluate(async () => {
    await window.__store!.getState().updateSettingsOrThrow({ researchUiEnabled: true })
  })
  const navigation = orcaPage.getByRole('navigation', { name: 'Research navigation' })
  await navigation.getByRole('button', { name: 'Create experiment' }).click()
  await navigation.getByRole('textbox', { name: 'Experiment name' }).fill('Baseline comparison')
  await navigation.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(
    navigation.getByRole('button', { name: 'Baseline comparison', exact: true })
  ).toBeVisible()
  await navigation.getByRole('button', { name: 'Baseline comparison', exact: true }).click()
  // Why the whole workspace: the attach form sits above the Run list in the Runs details.
  const runs = orcaPage.getByRole('region', { name: 'Experiment', exact: true })

  /** Attach run lives in the Experiment's overflow menu; it opens the Runs details with the form. */
  async function openAttachForm(): Promise<void> {
    await runs.getByRole('button', { name: 'More experiment actions' }).click()
    await orcaPage.getByRole('menuitem', { name: 'Attach run' }).click()
  }

  /** Switching Experiments in the sidebar keeps the Runs details page on screen. */
  async function openDetails(experiment: string): Promise<void> {
    await navigation.getByRole('button', { name: experiment, exact: true }).click()
    await expect(runs.getByRole('heading', { name: experiment, level: 1 })).toBeVisible()
    await expect(runs.getByRole('tab', { name: 'Runs', selected: true })).toBeVisible()
  }

  async function attach(name: string, filePath: string, manifestPath: string): Promise<void> {
    await openAttachForm()
    await expect(runs.getByRole('button', { name: 'Choose local file' })).toBeVisible()
    if (name === 'Baseline') {
      await electronApp.evaluate(({ ipcMain }, selectedPath) => {
        ipcMain.removeHandler('shell:pickAttachment')
        ipcMain.handle('shell:pickAttachment', () => selectedPath)
      }, filePath)
      await runs.getByRole('button', { name: 'Choose local file' }).click()
      await expect(runs.getByRole('textbox', { name: 'Metrics file path' })).toHaveValue(filePath)
      await expect(runs.getByRole('textbox', { name: 'Run name' })).toHaveValue('research-baseline')
    }
    await runs.getByRole('textbox', { name: 'Run name' }).fill(name)
    await runs.getByRole('textbox', { name: 'Metrics file path' }).fill(filePath)
    await runs
      .getByRole('textbox', { name: 'Model outputs JSONL path' })
      .fill(name === 'Baseline' ? baselineOutputs : candidateOutputs)
    if (name === 'Baseline') {
      await runs.getByRole('textbox', { name: 'Log file path' }).fill(baselineLog)
    }
    if (name === 'Baseline') {
      await runs.getByRole('textbox', { name: 'Run manifest path' }).fill(wrongManifest)
      await runs.getByRole('button', { name: 'Preview source' }).click()
      await expect(runs.getByRole('alert').getByText(/metrics file is from run/)).toBeVisible()
      await expect(runs.getByRole('button', { name: 'Attach', exact: true })).toBeDisabled()
    }
    await runs.getByRole('textbox', { name: 'Run manifest path' }).fill(manifestPath)
    await runs.getByRole('button', { name: 'Preview source' }).click()
    await expect(runs.getByText(/numeric values/)).toBeVisible()
    await expect(runs.getByText(/run.json matches/)).toBeVisible()
    if (name === 'Candidate') {
      await expect(runs.getByRole('checkbox', { name: 'Include metric note' })).not.toBeChecked()
      await runs.getByRole('combobox', { name: 'CSV x-axis' }).click()
      await orcaPage.getByRole('option', { name: 'epoch' }).click()
      await expect(runs.getByRole('button', { name: 'Attach', exact: true })).toBeDisabled()
      await runs.getByRole('button', { name: 'Preview source' }).click()
      await expect(runs.getByText(/x-axis: epoch/)).toBeVisible()
      await orcaPage.setViewportSize({ width: 1280, height: 800 })
      await orcaPage.screenshot({ path: testInfo.outputPath('aster-csv-mapping-1280.png') })
    }
    await runs.getByRole('button', { name: 'Attach', exact: true }).click()
    await expect(runs.getByRole('button', { name, exact: true })).toBeVisible()
  }

  await attach('Baseline', first, baselineManifest)
  await expect(runs.getByText(/Succeeded\s*·\s*from run\.json/)).toBeVisible()
  await expect(runs.getByRole('table').getByText('0', { exact: true }).first()).toBeVisible()
  await expect(runs.getByText('Log · last 256 KiB')).toBeVisible()
  await expect(runs.getByText('TAIL_MARKER')).toBeVisible()
  const logSearch = runs.getByRole('textbox', { name: 'Search loaded log tail' })
  await logSearch.fill('tail_marker')
  await expect(runs.getByText(/Showing 1 of 1 matching line/)).toBeVisible()
  await logSearch.fill('no-such-line')
  await expect(runs.getByText('No matching lines.')).toBeVisible()
  await logSearch.fill('')
  await orcaPage.setViewportSize({ width: 1280, height: 800 })
  await runs.getByText('TAIL_MARKER').scrollIntoViewIfNeeded()
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-log-tail-1280.png') })
  await rm(first)
  await runs.getByRole('button', { name: 'Refresh' }).click()
  await expect(runs.getByRole('alert').getByText(/showing the last read/)).toBeVisible()
  await expect(runs.getByText(/Succeeded\s*·.*couldn't refresh/)).toBeVisible()
  await expect(runs.getByText('TAIL_MARKER')).toBeVisible()
  await writeFile(first, baselineEvents)
  await runs.getByRole('button', { name: 'Refresh' }).click()
  await expect(runs.getByRole('alert').getByText(/showing the last read/)).toHaveCount(0)
  await writeFile(first, '{"schemaVersion":1,"runId":"other","metrics":{"loss":2}}\n')
  await runs.getByRole('button', { name: 'Refresh' }).click()
  await expect(runs.getByRole('alert').getByText(/belongs to a different run/)).toBeVisible()
  await expect(runs.getByText(/metrics file changed/)).toBeVisible()
  await expect(runs.getByRole('table').getByText('5000', { exact: true })).toBeVisible()
  await writeFile(first, baselineEvents)
  await runs.getByRole('button', { name: 'Refresh' }).click()
  await expect(runs.getByRole('alert').getByText(/belongs to a different run/)).toHaveCount(0)
  await expect(runs.getByText(/Succeeded\s*·\s*from run\.json/)).toBeVisible()
  await rm(baselineLog)
  await runs.getByRole('button', { name: 'Refresh' }).click()
  await expect(runs.getByText("Log · couldn't refresh")).toBeVisible()
  await expect(runs.getByText('TAIL_MARKER')).toBeVisible()
  await attach('Candidate', second, candidateManifest)
  const candidateSummary = runs
    .getByRole('button', { name: 'Candidate', exact: true })
    .locator('..')
  await appendFile(second, '3,0.3,third\n')
  await runs.getByRole('button', { name: 'Refresh' }).click()
  await expect(candidateSummary.getByText(/updated /)).toBeVisible()
  await writeFile(second, 'epoch,loss,note\n1,0.9,first\n2,0.8,second\n')
  await runs.getByRole('button', { name: 'Refresh' }).click()
  await expect(runs.getByRole('alert').getByText(/was replaced since/)).toBeVisible()
  await expect(candidateSummary.getByText(/metrics file changed/)).toBeVisible()
  await writeFile(second, candidateEvents)
  await runs.getByRole('button', { name: 'Refresh' }).click()
  await expect(runs.getByRole('alert').getByText(/was replaced since/)).toHaveCount(0)
  // Why: a healthy Run's list row shows its status alone; the source is named in its inspector.
  await expect(
    runs.getByRole('button', { name: 'Baseline', exact: true }).locator('..').getByText('Succeeded')
  ).toBeVisible()
  const runSearch = runs.getByRole('textbox', { name: 'Find a Run or source' })
  await runSearch.fill('research-baseline.jsonl')
  await expect(runs.getByRole('button', { name: 'Baseline', exact: true })).toBeVisible()
  await expect(runs.getByRole('button', { name: 'Candidate', exact: true })).toHaveCount(0)
  await expect(runs.getByText('Candidate is hidden by the filter.')).toBeVisible()
  await runSearch.fill('')
  await runs.getByRole('combobox', { name: 'Filter Runs by recorded status' }).click()
  await orcaPage.getByRole('option', { name: 'Succeeded' }).click()
  await expect(runs.getByRole('button', { name: 'Candidate', exact: true })).toHaveCount(0)
  await expect(runs.getByText('Candidate is hidden by the filter.')).toBeVisible()
  await runs.getByRole('button', { name: 'Clear filters' }).click()
  await expect(runs.getByRole('button', { name: 'Candidate', exact: true })).toBeVisible()
  await expect(runs.getByRole('button', { name: 'Candidate', exact: true })).toHaveAttribute(
    'aria-current',
    'true'
  )
  await orcaPage.setViewportSize({ width: 1280, height: 800 })
  await runs.getByRole('button', { name: 'Candidate', exact: true }).scrollIntoViewIfNeeded()
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-run-list-1280.png') })
  await orcaPage.setViewportSize({ width: 900, height: 700 })
  await expect(runs.getByRole('button', { name: 'Candidate', exact: true })).toBeVisible()
  expect(
    await runs.evaluate((element) => element.scrollWidth <= element.clientWidth),
    'Runs page should fit a 900px window without horizontal scrolling'
  ).toBe(true)
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-runs-narrow-900.png') })
  await orcaPage.setViewportSize({ width: 1280, height: 800 })
  await runs.getByRole('checkbox', { name: 'Compare Baseline' }).click()
  await expect(runs.getByRole('checkbox', { name: 'Compare Baseline' })).toBeChecked()
  await runs.getByRole('checkbox', { name: 'Compare Candidate' }).click()
  await expect(runs.getByRole('checkbox', { name: 'Compare Candidate' })).toBeChecked()
  await runs.getByRole('button', { name: 'Compare selected (2)' }).click()
  const compare = runs.getByRole('tabpanel', { name: 'Compare', exact: true })
  await expect(
    compare.getByRole('table').getByText("Can't compare: different metric unit")
  ).toBeVisible()
  await compare.getByText('Details', { exact: true }).click()
  const details = compare
    .locator('details')
    .filter({ has: orcaPage.getByText('Details', { exact: true }) })
  await expect(details.getByText(/Code at launch: unknown/)).toBeVisible()
  await expect(compare.getByRole('table').getByText('0.0000 scalar', { exact: true })).toBeVisible()
  await compare.getByRole('radio', { name: 'Best observed' }).click()
  await expect(compare.getByRole('columnheader', { name: 'Metric · best observed' })).toBeVisible()
  await compare.getByRole('radio', { name: 'Last observed' }).click()
  await compare.getByText('Markdown summary', { exact: true }).click()
  await expect(compare.getByText('Metric source:', { exact: false }).first()).toBeVisible()
  await orcaPage.setViewportSize({ width: 1280, height: 800 })
  await orcaPage.screenshot({ path: testInfo.outputPath('aster-compare-1280.png') })
  await runs.getByRole('tab', { name: 'Outputs' }).click()
  const outputs = runs.getByRole('tabpanel', { name: 'Outputs', exact: true })
  const qualitative = outputs.getByRole('region', { name: 'Qualitative output comparison' })
  await expect(qualitative.getByRole('combobox', { name: 'Sample ID' })).toHaveValue('sample-1')
  await expect(qualitative.getByText('A small square')).toBeVisible()
  await expect(qualitative.getByText('A blue pixel')).toBeVisible()
  await expect(qualitative.getByRole('img', { name: /Baseline/ })).toBeVisible()
  await runs.getByRole('tab', { name: 'Runs' }).click()
  const stored = await orcaPage.evaluate(() => window.api.researchRecords.read())
  expect(stored.experiments).toHaveLength(1)
  expect(stored.runs).toHaveLength(2)
  expect(stored.runs[0]?.sourceRunId).toBe('baseline')
  expect(stored.runs[0]?.sourceAnchor?.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(stored.runs[1]?.sourceAnchor?.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(stored.runs[1]?.csvMapping).toEqual({ xColumn: 'epoch', metricColumns: ['loss'] })
  expect(stored.comparisonRunIds).toHaveLength(2)

  await navigation.getByRole('button', { name: 'Create experiment' }).click()
  await navigation.getByRole('textbox', { name: 'Experiment name' }).fill('Second experiment')
  await navigation.getByRole('button', { name: 'Create', exact: true }).click()
  await openDetails('Second experiment')
  await expect(runs.getByText(/No runs yet/)).toBeVisible()
  // The notebook/details shortcut toggles between the notebook and the last Details page.
  await orcaPage.keyboard.press('ControlOrMeta+Shift+K')
  await expect(runs.getByRole('tab', { name: 'Notebook', selected: true })).toBeVisible()
  await orcaPage.keyboard.press('ControlOrMeta+Shift+K')
  await expect(runs.getByRole('tab', { name: 'Runs', selected: true })).toBeVisible()
  await openDetails('Baseline comparison')
  await expect(runs.getByRole('button', { name: 'Candidate', exact: true })).toHaveAttribute(
    'aria-current',
    'true'
  )
  await runs.getByRole('button', { name: 'Baseline', exact: true }).click()
  await navigation.getByRole('button', { name: 'Second experiment', exact: true }).click()
  await openDetails('Baseline comparison')
  await expect(runs.getByRole('button', { name: 'Baseline', exact: true })).toHaveAttribute(
    'aria-current',
    'true'
  )

  await electronApp.evaluate(({ ipcMain }, selectedPath) => {
    ipcMain.removeHandler('shell:pickAttachment')
    ipcMain.handle(
      'shell:pickAttachment',
      () =>
        new Promise<string | null>((resolve) => {
          ipcMain.once('aster:test:releasePicker', () => resolve(selectedPath))
        })
    )
  }, first)
  await openAttachForm()
  await runs.getByRole('textbox', { name: 'Run name' }).fill('Unattached draft')
  await runs.getByRole('button', { name: 'Choose local file' }).click()
  await expect(runs.getByRole('button', { name: 'Choosing…' })).toBeDisabled()
  await expect
    .poll(() =>
      electronApp.evaluate(({ ipcMain }) => ipcMain.listenerCount('aster:test:releasePicker'))
    )
    .toBe(1)
  await navigation.getByRole('button', { name: 'Second experiment', exact: true }).click()
  await expect(runs.getByText('Second experiment', { exact: true })).toBeVisible()
  await expect(runs.getByRole('button', { name: 'Choose local file' })).toHaveCount(0)
  await electronApp.evaluate(({ ipcMain }) => ipcMain.emit('aster:test:releasePicker'))
  await openDetails('Baseline comparison')
  await expect(runs.getByRole('button', { name: 'Choose local file' })).toBeVisible()
  await expect(runs.getByRole('textbox', { name: 'Run name' })).toHaveValue('Unattached draft')
  await expect(runs.getByRole('textbox', { name: 'Metrics file path' })).toHaveValue('')

  await electronApp.evaluate(
    ({ ipcMain }, fixture) => {
      ipcMain.removeHandler('fs:readFileChunk')
      ipcMain.handle(
        'fs:readFileChunk',
        (_event, args: { filePath: string; offset: number; length: number }) => {
          if (args.filePath !== fixture.path) {
            throw new Error('Unexpected file read during preview race test')
          }
          return new Promise<{ contentBase64: string; bytesRead: number; eof: boolean }>(
            (resolve) => {
              ipcMain.once('aster:test:releaseChunk', () => {
                const source = Buffer.from(fixture.content)
                const bytes = source.subarray(args.offset, args.offset + args.length)
                resolve({
                  contentBase64: bytes.toString('base64'),
                  bytesRead: bytes.length,
                  eof: args.offset + bytes.length >= source.length
                })
              })
            }
          )
        }
      )
    },
    { path: second, content: 'epoch,loss,note\n1,0.5,first\n2,0.4,second\n' }
  )
  await runs.getByRole('textbox', { name: 'Metrics file path' }).fill(second)
  await runs.getByRole('button', { name: 'Preview source' }).click()
  await expect(runs.getByRole('button', { name: 'Reading…' })).toBeDisabled()
  await expect
    .poll(() =>
      electronApp.evaluate(({ ipcMain }) => ipcMain.listenerCount('aster:test:releaseChunk'))
    )
    .toBe(1)
  await navigation.getByRole('button', { name: 'Second experiment', exact: true }).click()
  // Release only once the switch has landed; a slow host would otherwise finish the read first.
  await expect(runs.getByText('Second experiment', { exact: true })).toBeVisible()
  await electronApp.evaluate(({ ipcMain }) => ipcMain.emit('aster:test:releaseChunk'))
  await orcaPage.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
  await openDetails('Baseline comparison')
  await expect(runs.getByRole('button', { name: 'Preview source' })).toBeEnabled()
  await expect(runs.getByRole('button', { name: 'Attach', exact: true })).toBeDisabled()
  await expect(runs.getByText(/CSV · 2 numeric values/)).toHaveCount(0)

  await runs.getByRole('button', { name: 'Choose local file' }).click()
  await expect
    .poll(() =>
      electronApp.evaluate(({ ipcMain }) => ipcMain.listenerCount('aster:test:releasePicker'))
    )
    .toBe(1)
  await navigation.getByRole('button', { name: 'Second experiment', exact: true }).click()
  await openAttachForm()
  await expect(runs.getByRole('textbox', { name: 'Metrics file path' })).toHaveValue('')
  await navigation.getByRole('button', { name: 'Baseline comparison', exact: true }).click()
  await electronApp.evaluate(({ ipcMain }) => ipcMain.emit('aster:test:releasePicker'))
  await orcaPage.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
  await openDetails('Second experiment')
  await expect(runs.getByRole('textbox', { name: 'Metrics file path' })).toHaveValue('')
})
