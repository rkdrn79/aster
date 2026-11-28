/** User-facing words for the automatic server updates; every string goes through the catalog. */
import { compareAppVersions, isValidAppVersion } from '../../../../shared/app-version'
import {
  DEFAULT_SERVER_AUTO_UPDATE_MODE,
  normalizeServerAutoUpdateMode,
  type ServerAutoUpdateHostStatus,
  type ServerAutoUpdateMode,
  type ServerAutoUpdateNowResult
} from '../../../../shared/server-auto-update'
import { translate } from '@/i18n/i18n'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'

export function serverAutoUpdateModeLabel(mode: ServerAutoUpdateMode): string {
  switch (mode) {
    case 'idle':
      return translate('auto.components.settings.serverAutoUpdate.modeIdle', 'When idle')
    case 'ask':
      return translate('auto.components.settings.serverAutoUpdate.modeAsk', 'Ask first')
    case 'off':
      return translate('auto.components.settings.serverAutoUpdate.modeOff', 'Off')
  }
}

/** The per-host choice that leaves the host on the global setting, worded with what that is now. */
export function followGlobalSettingLabel(globalMode: unknown): string {
  return translate(
    'auto.components.settings.serverAutoUpdate.followGlobal',
    'Follow global setting ({{mode}})',
    {
      mode: serverAutoUpdateModeLabel(
        normalizeServerAutoUpdateMode(globalMode) ?? DEFAULT_SERVER_AUTO_UPDATE_MODE
      )
    }
  )
}

export type ServerAutoUpdateLineTone = 'muted' | 'warning' | 'destructive'

export type ServerAutoUpdateLineCopy = {
  text: string
  tone: ServerAutoUpdateLineTone
  /** A spinner stands in for the status mark while the host is changing. */
  busy: boolean
}

/** How many chat agents hold the update back; zero unless they are the reason it waits. */
export function agentsWorkingCount(status: ServerAutoUpdateHostStatus): number {
  return status.wait?.reason === 'agents-working' ? status.wait.agents : 0
}

/** True when this app bundles a build newer than the one the host runs. */
export function hasNewerBundledVersion(status: ServerAutoUpdateHostStatus): boolean {
  const { activeVersion, bundledVersion } = status
  if (!activeVersion || !bundledVersion) {
    return false
  }
  return (
    isValidAppVersion(activeVersion) &&
    isValidAppVersion(bundledVersion) &&
    compareAppVersions(activeVersion, bundledVersion) < 0
  )
}

/** Whether the row offers Update now: a held-back or failed update, or one the user chose to run. */
export function canUpdateNow(status: ServerAutoUpdateHostStatus): boolean {
  if (status.phase === 'waiting' || status.phase === 'failed') {
    return true
  }
  const waitsForUser = status.mode === 'ask' || status.mode === 'off'
  return (
    waitsForUser &&
    status.phase !== 'updating' &&
    status.phase !== 'checking' &&
    status.phase !== 'unknown' &&
    hasNewerBundledVersion(status)
  )
}

/** Updating now cuts the replies of working agents, so that one asks first. */
export function updateNowNeedsConfirmation(status: ServerAutoUpdateHostStatus): boolean {
  return agentsWorkingCount(status) > 0
}

/** A reason from the desktop ends as a sentence, so the line after it reads on. */
function asSentence(reason: string | undefined): string {
  const trimmed = (reason ?? '').trim()
  return trimmed && !/[.!?。]$/.test(trimmed) ? `${trimmed}.` : trimmed
}

function failedLine(reason: string | undefined): string {
  return translate(
    'auto.components.settings.serverAutoUpdate.failed',
    'Update failed: {{reason}} The previous version keeps running.',
    { reason: asSentence(reason) }
  ).replace(/\s{2,}/g, ' ')
}

function waitingLine(status: ServerAutoUpdateHostStatus): string {
  const wait = status.wait
  if (!wait) {
    return translate('auto.components.settings.serverAutoUpdate.waitingGeneric', 'Update waiting')
  }
  switch (wait.reason) {
    case 'agents-working':
      return agentsWorkingLine(wait.agents, status.hostLabel)
    case 'ask':
      return translate(
        'auto.components.settings.serverAutoUpdate.waitingAsk',
        'Update ready — waiting for your OK'
      )
    case 'terminals':
    case 'unreachable':
    case 'other':
      return translate(
        'auto.components.settings.serverAutoUpdate.waitingDetail',
        'Update waiting: {{detail}}',
        { detail: wait.detail }
      )
  }
}

function agentsWorkingLine(agents: number, hostLabel: string): string {
  return translate(
    'auto.components.settings.serverAutoUpdate.waitingAgents',
    'Update waiting: {{count}} agents working on {{host}}',
    {
      count: agents,
      host: hostLabel,
      defaultValue_one: 'Update waiting: {{count}} agent working on {{host}}'
    }
  )
}

