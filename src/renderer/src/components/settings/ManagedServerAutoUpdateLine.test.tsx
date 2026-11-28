// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerAutoUpdateHostStatus } from '../../../../shared/server-auto-update'
import { ManagedServerAutoUpdateLine } from './ManagedServerAutoUpdateLine'
import { hostAutoUpdateChoice } from './ServerAutoUpdateHostModeSelect'

const toast = vi.hoisted(() => ({ success: vi.fn(), message: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ settings: { serverAutoUpdate: 'idle' } })
}))

function status(overrides: Partial<ServerAutoUpdateHostStatus> = {}): ServerAutoUpdateHostStatus {
  return {
    environmentId: 'env-1',
    sshTargetId: 'ssh-1',
    hostLabel: 'gpu-box',
    mode: 'idle',
    modeSource: 'global',
    activeVersion: '1.2.2',
    bundledVersion: '1.2.3',
    phase: 'up-to-date',
    ...overrides
  }
}

function renderLine(next: ServerAutoUpdateHostStatus) {
  const autoUpdateNow = vi.fn(async () => ({
    outcome: 'updated' as const,
    activeVersion: '1.2.3',
    resumedChats: 0
  }))
  const setAutoUpdateMode = vi.fn(async () => {})
  render(<ManagedServerAutoUpdateLine status={next} api={{ autoUpdateNow, setAutoUpdateMode }} />)
  return { autoUpdateNow, setAutoUpdateMode }
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('ManagedServerAutoUpdateLine', () => {
  it('shows the status line and no Update now for a host that is up to date', () => {
    renderLine(status({ activeVersion: '1.2.3' }))
    expect(screen.getByTestId('server-auto-update-status').textContent).toBe('Up to date · 1.2.3')
    expect(screen.queryByTestId('server-auto-update-now')).toBeNull()
  })

  it('updates at once when no agent is working, and says what happened', async () => {
    const { autoUpdateNow } = renderLine(
      status({ phase: 'waiting', wait: { reason: 'ask', since: 'x' }, mode: 'ask' })
    )
    fireEvent.click(screen.getByTestId('server-auto-update-now'))
    await waitFor(() => expect(autoUpdateNow).toHaveBeenCalledWith({ selector: 'env-1' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('gpu-box updated to 1.2.3.'))
    expect(screen.queryByTestId('server-auto-update-confirm')).toBeNull()
  })

  it('asks first while agents work, and does nothing on Cancel', () => {
    const { autoUpdateNow } = renderLine(
      status({
        phase: 'waiting',
        wait: { reason: 'agents-working', agents: 2, since: 'x' }
      })
    )
    expect(screen.getByTestId('server-auto-update-status').textContent).toBe(
      'Update waiting: 2 agents working on gpu-box'
    )
    fireEvent.click(screen.getByTestId('server-auto-update-now'))
    expect(screen.getByTestId('server-auto-update-confirm').textContent).toContain(
      '2 agents are working on gpu-box.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(autoUpdateNow).not.toHaveBeenCalled()
  })

  it('updates after the confirmation', async () => {
    const { autoUpdateNow } = renderLine(
      status({
        phase: 'waiting',
        wait: { reason: 'agents-working', agents: 2, since: 'x' }
      })
    )
    fireEvent.click(screen.getByTestId('server-auto-update-now'))
    fireEvent.click(screen.getByTestId('server-auto-update-confirm-now'))
    await waitFor(() => expect(autoUpdateNow).toHaveBeenCalledWith({ selector: 'env-1' }))
  })

  it('names the restart command when the Slack bridge runs older code', () => {
    renderLine(status({ slackBridge: { kind: 'old', unit: 'aster-slack-bridge.service' } }))
    expect(screen.getByTestId('server-auto-update-slack-command').textContent).toBe(
      'systemctl --user restart aster-slack-bridge.service'
    )
  })

  it('shows no Slack note for a bridge that follows updates, or one without a unit', () => {
    renderLine(status({ slackBridge: { kind: 'follows', unit: 'aster-slack-bridge.service' } }))
    expect(screen.queryByTestId('server-auto-update-slack-note')).toBeNull()
    cleanup()
    renderLine(status({ slackBridge: { kind: 'old', unit: null } }))
    expect(screen.queryByTestId('server-auto-update-slack-note')).toBeNull()
  })

  it('shows the host following the global setting, or its own choice', () => {
    renderLine(status({ mode: 'off', modeSource: 'host' }))
    expect(screen.getByTestId('server-auto-update-host-mode').textContent).toBe('Off')
    cleanup()
    renderLine(status({ mode: 'idle', modeSource: 'global' }))
    expect(screen.getByTestId('server-auto-update-host-mode').textContent).toBe(
      'Follow global setting (When idle)'
    )
  })
})

describe('hostAutoUpdateChoice', () => {
  it('reads the status: the host choice only when the host made one', () => {
    expect(hostAutoUpdateChoice({ mode: 'ask', modeSource: 'host' })).toBe('ask')
    expect(hostAutoUpdateChoice({ mode: 'ask', modeSource: 'global' })).toBe('global')
  })
})
