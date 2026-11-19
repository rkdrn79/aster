import { BookOpen, FileText, Image, MessagesSquare } from 'lucide-react'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import type { ResearchHomeWorkspace } from '@/features/research/research-home-projects'
import { usePhoneNavigation } from './phone-navigation-store'
import { PhoneDecisionRow, usePhoneDecisionItems } from './PhoneDecisionsSection'
import { PhoneRow, PhoneSection, PhoneSectionNote } from './PhoneListLayout'

function activate(workspace: Pick<ResearchHomeWorkspace, 'id' | 'executionHostId'>): void {
  activateAndRevealWorkspace(
    workspace.id,
    workspace.executionHostId ? { executionHostId: workspace.executionHostId } : undefined
  )
}

/** What waits for the person in this project, then its research pages that read on a phone. */
export function PhoneProjectResearchLinks({
  workspace,
  projectName,
  now
}: {
  workspace: Pick<ResearchHomeWorkspace, 'id' | 'executionHostId'>
  projectName: string
  now: number
}): React.JSX.Element {
  const decisions = usePhoneDecisionItems([workspace.id])
  const push = usePhoneNavigation((state) => state.push)
  const page = { worktreeId: workspace.id, subtitle: projectName }
  return (
    <>
      {decisions.items.length || decisions.updateNeeded ? (
        <PhoneSection label="Waiting for your decision">
          {decisions.items.map((item) => (
            <PhoneDecisionRow
              key={
                item.kind === 'plan'
                  ? item.plan.id
                  : `${item.proposal.experiment}/${item.proposal.id}`
              }
              item={item}
              context={null}
              now={now}
            />
          ))}
          {decisions.updateNeeded ? (
            <PhoneSectionNote>
              This server needs an Aster update before proposals can be decided here.
            </PhoneSectionNote>
          ) : null}
        </PhoneSection>
      ) : null}
      <PhoneSection label="Paper">
        <PhoneRow
          leading={<Image className="size-5" aria-hidden />}
          title="Figures"
          subtitle="Figures and plots, full screen"
          onClick={() => push({ kind: 'figures', ...page, title: 'Figures' })}
        />
        <PhoneRow
          leading={<MessagesSquare className="size-5" aria-hidden />}
          title="Rebuttal"
          subtitle="Reviewers’ points and draft answers"
          onClick={() => push({ kind: 'rebuttal', ...page, title: 'Rebuttal' })}
        />
        <PhoneRow
          leading={<FileText className="size-5" aria-hidden />}
          title="Writing"
          subtitle="The manuscript source and PDF"
          onClick={() => {
            activate(workspace)
            useAppStore.getState().setActiveView('research-writing')
          }}
        />
        <PhoneRow
          leading={<BookOpen className="size-5" aria-hidden />}
          title="Library"
          subtitle="The project’s papers"
          onClick={() => {
            activate(workspace)
            const navigation = usePhoneNavigation.getState()
            navigation.setFilesView('papers')
            navigation.selectTab('files')
          }}
        />
      </PhoneSection>
    </>
  )
}
