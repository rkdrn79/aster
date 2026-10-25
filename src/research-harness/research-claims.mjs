import { readFile, realpath } from 'node:fs/promises'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { readCatalog, updateCatalog } from './research-catalog.mjs'
import { sha256OfFile, withFileLock, writeJsonAtomically } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  claimsLedgerPath,
  layoutRelativePaths,
  projectLayout,
  safeIdentifier
} from './research-layout.mjs'
import {
  checkedFormat,
  formatEvidenceValue,
  manuscriptSourceFiles,
  numberTokens,
  projectFile,
  projectRelative,
  resultNumberCandidates,
  stripTexComment,
  tokenMatchesValue
} from './research-manuscript-numbers.mjs'
import {
  checkedMetricName,
  readMetricSeries,
  selectMetricValue
} from './research-metric-events.mjs'
import { readRunManifest, resolveRunReference } from './research-run-manifest.mjs'

/** @deprecated Pre-ADR-004 location; use layoutRelativePaths(project).claims. */
export const CLAIMS_CATALOG_PATH = 'research/claims.json'
const selections = new Set(['last', 'best', 'step'])
const evidenceRoles = new Set(['stated', 'supporting'])
const anchorWindowLines = 30
const lineWindowLines = 3

export async function readClaimsLedger(project) {
  let content
  try {
    content = await readFile(claimsLedgerPath(project), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }
    throw error
  }
  const ledger = JSON.parse(content)
  if (ledger?.schemaVersion !== 1 || !Array.isArray(ledger.claims)) {
    throw new HarnessError(
      'invalid_layout',
      `Unsupported ${layoutRelativePaths(project).claims} schema`
    )
  }
  return ledger
}

async function updateClaimsLedger(project, transform) {
  const target = claimsLedgerPath(project)
  const result = await withFileLock(`${target}.lock`, async () => {
    const current = (await readClaimsLedger(project)) ?? { schemaVersion: 1, claims: [] }
    const { ledger, value } = await transform(current)
    await writeJsonAtomically(target, ledger)
    return value
  })
  // Why legacy only: an .aster catalog finds the claims ledger by its fixed path.
  if (projectLayout(project).kind === 'legacy') {
    const relative = layoutRelativePaths(project).claims
    const catalog = await readCatalog(project)
    if (catalog.claims !== relative) {
      await updateCatalog(project, (current) => ({ ...current, claims: relative }))
    }
  }
  return result
}

function valuesAgree(recorded, current, tolerance) {
  const scale = Math.max(1, Math.abs(recorded), Math.abs(current))
  return Math.abs(recorded - current) <= (tolerance ?? 0) + 1e-12 * scale
}

/** Reads each metrics file once per command; claims often cite the same Run repeatedly. */
function metricsCache() {
  const series = new Map()
  const hashes = new Map()
  return {
    series(file) {
      if (!series.has(file)) {
        series.set(
          file,
          readMetricSeries(file).catch((error) => ({ error: error.message }))
        )
      }
      return series.get(file)
    },
    hash(file) {
      if (!hashes.has(file)) {
        hashes.set(
          file,
          sha256OfFile(file).catch(() => null)
        )
      }
      return hashes.get(file)
    }
  }
}

async function measureEvidence(project, spec, cache) {
  const run = await resolveRunReference(project, spec.run)
  const manifest = await readRunManifest(run.paths).catch(() => null)
  const direction =
    spec.direction ?? manifest?.metrics?.definitions?.[spec.metric]?.direction ?? null
  const loaded = await cache.series(run.paths.metrics)
  const selection = loaded.error
    ? { error: loaded.error }
    : selectMetricValue(loaded.series, { ...spec, direction })
  return {
    run,
    runState: manifest?.execution?.state ?? 'unknown',
    direction,
    selection,
    metricsSha256: await cache.hash(run.paths.metrics)
  }
}

function checkedEvidenceSpec(input) {
  const select = input.select ?? (input.step !== undefined && input.step !== null ? 'step' : 'last')
  if (!selections.has(select)) {
    throw new HarnessError('invalid_argument', 'Select must be last, best, or step')
  }
  if (select === 'step' && !Number.isFinite(input.step)) {
    throw new HarnessError('invalid_argument', 'Select step needs --step <number>')
  }
  if (input.tolerance !== undefined && input.tolerance !== null && !(input.tolerance >= 0)) {
    throw new HarnessError('invalid_argument', 'Tolerance must be a nonnegative number')
  }
  const role = input.role ?? 'stated'
  if (!evidenceRoles.has(role)) {
    throw new HarnessError('invalid_argument', 'Evidence role must be stated or supporting')
  }
  return {
    run: input.run,
    metric: checkedMetricName(input.metric),
    split: input.split ?? null,
    select,
    step: select === 'step' ? input.step : null,
    tolerance: input.tolerance ?? null,
    format: checkedFormat(input.format),
    direction: input.direction ?? null,
    role
  }
}

