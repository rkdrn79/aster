import type { Plugin } from 'vite'
import { createExcalidrawFontAssetsPlugin } from './excalidraw-font-assets'
import { createPdfjsViewerAssetsPlugin } from './pdfjs-viewer-assets'

/** Files the renderer serves from its own folder: pdf.js viewer data and Excalidraw's fonts. */
export function createRendererAssetPlugins(): Plugin[] {
  return [createPdfjsViewerAssetsPlugin(), createExcalidrawFontAssetsPlugin()]
}
