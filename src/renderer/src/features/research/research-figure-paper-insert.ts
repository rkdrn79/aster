import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import {
  PAGE_FRAME_ID,
  figureFilePaths
} from '../../../../research-harness/research-figures-model.mjs'
import { captionFromChat, insertFigureBlock } from './research-figure-paper-block'
import { openResearchView } from './research-navigation'
import {
  projectAbsolutePath,
  projectFileSignature,
  readProjectText,
  writeProjectText,
  type ProjectFileOwner
} from './research-project-files'
import type { FigureTarget } from './research-figures-export'

/** The chat pane's panel, whose text holds the agent's replies (see research-figure-side-panel). */
const AGENT_PANEL_ID = 'figure-side-panel-agent'

/** The caption to start from: the page's `asterPage.caption`, else the agent's last proposal. */
export function proposedCaption(api: ExcalidrawImperativeAPI): string {
  const page = api.getSceneElements().find((element) => element.id === PAGE_FRAME_ID)
  const fromPage: unknown = page?.customData?.asterPage?.caption
  if (typeof fromPage === 'string' && fromPage.trim()) {
    return fromPage.trim()
  }
  const panel = document.getElementById(AGENT_PANEL_ID)
  return (panel ? captionFromChat(blockText(panel)) : null) ?? ''
}

const BLOCKS = new Set(['P', 'LI', 'DIV', 'PRE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'TR', 'BR'])

/** Text with a line break around every block, so one reply line never runs into the next. */
function blockText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }
  if (!(node instanceof HTMLElement)) {
    return ''
  }
  const inner = Array.from(node.childNodes, blockText).join('')
  return BLOCKS.has(node.tagName) ? `\n${inner}\n` : inner
}

export type PaperStatus = {
  manuscript: string | null
  pdfFresh: boolean
  hasPdf: boolean
}

/** The manuscript's text and whether the PDF is newer than the scene. */
export async function readPaperStatus(
  target: FigureTarget,
  manuscript: string | null,
  dirty: boolean
): Promise<PaperStatus> {
  const files = figureFilePaths(target.folder, target.slug)
  const [text, scene, pdf] = await Promise.all([
    manuscript ? readProjectText(target.owner, manuscript).catch(() => null) : null,
    projectFileSignature(target.owner, files.scene).catch(() => null),
    projectFileSignature(target.owner, files.pdf).catch(() => null)
  ])
  return {
    manuscript: text,
    hasPdf: pdf !== null,
    pdfFresh: !dirty && pdf !== null && scene !== null && pdf.mtime + 1 >= scene.mtime
  }
}

/** Opens Writing on a manuscript line, with the line selected. */
export function revealManuscriptLine(
  owner: ProjectFileOwner,
  manuscript: string,
  line: number,
  length: number
): void {
  openResearchView('research-writing')
  useAppStore.getState().setPendingEditorReveal({
    filePath: projectAbsolutePath(owner, manuscript),
    line,
    column: 1,
    matchLength: length
  })
}

/**
 * Writes the block after the chosen heading, refusing when the manuscript changed since it
 * was read; then shows it in Writing with an Undo that puts the old text back.
 */
export async function insertFigureInPaper(input: {
  owner: ProjectFileOwner
  manuscript: string
  text: string
  block: string
  afterLine: number
}): Promise<void> {
  const { owner, manuscript, text } = input
  const inserted = insertFigureBlock(text, input.block, input.afterLine)
  await writeProjectText(owner, manuscript, inserted.text, text)
  const firstLine = input.block.split('\n')[0] ?? ''
  revealManuscriptLine(owner, manuscript, inserted.line, firstLine.length)
  toast.success(`Inserted at line ${inserted.line} of ${manuscript.split('/').pop()}.`, {
    action: {
      label: 'Undo',
      onClick: () =>
        void writeProjectText(owner, manuscript, text, inserted.text).then(
          () => toast('Figure removed from the manuscript.'),
          () => toast.error('The manuscript changed since; remove the figure by hand.')
        )
    }
  })
}
