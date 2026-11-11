import { PanelRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResearchRebuttalLanguageMenu } from './ResearchRebuttalLanguageMenu'
import { ResearchRebuttalPageMenu } from './ResearchRebuttalPageMenu'
import { ResearchRebuttalReviewsMenu } from './ResearchRebuttalReviewsMenu'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import type { RebuttalPageTranslations } from './use-rebuttal-page-translations'
import type { RebuttalActions } from './use-research-rebuttal-actions'

/** The Rebuttal header's right side: reading language, reviews, the side panel and settings. */
export function ResearchRebuttalHeaderActions({
  snapshot,
  readOnly,
  translations,
  actions,
  panelOpen,
  onPanelOpenChange,
  onImportAgain,
  onAddReviewer,
  onError
}: {
  snapshot: RebuttalSnapshot
  readOnly: boolean
  translations: RebuttalPageTranslations
  actions: Pick<RebuttalActions, 'setAgentEdits'>
  panelOpen: boolean
  onPanelOpenChange: (open: boolean) => void
  onImportAgain: () => void
  onAddReviewer: () => void
  onError: (message: string | null) => void
}): React.JSX.Element {
  return (
    <>
      <ResearchRebuttalLanguageMenu
        language={translations.language}
        onLanguageChange={translations.setLanguage}
        view={translations.view}
        onViewChange={translations.setView}
        todo={translations.todo.length}
        agentBusy={translations.agentBusy}
        readOnly={readOnly}
        onTranslate={() => void translations.ask(translations.todo.length).then(onError)}
      />
      <ResearchRebuttalReviewsMenu
        snapshot={snapshot}
        onImportAgain={onImportAgain}
        onAddReviewer={onAddReviewer}
      />
      <Button
        size="xs"
        variant={panelOpen ? 'secondary' : 'ghost'}
        aria-pressed={panelOpen}
        onClick={() => onPanelOpenChange(!panelOpen)}
      >
        <PanelRight aria-hidden /> Panel
      </Button>
      <ResearchRebuttalPageMenu
        agentEdits={snapshot.bundle.meta.agentEdits}
        readOnly={readOnly}
        onAgentEditsChange={(mode) => void actions.setAgentEdits(mode).then(onError)}
      />
    </>
  )
}
