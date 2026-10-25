import { CLI_NAME } from '../../../../shared/product-brand'
import { withAsterContext } from '../../../../shared/aster-context-block'
import { fenced, referenceData, visibleRequest } from './research-agent-review-target'
import {
  DEFAULT_RESEARCH_AGENT_POLICY,
  type ResearchExperimentBrief
} from '../../../../shared/research/research-experiment-brief'
import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import type { ResearchProposal } from '../../../../shared/research/research-proposals'

export type AgentReviewSetup = {
  projectPath: string
  /** Catalog slug of the Experiment the review records into. */
  experiment: string
  /** The Experiment's display name, for what the chat shows; the slug when absent. */
  experimentName?: string
  cli: string
  trackSkill: string
  verifySkill?: string
  brief: ResearchExperimentBrief | null
  /** Why the brief could not be read; the agent then reads it itself. */
  briefError: string | null
}

export type AgentReviewTarget =
  | { kind: 'experiment' }
  | { kind: 'triage'; finding: ResearchFinding }

function policyOf(setup: AgentReviewSetup): ResearchExperimentBrief['agentPolicy'] {
  return setup.brief?.agentPolicy ?? { ...DEFAULT_RESEARCH_AGENT_POLICY }
}

function briefLines(setup: AgentReviewSetup, harness: string): string[] {
  const slug = setup.experiment
  if (setup.briefError) {
    return [
      `The Experiment brief could not be read here (${setup.briefError}). Read it first with \`${harness} brief show --experiment ${slug} --json\`; until you have, treat the agent policy as triage suggest, proposals approval.`
    ]
  }
  const brief = setup.brief
  if (!brief) {
    return [
      'No brief is recorded for this Experiment. Judge the Runs against their own metric definitions, and say in your report which question, primary metric, and baseline the brief should state.'
    ]
  }
  const metric = brief.primaryMetric
  const evaluation = brief.evaluation
  const policy = policyOf(setup)
  return [
    `Experiment brief (experiment.json in the ${slug} Experiment folder):`,
    `- Question: ${brief.question ? JSON.stringify(brief.question) : 'not set'}`,
    ...(brief.hypothesis ? [`- Hypothesis: ${JSON.stringify(brief.hypothesis)}`] : []),
    `- Primary metric: ${metric ? `${metric.name}${metric.split ? ` on ${metric.split}` : ''}, ${metric.direction}` : 'not set'}`,
    ...(evaluation
      ? [
          `- Evaluation: dataset ${evaluation.datasetId}, revision ${evaluation.datasetRevision ?? 'unrecorded'}, split ${evaluation.split ?? 'unrecorded'}, evaluator ${evaluation.evaluatorRevision ?? 'unrecorded'}`
        ]
      : []),
    `- Baseline: ${brief.baseline ?? 'not set'}`,
    ...(brief.minSeeds ? [`- Minimum seeds per configuration: ${brief.minSeeds}`] : []),
    `- Rubric: ${brief.rubric ?? 'none'}`,
    `- Agent policy: triage ${policy.triage}, proposals ${policy.proposals}`
  ]
}

function heading(setup: AgentReviewSetup, target: AgentReviewTarget): string {
  switch (target.kind) {
    case 'experiment':
      return `Review Experiment ${setup.experiment} as a whole: do its Runs answer the brief's question, and can the results be trusted?`
    case 'triage':
      return `Triage finding ${target.finding.id} of Experiment ${setup.experiment}: diagnose its cause and, if a rerun would fix it, propose one.`
  }
}

function targetRuns(target: AgentReviewTarget): string[] {
  return target.kind === 'triage' ? target.finding.runs : []
}

function readStep(setup: AgentReviewSetup, target: AgentReviewTarget, harness: string): string {
  const files =
    'its files in the Run folder that `run show` prints (.aster/experiments/<experiment>/runs/<run>/, or research/experiments/... in older projects): train.log, run.json, config.json, code.patch, metrics.jsonl, and outputs.jsonl when present'
  switch (target.kind) {
    case 'experiment':
      return `List the Runs with \`${harness} run list --experiment ${setup.experiment}\`. For every Run the question depends on, read \`${harness} run show <ref> --log-lines 200\` and ${files}.`
    case 'triage':
      return `Start from the finding's evidence (below). Read \`${harness} run show <ref> --log-lines 200\` for its Runs, the log around the cited lines, the config, and code.patch.`
  }
}

function judgeStep(target: AgentReviewTarget): string {
  return target.kind === 'triage'
    ? 'Find the root cause (configuration, data, a code change in code.patch, environment, resources) and whether a rerun would fix it.'
    : 'Look for what the rules cannot judge: leakage or results that look too good, train/val gaps or overfitting, a wrong evaluation split, a baseline run under different conditions, too few seeds for the claimed difference, and silent errors or warnings in the log.'
}