async function recordedEvidence(project, input, cache) {
  const spec = checkedEvidenceSpec(input)
  const measured = await measureEvidence(project, spec, cache)
  const { selection } = measured
  const hasValue = input.value !== undefined && input.value !== null
  if (selection.error && !hasValue) {
    throw new HarnessError('missing_evidence', `${measured.run.ref}: ${selection.error}`)
  }
  if (!selection.error && hasValue && !valuesAgree(input.value, selection.value, spec.tolerance)) {
    throw new HarnessError(
      'value_mismatch',
      `${measured.run.ref} ${spec.metric} is ${selection.value}, not ${input.value}; fix the number or the evidence`
    )
  }
  return {
    run: measured.run.ref,
    metric: spec.metric,
    split: selection.error ? spec.split : selection.split,
    select: spec.select,
    step: spec.step,
    value: hasValue ? input.value : selection.value,
    tolerance: spec.tolerance,
    format: spec.format,
    ...(spec.select === 'best' ? { direction: measured.direction } : {}),
    role: spec.role,
    observedStep: selection.error ? null : selection.step,
    metricsSha256: measured.metricsSha256,
    recordedAt: new Date().toISOString()
  }
}

async function manuscriptLocation(project, input) {
  const catalog = await readCatalog(project)
  const file = input.file ?? catalog.manuscript?.source ?? null
  if (input.line !== undefined && input.line !== null) {
    if (!Number.isInteger(input.line) || input.line < 1) {
      throw new HarnessError('invalid_argument', 'Line must be a positive integer')
    }
  }
  if (!file) {
    if (input.line || input.anchor) {
      throw new HarnessError('invalid_argument', 'A line or anchor needs a manuscript --file')
    }
    return { file: null, line: null, anchor: null }
  }
  const absolute = await projectFile(project, file)
  return {
    file: projectRelative(project, absolute),
    line: input.line ?? null,
    anchor: input.anchor || null
  }
}

function nextClaimId(claims) {
  let highest = 0
  for (const claim of claims) {
    const match = /^claim-(\d+)$/u.exec(claim.id)
    highest = Math.max(highest, match ? Number(match[1]) : 0)
  }
  return `claim-${highest + 1}`
}

function claimById(ledger, id) {
  const claim = ledger?.claims.find((candidate) => candidate.id === id)
  if (!claim) {
    throw new HarnessError('claim_not_found', `Claim not found: ${id}`)
  }
  return claim
}

export async function addClaim(projectPath, input) {
  const project = await realpath(projectPath)
  const text = input.text?.trim()
  if (!text || text.length > 2000) {
    throw new HarnessError('invalid_argument', 'Claim text must contain 1–2000 characters')
  }
  const cache = metricsCache()
  const evidence = await recordedEvidence(project, input.evidence, cache)
  const manuscript = await manuscriptLocation(project, input.manuscript ?? {})
  const agent = agentIdentityFromEnvironment()
  const createdBy = input.createdBy ?? (agent ? 'agent' : 'user')
  if (!['agent', 'user'].includes(createdBy)) {
    throw new HarnessError('invalid_argument', 'Created-by must be agent or user')
  }
  const claim = await updateClaimsLedger(project, (ledger) => {
    const id = input.id ? safeIdentifier(input.id, 'Claim ID') : nextClaimId(ledger.claims)
    if (ledger.claims.some((candidate) => candidate.id === id)) {
      throw new HarnessError('already_exists', `Claim already exists: ${id}`)
    }
    const created = {
      id,
      text,
      manuscript,
      evidence: [evidence],
      createdBy,
      createdAt: new Date().toISOString(),
      ...(agent ? { agent } : {})
    }
    return { ledger: { ...ledger, claims: [...ledger.claims, created] }, value: created }
  })
  return { claim, audit: await auditClaim(project, claim, cache, new Map()) }
}

export async function addClaimEvidence(projectPath, id, input) {
  const project = await realpath(projectPath)
  claimById(await readClaimsLedger(project), id)
  const cache = metricsCache()
  const evidence = await recordedEvidence(project, input, cache)
  const claim = await updateClaimsLedger(project, (ledger) => {
    const updated = { ...claimById(ledger, id) }
    updated.evidence = [...updated.evidence, evidence]
    return {
      ledger: { ...ledger, claims: ledger.claims.map((item) => (item.id === id ? updated : item)) },
      value: updated
    }
  })
  return { claim, audit: await auditClaim(project, claim, cache, new Map()) }
}

