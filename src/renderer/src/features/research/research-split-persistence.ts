import { useAppStore } from '@/store'
import { normalizeExecutionHostId, type ExecutionHostId } from '../../../../shared/execution-host'
import { parsePersistedResearchSplit, type PersistedResearchSplit } from './research-split-layout'
import { useResearchSplit } from './research-split-store'

// Why one key: only the main window splits; pop-out windows and sides show one project each.
const SPLIT_KEY = 'aster.research-split.v1:main'

let saved: PersistedResearchSplit | null = null
let installed = false

function readSaved(): PersistedResearchSplit {
  if (!saved) {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(SPLIT_KEY)
    } catch {
      raw = null
    }
    saved = parsePersistedResearchSplit(raw)
  }
  return saved
}

function write(): void {
  const { sides, weights } = useResearchSplit.getState()
  const state = useAppStore.getState()
  try {
    if (sides.length === 0) {
      localStorage.removeItem(SPLIT_KEY)
      return
    }
    const main = state.activeWorktreeId
      ? { workspaceId: state.activeWorktreeId, hostId: state.activeWorkspaceExecutionHostId }
      : null
    localStorage.setItem(SPLIT_KEY, JSON.stringify({ sides, weights, main }))
  } catch {
    // Why: a full storage only means the split is not remembered after a restart.
  }
}

/**
 * Brings back the split this window had, and keeps it saved from then on: its sides, their
 * widths and pages, and the project the main column showed. Idempotent.
 */
export function installResearchSplitPersistence(): void {
  if (installed) {
    return
  }
  installed = true
  const { sides, weights } = readSaved()
  if (sides.length > 0 && useResearchSplit.getState().sides.length === 0) {
    useResearchSplit.setState({ sides, weights })
  }
  useResearchSplit.subscribe((next, previous) => {
    if (next.sides !== previous.sides || next.weights !== previous.weights) {
      write()
    }
  })
  useAppStore.subscribe((next, previous) => {
    if (
      next.activeWorktreeId !== previous.activeWorktreeId &&
      useResearchSplit.getState().sides.length > 0
    ) {
      write()
    }
  })
}

/**
 * At startup the app opens on Home; a split it is bringing back reopens its main project too, or
 * the split would show Home beside projects. `enter` opens a workspace where it was left.
 */
export function restoreResearchSplitMainProject(
  enter: (workspace: { id: string; executionHostId: ExecutionHostId | undefined }) => void
): void {
  const { sides, main } = readSaved()
  if (sides.length > 0 && main) {
    enter({
      id: main.workspaceId,
      executionHostId: normalizeExecutionHostId(main.hostId) ?? undefined
    })
  }
}
