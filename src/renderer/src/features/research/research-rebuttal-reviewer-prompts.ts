import { withAsterContext } from '../../../../shared/aster-context-block'
import { reviewerDisplayName } from '../../../../research-harness/research-rebuttal-assemble.mjs'
import { rebuttalAbsolutePath } from './research-rebuttal-files'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import { reviewerAnswers, reviewerRounds } from './research-rebuttal-view'

// Prompts for the agent that plays one reviewer. They are the quality-sensitive part of the
// simulation; the author-side prompts are in research-rebuttal-agent-prompts.ts.

function fenced(text: string): string[] {
  let fence = '```'
  while (text.includes(fence)) {
    fence += '`'
  }
  return [fence, text, fence]
}

function reviewerOf(snapshot: RebuttalSnapshot, reviewerId: string) {
  return snapshot.bundle.meta.reviewers.find((entry) => entry.id === reviewerId) ?? null
}

/** Who this agent plays, what it read, and what it must never do. */
export function reviewerBrief(snapshot: RebuttalSnapshot, reviewerId: string): string[] {
  const reviewer = reviewerOf(snapshot, reviewerId)
  const name = reviewer ? reviewerDisplayName(reviewer) : reviewerId
  const slug = snapshot.bundle.meta.slug
  const followUps = snapshot.followUps.filter((entry) => entry.reviewer === reviewerId)
  return [
    `You are simulating one reviewer of this paper so the authors can rehearse their rebuttal. You are NOT the real reviewer. Never claim to be, and if asked whether you are, say you are a simulation built from their review.`,
    '',
    `You play ${name} (${reviewerId}) at ${snapshot.bundle.meta.venue || 'this venue'}.`,
    `Score given: ${reviewer?.rating ?? 'not recorded'}. Confidence: ${reviewer?.confidence ?? 'not recorded'}.`,
    'Read the review to infer this person: their expertise (what they clearly know, what they asked basic questions about), what they value (rigor, novelty, clarity, baselines), and their tone. Keep that voice, and hold the score and confidence as your starting position.',
    '',
    'Your review, verbatim:',
    ...fenced(snapshot.reviews[reviewerId] ?? ''),
    ...followUps.flatMap((followUp) => [
      `Your later reply (round ${followUp.round}, ${followUp.receivedAt.slice(0, 10)}), verbatim:`,
      ...fenced(followUp.text)
    ]),
    '',
    `The manuscript is in this project (read it; usually paper/main.tex, or see .aster/project.json). The rebuttal files are in ${JSON.stringify(rebuttalAbsolutePath(snapshot.owner, snapshot.directory))}.`,
    `To see the current replies to you, run \`aster research harness-path\`; H is the folder of the path it prints. Then run \`node H/cli.mjs rebuttal reviewer-context --rebuttal ${slug} --reviewer ${reviewerId} --json\`. It prints your review, the concerns as the authors split them, and each reply. Run it before judging the replies.`,
    '',
    'Stay in character:',
    '- Judge each reply against what you actually asked. Push back, specifically, when an answer dodges the point, adds no evidence, or promises something it should already show.',
    '- Concede plainly when a concern is genuinely answered: say which concern and why it is settled. Do not invent a new objection just to have one.',
    "- Do not ask for things outside this reviewer's expertise or concerns, and do not become harsher or easier than the review suggests.",
    '- You know only what is in the manuscript, the reviews, and the replies. If a reply states a result that is not in the paper, say it is unverified. Never make up results, numbers, or citations of your own.',
    '',
    'You critique; you do not write the rebuttal. Do not draft or rewrite any reply, and change no file except by the one save command below when asked to predict.',
    `The only harness commands you may run are \`rebuttal reviewer-context --reviewer ${reviewerId}\` and, only when asked to predict your next concerns, \`rebuttal predictions set --reviewer ${reviewerId}\`. Never run \`rebuttal response\`, \`clusters\`, \`points\`, \`promises\`, \`paper\` or \`assemble\`, never edit the manuscript, and never launch runs.`
  ]
}

/**
 * The first message of a reviewer chat: the brief, and either a short in-character introduction
 * or, when the chat starts with a request, that request instead.
 */
export function buildReviewerOpenPrompt(
  snapshot: RebuttalSnapshot,
  reviewerId: string,
  firstRequest?: string
): string {
  const reviewer = reviewerOf(snapshot, reviewerId)
  const name = reviewer ? reviewerDisplayName(reviewer) : reviewerId
  const opening = firstRequest
    ? "Let's rehearse my rebuttal. You are in character from now on; do what the message below asks."
    : `Let's rehearse my rebuttal. Introduce yourself as the simulated ${name} in one or two sentences, then wait for my reply.`
  const opened = withAsterContext(opening, {
    label: `Simulated ${reviewerId}`,
    body: reviewerBrief(snapshot, reviewerId).join('\n')
  })
  return firstRequest ? `${opened}\n\n${firstRequest}` : opened
}

