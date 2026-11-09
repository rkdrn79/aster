// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NewTabAgentMenuModel } from '@/components/tab-bar/use-new-tab-agent-menu-rows'

const model: { current: NewTabAgentMenuModel | null } = vi.hoisted(() => ({ current: null }))
const launchAgentInNewTab = vi.hoisted(() => vi.fn())

vi.mock('@/components/tab-bar/use-new-tab-agent-menu-rows', () => ({
  useNewTabAgentMenuRows: () => model.current
}))
vi.mock('@/hooks/useAgentDetectionTarget', () => ({
  useAgentDetectionTargetForWorktree: () => ({ kind: 'local' })
}))
vi.mock('@/hooks/useShortcutLabel', () => ({ useOptionalShortcutLabel: () => null }))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab }))
vi.mock('@/store', () => {
  const state = {
    settings: { defaultTuiAgent: 'claude' },
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn()
  }
  const useAppStore = Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
    getState: () => state
  })
  return { useAppStore }
})
vi.mock('@/lib/agent-catalog', () => ({
  getAgentCatalog: () => [
    { id: 'claude', label: 'Claude Code' },
    { id: 'gemini', label: 'Gemini' },
    { id: 'antigravity', label: 'Antigravity' },
    { id: 'codex', label: 'Codex' }
  ],
  AgentIcon: () => null
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect
  }: {
    children: ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <div role="menuitem" aria-disabled={disabled ? 'true' : 'false'} onClick={onSelect}>
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuShortcut: ({ children }: { children: ReactNode }) => <span>{children}</span>
}))

import { ResearchAgentPickerMenuItems } from './ResearchAgentPicker'

const settled: NewTabAgentMenuModel = {
  state: 'settled',
  rows: [
    { kind: 'chat', agent: 'claude' },
    { kind: 'chat', agent: 'gemini' },
    { kind: 'chat-unavailable', agent: 'antigravity', reason: 'not-installed' },
    { kind: 'cli', agent: 'codex' }
  ],
  detection: {
    detectedIds: ['claude', 'gemini', 'codex'],
    isLoading: false,
    detectionFailed: false,
    isRefreshing: false,
    needsServerUpdate: false,
    refresh: async () => []
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ResearchAgentPickerMenuItems', () => {
  it('lists the chat agents of the workspace, and says why one cannot chat', () => {
    model.current = settled
    render(<ResearchAgentPickerMenuItems workspaceId="wt" onPick={vi.fn()} />)
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(items.some((text) => text?.includes('Claude Code'))).toBe(true)
    expect(items.some((text) => text?.includes('Gemini'))).toBe(true)
    expect(items.some((text) => text?.includes('Codex'))).toBe(false)
    const antigravity = screen.getByText('Antigravity').closest('[role="menuitem"]')
    expect(antigravity?.getAttribute('aria-disabled')).toBe('true')
    expect(antigravity?.textContent).toContain('Not installed')
  })

  it('starts the picked agent through the pane launcher, never a new tab', () => {
    model.current = settled
    const onPick = vi.fn()
    render(<ResearchAgentPickerMenuItems workspaceId="wt" onPick={onPick} />)
    fireEvent.click(screen.getByText('Gemini'))
    fireEvent.click(screen.getByText('Antigravity'))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('gemini')
    expect(launchAgentInNewTab).not.toHaveBeenCalled()
  })
})
