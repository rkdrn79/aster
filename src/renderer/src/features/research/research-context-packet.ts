import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import {
  compareRecordedConditions,
  launchCodeEvidence,
  type ResearchRunManifest
} from '../../../../shared/research/research-run-manifest'
import { changedConfigKeys } from './research-config-comparison'
import { observedMetricValue } from './research-metric-summary'
import type { RunObservation } from './research-source-reader'

export type ComparedRun = {
  run: ResearchRunRecord
  observation: RunObservation | null
  manifest: ResearchRunManifest | null
  manifestError: string | null
  config: Record<string, string> | null
  error: string | null
}

const SENSITIVE_KEY = /secret|token|password|api[_-]?key|credential/i
const SENSITIVE_VALUE =
  /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{16}|Bearer\s+[A-Za-z0-9._~+/-]{12,})\b/gi

function packetField(value: string, limit = 4000): string {
  const singleLine = value.replace(/[\r\n\u2028\u2029]/g, ' ').replace(SENSITIVE_VALUE, '[masked]')
  return singleLine.length > limit ? `${singleLine.slice(0, limit)}… [truncated]` : singleLine
}

export function contextPacket(entries: ComparedRun[], baselineId: string | null): string {
  const lines = [
    '# Run comparison context',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Baseline Run ID: ${baselineId ?? 'unknown'}`,
    'These are observed values. A single Run comparison does not establish a winner.',
    ''
  ]
  for (const { run, observation, manifest, manifestError, error } of entries) {
    lines.push(
      `## Run ${run.id}`,
      `Name: ${packetField(run.name)}`,
      `Run ID: ${run.id}`,
      `Host: ${packetField(run.hostId)}`,
      `Workspace: ${packetField(run.workspacePath)}`,
      `Metric source: ${packetField(run.sourcePath)}`,
      `Manifest source: ${packetField(run.manifestPath ?? 'none')}${manifestError ? ` (unavailable: ${packetField(manifestError)})` : ''}`,
      `Execution at attach: ${run.execution} (${run.reportedBy}; reported ${run.observedAt ?? 'unknown'})`,
      `Latest manifest execution: ${manifest?.execution?.state ?? 'unavailable'} (reported ${manifest?.execution?.observedAt ?? 'unknown'})`,
      `Metric read: ${observation?.observedAt ?? 'unavailable'}`,
      `Code at launch: ${launchCodeEvidence(manifest)}`
    )
    if (observation) {
      const groups = [
        ...new Set(observation.events.map((event) => `${event.metric}\u0000${event.split}`))
      ]
      for (const group of groups) {
        const [metric, split] = group.split('\u0000')
        const values = observation.events.filter(
          (event) => event.metric === metric && event.split === split
        )
        const last = values.at(-1)
        const direction = manifest?.metrics?.definitions?.[metric]?.direction
        const best = observedMetricValue(values, 'best', direction)
        lines.push(
          `- ${packetField(metric, 200)} / ${packetField(split, 200)}: Last observed ${last?.value ?? 'missing'} at ${last?.x ?? 'unknown'} ${packetField(observation.xLabel, 200)}; Best observed ${best ?? (direction ? 'missing' : 'direction unknown')}${manifest?.metrics?.definitions?.[metric]?.unit ? ` (${packetField(manifest.metrics.definitions[metric].unit, 200)})` : ''}`
        )
      }
      if (observation.errorRows) {
        lines.push(`- Parse issues: ${observation.errorRows}`)
      }
      if (observation.incompleteLastLine) {
        lines.push('- Source has an incomplete final line')
      }
    } else {
      lines.push(`- Metrics unavailable: ${packetField(error ?? 'not observed')}`)
    }
    lines.push('')
  }
  const groups = [
    ...new Set(
      entries.flatMap(
        ({ observation }) =>
          observation?.events.map((event) => `${event.metric}\u0000${event.split}`) ?? []
      )
    )
  ]
  if (groups.length) {
    lines.push('## Recorded comparison conditions', '')
    for (const group of groups) {
      const [metric, split] = group.split('\u0000')
      const relevant = entries.filter(({ observation }) =>
        observation?.events.some((event) => event.metric === metric && event.split === split)
      )
      const result = compareRecordedConditions(
        relevant.map(({ manifest }) => manifest),
        metric
      )
      const condition =
        relevant.length < entries.length && result.condition === 'recorded-match'
          ? 'unknown'
          : result.condition
      lines.push(
        `- ${packetField(metric, 200)} / ${packetField(split, 200)}: ${condition}; ${result.reasons.join(', ') || 'recorded fields only'}${relevant.length < entries.length ? '; missing in some Runs' : ''}`
      )
    }
    lines.push('')
  }
  const changed = changedConfigKeys(entries.map((entry) => entry.config))
  if (changed.length) {
    lines.push('## Config differences', '')
    for (const key of changed.slice(0, 20)) {
      const sensitive = SENSITIVE_KEY.test(key)
      lines.push(
        `- ${packetField(key, 200)}: ${entries.map((entry) => `${packetField(entry.run.name, 120)}=${sensitive ? '[masked]' : packetField(entry.config?.[key] ?? 'missing', 200)}`).join('; ')}`
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}
