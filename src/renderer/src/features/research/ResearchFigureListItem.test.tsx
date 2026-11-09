// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('./research-figure-history', () => ({
  snapshotFigure: vi.fn(async () => ({ id: 'before-1' }))
}))
vi.mock('./research-figure-editor-handle', () => ({
  useFigureEditorHandle: { getState: () => ({ handle: null }) }
}))
vi.mock('./research-figure-file-actions', () => ({ figureScriptExists: vi.fn(async () => false) }))
vi.mock('@/lib/reveal-in-file-manager', () => ({ getRevealInFileManagerLabel: () => 'Reveal' }))
vi.mock('@/components/ui/dropdown-menu', async () => {
  const { createElement, Fragment } = await import('react')
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    createElement(Fragment, null, children)
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({
      children,
      disabled,
      onSelect
    }: {
      children?: React.ReactNode
      disabled?: boolean
      onSelect?: (event: Event) => void
    }) =>
      createElement(
        'button',
        { role: 'menuitem', disabled, onClick: () => onSelect?.(new Event('select')) },
        children
      )
  }
})

import { ResearchFigureListItem } from './ResearchFigureListItem'
import {
  FIGURE_MOVE_BLOCKED_LABEL,
  FIGURE_RENAME_BLOCKED_LABEL
} from './research-figure-rename-guard'
import { beginFigureTurn, updateFigureTurn, useFigureTurn } from './research-figure-turn'

const owner = { hostId: 'local', workspaceId: 'w1', workspacePath: '/p' }
type FigurePaperState = React.ComponentProps<typeof ResearchFigureListItem>['paperState']

function renderItem(onAction = vi.fn(), paperState: FigurePaperState = 'none') {
  render(
    <ResearchFigureListItem
      owner={owner}
      folder="paper/figures"
      slug="overview"
      meta={null}
      active={false}
      usages={[]}
      exportState="fresh"
      paperState={paperState}
      updatingPaper={false}
      onSelect={() => undefined}
      onAction={onAction}
      onUpdatePaper={() => undefined}
    />
  )
  return onAction
}

function menuItem(pattern: RegExp): HTMLElement {
  const item = screen
    .getAllByRole('menuitem')
    .find((entry) => pattern.test(entry.textContent ?? ''))
  if (!item) {
    throw new Error(`The figure menu has no item matching ${pattern}`)
  }
  return item
}

function renameItem(): HTMLElement {
  const item = screen
    .getAllByRole('menuitem')
    .find((entry) => /rename/i.test(entry.textContent ?? ''))
  if (!item) {
    throw new Error('The figure menu has no Rename item')
  }
  return item
}

beforeEach(() => {
  useFigureTurn.setState({ figures: {}, workingSessions: {} })
})
afterEach(cleanup)

it('offers Rename when the agent is not working', () => {
  const onAction = renderItem()
  expect(renameItem().hasAttribute('disabled')).toBe(false)
  expect(renameItem().textContent).toContain('Rename…')
  fireEvent.click(renameItem())
  expect(onAction).toHaveBeenCalledWith('rename')
})

it('disables Rename with a plain reason while the figure’s agent works, then gives it back', () => {
  const id = beginFigureTurn({
    target: { owner, folder: 'paper/figures', slug: 'overview' },
    request: 'Draw',
    prompt: 'Draw',
    scope: { hostId: 'local', workspaceId: 'w1' },
    beforeText: null,
    sessionId: 'chat-a'
  })
  const onAction = renderItem()
  expect(renameItem().hasAttribute('disabled')).toBe(true)
  expect(renameItem().textContent).toContain(FIGURE_RENAME_BLOCKED_LABEL)
  fireEvent.click(renameItem())
  expect(onAction).not.toHaveBeenCalled()
  act(() => updateFigureTurn(id, { phase: 'done' }))
  expect(renameItem().hasAttribute('disabled')).toBe(false)
  expect(renameItem().textContent).toContain('Rename…')
})

it('holds an older figure in its folder while its agent works, then offers the move again', () => {
  const id = beginFigureTurn({
    target: { owner, folder: 'paper/figures', slug: 'overview' },
    request: 'Draw',
    prompt: 'Draw',
    scope: { hostId: 'local', workspaceId: 'w1' },
    beforeText: null,
    sessionId: 'chat-a'
  })
  const onAction = renderItem(vi.fn(), 'beside')
  const moveItem = (): HTMLElement => menuItem(/move/i)
  expect(moveItem().hasAttribute('disabled')).toBe(true)
  expect(moveItem().textContent).toContain(FIGURE_MOVE_BLOCKED_LABEL)
  fireEvent.click(moveItem())
  expect(onAction).not.toHaveBeenCalled()
  act(() => updateFigureTurn(id, { phase: 'done' }))
  expect(moveItem().hasAttribute('disabled')).toBe(false)
  expect(moveItem().textContent).toContain("Move to Aster's figures folder")
  fireEvent.click(moveItem())
  expect(onAction).toHaveBeenCalledWith('adopt')
})
