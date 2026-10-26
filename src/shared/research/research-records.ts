import { z } from 'zod'
import { researchDelegationSchema } from './research-delegation-record'
import { isManuscriptPathInsideWorkspace } from './research-manuscript-path'

export { isManuscriptPathInsideWorkspace } from './research-manuscript-path'

export const researchRunLogTailParamsSchema = z.object({ runId: z.string().uuid() })

const csvMappingSchema = z
  .object({
    xColumn: z.string().min(1).nullable(),
    metricColumns: z.array(z.string().min(1)).min(1).max(200)
  })
  .refine(
    (mapping) =>
      new Set(mapping.metricColumns).size === mapping.metricColumns.length &&
      !mapping.metricColumns.includes(mapping.xColumn ?? ''),
    'CSV metric columns must be unique and exclude the x-axis'
  )

const metricSnapshotSchema = z.object({
  capturedAt: z.string(),
  partial: z.boolean(),
  metrics: z
    .array(
      z.object({
        name: z.string().min(1),
        split: z.string(),
        value: z.number().finite()
      })
    )
    .max(24)
})

const manuscriptSchema = z
  .object({
    sourcePath: z.string().min(1).max(4096),
    pdfPath: z.string().min(1).max(4096).nullable()
  })
  .strict()

export const paperSchema = z
  .object({
    id: z.string().uuid(),
    experimentId: z.string().uuid(),
    title: z.string().trim().min(1).max(240),
    authors: z.string().trim().max(500).optional(),
    year: z.number().int().min(1).max(9999).optional(),
    doi: z.string().trim().min(1).max(256).optional(),
    notes: z.string().max(10_000).optional(),
    pdfPath: z.string().min(1).max(4096).optional(),
    externalUrl: z
      .url()
      .regex(/^https?:\/\//i)
      .max(4096)
      .optional(),
    createdAt: z.string()
  })
  .strict()

export const experimentSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    projectId: z.string().nullable(),
    workspaceId: z.string().min(1),
    workspacePath: z.string().min(1),
    hostId: z.string().min(1),
    catalogSlug: z.string().min(1).max(64).optional(),
    lastSelectedRunId: z.string().uuid().nullable().optional(),
    manuscript: manuscriptSchema.optional(),
    /** Existing structured agent chat dedicated to this Experiment's manuscript work. */
    writingAgentSessionId: z.string().trim().min(1).max(256).optional(),
    /** Existing structured agent chat docked in this Experiment's workspace. */
    experimentAgentSessionId: z.string().trim().min(1).max(256).optional(),
    archived: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string()
  })
  .superRefine((experiment, context) => {
    if (
      experiment.manuscript &&
      !isManuscriptPathInsideWorkspace(
        experiment.workspacePath,
        experiment.manuscript.sourcePath,
        '.tex'
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['manuscript', 'sourcePath'],
        message: 'Manuscript source must be a .tex file inside its workspace'
      })
    }
    if (
      experiment.manuscript?.pdfPath &&
      !isManuscriptPathInsideWorkspace(
        experiment.workspacePath,
        experiment.manuscript.pdfPath,
        '.pdf'
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['manuscript', 'pdfPath'],
        message: 'Manuscript PDF must be inside its workspace'
      })
    }
  })

export const runSchema = z.object({
  id: z.string().uuid(),
  experimentId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  hostId: z.string().min(1),
  workspaceId: z.string().min(1),
  workspacePath: z.string().min(1),
  sourcePath: z.string().min(1),
  format: z.enum(['jsonl', 'csv']),
  sourceRunId: z.string().min(1).nullable().optional(),
  sourceAnchor: z
    .object({
      characters: z
        .number()
        .int()
        .positive()
        .max(10 * 1024 * 1024),
      sha256: z.string().regex(/^[a-f0-9]{64}$/)
    })
    .nullable()
    .optional(),
  metricSnapshot: metricSnapshotSchema.nullable().optional(),
  csvMapping: csvMappingSchema.nullable().optional(),
  logPath: z.string().nullable(),
  configPath: z.string().nullable(),
  /** Optional JSONL with sampleId, prompt, output and a workspace-local imagePath. */
  outputsPath: z.string().min(1).max(4096).nullable().optional(),
  manifestPath: z.string().nullable().optional(),
  execution: z.enum(['unknown', 'running', 'succeeded', 'failed', 'cancelled']),
  reportedBy: z.enum(['unavailable', 'user', 'manifest', 'runtime']),
  observedAt: z.string().nullable(),
  createdAt: z.string()
})

