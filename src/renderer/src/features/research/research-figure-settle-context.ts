import {
  sameGeometry,
  sameSize,
  type SettleMemory,
  type SettleState
} from './research-figure-settle-state'

export type SettleOptions = {
  /** A resize gesture is under way (Excalidraw rescales the selection on every move). */
  resizing?: boolean
  selected?: ReadonlySet<string>
  /**
   * A drag or resize is still under way: panels grow when it ends, so a box dragged off a panel
   * leaves it instead of pulling it along.
   */
  gesture?: boolean
}

export type SettleContext = {
  memory: SettleMemory
  state: SettleState
  changed: ReadonlySet<string>
  options: SettleOptions
}

export function moved(context: SettleContext, id: string): boolean {
  const seen = context.memory.seen.get(id)
  const now = context.state.get(id)
  return Boolean(seen && now && !sameGeometry(seen, now))
}

export function resized(context: SettleContext, id: string): boolean {
  const seen = context.memory.seen.get(id)
  const now = context.state.get(id)
  return Boolean(seen && now && !sameSize(now, seen))
}
