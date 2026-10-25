import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import { failedRunPrompt } from './research-experiment-agent-chat'
import {
  ResearchAskExperimentAgent,
  ResearchExperimentChatButton
} from './ResearchExperimentAgentPane'
import { NEEDS_YOU_SHOWN, type NeedsYouItem } from './research-experiment-needs-you'
import type { ExperimentWorkspace } from './research-experiment-workspace-state'
import { findingIdentifiers, findingPresentation } from './research-finding-titles'
import { FINDING_SOURCE_LABELS } from './research-findings-format'
import { ResearchFindingStatusAction } from './research-findings-status-action'
import { ResearchFindingsPanel } from './ResearchFindingsPanel'
import {
  NotebookRow,
  NotebookSection,
  NotebookSeverityMarker
} from './ResearchExperimentNotebookLayout'
import { ResearchNeedsYouFixAction } from './ResearchNeedsYouFixAction'
import { ResearchProposalRow } from './research-proposal-row'
import { researchRelativeTime } from './research-relative-time'
import { ResearchRunStatusLine } from './ResearchRunStatusLine'
import { catalogRunReference } from './use-research-harness-experiment'

function FindingActions({
  workspace,
  finding,
  onSent
}: {
  workspace: ExperimentWorkspace
  finding: ResearchFinding
  onSent: () => void
}): React.JSX.Element | null {
  const { experiment, scope, brief } = workspace
  if (!experiment || !scope) {
    return null
  }
  return (
    <>
      <ResearchNeedsYouFixAction workspace={workspace} finding={finding} />
      {brief.brief?.agentPolicy.triage === 'off' ? null : (
        <ResearchAskExperimentAgent
          experiment={experiment}
          target={{ kind: 'triage', finding }}
          onSent={onSent}
        />
      )}
      <ResearchFindingStatusAction
        experiment={experiment}
        slug={scope.experiment}
        finding={finding}
        status="dismissed"
        onChanged={workspace.findings.refresh}
      />
    </>
  )
}

function RunNameButton({ name, onOpen }: { name: string; onOpen: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      className="rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
    >
      {name}
    </button>
  )
}

function runNameOf(workspace: ExperimentWorkspace): (reference: string) => string {
  return (reference) =>
    workspace.runs.find((run) => catalogRunReference(run) === reference)?.name ?? reference
}

/** "Sent · just now" under an item whose question went to the experiment agent. */
function SentNote({ at }: { at: string | undefined }): React.JSX.Element | null {
  return at ? (
    <p role="status" className="text-xs text-muted-foreground">
      Sent to the experiment agent · {researchRelativeTime(at)}
    </p>
  ) : null
}

