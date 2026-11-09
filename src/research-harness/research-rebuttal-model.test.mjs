import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assembleGeneralResponse,
  assembleReviewerReplies,
  rebuttalReadiness
} from './research-rebuttal-assemble.mjs'
import { assembleRebuttalLatex, latexFromMarkdown } from './research-rebuttal-latex.mjs'
import { newRebuttalMeta, parseRebuttalMeta, rebuttalSlug } from './research-rebuttal-model.mjs'
import { locateQuote, parseClusters, parsePoints } from './research-rebuttal-points.mjs'

const reviews = {
  R1: 'Weaknesses:\n1. No comparison with DiffusionDet on COCO.\n2. The   ablation on λ is missing.\nQ: Why “τ = 0.1”?',
  R2: 'The DiffusionDet baseline is missing.\nMinor: typo in Eq. 3.'
}

function bundle({ responses = {}, limit = 5000, shared } = {}) {
  const meta = parseRebuttalMeta({
    ...newRebuttalMeta({ name: 'ICLR 2027', now: '2026-11-07T00:00:00.000Z', replyChars: limit }),
    reviewers: [
      { id: 'R1', label: '' },
      { id: 'R2', label: 'Reviewer Xy12' }
    ],
    ...(shared ? { assembly: { shared } } : {})
  })
  const points = parsePoints(
    [
      {
        id: 'R2-W1',
        kind: 'weakness',
        type: 'experiment-request',
        quote: 'The DiffusionDet baseline is missing.'
      },
      {
        id: 'R1-W1',
        kind: 'weakness',
        type: 'experiment-request',
        quote: 'No comparison with DiffusionDet on COCO.'
      },
      { id: 'R1-W2', kind: 'weakness', type: 'soundness', quote: 'The ablation on λ is missing.' },
      { id: 'R1-Q1', kind: 'question', type: 'clarity', quote: 'Why "τ = 0.1"?' },
      {
        id: 'R2-M1',
        kind: 'minor',
        type: 'typo',
        summary: 'Typo in Eq. 3',
        quote: 'typo in Eq. 3.'
      }
    ],
    { reviewers: meta.reviewers, reviews }
  )
  const clusters = parseClusters(
    [
      {
        id: 'C1',
        title: 'DiffusionDet baseline',
        points: ['R1-W1', 'R2-W1'],
        action: 'experiment',
        response: responses.C1
      },
      {
        id: 'C2',
        title: 'λ ablation',
        points: ['R1-W2', 'R1-Q1'],
        action: 'experiment',
        response: responses.C2
      }
    ],
    { pointIds: points.map((point) => point.id) }
  )
  return {
    meta,
    points,
    clusters,
    promises: [{ id: 'P1', text: 'Add DiffusionDet to Table 2', clusters: ['C1'], done: false }]
  }
}

test('rebuttal names become folder slugs', () => {
  assert.equal(rebuttalSlug('ICLR 2027 — round 1'), 'iclr-2027-round-1')
  assert.throws(() => rebuttalSlug('—'), /letters or digits/)
})

test('rebuttal.json gets the OpenReview default reply limit and keeps unknown fields', () => {
  const meta = parseRebuttalMeta({ schemaVersion: 1, slug: 'a', name: 'A', future: 1 })
  assert.equal(meta.limits.replyChars, 5000)
  assert.equal(meta.limits.pdfPages, 1)
  assert.equal(meta.assembly.shared, 'reviewer')
  assert.equal(meta.future, 1)
  assert.throws(
    () => parseRebuttalMeta({ schemaVersion: 2, slug: 'a', name: 'A' }),
    /schemaVersion 1/
  )
  assert.throws(
    () => parseRebuttalMeta({ schemaVersion: 1, slug: 'a', name: 'A', reviewers: [{ id: 'X' }] }),
    /R1 … R99/
  )
})

test('quotes resolve to offsets across whitespace runs and typographic quotes', () => {
  const { points } = bundle()
  const ablation = points.find((point) => point.id === 'R1-W2')
  assert.equal(reviews.R1.slice(ablation.start, ablation.end), 'The   ablation on λ is missing.')
  const question = points.find((point) => point.id === 'R1-Q1')
  assert.equal(question.quote, 'Why “τ = 0.1”?')
  assert.deepEqual(
    points.map((point) => point.id),
    ['R1-W1', 'R1-W2', 'R1-Q1', 'R2-W1', 'R2-M1']
  )
  assert.deepEqual(locateQuote('a b a b', 'a b', { start: 4, end: 7 }), { start: 4, end: 7 })
  assert.equal(locateQuote('abc', 'xyz'), null)
})

test('points must match their reviewer, kind letter, and review text', () => {
  const { meta } = bundle()
  const parse = (point) => parsePoints([point], { reviewers: meta.reviewers, reviews })
  assert.throws(() => parse({ id: 'R1-Q9', kind: 'weakness', quote: 'No comparison' }), /letter W/)
  assert.throws(() => parse({ id: 'R3-W1', kind: 'weakness', quote: 'x' }), /no review/)
  assert.throws(
    () => parse({ id: 'R1-W1', kind: 'weakness', quote: 'not in the text' }),
    /not found/
  )
  assert.throws(
    () => parse({ id: 'R1-W1', kind: 'weakness', type: 'vibes', quote: 'No' }),
    /type must be one of/
  )
})

