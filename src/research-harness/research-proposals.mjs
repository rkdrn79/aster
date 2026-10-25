import { lstat, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { withFileLock } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  appendLedgerEntry,
  existingExperiment,
  nextLedgerId,
  readLedgerEntries
} from './research-jsonl-ledger.mjs'
import { experimentPaths, experimentRelativePath, researchPaths } from './research-layout.mjs'
import { resolveRunReference } from './research-run-manifest.mjs'

export const PROPOSAL_STATES = ['pending', 'approved', 'rejected', 'launched']
const DECISIONS = ['approved', 'rejected']
const MAX_LINKED_FINDINGS = 12
const MAX_LINKED_RUNS = 6
const MAX_CONFIG_CHANGES_LENGTH = 4000
const FINDING_ID = /^(?:finding-[1-9]\d*|rule:[a-z][a-z0-9.-]{0,63}:[^\s]{1,200})$/u
const PROPOSAL_ID = /^proposal-[1-9]\d*$/u

function proposalsLedger(project, slug) {
  return path.join(experimentPaths(project, slug).experiment, 'proposals.jsonl')
}

function relativeLedger(project, slug) {
  return `${experimentRelativePath(project, slug)}/proposals.jsonl`
}

function requiredText(value, label, limit) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > limit) {
    throw new HarnessError('invalid_argument', `${label} must contain 1–${limit} characters`)
  }
  return text
}

function optionalText(value, label, limit) {
  if (value === undefined || value === null) {
    return null
  }
  const text = String(value).trim()
  if (text.length > limit) {
    throw new HarnessError('invalid_argument', `${label} must be at most ${limit} characters`)
  }
  return text || null
}

async function projectDirectory(project, value) {
  if (value === undefined || value === null) {
    return null
  }
  const absolute = path.resolve(process.cwd(), String(value))
  const isDirectory = await stat(absolute).then(
    (details) => details.isDirectory(),
    () => false
  )
  if (!isDirectory) {
    throw new HarnessError('invalid_argument', `--cwd is not a directory: ${value}`)
  }
  const actual = await realpath(absolute)
  const relative = path.relative(project, actual)
  if (relative === '') {
    return '.'
  }
  // Why: a worker worktree may sit outside the project, so outside paths stay absolute.
  return relative.startsWith('..') || path.isAbsolute(relative)
    ? actual
    : relative.split(path.sep).join('/')
}

function configChangesObject(value) {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new HarnessError('invalid_argument', '--config-changes must be a JSON object')
  }
  if (JSON.stringify(value).length > MAX_CONFIG_CHANGES_LENGTH) {
    throw new HarnessError(
      'invalid_argument',
      `--config-changes must be at most ${MAX_CONFIG_CHANGES_LENGTH} characters of JSON`
    )
  }
  return Object.keys(value).length ? value : null
}

async function linkedFindings(project, slug, ids) {
  const unique = [...new Set(ids ?? [])]
  if (unique.length > MAX_LINKED_FINDINGS) {
    throw new HarnessError(
      'invalid_argument',
      `A proposal links at most ${MAX_LINKED_FINDINGS} findings`
    )
  }
  for (const id of unique) {
    if (!FINDING_ID.test(id)) {
      throw new HarnessError('invalid_argument', `Not a finding ID: ${id}`)
    }
  }
  const recorded = unique.filter((id) => id.startsWith('finding-'))
  if (recorded.length) {
    // Why: rule finding IDs are derived from the check and target, so only recorded ones are looked up.
    const quality = await readLedgerEntries(
      path.join(experimentPaths(project, slug).experiment, 'quality.jsonl')
    )
    const known = new Set(
      quality.filter((entry) => entry?.type === 'finding').map((entry) => entry.id)
    )
    const missing = recorded.find((id) => !known.has(id))
    if (missing) {
      throw new HarnessError('not_found', `No finding ${missing} in ${slug}`)
    }
  }
  return unique
}

async function linkedRuns(project, references) {
  const unique = [...new Set(references ?? [])]
  if (unique.length > MAX_LINKED_RUNS) {
    throw new HarnessError('invalid_argument', `A proposal links at most ${MAX_LINKED_RUNS} Runs`)
  }
  const resolved = []
  for (const reference of unique) {
    resolved.push((await resolveRunReference(project, reference)).ref)
  }
  return [...new Set(resolved)]
}

