import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  figurePaperState,
  paperCopyPath,
  type FigurePaperState,
  type FigurePublication,
  type ListedPlot
} from '../../../../research-harness/research-figures-locations.mjs'
import {
  parsePlotManifest,
  plotFilePaths,
  type PlotManifest
} from '../../../../research-harness/research-figures-plot-files.mjs'
import { bytesSha256 } from './research-figure-document'
import {
  FigurePublishConflict,
  publishFigureCopy,
  toastPublishConflict,
  toastPublished,
  type FigurePublishResult
} from './research-figure-publish'
import { refreshFigureList } from './research-figures-store'
import {
  base64ToBytes,
  readProjectFile,
  readProjectText,
  type ProjectFileOwner
} from './research-project-files'

/**
 * Where a plot's last run stands against its script: `current`, `stale` (the script changed since,
 * so the agent must run it again), `not-run` (no manifest yet) or `no-script` (only a run is left).
 */
export type PlotRunState = 'current' | 'stale' | 'not-run' | 'no-script'

export function plotRunState(input: {
  scriptSha256: string | null
  manifest: Pick<PlotManifest, 'sourceSha256'> | null
}): PlotRunState {
  if (input.scriptSha256 === null) {
    return 'no-script'
  }
  if (!input.manifest) {
    return 'not-run'
  }
  return input.manifest.sourceSha256 === input.scriptSha256 ? 'current' : 'stale'
}

/** The list's short hint for a plot that needs a run; null when its picture is current. */
export function plotRunHint(state: PlotRunState): string | null {
  switch (state) {
    case 'not-run':
      return 'Not run yet'
    case 'stale':
      return 'Script changed'
    case 'no-script':
      return 'No script'
    case 'current':
      return null
  }
}

export function plotFindingCounts(manifest: Pick<PlotManifest, 'findings'> | null): {
  errors: number
  warnings: number
  notes: number
} {
  return {
    errors: manifest?.findings.errors.length ?? 0,
    warnings: manifest?.findings.warnings.length ?? 0,
    notes: manifest?.findings.notes.length ?? 0
  }
}

/** "2 errors · 1 warning", or null when the checks found nothing to fix. */
export function plotFindingText(counts: { errors: number; warnings: number }): string | null {
  const parts = [
    counts.errors ? `${counts.errors} error${counts.errors === 1 ? '' : 's'}` : null,
    counts.warnings ? `${counts.warnings} warning${counts.warnings === 1 ? '' : 's'}` : null
  ].filter((part) => part !== null)
  return parts.length ? parts.join(' · ') : null
}

/** The line a manuscript uses to include the plot's vector PDF. */
export function plotIncludeLine(slug: string): string {
  return `\\includegraphics{figures/${slug}.pdf}`
}

/** Why "Use in paper" cannot run now, or null when it can. */
export function plotPublishBlocked(input: {
  hasPdf: boolean
  run: PlotRunState | null
  manuscript: string | null
}): string | null {
  if (!input.manuscript) {
    return 'The manuscript is not known yet.'
  }
  if (input.run === 'stale') {
    return 'The script changed since its last run. Ask the agent to run it first.'
  }
  if (!input.hasPdf || input.run === 'not-run') {
    return 'The plot has no PDF yet. Ask the agent to run it.'
  }
  return null
}

export type PlotState = {
  manifest: PlotManifest | null
  script: string | null
  scriptSha256: string | null
  run: PlotRunState
  /** The 216 dpi preview as a data URL; null before the first run. */
  png: string | null
}

async function fileBytes(owner: ProjectFileOwner, path: string): Promise<Uint8Array | null> {
  const file = await readProjectFile(owner, path).catch(() => null)
  if (!file) {
    return null
  }
  return file.isBinary ? base64ToBytes(file.content) : new TextEncoder().encode(file.content)
}

/** Reads what the page shows of a plot: its manifest, its script and hash, and its preview. */
export async function readPlotState(
  owner: ProjectFileOwner,
  plot: Pick<ListedPlot, 'folder' | 'slug' | 'script' | 'manifest' | 'png'>
): Promise<PlotState> {
  const files = plotFilePaths(plot.folder, plot.slug)
  const [scriptBytes, manifestText, pngFile] = await Promise.all([
    plot.script ? fileBytes(owner, files.script) : null,
    plot.manifest ? readProjectText(owner, files.manifest).catch(() => null) : null,
    plot.png ? readProjectFile(owner, files.png).catch(() => null) : null
  ])
  const manifest = manifestText === null ? null : parsePlotManifest(manifestText)
  const scriptSha256 = scriptBytes ? await bytesSha256(scriptBytes) : null
  return {
    manifest,
    script: scriptBytes ? new TextDecoder().decode(scriptBytes) : null,
    scriptSha256,
    run: plotRunState({ scriptSha256, manifest }),
    png:
      pngFile?.isBinary && pngFile.content
        ? `data:${pngFile.mimeType ?? 'image/png'};base64,${pngFile.content}`
        : null
  }
}

