import { describe, expect, it } from 'vitest'
import { createFigureRenderQueue, type FigureRenderOutcome } from './research-figure-render-queue'

function harness(outcome: (key: string) => FigureRenderOutcome = () => 'done') {
  let clock = 0
  const started: string[] = []
  const finishers: (() => void)[] = []
  const queue = createFigureRenderQueue<string>({
    now: () => clock,
    debounceMs: 1000,
    maxWaitMs: 4000,
    maxPending: 3,
    run: (job) => {
      started.push(`${job.key}#${job.attempt}`)
      return new Promise((resolve) => finishers.push(() => resolve(outcome(job.key))))
    }
  })
  const finishAll = async (): Promise<void> => {
    while (finishers.length) {
      finishers.shift()?.()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  return {
    queue,
    started,
    finishAll,
    at: (ms: number) => {
      clock = ms
      queue.pump()
    }
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('the background render queue', () => {
  it('renders a burst of writes to one figure once, after the writes stop', async () => {
    const { queue, started, at } = harness()
    queue.schedule('fig', 'v1')
    at(500)
    queue.schedule('fig', 'v2')
    at(1400)
    await tick()
    expect(started).toEqual([])
    at(1500)
    await tick()
    expect(started).toEqual(['fig#0'])
  })

  it('still renders a figure that keeps changing, once its longest wait is up', async () => {
    const { queue, started, at } = harness()
    for (let ms = 0; ms <= 4000; ms += 500) {
      at(ms)
      queue.schedule('fig', `v${ms}`)
    }
    await tick()
    expect(started).toEqual(['fig#0'])
  })

  it('runs one at a time, the harness request first, and drops the least wanted when full', async () => {
    const { queue, started, at, finishAll } = harness()
    queue.schedule('stale', 's', { priority: 0, delayMs: 0 })
    await tick()
    queue.schedule('old', 'o', { priority: 0, delayMs: 0 })
    queue.schedule('changed', 'c', { priority: 1, delayMs: 0 })
    queue.schedule('asked', 'a', { priority: 2, delayMs: 0 })
    queue.schedule('another', 'x', { priority: 1, delayMs: 0 })
    at(1)
    await tick()
    expect(started).toEqual(['stale#0'])
    expect(queue.has('old')).toBe(false)
    await finishAll()
    expect(started).toEqual(['stale#0', 'asked#0', 'changed#0', 'another#0'])
  })

  it('renders again when the scene changed during its render, and retries a deferred one', async () => {
    const { queue, started, at, finishAll } = harness((key) =>
      key === 'open' ? { retryInMs: 8000 } : 'done'
    )
    queue.schedule('fig', 'v1', { delayMs: 0 })
    await tick()
    queue.schedule('fig', 'v2', { delayMs: 0 })
    await finishAll()
    at(1000)
    await finishAll()
    expect(started).toEqual(['fig#0', 'fig#0'])
    queue.schedule('open', 'o', { delayMs: 0 })
    await finishAll()
    at(8999)
    await tick()
    expect(started.at(-1)).toBe('open#0')
    at(9000)
    await tick()
    expect(started.at(-1)).toBe('open#1')
  })
})
