import { useEffect, useMemo } from 'react'
import { z } from 'zod'
import { create } from 'zustand'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type {
  ResearchRunHostFacts,
  ResearchRunHostQuery
} from '../../../../shared/research/research-run-host'
import { parseHostAuthorityKey } from '../../../../shared/host-authority'
import { parseExecutionHostId } from '../../../../shared/execution-host'

/** One Run's facts as this host last observed them. */
export type ResearchRunHostView = ResearchRunHostFacts & { thisHost: string | null }

type RunHostStore = {
  byManifest: Record<string, ResearchRunHostView>
  record: (entries: Record<string, ResearchRunHostView>) => void
}

export const useResearchRunHostStore = create<RunHostStore>((set) => ({
  byManifest: {},
  record: (entries) => set((state) => ({ byManifest: { ...state.byManifest, ...entries } }))
}))

/** The SSH target of a Run's project, null on this computer, undefined where Aster can't read. */
export function researchRunTargetId(hostId: string): string | null | undefined {
  const authority = parseHostAuthorityKey(hostId)
  const at = authority?.endpoint.kind === 'self' ? authority.at : hostId
  const host = parseExecutionHostId(at)
  if (!host) {
    return undefined
  }
  return host.kind === 'ssh' ? host.targetId : null
}

const MAX_RUNS_PER_READ = 200

/** Reads which of these Runs this host can observe; a missing bridge or a failed read is silent. */
export async function observeResearchRunHosts(
  runs: readonly Pick<ResearchRunRecord, 'hostId' | 'manifestPath' | 'logPath'>[]
): Promise<void> {
  const observe = window.api.researchCompute?.observeRunHosts
  if (typeof observe !== 'function') {
    return
  }
  const byTarget = new Map<string | null, ResearchRunHostQuery['runs']>()
  for (const run of runs) {
    const targetId = researchRunTargetId(run.hostId)
    if (targetId === undefined || !run.manifestPath) {
      continue
    }
    byTarget.set(targetId, [
      ...(byTarget.get(targetId) ?? []),
      { manifestPath: run.manifestPath, logPath: run.logPath ?? null }
    ])
  }
  for (const [targetId, entries] of byTarget) {
    for (let start = 0; start < entries.length; start += MAX_RUNS_PER_READ) {
      const observation = await observe({
        targetId,
        runs: entries.slice(start, start + MAX_RUNS_PER_READ)
      }).catch(() => null)
      if (observation) {
        useResearchRunHostStore
          .getState()
          .record(
            Object.fromEntries(
              Object.entries(observation.runs).map(([path, facts]) => [
                path,
                { ...facts, thisHost: observation.thisHost }
              ])
            )
          )
      }
    }
  }
}

function runsFromKey(
  key: string
): Pick<ResearchRunRecord, 'hostId' | 'manifestPath' | 'logPath'>[] {
  const parsed = runHostKeySchema.safeParse(JSON.parse(key))
  return parsed.success ? parsed.data : []
}

const runHostKeySchema = z.array(
  z.object({
    hostId: z.string(),
    manifestPath: z.string().nullable().optional(),
    logPath: z.string().nullable()
  })
)

/** Observes the listed Runs once per set, and returns a lookup of what is known. */
export function useResearchRunHosts(
  runs: readonly ResearchRunRecord[]
): (run: Pick<ResearchRunRecord, 'manifestPath'>) => ResearchRunHostView | null {
  // Why a key: the same Runs re-rendered must not read the host again.
  const key = JSON.stringify(
    runs.map((run) => ({
      hostId: run.hostId,
      manifestPath: run.manifestPath,
      logPath: run.logPath
    }))
  )
  useEffect(() => {
    void observeResearchRunHosts(runsFromKey(key))
  }, [key])
  const byManifest = useResearchRunHostStore((state) => state.byManifest)
  return useMemo(
    () => (run) => (run.manifestPath ? (byManifest[run.manifestPath] ?? null) : null),
    [byManifest]
  )
}