function findingStep(
  setup: AgentReviewSetup,
  target: AgentReviewTarget,
  harness: string
): string[] {
  const relates =
    target.kind === 'triage' ? ` Say in --text that it explains ${target.finding.id}.` : ''
  return [
    `Record each problem you can support with evidence:${relates}`,
    `   ${harness} quality add --experiment ${setup.experiment} --check <kind> --severity info|warn|fail --text "<the problem and why it matters>" --run <experiment>/<run> --evidence '<json>' --created-by agent`,
    '   --check is a short lowercase ID such as eval.split-leak. Give one --evidence per fact (at most 12); the harness checks each against the files, fills in metric values and log excerpts, and refuses a value that disagrees:',
    '   {"kind":"metric","run":"<ref>","metric":"<name>","split":"<split>","step":<step>}',
    '   {"kind":"log","run":"<ref>","fromLine":<n>,"toLine":<n>}',
    '   {"kind":"file","path":"<project-relative path>","line":<n>}',
    '   {"kind":"manifest","run":"<ref>","field":"<dot.path in run.json>"}',
    '   {"kind":"sample","run":"<ref>","sampleId":"<id>"}',
    '   {"kind":"claim","claim":"<claim id>"}',
    '   A suspicion you cannot back with evidence goes in your report, not in a finding.'
  ]
}

function judgeOutputsStep(
  setup: AgentReviewSetup,
  target: AgentReviewTarget,
  harness: string
): string[] {
  const rubric = setup.brief?.rubric
  if (!rubric || target.kind === 'triage') {
    return []
  }
  return [
    `Output quality: read the rubric ${rubric}. For Runs that have outputs.jsonl, judge samples against it and record each judgment:`,
    `   ${harness} rate add --experiment ${setup.experiment} --sample <sampleId> --run <ref> --verdict good|bad|unsure --rubric ${rubric} --judge-model <your exact model ID> --judge-provider <your agent, e.g. claude-code> --by agent --note "<reason>"`,
    '   For a pairwise judgment add --against <baseline ref> and use --verdict a|b|tie (a is the --run). Never re-record or overwrite a person’s ratings.'
  ]
}

function rerunStep(setup: AgentReviewSetup, harness: string): string[] {
  const slug = setup.experiment
  const propose = `   ${harness} proposal add --experiment ${slug} --title "<what changes>" --rationale "<why, citing finding IDs>" --command '${harness} run exec --experiment ${slug} --name "<what changes>" -- <command>' [--config-changes '{"<key>":"<value>"}'] --finding <finding ID> --run <ref> [--needs-code]`
  const needsCode =
    '   Add --needs-code when the rerun needs a code change: never edit code yourself; the user hands it to a Workbench chat.'
  const launched = `\`${harness} proposal launched --id <proposal ID> --run <experiment>/<new run>\``
  switch (policyOf(setup).proposals) {
    case 'off':
      return [
        'Reruns: the proposal policy is off. Do not propose or launch reruns; describe any rerun you recommend in your report.'
      ]
    case 'budgeted':
      // Why: proposal launched only accepts approved proposals, so budgeted reruns are loop notes.
      return [
        `Reruns: the proposal policy is budgeted. Within the loop budget (\`${harness} loop show --experiment ${slug} --json\`), follow the aster-research-loop skill: launch reruns with run exec and record them with loop note. If loop show reports no budget or the budget is used, propose instead and wait for approval:`,
        propose,
        needsCode,
        `   After an approval message, launch exactly the proposed command and record ${launched}.`
      ]
    case 'approval':
      return [
        'Reruns: if a rerun would settle a problem, propose it and stop there:',
        propose,
        needsCode,
        `   Do not launch it yourself. The user approves or rejects it in Aster, and a message reaches this chat. Only after an approval, launch exactly the proposed command and record ${launched}.`
      ]
  }
}

function watchStep(setup: AgentReviewSetup, target: AgentReviewTarget, harness: string): string[] {
  if (policyOf(setup).triage !== 'auto') {
    return []
  }
  const which =
    target.kind === 'experiment'
      ? `every running Run (\`${harness} run list --experiment ${setup.experiment} --state running\`)`
      : 'every target Run that is still running'
  return [
    `Triage policy is auto. Check \`${CLI_NAME} research watch --help\` first; if it exists, for ${which} set \`${CLI_NAME} research watch --run <ref> --on failed,nan,stall:30 --notify self\`, and triage the Run when the watch message arrives.`
  ]
}

