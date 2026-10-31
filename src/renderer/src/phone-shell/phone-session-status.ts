import type { PhoneSession } from './phone-sessions'
import type { PhoneStatusTone } from './PhoneListLayout'

export type PhoneSessionStatus = {
  /** Plain-language state for a subtitle or header. */
  label: string
  /** A pill only for states worth a glance: questions, live work, outcomes. */
  pill: { label: string; tone: PhoneStatusTone } | null
}

export function phoneSessionStatus(
  session: Pick<PhoneSession, 'state' | 'agentType' | 'running'>
): PhoneSessionStatus {
  switch (session.state) {
    case 'waiting':
    case 'blocked':
    case 'permission':
      return { label: 'Waiting for you', pill: { label: 'Needs you', tone: 'attention' } }
    case 'working':
    case 'monitoring':
      return { label: 'Working', pill: { label: 'Working', tone: 'working' } }
    case 'failed':
      return { label: 'Failed', pill: { label: 'Failed', tone: 'danger' } }
    case 'done':
      return { label: 'Finished', pill: { label: 'Done', tone: 'success' } }
    case 'interrupted':
      return { label: 'Stopped', pill: null }
    case 'unconfirmed':
    case 'unverifiable':
      return { label: 'No recent update', pill: null }
    case 'idle':
      return {
        label: !session.running ? 'Not running' : session.agentType ? 'Idle' : 'Terminal',
        pill: null
      }
  }
}