function NeedsYouEntry({
  item,
  workspace,
  sentAt,
  onSent
}: {
  item: NeedsYouItem
  workspace: ExperimentWorkspace
  sentAt: string | undefined
  onSent: () => void
}): React.JSX.Element | null {
  const { experiment, scope } = workspace
  if (!experiment) {
    return null
  }
  const runName = runNameOf(workspace)
  switch (item.kind) {
    case 'failed-run': {
      const { run, finding } = item
      const reference = catalogRunReference(run)
      return (
        <NotebookRow
          marker={<NotebookSeverityMarker severity="fail" />}
          title={
            <>
              <RunNameButton name={run.name} onOpen={() => workspace.openRun(run.id)} /> failed
            </>
          }
          meta={
            finding ? (
              <span title={findingIdentifiers(finding)}>
                {findingPresentation(finding, runName).summary ?? finding.text}
              </span>
            ) : (
              <ResearchRunStatusLine facts={item.status} />
            )
          }
          actions={
            finding ? (
              <FindingActions workspace={workspace} finding={finding} onSent={onSent} />
            ) : (
              <>
                {scope && reference ? (
                  <ResearchExperimentChatButton
                    experiment={experiment}
                    build={(setup) => failedRunPrompt(setup, reference)}
                    onSent={onSent}
                  >
                    Ask agent
                  </ResearchExperimentChatButton>
                ) : null}
                <Button size="xs" variant="ghost" onClick={() => workspace.dismissRun(item.key)}>
                  Dismiss
                </Button>
              </>
            )
          }
        >
          <SentNote at={sentAt} />
        </NotebookRow>
      )
    }
    case 'finding': {
      const { finding } = item
      const { title, summary } = findingPresentation(finding, runName)
      const meta = [
        summary,
        // Why: rule checks rerun on every read, so their time and source say nothing.
        finding.source === 'rule' ? null : FINDING_SOURCE_LABELS[finding.source],
        finding.source === 'rule' ? null : finding.runs.map(runName).join(', '),
        finding.source === 'rule' ? null : researchRelativeTime(finding.createdAt)
      ]
        .filter(Boolean)
        .join(' · ')
      return (
        <NotebookRow
          marker={<NotebookSeverityMarker severity={finding.severity} />}
          title={title}
          meta={meta ? <span title={`${meta}\n${findingIdentifiers(finding)}`}>{meta}</span> : null}
          actions={<FindingActions workspace={workspace} finding={finding} onSent={onSent} />}
        >
          <SentNote at={sentAt} />
        </NotebookRow>
      )
    }
    case 'proposal':
    case 'handoff':
      return (
        <ResearchProposalRow
          proposal={item.proposal}
          decisions={workspace.decisions}
          runName={runName}
          onImplement={() =>
            workspace.decisions.handToWorkbench(item.proposal, workspace.findings.findings)
          }
        />
      )
  }
}

/** Only what waits on a person: decisions on Runs, failures, and open problems. */
export function ResearchExperimentNotebookNeedsYou({
  workspace
}: {
  workspace: ExperimentWorkspace
}): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const [findingsOpen, setFindingsOpen] = useState(false)
  // Why per item key: the acknowledgement belongs to the item that was asked about.
  const [sent, setSent] = useState<ReadonlyMap<string, string>>(new Map())
  const { experiment, scope, findings, proposals, needsYou } = workspace
  if (!experiment) {
    return null
  }
  const errors = [findings.error, proposals.error].filter(
    (error): error is string => error !== null
  )
  const shown = expanded ? needsYou : needsYou.slice(0, NEEDS_YOU_SHOWN)
  const allFindings = Boolean(scope && findings.available && findings.findings.length > 0)
  if (!needsYou.length && !errors.length && !allFindings) {
    return null
  }
  const markSent = (key: string): void =>
    setSent((current) => new Map(current).set(key, new Date().toISOString()))
  return (
    <NotebookSection
      label="Needs you"
      action={
        allFindings ? (
          <Button
            size="xs"
            variant={findingsOpen ? 'secondary' : 'ghost'}
            aria-pressed={findingsOpen}
            onClick={() => setFindingsOpen((value) => !value)}
          >
            All findings
          </Button>
        ) : null
      }
    >
      {errors.map((error) => (
        <p key={error} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ))}
      {findingsOpen && allFindings ? (
        // Why replace the list: the open findings would otherwise show twice.
        <ResearchFindingsPanel experiment={experiment} runs={workspace.runs} state={findings} />
      ) : needsYou.length ? (
        <>
          <ul className="divide-y divide-border">
            {shown.map((item) => (
              <NeedsYouEntry
                key={item.key}
                item={item}
                workspace={workspace}
                sentAt={sent.get(item.key)}
                onSent={() => markSent(item.key)}
              />
            ))}
          </ul>
          {needsYou.length > NEEDS_YOU_SHOWN ? (
            <Button size="xs" variant="ghost" onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Show fewer' : `Show all (${needsYou.length})`}
            </Button>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {findings.loading ? 'Reading checks…' : 'Nothing waits on you.'}
        </p>
      )}
    </NotebookSection>
  )
}
