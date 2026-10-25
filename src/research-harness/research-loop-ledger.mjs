import { realpath } from 'node:fs/promises'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { withFileLock } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  appendLedgerEntry,
  existingExperiment,
  readLedgerEntries
} from './research-jsonl-ledger.mjs'
import { experimentRelativePath, loopLedgerPath } from './research-layout.mjs'
import { resolveRunReference } from './research-run-manifest.mjs'

export const LOOP_NOTE_KINDS = [
  'objective',
  'hypothesis',
  'run',
  'result',
  'decision',
  'checkpoint'
]

/** Appends one hypothesis → run → result → decision entry to the Experiment's loop.jsonl. */
export async function appendLoopNote(projectPath, input) {
  const project = await realpath(projectPath)
  const slug = await existingExperiment(project, input.experiment)
  if (!LOOP_NOTE_KINDS.includes(input.kind)) {
    throw new HarnessError('invalid_argument', `Kind must be one of: ${LOOP_NOTE_KINDS.join(', ')}`)
  }
  const text = input.text?.trim()
  if (!text || text.length > 4000) {
    throw new HarnessError('invalid_argument', 'Note text must contain 1–4000 characters')
  }
  if (input.kind === 'run' && !input.run) {
    throw new HarnessError('usage', 'A run note needs --run <experiment>/<run>')
  }
  const run = input.run ? (await resolveRunReference(project, input.run)).ref : null
  if (
    input.data !== undefined &&
    (!input.data || typeof input.data !== 'object' || Array.isArray(input.data))
  ) {
    throw new HarnessError('invalid_argument', '--data must be a JSON object')
  }
  const target = loopLedgerPath(project, slug)
  const agent = agentIdentityFromEnvironment()
  const entry = await withFileLock(`${target}.lock`, async () => {
    const entries = await readLedgerEntries(target)
    if (input.hypothesis && !entries.some((item) => item.id === input.hypothesis)) {
      throw new HarnessError('not_found', `No loop entry ${input.hypothesis} in ${slug}`)
    }
    const sameKind = entries.filter((item) => item.kind === input.kind).length
    const created = {
      schemaVersion: 1,
      id: `${input.kind}-${sameKind + 1}`,
      at: new Date().toISOString(),
      kind: input.kind,
      text,
      hypothesis: input.hypothesis ?? null,
      run,
      data: input.data ?? null,
      ...(agent ? { agent } : {})
    }
    await appendLedgerEntry(target, created)
    return created
  })
  return { experiment: slug, ledger: `${experimentRelativePath(project, slug)}/loop.jsonl`, entry }
}

function loopBudget(objective, entries) {
  if (!objective) {
    return null
  }
  const since = entries.slice(entries.indexOf(objective) + 1)
  const data = objective.data ?? {}
  const runsUsed = since.filter((item) => item.kind === 'run').length
  const hoursElapsed = (Date.now() - Date.parse(objective.at)) / 3_600_000
  const maxRuns = Number.isFinite(data.maxRuns) ? data.maxRuns : null
  const maxHours = Number.isFinite(data.maxHours) ? data.maxHours : null
  return {
    maxRuns,
    runsUsed,
    remainingRuns: maxRuns === null ? null : Math.max(0, maxRuns - runsUsed),
    maxHours,
    hoursElapsed: Math.round(hoursElapsed * 100) / 100,
    exhausted:
      (maxRuns !== null && runsUsed >= maxRuns) || (maxHours !== null && hoursElapsed >= maxHours)
  }
}

export async function readLoopLedger(projectPath, experiment, { limit = 20 } = {}) {
  const project = await realpath(projectPath)
  const slug = await existingExperiment(project, experiment)
  const entries = await readLedgerEntries(loopLedgerPath(project, slug))
  const objective = entries.findLast((item) => item.kind === 'objective') ?? null
  const decided = new Set(
    entries
      .filter((item) => item.kind === 'decision' && item.hypothesis)
      .map((item) => item.hypothesis)
  )
  const counts = Object.fromEntries(LOOP_NOTE_KINDS.map((kind) => [kind, 0]))
  for (const item of entries) {
    counts[item.kind] = (counts[item.kind] ?? 0) + 1
  }
  return {
    experiment: slug,
    ledger: `${experimentRelativePath(project, slug)}/loop.jsonl`,
    objective,
    budget: loopBudget(objective, entries),
    counts,
    openHypotheses: entries
      .filter((item) => item.kind === 'hypothesis' && !decided.has(item.id))
      .map((item) => ({ id: item.id, text: item.text })),
    entries: entries.slice(-Math.max(1, limit))
  }
}
