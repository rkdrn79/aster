import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { localPointLabel } from '../../../../research-harness/research-rebuttal-model.mjs'
import type {
  RebuttalArchivedGroup,
  RebuttalRegroup
} from '../../../../research-harness/research-rebuttal-regroup.mjs'

type Group = RebuttalRegroup['before']['clusters'][number]

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 90 ? `${flat.slice(0, 89)}…` : flat
}

function GroupList({ title, groups }: { title: string; groups: Group[] }): React.JSX.Element {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-3xs font-medium text-muted-foreground">{title}</p>
      {groups.length ? (
        groups.map((group) => (
          <div key={group.id} className="min-w-0 rounded-sm bg-background px-2 py-1">
            <p className="truncate text-xs">
              <span className="font-mono text-muted-foreground">{group.id}</span> {group.title}
            </p>
            <p className="truncate font-mono text-3xs text-muted-foreground">
              {group.points.map((id) => `${id.slice(0, 2)} ${localPointLabel(id)}`).join(' · ')}
            </p>
            <p className="truncate text-2xs text-muted-foreground">
              {group.response.trim() ? `“${excerpt(group.response)}”` : 'No reply'}
            </p>
          </div>
        ))
      ) : (
        <p className="text-2xs text-muted-foreground">None</p>
      )}
    </div>
  )
}

/** Where each written reply went, in plain words. */
function replyMoves(record: RebuttalRegroup): string[] {
  const written = new Set(
    record.before.clusters.filter((group) => group.response.trim()).map((group) => group.id)
  )
  const lines: string[] = []
  for (const entry of record.summary.merged) {
    for (const from of entry.from.filter((id) => written.has(id))) {
      lines.push(
        entry.joined
          ? `${from}’s reply → joined into ${entry.into}, after its text`
          : `${from}’s reply → replaced by the agent’s merged reply in ${entry.into} (kept in Versions)`
      )
    }
  }
  for (const entry of record.summary.split) {
    const home = entry.into.includes(entry.from) ? entry.from : entry.into[0]
    const others = entry.into.filter((id) => id !== home)
    lines.push(
      `${entry.from}’s reply → stays with ${home}; ${others.join(', ')} ${others.length === 1 ? 'starts' : 'start'} empty unless the agent wrote one`
    )
  }
  for (const id of record.summary.moved) {
    lines.push(`${id}’s reply → stays with ${id}; its concerns changed`)
  }
  return lines
}

/** The groups before and after a regroup, and where every reply went. */
export function ResearchRebuttalRegroupChanges({
  record,
  archive,
  readOnly,
  onRestore
}: {
  record: RebuttalRegroup
  archive: readonly RebuttalArchivedGroup[]
  readOnly: boolean
  onRestore: (archiveId: string) => void
}): React.JSX.Element {
  const removed = record.summary.removed.map((id) => ({
    id,
    entry: archive.find(
      (candidate) => candidate.regroup === record.id && candidate.cluster.id === id
    )
  }))
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
        <GroupList title="Before" groups={record.before.clusters} />
        <ArrowRight className="mt-6 size-3.5 text-muted-foreground" aria-hidden />
        <GroupList title="After" groups={record.after.clusters} />
      </div>
      <ul className="space-y-0.5 text-2xs leading-4 text-muted-foreground">
        {replyMoves(record).map((line) => (
          <li key={line}>{line}</li>
        ))}
        {removed.map(({ id, entry }) => (
          <li key={id} className="flex flex-wrap items-center gap-x-1.5">
            {id}’s reply → archived with its group
            {entry && record.applied && !readOnly ? (
              <Button size="xs" variant="ghost" onClick={() => onRestore(entry.id)}>
                Restore {id}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
