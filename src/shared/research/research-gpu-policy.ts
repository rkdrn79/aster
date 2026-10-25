import { z } from 'zod'

export const RESEARCH_GPU_PRIORITIES = ['high', 'normal', 'low'] as const
export type ResearchGpuPriority = (typeof RESEARCH_GPU_PRIORITIES)[number]

const gpuCountSchema = z.number().int().min(0).max(1024)

/** How many GPUs the user lets themselves hold on one SSH host, and whether Aster may release. */
export const researchGpuHostPolicySchema = z
  .object({
    targetId: z.string().min(1).max(512),
    maxGpus: gpuCountSchema,
    /** Release jobs Aster held for this budget once GPUs free up, while Aster runs. */
    autoRelease: z.boolean()
  })
  .strict()

/** One project's share of a host budget. Keyed like Compute's project groups (`project:<id>`, …). */
export const researchGpuProjectPolicySchema = z
  .object({
    targetId: z.string().min(1).max(512),
    projectKey: z.string().min(1).max(600),
    /** Shown to agents, which name projects in `orca gpu submit --project`. */
    projectName: z.string().trim().min(1).max(120),
    /** Null: no cap of its own beyond the host budget. */
    maxGpus: gpuCountSchema.nullable(),
    priority: z.enum(RESEARCH_GPU_PRIORITIES)
  })
  .strict()

export const researchGpuPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative().optional(),
    hosts: z.array(researchGpuHostPolicySchema).max(500),
    projects: z.array(researchGpuProjectPolicySchema).max(2000)
  })
  .strict()

export type ResearchGpuHostPolicy = z.infer<typeof researchGpuHostPolicySchema>
export type ResearchGpuProjectPolicy = z.infer<typeof researchGpuProjectPolicySchema>
export type ResearchGpuPolicy = z.infer<typeof researchGpuPolicySchema>

export function emptyResearchGpuPolicy(): ResearchGpuPolicy {
  return { schemaVersion: 1, revision: 0, hosts: [], projects: [] }
}

const ASTER_COMMENT_PREFIX = 'aster:project='
const ASTER_RUN_TAG = ';run='

/** `sbatch --comment` tag naming the project, and the Run when linked, of an Aster job. */
export function asterSlurmJobComment(projectKey: string, runName?: string): string {
  const run = runName ? `${ASTER_RUN_TAG}${encodeURIComponent(runName)}` : ''
  return `${ASTER_COMMENT_PREFIX}${encodeURIComponent(projectKey)}${run}`
}

/** The Run name `aster gpu submit --link-run` tagged the job with, if any. */
export function runNameFromSlurmComment(comment: string | null): string | null {
  if (!comment?.startsWith(ASTER_COMMENT_PREFIX)) {
    return null
  }
  // Why slice(1): the project key comes first, and encodeURIComponent escapes any ';' inside it.
  const runPrefix = ASTER_RUN_TAG.slice(1)
  const tag = comment
    .split(';')
    .slice(1)
    .find((part) => part.startsWith(runPrefix))
  try {
    return tag ? decodeURIComponent(tag.slice(runPrefix.length)) || null : null
  } catch {
    return null
  }
}

export function projectKeyFromSlurmComment(comment: string | null): string | null {
  if (!comment?.startsWith(ASTER_COMMENT_PREFIX)) {
    return null
  }
  // Why split: encodeURIComponent escapes ';', so the first one ends the project key.
  const [encoded] = comment.slice(ASTER_COMMENT_PREFIX.length).split(';', 1)
  try {
    return decodeURIComponent(encoded) || null
  } catch {
    return null
  }
}
