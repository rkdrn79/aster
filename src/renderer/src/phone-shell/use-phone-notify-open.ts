import { useEffect, useState } from 'react'
import {
  PhoneNotifyTargetSchema,
  type PhoneNotifyTarget
} from '../../../shared/phone-notify-contract'
import { openPhoneSessionFromNotice, showPhoneTab } from './phone-attention-open'
import { usePhoneNavigation } from './phone-navigation-store'
import type { PhoneSession } from './phone-sessions'
import { phoneWorkspaceLabel, usePhoneProjects } from './use-phone-projects'

const NOTIFY_QUERY_KEY = 'notify'
// Why this long: a cold start from a tap pairs and connects through the relay first.
const SESSION_WAIT_MS = 30_000

function parseTarget(value: unknown): PhoneNotifyTarget | null {
  const parsed = PhoneNotifyTargetSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

// Why cached and cleared in an effect: a render React throws away (a suspended lazy child) must
// not consume the target, so the read is pure and repeatable until the shell commits.
let launchTarget: PhoneNotifyTarget | null | undefined

/** The target a tap opened the app with (`?notify=`). */
function readLaunchTarget(): PhoneNotifyTarget | null {
  if (launchTarget !== undefined) {
    return launchTarget
  }
  const raw = new URL(window.location.href).searchParams.get(NOTIFY_QUERY_KEY)
  try {
    launchTarget = raw === null ? null : parseTarget(JSON.parse(raw))
  } catch {
    launchTarget = null
  }
  return launchTarget
}

function clearLaunchTarget(): void {
  launchTarget = null
  const url = new URL(window.location.href)
  if (url.searchParams.has(NOTIFY_QUERY_KEY)) {
    url.searchParams.delete(NOTIFY_QUERY_KEY)
    window.history.replaceState(window.history.state, '', url.href)
  }
}

/**
 * Opens what a tapped notification names: from the service worker's message while the app runs,
 * or from the launch URL after a cold start. A session waits until the host lists it.
 */
export function usePhoneNotifyOpen(sessions: readonly PhoneSession[]): void {
  const [pending, setPending] = useState<PhoneNotifyTarget | null>(readLaunchTarget)
  const { byWorkspaceId } = usePhoneProjects()

  useEffect(() => {
    clearLaunchTarget()
    if (!('serviceWorker' in navigator)) {
      return
    }
    const onMessage = (event: MessageEvent<unknown>): void => {
      const data = event.data
      if (data && typeof data === 'object' && Reflect.get(data, 'type') === 'aster-notify-open') {
        setPending(parseTarget(Reflect.get(data, 'target')))
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!pending) {
      return
    }
    if (pending.kind === 'run') {
      showPhoneTab('runs')
      usePhoneNavigation.getState().push({
        kind: 'run',
        worktreeId: pending.worktreeId,
        experiment: pending.experiment,
        run: pending.run,
        title: pending.title || pending.run
      })
      setPending(null)
      return
    }
    // Sessions are sorted most urgent first, so this is the one that asked.
    const session = sessions.find(
      (entry) => entry.worktreeId === pending.worktreeId && entry.running
    )
    if (session) {
      openPhoneSessionFromNotice(
        session,
        phoneWorkspaceLabel(byWorkspaceId.get(session.worktreeId))
      )
      setPending(null)
      return
    }
    const timer = window.setTimeout(() => {
      showPhoneTab('agents')
      setPending(null)
    }, SESSION_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [pending, sessions, byWorkspaceId])
}
