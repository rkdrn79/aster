import type { RebuttalCluster } from './research-rebuttal-model.mjs'
import type {
  RebuttalArchivedGroup,
  RebuttalRegroup,
  RebuttalRegroupInput,
  RebuttalRegroupPlan,
  RebuttalRegroupState
} from './research-rebuttal-regroup.mjs'

export function parseRegroups(value: unknown): {
  regroups: RebuttalRegroup[]
  archive: RebuttalArchivedGroup[]
}
export function regroupsDocument(input: {
  regroups: RebuttalRegroup[]
  archive: RebuttalArchivedGroup[]
}): { schemaVersion: 1; regroups: RebuttalRegroup[]; archive: RebuttalArchivedGroup[] }
export function clusterFingerprint(cluster: RebuttalCluster | undefined): string
export function regroupRecord(
  state: RebuttalRegroupState,
  plan: RebuttalRegroupPlan,
  input: {
    id: string
    at: string
    turn?: string | null
    request?: string
    applied: boolean
    change: RebuttalRegroupInput
    supplied?: Map<string, string>
  }
): RebuttalRegroup
export function nextRegroupId(
  regroups: readonly RebuttalRegroup[],
  archive: readonly RebuttalArchivedGroup[]
): string
export function stateAfterPlan(
  state: RebuttalRegroupState,
  plan: RebuttalRegroupPlan,
  record: RebuttalRegroup | null
): RebuttalRegroupState
export function changedSinceRegroup(state: RebuttalRegroupState, record: RebuttalRegroup): string[]
export function stateBeforeRegroup(
  state: RebuttalRegroupState,
  record: RebuttalRegroup
): RebuttalRegroupState
export function stateWithArchivedRestored(
  state: RebuttalRegroupState,
  archiveId: string
): RebuttalRegroupState & { restoredAs: string }
