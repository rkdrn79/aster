import {
  RESEARCH_COMPUTE_MARK,
  RESEARCH_SLURM_MY_JOB_FIELD_COUNT,
  RESEARCH_SLURM_NODE_FIELD_COUNT,
  RESEARCH_SLURM_QUEUE_FIELD_COUNT,
  RESEARCH_SLURM_QUEUE_LINE_CAP,
  type ResearchComputeSample,
  type ResearchGpuDevice,
  type ResearchGpuProcess,
  type ResearchSlurmJob,
  type ResearchSlurmNode,
  type ResearchSlurmQueueEntry
} from './research-compute-probe'

type ParsedProbe = Pick<
  ResearchComputeSample,
  'status' | 'message' | 'remoteUser' | 'gpu' | 'slurm' | 'resolvedWorkspacePaths'
>

function optionalNumber(field: string | undefined): number | null {
  const trimmed = field?.trim() ?? ''
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : null
}

function optionalText(field: string | undefined): string | null {
  const trimmed = field?.trim() ?? ''
  return trimmed && trimmed !== 'N/A' && trimmed !== '(null)' ? trimmed : null
}

function parseDevice(line: string): ResearchGpuDevice | null {
  const parts = line.split(',')
  const index = optionalNumber(parts[0])
  const uuid = parts[1]?.trim()
  if (parts.length < 7 || index === null || !Number.isInteger(index) || !uuid) {
    return null
  }
  const [memoryUsed, memoryTotal, utilization, temperature] = parts.slice(-4)
  return {
    index,
    uuid,
    // Why slice: a GPU name with a comma would otherwise shift every numeric column.
    name: parts.slice(2, -4).join(',').trim(),
    memoryUsedMiB: optionalNumber(memoryUsed),
    memoryTotalMiB: optionalNumber(memoryTotal),
    utilizationPercent: optionalNumber(utilization),
    temperatureC: optionalNumber(temperature)
  }
}

type ComputeApp = Pick<ResearchGpuProcess, 'gpuUuid' | 'pid' | 'usedMemoryMiB'>
type ProcessDetails = Pick<ResearchGpuProcess, 'user' | 'elapsedSeconds' | 'cwd' | 'command'>

function parseComputeApp(line: string): ComputeApp | null {
  const [gpuUuid, pidField, memory] = line.split(',')
  const pid = optionalNumber(pidField)
  if (!gpuUuid?.trim() || pid === null || !Number.isInteger(pid) || pid <= 0) {
    return null
  }
  return { gpuUuid: gpuUuid.trim(), pid, usedMemoryMiB: optionalNumber(memory) }
}

/** `gres/gpu=N` in a job's TRES; typed `gres/gpu:<type>=N` entries repeat the same GPUs. */
export function gpuCountFromTres(tres: string): number {
  return Number(/(?:^|,)gres\/gpu=(\d+)/.exec(tres)?.[1] ?? 0)
}

/** Sum and types of `gpu[:type]:N` entries in a node's Gres/GresUsed, e.g. `gpu:a100:8(IDX:0-7)`. */
export function gpusFromGres(gres: string): { count: number; types: string[] } {
  let count = 0
  const types = new Set<string>()
  for (const match of gres.matchAll(/(?:^|,)gpu(?::([\w.-]+))?:(\d+)/g)) {
    count += Number(match[2])
    if (match[1]) {
      types.add(match[1])
    }
  }
  return { count, types: [...types] }
}

function tabFields(line: string, count: number): string[] | null {
  const fields = line.split('\t')
  // squeue/sinfo end every field, including the last, with the tab suffix.
  if (fields.at(-1) === '') {
    fields.pop()
  }
  return fields.length === count ? fields : null
}

function parseSlurmJob(line: string): ResearchSlurmJob | null {
  const fields = tabFields(line, RESEARCH_SLURM_MY_JOB_FIELD_COUNT)
  if (!fields?.[0]?.trim()) {
    return null
  }
  const [jobId, name, state, reason, partition, nodeCount, nodes, tres, ...rest] = fields
  const [timeUsed, timeLimit, submitTime, startTime, workDir, command, comment] = rest
  return {
    jobId: jobId.trim(),
    name: name.trim(),
    state: state.trim(),
    reason: reason.trim() === 'None' ? null : optionalText(reason),
    partition: partition.trim(),
    nodeCount: optionalNumber(nodeCount),
    nodes: optionalText(nodes),
    gpuCount: gpuCountFromTres(tres),
    timeUsed: optionalText(timeUsed),
    timeLimit: optionalText(timeLimit),
    submitTime: optionalText(submitTime),
    startTime: optionalText(startTime),
    workDir: optionalText(workDir),
    command: optionalText(command),
    comment: optionalText(comment)
  }
}

/** The signed-in user's jobs from a bare `squeue -u <me> -O <job fields>` listing. */
export function parseResearchSlurmJobLines(stdout: string): ResearchSlurmJob[] {
  return stdout.split(/\r?\n/).flatMap((line) => parseSlurmJob(line) ?? [])
}

