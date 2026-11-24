import type { z } from 'zod'
import type { ResearchGpuAgentStatus } from '../../shared/research/research-gpu-agent-status'
import {
  researchSlurmJobRequestSchema,
  type ResearchSlurmActionResult
} from '../../shared/research/research-slurm-actions'
import type {
  ResearchGpuStatusParams,
  ResearchGpuSubmitParams
} from '../../shared/rpc-contract/research-gpu-params'
import type { SshTarget } from '../../shared/ssh-types'
import { listRegisteredSshTargets } from '../ssh/targets/ssh-target-registry'
import { readResearchGpuPolicy } from './research-gpu-policy-repository'
import {
  GPU_LIMITS_WHERE,
  localGpuServer,
  missingGpuServerMessage,
  type ResearchGpuServer
} from './research-gpu-local-server'
import { linkSubmittedJobToRun, prepareResearchSlurmRunLink } from './research-slurm-run-submit'
import {
  lastResearchGpuDispatch,
  readResearchGpuHostBudget,
  submitResearchSlurmJobWithBudget
} from './research-gpu-scheduler'

function sameName(a: string | undefined, b: string): boolean {
  return a?.toLowerCase() === b.toLowerCase()
}

/** An agent names a host the way the user does: its label, ssh-config alias or target id. */
export function findResearchSshServer(query: string): SshTarget | undefined {
  const targets = listRegisteredSshTargets()
  return (
    targets.find((target) => target.id === query) ??
    targets.find((target) => sameName(target.label, query)) ??
    targets.find((target) => sameName(target.configHost, query))
  )
}

/** An SSH host on the desktop, or this server itself inside orcad. */
async function findResearchGpuServer(query: string): Promise<ResearchGpuServer | undefined> {
  const target = findResearchSshServer(query)
  return target ? { id: target.id, label: target.label } : localGpuServer(query)
}

export async function readResearchGpuAgentStatus({
  server
}: z.infer<typeof ResearchGpuStatusParams>): Promise<ResearchGpuAgentStatus> {
  const policy = await readResearchGpuPolicy()
  const target = server ? await findResearchGpuServer(server) : undefined
  if (server && !target) {
    throw new Error(await missingGpuServerMessage(server))
  }
  const hosts = policy.hosts.filter((host) => !target || host.targetId === target.id)
  const here = await localGpuServer()
  if (target && !hosts.length) {
    throw new Error(
      target.id === here?.id
        ? `No GPU limits for this server have reached it from Aster yet. ${GPU_LIMITS_WHERE} Aster sends them here when it connects.`
        : `No GPU limits are set for ${target.label}. ${GPU_LIMITS_WHERE}`
    )
  }
  if (!hosts.length) {
    return {
      servers: [],
      note: here
        ? `No GPU limits for this server have reached it from Aster yet. ${GPU_LIMITS_WHERE} Aster sends them here when it connects; until then, ask the user before taking GPUs.`
        : `No GPU limits are set yet. ${GPU_LIMITS_WHERE}`
    }
  }
  const labels = new Map(listRegisteredSshTargets().map((entry) => [entry.id, entry.label]))
  if (here) {
    labels.set(here.id, here.label)
  }
  const servers = await Promise.all(
    hosts.map(async (host) => {
      const read = await readResearchGpuHostBudget(host.targetId, true)
      const budget = read.status === 'ok' ? read.budget : null
      const projectName = (key: string): string =>
        budget?.projects.find((project) => project.projectKey === key)?.projectName ?? key
      return {
        server: labels.get(host.targetId) ?? host.targetId,
        targetId: host.targetId,
        maxGpus: host.maxGpus,
        usedGpus: budget?.usedGpus ?? null,
        availableGpus: budget ? Math.max(0, host.maxGpus - budget.usedGpus) : null,
        autoRelease: host.autoRelease,
        projects: (budget?.projects ?? []).map((project) => ({
          name: project.projectName,
          usedGpus: project.usedGpus,
          maxGpus: project.maxGpus,
          priority: project.priority
        })),
        heldJobs: (budget?.held ?? []).map((job) => ({
          jobId: job.jobId,
          gpus: job.gpus,
          project: projectName(job.projectKey)
        })),
        lastRelease: lastResearchGpuDispatch(host.targetId),
        error: read.status === 'error' ? read.message : null
      }
    })
  )
  return { servers, note: null }
}

/** `orca gpu submit`: the dialog's budget-aware sbatch, addressed by host and project names. */
export async function submitResearchGpuAgentJob(
  params: z.infer<typeof ResearchGpuSubmitParams>
): Promise<ResearchSlurmActionResult> {
  const target = await findResearchGpuServer(params.server)
  if (!target) {
    throw new Error(await missingGpuServerMessage(params.server))
  }
  const policy = await readResearchGpuPolicy()
  const projects = policy.projects.filter((project) => project.targetId === target.id)
  const project =
    projects.find((entry) => sameName(entry.projectName, params.project)) ??
    projects.find((entry) => entry.projectKey === params.project)
  if (!project) {
    const names = projects.map((entry) => entry.projectName).join(', ') || 'none yet'
    throw new Error(
      `"${params.project}" has no GPU limits on ${target.label} (configured: ${names}). ${GPU_LIMITS_WHERE}`
    )
  }
  if (Boolean(params.script) === Boolean(params.command)) {
    throw new Error('Pass exactly one of --script or --run.')
  }
  const request = researchSlurmJobRequestSchema.parse({
    workDir: params.workDir,
    run: params.script
      ? { kind: 'script', scriptPath: params.script }
      : { kind: 'command', command: params.command },
    jobName: params.jobName,
    partition: params.partition,
    gpus: params.gpus,
    cpusPerTask: params.cpusPerTask,
    memory: params.memory,
    timeLimit: params.timeLimit
  })
  const runLink = params.linkRun
    ? await prepareResearchSlurmRunLink(target, params.linkRun, params.runProject ?? params.workDir)
    : null
  const result = await submitResearchSlurmJobWithBudget(
    {
      targetId: target.id,
      request,
      testOnly: params.dryRun ?? false,
      projectKey: project.projectKey,
      dial: true
    },
    runLink ? { outputPath: runLink.logPath, runName: runLink.runName } : undefined
  )
  if (!runLink || !result.ok) {
    return result
  }
  if (!result.jobId) {
    return { ...result, message: `${result.message} Output would go to ${runLink.logPath}.` }
  }
  return linkSubmittedJobToRun(target, runLink, result, result.jobId)
}
