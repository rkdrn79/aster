import { describe, expect, it } from 'vitest'
import { parseCcfddlConferenceYaml } from './conference-deadline-ccfddl'
import {
  isConferenceYamlFileName,
  parseHuggingFaceConferenceYaml
} from './conference-deadline-huggingface'
import { mergeConferenceSnapshots, mergeDeadlines } from './conference-deadline-merge'
import { classifyDeadlineStage } from './conference-deadline-stage'

const HUGGING_FACE = `
- title: CVPR
  year: 2025
  link: https://cvpr.thecvf.com/Conferences/2025/CallForPapers
  deadline: '2024-11-14 23:59:00'
  abstract_deadline: '2024-11-07 23:59:00'
  timezone: UTC-8
  date: June 10-17, 2025
  city: Nashville
  country: USA
  rankings: 'CCF: A, CORE: A*, THCPL: A'
  tags:
  - computer-vision
- title: CVPR
  year: 2027
  link: not a url
  timezone: AoE
  start: 2027-06-19
  deadlines:
  - type: paper
    label: Paper Submission
    date: '2026-11-13 23:59:59'
  - type: rebuttal_start
    label: Rebuttal opens
    date: '2027-01-20 23:59:59'
  - type: rebuttal_end
    label: Rebuttal closes
    date: '2027-01-27 23:59:59'
  - type: notification
    label: Decisions
    date: TBA
- year: 2028
  deadline: '2027-11-13 23:59:59'
`

const CCFDDL = `
- title: CVPR
  description: IEEE/CVF Computer Vision and Pattern Recognition Conference
  sub: AI
  rank:
    ccf: A
    core: A*
  confs:
    - year: 2027
      id: cvpr27
      link: https://cvpr.thecvf.com/
      timeline:
        - abstract_deadline: '2026-11-06 23:59:59'
          deadline: '2026-11-14 11:59:59'
          decision_deadline: '2027-02-26 23:59:59'
      timezone: UTC
      date: June 19-26, 2027
      place: Seattle, USA
- title: S&P
  description: IEEE Symposium on Security and Privacy
  sub: SC
  rank:
    ccf: A
  confs:
    - year: 2027
      id: sp27
      link: https://sp2027.ieee-security.org/
      timeline:
        - deadline: '2026-06-05 23:59:59'
        - deadline: '2026-11-17 23:59:59'
          comment: Second cycle
      timezone: UTC-12
      date: May 2027
      place: San Francisco
    - year: 2020
      id: sp20
      link: https://sp2020.ieee-security.org/
      timeline:
        - deadline: TBD
      timezone: UTC-12
      date: May 2020
      place: San Francisco
`

describe('parseHuggingFaceConferenceYaml', () => {
  const editions = parseHuggingFaceConferenceYaml(HUGGING_FACE, 2025)

  it('reads legacy single-deadline fields, ranks and topics', () => {
    expect(editions[0]).toMatchObject({
      id: 'cvpr-2025',
      series: 'cvpr',
      place: 'Nashville, USA',
      topic: 'cv',
      rank: { ccf: 'A', core: 'A*' },
      start: '2025-06-10',
      deadlines: [
        { type: 'abstract', stage: 'submission', timezone: 'UTC-8' },
        { type: 'paper', stage: 'submission', timezone: 'UTC-8' }
      ]
    })
  })

  it('folds a rebuttal start and end into one window and drops unparsable dates', () => {
    expect(editions[1].link).toBeUndefined()
    expect(editions[1].deadlines).toEqual([
      expect.objectContaining({ type: 'paper', timezone: 'AoE', stage: 'submission' }),
      expect.objectContaining({
        label: 'Rebuttal period',
        stage: 'rebuttal',
        opens: '2027-01-20 23:59:59',
        date: '2027-01-27 23:59:59'
      })
    ])
  })

  it('skips entries without a title or before the kept years', () => {
    expect(editions.map((edition) => edition.id)).toEqual(['cvpr-2025', 'cvpr-2027'])
    expect(parseHuggingFaceConferenceYaml(HUGGING_FACE, 2026)).toHaveLength(1)
  })

  it('accepts only plain YAML file names', () => {
    expect(isConferenceYamlFileName('ruleml+rr.yml')).toBe(true)
    expect(isConferenceYamlFileName('../secrets.yml')).toBe(false)
    expect(isConferenceYamlFileName('README.md')).toBe(false)
  })
})

