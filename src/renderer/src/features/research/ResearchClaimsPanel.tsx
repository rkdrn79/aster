import { useEffect, useRef, useState } from 'react'
import { ChevronRight, MessageSquareText, PencilLine, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type {
  ResearchClaimAudit,
  ResearchClaimsAuditResult,
  ResearchClaimStatus
} from '../../../../shared/research/research-harness-results'
import {
  CLAIM_STATUS_LABELS,
  claimEvidenceText,
  claimNeedsAttention,
  claimProblemText,
  claimsBySeverity,
  researchClaimsChipText,
  texNumberText
} from './research-claims-summary'
import { claimTextUpdate } from './research-claims-text-update'
import type { ResearchClaimsState } from './use-research-claims'

/** Resolves to an error message, or null when the action went through. */
export type ClaimAction = (claim: ResearchClaimAudit) => Promise<string | null>

const STATUS_DOT: Record<ResearchClaimStatus, string> = {
  verified: 'bg-status-success',
  mismatch: 'bg-status-warning',
  'missing-evidence': 'bg-status-warning',
  stale: 'bg-muted-foreground/50'
}

function ClaimStatus({ status }: { status: ResearchClaimStatus }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        claimNeedsAttention(status) ? 'font-medium text-foreground' : 'text-muted-foreground'
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', STATUS_DOT[status])} />
      {CLAIM_STATUS_LABELS[status]}
    </span>
  )
}