test('a point belongs to one cluster and regrouping keeps drafts by cluster ID', () => {
  const { clusters, points } = bundle({ responses: { C1: 'We ran it.' } })
  const pointIds = points.map((point) => point.id)
  assert.throws(
    () =>
      parseClusters(
        [
          { id: 'C1', title: 'a', points: ['R1-W1'], action: 'text' },
          { id: 'C2', title: 'b', points: ['R1-W1'], action: 'text' }
        ],
        { pointIds }
      ),
    /in both C1 and C2/
  )
  assert.throws(
    () =>
      parseClusters([{ id: 'C1', title: 'a', points: ['R9-W1'], action: 'text' }], { pointIds }),
    /unknown point/
  )
  const regrouped = parseClusters(
    [{ id: 'C1', title: 'Baselines', points: ['R1-W1'], action: 'experiment' }],
    {
      pointIds,
      previous: clusters
    }
  )
  assert.equal(regrouped[0].response, 'We ran it.')
  assert.equal(regrouped[0].status, 'todo')
})

test('replies answer in review order and refer shared answers to the first reviewer', () => {
  const replies = assembleReviewerReplies(
    bundle({ responses: { C1: 'DiffusionDet gets 45.1 AP; ours 46.3.', C2: 'See Table 4.' } })
  )
  const [first, second] = replies
  assert.equal(
    first.text,
    '**A1 (W1): DiffusionDet baseline**\nDiffusionDet gets 45.1 AP; ours 46.3.\n\n**A2 (W2, Q1): λ ablation**\nSee Table 4.'
  )
  assert.equal(second.name, 'Reviewer Xy12')
  assert.match(
    second.text,
    /\*\*A1 \(W1\): DiffusionDet baseline\*\*\nPlease see our response to R1 \(A1\)\./
  )
  assert.match(second.text, /\*\*A2 \(M1\)\*\*\n\[No response yet: Typo in Eq\. 3\]/)
  assert.deepEqual(second.missing, ['R2-M1'])
  assert.equal(first.chars, first.text.length)
  assert.equal(first.over, false)
})

test('shared answers can live in the general response or repeat in every reply', () => {
  const responses = { C1: 'Done.', C2: 'Added.' }
  const general = assembleReviewerReplies(bundle({ responses, shared: 'general' }))
  assert.match(general[1].text, /Please see our general response \(G1\)\./)
  const repeated = assembleReviewerReplies(bundle({ responses }), { shared: 'repeat' })
  assert.match(repeated[1].text, /\*\*A1 \(W1\): DiffusionDet baseline\*\*\nDone\./)
})

test('replies over the venue limit are flagged', () => {
  const long = 'x'.repeat(300)
  const [reply] = assembleReviewerReplies(bundle({ responses: { C1: long, C2: long }, limit: 400 }))
  assert.equal(reply.limit, 400)
  assert.ok(reply.chars > 400)
  assert.equal(reply.over, true)
  assert.deepEqual(
    rebuttalReadiness(bundle({ responses: { C1: long, C2: long }, limit: 400 })).overLimit,
    ['R1']
  )
})

test('the general response covers shared concerns and promises', () => {
  const value = bundle({ responses: { C1: 'We added it.' } })
  value.meta.general.intro = 'We thank all reviewers.'
  const general = assembleGeneralResponse(value)
  assert.equal(
    general.text,
    'We thank all reviewers.\n\n**G1: DiffusionDet baseline** (R1, R2)\nWe added it.\n\n**Changes for the final version**\n- Add DiffusionDet to Table 2'
  )
  assert.deepEqual(rebuttalReadiness(value).undrafted, ['C2'])
  assert.deepEqual(rebuttalReadiness(value).unclustered, ['R2-M1'])
})

test('drafts become LaTeX with escapes, lists, emphasis, and math kept', () => {
  assert.equal(
    latexFromMarkdown('Ours is **45.1** & $\\alpha_1$ 50% _better_ `x_y`.\n\n- one\n- two'),
    'Ours is \\textbf{45.1} \\& $\\alpha_1$ 50\\% \\emph{better} \\texttt{x\\_y}.\n\n\\begin{itemize}[nosep,leftmargin=*]\n  \\item one\n  \\item two\n\\end{itemize}'
  )
  const { text, missing } = assembleRebuttalLatex(bundle({ responses: { C1: 'Done.' } }))
  assert.match(text, /\\documentclass\[10pt,twocolumn,letterpaper\]\{article\}/)
  assert.match(text, /\\rebuttalpoint\{R1, R2\}\{DiffusionDet baseline\}Done\./)
  assert.match(text, /\\item Add DiffusionDet to Table 2/)
  assert.deepEqual(missing, ['C2'])
})
