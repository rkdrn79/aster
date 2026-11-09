import { useState } from 'react'
import { Check, Copy, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  assembleAllReplies,
  assembleGeneralResponse,
  reviewerReplyFileName
} from '../../../../research-harness/research-rebuttal-assemble.mjs'
import type {
  RebuttalMeta,
  RebuttalSharedAnswerMode
} from '../../../../research-harness/research-rebuttal-model.mjs'
import { ResearchRebuttalDraftField } from './ResearchRebuttalDraftField'
import { ResearchRebuttalPdfPanel } from './ResearchRebuttalPdfPanel'
import { writeRebuttalOutput } from './research-rebuttal-mutations'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

type Output = 'replies' | 'general' | 'pdf'

const SHARED_LABELS: Record<RebuttalSharedAnswerMode, string> = {
  reviewer: 'First reviewer',
  general: 'General response',
  repeat: 'Every reply'
}

type Props = {
  snapshot: RebuttalSnapshot
  readOnly: boolean
  /** Resolves to an error message, or null once saved. */
  onUpdateMeta: (change: (meta: RebuttalMeta) => RebuttalMeta) => Promise<string | null>
  /** Fixes the view to one output and hides the switch. */
  only?: Output
}

export function CharMeter({ chars, limit }: { chars: number; limit: number }): React.JSX.Element {
  const ratio = limit > 0 ? chars / limit : 0
  return (
    <div className="flex min-w-36 items-center gap-2">
      <div
        role="meter"
        aria-label="Characters used"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={chars}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full',
            ratio > 1 ? 'bg-destructive' : ratio > 0.9 ? 'bg-status-warning' : 'bg-foreground/45'
          )}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
      <span
        className={cn(
          'shrink-0 text-xs tabular-nums',
          ratio > 1 ? 'font-medium text-destructive' : 'text-muted-foreground'
        )}
      >
        {chars.toLocaleString()} / {limit.toLocaleString()}
      </span>
    </div>
  )
}

function OutputCard({
  title,
  text,
  chars,
  limit,
  missing,
  children
}: {
  title: string
  text: string
  chars: number
  limit: number
  missing: string[]
  children?: React.ReactNode
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <article aria-label={title} className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h3>
        <CharMeter chars={chars} limit={limit} />
        <Button
          size="xs"
          variant="ghost"
          onClick={() =>
            void window.api.ui.writeClipboardText(text).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            })
          }
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copied' : 'Copy'}
        </Button>
      </header>
      {chars > limit ? (
        <p className="border-b border-border px-3 py-1.5 text-xs text-destructive">
          {(chars - limit).toLocaleString()} characters over the limit. Shorten the answers below or
          ask the agent to check against limits.
        </p>
      ) : null}
      {missing.length ? (
        <p className="border-b border-border px-3 py-1.5 text-xs text-status-warning">
          No answer yet for {missing.join(', ')}.
        </p>
      ) : null}
      {children}
      <pre className="scrollbar-sleek max-h-96 overflow-auto px-3 py-2.5 font-sans text-sm leading-6 whitespace-pre-wrap break-words">
        {text || 'Nothing to send yet.'}
      </pre>
    </article>
  )
}

