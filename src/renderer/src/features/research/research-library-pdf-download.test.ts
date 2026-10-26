import { describe, expect, it, vi } from 'vitest'
import type { LibraryScope } from '../../../../shared/research/research-library'
import { canDownloadLibraryPdf, downloadLibraryArxivPdf } from './research-library-pdf-download'

const mocks = vi.hoisted(() => ({ callRuntimeRpc: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mocks.callRuntimeRpc }))

const remoteScope: LibraryScope = {
  hostId: 'runtime:4b50072b-b793-4530-95dd-bbc9696f565d',
  workspaceId: '48f6f30b-b2da-4cfe-89d0-1454f398dea2::/srv/projects/example-paper',
  workspacePath: '/srv/projects/example-paper'
}

describe('Library PDF download routing', () => {
  it('saves a remote project PDF on its owning VIP runtime', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({ relativePath: '.aster/library/papers/2607.13298.pdf' })
    expect(canDownloadLibraryPdf(remoteScope)).toBe(true)
    await expect(downloadLibraryArxivPdf(remoteScope, '2607.13298')).resolves.toEqual({
      relativePath: '.aster/library/papers/2607.13298.pdf'
    })
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: '4b50072b-b793-4530-95dd-bbc9696f565d' },
      'researchProject.downloadArxivPdf',
      {
        worktree: 'id:48f6f30b-b2da-4cfe-89d0-1454f398dea2::/srv/projects/example-paper',
        reference: '2607.13298'
      },
      { timeoutMs: 120_000 }
    )
  })
})
