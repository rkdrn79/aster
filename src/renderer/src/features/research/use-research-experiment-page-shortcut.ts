import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import { isEditableTarget } from '@/lib/editable-target'
import { isEventTargetInsideFloatingWorkspacePanel } from '@/lib/floating-workspace-terminal-actions'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import {
  getDefaultBindings,
  getKeybindingDefinition,
  keybindingMatchesAction,
  keybindingMatchesInput
} from '../../../../shared/keybindings'

const ACTION = 'research.toggleExperimentDetails'

function matchesDefaultChord(event: KeyboardEvent, platform: NodeJS.Platform): boolean {
  const definition = getKeybindingDefinition(ACTION)
  return Boolean(
    definition &&
    getDefaultBindings(definition, platform).some((binding) =>
      keybindingMatchesInput(binding, event, platform)
    )
  )
}

/** Notebook ⇄ Details from anywhere on the Experiment screen, while it is the open view. */
export function useResearchExperimentPageShortcut(toggle: (() => void) | null): void {
  const keybindings = useAppStore((state) => state.keybindings)
  const toggleRef = useRef(toggle)
  useEffect(() => {
    toggleRef.current = toggle
  })
  const enabled = toggle !== null

  useEffect(() => {
    if (!enabled) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const platform = getShortcutPlatform()
      if (
        event.repeat ||
        event.defaultPrevented ||
        event.isComposing ||
        !keybindingMatchesAction(ACTION, event, platform, keybindings) ||
        isEventTargetInsideFloatingWorkspacePanel(event.target) ||
        (event.target instanceof Element && event.target.closest('[role="dialog"]'))
      ) {
        return
      }
      // Why: the default chord edits no text, so it also works from the chat; a remapped one may.
      if (isEditableTarget(event.target) && !matchesDefaultChord(event, platform)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      toggleRef.current?.()
    }
    addAppKeyListener('keydown', onKeyDown)
    return () => removeAppKeyListener('keydown', onKeyDown)
  }, [enabled, keybindings])
}
