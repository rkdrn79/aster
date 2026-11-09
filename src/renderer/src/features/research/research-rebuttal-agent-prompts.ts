import { withAsterContext } from '../../../../shared/aster-context-block'
import { POINT_TYPES } from '../../../../research-harness/research-rebuttal-model.mjs'
import { rebuttalAbsolutePath } from './research-rebuttal-files'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

export type RebuttalAgentRequest =
  | { kind: 'split' }
  | { kind: 'draft'; clusterId?: string }
  | { kind: 'assemble' }
  | { kind: 'limits' }

export const REBUTTAL_QUICK_ACTIONS: readonly { request: RebuttalAgentRequest; label: string }[] = [
  { request: { kind: 'split' }, label: 'Split and group the reviews' },
  { request: { kind: 'draft' }, label: 'Draft responses' },
  { request: { kind: 'assemble' }, label: 'Assemble replies' },
  { request: { kind: 'limits' }, label: 'Check against limits' }
]

function header(snapshot: RebuttalSnapshot): string[] {
  const { meta } = snapshot.bundle
  const slug = meta.slug
  return [
    `You are the Rebuttal agent of this research project. The rebuttal "${meta.name}"${meta.venue ? ` for ${meta.venue}` : ''} lives in ${JSON.stringify(rebuttalAbsolutePath(snapshot.owner, snapshot.directory))} (slug ${slug}).`,
    `Reviews: ${meta.reviewers.map((reviewer) => `${reviewer.id}${reviewer.label ? ` (${reviewer.label})` : ''}`).join(', ') || 'none yet'} in reviews/<ID>.md. Reply limit: ${meta.limits.replyChars} characters per reviewer reply, ${meta.limits.generalChars} for the general response, ${meta.limits.pdfPages} page(s) for the PDF.`,
    `Follow the Rebuttal section of the aster-research-track skill. Write every rebuttal file through the harness: run \`aster research harness-path\` for the cli.mjs path H, then \`node H/cli.mjs rebuttal … --rebuttal ${slug} --json\`. Pass JSON with \`--file -\` on stdin or from a temporary file outside the project. Aster shows each change on its Rebuttal page as soon as you save it.`,
    'Never invent results, numbers, or citations. Use `node H/cli.mjs context` and the Runs on disk for real numbers; when a result does not exist yet, write [TBD: …] and say which Experiment would produce it.',
    ''
  ]
}

function requestBody(snapshot: RebuttalSnapshot, request: RebuttalAgentRequest): string[] {
  const { clusters } = snapshot.bundle
  switch (request.kind) {
    case 'split':
      return [
        'Split the reviews into points and group them:',
        '1. Read every review. Split each into atomic points: one concern, request, or question each. Skip summaries and praise.',
        '   IDs: R<n>-W<k> for weaknesses, R<n>-Q<k> for questions, R<n>-M<k> for minor issues (typos, wording, figure nits), numbered in review order.',
        `   Each point: {"id","kind":"weakness|question|minor","type":"${POINT_TYPES.join('|')}","summary":"one line in your words","quote":"the exact sentence(s) copied from the review"}. The harness rejects a quote that is not in the review.`,
        '   Save with `rebuttal points set` (all reviewers), or `--reviewer R<n>` for one.',
        '2. Group points into clusters: one cluster per answer we will write. The same concern from several reviewers goes in one cluster; a point belongs to one cluster at most; keep unrelated points apart.',
        '   Each cluster: {"id":"C<k>","title":"short noun phrase","points":[…],"action":"experiment|text|clarify","plan":"what we will do, which run or section"}. experiment = needs a new or extra run; text = change the paper; clarify = answer in the reply only.',
        '   When a cluster maps to a place in the manuscript, add "manuscript":{"file":"paper/main.tex","line":N,"anchor":"nearby words"}. Save with `rebuttal clusters set`; existing drafts are kept by cluster ID.',
        ...(clusters.length
          ? [
              `   There are already ${clusters.length} clusters; keep their IDs when a cluster stays the same.`
            ]
          : []),
        '3. Report how many points each reviewer has and list the clusters with their points. Do not draft responses or edit the paper yet.'
      ]
    case 'draft': {
      const target = request.clusterId
        ? `cluster ${request.clusterId} only`
        : 'every cluster whose status is todo or drafting'
      return [
        `Draft the responses for ${target}:`,
        "1. Read the cluster, its points' quotes, the plan, the related part of the manuscript, and the Experiments and Runs it relies on.",
        '2. Write the answer in Markdown: the first sentence answers the concern; then evidence (numbers with their Run), what changes in the paper, and nothing else. Polite, direct, no flattery. One answer serves every reviewer in the cluster.',
        `3. Keep answers short enough that each reviewer's reply fits ${snapshot.bundle.meta.limits.replyChars} characters together with their other answers.`,
        '4. Save each with `rebuttal response set --cluster C<k> --file -` (status becomes drafting). Record each promise for the camera-ready with `rebuttal promises add --text … --cluster C<k>`.',
        '5. If an experiment is needed and not run, say so and propose it; do not launch runs unless I ask.'
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
        'Check the rebuttal against its limits:',
        '1. Run `rebuttal assemble --format all` (exit 1 means a reply is over its limit) and `rebuttal show`.',
        '2. For each reply over its limit, shorten the answers it contains: tighten wording and drop repetition, but keep every number, commitment, and reference. Prefer moving shared detail into one cluster answer over cutting content.',
        '3. Save the shorter answers with `rebuttal response set`, assemble again, and repeat until every reply fits.',
        '4. Report the final counts, plus points that have no cluster and clusters that have no draft.'
      ]
  }
}

function visibleRequest(request: RebuttalAgentRequest): string {
  switch (request.kind) {
    case 'split':
      return 'Split the reviews into points and group related ones across reviewers.'
    case 'draft':
      return request.clusterId
        ? `Draft the response for ${request.clusterId}.`
        : 'Draft responses for the open clusters.'
    case 'assemble':
      return 'Assemble the per-reviewer replies and the general response.'
    case 'limits':
      return 'Check every reply against its character limit and shorten what is over.'
  }
}

export function buildRebuttalPrompt(
  snapshot: RebuttalSnapshot,
  request: RebuttalAgentRequest
): string {
  return withAsterContext(visibleRequest(request), {
    label: `Rebuttal ${snapshot.bundle.meta.name}`,
    body: [...header(snapshot), ...requestBody(snapshot, request)].join('\n')
  })
}
