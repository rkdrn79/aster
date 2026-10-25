import { app, ipcMain } from 'electron'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { resolveDesktopAuthorizedPath } from '../ipc/local-file-access-resolution'
import { mainProcessState } from '../startup/main-process-state'
import { verificationSummary } from '../../shared/research/research-verification-summary'
import { loopLedgerPath } from '../../research-harness/research-layout.mjs'
import {
  containedProjectFile,
  locateResearchClaimsAudit,
  RESEARCH_UNBACKED_NUMBERS_SHOWN
} from './research-claims-audit'
import {
  researchHarnessRunListSchema,
  researchLoopLedgerSchema,
  researchProjectContextSchema,
  researchUnbackedNumbersSchema,
  type ResearchClaimsAuditResult,
  type ResearchHarnessLocation,
  type ResearchHarnessRunStatus,
  type ResearchLoopLedger,
  type ResearchProjectContext,
  type ResearchRunPatch,
  type ResearchUnbackedNumbers
} from '../../shared/research/research-harness-results'

const MAX_PATCH_BYTES = 1024 * 1024
const MAX_LOOP_ENTRIES = 60
// Same rule as the harness's experiment slugs, so a folder name never escapes the experiments folder.
const EXPERIMENT_SLUG = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,63}$/u

const workspaceSchema = z.object({ workspacePath: z.string().min(1).max(4096) }).strict()
export const experimentSchema = workspaceSchema.extend({
  experiment: z.string().regex(EXPERIMENT_SLUG)
})
const runSchema = workspaceSchema.extend({ run: z.string().trim().min(3).max(160) })
const claimSchema = workspaceSchema.extend({ claim: z.string().trim().min(1).max(200) })
// Why only failed or cancelled: the app marks a Run whose launcher died, never a success.
const runFinishSchema = runSchema.extend({
  status: z.enum(['failed', 'cancelled']),
  note: z.string().trim().max(500).optional()
})
const runPathsSchema = z.object({ paths: z.object({ run: z.string() }) })

/** Packaged builds ship the harness as an extra resource; dev runs it from the source tree. */
export function researchHarnessDirectory(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'research-harness')
    : path.join(app.getAppPath(), 'src', 'research-harness')
}

async function harnessLocation(): Promise<ResearchHarnessLocation> {
  const directory = researchHarnessDirectory()
  const location = {
    directory,
    cli: path.join(directory, 'cli.mjs'),
    loopSkill: path.join(directory, 'loop', 'SKILL.md'),
    trackSkill: path.join(directory, 'track', 'SKILL.md'),
    verifySkill: path.join(directory, 'verify', 'SKILL.md')
  }
  const present = await Promise.all(
    [location.cli, location.loopSkill, location.trackSkill, location.verifySkill].map((file) =>
      lstat(file).then(
        (details) => details.isFile(),
        () => false
      )
    )
  )
  if (!present.every(Boolean)) {
    throw new Error('This build does not include the research harness.')
  }
  return location
}

// Why a runtime import: the harness is plain ESM without type declarations, shipped beside the
// app so agents and the app run the same code; results are validated with zod before use.
export async function callHarness(
  moduleFile: string,
  name: string,
  ...args: unknown[]
): Promise<unknown> {
  const loaded: unknown = await import(
    pathToFileURL(path.join(researchHarnessDirectory(), moduleFile)).href
  )
  const exported: unknown =
    typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, name) : undefined
  if (typeof exported !== 'function') {
    throw new Error('This build does not include the research harness.')
  }
  return exported(...args)
}

function shortError(cause: unknown): Error {
  if (cause instanceof z.ZodError) {
    return new Error('The research harness returned an unexpected result.')
  }
  const code = typeof cause === 'object' && cause !== null ? Reflect.get(cause, 'code') : null
  if (code === 'ENOENT') {
    return new Error('A research file of this project is missing.')
  }
  const message = cause instanceof Error ? cause.message : String(cause)
  return new Error(message.split('\n')[0]?.slice(0, 300) || 'The research harness failed.')
}

export async function authorizedProjectPath(workspacePath: string): Promise<string> {
  const store = mainProcessState.store
  if (!store) {
    throw new Error('Project storage is not ready. Try again after startup.')
  }
  return realpath(await resolveDesktopAuthorizedPath(workspacePath, store))
}

async function fileExists(target: string): Promise<boolean> {
  return lstat(target).then(
    (details) => details.isFile(),
    () => false
  )
}

async function claimsAudit(project: string): Promise<ResearchClaimsAuditResult> {
  return locateResearchClaimsAudit(
    project,
    await callHarness('research-claims.mjs', 'auditClaims', project),
    () => callHarness('research-claims.mjs', 'listClaims', project)
  )
}

