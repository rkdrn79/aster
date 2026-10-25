import { useState } from 'react'
import { Bot, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import type {
  ResearchSampleRating,
  ResearchSampleRatingSummary
} from '../../../../shared/research/research-sample-ratings'
import {
  agreementText,
  isSmallSample,
  judgeMixedText,
  pairwiseCountsText,
  singleCountsText,
  topTagsText
} from './research-sample-rating-summary-text'

function SmallSampleBadge({ counts }: { counts: { n: number } | null }): React.JSX.Element | null {
  return isSmallSample(counts) ? (
    <Badge variant="outline" className="ml-2">
      small sample
    </Badge>
  ) : null
}

function JudgeMixedNote({
  summary
}: {
  summary: ResearchSampleRatingSummary
}): React.JSX.Element | null {
  const text = judgeMixedText(summary)
  return text ? (
    <p
      role="status"
      className="flex items-start gap-2 rounded-md border border-status-warning-border bg-status-warning-background px-2 py-1.5"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0 text-status-warning" />
      {text}
    </p>
  ) : null
}

/** Agent counts read quieter until some sample shows how they compare with the user's. */
function agentTone(summary: ResearchSampleRatingSummary): string {
  return summary.agreement?.overlap ? '' : 'text-muted-foreground'
}

export function PairwiseRatingSummary({
  summary,
  candidateName,
  baselineName
}: {
  summary: ResearchSampleRatingSummary | null
  candidateName: string
  baselineName: string
}): React.JSX.Element {
  if (!summary) {
    return <p className="text-xs text-muted-foreground">Reading ratings…</p>
  }
  const user = summary.bySource.user.pairwise
  const agent = summary.bySource.agent.pairwise
  const tags = topTagsText(summary.tags)
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
      <p className="text-muted-foreground">
        Counted for B ({candidateName}) against A ({baselineName})
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="font-medium">User</dt>
        <dd>
          {pairwiseCountsText(user)}
          <SmallSampleBadge counts={user} />
        </dd>
        <dt className="font-medium">Agent</dt>
        <dd className={agentTone(summary)}>
          {pairwiseCountsText(agent)}
          <SmallSampleBadge counts={agent} />
          {agent?.n && !summary.agreement?.overlap ? ' · not yet checked against your ratings' : ''}
        </dd>
        <dt className="font-medium">Agreement</dt>
        <dd>{agreementText(summary.agreement)}</dd>
        {tags ? (
          <>
            <dt className="font-medium">Top tags</dt>
            <dd>{tags}</dd>
          </>
        ) : null}
      </dl>
      <JudgeMixedNote summary={summary} />
    </div>
  )
}

export function SingleRatingSummary({
  rows
}: {
  rows: { ref: string; name: string; summary: ResearchSampleRatingSummary | null }[]
}): React.JSX.Element {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-1 font-medium">Run</th>
              <th className="pb-1 font-medium">User</th>
              <th className="pb-1 font-medium">Agent</th>
              <th className="pb-1 font-medium">Agreement</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ref, name, summary }) => (
              <tr key={ref} className="border-t border-border">
                <th className="py-1 pr-3 font-medium">{name}</th>
                {summary ? (
                  <>
                    <td className="py-1 pr-3">
                      {singleCountsText(summary.bySource.user.single)}
                      <SmallSampleBadge counts={summary.bySource.user.single} />
                    </td>
                    <td className={`py-1 pr-3 ${agentTone(summary)}`}>
                      {singleCountsText(summary.bySource.agent.single)}
                      <SmallSampleBadge counts={summary.bySource.agent.single} />
                    </td>
                    <td className="py-1">{agreementText(summary.agreement)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="py-1 text-muted-foreground">
                    Reading ratings…
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.map(({ ref, summary }) =>
        summary ? <JudgeMixedNote key={ref} summary={summary} /> : null
      )}
    </div>
  )
}

export function VerdictButtons<T extends string>({
  label,
  options,
  current,
  disabled,
  onChoose
}: {
  label: string
  options: { value: T; label: string; shortcut?: string }[]
  current: T | null
  disabled: boolean
  onChoose: (value: T) => void
}): React.JSX.Element {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={current === option.value ? 'secondary' : 'outline'}
          aria-pressed={current === option.value}
          disabled={disabled}
          onClick={() => onChoose(option.value)}
        >
          {option.label}
          {option.shortcut ? <ShortcutKeyCombo keys={[option.shortcut]} /> : null}
        </Button>
      ))}
    </div>
  )
}

export function RatingTagsField({
  id,
  value,
  onChange
}: {
  id: string
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <label className="shrink-0 text-xs text-muted-foreground" htmlFor={id}>
        Tags
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="hallucination, format"
        className="min-w-0 flex-1"
      />
    </div>
  )
}

/** The agent judge's verdict, always labeled as the agent's and never merged into the user's. */
export function AgentJudgmentLine({
  agent,
  user,
  verdictLabel
}: {
  agent: ResearchSampleRating | null
  user: ResearchSampleRating | null
  verdictLabel: (verdict: ResearchSampleRating['verdict']) => string
}): React.JSX.Element | null {
  if (!agent) {
    return null
  }
  const judge = [agent.judge?.provider, agent.judge?.model].filter(Boolean).join(' ')
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Bot aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span>
        Agent judge{judge ? ` (${judge})` : ''}: {verdictLabel(agent.verdict)}
        {user && user.verdict !== agent.verdict ? ' · differs from yours' : ''}
        {agent.note ? ` — ${agent.note}` : ''}
      </span>
    </p>
  )
}

export function SampleJudgeButton({
  onLaunch
}: {
  onLaunch: () => Promise<string | null>
}): React.JSX.Element {
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function launch(): Promise<void> {
    setLaunching(true)
    setError(null)
    try {
      setError(await onLaunch())
    } finally {
      setLaunching(false)
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        className="w-36"
        disabled={launching}
        onClick={() => void launch()}
      >
        <Bot aria-hidden />
        {launching ? 'Starting…' : 'Judge with agent'}
      </Button>
      {error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
