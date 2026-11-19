import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { withAsterContext } from '../../../../shared/aster-context-block'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { FIGURE_ART_DIRECTOR_RULE } from '../../../../research-harness/research-figures-style-rules.mjs'
import { researchChatTitle } from './research-chat-label'
import { writingAgentScopeKey } from './research-conversation-home'
import { figureAgentSessionId, type FiguresAgentScope } from './research-figure-chat-slots'
import { readCarefulCritic, writeCarefulCritic } from './research-figure-careful'
import { currentFigurePromptModes } from './research-figure-reference-library'
import type { FigureTarget } from './research-figures-export'
import { useResearchRecords } from './research-records-store'

// Careful drawing's art director: a separate chat Aster starts for one figure, with the same agent
// (and so the same model settings) as the figure's own chat. The Figure agent reaches it through
// Aster's orchestration mail (send a question, wait, read the reply); `figures careful --review`
// reads the address written here.

/** The art director's standing brief: who it is, how requests arrive, what it answers. */
export function buildFigureCriticPrompt(input: { slug: string; title: string | null }): string {
  const name = input.title ? `"${input.title}" (${input.slug})` : input.slug
  return withAsterContext(`Be the art director for the figure ${name}.`, {
    label: `Art director ${input.slug}`,
    body: [
      `You are the art director for the figure ${name} in this research project: a separate reviewer, not the Figure agent that draws it. Never edit files, run its drawing script or redraw anything; look, measure and answer.`,
      'The Figure agent sends one request per round with `aster orchestration send`; it arrives in this chat as Aster mail. Read it with `aster orchestration check --json` (its id is the message id), open every image it names (the print-size render, the reference it follows) and look closely, then answer with `aster orchestration reply --id <message_id> --body "<your answer>"`.',
      FIGURE_ART_DIRECTOR_RULE,
      `Measure before you write a number: \`node H/cli.mjs figures critique --figure ${input.slug}\` and \`node H/cli.mjs figures check --figure ${input.slug}\` print sizes, gaps, colours and text sizes, and only read (\`aster research harness-path\` gives H).`,
      'Reply now with one word, "Ready", and wait for the first request.'
    ].join('\n')
  })
}

/** The agent of the figure's own chat; the research default (or Claude) when it has none. */
export function criticAgent(scope: FiguresAgentScope, slug: string): TuiAgent {
  const state = useAppStore.getState()
  const sessionId = figureAgentSessionId(useResearchRecords.getState().document, scope, slug)
  const tab = sessionId
    ? (state.unifiedTabsByWorktree[scope.workspaceId] ?? []).find(
        (entry) => entry.entityId === sessionId
      )
    : undefined
  if (isTuiAgent(tab?.agentSessionAgent)) {
    return tab.agentSessionAgent
  }
  const preferred = state.settings?.defaultTuiAgent
  return preferred === 'claude' || preferred === 'codex' ? preferred : 'claude'
}

async function chatOpen(scope: FiguresAgentScope, sessionId: string): Promise<boolean> {
  const { researchChatSessionTabs } = await import('./ResearchAgentChatPane')
  const state = useAppStore.getState()
  return researchChatSessionTabs(
    state,
    state.unifiedTabsByWorktree[scope.workspaceId] ?? [],
    scope.hostId
  ).some((tab) => tab.entityId === sessionId)
}

const starting = new Map<string, Promise<string | null>>()

async function startCritic(
  scope: FiguresAgentScope,
  target: FigureTarget,
  title: string | null,
  replace: boolean
): Promise<string | null> {
  const current = await readCarefulCritic(target.owner, target)
  const sessionId = current?.address.slice('orca_session_id:'.length)
  if (current && sessionId && !replace && (await chatOpen(scope, sessionId))) {
    return null
  }
  const agent = criticAgent(scope, target.slug)
  const { launchResearchChat } = await import('./ResearchAgentChatPane')
  const launched = await launchResearchChat({
    hostId: scope.hostId,
    workspaceId: scope.workspaceId,
    agent,
    prompt: buildFigureCriticPrompt({ slug: target.slug, title }),
    label: researchChatTitle('Art director', title ?? target.slug),
    activate: false
  })
  if ('error' in launched) {
    return `The art director could not start: ${launched.error}`
  }
  await writeCarefulCritic(target.owner, target, {
    address: `orca_session_id:${launched.sessionId}`,
    agent,
    startedAt: new Date().toISOString()
  })
  return null
}

/**
 * Starts the figure's art director unless a live one is already there (`replace`: the Figure agent
 * asked for a new one). One start at a time per figure; resolves to an error to show, or null.
 */
export function ensureFigureCritic(
  scope: FiguresAgentScope,
  target: FigureTarget,
  options: { title?: string | null; replace?: boolean } = {}
): Promise<string | null> {
  const key = `${writingAgentScopeKey(scope)}|${target.folder}|${target.slug}`
  const running = starting.get(key)
  if (running) {
    return running
  }
  const run = startCritic(scope, target, options.title ?? null, options.replace ?? false).catch(
    (cause: unknown) =>
      `The art director could not start: ${cause instanceof Error ? cause.message : String(cause)}`
  )
  starting.set(key, run)
  void run.finally(() => starting.delete(key))
  return run
}

/**
 * A whole-figure request just went out with careful drawing on: start its art director now, so
 * it is ready by the first review (the Figure agent can still ask for one later).
 */
export function warmFigureCritic(scope: FiguresAgentScope, target: FigureTarget | null): void {
  if (!target || !currentFigurePromptModes(scope).careful) {
    return
  }
  void ensureFigureCritic(scope, target).then((failure) => {
    if (failure) {
      toast.error(failure)
    }
  })
}
