import { repairFigureScene } from '../../../../research-harness/research-figures-model.mjs'
import { PAPER_APP_STATE } from './research-figure-editor-config'

/**
 * A scene file as Excalidraw is handed it, by the editor when it opens the figure and by the
 * background renderer, so both export the same drawing: broken elements left out (see
 * repairFigureScene), the paper defaults under the file's own app state.
 */
export function figureSceneData(text: string) {
  // Why JSON.parse's any: Excalidraw restores whatever the file holds; this only repairs it.
  const scene = repairFigureScene(JSON.parse(text)).scene
  return {
    elements: scene.elements,
    files: scene.files ?? {},
    appState: { ...PAPER_APP_STATE, ...scene.appState }
  }
}
