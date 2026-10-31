import { create } from 'zustand'
import type { ExecutionHostId } from '../../../shared/execution-host'

export type PhoneTab = 'home' | 'agents' | 'runs' | 'files'

export const PHONE_TABS: readonly PhoneTab[] = ['home', 'agents', 'runs', 'files']

/** What the shared workbench shows when a nested screen opens it. */
export type PhoneWorkbenchTarget =
  | {
      kind: 'session'
      worktreeId: string
      executionHostId?: ExecutionHostId
      /** The unified tab; for terminals it is also the terminal tab id. */
      tabId: string
      leafId: string | null
    }
  | { kind: 'workspace'; worktreeId: string }
  /** An editor or preview the Files tab opened; null when it opened a browser preview. */
  | { kind: 'file'; worktreeId: string; fileId: string | null }

export type PhoneScreen =
  | { kind: 'project'; projectKey: string; title: string }
  | { kind: 'workbench'; target: PhoneWorkbenchTarget; title: string; subtitle?: string }
  | {
      kind: 'run'
      worktreeId: string
      experiment: string
      run: string
      title: string
      subtitle?: string
    }
  /** One Experiment of a workspace's `.aster/` catalog, read-only. */
  | { kind: 'experiment'; worktreeId: string; experiment: string; title: string; subtitle?: string }
  /** Start an agent; `worktreeId` preselects a workspace, else the current or most recent one. */
  | { kind: 'new-agent'; worktreeId: string | null; title: string }

type PhoneNavigationState = {
  tab: PhoneTab
  /** Nested screens per tab, so switching tabs keeps each tab where the user left it. */
  stacks: Record<PhoneTab, PhoneScreen[]>
  selectTab: (tab: PhoneTab) => void
  push: (screen: PhoneScreen) => void
  pop: () => void
  /** Swaps the top screen, so Back from a launched session skips the form that started it. */
  replace: (screen: PhoneScreen) => void
  /** Files or Papers on the Files tab; kept here so Back from a file returns to the same list. */
  filesView: 'files' | 'papers'
  setFilesView: (view: 'files' | 'papers') => void
  /** Idle shells unfolded; kept here so Back from one of them keeps the list open. */
  idleShellsShown: boolean
  setIdleShellsShown: (shown: boolean) => void
}

const EMPTY_STACKS: Record<PhoneTab, PhoneScreen[]> = {
  home: [],
  agents: [],
  runs: [],
  files: []
}

export const usePhoneNavigation = create<PhoneNavigationState>((set) => ({
  tab: 'home',
  stacks: EMPTY_STACKS,
  selectTab: (tab) =>
    set((state) =>
      // Why: tapping the current tab again returns to its root, as native tab bars do.
      state.tab === tab ? { stacks: { ...state.stacks, [tab]: [] } } : { tab }
    ),
  push: (screen) =>
    set((state) => ({
      stacks: { ...state.stacks, [state.tab]: [...state.stacks[state.tab], screen] }
    })),
  pop: () =>
    set((state) => ({
      stacks: { ...state.stacks, [state.tab]: state.stacks[state.tab].slice(0, -1) }
    })),
  replace: (screen) =>
    set((state) => ({
      stacks: {
        ...state.stacks,
        [state.tab]: [...state.stacks[state.tab].slice(0, -1), screen]
      }
    })),
  filesView: 'files',
  setFilesView: (filesView) => set({ filesView }),
  idleShellsShown: false,
  setIdleShellsShown: (idleShellsShown) => set({ idleShellsShown })
}))

export function selectPhoneScreen(state: PhoneNavigationState): PhoneScreen | null {
  return state.stacks[state.tab].at(-1) ?? null
}
