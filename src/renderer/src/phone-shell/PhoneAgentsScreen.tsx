import { Bot } from 'lucide-react'
import { useDeadlineClock } from '@/features/research/use-deadline-clock'
import type { PhoneSession } from './phone-sessions'
import type { PhoneSessionFamily } from './phone-session-families'
import { PhoneIdleShellRows } from './PhoneIdleShellRows'
import { PhoneEmptyState, PhoneScrollBody, PhoneSection, PhoneSectionNote } from './PhoneListLayout'
import { PhoneSessionFamilyRows } from './PhoneSessionFamilyRows'
import { PhoneSessionRow } from './PhoneSessionRow'
import { usePhoneSessionFamilies } from './use-phone-sessions'
import {
  phoneWorkspaceLabel,
  usePhoneProjects,
  type PhoneWorkspaceEntry
} from './use-phone-projects'

type FamilyGroup = { key: string; label?: string; families: PhoneSessionFamily[] }

/** One group per project when there are several; otherwise the project is obvious. */
function groupFamilies(
  families: readonly PhoneSessionFamily[],
  byWorkspaceId: ReadonlyMap<string, PhoneWorkspaceEntry>
): FamilyGroup[] {
  const live = families.filter((family) => family.running)
  const ended = families.filter((family) => !family.running)
  const projectOf = (family: PhoneSessionFamily) =>
    byWorkspaceId.get(family.session.worktreeId)?.project
  const projectKeys = new Set(live.map((family) => projectOf(family)?.key))
  const groups: FamilyGroup[] = []
  if (projectKeys.size > 1) {
    for (const family of live) {
      const project = projectOf(family)
      const key = project?.key ?? 'other'
      const group = groups.find((entry) => entry.key === key)
      if (group) {
        group.families.push(family)
      } else {
        groups.push({ key, label: project?.name ?? 'Other', families: [family] })
      }
    }
  } else if (live.length > 0) {
    groups.push({ key: 'live', families: live })
  }
  if (ended.length > 0) {
    groups.push({ key: 'ended', label: 'Not running', families: ended })
  }
  return groups
}

/** Every terminal and agent across workspaces, questions first, then live work, then the rest.
 *  Subagents fold under the session that launched them. */
export function PhoneAgentsScreen({ sessions }: { sessions: PhoneSession[] }): React.JSX.Element {
  const { byWorkspaceId } = usePhoneProjects()
  const now = useDeadlineClock(30_000)
  const idleShells = sessions.filter((session) => session.idleShell)
  const families = usePhoneSessionFamilies(sessions.filter((session) => !session.idleShell))
  const groups = groupFamilies(families, byWorkspaceId)
  if (groups.length === 0 && idleShells.length === 0) {
    return (
      <PhoneEmptyState icon={Bot} title="No agents or terminals">
        Open a project on Home and start a terminal there.
      </PhoneEmptyState>
    )
  }
  const headerSubtitleOf = (session: PhoneSession) =>
    phoneWorkspaceLabel(byWorkspaceId.get(session.worktreeId))
  const workspaceNameOf = (session: PhoneSession) => {
    const entry = byWorkspaceId.get(session.worktreeId)
    return entry && entry.project.workspaces.length > 1 ? entry.workspace.name : undefined
  }
  const row = (session: PhoneSession): React.ReactNode => (
    <PhoneSessionRow
      key={`${session.worktreeId}\0${session.tabId}`}
      session={session}
      headerSubtitle={headerSubtitleOf(session)}
      workspaceName={workspaceNameOf(session)}
      now={now}
    />
  )
  return (
    <PhoneScrollBody>
      {groups.length === 0 ? (
        <PhoneSection>
          <PhoneSectionNote>No agents or busy terminals right now</PhoneSectionNote>
        </PhoneSection>
      ) : null}
      {groups.map((group) => (
        <PhoneSection key={group.key} label={group.label}>
          {group.families.map((family) => (
            <PhoneSessionFamilyRows
              key={`${family.session.worktreeId}\0${family.session.tabId}`}
              family={family}
              headerSubtitleOf={headerSubtitleOf}
              workspaceNameOf={workspaceNameOf}
              now={now}
            />
          ))}
        </PhoneSection>
      ))}
      {idleShells.length > 0 ? (
        <PhoneSection>
          <PhoneIdleShellRows sessions={idleShells} renderRow={row} />
        </PhoneSection>
      ) : null}
    </PhoneScrollBody>
  )
}
