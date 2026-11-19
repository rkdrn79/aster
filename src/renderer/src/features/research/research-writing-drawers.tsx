import { useCallback, useState } from 'react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type { WritingCheckResult } from '../../../../shared/research/research-writing-results'
import { ResearchClaimsChip, ResearchClaimsPanel } from './ResearchClaimsPanel'
import { ResearchWritingCheckChip, ResearchWritingCheckPanel } from './ResearchWritingCheckPanel'
import type { WritingDrawer } from './ResearchWritingClaimsSplit'
import { askWritingAgentAboutClaim, updateClaimText } from './research-claims-apply'
import {
  buildWritingMessageContext,
  buildWritingQuickPrompt
} from './research-writing-agent-prompts'
import { sendWritingPrompt, writingPromptContext } from './research-writing-agent-requests'
import { writingFixFindings } from './research-writing-check-summary'
import { useResearchClaims } from './use-research-claims'
import { useResearchWritingCheck } from './use-research-writing-check'

type DrawerKind = 'claims' | 'check'

/** Sends the check's errors and warnings to the Writing chat as one fix request. */
async function askWritingAgentToFix(
  record: ExperimentRecord,
  result: WritingCheckResult
): Promise<string | null> {
  const { findings, total } = writingFixFindings(result)
  const context = writingPromptContext(record)
  return sendWritingPrompt(
    record,
    buildWritingQuickPrompt(context, { kind: 'check-fix', findings, total }),
    buildWritingMessageContext(context).key
  )
}

/**
 * The Writing page's drawers, one open at a time: Claims (numbers and their Runs) and the Writing
 * check (findings with jump-to-line). Returns the header chips and the open drawer.
 */
export function useWritingDrawers(input: {
  record: ExperimentRecord
  projectOnly: boolean
  onOpenSource: (file: string, line: number) => void
  /** Shows the Writing agent pane after a request went to it. */
  showAgent: () => void
}): {
  chips: React.ReactNode
  drawer: WritingDrawer | null
  openClaims: () => void
  openCheck: () => void
} {
  const { record, projectOnly, onOpenSource, showAgent } = input
  const [open, setOpen] = useState<DrawerKind | null>(null)
  const claims = useResearchClaims(record, open === 'claims')
  const check = useResearchWritingCheck(record, open === 'check')
  const close = useCallback(() => setOpen(null), [])
  const toggle = (kind: DrawerKind): void => setOpen((current) => (current === kind ? null : kind))
  const openCheck = (): void => {
    if (open === 'check') {
      check.recheck()
    } else {
      setOpen('check')
    }
  }

  const chips = (
    <>
      {check.available ? (
        <ResearchWritingCheckChip
          result={check.result}
          open={open === 'check'}
          onToggle={() => toggle('check')}
        />
      ) : null}
      {claims.available ? (
        <ResearchClaimsChip
          audit={claims.audit}
          open={open === 'claims'}
          onToggle={() => toggle('claims')}
        />
      ) : null}
    </>
  )

  const drawer: WritingDrawer | null =
    open === 'claims'
      ? {
          onOpenSource,
          onClose: close,
          render: (props) => (
            <ResearchClaimsPanel
              {...props}
              claims={claims}
              onClose={close}
              onUpdateText={(claim) => updateClaimText(record, claim)}
              onAskAgent={
                projectOnly
                  ? undefined
                  : async (claim) => {
                      const error = await askWritingAgentAboutClaim(record, claim)
                      if (!error) {
                        showAgent()
                      }
                      return error
                    }
              }
            />
          )
        }
      : open === 'check'
        ? {
            onOpenSource,
            onClose: close,
            render: (props) => (
              <ResearchWritingCheckPanel
                {...props}
                check={check}
                onClose={close}
                onAskAgent={async (result) => {
                  const error = await askWritingAgentToFix(record, result)
                  if (!error) {
                    showAgent()
                  }
                  return error
                }}
              />
            )
          }
        : null

  return { chips, drawer, openClaims: () => setOpen('claims'), openCheck }
}
