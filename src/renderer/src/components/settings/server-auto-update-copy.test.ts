import { describe, expect, it } from 'vitest'
import type { ServerAutoUpdateHostStatus } from '../../../../shared/server-auto-update'
import {
  canUpdateNow,
  followGlobalSettingLabel,
  hasNewerBundledVersion,
  serverAutoUpdateNowMessage,
  serverAutoUpdateStatusLine,
  updateNowConfirmationText,
  updateNowNeedsConfirmation
} from './server-auto-update-copy'

const NOW = Date.parse('2026-11-29T12:00:00.000Z')

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

describe('serverAutoUpdateStatusLine', () => {
  it('says up to date with the version the host runs', () => {
    expect(
      serverAutoUpdateStatusLine(status({ activeVersion: '1.2.3', phase: 'up-to-date' }), NOW)
    ).toEqual({ text: 'Up to date · 1.2.3', tone: 'muted', busy: false })
  })

  it('names the agents and the host while agents hold the update back', () => {
    const line = serverAutoUpdateStatusLine(
      status({
        phase: 'waiting',
        wait: { reason: 'agents-working', agents: 3, since: '2026-11-29T11:00:00.000Z' }
      }),
      NOW
    )
    expect(line).toEqual({
      text: 'Update waiting: 3 agents working on gpu-box',
      tone: 'warning',
      busy: false
    })
  })

  it('uses the singular for one agent', () => {
    const line = serverAutoUpdateStatusLine(
      status({
        phase: 'waiting',
        wait: { reason: 'agents-working', agents: 1, since: '2026-11-29T11:00:00.000Z' }
      }),
      NOW
    )
    expect(line?.text).toBe('Update waiting: 1 agent working on gpu-box')
  })

  it('shows the detail for other waits and asks for an OK in ask mode', () => {
    expect(
      serverAutoUpdateStatusLine(
        status({
          phase: 'waiting',
          wait: { reason: 'unreachable', detail: 'the host is not answering', since: 'x' }
        }),
        NOW
      )?.text
    ).toBe('Update waiting: the host is not answering')
    expect(
      serverAutoUpdateStatusLine(
        status({ mode: 'ask', phase: 'waiting', wait: { reason: 'ask', since: 'x' } }),
        NOW
      )?.text
    ).toBe('Update ready — waiting for your OK')
  })

  it('shows progress while updating', () => {
    expect(serverAutoUpdateStatusLine(status({ phase: 'updating' }), NOW)).toEqual({
      text: 'Updating to 1.2.3…',
      tone: 'muted',
      busy: true
    })
  })

  it('says when it updated and from which version, with the chats it continued', () => {
    const base = status({
      phase: 'updated',
      activeVersion: '1.2.3',
      updatedAt: '2026-11-29T11:55:00.000Z',
      updatedFrom: '1.2.2'
    })
    expect(serverAutoUpdateStatusLine(base, NOW)?.text).toBe('Updated 5 minutes ago from 1.2.2')
    expect(serverAutoUpdateStatusLine({ ...base, resumedChats: 2 }, NOW)?.text).toBe(
      'Updated 5 minutes ago from 1.2.2 · 2 chats continued'
    )
    expect(serverAutoUpdateStatusLine({ ...base, resumedChats: 1 }, NOW)?.text).toBe(
      'Updated 5 minutes ago from 1.2.2 · 1 chat continued'
    )
    expect(
      serverAutoUpdateStatusLine({ ...base, updatedFrom: null, resumedChats: 0 }, NOW)?.text
    ).toBe('Updated 5 minutes ago')
  })

  it('says the old version keeps running after a failure, with the reason as a sentence', () => {
    expect(
      serverAutoUpdateStatusLine(status({ phase: 'failed', failure: 'disk is full' }), NOW)
    ).toEqual({
      text: 'Update failed: disk is full. The previous version keeps running.',
      tone: 'destructive',
      busy: false
    })
    expect(
      serverAutoUpdateStatusLine(status({ phase: 'failed', failure: 'No space left.' }), NOW)?.text
    ).toBe('Update failed: No space left. The previous version keeps running.')
    expect(serverAutoUpdateStatusLine(status({ phase: 'failed' }), NOW)?.text).toBe(
      'Update failed: The previous version keeps running.'
    )
  })

  it('says automatic updates are off, and which version is waiting for a manual update', () => {
    expect(serverAutoUpdateStatusLine(status({ mode: 'off', phase: 'off' }), NOW)?.text).toBe(
      'Automatic updates are off for this host · 1.2.3 is available'
    )
    expect(
      serverAutoUpdateStatusLine(status({ mode: 'off', phase: 'off', activeVersion: '1.2.3' }), NOW)
        ?.text
    ).toBe('Automatic updates are off for this host')
  })

  it('says nothing before the host has been reached', () => {
    expect(serverAutoUpdateStatusLine(status({ phase: 'unknown' }), NOW)).toBeNull()
    expect(serverAutoUpdateStatusLine(status({ phase: 'checking' }), NOW)?.text).toBe('Checking…')
  })
})

