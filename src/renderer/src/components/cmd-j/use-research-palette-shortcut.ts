import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import { isEventTargetInsideFloatingWorkspacePanel } from '@/lib/floating-workspace-terminal-actions'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { keybindingMatchesAction } from '../../../../shared/keybindings'

/** ⌘K toggles the jump palette, which lists Research destinations, while the Research layout is on. */
export function useResearchPaletteShortcut(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.defaultPrevented || event.isComposing) {
        return
      }
      const state = useAppStore.getState()
      const platform = getShortcutPlatform()
      if (!keybindingMatchesAction('research.commandPalette', event, platform, state.keybindings)) {
        return
      }
      const target = event.target instanceof Element ? event.target : null
      const paletteOpen = state.activeModal === 'worktree-palette'
      if (
        // Why: terminals clear and code editors start chords on the same key.
        target?.closest('.xterm, .monaco-editor') ||
        isEventTargetInsideFloatingWorkspacePanel(event.target) ||
        (state.activeModal !== 'none' && !paletteOpen)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (paletteOpen) {
        state.closeModal()
      } else {
        state.openModal('worktree-palette')
      }
    }
    addAppKeyListener('keydown', onKeyDown)
    return () => removeAppKeyListener('keydown', onKeyDown)
  }, [enabled])
}