function updatedLine(status: ServerAutoUpdateHostStatus, now: number): string {
  const when = status.updatedAt ? Date.parse(status.updatedAt) : Number.NaN
  const time = Number.isNaN(when)
    ? translate('auto.components.settings.serverAutoUpdate.justNow', 'just now')
    : formatUiRelativeTime(when - now)
  const base = status.updatedFrom
    ? translate(
        'auto.components.settings.serverAutoUpdate.updatedFrom',
        'Updated {{time}} from {{from}}',
        { time, from: status.updatedFrom }
      )
    : translate('auto.components.settings.serverAutoUpdate.updated', 'Updated {{time}}', { time })
  const resumed = status.resumedChats ?? 0
  if (resumed <= 0) {
    return base
  }
  return `${base} · ${translate(
    'auto.components.settings.serverAutoUpdate.chatsContinued',
    '{{count}} chats continued',
    { count: resumed, defaultValue_one: '{{count}} chat continued' }
  )}`
}

/** The row's one status line, or null when there is nothing to say yet. */
export function serverAutoUpdateStatusLine(
  status: ServerAutoUpdateHostStatus,
  now: number = Date.now()
): ServerAutoUpdateLineCopy | null {
  switch (status.phase) {
    case 'up-to-date': {
      const version = status.activeVersion ?? status.bundledVersion
      return {
        text: version
          ? translate(
              'auto.components.settings.serverAutoUpdate.upToDate',
              'Up to date · {{version}}',
              { version }
            )
          : translate('auto.components.settings.serverAutoUpdate.upToDateShort', 'Up to date'),
        tone: 'muted',
        busy: false
      }
    }
    case 'waiting':
      return { text: waitingLine(status), tone: 'warning', busy: false }
    case 'updating':
      return {
        text: status.bundledVersion
          ? translate(
              'auto.components.settings.serverAutoUpdate.updating',
              'Updating to {{version}}…',
              { version: status.bundledVersion }
            )
          : translate('auto.components.settings.serverAutoUpdate.updatingShort', 'Updating…'),
        tone: 'muted',
        busy: true
      }
    case 'updated':
      return { text: updatedLine(status, now), tone: 'muted', busy: false }
    case 'failed':
      return {
        text: failedLine(status.failure),
        tone: 'destructive',
        busy: false
      }
    case 'off':
      return {
        text:
          hasNewerBundledVersion(status) && status.bundledVersion
            ? translate(
                'auto.components.settings.serverAutoUpdate.offWithNewer',
                'Automatic updates are off for this host · {{version}} is available',
                { version: status.bundledVersion }
              )
            : translate(
                'auto.components.settings.serverAutoUpdate.off',
                'Automatic updates are off for this host'
              ),
        tone: 'muted',
        busy: false
      }
    case 'checking':
      return {
        text: translate('auto.components.settings.serverAutoUpdate.checking', 'Checking…'),
        tone: 'muted',
        busy: true
      }
    case 'unknown':
      return null
  }
}

export function updateNowConfirmationText(agents: number, hostLabel: string): string {
  return translate(
    'auto.components.settings.serverAutoUpdate.confirmBody',
    '{{count}} agents are working on {{host}}. Updating now stops their current replies; Aster continues those chats after the update. Terminals and jobs keep running.',
    {
      count: agents,
      host: hostLabel,
      defaultValue_one:
        '{{count}} agent is working on {{host}}. Updating now stops its current reply; Aster continues that chat after the update. Terminals and jobs keep running.'
    }
  )
}

export type ServerAutoUpdateNowMessage = {
  kind: 'success' | 'info' | 'error'
  text: string
}

/** What a finished Update now tells the person, in one line. */
export function serverAutoUpdateNowMessage(
  result: ServerAutoUpdateNowResult,
  hostLabel: string
): ServerAutoUpdateNowMessage {
  switch (result.outcome) {
    case 'updated': {
      const base = translate(
        'auto.components.settings.serverAutoUpdate.nowUpdated',
        '{{host}} updated to {{version}}.',
        { host: hostLabel, version: result.activeVersion }
      )
      return {
        kind: 'success',
        text:
          result.resumedChats > 0
            ? `${base} ${translate(
                'auto.components.settings.serverAutoUpdate.nowResumed',
                '{{count}} chats continued.',
                {
                  count: result.resumedChats,
                  defaultValue_one: '{{count}} chat continued.'
                }
              )}`
            : base
      }
    }
    case 'already-current':
      return {
        kind: 'info',
        text: translate(
          'auto.components.settings.serverAutoUpdate.nowCurrent',
          '{{host}} is already on {{version}}.',
          { host: hostLabel, version: result.activeVersion }
        )
      }
    case 'deferred':
      return {
        kind: 'info',
        text: translate(
          'auto.components.settings.serverAutoUpdate.nowDeferred',
          'Not updated yet: {{reason}}',
          { reason: result.reason }
        )
      }
    case 'failed':
      return {
        kind: 'error',
        text: failedLine(result.reason)
      }
  }
}
