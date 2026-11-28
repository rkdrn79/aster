import { describe, expect, it } from 'vitest'
import type { ServerAutoUpdateHostStatus } from '../../../../shared/server-auto-update'
import { createTestStore } from './store-test-helpers'

function status(environmentId: string, phase: ServerAutoUpdateHostStatus['phase']) {
  return {
    environmentId,
    sshTargetId: `ssh-${environmentId}`,
    hostLabel: environmentId,
    mode: 'idle',
    modeSource: 'global',
    activeVersion: '1.2.3',
    bundledVersion: '1.2.3',
    phase
  } satisfies ServerAutoUpdateHostStatus
}

describe('server auto-update slice', () => {
  it('replaces the whole set, keyed by environment id', () => {
    const store = createTestStore()
    store
      .getState()
      .setServerAutoUpdateStatuses([status('a', 'up-to-date'), status('b', 'waiting')])
    expect(Object.keys(store.getState().serverAutoUpdateStatuses)).toEqual(['a', 'b'])
    store.getState().setServerAutoUpdateStatuses([status('b', 'updating')])
    expect(store.getState().serverAutoUpdateStatuses).toEqual({ b: status('b', 'updating') })
  })

  it('keeps the same state object when an identical list is broadcast again', () => {
    const store = createTestStore()
    store.getState().setServerAutoUpdateStatuses([status('a', 'up-to-date')])
    const before = store.getState().serverAutoUpdateStatuses
    store.getState().setServerAutoUpdateStatuses([status('a', 'up-to-date')])
    expect(store.getState().serverAutoUpdateStatuses).toBe(before)
  })
})
