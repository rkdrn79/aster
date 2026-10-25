import {
  isRuntimePathAbsolute,
  relativePathInsideRoot,
  resolveRuntimePath
} from '../cross-platform-path'

/** One move of `migrate` (ADR-004), as project-relative `/` paths. */
export type ResearchLayoutMove = { from: string; to: string }

/**
 * Where a project path went in a layout migration, or `value` when no move covers it. An absolute
 * path stays absolute and a project-relative one stays relative, so stored records keep their form.
 */
export function movedProjectPath(
  workspacePath: string,
  value: string,
  moves: readonly ResearchLayoutMove[]
): string {
  const absolute = isRuntimePathAbsolute(value)
  const relative = absolute ? relativePathInsideRoot(workspacePath, value) : value
  if (relative === null) {
    return value
  }
  const normalized = relative.replaceAll('\\', '/')
  for (const move of moves) {
    if (normalized === move.from || normalized.startsWith(`${move.from}/`)) {
      const next = `${move.to}${normalized.slice(move.from.length)}`
      return absolute ? resolveRuntimePath(workspacePath, next) : next
    }
  }
  return value
}
