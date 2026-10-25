import { useEffect, useState } from 'react'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import {
  DEFAULT_RESEARCH_AGENT_POLICY,
  type ResearchExperimentBrief
} from '../../../../shared/research/research-experiment-brief'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { harnessExperimentSlug } from './use-research-harness-experiment'

type AgentPolicy = ResearchExperimentBrief['agentPolicy']

const POLICY_TTL_MS = 30_000
const policyReads = new Map<string, { at: number; policy: Promise<AgentPolicy> }>()

// Why shared: every finding row asks, so one brief read per Experiment serves them all.
function readAgentPolicy(workspacePath: string, experiment: string): Promise<AgentPolicy> {
  const key = JSON.stringify([workspacePath, experiment])
  const cached = policyReads.get(key)
  if (cached && Date.now() - cached.at < POLICY_TTL_MS) {
    return cached.policy
  }
  const show = (window.api.researchBrief ?? {}).show
  const fallback = { ...DEFAULT_RESEARCH_AGENT_POLICY }
  const policy = show
    ? show({ workspacePath, experiment }).then(
        (result) => result.brief?.agentPolicy ?? fallback,
        () => fallback
      )
    : Promise.resolve(fallback)
  policyReads.set(key, { at: Date.now(), policy })
  return policy
}

/** The brief's agent policy, the default when none is recorded; null until read or off-catalog. */
export function useExperimentAgentPolicy(experiment: ExperimentRecord): AgentPolicy | null {
  const slug = harnessExperimentSlug(experiment)
  const workspacePath = experiment.workspacePath
  const owner = JSON.stringify([workspacePath, slug])
  const [read, setRead] = useState<{ owner: string; policy: AgentPolicy } | null>(null)

  useEffect(() => {
    if (!slug) {
      return
    }
    let active = true
    const stop = installWindowVisibilityInterval({
      run: () =>
        void readAgentPolicy(workspacePath, slug).then((policy) => {
          if (active) {
            setRead({ owner, policy })
          }
        }),
      intervalMs: POLICY_TTL_MS
    })
    return () => {
      active = false
      stop()
    }
  }, [owner, slug, workspacePath])

  return read?.owner === owner ? read.policy : null
}
