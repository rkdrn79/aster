import { useCallback, useContext } from 'react'
import { translate } from '@/i18n/i18n'
import { ConfirmationDialogContext } from '@/components/confirmation-dialog-context'
import type { SlashCommandSuggestion } from '../../../../shared/native-chat-slash-commands'
import type { NativeChatPickerItem } from './native-chat-composer-state'
import type { NativeChatPickerState } from './use-native-chat-picker-state'
import type { NativeChatResumeCommand } from './use-native-chat-resume-command'
import { NativeChatBranchContext } from './native-chat-branch-context'

/** Aster's own copy and rewind commands, as Claude Code splits them. */
export const NATIVE_CHAT_COPY_COMMANDS = ['branch', 'fork', 'subtask', 'rewind'] as const
type CopyCommand = (typeof NATIVE_CHAT_COPY_COMMANDS)[number]

function copyCommandRows(): SlashCommandSuggestion[] {
  return [
    {
      name: 'branch',
      description: translate(
        'components.native-chat.branchCommand.description',
        'Copy this chat and switch to the copy'
      ),
      argumentHint: '[name]',
      orcaOwned: true
    },
    {
      name: 'fork',
      description: translate(
        'components.native-chat.forkCommand.description',
        'Copy this chat to work in the background'
      ),
      argumentHint: '[prompt]',
      orcaOwned: true
    },
    {
      name: 'subtask',
      description: translate(
        'components.native-chat.subtaskCommand.description',
        'Side task on a hidden copy; the result comes back'
      ),
      argumentHint: '<task>',
      orcaOwned: true
    },
    {
      name: 'rewind',
      description: translate(
        'components.native-chat.rewindCommand.description',
        'Go back to your last message in this chat'
      ),
      orcaOwned: true
    }
  ]
}

/** A structured chat's catalog with Aster's `/branch`, `/fork`, `/subtask` and `/rewind`, each in
 *  place of an agent command of that name: they work the same way for every agent. */
export function withNativeChatBranchCommand(
  commands: readonly SlashCommandSuggestion[]
): SlashCommandSuggestion[] {
  const ours = copyCommandRows()
  const names = new Set(ours.map(({ name }) => name))
  return [...commands.filter(({ name }) => !names.has(name)), ...ours]
}

/** The copy command a draft leads with, and what follows it; null for any other draft. */
export function parseNativeChatCopyDraft(
  draft: string
): { command: CopyCommand; argument: string } | null {
  const token = (draft.split(/\s/, 1)[0] ?? '').toLowerCase()
  const command = NATIVE_CHAT_COPY_COMMANDS.find((name) => token === `/${name}`)
  return command
    ? { command, argument: draft.slice(token.length).replace(/\s+/g, ' ').trim() }
    : null
}

/** In a structured chat, Aster's copy commands run here and never reach the agent. */
export function useNativeChatBranchCommand(args: {
  structured: boolean
  picker: Pick<NativeChatPickerState, 'isPickedSkill' | 'clearSkillOrigin'> & {
    autocomplete: { mode: string; dispatchable?: boolean }
  }
  editor: {
    setDraft: (value: string) => void
    setCaret: (value: number) => void
    setActiveSuggestion: (value: number) => void
  }
  setNotice: (notice: string | null) => void
}): NativeChatResumeCommand {
  const branch = useContext(NativeChatBranchContext)
  // Read directly: a composer outside the app's dialog provider (a test) simply has no /rewind.
  const confirm = useContext(ConfirmationDialogContext)
  const { structured, setNotice } = args
  const { autocomplete, isPickedSkill, clearSkillOrigin } = args.picker
  const { setDraft, setCaret, setActiveSuggestion } = args.editor

  const leave = useCallback(
    (draft: string, notice: string | null): void => {
      setDraft(draft)
      setCaret(draft.length)
      setActiveSuggestion(0)
      setNotice(notice)
    },
    [setActiveSuggestion, setCaret, setDraft, setNotice]
  )

  const run = useCallback(
    (command: CopyCommand, argument: string): void => {
      if (!branch) {
        leave(
          '',
          translate(
            'components.native-chat.branchCommand.unavailable',
            "This chat can't be copied."
          )
        )
        return
      }
      if (command === 'rewind') {
        const rewind = confirm ? branch.rewindLatest : null
        leave(
          '',
          rewind
            ? null
            : translate(
                'components.native-chat.rewindCommand.unavailable',
                "This chat can't go back."
              )
        )
        if (rewind && confirm) {
          rewind(confirm)
        }
        return
      }
      if (branch.disabledReason) {
        leave('', branch.disabledReason)
        return
      }
      if (command === 'subtask' && !argument) {
        // Kept, so the person only adds the task.
        leave(
          '/subtask ',
          translate(
            'components.native-chat.subtaskCommand.needsTask',
            'Say what the subtask should do: /subtask <task>'
          )
        )
        return
      }
      leave('', null)
      if (command === 'branch') {
        branch.branchChat(argument || undefined)
      } else if (command === 'fork') {
        branch.forkChat(argument || undefined)
      } else {
        branch.subtask(argument)
      }
    },
    [branch, confirm, leave]
  )

  const consume = useCallback(
    (draft: string): boolean => {
      const parsed = structured && !isPickedSkill(draft) ? parseNativeChatCopyDraft(draft) : null
      if (parsed) {
        run(parsed.command, parsed.argument)
      }
      return parsed !== null
    },
    [isPickedSkill, run, structured]
  )

  const interceptPick = useCallback(
    <TItem extends NativeChatPickerItem>(pick: (item: TItem) => void) =>
      (item: TItem) => {
        const leading = autocomplete.mode === 'slash' && autocomplete.dispatchable
        const command = NATIVE_CHAT_COPY_COMMANDS.find((name) => name === item.name)
        if (leading && item.kind === 'command' && item.orcaOwned && command) {
          clearSkillOrigin()
          if (command === 'subtask') {
            // Chosen from the menu, it waits for its task.
            leave('/subtask ', null)
          } else {
            run(command, '')
          }
          return
        }
        pick(item)
      },
    [autocomplete, clearSkillOrigin, leave, run]
  )

  return { consume, interceptPick }
}
