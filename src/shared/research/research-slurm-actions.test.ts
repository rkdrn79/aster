import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { asterSlurmJobComment, projectKeyFromSlurmComment } from './research-gpu-policy'
import {
  buildSlurmCancelCommand,
  buildSlurmSubmitCommand,
  parseSlurmCancelOutput,
  parseSlurmSubmitOutput,
  researchSlurmJobRequestSchema,
  type ResearchSlurmJobRequest
} from './research-slurm-actions'

// Records where it ran and every argv entry; answers like Slurm 23.11 does (seen on a real cluster).
const RECORDING_TOOL = `#!/bin/sh
printf 'cwd=%s\\n' "$PWD" > "$FAKE_LOG"
for arg in "$@"; do printf 'arg=%s\\n' "$arg" >> "$FAKE_LOG"; done
case "$(basename "$0")" in
  scancel)
    [ -n "$FAKE_FAIL" ] && echo "scancel: error: Kill job error on job id 9: Invalid job id specified" >&2
    ;;
  sbatch)
    case " $* " in
      *" --test-only "*)
        echo "sbatch: Job 152716 to start at 2026-11-20T16:35:14 using 2 processors on nodes node02 in partition a6000" >&2 ;;
      *) echo 152801 ;;
    esac
    ;;
esac
`

const roots: string[] = []
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function runOnFakeCluster(
  buildCommand: (workDir: string) => string,
  env: Record<string, string> = {}
) {
  const root = mkdtempSync(join(tmpdir(), 'aster-slurm-actions-'))
  roots.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  for (const tool of ['sbatch', 'scancel']) {
    writeFileSync(join(bin, tool), RECORDING_TOOL)
    chmodSync(join(bin, tool), 0o755)
  }
  const workDir = join(root, "lora r16 'quoted' $HOME")
  mkdirSync(workDir)
  const log = join(root, 'calls.log')
  const result = spawnSync('/bin/sh', ['-c', buildCommand(workDir)], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_LOG: log, ...env }
  })
  const calls = readFileSync(log, 'utf8').trimEnd().split('\n')
  return { status: result.status, stdout: result.stdout, calls, workDir }
}

function request(overrides: Partial<ResearchSlurmJobRequest>): ResearchSlurmJobRequest {
  return researchSlurmJobRequestSchema.parse({
    workDir: '/placeholder',
    run: { kind: 'script', scriptPath: 'scripts/train.sbatch' },
    ...overrides
  })
}

describe.skipIf(process.platform === 'win32')('SLURM job commands', () => {
  it('passes every field to sbatch unchanged and from the working directory', () => {
    const job = request({
      jobName: 'lora-r16',
      partition: 'a6000',
      gpus: 2,
      cpusPerTask: 8,
      memory: '64G',
      timeLimit: '1-00:00:00',
      run: { kind: 'script', scriptPath: "runs/it's $HOME.sbatch" }
    })
    const { status, stdout, calls, workDir } = runOnFakeCluster((dir) =>
      buildSlurmSubmitCommand({ ...job, workDir: dir }, false)
    )

    expect(status).toBe(0)
    expect(calls).toEqual([
      `cwd=${workDir}`,
      'arg=--parsable',
      'arg=--job-name=lora-r16',
      'arg=--partition=a6000',
      'arg=--gres=gpu:2',
      'arg=--cpus-per-task=8',
      'arg=--mem=64G',
      'arg=--time=1-00:00:00',
      "arg=runs/it's $HOME.sbatch"
    ])
    expect(parseSlurmSubmitOutput(stdout, false)).toMatchObject({ ok: true, jobId: '152801' })
  })

  it('sends a linked Run its own output file and names the Run in the comment', () => {
    const log = "/data/me/it's here/research/experiments/lora-r16/runs/seed-42/train.log"
    const { calls } = runOnFakeCluster((dir) =>
      buildSlurmSubmitCommand({ ...request({}), workDir: dir }, false, {
        comment: asterSlurmJobComment('project:abc', 'lora-r16/seed-42'),
        outputPath: log
      })
    )
    expect(calls.slice(1, 6)).toEqual([
      'arg=--parsable',
      'arg=--comment=aster:project=project%3Aabc;run=lora-r16%2Fseed-42',
      `arg=--output=${log}`,
      `arg=--error=${log}`,
      'arg=--open-mode=append'
    ])
    expect(
      projectKeyFromSlurmComment(asterSlurmJobComment('project:abc', 'lora-r16/seed-42'))
    ).toBe('project:abc')
  })

  it('wraps a command verbatim and reads the test-only start estimate', () => {
    const command = `python -c 'print("$HOME")' && echo "done; rm -rf /"`
    const { stdout, calls } = runOnFakeCluster((dir) =>
      buildSlurmSubmitCommand(
        { ...request({ run: { kind: 'command', command } }), workDir: dir },
        true
      )
    )

    expect(calls.slice(1)).toEqual(['arg=--parsable', 'arg=--test-only', `arg=--wrap=${command}`])
    expect(parseSlurmSubmitOutput(stdout, true)).toEqual({
      ok: true,
      jobId: null,
      estimate: {
        startTime: '2026-11-20T16:35:14',
        processors: 2,
        nodes: 'node02',
        partition: 'a6000'
      },
      held: false,
      message: 'Would start at 2026-11-20T16:35:14 on node02 (a6000). No job was created.'
    })
  })

  it('cancels only as the signed-in user and reports scancel refusals', () => {
    const cancelled = runOnFakeCluster(() => buildSlurmCancelCommand('148848_1'))
    expect(cancelled.calls.slice(1)).toEqual([`arg=--user=${userInfo().username}`, 'arg=148848_1'])
    expect(parseSlurmCancelOutput(cancelled.stdout).ok).toBe(true)

    const refused = runOnFakeCluster(() => buildSlurmCancelCommand('9'), { FAKE_FAIL: '1' })
    expect(parseSlurmCancelOutput(refused.stdout)).toMatchObject({
      ok: false,
      message: 'scancel: error: Kill job error on job id 9: Invalid job id specified'
    })
  })
})

describe('researchSlurmJobRequestSchema', () => {
  it('rejects inputs sbatch would read as options or misparse', () => {
    const base = { workDir: '/data/me', run: { kind: 'script', scriptPath: 'a.sbatch' } }
    const rejected = [
      { ...base, workDir: 'data/me' },
      { ...base, run: { kind: 'script', scriptPath: '--wrap=id' } },
      { ...base, partition: 'a100 --uid=0' },
      { ...base, timeLimit: '1 day' },
      { ...base, memory: '64 GB' }
    ]
    expect(rejected.map((input) => researchSlurmJobRequestSchema.safeParse(input).success)).toEqual(
      [false, false, false, false, false]
    )
  })
})
