import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { AgentDotState } from '@/components/AgentStateDot'
import type { ResearchRunExecutionState } from '../../../shared/research/research-run-manifest'
import {
  phoneRunKey,
  phoneSessionKey,
  runsThatEnded,
  sessionsEnteringNeedsYou
} from './phone-attention-events'
import {
  isPhoneRunOnScreen,
  isPhoneSessionOnScreen,
  openPhoneRunFromNotice,
  openPhoneSessionFromNotice
} from './phone-attention-open'
import {
  refreshPhoneResearchOverview,
  usePhoneResearchOverviews,
  type PhoneResearchOverview
} from './phone-research-overviews'
import { listPhoneRuns, type PhoneRunSummary } from './phone-run-summaries'
import { phoneSessionNeedsYou, type PhoneSession } from './phone-sessions'
import { phoneWorkspaceLabel, usePhoneProjects } from './use-phone-projects'

const RUNNING_RUN_REREAD_MS = 60_000
const NOTICE_DURATION_MS = 8_000

/** The Home Screen icon's count; iOS shows it only once notifications are allowed. */
function syncPhoneAppBadge(count: number): void {
  if (typeof navigator.setAppBadge !== 'function') {
    return
  }
  const update = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()
  // Why ignored: a browser without the permission refuses, and the in-app count still shows.
  update.catch(() => {})
}

function listCachedRuns(
  byWorktreeId: Readonly<Record<string, PhoneResearchOverview>>
): PhoneRunSummary[] {
  return Object.entries(byWorktreeId).flatMap(([worktreeId, overview]) =>
    overview.status === 'ready' ? listPhoneRuns(worktreeId, overview.result) : []
  )
}

function announceRun(summary: PhoneRunSummary): void {
  const failed = summary.run.state === 'failed'
  toast(summary.run.name || summary.run.id, {
    id: `phone-run-${phoneRunKey(summary)}`,
    description: `${failed ? 'Run failed' : 'Run finished'} · ${summary.experimentName}`,
    position: 'top-center',
    duration: NOTICE_DURATION_MS,
    action: { label: 'Open', onClick: () => openPhoneRunFromNotice(summary) }
  })
}

/** Re-reads only workspaces with a Run still running, and only while the app is in front. */
function useRunningRunReread(): void {
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return
      }
      for (const [worktreeId, overview] of Object.entries(
        usePhoneResearchOverviews.getState().byWorktreeId
      )) {
        const running =
          overview.status === 'ready' &&
          overview.result.experiments.some((experiment) =>
            experiment.runs.some((run) => run.state === 'running')
          )
        if (running) {
          void refreshPhoneResearchOverview(worktreeId, true)
        }
      }
    }, RUNNING_RUN_REREAD_MS)
    return () => window.clearInterval(timer)
  }, [])
}

/**
 * While the phone app is open: the icon badge counts sessions waiting on the user, and a banner
 * says when one starts waiting or a Run ends, unless the user is already looking at it.
 */
export function usePhoneAttention(sessions: readonly PhoneSession[]): void {
  const { byWorkspaceId } = usePhoneProjects()
  const workspaceLabelsRef = useRef(byWorkspaceId)
  workspaceLabelsRef.current = byWorkspaceId
  const sessionStatesRef = useRef<Map<string, AgentDotState> | null>(null)
  const needsYouCount = sessions.filter(
    (session) => session.running && phoneSessionNeedsYou(session.state)
  ).length

  useEffect(() => syncPhoneAppBadge(needsYouCount), [needsYouCount])

  useEffect(() => {
    for (const session of sessionsEnteringNeedsYou(sessionStatesRef.current, sessions)) {
      if (!session.running || isPhoneSessionOnScreen(session)) {
        continue
      }
      const workspaceLabel = phoneWorkspaceLabel(workspaceLabelsRef.current.get(session.worktreeId))
      toast(session.title, {
        id: `phone-needs-you-${phoneSessionKey(session)}`,
        description: `Needs you · ${workspaceLabel}`,
        position: 'top-center',
        duration: NOTICE_DURATION_MS,
        action: {
          label: 'Open',
          onClick: () => openPhoneSessionFromNotice(session, workspaceLabel)
        }
      })
    }
    sessionStatesRef.current = new Map(
      sessions.map((session) => [phoneSessionKey(session), session.state])
    )
  }, [sessions])

  useEffect(() => {
    const runStates = (runs: readonly PhoneRunSummary[]): Map<string, ResearchRunExecutionState> =>
      new Map(runs.map((summary) => [phoneRunKey(summary), summary.run.state]))
    let previous = runStates(listCachedRuns(usePhoneResearchOverviews.getState().byWorktreeId))
    return usePhoneResearchOverviews.subscribe((state) => {
      const runs = listCachedRuns(state.byWorktreeId)
      for (const summary of runsThatEnded(previous, runs)) {
        if (!isPhoneRunOnScreen(summary)) {
          announceRun(summary)
        }
      }
      // Why merged: a workspace mid-reload lists no Runs, and must not forget the ones running.
      previous = new Map([...previous, ...runStates(runs)])
    })
  }, [])

  useRunningRunReread()
}
