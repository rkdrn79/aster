import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  resolveAgent: vi.fn(),
  update: vi.fn(),
  track: vi.fn(),
  name: vi.fn(),
  toast: vi.fn()
}))

vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: mocks.launch }))
vi.mock('@/lib/agent-launch-request-id', () => ({ newAgentLaunchRequestId: () => 'request-1' }))
vi.mock('@/lib/browser-uuid', () => ({ createBrowserUuid: () => 'task-1' }))
vi.mock('sonner', () => ({ toast: { success: mocks.toast } }))
vi.mock('./research-adopt-conversation', () => ({ resolveResearchAdoptAgent: mocks.resolveAgent }))
vi.mock('./research-chat-label', () => ({ nameResearchChat: mocks.name }))
vi.mock('./research-delegation-launch', () => ({ trackDelegationLaunch: mocks.track }))
vi.mock('./research-records-store', () => ({
  useResearchRecords: { getState: () => ({ update: mocks.update }) }
}))

import { startProjectPdfRevision } from './research-writing-pdf-background-revision'

const input = {
  project: { hostId: 'local', workspaceId: 'workspace-1', name: 'My paper' },
  source: {
    workspaceId: 'workspace-1',
    workspacePath: '/research/paper',
    pdfFile: { absolutePath: '/research/paper/main.pdf', relativePath: 'main.pdf' },
    mainTeXFile: { absolutePath: '/research/paper/main.tex', relativePath: 'main.tex' }
  },
  selection: { text: 'Original sentence.', pageNumber: 2, anchor: { x: 10, y: 20 } },
  instruction: 'Make this sentence clearer.'
}

describe('project-only PDF revision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveAgent.mockResolvedValue('codex')
    mocks.launch.mockReturnValue({ surface: { kind: 'host-published' } })
    mocks.update.mockImplementation(async (change) => change({ delegations: [] }))
  })

  it('launches the selected passage on the project host and tracks it as background work', async () => {
    await expect(startProjectPdfRevision(input)).resolves.toBeNull()
    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedSurface: 'chat',
        selectedExecutionHostId: 'local',
        worktreeId: 'workspace-1',
        agent: 'codex',
        activate: false,
        promptDelivery: 'auto-submit',
        prompt: expect.stringContaining('Original sentence.')
      })
    )
    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.track).toHaveBeenCalledWith('task-1', expect.anything())
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Background tasks'))
  })

  it('does not start an agent for an empty instruction', async () => {
    await expect(startProjectPdfRevision({ ...input, instruction: ' ' })).resolves.toContain(
      'Add an instruction'
    )
    expect(mocks.launch).not.toHaveBeenCalled()
  })
})
