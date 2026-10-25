import { splitAsterContext, withAsterContext } from '../../../../shared/aster-context-block'
import type { AgentReviewSetup } from './research-agent-review-prompt'

function cliCommand(setup: AgentReviewSetup): string {
  return `node ${JSON.stringify(setup.cli)}`
}

/** One line that lets a short request stand on its own in an existing chat. */
function contextLine(setup: AgentReviewSetup): string {
  return `(Experiment ${setup.experiment} in ${JSON.stringify(setup.projectPath)}; harness: ${cliCommand(setup)} … --project ${JSON.stringify(setup.projectPath)} --json)`
}

export function analysisAddCommand(setup: AgentReviewSetup): string {
  const slug = setup.experiment
  return `analysis add --experiment ${slug} --title "<title>" --file <record-root>/experiments/${slug}/analysis/<file> --summary "<one-paragraph takeaway>" --run ${slug}/<run>`
}

export function proposalAddCommand(setup: AgentReviewSetup): string {
  const slug = setup.experiment
  return `proposal add --experiment ${slug} --title "<what changes>" --rationale "<why>" --command '${cliCommand(setup)} run exec --experiment ${slug} --name "<what changes>" -- <command>' [--config-changes '{"<key>":"<value>"}'] [--needs-code]`
}

function experimentName(setup: AgentReviewSetup): string {
  return setup.experimentName ?? setup.experiment
}

/** A short request the chat shows, with the harness context it needs folded under it. */
export function experimentRequest(
  setup: AgentReviewSetup,
  request: string,
  detail: string,
  instructions: string
): string {
  return withAsterContext(request, {
    label: `${experimentName(setup)} · ${detail}`,
    body: `${contextLine(setup)}\n${instructions}`
  })
}

/**
 * The first message of a new Experiment chat: the request it was started for (or a status), with
 * its role (ADR-003) and tools folded into one context block with the request's own context.
 */
export function experimentChatIntro(
  setup: AgentReviewSetup,
  name: string,
  firstRequest?: string
): string {
  const cli = cliCommand(setup)
  const slug = setup.experiment
  const project = `--project ${JSON.stringify(setup.projectPath)}`
  const split = firstRequest ? splitAsterContext(firstRequest) : null
  const role = [
    `You are the experiment agent for the Aster Experiment ${JSON.stringify(name)} (catalog slug ${slug}) in the project ${JSON.stringify(setup.projectPath)}. You design this experiment and analyze its results with me. Code changes happen in Workbench chats, not here.`,
    `Use the research harness: ${cli} <command> ${project} --json, following the aster-research-track skill (${setup.trackSkill}).`,
    'How you work here:',
    `- Propose every new Run with \`${proposalAddCommand(setup)}\`. Add --needs-code when the code must change; I approve it and hand it to a Workbench chat, which implements and launches it.`,
    `- After I approve a config-only Run, launch exactly its run exec command and record \`proposal launched --experiment ${slug} --id <id> --run ${slug}/<new run>\`. When the brief's proposals policy is budgeted, follow the aster-research-loop skill within the budget.`,
    `- Record each analysis you make: use the catalog path returned by context to find <record-root> (.aster/ or legacy research/), save the figure, table, or note under <record-root>/experiments/${slug}/analysis/, then \`${analysisAddCommand(setup)}\`.`,
    '- Record evidence-backed problems with `quality add`.',
    "- Never edit code, configs, the manuscript, or result files here. Never approve or reject proposals, accept or dismiss findings, or write the brief's conclusion; I do. Answer from files you read and cite them.",
    `Start by reading \`context --experiment ${slug}\`, \`brief show --experiment ${slug}\`, \`proposal list --experiment ${slug}\`, \`analysis list --experiment ${slug}\`, and \`quality list --experiment ${slug}\`.`,
    firstRequest
      ? 'Then do the request at the top of this message.'
      : 'Then reply with a short status: what ran, the best result against the baseline with the number of seeds, and what needs my decision. Keep it under eight lines and wait for my questions.',
    ...(split?.contexts.length ? ['', 'Context for that request:'] : []),
    ...(split?.contexts.map((context) => context.body) ?? [])
  ].join('\n')
  return withAsterContext(
    split ? split.request : (firstRequest ?? 'Summarize where this experiment stands.'),
    { label: split?.contexts[0]?.label ?? `${name} · agent setup`, body: role }
  )
}
