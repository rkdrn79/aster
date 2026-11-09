import {
  clustersDocument,
  parseRebuttalMeta,
  type RebuttalReplyAuthor
} from '../../../../research-harness/research-rebuttal-model.mjs'
import { parseClusters } from '../../../../research-harness/research-rebuttal-points.mjs'
import {
  appendVersion,
  historyDocument,
  historyFileName,
  parseHistory,
  proposalsDocument,
  slotText,
  type RebuttalReplyProposal,
  type RebuttalReplyVersion
} from '../../../../research-harness/research-rebuttal-records.mjs'
import {
  listRebuttalDirectory,
  readRebuttalText,
  writeRebuttalText,
  type RebuttalOwner
} from './research-rebuttal-files'
import { writeJson } from './research-rebuttal-mutations'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

// The low-level writes for one reply: its text, who wrote it, and its kept versions.

export function currentText(snapshot: RebuttalSnapshot, slot: string): string {
  const text = slotText(snapshot.bundle, slot)
  if (text === null) {
    throw new Error(`There is no reply ${slot} any more.`)
  }
  return text
}

export function slotAuthor(snapshot: RebuttalSnapshot, slot: string): RebuttalReplyAuthor | null {
  return snapshot.bundle.clusters.find((cluster) => cluster.id === slot)?.author ?? null
}

export function writeProposals(
  snapshot: RebuttalSnapshot,
  proposals: RebuttalReplyProposal[]
): Promise<void> {
  return writeJson(
    snapshot,
    'proposals.json',
    snapshot.texts.proposals,
    proposalsDocument(proposals)
  )
}

/** Writes one reply's text and who wrote it. */
export async function writeSlot(
  snapshot: RebuttalSnapshot,
  slot: string,
  text: string,
  author: RebuttalReplyAuthor | null
): Promise<void> {
  const { bundle } = snapshot
  if (slot.startsWith('C')) {
    const clusters = parseClusters(
      bundle.clusters.map((cluster) =>
        cluster.id === slot
          ? {
              ...cluster,
              response: text,
              author,
              status:
                text.trim() && cluster.status === 'todo' ? ('drafting' as const) : cluster.status
            }
          : cluster
      ),
      { pointIds: bundle.points.map((point) => point.id) }
    )
    await writeJson(snapshot, 'clusters.json', snapshot.texts.clusters, clustersDocument(clusters))
    return
  }
  const meta = parseRebuttalMeta({
    ...bundle.meta,
    ...(slot.startsWith('opening:')
      ? {
          reviewers: bundle.meta.reviewers.map((reviewer) =>
            reviewer.id === slot.slice(8) ? { ...reviewer, opening: text } : reviewer
          )
        }
      : { general: { ...bundle.meta.general, [slot.slice(8)]: text } }),
    updatedAt: new Date().toISOString()
  })
  await writeJson(snapshot, 'rebuttal.json', snapshot.texts.meta, meta)
}

export function historyPath(snapshot: RebuttalSnapshot, slot: string): string {
  return `${snapshot.directory}/history/${historyFileName(slot)}`
}

export async function readHistory(
  owner: RebuttalOwner,
  snapshot: RebuttalSnapshot,
  slot: string
): Promise<{ versions: RebuttalReplyVersion[]; raw: string | null }> {
  const entries = await listRebuttalDirectory(owner, `${snapshot.directory}/history`)
  if (!entries?.some((entry) => entry.name === historyFileName(slot))) {
    return { versions: [], raw: null }
  }
  const raw = await readRebuttalText(owner, historyPath(snapshot, slot))
  return { versions: parseHistory(JSON.parse(raw)), raw }
}

export async function keepVersion(
  snapshot: RebuttalSnapshot,
  slot: string,
  version: Pick<RebuttalReplyVersion, 'by' | 'what' | 'text'>
): Promise<void> {
  if (!version.text.trim()) {
    return
  }
  const { versions, raw } = await readHistory(snapshot.owner, snapshot, slot)
  const next = appendVersion(versions, { ...version, at: new Date().toISOString() })
  if (next !== versions) {
    await writeRebuttalText(
      snapshot.owner,
      historyPath(snapshot, slot),
      `${JSON.stringify(historyDocument(next), null, 2)}\n`,
      raw
    )
  }
}

export function listReplyVersions(
  snapshot: RebuttalSnapshot,
  slot: string
): Promise<RebuttalReplyVersion[]> {
  return readHistory(snapshot.owner, snapshot, slot).then((history) => history.versions)
}
