import type {
  ResearchComputeBudget,
  ResearchComputeJob
} from '../../../shared/research/research-compute-api'
import type { ResearchDeadlineEntry } from '../../../shared/research/research-deadlines-api'
import type { PhoneStatusTone } from './PhoneListLayout'

/** The next milestones the author acts on, soonest first, as the desktop's Home card picks them. */
export function nextPhoneDeadlines(
  upcoming: readonly ResearchDeadlineEntry[],
  now: number,
  count = 3
): ResearchDeadlineEntry[] {
  return upcoming.filter((entry) => entry.actionable && Date.parse(entry.at) >= now).slice(0, count)
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

const isRunning = (job: ResearchComputeJob): boolean =>
  job.state === 'running' || job.state === 'completing'

/**
 * "2 running · 1 waiting · 3 GPUs running"; with a GPU limit, what the jobs book against it
 * (running plus waiting jobs the budget does not hold), as the host counts it.
 */
export function computeQueueSummary(
  jobs: readonly ResearchComputeJob[],
  budget: ResearchComputeBudget | null
): string {
  const running = jobs.filter(isRunning)
  const waiting = jobs.filter((job) => job.state === 'pending' || job.state === 'held').length
  const runningGpus = running.reduce((total, job) => total + job.gpus, 0)
  const gpus =
    budget?.usedGpus != null
      ? `${budget.usedGpus} of ${plural(budget.maxGpus, 'GPU')} booked`
      : `${plural(runningGpus, 'GPU')} running`
  return [
    running.length ? `${running.length} running` : null,
    waiting ? `${waiting} waiting` : null,
    runningGpus || budget ? gpus : null
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Running jobs first, then waiting ones, each in squeue's order. */
export function phoneComputeJobs(jobs: readonly ResearchComputeJob[]): ResearchComputeJob[] {
  const rank = (job: ResearchComputeJob): number =>
    isRunning(job) ? 0 : job.state === 'other' ? 2 : 1
  return jobs.toSorted((a, b) => rank(a) - rank(b))
}

export function computeJobPill(job: ResearchComputeJob): { label: string; tone: PhoneStatusTone } {
  switch (job.state) {
    case 'running':
    case 'completing':
      return { label: 'Running', tone: 'working' }
    case 'pending':
      return { label: 'Waiting', tone: 'neutral' }
    case 'held':
      return { label: 'Held', tone: 'neutral' }
    case 'suspended':
      return { label: 'Suspended', tone: 'neutral' }
    case 'other':
      return { label: job.slurmState, tone: 'neutral' }
  }
}

/** The muted line under a job: its GPUs, then how long it ran or why it waits. */
export function computeJobDetail(job: ResearchComputeJob): string {
  const waitReason = job.heldByBudget ? 'Held for the GPU budget' : job.reason
  return [
    job.gpus ? plural(job.gpus, 'GPU') : null,
    isRunning(job) ? job.elapsed : waitReason,
    job.project?.run ?? null
  ]
    .filter(Boolean)
    .join(' · ')
}
