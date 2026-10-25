import { z } from 'zod'
import { quotePosixShell } from '../shell-argument-quoting'

const remoteFolderPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => path.startsWith('/') && !/[\0\t\n\r]/.test(path))

export const researchComputeSampleParamsSchema = z.object({
  targetId: z.string().min(1).max(512),
  workspacePaths: z.array(remoteFolderPathSchema).max(256),
  /** Which project owns each folder, so the GPU scheduler files jobs as the page does. */
  projectFolders: z
    .array(z.object({ path: remoteFolderPathSchema, projectKey: z.string().min(1).max(600) }))
    .max(256)
    .optional(),
  /** Read over the user's OpenSSH config when Aster holds no live connection to the target. */
  dial: z.boolean().optional()
})

export type ResearchComputeSampleParams = z.infer<typeof researchComputeSampleParamsSchema>

export type ResearchGpuDevice = {
  index: number
  uuid: string
  name: string
  memoryUsedMiB: number | null
  memoryTotalMiB: number | null
  utilizationPercent: number | null
  temperatureC: number | null
}

export type ResearchGpuProcess = {
  pid: number
  gpuUuid: string
  usedMemoryMiB: number | null
  /** Null when the host hides another user's or another PID namespace's process. */
  user: string | null
  elapsedSeconds: number | null
  cwd: string | null
  command: string | null
}

/** One of the signed-in user's jobs, as `squeue` reports it. */
export type ResearchSlurmJob = {
  jobId: string
  name: string
  /** Compact state: R, PD, CG, CF, S, … */
  state: string
  reason: string | null
  partition: string
  nodeCount: number | null
  nodes: string | null
  /** Allocated GPUs while running; requested GPUs while pending. */
  gpuCount: number
  timeUsed: string | null
  timeLimit: string | null
  submitTime: string | null
  /** Actual start while running; the scheduler's estimate while pending. */
  startTime: string | null
  workDir: string | null
  command: string | null
  /** `sbatch --comment`; Aster tags the jobs it submits with their project here. */
  comment: string | null
}

/** Any user's job, reduced to what partition load needs. */
export type ResearchSlurmQueueEntry = {
  user: string
  state: string
  partition: string
  gpuCount: number
}

export type ResearchSlurmNode = {
  name: string
  partition: string
  state: string
  gpuTypes: string[]
  gpuTotal: number
  gpuUsed: number
}

export type ResearchComputeSection<T> = {
  status: 'ok' | 'missing' | 'error'
  message: string | null
} & T

export type ResearchComputeSample = {
  targetId: string
  capturedAt: string
  status: 'ok' | 'not-connected' | 'unsupported-host' | 'error'
  /** Aster's live SSH connection, or a one-off BatchMode OpenSSH exec for an unconnected target. */
  via: 'connection' | 'system-ssh' | null
  message: string | null
  remoteUser: string | null
  gpu: ResearchComputeSection<{
    devices: ResearchGpuDevice[]
    processes: ResearchGpuProcess[]
  }>
  slurm: ResearchComputeSection<{
    version: string | null
    jobs: ResearchSlurmJob[]
    queue: ResearchSlurmQueueEntry[]
    /** True when the all-users queue listing hit its line cap. */
    queueTruncated: boolean
    nodes: ResearchSlurmNode[]
  }>
  /** Workspace path → the same directory with symlinks resolved on the host. */
  resolvedWorkspacePaths: Record<string, string>
}

export const RESEARCH_COMPUTE_MARK = '@@aster-compute:'
export const RESEARCH_SLURM_QUEUE_LINE_CAP = 6000

const M = RESEARCH_COMPUTE_MARK

// Field order is the parser's contract; `:0` disables squeue's column truncation.
const MY_JOB_FIELDS = [
  'JobArrayID',
  'Name',
  'StateCompact',
  'Reason',
  'Partition',
  'NumNodes',
  'NodeList',
  'tres-alloc',
  'TimeUsed',
  'TimeLimit',
  'SubmitTime',
  'StartTime',
  'WorkDir',
  'Command',
  'Comment'
]
const QUEUE_FIELDS = ['UserName', 'StateCompact', 'Partition', 'tres-alloc']
const NODE_FIELDS = ['NodeList', 'Partition', 'StateLong', 'Gres', 'GresUsed']

