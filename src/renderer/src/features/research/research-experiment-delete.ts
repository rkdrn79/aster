import { toast } from 'sonner'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { useAppStore } from '@/store'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { withoutResearchExperiment } from '../../../../shared/research/research-experiment-delete'
import { openResearchView } from './research-navigation'
import { useResearchRecords } from './research-records-store'
import { writeNotebookDraft } from './research-notebook-draft'

export function useDeleteResearchExperiment(): (experiment: ExperimentRecord) => Promise<void> {
  const confirm = useConfirmationDialog()
  return async (experiment) => {
    const accepted = await confirm({
      title: `Delete ${experiment.name}?`,
      description:
        'This removes the Experiment, its Runs, and attached Papers from Aster. Project files and running tasks remain. Agent conversations stay available without their Experiment link.',
      confirmLabel: 'Delete Experiment',
      confirmVariant: 'destructive'
    })
    if (!accepted) {
      return
    }
    const selected = useResearchRecords.getState().document?.selectedExperimentId === experiment.id
    try {
      await useResearchRecords
        .getState()
        .update((current) => withoutResearchExperiment(current, experiment.id))
      writeNotebookDraft('plan', experiment.id, null)
      writeNotebookDraft('conclusion', experiment.id, null)
      if (
        selected &&
        ['research-runs', 'research-compare'].includes(useAppStore.getState().activeView)
      ) {
        openResearchView('research-experiments')
      }
      toast.success(`Deleted ${experiment.name} from Aster`)
    } catch {
      // The records store shows the save error beside the Experiment list.
    }
  }
}
