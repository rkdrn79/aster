// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ResearchHomeWorkspace } from './research-home-projects'
import { buildProjectSwitcherRows } from './research-project-switcher'

vi.mock('@/lib/shortcut-platform', () => ({ getShortcutPlatform: () => 'darwin' }))

import { ResearchProjectSwitcherList } from './ResearchProjectSwitcherList'

function workspace(
  id: string,
  executionHostId?: ResearchHomeWorkspace['executionHostId']
): ResearchHomeWorkspace {
  return {
    id,
    executionHostId,
    name: id,
    path: `/work/${id}`,
    branch: 'main',
    isMain: true,
    isFolder: false,
    repoId: id,
    lastVisitedAt: 0
  }
}

const ROWS = buildProjectSwitcherRows(
  [
    { key: 'open', name: 'Open now', badgeColor: null, workspaces: [workspace('wo')] },
    { key: 'sparse', name: 'SparseDiff', badgeColor: null, workspaces: [workspace('ws', 'ssh:g')] },
    { key: 'diffusion', name: 'Diffusion Policy', badgeColor: null, workspaces: [workspace('wd')] },
    { key: 'llm', name: 'LLM reasoning', badgeColor: null, workspaces: [workspace('wl')] }
  ],
  'open',
  (entry) => (entry.executionHostId ? { label: 'gpu-box', status: 'Disconnected' } : null)
)

function setup(canOpenWindows = true, showHome = true) {
  const handlers = { onSwitch: vi.fn(), onOpenInNewWindow: vi.fn(), onHome: vi.fn() }
  render(
    <ResearchProjectSwitcherList
      rows={ROWS}
      canOpenWindows={canOpenWindows}
      showHome={showHome}
      {...handlers}
    />
  )
  const input = screen.getByRole('combobox', { name: 'Switch project' })
  input.focus()
  const highlighted = () =>
    document.querySelector('[cmdk-item][data-selected="true"]')?.textContent ?? null
  const press = (key: string, init: KeyboardEventInit = {}) =>
    fireEvent.keyDown(input, { key, ...init })
  return { ...handlers, input, highlighted, press }
}

beforeAll(() => {
  // Why: happy-dom has no layout; cmdk scrolls the highlighted row into view.
  Element.prototype.scrollIntoView ??= () => undefined
})

afterEach(() => cleanup())

describe('ResearchProjectSwitcherList', () => {
  it('lists the other projects, most recent first, with a quiet remote host label', async () => {
    setup()
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'SparseDiffgpu-box · Disconnected',
      'Diffusion Policy',
      'LLM reasoning',
      'All projects',
      'Open SparseDiff in New Window⌘↩'
    ])
    expect(screen.queryByText('Open now')).toBeNull()
  })

  it('starts on the previous project, so Enter goes back to it', async () => {
    const { highlighted, press, onSwitch } = setup()
    await screen.findAllByRole('option')
    expect(highlighted()).toContain('SparseDiff')
    press('Enter')
    expect(onSwitch).toHaveBeenCalledWith(expect.objectContaining({ key: 'sparse' }))
  })

  it('moves with the arrow keys and switches to the highlighted project', async () => {
    const { highlighted, press, onSwitch } = setup()
    await screen.findAllByRole('option')
    press('ArrowDown')
    press('ArrowDown')
    expect(highlighted()).toBe('LLM reasoning')
    press('ArrowUp')
    expect(highlighted()).toBe('Diffusion Policy')
    press('Enter')
    expect(onSwitch).toHaveBeenCalledWith(expect.objectContaining({ key: 'diffusion' }))
  })

  it('filters as the user types and highlights the best match', async () => {
    const { input, highlighted, press, onSwitch } = setup()
    fireEvent.change(input, { target: { value: 'llm' } })
    await vi.waitFor(() =>
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        'LLM reasoning',
        'All projects',
        'Open LLM reasoning in New Window⌘↩'
      ])
    )
    await vi.waitFor(() => expect(highlighted()).toBe('LLM reasoning'))
    press('Enter')
    expect(onSwitch).toHaveBeenCalledWith(expect.objectContaining({ key: 'llm' }))
  })

  it('says so when nothing matches, and keeps the way Home', async () => {
    const { input, press, onHome } = setup()
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(await screen.findByText('No other project matches “zzz”.')).toBeTruthy()
    expect(screen.queryByText(/in New Window/)).toBeNull()
    press('Enter')
    expect(onHome).toHaveBeenCalled()
  })

  it('opens the highlighted project in a new window with Cmd+Enter', async () => {
    const { press, onOpenInNewWindow, onSwitch } = setup()
    await screen.findAllByRole('option')
    press('ArrowDown')
    press('Enter', { metaKey: true })
    expect(onOpenInNewWindow).toHaveBeenCalledWith(expect.objectContaining({ key: 'diffusion' }))
    expect(onSwitch).not.toHaveBeenCalled()
  })

  it('keeps naming the last highlighted project when the footer is highlighted', async () => {
    const { highlighted, press, onOpenInNewWindow } = setup()
    await screen.findAllByRole('option')
    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown')
    expect(highlighted()).toContain('Open LLM reasoning in New Window')
    press('Enter')
    expect(onOpenInNewWindow).toHaveBeenCalledWith(expect.objectContaining({ key: 'llm' }))
  })

  it('has no window item where windows cannot open', async () => {
    const { press, onOpenInNewWindow } = setup(false)
    await screen.findAllByRole('option')
    expect(screen.queryByText(/in New Window/)).toBeNull()
    press('Enter', { metaKey: true })
    expect(onOpenInNewWindow).not.toHaveBeenCalled()
  })

  it('leaves out All projects on Home, where it would go nowhere', async () => {
    setup(true, false)
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).not.toContain('All projects')
  })
})
