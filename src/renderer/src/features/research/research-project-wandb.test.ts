import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDiskBaselineSignature } from '../../../../shared/disk-baseline-signature'

const mocks = vi.hoisted(() => ({
  readRuntimeFileContent: vi.fn(),
  writeRuntimeFile: vi.fn()
}))

vi.mock('@/runtime/runtime-file-read-client', () => ({
  readRuntimeFileContent: mocks.readRuntimeFileContent
}))
vi.mock('@/runtime/runtime-file-mutation-client', () => ({
  writeRuntimeFile: mocks.writeRuntimeFile
}))

import {
  loadProjectWandbSettings,
  readProjectWandbCatalog,
  saveProjectWandbSettings
} from './research-project-wandb'

const local = { hostId: 'local', workspaceId: 'repo::/data/paper', workspacePath: '/data/paper' }
const catalogText = `${JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex' } }, null, 2)}\n`
const settings = { enabled: true, entity: 'PoV_JEPA', project: 'reusable-jepa', python: null }

afterEach(() => {
  mocks.readRuntimeFileContent.mockReset()
  mocks.writeRuntimeFile.mockReset()
})

describe('saveProjectWandbSettings', () => {
  it('writes the wandb section into .aster/project.json only if it is unchanged', async () => {
    mocks.readRuntimeFileContent.mockResolvedValue({ content: catalogText, isBinary: false })
    mocks.writeRuntimeFile.mockResolvedValue({ ok: true })

    await saveProjectWandbSettings(local, settings)

    expect(mocks.readRuntimeFileContent).toHaveBeenCalledWith({
      target: { kind: 'local' },
      filePath: '/data/paper/.aster/project.json',
      relativePath: '.aster/project.json',
      worktreeId: local.workspaceId,
      connectionId: undefined,
      access: { kind: 'research-workspace', workspacePath: '/data/paper' }
    })
    const [context, path, text, access, precondition] = mocks.writeRuntimeFile.mock.calls[0]
    expect(context).toEqual({
      target: { kind: 'local' },
      worktreeId: local.workspaceId,
      worktreePath: '/data/paper'
    })
    expect(path).toBe('/data/paper/.aster/project.json')
    expect(JSON.parse(text)).toEqual({
      schemaVersion: 2,
      manuscript: { source: 'paper/main.tex' },
      wandb: { enabled: true, entity: 'PoV_JEPA', project: 'reusable-jepa' }
    })
    expect(access).toEqual({ kind: 'research-workspace', workspacePath: '/data/paper' })
    expect(precondition).toEqual({ expectedSignature: getDiskBaselineSignature(catalogText) })
  })

  it('reaches SSH and server-hosted projects through their own transport', async () => {
    mocks.readRuntimeFileContent.mockResolvedValue({ content: catalogText, isBinary: false })
    mocks.writeRuntimeFile.mockResolvedValue({ ok: true })

    await saveProjectWandbSettings({ ...local, hostId: 'ssh:vip' }, settings)
    expect(mocks.writeRuntimeFile.mock.calls[0][0]).toMatchObject({
      target: { kind: 'local' },
      connectionId: 'vip'
    })

    await saveProjectWandbSettings({ ...local, hostId: 'runtime:gpu-server' }, settings)
    expect(mocks.writeRuntimeFile.mock.calls[1][0]).toEqual({
      target: { kind: 'environment', environmentId: 'gpu-server' },
      worktreeId: local.workspaceId,
      worktreePath: '/data/paper'
    })
  })

  it('refuses to overwrite a catalog that changed while saving', async () => {
    mocks.readRuntimeFileContent.mockResolvedValue({ content: catalogText, isBinary: false })
    mocks.writeRuntimeFile.mockResolvedValue({ ok: false, diskConflict: { kind: 'changed' } })
    await expect(saveProjectWandbSettings(local, settings)).rejects.toThrow(/changed while saving/)
  })

  it('refreshes the cached setting after a save', async () => {
    const owner = { ...local, workspaceId: 'cache-test' }
    mocks.readRuntimeFileContent.mockResolvedValue({ content: catalogText, isBinary: false })
    mocks.writeRuntimeFile.mockResolvedValue({ ok: true })
    expect(await loadProjectWandbSettings(owner)).toBeNull()
    const saved = `${JSON.stringify({ schemaVersion: 2, wandb: settings })}\n`
    mocks.readRuntimeFileContent.mockResolvedValue({ content: saved, isBinary: false })
    expect(await loadProjectWandbSettings(owner)).toBeNull()
    await saveProjectWandbSettings(owner, settings)
    expect(await loadProjectWandbSettings(owner)).toEqual(settings)
  })
})

describe('readProjectWandbCatalog', () => {
  it('falls back to a pre-ADR-004 research/project.json', async () => {
    mocks.readRuntimeFileContent
      .mockRejectedValueOnce(new Error('ENOENT: no such file or directory'))
      .mockResolvedValueOnce({
        content: JSON.stringify({ schemaVersion: 1, wandb: { enabled: false } }),
        isBinary: false
      })
    const catalog = await readProjectWandbCatalog(local)
    expect(catalog).toMatchObject({
      status: 'present',
      path: '/data/paper/research/project.json',
      settings: { enabled: false }
    })
  })

  it('reports a project without a catalog, and a host that cannot be read', async () => {
    mocks.readRuntimeFileContent.mockRejectedValue(new Error('ENOENT: no such file or directory'))
    expect(await readProjectWandbCatalog(local)).toEqual({
      status: 'missing',
      reason: 'This project has no .aster/project.json yet. Set up its research folders first.'
    })
    mocks.readRuntimeFileContent.mockRejectedValue(new Error('Connection lost'))
    expect(await readProjectWandbCatalog(local)).toEqual({
      status: 'missing',
      reason: 'Could not read .aster/project.json: Connection lost'
    })
  })
})
