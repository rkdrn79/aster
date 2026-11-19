// Which chats are copies of which, as the research document keeps it: each copy names the chat it
// was made from and the message it was made at. A chat with its branches and forks forms one
// family; a subtask belongs to the chat it reports to, outside the family's lists.

import type { ResearchDocument } from '../../../../shared/research/research-records'

export type ResearchChatBranch = NonNullable<ResearchDocument['chatBranches']>[string]
export type ResearchChatCopyKind = NonNullable<ResearchChatBranch['kind']>
export type ResearchChatScope = { hostId: string; workspaceId: string }

export function researchChatCopyKind(
  branch: Pick<ResearchChatBranch, 'kind'>
): ResearchChatCopyKind {
  return branch.kind ?? 'branch'
}

/** Keyed as conversation homes are: a session id is unique only on its host and workspace. */
function branchKey(scope: ResearchChatScope, sessionId: string): string {
  return JSON.stringify([scope.hostId, scope.workspaceId, sessionId])
}

export function researchChatBranchOf(
  document: Pick<ResearchDocument, 'chatBranches'> | null,
  scope: ResearchChatScope,
  sessionId: string
): ResearchChatBranch | null {
  return document?.chatBranches?.[branchKey(scope, sessionId)] ?? null
}

/** The copies made straight from `sessionId`, oldest first: its branches and forks, or with
 *  `subtasks`, its subtasks alone. */
export function researchChatBranchChildren(
  document: Pick<ResearchDocument, 'chatBranches'> | null,
  scope: ResearchChatScope,
  sessionId: string,
  which: 'copies' | 'subtasks' = 'copies'
): { sessionId: string; branch: ResearchChatBranch }[] {
  const prefix = JSON.stringify([scope.hostId, scope.workspaceId]).slice(0, -1)
  return Object.entries(document?.chatBranches ?? {})
    .filter(
      ([key, branch]) =>
        key.startsWith(`${prefix},`) &&
        branch.parentSessionId === sessionId &&
        (researchChatCopyKind(branch) === 'subtask') === (which === 'subtasks')
    )
    .flatMap(([key, branch]) => {
      const parsed: unknown = JSON.parse(key)
      const child = Array.isArray(parsed) ? parsed[2] : undefined
      return typeof child === 'string' ? [{ sessionId: child, branch }] : []
    })
    .sort((left, right) => left.branch.createdAt.localeCompare(right.branch.createdAt))
}

/** The chat the family started from: up through each branch's parent. */
export function researchChatBranchRoot(
  document: Pick<ResearchDocument, 'chatBranches'> | null,
  scope: ResearchChatScope,
  sessionId: string
): string {
  const seen = new Set<string>([sessionId])
  let current = sessionId
  for (;;) {
    const parent = researchChatBranchOf(document, scope, current)?.parentSessionId
    if (!parent || seen.has(parent)) {
      return current
    }
    seen.add(parent)
    current = parent
  }
}

/** Every chat of `sessionId`'s family, the first chat first, then each branch after its parent. */
export function researchChatBranchFamily(
  document: Pick<ResearchDocument, 'chatBranches'> | null,
  scope: ResearchChatScope,
  sessionId: string
): string[] {
  const family: string[] = []
  const visit = (id: string): void => {
    if (family.includes(id)) {
      return
    }
    family.push(id)
    for (const child of researchChatBranchChildren(document, scope, id)) {
      visit(child.sessionId)
    }
  }
  visit(researchChatBranchRoot(document, scope, sessionId))
  return family
}

/** Whether the chat is a subtask: hidden from chat lists, it reports to the chat it came from. */
export function researchChatIsSubtask(
  document: Pick<ResearchDocument, 'chatBranches'> | null,
  scope: ResearchChatScope,
  sessionId: string
): boolean {
  const branch = researchChatBranchOf(document, scope, sessionId)
  return branch !== null && researchChatCopyKind(branch) === 'subtask'
}

const COPY_SUFFIX = / \((?:branch|fork) \d+\)$| · branch \d+$/u

/** A chat's name without the branch or fork number Aster gave it. */
export function researchChatBranchBase(name: string): string {
  return name.replace(COPY_SUFFIX, '').trim()
}

/** The number Aster gave a copy, as "branch 2" or "fork 3"; null for any other name. */
export function researchChatCopyNumberLabel(name: string): string | null {
  const match = / \((branch|fork) (\d+)\)$| · (branch) (\d+)$/u.exec(name)
  return match ? `${match[1] ?? match[3]} ${match[2] ?? match[4]}` : null
}

/** "‹name› (branch N)" or "‹name› (fork N)", as Claude Code names its copies: the family's name,
 *  numbered after the copies of that kind it already has (the first chat counts as 1). */
export function researchChatBranchName(
  parentName: string,
  kind: Exclude<ResearchChatCopyKind, 'subtask'>,
  sameKindCopies: number
): string {
  return `${researchChatBranchBase(parentName) || 'Chat'} (${kind} ${sameKindCopies + 2})`
}

/** A subtask's chat name: what it was asked to do, clipped. */
export function researchSubtaskName(task: string): string {
  const text = task.replace(/\s+/g, ' ').trim()
  return `Subtask: ${text.length > 48 ? `${text.slice(0, 47)}…` : text}`
}

/** How many copies of `kind` the family of `sessionId` already has. */
export function researchChatFamilyCopies(
  document: Pick<ResearchDocument, 'chatBranches'> | null,
  scope: ResearchChatScope,
  sessionId: string,
  kind: ResearchChatCopyKind
): number {
  return researchChatBranchFamily(document, scope, sessionId).filter((id) => {
    const branch = researchChatBranchOf(document, scope, id)
    return branch !== null && researchChatCopyKind(branch) === kind
  }).length
}

/** The record with `change` applied to one copy's entry; unchanged when it has none. */
export function withResearchChatBranchChange(
  document: ResearchDocument,
  scope: ResearchChatScope,
  sessionId: string,
  change: Partial<ResearchChatBranch>
): ResearchDocument {
  const current = researchChatBranchOf(document, scope, sessionId)
  return current
    ? withResearchChatBranch(document, scope, sessionId, { ...current, ...change })
    : document
}

export function withResearchChatBranch(
  document: ResearchDocument,
  scope: ResearchChatScope,
  sessionId: string,
  branch: ResearchChatBranch
): ResearchDocument {
  return {
    ...document,
    chatBranches: { ...document.chatBranches, [branchKey(scope, sessionId)]: branch }
  }
}
