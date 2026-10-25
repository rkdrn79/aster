import { ResearchExperimentWorkspace } from './ResearchExperimentWorkspace'

/** The sidebar's Compare page: the selected Experiment, opened on its Compare tab. */
export function ResearchComparePage(): React.JSX.Element {
  return <ResearchExperimentWorkspace pageTab="compare" />
}
