import { useState } from 'react'
import { Check, FileWarning, MessageSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatShortTimeAgo } from '@/lib/short-time-ago'
import { useDeadlineClock } from '@/features/research/use-deadline-clock'
import { HOST_UPDATE_NEEDED_TEXT } from '@/web/web-research-decisions'
import type { ResearchProposal } from '../../../shared/research/research-proposals'
import { phoneProposalDecisionMessage } from './phone-proposal-actions'
import { usePhoneNavigation } from './phone-navigation-store'
import {
  PhoneEmptyState,
  PhoneScrollBody,
  PhoneSection,
  PhoneSectionNote,
  PhoneStatusPill,
  type PhoneStatusTone
} from './PhoneListLayout'
import { usePhoneProposal } from './use-phone-proposal'

const STATE_PILLS: Record<ResearchProposal['state'], { label: string; tone: PhoneStatusTone }> = {
  pending: { label: 'Waiting for you', tone: 'attention' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  launched: { label: 'Launched', tone: 'working' }
}

function agentLabel(proposal: ResearchProposal): string {
  const provider = proposal.agent?.provider
  return provider === 'claude-code'
    ? 'Claude'
    : provider === 'codex'
      ? 'Codex'
      : (provider ?? 'an agent')
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-base leading-snug break-words whitespace-pre-line">
        {children}
      </div>
    </div>
  )
}

/** The person's decision: a note for the agent, then Reject or Approve; or a question instead. */
function DecisionForm({
  state
}: {
  state: ReturnType<typeof usePhoneProposal>
}): React.JSX.Element {
  const [note, setNote] = useState('')
  const busy = state.busy !== null
  return (
    <div
      className="shrink-0 space-y-2 border-t border-border bg-background px-4 pt-3 pb-3"
      aria-label="Your decision"
      role="group"
    >
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note for the agent (optional)"
        aria-label="Note for the agent"
        rows={1}
        className="min-h-11"
      />
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-11"
          disabled={busy}
          onClick={() => void state.decide('rejected', note)}
        >
          <X aria-hidden />
          {state.busy === 'rejected' ? 'Rejecting…' : 'Reject'}
        </Button>
        <Button
          className="h-11"
          disabled={busy}
          onClick={() => void state.decide('approved', note)}
        >
          <Check aria-hidden />
          {state.busy === 'approved' ? 'Approving…' : 'Approve'}
        </Button>
      </div>
      <Button
        variant="ghost"
        className="h-9 w-full"
        disabled={busy || !note.trim()}
        onClick={() => void state.comment(note).then((ok) => ok && setNote(''))}
      >
        <MessageSquare aria-hidden />
        {state.busy === 'comment' ? 'Sending…' : 'Send the note as a question instead'}
      </Button>
    </div>
  )
}

/** One agent proposal: why, what it runs, and the person's decision, recorded on the host. */
export function PhoneProposalScreen({
  worktreeId,
  experiment,
  proposalId
}: {
  worktreeId: string
  experiment: string
  proposalId: string
}): React.JSX.Element {
  const state = usePhoneProposal({ worktreeId, experiment, proposal: proposalId })
  const now = useDeadlineClock(30_000)
  const push = usePhoneNavigation((store) => store.push)
  const { proposal } = state
  if (state.status === 'update-needed') {
    return (
      <PhoneEmptyState icon={FileWarning} title="Server update needed">
        {HOST_UPDATE_NEEDED_TEXT}
      </PhoneEmptyState>
    )
  }
  if (!proposal) {
    return (
      <PhoneEmptyState
        icon={FileWarning}
        title={state.status === 'loading' ? 'Reading the proposal…' : 'Proposal not found'}
      >
        {state.error}
      </PhoneEmptyState>
    )
  }
  const pill = STATE_PILLS[proposal.state]
  const handOff =
    proposal.state === 'approved' &&
    state.delivery !== null &&
    state.delivery.state !== 'sent' &&
    !proposal.handoff
  const configChanges = Object.entries(proposal.configChanges ?? {})
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PhoneScrollBody>
        <div className="px-8 pt-5">
          <div className="flex items-center gap-2">
            <PhoneStatusPill tone={pill.tone}>{pill.label}</PhoneStatusPill>
            {proposal.needsCode ? (
              <PhoneStatusPill tone="neutral">Needs code</PhoneStatusPill>
            ) : null}
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {`${proposal.id} · from ${agentLabel(proposal)} · ${formatShortTimeAgo(Date.parse(proposal.at), now)}`}
          </p>
        </div>
        <PhoneSection label="Why">
          <Field label="Rationale">{proposal.rationale}</Field>
          {proposal.findings.length || proposal.runs.length ? (
            <Field label="Based on">{[...proposal.findings, ...proposal.runs].join(', ')}</Field>
          ) : null}
        </PhoneSection>
        <PhoneSection label="What it runs">
          <pre className="bg-editor-surface px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
            {proposal.command}
          </pre>
          {proposal.cwd && proposal.cwd !== '.' ? (
            <Field label="Working directory">{proposal.cwd}</Field>
          ) : null}
          {configChanges.length ? (
            <Field label="Config changes">
              {configChanges.map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}
            </Field>
          ) : null}
        </PhoneSection>
        {proposal.decision ? (
          <PhoneSection label="Decision">
            <Field
              label={`${proposal.decision.decision === 'approved' ? 'Approved' : 'Rejected'} by you`}
            >
              {proposal.decision.note || 'No note'}
            </Field>
            {proposal.launchedRun ? (
              <Field label="Launched as">{proposal.launchedRun}</Field>
            ) : null}
          </PhoneSection>
        ) : null}
        {state.outcome ? <PhoneSectionNote>{state.outcome}</PhoneSectionNote> : null}
        {state.error ? (
          <p role="alert" className="px-8 pt-3 text-[13px] text-destructive">
            {state.error}
          </p>
        ) : null}
        {handOff ? (
          <div className="px-4 pt-3">
            <Button
              variant="outline"
              className="h-11 w-full"
              onClick={() =>
                push({
                  kind: 'new-agent',
                  worktreeId,
                  title: 'New agent',
                  prompt: phoneProposalDecisionMessage(proposal)
                })
              }
            >
              Hand it to an agent
            </Button>
          </div>
        ) : null}
      </PhoneScrollBody>
      {proposal.state === 'pending' ? <DecisionForm state={state} /> : null}
    </div>
  )
}
