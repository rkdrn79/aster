import { z } from 'zod'
import {
  RESEARCH_FINDING_LAYERS,
  RESEARCH_FINDING_SEVERITIES,
  RESEARCH_FINDING_STATUSES,
  researchFindingEvidenceSchema,
  researchFindingListSchema,
  researchFindingSchema,
  type ResearchFinding,
  type ResearchFindingList,
  type ResearchFindingStatus
} from '../../shared/research/research-quality-findings'
import { authorizedProjectPath, callHarness, handle } from './research-harness-ipc'

const LEDGER_MODULE = 'research-quality-ledger.mjs'
// Same rules as the harness, so a refused request never reaches the ledger.
const EXPERIMENT_SLUG = /^[\p{L}\p{N}][\p{L}\p{N}-]{0,63}$/u
const CHECK = /^[a-z][a-z0-9.-]{0,63}$/u
const runReference = z.string().trim().min(1).max(160)

const experimentSchema = z.object({
  workspacePath: z.string().min(1).max(4096),
  experiment: z.string().regex(EXPERIMENT_SLUG)
})
const listSchema = experimentSchema
  .extend({
    status: z.enum([...RESEARCH_FINDING_STATUSES, 'all']).optional(),
    run: runReference.optional()
  })
  .strict()
const addSchema = experimentSchema
  .extend({
    check: z.string().regex(CHECK),
    severity: z.enum(RESEARCH_FINDING_SEVERITIES),
    layer: z.enum(RESEARCH_FINDING_LAYERS),
    text: z.string().trim().min(1).max(2000),
    runs: z.array(runReference).max(6),
    samples: z.array(z.string().min(1).max(256)).max(50).optional(),
    evidence: z.array(researchFindingEvidenceSchema).max(12).optional()
  })
  .strict()
const setStatusSchema = experimentSchema
  .extend({
    id: z.string().trim().min(1).max(320),
    status: z.enum(RESEARCH_FINDING_STATUSES),
    note: z.string().trim().max(2000).nullable()
  })
  .strict()
const addResultSchema = z.object({ finding: researchFindingSchema })
const setStatusResultSchema = z.object({
  id: z.string(),
  status: z.enum(RESEARCH_FINDING_STATUSES)
})

/** The app records findings and status changes only as the user; agents use the harness CLI. */
export function registerResearchFindingsIpcHandlers(): void {
  handle('researchFindings:list', listSchema, async (input): Promise<ResearchFindingList> =>
    researchFindingListSchema.parse(
      await callHarness(
        LEDGER_MODULE,
        'listFindings',
        await authorizedProjectPath(input.workspacePath),
        { experiment: input.experiment, run: input.run ?? null, status: input.status ?? 'open' }
      )
    )
  )
  handle(
    'researchFindings:add',
    addSchema,
    async (input): Promise<{ finding: ResearchFinding }> => {
      const { finding } = addResultSchema.parse(
        await callHarness(
          LEDGER_MODULE,
          'addFinding',
          await authorizedProjectPath(input.workspacePath),
          {
            experiment: input.experiment,
            check: input.check,
            severity: input.severity,
            layer: input.layer,
            text: input.text,
            runs: input.runs,
            samples: input.samples ?? [],
            evidence: input.evidence ?? [],
            createdBy: 'user'
          }
        )
      )
      return { finding }
    }
  )
  handle(
    'researchFindings:setStatus',
    setStatusSchema,
    async (input): Promise<{ id: string; status: ResearchFindingStatus }> =>
      setStatusResultSchema.parse(
        await callHarness(
          LEDGER_MODULE,
          'setFindingStatus',
          await authorizedProjectPath(input.workspacePath),
          {
            experiment: input.experiment,
            id: input.id,
            status: input.status,
            note: input.note || null,
            by: 'user'
          }
        )
      )
  )
}
