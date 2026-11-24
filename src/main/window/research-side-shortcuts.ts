import type { WebContents } from 'electron'
import { isMacAppPasteInput } from './mac-app-paste-input'
import { isCloseWindowShortcut, zoomShortcutDirection } from './research-page-window-shortcuts'
import {
  keybindingMatchesAction,
  type KeybindingInput,
  type KeybindingOverrides
} from '../../shared/keybindings'
import type { UIZoomDirection } from '../../shared/ui-zoom-level'
import {
  nativeZoomCommandMatchesKeybindings,
  resolveWindowShortcutAction
} from '../../shared/window-shortcut-policy'
import { RESEARCH_WINDOW_PAGES } from '../../shared/research-page-window'
import type { ResearchSideCommand } from '../../shared/research-side-split'

export type ResearchSideShortcut =
  | { kind: 'paste' }
  | { kind: 'zoom'; direction: UIZoomDirection }
  | { kind: 'close' }
  | { kind: 'open-beside' }
  | { kind: 'focus-next' }
  | { kind: 'page'; index: number }

type SideInput = KeybindingInput & { type: string; isAutoRepeat?: boolean }

/**
 * What a key pressed in a side means. A focused side is its own renderer, so the main window's
 * shortcuts never see it; only these reach past the side, and none acts on the main project.
 */
export function resolveResearchSideShortcut<Input extends SideInput>(
  input: Input,
  platform: NodeJS.Platform,
  keybindings: KeybindingOverrides | undefined,
  isPaste: (input: Input) => boolean
): ResearchSideShortcut | null {
  if (isPaste(input)) {
    return { kind: 'paste' }
  }
  if (input.type !== 'keyDown') {
    return null
  }
  const direction = zoomShortcutDirection(input, platform, keybindings)
  if (direction) {
    return { kind: 'zoom', direction }
  }
  const app = { context: 'app' } as const
  if (keybindingMatchesAction('research.split.openBeside', input, platform, keybindings, app)) {
    return input.isAutoRepeat ? null : { kind: 'open-beside' }
  }
  if (keybindingMatchesAction('research.split.focusNext', input, platform, keybindings, app)) {
    return input.isAutoRepeat ? null : { kind: 'focus-next' }
  }
  if (isCloseWindowShortcut(input, platform, keybindings)) {
    return input.isAutoRepeat ? null : { kind: 'close' }
  }
  // Why: Mod+1… picks a page in the main window; in a side it picks that side's page.
  const action = resolveWindowShortcutAction(input, platform, keybindings, app)
  if (action?.type === 'jumpToWorktreeIndex' && !input.isAutoRepeat) {
    return { kind: 'page', index: action.index }
  }
  return null
}

/** Routes a side's own shortcuts: page, paste and zoom stay in the side; split keys go to main. */
export function attachResearchSideShortcuts(
  guest: WebContents,
  options: {
    platform?: NodeJS.Platform
    getKeybindings?: () => KeybindingOverrides | undefined
    sendToMain: (command: ResearchSideCommand) => void
  }
): void {
  const platform = options.platform ?? process.platform
  guest.on('before-input-event', (event, input) => {
    const shortcut = resolveResearchSideShortcut(
      input,
      platform,
      options.getKeybindings?.(),
      isMacAppPasteInput
    )
    if (!shortcut) {
      return
    }
    event.preventDefault()
    switch (shortcut.kind) {
      case 'paste':
        guest.send('ui:appMenuPaste')
        return
      case 'zoom':
        guest.send('terminal:zoom', shortcut.direction)
        return
      case 'page': {
        const page = RESEARCH_WINDOW_PAGES[shortcut.index]
        if (page) {
          guest.send('researchWindow:showPage', page)
        }
        return
      }
      case 'close':
      case 'open-beside':
      case 'focus-next':
        options.sendToMain({ kind: shortcut.kind })
    }
  })
  guest.on('zoom-changed', (event, direction) => {
    if (
      (direction === 'in' || direction === 'out') &&
      nativeZoomCommandMatchesKeybindings(direction, platform, options.getKeybindings?.(), {
        context: 'app'
      })
    ) {
      event.preventDefault()
      guest.send('terminal:zoom', direction)
    }
  })
}
