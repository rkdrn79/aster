import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { relativePathInsideRoot } from '../../../../shared/cross-platform-path'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import {
  manifestSourceMismatch,
  type ResearchRunManifest
} from '../../../../shared/research/research-run-manifest'
import { useResearchRecords } from './research-records-store'
import {
  observeResearchRun,
  readResearchRunManifest,
  readResearchTextFile,
  readResearchTextTail,
  researchSourceIdentityMismatch,
  type ResearchTextTail,
  type RunObservation
} from './research-source-reader'
import { ResearchMetricCurve } from './ResearchMetricCurve'
import { ResearchLogPanel } from './ResearchLogPanel'
import {
  effectiveRunStatusFacts,
  runStatusFactsFromManifest,
  type ResearchRunStatusFacts
} from './research-run-status-label'
import { ResearchRunStatusLine } from './ResearchRunStatusLine'
import { isWindowVisible } from '@/lib/window-visibility-interval'
import { useRemoteHostLabel } from './research-host-label'
import { ResearchRunDetails } from './ResearchRunDetails'
import { researchErrorText } from './research-error-text'
import { hasNamedSplit, metricGroupLabel } from './research-metric-label'
import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import { ResearchExperimentWorkspaceRunFindings } from './ResearchExperimentWorkspaceRunFindings'
import { ResearchRunMediaSection } from './ResearchRunMediaSection'
import type { ResearchRunSummary } from '../../../../shared/research/research-run-summary'
import { ResearchRunNotes } from './ResearchRunNotes'
import { ResearchRunInspectorActions } from './ResearchRunInspectorActions'
import { openManuscriptInEditor } from './research-writing-open-editor'

export const ATTACHED_FILE_NOTE = 'Attached file — checks, ratings, and media unavailable'

const REPORTED_BY: Record<ResearchRunRecord['reportedBy'], string | null> = {
  unavailable: null,
  user: 'set by you',
  manifest: 'from run.json',
  runtime: 'from the job'
}

/** Opens a Run file in the Workbench editor of the Run's workspace. */
function openRunFile(run: ResearchRunRecord, path: string): void {
  const experiment = useResearchRecords
    .getState()
    .document?.experiments.find((entry) => entry.id === run.experimentId)
  const error = experiment
    ? openManuscriptInEditor(experiment, {
        absolutePath: path,
        relativePath: relativePathInsideRoot(run.workspacePath, path) || path
      })
    : 'The Experiment of this Run is missing.'
  if (error) {
    toast.error(error)
  }
}

export type ResearchMetricSourceHealth = {
  state: 'checking' | 'connected' | 'cached' | 'unavailable' | 'identity-mismatch'
  observedAt: string | null
}