export async function removeClaim(projectPath, id) {
  const project = await realpath(projectPath)
  claimById(await readClaimsLedger(project), id)
  const removed = await updateClaimsLedger(project, (ledger) => ({
    ledger: { ...ledger, claims: ledger.claims.filter((claim) => claim.id !== id) },
    value: claimById(ledger, id)
  }))
  return { removed }
}

/** Re-records evidence values and hashes from the current metrics: the user accepts new results. */
export async function refreshClaim(projectPath, id) {
  const project = await realpath(projectPath)
  const existing = claimById(await readClaimsLedger(project), id)
  const cache = metricsCache()
  const evidence = []
  const changes = []
  for (const item of existing.evidence) {
    const refreshed = await recordedEvidence(project, { ...item, value: undefined }, cache)
    if (!valuesAgree(item.value, refreshed.value, item.tolerance)) {
      changes.push({ run: item.run, metric: item.metric, from: item.value, to: refreshed.value })
    }
    evidence.push(refreshed)
  }
  const claim = await updateClaimsLedger(project, (ledger) => {
    const updated = { ...claimById(ledger, id), evidence, refreshedAt: new Date().toISOString() }
    return {
      ledger: { ...ledger, claims: ledger.claims.map((item) => (item.id === id ? updated : item)) },
      value: updated
    }
  })
  return { claim, changes, audit: await auditClaim(project, claim, cache, new Map()) }
}

export async function listClaims(projectPath) {
  const project = await realpath(projectPath)
  const ledger = await readClaimsLedger(project)
  return {
    path: layoutRelativePaths(project).claims,
    exists: Boolean(ledger),
    claims: ledger?.claims ?? []
  }
}

async function manuscriptText(project, file, files) {
  if (!files.has(file)) {
    files.set(
      file,
      projectFile(project, file)
        .then((absolute) => readFile(absolute, 'utf8'))
        .then((content) => {
          const raw = content.split(/\r?\n/u)
          return { raw, stripped: raw.map(stripTexComment) }
        })
        .catch(() => null)
    )
  }
  return files.get(file)
}

function manuscriptWindow(lines, location) {
  let window = { start: 0, end: lines.raw.length, scope: 'file' }
  let anchorFound = null
  if (location.anchor) {
    const index = lines.raw.findIndex((line) => line.includes(location.anchor))
    anchorFound = index !== -1
    if (anchorFound) {
      window = {
        start: Math.max(0, index - anchorWindowLines),
        end: Math.min(lines.raw.length, index + anchorWindowLines + 1),
        scope: 'anchor'
      }
    }
  }
  if (window.scope === 'file' && location.line) {
    window = {
      start: Math.max(0, location.line - 1 - lineWindowLines),
      end: Math.min(lines.raw.length, location.line + lineWindowLines),
      scope: 'line'
    }
  }
  return { window, anchorFound }
}

async function checkManuscript(project, claim, stated, files) {
  const location = claim.manuscript ?? {}
  if (!location.file) {
    return { status: 'unchecked', file: null, values: [] }
  }
  const lines = await manuscriptText(project, location.file, files)
  if (!lines) {
    return { status: 'file-missing', file: location.file, values: [] }
  }
  if (stated.length === 0) {
    return { status: 'unchecked', file: location.file, values: [] }
  }
  const { window, anchorFound } = manuscriptWindow(lines, location)
  const values = stated.map((item) => {
    for (let index = window.start; index < window.end; index += 1) {
      const token = numberTokens(lines.stripped[index]).find((candidate) =>
        tokenMatchesValue(candidate, item.value, item)
      )
      if (token) {
        return { value: item.value, found: true, line: index + 1, text: token.text }
      }
    }
    return { value: item.value, found: false, line: null, text: null }
  })
  return {
    status: values.every((item) => item.found) ? 'found' : 'not-found',
    file: location.file,
    scope: window.scope,
    anchorFound,
    values
  }
}

