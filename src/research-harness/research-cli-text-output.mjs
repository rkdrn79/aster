import { analysisContextLines } from './research-analysis-cli.mjs'
import { briefTextLines } from './research-brief-cli.mjs'

function number(value) {
  if (typeof value !== 'number') {
    return String(value)
  }
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(5)))
}

function duration(ms) {
  if (typeof ms !== 'number') {
    return null
  }
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  return minutes < 60
    ? `${minutes}m ${seconds % 60}s`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function stepText(step) {
  return step === null || step === undefined ? '' : `@${step}`
}

function metricText(metric) {
  const label = metric.split ? `${metric.split} ${metric.name}` : metric.name
  const best =
    metric.best !== null && metric.best !== undefined && metric.bestStep !== metric.lastStep
      ? ` best ${number(metric.best)}${stepText(metric.bestStep)}`
      : ''
  return `${label} last ${number(metric.last)}${stepText(metric.lastStep)}${best}`
}

function runLine(run) {
  const parts = [run.ref, run.state]
  if (run.exitCode !== null && run.exitCode !== undefined) {
    parts.push(`exit ${run.exitCode}`)
  }
  if (run.liveness && run.liveness !== 'alive') {
    parts.push(`harness ${run.liveness}`)
  }
  if (run.startedAt) {
    parts.push(run.startedAt)
  }
  const took = duration(run.durationMs)
  if (took) {
    parts.push(took)
  }
  if (run.commit) {
    parts.push(`${run.commit.slice(0, 10)}${run.dirty ? ' dirty' : ''}`)
  }
  if (run.agent?.provider) {
    parts.push(run.agent.provider)
  }
  return `${parts.join(' · ')}  "${run.name}"${run.error ? ` (error: ${run.error})` : ''}`
}

function claimsSummaryText(summary) {
  return `${summary.total} (verified ${summary.verified}, mismatch ${summary.mismatch}, missing-evidence ${summary.missingEvidence}, stale ${summary.stale})`
}

export const textOutput = {
  init: (result) =>
    [
      `Project: ${result.project}`,
      `Catalog: ${result.files.catalog}`,
      `Manuscript: ${result.files.manuscriptSource}`,
      `Bibliography: ${result.files.bibliography}`,
      `Status: ${JSON.stringify(result.status)}`
    ].join('\n'),
  migrate: (result) =>
    [
      `${result.dryRun ? 'Would move' : 'Moved'} in ${result.project}:`,
      ...result.moved.map((move) => `  ${move.from} -> ${move.to}`),
      ...result.created.map((file) => `  created ${file}`),
      ...result.rewritten.map((item) => `  rewrote ${item.count} reference(s) in ${item.file}`),
      ...(result.leftovers.length
        ? [`Left in place (not part of the layout): ${result.leftovers.join(', ')}`]
        : []),
      `Manuscript: ${result.catalog.manuscript.source}`,
      result.dryRun ? 'Nothing changed (--dry-run).' : 'Review with git status, then commit.'
    ].join('\n'),
  experiment: (result) =>
    `Experiment: ${result.slug} (${result.status})\nDirectory: ${result.paths.experiment}`,
  'new-run': (result) =>
    [
      `Run: ${result.runId}`,
      `Reference: ${result.ref}`,
      `Append metrics to: ${result.paths.metrics}`,
      `Append log to: ${result.paths.log}`,
      `Artifacts: ${result.paths.artifacts}`,
      'Aster links this catalog Run automatically when its files are readable.',
      'Execution status: unknown; no training was launched. Report the end with run finish.'
    ].join('\n'),
  validate: (result) =>
    [
      `Project: ${result.project}`,
      `Experiments: ${result.experiments}`,
      `Runs: ${result.runs}`,
      `Metric rows: ${result.metricRows}`,
      ...(result.claims ? [`Claims: ${claimsSummaryText(result.claims)}`] : []),
      `Issues: ${result.issues.length}`,
      ...result.issues.map((issue) => `- ${issue}`),
      ...(result.warnings.length ? [`Warnings: ${result.warnings.length}`] : []),
      ...result.warnings.map((warning) => `- ${warning}`)
    ].join('\n'),
  verify: (result) =>
    [
      `Evidence gate: ${result.verdict}`,
      `Scope: ${result.scope.run ?? result.scope.experiment ?? 'project'}${result.scope.paper ? ' + manuscript' : ''}`,
      `Runs: ${result.runCount} (${result.unfinished.length} unfinished or not confirmed successful)`,
      ...result.briefGaps.map(
        (item) => `Brief ${item.experiment}: missing ${item.missing.join(', ')}`
      ),
      `Open findings: ${result.findings.counts.fail} fail, ${result.findings.counts.warn} warn, ${result.findings.counts.info} info`,
      ...result.projectValidation.issues.map((issue) => `Project issue: ${issue}`),
      ...result.projectValidation.warnings.map((warning) => `Project warning: ${warning}`),
      ...result.findings.open.map(
        (finding) => `${finding.severity} ${finding.id}: ${finding.text}`
      ),
      ...result.unfinished.map(
        (item) => `Run ${item.run}: ${item.state}${item.error ? ` (${item.error})` : ''}`
      ),
      ...result.executionEvidence.map(
        (item) =>
          `Execution ${item.run}: ${item.state}, reported by ${item.reportedBy}${item.observedAt ? ` at ${item.observedAt}` : ''}`
      ),
      ...(result.paper
        ? [
            `Claims: ${claimsSummaryText(result.paper.claims.summary)}`,
            ...(result.paper.error ? [`Manuscript scan unavailable: ${result.paper.error}`] : []),
            ...(result.paper.manuscript
              ? [`Unbacked number candidates: ${result.paper.manuscript.unbacked.length}`]
              : [])
          ]
        : []),
      ...result.limitations.map((item) => `Limit: ${item}`)
    ].join('\n'),
  context: (result) => {
    const states = Object.entries(result.totals.byState)
      .map(([state, count]) => `${state} ${count}`)
      .join(', ')
    const lines = [
      `Project ${result.project}`,
      `Manuscript ${result.manuscript.source ?? '(none)'}${result.manuscript.pdf ? ` (pdf ${result.manuscript.pdfExists ? 'built' : 'missing'})` : ''}`,
      `Experiments ${result.totals.experiments} · Runs ${result.totals.runs}${states ? `: ${states}` : ''}`,
      `Claims ${result.claims ? claimsSummaryText(result.claims) : 'none recorded'}`
    ]
    for (const experiment of result.experiments) {
      lines.push(
        '',
        `Experiment ${experiment.slug} "${experiment.name}" — ${experiment.runCount} runs`
      )
      if (experiment.brief) {
        lines.push('  brief:', ...briefTextLines(experiment.brief, '    '))
      }
      if (experiment.loop) {
        const budget = experiment.loop.budget
        const used = budget
          ? ` · runs ${budget.runsUsed}/${budget.maxRuns ?? '∞'} · ${budget.hoursElapsed}h/${budget.maxHours ?? '∞'}h${budget.exhausted ? ' · BUDGET EXHAUSTED' : ''}`
          : ''
        lines.push(`  loop: ${experiment.loop.objective ?? '(no objective)'}${used}`)
        if (experiment.loop.openHypotheses.length) {
          lines.push(
            `  open hypotheses: ${experiment.loop.openHypotheses.map((item) => `${item.id} ${item.text}`).join(' | ')}`
          )
        }
      }
      lines.push(...analysisContextLines(experiment, '  '))
      if (experiment.runs.length < experiment.runCount) {
        lines.push(`  (showing the latest ${experiment.runs.length})`)
      }
      for (const run of experiment.runs) {
        lines.push(`  ${runLine(run)}`)
        if (run.metrics.length) {
          const more = run.metricsOmitted ? ` · +${run.metricsOmitted} more` : ''
          lines.push(`    ${run.metrics.map(metricText).join(' · ')}${more}`)
        }
      }
    }
    return lines.join('\n')
  },
  'run list': (result) =>
    result.runs.length ? result.runs.map(runLine).join('\n') : 'No Runs in this project.',
  'run show': (result) => {
    const lines = [runLine(result.run)]
    if (result.run.command) {
      lines.push(`command: ${result.run.command}`)
    }
    lines.push(`directory: ${result.paths.run}`)
    if (result.run.patch) {
      lines.push(`code patch: ${result.paths.run}/${result.run.patch}`)
    }
    lines.push(
      `metrics: ${result.metrics.rows} rows${result.metrics.error ? ` (${result.metrics.error})` : ''}`
    )
    for (const metric of result.metrics.series) {
      lines.push(`  ${metricText(metric)} (n=${metric.count})`)
    }
    if (result.artifacts.recorded.length) {
      lines.push('artifacts:')
      for (const artifact of result.artifacts.recorded) {
        lines.push(`  ${artifact.name} (${artifact.mode}, sha256 ${artifact.sha256.slice(0, 12)})`)
      }
    }
    if (result.logTail.length) {
      lines.push('log tail:', ...result.logTail.map((line) => `  ${line}`))
    }
    return lines.join('\n')
  },
  'run exec': (result) =>
    `[aster] ${result.ref} ${result.state}${result.exitCode !== null ? ` (exit ${result.exitCode})` : ''}${result.signal ? ` (signal ${result.signal})` : ''} after ${duration(result.durationMs)}; ${result.metricEvents} metric events${result.mediaItems ? `, ${result.mediaItems} media` : ''}; code ${result.code.commit?.slice(0, 10) ?? 'unknown'}${result.code.dirty ? ` dirty, patch ${result.code.patch ?? 'none'}` : ''}`,
  'run log-metric': (result) =>
    `Logged ${Object.keys(result.event.metrics).join(', ')} to ${result.ref}${stepText(result.event.step)}`,
  'run finish': (result) => `${result.ref} marked ${result.execution.state}`,
  'run attach-artifact': (result) =>
    `Attached ${result.artifact.name} to ${result.ref} (${result.artifact.mode}, sha256 ${result.artifact.sha256})${result.media ? `; ${result.media.kind}${result.media.label ? ` "${result.media.label}"` : ''}${result.media.step === null ? '' : ` step ${result.media.step}`}` : ''}`,
  'claim add': (result) => claimAuditText(result.audit),
  'claim add-evidence': (result) => claimAuditText(result.audit),
  'claim refresh': (result) =>
    [
      ...result.changes.map(
        (change) => `changed ${change.run} ${change.metric}: ${change.from} → ${change.to}`
      ),
      claimAuditText(result.audit)
    ].join('\n'),
  'claim remove': (result) => `Removed ${result.removed.id}`,
  'claim list': (result) =>
    result.claims.length
      ? result.claims
          .map(
            (claim) =>
              `${claim.id} "${claim.text}" ← ${claim.evidence.map((item) => `${item.run} ${item.metric}=${item.value}`).join(', ')}`
          )
          .join('\n')
      : 'No claims recorded.',
  'claim audit': (result) =>
    [...result.claims.map(claimAuditText), `Claims: ${claimsSummaryText(result.summary)}`].join(
      '\n'
    ),
  'claim scan': (result) =>
    [
      `Scanned ${result.files.join(', ')}`,
      `Result-like numbers: ${result.numbers} (backed ${result.backed}, unbacked ${result.unbacked.length})`,
      ...result.unbacked.map(
        (item) => `${item.file}:${item.line} ${item.text} (${item.where}) | ${item.context}`
      )
    ].join('\n'),
  'loop note': (result) => `Noted ${result.entry.id} in ${result.ledger}`,
  'loop show': (result) => {
    const budget = result.budget
    return [
      `Loop ${result.ledger}`,
      `objective: ${result.objective ? `${result.objective.text} ${JSON.stringify(result.objective.data ?? {})}` : '(none)'}`,
      ...(budget
        ? [
            `budget: runs ${budget.runsUsed}/${budget.maxRuns ?? '∞'} · hours ${budget.hoursElapsed}/${budget.maxHours ?? '∞'}${budget.exhausted ? ' · EXHAUSTED' : ''}`
          ]
        : []),
      `open hypotheses: ${result.openHypotheses.map((item) => item.id).join(', ') || 'none'}`,
      ...result.entries.map(
        (entry) =>
          `${entry.at} ${entry.id}${entry.run ? ` [${entry.run}]` : ''}${entry.hypothesis ? ` (re ${entry.hypothesis})` : ''}: ${entry.text}`
      )
    ].join('\n')
  }
}

function claimAuditText(audit) {
  const lines = [`${audit.id} ${audit.status}  "${audit.text}"`]
  for (const item of audit.evidence) {
    const current = item.currentValue === null ? 'unavailable' : number(item.currentValue)
    lines.push(
      `  ${item.run} ${item.split ? `${item.split} ` : ''}${item.metric} ${item.select}${item.step !== null ? ` ${item.step}` : ''} = ${current} (recorded ${number(item.recordedValue)}) ${item.status}`
    )
  }
  const manuscript = audit.manuscript
  if (manuscript.status === 'found') {
    const where = manuscript.values.map((item) => `${manuscript.file}:${item.line} "${item.text}"`)
    lines.push(`  manuscript: ${where.join(', ')}`)
  } else if (manuscript.status !== 'unchecked') {
    lines.push(`  manuscript: ${manuscript.status} (${manuscript.file})`)
  }
  for (const reason of audit.reasons) {
    lines.push(`  - ${reason}`)
  }
  return lines.join('\n')
}
