import {
  researchSlurmJobRequestSchema,
  type ResearchSlurmJobRequest
} from '../../../../shared/research/research-slurm-actions'
import type { ResearchComputeWorkspace } from './research-compute-workspaces'

export type Fields = {
  workDir: string
  runKind: 'script' | 'command'
  scriptPath: string
  command: string
  jobName: string
  partition: string
  gpus: string
  cpusPerTask: string
  memory: string
  timeLimit: string
}

export const DEFAULT_PARTITION = 'cluster-default'

export function draftRequest(fields: Fields): {
  request: ResearchSlurmJobRequest | null
  problem: string | null
} {
  if (!fields.workDir.trim()) {
    return { request: null, problem: 'Enter the working directory on the host.' }
  }
  if (fields.runKind === 'script' ? !fields.scriptPath.trim() : !fields.command.trim()) {
    return {
      request: null,
      problem: fields.runKind === 'script' ? 'Enter the batch script path.' : 'Enter a command.'
    }
  }
  const counts: Partial<Record<'gpus' | 'cpusPerTask', number>> = {}
  for (const key of ['gpus', 'cpusPerTask'] as const) {
    const value = fields[key].trim()
    if (value && !/^\d+$/.test(value)) {
      return {
        request: null,
        problem: `${key === 'gpus' ? 'GPUs' : 'CPUs'} must be a whole number.`
      }
    }
    if (value) {
      counts[key] = Number(value)
    }
  }
  const text = (value: string): string | undefined => value.trim() || undefined
  const parsed = researchSlurmJobRequestSchema.safeParse({
    workDir: fields.workDir,
    run:
      fields.runKind === 'script'
        ? { kind: 'script', scriptPath: fields.scriptPath }
        : { kind: 'command', command: fields.command },
    jobName: text(fields.jobName),
    partition: fields.partition === DEFAULT_PARTITION ? undefined : text(fields.partition),
    ...counts,
    memory: text(fields.memory),
    timeLimit: text(fields.timeLimit)
  })
  return parsed.success
    ? { request: parsed.data, problem: null }
    : { request: null, problem: parsed.error.issues[0]?.message ?? 'Check the job fields.' }
}

export function projectRoots(
  workspaces: readonly ResearchComputeWorkspace[]
): ResearchComputeWorkspace[] {
  const seen = new Set<string>()
  return workspaces.filter((workspace) => !seen.has(workspace.path) && seen.add(workspace.path))
}
