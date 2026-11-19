import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { researchErrorText } from '@/features/research/research-error-text'
import type { RebuttalOwner } from '@/features/research/research-rebuttal-files'
import { updateRebuttalClusters } from '@/features/research/research-rebuttal-mutations'
import { saveRebuttalReply } from '@/features/research/research-rebuttal-reply-mutations'
import type {
  RebuttalCluster,
  RebuttalPoint
} from '../../../research-harness/research-rebuttal-model.mjs'
import { PhoneStatusPill, type PhoneStatusTone } from './PhoneListLayout'

const STATUS: Record<RebuttalCluster['status'], { label: string; tone: PhoneStatusTone }> = {
  todo: { label: 'To do', tone: 'attention' },
  drafting: { label: 'Draft', tone: 'working' },
  done: { label: 'Done', tone: 'success' }
}

function authorLabel(cluster: RebuttalCluster): string | null {
  switch (cluster.author) {
    case 'agent':
      return 'Drafted by the agent'
    case 'human':
      return 'Written by you'
    case 'both':
      return 'You and the agent'
    case null:
      return null
  }
}

/**
 * One reply group: the reviewer's points it answers and the draft, which the person marks done
 * or edits; both save through the desktop's rebuttal writes, so the agent sees the same files.
 */
export function PhoneRebuttalReply({
  owner,
  cluster,
  points,
  limit
}: {
  owner: RebuttalOwner
  cluster: RebuttalCluster
  points: readonly RebuttalPoint[]
  limit: number
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = STATUS[cluster.status]
  const run = async (work: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await work()
      setDraft(null)
    } catch (cause) {
      setError(researchErrorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const markDone = (): Promise<void> =>
    run(() =>
      updateRebuttalClusters(owner, (clusters) =>
        clusters.map((entry) => (entry.id === cluster.id ? { ...entry, status: 'done' } : entry))
      )
    )
  const save = (text: string): Promise<void> =>
    run(() =>
      saveRebuttalReply(owner, { slot: cluster.id, pointId: null, text, base: cluster.response })
    )
  return (
    <div className="space-y-2 px-4 py-3.5" data-phone-rebuttal-group={cluster.id}>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-muted-foreground">
          {`${cluster.id} · ${cluster.title}`}
        </p>
        <PhoneStatusPill tone={status.tone}>{status.label}</PhoneStatusPill>
      </div>
      {points.map((point) => (
        <p key={point.id} className="text-[15px] leading-snug">
          <span className="font-medium">{point.id}</span> {point.summary || point.quote}
        </p>
      ))}
      {draft === null ? (
        <div className="rounded-lg bg-editor-surface px-3 py-2.5">
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
            {cluster.response || 'No answer drafted yet.'}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
            {[
              authorLabel(cluster),
              cluster.response ? `${cluster.response.length}/${limit} chars` : null
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      ) : (
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={`Answer for ${cluster.id}`}
          rows={6}
          className="min-h-32"
        />
      )}
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        {draft === null ? (
          <>
            <Button
              variant="outline"
              className="h-10 flex-1"
              disabled={busy}
              onClick={() => setDraft(cluster.response)}
            >
              <Pencil aria-hidden />
              Edit
            </Button>
            {cluster.status !== 'done' && cluster.response.trim() ? (
              <Button className="h-10 flex-1" disabled={busy} onClick={() => void markDone()}>
                <Check aria-hidden />
                {busy ? 'Saving…' : 'Accept'}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button
              variant="outline"
              className="h-10 flex-1"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
            <Button className="h-10 flex-1" disabled={busy} onClick={() => void save(draft)}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
