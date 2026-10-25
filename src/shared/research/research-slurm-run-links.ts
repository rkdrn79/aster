import { z } from 'zod'
import { RESEARCH_RUN_JOB_STATES } from './research-run-manifest'
import { RESEARCH_RECORD_ROOTS } from './research-run-reference'

const isoTime = z.iso.datetime({ offset: true })

/** A SLURM job Aster submitted for a Run, tracked until its end is written into run.json. */
export const researchSlurmRunLinkSchema = z.object({
  targetId: z.string().min(1).max(512),
  hostLabel: z.string().max(200).nullable(),
  jobId: z.string().min(1).max(128),
  projectPath: z.string().min(1).max(4096),
  experiment: z.string().min(1).max(64),
  runId: z.string().min(1).max(64),
  /** The record tree the Run was found in at submit; absent in links made before ADR-004. */
  recordRoot: z.enum(RESEARCH_RECORD_ROOTS).optional(),
  submittedAt: isoTime,
  state: z.enum(RESEARCH_RUN_JOB_STATES),
  reason: z.string().max(500).nullable(),
  exitCode: z.number().int().nullable(),
  observedAt: isoTime,
  /** The job state last written into run.json; null until a write succeeds. */
  manifestState: z.enum(RESEARCH_RUN_JOB_STATES).nullable(),
  manifestMessage: z.string().max(500).nullable(),
  /** Set once the job ended and run.json says so; tracking stops. */
  closedAt: isoTime.nullable()
})
export type ResearchSlurmRunLink = z.infer<typeof researchSlurmRunLinkSchema>

export const researchSlurmRunLinksDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative().optional(),
  links: z.array(researchSlurmRunLinkSchema).max(2000)
})
export type ResearchSlurmRunLinksDocument = z.infer<typeof researchSlurmRunLinksDocumentSchema>

export function emptyResearchSlurmRunLinksDocument(): ResearchSlurmRunLinksDocument {
  return { schemaVersion: 1, revision: 0, links: [] }
}
