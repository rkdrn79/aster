import { useCallback, useContext } from 'react'
import { translate } from '@/i18n/i18n'
import type { SlashCommandSuggestion } from '../../../../shared/native-chat-slash-commands'
import type { NativeChatPickerItem } from './native-chat-composer-state'
import type { NativeChatPickerState } from './use-native-chat-picker-state'
import type { NativeChatResumeCommand } from './use-native-chat-resume-command'
import { NativeChatBranchContext } from './native-chat-branch-context'

const FORK = 'fork'

/** A structured chat's catalog with Aster's `/fork`, in place of an agent command of that name:
 *  it branches the chat the same way for every agent. */
export function withNativeChatBranchCommand(
  commands: readonly SlashCommandSuggestion[]
): SlashCommandSuggestion[] {
  const fork: SlashCommandSuggestion = {
    name: FORK,
    description: translate(
      'components.native-chat.branchCommand.description',
      'Branch this chat into a new one'
    ),
    orcaOwned: true
  }
  const at = commands.findIndex(({ name }) => name === FORK)
  return at === -1
    ? [...commands, fork]
    : [...commands.slice(0, at), fork, ...commands.slice(at + 1)]
}

/** Whether the draft is a `/fork`, read the way the chat host reads a command. */
export function isNativeChatBranchDraft(draft: string): boolean {
  return (draft.split(/\s/, 1)[0] ?? '').toLowerCase() === `/${FORK}`
}

/** In a structured chat, `/fork` makes Branch chat's new chat and never reaches the agent. */
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
  const { structured, setNotice } = args
  const { autocomplete, isPickedSkill, clearSkillOrigin } = args.picker
  const { setDraft, setCaret, setActiveSuggestion } = args.editor

  const run = useCallback((): void => {
    const blocked = branch
      ? branch.disabledReason
      : translate('components.native-chat.branchCommand.unavailable', "This chat can't branch.")
    setDraft('')
    setCaret(0)
    setActiveSuggestion(0)
    setNotice(blocked)
    if (!blocked) {
      branch?.branchChat()
    }
  }, [branch, setActiveSuggestion, setCaret, setDraft, setNotice])

  const consume = useCallback(
    (draft: string): boolean => {
      const ours = structured && !isPickedSkill(draft) && isNativeChatBranchDraft(draft)
      if (ours) {
        run()
      }
      return ours
    },
    [isPickedSkill, run, structured]
  )

  const interceptPick = useCallback(
    <TItem extends NativeChatPickerItem>(pick: (item: TItem) => void) =>
      (item: TItem) => {
        const leading = autocomplete.mode === 'slash' && autocomplete.dispatchable
        if (leading && item.kind === 'command' && item.orcaOwned && item.name === FORK) {
          clearSkillOrigin()
          run()
          return
        }
        pick(item)
      },
    [autocomplete, clearSkillOrigin, run]
  )

  return { consume, interceptPick }
}
