import { ipcRenderer } from 'electron'

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
}

export const researchFiguresApi: ResearchFiguresApi = {
  renderExports: (params) => ipcRenderer.invoke('researchFigures:renderExports', params),
  writeFile: (params) => ipcRenderer.invoke('researchFigures:writeFile', params),
  listUserParts: () => ipcRenderer.invoke('researchFigures:listUserParts'),
  saveUserPart: (params) => ipcRenderer.invoke('researchFigures:saveUserPart', params),
  deleteUserPart: (params) => ipcRenderer.invoke('researchFigures:deleteUserPart', params),
  listTemplates: () => ipcRenderer.invoke('researchFigures:listTemplates'),
  buildTemplate: (params) => ipcRenderer.invoke('researchFigures:buildTemplate', params)
}
