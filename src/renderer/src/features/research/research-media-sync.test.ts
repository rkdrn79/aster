import { afterEach, describe, expect, it } from 'vitest'
import {
  followerCommands,
  joinMediaSyncGroup,
  type MediaSyncEvent,
  type SyncedMedia
} from './research-media-sync'

/** A player whose actions fire their events later, as a browser's do. */
class FakeMedia extends EventTarget implements SyncedMedia {
  paused = true
  muted = false
  duration = 10
  seeks: number[] = []
  private time = 0
  private rate = 1

  get currentTime(): number {
    return this.time
  }
  set currentTime(value: number) {
    this.time = value
    this.seeks.push(value)
    this.later('seeked')
  }
  get playbackRate(): number {
    return this.rate
  }
  set playbackRate(value: number) {
    this.rate = value
    this.later('ratechange')
  }
  async play(): Promise<void> {
    this.paused = false
    this.later('play')
  }
  pause(): void {
    this.paused = true
    this.later('pause')
  }
  /** Playback advancing on its own, without a seek. */
  advance(seconds: number): void {
    this.time += seconds
    this.later('timeupdate')
  }
  private later(event: MediaSyncEvent): void {
    setTimeout(() => this.dispatchEvent(new Event(event)), 0)
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5))
const leaves: (() => void)[] = []

function pair(): [FakeMedia, FakeMedia] {
  const left = new FakeMedia()
  const right = new FakeMedia()
  leaves.push(joinMediaSyncGroup('pair', left), joinMediaSyncGroup('pair', right))
  return [left, right]
}

afterEach(() => {
  for (const leave of leaves.splice(0)) {
    leave()
  }
})

describe('synced media playback', () => {
  it('plans only what the follower lacks, clamped to its own length', () => {
    const playing = { paused: false, currentTime: 12, playbackRate: 2, duration: 20 }
    const follower = { paused: true, currentTime: 3, playbackRate: 1, duration: 8 }
    expect(followerCommands('play', playing, follower)).toEqual([
      { kind: 'seek', time: 8 },
      { kind: 'play' }
    ])
    expect(followerCommands('ratechange', playing, follower)).toEqual([{ kind: 'rate', rate: 2 }])
    expect(followerCommands('timeupdate', playing, { ...follower, paused: false })).toEqual([
      { kind: 'seek', time: 8 }
    ])
    expect(
      followerCommands('timeupdate', playing, {
        ...follower,
        paused: false,
        currentTime: 11.9,
        duration: 20
      })
    ).toEqual([])
    expect(followerCommands('pause', { ...playing, paused: true }, follower)).toEqual([
      { kind: 'seek', time: 8 }
    ])
  })

  it('mirrors play, seek, speed and pause to the other player without echoing back', async () => {
    const [left, right] = pair()
    expect([left.muted, right.muted]).toEqual([false, true])
    left.currentTime = 4
    await settle()
    expect(right.currentTime).toBe(4)
    void left.play()
    await settle()
    expect(right.paused).toBe(false)
    left.playbackRate = 1.5
    await settle()
    expect(right.playbackRate).toBe(1.5)
    left.pause()
    await settle()
    expect(right.paused).toBe(true)
    expect(left.seeks).toEqual([4])
  })

  it("corrects drift from the leader's clock only, and stops once a player leaves", async () => {
    const [left, right] = pair()
    void right.play()
    await settle()
    right.advance(2)
    await settle()
    expect(left.currentTime).toBe(2)
    left.advance(1)
    await settle()
    expect(right.currentTime).toBe(2)
    leaves.pop()?.()
    right.currentTime = 7
    await settle()
    expect(left.currentTime).toBe(3)
  })
})
