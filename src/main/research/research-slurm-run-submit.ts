import {
  formatResearchRunName,
  parseResearchRunName,
  researchRunPosixPaths,
  type ResearchRunLocation
} from '../../shared/research/research-run-reference'
import type { ResearchSlurmActionResult } from '../../shared/research/research-slurm-actions'
import type { SshTarget } from '../../shared/ssh-types'
import { readResearchRunFiles } from './research-run-files'
import { recordResearchSlurmRunLink } from './research-slurm-run-links'

export type PreparedResearchSlurmRunLink = {
  location: ResearchRunLocation
  runName: string
  logPath: string
}

/** Checks the Run exists on the host before anything is submitted for it. */
export async function prepareResearchSlurmRunLink(
  target: SshTarget,
  runSpecifier: string,
  projectPath: string
): Promise<PreparedResearchSlurmRunLink> {
  const name = parseResearchRunName(runSpecifier)
  if (!projectPath.startsWith('/')) {
    throw new Error('--run-project must be an absolute path on the host.')
  }
  // Why: sbatch expands %j-style patterns in --output, so a literal % would name another file.
  if (projectPath.includes('%')) {
    throw new Error('The project path contains %, which sbatch reads as a filename pattern.')
  }
  const probe: ResearchRunLocation = { ...name, targetId: target.id, projectPath }
  const read = await readResearchRunFiles(probe, {
    metricsFrom: 'tail',
    logFrom: 'tail',
    maxBytes: 0,
    statOnly: true
  })
  if (!read.ok) {
    throw new Error(`Could not read the Run on ${target.label}: ${read.message}`)
  }
  // Why keep the tree: the job's --output must land in the folder the Run was found in.
  const location: ResearchRunLocation = { ...probe, recordRoot: read.read.recordRoot }
  const paths = researchRunPosixPaths(location)
  if (!read.read.manifest) {
    throw new Error(
      `No run.json at ${paths.manifest} on ${target.label}. Register the Run first (research harness \`new-run\`, or write that file with {"schemaVersion":1,"externalRunId":"${name.runId}"}), or pass --run-project with the project root.`
    )
  }
  return { location, runName: formatResearchRunName(name), logPath: paths.log }
}

/** Records the job against its Run and writes `job` and `execution` into run.json. */
export async function linkSubmittedJobToRun(
  target: SshTarget,
  prepared: PreparedResearchSlurmRunLink,
  result: ResearchSlurmActionResult,
  jobId: string
): Promise<ResearchSlurmActionResult> {
  const now = new Date().toISOString()
  const link = await recordResearchSlurmRunLink({
    targetId: target.id,
    hostLabel: target.label,
    jobId,
    projectPath: prepared.location.projectPath,
    experiment: prepared.location.experiment,
    runId: prepared.location.runId,
    recordRoot: prepared.location.recordRoot,
    submittedAt: now,
    state: 'pending',
    reason: result.held ? 'held by Aster until the GPU budget has room' : null,
    exitCode: null,
    observedAt: now,
    manifestState: null,
    manifestMessage: null,
    closedAt: null
  })
  const manifestError = link.manifestMessage
  return {
    ...result,
    message: `${result.message} Linked to Run ${prepared.runName}: output goes to ${prepared.logPath}${
      manifestError
        ? `; run.json was not updated yet (${manifestError}), Aster retries while it tracks the job.`
        : '; run.json records the job, and Aster updates it as the job runs and ends.'
    }`,
    linkedRun: { run: prepared.runName, logPath: prepared.logPath, manifestError }
  }
}
