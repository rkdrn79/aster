// @vitest-environment happy-dom
import type { ComponentProps } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SessionActionMenuItems } from './AiVaultSessionActionMenuItems'

afterEach(cleanup)

const HAND_OFF = 'Hand off to another agent'
const SEPARATOR = '---'

function renderMenuOrder(
  props: Partial<ComponentProps<typeof SessionActionMenuItems>> = {}
): string[] {
  render(
    <TooltipProvider>
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <SessionActionMenuItems
            resumeDisabled={false}
            resumeLabel="Resume in new tab"
            onResume={vi.fn()}
            showJumpToWorktree={false}
            onContinueInNewSession={vi.fn()}
            onCopyId={vi.fn()}
            deleteBlockedReason={null}
            {...props}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  )
  return Array.from(document.querySelectorAll('[role="menuitem"], [role="separator"]')).map(
    (node) => (node.getAttribute('role') === 'separator' ? SEPARATOR : (node.textContent ?? ''))
  )
}

describe('SessionActionMenuItems hand-off placement', () => {
  it('places Hand Off after Copy resume command, behind a separator', () => {
    const order = renderMenuOrder({ onCopyResume: vi.fn() })
    const handOff = order.indexOf(HAND_OFF)

    expect(order.slice(0, handOff + 1)).toEqual([
      'Resume in new tab',
      'Copy resume command',
      SEPARATOR,
      HAND_OFF
    ])
  })

  it('omits the separator when nothing renders above Hand Off', () => {
    const order = renderMenuOrder({ resumeHidden: true })

    expect(order[0]).toBe(HAND_OFF)
  })
})

describe('SessionActionMenuItems jump label', () => {
  it.each([
    ['folder:folder-1', 'Jump to folder'],
    ['repo-1::/repo/orca', 'Jump to worktree']
  ])('names the jump by the workspace kind of %s', (jumpWorkspaceId, label) => {
    const order = renderMenuOrder({
      showJumpToWorktree: true,
      jumpWorkspaceId,
      onJumpToWorktree: vi.fn()
    })
    expect(order[0]).toBe(label)
  })
})
