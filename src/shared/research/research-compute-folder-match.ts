function trimTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

function isInsideRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`)
}

/**
 * The deepest folder containing the working directory (a PID's cwd or a job's WorkDir), else one
 * holding an absolute path in its command line (argv or the batch script). Shared by the Compute
 * page and the main-process GPU scheduler so both file a job under the same project.
 */
export function matchResearchComputeFolder<T extends { path: string }>(
  source: { cwd: string | null; command: string | null },
  folders: readonly T[],
  resolvedPaths: Readonly<Record<string, string>>
): { folder: T; matchedBy: 'cwd' | 'command' } | null {
  const roots = folders
    .flatMap((folder) =>
      [folder.path, resolvedPaths[folder.path]]
        .filter((root): root is string => Boolean(root))
        .map((root) => ({ root: trimTrailingSlash(root), folder }))
    )
    .filter(({ root }) => root !== '/')
    .sort((a, b) => b.root.length - a.root.length)
  const cwd = source.cwd ? trimTrailingSlash(source.cwd) : null
  if (cwd) {
    const hit = roots.find(({ root }) => isInsideRoot(cwd, root))
    if (hit) {
      return { folder: hit.folder, matchedBy: 'cwd' }
    }
  }
  const paths = (source.command ?? '').split(/[\s=:]+/).filter((token) => token.startsWith('/'))
  const hit = roots.find(({ root }) => paths.some((path) => isInsideRoot(path, root)))
  return hit ? { folder: hit.folder, matchedBy: 'command' } : null
}
