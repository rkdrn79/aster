import { useEffect, useState } from 'react'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { ResearchMediaKind } from '../../../../shared/research/research-run-media'
import { mediaFileType } from '../../../../shared/media-file-extensions'
import { researchErrorText } from './research-error-text'
import { readResearchImageBlobUrl } from './research-file-reader'

/** Where a media path is read from: the Run's workspace on its host. */
export type ResearchMediaSource = Pick<
  ResearchRunRecord,
  'workspacePath' | 'workspaceId' | 'hostId'
>

type ResearchMediaUrl = { url: string; kind: ResearchMediaKind; bytes: number }

const MAX_CACHED_URLS = 4000
// Why cache: main hands out a fresh URL per request, and a fresh src would reload the element.
const urls = new Map<string, Promise<ResearchMediaUrl>>()

export const MEDIA_OUTSIDE_PROJECT = 'This file is outside the project.'

function fetchMediaUrl(source: ResearchMediaSource, path: string): Promise<ResearchMediaUrl> {
  if (source.hostId !== 'local') {
    // Why: the media protocol serves local files only; remote images keep the bounded runtime read.
    return mediaFileType(path)?.kind === 'image'
      ? readResearchImageBlobUrl(source, path).then((url) => ({ url, kind: 'image', bytes: 0 }))
      : Promise.reject(new Error('Video and audio play only from local projects.'))
  }
  const api = window.api.researchMedia
  if (!api) {
    return Promise.reject(new Error('Reload this window to show media.'))
  }
  return api.url({ workspacePath: source.workspacePath, path })
}

function requestMediaUrl(source: ResearchMediaSource, path: string): Promise<ResearchMediaUrl> {
  const key = JSON.stringify([source.hostId, source.workspaceId, source.workspacePath, path])
  const cached = urls.get(key)
  if (cached) {
    return cached
  }
  const request = fetchMediaUrl(source, path)
  urls.set(key, request)
  request.catch(() => {
    if (urls.get(key) === request) {
      urls.delete(key)
    }
  })
  if (urls.size > MAX_CACHED_URLS) {
    const oldest = urls.keys().next()
    if (!oldest.done) {
      urls.delete(oldest.value)
    }
  }
  return request
}

// Why NUL: main refuses it in a path, so it cannot occur inside a candidate.
const PATH_SEPARATOR = '\u0000'

/** The first candidate main serves; a missing first candidate falls through to the next. */
async function firstMediaUrl(
  source: ResearchMediaSource,
  paths: readonly string[]
): Promise<ResearchMediaUrl> {
  let firstError: unknown = new Error(MEDIA_OUTSIDE_PROJECT)
  for (const [index, path] of paths.entries()) {
    try {
      return await requestMediaUrl(source, path)
    } catch (cause) {
      if (index === 0) {
        firstError = cause
      }
    }
  }
  throw firstError
}

/**
 * A loadable URL for a media file given as project-relative paths to try in order, requested
 * only once `wanted` turns true. No paths means the file is outside the project.
 */
export function useResearchMediaUrl(
  source: ResearchMediaSource,
  paths: readonly string[],
  wanted: boolean
): { url: string | null; error: string | null } {
  const { hostId, workspaceId, workspacePath } = source
  const pathsKey = paths.join(PATH_SEPARATOR)
  const key = JSON.stringify([hostId, workspaceId, workspacePath, pathsKey])
  const [loaded, setLoaded] = useState<{ key: string; url: string | null; error: string | null }>()
  useEffect(() => {
    if (!wanted || !pathsKey) {
      return
    }
    const requestKey = JSON.stringify([hostId, workspaceId, workspacePath, pathsKey])
    let active = true
    firstMediaUrl({ hostId, workspaceId, workspacePath }, pathsKey.split(PATH_SEPARATOR)).then(
      (result) => {
        if (active) {
          setLoaded({ key: requestKey, url: result.url, error: null })
        }
      },
      (cause: unknown) => {
        if (active) {
          setLoaded({ key: requestKey, url: null, error: researchErrorText(cause) })
        }
      }
    )
    return () => {
      active = false
    }
  }, [hostId, workspaceId, workspacePath, pathsKey, wanted])
  if (!pathsKey) {
    return { url: null, error: MEDIA_OUTSIDE_PROJECT }
  }
  return loaded?.key === key ? loaded : { url: null, error: null }
}

/** A ref for an element and whether it has come within a screen's reach of the viewport. */
export function useNearViewport(): [(element: Element | null) => void, boolean] {
  const [element, setElement] = useState<Element | null>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (!element || near) {
      return
    }
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: '240px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, near])
  return [setElement, near]
}
