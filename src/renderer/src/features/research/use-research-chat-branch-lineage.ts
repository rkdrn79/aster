import { useEffect, useMemo } from 'react'
import type { Tab } from '../../../../shared/tab-types'
import { useAppStore } from '@/store'
import { useResearchRecords } from './research-records-store'
import {
  researchChatBranchBase,
  researchChatCopyKind,
  researchChatCopyNumberLabel,
  type ResearchChatCopyKind,
  researchChatBranchChildren,
  researchChatBranchFamily,
  researchChatBranchOf,
  researchChatBranchRoot,
  type ResearchChatScope
} from './research-chat-branches'
import { researchChatTabLabel } from './research-chat-branch-actions'

const EMPTY_TABS: readonly Tab[] = []

/** `shortLabel`: the name within the family, "branch N" or "fork N" for a copy named after the
 *  family. `kind`: how the chat was copied; null for the family's first chat. */
export type ResearchChatBranchEntry = {
  sessionId: string
  label: string
  shortLabel: string
  depth: number
  kind: ResearchChatCopyKind | null
}

export type ResearchChatBranchLineage = {
  /** The chat this one was copied from, how, and the message it was copied at. */
  parent:
    | (ResearchChatBranchEntry & { messageNumber: number; copiedAs: ResearchChatCopyKind })
    | null
  /** Chats branched straight from this one, oldest first. */
  branches: ResearchChatBranchEntry[]
  /** The whole family, the first chat first; one entry when the chat has no branches. */
  family: ResearchChatBranchEntry[]
}

const NO_LINEAGE: ResearchChatBranchLineage = { parent: null, branches: [], family: [] }

/** A chat's place among its branches, named as their tabs are now; a chat whose tab is gone keeps
 *  a plain name, so the link to it still reads. */
export function useResearchChatBranchLineage(
  scope: ResearchChatScope | null,
  sessionId: string
): ResearchChatBranchLineage {
  const document = useResearchRecords((state) => state.document)
  const tabs = useAppStore((state) =>
    scope ? (state.unifiedTabsByWorktree[scope.workspaceId] ?? EMPTY_TABS) : EMPTY_TABS
  )
  useEffect(() => {
    void useResearchRecords.getState().load()
  }, [])
  return useMemo(() => {
    if (!scope || !document?.chatBranches) {
      return NO_LINEAGE
    }
    const label = (id: string): string => {
      const tab = tabs.find((candidate) => candidate.entityId === id)
      return tab ? researchChatTabLabel(tab) : 'Closed chat'
    }
    const depth = (id: string): number => {
      let count = 0
      let current = id
      const root = researchChatBranchRoot(document, scope, id)
      while (current !== root && count < 64) {
        current = researchChatBranchOf(document, scope, current)?.parentSessionId ?? root
        count += 1
      }
      return count
    }
    const own = researchChatBranchOf(document, scope, sessionId)
    const familyBase = researchChatBranchBase(
      label(researchChatBranchRoot(document, scope, sessionId))
    )
    const entry = (id: string): ResearchChatBranchEntry => {
      const full = label(id)
      const number = researchChatCopyNumberLabel(full)
      const branch = researchChatBranchOf(document, scope, id)
      return {
        sessionId: id,
        label: full,
        shortLabel: number && researchChatBranchBase(full) === familyBase ? number : full,
        depth: depth(id),
        kind: branch ? researchChatCopyKind(branch) : null
      }
    }
    return {
      parent: own
        ? {
            ...entry(own.parentSessionId),
            messageNumber: own.messageNumber,
            copiedAs: researchChatCopyKind(own)
          }
        : null,
      branches: researchChatBranchChildren(document, scope, sessionId).map((child) =>
        entry(child.sessionId)
      ),
      family: researchChatBranchFamily(document, scope, sessionId).map(entry)
    }
  }, [document, scope, sessionId, tabs])
}
