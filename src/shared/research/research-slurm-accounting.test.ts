import { describe, expect, it } from 'vitest'
import {
  buildSlurmJobTrackingCommand,
  parseSlurmJobTrackingOutput,
  researchExecutionFromJob
} from './research-slurm-accounting'

// `sacct -n -P -j … -o JobID,State,ExitCode,Start,End,Elapsed`, then the squeue section.
const SACCT_FIXTURE = [
  '1001|COMPLETED|0:0|2026-10-24T01:00:00|2026-10-24T03:00:00|02:00:00',
  '1001.batch|COMPLETED|0:0|2026-10-24T01:00:00|2026-10-24T03:00:00|02:00:00',
  '1002|FAILED|1:0|2026-10-24T01:00:00|2026-10-24T01:05:00|00:05:00',
  '1002.batch|FAILED|1:0|2026-10-24T01:00:00|2026-10-24T01:05:00|00:05:00',
  '1003|CANCELLED by 51234|0:15|2026-10-24T01:00:00|2026-10-24T01:10:00|00:10:00',
  '1004|TIMEOUT|0:0|2026-10-24T01:00:00|2026-10-25T01:00:00|1-00:00:00',
  '1005|FAILED|0:125|2026-10-24T01:00:00|2026-10-24T02:00:00|01:00:00',
  '1005.batch|OUT_OF_MEMORY|0:125|2026-10-24T01:00:00|2026-10-24T02:00:00|01:00:00',
  '1006|OUT_OF_MEMORY|0:125|2026-10-24T01:00:00|2026-10-24T02:00:00|01:00:00',
  '1007|NODE_FAIL|1:0|2026-10-24T01:00:00|2026-10-24T01:30:00|00:30:00',
  '1008|PENDING|0:0|Unknown|Unknown|00:00:00',
  '1009|RUNNING|0:0|2026-10-24T04:00:00|Unknown|00:12:00',
  '@@aster-squeue',
  '1008|PENDING|Priority',
  '1009|RUNNING|None'
].join('\n')

describe('SLURM job tracking output', () => {
  const { jobs, accounting } = parseSlurmJobTrackingOutput(SACCT_FIXTURE)

  it('reads each terminal state with its exit code and reason', () => {
    expect(accounting).toBe(true)
    expect(jobs.get('1001')).toMatchObject({ state: 'completed', exitCode: 0, source: 'sacct' })
    expect(jobs.get('1002')).toMatchObject({ state: 'failed', exitCode: 1, signal: 0 })
    expect(jobs.get('1003')).toMatchObject({
      state: 'cancelled',
      signal: 15,
      reason: 'cancelled by uid 51234'
    })
    expect(jobs.get('1004')).toMatchObject({ state: 'timeout', reason: 'hit its time limit' })
    expect(jobs.get('1006')).toMatchObject({ state: 'out_of_memory' })
    expect(jobs.get('1007')).toMatchObject({ state: 'node_fail', exitCode: 1 })
  })

  it('takes OUT_OF_MEMORY from the batch step when the allocation only says FAILED', () => {
    expect(jobs.get('1005')).toMatchObject({
      state: 'out_of_memory',
      reason: 'ran out of memory'
    })
  })

  it('keeps live jobs live and drops placeholder times', () => {
    expect(jobs.get('1008')).toMatchObject({ state: 'pending', startedAt: null, endedAt: null })
    expect(jobs.get('1009')).toMatchObject({
      state: 'running',
      startedAt: '2026-10-24T04:00:00',
      source: 'sacct'
    })
  })

  it('falls back to the queue when accounting is disabled', () => {
    const read = parseSlurmJobTrackingOutput(
      [
        'sacct: error: Slurm accounting storage is disabled',
        '@@aster-squeue',
        '2001|PENDING|Resources',
        '2002|RUNNING|None'
      ].join('\n')
    )
    expect(read.accounting).toBe(false)
    expect(read.jobs.get('2001')).toMatchObject({
      state: 'pending',
      reason: 'Resources',
      source: 'squeue'
    })
    expect(read.jobs.get('2002')).toMatchObject({ state: 'running', reason: null })
    expect(read.jobs.has('2003')).toBe(false)
  })

  it('maps job states to Run execution without calling a nonzero completion a success', () => {
    expect(researchExecutionFromJob('completed', 0)).toBe('succeeded')
    expect(researchExecutionFromJob('completed', 2)).toBe('failed')
    expect(researchExecutionFromJob('out_of_memory', null)).toBe('failed')
    expect(researchExecutionFromJob('cancelled', null)).toBe('cancelled')
    expect(researchExecutionFromJob('pending', null)).toBe('unknown')
    expect(researchExecutionFromJob('preempted', null)).toBe('unknown')
  })

  it('builds one read for all jobs and drops ids that are not job ids', () => {
    const command = buildSlurmJobTrackingCommand(['1001', '1002_3', '1; rm -rf ~', '1001'])
    expect(command).toContain("sacct -n -P -j '1001,1002_3'")
    expect(command).toContain("squeue -h -j '1001,1002_3'")
    expect(command).not.toContain('rm -rf')
  })
})
