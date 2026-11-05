/** Research pages that can open alone in their own window, pinned to one workspace. */
export const RESEARCH_WINDOW_PAGES = [
  'research-experiments',
  'research-writing',
  'research-library'
] as const

export type ResearchWindowPage = (typeof RESEARCH_WINDOW_PAGES)[number]

export type ResearchWindowTarget = {
  page: ResearchWindowPage
  workspaceId: string
  /** The execution host the workspace runs on; null for a workspace with no host stamp. */
  hostId: string | null
}

export const RESEARCH_WINDOW_PAGE_LABELS: Record<ResearchWindowPage, string> = {
  'research-experiments': 'Experiments',
  'research-writing': 'Writing',
  'research-library': 'Library'
}

export function isResearchWindowPage(value: unknown): value is ResearchWindowPage {
  return RESEARCH_WINDOW_PAGES.some((page) => page === value)
}

export function parseResearchWindowTarget(value: unknown): ResearchWindowTarget | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const page: unknown = Reflect.get(value, 'page')
  const workspaceId: unknown = Reflect.get(value, 'workspaceId')
  const hostId: unknown = Reflect.get(value, 'hostId')
  if (
    !isResearchWindowPage(page) ||
    typeof workspaceId !== 'string' ||
    workspaceId.length === 0 ||
    workspaceId.length > 4096 ||
    (hostId !== null && (typeof hostId !== 'string' || hostId.length > 512))
  ) {
    return null
  }
  return { page, workspaceId, hostId }
}

/** The query a research window's page reads its target from. */
export function researchWindowQuery(target: ResearchWindowTarget): Record<string, string> {
  return {
    page: target.page,
    workspaceId: target.workspaceId,
    ...(target.hostId ? { hostId: target.hostId } : {})
  }
}

export function researchWindowTargetFromSearch(search: string): ResearchWindowTarget | null {
  const params = new URLSearchParams(search)
  return parseResearchWindowTarget({
    page: params.get('page'),
    workspaceId: params.get('workspaceId'),
    hostId: params.get('hostId')
  })
}