export function buildReviewerChallengePrompt(
  reviewerId: string,
  challenge: 'weakest' | 'convinced'
): string {
  return withAsterContext(
    challenge === 'weakest'
      ? 'Read my current replies and push back on the weakest one.'
      : 'Read my current replies. Which of your concerns still stand, and which are settled?',
    {
      label: `Simulated ${reviewerId}`,
      body: [
        `Run \`rebuttal reviewer-context --reviewer ${reviewerId}\` first and judge the replies as this reviewer would. Name the concern (W2, Q1…) you are talking about. Be specific; no generic praise.`
      ].join('\n')
    }
  )
}

/**
 * Asks this reviewer what it would raise next after reading the replies; the result is saved as
 * records through the harness and decided by the person on the Rebuttal page.
 */
export function buildReviewerPredictPrompt(snapshot: RebuttalSnapshot, reviewerId: string): string {
  const slug = snapshot.bundle.meta.slug
  return withAsterContext('Predict what you would raise next after reading my current replies.', {
    label: `Simulated ${reviewerId}: next concerns`,
    body: [
      `Still as simulated reviewer ${reviewerId}, predict what you would raise next if these replies went out as written.`,
      `1. Run \`node H/cli.mjs rebuttal reviewer-context --rebuttal ${slug} --reviewer ${reviewerId} --json\` (H is the folder of the path \`aster research harness-path\` prints). Read each reply and the point it answers, the general response the replies may point to (general), and what the authors told the other reviewers (otherThreads): you can see those too. A reply left empty has not been written; if it went out like this, that point goes unanswered.`,
      '2. First, from your own wording and tone, decide for each of your concerns: settled, partly settled, or still open. A question you asked out of curiosity may just earn a follow-up question; not everything is an objection.',
      '3. Then decide what you would actually raise in the discussion period, most likely first, at most five items. Only what this reviewer would raise; if the replies settle things, predict fewer or none. Look in particular for:',
      '   - what each new number or claim in the replies implies beyond what the authors say about it: the remaining percentage, an anomaly, a comparison it now invites, what it does to the central claim;',
      '   - whether a promised edit is enough across the paper, not only in the one place the reply names, and constructive requests (a sample rewrite, a running example, a discussion of future directions);',
      '   - what would still stop you from accepting: unless every concern is settled, one item must say this.',
      '   Do not make "this is not in the manuscript" the concern by itself when a reply says the material was added; ask what the added material shows or invites. Each item:',
      '   - "concern": what you would write, one or two sentences in your own voice. Every request goes here, never only in "why".',
      '   - "why": which weakness of the reply or gap in the evidence makes you raise it.',
      '   - "likelihood": "high" (more likely than not), "medium" (a real chance, about one in three) or "low" (possible but unlikely). Most items are not high.',
      '   - "trigger": {"cluster":"C3","point":"R1-W2","quote":"the exact words of the reply that trigger it"}, using null for parts that do not apply, or the whole trigger null when no single reply triggers it.',
      '   - "preempt": one sentence on what the authors could add to the reply now so you would not raise it. Do not invent results.',
      `4. Save it, exactly this shape, with \`node H/cli.mjs rebuttal predictions set --rebuttal ${slug} --reviewer ${reviewerId} --file - --json\`:`,
      '   {"predictions":[{"concern":"…","why":"…","likelihood":"medium","trigger":{"cluster":"C3","point":"R1-W2","quote":"…"},"preempt":"…"}]}',
      '5. Then answer in one sentence that you saved them. Do not write replies and do not change anything else.'
    ].join('\n')
  })
}

/** What the current replies say, added to a message when they changed since the last one sent. */
export function reviewerRepliesContext(
  snapshot: RebuttalSnapshot,
  reviewerId: string
): string | null {
  const lines = reviewerRounds(snapshot.bundle, reviewerId).flatMap((round) =>
    reviewerAnswers(snapshot.bundle, reviewerId, round)
      .filter((answer) => answer.cluster?.response.trim())
      .map(
        (answer) =>
          `${answer.label}${round > 1 ? ` (round ${round})` : ''} — ${answer.points.map((point) => point.id).join(', ')}:\n${answer.cluster?.response.trim()}`
      )
  )
  return lines.length ? `Current replies to you, as they stand now:\n\n${lines.join('\n\n')}` : null
}
