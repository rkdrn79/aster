import { Archive } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type {
  RebuttalArchivedGroup,
  RebuttalRegroup
} from '../../../../research-harness/research-rebuttal-regroup.mjs'
import { ResearchRebuttalRegroupNotice } from './ResearchRebuttalRegroupNotice'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import type { RebuttalActions } from './use-research-rebuttal-actions'

type Actions = Pick<
  RebuttalActions,
  'undoRegroup' | 'acceptRegroup' | 'forgetRegroup' | 'restoreArchivedGroup'
>

/** The regroups that involve this reviewer's concerns, before or after. */
export function reviewerRegroups(
  snapshot: RebuttalSnapshot,
  reviewerId: string
): RebuttalRegroup[] {
  const own = (pointId: string) => pointId.startsWith(`${reviewerId}-`)
  return snapshot.regroups.filter((record) =>
    [...record.before.clusters, ...record.after.clusters].some((group) => group.points.some(own))
  )
}

export function ResearchRebuttalRegroupList({
  records,
  archive,
  readOnly,
  actions
}: {
  records: readonly RebuttalRegroup[]
  archive: readonly RebuttalArchivedGroup[]
  readOnly: boolean
  actions: Actions
}): React.JSX.Element | null {
  if (!records.length) {
    return null
  }
  return (
    <div className="space-y-1.5">
      {records.map((record) => (
        <ResearchRebuttalRegroupNotice
          key={`${record.id}:${record.applied}`}
          record={record}
          archive={archive}
          readOnly={readOnly}
          actions={actions}
        />
      ))}
    </div>
  )
}

/** Groups removed with their replies, each put back in one step. */
export function ResearchRebuttalRemovedGroups({
  archive,
  readOnly,
  actions
}: {
  archive: readonly RebuttalArchivedGroup[]
  readOnly: boolean
  actions: Actions
}): React.JSX.Element | null {
  const [error, setError] = useState<string | null>(null)
  if (!archive.length) {
    return null
  }
  return (
    <section aria-label="Removed groups" className="space-y-1.5">
      <h3 className="text-xs font-semibold">Removed groups</h3>
      <ul className="space-y-1">
        {archive.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
          >
            <Archive className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-mono text-muted-foreground">{entry.cluster.id}</span>{' '}
              {entry.cluster.title}
              <span className="text-muted-foreground">
                {' '}
                · “{entry.cluster.response.replace(/\s+/g, ' ').slice(0, 80)}”
              </span>
            </span>
            {readOnly ? null : (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void actions.restoreArchivedGroup(entry.id).then(setError)}
              >
                Restore
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
