import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildResearchComputeProbeCommand } from './research-compute-probe'
import { parseResearchComputeProbeOutput } from './research-compute-probe-output'

const FAKE_NVIDIA_SMI = `#!/bin/sh
case "$*" in
  *--query-gpu=*)
    if [ -n "$FAKE_SMI_FAIL" ]; then
      echo "NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver."
      exit 9
    fi
    printf '0, GPU-aaa, NVIDIA A100-SXM4-80GB, 40960, 81920, 97, 61\\n'
    printf '1, GPU-bbb, Tesla V100, 16GB, 3, 16384, [N/A], [N/A]\\n'
    ;;
  *--query-compute-apps=*)
    printf 'GPU-aaa, %s, 40000\\n' "$FAKE_PID"
    printf 'GPU-bbb, %s, 3\\n' "$FAKE_PID"
    ;;
esac
`

// Prints a TSV fixture the way squeue/sinfo -O does: requested columns in order, each tab-suffixed.
const FAKE_SLURM_TABLE = (tableVariable: string): string => `#!/bin/sh
if [ "$1" = "--version" ]; then echo "slurm 23.11.10"; exit 0; fi
if [ -n "$FAKE_SLURM_FAIL" ]; then
  echo "slurm_load_jobs error: Unable to contact slurm controller (connect failure)" >&2
  exit 1
fi
user=""
spec=""
while [ $# -gt 0 ]; do
  case "$1" in
    -u) user=$2; shift ;;
    -O) spec=$2; shift ;;
  esac
  shift
done
awk -F '\\t' -v spec="$spec" -v user="$user" '
  BEGIN { count = split(spec, wanted, ","); for (i = 1; i <= count; i++) sub(/:0\\t?$/, "", wanted[i]) }
  NR == 1 { for (i = 1; i <= NF; i++) column[$i] = i; next }
  user != "" && $(column["UserName"]) != user { next }
  { line = ""; for (i = 1; i <= count; i++) line = line ((wanted[i] in column) ? $(column[wanted[i]]) : "") "\\t"; print line }
' "$${tableVariable}"
`

function table(rows: Record<string, string>[]): string {
  const columns = Object.keys(rows[0])
  return [columns, ...rows.map((row) => columns.map((column) => row[column]))]
    .map((cells) => cells.join('\t'))
    .join('\n')
}

const me = userInfo().username
const job = {
  JobArrayID: '147487',
  Name: 'eval-baseline-retry1',
  UserName: me,
  StateCompact: 'PD',
  Reason: 'DependencyNeverSatisfied',
  Partition: 'a6000',
  NumNodes: '1',
  NodeList: '',
  'tres-alloc': 'cpu=1,mem=4G,node=1,billing=1',
  TimeUsed: '0:00',
  TimeLimit: '5:00',
  SubmitTime: '2026-10-20T15:43:02',
  StartTime: 'N/A',
  WorkDir: '/data/projects/me/captioning',
  Command: '(null)',
  Comment: '(null)'
}
const jobs = [
  job,
  {
    ...job,
    JobArrayID: '148848_1',
    Name: 'lora-r16-seed1',
    StateCompact: 'R',
    Reason: 'None',
    Partition: 'a100',
    NodeList: 'node01',
    'tres-alloc': 'cpu=8,mem=64G,node=1,billing=8,gres/gpu=2,gres/gpu:a100=2',
    StartTime: '2026-10-23T22:14:13',
    Command: '/data/projects/me/lora/scripts/train.sbatch'
  },
  { ...job, JobArrayID: '151163', UserName: 'bob', StateCompact: 'R', 'tres-alloc': 'gres/gpu=1' }
]
const nodes = [
  {
    NodeList: 'node01',
    Partition: 'a100',
    StateLong: 'mixed',
    Gres: 'gpu:a100:8',
    GresUsed: 'gpu:a100:8(IDX:0-7)'
  },
  {
    NodeList: 'node02',
    Partition: 'a6000*',
    StateLong: 'down*',
    Gres: 'gpu:rtx_3090:4(S:0-1)',
    GresUsed: 'gpu:rtx_3090:0'
  }
]

const roots: string[] = []
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function scratchDir(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

function runProbe(workspacePaths: string[], env: Record<string, string> = {}) {
  const root = scratchDir('aster-compute-probe-')
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const fakes = {
    'nvidia-smi': FAKE_NVIDIA_SMI,
    squeue: FAKE_SLURM_TABLE('FAKE_SQUEUE_TABLE'),
    sinfo: FAKE_SLURM_TABLE('FAKE_SINFO_TABLE')
  }
  for (const [name, script] of Object.entries(fakes)) {
    writeFileSync(join(bin, name), script)
    chmodSync(join(bin, name), 0o755)
  }
  writeFileSync(join(root, 'squeue.tsv'), table(jobs))
  writeFileSync(join(root, 'sinfo.tsv'), table(nodes))
  const result = spawnSync('/bin/sh', ['-c', buildResearchComputeProbeCommand(workspacePaths)], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_PID: String(process.pid),
      FAKE_SQUEUE_TABLE: join(root, 'squeue.tsv'),
      FAKE_SINFO_TABLE: join(root, 'sinfo.tsv'),
      ...env
    }
  })
  expect(result.status).toBe(0)
  return parseResearchComputeProbeOutput(result.stdout)
}

