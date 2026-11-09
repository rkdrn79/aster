import { withAsterContext } from '../../../../shared/aster-context-block'
import {
  figureFilePaths,
  figurePage,
  newFigureScene,
  type FigureSize
} from '../../../../research-harness/research-figures-model.mjs'
import {
  buildFigureMessageContext,
  buildFigureQuickPrompt,
  figureContextKey,
  type FigurePromptContext
} from './research-figures-agent-prompts'
import {
  openFigureChatSession,
  sendFigurePrompt,
  withFigureMessageContext,
  type FiguresAgentScope
} from './research-figures-agent-session'
import { attachFigureTurnSession, beginFigureTurn, failFigureTurn } from './research-figure-turn'
import type { FigureTarget } from './research-figures-export'
import { openFigureSlug } from './research-figures-store'
import { projectAbsolutePath, type ProjectFileOwner } from './research-project-files'

/** How a new figure starts; everything but Blank asks the Figure agent right after creating it. */
export type FigureStart = 'blank' | 'describe' | 'method' | 'template' | 'image' | 'plot'

/** Kit templates people start from most; `figures kit templates` lists them all for the agent. */
export const FIGURE_TEMPLATES: readonly { id: string; label: string; detail: string }[] = [
  { id: 'transformer', label: 'Transformer block', detail: 'pre-norm block ×N in a panel' },
  { id: 'clip', label: 'CLIP', detail: 'image and text encoders, similarity matrix' },
  { id: 'diffusion', label: 'Diffusion', detail: 'x_T → … → x_0 on noisy thumbnails' },
  { id: 'unet', label: 'U-Net', detail: 'down, bottleneck, up, skip links' },
  { id: 'vq', label: 'VQ codebook', detail: 'nearest code lookup, z_e → z_q' },
  { id: 'moe', label: 'Mixture of experts', detail: 'router and experts, top-k' },
  { id: 'lora', label: 'LoRA', detail: 'frozen W beside trained A·B' },
  { id: 'qformer', label: 'Q-Former', detail: 'learned queries over a frozen encoder' },
  { id: 'kvcache', label: 'KV cache', detail: 'cached keys and values, the new step' }
]

/** The prompt context of a figure that was just created and is not on the canvas yet. */
export function newFigurePromptContext(input: {
  owner: ProjectFileOwner
  folder: string
  manuscript: string | null
  slug: string
  size: FigureSize
}): FigurePromptContext {
  const { owner, folder, slug } = input
  return {
    folderPath: projectAbsolutePath(owner, folder),
    workFolderPath: projectAbsolutePath(owner, folder),
    manuscriptPath: input.manuscript ? projectAbsolutePath(owner, input.manuscript) : null,
    figure: {
      slug,
      scenePath: projectAbsolutePath(owner, figureFilePaths(folder, slug).scene),
      page: figurePage(newFigureScene(input.size).elements)
    }
  }
}

/** The figure a request is about, as it was just before the send ("before send"). */
export type FigureSendTrack = { target: FigureTarget; beforeText: string | null }

/**
 * Sends a request as one tracked turn to its figure's own chat, like the quick actions: "before
 * send" goes to that figure's History and its list entry follows the agent until the turn ends.
 */
async function sendTracked(
  scope: FiguresAgentScope,
  input: { request: string; prompt: string; key?: string },
  track: FigureSendTrack | null,
  slug: string | null
): Promise<string | null> {
  const id = beginFigureTurn({
    target: track?.target ?? null,
    request: input.request,
    prompt: input.prompt,
    scope,
    beforeText: track?.beforeText ?? null
  })
  const failure = await sendFigurePrompt(scope, slug, input.prompt, {
    contextKey: input.key,
    onSession: (sessionId) => attachFigureTurnSession(id, sessionId)
  })
  if (failure) {
    failFigureTurn(id, failure)
  }
  return failure
}

/** Sends what the person typed to its figure's chat, with context when that chat has not seen it. */
export async function sendFigureChatText(
  scope: FiguresAgentScope,
  context: FigurePromptContext,
  text: string,
  track: FigureSendTrack | null = null
): Promise<string | null> {
  const message = buildFigureMessageContext(context)
  // Why the open figure last: its canvas may not be ready yet, and the chat is still its own.
  const slug = track?.target.slug ?? context.figure?.slug ?? openFigureSlug(scope)
  const sessionId = await openFigureChatSession(scope, slug)
  const prompt = sessionId
    ? withFigureMessageContext(sessionId, text, message)
    : withAsterContext(text, { label: message.label, body: message.body })
  return sendTracked(scope, { request: text, prompt, key: message.key }, track, slug)
}

function templatePrompt(context: FigurePromptContext, template: string): string {
  const message = buildFigureMessageContext(context)
  return withAsterContext(`Start this figure from the ${template} template.`, {
    label: message.label,
    body: [
      message.body,
      `Draw \`fig.template('${template}', { id: '${template}', x, y })\` inside the page (\`node H/cli.mjs figures kit ${template}\` prints its options), then rename its labels to the manuscript's terms and notation. Check and preview as above, then tell me in one sentence what to change next.`
    ].join('\n')
  })
}

/** Asks the agent for the start the person picked; null once sent, else what went wrong. */
export function sendFigureStart(
  scope: FiguresAgentScope,
  context: FigurePromptContext,
  start: { kind: FigureStart; description: string; template: string },
  /** The new figure; null for a plot, which is no drawing. */
  track: FigureSendTrack | null = null
): Promise<string | null> {
  const key = figureContextKey(context)
  switch (start.kind) {
    case 'blank':
    case 'image':
      return Promise.resolve(null)
    case 'describe':
      return sendFigureChatText(scope, context, start.description.trim(), track)
    case 'method':
      return sendTracked(
        scope,
        {
          request: 'Draw from the method section',
          prompt: buildFigureQuickPrompt(context, 'draw-method'),
          key
        },
        track,
        context.figure?.slug ?? null
      )
    case 'template':
      return sendTracked(
        scope,
        {
          request: `Start from the ${start.template} template`,
          prompt: templatePrompt(context, start.template),
          key
        },
        track,
        context.figure?.slug ?? null
      )
    case 'plot': {
      const slug = context.figure?.slug
      const prompt = buildFigureQuickPrompt({ ...context, figure: null }, 'plot')
      return sendTracked(
        scope,
        {
          request: 'Plot from Runs',
          prompt: slug
            ? prompt.replace(
                'Plot results from the Runs.',
                `Plot results from the Runs as ${slug}.py and ${slug}.pdf.`
              )
            : prompt
        },
        null,
        null
      )
    }
  }
}
