import { useState } from 'react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import {
  WRITING_SKELETON_SECTIONS,
  type WritingSkeleton,
  type WritingSkeletonSection
} from '../../../../shared/research/research-writing-results'
import { ResearchWritingSkeletonCard } from './ResearchWritingSkeletonCard'
import {
  buildWritingMessageContext,
  buildWritingSkeletonConfirmedPrompt
} from './research-writing-agent-prompts'
import { sendWritingPrompt, writingPromptContext } from './research-writing-agent-requests'
import { researchErrorText } from './research-error-text'
import { skeletonToShow } from './research-writing-skeleton-card'
import { researchHarnessBridge } from './use-research-harness-experiment'
import type { ResearchWritingSkeletonsState } from './use-research-writing-skeletons'

function skeletonSection(value: string): WritingSkeletonSection | null {
  return WRITING_SKELETON_SECTIONS.find((section) => section === value) ?? null
}

/** Hidden until the file changes again: a newer draft asks for confirmation anew. */
function hideKey(skeleton: WritingSkeleton): string {
  return `${skeleton.path}@${skeleton.updatedAt ?? ''}@${skeleton.status}`
}

/**
 * The skeleton card above the Writing chat: the latest draft waiting for the person, or the one
 * they just confirmed as a one-line row. Confirming tells the Writing agent to draft.
 */
export function ResearchWritingSkeletonPanel({
  experiment,
  skeletons
}: {
  experiment: ExperimentRecord
  skeletons: ResearchWritingSkeletonsState
}): React.JSX.Element | null {
  const [pinned, setPinned] = useState<string | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const shown = skeletonToShow(skeletons.skeletons, pinned)
  if (!skeletons.available || !shown || hidden.has(hideKey(shown))) {
    return null
  }
  const section = skeletonSection(shown.section)
  const workspacePath = experiment.workspacePath

  async function save(lines: Record<string, string> | null): Promise<string | null> {
    const set = researchHarnessBridge().writingSkeletonSet
    if (!lines || !section) {
      return null
    }
    if (!set) {
      return 'This window cannot save skeletons; reload Aster.'
    }
    try {
      await set({ workspacePath, section, lines })
      await skeletons.refresh()
      return null
    } catch (cause) {
      return researchErrorText(cause)
    }
  }

  async function confirm(lines: Record<string, string> | null): Promise<string | null> {
    const confirmSkeleton = researchHarnessBridge().writingSkeletonConfirm
    if (!section || !confirmSkeleton) {
      return 'This window cannot confirm skeletons; reload Aster.'
    }
    const failure = await save(lines)
    if (failure) {
      return failure
    }
    try {
      const confirmed = await confirmSkeleton({ workspacePath, section })
      setPinned(confirmed.path)
      await skeletons.refresh()
      const context = writingPromptContext(experiment)
      const sent = await sendWritingPrompt(
        experiment,
        buildWritingSkeletonConfirmedPrompt(context, confirmed),
        buildWritingMessageContext(context).key
      )
      return sent ? `Confirmed, but the Writing agent was not told: ${sent}` : null
    } catch (cause) {
      return researchErrorText(cause)
    }
  }

  return (
    <div className="scrollbar-sleek max-h-[45vh] shrink-0 overflow-auto px-3 pt-3">
      <ResearchWritingSkeletonCard
        // Why the status: a new draft after a confirmation opens the card again.
        key={`${shown.path}:${shown.status}`}
        skeleton={shown}
        onSave={save}
        onConfirm={confirm}
        onDismiss={() => {
          setHidden((current) => new Set([...current, hideKey(shown)]))
          setPinned(null)
        }}
      />
    </div>
  )
}
