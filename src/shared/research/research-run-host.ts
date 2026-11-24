import { z } from 'zod'

/** Whether this host can see a Run's log file, and why not. */
export const RESEARCH_RUN_LOG_STATES = ['present', 'empty', 'missing', 'unreadable'] as const
export type ResearchRunLogState = (typeof RESEARCH_RUN_LOG_STATES)[number]

export const researchRunHostQuerySchema = z
  .object({
    /** The SSH target the Runs' project lives on; null for this computer. */
    targetId: z.string().min(1).max(512).nullable(),
    runs: z
      .array(
        z
          .object({
            manifestPath: z.string().min(1).max(4096),
            logPath: z.string().min(1).max(4096).nullable()
          })
          .strict()
      )
      .min(1)
      .max(200)
  })
  .strict()
export type ResearchRunHostQuery = z.infer<typeof researchRunHostQuerySchema>

export type ResearchRunHostFacts = {
  /** `launch.host` in run.json. */
  launchHost: string | null
  /** The recording host when this host cannot observe the Run: its folder is not here. */
  recordedOn: string | null
  log: { state: ResearchRunLogState; reason: string | null }
  /** A SLURM job `run exec` recorded from inside the job, and whether Aster now follows it. */
  job: { jobId: string; tracked: boolean } | null
}

export type ResearchRunHostObservation = {
  /** This host's own name, or null when it could not be read. */
  thisHost: string | null
  /** Facts by manifest path, for the Runs that could be read. */
  runs: Record<string, ResearchRunHostFacts>
}

/** Same rule as the research harness's `launchedElsewhere`. */
export function researchRunRecordedElsewhere(
  launch: { host?: string | null; cwd?: string | null } | null | undefined,
  thisHost: string | null,
  cwdHere: (cwd: string) => boolean
): string | null {
  const host = launch?.host
  if (!host || !thisHost || host === thisHost) {
    return null
  }
  return launch.cwd && cwdHere(launch.cwd) ? null : host
}

/** What the log panel says when there is no log text to show. */
export function researchRunLogNote(
  log: ResearchRunHostFacts['log'] | null,
  recordedOn: string | null,
  running: boolean
): string | null {
  if (!log || log.state === 'present') {
    return null
  }
  switch (log.state) {
    case 'missing':
      return recordedOn
        ? `Log not on this host: it stays on ${recordedOn}, and train.log is not committed to git.`
        : running
          ? 'No log yet: the Run has not written to it.'
          : 'No log file was written for this Run.'
    case 'unreadable':
      return `The log could not be read here${log.reason ? `: ${log.reason}` : '.'}`
    case 'empty':
      return 'The log is empty.'
  }
}