export function ResearchRebuttalAssemble({
  snapshot,
  readOnly,
  onUpdateMeta,
  only
}: Props): React.JSX.Element {
  const [chosenOutput, setOutput] = useState<Output>('replies')
  const output = only ?? chosenOutput
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { bundle } = snapshot
  const { meta } = bundle
  const replies = assembleAllReplies(bundle)
  const general = assembleGeneralResponse(bundle)

  async function saveOutputs(): Promise<void> {
    try {
      for (const reply of replies) {
        await writeRebuttalOutput(snapshot, reviewerReplyFileName(reply), reply.text)
      }
      await writeRebuttalOutput(snapshot, 'general.md', general.text)
      setSavedAt(new Date().toLocaleTimeString())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        {only ? null : (
          <ToggleGroup
            type="single"
            variant="outline"
            size="xs"
            value={output}
            aria-label="Output"
            onValueChange={(value) => {
              if (value === 'replies' || value === 'general' || value === 'pdf') {
                setOutput(value)
              }
            }}
          >
            <ToggleGroupItem value="replies">Reviewer replies</ToggleGroupItem>
            <ToggleGroupItem value="general">General response</ToggleGroupItem>
            <ToggleGroupItem value="pdf">One-page PDF</ToggleGroupItem>
          </ToggleGroup>
        )}
        {output === 'pdf' ? null : (
          <>
            <div className="space-y-1">
              <label
                htmlFor="rebuttal-reply-limit"
                className="block text-2xs text-muted-foreground"
              >
                {output === 'general' ? 'General limit' : 'Reply limit'}
              </label>
              <Input
                id="rebuttal-reply-limit"
                key={`${output}:${output === 'general' ? meta.limits.generalChars : meta.limits.replyChars}`}
                type="number"
                min={200}
                max={100000}
                step={100}
                disabled={readOnly}
                className="h-6 w-24"
                defaultValue={
                  output === 'general' ? meta.limits.generalChars : meta.limits.replyChars
                }
                onBlur={(event) => {
                  const value = Number(event.target.value)
                  const key = output === 'general' ? 'generalChars' : 'replyChars'
                  if (Number.isInteger(value) && value !== meta.limits[key]) {
                    void onUpdateMeta((current) => ({
                      ...current,
                      limits: { ...current.limits, [key]: value }
                    })).then(setError)
                  }
                }}
              />
            </div>
            <div className="space-y-1">
              <span className="block text-2xs text-muted-foreground">Shared answers in</span>
              <ToggleGroup
                type="single"
                variant="outline"
                size="xs"
                value={meta.assembly.shared}
                disabled={readOnly}
                aria-label="Shared answers in"
                onValueChange={(value) => {
                  if (value === 'reviewer' || value === 'general' || value === 'repeat') {
                    void onUpdateMeta((current) => ({
                      ...current,
                      assembly: { ...current.assembly, shared: value }
                    })).then(setError)
                  }
                }}
              >
                {(['reviewer', 'general', 'repeat'] as const).map((mode) => (
                  <ToggleGroupItem key={mode} value={mode}>
                    {SHARED_LABELS[mode]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {readOnly ? null : (
              <Button
                size="xs"
                variant="ghost"
                className="ml-auto"
                onClick={() => void saveOutputs()}
              >
                <Save aria-hidden /> Save to responses/
              </Button>
            )}
          </>
        )}
      </div>
      {savedAt && output !== 'pdf' ? (
        <p role="status" className="text-xs text-muted-foreground">
          Saved to {snapshot.directory}/responses/ at {savedAt}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {output === 'replies' ? (
        replies.length ? (
          replies.map((reply) => {
            const reviewer = meta.reviewers.find((entry) => entry.id === reply.reviewer)
            return (
              <OutputCard
                key={`${reply.reviewer}-${reply.round}`}
                title={`Reply to ${reply.name}${reply.name === reply.reviewer ? '' : ` (${reply.reviewer})`}${reply.round > 1 ? ` · round ${reply.round}` : ''}`}
                text={reply.text}
                chars={reply.chars}
                limit={reply.limit}
                missing={reply.missing}
              >
                {reply.round > 1 ? null : (
                  <details className="border-b border-border px-3 py-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                      Opening{reviewer?.opening ? '' : ' (none)'}
                    </summary>
                    <ResearchRebuttalDraftField
                      className="mt-2"
                      label={`Opening for ${reply.reviewer}`}
                      value={reviewer?.opening ?? ''}
                      readOnly={readOnly}
                      rows={3}
                      placeholder="One or two sentences before the answers, e.g. thanks and the main change."
                      onSave={(opening) =>
                        onUpdateMeta((current) => ({
                          ...current,
                          reviewers: current.reviewers.map((entry) =>
                            entry.id === reply.reviewer ? { ...entry, opening } : entry
                          )
                        }))
                      }
                    />
                  </details>
                )}
              </OutputCard>
            )
          })
        ) : (
          <p className="text-sm text-muted-foreground">Add reviews to assemble replies.</p>
        )
      ) : output === 'general' ? (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <ResearchRebuttalDraftField
              label="Intro"
              value={meta.general.intro}
              readOnly={readOnly}
              placeholder="Thank the reviewers once and name the main changes."
              onSave={(intro) =>
                onUpdateMeta((current) => ({ ...current, general: { ...current.general, intro } }))
              }
            />
            <ResearchRebuttalDraftField
              label="Closing"
              value={meta.general.closing}
              readOnly={readOnly}
              placeholder="Optional closing sentence."
              onSave={(closing) =>
                onUpdateMeta((current) => ({
                  ...current,
                  general: { ...current.general, closing }
                }))
              }
            />
          </div>
          <OutputCard
            title="General response"
            text={general.text}
            chars={general.chars}
            limit={general.limit}
            missing={general.missing}
          />
        </>
      ) : (
        <ResearchRebuttalPdfPanel snapshot={snapshot} readOnly={readOnly} />
      )}
    </div>
  )
}
