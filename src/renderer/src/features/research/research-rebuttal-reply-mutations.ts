import {
  clustersDocument,
  nextSequentialId
} from '../../../../research-harness/research-rebuttal-model.mjs'
import { parseClusters } from '../../../../research-harness/research-rebuttal-points.mjs'
import {
  proposalOutcome,
  replyAuthorAfterAccept,
  replyAuthorAfterHumanEdit,
  slotText
} from '../../../../research-harness/research-rebuttal-records.mjs'
import type { RebuttalOwner } from './research-rebuttal-files'
import { withFreshSnapshot, writeJson } from './research-rebuttal-mutations'
import {
  currentText,
  keepVersion,
  listReplyVersions,
  readHistory,
  slotAuthor,
  writeProposals,
  writeSlot
} from './research-rebuttal-reply-store'
import { keepTextOfRegroupedSlot, settleEditWhileTyping } from './research-rebuttal-reply-typing'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

export { listReplyVersions }

/** A reply version is kept when the person starts editing, then at most this often while typing. */
const HUMAN_VERSION_INTERVAL_MS = 10 * 60_000
const lastHumanVersionAt = new Map<string, number>()

/** Keeps what was there before the person's edits, once at the start and then every few minutes. */
async function keepHumanVersion(
  snapshot: RebuttalSnapshot,
  slot: string,
  previous: string,
  next: string
): Promise<void> {
  const key = `${snapshot.directory}|${slot}`
  const last = lastHumanVersionAt.get(key) ?? 0
  if (previous === next || !previous.trim() || Date.now() - last < HUMAN_VERSION_INTERVAL_MS) {
    return
  }
  lastHumanVersionAt.set(key, Date.now())
  const author = slotAuthor(snapshot, slot)
  await keepVersion(snapshot, slot, {
    by: author === 'agent' ? 'agent' : 'human',
    what: 'Before you edited',
    text: previous
  })
}

/**
 * Saves what the person typed. `base` is the text the editor started from: an agent draft that
 * landed while typing (so the person never saw it) stays as a suggestion instead of being lost.
 */
export async function saveRebuttalReply(
  owner: RebuttalOwner,
  input: { slot: string | null; pointId: string | null; text: string; base: string }
): Promise<string> {
  let savedSlot = input.slot ?? ''
  await withFreshSnapshot(owner, async (snapshot) => {
    const { bundle } = snapshot
    const slot = input.slot
    if (!slot) {
      const point = bundle.points.find((entry) => entry.id === input.pointId)
      if (!point) {
        throw new Error('That concern no longer exists.')
      }
      // Why: the first words typed for a concern with no group yet make it answerable.
      const id = nextSequentialId('C', bundle.clusters)
      const clusters = parseClusters(
        [
          ...bundle.clusters,
          {
            id,
            title: (point.summary || point.quote).replace(/\s+/g, ' ').slice(0, 200) || point.id,
            points: [point.id],
            action: 'clarify' as const,
            status: input.text.trim() ? ('drafting' as const) : ('todo' as const),
            plan: '',
            experiment: null,
            manuscript: null,
            response: input.text,
            author: replyAuthorAfterHumanEdit(null, '', input.text),
            general: false
          }
        ],
        { pointIds: bundle.points.map((entry) => entry.id) }
      )
      await writeJson(
        snapshot,
        'clusters.json',
        snapshot.texts.clusters,
        clustersDocument(clusters)
      )
      savedSlot = id
      return
    }
    savedSlot = slot
    if (slotText(snapshot.bundle, slot) === null) {
      await keepTextOfRegroupedSlot(snapshot, slot, input.text)
    }
    const current = currentText(snapshot, slot)
    if (current === input.text) {
      return
    }
    await keepHumanVersion(snapshot, slot, current, input.text)
    const record = snapshot.proposals.find((entry) => entry.slot === slot && entry.applied)
    if (!record || input.base === record.text) {
      await writeSlot(
        snapshot,
        slot,
        input.text,
        replyAuthorAfterHumanEdit(slotAuthor(snapshot, slot), current, input.text)
      )
      if (record) {
        // Why: the person saw the agent's text and edited on from it; that settles the edit.
        await writeProposals(
          snapshot,
          snapshot.proposals.filter((entry) => entry.id !== record.id)
        )
      }
      return
    }
    await settleEditWhileTyping(snapshot, slot, record, current, input.text)
  })
  return savedSlot
}

