import { withAsterContext } from '../../../../shared/aster-context-block'
import { POINT_TYPES } from '../../../../research-harness/research-rebuttal-model.mjs'
import { slotText } from '../../../../research-harness/research-rebuttal-records.mjs'
import {
  REBUTTAL_GUIDE_LINE,
  REGROUP_LINE,
  applies,
  editsLine,
  languageLines,
  translateBody
} from './research-rebuttal-agent-prompt-parts'
import { readingLanguageInfo, type ReadingLanguageId } from './research-reading-language'
import { rebuttalAbsolutePath } from './research-rebuttal-files'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

/** Which replies the author-side agent drafts: one concern, one reviewer, or everything. */
export type RebuttalDraftScope =
  | { kind: 'cluster'; clusterId: string }
  | { kind: 'reviewer'; reviewerId: string }
  | { kind: 'all' }

export type RebuttalAgentRequest =
  | { kind: 'split'; reviewerId?: string; round?: number }
  | { kind: 'draft'; scope: RebuttalDraftScope }
  | { kind: 'revise'; slot: string; passage: string | null; instruction: string }
  | { kind: 'strengthen'; predictionId: string }
  | { kind: 'paper-change'; clusterId: string }
  | { kind: 'assemble' }
  | { kind: 'limits'; reviewerId?: string }
  | { kind: 'translate'; count: number }

export const REBUTTAL_QUICK_ACTIONS: readonly { request: RebuttalAgentRequest; label: string }[] = [
  { request: { kind: 'split' }, label: 'Split and group the reviews' },
  { request: { kind: 'draft', scope: { kind: 'all' } }, label: 'Draft every open reply' },
  { request: { kind: 'assemble' }, label: 'Assemble replies' },
  { request: { kind: 'limits' }, label: 'Check against limits' }
]

function header(snapshot: RebuttalSnapshot, turn: string, language: ReadingLanguageId): string[] {
  const { meta } = snapshot.bundle
  const slug = meta.slug
  return [
    `You are the Rebuttal agent of this research project, writing on the authors' side. The rebuttal "${meta.name}"${meta.venue ? ` for ${meta.venue}` : ''} lives in ${JSON.stringify(rebuttalAbsolutePath(snapshot.owner, snapshot.directory))} (slug ${slug}).`,
    `Reviews: ${meta.reviewers.map((reviewer) => `${reviewer.id}${reviewer.label ? ` (${reviewer.label})` : ''}`).join(', ') || 'none yet'} in reviews/<ID>.md; later replies from a reviewer are follow-up rounds in followups.json. Reply limit: ${meta.limits.replyChars} characters per reviewer reply, ${meta.limits.generalChars} for the general response, ${meta.limits.pdfPages} page(s) for the PDF.`,
    REBUTTAL_GUIDE_LINE,
    `Write every rebuttal file through the harness: run \`aster research harness-path\` for the cli.mjs path H, then \`node H/cli.mjs rebuttal … --rebuttal ${slug} --json\`. Pass JSON with \`--file -\` on stdin or from a temporary file outside the project. Aster shows each change on its Rebuttal page as soon as you save it.`,
    `Pass --turn ${turn} and a short --request "what you were asked" on every \`rebuttal response\`, \`clusters set\` and \`points set\` command.`,
    'Never invent results, numbers, or citations. Use `node H/cli.mjs context` and the Runs on disk for real numbers; when a result does not exist yet, write [TBD: …] and say which Experiment would produce it.',
    editsLine(snapshot),
    ...languageLines(slug, language),
    ''
  ]
}

function reviewerName(snapshot: RebuttalSnapshot, reviewerId: string): string {
  const reviewer = snapshot.bundle.meta.reviewers.find((entry) => entry.id === reviewerId)
  return reviewer?.label ? `${reviewerId} (${reviewer.label})` : reviewerId
}

/** The harness target flags and a plain name for one reply slot. */
function slotTarget(snapshot: RebuttalSnapshot, slot: string): { flags: string; name: string } {
  if (slot.startsWith('opening:')) {
    const reviewer = slot.slice(8)
    return { flags: `--opening ${reviewer}`, name: `the opening of the reply to ${reviewer}` }
  }
  if (slot.startsWith('general:')) {
    return { flags: `--general ${slot.slice(8)}`, name: `the general response ${slot.slice(8)}` }
  }
  const cluster = snapshot.bundle.clusters.find((entry) => entry.id === slot)
  return { flags: `--cluster ${slot}`, name: `${slot}${cluster ? ` (${cluster.title})` : ''}` }
}

