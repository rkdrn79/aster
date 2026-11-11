import { useMemo } from 'react'
import { useReadingLanguage } from './research-reading-language'
import type { RebuttalAgentScope } from './research-rebuttal-agent-session'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import {
  translationLookup,
  translationTodo,
  useRebuttalTranslationView
} from './research-rebuttal-translation-view'
import { REBUTTAL_TURN_ACTIVE, useRebuttalTurns } from './research-rebuttal-turns'
import { useRebuttalAutoTranslate } from './use-rebuttal-auto-translate'
import type { RebuttalActions } from './use-research-rebuttal-actions'

/** Everything the Rebuttal page needs for translations, including asking for them on its own. */
export function useRebuttalPageTranslations(input: {
  scope: RebuttalAgentScope
  snapshot: RebuttalSnapshot | null
  readOnly: boolean
  askAgent: RebuttalActions['askAgent']
}) {
  const { scope, snapshot, readOnly, askAgent } = input
  const [language, setLanguage] = useReadingLanguage()
  const [view, setView] = useRebuttalTranslationView()
  const lookup = useMemo(
    () => translationLookup(snapshot?.translations ?? [], language, view),
    [snapshot, language, view]
  )
  const todo = useMemo(
    () => (snapshot ? translationTodo(snapshot, language) : []),
    [snapshot, language]
  )
  const agentBusy = useRebuttalTurns((state) =>
    Boolean(
      state.working.author ||
      (state.turns.author && REBUTTAL_TURN_ACTIVE.has(state.turns.author.phase))
    )
  )
  const ask = (count: number): Promise<string | null> => askAgent({ kind: 'translate', count })
  useRebuttalAutoTranslate({
    scope,
    slug: snapshot?.bundle.meta.slug ?? null,
    language,
    todo,
    readOnly,
    ask
  })
  return { language, setLanguage, view, setView, lookup, todo, agentBusy, ask }
}

export type RebuttalPageTranslations = ReturnType<typeof useRebuttalPageTranslations>
