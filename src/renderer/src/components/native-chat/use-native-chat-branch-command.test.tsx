// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmationDialogContext } from '@/components/confirmation-dialog-context'
import { NativeChatBranchContext, type NativeChatBranchSurface } from './native-chat-branch-context'
import {
  parseNativeChatCopyDraft,
  useNativeChatBranchCommand,
  withNativeChatBranchCommand
} from './use-native-chat-branch-command'

function branch(overrides: Partial<NativeChatBranchSurface> = {}): NativeChatBranchSurface {
  return {
    disabledReason: null,
    earlierDisabledReason: null,
    openerIds: new Set(),
    isLatest: () => true,
    branchFrom: vi.fn(),
    forkFrom: vi.fn(),
    editAndBranch: vi.fn(),
    branchChat: vi.fn(),
    forkChat: vi.fn(),
    subtask: vi.fn(),
    rewindLatest: vi.fn(),
    ...overrides
  }
}

const confirm = vi.fn(async () => true)

function command(surface: NativeChatBranchSurface | undefined, structured = true) {
  const editor = { setDraft: vi.fn(), setCaret: vi.fn(), setActiveSuggestion: vi.fn() }
  const setNotice = vi.fn()
  const { result } = renderHook(
    () =>
      useNativeChatBranchCommand({
        structured,
        picker: {
          autocomplete: { mode: 'slash', dispatchable: true },
          isPickedSkill: () => false,
          clearSkillOrigin: vi.fn()
        },
        editor,
        setNotice
      }),
    {
      wrapper: ({ children }) => (
        <ConfirmationDialogContext.Provider value={confirm}>
          <NativeChatBranchContext.Provider value={surface}>
            {children}
          </NativeChatBranchContext.Provider>
        </ConfirmationDialogContext.Provider>
      )
    }
  )
  return { command: result.current, editor, setNotice }
}

describe("Aster's copy commands", () => {
  it('lists /branch, /fork, /subtask and /rewind in one line each, in place of agent commands', () => {
    const catalog = withNativeChatBranchCommand([
      { name: 'model' },
      { name: 'fork', description: 'Fork the current chat' },
      { name: 'rewind', description: "Claude's own rewind" }
    ])
    expect(catalog.map(({ name }) => name)).toEqual([
      'model',
      'branch',
      'fork',
      'subtask',
      'rewind'
    ])
    expect(catalog.slice(1).map(({ description }) => description)).toEqual([
      'Copy this chat and switch to the copy',
      'Copy this chat to work in the background',
      'Side task on a hidden copy; the result comes back',
      'Go back to your last message in this chat'
    ])
    expect(catalog.slice(1).every((row) => row.orcaOwned)).toBe(true)
  })

  it('reads only a leading command, with what follows it', () => {
    expect(parseNativeChatCopyDraft('/fork  try the  larger model')).toEqual({
      command: 'fork',
      argument: 'try the larger model'
    })
    expect(parseNativeChatCopyDraft('/BRANCH')).toEqual({ command: 'branch', argument: '' })
    expect(parseNativeChatCopyDraft(' /fork')).toBeNull()
    expect(parseNativeChatCopyDraft('/forklift')).toBeNull()
  })

  it('runs each here, never sending it to the agent', () => {
    const surface = branch()
    const { command: copy, editor } = command(surface)
    expect(copy.consume('/branch Bigger model')).toBe(true)
    expect(copy.consume('/fork')).toBe(true)
    expect(copy.consume('/fork try again')).toBe(true)
    expect(copy.consume('/subtask check the table')).toBe(true)
    expect(copy.consume('/rewind')).toBe(true)
    expect(surface.branchChat).toHaveBeenCalledWith('Bigger model')
    expect(surface.forkChat).toHaveBeenNthCalledWith(1, undefined)
    expect(surface.forkChat).toHaveBeenNthCalledWith(2, 'try again')
    expect(surface.subtask).toHaveBeenCalledWith('check the table')
    expect(surface.rewindLatest).toHaveBeenCalledWith(confirm)
    expect(editor.setDraft).toHaveBeenLastCalledWith('')
    expect(copy.consume('hello')).toBe(false)
  })

  it('asks /subtask for its task, keeping the command to type after', () => {
    const surface = branch()
    const { command: copy, editor, setNotice } = command(surface)
    expect(copy.consume('/subtask')).toBe(true)
    expect(surface.subtask).not.toHaveBeenCalled()
    expect(editor.setDraft).toHaveBeenCalledWith('/subtask ')
    expect(setNotice).toHaveBeenCalledWith('Say what the subtask should do: /subtask <task>')
  })

  it('says why when the chat cannot be copied or go back', () => {
    const blocked = branch({
      disabledReason: 'Wait for the agent to finish, then branch.',
      rewindLatest: null
    })
    const { command: copy, setNotice } = command(blocked)
    copy.consume('/fork')
    expect(blocked.forkChat).not.toHaveBeenCalled()
    expect(setNotice).toHaveBeenCalledWith('Wait for the agent to finish, then branch.')
    copy.consume('/rewind')
    expect(setNotice).toHaveBeenLastCalledWith("This chat can't go back.")
    expect(command(undefined).command.consume('/branch')).toBe(true)
  })

  it('leaves the commands to a chat in a terminal', () => {
    const surface = branch()
    expect(command(surface, false).command.consume('/fork')).toBe(false)
    expect(surface.forkChat).not.toHaveBeenCalled()
  })
})
