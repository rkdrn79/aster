import { selectResearchExperiment } from '../../../../shared/research/research-selection'
import { useResearchRecords } from './research-records-store'

/** Selects an Experiment and remembers it as its workspace's selection; a no-op when it already is. */
export async function selectResearchExperimentRecord(id: string): Promise<void> {
  if (useResearchRecords.getState().document?.selectedExperimentId === id) {
    return
  }
  await useResearchRecords.getState().update((current) => {
    const experiment = current.experiments.find((entry) => entry.id === id)
    if (!experiment) {
      return current
    }
    return selectResearchExperiment(
      {
        ...current,
        selectedExperimentByWorkspace: {
          ...current.selectedExperimentByWorkspace,
          [JSON.stringify([experiment.hostId, experiment.workspaceId])]: experiment.id
        }
      },
      id
    )
  })
}