describe('Update now', () => {
  it('is offered for a waiting or failed update', () => {
    expect(canUpdateNow(status({ phase: 'waiting' }))).toBe(true)
    expect(canUpdateNow(status({ phase: 'failed' }))).toBe(true)
  })

  it('is offered for a newer bundled version when the person chose ask or off', () => {
    expect(canUpdateNow(status({ mode: 'ask', phase: 'up-to-date' }))).toBe(true)
    expect(canUpdateNow(status({ mode: 'off', phase: 'off' }))).toBe(true)
  })

  it('is not offered when idle mode updates on its own, or nothing is newer', () => {
    expect(canUpdateNow(status({ mode: 'idle', phase: 'up-to-date' }))).toBe(false)
    expect(canUpdateNow(status({ mode: 'off', phase: 'off', activeVersion: '1.2.3' }))).toBe(false)
    expect(canUpdateNow(status({ mode: 'off', phase: 'updating' }))).toBe(false)
    expect(canUpdateNow(status({ mode: 'off', phase: 'unknown' }))).toBe(false)
  })

  it('never claims a newer version it cannot compare', () => {
    expect(hasNewerBundledVersion(status({ activeVersion: null }))).toBe(false)
    expect(hasNewerBundledVersion(status({ bundledVersion: 'not-a-version' }))).toBe(false)
    expect(hasNewerBundledVersion(status({ activeVersion: '1.2.3' }))).toBe(false)
    expect(hasNewerBundledVersion(status({ activeVersion: '1.3.0' }))).toBe(false)
  })

  it('asks first only when agents are working', () => {
    expect(
      updateNowNeedsConfirmation(
        status({ phase: 'waiting', wait: { reason: 'agents-working', agents: 2, since: 'x' } })
      )
    ).toBe(true)
    expect(
      updateNowNeedsConfirmation(status({ phase: 'waiting', wait: { reason: 'ask', since: 'x' } }))
    ).toBe(false)
    expect(updateNowNeedsConfirmation(status({ phase: 'failed' }))).toBe(false)
  })

  it('words the confirmation with the agent count and the host', () => {
    expect(updateNowConfirmationText(2, 'gpu-box')).toBe(
      '2 agents are working on gpu-box. Updating now stops their current replies; Aster continues those chats after the update. Terminals and jobs keep running.'
    )
    expect(updateNowConfirmationText(1, 'gpu-box')).toContain('1 agent is working on gpu-box.')
  })
})

describe('serverAutoUpdateNowMessage', () => {
  it('reports each outcome in one line', () => {
    expect(
      serverAutoUpdateNowMessage(
        { outcome: 'updated', activeVersion: '1.2.3', resumedChats: 2 },
        'gpu-box'
      )
    ).toEqual({
      kind: 'success',
      text: 'gpu-box updated to 1.2.3. 2 chats continued.'
    })
    expect(
      serverAutoUpdateNowMessage({ outcome: 'already-current', activeVersion: '1.2.3' }, 'gpu-box')
        .kind
    ).toBe('info')
    expect(
      serverAutoUpdateNowMessage({ outcome: 'deferred', reason: 'a terminal is busy' }, 'gpu-box')
    ).toEqual({ kind: 'info', text: 'Not updated yet: a terminal is busy' })
    expect(
      serverAutoUpdateNowMessage({ outcome: 'failed', reason: 'ssh dropped' }, 'gpu-box')
    ).toEqual({
      kind: 'error',
      text: 'Update failed: ssh dropped. The previous version keeps running.'
    })
  })
})

describe('followGlobalSettingLabel', () => {
  it('names the global choice, and reads an unknown one as the default', () => {
    expect(followGlobalSettingLabel('ask')).toBe('Follow global setting (Ask first)')
    expect(followGlobalSettingLabel(undefined)).toBe('Follow global setting (When idle)')
    expect(followGlobalSettingLabel('bogus')).toBe('Follow global setting (When idle)')
  })
})
