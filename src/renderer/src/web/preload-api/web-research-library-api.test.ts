import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emptyResearchLibraryDocument,
  libraryScopeKey,
  type ResearchLibraryDocument
} from '../../../../shared/research/research-library'

const mocks = vi.hoisted(() => ({ callRuntimeResult: vi.fn() }))

vi.mock('./web-runtime-calls', () => ({ callRuntimeResult: mocks.callRuntimeResult }))
vi.mock('./web-runtime-session', () => ({ requireActiveEnvironment: () => ({ id: 'phone-env' }) }))

import { createWebResearchLibraryApi } from './web-research-library-api'

const PHONE_HOST = 'runtime:phone-env'

function libraryWith(hostId: string): ResearchLibraryDocument {
  return {
    ...emptyResearchLibraryDocument(),
    revision: 3,
    papers: [
      {
        id: '0f6d2c1e-3f3b-4a1e-9f55-1d2e3c4b5a69',
        scope: { hostId, workspaceId: 'wt-1', workspacePath: '/srv/proj' },
        title: 'Attention Is All You Need',
        arxivId: '1706.03762',
        tags: [],
        status: 'unread',
        createdAt: '2026-11-19T00:00:00.000Z',
        updatedAt: '2026-11-19T00:00:00.000Z'
      }
    ],
    readingAgentSessionByScope: { [libraryScopeKey({ hostId, workspaceId: 'wt-1' })]: 's-1' }
  }
}

beforeEach(() => mocks.callRuntimeResult.mockReset())

describe('web Library through the paired host', () => {
  it('shows the host’s own papers under this client’s name for that host', async () => {
    mocks.callRuntimeResult.mockResolvedValue(libraryWith('local'))
    const document = await createWebResearchLibraryApi().read()
    expect(document).toEqual(libraryWith(PHONE_HOST))
    expect(mocks.callRuntimeResult).toHaveBeenCalledWith('researchLibrary.read')
  })

  it('saves them back under the host’s own name', async () => {
    mocks.callRuntimeResult.mockImplementation(async (_method: string, sent: unknown) => sent)
    const saved = await createWebResearchLibraryApi().save(libraryWith(PHONE_HOST))
    expect(mocks.callRuntimeResult).toHaveBeenCalledWith(
      'researchLibrary.save',
      libraryWith('local')
    )
    expect(saved).toEqual(libraryWith(PHONE_HOST))
  })

  it('leaves papers of other hosts alone', async () => {
    mocks.callRuntimeResult.mockResolvedValue(libraryWith('ssh:elsewhere'))
    await expect(createWebResearchLibraryApi().read()).resolves.toEqual(
      libraryWith('ssh:elsewhere')
    )
  })
})
