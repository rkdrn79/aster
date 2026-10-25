// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { readRuntimeDirectory } from '../../runtime/runtime-file-mutation-client'
import { ResearchWritingFileExplorer } from './ResearchWritingFileExplorer'

const owner = vi.hoisted(() => ({
  ready: false,
  listeners: new Set<() => void>()
}))

vi.mock('../../store', () => ({
  useAppStore: {
    subscribe: (listener: () => void) => {
      owner.listeners.add(listener)
      return () => owner.listeners.delete(listener)
    }
  }
}))
vi.mock('../../components/right-sidebar/file-explorer-operation-owner', () => ({
  getFileExplorerOperationOwner: () => (owner.ready ? { kind: 'local' } : { kind: 'unresolved' }),
  getFileExplorerOperationRoute: () =>
    owner.ready ? { target: { kind: 'local' }, expectedExecutionHostId: 'local' } : null
}))
vi.mock('../../runtime/runtime-file-mutation-client', () => ({ readRuntimeDirectory: vi.fn() }))
vi.mock('../../components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    'aria-label': ariaLabel
  }: {
    children?: ReactNode
    onClick?: () => void
    disabled?: boolean
    'aria-label'?: string
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  )
}))

const experiment: ExperimentRecord = {
  id: '30e4fbca-a039-4137-8526-f065d27bbb64',
  name: 'Paper',
  projectId: null,
  workspaceId: 'folder:paper',
  workspacePath: '/research',
  hostId: 'local',
  archived: false,
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z'
}

afterEach(() => {
  cleanup()
  owner.ready = false
  owner.listeners.clear()
  vi.clearAllMocks()
})

it('retries errored root and selected nested folder once when workspace owner becomes ready', async () => {
  vi.mocked(readRuntimeDirectory).mockImplementation(async (_context, path) =>
    path === '/research/paper'
      ? [{ name: 'sections', isDirectory: true, isSymlink: false }]
      : [{ name: 'intro.tex', isDirectory: false, isSymlink: false }]
  )
  render(
    <ResearchWritingFileExplorer
      experiment={experiment}
      mainSourcePath="paper/main.tex"
      activeSourcePath="paper/sections/intro.tex"
      onSelectFile={vi.fn()}
    />
  )
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('host is unavailable')
  )
  expect(readRuntimeDirectory).not.toHaveBeenCalled()

  act(() => {
    owner.ready = true
    for (const listener of owner.listeners) {
      listener()
    }
  })
  await waitFor(() => expect(screen.getByRole('button', { name: 'intro.tex' })).toBeTruthy())
  expect(screen.getByRole('button', { name: 'intro.tex' }).getAttribute('aria-current')).toBe(
    'page'
  )
  expect(readRuntimeDirectory).toHaveBeenCalledTimes(2)

  act(() => {
    for (const listener of owner.listeners) {
      listener()
    }
  })
  expect(readRuntimeDirectory).toHaveBeenCalledTimes(2)
})
