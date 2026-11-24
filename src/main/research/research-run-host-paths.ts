import { z } from 'zod'

const RUN_MANIFEST =
  /^(.*?)[\\/](\.aster|research)[\\/]experiments[\\/]([^\\/]+)[\\/]runs[\\/]([^\\/]+)[\\/]run\.json$/u

/** The project folder and Run of a run.json path inside a research record tree. */
export function runManifestParts(
  manifestPath: string
): { projectPath: string; recordRoot: string; experiment: string; runId: string } | null {
  const match = RUN_MANIFEST.exec(manifestPath)
  return match?.[1]
    ? { projectPath: match[1], recordRoot: match[2], experiment: match[3], runId: match[4] }
    : null
}

const lenientText = z.string().trim().min(1).nullable().optional().catch(null)

// Why lenient: a newer launcher may add or reshape fields; only these few are read here.
const runHostManifestSchema = z.object({
  execution: z
    .object({ state: z.string().optional().catch(undefined) })
    .optional()
    .catch(undefined),
  launch: z.object({ host: lenientText, cwd: lenientText }).optional().catch(undefined),
  job: z
    .object({
      scheduler: z.string().optional().catch(undefined),
      jobId: lenientText,
      cluster: lenientText,
      recordedBy: lenientText
    })
    .optional()
    .catch(undefined)
})

/** What the host observation needs from run.json. */
export type RunHostBits = {
  launchHost: string | null
  cwd: string | null
  running: boolean
  job: { jobId: string; recordedByHarness: boolean; cluster: string | null } | null
}

export function runHostBits(content: string | null): RunHostBits | null {
  if (!content) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  const result = runHostManifestSchema.safeParse(parsed)
  if (!result.success) {
    return null
  }
  const { execution, launch, job } = result.data
  return {
    launchHost: launch?.host ?? null,
    cwd: launch?.cwd ?? null,
    running: execution?.state === 'running',
    job:
      job?.scheduler === 'slurm' && job.jobId
        ? {
            jobId: job.jobId,
            recordedByHarness: job.recordedBy === 'aster-harness',
            cluster: job.cluster ?? null
          }
        : null
  }
}
