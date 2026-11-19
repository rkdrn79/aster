import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { FiguresAgentScope } from './research-figure-chat-slots'
import {
  figuresWantingCritic,
  readCarefulCritic,
  readCarefulRecord,
  readCarefulSketches,
  type CarefulCritic,
  type CarefulRecord
} from './research-figure-careful'
import { ensureFigureCritic } from './research-figure-critic'
import type { ProjectFileOwner } from './research-project-files'

const POLL_MS = 2500
const WATCH_MS = 4000
// Why: a start that failed (no agent on the host) is retried a minute later, not every poll.
const RETRY_MS = 60_000
const THUMB_PX = 240

export type CarefulSketchShown = { name: string; url: string | null }

export type CarefulState = {
  record: CarefulRecord | null
  critic: CarefulCritic | null
  sketches: CarefulSketchShown[]
}

const EMPTY: CarefulState = { record: null, critic: null, sketches: [] }

/** The open figure's careful drawing record, its art director and sketch thumbnails, kept fresh. */
export function useCarefulState(
  owner: ProjectFileOwner,
  target: { folder: string; slug: string } | null,
  enabled: boolean
): CarefulState {
  const [state, setState] = useState<CarefulState>(EMPTY)
  const signatureRef = useRef('')
  const folder = target?.folder ?? null
  const slug = target?.slug ?? null
  useEffect(() => {
    signatureRef.current = ''
    setState(EMPTY)
    if (!enabled || folder === null || slug === null) {
      return
    }
    let live = true
    const poll = async (): Promise<void> => {
      const where = { folder, slug }
      const [record, critic, sketches] = await Promise.all([
        readCarefulRecord(owner, where),
        readCarefulCritic(owner, where),
        readCarefulSketches(owner, where)
      ])
      const signature = JSON.stringify([
        record,
        critic,
        sketches.map((sketch) => `${sketch.name}:${sketch.text.length}`)
      ])
      if (!live || signature === signatureRef.current) {
        return
      }
      signatureRef.current = signature
      const { figureVersionDataUrl } = await import('./research-figure-history-render')
      const shown = await Promise.all(
        sketches.map(async (sketch) => ({
          name: sketch.name,
          url: await figureVersionDataUrl(sketch.text, THUMB_PX).catch(() => null)
        }))
      )
      if (live) {
        setState({ record, critic, sketches: shown })
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), POLL_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [owner, folder, slug, enabled])
  return state
}

/**
 * While careful drawing is on, starts the art director a figure's record asks for (the Figure
 * agent ran `figures careful --review` with none yet, or asked for a new one).
 */
export function useFigureCriticWatcher(
  scope: FiguresAgentScope,
  owner: ProjectFileOwner,
  folders: readonly string[],
  enabled: boolean
): void {
  const key = folders.join('\n')
  useEffect(() => {
    if (!enabled || !key) {
      return
    }
    let live = true
    const failedAt = new Map<string, number>()
    const watch = async (): Promise<void> => {
      for (const folder of key.split('\n')) {
        const slugs = await figuresWantingCritic(owner, folder).catch(() => [])
        for (const slug of slugs) {
          const id = `${folder}/${slug}`
          if (!live || Date.now() - (failedAt.get(id) ?? 0) < RETRY_MS) {
            continue
          }
          const failure = await ensureFigureCritic(
            scope,
            { owner, folder, slug },
            { replace: true }
          )
          if (failure) {
            failedAt.set(id, Date.now())
            toast.error(failure)
          }
        }
      }
    }
    void watch()
    const timer = window.setInterval(() => void watch(), WATCH_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [scope, owner, key, enabled])
}
