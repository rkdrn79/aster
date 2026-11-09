import { cpSync, createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'

/** Where the renderer serves Excalidraw's fonts; `window.EXCALIDRAW_ASSET_PATH` points here. */
export const EXCALIDRAW_ASSET_ROUTE = 'excalidraw-assets'
// Why: Xiaolai is a 12 MB CJK fallback; without it CJK text uses a system font offline.
const SKIPPED_FONT_FOLDERS = new Set(['Xiaolai'])

function fontsRoot(): string {
  return resolve('node_modules/@excalidraw/excalidraw/dist/prod/fonts')
}

function fontFile(root: string, pathname: string): string | undefined {
  const prefix = `/${EXCALIDRAW_ASSET_ROUTE}/fonts/`
  if (!pathname.startsWith(prefix)) {
    return undefined
  }
  let relativePath: string
  try {
    relativePath = decodeURIComponent(pathname.slice(prefix.length))
  } catch {
    return undefined
  }
  const parts = relativePath.split('/')
  if (
    parts.length !== 2 ||
    parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\')) ||
    !parts[1].endsWith('.woff2')
  ) {
    return undefined
  }
  const candidate = resolve(root, ...parts)
  return candidate.startsWith(`${root}${sep}`) ? candidate : undefined
}

/** Serves Excalidraw's fonts in development and copies them next to the built pages. */
export function createExcalidrawFontAssetsPlugin(root = fontsRoot()): Plugin {
  return {
    name: 'excalidraw-font-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let pathname: string
        try {
          pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        } catch {
          next()
          return
        }
        const filePath = fontFile(root, pathname)
        if (!filePath || !existsSync(filePath) || request.method !== 'GET') {
          next()
          return
        }
        response.statusCode = 200
        response.setHeader('Content-Type', 'font/woff2')
        response.setHeader('Content-Length', statSync(filePath).size)
        createReadStream(filePath).pipe(response)
      })
    },
    writeBundle(options) {
      if (!options.dir) {
        throw new Error('[excalidraw-font-assets] output directory is required')
      }
      if (!existsSync(root)) {
        throw new Error(`[excalidraw-font-assets] missing ${root}`)
      }
      for (const folder of readdirSync(root)) {
        if (!SKIPPED_FONT_FOLDERS.has(folder)) {
          cpSync(join(root, folder), join(options.dir, EXCALIDRAW_ASSET_ROUTE, 'fonts', folder), {
            recursive: true
          })
        }
      }
    }
  }
}
