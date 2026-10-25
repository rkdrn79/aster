import { z } from 'zod'
import { quotePosixShell } from '../shell-argument-quoting'

const remotePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((path) => !/[\0\n\r]/.test(path), 'Paths cannot contain line breaks')

/** squeue job ids: `123`, `123_4` (array task), `123_[1-10%2]` (pending range), `123+0` (het job). */
export const SLURM_JOB_ID_PATTERN = /^\d+(?:_(?:\d+|\[[\d,%:-]+\]))?(?:\+\d+)?$/

const targetSchema = {
  targetId: z.string().min(1).max(512),
  dial: z.boolean().optional()
}

export const researchSlurmCancelParamsSchema = z.object({
  ...targetSchema,
  jobId: z.string().regex(SLURM_JOB_ID_PATTERN)
})

export type ResearchSlurmCancelParams = z.infer<typeof researchSlurmCancelParamsSchema>

export const researchSlurmJobRequestSchema = z.object({
  workDir: remotePathSchema.refine((path) => path.startsWith('/'), 'Use an absolute path'),
  run: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('script'),
      scriptPath: remotePathSchema.refine(
        (path) => !path.startsWith('-'),
        'A script path cannot start with -'
      )
    }),
    z.object({
      kind: z.literal('command'),
      command: z
        .string()
        .trim()
        .min(1, 'Enter a command')
        .max(8000)
        .refine((command) => !command.includes('\0'))
    })
  ]),
  jobName: z
    .string()
    .trim()
    .regex(/^[\w.+-]{1,128}$/, 'Use letters, numbers, . _ + - for the job name')
    .optional(),
  partition: z
    .string()
    .trim()
    .regex(/^[\w.-]+(?:,[\w.-]+)*$/, 'Unknown partition name')
    .max(256)
    .optional(),
  gpus: z.number().int().min(0).max(64).optional(),
  cpusPerTask: z.number().int().min(1).max(1024).optional(),
  memory: z
    .string()
    .trim()
    .regex(/^\d+[KMGT]?$/i, 'Use a size like 32G or 64000M')
    .optional(),
  timeLimit: z
    .string()
    .trim()
    .regex(
      /^(?:\d+-\d{1,2}(?::\d{1,2}){0,2}|\d+(?::\d{1,2}){0,2})$/,
      'Use minutes, H:MM:SS or D-HH:MM:SS'
    )
    .optional()
})

export type ResearchSlurmJobRequest = z.infer<typeof researchSlurmJobRequestSchema>

export const researchSlurmSubmitParamsSchema = z.object({
  ...targetSchema,
  request: researchSlurmJobRequestSchema,
  /** Compute project the job belongs to; tags it and applies that project's GPU budget. */
  projectKey: z.string().min(1).max(600).optional(),
  /** `sbatch --test-only`: the scheduler's start estimate; no job is created. */
  testOnly: z.boolean()
})

export type ResearchSlurmSubmitParams = z.infer<typeof researchSlurmSubmitParamsSchema>

export type ResearchSlurmEstimate = {
  startTime: string
  processors: number | null
  nodes: string | null
  partition: string | null
}

export type ResearchSlurmActionResult = {
  ok: boolean
  /** The new job's id after a real submission. */
  jobId: string | null
  estimate: ResearchSlurmEstimate | null
  /** Submitted with --hold because it would exceed a GPU budget; Aster releases it later. */
  held: boolean
  message: string
  /** Set when `gpu submit --link-run` tied the job to a Run folder on the host. */
  linkedRun?: {
    run: string
    logPath: string
    /** Null when run.json took the job; otherwise why it did not (tracking continues). */
    manifestError: string | null
  }
}

