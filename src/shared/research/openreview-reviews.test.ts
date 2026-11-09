import { describe, expect, it } from 'vitest'
import { openReviewForumId, parseOpenReviewNotes } from './openreview-reviews'

// Trimmed from the shapes api2.openreview.net (v2) and api.openreview.net (v1) return.
const V2_REPLY = {
  count: 4,
  notes: [
    {
      id: 'Ab12Cd34',
      forum: 'Ab12Cd34',
      invitations: ['ICLR.cc/2025/Conference/-/Submission'],
      signatures: ['ICLR.cc/2025/Conference/Submission1234/Authors'],
      content: {
        title: { value: 'Sparse Diffusion Detectors' },
        venue: { value: 'ICLR 2025 Conference Submission' }
      },
      cdate: 1727000000000
    },
    {
      id: 'rev2',
      forum: 'Ab12Cd34',
      replyto: 'Ab12Cd34',
      invitations: [
        'ICLR.cc/2025/Conference/Submission1234/-/Official_Review',
        'ICLR.cc/2025/Conference/-/Edit'
      ],
      signatures: ['ICLR.cc/2025/Conference/Submission1234/Reviewer_Xy12'],
      content: {
        questions: { value: 'What is tau?' },
        weaknesses: { value: 'No DiffusionDet baseline.' },
        summary: { value: 'Proposes sparse diffusion.' },
        soundness: { value: 3 },
        rating: { value: 6 },
        confidence: { value: 4 },
        flag_for_ethics_review: { value: ['No ethics review needed.'] },
        code_of_conduct: { value: 'Yes' }
      },
      cdate: 1730000500000
    },
    {
      id: 'rev1',
      forum: 'Ab12Cd34',
      invitations: ['ICLR.cc/2025/Conference/Submission1234/-/Official_Review'],
      signatures: ['ICLR.cc/2025/Conference/Submission1234/Reviewer_Pq34'],
      content: {
        summary: { value: 'Interesting idea.' },
        strengths: { value: 'Clear writing.' },
        rating: { value: '3: reject, not good enough' }
      },
      cdate: 1730000000000
    },
    {
      id: 'meta',
      forum: 'Ab12Cd34',
      invitations: ['ICLR.cc/2025/Conference/Submission1234/-/Meta_Review'],
      signatures: ['ICLR.cc/2025/Conference/Submission1234/Area_Chair_Zz'],
      content: { metareview: { value: 'Reject.' } }
    },
    {
      id: 'comment',
      forum: 'Ab12Cd34',
      invitations: ['ICLR.cc/2025/Conference/Submission1234/-/Official_Comment'],
      content: { comment: { value: 'Thanks!' } }
    }
  ]
}

const V1_REPLY = {
  notes: [
    {
      id: 'old1',
      forum: 'OldForum1',
      invitation: 'ICLR.cc/2022/Conference/Paper99/-/Official_Review',
      signatures: ['ICLR.cc/2022/Conference/Paper99/Reviewer_k3Lm'],
      content: {
        summary_of_the_paper: 'A paper.',
        main_review: 'Needs more baselines.',
        recommendation: '5: marginally below the acceptance threshold',
        confidence: '3: You are fairly confident in your assessment.'
      },
      cdate: 1636000000000
    }
  ]
}

describe('OpenReview reviews', () => {
  it('reads forum IDs from links and bare IDs', () => {
    expect(openReviewForumId('https://openreview.net/forum?id=Ab12Cd34&noteId=rev1')).toBe(
      'Ab12Cd34'
    )
    expect(openReviewForumId('  Ab12Cd34 ')).toBe('Ab12Cd34')
    expect(openReviewForumId('https://example.com/forum?id=Ab12Cd34')).toBeNull()
    expect(openReviewForumId('not an id!')).toBeNull()
  })

  it('keeps official reviews in posting order with their scores and reading-order text', () => {
    const forum = parseOpenReviewNotes('Ab12Cd34', V2_REPLY)
    expect(forum.title).toBe('Sparse Diffusion Detectors')
    expect(forum.venue).toBe('ICLR 2025 Conference Submission')
    expect(forum.reviews.map((review) => [review.noteId, review.label, review.rating])).toEqual([
      ['rev1', 'Reviewer Pq34', '3'],
      ['rev2', 'Reviewer Xy12', '6']
    ])
    expect(forum.reviews[1]).toMatchObject({
      confidence: '4',
      text: 'Scores: Soundness 3\n\nSummary:\nProposes sparse diffusion.\n\nWeaknesses:\nNo DiffusionDet baseline.\n\nQuestions:\nWhat is tau?'
    })
  })

  it('reads API v1 notes, whose fields are plain values', () => {
    const [review] = parseOpenReviewNotes('OldForum1', V1_REPLY).reviews
    expect(review).toMatchObject({
      label: 'Reviewer k3Lm',
      rating: '5',
      confidence: '3',
      text: 'Summary of the paper:\nA paper.\n\nMain review:\nNeeds more baselines.'
    })
  })

  it('rejects a reply that is not a notes list', () => {
    expect(() => parseOpenReviewNotes('x', { error: 'Forbidden' })).toThrow()
    expect(parseOpenReviewNotes('Ab12Cd34', { notes: [] }).reviews).toEqual([])
  })
})