/** Folds the ledger into one row per proposal with its current state. */
function deriveProposals(slug, entries) {
  const proposals = new Map()
  for (const entry of entries) {
    if (entry?.type === 'proposal' && typeof entry.id === 'string') {
      proposals.set(entry.id, {
        id: entry.id,
        at: entry.at,
        experiment: slug,
        title: entry.title,
        rationale: entry.rationale,
        command: entry.command,
        cwd: entry.cwd ?? null,
        configChanges: entry.configChanges ?? null,
        findings: entry.findings ?? [],
        runs: entry.runs ?? [],
        agent: entry.agent ?? null,
        state: 'pending',
        decision: null,
        launchedRun: null,
        launchedAt: null,
        needsCode: entry.needsCode === true,
        handoff: null
      })
      continue
    }
    const proposal = proposals.get(entry?.target)
    if (!proposal) {
      continue
    }
    if (
      entry.type === 'decision' &&
      proposal.state === 'pending' &&
      DECISIONS.includes(entry.decision)
    ) {
      proposal.state = entry.decision
      proposal.decision = {
        decision: entry.decision,
        note: entry.note ?? null,
        by: entry.by,
        at: entry.at
      }
    } else if (entry.type === 'launched' && proposal.state === 'approved') {
      proposal.state = 'launched'
      proposal.launchedRun = entry.run
      proposal.launchedAt = entry.at
    } else if (entry.type === 'handoff' && proposal.state === 'approved') {
      proposal.handoff = { at: entry.at, sessionId: entry.sessionId ?? null }
    }
  }
  return [...proposals.values()]
}

/**
 * Records an agent's rerun proposal; nothing runs until the user approves it. `needsCode` marks a
 * Run that needs code changes, which a Workbench chat implements after the user hands it over.
 */
export async function addProposal(projectPath, input) {
  const project = await realpath(projectPath)
  const slug = await existingExperiment(project, input.experiment)
  const title = requiredText(input.title, 'Title', 200)
  const rationale = requiredText(input.rationale, 'Rationale', 4000)
  const command = requiredText(input.command, 'Command', 4000)
  const cwd = await projectDirectory(project, input.cwd)
  const configChanges = configChangesObject(input.configChanges)
  const findings = await linkedFindings(project, slug, input.findings)
  const runs = await linkedRuns(project, input.runs)
  const target = proposalsLedger(project, slug)
  const agent = agentIdentityFromEnvironment()
  const proposal = await withFileLock(`${target}.lock`, async () => {
    const entries = await readLedgerEntries(target)
    const created = {
      schemaVersion: 1,
      id: nextLedgerId(entries, 'proposal'),
      type: 'proposal',
      at: new Date().toISOString(),
      title,
      rationale,
      command,
      cwd,
      configChanges,
      findings,
      runs,
      needsCode: input.needsCode === true,
      agent
    }
    await appendLedgerEntry(target, created)
    return deriveProposals(slug, [...entries, created]).find((item) => item.id === created.id)
  })
  return { experiment: slug, ledger: relativeLedger(project, slug), proposal }
}

export async function listProposals(projectPath, experiment, { state = 'all' } = {}) {
  const project = await realpath(projectPath)
  const slug = await existingExperiment(project, experiment)
  if (state !== 'all' && !PROPOSAL_STATES.includes(state)) {
    throw new HarnessError(
      'invalid_argument',
      `State must be one of: ${[...PROPOSAL_STATES, 'all'].join(', ')}`
    )
  }
  const proposals = deriveProposals(slug, await readLedgerEntries(proposalsLedger(project, slug)))
  return {
    experiment: slug,
    ledger: relativeLedger(project, slug),
    proposals: state === 'all' ? proposals : proposals.filter((item) => item.state === state)
  }
}

async function experimentsWithProposals(project) {
  const root = researchPaths(project).experiments
  const names = await readdir(root).catch((error) => {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  })
  const slugs = []
  for (const name of names) {
    const found = await lstat(path.join(root, name, 'proposals.jsonl')).then(
      (details) => details.isFile(),
      () => false
    )
    if (found) {
      slugs.push(name)
    }
  }
  return slugs
}