/** The exact command run on the host; the dialog previews this same string. */
export function buildSlurmSubmitCommand(
  request: ResearchSlurmJobRequest,
  testOnly: boolean,
  tags: { comment?: string; hold?: boolean; outputPath?: string } = {}
): string {
  const flags = ['--parsable']
  if (testOnly) {
    flags.push('--test-only')
  }
  if (tags.hold) {
    flags.push('--hold')
  }
  if (tags.comment) {
    flags.push(`--comment=${quotePosixShell(tags.comment)}`)
  }
  if (tags.outputPath) {
    // Why both and append: a linked Run keeps stdout and stderr in its own train.log, across requeues.
    flags.push(`--output=${quotePosixShell(tags.outputPath)}`)
    flags.push(`--error=${quotePosixShell(tags.outputPath)}`)
    flags.push('--open-mode=append')
  }
  if (request.jobName) {
    flags.push(`--job-name=${quotePosixShell(request.jobName)}`)
  }
  if (request.partition) {
    flags.push(`--partition=${quotePosixShell(request.partition)}`)
  }
  if (request.gpus) {
    flags.push(`--gres=gpu:${request.gpus}`)
  }
  if (request.cpusPerTask) {
    flags.push(`--cpus-per-task=${request.cpusPerTask}`)
  }
  if (request.memory) {
    flags.push(`--mem=${quotePosixShell(request.memory)}`)
  }
  if (request.timeLimit) {
    flags.push(`--time=${quotePosixShell(request.timeLimit)}`)
  }
  const target =
    request.run.kind === 'script'
      ? quotePosixShell(request.run.scriptPath)
      : `--wrap=${quotePosixShell(request.run.command)}`
  // Why cd: relative script paths and the job's default working directory both follow it.
  return `cd ${quotePosixShell(request.workDir)} && sbatch ${flags.join(' ')} ${target} 2>&1`
}

/** Releases jobs Aster held for a GPU budget; ids come from the user's own queue listing. */
export function buildSlurmReleaseCommand(jobIds: readonly string[]): string {
  const valid = jobIds.filter((jobId) => SLURM_JOB_ID_PATTERN.test(jobId))
  return `scontrol release ${quotePosixShell(valid.join(','))} 2>&1`
}

/** `--user` keeps a root or operator login from cancelling someone else's job. */
export function buildSlurmCancelCommand(jobId: string): string {
  return `scancel --user="$(id -un)" ${quotePosixShell(jobId)} 2>&1`
}

function outputLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function parseSlurmSubmitOutput(
  output: string,
  testOnly: boolean
): ResearchSlurmActionResult {
  const lines = outputLines(output)
  if (testOnly) {
    // `sbatch: Job 152716 to start at 2026-11-20T16:35:14 using 2 processors on nodes node02 in partition a6000`
    for (const line of lines) {
      const match =
        /to start at (\S+)(?: using (\d+) processors)?(?: on nodes (\S+))?(?: in partition (\S+))?/.exec(
          line
        )
      if (match) {
        return {
          ok: true,
          jobId: null,
          estimate: {
            startTime: match[1],
            processors: match[2] ? Number(match[2]) : null,
            nodes: match[3] ?? null,
            partition: match[4] ?? null
          },
          held: false,
          // Why not SLURM's wording: its "Job 123 to start" names an id no job will ever have.
          message: `Would start at ${match[1]}${match[3] ? ` on ${match[3]}` : ''}${
            match[4] ? ` (${match[4]})` : ''
          }. No job was created.`
        }
      }
    }
    return {
      ok: false,
      jobId: null,
      estimate: null,
      held: false,
      message: lines.at(-1) ?? 'sbatch gave no estimate.'
    }
  }
  const jobId = /^(\d+)(?:;\S+)?$/.exec(lines.at(-1) ?? '')?.[1] ?? null
  return jobId
    ? { ok: true, jobId, estimate: null, held: false, message: `Submitted job ${jobId}` }
    : {
        ok: false,
        jobId: null,
        estimate: null,
        held: false,
        message: lines.at(-1) ?? 'sbatch did not report a job id.'
      }
}

export function parseSlurmCancelOutput(output: string): ResearchSlurmActionResult {
  const lines = outputLines(output)
  // Why: scancel exits 0 for some refusals but always says so on stderr.
  const failed = lines.some((line) => /error/i.test(line))
  return {
    ok: !failed,
    jobId: null,
    estimate: null,
    held: false,
    message: lines.join(' · ') || 'Cancel requested.'
  }
}