async function auditEvidence(project, item, cache) {
  const base = {
    run: item.run,
    metric: item.metric,
    split: item.split,
    select: item.select,
    step: item.step,
    role: item.role ?? 'stated',
    recordedValue: item.value,
    formatted: formatEvidenceValue(item.value, item.format),
    format: item.format ?? null,
    tolerance: item.tolerance ?? null
  }
  let measured
  try {
    measured = await measureEvidence(project, item, cache)
  } catch (error) {
    return { ...base, status: 'missing-evidence', currentValue: null, reason: error.message }
  }
  const { selection } = measured
  if (selection.error) {
    return {
      ...base,
      status: 'missing-evidence',
      currentValue: null,
      runState: measured.runState,
      reason: selection.error
    }
  }
  const agrees = valuesAgree(item.value, selection.value, item.tolerance)
  const stale = measured.metricsSha256 !== item.metricsSha256
  return {
    ...base,
    status: !agrees ? 'mismatch' : stale ? 'stale' : 'verified',
    currentValue: selection.value,
    runState: measured.runState,
    reason: !agrees
      ? `recorded ${item.value}, metrics now give ${selection.value}`
      : stale
        ? 'metrics file changed since the claim was recorded'
        : null
  }
}

async function auditClaim(project, claim, cache, files) {
  const evidence = []
  for (const item of claim.evidence ?? []) {
    evidence.push(await auditEvidence(project, item, cache))
  }
  const stated = evidence
    .filter((item) => item.role === 'stated')
    .map((item) => ({
      value: item.currentValue ?? item.recordedValue,
      format: item.format,
      tolerance: item.tolerance
    }))
  const manuscript = await checkManuscript(project, claim, stated, files)
  const reasons = []
  if (evidence.length === 0) {
    reasons.push('claim has no evidence')
  }
  for (const item of evidence) {
    if (item.reason) {
      reasons.push(`${item.run} ${item.metric}: ${item.reason}`)
    }
  }
  if (manuscript.status === 'not-found') {
    const missing = manuscript.values.filter((item) => !item.found).map((item) => item.value)
    reasons.push(
      `${manuscript.file} does not state ${missing.join(', ')} near the claim ${manuscript.scope}`
    )
  }
  if (manuscript.status === 'file-missing') {
    reasons.push(`manuscript file is missing: ${manuscript.file}`)
  }
  const statuses = new Set(evidence.map((item) => item.status))
  const status =
    evidence.length === 0 || statuses.has('missing-evidence')
      ? 'missing-evidence'
      : statuses.has('mismatch') || ['not-found', 'file-missing'].includes(manuscript.status)
        ? 'mismatch'
        : statuses.has('stale')
          ? 'stale'
          : 'verified'
  return { id: claim.id, text: claim.text, status, reasons, evidence, manuscript }
}

export async function auditClaims(projectPath, { id = null } = {}) {
  const project = await realpath(projectPath)
  const ledger = await readClaimsLedger(project)
  const claims = id ? [claimById(ledger, id)] : (ledger?.claims ?? [])
  const cache = metricsCache()
  const files = new Map()
  const results = []
  for (const claim of claims) {
    results.push(await auditClaim(project, claim, cache, files))
  }
  const summary = { total: results.length, verified: 0, mismatch: 0, missingEvidence: 0, stale: 0 }
  for (const result of results) {
    const key = result.status === 'missing-evidence' ? 'missingEvidence' : result.status
    summary[key] += 1
  }
  return { exists: Boolean(ledger), summary, claims: results }
}

/** Result-like numbers in the manuscript that no claim's evidence value accounts for. */
export async function scanUnbackedNumbers(projectPath, { file = null } = {}) {
  const project = await realpath(projectPath)
  const catalog = await readCatalog(project)
  const main = file ?? catalog.manuscript?.source
  if (!main) {
    throw new HarnessError('invalid_argument', 'No manuscript source; pass --file')
  }
  const mainFile = await projectFile(project, main)
  const ledger = await readClaimsLedger(project)
  const backing = (ledger?.claims ?? []).flatMap((claim) =>
    (claim.evidence ?? []).map((item) => ({ claim: claim.id, ...item }))
  )
  const scanned = []
  const numbers = []
  for (const source of await manuscriptSourceFiles(project, mainFile)) {
    const relative = projectRelative(project, source)
    scanned.push(relative)
    const lines = (await readFile(source, 'utf8')).split(/\r?\n/u).map(stripTexComment)
    for (const candidate of resultNumberCandidates(lines)) {
      const backedBy = [
        ...new Set(
          backing
            // Why: the claim's format describes its own location; the value may appear elsewhere.
            .filter((item) =>
              tokenMatchesValue(candidate.token, item.value, { tolerance: item.tolerance ?? null })
            )
            .map((item) => item.claim)
        )
      ]
      numbers.push({
        file: relative,
        line: candidate.line,
        column: candidate.column,
        text: candidate.text,
        where: candidate.where,
        context: candidate.context,
        backedBy
      })
    }
  }
  const unbacked = numbers.filter((item) => item.backedBy.length === 0)
  return {
    files: scanned,
    numbers: numbers.length,
    backed: numbers.length - unbacked.length,
    unbacked
  }
}