function ClaimActions({
  claim,
  onUpdateText,
  onAskAgent,
  onDone
}: {
  claim: ResearchClaimAudit
  onUpdateText?: ClaimAction
  onAskAgent?: ClaimAction
  onDone: () => void
}): React.JSX.Element | null {
  const [busy, setBusy] = useState<'update' | 'ask' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const update = onUpdateText ? claimTextUpdate(claim) : null
  if (claim.status !== 'mismatch' || (!update && !onAskAgent)) {
    return null
  }
  async function run(kind: 'update' | 'ask', action: ClaimAction): Promise<void> {
    setBusy(kind)
    setMessage(null)
    const error = await action(claim)
    setBusy(null)
    setMessage(error)
    if (!error) {
      onDone()
    }
  }
  return (
    <div className="space-y-1 px-3 pb-2">
      <div className="flex flex-wrap gap-1">
        {update && onUpdateText ? (
          <Button
            size="xs"
            variant="outline"
            disabled={busy !== null}
            title={`Write ${update.label} into the paper and record it as the claim's value`}
            onClick={() => void run('update', onUpdateText)}
          >
            <PencilLine aria-hidden />
            {busy === 'update' ? 'Updating…' : `Update text to ${update.label}`}
          </Button>
        ) : null}
        {onAskAgent ? (
          <Button
            size="xs"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => void run('ask', onAskAgent)}
          >
            <MessageSquareText aria-hidden />
            {busy === 'ask' ? 'Sending…' : 'Ask Writing agent'}
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  )
}

function ClaimRow({
  claim,
  onOpen,
  onUpdateText,
  onAskAgent,
  onDone
}: {
  claim: ResearchClaimAudit
  onOpen: (file: string, line: number) => void
  onUpdateText?: ClaimAction
  onAskAgent?: ClaimAction
  onDone: () => void
}): React.JSX.Element {
  const location = claim.location
  const attention = claimNeedsAttention(claim.status)
  const problem = claimProblemText(claim)
  return (
    <li
      className={cn(
        'rounded-md border-l-2 border-transparent',
        claim.status === 'mismatch' && 'border-l-status-warning bg-status-warning-background'
      )}
    >
      <button
        type="button"
        disabled={!location}
        title={location ? 'Show in TeX source' : undefined}
        className="w-full space-y-1 rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:hover:bg-transparent"
        onClick={() => location && onOpen(location.file, location.line ?? 1)}
      >
        <ClaimStatus status={claim.status} />
        <p className="line-clamp-3 text-sm">{claim.text}</p>
        {claim.evidence.map((evidence, index) => (
          <p
            key={`${evidence.run}:${evidence.metric}:${index}`}
            className="truncate text-xs text-muted-foreground"
          >
            {evidence.role === 'supporting' ? 'Supporting: ' : ''}
            {claimEvidenceText(evidence)}
          </p>
        ))}
        {problem ? (
          <p className={cn('text-xs', attention ? 'text-foreground' : 'text-muted-foreground')}>
            {problem}
          </p>
        ) : null}
      </button>
      <ClaimActions
        claim={claim}
        onUpdateText={onUpdateText}
        onAskAgent={onAskAgent}
        onDone={onDone}
      />
    </li>
  )
}

/** `12 claims · 1 mismatch` in the Writing header, or `Claims` before the paper has one. */
export function ResearchClaimsChip({
  audit,
  open,
  onToggle
}: {
  audit: ResearchClaimsAuditResult | null
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <Button
      size="xs"
      variant={open ? 'secondary' : 'ghost'}
      aria-pressed={open}
      title="Show or hide the paper's claims"
      onClick={onToggle}
    >
      {audit?.claims.some((claim) => claimNeedsAttention(claim.status)) ? (
        <span aria-hidden className="size-1.5 rounded-full bg-status-warning" />
      ) : null}
      {(audit ? researchClaimsChipText(audit.summary) : null) ?? 'Claims'}
    </Button>
  )
}

/** The paper's numbers and the Runs behind them, in a drawer beside the Writing panes. */
export function ResearchClaimsPanel({
  claims,
  onOpenSource,
  onClose,
  onUpdateText,
  onAskAgent,
  className
}: {
  claims: ResearchClaimsState
  onOpenSource: (file: string, line: number) => void
  onClose: () => void
  onUpdateText?: ClaimAction
  onAskAgent?: ClaimAction
  className?: string
}): React.JSX.Element {
  const { audit, scan } = claims
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      const target = event.target instanceof Element ? event.target : null
      // Why: Escape in the TeX editor or a dialog belongs to them unless focus is in the drawer.
      if (
        target?.closest('.monaco-editor, [role="dialog"], input, textarea') &&
        !panelRef.current?.contains(target)
      ) {
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return (
    <aside
      ref={panelRef}
      aria-label="Claims"
      className={cn('flex min-h-0 min-w-0 flex-col bg-background text-foreground', className)}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1.5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">Claims</h2>
        {claims.available ? (
          <Button size="xs" variant="ghost" disabled={claims.checking} onClick={claims.recheck}>
            <RefreshCw aria-hidden className={cn(claims.checking && 'animate-spin')} />
            Re-check
          </Button>
        ) : null}
        <Button size="icon-xs" variant="ghost" aria-label="Close claims" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 space-y-4 overflow-auto p-2">
        {!claims.available ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Claims can be checked in local projects only.
          </p>
        ) : null}
        {claims.error ? (
          <p role="alert" className="px-3 py-2 text-xs text-destructive">
            {claims.error}
          </p>
        ) : null}
        {audit && audit.claims.length ? (
          <ul className="space-y-1">
            {claimsBySeverity(audit.claims).map((claim) => (
              <ClaimRow
                key={claim.id}
                claim={claim}
                onOpen={onOpenSource}
                onUpdateText={onUpdateText}
                onAskAgent={onAskAgent}
                onDone={claims.recheck}
              />
            ))}
          </ul>
        ) : audit ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No claims recorded yet.</p>
        ) : null}
        {claims.available ? (
          <div className="border-t border-border pt-2">
            <Collapsible>
              <CollapsibleTrigger variant="row">
                <span className="flex items-center gap-1.5 px-3 text-xs">
                  <ChevronRight
                    aria-hidden
                    className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
                  />
                  Unbacked numbers
                </span>
                {scan ? (
                  <span className="px-3 text-xs font-normal text-muted-foreground">
                    {scan.unbacked.length}
                  </span>
                ) : null}
              </CollapsibleTrigger>
              <CollapsibleContent>
                {claims.scanError ? (
                  <p className="px-3 py-2 text-xs text-destructive">{claims.scanError}</p>
                ) : scan && scan.unbacked.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Every result number in the paper has a claim.
                  </p>
                ) : (
                  <ul className="space-y-0.5 pt-1">
                    {scan?.unbacked.map((item) => (
                      <li key={`${item.file}:${item.line}:${item.text}`}>
                        <button
                          type="button"
                          title="Show in TeX source"
                          className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 rounded-md px-3 py-1 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          onClick={() => onOpenSource(item.file, item.line)}
                        >
                          <span className="font-mono">{texNumberText(item.text)}</span>
                          <span className="truncate text-muted-foreground">
                            {texNumberText(item.context)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
