import type { PhoneResearchScreen, PhoneScreen } from './phone-navigation-store'
import { PhoneFigureScreen } from './PhoneFigureScreen'
import { PhoneFiguresScreen } from './PhoneFiguresScreen'
import { PhonePlanScreen } from './PhonePlanScreen'
import { PhoneProposalScreen } from './PhoneProposalScreen'
import { PhoneRebuttalScreen } from './PhoneRebuttalScreen'

/** The research screens a tab can stack. */
export function PhoneResearchScreens({
  screen
}: {
  screen: PhoneResearchScreen
}): React.JSX.Element {
  switch (screen.kind) {
    case 'proposal':
      return (
        <PhoneProposalScreen
          key={`${screen.worktreeId}/${screen.experiment}/${screen.proposal}`}
          worktreeId={screen.worktreeId}
          experiment={screen.experiment}
          proposalId={screen.proposal}
        />
      )
    case 'plan':
      return (
        <PhonePlanScreen
          key={`${screen.worktreeId}/${screen.plan}`}
          worktreeId={screen.worktreeId}
          plan={screen.plan}
        />
      )
    case 'figures':
      return (
        <PhoneFiguresScreen
          key={screen.worktreeId}
          worktreeId={screen.worktreeId}
          projectName={screen.subtitle ?? ''}
        />
      )
    case 'figure':
      return (
        <PhoneFigureScreen
          key={`${screen.worktreeId}/${screen.slug}`}
          worktreeId={screen.worktreeId}
          slug={screen.slug}
          path={screen.path}
        />
      )
    case 'rebuttal':
      return <PhoneRebuttalScreen key={screen.worktreeId} worktreeId={screen.worktreeId} />
  }
}

export function isPhoneResearchScreen(screen: PhoneScreen | null): screen is PhoneResearchScreen {
  return (
    screen?.kind === 'proposal' ||
    screen?.kind === 'plan' ||
    screen?.kind === 'figures' ||
    screen?.kind === 'figure' ||
    screen?.kind === 'rebuttal'
  )
}
