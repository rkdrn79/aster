// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ResearchHomeProject } from './research-home-projects'

const mocks = vi.hoisted(() => ({
  readProjectWandbCatalog: vi.fn(),
  saveProjectWandbSettings: vi.fn()
}))

vi.mock('./research-project-wandb', () => mocks)

import { ResearchWandbProjectDialog } from './ResearchWandbProjectDialog'

const project: ResearchHomeProject = {
  key: 'group:g1',
  name: 'Reusable JEPA',
  badgeColor: null,
  projectGroupId: 'g1',
  workspaces: [
    {
      id: 'folder:w1',
      executionHostId: 'runtime:vip',
      name: 'main',
      path: '/home/u/reusable-jepa',
      branch: null,
      isMain: true,
      isFolder: true,
      repoId: 'folder-workspace:g1',
      lastVisitedAt: 0
    }
  ],
  lastVisitedAt: 0
}
const owner = {
  hostId: 'runtime:vip',
  workspaceId: 'folder:w1',
  workspacePath: '/home/u/reusable-jepa'
}

afterEach(() => {
  cleanup()
  mocks.readProjectWandbCatalog.mockReset()
  mocks.saveProjectWandbSettings.mockReset()
})

it('turns mirroring on with an entity and the suggested project name', async () => {
  mocks.readProjectWandbCatalog.mockResolvedValue({
    status: 'present',
    path: '/home/u/reusable-jepa/.aster/project.json',
    text: '{}',
    settings: null
  })
  mocks.saveProjectWandbSettings.mockResolvedValue(undefined)
  const onOpenChange = vi.fn()
  render(<ResearchWandbProjectDialog project={project} open onOpenChange={onOpenChange} />)

  const projectName = await screen.findByLabelText('W&B project')
  await waitFor(() => expect(projectName).toHaveProperty('value', 'reusable-jepa'))
  expect(mocks.readProjectWandbCatalog).toHaveBeenCalledWith(owner)
  fireEvent.click(screen.getByRole('switch', { name: 'Mirror Run metrics to W&B' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Entity is required.')
  expect(mocks.saveProjectWandbSettings).not.toHaveBeenCalled()

  fireEvent.change(screen.getByLabelText('Entity'), { target: { value: ' PoV_JEPA ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(mocks.saveProjectWandbSettings).toHaveBeenCalledWith(owner, {
    enabled: true,
    entity: 'PoV_JEPA',
    project: 'reusable-jepa',
    python: null
  })
})

it('shows the saved setting and keeps a catalog-only python path', async () => {
  mocks.readProjectWandbCatalog.mockResolvedValue({
    status: 'present',
    path: '/home/u/reusable-jepa/.aster/project.json',
    text: '{}',
    settings: { enabled: true, entity: 'team', project: 'custom', python: '/opt/py/bin/python' }
  })
  mocks.saveProjectWandbSettings.mockResolvedValue(undefined)
  render(<ResearchWandbProjectDialog project={project} open onOpenChange={vi.fn()} />)

  await waitFor(() => expect(screen.getByLabelText('Entity')).toHaveProperty('value', 'team'))
  expect(
    screen.getByRole('switch', { name: 'Mirror Run metrics to W&B' }).getAttribute('aria-checked')
  ).toBe('true')
  fireEvent.click(screen.getByRole('switch', { name: 'Mirror Run metrics to W&B' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(mocks.saveProjectWandbSettings).toHaveBeenCalledWith(owner, {
      enabled: false,
      entity: 'team',
      project: 'custom',
      python: '/opt/py/bin/python'
    })
  )
})

it('explains a project without a catalog and cannot save', async () => {
  mocks.readProjectWandbCatalog.mockResolvedValue({
    status: 'missing',
    reason: 'This project has no .aster/project.json yet. Set up its research folders first.'
  })
  render(<ResearchWandbProjectDialog project={project} open onOpenChange={vi.fn()} />)

  expect(await screen.findByText(/has no .aster\/project.json yet/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)
})
