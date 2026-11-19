// Bundled third-party illustrations (vendor/illustrations): open-licensed SVGs recoloured into
// colour roles by config/scripts/vendor-figure-illustrations.mjs, each with its source, licence,
// credit, house style, projection, roles and tags in SOURCES.json.
import { existsSync, readFileSync } from 'node:fs'

const ROOT = new URL('./vendor/illustrations/', import.meta.url)
let cache = null

/** Every bundled asset's record (`name`, `set`, `file`, `title`, `tags`, `licence`, …). */
export function bundledAssets() {
  if (!cache) {
    const sources = new URL('SOURCES.json', ROOT)
    cache = existsSync(sources)
      ? Object.entries(JSON.parse(readFileSync(sources, 'utf8'))).map(([name, record]) => ({
          name,
          ...record
        }))
      : []
  }
  return cache
}

/** A bundled asset's role-tagged SVG. */
export function assetSvg(asset) {
  return readFileSync(new URL(asset.file, ROOT), 'utf8')
}
