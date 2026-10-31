import { ArrowLeft, ArrowRight, MoreHorizontal, PanelLeft } from 'lucide-react'
import { PRODUCT_NAME } from '../../../shared/product-brand'
import { ProductLogoMark } from './ProductLogoMark'
import { translate } from '@/i18n/i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { shouldShowWorktreeHistoryControls } from '../lib/titlebar-worktree-history-controls'
import {
  canGoBackWorktreeHistory,
  canGoForwardWorktreeHistory
} from '@/store/slices/worktree-nav-history'
import { useShortcutLabel } from '../hooks/useShortcutLabel'
import { useAppStore } from '../store'
import { openResearchHome } from '@/features/research/research-navigation'
import {
  canGoResearchHistory,
  goLayoutHistory,
  useResearchHistory
} from '@/features/research/research-history-store'
import { hasCustomTitleBar, hasMacTrafficLights } from './app-window-chrome'
import type { AppChromeLayout } from './use-app-chrome-layout'
import { toggleLeftSidebar } from './compact-drawer-store'

/**
 * The titlebar's left cluster: window chrome padding, app name, sidebar toggle, and the
 * worktree back/forward pair. Shared by the full-width titlebar and the sidebar-width left
 * header so the agent badge popover isn't duplicated.
 */
export function TitlebarLeftControls({
  layout,
  inDrawer = false
}: {
  layout: AppChromeLayout
  /** The compact sidebar drawer's copy: spans the drawer and stays out of the floating-header measure. */
  inDrawer?: boolean
}): React.JSX.Element {
  const updateSettings = useAppStore((s) => s.updateSettings)
  // Why: in Research, Back/Forward walk pages and Experiments; in Code, workspaces.
  const researchUi = useAppStore((s) => s.settings?.researchUiEnabled === true)
  const canGoBackWorktree = useAppStore(canGoBackWorktreeHistory)
  const canGoForwardWorktree = useAppStore(canGoForwardWorktreeHistory)
  const canGoBackResearch = useResearchHistory((s) => canGoResearchHistory(s.history, 'back'))
  const canGoForwardResearch = useResearchHistory((s) => canGoResearchHistory(s.history, 'forward'))
  const canGoBack = researchUi ? canGoBackResearch : canGoBackWorktree
  const canGoForward = researchUi ? canGoForwardResearch : canGoForwardWorktree
  const leftSidebarShortcutLabel = useShortcutLabel('sidebar.left.toggle')
  const historyBackShortcutLabel = useShortcutLabel(
    researchUi ? 'research.history.back' : 'worktree.history.back'
  )
  const historyForwardShortcutLabel = useShortcutLabel(
    researchUi ? 'research.history.forward' : 'worktree.history.forward'
  )
  const appName = PRODUCT_NAME
  // Why: on a phone the floating copy keeps only the toggle and history; the drawer shows the name.
  const showAppName =
    layout.showSidebar &&
    !hasCustomTitleBar &&
    layout.showTitlebarAppName &&
    (inDrawer || !layout.compactViewport)

  return (
    // Why: measure the ENTIRE row so TabGroupPanel's collapse spacer reserves enough width; measuring only the inner cluster left back/forward over the first tab.
    // Why: collapsed mode floats in a w-0 wrapper; w-max stops Windows Chromium from shrinking the app name to one glyph.
    <div
      ref={inDrawer ? undefined : layout.titlebarLeftControlsRef}
      className={`flex h-full shrink-0 items-center${
        layout.leftTitlebarChromeLayout.isFloating && !inDrawer ? ' w-max' : ' w-full'
      }`}
    >
      <div className="flex h-full items-center">
        {hasMacTrafficLights && !layout.isFullScreen ? (
          <div className="titlebar-traffic-light-pad" />
        ) : hasCustomTitleBar ? (
          /* Why: Windows/Linux remove the native title bar, so render the logo plus a ··· button that pops the application menu (as Alt does). */
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="sidebar-toggle ml-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${appName} home`}
                  onClick={() => openResearchHome()}
                >
                  <ProductLogoMark className="text-primary" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {appName} home
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="titlebar-icon-button"
                  aria-label={translate('auto.App.8b0b8eb54f', 'Application menu')}
                  onClick={() => window.api.ui.popupMenu()}
                >
                  <MoreHorizontal size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {translate('auto.App.8b0b8eb54f', 'Application menu')}
              </TooltipContent>
            </Tooltip>
          </>
        ) : (
          <div className="pl-2" />
        )}
        {showAppName && (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                className="titlebar-app-name focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${appName} home`}
                onClick={() => openResearchHome()}
              >
                <ProductLogoMark className="size-3.5 text-primary" />
                <span className="titlebar-app-name-main">{appName}</span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onSelect={() => {
                  void updateSettings({ showTitlebarAppName: false })
                }}
              >
                {translate('auto.App.e81217c1b7', 'Hide App Name')}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )}
        {layout.showSidebar && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="sidebar-toggle"
                onClick={toggleLeftSidebar}
                aria-label={translate('auto.App.e4b9e7dff7', 'Toggle sidebar')}
              >
                <PanelLeft size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.App.ce37cf5279', 'Toggle sidebar ({{value0}})', {
                value0: leftSidebarShortcutLabel
              })}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {/* Why: Back/Forward span worktree + page history, so show the cluster wherever the shortcut is live (hidden in Settings/non-stack views). */}
      {shouldShowWorktreeHistoryControls(layout.activeView) && (
        // With the sidebar collapsed the header shrink-wraps and ml-auto has no spare width, so keep a fixed gutter before Back.
        <div className="ml-auto mr-3 flex items-center pl-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="sidebar-toggle sidebar-toggle-compact"
                onClick={() => goLayoutHistory('back')}
                disabled={!canGoBack}
                aria-label={translate('auto.App.064bd07810', 'Go back')}
              >
                <ArrowLeft size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.App.fe21e8f6f5', 'Go back ({{value0}})', {
                value0: historyBackShortcutLabel
              })}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="sidebar-toggle sidebar-toggle-compact"
                onClick={() => goLayoutHistory('forward')}
                disabled={!canGoForward}
                aria-label={translate('auto.App.cf9099fe98', 'Go forward')}
              >
                <ArrowRight size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.App.f7aa73e785', 'Go forward ({{value0}})', {
                value0: historyForwardShortcutLabel
              })}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
