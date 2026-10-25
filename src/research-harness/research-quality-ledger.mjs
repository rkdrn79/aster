import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { readCatalog } from './research-catalog.mjs'
import { runChecks } from './research-checks.mjs'
import { withFileLock } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { appendLedgerEntry, nextLedgerId, readLedgerEntries } from './research-jsonl-ledger.mjs'
import {
  experimentPaths,
  experimentRelativePath,
  experimentSlug,
  layoutRelativePaths
} from './research-layout.mjs'
import {
  checkedRuns,
  checkedSamples,
  evidenceContext,
  hasValue,
  recordedEvidence
} from './research-quality-evidence.mjs'
import { resolveRunReference } from './research-run-manifest.mjs'

export const FINDING_SEVERITIES = ['info', 'warn', 'fail']
export const FINDING_LAYERS = ['integrity', 'output']
export const FINDING_STATUSES = ['open', 'accepted', 'dismissed', 'resolved']
const ACTORS = ['agent', 'user']
const CHECK_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/u
const RULE_ID_PATTERN = /^rule:[a-z][a-z0-9.-]{0,63}:\S.{0,255}$/u
const FINDING_ID_PATTERN = /^finding-\d+$/u
const MAX_EVIDENCE = 12
const MAX_TEXT = 2000
const severityRank = { fail: 0, warn: 1, info: 2 }

export function qualityLedgerPath(project, slug) {
  return path.join(experimentPaths(project, slug).experiment, 'quality.jsonl')
}

function ledgerReference(project, slug) {
  return `${experimentRelativePath(project, slug)}/quality.jsonl`
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new HarnessError('invalid_argument', `${label} must be one of: ${allowed.join(', ')}`)
  }
  return value
}

function checkedText(value, label, max) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > max) {
    throw new HarnessError('invalid_argument', `${label} must contain 1–${max} characters`)
  }
  return text
}

async function catalogExperiment(project, experiment, catalog = null) {
  const slug = experimentSlug(experiment)
  const experiments = (catalog ?? (await readCatalog(project))).experiments
  if (!experiments.some((entry) => entry.slug === slug)) {
    throw new HarnessError(
      'experiment_not_found',
      `Experiment ${slug} is not in ${layoutRelativePaths(project).catalog}`
    )
  }
  return slug
}

function ledgerFinding(entry) {
  return {
    id: entry.id,
    source: entry.source,
    check: entry.check,
    layer: entry.layer,
    severity: entry.severity,
    status: 'open',
    experiment: entry.experiment,
    runs: entry.runs ?? [],
    samples: entry.samples ?? [],
    text: entry.text,
    evidence: entry.evidence ?? [],
    createdAt: entry.createdAt ?? entry.at,
    agent: entry.agent ?? null,
    statusNote: null,
    statusAt: null,
    statusBy: null
  }
}

async function ledgerContents(project, slug) {
  const entries = await readLedgerEntries(qualityLedgerPath(project, slug))
  return {
    findings: entries.filter((entry) => entry.type === 'finding').map(ledgerFinding),
    statuses: entries.filter(
      (entry) => entry.type === 'status' && FINDING_STATUSES.includes(entry.status)
    )
  }
}

/** Recorded findings and status entries of one Experiment, before rule checks are merged. */
export async function readQualityLedger(projectPath, experiment) {
  const project = await realpath(projectPath)
  const slug = await catalogExperiment(project, experiment)
  return { experiment: slug, ...(await ledgerContents(project, slug)) }
}

/** The latest status entry per target wins; rule findings are targeted by their stable ID. */
export function applyFindingStatuses(findings, statuses) {
  const latest = new Map()
  for (const entry of statuses) {
    latest.set(entry.target, entry)
  }
  return findings.map((finding) => {
    const entry = latest.get(finding.id)
    return entry
      ? {
          ...finding,
          status: entry.status,
          statusNote: entry.note ?? null,
          statusAt: entry.at ?? null,
          statusBy: entry.by ?? null
        }
      : finding
  })
}

export async function addFinding(projectPath, input) {
  const project = await realpath(projectPath)
  const slug = await catalogExperiment(project, input.experiment)
  if (typeof input.check !== 'string' || !CHECK_PATTERN.test(input.check)) {
    throw new HarnessError(
      'invalid_argument',
      'Check must be 1–64 lowercase letters, digits, dots, or hyphens and start with a letter'
    )
  }
  const severity = oneOf(input.severity, FINDING_SEVERITIES, 'Severity')
  const layer = oneOf(input.layer ?? 'integrity', FINDING_LAYERS, 'Layer')
  const text = checkedText(input.text, 'Finding text', MAX_TEXT)
  const agent = agentIdentityFromEnvironment()
  const source = oneOf(input.createdBy ?? (agent ? 'agent' : 'user'), ACTORS, 'Created-by')
  const evidenceInput = input.evidence ?? []
  if (!Array.isArray(evidenceInput) || evidenceInput.length > MAX_EVIDENCE) {
    throw new HarnessError(
      'invalid_argument',
      `A finding carries at most ${MAX_EVIDENCE} evidence items`
    )
  }
  if (source === 'agent' && evidenceInput.length === 0) {
    throw new HarnessError(
      'missing_evidence',
      'An agent finding needs at least one --evidence item: metric, log lines, file, run.json field, sample, or claim'
    )
  }
  const context = evidenceContext(project)
  const runs = await checkedRuns(context, input.runs ?? [])
  const samples = await checkedSamples(context, input.samples ?? [], runs)
  const evidence = []
  for (const item of evidenceInput) {
    evidence.push(await recordedEvidence(context, item))
  }
  const target = qualityLedgerPath(project, slug)
  const entry = await withFileLock(`${target}.lock`, async () => {
    const at = new Date().toISOString()
    const created = {
      schemaVersion: 1,
      id: nextLedgerId(await readLedgerEntries(target), 'finding'),
      type: 'finding',
      at,
      source,
      check: input.check,
      layer,
      severity,
      experiment: slug,
      runs,
      samples,
      text,
      evidence,
      createdAt: at,
      agent: source === 'agent' ? agent : null
    }
    await appendLedgerEntry(target, created)
    return created
  })
  return { experiment: slug, ledger: ledgerReference(project, slug), finding: ledgerFinding(entry) }
}

