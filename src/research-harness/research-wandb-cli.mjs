import { lstat } from 'node:fs/promises'
import { HarnessError } from './research-harness-error.mjs'
import {
  readRunManifest,
  resolveRunReference,
  updateRunManifest
} from './research-run-manifest.mjs'
import { requireWandbSettings } from './research-wandb.mjs'
import { createRunWandbMirror } from './research-wandb-mirror.mjs'

const SYNC_WAIT_MS = 10 * 60_000

/**
 * Copies a recorded Run's metrics to its W&B run again. The W&B run ID is derived from the Run,
 * so this resumes the run `run exec` started and skips the rows it already sent.
 */
export async function syncRunToWandb(project, reference, notice) {
  const settings = await requireWandbSettings(project)
  const run = await resolveRunReference(project, reference)
  const manifest = await readRunManifest(run.paths)
  if (manifest.execution?.state === 'running') {
    throw new HarnessError(
      'run_running',
      `${run.ref} is still running; the run exec that started it mirrors it to W&B`
    )
  }
  const hasConfig = await lstat(run.paths.config).then(
    (details) => details.isFile(),
    () => false
  )
  const mirror = createRunWandbMirror(
    settings,
    {
      experiment: run.experiment,
      runId: run.runId,
      paths: run.paths,
      cwd: project,
      config: hasConfig ? run.paths.config : null,
      meta: {
        experiment: run.experiment,
        run: run.runId,
        command: manifest.command ?? null,
        commit: manifest.code?.commit ?? null
      }
    },
    { notice }
  )
  void mirror.start()
  const wandb = await mirror.finish(
    { state: manifest.execution?.state ?? 'unknown', exitCode: manifest.execution?.exitCode },
    { waitMs: SYNC_WAIT_MS }
  )
  await updateRunManifest(run.paths, (current) => ({ ...current, wandb }))
  return { ref: run.ref, wandb }
}

export const commands = {
  'wandb sync': {
    spec: { values: ['--run'], required: ['--run'] },
    run: ({ project, options, io }) => syncRunToWandb(project, options['--run'], io.notice),
    failed: (result) => result.wandb.status === 'failed'
  }
}

export const textOutput = {
  'wandb sync': ({ ref, wandb }) =>
    `${ref} → W&B ${wandb.status}${wandb.url ? ` ${wandb.url}` : ''}${wandb.warning ? ` (${wandb.warning})` : ''}`
}

export const usage = `
Weights & Biases ("wandb" in the catalog: {"enabled":true,"entity":E,"project":P[,"python":PATH]})
  When enabled, run exec mirrors the Run's metrics.jsonl to a W&B run named after the Run,
  grouped by Experiment, using the host's existing wandb login. The command also gets
  WANDB_PROJECT, WANDB_ENTITY, WANDB_RUN_GROUP and WANDB_TAGS for its own wandb.init().
  wandb sync --run EXPERIMENT/RUN       Copy a recorded Run's metrics to W&B again (resumes
                                         the same W&B run; rows already sent are skipped)
`
