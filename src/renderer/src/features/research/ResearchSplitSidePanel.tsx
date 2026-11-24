import { cn } from '@/lib/utils'
import { ResearchSplitSideView } from './ResearchSplitSideView'
import type { ResearchSplitSide } from './research-split-layout'
import { useResearchSplitProjectLabel } from './research-split-project'

/**
 * One project beside the main one. Its page draws the same shell as the main window, a sidebar
 * panel for its project beside a page panel, so this column only holds it.
 */
export function ResearchSplitSidePanel({
  side,
  weight,
  hidden,
  focused,
  lastColumn
}: {
  side: ResearchSplitSide
  weight: number
  /** Tabs show one column at a time; the others stay alive, out of sight. */
  hidden: boolean
  focused: boolean
  lastColumn: boolean
}): React.JSX.Element {
  const label = useResearchSplitProjectLabel(side.workspaceId, side.hostId)
  return (
    <section
      aria-label={`${label.name}, beside`}
      data-research-split-column={side.id}
      data-research-split-focused={focused ? 'true' : undefined}
      className={cn('flex min-h-0 min-w-0 flex-col', hidden && 'hidden')}
      style={{ flex: `${weight} 1 0px` }}
    >
      <ResearchSplitSideView
        side={side}
        name={label.name}
        focused={focused}
        lastColumn={lastColumn}
      />
    </section>
  )
}
