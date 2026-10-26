// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { ResearchHomeProject } from './research-home-projects'

const mocks = vi.hoisted(() => ({
  repos: new Array<Repo>(),
  openModal: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign((select: (state: typeof mocks) => unknown) => select(mocks), {
    getState: () => mocks
  })
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    onSelect
  }: {
    children: React.ReactNode
    onSelect?: () => void
  }) => <button onClick={onSelect}>{children}</button>,
  DropdownMenuRadioItem: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  DropdownMenuRadioGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>
}))

vi.mock('./research-navigation', () => ({ enterResearchWorkspace: vi.fn() }))

import { ResearchProjectMenuItems } from './research-home-project-actions'

function project(groupId: string | null, hostId: 'local' | 'runtime:vip'): ResearchHomeProject {
  return {
    key: groupId ? `group:${groupId}` : 'repo:shared',
    name: 'StreamingVideo',
    badgeColor: null,
    projectGroupId: groupId,
    workspaces: [
      {
        id: groupId ? 'folder:workspace-1' : 'shared::/data/StreamingVideo',
        executionHostId: hostId,
        name: 'main',
        path: '/data/StreamingVideo',
        branch: groupId ? null : 'main',
        isMain: true,
        isFolder: groupId !== null,
        repoId: groupId ? `folder-workspace:${groupId}` : 'shared',
        lastVisitedAt: 0
      }
    ],
    lastVisitedAt: 0
  }
}

function repo(hostId: 'local' | 'runtime:vip'): Repo {
  return {
    id: 'shared',
    path: '/data/StreamingVideo',
    displayName: 'StreamingVideo',
    badgeColor: '',
    addedAt: 0,
    kind: 'git',
    connectionId: null,
    executionHostId: hostId
  }
}

afterEach(() => {
  cleanup()
  mocks.repos = []
  mocks.openModal.mockReset()
})

it('shows folder-project removal even though no Git repo row exists', () => {
  const removeFolderProject = vi.fn()
  render(
    <ResearchProjectMenuItems
      project={project('group-1', 'runtime:vip')}
      onRename={vi.fn()}
      onSlack={vi.fn()}
      onRemoveFolderProject={removeFolderProject}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: /Remove from Aster/ }))
  expect(removeFolderProject).toHaveBeenCalledOnce()
  expect(mocks.openModal).not.toHaveBeenCalled()
})

it('targets the owning host when identical repo ids exist locally and remotely', () => {
  mocks.repos = [repo('local'), repo('runtime:vip')]
  render(
    <ResearchProjectMenuItems
      project={project(null, 'runtime:vip')}
      onRename={vi.fn()}
      onSlack={vi.fn()}
      onRemoveFolderProject={vi.fn()}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: /Remove from Aster/ }))
  expect(mocks.openModal).toHaveBeenCalledWith('confirm-remove-folder', {
    repoId: 'shared',
    displayName: 'StreamingVideo',
    hostId: 'runtime:vip'
  })
})
