import { parseHostAuthorityKey } from '../../../../shared/host-authority'
import type { LibraryScope } from '../../../../shared/research/research-library'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'

export function canDownloadLibraryPdf(scope: LibraryScope): boolean {
  if (scope.hostId === 'local') {
    return true
  }
  const authority = parseHostAuthorityKey(scope.hostId)
  return authority?.endpoint.kind === 'environment' && authority.at === 'local'
}

export async function downloadLibraryArxivPdf(
  scope: LibraryScope,
  reference: string
): Promise<{ relativePath: string }> {
  if (scope.hostId === 'local') {
    return window.api.researchLibrary.downloadArxivPdf({
      workspacePath: scope.workspacePath,
      reference
    })
  }
  const authority = parseHostAuthorityKey(scope.hostId)
  if (!authority || authority.endpoint.kind !== 'environment' || authority.at !== 'local') {
    throw new Error('This workspace host cannot download Library PDFs.')
  }
  return callRuntimeRpc<{ relativePath: string }>(
    { kind: 'environment', environmentId: authority.endpoint.environmentId },
    'researchProject.downloadArxivPdf',
    { worktree: toRuntimeWorktreeSelector(scope.workspaceId), reference },
    { timeoutMs: 120_000 }
  )
}
