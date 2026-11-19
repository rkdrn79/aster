import { useEffect, useState } from 'react'
import { MessagesSquare } from 'lucide-react'
import {
  openRebuttalProject,
  selectRebuttal,
  useRebuttalAutoRefresh,
  useResearchRebuttal
} from '@/features/research/research-rebuttal-store'
import { rebuttalOwnerKey } from '@/features/research/research-rebuttal-files'
import { cn } from '@/lib/utils'
import type {
  RebuttalBundle,
  RebuttalCluster,
  RebuttalPoint
} from '../../../research-harness/research-rebuttal-model.mjs'
import { PhoneEmptyState, PhoneScrollBody, PhoneSection, PhoneSectionNote } from './PhoneListLayout'
import { PhoneRebuttalReply } from './PhoneRebuttalReply'
import { usePhoneProjectOwner } from './use-phone-figures'

const GENERAL = 'general'

/** The reply groups that answer `reviewer`'s points, in the order of those points. */
function reviewerGroups(
  bundle: RebuttalBundle,
  reviewer: string
): { cluster: RebuttalCluster; points: RebuttalPoint[] }[] {
  if (reviewer === GENERAL) {
    return bundle.clusters
      .filter((cluster) => cluster.general)
      .map((cluster) => ({ cluster, points: [] }))
  }
  const points = bundle.points.filter((point) => point.reviewer === reviewer)
  const groups: { cluster: RebuttalCluster; points: RebuttalPoint[] }[] = []
  for (const point of points) {
    const cluster = bundle.clusters.find((entry) => entry.points.includes(point.id))
    if (!cluster) {
      continue
    }
    const group = groups.find((entry) => entry.cluster.id === cluster.id)
    if (group) {
      group.points.push(point)
    } else {
      groups.push({ cluster, points: [point] })
    }
  }
  return groups
}

function Chip({
  selected,
  onClick,
  children
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'h-9 shrink-0 rounded-lg border border-border px-3 text-[14px] font-medium active:bg-accent',
        selected && 'border-foreground bg-secondary'
      )}
    >
      {children}
    </button>
  )
}

/** A rebuttal on the phone: each reviewer's points with the draft answers, to accept or edit. */
export function PhoneRebuttalScreen({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const owner = usePhoneProjectOwner(worktreeId)
  const state = useResearchRebuttal()
  const [reviewer, setReviewer] = useState<string | null>(null)
  useEffect(() => {
    if (owner) {
      void openRebuttalProject(owner)
    }
  }, [owner])
  const mine = owner !== null && state.ownerKey === rebuttalOwnerKey(owner)
  useRebuttalAutoRefresh(owner, mine)
  const snapshot = mine ? state.snapshot : null
  if (!owner || !snapshot) {
    const done = mine && !state.loading
    return (
      <PhoneEmptyState
        icon={MessagesSquare}
        title={
          state.error && mine
            ? 'Couldn’t read the rebuttal'
            : done
              ? 'No rebuttal yet'
              : 'Reading the rebuttal…'
        }
      >
        {mine
          ? (state.error ?? (done ? 'Start one in the desktop app from its reviews.' : null))
          : null}
      </PhoneEmptyState>
    )
  }
  const { bundle } = snapshot
  const reviewers = bundle.meta.reviewers
  const chosen = reviewer ?? reviewers[0]?.id ?? GENERAL
  const groups = reviewerGroups(bundle, chosen)
  const opening = reviewers.find((entry) => entry.id === chosen)?.opening ?? ''
  const limit = chosen === GENERAL ? bundle.meta.limits.generalChars : bundle.meta.limits.replyChars
  const waiting = snapshot.proposals.filter((proposal) => !proposal.applied).length
  return (
    <PhoneScrollBody>
      {state.rebuttals.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-4 pt-4">
          {state.rebuttals.map((entry) => (
            <Chip
              key={entry.slug}
              selected={entry.slug === state.selectedSlug}
              onClick={() => void selectRebuttal(owner, entry.slug)}
            >
              {entry.name}
            </Chip>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2 overflow-x-auto px-4 pt-4" role="group" aria-label="Reviewers">
        {reviewers.map((entry) => (
          <Chip key={entry.id} selected={entry.id === chosen} onClick={() => setReviewer(entry.id)}>
            {entry.label || entry.id}
          </Chip>
        ))}
        <Chip selected={chosen === GENERAL} onClick={() => setReviewer(GENERAL)}>
          General
        </Chip>
      </div>
      {snapshot.issues.length ? (
        <PhoneSectionNote>{`Read-only until these files are fixed: ${snapshot.issues.join(' ')}`}</PhoneSectionNote>
      ) : null}
      {waiting ? (
        <PhoneSectionNote>
          {`${waiting} agent ${waiting === 1 ? 'change waits' : 'changes wait'} for review on the desktop.`}
        </PhoneSectionNote>
      ) : null}
      {opening ? (
        <PhoneSection label="Opening">
          <p className="px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">{opening}</p>
        </PhoneSection>
      ) : null}
      <PhoneSection label={chosen === GENERAL ? 'General response' : `Points and answers`}>
        {groups.length === 0 ? (
          <PhoneSectionNote>
            {chosen === GENERAL ? 'No general answers yet' : 'No points split from this review yet'}
          </PhoneSectionNote>
        ) : null}
        {groups.map(({ cluster, points }) => (
          <PhoneRebuttalReply
            key={cluster.id}
            owner={owner}
            cluster={cluster}
            points={points}
            limit={limit}
          />
        ))}
      </PhoneSection>
    </PhoneScrollBody>
  )
}
