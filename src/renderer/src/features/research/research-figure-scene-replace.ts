/**
 * Scene replacements that do not come from a person's edit: an agent's write, a merge, a turn
 * folded into one undo step, a restored version. Settling must take what they put on the canvas
 * as it is (never re-route or re-fit it), so it listens here and re-baselines after each one.
 */

/** The canvas's Excalidraw API; any object works as the key. */
type CanvasApi = object

const replacing = new WeakSet<CanvasApi>()
const listeners = new WeakMap<CanvasApi, Set<() => void>>()

/** Runs `apply` (scene updates) as a replacement, then tells the listeners it is on the canvas. */
export function replaceFigureScene(api: CanvasApi, apply: () => void): void {
  replacing.add(api)
  try {
    apply()
  } finally {
    replacing.delete(api)
  }
  for (const listener of listeners.get(api) ?? []) {
    listener()
  }
}

/** True while a replacement is being applied (a change Excalidraw reports now is not a person's). */
export function figureSceneReplacing(api: CanvasApi): boolean {
  return replacing.has(api)
}

export function onFigureSceneReplaced(api: CanvasApi, listener: () => void): () => void {
  const set = listeners.get(api) ?? new Set()
  set.add(listener)
  listeners.set(api, set)
  return () => {
    set.delete(listener)
  }
}
