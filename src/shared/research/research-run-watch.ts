import { z } from 'zod'
import { RESEARCH_RUN_EXECUTION_STATES, RESEARCH_RUN_JOB_STATES } from './research-run-manifest'
import { MAX_RESEARCH_WATCH_CONDITIONS } from './research-run-watch-conditions'

const isoTime = z.iso.datetime({ offset: true })

export const RESEARCH_WATCH_DELIVERY_STATES = [
  'pending',
  'delivered',
  'no-owner',
  'expired'
] as const

const runStateSchema = z.object({
  execution: z.enum(RESEARCH_RUN_EXECUTION_STATES).nullable(),
  executionSource: z.string().max(64).nullable(),
  job: z.enum(RESEARCH_RUN_JOB_STATES).nullable(),
  jobReason: z.string().max(500).nullable()
})
export type ResearchWatchRunState = z.infer<typeof runStateSchema>

export const researchWatchEventSchema = z.object({
  condition: z.string().min(1).max(300),
  /** Fired because the Run ended though no terminal condition was asked for. */
  implicit: z.boolean(),
  firedAt: isoTime,
  evidence: z.string().max(600),
  runState: runStateSchema,
  lastMetrics: z.string().max(400).nullable(),
  notifiedAt: isoTime.nullable(),
  delivery: z.object({
    state: z.enum(RESEARCH_WATCH_DELIVERY_STATES),
    attempts: z.number().int().nonnegative(),
    lastAttemptAt: isoTime.nullable(),
    deliveredAt: isoTime.nullable(),
    detail: z.string().max(400).nullable()
  })
})
export type ResearchWatchEvent = z.infer<typeof researchWatchEventSchema>

export const researchWatchOwnerSchema = z.object({
  terminalHandle: z.string().min(1).max(256).nullable(),
  paneKey: z.string().min(1).max(256).nullable(),
  agentSessionId: z.string().min(1).max(256).nullable()
})
export type ResearchWatchOwner = z.infer<typeof researchWatchOwnerSchema>

const fileCursorSchema = z.object({
  offset: z.number().int().nonnegative(),
  size: z.number().int().nonnegative().nullable(),
  mtimeMs: z.number().nonnegative().nullable()
})
export type ResearchWatchFileCursor = z.infer<typeof fileCursorSchema>

export const researchRunWatchSchema = z.object({
  id: z.string().regex(/^w-[a-z0-9]{6,32}$/),
  createdAt: isoTime,
  run: z.object({
    targetId: z.string().min(1).max(512).nullable(),
    /** SSH host label when created, for messages after the host is renamed or removed. */
    hostLabel: z.string().max(200).nullable(),
    projectPath: z.string().min(1).max(4096),
    experiment: z.string().min(1).max(64),
    runId: z.string().min(1).max(64)
  }),
  conditions: z.array(z.string().min(1).max(300)).min(1).max(MAX_RESEARCH_WATCH_CONDITIONS),
  notify: z.enum(['self', 'none']),
  message: z.string().max(1000).nullable(),
  owner: researchWatchOwnerSchema.nullable(),
  state: z.enum(['active', 'done', 'cancelled']),
  endedAt: isoTime.nullable(),
  metricsCursor: fileCursorSchema,
  logCursor: fileCursorSchema,
  lastProgressAt: isoTime,
  lastCheckedAt: isoTime.nullable(),
  lastError: z.string().max(500).nullable(),
  lastMetrics: z.string().max(400).nullable(),
  runState: runStateSchema.nullable(),
  fired: z.array(researchWatchEventSchema).max(MAX_RESEARCH_WATCH_CONDITIONS + 1)
})
export type ResearchRunWatch = z.infer<typeof researchRunWatchSchema>

export const researchRunWatchDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative().optional(),
  watches: z.array(researchRunWatchSchema).max(2000)
})
export type ResearchRunWatchDocument = z.infer<typeof researchRunWatchDocumentSchema>

export function emptyResearchRunWatchDocument(): ResearchRunWatchDocument {
  return { schemaVersion: 1, revision: 0, watches: [] }
}