async function claimsScan(project: string): Promise<ResearchUnbackedNumbers> {
  const scan = researchUnbackedNumbersSchema.parse(
    await callHarness('research-claims.mjs', 'scanUnbackedNumbers', project)
  )
  return { ...scan, unbacked: scan.unbacked.slice(0, RESEARCH_UNBACKED_NUMBERS_SHOWN) }
}

async function loopShow(project: string, experiment: string): Promise<ResearchLoopLedger | null> {
  const ledger = loopLedgerPath(project, experiment)
  if (!(await fileExists(ledger))) {
    return null
  }
  return researchLoopLedgerSchema.parse(
    await callHarness('research-loop-ledger.mjs', 'readLoopLedger', project, experiment, {
      limit: MAX_LOOP_ENTRIES
    })
  )
}

async function runStatuses(
  project: string,
  experiment: string
): Promise<ResearchHarnessRunStatus[]> {
  const { runs } = researchHarnessRunListSchema.parse(
    await callHarness('research-project-context.mjs', 'listRuns', project, { experiment })
  )
  return runs
}

/** The first `maxBytes` of a text file; a character cut at the limit is dropped, not garbled. */
export async function readTextFileHead(
  file: string,
  maxBytes: number
): Promise<{ content: string; truncated: boolean; bytes: number }> {
  const handle = await open(file, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, maxBytes)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, 0)
    const content = new TextDecoder('utf-8').decode(buffer, { stream: size > length })
    return { content, truncated: size > length, bytes: size }
  } finally {
    await handle.close()
  }
}

async function runPatch(project: string, reference: string): Promise<ResearchRunPatch> {
  const resolved = runPathsSchema.parse(
    await callHarness('research-run-manifest.mjs', 'resolveRunReference', project, reference)
  )
  const relative = path.relative(project, path.join(resolved.paths.run, 'code.patch'))
  return readTextFileHead(await containedProjectFile(project, relative), MAX_PATCH_BYTES)
}

export function handle<Input>(
  channel: string,
  schema: z.ZodType<Input>,
  task: (input: Input) => Promise<unknown>
): void {
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      throw new Error('This research request is not valid.')
    }
    const input = parsed.data
    try {
      return await task(input)
    } catch (cause) {
      throw shortError(cause)
    }
  })
}

export function registerResearchHarnessIpcHandlers(): void {
  ipcMain.handle('researchHarness:location', async () => {
    try {
      return await harnessLocation()
    } catch (cause) {
      throw shortError(cause)
    }
  })
  handle(
    'researchHarness:context',
    workspaceSchema,
    async ({ workspacePath }): Promise<ResearchProjectContext> =>
      researchProjectContextSchema.parse(
        await callHarness(
          'research-project-context.mjs',
          'projectContext',
          await authorizedProjectPath(workspacePath)
        )
      )
  )
  handle('researchHarness:runStatuses', experimentSchema, async (input) =>
    runStatuses(await authorizedProjectPath(input.workspacePath), input.experiment)
  )
  handle('researchHarness:verify', experimentSchema, async (input) =>
    verificationSummary(
      await callHarness(
        'research-verification.mjs',
        'verifyResearch',
        await authorizedProjectPath(input.workspacePath),
        { experiment: input.experiment }
      )
    )
  )
  handle('researchHarness:claimsAudit', workspaceSchema, async ({ workspacePath }) =>
    claimsAudit(await authorizedProjectPath(workspacePath))
  )
  handle('researchHarness:claimsScan', workspaceSchema, async ({ workspacePath }) =>
    claimsScan(await authorizedProjectPath(workspacePath))
  )
  // Why: after the paper's number is updated to the Run's value, the claim records that value too.
  handle('researchHarness:claimsRefresh', claimSchema, async (input) => {
    await callHarness(
      'research-claims.mjs',
      'refreshClaim',
      await authorizedProjectPath(input.workspacePath),
      input.claim
    )
  })
  handle('researchHarness:loopShow', experimentSchema, async (input) =>
    loopShow(await authorizedProjectPath(input.workspacePath), input.experiment)
  )
  handle('researchHarness:runPatch', runSchema, async (input) =>
    runPatch(await authorizedProjectPath(input.workspacePath), input.run)
  )
  handle('researchHarness:runFinish', runFinishSchema, async (input) => {
    // Why no force: the harness refuses a Run whose process is still alive or already ended.
    await callHarness(
      'research-run-updates.mjs',
      'finishRun',
      await authorizedProjectPath(input.workspacePath),
      input.run,
      { status: input.status, note: input.note },
      { notice: () => undefined }
    )
  })
}
