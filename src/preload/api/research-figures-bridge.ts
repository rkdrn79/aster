import { ipcRenderer } from 'electron'

/** A reference figure in the person's folder: a recipe's (with its image when there) or their own. */
export type FigureReferenceEntry = {
  id: string
  image: string | null
  title: string | null
  year: number | null
  genre: string | null
  recipe: boolean
}

export type ResearchFiguresApi = {
  /** The SVG with the bundled fonts embedded, and a vector PDF (base64) of the given size. */
  renderExports: (params: {
    svg: string
    widthIn: number
    heightIn: number
  }) => Promise<{ svg: string; pdf: string }>
  /** Writes a PDF or image export into a project on this machine. */
  writeFile: (params: { filePath: string; contentBase64: string }) => Promise<void>
  /** The person's saved figure parts (.excalidrawlib texts) from the app's data folder. */
  listUserParts: () => Promise<{ file: string; text: string }[]>
  /** Saves a figure part for every project; resolves to the file written. */
  saveUserPart: (params: { name: string; library: string }) => Promise<string>
  /** Deletes a saved user part by the file name listUserParts gave. */
  deleteUserPart: (params: { file: string }) => Promise<void>
  /** The Figure kit's module templates and what each draws. */
  listTemplates: () => Promise<{ name: string; description: string }[]>
  /** One template drawn by the kit in a style, as a scene's JSON text. */
  buildTemplate: (params: {
    name: string
    style: string | null
    accent: string | null
  }) => Promise<string>
  /** The reference folder (null: Aster's app-data one) and what it holds. */
  referenceLibrary: (params: { folder: string | null }) => Promise<{
    folder: string
    defaultFolder: string
    exists: boolean
    entries: FigureReferenceEntry[]
  }>
  /** Copies a PNG or JPEG into the reference folder; resolves to its id and path. */
  addReference: (params: {
    folder: string | null
    name: string
    base64: string
  }) => Promise<{ id: string; image: string }>
  /** One image of the reference folder as a data URL, or null. */
  referenceThumbnail: (params: { folder: string | null; image: string }) => Promise<string | null>
  /** Whether a Codex CLI with image generation is on this computer, and why not. */
  codexImageGeneration: (params?: {
    refresh?: boolean
  }) => Promise<{ available: boolean; reason: string | null }>
}

export const researchFiguresApi: ResearchFiguresApi = {
  renderExports: (params) => ipcRenderer.invoke('researchFigures:renderExports', params),
  writeFile: (params) => ipcRenderer.invoke('researchFigures:writeFile', params),
  listUserParts: () => ipcRenderer.invoke('researchFigures:listUserParts'),
  saveUserPart: (params) => ipcRenderer.invoke('researchFigures:saveUserPart', params),
  deleteUserPart: (params) => ipcRenderer.invoke('researchFigures:deleteUserPart', params),
  listTemplates: () => ipcRenderer.invoke('researchFigures:listTemplates'),
  buildTemplate: (params) => ipcRenderer.invoke('researchFigures:buildTemplate', params),
  referenceLibrary: (params) => ipcRenderer.invoke('researchFigures:referenceLibrary', params),
  addReference: (params) => ipcRenderer.invoke('researchFigures:addReference', params),
  referenceThumbnail: (params) => ipcRenderer.invoke('researchFigures:referenceThumbnail', params),
  codexImageGeneration: (params) =>
    ipcRenderer.invoke('researchFigures:codexImageGeneration', params ?? {})
}
