import { useMemo } from 'react'
import { useNativeChatComposerCatalog } from './use-native-chat-composer-catalog'
import {
  useNativeChatPickerState,
  type NativeChatPickerState
} from './use-native-chat-picker-state'
import {
  useNativeChatResumeCommand,
  type NativeChatResumeCommand
} from './use-native-chat-resume-command'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'
import { useNativeChatBranchCommand } from './use-native-chat-branch-command'

type PickerArgs = Parameters<typeof useNativeChatPickerState>[0]
type ResumeArgs = Parameters<typeof useNativeChatResumeCommand>[0]

/** The composer's `/` and `@` picker over its agent's catalog, with Aster's own `/resume` and
 *  `/fork` taken first. */
export function useNativeChatComposerCommandPicker(
  args: Omit<
    PickerArgs,
    'agentCommands' | 'sessionSkills' | 'onPickerOpened' | keyof ResumeArgs['editor']
  > &
    Pick<ResumeArgs, 'editor' | 'setNotice'> & {
      structuredTransport: NativeChatStructuredComposerTransport | undefined
    }
): { picker: NativeChatPickerState; resume: NativeChatResumeCommand } {
  const { structuredTransport, editor, setNotice, ...pickerArgs } = args
  const { agent, terminalTabId } = pickerArgs
  const { agentCommands, sessionSkills } = useNativeChatComposerCatalog(agent, structuredTransport)
  const picker = useNativeChatPickerState({
    ...pickerArgs,
    ...editor,
    agentCommands,
    sessionSkills,
    ...(structuredTransport?.refreshCommands
      ? { onPickerOpened: structuredTransport.refreshCommands }
      : {})
  })
  const resumeCommand = useNativeChatResumeCommand({
    structuredTransport,
    agent,
    terminalTabId,
    picker,
    editor,
    setNotice
  })
  const branchCommand = useNativeChatBranchCommand({
    structured: structuredTransport !== undefined,
    picker,
    editor,
    setNotice
  })
  const resume = useMemo<NativeChatResumeCommand>(
    () => ({
      consume: (draft) => branchCommand.consume(draft) || resumeCommand.consume(draft),
      interceptPick: (pick) => branchCommand.interceptPick(resumeCommand.interceptPick(pick))
    }),
    [branchCommand, resumeCommand]
  )
  return { picker, resume }
}
