import { useRef, type ReactNode } from 'react'
import { History, MessageSquareText, Shapes } from 'lucide-react'
import { create } from 'zustand'
import { cn } from '@/lib/utils'
import type { FiguresAgentScope } from './research-figures-agent-session'
import type { ProjectFileOwner } from './research-project-files'

/** What a side-panel tab gets to work with: the project and the figure on the canvas. */
export type FigureSidePanelContext = {
  owner: ProjectFileOwner
  /** Project-relative working folder, e.g. `.aster/figures`; null while it loads. */
  folder: string | null
  /** The open editable figure; null for none or a read-only plot. */
  slug: string | null
  manuscript: string | null
  scope: FiguresAgentScope
}

export type FigureSidePanelTab = {
  id: string
  label: string
  /** Lower sits further left; Agent is 0, Parts 10, History 20. */
  order: number
  render: (context: FigureSidePanelContext) => ReactNode
}

type TabEntry = Pick<FigureSidePanelTab, 'id' | 'label' | 'order'> & {
  render: FigureSidePanelTab['render'] | null
}

export const AGENT_TAB_ID = 'agent'
// Why: these tabs belong to other tracks; until they register, the panel says what will be there.
const BUILT_IN: readonly TabEntry[] = [
  { id: AGENT_TAB_ID, label: 'Agent', order: 0, render: null },
  { id: 'parts', label: 'Parts', order: 10, render: null },
  { id: 'history', label: 'History', order: 20, render: null }
]
const PLACEHOLDERS: Record<string, { icon: typeof Shapes; text: string }> = {
  parts: {
    icon: Shapes,
    text: 'Blocks, icons and templates to drop on the canvas will be listed here.'
  },
  history: {
    icon: History,
    text: 'No history yet. Ask the agent or save, and versions of this figure collect here.'
  }
}
const ACTIVE_KEY = 'aster.research-figures-side-tab.v1'

function readActive(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? AGENT_TAB_ID
  } catch {
    return AGENT_TAB_ID
  }
}

export const useFigureSidePanel = create<{
  tabs: Readonly<Record<string, FigureSidePanelTab>>
  active: string
}>(() => ({ tabs: {}, active: readActive() }))

/** Adds a tab to the Figures side panel; returns a function that removes it again. */
export function registerFigureSidePanelTab(tab: FigureSidePanelTab): () => void {
  useFigureSidePanel.setState((state) => ({ tabs: { ...state.tabs, [tab.id]: tab } }))
  return () =>
    useFigureSidePanel.setState((state) => ({
      tabs: Object.fromEntries(Object.entries(state.tabs).filter(([id]) => id !== tab.id))
    }))
}

export function openFigureSidePanelTab(id: string): void {
  useFigureSidePanel.setState({ active: id })
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    // Why: without storage the panel opens on Agent next time.
  }
}

/** Built-in tabs, replaced by registered ones with the same id, in order. */
export function figureSidePanelTabs(
  registered: Readonly<Record<string, FigureSidePanelTab>>
): TabEntry[] {
  const byId = new Map<string, TabEntry>(BUILT_IN.map((tab) => [tab.id, tab]))
  for (const tab of Object.values(registered)) {
    if (tab.id !== AGENT_TAB_ID) {
      byId.set(tab.id, tab)
    }
  }
  return [...byId.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

/** The tab on screen: the one asked for, or Agent when that tab is gone. */
export function activeFigureSidePanelTab(tabs: readonly TabEntry[], active: string): string {
  return tabs.some((tab) => tab.id === active) ? active : AGENT_TAB_ID
}

export function useActiveFigureSidePanelTab(): string {
  const tabs = useFigureSidePanel((state) => state.tabs)
  const active = useFigureSidePanel((state) => state.active)
  return activeFigureSidePanelTab(figureSidePanelTabs(tabs), active)
}

function Placeholder({ id }: { id: string }): React.JSX.Element {
  const entry = PLACEHOLDERS[id] ?? { icon: MessageSquareText, text: 'Nothing here yet.' }
  const Icon = entry.icon
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <Icon className="size-5 text-muted-foreground/70" aria-hidden />
      <p className="max-w-60 text-xs text-muted-foreground">{entry.text}</p>
    </div>
  )
}

/** Agent | Parts | History beside the canvas; the chat stays mounted while another tab shows. */
export function ResearchFigureSidePanel({
  agent,
  context
}: {
  agent: ReactNode
  context: FigureSidePanelContext
}): React.JSX.Element {
  const registered = useFigureSidePanel((state) => state.tabs)
  const tabs = figureSidePanelTabs(registered)
  const active = useActiveFigureSidePanelTab()
  const listRef = useRef<HTMLDivElement | null>(null)
  const current = tabs.find((tab) => tab.id === active)

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) {
      return
    }
    event.preventDefault()
    const index = tabs.findIndex((tab) => tab.id === active)
    const next = tabs[(index + step + tabs.length) % tabs.length]
    openFigureSidePanelTab(next.id)
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus()
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Figure side panel"
        className="flex shrink-0 items-center gap-0.5 border-b border-border px-2 py-1"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-tab-id={tab.id}
              id={`figure-side-tab-${tab.id}`}
              aria-label={tab.label}
              aria-selected={selected}
              aria-controls={`figure-side-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={cn(
                'rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                selected && 'bg-accent text-foreground'
              )}
              onClick={() => openFigureSidePanelTab(tab.id)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div
        role="tabpanel"
        id={`figure-side-panel-${AGENT_TAB_ID}`}
        aria-labelledby={`figure-side-tab-${AGENT_TAB_ID}`}
        className="min-h-0 flex-1 flex-col"
        style={{ display: active === AGENT_TAB_ID ? 'flex' : 'none' }}
      >
        {agent}
      </div>
      {current && current.id !== AGENT_TAB_ID ? (
        <div
          role="tabpanel"
          id={`figure-side-panel-${current.id}`}
          aria-labelledby={`figure-side-tab-${current.id}`}
          className="flex min-h-0 flex-1 flex-col"
        >
          {current.render ? current.render(context) : <Placeholder id={current.id} />}
        </div>
      ) : null}
    </div>
  )
}
