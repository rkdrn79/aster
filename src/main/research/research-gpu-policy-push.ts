import type { ResearchGpuPolicy } from '../../shared/research/research-gpu-policy'
import { resolveEnvironment } from '../../shared/runtime-environment-store'
import { callRuntimeEnvironment } from '../ipc/runtime-environments/runtime-environment-transport-routing'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import {
  getSshConnectionManager,
  listRegisteredSshTargets
} from '../ssh/targets/ssh-target-registry'
import type { ResearchGpuHostPolicyPush } from './research-gpu-host-policy'
import { readResearchGpuPolicy } from './research-gpu-policy-repository'

const PUSH_TIMEOUT_MS = 15_000
/** orcad may still be starting when the host connects; a later try usually lands. */
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const

/** One host's limits as its orcad stores them; `host: null` clears what it held. */
export function researchGpuHostPolicyPush(
  policy: ResearchGpuPolicy,
  targetId: string,
  label: string
): ResearchGpuHostPolicyPush {
  const host = policy.hosts.find((entry) => entry.targetId === targetId)
  return {
    label,
    host: host ? { maxGpus: host.maxGpus, autoRelease: host.autoRelease } : null,
    projects: policy.projects
      .filter((project) => project.targetId === targetId)
      .map(({ projectKey, projectName, maxGpus, priority }) => ({
        projectKey,
        projectName,
        maxGpus,
        priority
      }))
  }
}

export type ResearchGpuPolicyPushOutcome = 'pushed' | 'older-server' | 'no-server'

export type ResearchGpuPolicyPushTransport = {
  call: (targetId: string, push: ResearchGpuHostPolicyPush) => Promise<'ok' | 'method_not_found'>
}

const orcadTransport: ResearchGpuPolicyPushTransport = {
  async call(targetId, push) {
    const target = listRegisteredSshTargets().find((entry) => entry.id === targetId)
    const environmentId = target?.orcadFence?.environmentId
    if (!environmentId) {
      throw new Error('No Aster server runs on this host.')
    }
    const userDataPath = getCanonicalUserDataPath()
    const environment = resolveEnvironment(userDataPath, environmentId)
    if (!environment.runtimeId) {
      throw new Error('The Aster server on this host is not verified yet.')
    }
    const response = await callRuntimeEnvironment(
      userDataPath,
      environment.id,
      'researchGpu.applyHostPolicy',
      push,
      PUSH_TIMEOUT_MS,
      environment.pairingRevision,
      undefined,
      { expectedEnvironmentRuntimeId: environment.runtimeId }
    )
    if (response.ok) {
      return 'ok'
    }
    if (response.error.code === 'method_not_found') {
      return 'method_not_found'
    }
    throw new Error(response.error.message)
  }
}

/**
 * Gives one SSH host's orcad the limits set for it on this desktop, so `aster gpu status` and
 * `aster gpu submit` on that server follow them. An orcad from before this method keeps working
 * and keeps saying where limits are set; it gets them once it is updated.
 */
export async function pushResearchGpuPolicyOnce(
  targetId: string,
  transport: ResearchGpuPolicyPushTransport = orcadTransport
): Promise<ResearchGpuPolicyPushOutcome> {
  const target = listRegisteredSshTargets().find((entry) => entry.id === targetId)
  if (!target?.orcadFence?.environmentId) {
    return 'no-server'
  }
  const policy = await readResearchGpuPolicy()
  const answer = await transport.call(
    targetId,
    researchGpuHostPolicyPush(policy, targetId, target.label)
  )
  return answer === 'ok' ? 'pushed' : 'older-server'
}

const generations = new Map<string, number>()
const olderServersWarned = new Set<string>()

/** Pushes now, retrying a few times; a newer push supersedes a pending retry. */
export function pushResearchGpuPolicyToHost(targetId: string): void {
  const generation = (generations.get(targetId) ?? 0) + 1
  generations.set(targetId, generation)
  const attempt = (index: number): void => {
    pushResearchGpuPolicyOnce(targetId)
      .then((outcome) => {
        if (outcome === 'older-server' && !olderServersWarned.has(targetId)) {
          olderServersWarned.add(targetId)
          console.info(
            `[research-gpu] The Aster server on ${targetId} predates GPU limit sync; update it to apply limits there.`
          )
        }
      })
      .catch((error: unknown) => {
        const delay = RETRY_DELAYS_MS[index]
        if (delay === undefined || generations.get(targetId) !== generation) {
          console.warn(`[research-gpu] Could not send GPU limits to ${targetId}:`, error)
          return
        }
        setTimeout(() => {
          if (generations.get(targetId) === generation) {
            attempt(index + 1)
          }
        }, delay).unref?.()
      })
  }
  attempt(0)
}

/** After the limits change: every connected host whose limits were or are now set. */
export function pushChangedResearchGpuPolicies(
  previous: ResearchGpuPolicy | null,
  saved: ResearchGpuPolicy
): void {
  const targets = new Set(
    [
      ...(previous?.hosts ?? []),
      ...(previous?.projects ?? []),
      ...saved.hosts,
      ...saved.projects
    ].map((entry) => entry.targetId)
  )
  for (const targetId of targets) {
    if (getSshConnectionManager()?.getConnection(targetId)?.getState().status === 'connected') {
      pushResearchGpuPolicyToHost(targetId)
    }
  }
}
