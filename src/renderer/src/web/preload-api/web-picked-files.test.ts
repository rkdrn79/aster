// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ callEnvironmentEnvelope: vi.fn() }))

vi.mock('./web-runtime-calls', () => ({ callEnvironmentEnvelope: mocks.callEnvironmentEnvelope }))
vi.mock('./web-runtime-session', () => ({
  resolveEnvironment: () => ({ id: 'env-1', createdAt: 1, pairingRevision: 7 })
}))

import { pickWebFiles } from './web-picked-files'
import { uploadWebPickedFilesToAgentSession } from './web-agent-session-attachment-upload'

const target = {
  environmentId: 'env-1',
  sessionId: 'session-1',
  expectedEnvironmentPairingRevision: 7,
  expectedEnvironmentRuntimeId: 'runtime-a'
}

function reply(result: unknown) {
  return { id: 'r', ok: true, result, _meta: { runtimeId: 'runtime-a' } }
}

/** Answers the next picker the page opens as the person would. */
function answerPicker(files: File[] | 'cancel'): void {
  const observer = new MutationObserver(() => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) {
      return
    }
    observer.disconnect()
    if (files === 'cancel') {
      input.dispatchEvent(new Event('cancel'))
      return
    }
    Object.defineProperty(input, 'files', { value: files })
    input.dispatchEvent(new Event('change'))
  })
  observer.observe(document.body, { childList: true })
}

beforeEach(() => {
  mocks.callEnvironmentEnvelope.mockReset()
  document.body.innerHTML = ''
})

describe('web file picking for chat attachments', () => {
  it('uploads a picked photo into the chat store under its own name', async () => {
    answerPicker([new File(['jpg-bytes'], 'IMG_0042.jpeg', { type: 'image/jpeg' })])
    const paths = await pickWebFiles({ multiple: true })
    expect(paths).toHaveLength(1)
    expect(paths[0]).toMatch(/\/IMG_0042\.jpeg$/)
    expect(document.querySelector('input[type="file"]')).toBeNull()

    mocks.callEnvironmentEnvelope.mockImplementation(async (_env: string, method: string) =>
      method === 'agentSessionAttachment.uploadStart'
        ? reply({ uploadId: 'u1' })
        : method === 'agentSessionAttachment.uploadCommit'
          ? reply({ path: '/srv/agent-session-attachments/u1/IMG_0042.jpeg' })
          : reply({ receivedBytes: 9 })
    )
    const result = await uploadWebPickedFilesToAgentSession({ ...target, paths })
    expect(result).toEqual({
      uploaded: [{ sourcePath: paths[0], path: '/srv/agent-session-attachments/u1/IMG_0042.jpeg' }],
      skipped: [],
      failed: []
    })
    const start = mocks.callEnvironmentEnvelope.mock.calls.find(
      ([, method]) => method === 'agentSessionAttachment.uploadStart'
    )
    expect(start?.[2]).toEqual({ sessionId: 'session-1', name: 'IMG_0042.jpeg', byteLength: 9 })
    const append = mocks.callEnvironmentEnvelope.mock.calls.find(
      ([, method]) => method === 'agentSessionAttachment.uploadAppend'
    )
    expect(append?.[2]).toMatchObject({ contentBase64: btoa('jpg-bytes') })
  })

  it('attaches nothing when the picker is dismissed', async () => {
    answerPicker('cancel')
    await expect(pickWebFiles({ multiple: true })).resolves.toEqual([])
  })

  it('fails a path that no longer names a picked file instead of guessing', async () => {
    const result = await uploadWebPickedFilesToAgentSession({
      ...target,
      paths: ['/.aster-web-picked/gone/photo.png']
    })
    expect(result.failed).toEqual([
      { sourcePath: '/.aster-web-picked/gone/photo.png', reason: 'Pick the file again.' }
    ])
    expect(mocks.callEnvironmentEnvelope).not.toHaveBeenCalled()
  })
})
