import { ipcMain } from 'electron'
import { researchComputeLinksDocumentSchema } from '../../shared/research/research-compute-links'
import {
  buildResearchComputeProbeCommand,
  researchComputeSampleParamsSchema,
  type ResearchComputeSample,
  type ResearchComputeSampleParams
} from '../../shared/research/research-compute-probe'
import { parseResearchComputeProbeOutput } from '../../shared/research/research-compute-probe-output'
import { researchGpuPolicySchema } from '../../shared/research/research-gpu-policy'
import { researchProjectTransferRequestSchema } from '../../shared/research/research-project-transfer'
import {
  buildSlurmCancelCommand,
  parseSlurmCancelOutput,
  researchSlurmCancelParamsSchema,
  researchSlurmSubmitParamsSchema,
  type ResearchSlurmActionResult,
  type ResearchSlurmCancelParams
} from '../../shared/research/research-slurm-actions'
import { knownSshHostPlatform } from '../ssh/ssh-host-platform-memo'
import { mainProcessState } from '../startup/main-process-state'
import {
  readResearchComputeLinks,
  saveResearchComputeLinks
} from './research-compute-links-repository'
import { runResearchComputeCommand } from './research-compute-transport'
import { readResearchGpuPolicy, saveResearchGpuPolicy } from './research-gpu-policy-repository'
import {
  dispatchAllHeldResearchGpuJobs,
  releaseAllHeldResearchGpuJobs,
  rememberResearchGpuProjectFolders,
  startResearchGpuDispatcher,
  submitResearchSlurmJobWithBudget
} from './research-gpu-scheduler'
import {
  previewResearchProjectTransfer,
  transferResearchProject
} from './research-project-transfer'
import { registerResearchRunWatchIpcHandlers } from './research-run-watch-ipc'
import { startResearchRunWatchService } from './research-run-watch-service'

const COMPUTE_PROBE_TIMEOUT_MS = 25_000
const SLURM_ACTION_TIMEOUT_MS = 30_000
const UNSUPPORTED_HOST_MESSAGE = 'Compute runs POSIX shell commands and needs a Linux host.'

export async function sampleResearchComputeHost({
  targetId,
  workspacePaths,
  projectFolders,
  dial = false
}: ResearchComputeSampleParams): Promise<ResearchComputeSample> {
  const base: ResearchComputeSample = {
    targetId,
    capturedAt: new Date().toISOString(),
    status: 'ok',
    via: null,
    message: null,
    remoteUser: null,
    gpu: { status: 'missing', message: null, devices: [], processes: [] },
    slurm: {
      status: 'missing',
      message: null,
      version: null,
      jobs: [],
      queue: [],
      queueTruncated: false,
      nodes: []
    },
    resolvedWorkspacePaths: {}
  }
  if (knownSshHostPlatform(targetId)?.os === 'win32') {
    return { ...base, status: 'unsupported-host', message: UNSUPPORTED_HOST_MESSAGE }
  }
  const result = await runResearchComputeCommand(
    targetId,
    dial,
    buildResearchComputeProbeCommand(workspacePaths),
    COMPUTE_PROBE_TIMEOUT_MS
  )
  if (result.status === 'not-connected') {
    return { ...base, status: 'not-connected' }
  }
  if (result.status !== 'ok') {
    return { ...base, via: result.via, status: 'error', message: result.message }
  }
  const parsed = parseResearchComputeProbeOutput(result.stdout)
  if (projectFolders) {
    rememberResearchGpuProjectFolders(targetId, {
      folders: projectFolders,
      resolvedPaths: parsed.resolvedWorkspacePaths
    })
  }
  return { ...base, via: result.via, ...parsed }
}

async function runSlurmAction(
  targetId: string,
  dial: boolean,
  command: string,
  parse: (output: string) => ResearchSlurmActionResult
): Promise<ResearchSlurmActionResult> {
  const failed = (message: string): ResearchSlurmActionResult => ({
    ok: false,
    jobId: null,
    estimate: null,
    held: false,
    message
  })
  if (knownSshHostPlatform(targetId)?.os === 'win32') {
    return failed(UNSUPPORTED_HOST_MESSAGE)
  }
  const result = await runResearchComputeCommand(targetId, dial, command, SLURM_ACTION_TIMEOUT_MS)
  if (result.status === 'not-connected') {
    return failed('This host is not connected. Connect it or choose Read over ssh first.')
  }
  return result.status === 'ok' ? parse(result.stdout) : failed(result.message)
}

export function cancelResearchSlurmJob({
  targetId,
  jobId,
  dial = false
}: ResearchSlurmCancelParams): Promise<ResearchSlurmActionResult> {
  return runSlurmAction(targetId, dial, buildSlurmCancelCommand(jobId), parseSlurmCancelOutput)
}

export function registerResearchComputeIpcHandlers(): void {
  ipcMain.handle('researchCompute:sample', (_event, input: unknown) =>
    sampleResearchComputeHost(researchComputeSampleParamsSchema.parse(input))
  )
  ipcMain.handle('researchCompute:cancelJob', (_event, input: unknown) =>
    cancelResearchSlurmJob(researchSlurmCancelParamsSchema.parse(input))
  )
  ipcMain.handle('researchCompute:submitJob', (_event, input: unknown) =>
    submitResearchSlurmJobWithBudget(researchSlurmSubmitParamsSchema.parse(input))
  )
  ipcMain.handle('researchCompute:readLinks', () => readResearchComputeLinks())
  ipcMain.handle('researchCompute:saveLinks', (_event, input: unknown) =>
    saveResearchComputeLinks(researchComputeLinksDocumentSchema.parse(input))
  )
  ipcMain.handle('researchCompute:previewTransfer', (_event, input: unknown) =>
    previewResearchProjectTransfer(researchProjectTransferRequestSchema.parse(input))
  )
  ipcMain.handle('researchCompute:transferProject', (_event, input: unknown) =>
    transferResearchProject(researchProjectTransferRequestSchema.parse(input))
  )
  ipcMain.handle('researchCompute:readGpuPolicy', () => readResearchGpuPolicy())
  ipcMain.handle('researchCompute:saveGpuPolicy', async (_event, input: unknown) => {
    const previous = await readResearchGpuPolicy().catch(() => null)
    const saved = await saveResearchGpuPolicy(researchGpuPolicySchema.parse(input))
    for (const host of previous?.hosts ?? []) {
      if (!saved.hosts.some((entry) => entry.targetId === host.targetId)) {
        void releaseAllHeldResearchGpuJobs(host.targetId)
      }
    }
    // A raised limit can free room for held jobs right away.
    void dispatchAllHeldResearchGpuJobs()
    return saved
  })
  startResearchGpuDispatcher()
  registerResearchRunWatchIpcHandlers()
  startResearchRunWatchService(() => mainProcessState.runtime)
}
