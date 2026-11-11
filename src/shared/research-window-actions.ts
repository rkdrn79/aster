import { z } from 'zod'
import { researchDelegationSchema } from './research/research-delegation-record'
import { isTuiAgent } from './tui-agent-config'
import type { TuiAgent } from './tui-agent'

/**
 * What a research window asks the main window to do with the tabs, which only the main window
 * owns: a research window renders from a copy of its state, so a tab made, closed or renamed
 * there is overwritten by the next copy.
 */

const id = (max: number) => z.string().min(1).max(max)
const WORKSPACE_ID_MAX = 4096
const HOST_ID_MAX = 512
const TAB_ID_MAX = 1024
// Why so large: a judge or loop prompt can carry a whole rubric or plan.
const PROMPT_MAX = 2_000_000

/** An agent started in the background (a loop, a judge, a delegation), tracked as a Background task. */
const backgroundLaunchSchema = z
  .object({
    agent: z.custom<TuiAgent>((value) => isTuiAgent(value)),
    hostId: id(HOST_ID_MAX),
    workspaceId: id(WORKSPACE_ID_MAX),
    surface: z.enum(['chat', 'terminal']),
    prompt: z.string().max(PROMPT_MAX),
    promptDelivery: z.enum(['auto-submit', 'submit-after-ready']),
    /** The chat's title; without one it keeps the agent's name. */
    label: id(512).optional(),
    /** A host that declines a chat opens no terminal instead, which would drop the prompt. */
    noFallbackTerminal: z.boolean().optional()
  })
  .strict()

/** The Background task record, less what the launch fills in. */
const backgroundDelegationSchema = researchDelegationSchema.omit({
  tabId: true,
  sessionId: true,
  state: true,
  createdAt: true,
  updatedAt: true,
  workbenchVisible: true
})

const fileSchema = z
  .object({ absolutePath: id(WORKSPACE_ID_MAX), relativePath: id(WORKSPACE_ID_MAX) })
  .strict()

const actionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('launch-background-agent'),
      launch: backgroundLaunchSchema,
      delegation: backgroundDelegationSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal('close-chat'),
      workspaceId: id(WORKSPACE_ID_MAX),
      tabId: id(TAB_ID_MAX),
      entityId: id(TAB_ID_MAX)
    })
    .strict(),
  z
    .object({
      kind: z.literal('rename-chat'),
      workspaceId: id(WORKSPACE_ID_MAX),
      tabId: id(TAB_ID_MAX),
      label: id(512)
    })
    .strict(),
  z
    .object({
      kind: z.literal('open-in-editor'),
      workspaceId: id(WORKSPACE_ID_MAX),
      hostId: id(HOST_ID_MAX),
      file: fileSchema,
      besidePdf: fileSchema.nullable().optional()
    })
    .strict()
])

export type ResearchBackgroundLaunch = z.infer<typeof backgroundLaunchSchema>
export type ResearchBackgroundDelegation = z.infer<typeof backgroundDelegationSchema>
export type ResearchWindowFile = z.infer<typeof fileSchema>
export type ResearchWindowAction = z.infer<typeof actionSchema>

/** How an action went; a background launch that failed says whether it never started or was not recorded. */
export type ResearchWindowActionResult =
  | { ok: true; delegationId?: string }
  | { ok: false; error: string; stage?: 'launch' | 'record' }

const resultSchema = z.union([
  z.object({ ok: z.literal(true), delegationId: z.string().optional() }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.string(),
      stage: z.enum(['launch', 'record']).optional()
    })
    .strict()
])

export function parseResearchWindowAction(value: unknown): ResearchWindowAction | null {
  const parsed = actionSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseResearchWindowActionResult(value: unknown): ResearchWindowActionResult | null {
  const parsed = resultSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
