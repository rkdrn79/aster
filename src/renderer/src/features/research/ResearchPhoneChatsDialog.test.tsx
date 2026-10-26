// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchPhoneChatsDialog } from './ResearchPhoneChatsDialog'

vi.mock('qrcode/lib/browser', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,dGVzdA==') }
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('sets up a missing SSH daemon and sends only to the selected project conversation', async () => {
  const scope = {
    hostId: 'runtime:vip',
    workspaceId: 'repo::/project',
    workspacePath: '/project'
  }
  const agent = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Paper review',
    provider: 'codex',
    status: 'idle',
    cwd: '/project'
  }
  const list = vi
    .fn()
    .mockRejectedValueOnce(new Error('Paseo is not installed on this server.'))
    .mockResolvedValue([agent])
  const setup = vi.fn().mockResolvedValue(undefined)
  const logs = vi.fn().mockResolvedValue('Previous response')
  const send = vi.fn().mockResolvedValue(undefined)
  const start = vi.fn().mockResolvedValue('22222222-2222-2222-2222-222222222222')
  vi.stubGlobal('api', {
    researchPaseo: {
      list,
      setup,
      logs,
      send,
      start,
      pair: vi.fn(),
      providers: vi.fn().mockResolvedValue([{ id: 'codex', label: 'Codex' }])
    },
    settings: { get: vi.fn().mockResolvedValue({ defaultTuiAgent: 'codex' }) }
  })

  render(<ResearchPhoneChatsDialog open onClose={vi.fn()} scope={scope} />)
  await waitFor(() => expect(screen.getByRole('button', { name: /Paper review/ })).toBeTruthy())
  expect(setup).toHaveBeenCalledWith(scope)
  expect(list).toHaveBeenCalledTimes(2)
  await waitFor(() => expect(screen.getByText('Previous response')).toBeTruthy())

  fireEvent.change(screen.getByRole('textbox', { name: 'Message to phone conversation' }), {
    target: { value: 'Please check the new PDF.' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() =>
    expect(send).toHaveBeenCalledWith(scope, agent.id, 'Please check the new PDF.')
  )

  fireEvent.click(screen.getByRole('button', { name: 'New phone chat' }))
  fireEvent.change(
    screen.getByRole('textbox', { name: 'First message to new phone conversation' }),
    {
      target: { value: 'Summarize the experiment.' }
    }
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Start conversation' }).hasAttribute('disabled')
    ).toBe(false)
  )
  fireEvent.click(screen.getByRole('button', { name: 'Start conversation' }))
  await waitFor(() =>
    expect(start).toHaveBeenCalledWith(scope, 'Summarize the experiment.', 'codex')
  )
})

it('hides a host pairing QR when the selected project changes', async () => {
  vi.stubGlobal('api', {
    researchPaseo: {
      list: vi.fn().mockResolvedValue([]),
      logs: vi.fn(),
      pair: vi.fn().mockResolvedValue('paseo://pair/secret')
    }
  })
  const first = { hostId: 'runtime:vip', workspaceId: 'repo::/first', workspacePath: '/first' }
  const second = { hostId: 'runtime:other', workspaceId: 'repo::/second', workspacePath: '/second' }
  const view = render(<ResearchPhoneChatsDialog open onClose={vi.fn()} scope={first} />)
  fireEvent.click(screen.getByRole('button', { name: 'Pair phone' }))
  await waitFor(() => expect(screen.getByAltText('Paseo phone pairing QR code')).toBeTruthy())
  view.rerender(<ResearchPhoneChatsDialog open onClose={vi.fn()} scope={second} />)
  expect(screen.queryByAltText('Paseo phone pairing QR code')).toBeNull()
})
