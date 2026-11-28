import { create } from 'zustand'
import type { FigurePreviewSidecar } from './research-figure-preview'
import type { FigureTarget } from './research-figures-export'

/** What the Figures page says about a figure the agent and the person share. */
export type FigureCowork = {
  /** The newest preview: when, and whether the open editor or the background renderer drew it. */
  preview: { renderedAt: string; renderer: 'editor' | 'background' | null } | null
  /** The agent's latest write the canvas took, and how many elements it changed. */
  agent: { at: number; changed: number } | null
  /** The person's hand edits kept over script runs, in words, and the last ones a run overrode. */
  edits: { count: number; lines: string[]; overrode: string[] } | null
}

const EMPTY: FigureCowork = { preview: null, agent: null, edits: null }

export const useFigureCowork = create<{ figures: Record<string, FigureCowork> }>(() => ({
  figures: {}
}))

/** One figure across folders' moves: its project and slug, like the turn store's key. */
export function figureCoworkKey(target: Pick<FigureTarget, 'owner' | 'slug'>): string {
  return JSON.stringify([target.owner.hostId, target.owner.workspaceId, target.slug])
}

function patch(target: Pick<FigureTarget, 'owner' | 'slug'>, next: Partial<FigureCowork>): void {
  const key = figureCoworkKey(target)
  useFigureCowork.setState((state) => ({
    figures: { ...state.figures, [key]: { ...(state.figures[key] ?? EMPTY), ...next } }
  }))
}

export function noteFigurePreview(
  target: Pick<FigureTarget, 'owner' | 'slug'>,
  sidecar: Pick<FigurePreviewSidecar, 'renderedAt' | 'renderer'>
): void {
  patch(target, {
    preview: { renderedAt: sidecar.renderedAt, renderer: sidecar.renderer ?? null }
  })
}

export function noteFigureAgentChange(
  target: Pick<FigureTarget, 'owner' | 'slug'>,
  changed: number
): void {
  if (changed > 0) {
    patch(target, { agent: { at: Date.now(), changed } })
  }
}

export function noteFigurePersonEdits(
  target: Pick<FigureTarget, 'owner' | 'slug'>,
  edits: FigureCowork['edits']
): void {
  patch(target, { edits })
}

export function figureCowork(target: Pick<FigureTarget, 'owner' | 'slug'>): FigureCowork {
  return useFigureCowork.getState().figures[figureCoworkKey(target)] ?? EMPTY
}

export function useFigureCoworkEntry(target: Pick<FigureTarget, 'owner' | 'slug'>): FigureCowork {
  return useFigureCowork((state) => state.figures[figureCoworkKey(target)] ?? EMPTY)
}
