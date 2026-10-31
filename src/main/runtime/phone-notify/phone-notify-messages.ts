import type { PhoneNotifyPayload } from '../../../shared/phone-notify-contract'
import { mapPushAgentState } from '../push/push-dispatcher'
import type { MobileNotificationEvent } from '../runtime-mobile-notification-controller'

const TITLE_MAX_LENGTH = 80
const BODY_MAX_LENGTH = 120

/** One push, before it is encrypted per subscription. */
export type PhoneNotifyMessage = {
  payload: PhoneNotifyPayload
  urgency: 'high' | 'normal'
  /** Repeats of one key within the burst cooldown collapse, per device. */
  cooldownKey: string
}

export type PhoneNotifyRunEnd = {
  worktreeId: string
  experiment: string
  experimentName: string
  run: string
  runName: string
  state: 'succeeded' | 'failed'
}

function clip(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`
}

/**
 * A push for an agent that started waiting on the user. The title is the host's own
 * "workspace - agent needs input"; the event body (the agent's words) is never sent.
 */
export function agentNeedsYouMessage(event: MobileNotificationEvent): PhoneNotifyMessage | null {
  if (
    event.type !== 'notification' ||
    event.desktopAllowed === false ||
    mapPushAgentState(event.source, event.agentState) !== 'needs-input'
  ) {
    return null
  }
  const scope = event.attentionKey ?? event.worktreeId ?? 'global'
  return {
    payload: {
      v: 1,
      id: event.notificationId ?? `needs-you:${scope}:${event.emittedAt ?? 0}`,
      title: clip(event.title, TITLE_MAX_LENGTH),
      body: 'Needs you',
      ...(event.worktreeId ? { target: { kind: 'session', worktreeId: event.worktreeId } } : {})
    },
    urgency: 'high',
    cooldownKey: `needs-you:${scope}`
  }
}

export function runEndedMessage(run: PhoneNotifyRunEnd): PhoneNotifyMessage {
  const runKey = `${run.worktreeId}\0${run.experiment}\0${run.run}`
  const title = clip(run.runName || run.run, TITLE_MAX_LENGTH)
  return {
    payload: {
      v: 1,
      id: `run:${runKey}:${run.state}`,
      title,
      body: clip(
        `${run.state === 'failed' ? 'Run failed' : 'Run finished'} · ${run.experimentName}`,
        BODY_MAX_LENGTH
      ),
      target: {
        kind: 'run',
        worktreeId: run.worktreeId,
        experiment: run.experiment,
        run: run.run,
        title
      }
    },
    urgency: 'normal',
    cooldownKey: `run:${runKey}`
  }
}
