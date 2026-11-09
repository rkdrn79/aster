import { useCallback } from 'react'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import { newFigurePromptContext, sendFigureStart } from './research-figure-chat-send'
import { figurePromptContext } from './research-figure-prompt-context'
import type { FigureReference } from './research-figure-recreate'
import { AGENT_TAB_ID, openFigureSidePanelTab } from './research-figure-side-panel'
import {
  buildFigureMessageContext,
  type FigureQuickRequest
} from './research-figures-agent-prompts'
import type { FigureMessageContext, FiguresAgentScope } from './research-figures-agent-session'
import { openFiguresSidePanel } from './research-figures-layout-mode'
import { newFigureSendTrack } from './research-figures-page-helpers'
import { createFigure } from './research-figures-store'
import type { ProjectFileOwner } from './research-project-files'
import type { NewFigureRequest } from './ResearchFigureNewDialog'

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** What the Figures page sends and creates: the agent requests and the New figure dialog. */
export function useFiguresPageRequests(input: {
  owner: ProjectFileOwner
  folder: string | null
  manuscript: string | null
  agentScope: FiguresAgentScope
  openSlug: string | null
  onRecreate: () => void
}) {
  const { owner, folder, manuscript, agentScope, openSlug, onRecreate } = input

  function requestHost() {
    const handle = useFigureEditorHandle.getState().handle
    const open = handle && openSlug !== null && handle.target.slug === openSlug
    return {
      api: open ? handle.api : null,
      target: open ? handle.target : null,
      folder: folder ?? '',
      owner,
      manuscript,
      scope: agentScope,
      save: open ? handle.save : async () => true
    }
  }

  const messageContext = useCallback((): FigureMessageContext | null => {
    if (!folder) {
      return null
    }
    const handle = useFigureEditorHandle.getState().handle
    const open = handle && openSlug !== null && handle.target.slug === openSlug
    return buildFigureMessageContext(
      figurePromptContext({
        api: open ? handle.api : null,
        target: open ? handle.target : null,
        folder,
        owner,
        manuscript
      })
    )
  }, [folder, owner, manuscript, openSlug])

  async function quickRequest(request: FigureQuickRequest): Promise<string | null> {
    if (!folder) {
      return 'The figures folder is not known yet.'
    }
    const { sendFigureQuickRequest } = await import('./research-figure-requests')
    return sendFigureQuickRequest(requestHost(), request)
  }

  async function sendRecreate(
    reference: FigureReference,
    matchPage: boolean,
    maxHeightIn: number | null
  ) {
    const { sendFigureRecreateRequest } = await import('./research-figure-recreate')
    const failure = await sendFigureRecreateRequest(
      requestHost(),
      reference,
      matchPage,
      maxHeightIn
    )
    if (!failure) {
      openFiguresSidePanel()
    }
    return failure
  }

  async function createFromDialog(request: NewFigureRequest): Promise<string | null> {
    if (!folder) {
      return 'The figures folder is not known yet.'
    }
    try {
      if (request.start !== 'plot') {
        await createFigure(owner, request.slug, request.size, request.name)
      }
    } catch (cause) {
      return errorText(cause)
    }
    if (request.start === 'image') {
      onRecreate()
      return null
    }
    const context = newFigurePromptContext({
      owner,
      folder,
      manuscript,
      slug: request.slug,
      size: request.size
    })
    const failure = await sendFigureStart(
      agentScope,
      context,
      { kind: request.start, description: request.description, template: request.template },
      request.start === 'plot' || request.start === 'blank'
        ? null
        : await newFigureSendTrack(owner, folder, request.slug)
    )
    if (request.start !== 'blank') {
      openFigureSidePanelTab(AGENT_TAB_ID)
      openFiguresSidePanel()
    }
    return failure
  }

  return { requestHost, messageContext, quickRequest, sendRecreate, createFromDialog }
}
