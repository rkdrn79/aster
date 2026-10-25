import { createReadStream } from 'node:fs'
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { readCatalog, scanCatalogExperiments } from './research-catalog.mjs'
import { auditClaims } from './research-claims.mjs'
import {
  experimentPaths,
  experimentRelativePath,
  layoutRelativePaths,
  LEGACY_RESEARCH_DIRECTORY,
  researchPaths,
  runPaths,
  runRelativePath,
  safeExperimentSlug
} from './research-layout.mjs'

async function regularFile(target, issues) {
  try {
    const entry = await lstat(target)
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error('not a regular file')
    }
    return entry
  } catch (error) {
    issues.push(`${target}: ${error.message}`)
    return null
  }
}

async function realDirectory(target, issues) {
  try {
    const entry = await lstat(target)
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error('not a real directory')
    }
    return true
  } catch (error) {
    issues.push(`${target}: ${error.message}`)
    return false
  }
}

async function validateIfPresent(target, issues, validate) {
  try {
    await lstat(target)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      issues.push(`${target}: ${error.message}`)
    }
    return
  }
  await validate(target, issues)
}

async function validateMetrics(target, expectedRunId, issues) {
  const details = await regularFile(target, issues)
  if (!details) {
    return 0
  }
  if (details.size > 50 * 1024 * 1024) {
    issues.push(`${target}: larger than the 50 MiB validation limit; inspect separately`)
    return 0
  }
  let rows = 0
  const source = readline.createInterface({
    input: createReadStream(target, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  try {
    for await (const line of source) {
      if (!line.trim()) {
        continue
      }
      rows += 1
      if (line.length > 1024 * 1024) {
        issues.push(`${target}:${rows}: record exceeds 1 MiB`)
        continue
      }
      try {
        const event = JSON.parse(line)
        if (
          event.schemaVersion !== 1 ||
          event.runId !== expectedRunId ||
          !event.metrics ||
          typeof event.metrics !== 'object' ||
          Array.isArray(event.metrics)
        ) {
          throw new Error('expected schemaVersion 1, matching runId, and metrics object')
        }
        if (
          Object.values(event.metrics).some(
            (value) => value !== null && (typeof value !== 'number' || !Number.isFinite(value))
          )
        ) {
          throw new Error('metric values must be finite numbers or null')
        }
      } catch (error) {
        issues.push(`${target}:${rows}: ${error.message}`)
      }
      if (issues.length >= 100) {
        break
      }
    }
  } finally {
    source.close()
  }
  return rows
}

async function validateRun(project, slug, entry, issues, optionalLocalOutputs) {
  let paths
  try {
    paths = runPaths(project, slug, entry.id)
  } catch (error) {
    issues.push(`Run ${entry.id}: ${error.message}`)
    return { rows: 0 }
  }
  const prefix = runRelativePath(project, slug, entry.id)
  if (
    entry.manifest !== `${prefix}/run.json` ||
    entry.metrics !== `${prefix}/metrics.jsonl` ||
    entry.log !== `${prefix}/train.log` ||
    (entry.config !== null && entry.config !== `${prefix}/config.json`)
  ) {
    issues.push(`Run ${entry.id}: catalog paths do not match the canonical layout`)
  }
  if (!(await realDirectory(paths.run, issues))) {
    return { rows: 0 }
  }
  await (optionalLocalOutputs
    ? validateIfPresent(paths.artifacts, issues, realDirectory)
    : realDirectory(paths.artifacts, issues))
  const manifestFile = await regularFile(paths.manifest, issues)
  if (manifestFile) {
    try {
      const manifest = JSON.parse(await readFile(paths.manifest, 'utf8'))
      if (
        manifest.schemaVersion !== 1 ||
        manifest.externalRunId !== entry.id ||
        manifest.metrics?.path !== 'metrics.jsonl'
      ) {
        issues.push(`${paths.manifest}: run ID or metrics path differs from the catalog`)
      }
      if (manifest.name !== entry.name || manifest.artifacts?.log !== 'train.log') {
        issues.push(`${paths.manifest}: name or log path differs from the catalog`)
      }
    } catch (error) {
      issues.push(`${paths.manifest}: ${error.message}`)
    }
  }
  const rows = await validateMetrics(paths.metrics, entry.id, issues)
  await (optionalLocalOutputs
    ? validateIfPresent(paths.log, issues, regularFile)
    : regularFile(paths.log, issues))
  if (entry.config !== null) {
    if (await regularFile(paths.config, issues)) {
      try {
        JSON.parse(await readFile(paths.config, 'utf8'))
      } catch (error) {
        issues.push(`${paths.config}: invalid JSON: ${error.message}`)
      }
    }
  }
  return { rows }
}

export async function validateResearchProject(projectPath) {
  const project = await realpath(projectPath)
  if (!(await stat(project)).isDirectory()) {
    throw new Error('Project is not a directory')
  }
  const issues = []
  const warnings = []
  const layout = layoutRelativePaths(project)
  const paths = researchPaths(project)
  await realDirectory(paths.root, issues)
  await realDirectory(paths.experiments, issues)
  let catalog
  try {
    catalog = await readCatalog(project)
  } catch (error) {
    return {
      project,
      experiments: 0,
      runs: 0,
      metricRows: 0,
      issues: [...issues, `${layout.catalog}: ${error.message}`],
      warnings,
      claims: null
    }
  }
  // Why the catalog's paths: the user may point the manuscript and bibliography at existing files.
  const projectFile = (relative) => path.join(project, ...relative.split('/'))
  // Why if present: a project may have Experiments before anyone creates its manuscript.
  for (const file of [
    catalog.manuscript?.source ?? layout.manuscriptSource,
    catalog.references?.bibliography ?? layout.bibliography
  ]) {
    await validateIfPresent(projectFile(file), issues, regularFile)
  }
  await realDirectory(projectFile(catalog.references?.papers ?? layout.papers), issues)
  if (
    layout.kind === 'aster' &&
    (await lstat(path.join(project, LEGACY_RESEARCH_DIRECTORY, 'project.json')).catch(() => null))
  ) {
    warnings.push(
      `${LEGACY_RESEARCH_DIRECTORY}/project.json is a pre-ADR-004 catalog that .aster/ now replaces; remove it after checking nothing is left behind`
    )
  }
  let runs = 0
  let metricRows = 0
  const slugs = new Set()
  for (const entry of catalog.experiments) {
    try {
      safeExperimentSlug(entry.slug)
    } catch (error) {
      issues.push(`Experiment ${entry.slug}: ${error.message}`)
      continue
    }
    const expected = experimentPaths(project, entry.slug)
    if (slugs.has(entry.slug)) {
      issues.push(`Duplicate Experiment slug: ${entry.slug}`)
    }
    slugs.add(entry.slug)
    if (entry.path !== experimentRelativePath(project, entry.slug)) {
      issues.push(`Experiment ${entry.slug}: catalog path differs from canonical layout`)
    }
    if (!(await realDirectory(expected.experiment, issues))) {
      continue
    }
    if (!(await realDirectory(expected.runs, issues))) {
      continue
    }
    const analysis = path.join(expected.experiment, 'analysis')
    await (layout.kind === 'aster'
      ? validateIfPresent(analysis, issues, realDirectory)
      : realDirectory(analysis, issues))
    const metadataPath = path.join(expected.experiment, 'experiment.json')
    if (await regularFile(metadataPath, issues)) {
      try {
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
        if (metadata.slug !== entry.slug || metadata.name !== entry.name) {
          issues.push(`Experiment ${entry.slug}: metadata differs from catalog`)
        }
      } catch (error) {
        issues.push(`Experiment ${entry.slug}: ${error.message}`)
      }
    }
    const indexedRuns = new Set()
    for (const run of entry.runs ?? []) {
      if (indexedRuns.has(run.id)) {
        issues.push(`Experiment ${entry.slug}: duplicate Run ${run.id}`)
      }
      indexedRuns.add(run.id)
      const result = await validateRun(project, entry.slug, run, issues, layout.kind === 'aster')
      runs += 1
      metricRows += result.rows
    }
    if (layout.kind === 'legacy') {
      for (const item of await readdir(expected.runs, { withFileTypes: true })) {
        if (!indexedRuns.has(item.name)) {
          issues.push(`Unindexed Run directory: ${path.join(expected.runs, item.name)}`)
        }
      }
    }
  }
  if (layout.kind === 'legacy') {
    for (const item of await readdir(paths.experiments, { withFileTypes: true })) {
      if (!slugs.has(item.name)) {
        issues.push(`Unindexed Experiment directory: ${path.join(paths.experiments, item.name)}`)
      }
    }
  } else {
    // Why: .aster lists what its folders hold, so a folder it cannot read is the only gap.
    for (const item of (await scanCatalogExperiments(project)).skipped) {
      issues.push(`${item.path}: ${item.reason}`)
    }
  }
  const claims = await validateClaims(project, issues, warnings)
  return {
    project,
    experiments: catalog.experiments.length,
    runs,
    metricRows,
    issues,
    warnings,
    claims
  }
}

async function validateClaims(project, issues, warnings) {
  let audit
  try {
    audit = await auditClaims(project)
  } catch (error) {
    issues.push(`${layoutRelativePaths(project).claims}: ${error.message}`)
    return null
  }
  if (!audit.exists) {
    return null
  }
  for (const claim of audit.claims) {
    const detail = claim.reasons.join('; ')
    if (claim.status === 'mismatch' || claim.status === 'missing-evidence') {
      issues.push(`Claim ${claim.id} ${claim.status}: ${detail}`)
    } else if (claim.status === 'stale') {
      warnings.push(`Claim ${claim.id} stale: ${detail}`)
    }
  }
  return audit.summary
}
