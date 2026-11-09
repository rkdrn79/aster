import { useSyncExternalStore, type ReactNode } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { FigurePage } from '../../../../research-harness/research-figures-model.mjs'
import type { FigureStyle } from '../../../../research-harness/research-figures-style.mjs'
import type { ProjectFileOwner } from './research-project-files'

/** What an Inspector section sees and how it edits: one call, one undo step. */
export type InspectorContext = {
  selected: readonly ExcalidrawElement[]
  elements: readonly ExcalidrawElement[]
  style: FigureStyle
  page: FigurePage | null
  /** Applies a proposed scene (settled first, so followers come along) as one undo step. */
  commit: (next: readonly ExcalidrawElement[]) => void
  api: () => ExcalidrawImperativeAPI | null
  project: { owner: ProjectFileOwner; folder: string }
}

export type InspectorSection = {
  id: string
  /** Lower comes first; the built-in sections use 10–60. */
  order?: number
  when: (context: InspectorContext) => boolean
  render: (context: InspectorContext) => ReactNode
}

const sections = new Map<string, InspectorSection>()
const listeners = new Set<() => void>()
let snapshot: InspectorSection[] = []

/** Adds (or replaces, by id) a section of the figure Inspector. Returns a function that removes it. */
export function registerInspectorSection(section: InspectorSection): () => void {
  sections.set(section.id, section)
  snapshot = [...sections.values()].toSorted((a, b) => (a.order ?? 100) - (b.order ?? 100))
  for (const listener of listeners) {
    listener()
  }
  return () => {
    if (sections.get(section.id) === section) {
      sections.delete(section.id)
      snapshot = snapshot.filter((entry) => entry !== section)
      for (const listener of listeners) {
        listener()
      }
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useInspectorSections(): InspectorSection[] {
  return useSyncExternalStore(subscribe, () => snapshot)
}