/** How the paper's copy of a plot stands; the script's hash stands for a diagram's scene. */
export function plotPaperState(input: {
  slug: string
  manuscript: string | null
  signatures: Record<string, string>
  publications: Record<string, FigurePublication>
  scriptSha256: string | null
}): FigurePaperState {
  const expectedPdf = input.manuscript ? paperCopyPath(input.manuscript, input.slug) : ''
  return figurePaperState({
    location: 'work',
    record: input.publications[input.slug] ?? null,
    paperCopy: Boolean(expectedPdf && input.signatures[expectedPdf]),
    expectedPdf,
    sceneSha256: input.scriptSha256
  })
}

/** Copies the plot's PDF beside the manuscript and records the script it was made from. */
export async function publishPlot(input: {
  owner: ProjectFileOwner
  plot: Pick<ListedPlot, 'folder' | 'slug' | 'script' | 'manifest' | 'png' | 'pdf'>
  manuscript: string
  replace?: boolean
}): Promise<FigurePublishResult> {
  const { owner, plot, manuscript } = input
  const state = await readPlotState(owner, plot)
  const blocked = plotPublishBlocked({ hasPdf: plot.pdf, run: state.run, manuscript })
  if (blocked) {
    throw new Error(blocked)
  }
  return publishFigureCopy({
    owner,
    slug: plot.slug,
    from: plotFilePaths(plot.folder, plot.slug).pdf,
    manuscript,
    sceneSha256: state.scriptSha256,
    replace: input.replace
  })
}

// Why one entry per plot: a rewrite replaces its state instead of piling up old previews.
const states = new Map<string, { key: string; state: Promise<PlotState>; value?: PlotState }>()

/** A plot's state, read again whenever its script, manifest or preview is rewritten. */
export function usePlotState(
  owner: ProjectFileOwner,
  plot: ListedPlot | null,
  signatures: Record<string, string>
): PlotState | null {
  const files = plot ? plotFilePaths(plot.folder, plot.slug) : null
  const slot = plot ? `${owner.hostId}|${owner.workspaceId}|${plot.folder}/${plot.slug}` : ''
  const key = files
    ? [files.script, files.manifest, files.png]
        .map((path) => `${path}:${signatures[path] ?? ''}`)
        .concat(`${plot?.script}${plot?.manifest}${plot?.png}`)
        .join('|')
    : ''
  const [loaded, setLoaded] = useState<{ key: string; state: PlotState } | null>(null)
  useEffect(() => {
    if (!plot) {
      return
    }
    let entry = states.get(slot)
    if (entry?.key !== key) {
      const fresh: { key: string; state: Promise<PlotState>; value?: PlotState } = {
        key,
        state: readPlotState(owner, plot)
      }
      void fresh.state.then((value) => (fresh.value = value)).catch(() => undefined)
      states.set(slot, fresh)
      entry = fresh
    }
    let live = true
    void entry.state.then(
      (state) => live && setLoaded({ key, state }),
      () => undefined
    )
    return () => {
      live = false
    }
  }, [owner, plot, slot, key])
  const cached = states.get(slot)
  return cached?.key === key && cached.value
    ? cached.value
    : loaded?.key === key
      ? loaded.state
      : null
}

/** "Use in paper" for plots, with the paper's Undo and the offer to replace a foreign PDF. */
export function usePlotPublish(
  owner: ProjectFileOwner,
  manuscript: string | null
): {
  publishing: string | null
  publish: (plot: ListedPlot, replace?: boolean) => Promise<void>
} {
  const [publishing, setPublishing] = useState<string | null>(null)
  const publish = async (plot: ListedPlot, replace = false): Promise<void> => {
    if (!manuscript) {
      return
    }
    setPublishing(plot.slug)
    try {
      toastPublished(await publishPlot({ owner, plot, manuscript, replace }), 'Copied to')
      void refreshFigureList(owner).catch(() => undefined)
    } catch (cause) {
      if (cause instanceof FigurePublishConflict) {
        toastPublishConflict(cause, () => publish(plot, true))
      } else {
        toast.error(`Not copied. ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    } finally {
      setPublishing(null)
    }
  }
  return { publishing, publish }
}
