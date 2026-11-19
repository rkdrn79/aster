import { ClipboardList, FlaskConical } from 'lucide-react'
import { formatShortTimeAgo } from '@/lib/short-time-ago'
import { HOST_UPDATE_NEEDED_TEXT } from '@/web/web-research-decisions'
import { usePhoneNavigation } from './phone-navigation-store'
import {
  phoneDecisionItems,
  phoneDecisionsNeedUpdate,
  usePhoneDecisions,
  usePhoneDecisionsRefresh,
  type PhoneDecisionItem
} from './phone-research-decisions'
import { usePhoneResearchOverviews } from './phone-research-overviews'
import { PhoneRow, PhoneSection, PhoneSectionNote, PhoneStatusPill } from './PhoneListLayout'

const SHOWN = 4

/** Workspaces whose host read found an `.aster/` catalog, so there is something to decide. */
function useCatalogWorkspaces(worktreeIds: readonly string[]): string[] {
  const overviews = usePhoneResearchOverviews((state) => state.byWorktreeId)
  return worktreeIds.filter((id) => {
    const overview = overviews[id]
    return overview?.status === 'ready' && overview.result.catalog.status === 'present'
  })
}

export function usePhoneDecisionItems(worktreeIds: readonly string[]): {
  items: PhoneDecisionItem[]
  updateNeeded: boolean
} {
  const ids = useCatalogWorkspaces(worktreeIds)
  usePhoneDecisionsRefresh(ids)
  const reads = usePhoneDecisions((state) => state.byWorktreeId)
  return {
    items: phoneDecisionItems(reads, ids),
    updateNeeded: phoneDecisionsNeedUpdate(reads, ids)
  }
}

export function openPhoneDecision(item: PhoneDecisionItem, subtitle?: string): void {
  const { push } = usePhoneNavigation.getState()
  if (item.kind === 'plan') {
    push({
      kind: 'plan',
      worktreeId: item.worktreeId,
      plan: item.plan.id,
      title: item.plan.title,
      subtitle
    })
    return
  }
  push({
    kind: 'proposal',
    worktreeId: item.worktreeId,
    experiment: item.proposal.experiment,
    proposal: item.proposal.id,
    title: item.proposal.title,
    subtitle: subtitle ?? item.proposal.experiment
  })
}

export function PhoneDecisionRow({
  item,
  context,
  now
}: {
  item: PhoneDecisionItem
  /** The project or workspace the record belongs to, when the list mixes several. */
  context: string | null
  now: number
}): React.JSX.Element {
  if (item.kind === 'plan') {
    return (
      <PhoneRow
        leading={<ClipboardList className="size-5" aria-hidden />}
        title={item.plan.title}
        subtitle={[context, `Plan · revision ${item.plan.revision}`].filter(Boolean).join(' · ')}
        trailing={<PhoneStatusPill tone="attention">Approve plan</PhoneStatusPill>}
        onClick={() => openPhoneDecision(item, context ?? undefined)}
      />
    )
  }
  const { proposal } = item
  return (
    <PhoneRow
      leading={<FlaskConical className="size-5" aria-hidden />}
      title={proposal.title}
      subtitle={[context, proposal.experiment, formatShortTimeAgo(Date.parse(proposal.at), now)]
        .filter(Boolean)
        .join(' · ')}
      trailing={<PhoneStatusPill tone="attention">Proposal</PhoneStatusPill>}
      onClick={() => openPhoneDecision(item, context ?? undefined)}
    />
  )
}

/** Agent proposals and submitted plans waiting for the person, newest asks last. */
export function PhoneDecisionsSection({
  items,
  updateNeeded,
  contextOf,
  now
}: {
  items: readonly PhoneDecisionItem[]
  updateNeeded: boolean
  contextOf: (worktreeId: string) => string | null
  now: number
}): React.JSX.Element | null {
  if (items.length === 0 && !updateNeeded) {
    return null
  }
  return (
    <PhoneSection label={items.length ? 'Waiting for your decision' : 'Proposals and plans'}>
      {items.slice(0, SHOWN).map((item) => (
        <PhoneDecisionRow
          key={`${item.worktreeId}/${item.kind === 'plan' ? item.plan.id : `${item.proposal.experiment}/${item.proposal.id}`}`}
          item={item}
          context={contextOf(item.worktreeId)}
          now={now}
        />
      ))}
      {items.length > SHOWN ? (
        <PhoneSectionNote>{`${items.length - SHOWN} more in their projects`}</PhoneSectionNote>
      ) : null}
      {updateNeeded ? (
        <PhoneSectionNote>{`They can’t be read here yet. ${HOST_UPDATE_NEEDED_TEXT}`}</PhoneSectionNote>
      ) : null}
    </PhoneSection>
  )
}
