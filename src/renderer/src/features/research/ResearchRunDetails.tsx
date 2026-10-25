import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getIntlLocale } from '@/i18n/i18n'
import { relativePathInsideRoot } from '../../../../shared/cross-platform-path'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import {
  launchCodeEvidence,
  type ResearchRunManifest
} from '../../../../shared/research/research-run-manifest'
import type { RunObservation } from './research-source-reader'
import { formatRunDuration, researchRunStatusLabel } from './research-run-status-label'
import { ResearchDetails } from './ResearchPageLayout'
import { ResearchRunPatchDialog } from './ResearchRunPatchDialog'

/** The harness records `agent.provider` from the agent's environment markers. */
const AGENT_PROVIDER_LABELS: Record<string, string> = {
  'claude-code': 'Claude',
  codex: 'Codex',
  'gemini-cli': 'Gemini'
}

function launchedBy(manifest: ResearchRunManifest | null): string | null {
  const provider = manifest?.agent?.provider
  return provider ? (AGENT_PROVIDER_LABELS[provider] ?? provider) : null
}

function slurmJob(manifest: ResearchRunManifest | null): string | null {
  const job = manifest?.job
  if (!job) {
    return null
  }
  const scheduler = job.scheduler === 'slurm' ? 'SLURM job' : 'Job'
  return `${scheduler} ${job.jobId} · ${job.state.replaceAll('_', ' ')}`
}

/** Names a Run file by its place in the project; the full path stays on hover. */
function projectFile(run: ResearchRunRecord, path: string | null | undefined): React.ReactNode {
  if (!path) {
    return null
  }
  return <span title={path}>{relativePathInsideRoot(run.workspacePath, path) || path}</span>
}

/** One Run's files and provenance, kept out of the way until asked for. */
export function ResearchRunDetails({
  run,
  manifest,
  observation,
  durationMs
}: {
  run: ResearchRunRecord
  manifest: ResearchRunManifest | null
  observation: RunObservation | null
  durationMs: number | null
}): React.JSX.Element {
  const [patchOpen, setPatchOpen] = useState(false)
  const dataset = manifest?.evaluation?.datasetId
  const datasetVersion = manifest?.evaluation?.datasetRevision
  const launch = manifest?.launch
  const code = manifest?.code
  // Why the name check: the patch is read beside run.json, so only a plain file name is followed.
  const patchFile =
    code?.capturePhase === 'at_launch' && code.dirty && code.patch && /^[\w.-]+$/.test(code.patch)
      ? code.patch
      : null
  const commit = code?.commit ? code.commit.slice(0, 7) : null
  const rows: [string, React.ReactNode][] = [
    ['Launched by', launchedBy(manifest)],
    [
      'Command',
      manifest?.command ? (
        <span key="command" className="font-mono">
          {manifest.command}
        </span>
      ) : null
    ],
    ['Host', launch?.host],
    [
      'Started',
      launch?.startedAt ? new Date(launch.startedAt).toLocaleString(getIntlLocale()) : null
    ],
    ['Duration', durationMs !== null ? formatRunDuration(durationMs) : null],
    [
      'Code at launch',
      <span key="code" className="inline-flex flex-wrap items-baseline gap-x-2">
        {launchCodeEvidence(manifest)}
        {patchFile ? (
          <Button variant="link" size="xs" onClick={() => setPatchOpen(true)}>
            View patch
          </Button>
        ) : null}
      </span>
    ],
    ['Scheduler', slurmJob(manifest)],
    ['Metrics file', projectFile(run, run.sourcePath)],
    ['Log', projectFile(run, run.logPath)],
    ['Config', projectFile(run, run.configPath)],
    ['Outputs', projectFile(run, run.outputsPath)],
    ['run.json', projectFile(run, run.manifestPath) ?? 'Not attached'],
    ['Dataset', dataset ? `${dataset}${datasetVersion ? ` @ ${datasetVersion}` : ''}` : 'unknown'],
    [
      'run.json status',
      manifest?.execution
        ? `${researchRunStatusLabel(manifest.execution.state)} · ${new Date(manifest.execution.observedAt).toLocaleString(getIntlLocale())}`
        : null
    ],
    [
      'Last read',
      observation
        ? `${new Date(observation.observedAt).toLocaleString(getIntlLocale())} · x-axis ${observation.xLabel}${observation.incompleteLastLine ? ' · last line incomplete' : ''}`
        : null
    ],
    ['Replacement check', run.sourceAnchor ? null : 'Not available for this run']
  ]
  return (
    <>
      <ResearchDetails rows={rows.filter((row) => Boolean(row[1]))} />
      {patchFile ? (
        <ResearchRunPatchDialog
          run={run}
          patchFile={patchFile}
          commit={commit}
          open={patchOpen}
          onClose={() => setPatchOpen(false)}
        />
      ) : null}
    </>
  )
}
