// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A runtime-hosted project: every read and write goes through the host's file API.
const remoteFiles = vi.hoisted(() => new Map<string, string>())
const order = vi.hoisted((): string[] => [])

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('./research-figure-preview', () => ({ readFigurePreviewHash: vi.fn(async () => null) }))
vi.mock('./research-figure-overwrite', () => ({ editorFor: vi.fn(async () => null) }))
vi.mock('./research-figures-store', () => ({ selectFigure: vi.fn() }))
vi.mock('./research-figure-editor-handle', () => ({
  useFigureEditorHandle: { getState: () => ({ handle: null }) }
}))
vi.mock('@/lib/workspace-file-host-routing', () => ({
  buildWorkspaceFileContext: () => ({
    target: { kind: 'environment', environmentId: 'env-1' },
    worktreeId: 'wt-1',
    worktreePath: '/srv/proj'
  })
}))
vi.mock('@/runtime/runtime-file-read-client', () => ({
  readRuntimeFileContent: vi.fn(async ({ filePath }: { filePath: string }) => {
    const relative = filePath.replace('/srv/proj/', '')
    const content = remoteFiles.get(relative)
    if (content === undefined) {
      throw new Error(`ENOENT ${relative}`)
    }
    return { isBinary: relative.endsWith('.pdf'), content, mimeType: 'application/pdf' }
  })
}))
vi.mock('@/runtime/runtime-file-range-client', () => ({ statRuntimeReadTarget: vi.fn() }))
vi.mock('@/runtime/runtime-file-mutation-rpc', () => ({
  callRuntimeFileMutation: vi.fn(async (_target: unknown, method: string, params: object) => {
    const relativePath = String(Reflect.get(params, 'relativePath'))
    const contentBase64 = String(Reflect.get(params, 'contentBase64'))
    order.push(`${method}:${relativePath}`)
    remoteFiles.set(relativePath, contentBase64)
    return { ok: true }
  })
}))
vi.mock('@/runtime/runtime-file-routing', () => ({
  getRelativePathInsideWorktree: () => undefined,
  getRemoteFileArgs: (_context: unknown, filePath: string) => ({
    target: { kind: 'environment', environmentId: 'env-1' },
    worktreeSelector: 'id:wt-1',
    relativePath: filePath.replace('/srv/proj/', '')
  }),
  withSshMutationExpectation: (_context: unknown, args: unknown) => args
}))
vi.mock('@/runtime/runtime-file-mutation-client', () => ({
  readRuntimeDirectory: vi.fn(async () => [{ name: 'project.json', isDirectory: false }]),
  createRuntimePath: vi.fn(async () => undefined),
  writeRuntimeFile: vi.fn(async (_context: unknown, filePath: string, content: string) => {
    remoteFiles.set(filePath.replace('/srv/proj/', ''), content)
    return { ok: true }
  }),
  deleteRuntimePath: vi.fn(async (_context: unknown, filePath: string) => {
    order.push(`delete:${filePath.replace('/srv/proj/', '')}`)
    remoteFiles.delete(filePath.replace('/srv/proj/', ''))
  }),
  renameRuntimePath: vi.fn(async (_context: unknown, from: string, to: string) => {
    const source = from.replace('/srv/proj/', '')
    order.push(`rename:${source}`)
    remoteFiles.set(to.replace('/srv/proj/', ''), remoteFiles.get(source) ?? '')
    remoteFiles.delete(source)
  })
}))

import { publishFigureCopy } from './research-figure-publish'

const owner = { hostId: 'runtime:env-1', workspaceId: 'wt-1', workspacePath: '/srv/proj' }
const publish = () =>
  publishFigureCopy({
    owner,
    slug: 'method',
    from: '.aster/figures/method.pdf',
    manuscript: 'paper/main.tex',
    sceneSha256: 'scene-1'
  })

beforeEach(() => {
  remoteFiles.clear()
  order.length = 0
})

describe('publishing on a remote host', () => {
  it('re-publishes over the existing PDF: write beside it, delete the old one, rename', async () => {
    remoteFiles.set('.aster/figures/method.pdf', btoa('%PDF-one'))
    await publish()
    expect(atob(remoteFiles.get('paper/figures/method.pdf') ?? '')).toBe('%PDF-one')

    remoteFiles.set('.aster/figures/method.pdf', btoa('%PDF-two'))
    order.length = 0
    await publish()
    expect(atob(remoteFiles.get('paper/figures/method.pdf') ?? '')).toBe('%PDF-two')
    expect(order.at(-2)).toBe('delete:paper/figures/method.pdf')
    expect(order.at(-1)).toMatch(/^rename:paper\/figures\/\.method\.pdf\..+\.tmp$/)
    expect(
      JSON.parse(remoteFiles.get('.aster/figures/published/method.json') ?? '{}').sceneSha256
    ).toBe('scene-1')
  })
})