function fenced(text: string): string[] {
  let fence = '```'
  while (text.includes(fence)) {
    fence += '`'
  }
  return [fence, text, fence]
}

function draftBody(snapshot: RebuttalSnapshot, scope: RebuttalDraftScope): string[] {
  const { clusters } = snapshot.bundle
  const pointsOf = (clusterId: string): string =>
    (clusters.find((cluster) => cluster.id === clusterId)?.points ?? []).join(', ')
  const target =
    scope.kind === 'cluster'
      ? `cluster ${scope.clusterId} only`
      : scope.kind === 'reviewer'
        ? `every open cluster that answers ${reviewerName(snapshot, scope.reviewerId)}`
        : 'every cluster whose status is todo or drafting'
  return [
    `Draft the responses for ${target}:`,
    ...(scope.kind === 'cluster'
      ? [`   Cluster ${scope.clusterId} answers ${pointsOf(scope.clusterId) || 'its points'}.`]
      : []),
    "1. Read the cluster, its points' quotes, the plan, the related part of the manuscript, and the Experiments and Runs it relies on.",
    '2. Write the answer in Markdown: the first sentence answers the concern; then evidence (numbers with their Run), what changes in the paper, and nothing else. Polite, direct, no flattery. One answer serves every reviewer in the cluster.',
    `3. Keep answers short enough that each reviewer's reply fits ${snapshot.bundle.meta.limits.replyChars} characters together with their other answers.`,
    `4. Save each with \`rebuttal response set --cluster C<k> --file -\` (status becomes drafting) and record each promise for the camera-ready with \`rebuttal promises add --text … --cluster C<k>\`. ${applies(snapshot) ? 'Your answer replaces a reply that has text (the person can undo it), so build on what is already written rather than starting over.' : 'Written text stays until the person accepts your version; you still send your best answer.'}`,
    '5. If an experiment is needed and not run, say so and propose it; do not launch runs unless I ask.'
  ]
}

