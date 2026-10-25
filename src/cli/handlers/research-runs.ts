import type {
  ResearchRunAgentStatus,
  ResearchRunWatchCreated,
  ResearchRunWatchSummary
} from '../../shared/research/research-run-agent-status'
import { readInjectedAgentSessionId } from '../../shared/agent-session-caller-env'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRepeatedStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { writeStdoutLine } from '../stdout-line'
import { resolveBundledResearchHarnessCli } from '../bundled-research-harness'

function runTargetFlags(flags: Map<string, string | boolean>, cwd: string) {
  return {
    run: getRequiredStringFlag(flags, 'run'),
    project: getOptionalStringFlag(flags, 'project'),
    server: getOptionalStringFlag(flags, 'server'),
    cwd
  }
}

function formatWatch(watch: ResearchRunWatchSummary): string {
  const lines = [
    `${watch.id}  ${watch.run} (${watch.host})  ${watch.state}  on ${watch.conditions.join(', ')}`,
    `  wakes ${watch.owner ?? 'no agent (desktop notification only)'}${
      watch.message ? ` · note: ${watch.message}` : ''
    }`
  ]
  if (watch.lastError) {
    lines.push(`  last read failed: ${watch.lastError}`)
  }
  for (const event of watch.fired) {
    lines.push(
      `  fired ${event.implicit ? 'run ended' : event.condition} at ${event.firedAt}: ${event.evidence} [${event.delivery.state}${
        event.delivery.detail ? `: ${event.delivery.detail}` : ''
      }]`
    )
  }
  return lines.join('\n')
}

function formatCreated(created: ResearchRunWatchCreated): string {
  return [
    `Watching ${created.watch.run} (${created.watch.host}) as ${created.watch.id}: ${created.watch.conditions.join(', ')}.`,
    created.watch.owner
      ? `Aster wakes ${created.watch.owner} with the evidence when a condition fires; you can end your turn now.`
      : 'No agent will be woken; Aster sends a desktop notification when a condition fires.',
    ...created.warnings
  ].join('\n')
}

function formatValue(value: number): string {
  return String(Number(value.toPrecision(6)))
}

function formatStatus(status: ResearchRunAgentStatus): string {
  const lines = [`Run ${status.run.name} on ${status.run.host}: ${status.run.dir}`]
  lines.push(
    status.execution
      ? `Run execution: ${status.execution.state}${
          status.execution.exitCode === null ? '' : ` (exit ${status.execution.exitCode})`
        } per ${status.execution.source ?? 'run.json'} at ${status.execution.observedAt}`
      : 'Run execution: not recorded in run.json'
  )
  if (status.job) {
    lines.push(
      `${status.job.scheduler === 'slurm' ? 'SLURM job' : 'Job'} ${status.job.jobId}: ${status.job.state}${
        status.job.reason ? ` (${status.job.reason})` : ''
      }${status.job.exitCode === null ? '' : `, exit ${status.job.exitCode}`}, observed ${status.job.observedAt}${
        status.job.tracked ? '' : ' (no longer polled)'
      }`
    )
  }
  if (status.code?.commit) {
    lines.push(
      `Code: ${status.code.commit}${status.code.dirty ? ' + uncommitted changes' : ''} (${status.code.capturePhase})`
    )
  }
  const { metrics } = status
  if (metrics.last) {
    lines.push(
      `Metrics: ${metrics.rows} rows${metrics.partial ? ' in the last 512 KB' : ''}${
        metrics.malformed ? `, ${metrics.malformed} unreadable` : ''
      }; last${metrics.last.step === null ? '' : ` step ${metrics.last.step}`}`
    )
    for (const series of metrics.series) {
      const best =
        series.best === null ? '' : `, best ${formatValue(series.best)} (${series.direction})`
      lines.push(
        `  ${series.split ? `${series.split}/` : ''}${series.name}: last ${formatValue(series.last)}, min ${formatValue(series.min)}, max ${formatValue(series.max)}${best}`
      )
    }
  } else {
    lines.push('Metrics: none recorded yet')
  }
  if (status.log.lines.length) {
    lines.push(`Log tail${status.log.truncated ? ' (last lines)' : ''}:`)
    lines.push(...status.log.lines.map((line) => `  ${line}`))
  } else {
    lines.push('Log: empty')
  }
  for (const watch of status.watches) {
    lines.push(
      `Watch ${watch.id}: on ${watch.conditions.join(', ')}, wakes ${watch.owner ?? 'nobody'}`
    )
  }
  lines.push(...status.warnings.map((warning) => `Warning: ${warning}`))
  return lines.join('\n')
}

function notifyFlag(flags: Map<string, string | boolean>): 'self' | 'none' | undefined {
  const value = getOptionalStringFlag(flags, 'notify')
  if (value === undefined || value === 'self' || value === 'none') {
    return value
  }
  throw new RuntimeClientError('invalid_argument', '--notify takes self or none.')
}

export const RESEARCH_RUN_HANDLERS: Record<string, CommandHandler> = {
  'research harness-path': async ({ json }) => {
    const cli = resolveBundledResearchHarnessCli()
    if (!cli) {
      throw new RuntimeClientError(
        'invalid_environment',
        'This Aster CLI does not have a bundled research harness on this machine.'
      )
    }
    writeStdoutLine(json ? JSON.stringify({ cli }) : cli)
  },
  'research status': async ({ client, flags, json, cwd }) => {
    const result = await client.call<ResearchRunAgentStatus>(
      'researchRun.status',
      runTargetFlags(flags, cwd)
    )
    printResult(result, json, formatStatus)
  },
  'research watch': async ({ client, flags, json, cwd }) => {
    const result = await client.call<ResearchRunWatchCreated>('researchRun.watch', {
      ...runTargetFlags(flags, cwd),
      on: getRepeatedStringFlag(flags, 'on'),
      notify: notifyFlag(flags),
      message: getOptionalStringFlag(flags, 'message'),
      // The caller's own identity, as orchestration reads it; the host re-resolves it on delivery.
      owner: {
        terminalHandle: process.env.ORCA_TERMINAL_HANDLE || undefined,
        paneKey: process.env.ORCA_PANE_KEY || undefined,
        agentSessionId: readInjectedAgentSessionId()
      }
    })
    printResult(result, json, formatCreated)
  },
  'research watch list': async ({ client, flags, json }) => {
    const result = await client.call<{ watches: ResearchRunWatchSummary[] }>(
      'researchRun.watchList',
      { run: getOptionalStringFlag(flags, 'run'), all: flags.get('all') === true }
    )
    printResult(result, json, ({ watches }) =>
      watches.length ? watches.map(formatWatch).join('\n\n') : 'No watches.'
    )
  },
  'research watch cancel': async ({ client, flags, json }) => {
    const result = await client.call<{ watch: ResearchRunWatchSummary }>(
      'researchRun.watchCancel',
      { id: getRequiredStringFlag(flags, 'id') }
    )
    printResult(result, json, ({ watch }) =>
      watch.state === 'cancelled'
        ? `Cancelled ${watch.id}.`
        : `${watch.id} was already ${watch.state}.`
    )
  }
}
