import { fileURLToPath } from 'node:url'
import { parseResearchWindowTarget } from '../../shared/research-page-window'
import { researchSideIdFromSearch } from '../../shared/research-side-split'

/** Where this build serves the project window page from. */
export type ResearchSidePageLocation =
  | { kind: 'dev-server'; origin: string }
  | { kind: 'file'; path: string }

export type AdmittedResearchSide = { sideId: string; workspaceId: string }

function isResearchWindowDocument(url: URL, location: ResearchSidePageLocation): boolean {
  if (location.kind === 'dev-server') {
    return url.origin === location.origin && url.pathname === '/research-window.html'
  }
  if (url.protocol !== 'file:' || url.host !== '') {
    return false
  }
  try {
    return fileURLToPath(url) === location.path
  } catch {
    return false
  }
}

/**
 * The side a `<webview src>` asks to show, when the src is this build's own project window page
 * with a side id and a well-formed project; null for anything else, which must not get the preload.
 */
export function admitResearchSideSrc(
  src: string,
  location: ResearchSidePageLocation
): AdmittedResearchSide | null {
  let url: URL
  try {
    url = new URL(src)
  } catch {
    return null
  }
  if (url.username || url.password || url.hash || !isResearchWindowDocument(url, location)) {
    return null
  }
  const sideId = researchSideIdFromSearch(url.search)
  const params = url.searchParams
  const target = parseResearchWindowTarget({
    page: params.get('page'),
    workspaceId: params.get('workspaceId'),
    hostId: params.get('hostId')
  })
  return sideId && target ? { sideId, workspaceId: target.workspaceId } : null
}
