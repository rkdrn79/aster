import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronRight, Code, Copy, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SecuritySurface } from '@/components/ui/security-surface'
import type { ResearchProposal } from '../../../../shared/research/research-proposals'
import type { ResearchProposalDecisions } from './research-proposal-list-state'
import { researchErrorText } from './research-error-text'
import { NotebookRow } from './ResearchExperimentNotebookLayout'
import { researchRelativeTime } from './research-relative-time'

const PROVIDER_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'gemini-cli': 'Gemini CLI'
}

function proposalAuthor(proposal: ResearchProposal): string {
  const provider = proposal.agent?.provider
  return provider ? (PROVIDER_LABELS[provider] ?? provider) : 'an unidentified agent'
}

function configValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** `seed 2 · lr 0.001 · from cosine seed 1 · answers 1 finding`: what changes, in plain words. */
function proposalDetails(
  proposal: ResearchProposal,
  runName: (reference: string) => string
): string {
  const findings = proposal.findings.length
  return [
    ...Object.entries(proposal.configChanges ?? {}).map(
      ([key, value]) => `${key} ${configValue(value)}`
    ),
    proposal.runs.length ? `from ${proposal.runs.map(runName).join(', ')}` : null,
    findings ? `answers ${findings} ${findings === 1 ? 'finding' : 'findings'}` : null,
    proposal.cwd && proposal.cwd !== '.' ? `in ${proposal.cwd}` : null
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The exact `run exec` command, folded away until asked for. */
function ProposalCommand({ command }: { command: string }): React.JSX.Element {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button size="xs" variant="ghost" className="group -ml-2">
          <ChevronRight
            aria-hidden
            className="transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
          />
          Show command
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 flex items-start gap-1">
          <pre className="scrollbar-sleek max-h-40 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted px-2 py-1 font-mono text-2xs">
            {command}
          </pre>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Copy command"
            title="Copy command"
            onClick={() => void copyCommand(command)}
          >
            <Copy aria-hidden />
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

async function copyCommand(command: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(command)
    toast.success('Command copied.')
  } catch (cause) {
    toast.error(`Copy failed: ${researchErrorText(cause)}`)
  }
}

function RejectAction({
  proposal,
  busy,
  onReject
}: {
  proposal: ResearchProposal
  busy: boolean
  onReject: (note: string) => void
}): React.JSX.Element {
  const noteId = useId()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setNote('')
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" disabled={busy}>
          Reject
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form
          className="space-y-2 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            setOpen(false)
            onReject(note)
          }}
        >
          <Label htmlFor={noteId}>Reason for the agent (optional)</Label>
          <Input
            id={noteId}
            density="compact"
            autoFocus
            maxLength={2000}
            value={note}
            aria-label={`Reason for rejecting ${proposal.title}`}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex justify-end gap-1">
            <Button type="button" size="xs" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="xs">
              Reject
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/**
 * A proposal that waits for the user in Needs you: a pending one to approve or reject, or an
 * approved one whose code change goes to Workbench. Shows the exact command and why.
 */
export function ResearchProposalRow({
  proposal,
  decisions,
  runName,
  onImplement
}: {
  proposal: ResearchProposal
  decisions: ResearchProposalDecisions
  /** A Run's name for its `<experiment>/<run>` reference. */
  runName: (reference: string) => string
  /** "Implement in Workbench" for an approved `needsCode` proposal. */
  onImplement: () => void
}): React.JSX.Element {
  const busy = decisions.busyId !== null
  const pending = proposal.state === 'pending'
  const error = decisions.errors[proposal.id]
  const details = proposalDetails(proposal, runName)
  // Why: agents often open with `finding-2: …`; the finding is counted in the details instead.
  const rationale = proposal.findings.reduce((text, id) => {
    const rest = text.startsWith(`${id}: `) ? text.slice(id.length + 2) : null
    return rest === null ? text : `${rest.charAt(0).toUpperCase()}${rest.slice(1)}`
  }, proposal.rationale)
  const identifiers = [`Proposal ${proposal.id}`, ...proposal.findings, ...proposal.runs].join('\n')
  const decidedAt = proposal.decision?.at ?? proposal.at
  return (
    <SecuritySurface>
      <NotebookRow
        aria-label={`Proposal ${proposal.title}`}
        marker={
          proposal.needsCode ? (
            <Code aria-hidden className="size-3.5" />
          ) : (
            <RotateCcw aria-hidden className="size-3.5" />
          )
        }
        title={<span className="font-medium">{proposal.title}</span>}
        meta={
          <span title={identifiers}>
            {pending
              ? `${proposal.needsCode ? 'Run that needs code' : 'Run'} proposed by ${proposalAuthor(proposal)} · ${researchRelativeTime(proposal.at)}`
              : `Approved ${researchRelativeTime(decidedAt)}${proposal.decision?.note ? ` · “${proposal.decision.note}”` : ''} · needs a code change before it runs`}
          </span>
        }
        actions={
          pending ? (
            <>
              <Button
                size="xs"
                disabled={busy}
                onClick={() => decisions.decide(proposal, 'approved', '')}
              >
                <Check aria-hidden />
                Approve
              </Button>
              <RejectAction
                proposal={proposal}
                busy={busy}
                onReject={(note) => decisions.decide(proposal, 'rejected', note)}
              />
            </>
          ) : (
            <Button size="xs" disabled={busy} onClick={onImplement}>
              <Code aria-hidden />
              Implement in Workbench
            </Button>
          )
        }
      >
        {rationale ? (
          <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
            {rationale}
          </p>
        ) : null}
        {details ? (
          <p className="truncate text-xs text-muted-foreground" title={details}>
            {details}
          </p>
        ) : null}
        <ProposalCommand command={proposal.command} />
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </NotebookRow>
    </SecuritySurface>
  )
}
