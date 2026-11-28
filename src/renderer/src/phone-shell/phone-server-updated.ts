import { useEffect, useRef, useState } from 'react'

/** How long "Server updated" stays up: long enough to read, short enough not to nag. */
export const SERVER_UPDATED_NOTICE_MS = 6000

export type ServerVersionTracker = {
  /** The version the host reported while the phone last had a working link. */
  seenVersion: string | null
  /** The link has dropped since `seenVersion` was recorded. */
  dropped: boolean
}

export const INITIAL_SERVER_VERSION_TRACKER: ServerVersionTracker = {
  seenVersion: null,
  dropped: false
}

/**
 * Follows the host's reported version across link drops. A host that comes back on a different
 * version than it had before the drop was updated meanwhile; a version change on a link that never
 * dropped is not an update the phone should announce.
 */
export function trackServerVersion(
  tracker: ServerVersionTracker,
  input: { connected: boolean; version: string | null }
): { tracker: ServerVersionTracker; updatedTo: string | null } {
  if (!input.connected) {
    return {
      tracker: tracker.dropped ? tracker : { ...tracker, dropped: true },
      updatedTo: null
    }
  }
  if (!input.version) {
    return { tracker, updatedTo: null }
  }
  const updatedTo =
    tracker.dropped && tracker.seenVersion !== null && tracker.seenVersion !== input.version
      ? input.version
      : null
  return { tracker: { seenVersion: input.version, dropped: false }, updatedTo }
}

/** The version the host just came back on after an update, for a few seconds; otherwise null. */
export function usePhoneServerUpdatedNotice(host: {
  connected: boolean
  appVersion: string | null
}): string | null {
  const trackerRef = useRef(INITIAL_SERVER_VERSION_TRACKER)
  const [updatedTo, setUpdatedTo] = useState<string | null>(null)
  const { connected, appVersion } = host

  useEffect(() => {
    const next = trackServerVersion(trackerRef.current, { connected, version: appVersion })
    trackerRef.current = next.tracker
    if (next.updatedTo) {
      setUpdatedTo(next.updatedTo)
    }
  }, [connected, appVersion])

  useEffect(() => {
    if (!updatedTo) {
      return
    }
    const timer = window.setTimeout(() => setUpdatedTo(null), SERVER_UPDATED_NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [updatedTo])

  return updatedTo
}
