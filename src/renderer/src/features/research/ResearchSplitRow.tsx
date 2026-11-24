import { Fragment, useEffect, useLayoutEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { ResearchSplitDivider } from './ResearchSplitDivider'
import { ResearchSplitDropZone } from './ResearchSplitDropZone'
import { ResearchSplitSidePanel } from './ResearchSplitSidePanel'
import { ResearchSplitTabs } from './ResearchSplitTabs'
import { MAIN_COLUMN, fitWeights, isResearchSplitTabbed } from './research-split-layout'
import { installResearchSplitPersistence } from './research-split-persistence'
import { registerResearchMainColumn } from './research-split-surfaces'
import {
  focusResearchSplitColumn,
  setResearchSplitTabbed,
  useResearchSplit
} from './research-split-store'

// The divider is the shell gap between two panels.
const DIVIDER_PX = 8

function useElementWidth(element: HTMLElement | null): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!element) {
      return
    }
    setWidth(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return width
}

/**
 * The main window's page area, with any projects opened beside it: the main column (`children`,
 * the project the sidebar names), then each side, with a resizable gap between. Too narrow for
 * all of them, the columns turn into tabs and show one at a time.
 */
export function ResearchSplitRow({
  enabled,
  visible,
  aside,
  children
}: {
  /** Off outside the Research layout and in a browser client: the page area alone. */
  enabled: boolean
  /** False on pages that are not a project's (Settings…): sides stay alive, out of sight. */
  visible: boolean
  /** The main column's own right sidebar (files, source control): it stays in that column. */
  aside?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  useEffect(() => {
    if (enabled) {
      installResearchSplitPersistence()
    }
  }, [enabled])
  const sides = useResearchSplit((state) => state.sides)
  const weights = useResearchSplit((state) => state.weights)
  const focused = useResearchSplit((state) => state.focused)
  const [row, setRow] = useState<HTMLDivElement | null>(null)
  const width = useElementWidth(row)
  const mounted = enabled && sides.length > 0
  const split = mounted && visible
  const columns = sides.length + 1
  const tabbed = split && isResearchSplitTabbed(width, columns)
  const fitted = fitWeights(weights, columns)
  const columnsWidth = Math.max(0, width - DIVIDER_PX * sides.length)

  useLayoutEffect(() => setResearchSplitTabbed(tabbed), [tabbed])

  return (
    <div
      ref={setRow}
      data-research-split={split ? (tabbed ? 'tabs' : 'columns') : undefined}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
    >
      {tabbed ? <ResearchSplitTabs sides={sides} /> : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div
          ref={registerResearchMainColumn}
          tabIndex={-1}
          data-research-split-column={MAIN_COLUMN}
          data-research-split-focused={split && focused === MAIN_COLUMN ? 'true' : undefined}
          className={cn(
            'flex min-h-0 min-w-0 outline-none',
            tabbed && focused !== MAIN_COLUMN && 'hidden'
          )}
          style={{ flex: split ? `${fitted[0]} 1 0px` : '1 1 0px' }}
          onPointerDownCapture={split ? () => focusResearchSplitColumn(MAIN_COLUMN) : undefined}
          onFocusCapture={split ? () => focusResearchSplitColumn(MAIN_COLUMN) : undefined}
        >
          {children}
          {aside}
        </div>
        {mounted
          ? sides.map((side, index) => (
              <Fragment key={side.id}>
                {split && !tabbed ? (
                  <ResearchSplitDivider index={index} columnsWidth={columnsWidth} />
                ) : null}
                <ResearchSplitSidePanel
                  side={side}
                  weight={fitted[index + 1] ?? 1}
                  hidden={!split || (tabbed && focused !== side.id)}
                  focused={focused === side.id}
                  lastColumn={index === sides.length - 1}
                />
              </Fragment>
            ))
          : null}
      </div>
      {enabled && visible ? <ResearchSplitDropZone /> : null}
    </div>
  )
}
