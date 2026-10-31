import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useCompactDrawer } from './compact-drawer-store'
import type { AppChromeLayout } from './use-app-chrome-layout'

/**
 * The left sidebar on a compact viewport: a drawer over the page while it is open, and the
 * same zero-width slot as a collapsed sidebar otherwise, so the sidebar stays mounted either way.
 */
export function CompactSidebarDrawer({
  layout,
  header,
  children
}: {
  layout: AppChromeLayout
  header: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  const open = useCompactDrawer((state) => state.open)
  const setOpen = useCompactDrawer((state) => state.setOpen)
  const sidebarWidth = useAppStore((state) => state.sidebarWidth)

  return (
    <>
      {open ? (
        <div
          aria-hidden
          data-compact-sidebar-backdrop=""
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] animate-in fade-in-0"
          onClick={() => setOpen(false)}
        />
      ) : null}
      {/* Why: one element open or closed; swapping wrappers would remount the sidebar on every toggle. */}
      <div
        className={cn(
          'flex min-h-0',
          open &&
            'fixed inset-y-0 left-0 z-50 flex-col overflow-hidden bg-worktree-sidebar pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-floating animate-in slide-in-from-left duration-200 motion-reduce:animate-none'
        )}
        style={
          open
            ? {
                ...layout.leftSidebarStyle,
                // Why: leave a strip of page showing so there is backdrop to tap.
                width: `min(${sidebarWidth}px, calc(100vw - 3rem))`
              }
            : undefined
        }
      >
        {open ? (
          <div className="titlebar-left" style={layout.leftSidebarStyle}>
            {header}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
    </>
  )
}
