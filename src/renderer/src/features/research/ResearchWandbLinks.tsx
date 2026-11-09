import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import type { ResearchRunManifest } from '../../../../shared/research/research-run-manifest'
import { wandbGroupUrl, wandbRunUrl } from '../../../../shared/research/research-wandb'
import { useProjectWandbSettings } from './research-project-wandb'

function openWandb(url: string): void {
  void window.api.shell.openUrl(url)
}

/** The Experiment's runs as a W&B group; only when the project mirrors to W&B. */
export function ResearchWandbExperimentLink({
  experiment
}: {
  experiment: Pick<ExperimentRecord, 'hostId' | 'workspaceId' | 'workspacePath' | 'catalogSlug'>
}): React.JSX.Element | null {
  const settings = useProjectWandbSettings(experiment)
  const url = experiment.catalogSlug ? wandbGroupUrl(settings, experiment.catalogSlug) : null
  if (!url) {
    return null
  }
  return (
    <Button size="sm" variant="ghost" title={url} onClick={() => openWandb(url)}>
      <ExternalLink aria-hidden />
      Open in W&B
    </Button>
  )
}

/** The Run's W&B page and the mirror's warning, read from run.json; nulls while W&B is off. */
export function useResearchRunWandb(
  run: Pick<ResearchRunRecord, 'hostId' | 'workspaceId' | 'workspacePath'>,
  manifest: ResearchRunManifest | null
): { url: string | null; warning: string | null } {
  const settings = useProjectWandbSettings(run)
  const record = manifest?.wandb
  if (!settings?.enabled || !record) {
    return { url: null, warning: null }
  }
  return { url: wandbRunUrl(settings, record), warning: record.warning ?? null }
}

export function ResearchWandbRunButton({ url }: { url: string }): React.JSX.Element {
  return (
    <Button size="sm" variant="outline" title={url} onClick={() => openWandb(url)}>
      <ExternalLink aria-hidden />
      Open in W&B
    </Button>
  )
}
