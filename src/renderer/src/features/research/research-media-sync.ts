/** The playback a synced player copies; HTMLMediaElement satisfies it. */
export type SyncedMedia = {
  readonly paused: boolean
  currentTime: number
  playbackRate: number
  readonly duration: number
  muted: boolean
  play: () => Promise<void>
  pause: () => void
  addEventListener: (type: MediaSyncEvent, listener: () => void) => void
  removeEventListener: (type: MediaSyncEvent, listener: () => void) => void
}

export type MediaPlaybackState = Pick<
  SyncedMedia,
  'paused' | 'currentTime' | 'playbackRate' | 'duration'
>

const MEDIA_SYNC_EVENTS = ['play', 'pause', 'seeked', 'ratechange', 'timeupdate'] as const
export type MediaSyncEvent = (typeof MEDIA_SYNC_EVENTS)[number]

export type MediaSyncCommand =
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'seek'; time: number }
  | { kind: 'rate'; rate: number }

const SEEK_TOLERANCE_SECONDS = 0.15
// Why looser while playing: decoders drift a little; reseeking on every tick would stutter.
const DRIFT_TOLERANCE_SECONDS = 0.3
// Why a window: an echo that never fires (a refused play) must not swallow the next real action.
const ECHO_WINDOW_MS = 1000

function seekTo(
  leader: MediaPlaybackState,
  follower: MediaPlaybackState,
  tolerance: number
): MediaSyncCommand[] {
  const time = Number.isFinite(follower.duration)
    ? Math.min(leader.currentTime, follower.duration)
    : leader.currentTime
  return Math.abs(follower.currentTime - time) > tolerance ? [{ kind: 'seek', time }] : []
}

/** What a follower must do to match the player the user just acted on. */
export function followerCommands(
  event: MediaSyncEvent,
  leader: MediaPlaybackState,
  follower: MediaPlaybackState
): MediaSyncCommand[] {
  switch (event) {
    case 'play':
      return follower.paused
        ? [...seekTo(leader, follower, SEEK_TOLERANCE_SECONDS), { kind: 'play' }]
        : []
    case 'pause':
      return [
        ...(follower.paused ? [] : [{ kind: 'pause' } as const]),
        ...seekTo(leader, follower, SEEK_TOLERANCE_SECONDS)
      ]
    case 'seeked':
      return seekTo(leader, follower, SEEK_TOLERANCE_SECONDS)
    case 'ratechange':
      return follower.playbackRate === leader.playbackRate
        ? []
        : [{ kind: 'rate', rate: leader.playbackRate }]
    case 'timeupdate':
      return leader.paused || follower.paused
        ? []
        : seekTo(leader, follower, DRIFT_TOLERANCE_SECONDS)
  }
}

const ECHO_OF: Record<MediaSyncCommand['kind'], MediaSyncEvent> = {
  play: 'play',
  pause: 'pause',
  seek: 'seeked',
  rate: 'ratechange'
}

type MediaSyncGroup = {
  members: Set<SyncedMedia>
  /** The player the user last acted on; only its clock corrects drift. */
  leader: SyncedMedia | null
  /** Events a command will make a follower fire, by expiry time. */
  echoes: Map<SyncedMedia, Map<MediaSyncEvent, number>>
}

const groups = new Map<string, MediaSyncGroup>()

function consumeEcho(group: MediaSyncGroup, media: SyncedMedia, event: MediaSyncEvent): boolean {
  const expected = group.echoes.get(media)
  const until = expected?.get(event)
  if (until === undefined) {
    return false
  }
  expected?.delete(event)
  return until >= Date.now()
}

function apply(group: MediaSyncGroup, media: SyncedMedia, command: MediaSyncCommand): void {
  const expected = group.echoes.get(media) ?? new Map<MediaSyncEvent, number>()
  group.echoes.set(media, expected)
  expected.set(ECHO_OF[command.kind], Date.now() + ECHO_WINDOW_MS)
  switch (command.kind) {
    case 'play':
      void media.play().catch(() => expected.delete('play'))
      return
    case 'pause':
      media.pause()
      return
    case 'seek':
      media.currentTime = command.time
      return
    case 'rate':
      media.playbackRate = command.rate
  }
}

function follow(group: MediaSyncGroup, source: SyncedMedia, event: MediaSyncEvent): void {
  if (event !== 'timeupdate' && consumeEcho(group, source, event)) {
    return
  }
  if (event !== 'timeupdate') {
    group.leader = source
  } else if (group.leader !== source) {
    return
  }
  for (const member of group.members) {
    if (member !== source) {
      for (const command of followerCommands(event, source, member)) {
        apply(group, member, command)
      }
    }
  }
}

/**
 * Keeps play, pause, seeking and speed the same across every player that joined `key`. Players
 * after the first start muted. Returns the function that leaves the group.
 */
export function joinMediaSyncGroup(key: string, media: SyncedMedia): () => void {
  const group = groups.get(key) ?? { members: new Set(), leader: null, echoes: new Map() }
  groups.set(key, group)
  if (group.members.size > 0) {
    // Why: two soundtracks at once drown each other out; the user can unmute either.
    media.muted = true
  }
  group.members.add(media)
  const listeners = MEDIA_SYNC_EVENTS.map((event) => {
    const listener = (): void => follow(group, media, event)
    media.addEventListener(event, listener)
    return [event, listener] as const
  })
  return () => {
    for (const [event, listener] of listeners) {
      media.removeEventListener(event, listener)
    }
    group.members.delete(media)
    group.echoes.delete(media)
    if (group.leader === media) {
      group.leader = null
    }
    if (group.members.size === 0 && groups.get(key) === group) {
      groups.delete(key)
    }
  }
}
