import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import { isEventTargetInsideFloatingWorkspacePanel } from '@/lib/floating-workspace-terminal-actions'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import {
  keybindingMatchesAction,
  type KeybindingMatchOptions
} from '../../../../shared/keybindings'
import {
  goToPreviousResearchProject,
  toggleResearchProjectSwitcher
} from './research-project-switcher-store'

export type ResearchProjectShortcut = 'switcher' | 'previous'

/** Which project shortcut `event` is, honoring the terminal-first policy inside terminals. */
export function matchResearchProjectShortcut(event: KeyboardEvent): ResearchProjectShortcut | null {
  if (event.repeat || event.defaultPrevented || event.isComposing) {
    return null
  }
  const state = useAppStore.getState()
  const platform = getShortcutPlatform()
  const target = event.target instanceof Element ? event.target : null
  const options: KeybindingMatchOptions = target?.closest('.xterm')
    ? { context: 'terminal', terminalShortcutPolicy: state.settings?.terminalShortcutPolicy }
    : {}
  if (
    keybindingMatchesAction('research.projectSwitcher', event, platform, state.keybindings, options)
  ) {
    return 'switcher'
  }
  if (
    keybindingMatchesAction('research.previousProject', event, platform, state.keybindings, options)
  ) {
    return 'previous'
  }
  return null
}

/** ⌃⌘P opens the project switcher and ⌃⌘O goes to the previous project, in a project or on Home. */
export function useResearchProjectSwitcherShortcut(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const shortcut = matchResearchProjectShortcut(event)
      if (!shortcut) {
        return
      }
      const state = useAppStore.getState()
      if (
        state.activeView === 'settings' ||
        state.activeModal !== 'none' ||
        isEventTargetInsideFloatingWorkspacePanel(event.target)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (shortcut === 'switcher') {
        toggleResearchProjectSwitcher()
      } else {
        goToPreviousResearchProject()
      }
    }
    addAppKeyListener('keydown', onKeyDown)
    return () => removeAppKeyListener('keydown', onKeyDown)
  }, [enabled])
}
