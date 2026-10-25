import { z } from 'zod'
import { loopLedgerPath } from '../../research-harness/research-layout.mjs'
import type {
  ResearchProjectFile,
  ResearchProjectLoopSummary
} from '../../shared/research/research-project-api'
import {
  readResearchProjectBytes,
  researchProjectRelativePath,
  resolveResearchProjectPath,
  unreadableResearchProjectFile,
  type ResearchProjectRoot
} from './research-project-files'

// A loop appends a few short rows per Run; the newest 256 KiB hold hundreds of iterations.
const LOOP_TAIL_BYTES = 256 * 1024

const text = z.string().catch('')
const nullableText = z.string().nullable().catch(null)
const nullableNumber = z.number().finite().nullable().catch(null)

const loopEntrySchema = z.object({
  id: text,
  at: text,
  kind: text,
  text,
  hypothesis: nullableText.optional().catch(null),
  data: z
    .object({
      metric: nullableText.optional(),
      split: nullableText.optional(),
      direction: z.enum(['minimize', 'maximize']).nullable().optional().catch(null),
      maxRuns: nullableNumber.optional(),
      maxHours: nullableNumber.optional()
    })
    .nullable()
    .optional()
    .catch(null)
})

type LoopEntry = z.infer<typeof loopEntrySchema>

function parseEntries(lines: string[]): LoopEntry[] {
  return lines.flatMap((line) => {
    try {
      const parsed = loopEntrySchema.safeParse(JSON.parse(line))
      return parsed.success && parsed.data.kind ? [parsed.data] : []
    } catch {
      return []
    }
  })
}

/** The harness's own budget rule (research-loop-ledger.mjs `loopBudget`), over the rows read. */
export function summarizeResearchLoop(
  entries: LoopEntry[],
  partial: boolean,
  now: number
): ResearchProjectLoopSummary {
  const objective = entries.findLast((entry) => entry.kind === 'objective') ?? null
  const since = objective ? entries.slice(entries.lastIndexOf(objective) + 1) : []
  const maxRuns = objective?.data?.maxRuns ?? null
  const maxHours = objective?.data?.maxHours ?? null
  const runsUsed = since.filter((entry) => entry.kind === 'run').length
  const started = objective ? Date.parse(objective.at) : Number.NaN
  const hoursElapsed = Number.isNaN(started)
    ? 0
    : Math.round(((now - started) / 3_600_000) * 100) / 100
  const answered = new Set(
    entries
      .filter((entry) => entry.kind === 'decision' && entry.hypothesis)
      .map((entry) => entry.hypothesis)
  )
  const last = entries.at(-1) ?? null
  return {
    objective: objective
      ? {
          text: objective.text,
          at: objective.at,
          metric: objective.data?.metric ?? null,
          split: objective.data?.split ?? null,
          direction: objective.data?.direction ?? null
        }
      : null,
    budget: objective
      ? {
          maxRuns,
          runsUsed,
          maxHours,
          hoursElapsed,
          exhausted:
            (maxRuns !== null && runsUsed >= maxRuns) ||
            (maxHours !== null && hoursElapsed >= maxHours)
        }
      : null,
    openHypotheses: entries.filter(
      (entry) => entry.kind === 'hypothesis' && !answered.has(entry.id)
    ).length,
    entries: entries.length,
    last: last ? { kind: last.kind, text: last.text, at: last.at } : null,
    checkpoint: last?.kind === 'checkpoint' ? { text: last.text, at: last.at } : null,
    partial
  }
}

/** The newest rows of an Experiment's loop ledger, summarized; `absent` when no loop ran. */
export async function readResearchProjectLoopSummary(
  root: ResearchProjectRoot,
  slug: string,
  onBytes: (bytes: number) => void,
  now: number = Date.now()
): Promise<ResearchProjectFile<ResearchProjectLoopSummary>> {
  try {
    const relative = researchProjectRelativePath(root, loopLedgerPath(root.path, slug))
    const read = await readResearchProjectBytes(
      await resolveResearchProjectPath(root, relative),
      LOOP_TAIL_BYTES,
      'end'
    )
    if (!read) {
      return { status: 'absent' }
    }
    onBytes(read.bytes.length)
    const partial = read.offset > 0
    const body = read.bytes.toString('utf8')
    // Why: a tail read starts mid-row; that fragment is not a row.
    const rows = partial ? body.slice(body.indexOf('\n') + 1) : body
    const lines = rows.split(/\r?\n/).filter((line) => line.trim().length > 0)
    return { status: 'present', value: summarizeResearchLoop(parseEntries(lines), partial, now) }
  } catch (error) {
    return unreadableResearchProjectFile(error)
  }
}
