// The one way a figure embeds an SVG (a plot, an illustration, any vector picture): made safe
// and stable, stored once under its content hash as an `image/svg+xml` file, so the diagram's
// SVG and PDF keep it vector; and the one rule for which stored files the kit may drop.
import { createHash } from 'node:crypto'

/**
 * File ids the kit generates (pictures, project images, TeX, icons, photos, plots and
 * illustrations): files under these prefixes go when no image uses them any more.
 */
export const GENERATED_FILE = /^aster-(pic|src|tex|icon|photo|plot|ill)-/

/**
 * The SVG made safe and stable to embed: no XML prolog, doctype, metadata (matplotlib dates it,
 * which would change the hash on every run), comments, scripts, event handlers or links that
 * leave the file. Throws when the text is not an SVG.
 */
export function sanitizeSvg(text) {
  const raw = String(text ?? '')
  const start = raw.search(/<svg[\s>]/i)
  if (start === -1) {
    throw new Error('This is not an SVG (no <svg> element); embed a plot’s .embed.svg or .svg')
  }
  let svg = raw
    .slice(start)
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(
      /\s(?:xlink:)?href\s*=\s*("|')(?!#|data:image\/(?:png|jpeg|gif|webp|svg\+xml))[^"']*\1/gi,
      ''
    )
  const end = svg.lastIndexOf('</svg>')
  svg = end === -1 ? svg : svg.slice(0, end + 6)
  if (!/^<svg[^>]*\sxmlns=/.test(svg)) {
    svg = svg.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  if (/xlink:href/.test(svg) && !/^<svg[^>]*xmlns:xlink=/.test(svg)) {
    svg = svg.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
  }
  return svg
}

/** The file id an SVG is stored under (`<prefix><first 16 hex of its sha256>`): stored once. */
export function svgFileId(prefix, svg) {
  return `${prefix}${createHash('sha256').update(svg).digest('hex').slice(0, 16)}`
}

/** Stores an SVG in `scene.files` under its content id and returns that id. */
export function storeSvgFile(scene, prefix, svg) {
  const fileId = svgFileId(prefix, svg)
  scene.files ??= {}
  scene.files[fileId] ??= {
    id: fileId,
    mimeType: 'image/svg+xml',
    dataURL: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    created: 1
  }
  return fileId
}

/** Drops the generated files no image in `elements` uses any more; returns how many. */
export function pruneGeneratedFiles(files, elements) {
  const used = new Set(
    elements.filter((element) => element.type === 'image').map((element) => element.fileId)
  )
  let dropped = 0
  for (const fileId of Object.keys(files ?? {})) {
    if (GENERATED_FILE.test(fileId) && !used.has(fileId)) {
      delete files[fileId]
      dropped += 1
    }
  }
  return dropped
}
