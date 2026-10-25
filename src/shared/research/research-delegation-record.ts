import { z } from 'zod'

export const researchDelegationSchema = z
  .object({
    id: z.string().uuid(),
    sourceWorkspaceId: z.string().min(1),
    sourceHostId: z.string().min(1),
    sourceExperimentId: z.string().uuid().nullable(),
    targetWorkspaceId: z.string().min(1),
    targetHostId: z.string().min(1),
    targetLabel: z.string().trim().min(1).max(240),
    agent: z.string().min(1).max(80),
    task: z.string().trim().min(1).max(240),
    tabId: z.string().min(1).nullable(),
    sessionId: z.string().min(1).nullable(),
    /** Explicitly promoted by the user; background work otherwise stays outside Workbench. */
    workbenchVisible: z.boolean().optional(),
    state: z.enum(['launching', 'ready', 'unknown', 'failed', 'cancelled']),
    createdAt: z.string(),
    updatedAt: z.string()
  })
  .strict()
