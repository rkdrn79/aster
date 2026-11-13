// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NativeChatBranchContext, type NativeChatBranchSurface } from './native-chat-branch-context'
import {
  isNativeChatBranchDraft,
  useNativeChatBranchCommand,
  withNativeChatBranchCommand
} from './use-native-chat-branch-command'

function branch(disabledReason: string | null = null): NativeChatBranchSurface {
  return {
    disabledReason,
    earlierDisabledReason: null,
    openerIds: new Set(),
    isLatest: () => true,
    branchFrom: vi.fn(),
    editAndBranch: vi.fn(),
    branchChat: vi.fn()
  }
}

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
        <NativeChatBranchContext.Provider value={surface}>
          {children}
        </NativeChatBranchContext.Provider>
      )
    }
  )
  return { command: result.current, editor, setNotice }
}

describe('/fork', () => {
  it("is Aster's own command, in place of an agent's /fork", () => {
    const catalog = withNativeChatBranchCommand([
      { name: 'model' },
      { name: 'fork', description: 'Fork the current chat' },
      { name: 'goal' }
    ])
    expect(catalog.map(({ name }) => name)).toEqual(['model', 'fork', 'goal'])
    expect(catalog[1]).toEqual({
      name: 'fork',
      description: 'Branch this chat into a new one',
      orcaOwned: true
    })
    expect(withNativeChatBranchCommand([]).map(({ name }) => name)).toEqual(['fork'])
  })

  it('reads only a leading /fork as the command', () => {
    expect(isNativeChatBranchDraft('/fork')).toBe(true)
    expect(isNativeChatBranchDraft('/FORK now')).toBe(true)
    expect(isNativeChatBranchDraft(' /fork')).toBe(false)
    expect(isNativeChatBranchDraft('/forklift')).toBe(false)
  })

  it('branches the chat and clears the draft, without reaching the agent', () => {
    const surface = branch()
    const { command: fork, editor, setNotice } = command(surface)
    expect(fork.consume('/fork')).toBe(true)
    expect(surface.branchChat).toHaveBeenCalledTimes(1)
    expect(editor.setDraft).toHaveBeenCalledWith('')
    expect(setNotice).toHaveBeenCalledWith(null)
    expect(fork.consume('hello')).toBe(false)
  })

  it('says why when the chat cannot branch', () => {
    const surface = branch('Wait for the agent to finish, then branch.')
    const { command: fork, setNotice } = command(surface)
    expect(fork.consume('/fork')).toBe(true)
    expect(surface.branchChat).not.toHaveBeenCalled()
    expect(setNotice).toHaveBeenCalledWith('Wait for the agent to finish, then branch.')
    expect(command(undefined).command.consume('/fork')).toBe(true)
  })

  it('leaves /fork to a chat in a terminal', () => {
    const surface = branch()
    expect(command(surface, false).command.consume('/fork')).toBe(false)
    expect(surface.branchChat).not.toHaveBeenCalled()
  })
})
