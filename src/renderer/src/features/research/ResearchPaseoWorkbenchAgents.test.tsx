// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PaseoCompanionScope } from '../../../../shared/research/research-paseo-companion'
import { ResearchPaseoWorkbenchAgents } from './ResearchPaseoWorkbenchAgents'

vi.mock('./ResearchPhoneChatsDialog', () => ({
  ResearchPhoneChatsDialog: ({
    initialAgentId,
    allHost,
    onClose
  }: {
    initialAgentId: string | null
    allHost: boolean
    onClose: () => void
  }) => (
    <div role="dialog">
      <span>{`${allHost}:${initialAgentId}`}</span>
      <button onClick={onClose}>Close phone chats</button>
    </div>
  )
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('shows all selected-host Paseo agents and opens the exact phone-visible agent ID', async () => {
  const scope: PaseoCompanionScope = {
    hostId: 'runtime:research',
    workspaceId: 'repo::/project',
    workspacePath: '/project'
  }
  const listHost = vi.fn().mockResolvedValue([
    {
      id: 'mobile-id',
      name: 'Other folder agent',
      provider: 'codex',
      status: 'busy',
      cwd: '/other'
    }
  ])
  const list = vi.fn()
  vi.stubGlobal('api', { researchPaseo: { listHost, list } })

  render(<ResearchPaseoWorkbenchAgents scope={scope} hostLabel="Research server" active />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Other folder agent/ })).toBeTruthy()
  )
  expect(listHost).toHaveBeenCalledWith(scope)
  expect(list).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Refresh Paseo agents' }))
  await waitFor(() => expect(listHost).toHaveBeenCalledTimes(2))

  fireEvent.click(screen.getByRole('button', { name: /Other folder agent/ }))
  expect(screen.getByRole('dialog').textContent).toContain('true:mobile-id')
  fireEvent.click(screen.getByRole('button', { name: 'Close phone chats' }))
  await waitFor(() => expect(listHost).toHaveBeenCalledTimes(3))
})

it('does not query Paseo outside Workbench', () => {
  const listHost = vi.fn()
  vi.stubGlobal('api', { researchPaseo: { listHost } })
  const scope = { hostId: 'local', workspaceId: 'local-project', workspacePath: '/project' }
  render(<ResearchPaseoWorkbenchAgents scope={scope} hostLabel="This computer" active={false} />)
  expect(listHost).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Paseo agents on this host')).toBeNull()
})

it('hides the host section with an older preload that has no host inventory API', () => {
  const list = vi.fn()
  vi.stubGlobal('api', { researchPaseo: { list } })
  const scope = { hostId: 'local', workspaceId: 'local-project', workspacePath: '/project' }
  render(<ResearchPaseoWorkbenchAgents scope={scope} hostLabel="This computer" active />)
  expect(list).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Paseo agents on this host')).toBeNull()
})
