import { ipcRenderer } from 'electron'

export type ResearchLatexCompileResult =
  | {
      status: 'ok'
      pdfPath: string
      builtAt: string
      output: string
    }
  | {
      status: 'unsupported' | 'missing-compiler' | 'error' | 'cancelled'
      message: string
      output: string
    }

/** An Experiment's manuscript, or a project's main .tex when the project has no Experiment yet. */
export type ResearchLatexCompileTarget =
  | { experimentId: string }
  | { workspacePath: string; sourcePath: string }

/** A piece of engine output from the build started with `buildId`. */
export type ResearchLatexOutput = { buildId: string; text: string }

export type ResearchLatexApi = {
  compile: (
    params: ResearchLatexCompileTarget & { buildId?: string }
  ) => Promise<ResearchLatexCompileResult>
  /** Absent in windows whose preload predates streamed builds. */
  cancel?: (params: { buildId: string }) => Promise<boolean>
  onOutput?: (listener: (output: ResearchLatexOutput) => void) => () => void
}

export const researchLatexApi: ResearchLatexApi = {
  compile: (params) => ipcRenderer.invoke('researchLatex:compile', params),
  cancel: (params) => ipcRenderer.invoke('researchLatex:cancel', params),
  onOutput: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, output: ResearchLatexOutput): void =>
      listener(output)
    ipcRenderer.on('researchLatex:output', handler)
    return () => ipcRenderer.removeListener('researchLatex:output', handler)
  }
}
