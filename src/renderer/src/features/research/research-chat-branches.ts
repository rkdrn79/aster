// Which chats are branches of which, as the research document keeps it: each branch names the chat
// it was made from and the message it was made at. A chat and all its branches form one family.

import type { ResearchDocument } from '../../../../shared/research/research-records'

export type ResearchChatBranch = NonNullable<ResearchDocument['chatBranches']>[string]
export type ResearchChatScope = { hostId: string; workspaceId: string }

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

/** The chats branched straight from `sessionId`, oldest first. */
export function researchChatBranchChildren(
  document: Pick<ResearchDocument, 'chatBranches'> | null,
  scope: ResearchChatScope,
  sessionId: string
): { sessionId: string; branch: ResearchChatBranch }[] {
  const prefix = JSON.stringify([scope.hostId, scope.workspaceId]).slice(0, -1)
  return Object.entries(document?.chatBranches ?? {})
    .filter(([key, branch]) => key.startsWith(`${prefix},`) && branch.parentSessionId === sessionId)
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

/** A chat's name without the branch number Aster gave it. */
export function researchChatBranchBase(name: string): string {
  return name.replace(/ · branch \d+$/u, '').trim()
}

/** "‹name› · branch N": the family's name without its branch number, numbered after the family. */
export function researchChatBranchName(parentName: string, familySize: number): string {
  return `${researchChatBranchBase(parentName) || 'Chat'} · branch ${familySize + 1}`
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
