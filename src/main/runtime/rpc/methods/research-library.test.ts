import '../unused-default-rpc-methods.test-fixture'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { emptyResearchLibraryDocument } from '../../../../shared/research/research-library'
import { RESEARCH_LIBRARY_METHODS } from './research-library'

const fixture = vi.hoisted(() => ({ directory: '' }))
vi.mock('../../../persistence/loading-store/user-data-path', () => ({
  getCanonicalUserDataPath: () => fixture.directory
}))

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these methods do not use the runtime; the dispatcher only needs its id for the reply envelope.
const runtime = { getRuntimeId: () => 'test-runtime' } as unknown as OrcaRuntimeService

beforeEach(async () => {
  fixture.directory = await mkdtemp(join(tmpdir(), 'aster-library-rpc-'))
})

afterEach(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
})

describe('researchLibrary RPC', () => {
  it('lets a paired client add a paper to the host Library and read it back', async () => {
    const dispatcher = new RpcDispatcher({ runtime, methods: RESEARCH_LIBRARY_METHODS })
    const read = await dispatcher.dispatch({
      id: 'r1',
      authToken: 't',
      method: 'researchLibrary.read'
    })
    expect(read).toMatchObject({ ok: true, result: emptyResearchLibraryDocument() })

    const document = {
      ...emptyResearchLibraryDocument(),
      papers: [
        {
          id: '0f6d2c1e-3f3b-4a1e-9f55-1d2e3c4b5a69',
          scope: { hostId: 'local', workspaceId: 'wt-1', workspacePath: '/srv/proj' },
          title: 'Attention Is All You Need',
          tags: [],
          status: 'unread',
          createdAt: '2026-11-19T00:00:00.000Z',
          updatedAt: '2026-11-19T00:00:00.000Z'
        }
      ]
    }
    const saved = await dispatcher.dispatch({
      id: 's1',
      authToken: 't',
      method: 'researchLibrary.save',
      params: document
    })
    expect(saved).toMatchObject({ ok: true, result: { revision: 1, papers: document.papers } })

    const stale = await dispatcher.dispatch({
      id: 's2',
      authToken: 't',
      method: 'researchLibrary.save',
      params: document
    })
    expect(stale).toMatchObject({ ok: false })
  })

  it('refuses a document that does not validate', async () => {
    const dispatcher = new RpcDispatcher({ runtime, methods: RESEARCH_LIBRARY_METHODS })
    const response = await dispatcher.dispatch({
      id: 's1',
      authToken: 't',
      method: 'researchLibrary.save',
      params: { schemaVersion: 2 }
    })
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
  })
})
