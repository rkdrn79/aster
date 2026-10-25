import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { addFinding, listFindings, setFindingStatus } from './research-quality-ledger.mjs'

function evidenceOptions(values = []) {
  return values.flatMap((value) => {
    let parsed
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new HarnessError('invalid_argument', `--evidence must be a JSON object: ${value}`)
    }
    return Array.isArray(parsed) ? parsed : [parsed]
  })
}

// Why: accepting and dismissing are the user's decisions, so an agent shell cannot speak as them.
function actorOption(options, key) {
  const value = options[key]
  const identity = agentIdentityFromEnvironment()
  if (value === 'user' && (identity?.provider || identity?.sessionId)) {
    throw new HarnessError(
      'forbidden',
      `${key} user is refused inside an agent session; the user records this in Aster`
    )
  }
  return value
}

function valueText(value) {
  return typeof value === 'number' && !Number.isInteger(value)
    ? String(Number(value.toPrecision(6)))
    : JSON.stringify(value)
}

function evidenceText(item) {
  switch (item.kind) {
    case 'metric':
      return `metric ${item.run} ${item.split ? `${item.split} ` : ''}${item.metric}=${valueText(item.value)}${item.step === null ? '' : `@${item.step}`}`
    case 'log':
      return `log ${item.run} lines ${item.fromLine}–${item.toLine}`
    case 'file':
      return `file ${item.path}${item.line ? `:${item.line}` : ''}`
    case 'manifest':
      return `run.json ${item.run} ${item.field}=${valueText(item.value)}`
    case 'sample':
      return `sample ${item.run} ${item.sampleId}`
    case 'claim':
      return `claim ${item.claim}`
    default:
      return JSON.stringify(item)
  }
}

function findingText(finding) {
  const status =
    finding.status === 'open'
      ? 'open'
      : `${finding.status} by ${finding.statusBy ?? 'unknown'}${finding.statusNote ? ` — ${finding.statusNote}` : ''}`
  return [
    `${finding.id} · ${finding.severity} · ${finding.check} · ${finding.source} · ${status}`,
    `  ${finding.text}`,
    ...(finding.runs.length ? [`  runs: ${finding.runs.join(', ')}`] : []),
    ...(finding.samples.length ? [`  samples: ${finding.samples.join(', ')}`] : []),
    ...finding.evidence.map((item) => `  evidence: ${evidenceText(item)}`)
  ].join('\n')
}

function countsText(findings) {
  const counts = { fail: 0, warn: 0, info: 0 }
  for (const finding of findings) {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1
  }
  return `Findings: ${findings.length} (fail ${counts.fail}, warn ${counts.warn}, info ${counts.info})`
}

export const commands = {
  'quality add': {
    spec: {
      values: ['--experiment', '--check', '--severity', '--text', '--layer', '--created-by'],
      repeatable: ['--run', '--sample', '--evidence'],
      required: ['--experiment', '--check', '--severity', '--text']
    },
    run: ({ project, options }) =>
      addFinding(project, {
        experiment: options['--experiment'],
        check: options['--check'],
        severity: options['--severity'],
        text: options['--text'],
        layer: options['--layer'],
        runs: options['--run'] ?? [],
        samples: options['--sample'] ?? [],
        evidence: evidenceOptions(options['--evidence']),
        createdBy: actorOption(options, '--created-by')
      })
  },
  'quality list': {
    spec: {
      values: ['--experiment', '--run', '--status'],
      booleans: ['--include-rules', '--no-rules']
    },
    run: ({ project, options }) => {
      if (options['--include-rules'] && options['--no-rules']) {
        throw new HarnessError('usage', 'Use --include-rules or --no-rules, not both')
      }
      return listFindings(project, {
        experiment: options['--experiment'] ?? null,
        run: options['--run'] ?? null,
        status: options['--status'] ?? 'open',
        includeRules: !options['--no-rules']
      })
    }
  },
  'quality resolve': {
    spec: {
      values: ['--id', '--status', '--note', '--by', '--experiment'],
      required: ['--id', '--status']
    },
    run: ({ project, options }) =>
      setFindingStatus(project, {
        id: options['--id'],
        status: options['--status'],
        note: options['--note'] ?? null,
        by: actorOption(options, '--by'),
        experiment: options['--experiment'] ?? null
      })
  }
}

export const textOutput = {
  'quality add': (result) =>
    `Recorded ${result.finding.id} in ${result.ledger}\n${findingText(result.finding)}`,
  'quality list': (result) =>
    result.findings.length
      ? [countsText(result.findings), ...result.findings.map(findingText)].join('\n')
      : 'No findings match.',
  'quality resolve': (result) =>
    `${result.id} → ${result.status} by ${result.entry.by}${result.entry.note ? ` (${result.entry.note})` : ''}`
}

export const usage = `
Quality findings (.aster/experiments/<slug>/quality.jsonl)
  quality add --experiment SLUG --check KIND --severity info|warn|fail --text TEXT
              [--layer integrity|output] [--run EXPERIMENT/RUN]... [--sample ID]...
              [--evidence JSON]... [--created-by agent|user]
                                         Record a finding. An agent finding needs evidence; the harness
                                         checks each item against the Run's files and fills in metric
                                         and run.json values and log excerpts (a differing value is refused).
                                         --created-by and --by default to agent in an agent session,
                                         where user is refused
  evidence JSON: {"kind":"metric","run":R,"metric":M,"split":S,"step":N}
                 {"kind":"log","run":R,"fromLine":N,"toLine":N}   (at most 40 lines of train.log)
                 {"kind":"file","path":PROJECT-PATH,"line":N}
                 {"kind":"manifest","run":R,"field":"execution.exitCode"}
                 {"kind":"sample","run":R,"sampleId":ID}   {"kind":"claim","claim":ID}
  quality list [--experiment SLUG] [--run EXPERIMENT/RUN]
               [--status open|accepted|dismissed|resolved|all] [--include-rules|--no-rules]
                                         Rule check findings plus recorded ones; default open, with rules
  quality resolve --id ID --status open|accepted|dismissed|resolved [--note TEXT] [--by user|agent]
                  [--experiment SLUG]
                                         Agents may only mark their findings resolved, with a note naming
                                         the re-run; the user accepts, dismisses, and reopens in Aster
`