describe.skipIf(process.platform === 'win32')('research compute probe', () => {
  it('reads the user’s SLURM jobs, the queue and node GPUs from the scheduler', () => {
    const { status, remoteUser, slurm } = runProbe([])

    expect(status).toBe('ok')
    expect(remoteUser).toBe(me)
    expect(slurm.status).toBe('ok')
    expect(slurm.version).toBe('slurm 23.11.10')
    expect(slurm.jobs).toEqual([
      {
        jobId: '147487',
        name: 'eval-baseline-retry1',
        state: 'PD',
        reason: 'DependencyNeverSatisfied',
        partition: 'a6000',
        nodeCount: 1,
        nodes: null,
        gpuCount: 0,
        timeUsed: '0:00',
        timeLimit: '5:00',
        submitTime: '2026-10-20T15:43:02',
        startTime: null,
        workDir: '/data/projects/me/captioning',
        command: null,
        comment: null
      },
      expect.objectContaining({
        jobId: '148848_1',
        state: 'R',
        reason: null,
        nodes: 'node01',
        gpuCount: 2,
        command: '/data/projects/me/lora/scripts/train.sbatch'
      })
    ])
    expect(slurm.queue).toEqual([
      { user: me, state: 'PD', partition: 'a6000', gpuCount: 0 },
      { user: me, state: 'R', partition: 'a100', gpuCount: 2 },
      { user: 'bob', state: 'R', partition: 'a6000', gpuCount: 1 }
    ])
    expect(slurm.nodes).toEqual([
      {
        name: 'node01',
        partition: 'a100',
        state: 'mixed',
        gpuTypes: ['a100'],
        gpuTotal: 8,
        gpuUsed: 8
      },
      {
        name: 'node02',
        partition: 'a6000',
        state: 'down*',
        gpuTypes: ['rtx_3090'],
        gpuTotal: 4,
        gpuUsed: 0
      }
    ])
  })

  it('reports an unreachable SLURM controller instead of an empty queue', () => {
    const { slurm } = runProbe([], { FAKE_SLURM_FAIL: '1' })

    expect(slurm.status).toBe('error')
    expect(slurm.message).toContain('Unable to contact slurm controller')
  })

  it('reads GPUs, compute PIDs and resolved workspace paths on a GPU node', () => {
    const scratch = scratchDir('aster-compute-workspace-')
    const real = join(scratch, 'real project')
    mkdirSync(real)
    const linked = join(scratch, 'linked')
    symlinkSync(real, linked)

    const { gpu, resolvedWorkspacePaths } = runProbe([linked, join(scratch, 'missing')])

    expect(gpu.status).toBe('ok')
    expect(
      gpu.devices.map(({ index, name, utilizationPercent }) => [index, name, utilizationPercent])
    ).toEqual([
      [0, 'NVIDIA A100-SXM4-80GB', 97],
      [1, 'Tesla V100, 16GB', null]
    ])
    expect(
      gpu.processes.map(({ pid, gpuUuid, usedMemoryMiB }) => [pid, gpuUuid, usedMemoryMiB])
    ).toEqual([
      [process.pid, 'GPU-aaa', 40000],
      [process.pid, 'GPU-bbb', 3]
    ])
    expect(gpu.processes[0].user).toBe(me)
    if (process.platform === 'linux') {
      expect(gpu.processes[0].cwd).toBe(realpathSync(process.cwd()))
    }
    expect(resolvedWorkspacePaths).toEqual({ [linked]: realpathSync(real) })
  })

  it('reports nvidia-smi failure output instead of an empty GPU list', () => {
    const { gpu } = runProbe([], { FAKE_SMI_FAIL: '1' })

    expect(gpu.status).toBe('error')
    expect(gpu.message).toContain("couldn't communicate with the NVIDIA driver")
  })

  it('reports a host with neither SLURM nor nvidia-smi', () => {
    const empty = scratchDir('aster-compute-empty-path-')
    const result = spawnSync('/bin/sh', ['-c', buildResearchComputeProbeCommand([])], {
      encoding: 'utf8',
      env: { PATH: empty }
    })
    const output = parseResearchComputeProbeOutput(result.stdout)

    expect(result.status).toBe(0)
    expect([output.status, output.gpu.status, output.slurm.status]).toEqual([
      'ok',
      'missing',
      'missing'
    ])
  })
})
