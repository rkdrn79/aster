import { auditClaims, scanUnbackedNumbers } from './research-claims.mjs'
import { readCatalog } from './research-catalog.mjs'
import { readExperimentBrief } from './research-experiment-brief.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { experimentSlug, runPaths } from './research-layout.mjs'
import { listFindings } from './research-quality-ledger.mjs'
import { listRuns } from './research-project-context.mjs'
import { readRunManifest, resolveRunReference } from './research-run-manifest.mjs'
import { validateResearchProject } from './research-validation.mjs'

/** A read-only evidence gate. Clear checks never imply a scientifically valid result. */
export async function verifyResearch(
  project,
  { experiment = null, run = null, paper = false } = {}
) {
  const catalog = await readCatalog(project)
  const selectedExperiment = experiment ? experimentSlug(experiment) : null
  if (selectedExperiment && !catalog.experiments.some((item) => item.slug === selectedExperiment)) {
    throw new HarnessError(
      'experiment_not_found',
      `Experiment ${selectedExperiment} is not in the catalog`
    )
  }
  const target = run
    ? await resolveRunReference(
        project,
        selectedExperiment && !run.includes('/')
          ? [String(selectedExperiment), String(run)].join('/')
          : run
      )
    : null
  if (target && selectedExperiment && target.experiment !== selectedExperiment) {
    throw new HarnessError('invalid_argument', 'The Run belongs to a different Experiment')
  }
  const scope = {
    experiment: selectedExperiment ?? target?.experiment ?? null,
    run: target?.ref ?? null,
    paper
  }
  const [validation, recordedRuns, quality] = await Promise.all([
    validateResearchProject(project),
    listRuns(project, { experiment: scope.experiment }),
    listFindings(project, { experiment: scope.experiment, status: 'all' })
  ])
  const runs = scope.run
    ? recordedRuns.runs.filter((item) => item.ref === scope.run)
    : recordedRuns.runs
  const executionEvidence = await Promise.all(
    runs.map(async (item) => {
      const manifest = await readRunManifest(runPaths(project, item.experiment, item.id)).catch(
        () => null
      )
      return {
        run: item.ref,
        state: item.state,
        reportedBy: manifest?.execution?.reportedBy ?? 'unavailable',
        observedAt: item.observedAt
      }
    })
  )
  // An empty Experiment still needs its brief checked before its first Run.
  const activeExperiments = [
    ...new Set([scope.experiment, ...runs.map((item) => item.experiment)].filter(Boolean))
  ]
  const briefGaps = await Promise.all(
    activeExperiments.map(async (slug) => {
      const brief = await readExperimentBrief(project, slug).catch(() => null)
      return {
        experiment: slug,
        missing: brief
          ? [
              ...(!brief.question ? ['question'] : []),
              ...(!brief.primaryMetric ? ['primaryMetric'] : [])
            ]
          : ['readable brief']
      }
    })
  )
  const findings = scope.run
    ? quality.findings.filter(
        (item) =>
          item.runs.includes(scope.run) ||
          (item.experiment === scope.experiment && item.runs.length === 0)
      )
    : quality.findings
  const openFindings = findings.filter((item) => item.status === 'open')
  const counts = {
    fail: openFindings.filter((item) => item.severity === 'fail').length,
    warn: openFindings.filter((item) => item.severity === 'warn').length,
    info: openFindings.filter((item) => item.severity === 'info').length,
    closed: findings.length - openFindings.length
  }
  const unfinished = runs
    .filter((item) => item.state !== 'succeeded')
    .map((item) => ({
      run: item.ref,
      state: item.state,
      error: item.error ?? null
    }))
  const claims = paper ? await auditClaims(project) : null
  let manuscript = null
  let manuscriptError = null
  if (paper) {
    try {
      manuscript = await scanUnbackedNumbers(project)
    } catch (error) {
      manuscriptError = error.message
    }
  }
  const blocked =
    validation.issues.length > 0 ||
    counts.fail > 0 ||
    Boolean(claims && claims.summary.mismatch + claims.summary.missingEvidence > 0) ||
    Boolean(manuscriptError)
  const needsReview =
    validation.warnings.length > 0 ||
    counts.warn + counts.info > 0 ||
    briefGaps.some((item) => item.missing.length > 0) ||
    findings.some(
      (item) => ['accepted', 'dismissed'].includes(item.status) && item.severity !== 'info'
    ) ||
    unfinished.length > 0 ||
    executionEvidence.some((item) => item.reportedBy === 'user') ||
    Boolean(claims?.summary.stale) ||
    Boolean(manuscript?.unbacked.length)
  const verdict = blocked
    ? 'blocked'
    : runs.length === 0
      ? 'insufficient_evidence'
      : needsReview
        ? 'needs_review'
        : 'checks_clear'
  return {
    checkedAt: new Date().toISOString(),
    scope,
    verdict,
    runCount: runs.length,
    briefGaps: briefGaps.filter((item) => item.missing.length > 0),
    unfinished,
    executionEvidence,
    projectValidation: { issues: validation.issues, warnings: validation.warnings },
    findings: {
      counts,
      open: openFindings,
      closed: findings.filter((item) => item.status !== 'open')
    },
    ...(paper ? { paper: { claims, manuscript, error: manuscriptError } } : {}),
    limitations: [
      'This gate checks recorded files and findings; it does not establish scientific correctness or causal claims.',
      'Finding acceptance or dismissal is a user decision, not independent validation.',
      ...(scope.experiment || scope.run
        ? ['Project validation and paper checks still cover the whole project.']
        : []),
      ...(paper
        ? ['Unbacked-number scanning is heuristic; inspect every candidate in context.']
        : [])
    ]
  }
}