function parseQueueEntry(line: string): ResearchSlurmQueueEntry | null {
  const fields = tabFields(line, RESEARCH_SLURM_QUEUE_FIELD_COUNT)
  if (!fields?.[0]?.trim()) {
    return null
  }
  const [user, state, partition, tres] = fields
  return {
    user: user.trim(),
    state: state.trim(),
    partition: partition.trim(),
    gpuCount: gpuCountFromTres(tres)
  }
}

function parseNode(line: string): ResearchSlurmNode | null {
  const fields = tabFields(line, RESEARCH_SLURM_NODE_FIELD_COUNT)
  if (!fields?.[0]?.trim()) {
    return null
  }
  const [name, partition, state, gres, gresUsed] = fields
  const total = gpusFromGres(gres)
  return {
    name: name.trim(),
    // Why: sinfo marks the default partition with a trailing `*`.
    partition: partition.trim().replace(/\*$/, ''),
    state: state.trim(),
    gpuTypes: total.types,
    gpuTotal: total.count,
    gpuUsed: gpusFromGres(gresUsed).count
  }
}

function failureMessage(command: string, exit: number | null, lines: readonly string[]): string {
  const detail = lines.join(' ').trim().slice(0, 400)
  return detail || `${command} exited ${exit ?? 'without a status'}.`
}

export function parseResearchComputeProbeOutput(stdout: string): ParsedProbe {
  const sections = new Map<string, string[]>()
  const values = new Map<string, string>()
  let section: string | null = null
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith(RESEARCH_COMPUTE_MARK)) {
      const [name, ...value] = line.slice(RESEARCH_COMPUTE_MARK.length).split('\t')
      if (value.length) {
        values.set(name, value.join('\t'))
      } else {
        section = name
        sections.set(name, sections.get(name) ?? [])
      }
      continue
    }
    if (section && line.trim()) {
      sections.get(section)?.push(line)
    }
  }
  const lines = (name: string): string[] => sections.get(name) ?? []
  const exitOf = (name: string): number | null => optionalNumber(values.get(name))

  const gpu: ParsedProbe['gpu'] = { status: 'ok', message: null, devices: [], processes: [] }
  if (sections.has('gpu-missing')) {
    gpu.status = 'missing'
  } else if (exitOf('gpu-devices-exit') !== 0) {
    gpu.status = 'error'
    gpu.message = failureMessage('nvidia-smi', exitOf('gpu-devices-exit'), lines('gpu-devices'))
  } else {
    const details = new Map<number, ProcessDetails>()
    for (const line of lines('gpu-processes')) {
      const [pidField, user, elapsed, cwd, ...command] = line.split('\t')
      const pid = optionalNumber(pidField)
      if (pid !== null) {
        details.set(pid, {
          user: optionalText(user),
          elapsedSeconds: optionalNumber(elapsed),
          cwd: optionalText(cwd),
          command: optionalText(command.join(' '))
        })
      }
    }
    gpu.devices = lines('gpu-devices').flatMap((line) => parseDevice(line) ?? [])
    gpu.processes = lines('gpu-apps').flatMap((line) => {
      const app = parseComputeApp(line)
      return app
        ? [
            {
              ...app,
              ...(details.get(app.pid) ?? {
                user: null,
                elapsedSeconds: null,
                cwd: null,
                command: null
              })
            }
          ]
        : []
    })
  }

  const slurm: ParsedProbe['slurm'] = {
    status: 'ok',
    message: null,
    version: optionalText(values.get('slurm-version')),
    jobs: [],
    queue: [],
    queueTruncated: false,
    nodes: []
  }
  if (sections.has('slurm-missing')) {
    slurm.status = 'missing'
  } else {
    const failures = [
      exitOf('slurm-jobs-exit') !== 0
        ? failureMessage('squeue', exitOf('slurm-jobs-exit'), lines('slurm-jobs'))
        : null,
      exitOf('slurm-nodes-exit') !== 0
        ? failureMessage('sinfo', exitOf('slurm-nodes-exit'), lines('slurm-nodes'))
        : null
    ].filter((message): message is string => message !== null)
    const queueLines = lines('slurm-queue')
    slurm.status = failures.length ? 'error' : 'ok'
    slurm.message = failures.join(' · ') || null
    slurm.jobs = lines('slurm-jobs').flatMap((line) => parseSlurmJob(line) ?? [])
    slurm.queue = queueLines
      .slice(0, RESEARCH_SLURM_QUEUE_LINE_CAP)
      .flatMap((line) => parseQueueEntry(line) ?? [])
    slurm.queueTruncated = queueLines.length > RESEARCH_SLURM_QUEUE_LINE_CAP
    slurm.nodes = lines('slurm-nodes').flatMap((line) => parseNode(line) ?? [])
  }

  const resolvedWorkspacePaths: Record<string, string> = {}
  for (const line of lines('paths')) {
    const [path, resolved] = line.split('\t')
    const real = optionalText(resolved)
    if (path && real && real !== path) {
      resolvedWorkspacePaths[path] = real
    }
  }

  const complete = sections.has('end')
  return {
    status: complete ? 'ok' : 'error',
    message: complete ? null : 'The compute probe output was incomplete.',
    remoteUser: optionalText(values.get('user')),
    gpu,
    slurm,
    resolvedWorkspacePaths
  }
}
