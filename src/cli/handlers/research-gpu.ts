import type { ResearchGpuAgentStatus } from '../../shared/research/research-gpu-agent-status'
import type { ResearchSlurmActionResult } from '../../shared/research/research-slurm-actions'
import type { CommandHandler } from '../dispatch'
import {
  getOptionalPositiveIntegerFlag,
  getOptionalStringFlag,
  getRequiredStringFlag
} from '../flags'
import { printResult } from '../format'

function formatGpuStatus(status: ResearchGpuAgentStatus): string {
  if (!status.servers.length) {
    return 'No GPU limits set. Set them in Aster > Compute.'
  }
  return status.servers
    .map((server) => {
      const lines = [
        `${server.server}: ${server.availableGpus === null ? 'usage unknown' : `${server.usedGpus}/${server.maxGpus} GPUs in use, ${server.availableGpus} budget room`}${
          server.autoRelease ? '' : ' (auto-release off)'
        }`
      ]
      if (server.error) {
        lines.push(`  could not read the queue: ${server.error}`)
      }
      for (const project of server.projects) {
        const cap = project.maxGpus === null ? 'no cap' : `cap ${project.maxGpus}`
        lines.push(
          `  ${project.name}: ${project.usedGpus} GPUs, ${cap}, ${project.priority} priority`
        )
      }
      for (const job of server.heldJobs) {
        lines.push(`  held ${job.jobId} (${job.project}, ${job.gpus} GPUs)`)
      }
      return lines.join('\n')
    })
    .join('\n\n')
}

function formatSubmitResult(result: ResearchSlurmActionResult): string {
  return result.ok ? result.message : `Not submitted: ${result.message}`
}

export const RESEARCH_GPU_HANDLERS: Record<string, CommandHandler> = {
  'gpu status': async ({ client, flags, json }) => {
    const result = await client.call<ResearchGpuAgentStatus>('researchGpu.status', {
      server: getOptionalStringFlag(flags, 'server')
    })
    printResult(result, json, formatGpuStatus)
  },
  'gpu submit': async ({ client, flags, json }) => {
    const result = await client.call<ResearchSlurmActionResult>('researchGpu.submit', {
      server: getRequiredStringFlag(flags, 'server'),
      project: getRequiredStringFlag(flags, 'project'),
      workDir: getRequiredStringFlag(flags, 'workdir'),
      script: getOptionalStringFlag(flags, 'script'),
      command: getOptionalStringFlag(flags, 'run'),
      gpus: getOptionalPositiveIntegerFlag(flags, 'gpus'),
      partition: getOptionalStringFlag(flags, 'partition'),
      cpusPerTask: getOptionalPositiveIntegerFlag(flags, 'cpus'),
      memory: getOptionalStringFlag(flags, 'mem'),
      timeLimit: getOptionalStringFlag(flags, 'time'),
      jobName: getOptionalStringFlag(flags, 'name'),
      linkRun: getOptionalStringFlag(flags, 'link-run'),
      runProject: getOptionalStringFlag(flags, 'run-project'),
      dryRun: flags.get('dry-run') === true
    })
    printResult(result, json, formatSubmitResult)
    if (!result.result.ok) {
      process.exitCode = 1
    }
  }
}
