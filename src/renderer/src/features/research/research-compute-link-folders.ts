/**
 * Project-root candidates for a job's directory, deepest first. The preferred one is the folder
 * right under the signed-in user's own directory (`/data/projects/<user>/<project>/…`), which is
 * how lab clusters usually lay out projects.
 */
export function suggestComputeLinkFolders(
  directory: string,
  remoteUser: string | null
): { folders: string[]; preferred: string } {
  const segments = directory.split('/').filter(Boolean)
  const ancestors = segments
    .map((_, index) => `/${segments.slice(0, index + 1).join('/')}`)
    // Why from two segments: `/data` or `/home` would claim every job on the host.
    .slice(1)
    .toReversed()
  const folders = ancestors.length ? ancestors : [directory]
  const userIndex = remoteUser ? segments.lastIndexOf(remoteUser) : -1
  const preferred =
    userIndex >= 0 && userIndex + 1 < segments.length
      ? `/${segments.slice(0, userIndex + 2).join('/')}`
      : folders[0]
  return { folders, preferred }
}

export function computeLinkFolderName(path: string): string {
  return path.replace(/\/+$/, '').split('/').at(-1) || path
}
