/** One figure waiting for its background render. */
export type FigureRenderJob<T> = {
  key: string
  value: T
  /** Higher first: 2 the harness asked, 1 the scene changed, 0 found stale on a first look. */
  priority: number
  dueAt: number
  queuedAt: number
  attempt: number
}

/** A job's answer: done, or try again later (an editor has it open and may render it itself). */
export type FigureRenderOutcome = 'done' | { retryInMs: number }

export type FigureRenderQueueOptions<T> = {
  run: (job: FigureRenderJob<T>) => Promise<FigureRenderOutcome>
  now?: () => number
  /** Renders at once; one keeps memory to one scene and one export at a time. */
  concurrency?: number
  /** Jobs kept waiting; past it the lowest-priority, latest-due one is dropped. */
  maxPending?: number
  /** Quiet time after a change before rendering, so a script's burst of writes renders once. */
  debounceMs?: number
  /** A job that keeps changing still renders this long after it was first queued. */
  maxWaitMs?: number
}

type Rerun<T> = { value: T; priority: number }

/**
 * The background renderer's queue: debounced per figure, highest priority first, a bounded number
 * running and waiting. It has no timers of its own: `pump` runs what is due, and the caller calls
 * it on a tick that a hidden window does not throttle.
 */
export function createFigureRenderQueue<T>(options: FigureRenderQueueOptions<T>) {
  const now = options.now ?? Date.now
  const concurrency = options.concurrency ?? 1
  const maxPending = options.maxPending ?? 64
  const debounceMs = options.debounceMs ?? 1200
  const maxWaitMs = options.maxWaitMs ?? 6000
  const pending = new Map<string, FigureRenderJob<T>>()
  const running = new Set<string>()
  const reruns = new Map<string, Rerun<T>>()

  function trim(): void {
    while (pending.size > maxPending) {
      const victim = [...pending.values()].sort(
        (a, b) => a.priority - b.priority || b.dueAt - a.dueAt
      )[0]
      pending.delete(victim.key)
    }
  }

  function schedule(
    key: string,
    value: T,
    { priority = 1, delayMs = debounceMs, attempt = 0 } = {}
  ): void {
    if (running.has(key)) {
      const rerun = reruns.get(key)
      reruns.set(key, { value, priority: Math.max(priority, rerun?.priority ?? priority) })
      return
    }
    const at = now()
    const existing = pending.get(key)
    if (existing) {
      existing.value = value
      existing.priority = Math.max(existing.priority, priority)
      existing.dueAt = Math.min(at + delayMs, existing.queuedAt + maxWaitMs)
      existing.attempt = attempt
    } else {
      pending.set(key, { key, value, priority, dueAt: at + delayMs, queuedAt: at, attempt })
      trim()
    }
    pump()
  }

  function finish(job: FigureRenderJob<T>, outcome: FigureRenderOutcome | null): void {
    running.delete(job.key)
    const rerun = reruns.get(job.key)
    reruns.delete(job.key)
    if (rerun) {
      schedule(job.key, rerun.value, { priority: rerun.priority })
    } else if (outcome && outcome !== 'done') {
      schedule(job.key, job.value, {
        priority: job.priority,
        delayMs: outcome.retryInMs,
        attempt: job.attempt + 1
      })
    }
    pump()
  }

  function next(at: number): FigureRenderJob<T> | null {
    let best: FigureRenderJob<T> | null = null
    for (const job of pending.values()) {
      if (job.dueAt > at) {
        continue
      }
      if (
        !best ||
        job.priority > best.priority ||
        (job.priority === best.priority && job.dueAt < best.dueAt)
      ) {
        best = job
      }
    }
    return best
  }

  function pump(): void {
    while (running.size < concurrency) {
      const job = next(now())
      if (!job) {
        return
      }
      pending.delete(job.key)
      running.add(job.key)
      void Promise.resolve()
        .then(() => options.run(job))
        .then(
          (outcome) => finish(job, outcome),
          // Why dropped: a failed render is tried again when its scene changes or is asked for.
          () => finish(job, null)
        )
    }
  }

  return {
    schedule,
    pump,
    cancel: (key: string) => {
      pending.delete(key)
      reruns.delete(key)
    },
    size: () => pending.size + running.size,
    has: (key: string) => pending.has(key) || running.has(key)
  }
}

export type FigureRenderQueue<T> = ReturnType<typeof createFigureRenderQueue<T>>
