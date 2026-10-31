import type { ResearchRunExecutionState } from '../../../shared/research/research-run-manifest'
import type { PhoneNotifyRunEnd } from './phone-notify-messages'

const POLL_INTERVAL_MS = 60_000

/** One Run as a workspace's `.aster/` overview lists it. */
export type PhoneNotifyWatchedRun = {
  experiment: string
  experimentName: string
  run: string
  runName: string
  state: ResearchRunExecutionState
}

type PhoneNotifyRunWatchOptions = {
  /** Workspaces whose `.aster/` Runs are watched: each project's own checkout on this host. */
  listWorktreeIds: () => readonly string[]
  readRuns: (worktreeId: string) => Promise<readonly PhoneNotifyWatchedRun[]>
  /** Polling costs file reads, so it runs only while some phone wants the result. */
  isWanted: () => boolean
  onRunEnded: (run: PhoneNotifyRunEnd) => void
}

function runKey(run: Pick<PhoneNotifyWatchedRun, 'experiment' | 'run'>): string {
  return `${run.experiment}\0${run.run}`
}

/**
 * orcad has no Run watcher of its own (the desktop's runs in its main process), so this polls
 * each project's overview and announces a Run it saw running that now reports an end.
 */
export class PhoneNotifyRunWatch {
  private readonly statesByWorktree = new Map<string, Map<string, ResearchRunExecutionState>>()
  private timer: ReturnType<typeof setInterval> | null = null
  private polling = false

  constructor(private readonly options: PhoneNotifyRunWatchOptions) {}

  start(): void {
    this.timer ??= setInterval(() => void this.poll(), POLL_INTERVAL_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async poll(): Promise<void> {
    if (this.polling) {
      return
    }
    if (!this.options.isWanted()) {
      // Why forget: a phone that subscribes later must not hear about Runs that ended unwatched.
      this.statesByWorktree.clear()
      return
    }
    this.polling = true
    try {
      for (const worktreeId of this.options.listWorktreeIds()) {
        await this.pollWorktree(worktreeId)
      }
    } finally {
      this.polling = false
    }
  }

  private async pollWorktree(worktreeId: string): Promise<void> {
    let runs: readonly PhoneNotifyWatchedRun[]
    try {
      runs = await this.options.readRuns(worktreeId)
    } catch {
      // A workspace without `.aster/`, or one on another machine, has nothing to watch.
      return
    }
    const previous = this.statesByWorktree.get(worktreeId)
    if (previous) {
      for (const run of runs) {
        if (
          previous.get(runKey(run)) === 'running' &&
          (run.state === 'succeeded' || run.state === 'failed')
        ) {
          this.options.onRunEnded({
            worktreeId,
            experiment: run.experiment,
            experimentName: run.experimentName,
            run: run.run,
            runName: run.runName,
            state: run.state
          })
        }
      }
    }
    // Why merged: a Run that drops out of the overview's window must not erase what was seen.
    this.statesByWorktree.set(
      worktreeId,
      new Map([...(previous ?? []), ...runs.map((run) => [runKey(run), run.state] as const)])
    )
  }
}