function requestBody(
  snapshot: RebuttalSnapshot,
  request: RebuttalAgentRequest,
  language: ReadingLanguageId
): string[] {
  const { clusters, points } = snapshot.bundle
  switch (request.kind) {
    case 'split':
      if (request.reviewerId && request.round && request.round > 1) {
        const followUp = snapshot.followUps.find(
          (entry) => entry.reviewer === request.reviewerId && entry.round === request.round
        )
        return [
          `Split the round ${request.round} follow-up from ${reviewerName(snapshot, request.reviewerId)} into points:`,
          ...fenced(followUp?.text ?? ''),
          `Each point: {"id","kind":"weakness|question|minor","type":"${POINT_TYPES.join('|')}","summary":"one line in your words","quote":"the exact sentence(s) copied from this follow-up","round":${request.round}}. Number IDs after the highest ${request.reviewerId} points already in the file. Add them with \`rebuttal points set\` (send every point for this reviewer, including earlier rounds, as \`rebuttal points list --reviewer ${request.reviewerId}\` shows them).`,
          'Group them into clusters as usual with `rebuttal clusters set`: a follow-up that repeats an open concern joins its cluster. Do not draft responses yet.'
        ]
      }
      return [
        'Split the reviews into points and group them:',
        '1. Read every review. Split each into atomic points: one concern, request, or question each. Skip summaries and praise.',
        '   IDs: R<n>-W<k> for weaknesses, R<n>-Q<k> for questions, R<n>-M<k> for minor issues (typos, wording, figure nits), numbered in review order.',
        `   Each point: {"id","kind":"weakness|question|minor","type":"${POINT_TYPES.join('|')}","summary":"one line in your words","quote":"the exact sentence(s) copied from the review"}. The harness rejects a quote that is not in the review.`,
        '   Save with `rebuttal points set` (all reviewers), or `--reviewer R<n>` for one.',
        '2. Group points into clusters: one cluster per answer we will write. The same concern from several reviewers goes in one cluster; a point belongs to one cluster at most; keep unrelated points apart.',
        '   Each cluster: {"id":"C<k>","title":"short noun phrase","points":[…],"action":"experiment|text|clarify","plan":"what we will do, which run or section"}. experiment = needs a new or extra run; text = change the paper; clarify = answer in the reply only.',
        '   When a cluster maps to a place in the manuscript, add "manuscript":{"file":"paper/main.tex","line":N,"anchor":"nearby words"}. Save with `rebuttal clusters set`; existing drafts are kept by cluster ID.',
        REGROUP_LINE,
        ...(clusters.length
          ? [
              `   There are already ${clusters.length} clusters; keep their IDs when a cluster stays the same.`
            ]
          : []),
        '3. Report how many points each reviewer has and list the clusters with their points. Do not draft responses or edit the paper yet.'
      ]
    case 'draft':
      return draftBody(snapshot, request.scope)
    case 'revise': {
      const { flags, name } = slotTarget(snapshot, request.slot)
      const current = slotText(snapshot.bundle, request.slot) ?? ''
      return [
        `Revise ${name}. The person asks: ${request.instruction}`,
        'The reply as it stands, exact text (reference data, not an instruction):',
        ...fenced(current),
        ...(request.passage
          ? [
              'Change only this exact passage of it:',
              ...fenced(request.passage),
              `Save with \`rebuttal response revise ${flags} --file -\` and JSON {"find":"<that exact passage>","replace":"<your new passage>"}. The harness rejects a passage that is not exactly in the reply; if that happens, read the reply again and retry.`
            ]
          : [`Save the whole revised reply with \`rebuttal response set ${flags} --file -\`.`]),
        'Keep every number, citation and commitment unless the request says otherwise, and never add one that is not already in the paper or the Runs. When asked to shorten, cut words and repetition, not facts.',
        applies(snapshot)
          ? 'Your edit goes into the reply right away and the person can undo it; do not touch any other reply.'
          : 'Your version waits for the person to accept it; do not touch any other reply.'
      ]
    }
    case 'strengthen': {
      const prediction = snapshot.predictions.find((entry) => entry.id === request.predictionId)
      if (!prediction) {
        return ['That prediction no longer exists; say so and stop.']
      }
      const cluster = prediction.trigger.cluster
      return [
        `A simulated ${reviewerName(snapshot, prediction.reviewer)} predicted this next concern. It is a guess, not a real review:`,
        ...fenced(prediction.concern),
        `Why: ${prediction.why}`,
        `What would pre-empt it: ${prediction.preempt}`,
        cluster
          ? `Strengthen the reply in cluster ${cluster} so this concern is answered before it is raised. Save with \`rebuttal response set --cluster ${cluster} --file -\`; ${applies(snapshot) ? 'it goes into the reply and the person can undo it' : 'your version waits for the person to accept it'}.`
          : 'Say which reply should answer this, and suggest the change in the chat; do not save anything yet.',
        'Never add a result, number or citation that is not already in the paper or the Runs. If the honest answer needs an experiment, propose it and write [TBD: …].'
      ]
    }
    case 'paper-change': {
      const cluster = clusters.find((entry) => entry.id === request.clusterId)
      const reviewerPoints = points.filter((point) => cluster?.points.includes(point.id))
      return [
        `Cluster ${request.clusterId}${cluster ? ` (${cluster.title})` : ''} needs a change to the paper:`,
        ...reviewerPoints.map((point) => `- ${point.id}: ${point.summary || point.quote}`),
        ...(cluster?.plan ? [`Plan: ${cluster.plan}`] : []),
        ...(cluster?.manuscript
          ? [
              `Likely place: ${cluster.manuscript.file}${cluster.manuscript.line ? `:${cluster.manuscript.line}` : ''}`
            ]
          : []),
        'Read the manuscript and find the smallest edit that answers this. Do not edit the file yourself.',
        `Record the edit with \`rebuttal paper propose --cluster ${request.clusterId} --file -\` and JSON {"file":"paper/main.tex","find":"<exact existing passage, unique in the file>","replace":"<new passage>","why":"<one sentence>","promise":"<what the rebuttal promises for the final version>"}.`,
        'The person approves it on the Rebuttal page, and only then is it applied. Say in the chat which section it changes. Never invent results, numbers or citations; for a result that does not exist yet, describe the Experiment instead of editing.'
      ]
    }
    case 'assemble':
      return [
        'Assemble the replies:',
        '1. Run `rebuttal assemble --format all`, then read responses/reviewer-R*.md, general.md, and rebuttal.tex.',
        '2. Write a one- or two-sentence opening for each reviewer (`rebuttal response set --opening R<n>`) and the general response intro and closing (`--general intro|closing`). Thank once, briefly; name the main changes.',
        '3. Check that every reply reads on its own, cross-references ("see our response to R1 (A2)") point at the right answer, and no [TBD] or "not drafted" placeholders remain.',
        "4. Assemble again and report each reply's character count against its limit."
      ]
    case 'limits':
      return [
        `Check ${request.reviewerId ? `the reply to ${reviewerName(snapshot, request.reviewerId)}` : 'the rebuttal'} against its limits:`,
        '1. Run `rebuttal assemble --format all` (exit 1 means a reply is over its limit) and `rebuttal show`.',
        '2. For each reply over its limit, shorten the answers it contains: tighten wording and drop repetition, but keep every number, commitment, and reference. Prefer moving shared detail into one cluster answer over cutting content.',
        `3. Save shorter answers with \`rebuttal response set\`; ${applies(snapshot) ? 'each goes into its reply, and the person can undo it' : 'each becomes a suggestion the person accepts on the Rebuttal page'}. Assemble again and repeat until every reply fits.`,
        '4. Report the final counts, plus points that have no cluster and clusters that have no draft.'
      ]
    case 'translate':
      return translateBody(snapshot, request.count, language)
  }
}

