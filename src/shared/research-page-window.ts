/**
 * The sections of a project window: one window per project, pinned to its workspace. Chats lists
 * the project's agent chats; the others are the Research pages of the same names.
 */
export const RESEARCH_WINDOW_PAGES = [
  'research-chats',
  'research-experiments',
  'research-writing',
  'research-figures',
  'research-rebuttal',
  'research-library'
] as const

export type ResearchWindowPage = (typeof RESEARCH_WINDOW_PAGES)[number]

export type ResearchWindowTarget = {
  page: ResearchWindowPage
  workspaceId: string
  /** The execution host the workspace runs on; null for a workspace with no host stamp. */
  hostId: string | null
}

/** What a page asks for when it starts a chat from a research window: its first prompt and title,
 *  and for a branch, the copy of a conversation it takes over. */
export type ResearchWindowChatOptions = {
  prompt?: string
  label?: string
  resumeFrom?: { providerSessionId: string }
}

// Why so large: a Rebuttal or Figure agent's first prompt carries the reviews or the scene.
const MAX_CHAT_PROMPT_LENGTH = 2_000_000
const MAX_CHAT_LABEL_LENGTH = 512

/** The chat options a research window sent, or null when they are malformed. */
export function parseResearchWindowChatOptions(value: unknown): ResearchWindowChatOptions | null {
  if (value === undefined || value === null) {
    return {}
  }
  if (typeof value !== 'object') {
    return null
  }
  const prompt: unknown = Reflect.get(value, 'prompt')
  const label: unknown = Reflect.get(value, 'label')
  const resumeFrom: unknown = Reflect.get(value, 'resumeFrom')
  const providerSessionId: unknown =
    resumeFrom && typeof resumeFrom === 'object'
      ? Reflect.get(resumeFrom, 'providerSessionId')
      : undefined
  if (
    (prompt !== undefined &&
      (typeof prompt !== 'string' || prompt.length > MAX_CHAT_PROMPT_LENGTH)) ||
    (label !== undefined && (typeof label !== 'string' || label.length > MAX_CHAT_LABEL_LENGTH)) ||
    (resumeFrom !== undefined &&
      (typeof providerSessionId !== 'string' ||
        providerSessionId.length === 0 ||
        providerSessionId.length > MAX_CHAT_LABEL_LENGTH))
  ) {
    return null
  }
  return {
    ...(typeof prompt === 'string' && prompt.length > 0 ? { prompt } : {}),
    ...(typeof label === 'string' && label.length > 0 ? { label } : {}),
    ...(typeof providerSessionId === 'string' ? { resumeFrom: { providerSessionId } } : {})
  }
}

/** What became of a chat start the main window ran for a research window. */
export type ResearchWindowLaunchResult = { sessionId: string } | { error: string }

export function parseResearchWindowLaunchResult(value: unknown): ResearchWindowLaunchResult | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const sessionId: unknown = Reflect.get(value, 'sessionId')
  if (typeof sessionId === 'string') {
    return { sessionId }
  }
  const error: unknown = Reflect.get(value, 'error')
  return typeof error === 'string' ? { error } : null
}

export const RESEARCH_WINDOW_PAGE_LABELS: Record<ResearchWindowPage, string> = {
  'research-chats': 'Chats',
  'research-experiments': 'Experiments',
  'research-writing': 'Writing',
  'research-figures': 'Figures',
  'research-rebuttal': 'Rebuttal',
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