export const researchDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    experiments: z.array(experimentSchema).max(1000),
    runs: z.array(runSchema).max(10_000),
    detachedCatalogRunSourceKeys: z.array(z.string().min(1)).max(10_000).default([]),
    removedCatalogExperimentKeys: z.array(z.string().min(1)).max(10_000).default([]),
    papers: z.array(paperSchema).max(10_000).default([]),
    delegations: z.array(researchDelegationSchema).max(500).default([]),
    conversationExperimentIds: z
      .record(z.string().min(1), z.string().uuid().nullable())
      .default({}),
    conversationHomes: z
      .record(
        z.string().min(1),
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('library') }),
          z.object({ kind: z.literal('writing'), experimentId: z.string().uuid().nullable() }),
          z.object({ kind: z.literal('experiment'), experimentId: z.string().uuid() })
        ])
      )
      .default({}),
    writingAgentSessionByScope: z.record(z.string(), z.string().trim().min(1).max(256)).default({}),
    selectedExperimentByWorkspace: z.record(z.string(), z.string().uuid()).default({}),
    selectedExperimentId: z.string().uuid().nullable(),
    selectedRunId: z.string().uuid().nullable(),
    comparisonRunIds: z.array(z.string().uuid()).max(6),
    baselineRunId: z.string().uuid().nullable()
  })
  .superRefine((document, context) => {
    const experiments = new Map(document.experiments.map((entry) => [entry.id, entry]))
    const runIds = new Set(document.runs.map((entry) => entry.id))
    const paperIds = new Set(document.papers.map((entry) => entry.id))
    const delegationIds = new Set(document.delegations.map((entry) => entry.id))
    if (experiments.size !== document.experiments.length || runIds.size !== document.runs.length) {
      context.addIssue({ code: 'custom', message: 'Duplicate research record ID' })
    }
    if (paperIds.size !== document.papers.length) {
      context.addIssue({ code: 'custom', path: ['papers'], message: 'Duplicate Paper ID' })
    }
    if (delegationIds.size !== document.delegations.length) {
      context.addIssue({
        code: 'custom',
        path: ['delegations'],
        message: 'Duplicate delegation ID'
      })
    }
    for (const [index, delegation] of document.delegations.entries()) {
      if (delegation.sourceExperimentId && !experiments.has(delegation.sourceExperimentId)) {
        context.addIssue({
          code: 'custom',
          path: ['delegations', index, 'sourceExperimentId'],
          message: 'Delegation Experiment is missing'
        })
      }
    }
    for (const [tabId, experimentId] of Object.entries(document.conversationExperimentIds)) {
      if (experimentId !== null && !experiments.has(experimentId)) {
        context.addIssue({
          code: 'custom',
          path: ['conversationExperimentIds', tabId],
          message: 'Linked conversation Experiment is missing'
        })
      }
    }
    for (const [index, paper] of document.papers.entries()) {
      const owner = experiments.get(paper.experimentId)
      if (!owner) {
        context.addIssue({
          code: 'custom',
          path: ['papers', index, 'experimentId'],
          message: 'Paper Experiment is missing'
        })
      } else if (
        paper.pdfPath &&
        !isManuscriptPathInsideWorkspace(owner.workspacePath, paper.pdfPath, '.pdf')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['papers', index, 'pdfPath'],
          message: 'Paper PDF must be inside its Experiment workspace'
        })
      }
    }
    for (const run of document.runs) {
      const experiment = experiments.get(run.experimentId)
      if (
        !experiment ||
        experiment.hostId !== run.hostId ||
        experiment.workspaceId !== run.workspaceId
      ) {
        context.addIssue({ code: 'custom', message: 'Run owner does not match its Experiment' })
      }
    }
    for (const experiment of document.experiments) {
      if (
        experiment.lastSelectedRunId &&
        !document.runs.some(
          (run) => run.id === experiment.lastSelectedRunId && run.experimentId === experiment.id
        )
      ) {
        context.addIssue({ code: 'custom', message: 'Experiment last Run is missing' })
      }
    }
    const importedExperiments = document.experiments
      .filter((experiment) => experiment.catalogSlug)
      .map((experiment) =>
        JSON.stringify([experiment.hostId, experiment.workspaceId, experiment.catalogSlug])
      )
    if (new Set(importedExperiments).size !== importedExperiments.length) {
      context.addIssue({ code: 'custom', message: 'Duplicate catalog Experiment link' })
    }
    if (document.selectedExperimentId && !experiments.has(document.selectedExperimentId)) {
      context.addIssue({ code: 'custom', message: 'Selected Experiment is missing' })
    }
    for (const [scope, id] of Object.entries(document.selectedExperimentByWorkspace)) {
      const experiment = experiments.get(id)
      if (!experiment || JSON.stringify([experiment.hostId, experiment.workspaceId]) !== scope) {
        context.addIssue({
          code: 'custom',
          path: ['selectedExperimentByWorkspace', scope],
          message: 'Saved Experiment workspace link is invalid'
        })
      }
    }
    if (document.selectedRunId && !runIds.has(document.selectedRunId)) {
      context.addIssue({ code: 'custom', message: 'Selected Run is missing' })
    }
    if (
      document.comparisonRunIds.some((id) => !runIds.has(id)) ||
      new Set(document.comparisonRunIds).size !== document.comparisonRunIds.length
    ) {
      context.addIssue({ code: 'custom', message: 'Comparison has missing or duplicate Runs' })
    }
    if (document.baselineRunId && !document.comparisonRunIds.includes(document.baselineRunId)) {
      context.addIssue({ code: 'custom', message: 'Baseline is outside comparison' })
    }
  })

export type ExperimentRecord = z.infer<typeof experimentSchema>
export type ResearchRunRecord = z.infer<typeof runSchema>
export type ResearchDelegationRecord = z.infer<typeof researchDelegationSchema>
export type PaperRecord = z.infer<typeof paperSchema>
export type ResearchDocument = z.infer<typeof researchDocumentSchema>

export function emptyResearchDocument(): ResearchDocument {
  return {
    schemaVersion: 1,
    revision: 0,
    experiments: [],
    runs: [],
    detachedCatalogRunSourceKeys: [],
    removedCatalogExperimentKeys: [],
    papers: [],
    delegations: [],
    conversationExperimentIds: {},
    conversationHomes: {},
    writingAgentSessionByScope: {},
    selectedExperimentByWorkspace: {},
    selectedExperimentId: null,
    selectedRunId: null,
    comparisonRunIds: [],
    baselineRunId: null
  }
}
