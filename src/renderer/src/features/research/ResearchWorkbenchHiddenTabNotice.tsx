import type { Tab } from '../../../../shared/tab-types'

/** Fills a Workbench group whose selected tab lives in another Research area. */
export function ResearchWorkbenchHiddenTabNotice({ tab }: { tab: Tab }): React.JSX.Element | null {
  // Why: a Writing file leaves the Workbench as empty as a workspace with nothing open.
  if (tab.contentType === 'editor') {
    return null
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-5 text-center">
      <p className="text-sm font-medium">This agent belongs to another area.</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Open it from Writing, Library, or Background tasks, or start a Workbench conversation.
      </p>
    </div>
  )
}
