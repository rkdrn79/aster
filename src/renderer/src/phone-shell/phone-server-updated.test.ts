import { describe, expect, it } from 'vitest'
import {
  INITIAL_SERVER_VERSION_TRACKER,
  trackServerVersion,
  type ServerVersionTracker
} from './phone-server-updated'

function run(steps: { connected: boolean; version: string | null }[]): {
  tracker: ServerVersionTracker
  announced: (string | null)[]
} {
  let tracker = INITIAL_SERVER_VERSION_TRACKER
  const announced: (string | null)[] = []
  for (const step of steps) {
    const next = trackServerVersion(tracker, step)
    tracker = next.tracker
    announced.push(next.updatedTo)
  }
  return { tracker, announced }
}

describe('trackServerVersion', () => {
  it('announces the new version when the host comes back on a different one', () => {
    const { announced } = run([
      { connected: true, version: '1.2.2' },
      { connected: false, version: '1.2.2' },
      { connected: true, version: '1.2.3' }
    ])
    expect(announced).toEqual([null, null, '1.2.3'])
  })

  it('stays quiet when the host comes back on the same version', () => {
    const { announced } = run([
      { connected: true, version: '1.2.2' },
      { connected: false, version: '1.2.2' },
      { connected: true, version: '1.2.2' }
    ])
    expect(announced).toEqual([null, null, null])
  })

  it('stays quiet on the first version it ever sees', () => {
    const { announced } = run([
      { connected: false, version: null },
      { connected: true, version: '1.2.3' }
    ])
    expect(announced).toEqual([null, null])
  })

  it('does not announce a version change on a link that never dropped', () => {
    const { announced } = run([
      { connected: true, version: '1.2.2' },
      { connected: true, version: '1.2.3' }
    ])
    expect(announced).toEqual([null, null])
  })

  it('waits for a version when the host reconnects without reporting one yet', () => {
    const { announced } = run([
      { connected: true, version: '1.2.2' },
      { connected: false, version: null },
      { connected: true, version: null },
      { connected: true, version: '1.2.3' }
    ])
    expect(announced).toEqual([null, null, null, '1.2.3'])
  })

  it('announces once, then compares against the new version', () => {
    const { announced } = run([
      { connected: true, version: '1.2.2' },
      { connected: false, version: null },
      { connected: true, version: '1.2.3' },
      { connected: false, version: null },
      { connected: true, version: '1.2.3' }
    ])
    expect(announced).toEqual([null, null, '1.2.3', null, null])
  })
})
