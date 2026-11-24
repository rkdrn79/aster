import { useState } from 'react'
import { AppWindow, Columns2, LayoutGrid } from 'lucide-react'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { ResearchComputeProjectDot } from './ResearchComputeProjectDot'
import {
  filterProjectSwitcherRows,
  projectSwitcherKeyIntent,
  type ResearchProjectSwitcherRow
} from './research-project-switcher'

const HOME_VALUE = 'action:home'
const WINDOW_VALUE = 'action:window'
const BESIDE_VALUE = 'action:beside'

type Props = {
  rows: readonly ResearchProjectSwitcherRow[]
  /** 'beside': picking a project opens it to the side of the one shown, not in its place. */
  mode?: 'switch' | 'beside'
  /** Desktop only: a phone or browser client has one window. */
  canOpenWindows: boolean
  /** Desktop only, like windows: a side is a page of its own. */
  canOpenBeside?: boolean
  /** False on Home's project overview, where "All projects" would go nowhere. */
  showHome?: boolean
  onSwitch: (row: ResearchProjectSwitcherRow) => void
  onOpenInNewWindow: (row: ResearchProjectSwitcherRow) => void
  onOpenBeside?: (row: ResearchProjectSwitcherRow) => void
  onHome: () => void
}

/**
 * Search field, recent projects, and the two ways out: Home, or a project in its own window.
 * The highlight lands on the first row: the previous project, or the best match once typing.
 */
export function ResearchProjectSwitcherList({
  rows,
  mode = 'switch',
  canOpenWindows,
  canOpenBeside = false,
  showHome = true,
  onSwitch,
  onOpenInNewWindow,
  onOpenBeside,
  onHome
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const shown = filterProjectSwitcherRows(rows, query)
  const [highlighted, setHighlighted] = useState(shown[0]?.value ?? '')
  // Why: moving onto the footer keeps naming the project the window item opens.
  const [targetValue, setTargetValue] = useState(highlighted)
  const target = shown.find((row) => row.value === targetValue) ?? shown[0] ?? null
  const isMac = getShortcutPlatform() === 'darwin'
  const searching = query.trim().length > 0

  return (
    <Command
      shouldFilter={false}
      density="menu"
      loop
      label="Switch project"
      // Why controlled: cmdk reports highlight moves only then; it still picks the first row.
      value={highlighted}
      onValueChange={(value) => {
        setHighlighted(value)
        if (rows.some((row) => row.value === value)) {
          setTargetValue(value)
        }
      }}
      onKeyDown={(event) => {
        const intent = projectSwitcherKeyIntent(event.nativeEvent, getShortcutPlatform())
        if (intent === 'open-in-new-window') {
          event.preventDefault()
          if (canOpenWindows && target) {
            onOpenInNewWindow(target)
          }
        } else if (intent === 'open-beside') {
          event.preventDefault()
          if (canOpenBeside && target) {
            onOpenBeside?.(target)
          }
        }
      }}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={mode === 'beside' ? 'Open beside…' : 'Switch to project…'}
      />
      {/* Why one list: cmdk only walks items inside it, so the rows scroll on their own. */}
      <CommandList className="max-h-none overflow-visible">
        <div className="scrollbar-sleek max-h-[min(320px,50vh)] overflow-y-auto">
          {shown.length === 0 ? (
            // Why not CommandEmpty: the footer items always count, so cmdk never shows it.
            <p className="px-3 py-5 text-center text-xs text-muted-foreground">
              {searching ? `No other project matches “${query.trim()}”.` : 'No other projects yet.'}
            </p>
          ) : (
            <CommandGroup heading={searching ? undefined : 'Recent'}>
              {shown.map((row) => (
                <CommandItem
                  key={row.value}
                  value={row.value}
                  selection="palette"
                  onSelect={() => onSwitch(row)}
                >
                  <ResearchComputeProjectDot color={row.badgeColor} />
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  {row.host ? (
                    <span className="max-w-[45%] shrink-0 truncate text-muted-foreground">
                      {row.host.status ? `${row.host.label} · ${row.host.status}` : row.host.label}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </div>
        <CommandSeparator alwaysRender />
        <CommandGroup>
          {showHome ? (
            <CommandItem value={HOME_VALUE} selection="palette" onSelect={onHome}>
              <LayoutGrid className="size-4 text-muted-foreground" aria-hidden />
              <span className="flex-1">All projects</span>
            </CommandItem>
          ) : null}
          {canOpenBeside && mode === 'switch' && target && onOpenBeside ? (
            <CommandItem
              value={BESIDE_VALUE}
              selection="palette"
              onSelect={() => onOpenBeside(target)}
            >
              <Columns2 className="size-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                Open <span className="font-medium">{target.name}</span> to the Side
              </span>
              <span className="shrink-0 text-muted-foreground" aria-hidden>
                {isMac ? '⌘\\' : 'Ctrl+\\'}
              </span>
            </CommandItem>
          ) : null}
          {canOpenWindows && target ? (
            <CommandItem
              value={WINDOW_VALUE}
              selection="palette"
              onSelect={() => onOpenInNewWindow(target)}
            >
              <AppWindow className="size-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                Open <span className="font-medium">{target.name}</span> in New Window
              </span>
              <span className="shrink-0 text-muted-foreground" aria-hidden>
                {isMac ? '⌘↩' : 'Ctrl+Enter'}
              </span>
            </CommandItem>
          ) : null}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
