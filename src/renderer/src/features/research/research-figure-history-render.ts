import { exportToBlob, restore } from '@excalidraw/excalidraw'
import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'

const THUMBNAIL_PX = 300

/** A kept version drawn as a PNG (its page, or the whole drawing), at most `size` px on a side. */
export async function figureVersionPng(
  text: string,
  size = THUMBNAIL_PX
): Promise<Uint8Array | null> {
  // Why JSON.parse's any: restore() is Excalidraw's own sanitizer for scenes from disk.
  const data = restore(JSON.parse(text), null, null)
  const all = data.elements.filter((element) => !element.isDeleted)
  if (!all.length) {
    return null
  }
  const page = all.find((element) => element.id === PAGE_FRAME_ID)
  // Why: like the PDF export, an area's contents count as the page's and areas never show.
  const elements =
    page?.type === 'frame'
      ? all
          .filter((element) => element.type !== 'frame' || element.id === page.id)
          .map((element) =>
            element.frameId && element.frameId !== page.id
              ? { ...element, frameId: page.id }
              : element
          )
      : all
  const blob = await exportToBlob({
    elements,
    files: data.files,
    appState: {
      ...data.appState,
      exportBackground: true,
      exportWithDarkMode: false,
      viewBackgroundColor: '#ffffff',
      frameRendering: { enabled: true, clip: true, name: false, outline: false }
    },
    exportPadding: page ? 0 : 8,
    exportingFrame: page?.type === 'frame' ? page : null,
    maxWidthOrHeight: size,
    mimeType: 'image/png'
  })
  return new Uint8Array(await blob.arrayBuffer())
}

export function figureThumbnailPng(text: string): Promise<Uint8Array | null> {
  return figureVersionPng(text, THUMBNAIL_PX)
}

/** A version as a data URL for the History preview and Compare. */
export async function figureVersionDataUrl(text: string, size: number): Promise<string | null> {
  const png = await figureVersionPng(text, size)
  if (!png) {
    return null
  }
  let binary = ''
  for (let offset = 0; offset < png.length; offset += 0x8000) {
    binary += String.fromCharCode(...png.subarray(offset, offset + 0x8000))
  }
  return `data:image/png;base64,${window.btoa(binary)}`
}
