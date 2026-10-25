import type {
  ResearchComputeSample,
  ResearchSlurmNode
} from '../../../../shared/research/research-compute-probe'
import { isPendingSlurmState, isRunningSlurmState } from './research-compute-usage'

const SCHEDULABLE_BASE_STATES = new Set(['idle', 'mixed', 'allocated', 'completing', 'planned'])
const BLOCKING_STATE_FLAGS = new Set([
  'drain',
  'draining',
  'drained',
  'down',
  'fail',
  'failing',
  'maint',
  'reboot_issued',
  'reboot_requested',
  'powering_down',
  'power_down',
  'not_responding',
  'inval',
  'unknown',
  'future'
])
// `*` not responding, `%` powering down, `$` maintenance, `@` reboot pending, `^` reboot issued.
const BLOCKING_STATE_SUFFIX = /[*%$@^]$/

/** Whether a node can take new work, read from sinfo's StateLong (`mixed-`, `idle+drain`, `down*`). */
export function isSlurmNodeSchedulable(state: string): boolean {
  const normalized = state.trim().toLowerCase()
  if (BLOCKING_STATE_SUFFIX.test(normalized)) {
    return false
  }
  const [base, ...flags] = normalized.replace(/[~#!+-]+$/, '').split('+')
  return SCHEDULABLE_BASE_STATES.has(base) && flags.every((flag) => !BLOCKING_STATE_FLAGS.has(flag))
}

export type ResearchSlurmPartitionSummary = {
  partition: string
  nodeCount: number
  schedulableNodeCount: number
  gpuTypes: string[]
  gpuTotal: number
  gpuAllocated: number
  /** Total minus allocated on nodes that accept jobs; limits and QOS can still hold a job. */
  gpuUnallocated: number
  runningJobs: number
  pendingJobs: number
  pendingGpus: number
  topGpuUsers: { user: string; gpus: number }[]
  mine: { running: number; pending: number }
}

function emptySummary(partition: string): ResearchSlurmPartitionSummary {
  return {
    partition,
    nodeCount: 0,
    schedulableNodeCount: 0,
    gpuTypes: [],
    gpuTotal: 0,
    gpuAllocated: 0,
    gpuUnallocated: 0,
    runningJobs: 0,
    pendingJobs: 0,
    pendingGpus: 0,
    topGpuUsers: [],
    mine: { running: 0, pending: 0 }
  }
}

function addNode(summary: ResearchSlurmPartitionSummary, node: ResearchSlurmNode): void {
  const schedulable = isSlurmNodeSchedulable(node.state)
  summary.nodeCount += 1
  summary.schedulableNodeCount += Number(schedulable)
  summary.gpuTotal += node.gpuTotal
  summary.gpuAllocated += node.gpuUsed
  summary.gpuUnallocated += schedulable ? Math.max(0, node.gpuTotal - node.gpuUsed) : 0
  summary.gpuTypes = [...new Set([...summary.gpuTypes, ...node.gpuTypes])]
}

/** Per-partition GPU capacity from sinfo and load from the all-users queue, in sinfo order. */
export function summarizeSlurmPartitions(
  sample: Pick<ResearchComputeSample, 'slurm' | 'remoteUser'>
): ResearchSlurmPartitionSummary[] {
  const summaries = new Map<string, ResearchSlurmPartitionSummary>()
  const summaryFor = (partition: string): ResearchSlurmPartitionSummary => {
    const summary = summaries.get(partition) ?? emptySummary(partition)
    summaries.set(partition, summary)
    return summary
  }
  for (const node of sample.slurm.nodes) {
    addNode(summaryFor(node.partition), node)
  }
  const gpuUsers = new Map<string, Map<string, number>>()
  for (const entry of sample.slurm.queue) {
    const mine = entry.user === sample.remoteUser
    // A pending job may list several partitions; it waits in each of them.
    for (const partition of entry.partition.split(',').filter(Boolean)) {
      const summary = summaryFor(partition)
      if (isRunningSlurmState(entry.state)) {
        summary.runningJobs += 1
        summary.mine.running += Number(mine)
        const users = gpuUsers.get(partition) ?? new Map<string, number>()
        users.set(entry.user, (users.get(entry.user) ?? 0) + entry.gpuCount)
        gpuUsers.set(partition, users)
      } else if (isPendingSlurmState(entry.state)) {
        summary.pendingJobs += 1
        summary.pendingGpus += entry.gpuCount
        summary.mine.pending += Number(mine)
      }
    }
  }
  for (const [partition, users] of gpuUsers) {
    summaryFor(partition).topGpuUsers = [...users]
      .filter(([, gpus]) => gpus > 0)
      .map(([user, gpus]) => ({ user, gpus }))
      .sort((a, b) => b.gpus - a.gpus || a.user.localeCompare(b.user))
      .slice(0, 3)
  }
  return [...summaries.values()]
}

export type ResearchSlurmHostSummary = {
  gpuTotal: number
  gpuAllocated: number
  /** Total minus allocated on nodes that accept jobs. */
  gpuUnallocated: number
  nodeCount: number
  schedulableNodeCount: number
  runningJobs: number
  pendingJobs: number
  pendingGpus: number
  byGpuType: { type: string; total: number; allocated: number }[]
  /** GPU nodes in sinfo order, each listed once. */
  nodes: (ResearchSlurmNode & { schedulable: boolean })[]
}

/** The whole cluster at once. Why per node name: sinfo -N repeats a node for each partition. */
export function summarizeSlurmHost(
  sample: Pick<ResearchComputeSample, 'slurm'>
): ResearchSlurmHostSummary {
  const nodes = new Map<string, ResearchSlurmNode>()
  for (const node of sample.slurm.nodes) {
    if (!nodes.has(node.name)) {
      nodes.set(node.name, node)
    }
  }
  const byType = new Map<string, { type: string; total: number; allocated: number }>()
  const summary: ResearchSlurmHostSummary = {
    gpuTotal: 0,
    gpuAllocated: 0,
    gpuUnallocated: 0,
    nodeCount: nodes.size,
    schedulableNodeCount: 0,
    runningJobs: 0,
    pendingJobs: 0,
    pendingGpus: 0,
    byGpuType: [],
    nodes: []
  }
  for (const node of nodes.values()) {
    const schedulable = isSlurmNodeSchedulable(node.state)
    summary.schedulableNodeCount += Number(schedulable)
    if (node.gpuTotal) {
      summary.nodes.push({ ...node, schedulable })
    }
    summary.gpuTotal += node.gpuTotal
    summary.gpuAllocated += node.gpuUsed
    summary.gpuUnallocated += schedulable ? Math.max(0, node.gpuTotal - node.gpuUsed) : 0
    if (node.gpuTotal) {
      const type = node.gpuTypes.join('+') || 'gpu'
      const entry = byType.get(type) ?? { type, total: 0, allocated: 0 }
      entry.total += node.gpuTotal
      entry.allocated += node.gpuUsed
      byType.set(type, entry)
    }
  }
  for (const entry of sample.slurm.queue) {
    if (isRunningSlurmState(entry.state)) {
      summary.runningJobs += 1
    } else if (isPendingSlurmState(entry.state)) {
      summary.pendingJobs += 1
      summary.pendingGpus += entry.gpuCount
    }
  }
  summary.byGpuType = [...byType.values()]
  return summary
}

export type SlurmPendingReasonHint = { text: string; blocking: boolean }

const PENDING_REASON_HINTS: Record<string, SlurmPendingReasonHint> = {
  Priority: { text: 'Queued behind higher-priority jobs', blocking: false },
  Resources: { text: 'Waiting for requested resources to free up', blocking: false },
  Dependency: { text: 'Waiting for a dependency to finish', blocking: false },
  DependencyNeverSatisfied: {
    text: 'Its dependency can no longer be met, so it will not start',
    blocking: true
  },
  BeginTime: { text: 'Held until its requested begin time', blocking: false },
  JobHeldUser: { text: 'Held by its owner', blocking: false },
  JobHeldAdmin: { text: 'Held by an administrator', blocking: false },
  ReqNodeNotAvail: { text: 'Requested nodes are down, drained or reserved', blocking: false },
  PartitionTimeLimit: { text: 'Time limit exceeds the partition maximum', blocking: true },
  PartitionNodeLimit: { text: 'Node count exceeds the partition limit', blocking: true },
  BadConstraints: { text: 'Its constraints cannot be satisfied', blocking: true },
  InvalidAccount: { text: 'Submitted under an invalid account', blocking: true },
  InvalidQOS: { text: 'Submitted under an invalid QOS', blocking: true }
}

export function slurmPendingReasonHint(reason: string | null): SlurmPendingReasonHint | null {
  if (!reason) {
    return null
  }
  if (Object.hasOwn(PENDING_REASON_HINTS, reason)) {
    return PENDING_REASON_HINTS[reason]
  }
  return /^(QOS|Assoc)(Max|Grp)/.test(reason)
    ? { text: 'At a QOS or account limit', blocking: false }
    : null
}
