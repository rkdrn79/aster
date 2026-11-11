// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  newRebuttalMeta,
  parseRebuttalMeta
} from '../../../../research-harness/research-rebuttal-model.mjs'
import { replyHash } from '../../../../research-harness/research-rebuttal-records.mjs'
import type { RebuttalTranslation } from '../../../../research-harness/research-rebuttal-translations.mjs'
import {
  RebuttalTranslationBlock,
  RebuttalTranslationLine,
  RebuttalTranslationProvider
} from './ResearchRebuttalTranslation'
import {
  translatedBundle,
  translationLookup,
  translationTodo,
  type RebuttalTranslationView
} from './research-rebuttal-translation-view'
import {
  AUTO_TRANSLATE_GAP_MS,
  autoTranslateBatch,
  askedKey,
  type AutoTranslateState
} from './use-rebuttal-auto-translate'

afterEach(cleanup)

const entry = (key: string, source: string, text: string): RebuttalTranslation => ({
  key,
  language: 'ko',
  hash: replyHash(source),
  text,
  at: ''
})

const translations = [
  entry('reply:C1', 'We ran it.', '실행했습니다.'),
  entry('title:C1', 'Baseline', '기준선')
]

function show(
  view: RebuttalTranslationView,
  node: React.ReactNode,
  language: 'ko' | 'en' = 'ko'
): void {
  render(
    <RebuttalTranslationProvider value={translationLookup(translations, language, view)}>
      {node}
    </RebuttalTranslationProvider>
  )
}

describe('translations on the Rebuttal page', () => {
  it('shows the translation under the original, muted and labelled with its language', () => {
    show('both', <RebuttalTranslationBlock tkey="reply:C1" source="We ran it." />)
    const block = screen.getByRole('region', { name: '한국어 translation' })
    expect(block.textContent).toContain('실행했습니다.')
    expect(block.querySelector('[lang="ko"]')).toBeTruthy()
    expect(screen.queryByText('Outdated')).toBeNull()
  })

  it('marks a translation outdated when its original changed, instead of hiding it', () => {
    show('both', <RebuttalTranslationBlock tkey="reply:C1" source="We ran it twice." />)
    expect(screen.getByText('실행했습니다.')).toBeTruthy()
    expect(screen.getByText('Outdated')).toBeTruthy()
  })

  it('shows nothing for Original only, for English, or with no translation', () => {
    show('original', <RebuttalTranslationLine tkey="title:C1" source="Baseline" />)
    expect(screen.queryByText('기준선')).toBeNull()
    cleanup()
    show('both', <RebuttalTranslationLine tkey="title:C1" source="Baseline" />, 'en')
    expect(screen.queryByText('기준선')).toBeNull()
    cleanup()
    show('both', <RebuttalTranslationLine tkey="title:C2" source="Other" />)
    expect(document.body.textContent).toBe('')
  })

  it('lists what still needs translating, missing or outdated, and nothing in English', () => {
    const meta = parseRebuttalMeta({
      ...newRebuttalMeta({ name: 'X', slug: 'x', now: '' }),
      reviewers: [{ id: 'R1', label: '' }]
    })
    const snapshot = {
      bundle: {
        meta,
        points: [],
        clusters: [
          {
            id: 'C1',
            title: 'Baseline',
            points: [],
            action: 'clarify' as const,
            plan: '',
            status: 'drafting' as const,
            experiment: null,
            manuscript: null,
            response: 'We ran it again.',
            author: 'human' as const,
            general: false
          }
        ],
        promises: []
      },
      reviews: { R1: 'Review.' },
      followUps: [],
      translations
    }
    expect(translationTodo(snapshot, 'ko').map((item) => [item.key, item.status])).toEqual([
      ['review:R1', 'missing'],
      ['reply:C1', 'outdated']
    ])
    expect(translationTodo(snapshot, 'en')).toEqual([])
    const lookup = translationLookup(translations, 'ko', 'both')
    const general = translatedBundle(snapshot.bundle, lookup)
    expect(general?.clusters[0].title).toBe('기준선')
  })
})

describe('asking the agent to translate on its own', () => {
  const todo = [{ key: 'reply:C1', hash: 'h1', status: 'outdated' as const }]
  const calm: AutoTranslateState = {
    todo,
    asked: new Set(),
    chatOpen: true,
    agentIdle: true,
    typingQuiet: true,
    readOnly: false,
    sinceLastAsk: AUTO_TRANSLATE_GAP_MS
  }

  it('asks once, in one batch, when the agent is idle and the person stopped typing', () => {
    expect(autoTranslateBatch(calm)).toEqual(todo)
  })

  it('waits while typing, while the agent works, without an open chat, or too soon', () => {
    expect(autoTranslateBatch({ ...calm, typingQuiet: false })).toBeNull()
    expect(autoTranslateBatch({ ...calm, agentIdle: false })).toBeNull()
    expect(autoTranslateBatch({ ...calm, chatOpen: false })).toBeNull()
    expect(autoTranslateBatch({ ...calm, sinceLastAsk: 5000 })).toBeNull()
    expect(autoTranslateBatch({ ...calm, readOnly: true })).toBeNull()
  })

  it('never asks twice for the same text', () => {
    expect(autoTranslateBatch({ ...calm, asked: new Set([askedKey(todo[0])]) })).toBeNull()
  })
})
