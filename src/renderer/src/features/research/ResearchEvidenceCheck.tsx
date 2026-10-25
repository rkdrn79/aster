import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  researchVerificationSummarySchema,
  type ResearchVerificationSummary
} from '../../../../shared/research/research-harness-results'
import type { AgentReviewScope } from './research-agent-review-launch'
import { researchErrorText } from './research-error-text'
import { researchRelativeTime } from './research-relative-time'
import { researchHarnessBridge } from './use-research-harness-experiment'

const VERDICT_LABELS: Record<ResearchVerificationSummary['verdict'], string> = {
  blocked: 'Blocked by recorded issues',
  insufficient_evidence: 'No Run evidence yet',
  needs_review: 'Needs review',
  checks_clear: 'Recorded checks clear'
}

const LAST_CHECK_PREFIX = 'aster.research.evidence-check.v1:'

const lastCheckSchema = researchVerificationSummarySchema.pick({ verdict: true, checkedAt: true })
type LastCheck = Pick<ResearchVerificationSummary, 'verdict' | 'checkedAt'>

function lastCheckKey(scope: AgentReviewScope): string {
  return `${LAST_CHECK_PREFIX}${scope.workspacePath}:${scope.experiment}`
}

/** The verdict and time of this Experiment's last check on this device, or null. */
function readLastCheck(scope: AgentReviewScope): LastCheck | null {
  try {
    const parsed = lastCheckSchema.safeParse(
      JSON.parse(localStorage.getItem(lastCheckKey(scope)) ?? 'null')
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function writeLastCheck(scope: AgentReviewScope, check: LastCheck): void {
  try {
    localStorage.setItem(lastCheckKey(scope), JSON.stringify(check))
  } catch {
    // Why: without storage the last check is only forgotten, never wrong.
  }
}

/** A manual, read-only evidence check. It never starts or changes a Run. */
export function ResearchEvidenceCheck({ scope }: { scope: AgentReviewScope }): React.JSX.Element {
  const [result, setResult] = useState<ResearchVerificationSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  // Why remembered: the button alone does not say whether this Experiment was ever checked.
  const [last, setLast] = useState(() => readLastCheck(scope))
  const request = useRef(0)
  useEffect(
    () => () => {
      request.current += 1
    },
    []
  )
  const verify = researchHarnessBridge().verify

  async function check(): Promise<void> {
    if (!verify || checking) {
      return
    }
    const id = ++request.current
    setChecking(true)
    setError(null)
    setResult(null)
    try {
      const next = await verify({
        workspacePath: scope.workspacePath,
        experiment: scope.experiment
      })
      if (request.current === id) {
        setResult(next)
        const check = { verdict: next.verdict, checkedAt: next.checkedAt }
        writeLastCheck(scope, check)
        setLast(check)
      }
    } catch (cause) {
      if (request.current === id) {
        setError(researchErrorText(cause))
      }
    } finally {
      if (request.current === id) {
        setChecking(false)
      }
    }
  }

  const messages = result
    ? [
        ...result.validation.issues.map((item) => `Project: ${item}`),
        ...result.briefGaps.map(
          (item) =>
            `Brief (${item.experiment}): ${item.missing.includes('readable brief') ? 'no readable brief' : `missing ${item.missing.join(', ')}`}`
        ),
        ...result.unfinished.runs.map((item) => `Run ${item.run}: ${item.state}`),
        ...result.findings.open.map((item) => `${item.severity}: ${item.text}`),
        ...result.validation.warnings.map((item) => `Project warning: ${item}`)
      ].slice(0, 6)
    : []

  return (
    <section aria-label="Evidence check" className="space-y-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-xs font-semibold">Evidence check</h2>
          {result ? <Badge variant="outline">{VERDICT_LABELS[result.verdict]}</Badge> : null}
          {result ? (
            <time dateTime={result.checkedAt} className="text-xs text-muted-foreground">
              {researchRelativeTime(result.checkedAt)}
            </time>
          ) : null}
        </div>
        <Button
          size="xs"
          variant="outline"
          disabled={!verify || checking}
          onClick={() => void check()}
        >
          {checking ? 'Checking…' : result ? 'Check again' : 'Verify evidence'}
        </Button>
      </div>
      {!result && verify ? (
        <p className="text-xs text-muted-foreground">
          Reads the plan, Runs, and findings for gaps before you conclude; it changes nothing.
          {last
            ? ` Last checked ${researchRelativeTime(last.checkedAt)}: ${VERDICT_LABELS[last.verdict]}.`
            : ' Not checked yet.'}
        </p>
      ) : null}
      {!verify ? (
        <p className="text-xs text-muted-foreground">
          This Aster build cannot run the evidence check.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <div aria-live="polite" className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            {result.runCount} recorded Runs · {result.validation.issueCount} project issues ·{' '}
            {result.findings.fail} failing, {result.findings.warn} warning, {result.findings.info}{' '}
            info findings · {result.unfinished.count} unfinished · {result.userReportedCount}{' '}
            user-reported statuses
          </p>
          {messages.length ? (
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {messages.map((message, index) => (
                <li key={`${index}-${message}`}>{message}</li>
              ))}
            </ul>
          ) : null}
          {result.validation.issueCount > result.validation.issues.length ||
          result.validation.warningCount > result.validation.warnings.length ||
          result.unfinished.count > result.unfinished.runs.length ||
          result.findings.fail + result.findings.warn + result.findings.info >
            result.findings.open.length ? (
            <p className="text-muted-foreground">
              Showing a few reasons here. Open the project files and Findings for the full record.
            </p>
          ) : null}
          <p className="text-muted-foreground">
            Project structure is checked across the whole project. Clear checks do not establish
            scientific validity; inspect the Run and its sources before drawing a conclusion.
          </p>
        </div>
      ) : null}
    </section>
  )
}
