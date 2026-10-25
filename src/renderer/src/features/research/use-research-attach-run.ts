import { useLayoutEffect, useRef, useState } from 'react'
import type {
  ExperimentRecord,
  ResearchDocument
} from '../../../../shared/research/research-records'
import {
  manifestSourceMismatch,
  type ResearchRunManifest
} from '../../../../shared/research/research-run-manifest'
import { useResearchRecords } from './research-records-store'
import {
  observeResearchRun,
  readResearchRunManifest,
  type RunObservation
} from './research-source-reader'
import { metricSnapshotFromObservation } from './research-metric-snapshot'
import { catalogWorkspacePath, type CatalogRun } from './research-project-catalog'
import { researchAttachCandidate } from './research-attach-candidate'
import { attachResearchRunRecord } from './research-run-record-links'
import { researchErrorText } from './research-error-text'

export function useResearchAttachRun(
  experiment: ExperimentRecord | undefined,
  document: ResearchDocument | null,
  saving: boolean
) {
  const [adding, setAdding] = useState(false)
  const [formOwnerId, setFormOwnerId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [logPath, setLogPath] = useState('')
  const [configPath, setConfigPath] = useState('')
  const [outputsPath, setOutputsPath] = useState('')
  const [manifestPath, setManifestPath] = useState('')
  const [csvXColumn, setCsvXColumn] = useState<string | null | undefined>(undefined)
  const [csvMetricColumns, setCsvMetricColumns] = useState<string[] | undefined>(undefined)
  const [preview, setPreview] = useState<RunObservation | null>(null)
  const [previewIdentity, setPreviewIdentity] = useState<string | null>(null)
  const [manifestPreview, setManifestPreview] = useState<ResearchRunManifest | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [choosingSource, setChoosingSource] = useState(false)
  const choosingSourceRef = useRef(false)
  const previewRequestId = useRef(0)
  const format = sourcePath.toLowerCase().endsWith('.csv') ? 'csv' : 'jsonl'
  const inputs = {
    name,
    sourcePath,
    logPath,
    configPath,
    outputsPath,
    manifestPath,
    csvXColumn,
    csvMetricColumns
  }
  const inputIdentity = JSON.stringify([experiment?.id, formOwnerId, inputs])
  const inputIdentityRef = useRef(inputIdentity)
  useLayoutEffect(() => {
    inputIdentityRef.current = inputIdentity
  }, [inputIdentity])

  function toggleAttachForm(): void {
    if (!experiment) {
      return
    }
    if (formOwnerId === experiment.id) {
      setAdding((value) => !value)
      return
    }
    previewRequestId.current += 1
    setPreviewing(false)
    setFormOwnerId(experiment.id)
    setAdding(true)
    setName('')
    setSourcePath('')
    setLogPath('')
    setConfigPath('')
    setOutputsPath('')
    setManifestPath('')
    setCsvXColumn(undefined)
    setCsvMetricColumns(undefined)
    setPreview(null)
    setPreviewIdentity(null)
    setManifestPreview(null)
    setPreviewError(null)
  }

  function prefillFromCatalog(run: CatalogRun): void {
    if (!experiment) {
      return
    }
    previewRequestId.current += 1
    setFormOwnerId(experiment.id)
    setAdding(true)
    setName(run.name)
    setSourcePath(catalogWorkspacePath(experiment.workspacePath, run.metrics))
    setLogPath(run.log ? catalogWorkspacePath(experiment.workspacePath, run.log) : '')
    setConfigPath(run.config ? catalogWorkspacePath(experiment.workspacePath, run.config) : '')
    setOutputsPath('')
    setManifestPath(catalogWorkspacePath(experiment.workspacePath, run.manifest))
    setCsvXColumn(undefined)
    setCsvMetricColumns(undefined)
    setPreview(null)
    setPreviewIdentity(null)
    setManifestPreview(null)
    setPreviewError(null)
  }

  async function chooseLocalMetricsFile(): Promise<void> {
    const ownerId = experiment?.id
    const chooserIdentity = inputIdentity
    if (!ownerId || experiment.hostId !== 'local' || choosingSourceRef.current) {
      return
    }
    choosingSourceRef.current = true
    setChoosingSource(true)
    try {
      const file = await window.api.shell.pickAttachment()
      if (
        !file ||
        useResearchRecords.getState().document?.selectedExperimentId !== ownerId ||
        inputIdentityRef.current !== chooserIdentity
      ) {
        return
      }
      setSourcePath(file)
      setName((current) =>
        current.trim()
          ? current
          : (file
              .split(/[\\/]/)
              .pop()
              ?.replace(/\.(jsonl|csv)$/i, '') ?? '')
      )
      setPreview(null)
      setPreviewIdentity(null)
      setManifestPreview(null)
      setPreviewError(null)
      setCsvXColumn(undefined)
      setCsvMetricColumns(undefined)
    } catch (cause) {
      if (
        useResearchRecords.getState().document?.selectedExperimentId === ownerId &&
        inputIdentityRef.current === chooserIdentity
      ) {
        setPreviewError(`Could not choose a local file: ${researchErrorText(cause)}`)
      }
    } finally {
      choosingSourceRef.current = false
      setChoosingSource(false)
    }
  }

  function candidate() {
    return researchAttachCandidate({
      experiment,
      format,
      preview,
      ...inputs
    })
  }

  async function inspectCandidate(): Promise<void> {
    const run = candidate()
    const inspectedIdentity = inputIdentity
    if (!run) {
      return
    }
    const requestId = ++previewRequestId.current
    setPreviewing(true)
    setPreviewError(null)
    try {
      const [observation, manifest] = await Promise.all([
        observeResearchRun(run),
        readResearchRunManifest(run)
      ])
      if (
        requestId !== previewRequestId.current ||
        inputIdentityRef.current !== inspectedIdentity ||
        useResearchRecords.getState().document?.selectedExperimentId !== run.experimentId
      ) {
        return
      }
      const mismatch = manifestSourceMismatch(manifest, observation.sourceRunId)
      if (mismatch) {
        throw new Error(mismatch)
      }
      setPreview(observation)
      setPreviewIdentity(inspectedIdentity)
      setManifestPreview(manifest)
    } catch (cause) {
      if (
        requestId !== previewRequestId.current ||
        inputIdentityRef.current !== inspectedIdentity ||
        useResearchRecords.getState().document?.selectedExperimentId !== run.experimentId
      ) {
        return
      }
      setPreviewError(researchErrorText(cause))
      setPreview(null)
      setPreviewIdentity(null)
      setManifestPreview(null)
    } finally {
      if (requestId === previewRequestId.current) {
        setPreviewing(false)
      }
    }
  }

  async function attach(): Promise<void> {
    const candidateRun = candidate()
    const run = candidateRun
      ? {
          ...candidateRun,
          csvMapping:
            format === 'csv' && preview
              ? {
                  xColumn: preview.csvSelectedXColumn,
                  metricColumns: preview.csvSelectedMetricColumns
                }
              : null,
          sourceRunId: preview?.sourceRunId ?? null,
          sourceAnchor: preview?.sourceAnchor ?? null,
          metricSnapshot: preview ? metricSnapshotFromObservation(preview) : null,
          execution: manifestPreview?.execution?.state ?? candidateRun.execution,
          reportedBy: manifestPreview?.execution?.reportedBy ?? candidateRun.reportedBy,
          observedAt: manifestPreview?.execution?.observedAt ?? candidateRun.observedAt
        }
      : null
    if (
      !run ||
      !preview ||
      (format === 'csv' && !preview.csvSelectedMetricColumns.length) ||
      previewIdentity !== inputIdentity ||
      saving
    ) {
      return
    }
    const duplicate = document?.runs.find(
      (entry) => entry.hostId === run.hostId && entry.sourcePath === run.sourcePath
    )
    if (duplicate) {
      setPreviewError(`Already attached as ${duplicate.name}.`)
      return
    }
    try {
      await useResearchRecords.getState().update((current) => attachResearchRunRecord(current, run))
      setAdding(false)
      setPreview(null)
      setPreviewIdentity(null)
      setName('')
      setSourcePath('')
      setLogPath('')
      setConfigPath('')
      setOutputsPath('')
      setManifestPath('')
      setManifestPreview(null)
      setCsvXColumn(undefined)
      setCsvMetricColumns(undefined)
    } catch {
      // The store keeps the save failure visible.
    }
  }

  return {
    adding,
    formOwnerId,
    name,
    setName,
    sourcePath,
    setSourcePath,
    logPath,
    setLogPath,
    configPath,
    setConfigPath,
    outputsPath,
    setOutputsPath,
    manifestPath,
    setManifestPath,
    csvXColumn,
    setCsvXColumn,
    csvMetricColumns,
    setCsvMetricColumns,
    preview,
    setPreview,
    previewIdentity,
    manifestPreview,
    setManifestPreview,
    previewError,
    setPreviewError,
    previewing,
    choosingSource,
    format,
    inputIdentity,
    toggleAttachForm,
    prefillFromCatalog,
    chooseLocalMetricsFile,
    inspectCandidate,
    attach
  }
}
