import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { getTabDragLabel, type TabBarItem } from './tab-bar-item-model'
import type { TabBarItemActions } from './use-tab-bar-item-actions'
import { readOffscreenTabStripSlotIds } from './tab-strip-slot-geometry'

/** The id a tab's strip slot carries; an editor tab is slotted under its unified tab id when it has one. */
function slotIdOf(item: TabBarItem): string {
  return item.type === 'editor' ? (item.data.tabId ?? item.data.id) : item.id
}

function activateItem(item: TabBarItem, actions: TabBarItemActions): void {
  if (item.type === 'terminal') {
    actions.activateTerminal(item.id)
  } else if (item.type === 'agent-session') {
    actions.activateAgentSession(item.id)
  } else if (item.type === 'browser') {
    actions.activateBrowserTab(item.id)
  } else {
    actions.activateFile(item.id)
  }
}

/** "⋯ N more": names the tabs scrolled or clipped out of the strip so they stay one click away. */
export function TabStripOverflowMenu({
  items,
  activeTabId,
  hasOverflow,
  stripRef,
  subscribeToStripResize,
  actions,
  generatedTabTitlesEnabled
}: {
  items: readonly TabBarItem[]
  activeTabId: string | null
  hasOverflow: boolean
  stripRef: React.RefObject<HTMLDivElement | null>
  subscribeToStripResize: (listener: () => void) => () => void
  actions: TabBarItemActions
  generatedTabTitlesEnabled: boolean
}): React.JSX.Element | null {
  const [hiddenSlotIds, setHiddenSlotIds] = useState<readonly string[]>([])

  // Why the DOM: which tabs are out of view depends on live widths and scroll position.
  const sync = useCallback((): void => {
    const strip = stripRef.current
    const next = strip && hasOverflow ? readOffscreenTabStripSlotIds(strip) : []
    setHiddenSlotIds((previous) =>
      previous.length === next.length && previous.every((id, index) => id === next[index])
        ? previous
        : next
    )
  }, [hasOverflow, stripRef])

  // Why the active tab: switching it moves the docked slot with no scroll or resize.
  // Opening or closing a tab resizes the strip, which re-syncs below.
  useLayoutEffect(sync, [sync, activeTabId])

  useEffect(() => {
    const strip = stripRef.current
    if (!strip || !hasOverflow) {
      return
    }
    strip.addEventListener('scroll', sync, { passive: true })
    const unsubscribe = subscribeToStripResize(sync)
    return () => {
      strip.removeEventListener('scroll', sync)
      unsubscribe()
    }
  }, [hasOverflow, stripRef, subscribeToStripResize, sync])

  const hidden = new Set(hiddenSlotIds)
  const hiddenItems = items.filter((item) => hidden.has(slotIdOf(item)))
  if (hiddenItems.length === 0) {
    return null
  }
  const label = translate('tab.bar.overflow.more', '{{count}} more', {
    count: hiddenItems.length
  })
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mx-0.5 my-auto flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground @max-[260px]/tab-strip:hidden"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          aria-label={translate('tab.bar.overflow.show', 'Show {{count}} more tabs', {
            count: hiddenItems.length
          })}
        >
          <MoreHorizontal className="size-3.5" />
          <span className="whitespace-nowrap">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64">
        {hiddenItems.map((item) => (
          <DropdownMenuItem key={item.id} onSelect={() => activateItem(item, actions)}>
            <span className="min-w-0 flex-1 truncate">
              {getTabDragLabel(item, generatedTabTitlesEnabled)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
