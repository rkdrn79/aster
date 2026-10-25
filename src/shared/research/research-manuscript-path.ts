import {
  isRuntimePathAbsolute,
  relativePathInsideRoot,
  resolveRuntimePath
} from '../cross-platform-path'

export function isManuscriptPathInsideWorkspace(
  workspacePath: string,
  manuscriptPath: string,
  extension: '.tex' | '.pdf'
): boolean {
  if (
    manuscriptPath.includes('\0') ||
    isRuntimePathAbsolute(manuscriptPath) ||
    /^[A-Za-z]:/.test(manuscriptPath) ||
    manuscriptPath.split(/[\\/]/).includes('..') ||
    !manuscriptPath.toLowerCase().endsWith(extension)
  ) {
    return false
  }
  return (
    relativePathInsideRoot(workspacePath, resolveRuntimePath(workspacePath, manuscriptPath)) !==
    null
  )
}
