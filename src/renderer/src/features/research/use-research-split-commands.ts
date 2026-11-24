import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import { isEventTargetInsideFloatingWorkspacePanel } from '@/lib/floating-workspace-terminal-actions'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import {
  keybindingMatchesAction,
  type KeybindingMatchOptions
} from '../../../../shared/keybindings'
import type { ResearchSideCommand } from '../../../../shared/research-side-split'
import { lastResearchSidePage } from './research-split-open'
import {
  toggleResearchProjectSwitcher,
  useResearchProjectSwitcher
} from './research-project-switcher-store'
import {
  closeResearchSide,
  focusNextResearchSplitColumn,
  focusResearchSplitColumn,
  replaceResearchSide,
  setResearchSidePage
} from './research-split-store'

export type ResearchSplitShortcut = 'open-beside' | 'focus-next'

/** Which split shortcut `event` is, honoring the terminal-first policy inside terminals. */
export function matchResearchSplitShortcut(event: KeyboardEvent): ResearchSplitShortcut | null {
  if (event.repeat || event.defaultPrevented || isImeOwnedKeyboardEvent(event)) {
    return null
  }
  const state = useAppStore.getState()
  const platform = getShortcutPlatform()
  const target = event.target instanceof Element ? event.target : null
  const options: KeybindingMatchOptions = target?.closest('.xterm')
    ? { context: 'terminal', terminalShortcutPolicy: state.settings?.terminalShortcutPolicy }
    : {}
  if (
    keybindingMatchesAction(
      'research.split.openBeside',
      event,
      platform,
      state.keybindings,
      options
    )
  ) {
    return 'open-beside'
  }
  if (
    keybindingMatchesAction('research.split.focusNext', event, platform, state.keybindings, options)
  ) {
    return 'focus-next'
  }
  return null
}

/** What a side asked of this window: only that side changes, or the switcher opens to add one. */
export function runResearchSideCommand(sideId: string, command: ResearchSideCommand): void {
  switch (command.kind) {
    case 'focus':
      focusResearchSplitColumn(sideId)
      return
    case 'close':
      closeResearchSide(sideId)
      return
    case 'page':
      setResearchSidePage(sideId, command.page)
      return
    case 'open-beside':
      toggleResearchProjectSwitcher('beside')
      return
    case 'focus-next':
      focusNextResearchSplitColumn()
      return
    case 'replace':
      replaceResearchSide(sideId, {
        workspaceId: command.workspaceId,
        hostId: command.hostId,
        page: lastResearchSidePage(command.workspaceId)
      })
  }
}

/** Main window: ⌘\ opens a project to the side, ⇧⌘\ moves between sides, and sides' requests. */
export function useResearchSplitCommands(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    const offSide = window.api.researchWindow?.onSideCommand?.(runResearchSideCommand)
    const onKeyDown = (event: KeyboardEvent): void => {
      const shortcut = matchResearchSplitShortcut(event)
      const state = useAppStore.getState()
      if (
        !shortcut ||
        state.activeView === 'settings' ||
        state.activeModal !== 'none' ||
        isEventTargetInsideFloatingWorkspacePanel(event.target) ||
        // Why: the open switcher takes ⌘\ itself, for the project it has highlighted.
        useResearchProjectSwitcher.getState().open
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (shortcut === 'open-beside') {
        toggleResearchProjectSwitcher('beside')
      } else {
        focusNextResearchSplitColumn()
      }
    }
    addAppKeyListener('keydown', onKeyDown)
    return () => {
      offSide?.()
      removeAppKeyListener('keydown', onKeyDown)
    }
  }, [enabled])
}
