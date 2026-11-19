export const PLOT_SCRIPT_SUFFIX: string
export const PLOT_MANIFEST_SUFFIX: string

/** A plot's files, project-relative: the committed script and helper, and what running it writes. */
export type PlotFilePaths = {
  script: string
  lib: string
  manifest: string
  pdf: string
  svg: string
  embed: string
  png: string
}
export function plotFilePaths(folder: string, slug: string): PlotFilePaths

export type PlotFinding = { code: string; id: string | null; message: string }
export type PlotPanel = {
  id?: string
  label?: string | null
  title?: string | null
  kind?: string
  box?: { x: number; y: number; w: number; h: number }
  [key: string]: unknown
}

/** `<slug>.plot.json`, checked: what the plot's last run wrote. */
export type PlotManifest = {
  slug: string
  script: string | null
  /** SHA-256 of the script's bytes when it ran; a different hash now means the plot is stale. */
  sourceSha256: string | null
  lib: string | null
  size: { widthIn: number | null; heightIn: number | null }
  /** Made for a cell of a diagram (`ap.figure(..., panel=True)`), not for a column. */
  panel: boolean
  style: { preset: string | null; accent: string | null }
  panels: PlotPanel[]
  files: Record<string, unknown>
  sha256: Record<string, unknown>
  previews: Record<string, unknown> | null
  renderedAt: string | null
  findings: { errors: PlotFinding[]; warnings: PlotFinding[]; notes: PlotFinding[] }
}
export function parsePlotManifest(text: string): PlotManifest | null

/** `<figures>/.gitignore` with the manifest line added; null when it needs no change. */
export function plotGitignore(current: string | null): string | null
