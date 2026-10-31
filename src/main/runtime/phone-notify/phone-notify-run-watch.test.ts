import { describe, expect, it } from 'vitest'
import type { ResearchRunExecutionState } from '../../../shared/research/research-run-manifest'
import type { PhoneNotifyRunEnd } from './phone-notify-messages'
import { PhoneNotifyRunWatch, type PhoneNotifyWatchedRun } from './phone-notify-run-watch'

function run(id: string, state: ResearchRunExecutionState): PhoneNotifyWatchedRun {
  return { experiment: 'lr-sweep', experimentName: 'LR sweep', run: id, runName: id, state }
}

function createWatch(initial: PhoneNotifyWatchedRun[]) {
  const announced: PhoneNotifyRunEnd[] = []
  const host = { runs: initial, wanted: true }
  const watch = new PhoneNotifyRunWatch({
    listWorktreeIds: () => ['repo::/work/proj', 'repo::/ssh/elsewhere'],
    readRuns: async (worktreeId) => {
      if (worktreeId !== 'repo::/work/proj') {
        throw new Error('not a local workspace')
      }
      return host.runs
    },
    isWanted: () => host.wanted,
    onRunEnded: (ended) => announced.push(ended)
  })
  return { watch, host, announced }
}

describe('PhoneNotifyRunWatch', () => {
  it('seeds on the first read, then announces Runs that went from running to an end', async () => {
    const { watch, host, announced } = createWatch([
      run('old', 'failed'),
      run('a', 'running'),
      run('b', 'running'),
      run('c', 'running')
    ])
    await watch.poll()
    expect(announced).toEqual([])
    host.runs = [
      run('old', 'failed'),
      run('a', 'succeeded'),
      run('b', 'failed'),
      run('c', 'cancelled')
    ]
    await watch.poll()
    expect(announced.map((ended) => [ended.run, ended.state])).toEqual([
      ['a', 'succeeded'],
      ['b', 'failed']
    ])
    await watch.poll()
    expect(announced).toHaveLength(2)
  })

  it('reads nothing while no phone is subscribed, and re-seeds once one is', async () => {
    const { watch, host, announced } = createWatch([run('a', 'running')])
    await watch.poll()
    host.wanted = false
    host.runs = [run('a', 'failed')]
    await watch.poll()
    host.wanted = true
    await watch.poll()
    expect(announced).toEqual([])
  })
})
