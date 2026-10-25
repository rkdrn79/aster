import { Keyboard } from 'lucide-react'
import { toast } from 'sonner'
import {
  formatKeybindingList,
  getEffectiveKeybindingsForAction,
  getKeybindingDefinition,
  isKeybindingPotentialTerminalConflict,
  parseKeybinding,
  type KeybindingActionId,
  type KeybindingOverrides
} from '../../../shared/keybindings'
import { useAppStore } from '../store'
import { translate } from '@/i18n/i18n'

const STORAGE_PREFIX = 'orca.terminalShortcutCapturedNotice.'
const NOTICE_DURATION_MS = 20_000

function hasShownNotice(actionId: KeybindingActionId): boolean {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${actionId}`) === 'true'
  } catch {
    return false
  }
}

function markNoticeShown(actionId: KeybindingActionId): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${actionId}`, 'true')
  } catch {
    // Ignore storage failures; the notification still gives the user the path.
  }
}

function openShortcutSettings(): void {
  const store = useAppStore.getState()
  store.openSettingsPage()
  store.openSettingsTarget({
    pane: 'shortcuts',
    repoId: null,
    sectionId: 'terminal-shortcut-policy'
  })
}

// Why: macOS never sends Cmd chords to a shell or TUI, so capturing one (⌘T, ⌘W) costs the
// terminal nothing and the hint would only be noise on an ordinary shortcut.
function canReachTerminalProgram(bindings: string[], platform: NodeJS.Platform): boolean {
  if (platform !== 'darwin') {
    return true
  }
  return bindings.some((binding) => {
    const parsed = parseKeybinding(binding)
    return !parsed || (!parsed.mod && !parsed.meta)
  })
}

export function showTerminalShortcutCaptureNotification({
  actionId,
  platform,
  keybindings
}: {
  actionId: KeybindingActionId
  platform: NodeJS.Platform
  keybindings?: KeybindingOverrides
}): void {
  const definition = getKeybindingDefinition(actionId)
  if (!definition || !isKeybindingPotentialTerminalConflict(definition)) {
    return
  }
  const bindings = getEffectiveKeybindingsForAction(actionId, platform, keybindings)
  if (!canReachTerminalProgram(bindings, platform) || hasShownNotice(actionId)) {
    return
  }
  markNoticeShown(actionId)

  const bindingLabel = formatKeybindingList(bindings, platform)
  // Why: this toast stays up longer than normal, so keep it compact while still
  // exposing the captured shortcut and the edit path.
  toast.message(
    translate(
      'auto.lib.terminal.shortcut.capture.notification.141ad6c004',
      'Terminal shortcut handled'
    ),
    {
      description: `${definition.title} (${bindingLabel})`,
      // Why: this is the user's one-time rebind path for a captured shortcut; it
      // needs enough reading time without becoming persistent chrome.
      duration: NOTICE_DURATION_MS,
      dismissible: true,
      className: '!w-[420px] !max-w-[calc(100vw-2rem)] !gap-2 !py-2 !pl-3 !pr-2',
      classNames: {
        content: 'min-w-0 flex-1 !gap-0.5',
        title: 'truncate !leading-5',
        description: 'truncate !leading-4',
        actionButton: '!h-7 !shrink-0 !rounded-md !px-2.5'
      },
      icon: <Keyboard className="size-4 text-muted-foreground" />,
      action: {
        label: translate(
          'auto.lib.terminal.shortcut.capture.notification.b0536028c9',
          'Open Shortcuts'
        ),
        onClick: openShortcutSettings
      }
    }
  )
}
