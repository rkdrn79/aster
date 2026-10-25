import { ResearchExperimentWorkspace } from './ResearchExperimentWorkspace'

/** The sidebar's Runs page: the selected Experiment, opened on its Runs tab. */
export function ResearchRunsPage(): React.JSX.Element {
  return <ResearchExperimentWorkspace pageTab="runs" />
}