/** Takes one proposal into the reply. Throws when a passage no longer stands in the reply. */
export async function acceptRebuttalProposal(owner: RebuttalOwner, id: string): Promise<void> {
  await withFreshSnapshot(owner, async (snapshot) => {
    const proposal = snapshot.proposals.find((entry) => entry.id === id)
    if (!proposal) {
      return
    }
    const remaining = snapshot.proposals.filter((entry) => entry.id !== id)
    if (proposal.applied) {
      await writeProposals(snapshot, remaining)
      return
    }
    const current = currentText(snapshot, proposal.slot)
    const outcome = proposalOutcome(current, proposal)
    if (outcome.mode === 'conflict') {
      throw new Error('That passage is no longer in the reply. Copy what you want and discard it.')
    }
    const author = slotAuthor(snapshot, proposal.slot)
    await keepVersion(snapshot, proposal.slot, {
      by: author === 'agent' ? 'agent' : 'human',
      what: `Before accepting: ${proposal.request || 'agent change'}`,
      text: current
    })
    await keepVersion(snapshot, proposal.slot, {
      by: 'agent',
      what: proposal.request ? `Accepted: ${proposal.request}` : 'Accepted agent change',
      text: outcome.text
    })
    await writeSlot(snapshot, proposal.slot, outcome.text, replyAuthorAfterAccept(author))
    await writeProposals(snapshot, remaining)
  })
}

/** Who wrote a reply once an agent edit is undone back to `base`. */
function authorAfterUndo(
  author: ReturnType<typeof slotAuthor>,
  base: string
): ReturnType<typeof slotAuthor> {
  if (!base.trim()) {
    return null
  }
  return author === 'both' ? 'human' : author
}

/**
 * Undoes an applied agent edit, putting back the exact text from before it, or discards a
 * waiting suggestion. Throws when the reply changed after the edit: Versions has both texts.
 */
export async function discardRebuttalProposal(owner: RebuttalOwner, id: string): Promise<void> {
  await withFreshSnapshot(owner, async (snapshot) => {
    const proposal = snapshot.proposals.find((entry) => entry.id === id)
    if (!proposal) {
      return
    }
    const remaining = snapshot.proposals.filter((entry) => entry.id !== id)
    if (proposal.applied && currentText(snapshot, proposal.slot) !== proposal.text) {
      throw new Error(
        'This reply changed after the agent edit, so Undo cannot put the earlier text back. Open Versions to restore it.'
      )
    }
    await keepVersion(snapshot, proposal.slot, {
      by: 'agent',
      what: proposal.applied ? 'Undone agent edit' : 'Discarded suggestion',
      text: proposal.text
    })
    if (proposal.applied) {
      await writeSlot(
        snapshot,
        proposal.slot,
        proposal.base,
        authorAfterUndo(slotAuthor(snapshot, proposal.slot), proposal.base)
      )
    }
    await writeProposals(snapshot, remaining)
  })
}

export async function acceptRebuttalProposals(
  owner: RebuttalOwner,
  ids: readonly string[]
): Promise<string[]> {
  const failed: string[] = []
  for (const id of ids) {
    try {
      await acceptRebuttalProposal(owner, id)
    } catch {
      failed.push(id)
    }
  }
  return failed
}

export async function discardRebuttalProposals(
  owner: RebuttalOwner,
  ids: readonly string[]
): Promise<string[]> {
  const failed: string[] = []
  for (const id of ids) {
    try {
      await discardRebuttalProposal(owner, id)
    } catch {
      failed.push(id)
    }
  }
  return failed
}

export async function restoreReplyVersion(
  owner: RebuttalOwner,
  slot: string,
  versionId: string
): Promise<void> {
  await withFreshSnapshot(owner, async (snapshot) => {
    const { versions } = await readHistory(owner, snapshot, slot)
    const version = versions.find((entry) => entry.id === versionId)
    if (!version) {
      throw new Error('That version is gone.')
    }
    const current = currentText(snapshot, slot)
    await keepVersion(snapshot, slot, {
      by: slotAuthor(snapshot, slot) === 'agent' ? 'agent' : 'human',
      what: 'Before restoring an earlier version',
      text: current
    })
    await keepVersion(snapshot, slot, {
      by: version.by,
      what: `Restored: ${version.what || 'earlier version'}`,
      text: version.text
    })
    await writeSlot(snapshot, slot, version.text, version.by === 'agent' ? 'agent' : 'human')
    if (snapshot.proposals.some((entry) => entry.slot === slot && entry.applied)) {
      await writeProposals(
        snapshot,
        snapshot.proposals.filter((entry) => !(entry.slot === slot && entry.applied))
      )
    }
  })
}
