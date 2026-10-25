// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDiskBaselineSignature } from '../../../../shared/disk-baseline-signature'
import type { ExperimentRecord } from '../../../../shared/research/research-records'

const mock = vi.hoisted(() => {
  const openFiles: Record<string, unknown>[] = []
  return { read: vi.fn(), stat: vi.fn(), notify: vi.fn(), openFiles }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ openFiles: mock.openFiles }) } }))
vi.mock('./research-writing-source', () => ({
  readManuscriptSource: mock.read,
  statManuscriptSource: mock.stat
}))
vi.mock('@/components/editor/editor-autosave', () => ({
  notifyEditorExternalFileChange: mock.notify
}))

import { useWritingSourceExternalRefresh } from './useWritingSourceExternalRefresh'

const experiment: ExperimentRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Paper',
  projectId: null,
  workspaceId: 'workspace',
  workspacePath: '/research/project',
  hostId: 'local',
  archived: false,
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z'
}
const file = {
  absolutePath: '/research/project/paper/section.tex',
  relativePath: 'paper/section.tex'
}

function Probe({ visible = true }: { visible?: boolean }): null {
  useWritingSourceExternalRefresh(experiment, file, file.absolutePath, visible)
  return null
}

describe('Writing source external refresh', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    vi.useFakeTimers()
    mock.read.mockReset()
    mock.stat.mockReset()
    mock.notify.mockReset()
    mock.openFiles.splice(0, mock.openFiles.length, {
      id: file.absolutePath,
      filePath: file.absolutePath,
      worktreeId: experiment.workspaceId,
      runtimeEnvironmentId: null,
      isDirty: false,
      lastKnownDiskSignature: getDiskBaselineSignature('original')
    })
    mock.stat.mockResolvedValue({ size: 8, mtime: 1 })
    mock.read.mockResolvedValue({ text: 'original', size: 8, mtime: 1 })
    container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('recovers a missed agent write through the existing editor event', async () => {
    await act(async () => root.render(createElement(Probe)))
    expect(mock.notify).not.toHaveBeenCalled()

    mock.stat.mockResolvedValue({ size: 7, mtime: 2 })
    mock.read.mockResolvedValue({ text: 'revised', size: 7, mtime: 2 })
    await act(async () => vi.advanceTimersByTimeAsync(3_000))

    expect(mock.notify).toHaveBeenCalledOnce()
    expect(mock.notify).toHaveBeenCalledWith({
      worktreeId: 'workspace',
      worktreePath: '/research/project',
      relativePath: 'paper/section.tex',
      runtimeEnvironmentId: null
    })
    await act(async () => vi.advanceTimersByTimeAsync(3_000))
    expect(mock.notify).toHaveBeenCalledOnce()
  })

  it('does not overwrite a dirty buffer and leaves conflict handling to the editor event', async () => {
    mock.openFiles[0].isDirty = true
    mock.read.mockResolvedValue({ text: 'agent edit', size: 10, mtime: 2 })
    await act(async () => root.render(createElement(Probe)))
    expect(mock.notify).toHaveBeenCalledOnce()
    expect(mock.openFiles[0].isDirty).toBe(true)
    expect(mock.openFiles[0].lastKnownDiskSignature).toBe(getDiskBaselineSignature('original'))
  })

  it('stops checking when its source pane is hidden', async () => {
    await act(async () => root.render(createElement(Probe, { visible: false })))
    await act(async () => vi.advanceTimersByTimeAsync(9_000))
    expect(mock.read).not.toHaveBeenCalled()
    expect(mock.stat).not.toHaveBeenCalled()
  })
})