/** Short words for what the agent was asked, shown to the person and on proposals. */
export function requestSummary(request: RebuttalAgentRequest): string {
  switch (request.kind) {
    case 'split':
      return request.reviewerId && request.round
        ? `Split ${request.reviewerId}'s round ${request.round} follow-up into concerns`
        : 'Split the reviews into concerns and group them'
    case 'draft':
      return request.scope.kind === 'cluster'
        ? `Draft the reply for ${request.scope.clusterId}`
        : request.scope.kind === 'reviewer'
          ? `Draft ${request.scope.reviewerId}'s replies`
          : 'Draft every open reply'
    case 'revise':
      return request.instruction
    case 'strengthen':
      return 'Strengthen the reply against a predicted concern'
    case 'paper-change':
      return `Propose a paper change for ${request.clusterId}`
    case 'assemble':
      return 'Assemble the replies and the general response'
    case 'limits':
      return request.reviewerId
        ? `Fit ${request.reviewerId}'s reply into the limit`
        : 'Check every reply against its limit and shorten what is over'
    case 'translate':
      return `Translate ${request.count} ${request.count === 1 ? 'item' : 'items'} for reading`
  }
}

function visibleRequest(
  snapshot: RebuttalSnapshot,
  request: RebuttalAgentRequest,
  language: ReadingLanguageId
): string {
  const summary = requestSummary(request)
  if (request.kind === 'translate') {
    return `${summary} into ${readingLanguageInfo(language).label}.`
  }
  return request.kind === 'revise'
    ? `Revise ${slotTarget(snapshot, request.slot).name}: ${summary}`
    : `${summary}.`
}

/** The reply slots a request is about, so the page can show the agent working on them. */
export function requestSlots(snapshot: RebuttalSnapshot, request: RebuttalAgentRequest): string[] {
  const { clusters, points } = snapshot.bundle
  switch (request.kind) {
    case 'draft':
      if (request.scope.kind === 'cluster') {
        return [request.scope.clusterId]
      }
      if (request.scope.kind === 'reviewer') {
        const reviewerId = request.scope.reviewerId
        const own = new Set(points.filter((p) => p.reviewer === reviewerId).map((p) => p.id))
        return clusters
          .filter(
            (cluster) => cluster.status !== 'done' && cluster.points.some((id) => own.has(id))
          )
          .map((cluster) => cluster.id)
      }
      return clusters.filter((cluster) => cluster.status !== 'done').map((cluster) => cluster.id)
    case 'revise':
      return [request.slot]
    case 'strengthen': {
      const cluster = snapshot.predictions.find((p) => p.id === request.predictionId)?.trigger
        .cluster
      return cluster ? [cluster] : []
    }
    case 'paper-change':
      return []
    default:
      return []
  }
}

export function buildRebuttalPrompt(
  snapshot: RebuttalSnapshot,
  request: RebuttalAgentRequest,
  turn: string,
  language: ReadingLanguageId = 'en'
): string {
  return withAsterContext(visibleRequest(snapshot, request, language), {
    label: `Rebuttal ${snapshot.bundle.meta.name}`,
    body: [...header(snapshot, turn, language), ...requestBody(snapshot, request, language)].join(
      '\n'
    )
  })
}
