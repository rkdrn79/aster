import {
  replyAuthorAfterHumanEdit,
  type RebuttalReplyProposal
} from '../../../../research-harness/research-rebuttal-records.mjs'
import { keepVersion, slotAuthor, writeProposals, writeSlot } from './research-rebuttal-reply-store'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

// Saving what the person typed when the agent changed the same reply, or its group, meanwhile.

/**
 * The group being typed in went away (a regroup the page had no time to hold). The text is kept
 * as a version where its reply went, and the person is told where.
 */
export async function keepTextOfRegroupedSlot(
  snapshot: RebuttalSnapshot,
  slot: string,
  text: string
): Promise<never> {
  const merged = snapshot.regroups
    .flatMap((record) => record.summary.merged)
    .findLast((entry) => entry.from.includes(slot))
  const home = merged?.into ?? slot
  await keepVersion(snapshot, home, {
    by: 'human',
    what: `What you typed for ${slot} while it was regrouped`,
    text
  })
  throw new Error(
    merged
      ? `${slot} was merged into ${home} while you typed. Your text is kept in ${home}'s Versions.`
      : `${slot} was removed while you typed. Your text is kept with it; restore it from Removed groups in Finish.`
  )
}

/** A passage edit laid onto `text`, or null when its passage is not there exactly once. */
function passageOnto(text: string, proposal: RebuttalReplyProposal): string | null {
  if (proposal.kind !== 'passage' || proposal.find === null || proposal.replace === null) {
    return null
  }
  const first = text.indexOf(proposal.find)
  if (first === -1 || first !== text.lastIndexOf(proposal.find)) {
    return null
  }
  return `${text.slice(0, first)}${proposal.replace}${text.slice(first + proposal.find.length)}`
}

/**
 * The agent's text landed while the person was typing in the same reply, so they never saw it.
 * Their words win. A passage edit that still fits their text is laid on top with its own Undo,
 * when the rebuttal applies agent edits directly; any other edit waits as a suggestion.
 */
export async function settleEditWhileTyping(
  snapshot: RebuttalSnapshot,
  slot: string,
  record: RebuttalReplyProposal,
  current: string,
  typed: string
): Promise<void> {
  const merged = snapshot.bundle.meta.agentEdits === 'apply' ? passageOnto(typed, record) : null
  if (merged !== null && merged !== typed) {
    await keepVersion(snapshot, slot, {
      by: 'human',
      what: 'Your text, before the agent passage',
      text: typed
    })
    await writeSlot(snapshot, slot, merged, 'both')
    await writeProposals(
      snapshot,
      snapshot.proposals.map((entry) =>
        entry.id === record.id ? { ...entry, base: typed, text: merged } : entry
      )
    )
    return
  }
  await writeSlot(
    snapshot,
    slot,
    typed,
    replyAuthorAfterHumanEdit(slotAuthor(snapshot, slot), current, typed)
  )
  await writeProposals(
    snapshot,
    snapshot.proposals.map((entry) =>
      entry.id === record.id
        ? { ...entry, applied: false, base: typed, heldWhileTyping: true }
        : entry
    )
  )
}