function rules(harness: string, setup: AgentReviewSetup, target: AgentReviewTarget): string[] {
  const policy = policyOf(setup)
  const budgeted = policy.proposals === 'budgeted'
  const writes = [
    'quality add',
    ...(setup.brief?.rubric && target.kind !== 'triage' ? ['rate add --by agent'] : []),
    ...(policy.proposals === 'off' ? [] : ['proposal add', 'proposal launched']),
    ...(budgeted ? ['loop note'] : []),
    ...(policy.triage === 'auto' ? [`${CLI_NAME} research watch`] : [])
  ]
  return [
    'Rules:',
    `- Read only. The only commands that write are ${writes.join(', ')}, and \`${harness} quality resolve --id <id> --status resolved --note "<the Run that settled it>" --by agent\` for a finding a later Run settled.`,
    '- Never edit code, configs, the manuscript, or result files (run.json, metrics.jsonl, train.log, outputs.jsonl, project.json, claims.json).',
    '- Never mark a finding accepted or dismissed; only the user does.',
    '- Never run proposal decide; only the user approves or rejects proposals, in Aster.',
    `- Never launch training or evaluation except an approved proposal${budgeted ? ' or a rerun inside the loop budget' : ''}.`,
    '- Never invent values. Cite files and line numbers for every statement, and say so when you cannot verify something.'
  ]
}

/** The first message of a Review or Triage chat; the harness ledgers are its only outputs. */
export function buildAgentReviewPrompt(setup: AgentReviewSetup, target: AgentReviewTarget): string {
  const { request, label } = visibleRequest(setup, target)
  return withAsterContext(request, { label, body: reviewInstructions(setup, target) })
}

function reviewInstructions(setup: AgentReviewSetup, target: AgentReviewTarget): string {
  const harness = `node "${setup.cli}"`
  const runs = targetRuns(target)
  const steps = [
    [
      `Read \`${harness} context --experiment ${setup.experiment}\`, \`${harness} verify --experiment ${setup.experiment} --json\`, \`${harness} check --experiment ${setup.experiment} --json\`, and \`${harness} quality list --experiment ${setup.experiment} --json\`. Treat checks_clear as automated checks only, not scientific proof. Rule findings are computed by check; do not re-record them, and do not duplicate recorded findings.`
    ],
    [readStep(setup, target, harness)],
    [judgeStep(target)],
    findingStep(setup, target, harness),
    judgeOutputsStep(setup, target, harness),
    rerunStep(setup, harness),
    watchStep(setup, target, harness),
    [
      'End with a short report: each finding and proposal ID you recorded, what it rests on, and what you could not verify.'
    ]
  ].filter((step) => step.length > 0)
  return [
    heading(setup, target),
    `Project: ${JSON.stringify(setup.projectPath)}`,
    ...(runs.length ? [`Target Runs: ${runs.join(', ')}`] : []),
    `Harness CLI: \`${harness}\` (add --json when you parse output; \`${harness} --help\` lists every command).`,
    `Follow the aster-research-track skill; if it is not installed, read ${JSON.stringify(setup.trackSkill)} first.`,
    `Follow the aster-research-verify skill for the evidence gate; if it is not installed, read ${JSON.stringify(setup.verifySkill ?? setup.trackSkill)} first.`,
    '',
    ...briefLines(setup, harness),
    '',
    'Steps:',
    ...steps.flatMap(([first, ...rest], index) => [`${index + 1}. ${first}`, ...rest]),
    '',
    ...rules(harness, setup, target),
    ...referenceData(target)
  ].join('\n')
}

/** What the proposing agent is told after the user decides. */
export function buildProposalDecisionMessage(input: {
  proposal: Pick<ResearchProposal, 'id' | 'experiment' | 'title' | 'command' | 'cwd'> & {
    needsCode?: boolean
  }
  decision: 'approved' | 'rejected'
  note: string | null
  cli: string
}): string {
  const { proposal } = input
  const about = `${proposal.id} in Experiment ${proposal.experiment}: ${JSON.stringify(proposal.title)}`
  const note = input.note?.trim()
  if (input.decision === 'rejected') {
    return [
      `[Aster] The user rejected proposal ${about}. Do not launch it.`,
      note ? `Reason: ${JSON.stringify(note)}` : 'No reason was given.',
      'If a rerun is still needed, record a new proposal that addresses the reason and wait again.'
    ].join('\n')
  }
  if (proposal.needsCode) {
    return [
      `[Aster] The user approved proposal ${about}.`,
      ...(note ? [`Note from the user: ${JSON.stringify(note)}`] : []),
      'It needs a code change, so the user hands it to a Workbench chat that implements it, launches it with run exec, and records proposal launched. Do not launch it or edit code yourself.'
    ].join('\n')
  }
  return [
    `[Aster] The user approved proposal ${about}.`,
    ...(note ? [`Note from the user: ${JSON.stringify(note)}`] : []),
    `Launch it now with run exec, exactly as proposed${proposal.cwd ? ` (working directory: ${proposal.cwd === '.' ? 'the project root' : proposal.cwd})` : ''}:`,
    ...fenced(proposal.command),
    `Then record the launch: node "${input.cli}" proposal launched --experiment ${proposal.experiment} --id ${proposal.id} --run <experiment>/<new run>`,
    'Report the new Run reference when it starts.'
  ].join('\n')
}