async function findingExperiment(project, id) {
  if (id.startsWith('rule:')) {
    const target = id.slice(id.indexOf(':', 'rule:'.length) + 1)
    if (target.startsWith('claim:')) {
      throw new HarnessError('usage', 'Pass --experiment for a rule finding about a claim')
    }
    return catalogExperiment(project, target.split('/')[0])
  }
  const catalog = await readCatalog(project)
  const matches = []
  for (const { slug } of catalog.experiments) {
    const entries = await readLedgerEntries(qualityLedgerPath(project, slug))
    if (entries.some((entry) => entry.type === 'finding' && entry.id === id)) {
      matches.push(slug)
    }
  }
  if (matches.length > 1) {
    throw new HarnessError(
      'ambiguous_finding',
      `${id} exists in several Experiments (${matches.join(', ')}); pass --experiment`
    )
  }
  if (!matches.length) {
    throw new HarnessError('finding_not_found', `No finding ${id} in this project`)
  }
  return matches[0]
}

/**
 * Agents may only mark their recorded findings resolved, with a note naming the re-run;
 * accepting, dismissing, reopening, and any rule-finding change belong to the user.
 */
export async function setFindingStatus(projectPath, input) {
  const project = await realpath(projectPath)
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  const rule = id.startsWith('rule:')
  if (!(rule ? RULE_ID_PATTERN : FINDING_ID_PATTERN).test(id)) {
    throw new HarnessError('invalid_argument', `Not a finding ID: ${id || '(empty)'}`)
  }
  const status = oneOf(input.status, FINDING_STATUSES, 'Status')
  const agent = agentIdentityFromEnvironment()
  const by = oneOf(input.by ?? (agent ? 'agent' : 'user'), ACTORS, 'By')
  const note =
    hasValue(input.note) && input.note !== '' ? checkedText(input.note, 'Note', MAX_TEXT) : null
  if (by === 'agent') {
    if (rule) {
      throw new HarnessError(
        'forbidden',
        'Only the user changes a rule finding; it clears itself once the check passes'
      )
    }
    if (status !== 'resolved') {
      throw new HarnessError(
        'forbidden',
        'Agents may only mark a finding resolved; the user accepts, dismisses, or reopens it in Aster'
      )
    }
    if (!note) {
      throw new HarnessError(
        'usage',
        'Resolving as an agent needs --note naming the re-run that fixes it'
      )
    }
  }
  const slug = input.experiment
    ? await catalogExperiment(project, input.experiment)
    : await findingExperiment(project, id)
  const target = qualityLedgerPath(project, slug)
  const entry = await withFileLock(`${target}.lock`, async () => {
    const entries = await readLedgerEntries(target)
    if (!rule && !entries.some((item) => item.type === 'finding' && item.id === id)) {
      throw new HarnessError('finding_not_found', `No finding ${id} in ${slug}`)
    }
    const created = {
      schemaVersion: 1,
      id: nextLedgerId(entries, 'status'),
      type: 'status',
      at: new Date().toISOString(),
      target: id,
      status,
      note,
      by,
      agent: by === 'agent' ? agent : null
    }
    await appendLedgerEntry(target, created)
    return created
  })
  return { experiment: slug, ledger: ledgerReference(project, slug), id, status, entry }
}

function compareFindings(left, right) {
  return (
    (severityRank[left.severity] ?? 3) - (severityRank[right.severity] ?? 3) ||
    String(right.createdAt).localeCompare(String(left.createdAt))
  )
}

/** Rule check findings merged with recorded ones, each with its latest status applied. */
export async function listFindings(
  projectPath,
  { experiment = null, run = null, status = 'open', includeRules = true } = {}
) {
  const project = await realpath(projectPath)
  if (status !== 'all') {
    oneOf(status, FINDING_STATUSES, 'Status')
  }
  const catalog = await readCatalog(project)
  const slug = experiment ? await catalogExperiment(project, experiment, catalog) : null
  const runRef = run ? (await resolveRunReference(project, run)).ref : null
  const slugs = slug ? [slug] : catalog.experiments.map((entry) => entry.slug)
  const rules = includeRules
    ? (
        await runChecks(project, {
          ...(slug ? { experiment: slug } : {}),
          ...(runRef ? { run: runRef } : {})
        })
      ).findings
    : []
  const findings = slug ? [] : rules.filter((finding) => !slugs.includes(finding.experiment))
  for (const each of slugs) {
    const ledger = await ledgerContents(project, each)
    const own = [...rules.filter((finding) => finding.experiment === each), ...ledger.findings]
    findings.push(...applyFindingStatuses(own, ledger.statuses))
  }
  return {
    findings: findings
      .filter((finding) => !runRef || finding.runs.includes(runRef))
      .filter((finding) => status === 'all' || finding.status === status)
      .sort(compareFindings)
  }
}
