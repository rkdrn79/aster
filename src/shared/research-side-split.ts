import { isResearchWindowPage, type ResearchWindowPage } from './research-page-window'

/**
 * Projects side by side in the main window. Each extra side is the project window's page embedded
 * as a guest, so it keeps its own store pinned to its project, like a pop-out window does.
 */
export const RESEARCH_SIDE_QUERY_PARAM = 'side'

/** At most this many projects beside the main one (three columns in all). */
export const RESEARCH_SPLIT_MAX_SIDES = 2

const SIDE_ID_PATTERN = /^[a-z0-9-]{1,64}$/

export function isResearchSideId(value: unknown): value is string {
  return typeof value === 'string' && SIDE_ID_PATTERN.test(value)
}

/** The side a research window page was opened as; null for a pop-out window. */
export function researchSideIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get(RESEARCH_SIDE_QUERY_PARAM)
  return isResearchSideId(value) ? value : null
}

/** What a side asks of the main window it sits in. */
export type ResearchSideCommand =
  | { kind: 'focus' }
  | { kind: 'close' }
  | { kind: 'page'; page: ResearchWindowPage }
  | { kind: 'open-beside' }
  | { kind: 'focus-next' }
  /** The side's own switcher or workspace menu picked another project or workspace for it. */
  | { kind: 'replace'; workspaceId: string; hostId: string | null }

export function parseResearchSideCommand(value: unknown): ResearchSideCommand | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const kind: unknown = Reflect.get(value, 'kind')
  switch (kind) {
    case 'focus':
    case 'close':
    case 'open-beside':
    case 'focus-next':
      return { kind }
    case 'page': {
      const page: unknown = Reflect.get(value, 'page')
      return isResearchWindowPage(page) ? { kind, page } : null
    }
    case 'replace': {
      const workspaceId: unknown = Reflect.get(value, 'workspaceId')
      const hostId: unknown = Reflect.get(value, 'hostId')
      const validHost = hostId === null || (typeof hostId === 'string' && hostId.length <= 512)
      return typeof workspaceId === 'string' &&
        workspaceId.length > 0 &&
        workspaceId.length <= 4096 &&
        validHost
        ? { kind, workspaceId, hostId: typeof hostId === 'string' ? hostId : null }
        : null
    }
    default:
      return null
  }
}
