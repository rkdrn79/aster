import { useState } from 'react'
import { ListChecks, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  nextSequentialId,
  type RebuttalPromise
} from '../../../../research-harness/research-rebuttal-model.mjs'
import { ResearchEmptyState } from './ResearchPageLayout'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

type Props = {
  snapshot: RebuttalSnapshot
  readOnly: boolean
  selectedClusterId: string | null
  /** Resolves to an error message, or null once saved. */
  onUpdate: (change: (promises: RebuttalPromise[]) => RebuttalPromise[]) => Promise<string | null>
}

/** What the rebuttal promises for the camera-ready, checked off as the paper changes. */
export function ResearchRebuttalPromises({
  snapshot,
  readOnly,
  selectedClusterId,
  onUpdate
}: Props): React.JSX.Element {
  const { promises, clusters } = snapshot.bundle
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const titleOf = new Map(clusters.map((cluster) => [cluster.id, cluster.title]))
  const open = promises.filter((promise) => !promise.done).length

  async function add(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const value = text.trim()
    if (!value) {
      return
    }
    const failure = await onUpdate((current) => [
      ...current,
      {
        id: nextSequentialId('P', current),
        text: value,
        clusters: selectedClusterId ? [selectedClusterId] : [],
        done: false,
        createdAt: new Date().toISOString()
      }
    ])
    setError(failure)
    if (!failure) {
      setText('')
    }
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-muted-foreground">
        {promises.length
          ? `${open} of ${promises.length} still to do for the final version.`
          : 'Changes the rebuttal commits to for the final version.'}
      </p>
      {readOnly ? null : (
        <form className="flex gap-2" onSubmit={(event) => void add(event)}>
          <Input
            aria-label="New promise"
            value={text}
            maxLength={1000}
            placeholder={
              selectedClusterId
                ? `Promise for ${selectedClusterId}, e.g. Add the DiffusionDet row to Table 2`
                : 'e.g. Add the DiffusionDet row to Table 2'
            }
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="submit" size="sm" variant="outline" disabled={!text.trim()}>
            <Plus aria-hidden /> Add
          </Button>
        </form>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {promises.length === 0 ? (
        <ResearchEmptyState icon={ListChecks} title="No promises yet">
          The agent records them while drafting, or add one above.
        </ResearchEmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {promises.map((promise) => (
            <li key={promise.id} className="flex items-start gap-2.5 px-3 py-2">
              <Checkbox
                className="mt-0.5"
                checked={promise.done}
                disabled={readOnly}
                aria-label={`${promise.id} done`}
                onCheckedChange={(checked) =>
                  void onUpdate((current) =>
                    current.map((entry) =>
                      entry.id === promise.id ? { ...entry, done: checked === true } : entry
                    )
                  ).then(setError)
                }
              />
              <div className="min-w-0 flex-1">
                <p
                  className={
                    promise.done ? 'text-sm text-muted-foreground line-through' : 'text-sm'
                  }
                >
                  {promise.text}
                </p>
                {promise.clusters.length ? (
                  <p className="mt-0.5 truncate text-2xs text-muted-foreground">
                    {promise.clusters
                      .map((id) => `${id} ${titleOf.get(id) ?? ''}`.trim())
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
              <span className="font-mono text-3xs text-muted-foreground">{promise.id}</span>
              {readOnly ? null : (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove ${promise.id}`}
                  onClick={() =>
                    void onUpdate((current) =>
                      current.filter((entry) => entry.id !== promise.id)
                    ).then(setError)
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