// Why: proposal IDs are numbered per Experiment, so without --experiment the ID must be unique.
async function proposalExperiment(project, id, experiment) {
  if (typeof id !== 'string' || !PROPOSAL_ID.test(id)) {
    throw new HarnessError('invalid_argument', `Not a proposal ID: ${id}`)
  }
  if (experiment) {
    return existingExperiment(project, experiment)
  }
  const matches = []
  for (const slug of await experimentsWithProposals(project)) {
    const entries = await readLedgerEntries(proposalsLedger(project, slug))
    if (entries.some((entry) => entry?.type === 'proposal' && entry.id === id)) {
      matches.push(slug)
    }
  }
  if (matches.length > 1) {
    throw new HarnessError(
      'ambiguous_proposal',
      `${id} exists in several Experiments (${matches.join(', ')}); pass --experiment`
    )
  }
  if (!matches.length) {
    throw new HarnessError('proposal_not_found', `No proposal ${id} in this project`)
  }
  return matches[0]
}

async function appendForProposal(project, slug, id, build) {
  const target = proposalsLedger(project, slug)
  return withFileLock(`${target}.lock`, async () => {
    const entries = await readLedgerEntries(target)
    const current = deriveProposals(slug, entries).find((item) => item.id === id)
    if (!current) {
      throw new HarnessError('proposal_not_found', `No proposal ${id} in ${slug}`)
    }
    const entry = build(current, entries)
    await appendLedgerEntry(target, entry)
    return deriveProposals(slug, [...entries, entry]).find((item) => item.id === id)
  })
}

/** The user's approval or rejection; only a pending proposal can be decided, once. */
export async function decideProposal(projectPath, input) {
  const project = await realpath(projectPath)
  if (input.by !== 'user') {
    throw new HarnessError(
      'not_allowed',
      'Only the user decides proposals (--by user); an agent waits for the approval message'
    )
  }
  if (!DECISIONS.includes(input.decision)) {
    throw new HarnessError('invalid_argument', `Decision must be one of: ${DECISIONS.join(', ')}`)
  }
  const note = optionalText(input.note, 'Note', 2000)
  const slug = await proposalExperiment(project, input.id, input.experiment)
  const proposal = await appendForProposal(project, slug, input.id, (current, entries) => {
    if (current.state !== 'pending') {
      throw new HarnessError('already_decided', `${input.id} is already ${current.state}`)
    }
    return {
      schemaVersion: 1,
      id: nextLedgerId(entries, 'decision'),
      type: 'decision',
      at: new Date().toISOString(),
      target: input.id,
      decision: input.decision,
      note,
      by: 'user'
    }
  })
  return { experiment: slug, ledger: relativeLedger(project, slug), proposal }
}

/** Links an approved proposal to the Run that carried it out. */
export async function markProposalLaunched(projectPath, input) {
  const project = await realpath(projectPath)
  const slug = await proposalExperiment(project, input.id, input.experiment)
  const run = (await resolveRunReference(project, input.run)).ref
  const agent = agentIdentityFromEnvironment()
  const proposal = await appendForProposal(project, slug, input.id, (current, entries) => {
    if (current.state !== 'approved') {
      throw new HarnessError(
        'not_approved',
        `${input.id} is ${current.state}; launch only after the user approves it`
      )
    }
    return {
      schemaVersion: 1,
      id: nextLedgerId(entries, 'launch'),
      type: 'launched',
      at: new Date().toISOString(),
      target: input.id,
      run,
      agent
    }
  })
  return { experiment: slug, ledger: relativeLedger(project, slug), proposal }
}

/**
 * The user's handoff of an approved, not yet launched proposal to a Workbench coding chat
 * (`sessionId`, or null for a new chat); the latest handoff is the current one.
 */
export async function handoffProposal(projectPath, input) {
  const project = await realpath(projectPath)
  if (input.by !== 'user') {
    throw new HarnessError(
      'not_allowed',
      'Only the user hands a proposal to a Workbench chat (--by user), from Aster'
    )
  }
  const sessionId = optionalText(input.sessionId, 'Session ID', 200)
  const slug = await proposalExperiment(project, input.id, input.experiment)
  const proposal = await appendForProposal(project, slug, input.id, (current, entries) => {
    if (current.state === 'launched') {
      throw new HarnessError(
        'already_launched',
        `${input.id} already launched as ${current.launchedRun}`
      )
    }
    if (current.state !== 'approved') {
      throw new HarnessError(
        'not_approved',
        `${input.id} is ${current.state}; only an approved proposal is handed off`
      )
    }
    return {
      schemaVersion: 1,
      id: nextLedgerId(entries, 'handoff'),
      type: 'handoff',
      at: new Date().toISOString(),
      target: input.id,
      sessionId,
      by: 'user'
    }
  })
  return { experiment: slug, ledger: relativeLedger(project, slug), proposal }
}
