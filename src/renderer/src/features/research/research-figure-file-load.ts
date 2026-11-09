import { figureFilePaths } from '../../../../research-harness/research-figures-model.mjs'
import { figureExportsStale, parseFigureText, sceneSha256 } from './research-figure-document'
import { diffFigureElements, figureDiffCount } from './research-figure-diff'
import type { FigureTarget } from './research-figures-export'
import { readFigurePreviewHash } from './research-figure-preview'
import { projectFileSignature, readProjectText } from './research-project-files'

async function signatureOrNull(target: FigureTarget, path: string) {
  return projectFileSignature(target.owner, path).catch(() => null)
}

/**
 * A figure file as the editor opens it, and whether its exports (or the preview an agent waits
 * on) lag behind the scene.
 */
export async function loadFigureFile(
  target: FigureTarget
): Promise<{ text: string; signature: string; stale: boolean }> {
  const files = figureFilePaths(target.folder, target.slug)
  const text = await readProjectText(target.owner, files.scene)
  const [scene, svg, pdf, previewHash, hash] = await Promise.all([
    projectFileSignature(target.owner, files.scene),
    signatureOrNull(target, files.svg),
    signatureOrNull(target, files.pdf),
    readFigurePreviewHash(target.owner, target.slug, readProjectText),
    sceneSha256(text)
  ])
  return {
    text,
    signature: scene.signature,
    // Why the preview too: an agent waits on it to see the version it just wrote.
    stale:
      previewHash !== hash ||
      figureExportsStale({
        sceneMtime: scene.mtime,
        svgMtime: svg?.mtime ?? null,
        pdfMtime: pdf?.mtime ?? null
      })
  }
}

/** Whether two scene texts draw different things (not just different version stamps). */
export function figureTextsDiffer(a: string, b: string): boolean {
  return (
    a !== b &&
    figureDiffCount(diffFigureElements(parseFigureText(a).elements, parseFigureText(b).elements)) >
      0
  )
}
