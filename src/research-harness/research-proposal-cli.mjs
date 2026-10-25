import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { jsonObjectOption } from './research-cli-arguments.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  addProposal,
  decideProposal,
  handoffProposal,
  listProposals,
  markProposalLaunched
} from './research-proposals.mjs'

// Why: approval and handoff belong to the user in Aster; a shell an agent tool runs must not grant them.
function refuseAgentEnvironment(action) {
  if (agentIdentityFromEnvironment()?.provider) {
    throw new HarnessError(
      'not_allowed',
      `An agent cannot ${action} proposals; the user does that in Aster`
    )
  }
}

export const commands = {
  'proposal add': {
    spec: {
      values: ['--experiment', '--title', '--rationale', '--command', '--cwd', '--config-changes'],
      repeatable: ['--finding', '--run'],
      booleans: ['--needs-code'],
      required: ['--experiment', '--title', '--rationale', '--command']
    },
    run: ({ project, options }) =>
      addProposal(project, {
        experiment: options['--experiment'],
        title: options['--title'],
        rationale: options['--rationale'],
        command: options['--command'],
        cwd: options['--cwd'],
        configChanges: jsonObjectOption(options, '--config-changes'),
        findings: options['--finding'],
        runs: options['--run'],
        needsCode: Boolean(options['--needs-code'])
      })
  },
  'proposal list': {
    spec: { values: ['--experiment', '--state'], required: ['--experiment'] },
    run: ({ project, options }) =>
      listProposals(project, options['--experiment'], { state: options['--state'] ?? 'all' })
  },
  'proposal decide': {
    spec: {
      values: ['--id', '--decision', '--note', '--by', '--experiment'],
      required: ['--id', '--decision', '--by']
    },
    run: ({ project, options }) => {
      refuseAgentEnvironment('decide')
      return decideProposal(project, {
        id: options['--id'],
        decision: options['--decision'],
        note: options['--note'],
        by: options['--by'],
        experiment: options['--experiment']
      })
    }
  },
  'proposal handoff': {
    spec: {
      values: ['--id', '--experiment', '--session', '--by'],
      required: ['--id', '--by']
    },
    run: ({ project, options }) => {
      refuseAgentEnvironment('hand off')
      return handoffProposal(project, {
        id: options['--id'],
        experiment: options['--experiment'],
        sessionId: options['--session'] ?? null,
        by: options['--by']
      })
    }
  },
  'proposal launched': {
    spec: { values: ['--id', '--run', '--experiment'], required: ['--id', '--run'] },
    run: ({ project, options }) =>
      markProposalLaunched(project, {
        id: options['--id'],
        run: options['--run'],
        experiment: options['--experiment']
      })
  }
}

function proposalLine(proposal) {
  const parts = [proposal.id, proposal.state, proposal.at]
  if (proposal.needsCode) {
    parts.push('needs code')
  }
  if (proposal.agent?.provider) {
    parts.push(proposal.agent.provider)
  }
  if (proposal.launchedRun) {
    parts.push(`run ${proposal.launchedRun}`)
  }
  return `${parts.join(' · ')}  "${proposal.title}"`
}

function handoffTarget(handoff) {
  return handoff.sessionId ? ` to session ${handoff.sessionId}` : ' to a new Workbench chat'
}

function proposalDetail(proposal) {
  const lines = [proposalLine(proposal), `  why: ${proposal.rationale}`]
  lines.push(`  command: ${proposal.command}${proposal.cwd ? ` (in ${proposal.cwd})` : ''}`)
  if (proposal.configChanges) {
    lines.push(`  config: ${JSON.stringify(proposal.configChanges)}`)
  }
  if (proposal.findings.length) {
    lines.push(`  findings: ${proposal.findings.join(', ')}`)
  }
  if (proposal.runs.length) {
    lines.push(`  runs: ${proposal.runs.join(', ')}`)
  }
  if (proposal.decision) {
    lines.push(
      `  ${proposal.decision.decision} by ${proposal.decision.by} ${proposal.decision.at}${proposal.decision.note ? `: ${proposal.decision.note}` : ''}`
    )
  }
  if (proposal.handoff) {
    lines.push(`  handed off ${proposal.handoff.at}${handoffTarget(proposal.handoff)}`)
  }
  return lines.join('\n')
}

export const textOutput = {
  'proposal add': (result) =>
    `Proposed ${result.proposal.id} in ${result.ledger}. Wait for the user's decision before launching it.`,
  'proposal list': (result) =>
    result.proposals.length
      ? result.proposals.map(proposalDetail).join('\n')
      : `No proposals in ${result.ledger}.`,
  'proposal decide': (result) => `${result.proposal.id} ${result.proposal.state}`,
  'proposal handoff': (result) =>
    `${result.proposal.id} handed off${handoffTarget(result.proposal.handoff)}`,
  'proposal launched': (result) =>
    `${result.proposal.id} launched as ${result.proposal.launchedRun}`
}

export const usage = `
Rerun proposals (.aster/experiments/<slug>/proposals.jsonl)
  proposal add --experiment SLUG --title TEXT --rationale TEXT --command TEXT [--cwd DIR]
               [--config-changes JSON-OBJECT] [--finding ID]... [--run EXPERIMENT/RUN]...
               [--needs-code]
  proposal list --experiment SLUG [--state pending|approved|rejected|launched|all]
  proposal decide --id ID --decision approved|rejected [--note TEXT] --by user [--experiment SLUG]
  proposal handoff --id ID [--experiment SLUG] [--session ID] --by user
  proposal launched --id ID --run EXPERIMENT/RUN [--experiment SLUG]
  pending → approved | rejected, approved → launched. Only the user decides, in Aster; an agent
  launches an approved proposal with run exec, then records it with proposal launched.
  --needs-code marks a Run that needs code changes: after approval the user hands it to a
  Workbench chat (proposal handoff, from Aster), whose coding agent implements and launches it.
`