describe('parseCcfddlConferenceYaml', () => {
  const editions = parseCcfddlConferenceYaml(CCFDDL, 2025)

  it('labels multiple submission rounds and keeps decision dates', () => {
    expect(editions.map((edition) => edition.id)).toEqual(['cvpr-2027', 'sp-2027'])
    expect(editions[1]).toMatchObject({
      topic: 'security',
      rank: { ccf: 'A' },
      deadlines: [
        { label: 'Paper submission (round 1)', stage: 'submission' },
        { label: 'Paper submission (round 2)', note: 'Second cycle' }
      ]
    })
    expect(editions[0].deadlines.map((deadline) => deadline.stage)).toEqual([
      'submission',
      'submission',
      'notification'
    ])
  })
})

describe('mergeConferenceSnapshots', () => {
  const merged = mergeConferenceSnapshots([
    {
      source: 'ccfddl',
      fetchedAt: '2026-10-24T00:00:00Z',
      editions: parseCcfddlConferenceYaml(CCFDDL, 2025)
    },
    {
      source: 'huggingface',
      fetchedAt: '2026-10-24T00:00:00Z',
      editions: parseHuggingFaceConferenceYaml(HUGGING_FACE, 2025)
    }
  ])
  const cvpr = merged.find((edition) => edition.id === 'cvpr-2027')

  it('joins one edition from both sources and keeps the richer link and ranks', () => {
    expect(merged.map((edition) => edition.id).sort()).toEqual([
      'cvpr-2025',
      'cvpr-2027',
      'sp-2027'
    ])
    expect(cvpr).toMatchObject({ link: 'https://cvpr.thecvf.com/', rank: { ccf: 'A', core: 'A*' } })
  })

  it('confirms matching submission dates across zones and adds what only one source lists', () => {
    const submissions = cvpr?.deadlines.filter((deadline) => deadline.stage === 'submission')
    // AoE 2026-11-13 23:59 and UTC 2026-11-14 11:59 are the same moment.
    expect(submissions).toEqual([
      expect.objectContaining({ source: 'huggingface', type: 'paper', agreement: 'confirmed' }),
      expect.not.objectContaining({ agreement: expect.anything() })
    ])
    expect(submissions?.[1]).toMatchObject({ source: 'ccfddl', type: 'abstract' })
    expect(cvpr?.deadlines.map((deadline) => deadline.stage)).toContain('notification')
  })

  it('flags the same kind of deadline listed on different dates', () => {
    const [hf, ccf] = mergeDeadlines(
      [
        {
          type: 'paper',
          label: 'Paper',
          stage: 'submission',
          date: '2026-02-15',
          timezone: 'AoE',
          source: 'huggingface'
        }
      ],
      [
        {
          type: 'paper',
          label: 'Paper',
          stage: 'submission',
          date: '2026-03-05',
          timezone: 'AoE',
          source: 'ccfddl'
        }
      ]
    )
    expect([hf.agreement, ccf.agreement]).toEqual(['disputed', 'disputed'])
  })
})

describe('classifyDeadlineStage', () => {
  it.each([
    ['paper', 'Paper Submission', 'submission'],
    ['rebuttal_end', 'Author-Reviewer Discussion End', 'rebuttal'],
    ['submission', 'Round 1 Rebuttal and Revision Submission', 'rebuttal'],
    ['review_release', 'Reviews Released', 'review'],
    ['commitment_deadline', 'ARR commitment deadline', 'review'],
    ['notification', 'Author Notification', 'notification'],
    ['registration', 'Author registration deadline', 'camera-ready'],
    ['camera_ready', 'Camera Ready Deadline', 'camera-ready'],
    ['submission', 'Workshop Proposal Submission', 'other'],
    ['reviewer_registration', 'Reviewer registration', 'other']
  ])('%s / %s is %s', (type, label, stage) => {
    expect(classifyDeadlineStage(type, label)).toBe(stage)
  })
})
