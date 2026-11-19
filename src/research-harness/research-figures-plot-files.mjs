// Where a plot's files live, shared by the harness and the app. Pure, like the model.
import {
  PLOT_MANIFEST_SUFFIX,
  PLOT_SCRIPT_SUFFIX,
  cleanRelative
} from './research-figures-model.mjs'

export { PLOT_MANIFEST_SUFFIX, PLOT_SCRIPT_SUFFIX }

/**
 * A plot's files in its folder (`<record root>/figures`): the committed script and the helper
 * beside it in `src/`, and what running it writes (see ADE round 11 contract.md).
 */
export function plotFilePaths(folder, slug) {
  const base = `${cleanRelative(folder)}/${slug}`
  return {
    script: `${cleanRelative(folder)}/src/${slug}${PLOT_SCRIPT_SUFFIX}`,
    lib: `${cleanRelative(folder)}/src/aster_plot.py`,
    manifest: `${base}${PLOT_MANIFEST_SUFFIX}`,
    pdf: `${base}.pdf`,
    svg: `${base}.svg`,
    embed: `${base}.embed.svg`,
    png: `${base}.png`
  }
}

const LEVELS = ['errors', 'warnings', 'notes']

function finding(value) {
  return value && typeof value.code === 'string' && typeof value.message === 'string'
    ? {
        code: value.code,
        id: typeof value.id === 'string' ? value.id : null,
        message: value.message
      }
    : null
}

/** A plot's manifest (`<slug>.plot.json`) checked, or null when it is not one. */
export function parsePlotManifest(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (value?.kind !== 'aster-plot' || typeof value.slug !== 'string') {
    return null
  }
  const size = value.size ?? {}
  return {
    slug: value.slug,
    script: typeof value.script === 'string' ? value.script : null,
    sourceSha256: typeof value.sourceSha256 === 'string' ? value.sourceSha256 : null,
    lib: typeof value.lib === 'string' ? value.lib : null,
    size: {
      widthIn: Number(size.widthIn) || null,
      heightIn: Number(size.heightIn) || null
    },
    /** Made for a cell of a diagram (`ap.figure(..., panel=True)`), not for a column. */
    panel: value.panel === true,
    style: {
      preset: typeof value.style?.preset === 'string' ? value.style.preset : null,
      accent: typeof value.style?.accent === 'string' ? value.style.accent : null
    },
    panels: Array.isArray(value.panels) ? value.panels : [],
    files: value.files && typeof value.files === 'object' ? value.files : {},
    sha256: value.sha256 && typeof value.sha256 === 'object' ? value.sha256 : {},
    previews: value.previews && typeof value.previews === 'object' ? value.previews : null,
    renderedAt: typeof value.renderedAt === 'string' ? value.renderedAt : null,
    findings: Object.fromEntries(
      LEVELS.map((level) => [
        level,
        (Array.isArray(value.findings?.[level]) ? value.findings[level] : [])
          .map(finding)
          .filter(Boolean)
      ])
    )
  }
}

/** `<figures>/.gitignore` from before plots: add the manifest line, keep anything the person wrote. */
export function plotGitignore(current) {
  if (current === null || current.split('\n').includes(`*${PLOT_MANIFEST_SUFFIX}`)) {
    return null
  }
  return `${current.replace(/\n*$/, '\n')}*${PLOT_MANIFEST_SUFFIX}\n`
}
