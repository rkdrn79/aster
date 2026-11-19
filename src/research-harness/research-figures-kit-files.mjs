// The images a figure embeds: generated thumbnails, project images, and the reference, kept in
// the scene's `files` once each and dropped when no image uses them any more.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { imageMimeType, imageSize } from './research-figures-image.mjs'
import { FIGURE_UNITS_PER_INCH } from './research-figures-model.mjs'
import { renderPicture } from './research-figures-pictures.mjs'
import { encodePng } from './research-figures-png.mjs'
import { pruneGeneratedFiles, sanitizeSvg, storeSvgFile } from './research-figures-svg-embed.mjs'

function dataUrl(mimeType, bytes) {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`
}

const photoCache = new Map()
/** A vendored photo's bytes, read once: the small copy, or the large one in `hd/`. */
function photoBytes(kind, large) {
  const name = `vendor/photos/${large ? 'hd/' : ''}${kind}.jpg`
  if (!photoCache.has(name)) {
    photoCache.set(name, readFileSync(new URL(name, import.meta.url)))
  }
  return photoCache.get(name)
}

const PRINT_DPI = 300

/**
 * The pixels across a photo needs to print at 300 dpi: an element `width` units wide showing
 * `shown` (0–1) of the photo's width.
 */
export function photoPixelsNeeded(width, shown) {
  return Math.ceil(((width / FIGURE_UNITS_PER_INCH) * PRINT_DPI) / Math.max(shown, 1e-3))
}

export function figureFileStore(scene, project) {
  const files = () => {
    scene.files ??= {}
    return scene.files
  }
  /**
   * A PNG or JPEG from the project (or an absolute path): its file id and pixel size. Read at
   * once, so image({ src }) is placed even when the script forgets to await it.
   */
  const sourceSync = (src) => {
    const absolute = path.isAbsolute(src) ? src : path.join(project, src)
    let bytes
    try {
      bytes = readFileSync(absolute)
    } catch {
      throw new Error(
        `No picture at ${absolute}: src is a path from the project folder (${project}), such as data/<figure>/photo.png`
      )
    }
    const size = imageSize(bytes)
    if (!size) {
      throw new Error(`${src} is not a PNG or JPEG image`)
    }
    const fileId = `aster-src-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`
    const mimeType = imageMimeType(absolute)
    files()[fileId] ??= { id: fileId, mimeType, dataURL: dataUrl(mimeType, bytes), created: 1 }
    return { fileId, size }
  }
  return {
    /** Encodes each picture spec once, under its content-derived id. */
    pictures(pictures) {
      for (const { fileId, picture } of pictures) {
        if (!files()[fileId]) {
          const bytes = encodePng(picture.width, picture.height, renderPicture(picture))
          files()[fileId] = {
            id: fileId,
            mimeType: 'image/png',
            dataURL: dataUrl('image/png', bytes),
            created: 1
          }
        }
      }
    },
    sourceSync,
    async source(src) {
      return sourceSync(src)
    },
    /**
     * A vendored CC0 photo: its file id and pixel size. `need` is how many pixels across the
     * whole photo must have to print at 300 dpi where it is drawn: up to the small copy's width
     * the small copy (`vendor/photos/<kind>.jpg`) is embedded, beyond it the large one
     * (`vendor/photos/hd/<kind>.jpg`, 1024–1600 px), so a scene stays light unless it needs more.
     */
    photo(kind, need = 0) {
      const small = photoBytes(kind, false)
      const large = need > imageSize(small).width
      const fileId = `aster-photo-${kind}${large ? '-hd' : ''}`
      const bytes = large ? photoBytes(kind, true) : small
      files()[fileId] ??= {
        id: fileId,
        mimeType: 'image/jpeg',
        dataURL: dataUrl('image/jpeg', bytes),
        created: 1
      }
      return { fileId, size: imageSize(bytes) }
    },
    /** An SVG (typeset math, an icon) under a given id, kept vector in exports. */
    svg(fileId, svg) {
      const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
      files()[fileId] ??= { id: fileId, mimeType: 'image/svg+xml', dataURL: data, created: 1 }
    },
    /**
     * Any SVG to show as a picture (a plot, an illustration): made safe, stored once under
     * `<prefix><content hash>`; returns the file id and the stored SVG.
     */
    embed(prefix, svg) {
      const clean = sanitizeSvg(svg)
      return { fileId: storeSvgFile(scene, prefix, clean), svg: clean }
    },

    /** The reference image under one id, for photos cropped from it. */
    reference(id, relative, bytes) {
      const mimeType = imageMimeType(relative)
      files()[id] ??= { id, mimeType, dataURL: dataUrl(mimeType, bytes), created: 1 }
    },
    /** Drops generated and project images no image element uses any more. */
    prune(elements) {
      pruneGeneratedFiles(files(), elements)
    }
  }
}
