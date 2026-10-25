import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import { useResearchRecords } from './research-records-store'
import { ResearchCsvMapping } from './ResearchCsvMapping'
import type { useResearchAttachRun } from './use-research-attach-run'
import {
  readProjectCatalog,
  unlinkedCatalogRuns,
  type ProjectCatalog
} from './research-project-catalog'
import { researchRunStatusLabel } from './research-run-status-label'
import { researchErrorText } from './research-error-text'

export type ResearchAttachRunState = ReturnType<typeof useResearchAttachRun>

function CatalogPicker({
  experiment,
  runs,
  attach,
  catalog,
  onClose
}: {
  experiment: ExperimentRecord
  runs: ResearchRunRecord[]
  attach: ResearchAttachRunState
  catalog: ProjectCatalog
  onClose: () => void
}): React.JSX.Element {
  const choices = unlinkedCatalogRuns(catalog, experiment, runs)
  return (
    <section className="space-y-2 border-t border-border pt-3" aria-label="Unattached project runs">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Runs in this project not yet attached</h3>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      {choices.length ? (
        <div className="scrollbar-sleek max-h-52 space-y-1 overflow-auto">
          {choices.map((run) => (
            <button
              type="button"
              key={`${run.experimentName}:${run.id}`}
              className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => {
                attach.prefillFromCatalog(run)
                onClose()
              }}
            >
              <span className="block text-sm font-medium">{run.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {run.experimentName} · {run.metrics}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Every run here is already attached.</p>
      )}
    </section>
  )
}

/** Attach a metrics file (and optional log, config, run.json, outputs) as a Run. */
export function ResearchExperimentWorkspaceAttach({
  experiment,
  runs,
  attach,
  saving
}: {
  experiment: ExperimentRecord
  runs: ResearchRunRecord[]
  attach: ResearchAttachRunState
  saving: boolean
}): React.JSX.Element {
  const [catalog, setCatalog] = useState<{ owner: string; catalog: ProjectCatalog } | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<{ owner: string; message: string } | null>(null)
  const { preview, format } = attach

  async function loadCatalog(): Promise<void> {
    if (catalogLoading) {
      return
    }
    const owner = experiment.id
    setCatalogLoading(true)
    setCatalogError(null)
    setCatalog(null)
    try {
      const loaded = await readProjectCatalog(experiment)
      if (useResearchRecords.getState().document?.selectedExperimentId === owner) {
        setCatalog({ owner, catalog: loaded })
      }
    } catch (cause) {
      if (useResearchRecords.getState().document?.selectedExperimentId === owner) {
        setCatalogError({
          owner,
          message: `Could not read this project's runs. ${researchErrorText(cause)}`
        })
      }
    } finally {
      setCatalogLoading(false)
    }
  }

  const resetPreview = (): void => {
    attach.setPreview(null)
    attach.setManifestPreview(null)
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Attach a run</h2>
        <div className="flex items-center gap-1">
          {experiment.hostId === 'local' ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={catalogLoading}
              onClick={() => void loadCatalog()}
            >
              <FolderOpen aria-hidden />
              {catalogLoading ? 'Reading…' : 'Pick from project'}
            </Button>
          ) : null}
          <Button variant="ghost" size="xs" onClick={attach.toggleAttachForm}>
            Cancel
          </Button>
        </div>
      </div>
      {catalogError?.owner === experiment.id ? (
        <p role="alert" className="text-sm text-destructive">
          {catalogError.message}
        </p>
      ) : null}
      {catalog?.owner === experiment.id ? (
        <CatalogPicker
          experiment={experiment}
          runs={runs}
          attach={attach}
          catalog={catalog.catalog}
          onClose={() => setCatalog(null)}
        />
      ) : null}
      <Input
        value={attach.name}
        onChange={(event) => {
          attach.setName(event.target.value)
          resetPreview()
        }}
        placeholder="Run name"
        aria-label="Run name"
      />
      <div className="flex flex-wrap gap-2">
        <Input
          value={attach.sourcePath}
          onChange={(event) => {
            attach.setSourcePath(event.target.value)
            resetPreview()
            attach.setPreviewError(null)
            attach.setCsvXColumn(undefined)
            attach.setCsvMetricColumns(undefined)
          }}
          className="min-w-52 flex-1"
          placeholder="Metrics file (.jsonl or .csv)"
          aria-label="Metrics file path"
        />
        {experiment.hostId === 'local' ? (
          <Button
            variant="outline"
            size="sm"
            disabled={attach.choosingSource}
            onClick={() => void attach.chooseLocalMetricsFile()}
          >
            {attach.choosingSource ? 'Choosing…' : 'Choose local file'}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={attach.logPath}
          onChange={(event) => {
            attach.setLogPath(event.target.value)
            attach.setPreview(null)
          }}
          placeholder="Log file (optional)"
          aria-label="Log file path"
        />
        <Input
          value={attach.configPath}
          onChange={(event) => {
            attach.setConfigPath(event.target.value)
            attach.setPreview(null)
          }}
          placeholder="Config file (optional)"
          aria-label="Config file path"
        />
      </div>
      <Input
        value={attach.manifestPath}
        onChange={(event) => {
          attach.setManifestPath(event.target.value)
          resetPreview()
        }}
        placeholder="run.json (optional)"
        aria-label="Run manifest path"
      />
      <Input
        value={attach.outputsPath}
        onChange={(event) => {
          attach.setOutputsPath(event.target.value)
          attach.setPreview(null)
        }}
        placeholder="Sample outputs .jsonl (optional)"
        aria-label="Model outputs JSONL path"
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!attach.name.trim() || !attach.sourcePath.trim() || attach.previewing}
          onClick={() => void attach.inspectCandidate()}
        >
          {attach.previewing ? 'Reading…' : 'Preview source'}
        </Button>
        <Button
          size="sm"
          disabled={
            !preview ||
            (format === 'csv' && !preview.csvSelectedMetricColumns.length) ||
            attach.previewIdentity !== attach.inputIdentity ||
            saving
          }
          onClick={() => void attach.attach()}
        >
          Attach
        </Button>
      </div>
      {preview ? (
        <p className="text-xs text-muted-foreground">
          {[
            `${preview.events.length} numeric values`,
            preview.metrics.join(', ') || 'no metrics',
            `x-axis: ${preview.xLabel}`,
            preview.errorRows ? `${preview.errorRows} unreadable rows` : null,
            preview.incompleteLastLine ? 'last line incomplete' : null,
            attach.manifestPreview ? 'run.json matches' : null
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
      {format === 'csv' && preview?.csvColumns ? (
        <ResearchCsvMapping
          columns={preview.csvColumns}
          selectedX={
            attach.csvXColumn === undefined ? preview.csvSelectedXColumn : attach.csvXColumn
          }
          selectedMetrics={attach.csvMetricColumns ?? preview.csvSelectedMetricColumns}
          onXChange={(column) => {
            attach.setCsvXColumn(column)
            attach.setCsvMetricColumns((current) =>
              (current ?? preview.csvSelectedMetricColumns).filter((name) => name !== column)
            )
          }}
          onMetricsChange={(column, included) =>
            attach.setCsvMetricColumns((current) => {
              const selected = current ?? preview.csvSelectedMetricColumns
              return included
                ? [...new Set([...selected, column])]
                : selected.filter((name) => name !== column)
            })
          }
        />
      ) : null}
      {preview && attach.previewIdentity !== attach.inputIdentity ? (
        <p className="text-xs text-muted-foreground">Preview again to apply these columns.</p>
      ) : null}
      {attach.manifestPreview ? (
        <p className="text-xs text-muted-foreground">
          run.json: {researchRunStatusLabel(attach.manifestPreview.execution?.state ?? 'unknown')} ·
          dataset {attach.manifestPreview.evaluation?.datasetId ?? 'unknown'}
        </p>
      ) : null}
      {attach.previewError ? (
        <p role="alert" className="text-sm text-destructive">
          {attach.previewError}
        </p>
      ) : null}
    </div>
  )
}