export function RunInspector({
  run,
  live,
  watched,
  findings,
  notes,
  attachedFile,
  onDetach,
  onSourceHealthChange
}: {
  run: ResearchRunRecord
  /** run.json status as the research harness last read it, with launcher liveness. */
  live: ResearchRunStatusFacts | null
  /** `Watched: …` when an agent set a `research watch` on this Run. */
  watched: string | null
  /** Open quality findings for this Run. */
  findings: ResearchFinding[]
  /** Notes agents and the user left in its summary.json, oldest first. */
  notes: ResearchRunSummary['notes']
  /** Not in the research/ catalog, so the harness cannot check, rate, or index it. */
  attachedFile: boolean
  onDetach: (id: string) => void
  onSourceHealthChange: (id: string, health: ResearchMetricSourceHealth) => void
}): React.JSX.Element {
  const [observation, setObservation] = useState<RunObservation | null>(null)
  const [log, setLog] = useState<ResearchTextTail | null>(null)
  const [logError, setLogError] = useState<string | null>(null)
  const [config, setConfig] = useState<string | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [manifest, setManifest] = useState<ResearchRunManifest | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)
  const requestId = useRef(0)
  const lastSuccessfulReadAt = useRef<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    const current = ++requestId.current
    setBusy(true)
    setError(null)
    onSourceHealthChange(run.id, { state: 'checking', observedAt: lastSuccessfulReadAt.current })
    try {
      const [nextObservation, nextLog, nextConfig, nextManifest] = await Promise.all([
        observeResearchRun(run).then(
          (value) => ({ value, error: null }),
          (cause) => ({ value: null, error: researchErrorText(cause) })
        ),
        run.logPath
          ? readResearchTextTail(run, run.logPath).then(
              (value) => ({ value, error: null }),
              (cause) => ({ value: null, error: researchErrorText(cause) })
            )
          : Promise.resolve({ value: null, error: null }),
        run.configPath
          ? readResearchTextFile(run, run.configPath).then(
              (value) => ({ value, error: null }),
              (cause) => ({ value: null, error: researchErrorText(cause) })
            )
          : Promise.resolve({ value: null, error: null }),
        readResearchRunManifest(run).then(
          (value) => ({ value, error: null }),
          (cause) => ({ value: null, error: researchErrorText(cause) })
        )
      ])
      if (current !== requestId.current) {
        return
      }
      const sourceMismatch = nextObservation.value
        ? researchSourceIdentityMismatch(run, nextObservation.value)
        : null
      const manifestMismatch = nextObservation.value
        ? manifestSourceMismatch(nextManifest.value, nextObservation.value.sourceRunId)
        : null
      if (sourceMismatch || manifestMismatch) {
        setError(sourceMismatch ?? manifestMismatch)
        setManifestError(null)
        onSourceHealthChange(run.id, {
          state: 'identity-mismatch',
          observedAt: lastSuccessfulReadAt.current
        })
        return
      }
      if (nextObservation.value) {
        setObservation(nextObservation.value)
        lastSuccessfulReadAt.current = nextObservation.value.observedAt
        onSourceHealthChange(run.id, {
          state: 'connected',
          observedAt: nextObservation.value.observedAt
        })
      } else {
        onSourceHealthChange(run.id, {
          state: lastSuccessfulReadAt.current ? 'cached' : 'unavailable',
          observedAt: lastSuccessfulReadAt.current
        })
      }
      setError(nextObservation.error)
      setLog((previous) => (nextLog.error ? previous : nextLog.value))
      setLogError(nextLog.error)
      setConfig((previous) => (nextConfig.error ? previous : nextConfig.value))
      setConfigError(nextConfig.error)
      const unchecked =
        !nextObservation.value && nextManifest.value
          ? 'Metrics file unavailable, so run.json could not be checked.'
          : null
      setManifest(unchecked ? null : nextManifest.value)
      setManifestError(unchecked ?? nextManifest.error)
    } catch (cause) {
      if (current === requestId.current) {
        setError(researchErrorText(cause))
        onSourceHealthChange(run.id, {
          state: lastSuccessfulReadAt.current ? 'cached' : 'unavailable',
          observedAt: lastSuccessfulReadAt.current
        })
      }
    } finally {
      if (current === requestId.current) {
        setBusy(false)
      }
    }
  }, [onSourceHealthChange, run])

  useEffect(() => {
    void refresh()
    return () => {
      requestId.current += 1
    }
  }, [refresh])

  const status = effectiveRunStatusFacts(
    run,
    live ?? (manifest ? runStatusFactsFromManifest(manifest) : null)
  )
  const running = status.state === 'running' && status.liveness !== 'exited'
  useEffect(() => {
    if (!running) {
      return
    }
    // Why slower over SSH: each refresh reads metrics, log and run.json across the connection.
    const timer = window.setInterval(
      () => {
        if (isWindowVisible()) {
          void refresh()
        }
      },
      run.hostId === 'local' ? 10_000 : 30_000
    )
    return () => window.clearInterval(timer)
  }, [refresh, run.hostId, running])

  const metricGroups = [
    ...new Set(observation?.events.map((event) => `${event.metric}\u0000${event.split}`) ?? [])
  ]
  const activeGroup =
    selectedMetric && metricGroups.includes(selectedMetric) ? selectedMetric : metricGroups[0]
  const [activeMetric, activeSplit] = activeGroup?.split('\u0000') ?? []
  const showSplit = hasNamedSplit(metricGroups)
  const remoteHost = useRemoteHostLabel(run.hostId)
  const reportedBy = REPORTED_BY[run.reportedBy]
  const logPath = run.logPath

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{run.name}</h2>
          <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
            <ResearchRunStatusLine facts={status} />
            {[reportedBy, remoteHost, watched]
              .filter((part): part is string => Boolean(part))
              .map((part) => (
                <span key={part}>· {part}</span>
              ))}
          </p>
          {attachedFile ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{ATTACHED_FILE_NOTE}</p>
          ) : null}
        </div>
        <ResearchRunInspectorActions
          run={run}
          busy={busy}
          onRefresh={() => void refresh()}
          onDetach={onDetach}
          onOpenLog={logPath ? () => openRunFile(run, logPath) : null}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {observation ? `Couldn't refresh; showing the last read. ${error}` : error}
        </p>
      ) : null}
      {manifestError ? (
        <p role="alert" className="text-xs text-destructive">
          run.json unavailable: {manifestError}
        </p>
      ) : null}
      <ResearchExperimentWorkspaceRunFindings run={run} findings={findings} />
      {busy && !observation ? <p className="text-sm text-muted-foreground">Reading…</p> : null}
      {observation ? (
        <div className="space-y-4">
          {observation.errorRows ? (
            <p className="text-xs text-destructive">
              {observation.errorRows} {observation.errorRows === 1 ? 'row' : 'rows'} could not be
              read.
            </p>
          ) : null}
          {activeGroup ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {metricGroups.slice(0, 8).map((group) => (
                  <Button
                    key={group}
                    size="xs"
                    variant={activeGroup === group ? 'secondary' : 'ghost'}
                    onClick={() => setSelectedMetric(group)}
                  >
                    {metricGroupLabel(group)}
                  </Button>
                ))}
              </div>
              <ResearchMetricCurve
                series={[
                  {
                    id: run.id,
                    name: run.name,
                    events: observation.events.filter(
                      (event) => event.metric === activeMetric && event.split === activeSplit
                    )
                  }
                ]}
                xLabel={observation.xLabel}
                valueLabel={metricGroupLabel(activeGroup)}
              />
            </div>
          ) : null}
          {observation.metrics.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2">Metric</th>
                    {showSplit ? <th className="pb-2">Split</th> : null}
                    <th className="pb-2">Last value</th>
                    <th className="pb-2">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...new Set(
                      observation.events.map((event) => `${event.metric}\u0000${event.split}`)
                    )
                  ].map((key) => {
                    const [metric, split] = key.split('\u0000')
                    const values = observation.events.filter(
                      (event) => event.metric === metric && event.split === split
                    )
                    const last = values.at(-1)
                    return (
                      <tr key={key} className="border-t border-border">
                        <td className="py-2 font-mono">{metric}</td>
                        {showSplit ? <td>{split}</td> : null}
                        <td className="font-mono">{last?.value ?? '—'}</td>
                        <td>{values.length}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No numeric metrics found.</p>
          )}
        </div>
      ) : null}
      <ResearchRunNotes run={run} notes={notes} />
      {logPath ? (
        <ResearchLogPanel
          key={run.id}
          path={logPath}
          log={log}
          error={logError}
          failed={status.state === 'failed'}
          onOpenFull={() => openRunFile(run, logPath)}
        />
      ) : null}
      {attachedFile ? null : <ResearchRunMediaSection run={run} />}
      {run.configPath ? (
        <section>
          <h3 className="text-sm font-medium" title={run.configPath}>
            Config
            {configError && config !== null
              ? " · couldn't refresh"
              : config === null
                ? ' · unavailable'
                : ''}
          </h3>
          {configError ? <p className="text-xs text-destructive">{configError}</p> : null}
          {config !== null ? (
            <pre className="scrollbar-sleek mt-2 max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
              {config.slice(0, 100_000)}
              {config.length > 100_000 ? '\n… First 100,000 characters shown.' : ''}
            </pre>
          ) : null}
        </section>
      ) : null}
      <ResearchRunDetails
        run={run}
        manifest={manifest}
        observation={observation}
        durationMs={status.durationMs ?? null}
      />
    </div>
  )
}
