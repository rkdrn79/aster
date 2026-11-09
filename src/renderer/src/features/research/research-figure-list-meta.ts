import './excalidraw-asset-path'
import { useEffect, useState } from 'react'
import {
  PAGE_FRAME_ID,
  figureFilePaths
} from '../../../../research-harness/research-figures-model.mjs'
import { sceneSha256 } from './research-figure-document'
import { figureSceneMeta, type FigureSceneMeta } from './research-figure-list-model'
import { readProjectText, type ProjectFileOwner } from './research-project-files'

export type FigureListMeta = FigureSceneMeta & {
  thumbnail: string | null
  /** The scene's hash, which the paper's copy is compared with. */
  sceneSha256: string | null
}

const cache = new Map<string, Promise<FigureListMeta>>()
const settled = new Map<string, FigureListMeta>()
// Why: frames are editing aids; thumbnails show their contents, never their outline or name.
const FRAME_RENDERING = { enabled: true, clip: true, name: false, outline: false }

/** The figure drawn small from its scene, so it shows before it was ever opened or exported. */
async function sceneThumbnail(sceneText: string): Promise<string | null> {
  const { exportToSvg } = await import('@excalidraw/excalidraw')
  // Why JSON.parse's any: Excalidraw restores whatever the file holds, as the editor does.
  const scene = JSON.parse(sceneText)
  const all: { id: string; type: string; isDeleted?: boolean; frameId?: string | null }[] =
    Array.isArray(scene?.elements) ? scene.elements : []
  const live = all.filter((element) => !element.isDeleted)
  const page = live.find((element) => element.id === PAGE_FRAME_ID && element.type === 'frame')
  // Why: Excalidraw exports only the exporting frame's own children, so areas count as the page's.
  const elements = page
    ? live
        .filter((element) => element.type !== 'frame' || element.id === page.id)
        .map((element) =>
          element.frameId && element.frameId !== page.id
            ? { ...element, frameId: page.id }
            : element
        )
    : live
  if (elements.length <= (page ? 1 : 0)) {
    return null
  }
  const svg = await exportToSvg({
    elements: JSON.parse(JSON.stringify(elements)),
    files: scene?.files ?? {},
    appState: {
      exportBackground: true,
      exportWithDarkMode: false,
      viewBackgroundColor: '#ffffff',
      frameRendering: FRAME_RENDERING
    },
    exportPadding: page ? 0 : 8,
    exportingFrame: page ? JSON.parse(JSON.stringify(page)) : null,
    skipInliningFonts: true
  })
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`
}

function loadMeta(
  owner: ProjectFileOwner,
  folder: string,
  slug: string,
  key: string
): Promise<FigureListMeta> {
  const known = cache.get(key)
  if (known) {
    return known
  }
  const loading = readProjectText(owner, figureFilePaths(folder, slug).scene).then(
    async (text) => ({
      ...figureSceneMeta(text),
      thumbnail: await sceneThumbnail(text).catch(() => null),
      sceneSha256: await sceneSha256(text)
    }),
    () => ({ title: null, caption: null, thumbnail: null, sceneSha256: null })
  )
  cache.set(key, loading)
  void loading.then((meta) => settled.set(key, meta))
  return loading
}

/** A figure's title, proposed caption and thumbnail, read again whenever its scene changes. */
export function useFigureListMeta(
  owner: ProjectFileOwner,
  folder: string | null,
  slug: string,
  signature: string
): FigureListMeta | null {
  const key = folder ? `${owner.workspaceId}|${folder}/${slug}|${signature}` : ''
  const [loaded, setLoaded] = useState<{ key: string; meta: FigureListMeta } | null>(null)
  useEffect(() => {
    if (!folder || settled.has(key)) {
      return
    }
    let live = true
    void loadMeta(owner, folder, slug, key).then((meta) => {
      if (live) {
        setLoaded({ key, meta })
      }
    })
    return () => {
      live = false
    }
  }, [owner, folder, slug, key])
  return settled.get(key) ?? (loaded?.key === key ? loaded.meta : null)
}

/** The manuscript's text, read again when its signature changes; null until read or missing. */
export function useManuscriptText(
  owner: ProjectFileOwner,
  manuscript: string | null,
  signature: string
): string | null {
  const key = manuscript && signature ? `${manuscript}|${signature}` : ''
  const [loaded, setLoaded] = useState<{ key: string; text: string | null } | null>(null)
  useEffect(() => {
    if (!manuscript || !key) {
      return
    }
    let live = true
    void readProjectText(owner, manuscript).then(
      (text) => live && setLoaded({ key, text }),
      () => live && setLoaded({ key, text: null })
    )
    return () => {
      live = false
    }
  }, [owner, manuscript, key])
  // Why the last text while the next loads: badges should not blink on every manuscript save.
  return key ? (loaded?.text ?? null) : null
}
