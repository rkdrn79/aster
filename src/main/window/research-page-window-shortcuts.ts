import type { BrowserWindow } from 'electron'
import { isMacAppPasteInput } from './mac-app-paste-input'
import {
  keybindingMatchesAction,
  type KeybindingActionId,
  type KeybindingInput,
  type KeybindingOverrides
} from '../../shared/keybindings'
import type { UIZoomDirection } from '../../shared/ui-zoom-level'
import { nativeZoomCommandMatchesKeybindings } from '../../shared/window-shortcut-policy'

const ZOOM_SHORTCUTS: readonly [KeybindingActionId, UIZoomDirection][] = [
  ['zoom.in', 'in'],
  ['zoom.out', 'out'],
  ['zoom.reset', 'reset']
]

/**
 * A project window's own window shortcuts. Close tab (Cmd+W) closes the window: it has no tabs,
 * and a key pressed here never reaches the main window, so without this it did nothing. Cmd+V
 * goes to the window's paste handling first, and the zoom keys to its zoom handling (chat text,
 * editor text or the whole UI, by focus), as in the main window.
 */
export function attachResearchWindowShortcuts(
  window: BrowserWindow,
  options: {
    getKeybindings?: () => KeybindingOverrides | undefined
    platform?: NodeJS.Platform
  } = {}
): void {
  const platform = options.platform ?? process.platform
  window.webContents.on('before-input-event', (event, input) => {
    if (isMacAppPasteInput(input)) {
      // Why: a chat box can own focus without being a native editable control (main window does the same).
      event.preventDefault()
      window.webContents.send('ui:appMenuPaste')
      return
    }
    if (input.type !== 'keyDown') {
      return
    }
    const keybindings = options.getKeybindings?.()
    const zoom = zoomShortcutDirection(input, platform, keybindings)
    if (zoom) {
      event.preventDefault()
      window.webContents.send('terminal:zoom', zoom)
      return
    }
    if (!input.isAutoRepeat && isCloseWindowShortcut(input, platform, keybindings)) {
      event.preventDefault()
      window.close()
    }
  })
  window.webContents.on('zoom-changed', (event, direction) => {
    // Why: Cmd+wheel and pinch zoom arrive here, outside the keyboard path; zoom like the keys.
    if (
      (direction === 'in' || direction === 'out') &&
      nativeZoomCommandMatchesKeybindings(direction, platform, options.getKeybindings?.(), {
        context: 'app'
      })
    ) {
      event.preventDefault()
      window.webContents.send('terminal:zoom', direction)
    }
  })
}

export function zoomShortcutDirection(
  input: KeybindingInput,
  platform: NodeJS.Platform,
  keybindings: KeybindingOverrides | undefined
): UIZoomDirection | null {
  for (const [actionId, direction] of ZOOM_SHORTCUTS) {
    if (keybindingMatchesAction(actionId, input, platform, keybindings, { context: 'app' })) {
      return direction
    }
  }
  return null
}

export function isCloseWindowShortcut(
  input: KeybindingInput,
  platform: NodeJS.Platform,
  keybindings: KeybindingOverrides | undefined
): boolean {
  return keybindingMatchesAction('tab.close', input, platform, keybindings, { context: 'app' })
}
