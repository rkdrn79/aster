// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageRow } from './NativeChatMessageRow'
import { NativeChatBranchContext, type NativeChatBranchSurface } from './native-chat-branch-context'
import { readNativeChatContextMenuTarget } from './native-chat-context-menu-target'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'

afterEach(cleanup)

function surface(overrides: Partial<NativeChatBranchSurface> = {}): NativeChatBranchSurface {
  return {
    disabledReason: null,
    earlierDisabledReason: null,
    openerIds: new Set(['user-1']),
    isLatest: () => true,
    branchFrom: vi.fn(),
    editAndBranch: vi.fn(),
    branchChat: vi.fn(),
    ...overrides
  }
}

function row(role: NativeChatMessage['role'], branch: NativeChatBranchSurface, branchable = true) {
  render(
    <TooltipProvider>
      <NativeChatBranchContext.Provider value={branch}>
        <MessageRow
          message={{
            id: role === 'user' ? 'user-1' : 'reply-1',
            role,
            timestamp: 1,
            source: 'transcript',
            blocks: [{ type: 'text', text: 'Words' }]
          }}
          expandSignal={false}
          onScrollMessageToTop={vi.fn()}
          {...(branchable ? { branchable: true as const } : {})}
        />
      </NativeChatBranchContext.Provider>
    </TooltipProvider>
  )
}

describe('Branch on a message', () => {
  it("branches from the agent's reply in one click, next to its other hover actions", () => {
    const branch = surface()
    row('assistant', branch)
    const button = screen.getByRole('button', { name: 'Branch from here' })
    expect(button).toHaveAttribute(
      'aria-description',
      'New chat with everything up to this reply. This chat stays as it is.'
    )
    fireEvent.click(button)
    expect(branch.branchFrom).toHaveBeenCalledWith('reply-1')
    const target = readNativeChatContextMenuTarget(button, {
      root: null,
      composer: null,
      messageList: null,
      linkContext: null
    })
    expect(target.branchItem).toEqual({ id: 'reply-1', kind: 'agent' })
  })

  it("offers Edit and branch and Branch from here on the person's own message", async () => {
    const branch = surface()
    row('user', branch)
    const trigger = screen.getByRole('button', { name: 'Branch' })
    act(() => {
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    })
    fireEvent.click(await screen.findByText('Edit and branch'))
    expect(branch.editAndBranch).toHaveBeenCalledWith('user-1')
    act(() => {
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    })
    fireEvent.click(await screen.findByText('Branch from here'))
    expect(branch.branchFrom).toHaveBeenCalledWith('user-1')
  })

  it('shows the action disabled with its one-line reason, and runs nothing', async () => {
    const branch = surface({ disabledReason: "Gemini chats can't branch yet." })
    row('user', branch)
    const button = screen.getByRole('button', { name: 'Branch from here' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    act(() => button.focus())
    expect(await screen.findByRole('tooltip')).toHaveTextContent("Gemini chats can't branch yet.")
    fireEvent.click(button)
    expect(branch.branchFrom).not.toHaveBeenCalled()
  })

  it('blocks an earlier reply for an agent that branches only from the latest', () => {
    const branch = surface({
      earlierDisabledReason: 'OpenCode chats can branch only from the latest message.',
      isLatest: () => false
    })
    row('assistant', branch)
    expect(screen.getByRole('button', { name: 'Branch from here' })).toHaveAttribute(
      'aria-description',
      'OpenCode chats can branch only from the latest message.'
    )
  })

  it('draws nothing on a row not offered Branch, or with no branch surface', () => {
    row('assistant', surface(), false)
    expect(screen.queryByRole('button', { name: 'Branch from here' })).toBeNull()
  })
})
