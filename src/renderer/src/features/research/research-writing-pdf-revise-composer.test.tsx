// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type { Tab } from '../../../../shared/tab-types'
import { writingAgentScopeKey } from './research-conversation-home'

const mocks = vi.hoisted(() => {
  const tabs: Tab[] = []
  const bindings: Record<string, string> = {}
  return {
    state: { unifiedTabsByWorktree: { workspace: tabs }, openFiles: [] },
    records: { writingAgentSessionByScope: bindings },
    send: vi.fn(),
    background: vi.fn(),
    focus: vi.fn()
  }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/runtime/structured-agent-session-owner', () => ({
  structuredAgentSessionOwnerForTab: () => 'local'
}))
vi.mock('./research-workspace-context', () => ({
  selectResearchWorkspaceContext: () => ({ workspaceId: 'workspace', hostId: 'local' })
}))
vi.mock('./research-records-store', () => ({
  useResearchRecords: { getState: () => ({ document: mocks.records }) }
}))
vi.mock('./research-writing-pdf-source-location', () => ({
  useWritingPdfSourceLocation: () => null
}))
vi.mock('./research-writing-pdf-agent-send', () => ({
  formatPdfRevisionRange: () => '',
  sendWritingPdfRevision: mocks.send
}))
vi.mock('./research-writing-pdf-background-revision', () => ({
  startProjectPdfRevision: mocks.background
}))
vi.mock('./research-writing-agent-focus', () => ({ requestWritingAgentFocus: mocks.focus }))

import { ResearchWritingPdfReviseComposer } from './research-writing-pdf-revise-composer'

const project: ExperimentRecord = {
  id: 'project:local:workspace',
  name: 'Paper',
  projectId: null,
  workspaceId: 'workspace',
  workspacePath: '/paper',
  hostId: 'local',
  archived: false,
  createdAt: '',
  updatedAt: ''
}
const source = {
  workspaceId: 'workspace',
  workspacePath: '/paper',
  pdfFile: { absolutePath: '/paper/main.pdf', relativePath: 'main.pdf' },
  mainTeXFile: { absolutePath: '/paper/main.tex', relativePath: 'main.tex' }
}
const selection = { text: 'Original sentence.', pageNumber: 1, anchor: { x: 10, y: 10 } }

describe('project PDF revision routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.unifiedTabsByWorktree.workspace = []
    mocks.records.writingAgentSessionByScope = {}
    mocks.background.mockResolvedValue(null)
    mocks.send.mockResolvedValue({ status: 'sent' })
  })
  afterEach(cleanup)

  function submit(): void {
    render(
      <ResearchWritingPdfReviseComposer
        experiment={project}
        projectOnly
        source={source}
        selection={selection}
        onClose={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'Clarify this.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start revision' }))
  }

  it('sends to a bound Writing chat instead of launching a background agent', async () => {
    mocks.records.writingAgentSessionByScope[writingAgentScopeKey(project)] = 'writing-session'
    mocks.state.unifiedTabsByWorktree.workspace = [
      {
        id: 'tab-writing',
        entityId: 'writing-session',
        groupId: 'group',
        worktreeId: 'workspace',
        contentType: 'agent-session',
        agentSessionAgent: 'codex',
        label: 'Writing agent',
        customLabel: null,
        color: null,
        sortOrder: 0,
        createdAt: 0
      }
    ]
    submit()
    await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce())
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ binding: { sessionId: 'writing-session', tabId: 'tab-writing' } })
    )
    expect(mocks.background).not.toHaveBeenCalled()
    expect(mocks.focus).toHaveBeenCalledWith(project.id)
  })

  it('starts a background revision when no Writing chat is bound', async () => {
    submit()
    await waitFor(() => expect(mocks.background).toHaveBeenCalledOnce())
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