export const RESEARCH_SLURM_MY_JOB_FIELD_COUNT = MY_JOB_FIELDS.length
export const RESEARCH_SLURM_QUEUE_FIELD_COUNT = QUEUE_FIELDS.length
export const RESEARCH_SLURM_NODE_FIELD_COUNT = NODE_FIELDS.length

/** Tab-suffixed `-O` spec, built on the host by printf so the tabs survive every shell layer. */
function slurmFormat(fields: readonly string[]): string {
  return `"$(printf '${fields.map((field) => `${field}:0\\t`).join(',')}')"`
}

// Why no `exit`: the SSH stdout fence prints its end marker after this script returns.
const GPU_PROBE = String.raw`if command -v nvidia-smi >/dev/null 2>&1; then
  printf '${M}gpu-devices\n'
  nvidia-smi --query-gpu=index,uuid,name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits 2>&1
  printf '\n${M}gpu-devices-exit\t%s\n' "$?"
  apps=$(nvidia-smi --query-compute-apps=gpu_uuid,pid,used_memory --format=csv,noheader,nounits 2>/dev/null)
  printf '${M}gpu-apps\n'
  printf '%s\n' "$apps"
  printf '${M}gpu-processes\n'
  for pid in $(printf '%s\n' "$apps" | cut -d, -f2 | tr -d ' ' | sort -u); do
    case "$pid" in ''|*[!0-9]*) continue ;; esac
    owner=$(stat -c %U "/proc/$pid" 2>/dev/null || ps -o user= -p "$pid" 2>/dev/null)
    elapsed=$(ps -o etimes= -p "$pid" 2>/dev/null | tr -d ' ')
    cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null | tr '\t\n' '  ')
    cmd=$(tr '\000\t\n' '   ' 2>/dev/null < "/proc/$pid/cmdline" | cut -c1-600)
    printf '%s\t%s\t%s\t%s\t%s\n' "$pid" "$owner" "$elapsed" "$cwd" "$cmd"
  done
else
  printf '${M}gpu-missing\n'
fi`

const SLURM_PROBE = String.raw`if command -v squeue >/dev/null 2>&1; then
  printf '${M}slurm-version\t%s\n' "$(squeue --version 2>/dev/null | tr '\t\n' '  ')"
  printf '${M}slurm-jobs\n'
  squeue -h -u "$(id -un)" -O ${slurmFormat(MY_JOB_FIELDS)} 2>&1
  printf '\n${M}slurm-jobs-exit\t%s\n' "$?"
  printf '${M}slurm-queue\n'
  squeue -h -O ${slurmFormat(QUEUE_FIELDS)} 2>/dev/null | head -n ${RESEARCH_SLURM_QUEUE_LINE_CAP + 1}
  printf '${M}slurm-nodes\n'
  sinfo -h -N -O ${slurmFormat(NODE_FIELDS)} 2>&1
  printf '\n${M}slurm-nodes-exit\t%s\n' "$?"
else
  printf '${M}slurm-missing\n'
fi`

/** The signed-in user's jobs alone, in the probe's field order; for budget checks. */
export function buildResearchSlurmMyJobsCommand(): string {
  return `squeue -h -u "$(id -un)" -O ${slurmFormat(MY_JOB_FIELDS)}`
}

/** `squeue` arguments for `user`'s jobs in the probe's field order, run on the host without a shell. */
export function researchSlurmMyJobsArgs(user: string): string[] {
  return ['-h', '-u', user, '-O', MY_JOB_FIELDS.map((field) => `${field}:0\t`).join(',')]
}

/** One read-only pass over the host: nvidia-smi, SLURM queue and nodes, workspace realpaths. */
export function buildResearchComputeProbeCommand(workspacePaths: readonly string[]): string {
  const paths = [...new Set(workspacePaths)]
  const resolvePaths = paths.length
    ? [
        `for p in ${paths.map(quotePosixShell).join(' ')}; do`,
        `  printf '%s\\t%s\\n' "$p" "$(cd "$p" 2>/dev/null && pwd -P)"`,
        'done'
      ]
    : []
  return [
    `printf '${M}user\\t%s\\n' "$(id -un 2>/dev/null)"`,
    GPU_PROBE,
    SLURM_PROBE,
    `printf '${M}paths\\n'`,
    ...resolvePaths,
    `printf '${M}end\\n'`
  ].join('\n')
}
